/* ---------- Payroll on Home: Check in / out, Mark attendance (proxy), approvals ---------- */
const attHome = {ev:null, unsub:null, px:null, pxBusy:false};
function attHomeReset(){ if (attHome.unsub) try { attHome.unsub(); } catch(e){} Object.assign(attHome, {ev:null, unsub:null, px:null, pxBusy:false}); }
function attHomeLoad(again){
  attHomeReset(); if (!feat('attendance')) return;
  const F = cloud.F; regLoad(true);
  const from = F.Timestamp.fromDate(parseDay(todayKey));
  attHome.unsub = F.onSnapshot(F.query(attCol(cloud.uid), F.where('at', '>=', from)), qs => { attHome.ev = qs.docs.map(d => { const x = d.data({serverTimestamps:'estimate'}); return {id:d.id, type:x.type, src:x.src, at:tsMs(x.at)}; }); again(); }, () => { attHome.ev = []; });
}
function wCheckin(){
  const ss = sessionsOf(attHome.ev || []).filter(s => dayKey(s.in) === todayKey), open = ss.find(s => !s.out), done = ss.filter(s => s.out).reduce((a, s) => a + s.out - s.in, 0);
  return `<div class="hprof" style="padding:0">
    <div class="hstat ${open ? 'in' : ''}" style="margin-top:0">${open ? `Checked in since ${esc(timeOnly(open.in))}` : ss.length ? `Checked out at ${esc(timeOnly(ss[ss.length - 1].out))}` : 'Not checked in yet'}</div>
    <div class="htimer" id="attTimer" data-done="${done}" data-open="${open ? open.in : ''}">${hms(done + (open ? Date.now() - open.in : 0)).split(':').map(x => `<span>${x}</span>`).join('<i>:</i>')}</div>
    <button class="pbtn ${open ? 'out' : 'in'}" id="punchBtn" data-t="${open ? 'out' : 'in'}">${open ? 'Check out' : ss.length ? 'Check in again' : 'Check in'}</button>
    ${ss.length ? `<div class="psess" style="justify-content:center">${ss.map(s => `<span>${esc(timeOnly(s.in))} → ${s.out ? esc(timeOnly(s.out)) : 'now'}</span>`).join('')}</div>` : ''}</div>`;
}
function wMark(){
  if (!attHome.px){ if (!attHome.pxBusy) pxLoad(); return '<div class="empty">Loading team…</div>'; }
  return markList(attHome.px.accts, attHome.px.ev);
}
async function pxLoad(){
  const {F, fs} = cloud, oc = orgCtx(); attHome.pxBusy = true;
  try {
    const accs = docsOf(await F.getDocs(F.collection(fs, 'orgs', oc.orgId, 'members'))).map(a => Object.assign(a, {uid:a.id})).filter(a => !a.removed && a.active !== false && a.role !== 'orgadmin').sort((a, b) => fullName(a).localeCompare(fullName(b)));
    const from = F.Timestamp.fromDate(parseDay(todayKey)), ev = {};
    await Promise.all(accs.map(async a => { const qs = await F.getDocs(F.query(attCol(a.uid), F.where('at', '>=', from))); ev[a.uid] = qs.docs.map(d => { const x = d.data({serverTimestamps:'estimate'}); return {id:d.id, type:x.type, src:x.src, at:tsMs(x.at)}; }); }));
    attHome.px = {accts:accs, ev};
  } catch(e){ attHome.px = {accts:[], ev:{}}; info('Attendance could not load: ' + errText(e)); }
  attHome.pxBusy = false; if (state.settings.view === 'home') renderSoon('home', () => { if (state.settings.view === 'home') renderHome(); });
}
