/* ---------- Home: a page of widgets each person arranges for themselves ---------- */
const home = {key:'', team:null, inv:null, cz:null};        // features keep their own Home data (home.load / home.reset)
function homeLoad(){
  const oc = orgCtx(), F = cloud && cloud.F;
  const key = (oc ? oc.orgId + oc.role : cloud && cloud.isSuper ? 'super' : 'local') + todayKey;
  if (home.key === key) return; home.key = key; home.at = Date.now();
  Object.assign(home, {team:null, inv:null});
  const again = () => { if (state.settings.view === 'home') renderSoon('home', () => { if (state.settings.view === 'home') renderHome(); }); };
  if (cloud && cloud.isSuper && !oc){
    supersLoad();
    Promise.all((supers.orgs || []).map(o => F.getDocs(F.query(F.collection(cloud.fs, 'orgs', o.id, 'invoices'), F.where('status', '==', 'due'))).then(qs => docsOf(qs).map(i => Object.assign(i, {org:o}))).catch(() => [])))
      .then(r => { home.inv = r.flat(); again(); });
    return;
  }
  if (!oc || oc.support) return;
  if (oc.role === 'orgadmin' || oc.role === 'manager') F.getDocs(F.collection(cloud.fs, 'orgs', oc.orgId, 'members')).then(qs => { home.team = docsOf(qs).map(m => Object.assign(m, {uid:m.id})).filter(m => !m.removed); again(); }).catch(() => { home.team = []; });
  ZL.part('home', 'load', again);                       // each feature loads what its widgets need
}
function homeReset(){ Object.assign(home, {key:'', team:null, inv:null}); ZL.part('home', 'reset'); }
const myTasks = () => agendaOn() ? state.items.filter(isMine) : [];
// the widget catalogue: who can have it, and how it draws. Features add theirs (ZL.add → home.widgets)
const WIDGETS = {
  team:{t:'My team', ic:'👥', d:'Your reporting manager and reportees', ok:() => !!(orgCtx() && !orgCtx().support), r:wTeam},
  tasksToday:{t:'My tasks today', ic:'✅', d:'Open tasks on your Planning Board for today', ok:() => agendaOn(), r:wTasksToday},
  overdue:{t:'Overdue', ic:'🔥', d:'Tasks past their due time', ok:() => agendaOn(), r:wOverdue},
  upcoming:{t:'Coming up', ic:'🗓', d:'Tasks planned for the next 7 days', ok:() => agendaOn(), r:wUpcoming},
  week:{t:'This week', ic:'📈', d:'How much of this week you have completed', ok:() => agendaOn(), r:wWeek},
  quick:{t:'Quick actions', ic:'⚡', d:'One-click shortcuts: new task, new patient, book, tally', ok:() => true, r:wQuick},
  note:{t:'Notes', ic:'📝', d:'A personal sticky note that stays on your Home', ok:() => true, r:wNote},
  orgs:{t:'Organizations', ic:'🏢', d:'Active organizations, people, subscriptions and open support access', ok:() => !!(cloud && cloud.isSuper && !orgCtx()), r:wOrgs},
  invoices:{t:'Unpaid invoices', ic:'🧾', d:'Subscription invoices still due across organizations', ok:() => !!(cloud && cloud.isSuper && !orgCtx()), r:wInvoices},
};
function defaultLayout(){
  const oc = orgCtx();
  if (oc && !oc.support && Array.isArray(oc.org.homeDefault) && oc.org.homeDefault.length) return oc.org.homeDefault;
  const ids = cloud && cloud.isSuper && !oc ? ['orgs', 'invoices', 'tasksToday', 'overdue', 'week', 'quick', 'note']
    : oc ? ZL.part('home', 'defaults').flat().concat(['tasksToday', 'team', 'quick', 'overdue', 'week'])
    : ['tasksToday', 'overdue', 'upcoming', 'week', 'quick', 'note'];
  return ids.map(id => ({id, size:WIDGETS[id] && WIDGETS[id].size === 'full' ? 'full' : 'half'}));
}
const LKEY = () => 'zl-home-' + ((cloud && cloud.uid) || 'local');
function homeLayout(){
  let L = Array.isArray(state.settings.homeLayout) && state.settings.homeLayout.length ? state.settings.homeLayout : null;
  if (!L) try { L = JSON.parse(localStorage.getItem(LKEY())); } catch(e){}
  if (!(L && L.length)){ L = defaultLayout().slice(); Object.entries(WIDGETS).forEach(([id, W]) => { if (W.ensure != null && W.ok() && !L.some(w => w.id === id)) L.splice(W.ensure, 0, {id, size:'full'}); }); }
  Object.entries(WIDGETS).forEach(([id, W]) => { if (W.pin && W.ok() && !L.some(w => w.id === id)) L = [{id, size:'full'}].concat(L); });   // e.g. approvals: shows itself while something waits for you
  return L.filter(w => WIDGETS[w.id] && WIDGETS[w.id].ok());
}
function saveLayout(L){
  try { localStorage.setItem(LKEY(), JSON.stringify(L)); } catch(e){}
  if (agendaOn() && (mode === 'local' || appReady)){ state.settings.homeLayout = L; save(); }
}
function renderHome(){
  const body = $('#homeBody'); if (!body) return;
  homeLoad();
  if (keepTyping(body)) return;
  const oc = orgCtx(), org = oc && !oc.support ? oc.org : null, color = org ? org.color || '#4338CA' : '#4338CA';
  const who = oc ? fullName(oc.me) : cloud && cloud.user ? (cloud.user.displayName || (cloud.user.email || '').split('@')[0]) : '';
  const L = homeLayout();
  body.innerHTML = `<div class="hbanner" style="background:linear-gradient(120deg, ${esc(color)}, color-mix(in srgb, ${esc(color)} 55%, #a855f7) 60%, color-mix(in srgb, ${esc(color)} 40%, #0f172a))">
      ${org && org.logo ? `<img src="${org.logo}" class="hlogo" alt="">` : `<span class="hlogo zl">${ZL_LOGO}</span>`}
      <div><b>${esc(org ? org.name : cloud && cloud.isSuper ? 'Zenvora Loop · Super Admin' : state.settings.name)}</b><span>${esc(greet())}${who ? ', ' + esc(firstName(who)) : ''} · ${esc(fmtLong(todayKey))}</span></div></div>
    <div class="hgridw"><div class="hwtop"><h2>Your day</h2><button id="hCustomize">✎ Customize</button></div>
      <div class="hwgrid">${L.map(w => { const W = WIDGETS[w.id]; let inner = ''; try { inner = W.r(); } catch(e){ inner = `<div class="stat">${esc(e.message)}</div>`; }
        return `<section class="hw ${w.size === 'full' ? 'full' : ''}" data-w="${w.id}"><h3><span class="ic">${W.ic}</span>${esc(W.t)}<span class="sp"></span></h3>${inner}</section>`; }).join('') || '<div class="empty">Your Home is empty. Click Customize to add widgets.</div>'}</div></div>`;
  numberTables(body);
  ZL.part('home', 'after');
}
/* widgets */
function wTeam(){
  const oc = orgCtx(), me = oc.me, mgr = home.team ? home.team.find(m => m.uid === me.reportsTo) : null;
  const mgrName = mgr ? fullName(mgr) : me.reportsToName || '', mgrTitle = mgr ? (mgr.title || ROLE_LABEL[mgr.role]) : me.reportsToTitle || '';
  const reportees = (home.team || []).filter(m => m.reportsTo === cloud.uid);
  return `<div class="hrow"><div class="havatar" style="width:44px;height:44px;font-size:18px;border-radius:12px;margin:0;background:${esc(oc.org.color || '#4338CA')}">${initial(fullName(me))}</div><div><b>${esc(fullName(me))}</b><span class="stat">${esc(me.title || ROLE_LABEL[oc.role] || '')}</span></div></div>
    ${mgrName ? `<div class="hh">Reporting manager</div><div class="hrow"><div class="uav">${initial(mgrName)}</div><div><b>${esc(mgrName)}</b><span class="stat">${esc(mgrTitle || '')}</span></div></div>` : ''}
    ${reportees.length ? `<div class="hh">Reportees</div>${reportees.map(m => `<div class="hrow"><div class="uav">${initial(fullName(m))}</div><div><b>${esc(fullName(m))}</b><span class="stat">${esc(m.title || ROLE_LABEL[m.role])}</span></div></div>`).join('')}` : ''}`;
}
const taskRow = (i, extra) => `<div class="trow" data-task="${esc(i.id)}"><i class="pdot p-${i.priority}"></i><b>${esc(i.title)}</b>${i.epic ? `<span class="epic">${esc(i.epic)}</span>` : ''}${extra || ''}</div>`;
function wTasksToday(){
  const T = myTasks().filter(i => i.day === todayKey && i.status !== 'done').sort((a, b) => ({high:0, med:1, low:2}[a.priority] - {high:0, med:1, low:2}[b.priority]));
  const done = myTasks().filter(i => i.status === 'done' && i.doneAt && dayKey(i.doneAt) === todayKey).length;
  return `<div class="stat" style="margin-bottom:6px">${T.length} open · ${done} done today</div>${T.slice(0, 8).map(i => taskRow(i)).join('') || '<div class="empty">Nothing left for today.</div>'}${T.length > 8 ? `<div class="stat">+${T.length - 8} more on the Planning Board</div>` : ''}`;
}
function wOverdue(){ const T = myTasks().filter(isPastDue); return T.slice(0, 8).map(i => taskRow(i, `<span class="badge">${esc(dur(Date.now() - i.remindAt))}</span>`)).join('') || '<div class="empty">Nothing overdue. 👏</div>'; }
function wUpcoming(){ const end = shiftDay(todayKey, 7), T = myTasks().filter(i => i.status !== 'done' && i.day > todayKey && i.day <= end).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  return T.slice(0, 8).map(i => taskRow(i, `<span class="dchip">${esc(relDay(i.day))}</span>`)).join('') || '<div class="empty">Nothing planned for the next 7 days.</div>'; }
function wWeek(){
  const ws = weekStart(todayKey), we = shiftDay(ws, 6), T = myTasks().filter(i => (i.plannedDay || i.day) >= ws && (i.plannedDay || i.day) <= we), d = T.filter(i => i.status === 'done').length;
  const days = [...Array(7)].map((_, k) => shiftDay(ws, k)), mx = Math.max(1, ...days.map(k => T.filter(i => doneDay(i) === k).length));
  return `<div style="display:flex;align-items:baseline;gap:8px"><span class="kv" style="font-size:26px;font-weight:780">${T.length ? Math.round(d / T.length * 100) : 0}%</span><span class="stat">${d} of ${T.length} tasks done this week</span></div>
    <div class="wbar"><i style="width:${T.length ? d / T.length * 100 : 0}%"></i></div>
    <div style="display:flex;gap:6px;align-items:flex-end;height:56px">${days.map(k => { const n = T.filter(i => doneDay(i) === k).length; return `<div title="${esc(fmtShort(k))}: ${n} done" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px"><div style="width:100%;border-radius:6px;height:${Math.max(4, n / mx * 40)}px;background:${k === todayKey ? 'var(--accent)' : 'color-mix(in srgb,var(--accent) 35%,var(--panel))'}"></div><span class="stat">${esc(parseDay(k).toLocaleDateString([], {weekday:'narrow'}))}</span></div>`; }).join('')}</div>`;
}
function wQuick(){
  const a = [];
  if (agendaOn()) a.push(['newtask', '➕', 'New task', 'Add to today\'s board']);
  ZL.part('home', 'quick').flat().forEach(q => a.push(q));       // [key, icon, title, sub, run]
  if (cloud && cloud.isSuper && !orgCtx()) a.push(['onboard', '🏢', 'Onboard organization', 'Add a new client']);
  home.qa = Object.fromEntries(a.filter(x => x[4]).map(x => [x[0], x[4]]));
  return `<div class="qa">${a.map(([k, i, t, s]) => `<button data-qa="${k}"><i>${i}</i><b>${t}</b><span>${s}</span></button>`).join('')}</div>`;
}
function wNote(){ return `<textarea class="hnote" id="homeNote" placeholder="Jot anything here: it is saved automatically.">${esc(state.settings.homeNote || (() => { try { return localStorage.getItem(LKEY() + '-note') || ''; } catch(e){ return ''; } })())}</textarea>`; }
function wOrgs(){
  const L = supers.orgs; if (!L) return '<div class="stat">Loading…</div>';
  const act = L.filter(o => o.status === 'active');
  return `<div class="hsum">${kpi('Active organizations', act.length, `${L.length - act.length} suspended / offboarded`)}${kpi('People', act.reduce((a, o) => a + (o.seats || 0), 0), 'active logins')}${kpi('Monthly subscriptions', inr(act.reduce((a, o) => a + (+(o.plan || {}).fee || 0), 0)), 'recurring')}</div>
    ${L.filter(isSupportOpen).map(o => `<div class="hrem"><span class="upill on">Support open</span><b>${esc(o.name)}</b><span class="stat">until ${esc(fmt(o.supportUntil))}</span></div>`).join('')}`;
}
function wInvoices(){
  const I = home.inv; if (!I) return '<div class="stat">Loading…</div>';
  return I.length ? `<div class="stat" style="margin-bottom:6px">${inr(paidSum(I))} outstanding</div>` + I.sort((a, b) => String(a.due).localeCompare(String(b.due))).map((i, n) => `<div class="trow"><span class="stat">${n + 1}</span><b>${esc(i.org.name)} · ${esc(monthName(i.period))}</b><span class="${i.due && i.due < todayKey ? 'neg' : 'stat'}">${i.due ? 'due ' + esc(fmtDM(i.due)) : ''}</span><span>${inr(i.amount)}</span></div>`).join('') : '<div class="empty">All invoices paid.</div>';
}
/* customize */
function openCustomize(){
  const L = homeLayout(), on = new Set(L.map(w => w.id)), avail = Object.keys(WIDGETS).filter(k => WIDGETS[k].ok());
  home.cz = L.map(w => Object.assign({}, w)).concat(avail.filter(k => !on.has(k)).map(id => ({id, size:'half', off:true})));
  $('#clOv').classList.add('on'); drawCustomize();
}
function drawCustomize(){
  const oc = orgCtx();
  $('#clOvBody').innerHTML = `<div class="ah"><h2 style="font-size:16px;margin:0">Customize your Home</h2><span class="sp"></span><button data-ovclose>Close</button></div>
    <p class="stat" style="margin:4px 0 0">Tick the widgets you want, put them in order, and choose half or full width.</p>
    <div class="cz">${home.cz.map((w, i) => { const W = WIDGETS[w.id]; return `<div class="czr ${w.off ? 'off' : ''}" data-cz="${i}"><input type="checkbox" data-czon${w.off ? '' : ' checked'}><div><b>${W.ic} ${esc(W.t)}</b><small>${esc(W.d)}</small></div>
      <select data-czsize><option value="half"${w.size !== 'full' ? ' selected' : ''}>Half</option><option value="full"${w.size === 'full' ? ' selected' : ''}>Full width</option></select><button data-czup title="Move up"${i ? '' : ' disabled'}>↑</button><button data-czdn title="Move down"${i < home.cz.length - 1 ? '' : ' disabled'}>↓</button></div>`; }).join('')}</div>
    <div class="btnrow"><button class="primary" id="czSave">Save</button><button id="czReset">Reset to default</button>
      ${oc && !oc.support && oc.role === 'orgadmin' ? '<span class="sp"></span><button id="czOrg" title="Everyone in your organization who hasn\'t customized their Home gets this layout">Save as default for my organization</button>' : ''}</div>`;
}
$('#clOv').addEventListener('click', async e => {
  if (!home.cz || !e.target.closest('.cz, #czSave, #czReset, #czOrg')) return;
  const r = e.target.closest('[data-cz]'), i = r ? +r.dataset.cz : -1;
  if (e.target.closest('[data-czup]') && i > 0){ [home.cz[i - 1], home.cz[i]] = [home.cz[i], home.cz[i - 1]]; return drawCustomize(); }
  if (e.target.closest('[data-czdn]') && i < home.cz.length - 1){ [home.cz[i + 1], home.cz[i]] = [home.cz[i], home.cz[i + 1]]; return drawCustomize(); }
  if (e.target.matches('[data-czon]')){ home.cz[i].off = !e.target.checked; r.classList.toggle('off', home.cz[i].off); return; }
  const out = () => home.cz.filter(w => !w.off).map(w => ({id:w.id, size:w.size || 'half'}));
  if (e.target.closest('#czSave')){ saveLayout(out()); $('#clOv').classList.remove('on'); home.cz = null; renderHome(); info('Home saved.'); }
  if (e.target.closest('#czReset')){ try { localStorage.removeItem(LKEY()); } catch(_){} if (agendaOn()){ delete state.settings.homeLayout; save(); } $('#clOv').classList.remove('on'); home.cz = null; renderHome(); info('Home reset to the default.'); }
  if (e.target.closest('#czOrg')){ try { await cloud.F.updateDoc(cloud.F.doc(cloud.fs, 'orgs', orgCtx().orgId), {homeDefault:out()}); saveLayout(out()); $('#clOv').classList.remove('on'); home.cz = null; renderHome(); info('Saved as the default Home for your organization.'); } catch(err){ info(errText(err)); } }
});
$('#clOv').addEventListener('change', e => { if (home.cz && e.target.matches('[data-czsize]')) home.cz[+e.target.closest('[data-cz]').dataset.cz].size = e.target.value; });
let noteTimer = null;
$('#homeBody').addEventListener('input', e => {
  if (e.target.id !== 'homeNote') return;
  clearTimeout(noteTimer); const v = e.target.value;
  noteTimer = setTimeout(() => { try { localStorage.setItem(LKEY() + '-note', v); } catch(_){} if (agendaOn()){ state.settings.homeNote = v; save(); } }, 600);
});
$('#homeBody').addEventListener('click', e => {
  if (e.target.closest('#hCustomize')) return openCustomize();
  for (const f of ZL.list) if (f.home && f.home.click && f.home.click(e)) return;      // a feature's widget handled it
  const tk = e.target.closest('[data-task]'); if (tk){ const it = byId(tk.dataset.task); if (it && ZL.linkOwner(it.link)) return openLink(it.link); return openModal(tk.dataset.task); }
  const qa = e.target.closest('[data-qa]');
  if (qa){ const k = qa.dataset.qa;
    if (k === 'newtask'){ setView('board'); setTimeout(() => $('#newTitle').focus(), 50); }
    if (home.qa && home.qa[k]) return home.qa[k]();
    if (k === 'onboard'){ setView('orgs'); $('#onboardBtn').click(); }
  }
});

/* ---------- organization logo ---------- */
function logoFromFile(file){
  return new Promise((res, rej) => {
    if (!file || !/^image\//.test(file.type)) return rej(custom('Choose an image file for the logo (PNG or JPG).'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const s = Math.min(1, 192 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/png')); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(custom('That image could not be read.')); };
    img.src = url;
  });
}
const ZL_LOGO = document.querySelector('.brand .logo') ? document.querySelector('.brand .logo').outerHTML : '';
function applyLogo(){
  const oc = orgCtx(), holder = $('#brandLogo'); if (!holder) return;
  const want = oc && oc.org.logo ? `<img class="logo orglogo" src="${oc.org.logo}" alt="">` : ZL_LOGO;
  if (holder.dataset.l !== want.length + ':' + (oc && oc.org.logo ? oc.org.logo.slice(-40) : 'zl')){ holder.innerHTML = want; holder.dataset.l = want.length + ':' + (oc && oc.org.logo ? oc.org.logo.slice(-40) : 'zl'); }
}

