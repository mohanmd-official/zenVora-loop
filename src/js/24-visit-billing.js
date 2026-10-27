/* ---------- visit billing: after the summary, take payment and print, then complete the visit ---------- */
async function clOpenBill(appt){
  const {F} = cloud;
  cl.bill = {appt, p:null, T:null, P:null, noPay:false};
  $('#clOv').classList.add('on'); $('#clOvBody').innerHTML = '<div class="empty">Loading the bill…</div>';
  try {
    const [ps, ts, pays] = await Promise.all([F.getDoc(cDoc('patients', appt.patientId)), F.getDocs(F.query(cCol('treatments'), F.where('patientId', '==', appt.patientId))),
      can('billing') ? F.getDocs(F.query(cCol('payments'), F.where('patientId', '==', appt.patientId))) : Promise.resolve({docs:[]})]);
    Object.assign(cl.bill, {p:Object.assign({id:appt.patientId}, ps.exists() ? ps.data() : {first:appt.patientName}), T:docsOf(ts), P:docsOf(pays)});
    drawBill();
  } catch(e){ $('#clOvBody').innerHTML = `<div class="auth-err">${esc(errText(e))}</div><button data-ovclose>Close</button>`; }
}
function drawBill(){
  const B = cl.bill, a = B.appt, visitT = B.T.filter(t => t.appointmentId === a.id), visitNet = visitT.filter(t => t.status !== 'planned').reduce((s, t) => s + net(t), 0);
  const due = billed(B.T) - paidSum(B.P), visitPays = B.P.filter(x => x.appointmentId === a.id), w = canW('billing'), done = visitPays.length > 0;
  $('#clOvBody').innerHTML = `<div class="ah">${canW('treatments') ? '<button type="button" class="abk" data-vbback style="margin:0" title="Go back and change the treatments or medicines">← Back</button>' : ''}<h2 style="font-size:16px;margin:0">Bill · ${esc(pName(B.p))} <span class="pcode">${esc(B.p.code || '')}</span></h2><span class="sp"></span><button data-ovclose>Close</button></div>
    <p class="stat" style="margin:4px 0 10px">Visit ${esc(fmtShort(a.date))} ${esc(hm12(a.time))} · ${esc(dName(a.doctorId))}</p>
    <div class="hh" style="margin-top:0">Treatments</div>
    <div class="awrap" style="margin-top:4px"><table class="atbl"><thead><tr><th>Treatment</th><th>Doctor</th><th>Status</th><th class="num">Cost</th><th class="num">Discount</th><th class="num">Net</th></tr></thead><tbody>
      ${visitT.filter(t => !isMed(t)).map(t => `<tr><td><b>${esc(t.typeName)}</b>${t.tooth ? `<span class="sub2">Tooth / area ${esc(t.tooth)}</span>` : ''}</td><td>${esc(dName(t.doctorId))}</td><td>${TSTATUS[t.status][0]}</td><td class="num">${inr(t.cost)}</td><td class="num">${+t.discount ? inr(t.discount) : '—'}</td><td class="num"><b>${t.status === 'planned' ? '<span class="stat">not billed</span>' : inr(net(t))}</b></td></tr>`).join('') || '<tr><td colspan="6" class="stat">No treatments were added for this visit.</td></tr>'}
    </tbody></table></div>
    ${visitT.some(isMed) ? `<div class="hh">Medicines</div>
    <div class="awrap" style="margin-top:4px"><table class="atbl"><thead><tr><th>Medicine</th><th>Morning – Afternoon – Evening – Night</th><th class="num">Days</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>
      ${visitT.filter(isMed).map(t => `<tr><td><b>${esc(t.typeName)}</b>${t.unit && !/tablet|capsule/i.test(t.unit) ? `<span class="sub2">${esc(t.unit)}</span>` : ''}</td><td>${medDose(t)}</td><td class="num">${+t.days || '—'}</td><td class="num">${+t.qty || 0}</td><td class="num">${inr(t.unitPrice)}</td><td class="num"><b>${inr(net(t))}</b></td></tr>`).join('')}
      <tr class="tot"><td colspan="5">Medicines total</td><td class="num">${inr(visitT.filter(isMed).reduce((s2, t) => s2 + net(t), 0))}</td></tr>
    </tbody></table></div>` : ''}
    <div class="box billbox" style="margin-top:10px">
      <div class="payrow"><span>This visit</span><span>${inr(visitNet)}</span></div>
      <div class="payrow"><span>Earlier balance</span><span>${inr(due - visitNet + paidSum(visitPays))}</span></div>
      <div class="payrow"><span>Paid in this visit</span><span>${visitPays.length ? '− ' + inr(paidSum(visitPays)) : inr(0)}</span></div>
      <div class="payrow"><span>Balance due now</span><span class="${due > 0 ? 'neg' : ''}">${inr(due)}</span></div></div>
    ${w ? `<form class="aform" id="clVBill" novalidate style="margin-top:10px">
        <label>Bill date<input type="date" id="vbDate" value="${a.date <= todayKey ? a.date : todayKey}" max="${todayKey}" title="The day this payment is counted in collections and the daily tally"></label>
        <label>Amount (₹)<input type="number" id="vbAmt" min="1" value="${due > 0 ? due : ''}"></label>
        <label>Mode<select id="vbMode">${PMODES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="grow">Note<input id="vbNote" placeholder="e.g. OPG + consultation"></label>
        <button class="primary" type="submit">Save payment</button></form>` : '<p class="stat">You don\'t have Billing access: the front desk will take the payment from the queue (status "At billing").</p>'}
    ${visitPays.length ? `<div class="hh">Receipts for this visit</div>${visitPays.map(x => `<div class="trow"><b>${esc(x.receiptNo)} · ${inr(x.amount)} · ${esc((PMODES.find(m => m[0] === x.mode) || [0, x.mode])[1])}</b><button data-vbrcpt="${esc(x.id)}">🖨 Print receipt</button></div>`).join('')}` : ''}
    <div class="btnrow" style="margin-top:14px">
      <button data-vbprint>🖨 Print bill</button><span class="sp"></span>
      ${w ? `<label class="vbchk" title="Complete the visit without taking a payment"><input type="checkbox" id="vbNoPay"${B.noPay ? ' checked' : ''}> <b>No bill</b>&nbsp;${visitNet > 0 ? `(no payment now: ${inr(due)} stays due)` : '(nothing to charge for this visit)'}</label>
        <button class="primary" id="vbDone"${done || B.noPay ? '' : ' disabled'}>Complete visit ✓</button>` : '<button id="vbLeave">Leave for billing</button>'}</div>`;
  numberTables($('#clOvBody'));
}
function printVisitBill(){
  const B = cl.bill, a = B.appt, visitT = B.T.filter(t => t.appointmentId === a.id && t.status !== 'planned'), visitPays = B.P.filter(x => x.appointmentId === a.id), due = billed(B.T) - paidSum(B.P);
  printDoc('Bill', `<p><b>Patient:</b> ${esc(pName(B.p))} (${esc(B.p.code || '')}) · ${esc(B.p.phone || '')}<br><b>Visit:</b> ${esc(fmtLong(a.date))} · ${esc(dName(a.doctorId))}</p>
    <h2>Treatments</h2><table><tr><th>#</th><th>Treatment</th><th>Doctor</th><th class="n">Cost</th><th class="n">Discount</th><th class="n">Amount</th></tr>
    ${visitT.filter(t => !isMed(t)).map((t, i) => `<tr><td>${i + 1}</td><td>${esc(t.typeName)}${t.tooth ? ' (' + esc(t.tooth) + ')' : ''}</td><td>${esc(dName(t.doctorId))}</td><td class="n">${inr(t.cost)}</td><td class="n">${inr(t.discount)}</td><td class="n">${inr(net(t))}</td></tr>`).join('')}</table>
    ${visitT.some(isMed) ? `<h2>Medicines</h2><table><tr><th>#</th><th>Medicine</th><th>M-A-E-N</th><th class="n">Days</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th></tr>
    ${visitT.filter(isMed).map((t, i) => `<tr><td>${i + 1}</td><td>${esc(t.typeName)}</td><td>${DOSE.some(([k]) => t.dose && t.dose[k]) ? doseTxt(t.dose) : '—'}</td><td class="n">${+t.days || '—'}</td><td class="n">${+t.qty || 0}</td><td class="n">${inr(t.unitPrice)}</td><td class="n">${inr(net(t))}</td></tr>`).join('')}</table>` : ''}
    <table><tr class="tot"><td>Total for this visit</td><td class="n">${inr(visitT.reduce((s, t) => s + net(t), 0))}</td></tr></table>
    ${visitPays.length ? `<h2>Payments</h2><table>${visitPays.map(x => `<tr><td>${esc(x.receiptNo)}</td><td>${esc((PMODES.find(m => m[0] === x.mode) || [0, x.mode])[1])}</td><td class="n">${inr(x.amount)}</td></tr>`).join('')}</table>` : ''}
    <p><b>Balance due: ${inr(due)}</b></p>`);
}
async function saveVisitPayment(){
  const {F} = cloud, B = cl.bill, a = B.appt, amount = Math.round(+$('#vbAmt').value || 0);
  if (amount <= 0) return info('Enter the amount received.');
  if ((($('#vbDate') || {}).value || '') > todayKey) return info("The bill date can't be in the future.");
  try {
    const receiptNo = await nextNumber('receipt', 'R-', 5);
    const x = {patientId:a.patientId, patientName:a.patientName, appointmentId:a.id, date:($('#vbDate') || {}).value || todayKey, amount, mode:$('#vbMode').value, doctorId:a.doctorId, note:$('#vbNote').value.trim(), receiptNo, createdAt:Date.now(), by:cloud.user.email || ''};
    const ref = await F.addDoc(cCol('payments'), x);
    B.P.push(Object.assign({id:ref.id}, x)); drawBill(); info(`${inr(amount)} received · ${receiptNo}`);
  } catch(e){ info('Could not save: ' + errText(e)); }
}
$('#clOv').addEventListener('click', async e => {
  if (!cl.bill || !e.target.closest('#clOvBody')) return;
  if (e.target.closest('[data-vbprint]')) return printVisitBill();
  const rc = e.target.closest('[data-vbrcpt]'); if (rc){ const x = cl.bill.P.find(p => p.id === rc.dataset.vbrcpt); return printReceipt(x, {p:cl.bill.p, T:cl.bill.T, P:cl.bill.P}); }
  if (e.target.id === 'vbNoPay'){ cl.bill.noPay = e.target.checked; $('#vbDone').disabled = !(cl.bill.noPay || cl.bill.P.some(x => x.appointmentId === cl.bill.appt.id)); return; }
  if (e.target.closest('#vbLeave')){ $('#clOv').classList.remove('on'); cl.bill = null; return; }
  if (e.target.closest('#vbDone')){
    try { await cloud.F.updateDoc(cDoc('appointments', cl.bill.appt.id), {status:'completed', completedAt:Date.now(), billed:!cl.bill.noPay || cl.bill.P.some(x => x.appointmentId === cl.bill.appt.id)}); } catch(err){ return info(errText(err)); }
    $('#clOv').classList.remove('on'); info(`${cl.bill.appt.patientName}'s visit is completed.`); cl.bill = null; clinicSync(true); renderClinic();
  }
});
$('#clOv').addEventListener('submit', e => { if (e.target.id === 'clVBill'){ e.preventDefault(); saveVisitPayment(); } });

