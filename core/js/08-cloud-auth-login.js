/* ================= cloud mode: Firebase Auth + Firestore =================
   Served from Firebase Hosting → sign-in page + private cloud data per user.
   Opened as a local file → works exactly as before (data in this browser only). */
const FB_VER = '12.19.0';
const FB_CONFIG = null;     // optional: paste a Firebase web config here to sync when NOT served by Firebase Hosting
let cloud = null, syncTimer = null, pendingWrites = 0, unsubs = [], pendingAuthMsg = '';
const ADMIN_EMAIL = String(window.ZL_ADMIN_EMAIL || 'mohanmd.official@gmail.com').trim().toLowerCase();   // Zenvora Loop Super Admin
// Organization context: null for the Super Admin's personal space; {orgId, org, me, role, support} inside an organization
const orgCtx = () => (cloud && cloud.ctx) || null;
const feat = f => { const c = orgCtx(); return c ? !!((c.org.features || {})[f]) : false; };
// The Account Manager's Planning Board switches (orgs/{id}.planner): board = planner for everyone (off → only Account Managers),
// rem = organization reminders, assign = who may give tasks to colleagues ('all' | 'mgr' | 'off')
const plannerCfg = () => Object.assign({board:true, rem:true, assign:'all'}, ((orgCtx() || {}).org || {}).planner || {});
const remOn = () => plannerCfg().rem !== false;
const agendaOn = () => mode !== 'cloud' || !!(cloud && cloud.isSuper) || (feat('agenda') && (plannerCfg().board !== false || orgCtx().role === 'orgadmin'));
const ROLE_LABEL = {orgadmin:'Account Manager', manager:'Manager', employee:'Employee'};
const synced = {tasks:new Map(), days:new Map(), otasks:new Map(), settings:''};
const stable = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);
const plain = o => JSON.parse(JSON.stringify(o));
const taskData = it => { const o = plain(it); delete o._snap; return o; };

// Where the Firebase settings come from:
//   GitHub Pages / any static host → public/firebase-config.js (window.ZL_FIREBASE_CONFIG)
//   Firebase Hosting               → served automatically at /__/firebase/init.json
//   opened as a local file         → none: offline desktop mode
async function getConfig(){
  if (location.protocol === 'file:') return null;
  const c = window.ZL_FIREBASE_CONFIG || FB_CONFIG;
  if (c && c.apiKey && !/PASTE/.test(c.apiKey)) return c;
  try { const r = await fetch('/__/firebase/init.json', {cache:'no-store'}); if (r.ok) return await r.json(); } catch(e){}
  return null;
}
function showLoading(text, isErr){ $('#loadingText').textContent = text; $('#loading').classList.toggle('err', !!isErr); $('#loading').hidden = false; }
function hideLoading(){ $('#loading').hidden = true; }

function startApp(){
  appReady = true;
  if (location.hash.length > 2) applyHash();
  rollover(); escalate(); setAddDay(todayKey); save(); render(); updNotifBtn(); checkReminders();
  if (!appStarted){
    appStarted = true;
    setInterval(checkReminders, 15000);
    setInterval(() => { if (appReady && AGENDA_VIEWS.includes(state.settings.view) && !ov.classList.contains('on') && document.activeElement.tagName !== 'SELECT') render(); }, 60000);
  }
  $('#newTitle').focus();
}

async function boot(){
  calHandlers(); allHandlers();
  const cfg = await getConfig();
  if (!cfg){
    mode = 'local'; state = load(); state.settings.view = 'home'; startApp();
    if (location.protocol !== 'file:'){
      $('#localTag').hidden = false;
      $('#localTag').title = 'Sign-in is not set up yet: add your Firebase settings to firebase-config.js. Until then, data is saved in this browser only.';
    }
    return;
  }
  mode = 'cloud'; showLoading('Connecting…');
  let F;
  try {
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    F = Object.assign({}, ...await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => import(base + f))));
  } catch(e){ console.error(e); showLoading("Couldn't reach Zenvora Loop. Check your internet connection, then refresh.", true); return; }
  const app = F.initializeApp(cfg), auth = F.getAuth(app);
  let fs;
  try { fs = F.initializeFirestore(app, {localCache: F.persistentLocalCache({tabManager: F.persistentMultipleTabManager()})}); }
  catch(e){ fs = F.getFirestore(app); }
  if (/^demo-/.test(cfg.projectId || '')){                             // local testing with `firebase emulators:start`
    F.connectAuthEmulator(auth, `http://${location.hostname}:9099`, {disableWarnings:true});
    F.connectFirestoreEmulator(fs, location.hostname, 8080);
  }
  cloud = {F, app, auth, fs, cfg, uid:null, user:null, isSuper:false, ctx:null};
  [['#exportBtn', '⬇ Download my planner backup'], ['#importBtn', '⬆ Restore planner backup']].forEach(([id, t]) => { const b = $(id); b.textContent = t; $('#userMenu').insertBefore(b, $('#changePwBtn')); });
  bindAuthUI();
  F.onAuthStateChanged(auth, user => user ? startUser(user) : signedOut());
  window.addEventListener('online', () => setSync(pendingWrites ? 'saving' : 'saved'));
  window.addEventListener('offline', () => setSync('offline'));
  const flush = () => { if (syncTimer) pushChanges(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
}

async function startUser(user){
  if (cloud.uid === user.uid && appReady){ updateUserChip(user); return; }
  stopListeners();
  const {F, fs} = cloud, uid = user.uid;
  cloud.uid = uid; cloud.user = user; cloud.ctx = null; appReady = false;
  synced.tasks.clear(); synced.days.clear(); synced.otasks.clear(); synced.settings = ''; teamReset();
  $('#auth').hidden = true; showLoading('Loading Zenvora Loop…');

  // Who is this? The Super Admin, or a member of exactly one organization.
  const isSuper = (user.email || '').toLowerCase() === ADMIN_EMAIL;
  cloud.isSuper = isSuper;
  const kick = async msg => { pendingAuthMsg = msg; await F.signOut(cloud.auth); };
  let memRef = null;
  if (!isSuper){
    let acc = null, me = null, org = null;
    try { const s = await F.getDoc(F.doc(fs, 'accounts', uid)); acc = s.exists() ? s.data() : null; } catch(e){ console.warn('Account read failed', e); }
    if (!acc || !acc.orgId) return kick('This account has not been set up for Zenvora Loop. Please ask your organization\'s Account Manager for an invite.');
    memRef = F.doc(fs, 'orgs', acc.orgId, 'members', uid);
    try { const s = await F.getDoc(memRef); me = s.exists() ? s.data() : null; } catch(e){ console.warn('Member read failed', e); }
    if (!me || me.active !== true || me.removed) return kick('Your access has been turned off. Please contact your Account Manager.');
    try { const s = await F.getDoc(F.doc(fs, 'orgs', acc.orgId)); org = s.exists() ? s.data() : null; } catch(e){ org = null; }
    if (!org || org.status !== 'active') return kick('Your organization\'s Zenvora Loop access is currently paused. Please contact your Account Manager.');
    if (cloud.uid !== uid) return;
    cloud.ctx = {orgId:acc.orgId, org, me, role:me.role || 'employee', support:false};
    applyTheme(org.color);
    if (me.mustChangePassword){
      hideLoading();
      if (!await passwordDialog(true)) return;          // they chose to sign out
      showLoading('Loading Zenvora Loop…');
    } else F.updateDoc(memRef, {lastLogin:Date.now()}).catch(() => {});
  } else applyTheme(null);

  let settings = {}, isNew = false;
  const items = [], history = {};
  if (agendaOn()){                                     // the Agenda planner is private to each person
    try { const s = await F.getDoc(F.doc(fs, 'users', uid)); if (s.exists()) settings = s.data().settings || {}; else isNew = true; }
    catch(e){ console.warn('Profile read failed', e); }
    await new Promise(res => {
      let gotT = false, gotD = false; const done = () => gotT && gotD && res();
      unsubs.push(F.onSnapshot(F.collection(fs, 'users', uid, 'tasks'), qs => {
        if (!gotT){ qs.forEach(d => { items.push(d.data()); synced.tasks.set(d.id, stable(d.data())); }); gotT = true; return done(); }
        applyRemote(qs, 'tasks');
      }, e => { cloudError(e); gotT = true; done(); }));
      unsubs.push(F.onSnapshot(F.collection(fs, 'users', uid, 'days'), qs => {
        if (!gotD){ qs.forEach(d => { history[d.id] = d.data(); synced.days.set(d.id, stable(d.data())); }); gotD = true; return done(); }
        applyRemote(qs, 'days');
      }, e => { cloudError(e); gotD = true; done(); }));
    });
  }
  if (cloud.uid !== uid) return;                      // signed out while loading
  state = normalize({items, history, settings});
  synced.settings = isNew ? '' : stable(settings);
  teamStart();                                        // tasks shared with colleagues (orgs/{id}/tasks) + the people directory

  resetFeatures(); orgView.reset(); supers.reset(); homeReset();
  if (!isSuper){
    const oc = cloud.ctx;
    unsubs.push(F.onSnapshot(memRef, s => {           // signed out the moment the Account Manager disables or removes them
      if (cloud.uid !== uid) return;
      const d = s.exists() ? s.data() : null;
      if (!d || d.active !== true || d.removed){ pendingAuthMsg = 'Your access has been turned off. Please contact your Account Manager.'; return doSignOut(); }
      const roleChanged = d.role !== oc.role, permsChanged = stable(d.perms || {}) !== stable(oc.me.perms || {}); oc.me = d; oc.role = d.role || 'employee';
      if (roleChanged){ ZL.each('roleChanged'); orgView.reset(); watchSupportRequests(); }
      if (roleChanged || permsChanged){ refreshTabs(); if (appReady) render(); }
    }, () => {}));
    unsubs.push(F.onSnapshot(F.doc(fs, 'orgs', oc.orgId), s => {     // org suspended / offboarded / features changed
      if (cloud.uid !== uid) return;
      const d = s.exists() ? s.data() : null;
      if (!d || d.status !== 'active'){ pendingAuthMsg = 'Your organization\'s Zenvora Loop access is currently paused. Please contact your Account Manager.'; return doSignOut(); }
      const hadAgenda = agendaOn();
      oc.org = d; applyTheme(d.color);
      if (oc.role === 'orgadmin' && !oc.support) brandSync(oc.orgId, d);     // name / logo / colour changed → the sign-in link shows it
      if (hadAgenda !== agendaOn()){ pushChanges(); setTimeout(() => location.reload(), 300); return; }   // the plan changed: reload to (un)load the planner
      refreshTabs(); if (appReady) render();
    }, () => {                                     // can't read the org any more: either they were turned off or the org was paused
      if (cloud.uid !== uid) return;
      const off = 'Your access has been turned off. Please contact your Account Manager.', paused = 'Your organization\'s Zenvora Loop access is currently paused. Please contact your Account Manager.';
      F.getDoc(memRef).then(s => { const d = s.exists() ? s.data() : null; return !d || d.active !== true || d.removed ? off : paused; }, () => paused)
        .then(m => { if (cloud.uid === uid){ pendingAuthMsg = m; doSignOut(); } });
    }));
    watchSupportRequests();
  }
  refreshTabs();
  state.settings.view = 'home';                               // everyone lands on Home
  updateUserChip(user); $('#userWrap').hidden = false; setSync(navigator.onLine ? 'saved' : 'offline');
  hideLoading();
  startApp();
  ZL.each('start');                                           // features begin their own background work
  if (isNew && agendaOn() && !isSuper && feat('agenda') && !state.items.length && state.settings.view === 'board')
    info(`Welcome to ${cloud.ctx.org.name}${user.displayName ? ', ' + firstName(user.displayName) : ''}! Add your first task above.`);
}

/* which tabs this person sees: depends on the organization's plan and their role */
function refreshTabs(){
  const oc = orgCtx(), isSup = !!(cloud && cloud.isSuper), role = oc ? oc.role : '';
  const agenda = agendaOn();
  AGENDA_VIEWS.forEach(v => { const t = document.querySelector(`#tabs [data-view="${v}"]`); if (t) t.hidden = !agenda; });
  $('#homeTab').hidden = !!(oc && oc.support);
  ZL.views().forEach(([, d]) => { const t = $(d.tab); if (t) t.hidden = !(oc && d.on()); });   // the features' tabs
  $('#orgTab').hidden = !(oc && (oc.support || role === 'orgadmin' || role === 'manager'));
  $('#orgsTab').hidden = !isSup;
  document.body.classList.toggle('sidenav', sideNavOn());
  $('#tabs').classList.toggle('many', [...document.querySelectorAll('#tabs [data-view]')].filter(b => !b.hidden).length > 6);
  ['#exportBtn', '#importBtn'].forEach(s => $(s).hidden = !agenda);
  if (!agenda) $('#notifBtn').hidden = true; else updNotifBtn();
  const uo = $('#userOrg');
  if (oc && !oc.support){ uo.hidden = false; uo.innerHTML = `<i class="sw" style="background:${esc(oc.org.color || '#3730A3')}"></i>${esc(oc.org.name)} · ${esc(oc.me.title || ROLE_LABEL[role] || '')}`; }
  else if (isSup){ uo.hidden = false; uo.innerHTML = '<i class="sw" style="background:#3730A3"></i>Zenvora Loop · Super Admin'; }
  else uo.hidden = true;
  const bar = $('#supBar');
  if (oc && oc.support){
    bar.hidden = false;
    bar.innerHTML = `🛟 <span><b>Support view</b> of <b>${esc(oc.org.name)}</b>: read-only, approved by their Account Manager until ${esc(fmt(oc.org.supportUntil))}.</span><span class="sp" style="flex:1"></span><button id="supExit">Exit support view</button>`;
  } else bar.hidden = true;
}
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
function setThemeMode(m){
  try { if (m === 'system') localStorage.removeItem('zl-theme'); else localStorage.setItem('zl-theme', m); } catch(e){}
  if (m === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = m;
  const oc = orgCtx(); applyTheme(oc ? oc.org.color : null); paintThemeBtn();
  if (appReady && state.settings.view === 'insights') renderInsights();
}
function paintThemeBtn(){ const b = $('#themeBtn'); if (b){ b.textContent = isDark() ? '☀️' : '🌙'; b.title = isDark() ? 'Switch to light mode' : 'Switch to dark mode'; } }
$('#themeBtn').onclick = () => setThemeMode(isDark() ? 'light' : 'dark');
$('#themeSys').onclick = () => { setThemeMode('system'); $('#userMenu').hidden = true; info('Following your device\'s light / dark setting.'); };
paintThemeBtn();
function applyTheme(color){
  const r = document.documentElement.style;
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)){ r.removeProperty('--accent'); r.removeProperty('--accent-ink'); return; }
  const dark = isDark();
  r.setProperty('--accent', color);
  r.setProperty('--accent-ink', dark ? `color-mix(in srgb, ${color} 45%, #fff)` : color);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { const oc = orgCtx(); applyTheme(oc ? oc.org.color : null); paintThemeBtn(); });

// changes made on another device or tab arrive here
function applyRemote(qs, kind){
  if (!appReady) return;
  const map = synced[kind]; let changed = false;
  qs.docChanges().forEach(c => {
    if (c.doc.metadata.hasPendingWrites) return;                  // our own write echoing back
    const id = c.doc.id;
    if (c.type === 'removed'){
      if (!map.has(id)) return;
      map.delete(id); changed = true;
      if (kind === 'tasks') state.items = state.items.filter(i => i.id !== id); else delete state.history[id];
      return;
    }
    const d = c.doc.data(), s = stable(d);
    if (map.get(id) === s) return;
    map.set(id, s); changed = true;
    if (kind === 'days'){ state.history[id] = d; return; }
    if (!Array.isArray(d.comments)) d.comments = [];
    const i = state.items.findIndex(x => x.id === id);
    if (i >= 0) state.items[i] = d; else state.items.push(d);
  });
  if (changed){ state.items.sort((a, b) => (a.ord || 0) - (b.ord || 0)); render(); }
}

function scheduleSync(){ clearTimeout(syncTimer); syncTimer = setTimeout(pushChanges, 400); setSync(navigator.onLine ? 'saving' : 'offline'); }
function pushChanges(){
  clearTimeout(syncTimer); syncTimer = null;
  if (mode !== 'cloud' || !appReady || !cloud.uid || !agendaOn()) return;
  const {F, fs, uid} = cloud, ops = [], seen = new Set();
  const tref = id => F.doc(fs, 'users', uid, 'tasks', id), dref = k => F.doc(fs, 'users', uid, 'days', k);
  const sops = [], sseen = new Set(), oref = id => F.doc(fs, 'orgs', orgCtx().orgId, 'tasks', id);
  state.items.forEach(it => {
    if (it.shared){                                  // shared with a colleague: lives in the organization, not in your private board
      if (!orgCtx()) return; sseen.add(it.id);
      const d = sharedData(it), s = stable(d);
      if (synced.otasks.get(it.id) !== s){ synced.otasks.set(it.id, s); sops.push(b => b.set(oref(it.id), d)); }
      return;
    }
    seen.add(it.id);
    const d = taskData(it), s = stable(d);
    if (synced.tasks.get(it.id) !== s){ synced.tasks.set(it.id, s); ops.push(b => b.set(tref(it.id), d)); }
  });
  [...synced.tasks.keys()].forEach(id => { if (!seen.has(id)){ synced.tasks.delete(id); ops.push(b => b.delete(tref(id))); } });
  if (orgCtx()) [...synced.otasks.keys()].forEach(id => { if (!sseen.has(id)){ synced.otasks.delete(id); sops.push(b => b.delete(oref(id))); } });
  Object.entries(state.history).forEach(([k, v]) => { const d = plain(v), s = stable(d); if (synced.days.get(k) !== s){ synced.days.set(k, s); ops.push(b => b.set(dref(k), d)); } });
  [...synced.days.keys()].forEach(k => { if (!state.history[k]){ synced.days.delete(k); ops.push(b => b.delete(dref(k))); } });
  const st = stable(state.settings);
  if (st !== synced.settings){
    synced.settings = st;
    ops.push(b => b.set(F.doc(fs, 'users', uid), {settings:plain(state.settings), email:cloud.user.email || '', name:cloud.user.displayName || '', updatedAt:Date.now()}, {merge:true}));
  }
  if (!ops.length && !sops.length){ if (!pendingWrites) setSync(navigator.onLine ? 'saved' : 'offline'); return; }
  const run = (list, shared) => { for (let i = 0; i < list.length; i += 450){     // shared tasks go in their own batch: one refusal never blocks your own board
    const b = F.writeBatch(fs); list.slice(i, i + 450).forEach(f => f(b));
    pendingWrites++;
    b.commit().then(() => { if (--pendingWrites === 0){ setSync('saved'); teamReapply(); } })
      .catch(e => { pendingWrites--; if (shared){ synced.otasks.clear(); teamReapply(true); } cloudError(e); });
  } };
  run(ops, false); run(sops, true);
}
function setSync(s){
  const t = {saved:'All changes saved to the cloud', saving:'Saving…', offline:'Offline: changes will sync when you reconnect', error:'Sync problem: changes may not be saved'}[s];
  $('#syncDot').className = 'sdot ' + s; $('#syncDot2').className = 'sdot ' + s; $('#syncText').textContent = t;
}
function cloudError(e){
  console.error('Cloud error', e); setSync('error');
  info(e && e.code === 'permission-denied' ? 'The database refused access. Check that the Firestore rules are deployed.' : 'Cloud sync problem: ' + ((e && (e.code || e.message)) || 'unknown'));
}
function stopListeners(){ unsubs.forEach(u => { try { u(); } catch(e){} }); unsubs = []; }
function updateUserChip(u){
  const name = u.displayName || (u.email || '').split('@')[0];
  $('#userInit').textContent = (name || '?').trim().charAt(0).toUpperCase();
  $('#userName').textContent = name; $('#userEmail').textContent = u.email || '';
  $('#userBtn').title = u.email || 'Account';
}
function signedOut(){
  resetFeatures(); orgView.reset(); supers.reset(); homeReset();
  stopListeners(); appReady = false;
  if (cloud){ cloud.uid = null; cloud.user = null; cloud.ctx = null; cloud.isSuper = false; }
  applyTheme(null); refreshTabs(); $('#reqBell').hidden = true;
  state = normalize({}); ov.classList.remove('on'); $('#toasts').innerHTML = '';
  $('#userWrap').hidden = true; $('#userMenu').hidden = true;
  $('#pwScreen').hidden = true;
  hideLoading(); showAuth('signin'); authBrand();
  if (pendingAuthMsg){ authMsg(pendingAuthMsg); pendingAuthMsg = ''; }
}
async function doSignOut(){
  pushChanges();
  try { await Promise.race([cloud.F.waitForPendingWrites(cloud.fs), new Promise(r => setTimeout(r, 4000))]); } catch(e){}
  await cloud.F.signOut(cloud.auth);
}

/* ---------- sign-in page ---------- */
let authMode = 'signin';
const AUTH_ERR = {
  'auth/invalid-credential':'Email or password is incorrect.', 'auth/wrong-password':'Email or password is incorrect.',
  'auth/user-not-found':'No account with that email. Create one below.', 'auth/email-already-in-use':'An account with this email already exists. Sign in instead.',
  'auth/invalid-email':'Please enter a valid email address.', 'auth/user-disabled':'This account has been disabled. Please contact the administrator.',
  'auth/requires-recent-login':'For security, please sign in again and then change your password.', 'auth/missing-password':'Please enter your password.',
  'auth/weak-password':'Use a password with at least 6 characters.', 'auth/too-many-requests':'Too many attempts. Please wait a minute and try again.',
  'auth/network-request-failed':'No connection. Check your internet and try again.',
  'auth/popup-blocked':'The browser blocked the Google pop-up. Allow pop-ups for this site and try again.',
  'auth/operation-not-allowed':'This sign-in method is not enabled yet (Firebase console → Authentication → Sign-in method).',
  'auth/unauthorized-domain':'This web address is not authorised yet (Firebase console → Authentication → Settings → Authorized domains).'
};
function showAuth(m){
  authMode = m || authMode; const up = authMode === 'signup';
  $('#auth').hidden = false;
  $('#authTitle').textContent = up ? 'Create your account' : 'Welcome back';
  $('#authSub').textContent = 'Sign in with the email and password you were given.';
  $('#nameRow').hidden = !up; $('#forgot').hidden = up;
  $('#authSubmit').textContent = up ? 'Create account' : 'Sign in';
  $('#aPass').setAttribute('autocomplete', up ? 'new-password' : 'current-password');
  $('#switchText').textContent = up ? 'Already have an account?' : 'New to Zenvora Loop?';
  $('#switchMode').textContent = up ? 'Sign in' : 'Create an account';
  authMsg('');
}
function authMsg(t, ok){ const e = $('#authErr'); e.textContent = t; e.hidden = !t; e.classList.toggle('ok', !!ok); }
function bindAuthUI(){
  const {F, auth} = cloud;
  const busy = b => { $('#authSubmit').disabled = b; $('#gBtn').disabled = b; };
  $('#switchMode').onclick = () => showAuth(authMode === 'signup' ? 'signin' : 'signup');
  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    const email = $('#aEmail').value.trim(), pass = $('#aPass').value;
    if (!email) return authMsg(AUTH_ERR['auth/invalid-email']);
    if (!pass) return authMsg(AUTH_ERR['auth/missing-password']);
    busy(true); authMsg('');
    try {
      if (authMode === 'signup'){
        const c = await F.createUserWithEmailAndPassword(auth, email, pass);
        const n = $('#aName').value.trim();
        if (n){ await F.updateProfile(c.user, {displayName:n}); updateUserChip(auth.currentUser); }
        F.sendEmailVerification(c.user).catch(() => {});
      } else await F.signInWithEmailAndPassword(auth, email, pass);
      $('#aPass').value = '';
    } catch(err){ authMsg(AUTH_ERR[err.code] || err.message); }
    finally { busy(false); }
  };
  $('#gBtn').onclick = async () => {
    busy(true); authMsg('');
    try { await F.signInWithPopup(auth, new F.GoogleAuthProvider()); }
    catch(err){ if (!/popup-closed-by-user|cancelled-popup-request/.test(err.code || '')) authMsg(AUTH_ERR[err.code] || err.message); }
    finally { busy(false); }
  };
  $('#forgot').onclick = async () => {
    const email = $('#aEmail').value.trim();
    if (!email){ authMsg('Type your email above, then click "Forgot password?" again.'); $('#aEmail').focus(); return; }
    try { await F.sendPasswordResetEmail(auth, email); authMsg('Password reset email sent. Check your inbox (and spam folder).', true); }
    catch(err){ authMsg(AUTH_ERR[err.code] || err.message); }
  };
  $('#userBtn').onclick = e => { e.stopPropagation(); $('#userMenu').hidden = !$('#userMenu').hidden; };
  document.addEventListener('click', e => { if (!e.target.closest('#userWrap')) $('#userMenu').hidden = true; });
  $('#signOutBtn').onclick = doSignOut;
  $('#changePwBtn').onclick = () => { $('#userMenu').hidden = true; passwordDialog(false); };
  $('#reqBell').onclick = () => { document.querySelectorAll('.toast.supreq').forEach(t => t.remove()); orgView.sec = 'support'; setView('org'); };
  document.addEventListener('click', e => {
    if (e.target.closest('#supExit')) exitSupport();
    const c = e.target.closest('[data-copy]');
    if (c){ const t = document.getElementById(c.dataset.copy); navigator.clipboard.writeText(t.textContent).then(() => info('Login details copied: paste them into WhatsApp or email.'), () => info('Select the text and copy it manually.')); }
  });
}

/* ---------- set / change password (forced on first sign-in) ---------- */
function pwMsg(t){ const e = $('#pwErr'); e.textContent = t; e.hidden = !t; }
function passwordDialog(forced){
  return new Promise(resolve => {
    const {F} = cloud, scr = $('#pwScreen');
    $('#pwTitle').textContent = forced ? 'Set your new password' : 'Change your password';
    $('#pwSub').textContent = forced ? 'Welcome! For security, replace the temporary password you were given with one only you know.' : 'Choose a new password for your account.';
    $('#pwCancel').textContent = forced ? 'Sign out' : 'Cancel';
    $('#pw1').value = $('#pw2').value = ''; pwMsg(''); scr.hidden = false; $('#pw1').focus();
    const done = ok => { scr.hidden = true; $('#pwForm').onsubmit = null; $('#pwCancel').onclick = null; resolve(ok); };
    $('#pwCancel').onclick = () => { done(false); if (forced) F.signOut(cloud.auth); };
    $('#pwForm').onsubmit = async e => {
      e.preventDefault();
      const a = $('#pw1').value, b = $('#pw2').value;
      if (a.length < 8) return pwMsg('Use at least 8 characters.');
      if (a !== b) return pwMsg("The two passwords don't match.");
      $('#pwSubmit').disabled = true;
      try {
        await F.updatePassword(cloud.auth.currentUser, a);
        const oc = orgCtx();
        if (oc && !oc.support) await F.updateDoc(F.doc(cloud.fs, 'orgs', oc.orgId, 'members', cloud.uid), {mustChangePassword:false, lastLogin:Date.now()}).catch(err => console.warn(err));
        if (!forced) info('Your password has been changed.');
        done(true);
      } catch(err){
        pwMsg(AUTH_ERR[err.code] || err.message);
        if (err.code === 'auth/requires-recent-login') setTimeout(() => { done(false); F.signOut(cloud.auth); }, 2000);
      } finally { $('#pwSubmit').disabled = false; }
    };
  });
}

/* ================= creating logins (shared by the Super Admin and Account Managers) ================= */
function genPass(){
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', a = new Uint32Array(10);
  crypto.getRandomValues(a);
  return Array.from(a, x => c[x % c.length]).join('') + '#' + (a[0] % 90 + 10);
}
async function createAuthUser(name, email, pass){
  const {F, cfg} = cloud;
  if (!cloud.secAuth){            // a second, in-memory Firebase instance so the admin stays signed in
    const sec = F.initializeApp(cfg, 'zl-admin-create');
    cloud.secAuth = F.initializeAuth(sec, {persistence: F.inMemoryPersistence});
    if (/^demo-/.test(cfg.projectId || '')) F.connectAuthEmulator(cloud.secAuth, `http://${location.hostname}:9099`, {disableWarnings:true});
  }
  let c;
  try { c = await F.createUserWithEmailAndPassword(cloud.secAuth, email, pass); }
  catch(err){                      // a previous attempt created the login but stopped before finishing: reuse it if the password matches
    if (err.code !== 'auth/email-already-in-use') throw err;
    try { c = await F.signInWithEmailAndPassword(cloud.secAuth, email, pass); } catch(e2){ throw err; }
  }
  try { if (name) await F.updateProfile(c.user, {displayName:name}); }
  finally { await F.signOut(cloud.secAuth).catch(() => {}); }
  return c.user.uid;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* ---------- each organization's own sign-in link: <app address>#/o/<orgId> ----------
   The link shows the organization's name, logo and colour on the sign-in page (from brand/{orgId}, the only thing anyone can
   read without signing in). Signing in still decides the organization: the link only changes how the page looks. */
const appBase = () => location.origin + location.pathname;
const orgLink = orgId => appBase() + '#/o/' + orgId;
const BRAND_KEY = 'zl-brand';
async function brandSync(orgId, org){                 // keep the public sign-in branding in step with the organization
  if (!cloud || !orgId || !org) return;
  const {F, fs} = cloud, want = {name:org.name || '', color:org.color || '', logo:org.logo || '', active:org.status === 'active'};
  try { const s = await F.getDoc(F.doc(fs, 'brand', orgId)), cur = s.exists() ? s.data() : null;
    if (!cur || ['name', 'color', 'logo', 'active'].some(k => cur[k] !== want[k])) await F.setDoc(F.doc(fs, 'brand', orgId), Object.assign(want, {at:Date.now()})); }
  catch(e){ console.warn('brand', e); }
}
const AUTH_BRAND0 = $('#auth .auth-brand') ? $('#auth .auth-brand').innerHTML : '';
function authBrandShow(b){
  const el = $('#auth .auth-brand'); if (!el) return;
  if (!b){ el.innerHTML = AUTH_BRAND0; el.classList.remove('org'); $('#authSub').textContent = 'Sign in with the email and password you were given.'; applyTheme(null); return; }
  el.classList.add('org');
  el.innerHTML = `${b.logo ? `<img src="${b.logo}" alt="">` : `<span class="auth-ini" style="background:${esc(b.color || '#4338CA')}">${initial(b.name)}</span>`}<div><b>${esc(b.name)}</b><small>on Zenvora Loop · <button type="button" class="link" id="brandOff" title="Not from ${esc(b.name)}? Show the plain sign-in page">not ${esc(b.name)}?</button></small></div>`;
  $('#authSub').textContent = `Sign in to ${b.name} with the email and password you were given.`;
  applyTheme(b.color);
}
async function authBrand(){                           // #/o/<orgId> link → show that organization on the sign-in page (and remember it)
  const m = (location.hash || '').match(/^#\/o\/([a-z0-9][a-z0-9-]{1,29})/);
  let saved = null; try { saved = JSON.parse(localStorage.getItem(BRAND_KEY) || 'null'); } catch(e){}
  const id = m ? m[1] : saved && saved.id;
  if (!id){ authBrandShow(null); return; }
  if (saved && saved.id === id) authBrandShow(saved);                    // instant, then refresh
  try {
    const s = await cloud.F.getDoc(cloud.F.doc(cloud.fs, 'brand', id)), b = s.exists() ? s.data() : null;
    if (!b || b.active === false){ try { localStorage.removeItem(BRAND_KEY); } catch(e){} authBrandShow(null); return; }
    const keep = {id, name:b.name, color:b.color, logo:b.logo}; try { localStorage.setItem(BRAND_KEY, JSON.stringify(keep)); } catch(e){}
    if (!$('#auth').hidden) authBrandShow(keep);
  } catch(e){ if (!saved || saved.id !== id) authBrandShow(null); }
}
document.addEventListener('click', e => { if (e.target.closest('#brandOff')){ try { localStorage.removeItem(BRAND_KEY); } catch(_){} if (/^#\/o\//.test(location.hash)) history.replaceState(null, '', location.pathname); authBrandShow(null); } });
const shareLinkHtml = (orgId, who) => `<div class="olink"><span>🔗 <b>Sign-in link for ${esc(who)}</b> <span class="stat">shows your name and logo on the sign-in page</span></span><code id="olinkV">${esc(orgLink(orgId))}</code><button type="button" data-copylink="${esc(orgLink(orgId))}">📋 Copy link</button></div>`;
document.addEventListener('click', e => { const b = e.target.closest('[data-copylink]'); if (!b) return; const t = b.dataset.copylink;
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => info('Link copied.'), () => prompt('Copy this link:', t)); });
const inviteText = (orgName, email, pass, orgId) => `You're invited to ${orgName} on Zenvora Loop 👋\n\nOpen:  ${orgId ? orgLink(orgId) : appBase()}\nEmail: ${email}\nTemporary password: ${pass}\n\nYou'll be asked to set your own password when you first sign in.`;
const shareHtml = (id, text) => text ? `<div class="share"><pre id="${id}">${esc(text)}</pre><button type="button" data-copy="${id}">📋 Copy login details</button></div>` : '';
const msgHtml = m => m ? `<div class="auth-err${m.ok ? ' ok' : ''}" style="margin-top:8px">${esc(m.t)}</div>` : '';
const errText = err => err && err.code === 'custom' ? err.message
  : err && err.code === 'permission-denied' ? 'The database refused this (permission-denied). Publish the latest firestore.rules in Firebase console → Firestore Database → Rules, then try again.'
  : (AUTH_ERR[err && err.code] || (err && (err.code || err.message)) || 'unknown error');
function formErr(formId, m, btn){                 // show an error under a form without wiping what was typed
  const f = document.getElementById(formId); if (!f) return;
  let el = f.parentElement.querySelector(':scope > .auth-err');
  if (!el){ el = document.createElement('div'); f.parentElement.appendChild(el); }
  el.outerHTML = msgHtml(m);
  const b = btn && $(btn); if (b) b.disabled = false;
}
const custom = t => Object.assign(new Error(t), {code:'custom'});
const keepTyping = el => el.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
const initial = s => esc(String(s || '?').trim().charAt(0).toUpperCase());
const roleRank = r => ({orgadmin:0, manager:1, employee:2})[r] ?? 3;
const PALETTE = ['#3730A3', '#0F766E', '#0369A1', '#7C3AED', '#BE185D', '#B45309', '#15803D', '#B91C1C', '#334155'];
const swatchesHtml = (id, cur) => `<div class="swatches" data-sw="${id}">${PALETTE.map(c => `<button type="button" data-c="${c}" style="background:${c}"${c.toLowerCase() === String(cur).toLowerCase() ? ' class="on"' : ''} title="${c}"></button>`).join('')}<input type="color" id="${id}" value="${esc(cur)}" title="Custom colour"></div>`;
// switches the Super Admin turns on per organization: [key, label, about, needs another switch]; features add theirs (ZL.add flags)
const FEATURES = [['agenda', 'Agenda Handler', 'boards, calendar, tasks']];
const featsHtml = (pre, f) => `<div class="feats">${FEATURES.map(([k, l, d]) => `<label><input type="checkbox" id="${pre}_${k}"${f[k] ? ' checked' : ''}> ${l} <small>${d}</small></label>`).join('')}</div>`;
const readFeats = pre => { const f = {}; FEATURES.forEach(([k]) => f[k] = $(`#${pre}_${k}`).checked);
  FEATURES.forEach(([k, l, , need]) => { const n = need && FEATURES.find(x => x[0] === need); if (n && f[k] && !f[need]) throw custom(`${l} works from ${n[1].toLowerCase()}: turn on ${n[1]} too.`); });
  return f; };
document.addEventListener('click', e => {           // colour swatches
  const b = e.target.closest('[data-sw] button[data-c]'); if (!b) return;
  const box = b.closest('[data-sw]'); box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  document.getElementById(box.dataset.sw).value = b.dataset.c;
});

