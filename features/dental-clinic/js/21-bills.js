/* ---------- Bills: a bill is its own record, separate from payments ----------
   bills/{id} {billNo B-00001, patientId, patientName, appointmentId, date, doctorId, items[{treatmentId, name, tooth, doctorId, cost, discount, net, legacy}],
   subtotal, discount, total, paid, status, ackBy, ackAt, lastPay, cancel{reason, by, at, payments}, replaces, replacedBy, createdBy, createdAt, history}
   Status: draft → ack (Unpaid) → partly → paid; any → cancelled (never deleted). ('pending' = older bills awaiting acknowledgement: treated as Unpaid.)
   - A draft may be edited. Issuing it puts its treatments on the bill (treatments.billId): they are then locked until the bill is cancelled.
   - Each payment is its own record (payments, with billId) written in the same batch as the bill's new `paid` total and `lastPay`;
     the rules check paid = old paid + this payment and paid ≤ total, so a double click or a second screen can't record it twice.
   - A bill with payments is never edited: cancel it with a reason, and either move its payments to a fresh bill (same treatments,
     new number) or refund them (a refund is a payment record with a negative amount: it shows in collections and the daily tally).
   - One live bill per visit: the appointment holds billId; another bill for it is refused unless that one is cancelled.
   - The patient's balance is still treatments − payments (unchanged for old records); bills formalize visits from BILLS_SINCE on.
     Older unpaid treatments can be billed as one "Earlier balance" item. */
const BILLS_SINCE = '2026-11-02';
const BST = {draft:['Draft', 'pend'], pending:['Unpaid', 'prog'], ack:['Unpaid', 'prog'], partly:['Partly paid', 'pend'], paid:['Paid', 'on'], cancelled:['Cancelled', 'gone']};
const billBadge = b => `<span class="upill ${BST[b.status][1]}">${BST[b.status][0]}</span>`;
const billLive = b => !!b && b.status !== 'cancelled';
const billDue = b => Math.max(0, (+b.total || 0) - (+b.paid || 0));
const billPayable = b => ['pending', 'ack', 'partly'].includes(b.status) && billDue(b) > 0;
// edit an issued bill or a payment, with a reason (Owner, Account Manager, or the "Edit / cancel bills" permission)
const canEditMoney = () => canW('billing') && (isAdminRole(orgCtx().role) || can('cancelBills') === true);
const histNote = h => (h || []).filter(x => x.reason).map(x => `${fmt(x.at)} · ${String(x.by || '').split('@')[0]}: ${x.change}${x.reason ? ' (' + x.reason + ')' : ''}`).join('\n');
const editedTag = x => (x.history || []).some(h => h.reason && /^edited/.test(h.change || '')) ? ` <span class="upill pend" title="${esc(histNote(x.history))}">edited</span>` : '';
const canCancelBill = b => canW('billing') && (!(+b.paid) || isAdminRole(orgCtx().role) || can('cancelBills') === true);
const liveBillIds = B => new Set((B || []).filter(billLive).map(b => b.id));
// a treatment is locked while it is on a live, issued bill
const tLocked = (t, B) => !!t.billId && (B || []).some(b => b.id === t.billId && billLive(b) && b.status !== 'draft');
const billItem = t => Object.assign({treatmentId:t.id, name:t.typeName || '', tooth:t.tooth || '', doctorId:t.doctorId || '', cost:+t.cost || 0, discount:+t.discount || 0, net:net(t), med:isMed(t)}, isMed(t) ? {qty:+t.qty || 0, unitPrice:+t.unitPrice || 0} : {});
const billSums = items => { const subtotal = items.reduce((s, i) => s + (+i.cost || 0), 0), discount = items.reduce((s, i) => s + (+i.discount || 0), 0); return {subtotal, discount, total:Math.max(0, subtotal - discount)}; };
// treatments that can go on a new bill: done, not on a live issued bill, from BILLS_SINCE (older ones are covered by "Earlier balance")
const unbilledOf = (T, B) => (T || []).filter(t => t.status !== 'planned' && t.date >= BILLS_SINCE && !(t.billId && liveBillIds(B).has(t.billId)));
// what is still owed from before bills: old treatments − payments without a bill − earlier-balance items already billed
function earlierDue(T, P, B){
  const old = (T || []).filter(t => t.status !== 'planned' && t.date < BILLS_SINCE && !(t.billId && liveBillIds(B).has(t.billId))).reduce((s, t) => s + net(t), 0);
  const paid = paidSum((P || []).filter(x => !x.billId)), used = (B || []).filter(billLive).reduce((s, b) => s + (b.items || []).filter(i => i.legacy).reduce((a, i) => a + (+i.net || 0), 0), 0);
  return Math.max(0, old - paid - used);
}
// create a bill (draft or issued). appt optional. items from treatments (+ an optional earlier-balance item)
async function createBill({p, appt, T, status, legacy, carry}){
  const {F, fs} = cloud, by = cloud.user.email || '', items = T.map(billItem).concat(legacy ? [{treatmentId:'', name:'Earlier balance (before bills)', tooth:'', doctorId:'', cost:legacy, discount:0, net:legacy, legacy:true}] : []);
  if (!items.length) throw custom('Choose the treatments to bill.');
  const billNo = await nextNumber('bill', 'B-', 5), ref = F.doc(cCol('bills')), b = F.writeBatch(fs);
  const x = Object.assign({billNo, patientId:p.id, patientName:pName(p), appointmentId:appt ? appt.id : '', date:appt ? (appt.date <= todayKey ? appt.date : todayKey) : todayKey, doctorId:appt ? appt.doctorId || '' : (T[0] || {}).doctorId || '',
    items, paid:carry ? carry.paid : 0, status, ackBy:'', ackAt:0, lastPay:'', replaces:carry ? carry.id : '', replacedBy:'', createdBy:by, createdAt:Date.now(), history:[]}, billSums(items));
  b.set(ref, x);
  if (status !== 'draft') T.forEach(t => b.update(cDoc('treatments', t.id), {billId:ref.id}));
  if (appt) b.update(cDoc('appointments', appt.id), {billId:ref.id});
  await b.commit();
  return Object.assign({id:ref.id}, x);
}
// issue a draft: refresh its items from the treatments now, lock them
async function issueBill(bill, T){
  const {F, fs} = cloud, items = T.map(billItem).concat((bill.items || []).filter(i => i.legacy)), b = F.writeBatch(fs);
  if (!items.length) throw custom('There is nothing on this bill.');
  const sums = billSums(items), pd = +bill.paid || 0;
  const upd = Object.assign({items, status:pd && pd >= sums.total ? 'paid' : pd ? 'partly' : 'ack', history:(bill.history || []).concat([{at:Date.now(), by:cloud.user.email || '', change:'issued'}])}, billSums(items));
  if (upd.total < (+bill.paid || 0)) throw custom(`The total ${inr(upd.total)} is less than the ${inr(bill.paid)} already paid on it.`);
  b.update(cDoc('bills', bill.id), upd); T.forEach(t => b.update(cDoc('treatments', t.id), {billId:bill.id}));
  await b.commit(); return Object.assign(bill, upd);
}
// a bill with no payment yet may be reopened to a draft to correct its treatments (logged in its history)
async function reopenBill(bill){
  if (+bill.paid) throw custom('This bill has payments: cancel it instead.');
  const upd = {status:'draft', history:(bill.history || []).concat([{at:Date.now(), by:cloud.user.email || '', change:'reopened to edit'}])};
  await cloud.F.updateDoc(cDoc('bills', bill.id), upd); return Object.assign(bill, upd);
}
async function ackBill(bill){
  const upd = {status:'ack', ackBy:cloud.user.email || '', ackAt:Date.now(), history:(bill.history || []).concat([{at:Date.now(), by:cloud.user.email || '', change:'acknowledged'}])};
  await cloud.F.updateDoc(cDoc('bills', bill.id), upd); return Object.assign(bill, upd);
}
// a payment against a bill (pending bills are acknowledged by taking the payment)
async function payBill(bill, pre, date){
  const amount = Math.round(+$('#' + pre + 'Amt').value || 0), mode = $('#' + pre + 'Mode').value, due = billDue(bill);
  if (amount <= 0) throw custom('Enter the amount received.');
  if (amount > due) throw custom(`That's more than the ${inr(due)} outstanding on ${bill.billNo}.`);
  if ((date || todayKey) > todayKey) throw custom("The payment date can't be in the future.");
  const cash = mode === 'cash' ? cashRead(pre, amount) : null, receiptNo = await nextNumber('receipt', 'R-', 5);
  const x = {patientId:bill.patientId, patientName:bill.patientName, appointmentId:bill.appointmentId || '', billId:bill.id, billNo:bill.billNo, kind:'payment', date:date || todayKey, amount, mode,
    txnRef:(($('#' + pre + 'Ref') || {}).value || '').trim(), doctorId:bill.doctorId || '', note:(($('#' + pre + 'Note') || {}).value || '').trim(), receiptNo, createdAt:Date.now(), by:cloud.user.email || ''};
  if (cash) x.cash = cash;
  const paid = (+bill.paid || 0) + amount, upd = {paid, status:paid >= bill.total ? 'paid' : 'partly'};
  if (bill.status === 'pending') Object.assign(upd, {ackBy:cloud.user.email || '', ackAt:Date.now()});
  const ref = await savePaymentDoc(x, bill.id, upd); CDX[pre] = 0;
  Object.assign(bill, upd, {lastPay:ref.id});
  return Object.assign({id:ref.id}, x);
}
// cancel: reason required; payments moved to a fresh draft bill, or refunded (negative payment)
async function cancelBill(bill, T){
  if (!canCancelBill(bill)) throw custom('Only the Owner, Account Manager or someone with "Cancel bills" may cancel a bill that has payments.');
  const reason = prompt(`Cancel ${bill.billNo} (${inr(bill.total)})?\n\nThe bill is kept, marked Cancelled. Reason (required):`, ''); if (reason === null) return null;
  if (!reason.trim()) throw custom('Enter the reason for cancelling.');
  let how = 'none';
  if (+bill.paid > 0){
    const a = prompt(`${inr(bill.paid)} has been paid on ${bill.billNo}.\n\nType 1 to MOVE it to a fresh bill (same treatments, new number; no money changes hands)\nType 2 to REFUND it to the patient`, '1');
    if (a === null) return null; how = a.trim() === '2' ? 'refunded' : 'moved';
  }
  const {F, fs} = cloud, by = cloud.user.email || '', now = Date.now(), b = F.writeBatch(fs), upd = {status:'cancelled', cancel:{reason:reason.trim(), by, at:now, payments:how}, history:(bill.history || []).concat([{at:now, by, change:'cancelled', reason:reason.trim()}])};
  let fresh = null, refund = null;
  if (how === 'moved'){
    const ref = F.doc(cCol('bills')), billNo = await nextNumber('bill', 'B-', 5);
    fresh = {billNo, patientId:bill.patientId, patientName:bill.patientName, appointmentId:bill.appointmentId || '', date:todayKey, doctorId:bill.doctorId || '', items:bill.items, subtotal:bill.subtotal, discount:bill.discount, total:bill.total,
      paid:bill.paid, status:'draft', ackBy:'', ackAt:0, lastPay:'', replaces:bill.id, replacedBy:'', createdBy:by, createdAt:now, history:[{at:now, by, change:`replaces ${bill.billNo} (payments of ${inr(bill.paid)} moved)`, reason:reason.trim()}]};
    b.set(ref, fresh); upd.replacedBy = ref.id; fresh.id = ref.id;
    if (bill.appointmentId) b.update(cDoc('appointments', bill.appointmentId), {billId:ref.id});
  }
  if (how === 'refunded'){
    const mode = (prompt('Refund how? cash, upi, card, ccard, bank', 'cash') || 'cash').trim().toLowerCase(), receiptNo = await nextNumber('receipt', 'R-', 5);
    refund = {patientId:bill.patientId, patientName:bill.patientName, appointmentId:bill.appointmentId || '', billId:bill.id, billNo:bill.billNo, kind:'refund', date:todayKey, amount:-(+bill.paid), mode:PMODES.some(m => m[0] === mode) ? mode : 'cash', txnRef:'', doctorId:bill.doctorId || '', note:'Refund: ' + reason.trim(), receiptNo, createdAt:now, by};
    b.set(F.doc(cCol('payments')), refund);
  }
  b.update(cDoc('bills', bill.id), upd);
  F.addDoc(cloud.F.collection(cloud.fs, 'orgs', orgCtx().orgId, 'audit'), {at:now, by, byName:fullName(orgCtx().me) || '', type:'bill', target:{id:bill.id, billNo:bill.billNo, patientId:bill.patientId}, before:{status:bill.status, total:bill.total, paid:bill.paid}, after:{status:'cancelled', payments:how, fresh:fresh ? fresh.billNo : ''}, change:'cancelled', reason:reason.trim()}).catch(() => {});
  await b.commit(); Object.assign(bill, upd);
  return {fresh, refund, how};
}
function printBill(bill, p, P){
  const pays = (P || []).filter(x => x.billId === bill.id), I = bill.items || [], TR = I.filter(i => !i.med), MD = I.filter(i => i.med);
  const sum = xs => xs.reduce((a, i) => a + (+i.net || 0), 0), trT = sum(TR), mdT = sum(MD);
  printDoc('Bill ' + bill.billNo, `<p><b>Patient:</b> ${esc(pName(p))} (${esc(p.code || '')}) · ${esc(p.phone || '')}<br><b>Bill date:</b> ${esc(fmtLong(bill.date))}${bill.doctorId ? ` · <b>Doctor:</b> ${esc(dName(bill.doctorId))}` : ''}</p>
    ${TR.length ? `<h2>Treatments</h2><table><tr><th>#</th><th>Treatment</th><th>Doctor</th><th class="n">Charge</th><th class="n">Discount</th><th class="n">Amount</th></tr>
      ${TR.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}${i.tooth ? ' (' + esc(i.tooth) + ')' : ''}</td><td>${esc(dName(i.doctorId) || '')}</td><td class="n">${inr(i.cost)}</td><td class="n">${+i.discount ? inr(i.discount) : '—'}</td><td class="n">${inr(i.net)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5">Treatments total</td><td class="n">${inr(trT)}</td></tr></table>` : ''}
    ${MD.length ? `<h2>Medicines</h2><table><tr><th>#</th><th>Medicine</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th></tr>
      ${MD.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}</td><td class="n">${+i.qty || '—'}</td><td class="n">${i.unitPrice ? inr(i.unitPrice) : '—'}</td><td class="n">${inr(i.net)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="4">Medicines total</td><td class="n">${inr(mdT)}</td></tr></table>` : ''}
    <h2>Summary</h2><table>${TR.length ? `<tr><td>Treatments</td><td class="n">${inr(trT)}</td></tr>` : ''}${MD.length ? `<tr><td>Medicines</td><td class="n">${inr(mdT)}</td></tr>` : ''}
      <tr class="tot"><td>Total</td><td class="n">${inr(bill.total)}</td></tr><tr><td>Paid</td><td class="n">${inr(bill.paid)}</td></tr><tr class="tot"><td>Balance due</td><td class="n">${inr(billDue(bill))}</td></tr></table>
    ${pays.length ? `<h2>Payments</h2><table>${pays.map(x => `<tr><td>${esc(x.receiptNo)}</td><td>${esc(fmtShort(x.date))}</td><td>${esc((PMODES.find(m => m[0] === x.mode) || [0, x.mode])[1])}${x.txnRef ? ' · ' + esc(x.txnRef) : ''}</td><td class="n">${inr(x.amount)}</td></tr>`).join('')}</table>` : ''}`);
}
// payment form for a bill (prefix vb: visit, py: patient's Bills tab)
const payForm = (pre, b) => `<form class="aform payf" id="${pre === 'vb' ? 'clVBill' : 'clPayForm'}" data-bill="${esc(b.id)}" novalidate style="margin-top:8px">
  <label>Payment date<input type="date" id="${pre}Date" value="${todayKey}" max="${todayKey}" title="The day this payment counts in collections and the daily tally"></label>
  <label>Amount (₹)<input type="number" id="${pre}Amt" min="1" max="${billDue(b)}" value="${billDue(b)}"></label>
  <label>Method<select id="${pre}Mode">${PMODES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
  <label>Transaction ref.<input id="${pre}Ref" placeholder="UPI / card ref (optional)"></label>
  <label class="grow">Note<input id="${pre}Note" placeholder="e.g. first instalment"></label>
  <button class="primary" type="submit">Save payment &amp; receipt</button>${cashPanel(pre, true)}</form>`;
/* ---------- patient card: Bills and Payments tabs ---------- */
function clBills(){
  if (cl.pB === null || cl.pT === null) return '<div class="empty">Loading…</div>';
  const B = (cl.pB || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0)), w = canW('billing');
  const U = unbilledOf(cl.pT, cl.pB), ed = earlierDue(cl.pT, cl.pP, cl.pB), live = B.filter(billLive), open = cl.billOpen;
  const tot = live.reduce((s, b) => s + (+b.total || 0), 0), paid = live.reduce((s, b) => s + (+b.paid || 0), 0);
  return `<div class="sect"><div class="kpis">${kpi('Total billed', inr(tot), plural(live.length, 'bill'))}${kpi('Paid on bills', inr(paid), '')}${kpi('Outstanding on bills', inr(tot - paid), live.filter(b => billDue(b) > 0).length + ' open', tot - paid > 0 ? 'neg' : '')}</div>
    ${w && (U.length || ed > 0) ? `<div class="box"><h3>New bill</h3><form id="clNewBill" novalidate>
      ${U.map(t => `<label class="ckl"><input type="checkbox" data-nbt="${esc(t.id)}" checked> ${esc(fmtShort(t.date))} · <b>${esc(t.typeName)}</b>${t.tooth ? ' (' + esc(t.tooth) + ')' : ''} · ${esc(dName(t.doctorId) || '')} · ${inr(net(t))}</label>`).join('')}
      ${ed > 0 ? `<label class="ckl"><input type="checkbox" id="nbLegacy"${U.length ? '' : ' checked'}> <b>Earlier balance (before bills)</b> · ${inr(ed)}</label>` : ''}
      <div class="btnrow"><button class="primary" type="submit">Generate bill</button><button type="button" data-nbdraft>Save as draft</button></div></form></div>` : ''}
    <div class="awrap" style="margin-top:0"><table class="atbl"><thead><tr><th>Bill</th><th>Date</th><th>Visit</th><th>Treatments</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Outstanding</th><th>Status</th><th></th></tr></thead><tbody>
    ${B.map(b => `<tr data-bill="${esc(b.id)}" class="clk${b.status === 'cancelled' ? ' gone' : ''}"><td><b>${esc(b.billNo)}</b>${b.replaces ? `<span class="sub2">replaces ${esc((B.find(x => x.id === b.replaces) || {}).billNo || '')}</span>` : ''}</td><td>${esc(fmtShort(b.date))}</td><td>${b.appointmentId ? esc(fmtShort(((cl.pA || []).find(a => a.id === b.appointmentId) || {}).date || b.date)) : '—'}</td>
      <td>${esc((b.items || []).map(i => i.name).join(', '))}</td><td class="num">${inr(b.total)}</td><td class="num">${inr(b.paid)}</td><td class="num ${billDue(b) && billLive(b) ? 'neg' : ''}">${billLive(b) ? inr(billDue(b)) : '—'}</td><td>${billBadge(b)}${editedTag(b)}${b.cancel ? `<span class="sub2">${esc(b.cancel.reason)}${b.cancel.payments === 'moved' ? ' · payments moved' : b.cancel.payments === 'refunded' ? ' · refunded' : ''}</span>` : ''}</td><td>${open === b.id ? '▾' : '▸'}</td></tr>
      ${open === b.id ? `<tr class="billx" data-bill="${esc(b.id)}"><td colspan="9">${billDetail(b)}</td></tr>` : ''}`).join('') || '<tr><td colspan="9" class="stat">No bills yet.</td></tr>'}
    </tbody></table></div></div>`;
}
function billDetail(b){
  const w = canW('billing'), pays = (cl.pP || []).filter(x => x.billId === b.id);
  return `<div class="awrap" style="margin:4px 0"><table class="atbl"><thead><tr><th>Treatment</th><th>Doctor</th><th class="num">Charge</th><th class="num">Discount</th><th class="num">Amount</th></tr></thead><tbody>
    ${(b.items || []).map(i => `<tr><td>${esc(i.name)}${i.tooth ? ' (' + esc(i.tooth) + ')' : ''}</td><td>${esc(dName(i.doctorId) || '')}</td><td class="num">${inr(i.cost)}</td><td class="num">${+i.discount ? inr(i.discount) : '—'}</td><td class="num">${inr(i.net)}</td></tr>`).join('')}
    <tr class="tot"><td colspan="4">Total</td><td class="num">${inr(b.total)}</td></tr></tbody></table></div>
    ${pays.length ? `<div class="stat">Payments: ${pays.map(x => `${esc(x.receiptNo)} ${esc(fmtShort(x.date))} ${inr(x.amount)} ${esc((PMODES.find(m => m[0] === x.mode) || [0, x.mode])[1])}`).join(' · ')}</div>` : ''}
    ${cl.billEdit === b.id ? billEditForm(b) : ''}
    <div class="btnrow" style="margin-top:6px"><button data-bprint>🖨 Print bill</button>${billLive(b) && b.status !== 'draft' && canEditMoney() && cl.billEdit !== b.id ? '<button data-bedit>✎ Edit bill</button>' : ''}
      ${w && b.status === 'draft' ? '<button class="primary" data-bissue>Issue bill</button>' : ''}${w && ['pending', 'ack'].includes(b.status) && !+b.paid ? '<button data-breopen title="Back to a draft to correct the treatments (no payment yet)">Reopen to edit</button>' : ''}
      ${billLive(b) && canCancelBill(b) ? '<span class="sp"></span><button class="danger" data-bcancel>Cancel bill…</button>' : ''}</div>
    ${w && billPayable(b) ? payForm('py', b) : billLive(b) && b.status !== 'draft' && !billDue(b) ? '' : ''}`;
}
function clPayments(){
  const P = (cl.pP || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0)), B = cl.pB || [];
  const bal = billed(cl.pT) - paidSum(cl.pP);
  return `<div class="sect"><div class="kpis">${kpi('Total paid', inr(paidSum(P)), plural(P.filter(x => x.amount > 0).length, 'payment'))}${kpi('Outstanding balance', inr(bal), 'all treatments − payments', bal > 0 ? 'neg' : '')}</div>
    <div class="awrap" style="margin-top:0"><table class="atbl"><thead><tr><th>Receipt</th><th>Bill</th><th>Date</th><th>Method</th><th>Transaction ref.</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${cl.pP === null ? '<tr><td colspan="8">Loading…</td></tr>' : P.map(x => `<tr data-pay="${esc(x.id)}"><td>${esc(x.receiptNo || '')}${x.kind === 'refund' ? ' <span class="upill gone">Refund</span>' : ''}${editedTag(x)}</td><td>${esc(x.billNo || (B.find(b => b.id === x.billId) || {}).billNo || '—')}</td><td>${esc(fmtShort(x.date))}</td><td>${esc((PMODES.find(m => m[0] === x.mode) || [0, x.mode])[1])}</td><td>${esc(x.txnRef || '')}</td><td>${esc(x.note || '')}${x.cash ? `<span class="sub2">${esc(cashLine(x))}</span>` : ''}</td><td class="num"><b class="${x.amount < 0 ? 'neg' : ''}">${inr(x.amount)}</b></td>
        <td style="white-space:nowrap"><button data-rcpt>🖨 Receipt</button>${canEditMoney() && x.kind !== 'refund' && x.amount > 0 ? ' <button data-pedit>✎ Edit</button>' : ''}</td></tr>
        ${cl.payEdit === x.id ? `<tr class="asedrow"><td colspan="8">${payEditForm(x)}</td></tr>` : ''}`).join('') || '<tr><td colspan="8" class="stat">No payments yet.</td></tr>'}
    </tbody></table></div></div>`;
}
function billEditForm(b){
  return `<form class="aform" id="clBillEdit" data-bill="${esc(b.id)}" novalidate style="margin:8px 0"><div class="full fhead">Edit ${esc(b.billNo)}</div>
    <label>Bill date<input type="date" id="beDate" value="${esc(b.date)}" max="${todayKey}"></label>
    ${(b.items || []).map((i, n) => `<div class="full beitem"><b>${esc(i.name)}${i.tooth ? ' (' + esc(i.tooth) + ')' : ''}</b><label>Charge<input type="number" min="0" data-bec="${n}" value="${+i.cost || 0}"></label><label>Discount<input type="number" min="0" data-bed="${n}" value="${+i.discount || 0}"></label></div>`).join('')}
    <label class="grow">Reason *<input id="beWhy" placeholder="e.g. discount agreed with the doctor"></label><button class="primary" type="submit">Save</button><button type="button" data-bedx>Cancel</button></form>`;
}
function payEditForm(x){
  return `<form class="aform" id="clPayEdit" data-pay="${esc(x.id)}" novalidate>
    <label>Date<input type="date" id="peDate" value="${esc(x.date)}" max="${todayKey}"></label><label>Amount (₹)<input type="number" id="peAmt" min="1" value="${+x.amount}"></label>
    <label>Method<select id="peMode">${PMODES.map(([k, l]) => `<option value="${k}"${k === x.mode ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Transaction ref.<input id="peRef" value="${esc(x.txnRef || '')}"></label><label class="grow">Note<input id="peNote" value="${esc(x.note || '')}"></label>
    <label class="grow">Reason *<input id="peWhy" placeholder="e.g. wrong amount entered"></label><button class="primary" type="submit">Save</button><button type="button" data-pedx>Cancel</button></form>`;
}
const billStatusFor = (paid, total) => paid > 0 && paid >= total ? 'paid' : paid > 0 ? 'partly' : 'ack';
const moneyAudit = (type, target, before, after, reason) => cloud.F.addDoc(cloud.F.collection(cloud.fs, 'orgs', orgCtx().orgId, 'audit'), {at:Date.now(), by:cloud.user.email || '', byName:fullName(orgCtx().me) || '', type, target, before, after, change:'edited', reason}).catch(() => {});
// edit an issued bill's date / charges / discounts: the treatments behind it change with it (the patient's balance stays right)
async function saveBillEdit(b){
  const why = $('#beWhy').value.trim(); if (!why) throw custom('Enter the reason for the change.');
  const items = (b.items || []).map((i, n) => { const cost = Math.max(0, Math.round(+($(`[data-bec="${n}"]`) || {}).value || 0)), discount = Math.min(cost, Math.max(0, Math.round(+($(`[data-bed="${n}"]`) || {}).value || 0))); return Object.assign({}, i, {cost, discount, net:cost - discount}); });
  const sums = billSums(items), date = $('#beDate').value || b.date, now = Date.now(), by = cloud.user.email || '';
  const changes = items.map((i, n) => [i, b.items[n]]).filter(([a, o]) => a.cost !== o.cost || a.discount !== o.discount);
  if (!changes.length && date === b.date) throw custom('Nothing was changed.');
  const desc = changes.map(([a, o]) => `${a.name} ${inr(o.net)} → ${inr(a.net)}`).concat(date !== b.date ? [`date ${b.date} → ${date}`] : []).join(', ');
  const upd = Object.assign({items, date, status:billStatusFor(+b.paid || 0, sums.total), history:(b.history || []).concat([{at:now, by, change:'edited: ' + desc, reason:why, before:{total:b.total, date:b.date}}])}, sums);
  const {F, fs} = cloud, bt = F.writeBatch(fs); bt.update(cDoc('bills', b.id), upd);
  changes.forEach(([a]) => { if (a.treatmentId) bt.update(cDoc('treatments', a.treatmentId), {cost:a.cost, discount:a.discount}); });
  await bt.commit(); moneyAudit('bill', {id:b.id, billNo:b.billNo, patientId:b.patientId}, {total:b.total, date:b.date}, {total:sums.total, date}, why);
  Object.assign(b, upd); return desc;
}
// edit a payment: date, amount, method, ref, note. Its bill's paid total moves with it in the same write.
async function savePayEdit(x){
  const why = $('#peWhy').value.trim(); if (!why) throw custom('Enter the reason for the change.');
  const amount = Math.round(+$('#peAmt').value || 0); if (amount <= 0) throw custom('Enter the amount.');
  const upd = {date:$('#peDate').value || x.date, amount, mode:$('#peMode').value, txnRef:$('#peRef').value.trim(), note:$('#peNote').value.trim()};
  const diff = Object.keys(upd).filter(k => upd[k] !== (x[k] ?? (k === 'txnRef' || k === 'note' ? '' : x[k]))); if (!diff.length) throw custom('Nothing was changed.');
  const b = x.billId ? (cl.pB || []).find(y => y.id === x.billId) : null;
  if (b && amount !== x.amount && (+b.paid || 0) - x.amount + amount > b.total) throw custom(`That would be more than the bill's total ${inr(b.total)}.`);
  const desc = diff.map(k => k === 'amount' ? `amount ${inr(x.amount)} → ${inr(amount)}` : `${k} ${x[k] || '—'} → ${upd[k] || '—'}`).join(', '), now = Date.now(), by = cloud.user.email || '';
  if (x.cash && (amount !== x.amount || upd.mode !== 'cash')) upd.cash = null;                   // the counted notes no longer match: recount in the tally
  upd.history = (x.history || []).concat([{at:now, by, change:'edited: ' + desc, reason:why, before:{date:x.date, amount:x.amount, mode:x.mode}}]);
  const {F, fs} = cloud, bt = F.writeBatch(fs); bt.update(cDoc('payments', x.id), upd);
  if (b && amount !== x.amount){ const paid = (+b.paid || 0) - x.amount + amount; bt.update(cDoc('bills', b.id), {paid, status:billStatusFor(paid, b.total), editPay:x.id, history:(b.history || []).concat([{at:now, by, change:`edited: payment ${x.receiptNo} ${inr(x.amount)} → ${inr(amount)}`, reason:why}])}); }
  await bt.commit(); moneyAudit('payment', {id:x.id, receiptNo:x.receiptNo, billId:x.billId || '', patientId:x.patientId}, {date:x.date, amount:x.amount, mode:x.mode}, {date:upd.date, amount, mode:upd.mode}, why);
  return desc;
}
async function billAction(e){
  const t = e.target, row = t.closest('[data-bill]'); if (!row) return false;
  const b = (cl.pB || []).find(x => x.id === row.dataset.bill); if (!b) return false;
  const T = id => (cl.pT || []).filter(x => (b.items || []).some(i => i.treatmentId === x.id));
  try {
    if (t.closest('[data-bedit]')){ cl.billEdit = b.id; renderClinic(); return true; }
    if (t.closest('[data-bedx]')){ cl.billEdit = null; renderClinic(); return true; }
    if (t.closest('[data-bprint]')){ printBill(b, cl.p, cl.pP); return true; }
    if (t.closest('[data-bissue]')){ await issueBill(b, T()); info(`${b.billNo} issued.`); renderClinic(); return true; }
    if (t.closest('[data-breopen]')){ await reopenBill(b); info(`${b.billNo} is a draft again: change the treatments, then Issue.`); renderClinic(); return true; }
    if (t.closest('[data-back]')){ await ackBill(b); info(`${b.billNo} acknowledged.`); renderClinic(); return true; }
    if (t.closest('[data-bcancel]')){ const r = await cancelBill(b, T()); if (r){ info(r.fresh ? `${b.billNo} cancelled: payments moved to ${r.fresh.billNo} (draft: correct the treatments, then Issue).` : r.refund ? `${b.billNo} cancelled and ${inr(-r.refund.amount)} refunded (${r.refund.receiptNo}).` : `${b.billNo} cancelled.`); if (r.fresh) cl.billOpen = r.fresh.id; renderClinic(); } return true; }
    if (row.matches('tr.clk[data-bill]') && !t.closest('form,button,input,select')){ cl.billOpen = cl.billOpen === b.id ? null : b.id; renderClinic(); return true; }
  } catch(err){ info(errText(err)); return true; }
  return false;
}
async function newBillSubmit(draft){
  const ids = [...document.querySelectorAll('[data-nbt]:checked')].map(c => c.dataset.nbt), T = (cl.pT || []).filter(t => ids.includes(t.id));
  const legacy = $('#nbLegacy') && $('#nbLegacy').checked ? earlierDue(cl.pT, cl.pP, cl.pB) : 0;
  try { const b = await createBill({p:cl.p, appt:null, T, status:draft ? 'draft' : 'ack', legacy}); cl.billOpen = b.id; info(`${b.billNo} ${draft ? 'saved as a draft' : 'generated'} · ${inr(b.total)}`); renderClinic(); }
  catch(e){ info(errText(e)); }
}
