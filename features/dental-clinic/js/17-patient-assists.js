/* ---------- Patient assists: who assisted on each treatment; the treating doctor (or the Chief doctor) approves for incentive ----------
   One record per assistant per treatment (id t-<treatmentId>-<uid>), so the same contribution can never be counted twice.
   Records are created when the treatments are saved at the visit ("Assisted by" per treatment), or logged by staff themselves.
   Status: pending → approved | rejected; an Owner / Account Manager may add or correct any record for any date (reason required,
   kept in `history`; an approved record goes back to pending for re-approval) and void one (never deleted).
   Incentive amounts live only in assistPay (Owner, Account Manager, Chief doctor): staff see status and eligibility, never amounts. */
const AS_ST = {pending:['Pending approval', 'pend'], approved:['Approved for incentive', 'on'], rejected:['Rejected for incentive', 'gone'], void:['Voided', 'gone']};
const AS_ELIG = {pending:'Pending', approved:'Eligible', rejected:'Not eligible', void:'—'};
const asApprover = () => canW('assistApprove');
const asOwner = () => { const oc = orgCtx(); return !!(oc && !oc.support && isAdminRole(oc.role)); };
const asMoneySee = () => { const oc = orgCtx(); return !!(oc && (asOwner() || isOwnerLike() || oc.support)); };   // incentive amounts: Owner, Account Manager, Chief doctor
const asTreating = () => cl.doctors.some(d => d.memberUid && d.memberUid === cloud.uid);                                      // a doctor linked to this login
const approverOf = doctorId => (cl.doctors.find(d => d.id === doctorId) || {}).memberUid || '';
function asTabs(){ return [['mine', 'My assists', !!(orgCtx() && !orgCtx().support)], ['approve', asOwner() ? 'All assists' : 'Approvals', asApprover() || asOwner() || asTreating()], ['incentives', 'Incentives', asMoneySee()]].filter(t => t[2]); }
// people who can be picked as assistants: the organization directory (names only)
async function asStaff(){
  if (cl.dir) return cl.dir;
  if (typeof team !== 'undefined' && team.dir && team.dir.length) return (cl.dir = team.dir);
  try { cl.dir = docsOf(await cloud.F.getDocs(cloud.F.collection(cloud.fs, 'orgs', orgCtx().orgId, 'dir'))).map(p => Object.assign({uid:p.id}, p)).filter(p => p.active !== false); } catch(e){ cl.dir = []; }
  return cl.dir;
}
const asHist = (x, change, reason) => (x.history || []).concat([{at:Date.now(), by:cloud.user.email || '', change, reason:reason || '', before:{uid:x.uid || '', name:x.name || '', typeName:x.typeName || '', date:x.date || '', doctorId:x.doctorId || '', status:x.status || ''}}]).slice(-30);
const asAudit = (x, change, reason, after) => cloud.F.addDoc(cloud.F.collection(cloud.fs, 'orgs', orgCtx().orgId, 'audit'), {at:Date.now(), by:cloud.user.email || '', byName:fullName(orgCtx().me) || '', type:'assist', target:{id:x.id || '', patientId:x.patientId || '', treatmentId:x.treatmentId || '', appointmentId:x.appointmentId || '', patientName:x.patientName || ''}, before:{uid:x.uid || '', name:x.name || '', typeName:x.typeName || '', date:x.date || '', status:x.status || ''}, after:after || null, change, reason:reason || ''}).catch(() => {});
// keep the patient list's "Assisted by" column up to date (names only)
const asPatientNames = (pid, names, date) => pid && names.length ? cloud.F.updateDoc(cDoc('patients', pid), {assistedBy:{names, date}}).catch(() => {}) : null;
/* at the visit: the assistants picked for each saved treatment. Adds missing records, voids pending ones that were unticked
   (an approved / rejected one stays: only an Owner or Account Manager may change it) */
async function syncTreatmentAssists(a, saved){
  const {F} = cloud, by = cloud.user.email || '', byName = fullName(orgCtx().me) || by, dir = await asStaff(), names = new Set();
  for (const {tid, t, uids} of saved){
    let have = [];
    try { have = docsOf(await F.getDocs(F.query(cCol('assists'), F.where('treatmentId', '==', tid)))); } catch(e){}
    for (const uid of uids){
      const p = dir.find(x => x.uid === uid) || {name:''}; names.add(p.name);
      if (have.some(x => x.uid === uid && x.status !== 'void')) continue;
      const vd = have.some(x => x.uid === uid && x.status === 'void');                       // a voided record keeps its id; a re-pick gets a new one
      await F.setDoc(cDoc('assists', `t-${tid}-${uid}` + (vd ? '-r' + Date.now().toString(36) : '')), {uid, name:p.name || '', date:t.date || a.date, patientId:a.patientId, patientName:a.patientName, appointmentId:a.id, treatmentId:tid, typeId:t.typeId || 'other', typeName:t.typeName || '', doctorId:t.doctorId || '', approverUid:approverOf(t.doctorId), note:'', status:'pending', addedBy:by, addedByName:byName, at:Date.now(), history:[]});
    }
    for (const x of have.filter(x => x.status === 'pending' && !uids.includes(x.uid)))
      await F.updateDoc(cDoc('assists', x.id), {status:'void', history:asHist(x, 'removed at the visit', '')}).catch(() => {});
  }
  await asPatientNames(a.patientId, [...names].filter(Boolean), a.date);
}
const asState = () => cl.asst || (cl.asst = {tab:'', month:todayKey.slice(0, 7), person:'', f:{st:'pending', from:shiftDay(todayKey, -60), to:todayKey, who:'', ty:'', q:''}});
function asLoad(){
  const {F} = cloud, A = asState();
  const key = orgCtx().orgId + '|' + A.tab + '|' + A.month + '|' + A.f.from;
  if (cl.asKey === key) return; cl.asKey = key; A.d = null;
  const W = F.where, q = (c, ...w) => F.getDocs(F.query(cCol(c), ...w)).then(docsOf), jobs = {};
  if (A.tab === 'mine'){ jobs.mine = q('assists', W('uid', '==', cloud.uid)); if (can('appointments') || can('treatments')) jobs.appts = q('appointments', W('date', '>=', shiftDay(todayKey, -7)), W('date', '<=', todayKey)).catch(() => []); }
  if (A.tab === 'approve'){ jobs.all = asApprover() || asOwner() ? q('assists', W('date', '>=', A.f.from)) : q('assists', W('approverUid', '==', cloud.uid)); jobs.dir = asStaff(); if (asOwner()) jobs.pats = can('patients') ? Promise.resolve(cl.allP || []) : Promise.resolve([]); }
  if (A.tab === 'incentives'){ jobs.all = q('assists', W('status', '==', 'approved')); jobs.pay = q('assistPay'); }
  const ks = Object.keys(jobs);
  Promise.all(ks.map(k => jobs[k])).then(v => { if (cl.asKey !== key) return; const d = {}; ks.forEach((k, i) => d[k] = v[i]); A.d = d; if (cl.sec === 'assists') renderClinic(); })
    .catch(e => { if (cl.asKey === key){ A.d = {err:errText(e)}; if (cl.sec === 'assists') renderClinic(); } });
}
function clAssists(){
  const A = asState(), tabs = asTabs();
  if (!tabs.some(t => t[0] === A.tab)) A.tab = tabs.length ? tabs[0][0] : '';
  asLoad();
  const head = `<div class="clhead"><h2>Patient assists</h2>${A.tab === 'incentives' ? `<div class="mnav"><button data-asm="-1">‹</button><b>${esc(monthLabel(A.month))}</b><button data-asm="1"${A.month >= todayKey.slice(0, 7) ? ' disabled' : ''}>›</button></div>` : ''}</div>
    ${tabs.length > 1 ? `<div class="htabs">${tabs.map(([k, l]) => `<button data-astab="${k}" class="${A.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}`;
  const d = A.d; if (!d) return head + '<div class="empty">Loading…</div>'; if (d.err) return head + `<div class="auth-err">${esc(d.err)}</div>`;
  return head + ({mine:asMine, approve:asApprove, incentives:asIncentives})[A.tab](d);
}
const asRow = (x, extra) => `<td>${esc(fmtShort(x.date))}</td><td><b>${esc(x.patientName)}</b></td><td>${esc(x.typeName || '—')}</td><td>${esc(dName(x.doctorId) || '—')}</td><td class="stat">${esc(x.note || '')}</td>${extra}`;
const asBadge = x => `<span class="upill ${AS_ST[x.status || 'pending'][1]}">${AS_ST[x.status || 'pending'][0]}</span>${x.status === 'rejected' && x.rejectReason ? `<span class="sub2">${esc(x.rejectReason)}</span>` : ''}`;
function asMine(d){
  const M = d.mine.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.at || 0) - (a.at || 0)), mk = todayKey.slice(0, 7);
  const pats = [...new Set((d.appts || []).filter(a => a.status !== 'cancelled').map(a => a.patientName))].sort();
  const types = cl.types.filter(t => t.active !== false);
  return `<div class="kpis">${kpi('Approved this month', M.filter(x => x.status === 'approved' && x.date.slice(0, 7) === mk).length, 'patients assisted')}${kpi('Waiting for approval', M.filter(x => x.status === 'pending').length, 'the treating doctor approves')}${kpi('Logged in total', M.length, 'all time')}</div>
    <div class="box"><h3>Add a patient you assisted</h3>
    <form class="aform" id="clAsForm" novalidate>
      <label>Date<input type="date" id="asDate" value="${todayKey}" max="${todayKey}" min="${shiftDay(todayKey, -7)}"></label>
      <label class="grow">Patient *<input id="asPat" list="asPats" placeholder="Patient name"><datalist id="asPats">${pats.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
      <label>Treatment assisted *<select id="asType"><option value="">— Select —</option>${types.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}<option value="other">Other</option></select></label>
      <label>Doctor<select id="asDoc">${docOpts('', '— Select —')}</select></label>
      <label class="grow">What you did<input id="asNote" placeholder="e.g. chairside assistance, suction, X-ray"></label>
      <button class="primary" type="submit">Add</button></form></div>
    <div class="awrap"><table class="atbl"><thead><tr><th>Date</th><th>Patient</th><th>Treatment</th><th>Doctor</th><th>Note</th><th>Approval</th><th></th></tr></thead><tbody>
      ${M.filter(x => x.status !== 'void').map(x => `<tr data-as="${esc(x.id)}">${asRow(x, `<td>${asBadge(x)}</td><td>${x.status === 'pending' && x.addedBy !== undefined && x.addedBy === (cloud.user.email || '') ? '<button class="danger" data-asvoid title="Withdraw">✕</button>' : ''}</td>`)}</tr>`).join('') || '<tr><td colspan="7" class="stat">Nothing logged yet.</td></tr>'}
    </tbody></table></div>`;
}
function asApprove(d){
  const A = cl.asst, f = A.f, own = asOwner(), dir = d.dir || [], all = (d.all || []).filter(x => x.status !== 'void' || f.st === 'void');
  const L = all.filter(x => (f.st === 'all' || (x.status || 'pending') === f.st) && (!f.from || x.date >= f.from) && (!f.to || x.date <= f.to) && (!f.who || x.uid === f.who)
    && (!f.ty || x.typeId === f.ty) && (!f.q || String(x.patientName || '').toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.patientName).localeCompare(String(b.patientName)));
  const mayDecide = x => (x.status || 'pending') === 'pending' && (asApprover() || own || x.approverUid === cloud.uid);
  const earlier = x => { const xs = all.filter(y => y.id !== x.id && x.patientId && y.patientId === x.patientId); return xs.length ? `<span class="sub2">${plural(xs.length, 'other assist')} for this patient · ${xs.filter(y => y.status === 'approved').length} approved${xs.some(y => y.treatmentId && y.treatmentId === x.treatmentId && y.status === 'approved') ? ' · <b>already approved on this treatment</b>' : ''}</span>` : ''; };
  const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
  const pend = all.filter(mayDecide);
  return `<div class="kpis">${kpi('Waiting for approval', pend.length, own || asApprover() ? 'since ' + fmtShort(f.from) : 'your patients')}${kpi('Approved', all.filter(x => x.status === 'approved').length, 'eligible for incentive')}${kpi('Rejected', all.filter(x => x.status === 'rejected').length, 'not eligible')}</div>
    ${own ? `<details class="box asadd"${A.addOpen ? ' open' : ''}><summary><b>+ Add an assist for someone</b> <span class="stat">any date: for entries staff forgot</span></summary>
      <form class="aform" id="clAsAdmin" novalidate style="margin-top:8px">
        <label>Staff *<select id="aaWho"><option value="">— Select —</option>${dir.map(p => opt(p.uid, p.name)).join('')}</select></label>
        <label>Date *<input type="date" id="aaDate" value="${todayKey}" max="${todayKey}"></label>
        <label class="grow">Patient *<input id="aaPat" list="aaPats" placeholder="Patient name or number"><datalist id="aaPats">${(cl.allP || []).slice(0, 3000).map(p => `<option value="${esc(pName(p))} · ${esc(p.code || '')}">`).join('')}</datalist></label>
        <label>Treatment *<select id="aaType"><option value="">— Select —</option>${cl.types.filter(t => t.active !== false).map(t => opt(t.id, t.name)).join('')}<option value="other">Other</option></select></label>
        <label>Doctor<select id="aaDoc">${docOpts('', '— Select —')}</select></label>
        <label class="grow">Reason *<input id="aaWhy" placeholder="e.g. Riya forgot to log it"></label>
        <button class="primary" type="submit">Add</button></form></details>` : ''}
    <div class="vbar asf" style="padding:0;margin:8px 0">
      <select data-asf="st">${[['pending', 'Pending approval'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All statuses']].concat(own ? [['void', 'Voided']] : []).map(([v, l]) => opt(v, l, f.st)).join('')}</select>
      <label class="stat">From <input type="date" data-asf="from" value="${esc(f.from)}"></label><label class="stat">To <input type="date" data-asf="to" value="${esc(f.to)}"></label>
      <select data-asf="who"><option value="">All assistants</option>${dir.map(p => opt(p.uid, p.name, f.who)).join('')}</select>
      <select data-asf="ty"><option value="">All treatments</option>${cl.types.map(t => opt(t.id, t.name, f.ty)).join('')}</select>
      <input type="search" data-asf="q" placeholder="Patient name" value="${esc(f.q)}">
      ${f.st === 'pending' && L.some(mayDecide) ? `<span class="sp"></span><button class="primary" data-asall>Approve all shown (${L.filter(mayDecide).length})</button>` : ''}</div>
    <div class="awrap"><table class="atbl"><thead><tr><th>Patient</th><th>Date</th><th>Treatment</th><th>Assistant</th><th>Doctor</th><th>Approval</th><th>Incentive</th><th></th></tr></thead><tbody>
    ${L.map(x => `<tr data-as="${esc(x.id)}"><td>${x.patientId ? `<a class="plink" href="#/clinic/patients/${esc(x.patientId)}/assists" target="_blank" title="Open the patient (new tab)"><b>${esc(x.patientName || '')}</b> ↗</a>` : `<b>${esc(x.patientName || '')}</b>`}${earlier(x)}</td><td>${esc(fmtShort(x.date))}</td><td>${esc(x.typeName || '—')}</td><td>${esc(x.name || '')}${x.addedBy && x.addedByName && x.addedByName !== x.name ? `<span class="sub2">added by ${esc(x.addedByName)}</span>` : ''}</td><td>${esc(dName(x.doctorId) || '—')}</td>
      <td>${asBadge(x)}${(x.history || []).length ? `<span class="sub2" title="${esc((x.history || []).map(h => `${fmt(h.at)} ${h.by}: ${h.change}${h.reason ? ' (' + h.reason + ')' : ''}`).join('\n'))}">✎ changed ${(x.history || []).length}×</span>` : ''}</td><td>${AS_ELIG[x.status || 'pending']}</td>
      <td style="white-space:nowrap">${mayDecide(x) ? '<button class="primary" data-asok>Approve</button> <button data-asno>Reject</button>' : ''}${own && x.status !== 'void' ? ' <button data-asedit title="Change the assistant, treatment or date">Edit</button> <button class="danger" data-asvoid title="Void (kept in history)">Void</button>' : ''}</td></tr>
      ${A.edit === x.id ? `<tr class="asedrow"><td colspan="8"><form class="aform" id="clAsEdit" data-as="${esc(x.id)}" novalidate>
        <label>Staff<select id="aeWho">${dir.map(p => opt(p.uid, p.name, x.uid)).join('')}</select></label><label>Date<input type="date" id="aeDate" value="${esc(x.date)}" max="${todayKey}"></label>
        <label>Treatment<select id="aeType">${cl.types.map(t => opt(t.id, t.name, x.typeId)).join('')}<option value="other"${x.typeId === 'other' ? ' selected' : ''}>Other</option></select></label><label>Doctor<select id="aeDoc">${docOpts(x.doctorId, '— Select —')}</select></label>
        <label class="grow">Reason for the change *<input id="aeWhy" placeholder="e.g. wrong assistant picked"></label><button class="primary" type="submit">Save</button><button type="button" data-asedx>Cancel</button>
        ${x.status === 'approved' ? '<span class="stat">Approved: saving sends it back to the doctor for re-approval.</span>' : ''}</form></td></tr>` : ''}`).join('') || '<tr><td colspan="8" class="stat">Nothing matches these filters.</td></tr>'}
    </tbody></table></div>`;
}
/* incentive earned per staff member in a month: approved patient assists × the rate for that treatment (or the amount set on the entry) */
function incentivesByUid(all, payDocs, month){
  const pay = Object.fromEntries((payDocs || []).map(p => [p.id, p])), rates = (pay.rates && pay.rates.rates) || {}, out = {};
  (all || []).filter(x => x.status === 'approved' && (x.date || '').slice(0, 7) === month).forEach(x => { out[x.uid] = (out[x.uid] || 0) + (pay['e-' + x.id] ? +pay['e-' + x.id].amount || 0 : +(rates[x.typeId || 'other'] || 0)); });
  return out;
}
async function loadIncentives(month){
  if (!feat('clinic') || !asOwner()) return {};
  try { const {F} = cloud, q = (c, ...w) => F.getDocs(F.query(cCol(c), ...w)).then(docsOf);
    const [all, pay] = await Promise.all([q('assists', F.where('status', '==', 'approved')), q('assistPay')]);
    return incentivesByUid(all, pay, month); } catch(e){ return {}; }
}
function asIncentives(d){
  const A = cl.asst, pay = Object.fromEntries((d.pay || []).map(p => [p.id, p])), rates = (pay.rates && pay.rates.rates) || {};
  const amt = x => pay['e-' + x.id] ? +pay['e-' + x.id].amount || 0 : +(rates[x.typeId || 'other'] || 0);
  const people = {}; d.all.forEach(x => { const p = people[x.uid] = people[x.uid] || {uid:x.uid, name:x.name || '', m:[], all:[]}; p.all.push(x); if ((x.date || '').slice(0, 7) === A.month) p.m.push(x); });
  const P = Object.values(people).sort((a, b) => a.name.localeCompare(b.name)), sum = xs => xs.reduce((s, x) => s + amt(x), 0);
  if (A.person){
    const p = people[A.person] || {name:'', m:[], all:[]}, M = p.m.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return `<button class="abk" data-asperson="">← Everyone</button><div class="kpis">${kpi(esc(p.name) + ' · ' + esc(monthLabel(A.month)), inr(sum(M)), plural(M.length, 'approved assist'))}${kpi('Earned so far', inr(sum(p.all)), plural(p.all.length, 'approved assist') + ' in total')}</div>
      <div class="awrap"><table class="atbl"><thead><tr><th>Date</th><th>Patient</th><th>Treatment</th><th>Doctor</th><th>Note</th><th class="num">Incentive (₹)</th></tr></thead><tbody>
      ${M.map(x => `<tr data-as="${esc(x.id)}">${asRow(x, `<td class="num"><input type="number" data-aspay min="0" step="10" value="${amt(x)}" style="width:90px"${asOwner() ? '' : ' disabled'}></td>`)}</tr>`).join('') || '<tr><td colspan="6" class="stat">No approved assists this month.</td></tr>'}
      </tbody></table></div>`;
  }
  return `<div class="kpis">${kpi('Incentives ' + esc(monthLabel(A.month)), inr(P.reduce((s, p) => s + sum(p.m), 0)), plural(P.reduce((s, p) => s + p.m.length, 0), 'approved assist'))}${kpi('Earned so far', inr(P.reduce((s, p) => s + sum(p.all), 0)), 'all approved assists')}</div>
    <div class="awrap"><table class="atbl"><thead><tr><th>Staff</th><th class="num">Approved (month)</th><th class="num">Incentive (month)</th><th class="num">Approved so far</th><th class="num">Earned so far</th></tr></thead><tbody>
      ${P.map(p => `<tr class="clk" data-asperson="${esc(p.uid)}"><td><b>${esc(p.name)}</b></td><td class="num">${p.m.length}</td><td class="num"><b>${inr(sum(p.m))}</b></td><td class="num">${p.all.length}</td><td class="num">${inr(sum(p.all))}</td></tr>`).join('') || '<tr><td colspan="5" class="stat">No approved assists yet.</td></tr>'}
    </tbody></table></div>
    <div class="box" style="margin-top:12px"><h3>Incentive per assist</h3>
      <div class="awrap"><table class="atbl"><thead><tr><th>Treatment</th><th class="num">₹ per assist</th></tr></thead><tbody>
      ${cl.types.filter(t => t.active !== false).concat([{id:'other', name:'Other'}]).map(t => `<tr data-asr="${esc(t.id)}"><td>${esc(t.name)}</td><td class="num"><input type="number" data-asrate min="0" step="10" value="${+rates[t.id] || 0}" style="width:90px"${asOwner() ? '' : ' disabled'}></td></tr>`).join('')}
      </tbody></table></div></div>`;
}
async function asSubmit(){
  const {F} = cloud, oc = orgCtx(), ty = $('#asType').value, pat = $('#asPat').value.trim();
  if (!pat) return info('Enter the patient\'s name.'); if (!ty) return info('Choose the treatment you assisted with.');
  const t = cl.types.find(x => x.id === ty), ap = ((cl.asst.d && cl.asst.d.appts) || []).find(a => a.patientName === pat), doc = $('#asDoc').value || (ap ? ap.doctorId : '');
  try {
    await F.addDoc(cCol('assists'), {uid:cloud.uid, name:fullName(oc.me) || cloud.user.email || '', date:$('#asDate').value || todayKey, patientName:pat, patientId:ap ? ap.patientId : '', appointmentId:ap ? ap.id : '', treatmentId:'', typeId:t ? t.id : 'other', typeName:t ? t.name : 'Other', doctorId:doc, approverUid:approverOf(doc), note:$('#asNote').value.trim(), status:'pending', addedBy:cloud.user.email || '', addedByName:fullName(oc.me) || '', at:Date.now(), history:[]});
    info('Added: waiting for the doctor\'s approval.'); cl.asKey = ''; cl.clear = true; document.activeElement.blur(); renderClinic();
  } catch(e){ info('Could not save: ' + errText(e)); }
}
// Owner / Account Manager: add for someone, any date
async function asAdminAdd(){
  const {F} = cloud, who = $('#aaWho').value, date = $('#aaDate').value, ty = $('#aaType').value, why = $('#aaWhy').value.trim(), pv = $('#aaPat').value.trim();
  if (!who || !date || !ty || !pv) return info('Choose the staff member, date, patient and treatment.'); if (!why) return info('Enter the reason (kept in the audit log).');
  const code = (pv.split('·')[1] || '').trim(), p = (cl.allP || []).find(x => code ? x.code === code : pName(x).toLowerCase() === pv.toLowerCase());
  const st = (cl.asst.d.dir || []).find(x => x.uid === who) || {name:''}, t = cl.types.find(x => x.id === ty), doc = $('#aaDoc').value;
  const x = {uid:who, name:st.name, date, patientName:p ? pName(p) : pv, patientId:p ? p.id : '', appointmentId:'', treatmentId:'', typeId:t ? t.id : 'other', typeName:t ? t.name : 'Other', doctorId:doc, approverUid:approverOf(doc), note:'', status:'pending', addedBy:cloud.user.email || '', addedByName:fullName(orgCtx().me) || '', at:Date.now(), history:[{at:Date.now(), by:cloud.user.email || '', change:'added for ' + st.name, reason:why}]};
  try { const r = await F.addDoc(cCol('assists'), x); asAudit(Object.assign({id:r.id}, x, {status:''}), 'added on behalf', why, {uid:who, name:st.name, typeName:x.typeName, date}); if (p) asPatientNames(p.id, [st.name], date);
    info(`Added for ${st.name}: waiting for approval.`); cl.asst.addOpen = false; cl.asKey = ''; renderClinic(); } catch(e){ info('Could not save: ' + errText(e)); }
}
async function asAdminEdit(id){
  const x = cl.asst.d.all.find(y => y.id === id), why = $('#aeWhy').value.trim(); if (!x) return; if (!why) return info('Enter the reason for the change.');
  const st = (cl.asst.d.dir || []).find(p => p.uid === $('#aeWho').value) || {uid:x.uid, name:x.name}, ty = $('#aeType').value, t = cl.types.find(y => y.id === ty), doc = $('#aeDoc').value;
  const upd = {uid:st.uid, name:st.name, date:$('#aeDate').value || x.date, typeId:t ? t.id : 'other', typeName:t ? t.name : 'Other', doctorId:doc, approverUid:approverOf(doc), history:asHist(x, 'corrected', why)};
  if (x.status !== 'pending') Object.assign(upd, {status:'pending', approvedBy:'', approverName:'', approvedAt:0, rejectReason:''});   // re-approval
  try { await cloud.F.updateDoc(cDoc('assists', id), upd); asAudit(x, 'corrected', why, {uid:upd.uid, name:upd.name, typeName:upd.typeName, date:upd.date, status:upd.status || x.status});
    info(x.status === 'approved' ? 'Saved: sent back to the doctor for re-approval.' : 'Saved.'); cl.asst.edit = null; cl.asKey = ''; renderClinic(); } catch(e){ info('Could not save: ' + errText(e)); }
}
async function asVoid(id){
  const A = cl.asst, x = ((A.d && (A.d.all || A.d.mine)) || []).find(y => y.id === id); if (!x) return;
  const why = asOwner() ? prompt('Reason for voiding this assist (kept in the history):') : 'withdrawn by ' + (fullName(orgCtx().me) || 'staff');
  if (why === null || (asOwner() && !why.trim())) return;
  try { await cloud.F.updateDoc(cDoc('assists', id), {status:'void', history:asHist(x, 'voided', why)}); if (asOwner()) asAudit(x, 'voided', why, {status:'void'}); info('Voided: it no longer counts.'); cl.asKey = ''; renderClinic(); }
  catch(e){ info('Could not save: ' + errText(e)); }
}
async function asDecide(ids, status){
  const {F} = cloud, by = cloud.user.email || '', nm = fullName(orgCtx().me);
  let why = '';
  if (status === 'rejected'){ why = prompt('Reason for rejecting (optional, the assistant sees it):', ''); if (why === null) return; }
  try { for (const id of ids) await F.updateDoc(cDoc('assists', id), {status, approvedBy:by, approverName:nm, approvedAt:Date.now(), rejectReason:status === 'rejected' ? why.trim() : ''});
    info(`${plural(ids.length, 'entry')} ${status === 'approved' ? 'approved for incentive' : 'rejected'}.`); cl.asKey = ''; renderClinic(); }
  catch(e){ info('Could not save: ' + errText(e)); }
}
