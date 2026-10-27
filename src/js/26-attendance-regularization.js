/* ---------- Attendance regularization ----------
   Forgot to check in or out? The person (or a Proxy attendance person on their behalf) asks for the missing time;
   their immediate reporting manager approves it (the Account Manager if they report to no one). Only on approval
   is the entry added to their attendance, stamped with the requested time. */
const regs = {list:null, key:'', busy:false};
const RST = {pending:['Waiting for approval', 'pend'], approved:['Approved', 'on'], rejected:['Not approved', 'gone']};
const regCol = () => cloud.F.collection(cloud.fs, 'orgs', orgCtx().orgId, 'attRegs');
const regRef = id => cloud.F.doc(cloud.fs, 'orgs', orgCtx().orgId, 'attRegs', id);
function regLoad(force){
  const oc = orgCtx(); if (!oc || oc.support || !feat('attendance') || regs.busy) return;
  const key = oc.orgId + '|' + cloud.uid; if (!force && regs.key === key && regs.list) return;
  regs.key = key; regs.busy = true;
  const {F} = cloud, W = F.where, q = (...w) => F.getDocs(F.query(regCol(), ...w)).then(docsOf).catch(() => []);
  const jobs = oc.role === 'orgadmin' ? [F.getDocs(regCol()).then(docsOf).catch(() => [])] : [q(W('uid', '==', cloud.uid)), q(W('by', '==', cloud.uid)), q(W('approver', '==', cloud.uid))];
  Promise.all(jobs).then(r => {
    const m = new Map(); r.flat().forEach(x => m.set(x.id, x)); regs.list = [...m.values()].sort((a, b) => (b.at || 0) - (a.at || 0)); regs.busy = false;
    const v = state.settings.view;
    if (v === 'home') renderSoon('home', () => { if (state.settings.view === 'home') renderHome(); });
    if (v === 'attendance' || (v === 'clinic' && cl.sec === 'attendance')) renderAttendance();
  });
}
const regPendingForMe = () => (regs.list || []).filter(r => r.status === 'pending' && r.uid !== cloud.uid && (r.approver === cloud.uid || (orgCtx() && orgCtx().role === 'orgadmin')));
const regApprover = () => !!(orgCtx() && (orgCtx().role === 'orgadmin' || (regs.list || []).some(r => r.approver === cloud.uid)));
function regForm(people){
  return `<div class="box"><h3>Regularize attendance <span class="sub">forgot to check in or out? Ask for the missing time: the reporting manager approves it</span></h3>
    <form class="aform" id="attRegForm" novalidate>
      ${people ? `<label class="grow">Person<select id="rgWho">${people.map(a => `<option value="${esc(a.uid)}"${a.uid === cloud.uid ? ' selected' : ''}>${esc(fullName(a))}${a.uid === cloud.uid ? ' (you)' : ''}</option>`).join('')}</select></label>` : ''}
      <label>Date<input type="date" id="rgDate" value="${shiftDay(todayKey, -1)}" min="${shiftDay(todayKey, -31)}" max="${todayKey}"></label>
      <label>Check-in<input type="time" id="rgIn"></label><label>Check-out<input type="time" id="rgOut"></label>
      <label class="grow">Reason *<input id="rgWhy" placeholder="e.g. Forgot to check out, left at 6 PM"></label>
      <button class="primary" type="submit">Send for approval</button></form>
    <p class="stat" style="margin:6px 0 0">Fill only what was missed: just Check-out if they forgot to check out, just Check-in if they forgot to check in, or both.</p></div>`;
}
function regTable(L, mode){
  if (!L.length) return '';
  const act = x => mode === 'approve' && x.status === 'pending' ? `<button class="primary" data-regok="${esc(x.id)}">Approve</button> <button data-regno="${esc(x.id)}">Reject</button>`
    : `<span class="upill ${RST[x.status][1]}">${RST[x.status][0]}</span>${x.status !== 'pending' && x.decidedName ? `<span class="sub2">by ${esc(x.decidedName)}</span>` : ''}${mode !== 'approve' && x.status === 'pending' && x.by === cloud.uid ? ` <button class="danger" data-regdel="${esc(x.id)}" title="Withdraw">✕</button>` : ''}`;
  return `<div class="awrap"><table class="atbl"><thead><tr><th>Person</th><th>Date</th><th>Check-in</th><th>Check-out</th><th>Reason</th><th>Asked by</th><th>${mode === 'approve' ? '' : 'Status'}</th></tr></thead><tbody>
    ${L.map(x => `<tr><td><b>${esc(x.name || '')}</b></td><td>${esc(fmtShort(x.date))}</td><td>${x.inTime ? esc(hm12(x.inTime)) : '—'}</td><td>${x.outTime ? esc(hm12(x.outTime)) : '—'}</td><td class="stat">${esc(x.reason || '')}</td><td class="stat">${esc(x.by === x.uid ? 'self' : x.byName || '')}</td><td style="white-space:nowrap">${act(x)}</td></tr>`).join('')}
    </tbody></table></div>`;
}
function regMineBox(){
  regLoad();
  const L = (regs.list || []).filter(r => r.uid === cloud.uid);
  return regForm(null) + (L.length ? `<h3 style="font-size:13px;margin:12px 0 6px">My regularization requests</h3>` + regTable(L.slice(0, 20), 'mine') : '');
}
function regProxyBox(people){
  regLoad();
  const L = (regs.list || []).filter(r => r.by === cloud.uid && r.uid !== cloud.uid);
  return regForm(people) + (L.length ? `<h3 style="font-size:13px;margin:12px 0 6px">Requests you sent for others</h3>` + regTable(L.slice(0, 30), 'mine') : '');
}
function attApprovals(){
  regLoad();
  if (!regs.list) return '<div class="empty">Loading…</div>';
  const P = regPendingForMe(), D = regs.list.filter(r => r.status !== 'pending' && (r.approver === cloud.uid || orgCtx().role === 'orgadmin')).slice(0, 20);
  return `<p class="stat" style="margin:0 0 8px">Regularization requests from the people who report to you. Approving adds the time to their attendance.</p>`
    + (P.length ? regTable(P, 'approve') : '<div class="empty">Nothing waiting for your approval. 👏</div>')
    + (D.length ? `<h3 style="font-size:13px;margin:16px 0 6px">Decided</h3>` + regTable(D, 'done') : '');
}
async function regSubmit(){
  const {F, fs} = cloud, oc = orgCtx(), who = $('#rgWho') ? $('#rgWho').value : cloud.uid, d = $('#rgDate').value, i = $('#rgIn').value, o = $('#rgOut').value, why = $('#rgWhy').value.trim();
  if (!d) return info('Pick the date.'); if (!i && !o) return info('Enter the check-in or check-out time that was missed.'); if (!why) return info('Add a reason.');
  const at = t => { const x = parseDay(d); const [hh, mm] = t.split(':').map(Number); x.setHours(hh, mm, 0, 0); return x.getTime(); };
  if ((i && at(i) > Date.now()) || (o && at(o) > Date.now())) return info("That time hasn't happened yet.");
  if (i && o && at(o) <= at(i)) return info('Check-out must be after check-in.');
  try {
    const m = who === cloud.uid ? oc.me : (await F.getDoc(F.doc(fs, 'orgs', oc.orgId, 'members', who))).data() || {};
    const approver = m.reportsTo || oc.org.adminUid || '';
    if (!approver || approver === who) return info('This person has no reporting manager to approve it. Ask the Account Manager to set "Reports to".');
    const r = {uid:who, name:fullName(m) || '', by:cloud.uid, byName:fullName(oc.me) || '', date:d, inTime:i || '', outTime:o || '', inAt:i ? at(i) : 0, outAt:o ? at(o) : 0, reason:why, status:'pending', approver, approverName:m.reportsToName || 'Account Manager', at:Date.now()};
    await F.addDoc(regCol(), r);
    info(`Sent to ${r.approverName} for approval.`); ['rgIn', 'rgOut', 'rgWhy'].forEach(id => { const e = $('#' + id); if (e) e.value = ''; });
    document.activeElement.blur(); regLoad(true);
  } catch(e){ info('Could not send: ' + errText(e)); }
}
async function regDecide(id, ok){
  const r = (regs.list || []).find(x => x.id === id); if (!r) return;
  const {F, fs} = cloud, b = F.writeBatch(fs), oc = orgCtx();
  b.update(regRef(id), {status:ok ? 'approved' : 'rejected', decidedBy:cloud.uid, decidedName:fullName(oc.me) || '', decidedAt:Date.now()});
  if (ok){
    const ev = (type, ms) => b.set(F.doc(fs, 'orgs', oc.orgId, 'attendance', r.uid, 'events', id + '-' + type), {type, at:F.Timestamp.fromDate(new Date(ms)), src:'reg', reg:id, by:cloud.uid});
    if (r.inAt) ev('in', r.inAt); if (r.outAt) ev('out', r.outAt);
  }
  try { await b.commit(); info(ok ? `Approved: ${r.name}'s attendance for ${fmtShort(r.date)} is updated.` : 'Request not approved.'); att.key = ''; home.px = null; regLoad(true); }
  catch(e){ info('Could not save: ' + errText(e)); }
}
document.addEventListener('click', async e => {
  const a = e.target.closest('[data-regok],[data-regno],[data-regdel],[data-regday]'); if (!a) return;
  if (a.dataset.regok) return regDecide(a.dataset.regok, true);
  if (a.dataset.regno) return regDecide(a.dataset.regno, false);
  if (a.dataset.regdel){ if (!confirm('Withdraw this request?')) return; try { await cloud.F.deleteDoc(regRef(a.dataset.regdel)); info('Withdrawn.'); regLoad(true); } catch(err){ info(errText(err)); } return; }
  if (a.dataset.regday){ const f = $('#rgDate'); if (f){ f.value = a.dataset.regday; f.closest('.box').scrollIntoView({behavior:'smooth', block:'center'}); $('#rgOut').focus(); } }
});
document.addEventListener('submit', e => { if (e.target.id === 'attRegForm'){ e.preventDefault(); e.stopPropagation(); regSubmit(); } }, true);
function wRegs(){ const P = regPendingForMe(); return regTable(P, 'approve'); }

