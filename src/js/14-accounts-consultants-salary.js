function accConsultants(d){
  const a = cl.acc, w = canW('accounts'), inM = x => (x.date || '').slice(0, 7) === a.month;
  const cons = cl.doctors.filter(x => x.type === 'consultant');
  const feeOf = t => +t.consultantFee || 0;
  const rows = cons.map(c => {
    const feesM = d.fees.filter(t => t.doctorId === c.id && inM(t)).reduce((s, t) => s + feeOf(t), 0) + paidSum(d.led.filter(x => x.kind === 'expense' && x.doctorId === c.id && inM(x)));
    const feesAll = d.cfeesAll.filter(t => t.doctorId === c.id).reduce((s, t) => s + feeOf(t), 0) + paidSum(d.cfeeManual.filter(x => x.doctorId === c.id)), paid = paidSum(d.cpay.filter(x => x.doctorId === c.id)), bal = feesAll - paid;
    return `<tr data-cons="${esc(c.id)}" class="clk${c.id === (a.cf && cons.some(x => x.id === a.cf) ? a.cf : (cons[0] || {}).id) ? ' sel' : ''}"><td><b>${esc(c.name)}</b><span class="sub2">${esc(c.specialty || 'Consultant')}${c.phone ? ' · ' + esc(c.phone) : ''}</span></td><td class="num">${inr(feesM)}</td><td class="num">${inr(feesAll)}</td><td class="num">${inr(paid)}</td><td class="num"><b class="${bal > 0 ? 'neg' : ''}">${inr(bal)}</b></td>
      <td>${canW('accounts') ? `<div class="uact"><button data-cfee>+ Fee</button><button class="primary" data-cpay data-bal="${Math.max(0, bal)}">Pay</button></div>` : ''}</td></tr>`; }).join('');
  const sel = a.cf && cons.some(c => c.id === a.cf) ? a.cf : (cons[0] || {}).id; a.cfSel = sel;
  const list = sel ? d.fees.filter(t => t.doctorId === sel && inM(t)).map(t => ({date:t.date, what:`${t.typeName}${t.tooth ? ' (' + t.tooth + ')' : ''}`, patient:t.patientName, amt:feeOf(t), kind:'Fee'}))
    .concat(d.led.filter(x => x.kind === 'expense' && x.doctorId === sel && inM(x)).map(x => ({date:x.date, what:x.note || 'Fee', patient:x.patientName || '', amt:+x.amount, kind:'Fee'})))
    .concat(d.cpay.filter(x => x.doctorId === sel && inM(x)).map(x => ({date:x.date, what:x.note || 'Payment', patient:'', amt:-x.amount, kind:'Paid'}))).sort((x, y) => String(y.date).localeCompare(String(x.date))) : [];
  return `<div class="awrap" style="margin-top:0"><table class="atbl otbl"><thead><tr><th>Consultant doctor</th><th class="num">Fees this month</th><th class="num">Fees to date</th><th class="num">Paid to date</th><th class="num">To pay now</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="stat">No consultant doctors. Add them in Clinic setup with type Consultant.</td></tr>'}</tbody></table></div>
    ${sel ? consVisits(d, sel) : ''}
    ${sel ? `<details class="box" style="margin-top:12px"><summary><b>All fees &amp; payments · ${esc(dName(sel))} · ${esc(monthLabel(a.month))}</b></summary>
      ${tbl(['Date', 'Patient', 'For', 'Type', '₹Amount'], list.map(x => ({c:[esc(fmtShort(x.date)), esc(x.patient || '—'), esc(x.what), x.kind === 'Paid' ? '<span class="upill on">Paid</span>' : 'Fee', x.amt < 0 ? '− ' + inr(-x.amt) : inr(x.amt)]})))}</details>` : ''}
    <p class="stat">A consultant's fee is entered on each treatment they do (or with + Fee) and counts as a clinic expense. "Pay" records money handed over, which reduces what you owe them.</p>`;
}
/* consultant visits: the days a consultant came (from their appointments), each patient seen and what the clinic pays for that patient */
function consRows(d, sel){
  const a = cl.acc, inM = x => (x.date || '').slice(0, 7) === a.month;
  const ap = (d.mAppts || []).filter(x => x.doctorId === sel && inM(x) && !['cancelled', 'missed'].includes(x.status));
  const cf = Object.fromEntries((d.led || []).filter(x => x.appointmentId && x.doctorId === sel).map(x => [x.appointmentId, x]));
  const tf = d.fees.filter(t => t.doctorId === sel && inM(t));
  const rows = ap.map(x => { const tr = tf.filter(t => t.patientId === x.patientId && t.date === x.date), trFee = tr.reduce((s, t) => s + (+t.consultantFee || 0), 0), c = cf[x.id];
    return {id:x.id, date:x.date, time:x.time || '', patient:x.patientName || '', patientId:x.patientId, what:tr.map(t => t.typeName).filter(Boolean).join(', ') || x.reason || '', trFee, cost:c ? +c.amount || 0 : null, status:x.status}; });
  tf.filter(t => !ap.some(x => x.patientId === t.patientId && x.date === t.date)).forEach(t => rows.push({id:'', date:t.date, time:'', patient:t.patientName || '', what:t.typeName || '', trFee:+t.consultantFee || 0, cost:null}));
  return rows.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
}
const consAmt = r => r.trFee + (r.cost || 0);
function consVisits(d, sel){
  const a = cl.acc, w = canW('accounts') || isOwnerLike(), rows = consRows(d, sel), view = a.cview || 'table';
  const days = [...new Set(rows.map(r => r.date))], tot = rows.reduce((s, r) => s + consAmt(r), 0), open = rows.filter(r => r.id && !r.trFee && r.cost == null).length;
  const fd = a.cday && days.includes(a.cday) ? a.cday : '', shown = fd ? rows.filter(r => r.date === fd) : rows;
  let body;
  if (view === 'cal'){
    const s0 = parseDay(a.month + '-01'), lead = (s0.getDay() + 6) % 7, n = +mEnd(a.month).slice(8);
    let cells = '<div class="ccal">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => `<div class="cch">${x}</div>`).join('') + '<div></div>'.repeat(lead);
    for (let i = 1; i <= n; i++){ const k = `${a.month}-${pad2(i)}`, rs = rows.filter(r => r.date === k);
      cells += `<div class="ccd${rs.length ? ' on' : ''}${k === fd ? ' sel' : ''}${k === todayKey ? ' td' : ''}"${rs.length ? ` data-cday="${k}"` : ''}><span>${i}</span>${rs.length ? `<b>${plural(rs.length, 'patient')}</b><em>${inr(rs.reduce((s, r) => s + consAmt(r), 0))}</em>` : ''}</div>`; }
    body = cells + '</div>' + (fd ? consTable(shown, w) : '<p class="stat">Click a day to see its patients and enter the cost.</p>');
  } else body = consTable(shown, w);
  return `<div class="box" style="margin-top:12px"><div class="cvh"><h3 style="margin:0">${esc(dName(sel))} · ${esc(monthLabel(a.month))}</h3>
      <div class="seg mini"><button data-cview="table" class="${view === 'table' ? 'on' : ''}">☰ Table</button><button data-cview="cal" class="${view === 'cal' ? 'on' : ''}">▦ Calendar</button></div><span class="sp"></span>
      <button data-cexp="csv">⬇ Excel / CSV</button><button data-cexp="print">🖨 Statement</button></div>
    <div class="kpis" style="margin:10px 0"><div class="kpi"><div class="kl">Days visited</div><div class="kv">${days.length}</div></div><div class="kpi"><div class="kl">Patients</div><div class="kv">${rows.length}</div></div>
      <div class="kpi"><div class="kl">Month total</div><div class="kv" id="cvTot">${inr(tot)}</div></div><div class="kpi"><div class="kl">Cost not entered</div><div class="kv${open ? ' neg' : ''}" id="cvOpen">${open}</div></div></div>
    ${fd ? `<div class="stat">Showing ${esc(fmtLong(fd))} · <button class="linkb" data-cday="">show the whole month</button></div>` : ''}
    ${body}
    <p class="stat">Visits come from the appointments booked with ${esc(dName(sel))} (cancelled ones are left out). ${w ? 'Enter what the clinic pays for each patient; it saves as you type and counts as a consultant fee.' : ''}</p></div>`;
}
function consTable(rows, w){
  let html = '', last = '';
  rows.forEach(r => { if (r.date !== last){ last = r.date; const rs = rows.filter(x => x.date === r.date); html += `<tr class="wk"><td colspan="5">${esc(fmtLong(r.date))} · ${plural(rs.length, 'patient')} · <span data-cdtot="${r.date}">${inr(rs.reduce((s, x) => s + consAmt(x), 0))}</span></td></tr>`; }
    html += `<tr><td>${esc(r.time ? hm12(r.time) : '—')}</td><td><b>${esc(r.patient || '—')}</b></td><td>${esc(r.what || '')}</td>
      <td class="num">${r.trFee ? `${inr(r.trFee)} <span class="stat">from treatment</span>` : ''}${r.id && !r.trFee ? (w ? `<input type="number" min="0" class="tin" data-ccost="${esc(r.id)}" value="${r.cost != null ? r.cost : ''}" placeholder="₹ cost">` : r.cost != null ? inr(r.cost) : '—') : ''}</td>
      <td class="num"><b${r.id ? ` data-camt="${esc(r.id)}"` : ''}>${inr(consAmt(r))}</b></td></tr>`; });
  return `<div class="awrap"><table class="atbl"><thead><tr><th>Time</th><th>Patient</th><th>Treatment / reason</th><th class="num">Cost per patient</th><th class="num">Amount</th></tr></thead><tbody>${html || '<tr><td colspan="5" class="stat">No visits this month.</td></tr>'}</tbody></table></div>`;
}
async function consSaveCost(inp){
  const a = cl.acc, d = a.d, id = inp.dataset.ccost, ap = (d.mAppts || []).find(x => x.id === id); if (!ap) return;
  const raw = inp.value.trim(), ref = cDoc('ledger', 'cf-' + id), {F} = cloud;
  try {
    if (raw === ''){ await F.deleteDoc(ref); d.led = d.led.filter(x => x.id !== 'cf-' + id); d.cfeeManual = (d.cfeeManual || []).filter(x => x.id !== 'cf-' + id); }
    else { const x = {kind:'expense', category:'Consultant fees', doctorId:ap.doctorId, appointmentId:id, patientId:ap.patientId || '', patientName:ap.patientName || '', amount:Math.max(0, Math.round(+raw || 0)),
        date:ap.date, mode:'cash', paid:true, note:`Consultant fee · ${ap.patientName || ''}`, at:Date.now(), by:cloud.user.email || ''};
      await F.setDoc(ref, x); const o = Object.assign({id:'cf-' + id}, x);
      d.led = d.led.filter(y => y.id !== o.id).concat(o); d.cfeeManual = (d.cfeeManual || []).filter(y => y.id !== o.id).concat(o); }
    inp.classList.add('saved'); setTimeout(() => inp.classList.remove('saved'), 900);
    const rows = consRows(d, a.cfSel), set = (sel, v) => { const e = document.querySelector(sel); if (e) e.textContent = v; };     // update the figures in place, so typing is not interrupted
    rows.forEach(r => { if (r.id) set(`[data-camt="${r.id}"]`, inr(consAmt(r))); });
    [...new Set(rows.map(r => r.date))].forEach(k => set(`[data-cdtot="${k}"]`, inr(rows.filter(r => r.date === k).reduce((s, r) => s + consAmt(r), 0))));
    set('#cvTot', inr(rows.reduce((s, r) => s + consAmt(r), 0))); const op = rows.filter(r => r.id && !r.trFee && r.cost == null).length; set('#cvOpen', op);
    const oe = $('#cvOpen'); if (oe) oe.classList.toggle('neg', op > 0);
  } catch(e){ info('Could not save: ' + errText(e)); }
}
function consExport(kind){
  const a = cl.acc, sel = a.cfSel; if (!sel) return;
  const rows = consRows(a.d, sel), tot = rows.reduce((s, r) => s + consAmt(r), 0), nm = dName(sel), ml = monthLabel(a.month), days = new Set(rows.map(r => r.date)).size;
  if (kind === 'csv'){
    const csv = csvOf([[`${nm} · ${ml}`], [], ['Date', 'Time', 'Patient', 'Treatment / reason', 'Amount']].concat(rows.map(r => [r.date, r.time, r.patient, r.what, consAmt(r)]), [[], ['', '', `${days} days · ${rows.length} patients`, 'Month total', tot]]));
    const b = new Blob(['\ufeff' + csv], {type:'text/csv'}), l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = `${nm.replace(/[^\w]+/g, '-')}-${a.month}.csv`; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 2000);
    return;
  }
  printDoc(`${nm} · ${ml}`, `<h2>Consultant statement · ${esc(nm)}</h2><div class="muted">${esc(ml)} · ${days} days · ${rows.length} patients</div>
    <table><thead><tr><th>Date</th><th>Time</th><th>Patient</th><th>Treatment / reason</th><th class="n">Amount</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(fmtShort(r.date))}</td><td>${esc(r.time ? hm12(r.time) : '')}</td><td>${esc(r.patient)}</td><td>${esc(r.what)}</td><td class="n">${inr(consAmt(r))}</td></tr>`).join('')}
    <tr class="tot"><td colspan="4">Month total</td><td class="n">${inr(tot)}</td></tr></tbody></table>`);
}
/* Staff salary: the month's attendance (salary − loss of pay + extra hours / days) + patient-assist incentives = payable; "Pay" records it as a clinic expense */
async function loadStaffPay(month){
  const {F, fs} = cloud, B = monthBounds(month), oc = orgCtx();
  const from = F.Timestamp.fromDate(parseDay(shiftDay(B.s, -1))), to = F.Timestamp.fromDate(parseDay(shiftDay(B.e, 2)));
  const accs = docsOf(await F.getDocs(F.collection(fs, 'orgs', oc.orgId, 'members'))).map(a => Object.assign({uid:a.id}, a)).filter(a => !a.removed && a.role !== 'orgadmin')
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const [inc, evs, paid] = await Promise.all([loadIncentives(month),
    Promise.all(accs.map(a => F.getDocs(F.query(attCol(a.uid), F.where('at', '>=', from), F.where('at', '<', to))).then(qs => qs.docs.map(d => { const x = d.data({serverTimestamps:'estimate'}); return {id:d.id, type:x.type, src:x.src, at:tsMs(x.at)}; })))),
    F.getDocs(F.query(cCol('ledger'), F.where('kind', '==', 'expense'), F.where('category', '==', 'Staff salary'))).then(docsOf).catch(() => [])]);
  return accs.map((a, i) => { a._inc = inc[a.uid] || 0; const S = attSummary(evs[i], month, a); return {a, S, paid:paid.filter(x => x.staffUid === a.uid && x.salMonth === month)}; });
}
function accSalary(d){
  const a = cl.acc, rows = d.staff || [], w = canW('accounts'), pay = payOn();
  if (!pay) return '<div class="empty">Salaries need the <b>Payroll</b> feature for this organization (Zenvora Loop Super Admin → Organizations → Edit → Payroll). Attendance, extra hours and Sundays are in the Attendance tab.</div>';
  const T = rows.reduce((t, r) => { t.sal += r.S.salary; t.ex += r.S.extra; t.inc += r.S.inc; t.pay += r.S.pay; t.paid += paidSum(r.paid); return t; }, {sal:0, ex:0, inc:0, pay:0, paid:0});
  return `<div class="kpis">${kpi('Payable ' + esc(monthLabel(a.month)), inr(T.pay), plural(rows.length, 'staff member'))}${kpi('Paid', inr(T.paid), 'recorded as clinic expenses')}${kpi('Still to pay', inr(Math.max(0, T.pay - T.paid)), a.month < todayKey.slice(0, 7) ? 'for this month' : 'so far this month', T.pay - T.paid > 0 ? 'neg' : '')}</div>
    <div class="awrap"><table class="atbl"><thead><tr><th>Staff</th><th class="num">Present</th><th class="num">Loss of pay</th><th class="num">Salary</th><th class="num">Extra hours</th><th class="num">Extra days / Sundays</th>${feat('clinic') ? '<th class="num">Incentive</th>' : ''}<th class="num">Payable</th><th class="num">Paid</th><th></th></tr></thead><tbody>
    ${rows.map(({a:m, S, paid}) => { const pd = paidSum(paid), due = Math.max(0, Math.round(S.pay) - pd);
      return `<tr data-sal="${esc(m.uid)}"><td><b>${esc(fullName(m))}</b><span class="sub2">${esc(titleOf(m) || '')}${+S.c.salary ? ' · ' + inr(S.c.salary) + '/month' : ' · <span class="neg">salary not set</span>'}</span></td>
        <td class="num">${S.P}</td><td class="num ${S.lop ? 'neg' : ''}">${S.lop ? S.lop + ' d · − ' + inr(S.lopAmt) : '—'}</td><td class="num">${inr(S.salary)}</td>
        <td class="num">${S.OT ? hm(S.OT) + ' · ' + inr(S.otHrPay) : '—'}</td><td class="num">${S.otDays || S.sun ? `${S.otDays} d · ${inr(S.otDayPay)}${S.sun ? `<span class="sub2">${plural(S.sun, 'Sunday')} worked</span>` : ''}` : '—'}</td>
        ${feat('clinic') ? `<td class="num">${S.inc ? inr(S.inc) : '—'}</td>` : ''}<td class="num"><b>${inr(S.pay)}</b></td>
        <td class="num">${pd ? `<span class="upill on">${inr(pd)}</span>` : '—'}</td>
        <td style="white-space:nowrap">${w && due > 0 ? `<button class="primary" data-salpay="${Math.round(due)}">Pay ${inr(due)}</button>` : ''}${w && paid.length ? ` <button class="linkb" data-salundo="${esc(paid.map(x => x.id).join(','))}" title="Remove the payment entry">Undo</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="10" class="stat">No staff yet.</td></tr>'}
    ${rows.length ? `<tr class="tot"><td colspan="3">Total</td><td class="num">${inr(T.sal)}</td><td colspan="2" class="num">${inr(T.ex)}</td>${feat('clinic') ? `<td class="num">${inr(T.inc)}</td>` : ''}<td class="num">${inr(T.pay)}</td><td class="num">${inr(T.paid)}</td><td></td></tr>` : ''}
    </tbody></table></div>
    <p class="stat">Payable = salary (less loss of pay beyond ${OFFS_PER_MONTH} offs) + extra hours (beyond the work timing) + extra days worked on offs / Sundays${feat('clinic') ? ' + incentives from approved patient assists' : ''}. Set each person's salary and work timing in Attendance → the person. <b>Pay</b> records the salary as a clinic expense (category "Staff salary").</p>`;
}
