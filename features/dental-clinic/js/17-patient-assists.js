/* ---------- Patient assists: staff log who they assisted; the Chief doctor approves; the Account Manager sets incentives ----------
   Staff only ever see their own entries and whether they were approved, never the incentive amount. */
const AS_ST = {pending:['Pending', 'pend'], approved:['Approved', 'on'], rejected:['Not approved', 'gone']};
const asApprover = () => canW('assistApprove');
const asOwner = () => { const oc = orgCtx(); return !!(oc && !oc.support && oc.role === 'orgadmin'); };
function asTabs(){ return [['mine', 'My assists', !!(orgCtx() && !orgCtx().support)], ['approve', 'Approve', asApprover()], ['incentives', 'Incentives', asOwner()]].filter(t => t[2]); }
function asLoad(){
  const {F} = cloud, A = cl.asst || (cl.asst = {tab:'', month:todayKey.slice(0, 7), person:''});
  const key = orgCtx().orgId + '|' + A.tab + '|' + A.month;
  if (cl.asKey === key) return; cl.asKey = key; A.d = null;
  const W = F.where, q = (c, ...w) => F.getDocs(F.query(cCol(c), ...w)).then(docsOf), jobs = {};
  if (A.tab === 'mine'){ jobs.mine = q('assists', W('uid', '==', cloud.uid)); if (can('appointments') || can('treatments')) jobs.appts = q('appointments', W('date', '>=', shiftDay(todayKey, -7)), W('date', '<=', todayKey)).catch(() => []); }
  if (A.tab === 'approve') jobs.all = q('assists', W('date', '>=', shiftDay(todayKey, -60)));
  if (A.tab === 'incentives'){ jobs.all = q('assists', W('status', '==', 'approved')); jobs.pay = q('assistPay'); }
  const ks = Object.keys(jobs);
  Promise.all(ks.map(k => jobs[k])).then(v => { if (cl.asKey !== key) return; const d = {}; ks.forEach((k, i) => d[k] = v[i]); A.d = d; if (cl.sec === 'assists') renderClinic(); })
    .catch(e => { if (cl.asKey === key){ A.d = {err:errText(e)}; if (cl.sec === 'assists') renderClinic(); } });
}
function clAssists(){
  const A = cl.asst || (cl.asst = {tab:'', month:todayKey.slice(0, 7), person:''}), tabs = asTabs();
  if (!tabs.some(t => t[0] === A.tab)) A.tab = tabs.length ? tabs[0][0] : '';
  asLoad();
  const head = `<div class="clhead"><h2>Patient assists</h2>${A.tab === 'incentives' ? `<div class="mnav"><button data-asm="-1">‹</button><b>${esc(monthLabel(A.month))}</b><button data-asm="1"${A.month >= todayKey.slice(0, 7) ? ' disabled' : ''}>›</button></div>` : ''}</div>
    ${tabs.length > 1 ? `<div class="htabs">${tabs.map(([k, l]) => `<button data-astab="${k}" class="${A.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}`;
  const d = A.d; if (!d) return head + '<div class="empty">Loading…</div>'; if (d.err) return head + `<div class="auth-err">${esc(d.err)}</div>`;
  return head + ({mine:asMine, approve:asApprove, incentives:asIncentives})[A.tab](d);
}
const asRow = (x, extra) => `<td>${esc(fmtShort(x.date))}</td><td><b>${esc(x.patientName)}</b></td><td>${esc(x.typeName || '—')}</td><td>${esc(dName(x.doctorId) || '—')}</td><td class="stat">${esc(x.note || '')}</td>${extra}`;
function asMine(d){
  const M = d.mine.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.at || 0) - (a.at || 0)), mk = todayKey.slice(0, 7);
  const pats = [...new Set((d.appts || []).filter(a => a.status !== 'cancelled').map(a => a.patientName))].sort();
  const types = cl.types.filter(t => t.active !== false);
  return `<div class="kpis">${kpi('Approved this month', M.filter(x => x.status === 'approved' && x.date.slice(0, 7) === mk).length, 'patients assisted')}${kpi('Waiting for approval', M.filter(x => x.status === 'pending').length, 'the Chief doctor approves')}${kpi('Logged in total', M.length, 'all time')}</div>
    <div class="box"><h3>Add a patient you assisted <span class="sub">add each one the same day; the Chief doctor approves them</span></h3>
    <form class="aform" id="clAsForm" novalidate>
      <label>Date<input type="date" id="asDate" value="${todayKey}" max="${todayKey}" min="${shiftDay(todayKey, -7)}"></label>
      <label class="grow">Patient *<input id="asPat" list="asPats" placeholder="Patient name"><datalist id="asPats">${pats.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
      <label>Treatment assisted *<select id="asType"><option value="">— Select —</option>${types.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}<option value="other">Other</option></select></label>
      <label>Doctor<select id="asDoc">${docOpts('', '— Select —')}</select></label>
      <label class="grow">What you did<input id="asNote" placeholder="e.g. chairside assistance, suction, X-ray"></label>
      <button class="primary" type="submit">Add</button></form></div>
    <div class="awrap"><table class="atbl"><thead><tr><th>Date</th><th>Patient</th><th>Treatment</th><th>Doctor</th><th>Note</th><th>Status</th><th></th></tr></thead><tbody>
      ${M.map(x => `<tr data-as="${esc(x.id)}">${asRow(x, `<td><span class="upill ${AS_ST[x.status][1]}">${AS_ST[x.status][0]}</span></td><td>${x.status === 'pending' ? '<button class="danger" data-asdel title="Delete">✕</button>' : ''}</td>`)}</tr>`).join('') || '<tr><td colspan="7" class="stat">Nothing logged yet.</td></tr>'}
    </tbody></table></div>`;
}
function asApprove(d){
  const P = d.all.filter(x => x.status === 'pending').sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.name).localeCompare(String(b.name)));
  const done = d.all.filter(x => x.status !== 'pending' && (x.date || '').slice(0, 7) === todayKey.slice(0, 7)).sort((a, b) => (b.approvedAt || 0) - (a.approvedAt || 0));
  let rows = '', day = null;
  P.forEach(x => { if (x.date !== day){ day = x.date; rows += `<tr class="wk"><td colspan="7">${esc(fmtShort(day))} · ${plural(P.filter(y => y.date === day).length, 'entry')}<button class="primary" data-asday="${esc(day)}" style="float:right;padding:3px 10px">Approve all for this day</button></td></tr>`; }
    rows += `<tr data-as="${esc(x.id)}"><td><b>${esc(x.name || '')}</b></td>${asRow(x, `<td style="white-space:nowrap"><button class="primary" data-asok>Approve</button> <button data-asno>Reject</button></td>`)}</tr>`; });
  return `<div class="kpis">${kpi('Waiting for approval', P.length, 'from the last 60 days')}${kpi('Decided this month', done.length, done.filter(x => x.status === 'approved').length + ' approved')}</div>
    <div class="awrap"><table class="atbl"><thead><tr><th>Staff</th><th>Date</th><th>Patient</th><th>Treatment</th><th>Doctor</th><th>Note</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="stat">Nothing waiting. 👏</td></tr>'}</tbody></table></div>
    ${done.length ? `<h3 style="font-size:13px;margin:16px 0 6px">Decided this month</h3><div class="awrap"><table class="atbl"><thead><tr><th>Staff</th><th>Date</th><th>Patient</th><th>Treatment</th><th>Doctor</th><th>Note</th><th>Status</th></tr></thead><tbody>
      ${done.map(x => `<tr><td>${esc(x.name || '')}</td>${asRow(x, `<td><span class="upill ${AS_ST[x.status][1]}">${AS_ST[x.status][0]}</span></td>`)}</tr>`).join('')}</tbody></table></div>` : ''}`;
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
      ${M.map(x => `<tr data-as="${esc(x.id)}">${asRow(x, `<td class="num"><input type="number" data-aspay min="0" step="10" value="${amt(x)}" style="width:90px"></td>`)}</tr>`).join('') || '<tr><td colspan="6" class="stat">No approved assists this month.</td></tr>'}
      </tbody></table></div><p class="stat">Each amount starts from the rate for that treatment; change it here for this one entry.</p>`;
  }
  return `<div class="kpis">${kpi('Incentives ' + esc(monthLabel(A.month)), inr(P.reduce((s, p) => s + sum(p.m), 0)), plural(P.reduce((s, p) => s + p.m.length, 0), 'approved assist'))}${kpi('Earned so far', inr(P.reduce((s, p) => s + sum(p.all), 0)), 'all approved assists')}</div>
    <div class="awrap"><table class="atbl"><thead><tr><th>Staff</th><th class="num">Approved (month)</th><th class="num">Incentive (month)</th><th class="num">Approved so far</th><th class="num">Earned so far</th></tr></thead><tbody>
      ${P.map(p => `<tr class="clk" data-asperson="${esc(p.uid)}"><td><b>${esc(p.name)}</b></td><td class="num">${p.m.length}</td><td class="num"><b>${inr(sum(p.m))}</b></td><td class="num">${p.all.length}</td><td class="num">${inr(sum(p.all))}</td></tr>`).join('') || '<tr><td colspan="5" class="stat">No approved assists yet.</td></tr>'}
    </tbody></table></div>
    <div class="box" style="margin-top:12px"><h3>Incentive per assist <span class="sub">by treatment: applied to every approved assist (only you see these)</span></h3>
      <div class="awrap"><table class="atbl"><thead><tr><th>Treatment</th><th class="num">₹ per assist</th></tr></thead><tbody>
      ${cl.types.filter(t => t.active !== false).concat([{id:'other', name:'Other'}]).map(t => `<tr data-asr="${esc(t.id)}"><td>${esc(t.name)}</td><td class="num"><input type="number" data-asrate min="0" step="10" value="${+rates[t.id] || 0}" style="width:90px"></td></tr>`).join('')}
      </tbody></table></div></div>`;
}
async function asSubmit(){
  const {F} = cloud, oc = orgCtx(), ty = $('#asType').value, pat = $('#asPat').value.trim();
  if (!pat) return info('Enter the patient\'s name.'); if (!ty) return info('Choose the treatment you assisted with.');
  const t = cl.types.find(x => x.id === ty), ap = ((cl.asst.d && cl.asst.d.appts) || []).find(a => a.patientName === pat);
  try {
    await F.addDoc(cCol('assists'), {uid:cloud.uid, name:fullName(oc.me) || cloud.user.email || '', date:$('#asDate').value || todayKey, patientName:pat, patientId:ap ? ap.patientId : '', typeId:t ? t.id : 'other', typeName:t ? t.name : 'Other', doctorId:$('#asDoc').value || (ap ? ap.doctorId : ''), note:$('#asNote').value.trim(), status:'pending', at:Date.now()});
    info('Added: waiting for the Chief doctor\'s approval.'); cl.asKey = ''; cl.clear = true; document.activeElement.blur(); renderClinic();
  } catch(e){ info('Could not save: ' + errText(e)); }
}
async function asDecide(ids, status){
  const {F} = cloud, by = cloud.user.email || '', nm = fullName(orgCtx().me);
  try { for (const id of ids) await F.updateDoc(cDoc('assists', id), {status, approvedBy:by, approverName:nm, approvedAt:Date.now()});
    info(`${plural(ids.length, 'entry')} ${status === 'approved' ? 'approved' : 'not approved'}.`); cl.asKey = ''; renderClinic(); }
  catch(e){ info('Could not save: ' + errText(e)); }
}

