/* ---------- visit billing: after the summary, take payment and print, then complete the visit ---------- */
async function clOpenBill(appt){
  const {F} = cloud;
  cl.bill = {appt, p:null, T:null, P:null, bill:null, noPay:false};
  $('#clOv').classList.add('on'); $('#clOvBody').innerHTML = '<div class="empty">Loading the bill…</div>';
  try {
    const [ps, ts, pays] = await Promise.all([F.getDoc(cDoc('patients', appt.patientId)), F.getDocs(F.query(cCol('treatments'), F.where('patientId', '==', appt.patientId))),
      can('billing') ? F.getDocs(F.query(cCol('payments'), F.where('patientId', '==', appt.patientId))) : Promise.resolve({docs:[]})]);
    Object.assign(cl.bill, {p:Object.assign({id:appt.patientId}, ps.exists() ? ps.data() : {first:appt.patientName}), T:docsOf(ts), P:docsOf(pays)});
    cl.bill.B = can('billing') ? docsOf(await F.getDocs(F.query(cCol('bills'), F.where('patientId', '==', appt.patientId)))).filter(billLive) : [];
    cl.bill.bill = appt.billId ? cl.bill.B.find(b => b.id === appt.billId) || null : null;
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
    ${visitBillHtml(B, visitT, w)}`;
  numberTables($('#clOvBody'));
  if ($('#vbCash')) cashRefresh('vb');
}
const vbCtx = () => ({p:cl.bill.p, T:cl.bill.T, P:cl.bill.P, B:cl.bill.B});
function visitBillHtml(B, visitT, w){
  const b = B.bill, done = !!b || B.noPay, bp = b ? B.P.filter(x => x.billId === b.id) : [], billable = visitT.filter(t => t.status !== 'planned');
  const head = b ? `<div class="box billbox vbill"><div class="crow"><b>Bill ${esc(b.billNo)}</b> ${billBadge(b)}<span class="sp"></span><span>Total <b>${inr(b.total)}</b></span><span>Paid <b>${inr(b.paid)}</b></span><span>Outstanding <b class="${billDue(b) ? 'neg' : ''}">${inr(billDue(b))}</b></span></div>
      <div class="btnrow" style="margin-top:8px">${w && b.status === 'draft' ? '<button class="primary" data-vbissue>Issue bill</button>' : ''}${w && ['pending', 'ack'].includes(b.status) && !+b.paid ? '<button data-vbreopen title="Back to a draft so the treatments can be corrected">Reopen to edit</button>' : ''}<button data-vbprint>🖨 Print bill</button></div>
      ${w && (billPayable(b) || otherDues(b, vbCtx()).total > 0) ? payForm('vb', b, vbCtx()) : ''}</div>`
    : w ? `<div class="box billbox vbill"><div class="crow"><b>No bill yet for this visit</b><span class="sp"></span>${billable.length ? '<button class="primary" data-vbgen>Generate bill</button><button data-vbdraft>Save as draft</button>' : '<span class="stat">no treatment to bill</span>'}</div></div>` : '';
  return head + (bp.length ? `<div class="hh">Receipts for this bill</div>${bp.map(x => `<div class="trow"><b>${esc(x.receiptNo)} · ${inr(x.amount)} · ${esc((PMODES.find(m => m[0] === x.mode) || [0, x.mode])[1])}</b>${x.cash ? `<span class="stat">${esc(cashLine(x))}</span>` : ''}<button data-vbrcpt="${esc(x.id)}">🖨 Print receipt</button></div>`).join('')}` : '')
    + `<div class="btnrow" style="margin-top:14px">${b ? '' : '<button data-vbprint>🖨 Print estimate</button>'}<span class="sp"></span>
      ${w ? `${b ? '' : `<label class="vbchk" title="Complete the visit without a bill"><input type="checkbox" id="vbNoPay"${B.noPay ? ' checked' : ''}> <b>No bill</b>&nbsp;(nothing to charge)</label>`}
        <button class="primary" id="vbDone"${done ? '' : ' disabled'}>${b && billDue(b) ? `Complete visit · ${inr(billDue(b))} outstanding ✓` : 'Complete visit ✓'}</button>` : '<button id="vbLeave">Leave for billing</button>'}</div>`;
}
function printVisitBill(){
  if (cl.bill.bill) return printBill(cl.bill.bill, cl.bill.p, cl.bill.P);
  // no bill yet: an estimate of this visit's treatments and medicines, on the same sheet
  const B = cl.bill, a = B.appt, items = B.T.filter(t => t.appointmentId === a.id && t.status !== 'planned').map(billItem);
  printBill(Object.assign({billNo:'', date:a.date, appointmentId:a.id, doctorId:a.doctorId, items}, billSums(items)), B.p, B.P, 'ESTIMATE');
}
async function saveVisitPayment(){
  const {F} = cloud, B = cl.bill, a = B.appt; if (!B.bill) return;
  try {
    const xs = await payWithDues(B.bill, 'vb', vbCtx()), x = xs[0] || {};
    xs.forEach(y => B.P.push(y)); drawBill(); info(xs.map(y => `${inr(y.amount)} on ${y.billNo} · ${y.receiptNo}`).join(' · '));
    // back-entry: the bill is dated earlier than the visit → offer to move the visit and its treatments to the bill date too,
    // so reports (collection, treatments, new patients, appointments) all show the same day
    if (x.date < a.date && confirm(`The bill is dated ${fmtLong(x.date)} but this visit is on ${fmtLong(a.date)}. Move the visit and its treatments to ${fmtLong(x.date)} as well?`)){
      try { const vt = B.T.filter(t => t.appointmentId === a.id), b = F.writeBatch(cloud.fs);
        b.update(cDoc('appointments', a.id), {date:x.date, movedFrom:a.date + ' ' + (a.time || ''), movedAt:Date.now()}); vt.forEach(t => b.update(cDoc('treatments', t.id), {date:x.date}));
        await b.commit(); vt.forEach(t => t.date = x.date); a.date = x.date; drawBill(); info(`Visit and ${plural(vt.length, 'treatment')} moved to ${fmtShort(x.date)}.`); }
      catch(e){ info('The payment is saved, but the visit could not be moved: ' + errText(e)); }
    }
  } catch(e){ info('Could not save: ' + errText(e)); }
}
$('#clOv').addEventListener('click', async e => {
  if (!cl.bill || !e.target.closest('#clOvBody')) return;
  if (e.target.closest('[data-vbprint]')) return printVisitBill();
  const rc = e.target.closest('[data-vbrcpt]'); if (rc){ const x = cl.bill.P.find(p => p.id === rc.dataset.vbrcpt); return printReceipt(x, vbCtx()); }
  if (e.target.id === 'vbNoPay'){ cl.bill.noPay = e.target.checked; $('#vbDone').disabled = !(cl.bill.noPay || cl.bill.bill); return; }
  const B = cl.bill, vt = () => B.T.filter(t => t.appointmentId === B.appt.id && t.status !== 'planned');
  try {
    if (e.target.closest('[data-vbgen],[data-vbdraft]')){ const dr = !!e.target.closest('[data-vbdraft]'); B.bill = await createBill({p:B.p, appt:B.appt, T:vt(), status:dr ? 'draft' : 'ack'}); (B.B = B.B || []).push(B.bill); B.appt.billId = B.bill.id; vt().forEach(t => { if (!dr) t.billId = B.bill.id; }); info(`${B.bill.billNo} ${dr ? 'saved as a draft' : 'generated'} · ${inr(B.bill.total)}`); return drawBill(); }
    if (e.target.closest('[data-vbissue]')){ await issueBill(B.bill, vt()); info(`${B.bill.billNo} issued.`); return drawBill(); }
    if (e.target.closest('[data-vbreopen]')){ await reopenBill(B.bill); info(`${B.bill.billNo} is a draft again: ← Back to change the treatments.`); return drawBill(); }
    if (e.target.closest('[data-vback]')){ await ackBill(B.bill); info(`${B.bill.billNo} acknowledged.`); return drawBill(); }
  } catch(err){ return info(errText(err)); }
  if (e.target.closest('#vbLeave')){ $('#clOv').classList.remove('on'); cl.bill = null; return; }
  if (e.target.closest('#vbDone')){
    try { await cloud.F.updateDoc(cDoc('appointments', cl.bill.appt.id), {status:'completed', completedAt:Date.now(), billed:!!cl.bill.bill}); } catch(err){ return info(errText(err)); }
    $('#clOv').classList.remove('on'); info(`${cl.bill.appt.patientName}'s visit is completed.`); cl.bill = null; clinicSync(true); renderClinic();
  }
});
$('#clOv').addEventListener('submit', e => { if (e.target.id === 'clVBill'){ e.preventDefault(); saveVisitPayment(); } });

