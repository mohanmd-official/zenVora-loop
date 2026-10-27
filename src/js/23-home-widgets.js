/* ---------- Home: a page of widgets each person arranges for themselves ---------- */
const home = {ev:null, unsub:null, key:'', team:null, appts:null, pay:null, inv:null};
function homeLoad(){
  const oc = orgCtx(), F = cloud && cloud.F;
  const key = (oc ? oc.orgId + oc.role : cloud && cloud.isSuper ? 'super' : 'local') + todayKey;
  if (home.key === key) return; home.key = key; home.at = Date.now();
  if (home.unsub) try { home.unsub(); } catch(e){}
  Object.assign(home, {unsub:null, ev:null, team:null, appts:null, pay:null, inv:null, px:null});
  const again = () => { if (state.settings.view === 'home') renderSoon('home', () => { if (state.settings.view === 'home') renderHome(); }); };
  if (cloud && cloud.isSuper && !oc){
    supersLoad();
    Promise.all((supers.orgs || []).map(o => F.getDocs(F.query(F.collection(cloud.fs, 'orgs', o.id, 'invoices'), F.where('status', '==', 'due'))).then(qs => docsOf(qs).map(i => Object.assign(i, {org:o}))).catch(() => [])))
      .then(r => { home.inv = r.flat(); again(); });
    return;
  }
  if (!oc || oc.support) return;
  if (feat('attendance')) regLoad(true);
  if (feat('attendance')){
    const from = F.Timestamp.fromDate(parseDay(todayKey));
    home.unsub = F.onSnapshot(F.query(attCol(cloud.uid), F.where('at', '>=', from)), qs => { home.ev = qs.docs.map(d => { const x = d.data({serverTimestamps:'estimate'}); return {id:d.id, type:x.type, src:x.src, at:tsMs(x.at)}; }); again(); }, () => { home.ev = []; });
  }
  if (oc.role === 'orgadmin' || oc.role === 'manager') F.getDocs(F.collection(cloud.fs, 'orgs', oc.orgId, 'members')).then(qs => { home.team = docsOf(qs).map(m => Object.assign(m, {uid:m.id})).filter(m => !m.removed); again(); }).catch(() => { home.team = []; });
  if (feat('clinic') && (can('appointments') || can('treatments'))) F.getDocs(F.query(cCol('appointments'), F.where('date', '==', todayKey))).then(qs => { home.appts = docsOf(qs); again(); }).catch(() => { home.appts = []; });
  if (feat('clinic') && (can('billing') || can('reports'))) F.getDocs(F.query(cCol('payments'), F.where('date', '==', todayKey))).then(qs => { home.pay = docsOf(qs); again(); }).catch(() => { home.pay = []; });
}
function homeReset(){ if (home.unsub) try { home.unsub(); } catch(e){} Object.assign(home, {ev:null, unsub:null, key:'', team:null, appts:null, pay:null, inv:null}); }
const isClinicUser = () => !!(orgCtx() && feat('clinic'));
const myTasks = () => agendaOn() ? state.items.filter(isMine) : [];
// the widget catalogue: who can have it, and how it draws
const WIDGETS = {
  checkin:{t:'Check in / out', ic:'⏱', d:'Your attendance timer and Check in / Check out button', ok:() => !!(attSelf() && feat('attendance')), r:wCheckin},
  regs:{t:'Attendance approvals', ic:'🗂', d:'Regularization requests waiting for you', ok:() => !!(orgCtx() && !orgCtx().support && feat('attendance') && regPendingForMe().length), r:wRegs},
  mark:{t:'Mark attendance', ic:'🕘', d:'Check other staff in and out (attendance proxy)', ok:() => !!(orgCtx() && feat('attendance') && canMarkAtt()), r:wMark},
  team:{t:'My team', ic:'👥', d:'Your reporting manager and reportees', ok:() => !!(orgCtx() && !orgCtx().support), r:wTeam},
  reminders:{t:'Reminders', ic:'🔔', d:'Everything the clinic needs from you: summaries, documents, follow-ups, tallies', ok:() => isClinicUser() && remOn(), r:wReminders},
  appts:{t:"Today's appointments", ic:'📅', d:'Who is coming today and where they are in the queue', ok:() => isClinicUser() && !!(can('appointments') || can('treatments')), r:wAppts},
  clinicToday:{t:'Clinic today', ic:'💰', d:"Today's collections by mode and patients seen", ok:() => isClinicUser() && !!(can('billing') || can('reports')), r:wClinicToday},
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
    : oc ? ['checkin', 'mark', 'reminders', 'appts', 'clinicToday', 'tasksToday', 'team', 'quick', 'overdue', 'week']
    : ['tasksToday', 'overdue', 'upcoming', 'week', 'quick', 'note'];
  return ids.map(id => ({id, size:['reminders', 'appts', 'mark'].includes(id) ? 'full' : 'half'}));
}
const LKEY = () => 'zl-home-' + ((cloud && cloud.uid) || 'local');
function homeLayout(){
  let L = Array.isArray(state.settings.homeLayout) && state.settings.homeLayout.length ? state.settings.homeLayout : null;
  if (!L) try { L = JSON.parse(localStorage.getItem(LKEY())); } catch(e){}
  if (!(L && L.length)){ L = defaultLayout().slice(); if (WIDGETS.mark.ok() && !L.some(w => w.id === 'mark')) L.splice(1, 0, {id:'mark', size:'full'}); }
  if (WIDGETS.regs.ok() && !L.some(w => w.id === 'regs')) L = [{id:'regs', size:'full'}].concat(L);   // shows itself while something waits for you
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
  attTick();
}
/* widgets */
function wCheckin(){
  const ss = sessionsOf(home.ev || []).filter(s => dayKey(s.in) === todayKey), open = ss.find(s => !s.out), done = ss.filter(s => s.out).reduce((a, s) => a + s.out - s.in, 0);
  return `<div class="hprof" style="padding:0">
    <div class="hstat ${open ? 'in' : ''}" style="margin-top:0">${open ? `Checked in since ${esc(timeOnly(open.in))}` : ss.length ? `Checked out at ${esc(timeOnly(ss[ss.length - 1].out))}` : 'Not checked in yet'}</div>
    <div class="htimer" id="attTimer" data-done="${done}" data-open="${open ? open.in : ''}">${hms(done + (open ? Date.now() - open.in : 0)).split(':').map(x => `<span>${x}</span>`).join('<i>:</i>')}</div>
    <button class="pbtn ${open ? 'out' : 'in'}" id="punchBtn" data-t="${open ? 'out' : 'in'}">${open ? 'Check out' : ss.length ? 'Check in again' : 'Check in'}</button>
    ${ss.length ? `<div class="psess" style="justify-content:center">${ss.map(s => `<span>${esc(timeOnly(s.in))} → ${s.out ? esc(timeOnly(s.out)) : 'now'}</span>`).join('')}</div>` : ''}</div>`;
}
function wMark(){
  if (!home.px){ if (!home.pxBusy) pxLoad(); return '<div class="empty">Loading team…</div>'; }
  return markList(home.px.accts, home.px.ev);
}
async function pxLoad(){
  const {F, fs} = cloud, oc = orgCtx(); home.pxBusy = true;
  try {
    const accs = docsOf(await F.getDocs(F.collection(fs, 'orgs', oc.orgId, 'members'))).map(a => Object.assign(a, {uid:a.id})).filter(a => !a.removed && a.active !== false && a.role !== 'orgadmin').sort((a, b) => fullName(a).localeCompare(fullName(b)));
    const from = F.Timestamp.fromDate(parseDay(todayKey)), ev = {};
    await Promise.all(accs.map(async a => { const qs = await F.getDocs(F.query(attCol(a.uid), F.where('at', '>=', from))); ev[a.uid] = qs.docs.map(d => { const x = d.data({serverTimestamps:'estimate'}); return {id:d.id, type:x.type, src:x.src, at:tsMs(x.at)}; }); }));
    home.px = {accts:accs, ev};
  } catch(e){ home.px = {accts:[], ev:{}}; info('Attendance could not load: ' + errText(e)); }
  home.pxBusy = false; if (state.settings.view === 'home') renderSoon('home', () => { if (state.settings.view === 'home') renderHome(); });
}
function wTeam(){
  const oc = orgCtx(), me = oc.me, mgr = home.team ? home.team.find(m => m.uid === me.reportsTo) : null;
  const mgrName = mgr ? fullName(mgr) : me.reportsToName || '', mgrTitle = mgr ? (mgr.title || ROLE_LABEL[mgr.role]) : me.reportsToTitle || '';
  const reportees = (home.team || []).filter(m => m.reportsTo === cloud.uid);
  return `<div class="hrow"><div class="havatar" style="width:44px;height:44px;font-size:18px;border-radius:12px;margin:0;background:${esc(oc.org.color || '#4338CA')}">${initial(fullName(me))}</div><div><b>${esc(fullName(me))}</b><span class="stat">${esc(me.title || ROLE_LABEL[oc.role] || '')}</span></div></div>
    ${mgrName ? `<div class="hh">Reporting manager</div><div class="hrow"><div class="uav">${initial(mgrName)}</div><div><b>${esc(mgrName)}</b><span class="stat">${esc(mgrTitle || '')}</span></div></div>` : ''}
    ${reportees.length ? `<div class="hh">Reportees</div>${reportees.map(m => `<div class="hrow"><div class="uav">${initial(fullName(m))}</div><div><b>${esc(fullName(m))}</b><span class="stat">${esc(m.title || ROLE_LABEL[m.role])}</span></div></div>`).join('')}` : ''}`;
}
const remList = list => list.map(r => `<div class="hrem" data-rem="${esc(r.id)}"><span class="epic">${esc(r.epic)}</span><b>${esc(r.title)}</b>${r.link ? '<button>Open</button>' : ''}</div>`).join('') || '<div class="empty">Nothing waiting on you. 🎉</div>';
function wReminders(){ otWatch(); const O = otOpen(); return (O.length ? `<div class="stat" style="margin:0 0 6px">Organization reminders: closing one closes it for everyone</div>${O.slice(0, 12).map(otRow).join('')}${O.length > 12 ? `<div class="stat">+ ${O.length - 12} more on the Planning Board</div>` : ''}` : '')
  + ((cl.reminders || []).length ? `<div class="stat" style="margin:10px 0 6px">Yours</div>` + remList(cl.reminders) : O.length ? '' : remList([])); }
function wAppts(){
  const A = (home.appts || []).filter(a => a.status !== 'cancelled').sort((a, b) => String(a.time).localeCompare(String(b.time)));
  if (home.appts === null) return '<div class="stat">Loading…</div>';
  const c = s => A.filter(a => a.status === s).length;
  return `<div class="fchips" style="margin-bottom:8px">${['scheduled', 'waiting', 'engaged', 'billing', 'completed', 'missed'].map(s => `<span class="ast ${s}">${ASTATUS[s]} ${c(s)}</span>`).join('')}</div>`
    + (A.map((a, i) => `<div class="hrem" data-hopen="${esc(a.patientId)}"><span class="stat" style="width:18px">${i + 1}</span><span class="ast ${a.status}">${ASTATUS[a.status]}</span><b>${esc(hm12(a.time))} · ${esc(a.patientName)}</b><span class="stat">${esc(dName(a.doctorId))}${a.reason ? ' · ' + esc(a.reason) : ''}</span></div>`).join('') || '<div class="empty">No appointments today.</div>');
}
function wClinicToday(){
  const P = home.pay || [], tot = paidSum(P), A = (home.appts || []);
  return `<div class="hsum">${kpi('Collected today', inr(tot), plural(P.length, 'payment'))}${kpi('Patients seen', A.filter(a => a.status === 'completed').length, `${A.filter(a => ['waiting', 'engaged', 'billing'].includes(a.status)).length} in the clinic now`)}</div>
    <div class="fchips" style="margin-top:8px">${PMODES.map(([m, l]) => `<span class="fchip">${l} ${inr(paidSum(P.filter(x => x.mode === m)))}</span>`).join('')}</div>`;
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
  if (isClinicUser() && canW('patients')) a.push(['newpatient', '🧑', 'New patient', 'Register a patient']);
  if (isClinicUser() && canW('appointments')) a.push(['book', '📅', 'Book appointment', 'Schedule a visit']);
  if (isClinicUser() && (canW('tally') || canW('accounts'))) a.push(['tally', '🧮', 'Daily tally', 'Count the cash drawer']);
  if (isClinicUser() && (canW('petty') || canW('accounts'))) a.push(['petty', '👛', 'Petty cash', 'Record a spend']);
  if (isClinicUser() && (can('reports'))) a.push(['reports', '📊', 'Reports', 'Collections & more']);
  if (cloud && cloud.isSuper && !orgCtx()) a.push(['onboard', '🏢', 'Onboard organization', 'Add a new client']);
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
  cl.cz = L.map(w => Object.assign({}, w)).concat(avail.filter(k => !on.has(k)).map(id => ({id, size:'half', off:true})));
  $('#clOv').classList.add('on'); drawCustomize();
}
function drawCustomize(){
  const oc = orgCtx();
  $('#clOvBody').innerHTML = `<div class="ah"><h2 style="font-size:16px;margin:0">Customize your Home</h2><span class="sp"></span><button data-ovclose>Close</button></div>
    <p class="stat" style="margin:4px 0 0">Tick the widgets you want, put them in order, and choose half or full width.</p>
    <div class="cz">${cl.cz.map((w, i) => { const W = WIDGETS[w.id]; return `<div class="czr ${w.off ? 'off' : ''}" data-cz="${i}"><input type="checkbox" data-czon${w.off ? '' : ' checked'}><div><b>${W.ic} ${esc(W.t)}</b><small>${esc(W.d)}</small></div>
      <select data-czsize><option value="half"${w.size !== 'full' ? ' selected' : ''}>Half</option><option value="full"${w.size === 'full' ? ' selected' : ''}>Full width</option></select><button data-czup title="Move up"${i ? '' : ' disabled'}>↑</button><button data-czdn title="Move down"${i < cl.cz.length - 1 ? '' : ' disabled'}>↓</button></div>`; }).join('')}</div>
    <div class="btnrow"><button class="primary" id="czSave">Save</button><button id="czReset">Reset to default</button>
      ${oc && !oc.support && oc.role === 'orgadmin' ? '<span class="sp"></span><button id="czOrg" title="Everyone in your organization who hasn\'t customized their Home gets this layout">Save as default for my organization</button>' : ''}</div>`;
}
$('#clOv').addEventListener('click', async e => {
  if (!cl.cz || !e.target.closest('.cz, #czSave, #czReset, #czOrg')) return;
  const r = e.target.closest('[data-cz]'), i = r ? +r.dataset.cz : -1;
  if (e.target.closest('[data-czup]') && i > 0){ [cl.cz[i - 1], cl.cz[i]] = [cl.cz[i], cl.cz[i - 1]]; return drawCustomize(); }
  if (e.target.closest('[data-czdn]') && i < cl.cz.length - 1){ [cl.cz[i + 1], cl.cz[i]] = [cl.cz[i], cl.cz[i + 1]]; return drawCustomize(); }
  if (e.target.matches('[data-czon]')){ cl.cz[i].off = !e.target.checked; r.classList.toggle('off', cl.cz[i].off); return; }
  const out = () => cl.cz.filter(w => !w.off).map(w => ({id:w.id, size:w.size || 'half'}));
  if (e.target.closest('#czSave')){ saveLayout(out()); $('#clOv').classList.remove('on'); cl.cz = null; renderHome(); info('Home saved.'); }
  if (e.target.closest('#czReset')){ try { localStorage.removeItem(LKEY()); } catch(_){} if (agendaOn()){ delete state.settings.homeLayout; save(); } $('#clOv').classList.remove('on'); cl.cz = null; renderHome(); info('Home reset to the default.'); }
  if (e.target.closest('#czOrg')){ try { await cloud.F.updateDoc(cloud.F.doc(cloud.fs, 'orgs', orgCtx().orgId), {homeDefault:out()}); saveLayout(out()); $('#clOv').classList.remove('on'); cl.cz = null; renderHome(); info('Saved as the default Home for your organization.'); } catch(err){ info(errText(err)); } }
});
$('#clOv').addEventListener('change', e => { if (cl.cz && e.target.matches('[data-czsize]')) cl.cz[+e.target.closest('[data-cz]').dataset.cz].size = e.target.value; });
let noteTimer = null;
$('#homeBody').addEventListener('input', e => {
  if (e.target.id !== 'homeNote') return;
  clearTimeout(noteTimer); const v = e.target.value;
  noteTimer = setTimeout(() => { try { localStorage.setItem(LKEY() + '-note', v); } catch(_){} if (agendaOn()){ state.settings.homeNote = v; save(); } }, 600);
});
$('#homeBody').addEventListener('click', e => {
  if (e.target.closest('#hCustomize')) return openCustomize();
  const pb = e.target.closest('#punchBtn'); if (pb) return punch(pb.dataset.t, pb);
  const rm = e.target.closest('[data-rem]'); if (rm){ const r = (cl.reminders || []).find(x => x.id === rm.dataset.rem); if (r && r.link) openLink(r.link); return; }
  const ho = e.target.closest('[data-hopen]'); if (ho) return openLink({pid:ho.dataset.hopen, tab:'appointments'});
  const tk = e.target.closest('[data-task]'); if (tk){ const it = byId(tk.dataset.task); if (it && it.link && orgCtx()) return openLink(it.link); return openModal(tk.dataset.task); }
  const qa = e.target.closest('[data-qa]');
  if (qa){ const k = qa.dataset.qa;
    if (k === 'newtask'){ setView('board'); setTimeout(() => $('#newTitle').focus(), 50); }
    if (k === 'newpatient'){ setView('clinic'); cl.sec = 'patients'; clOpenPatient(null); }
    if (k === 'book'){ setView('clinic'); cl.sec = 'appointments'; renderClinic(); clOpenBook({}); }
    if (k === 'tally'){ openLink({sec:'accounts', tab:'tally'}); }
    if (k === 'petty'){ openLink({sec:'accounts', tab:'petty'}); }
    if (k === 'reports'){ setView('clinic'); cl.sec = 'reports'; renderClinic(); }
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

