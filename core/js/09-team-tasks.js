/* ================= Team tasks: assignee, reporter, shared tasks (Jira style) =================
   Every task can have an assignee.
   • In an organization: give a task to a colleague and it moves to orgs/{orgId}/tasks/{taskId}, where only the
     person who created it (the reporter), the assignee and the Account Manager can see it. Both boards show it,
     and status, description and comments stay in step. Everyone's own tasks stay private in users/{uid}.
   • Without an organization (or for helpers who have no login): keep a list of team names in your settings
     (state.settings.team) and assign among them. Those tasks stay on your own board.
   The Account Manager decides who may give tasks to colleagues: plannerCfg().assign = 'all' | 'mgr' | 'off'. */
const team = {dir:[], sets:{a:new Set(), c:new Set()}, last:{}, first:{a:true, c:true}, dirty:false,
  who:(() => { try { return localStorage.getItem('zl-who') || 'all'; } catch(e){ return 'all'; } })()};
function teamReset(){ Object.assign(team, {dir:[], sets:{a:new Set(), c:new Set()}, last:{}, first:{a:true, c:true}, dirty:false}); }
const myUid = () => (mode === 'cloud' && cloud && cloud.uid) || '';
const myName = () => { const oc = orgCtx(); return (oc && !oc.support && fullName(oc.me)) || (cloud && cloud.user && (cloud.user.displayName || (cloud.user.email || '').split('@')[0])) || 'You'; };
const teamOrg = () => { const oc = orgCtx(); return !!(mode === 'cloud' && oc && !oc.support && feat('agenda')); };
const canAssignOrg = () => { if (!teamOrg()) return false; const a = plannerCfg().assign; return a === 'all' || (a === 'mgr' && ['orgadmin', 'manager'].includes(orgCtx().role)); };
const teamNames = () => Array.isArray(state.settings.team) ? state.settings.team : [];
const sharedData = it => { const o = taskData(it); o.shared = true; o.createdBy = it.createdBy || myUid(); o.assigneeUid = (it.assignee && it.assignee.uid) || ''; return o; };
const whoKey = it => it.assignee ? (it.assignee.uid ? 'u:' + it.assignee.uid : 'n:' + it.assignee.name) : '';
const whoMatch = it => team.who === 'all' || whoKey(it) === team.who;
// yours to do: not a task you handed to a colleague (those remind and count on their board, not yours)
const isMine = it => !(it.shared && it.assigneeUid && it.assigneeUid !== myUid());

/* avatars: initials on a colour picked from the name, so a person always has the same colour */
const AV_COL = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#64748B'];
const avCol = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV_COL[h % AV_COL.length]; };
const initials = n => String(n || '?').replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const avatar = (name, cls = '', id = '') => `<span class="av ${cls}"${id ? ` id="${id}"` : ''} style="background:${avCol(name)}" title="${esc(name)}">${esc(initials(name))}</span>`;

/* ---------- cloud: the shared tasks + the people directory ---------- */
function teamStart(){
  if (!teamOrg() || !agendaOn()) return;
  const {F, fs, uid: me} = cloud, oc = orgCtx(), col = F.collection(fs, 'orgs', oc.orgId, 'tasks');
  unsubs.push(F.onSnapshot(F.query(col, F.where('assigneeUid', '==', me)), qs => applyShared(qs, 'a'), e => console.warn('Shared tasks', e)));
  unsubs.push(F.onSnapshot(F.query(col, F.where('createdBy', '==', me)), qs => applyShared(qs, 'c'), e => console.warn('Shared tasks', e)));
  unsubs.push(F.onSnapshot(F.collection(fs, 'orgs', oc.orgId, 'dir'), qs => {      // names everyone may see, to pick an assignee
    team.dir = qs.docs.map(d => Object.assign({uid:d.id}, d.data())).filter(p => p.active !== false);
    if (appReady && ['board', 'all'].includes(state.settings.view)) render();
  }, () => {}));
  const m = oc.me || {};
  F.setDoc(F.doc(fs, 'orgs', oc.orgId, 'dir', me), {name:fullName(m) || myName(), title:m.title || '', active:true, at:Date.now()}).catch(() => {});
}
// the Account Manager keeps the directory in step with People (names, titles, who left)
function dirSync(members){
  if (!isOrgAdmin() || !feat('agenda')) return;
  const {F, fs} = cloud, oc = orgCtx(), have = Object.fromEntries(team.dir.map(p => [p.uid, p]));
  members.forEach(mb => {
    const on = mb.active === true && !mb.removed, cur = have[mb.uid];
    if (!on){ if (cur) F.setDoc(F.doc(fs, 'orgs', oc.orgId, 'dir', mb.uid), {name:cur.name, title:cur.title || '', active:false, at:Date.now()}).catch(() => {}); return; }
    const want = {name:fullName(mb), title:mb.title || ''};
    if (!cur || cur.name !== want.name || (cur.title || '') !== want.title) F.setDoc(F.doc(fs, 'orgs', oc.orgId, 'dir', mb.uid), Object.assign(want, {active:true, at:Date.now()})).catch(() => {});
  });
}
function applyShared(qs, key){
  team.last[key] = qs;
  const first = team.first[key]; team.first[key] = false;
  if (pendingWrites && !first){ team.dirty = true; return; }      // our own save is on its way: look again once it lands
  mergeShared(key, qs, first, false);
}
function mergeShared(key, qs, quiet, force){
  const now = new Set(), other = team.sets[key === 'a' ? 'c' : 'a'], me = myUid(), fresh = [];
  let changed = false, openChanged = false;
  qs.forEach(doc => {
    now.add(doc.id);
    if (!force && doc.metadata && doc.metadata.hasPendingWrites) return;
    const d = doc.data(), s = stable(d);
    if (!force && synced.otasks.get(doc.id) === s) return;
    synced.otasks.set(doc.id, s);
    if (!Array.isArray(d.comments)) d.comments = [];
    d.shared = true;
    const i = state.items.findIndex(x => x.id === doc.id);
    if (i >= 0) state.items[i] = d;
    else { state.items.push(d); if (!quiet && d.assigneeUid === me && d.createdBy !== me && d.status !== 'done') fresh.push(d); }
    if (doc.id === openId) openChanged = true;
    changed = true;
  });
  team.sets[key].forEach(id => {                                   // reassigned to someone else, or deleted by the reporter
    if (now.has(id) || other.has(id)) return;
    const it = byId(id); if (it && it.shared){ state.items = state.items.filter(x => x !== it); changed = true; if (id === openId) openChanged = true; }
    synced.otasks.delete(id);
  });
  team.sets[key] = now;
  if (!changed) return;
  state.items.sort((a, b) => (a.ord || 0) - (b.ord || 0));
  if (!appReady) return;
  commit();
  if (openChanged && ov.classList.contains('on') && !openSnap){
    const it = byId(openId);
    if (!it) closeModal();
    else if ($('#modal').contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) renderComments();   // don't wipe what you're typing
    else fillModal(it);
  }
  fresh.forEach(t => info(`📥 ${t.createdByName || 'A colleague'} gave you a task: ${t.title}`));
}
function teamReapply(force){
  if (!team.dirty && !force) return; team.dirty = false;
  ['a', 'c'].forEach(k => { if (team.last[k]) mergeShared(k, team.last[k], true, !!force); });
  if (force){                                                      // the cloud refused: tasks it doesn't have go back to your own board
    const all = new Set([...team.sets.a, ...team.sets.c]); let n = 0;
    state.items.forEach(it => { if (it.shared && !all.has(it.id)){ unshare(it); n++; } });
    if (n){ info('That task could not be shared with your colleague, so it stays on your own board.'); save(); render(); }
  }
}
function unshare(it){ it.shared = false; ['assigneeUid', 'createdBy'].forEach(k => delete it[k]); }

/* ---------- assigning ---------- */
function assigneeOpts(it, forNew){
  const cur = it && it.assignee ? whoKey(it) : '', o = (v, l) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
  let h = o('', forNew ? 'Assignee: none' : 'Unassigned'), seen = new Set(['']);
  const add = (v, l) => { seen.add(v); return o(v, l); };
  if (teamOrg()){
    h += add('u:' + myUid(), myName() + ' (me)');
    if (canAssignOrg() || (it && it.shared)){
      const ppl = team.dir.filter(p => p.uid !== myUid()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (ppl.length) h += `<optgroup label="${esc(orgCtx().org.name)}">${ppl.map(p => add('u:' + p.uid, p.name + (p.title ? ' · ' + p.title : ''))).join('')}</optgroup>`;
    }
  }
  const names = teamNames();
  if (names.length) h += `<optgroup label="My team">${names.map(n => add('n:' + n, n)).join('')}</optgroup>`;
  if (cur && !seen.has(cur)) h += o(cur, it.assignee.name);
  return h + o('+', '＋ Add a team name…');
}
function addTeamName(){
  const n = (prompt('Name of the team member (they don\'t need a login):') || '').trim().slice(0, 40);
  if (!n) return '';
  if (!teamNames().some(x => x.toLowerCase() === n.toLowerCase())) state.settings.team = teamNames().concat(n);
  return 'n:' + (teamNames().find(x => x.toLowerCase() === n.toLowerCase()) || n);
}
// val: '' (nobody) | 'u:<uid>' (a colleague with a login) | 'n:<name>' (a team name)
function setAssignee(it, val, quiet){
  const before = whoKey(it); if (val === before) return;
  let a = null;
  if (val.startsWith('u:')){ const u = val.slice(2), p = team.dir.find(x => x.uid === u); a = {uid:u, name:u === myUid() ? myName() : p ? p.name : 'Colleague'}; }
  else if (val.startsWith('n:')) a = {name:val.slice(2)};
  if (a) it.assignee = a; else delete it.assignee;
  const toOther = !!(a && a.uid && a.uid !== myUid());
  if (toOther && !it.shared){
    if (!canAssignOrg()){ delete it.assignee; info('Your Account Manager has turned off giving tasks to colleagues.'); return; }
    it.shared = true; it.createdBy = myUid(); it.createdByName = it.createdByName || myName();
  } else if (it.shared && it.createdBy === myUid() && !toOther) unshare(it);   // back on your own board
  if (it.shared) it.assigneeUid = (a && a.uid) || '';
  if (!quiet) it.comments.push({id:uid(), sys:true, at:Date.now(), text:`👤 ${mode === 'cloud' ? myName() : 'You'} assigned this to ${a ? a.name : 'nobody'}`});
  else if (it.shared) it.comments.push({id:uid(), sys:true, at:Date.now(), text:`👤 ${myName()} created this for ${a.name}`});
}
// on a shared task, status moves are noted so the other person sees who did what
function noteStatus(it){
  if (!it.shared) return;
  it.comments.push({id:uid(), sys:true, at:Date.now(), text:`${it.status === 'done' ? '✅' : '➜'} ${myName()} moved this to ${colName(it.status)}`});
}
$('#mWho').addEventListener('change', e => {
  const it = byId(openId); if (!it || openSnap) return;
  let v = e.target.value;
  if (v === '+'){ v = addTeamName(); if (!v){ e.target.innerHTML = assigneeOpts(it); return; } }
  setAssignee(it, v); commit(); fillModal(byId(openId) || it);
});
$('#newWho').addEventListener('change', e => { if (e.target.value === '+'){ const v = addTeamName(); if (v) save(); fillNewWho(v); } });
function fillNewWho(v){ const s = $('#newWho'); if (!s) return; const keep = v !== undefined ? v : s.value; s.innerHTML = assigneeOpts(keep && keep !== '+' ? {assignee:keep.startsWith('u:') ? {uid:keep.slice(2), name:''} : {name:keep.slice(2)}} : null, true); s.value = keep && keep !== '+' ? keep : ''; }

/* ---------- the assignee bar on the board (click a face to see only their tasks) ---------- */
function renderWhoBar(items){
  const host = $('#whoBar'); if (!host) return;
  fillNewWho();
  const m = new Map(); items.forEach(it => { if (it.assignee) m.set(whoKey(it), it.assignee.name); });
  const none = items.filter(it => !it.assignee).length;
  if (team.who !== 'all' && !m.has(team.who) && !(team.who === '' && none)) team.who = 'all';
  const n = k => items.filter(it => whoKey(it) === k).length;
  host.innerHTML = `<div class="who"><span class="wl">Assignee</span>
    <button class="wchip${team.who === 'all' ? ' on' : ''}" data-who="all">All <b>${items.length}</b></button>
    ${[...m].sort((a, b) => (b[0] === 'u:' + myUid()) - (a[0] === 'u:' + myUid()) || a[1].localeCompare(b[1])).map(([k, name]) => `<button class="wav${team.who === k ? ' on' : ''}" data-who="${esc(k)}" title="${esc(name)}: ${plural(n(k), 'task')}">${avatar(name)}<span class="wn">${n(k)}</span></button>`).join('')}
    ${none && m.size ? `<button class="wchip${team.who === '' ? ' on' : ''}" data-who="">Unassigned <b>${none}</b></button>` : ''}
    <span class="sp"></span><button class="ghost" id="teamBtn" title="People you can give tasks to">👥 Team</button></div>`;
}
function whoFilterOpts(sel){
  const m = new Map(); state.items.forEach(it => { if (it.assignee) m.set(whoKey(it), it.assignee.name); });
  const o = (v, l) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`;
  return o('all', 'Anyone') + o('', 'Unassigned') + [...m].sort((a, b) => a[1].localeCompare(b[1])).map(([k, n]) => o(k, n)).join('');
}
document.addEventListener('click', e => {
  const w = e.target.closest('[data-who]');
  if (w){ team.who = w.dataset.who === team.who && team.who !== 'all' ? 'all' : w.dataset.who; try { localStorage.setItem('zl-who', team.who); } catch(_){} return renderBoard(); }
  if (e.target.closest('#teamBtn')) return openTeam();
  if (e.target.closest('#tmClose') || e.target.id === 'teamOv') return $('#teamOv').classList.remove('on');
  const rm = e.target.closest('[data-tmrm]');
  if (rm){ state.settings.team = teamNames().filter(x => x !== rm.dataset.tmrm); save(); openTeam(); render(); return; }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'tmAdd') return; e.preventDefault();
  const n = $('#tmName').value.trim().slice(0, 40); if (!n) return;
  if (!teamNames().some(x => x.toLowerCase() === n.toLowerCase())){ state.settings.team = teamNames().concat(n); save(); }
  openTeam(); render(); setTimeout(() => $('#tmName') && $('#tmName').focus(), 0);
});
function openTeam(){
  const org = teamOrg(), cfg = plannerCfg(), can = canAssignOrg();
  const ppl = org ? team.dir.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))) : [];
  const why = !org ? '' : cfg.assign === 'off' ? 'Your Account Manager has turned off giving tasks to colleagues.' : !can ? 'Only managers and the Account Manager can give tasks to colleagues.' : 'Give any task to a colleague: it shows on both of your boards and stays in step.';
  $('#teamModal').innerHTML = `<div class="tm-head"><b style="font-size:16px">👥 Team</b><span class="sp"></span><button class="ghost tm-x" id="tmClose">✕</button></div>
    ${org ? `<div class="tmsec"><h4>${esc(orgCtx().org.name)} <span class="stat">${ppl.length} ${ppl.length === 1 ? 'person' : 'people'}</span></h4><p class="stat">${esc(why)}</p>
      <div class="tmppl">${ppl.map(p => `<div class="tmp">${avatar(p.name)}<div><b>${esc(p.name)}${p.uid === myUid() ? ' (me)' : ''}</b><span>${esc(p.title || '')}</span></div></div>`).join('') || '<div class="stat">Loading…</div>'}</div></div>` : ''}
    <div class="tmsec"><h4>My team names</h4><p class="stat">${org ? 'Helpers without a login (or anyone you track work for). Tasks given to a name stay on your own board.' : 'Add the people you plan work for, then pick them as the assignee of any task.'}</p>
      <div class="tmchips">${teamNames().map(n => `<span class="tmc">${avatar(n, 'sm')}${esc(n)}<button class="ghost" data-tmrm="${esc(n)}" title="Remove">✕</button></span>`).join('') || '<span class="stat">No names yet.</span>'}</div>
      <form id="tmAdd" class="tmform"><input id="tmName" placeholder="e.g. Ravi (front desk)" maxlength="40" autocomplete="off"><button class="primary">Add</button></form></div>`;
  $('#teamOv').classList.add('on');
}
