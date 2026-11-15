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
const BST = {draft:['Not issued', 'pend'], pending:['Unpaid', 'prog'], ack:['Unpaid', 'prog'], partly:['Partly paid', 'pend'], paid:['Paid', 'on'], cancelled:['Cancelled', 'gone']};
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
const billItem = (t, part) => Object.assign({treatmentId:t.id, name:t.typeName || '', tooth:t.tooth || '', doctorId:t.doctorId || '', cost:+t.cost || 0, discount:+t.discount || 0, net:net(t), med:isMed(t)}, isMed(t) ? {qty:+t.qty || 0, unitPrice:+t.unitPrice || 0} : {},
  part > 0 ? {name:(t.typeName || '') + ' (balance)', cost:net(t) - part, discount:0, net:net(t) - part, part} : {});
const billSums = items => { const subtotal = items.reduce((s, i) => s + (+i.cost || 0), 0), discount = items.reduce((s, i) => s + (+i.discount || 0), 0); return {subtotal, discount, total:Math.max(0, subtotal - discount)}; };
/* ---------- which treatments still need a bill (like Dentee: tick treatments → Generate bill) ----------
   A treatment is "on a bill" (an issued, live bill), "settled earlier" (paid before bills existed: payments without a bill, plus
   the earlier-balance bills of the old flow, pay the oldest treatments first), or "not billed" (can be ticked). One that was only
   partly paid earlier is billed for the rest ("balance"); the part paid earlier is kept on the bill item (`part`). */
function treatCover(T, P, B){
  const live = (B || []).filter(b => billLive(b) && b.status !== 'draft'), ids = new Set(live.map(b => b.id)), out = {};
  let pool = paidSum((P || []).filter(x => !x.billId))
    + live.reduce((s, b) => s + (b.items || []).reduce((a, i) => a + (i.legacy ? +i.net || 0 : 0) - (+i.part || 0), 0), 0);
  (T || []).filter(t => t.status !== 'planned').sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.createdAt || 0) - (b.createdAt || 0)).forEach(t => {
    if (t.billId && ids.has(t.billId)){ out[t.id] = {state:'bill', bill:live.find(b => b.id === t.billId)}; return; }
    const n = net(t), c = Math.max(0, Math.min(pool, n)); pool -= c;
    out[t.id] = c >= n && n > 0 ? {state:'settled'} : {state:'open', part:c, due:n - c};
  });
  return out;
}
const billableOf = (T, P, B) => { const c = treatCover(T, P, B); return (T || []).filter(t => c[t.id] && c[t.id].state === 'open' && c[t.id].due > 0); };
const BILLS_SINCE = '2026-11-02';
// create a bill (draft or issued). appt optional. items from treatments (+ an optional earlier-balance item)
async function createBill({p, appt, T, status, legacy, carry, date, cover}){
  const {F, fs} = cloud, by = cloud.user.email || '', items = T.map(t => billItem(t, (cover || {})[t.id] || 0)).concat(legacy ? [{treatmentId:'', name:'Earlier balance (before bills)', tooth:'', doctorId:'', cost:legacy, discount:0, net:legacy, legacy:true}] : []);
  if (!items.length) throw custom('Choose the treatments to bill.');
  const billNo = await nextNumber('bill', 'B-', 5), ref = F.doc(cCol('bills')), b = F.writeBatch(fs);
  const x = Object.assign({billNo, patientId:p.id, patientName:pName(p), appointmentId:appt ? appt.id : '', date:date || (appt ? (appt.date <= todayKey ? appt.date : todayKey) : todayKey), doctorId:appt ? appt.doctorId || '' : (T[0] || {}).doctorId || '',
    items, paid:carry ? carry.paid : 0, status, ackBy:'', ackAt:0, lastPay:'', replaces:carry ? carry.id : '', replacedBy:'', createdBy:by, createdAt:Date.now(), history:[]}, billSums(items));
  b.set(ref, x);
  if (status !== 'draft') T.forEach(t => b.update(cDoc('treatments', t.id), {billId:ref.id}));
  if (appt) b.update(cDoc('appointments', appt.id), {billId:ref.id});
  await b.commit();
  return Object.assign({id:ref.id}, x);
}
// issue a draft: refresh its items from the treatments now, lock them
async function issueBill(bill, T){
  const {F, fs} = cloud, items = T.map(t => billItem(t)).concat((bill.items || []).filter(i => i.legacy)), b = F.writeBatch(fs);
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
// one payment record against a bill, its paid total moving in the same write
async function recordPayment(bill, {amount, mode, date, txnRef, note, cash}){
  const receiptNo = await nextNumber('receipt', 'R-', 5);
  const x = {patientId:bill.patientId, patientName:bill.patientName, appointmentId:bill.appointmentId || '', billId:bill.id, billNo:bill.billNo, kind:'payment', date:date || todayKey, amount, mode,
    txnRef:txnRef || '', doctorId:bill.doctorId || '', note:note || '', receiptNo, createdAt:Date.now(), by:cloud.user.email || ''};
  if (cash) x.cash = cash;
  const paid = (+bill.paid || 0) + amount, upd = {paid, status:paid >= bill.total ? 'paid' : 'partly'};
  if (bill.status === 'pending') Object.assign(upd, {ackBy:cloud.user.email || '', ackAt:Date.now()});
  const ref = await savePaymentDoc(x, bill.id, upd);
  Object.assign(bill, upd, {lastPay:ref.id});
  return Object.assign({id:ref.id}, x);
}
// the patient's bills that can take a payment, oldest first
const payableBills = B => (B || []).filter(billPayable).sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.createdAt || 0) - (b.createdAt || 0));
/* one payment over the ticked bills: the amount goes to the oldest ticked bill first. Each bill gets its own payment record
   (and receipt number), written together with that bill's new paid total. Cash notes are counted once, for the whole amount. */
async function payBills(pre, B){
  const ids = [...document.querySelectorAll(`[data-pb="${pre}"]:checked`)].map(c => c.value), bills = payableBills(B).filter(b => ids.includes(b.id));
  const amt = Math.max(0, Math.round(+($('#' + pre + 'Amt') || {}).value || 0)), mode = $('#' + pre + 'Mode').value, date = ($('#' + pre + 'Date') || {}).value || todayKey;
  const txnRef = (($('#' + pre + 'Ref') || {}).value || '').trim(), note = (($('#' + pre + 'Note') || {}).value || '').trim(), due = bills.reduce((s, b) => s + billDue(b), 0);
  if (!bills.length) throw custom('Tick the bill(s) this payment is for.');
  if (amt <= 0) throw custom('Enter the amount received.');
  if (amt > due) throw custom(`That's more than the ${inr(due)} due on the ticked bills.`);
  if (date > todayKey) throw custom("The payment date can't be in the future.");
  const cash = mode === 'cash' ? cashRead(pre, amt) : null, out = [];
  let rest = amt;
  for (const b of bills){ if (!rest) break; const a = Math.min(rest, billDue(b)); out.push(await recordPayment(b, {amount:a, mode, date, txnRef, note, cash:out.length ? null : cash})); rest -= a; }
  CDX[pre] = 0;
  return out;
}
/* cancel a payment (reason required): the payment stays, marked cancelled, and a reversal record (−amount, same date) undoes it, so
   collections, the tally and balances all net to zero. Its bill's paid total goes down in the same write; then the bill can be edited
   (once nothing is paid on it) and the right payment taken again. */
async function cancelPayment(x, ctx){
  if (!canEditMoney()) throw custom('Only the Owner, Account Manager or someone with "Edit / cancel bills" may cancel a payment.');
  if (x.reversedBy || x.kind !== 'payment' && x.kind) throw custom('This payment is already cancelled.');
  const why = prompt(`Cancel payment ${x.receiptNo} (${inr(x.amount)})?\n\nIt stays on record, marked cancelled. Reason (required):`, ''); if (why === null) return null;
  if (!why.trim()) throw custom('Enter the reason for cancelling.');
  const {F, fs} = cloud, by = cloud.user.email || '', now = Date.now(), bt = F.writeBatch(fs), rref = F.doc(cCol('payments'));
  const rev = {patientId:x.patientId, patientName:x.patientName, appointmentId:x.appointmentId || '', billId:x.billId || '', billNo:x.billNo || '', kind:'reversal', reverses:x.id, date:x.date, amount:-x.amount, mode:x.mode,
    txnRef:'', doctorId:x.doctorId || '', note:`Cancelled ${x.receiptNo}: ${why.trim()}`, receiptNo:(x.receiptNo || '') + '-C', createdAt:now, by};
  bt.set(rref, rev);
  bt.update(cDoc('payments', x.id), {reversedBy:rref.id, history:(x.history || []).concat([{at:now, by, change:'cancelled', reason:why.trim()}])});
  const b = x.billId ? (ctx.B || []).find(y => y.id === x.billId) : null;
  if (b){ const paid = (+b.paid || 0) - x.amount; bt.update(cDoc('bills', b.id), {paid, status:billStatusFor(paid, b.total), lastPay:rref.id, history:(b.history || []).concat([{at:now, by, change:`payment ${x.receiptNo} cancelled`, reason:why.trim()}])}); }
  if (x.cash && +x.cash.petty > 0) bt.delete(cDoc('ledger', 'chg-' + x.id));                   // the change taken from petty cash goes back
  await bt.commit(); moneyAudit('payment', {id:x.id, receiptNo:x.receiptNo, billId:x.billId || '', patientId:x.patientId}, {amount:x.amount, status:'paid'}, {status:'cancelled'}, why.trim());
  return rev;
}
// cancel: reason required; payments moved to a fresh draft bill, or refunded (negative payment)
async function cancelBill(bill, T){
  if (+bill.paid) throw custom('Cancel its payments first.');
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
// printBill: see 22-print-sheets.js
// payment form: the patient's unpaid bills with tick boxes (sel = bills ticked to start with; default all), one amount
const itemsLine = b => (b.items || []).map(i => i.name).join(', ');
const pbDue = pre => payableBills(pre === 'vb' ? (cl.bill || {}).B : cl.pB).filter(b => [...document.querySelectorAll(`[data-pb="${pre}"]:checked`)].some(c => c.value === b.id)).reduce((s, b) => s + billDue(b), 0);
function payForm(pre, B, sel){
  const PB = payableBills(B); if (!PB.length) return '';
  const on = b => !sel || sel.includes(b.id), due = PB.filter(on).reduce((s, b) => s + billDue(b), 0);
  return `<form class="aform payf" id="${pre === 'vb' ? 'clVBill' : 'clPayForm'}" novalidate style="margin-top:8px">
  <div class="full pbills">${PB.map(b => `<label class="ckl"><input type="checkbox" data-pb="${pre}" value="${esc(b.id)}"${on(b) ? ' checked' : ''}> <b>${esc(b.billNo)}</b> · ${esc(fmtShort(b.date))} · ${esc(itemsLine(b))} · <span class="neg">${inr(billDue(b))} due</span></label>`).join('')}
    <div class="stat">Due on the ticked bills: <b id="${pre}PDue">${inr(due)}</b></div></div>
  <label>Date<input type="date" id="${pre}Date" value="${todayKey}" max="${todayKey}"></label>
  <label>Amount (₹)<input type="number" id="${pre}Amt" min="1" value="" placeholder="Amount received"></label>
  <label>Method<select id="${pre}Mode">${PMODES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
  <label>Ref.<input id="${pre}Ref" placeholder="UPI / card ref"></label>
  <label class="grow">Note<input id="${pre}Note"></label>
  <button class="primary" type="submit">Save payment</button>${cashPanel(pre, true)}</form>`;
}
document.addEventListener('change', e => { const p = e.target.dataset && e.target.dataset.pb; if (p && $('#' + p + 'PDue')) $('#' + p + 'PDue').textContent = inr(pbDue(p)); });
/* ---------- patient card: Bills ---------- */
function clBills(){
  if (cl.pB === null || cl.pT === null) return '<div class="empty">Loading…</div>';
  const all = (cl.pB || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0)), w = canW('billing');
  const nx = all.filter(b => !billLive(b)).length, B = cl.billShowX ? all : all.filter(billLive);
  const live = B.filter(b => billLive(b) && b.status !== 'draft'), open = cl.billOpen, nb = billableOf(cl.pT, cl.pP, cl.pB);
  const tot = live.reduce((s, b) => s + (+b.total || 0), 0), paid = live.reduce((s, b) => s + (+b.paid || 0), 0);
  return `<div class="sect"><div class="bsum"><span>Billed <b>${inr(tot)}</b></span><span>Paid <b>${inr(paid)}</b></span><span>Balance <b class="${tot - paid > 0 ? 'neg' : ''}">${inr(tot - paid)}</b></span><span class="sp"></span>
      ${nx ? `<button class="linkbtn" data-bshowx>${cl.billShowX ? 'Hide' : 'Show'} cancelled (${nx})</button>` : ''}
      ${nb.length && w ? `<a class="btn" href="#/clinic/patients/${esc(cl.pid)}/treatments">${plural(nb.length, 'treatment')} not billed · Generate bill →</a>` : ''}</div>
    <div class="awrap" style="margin-top:8px"><table class="atbl"><thead><tr><th>Bill date</th><th>Bill no.</th><th>Treatments</th><th class="num">Amount</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>
    ${B.map(b => `<tr data-bill="${esc(b.id)}" class="clk${b.status === 'cancelled' ? ' gone' : ''}"><td>${esc(fmtShort(b.date))}</td><td><b>${esc(b.billNo)}</b></td>
      <td class="bitems">${esc(itemsLine(b))}</td><td class="num">${inr(b.total)}</td><td class="num">${inr(b.paid)}</td><td class="num ${billDue(b) && billLive(b) ? 'neg' : ''}">${billLive(b) ? inr(billDue(b)) : '—'}</td>
      <td>${billBadge(b)}${editedTag(b)}${b.cancel ? `<span class="sub2">${esc(b.cancel.reason)}</span>` : ''}</td>
      <td style="white-space:nowrap"><button data-bprint title="Print bill">🖨</button>${w && billPayable(b) ? ' <button class="primary" data-bpay>Pay</button>' : ''} ${open === b.id ? '▾' : '▸'}</td></tr>
      ${open === b.id ? `<tr class="billx" data-bill="${esc(b.id)}"><td colspan="8">${billDetail(b)}</td></tr>` : ''}`).join('') || `<tr><td colspan="8" class="stat">No bills yet. Tick treatments in the Treatments tab and press Generate bill.</td></tr>`}
    </tbody></table></div></div>`;
}
function billDetail(b){
  const w = canW('billing'), pays = (cl.pP || []).filter(x => x.billId === b.id);
  return `<div class="awrap" style="margin:4px 0"><table class="atbl"><thead><tr><th>Treatment</th><th>Doctor</th><th class="num">Charge</th><th class="num">Discount</th><th class="num">Amount</th></tr></thead><tbody>
    ${(b.items || []).map(i => `<tr><td>${esc(i.name)}${i.tooth ? ' (' + esc(i.tooth) + ')' : ''}${+i.part ? `<span class="sub2">${inr(i.part)} was paid earlier</span>` : ''}</td><td>${esc(dName(i.doctorId) || '')}</td><td class="num">${inr(i.cost)}</td><td class="num">${+i.discount ? inr(i.discount) : '—'}</td><td class="num">${inr(i.net)}</td></tr>`).join('')}
    <tr class="tot"><td colspan="4">Total</td><td class="num">${inr(b.total)}</td></tr></tbody></table></div>
    ${pays.length ? `<div class="stat">Payments: ${pays.map(x => `${esc(x.receiptNo)} ${esc(fmtShort(x.date))} ${inr(x.amount)} ${esc((PMODES.find(m => m[0] === x.mode) || [0, x.mode])[1])}`).join(' · ')}</div>` : ''}
    ${cl.billEdit === b.id ? billEditForm(b) : ''}
    <div class="btnrow" style="margin-top:6px"><button data-bprint>🖨 Print bill</button>${w && b.status === 'draft' ? '<button class="primary" data-bissue>Generate bill</button>' : ''}
      ${billLive(b) && b.status !== 'draft' && !+b.paid && w && cl.billEdit !== b.id ? '<button data-bedit>✎ Edit</button>' : ''}
      ${billLive(b) && !+b.paid && w ? '<span class="sp"></span><button class="danger" data-bcancel>Cancel bill</button>' : ''}${+b.paid && billLive(b) ? '<span class="sp"></span><span class="stat">To change it: cancel its payments in the Payments tab, then Edit</span>' : ''}</div>`;
}
/* ---------- patient card: Payments ---------- */
function clPayments(){
  const P = (cl.pP || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0)), B = cl.pB || [], w = canW('billing');
  const form = w && cl.pB ? payForm('py', B, cl.payPick) : '', nb = w && cl.pT && cl.pB ? billableOf(cl.pT, cl.pP, cl.pB).length : 0;
  return `<div class="sect">${form ? `<div class="box"><h3>Take a payment</h3>${form}</div>` : nb ? `<div class="box stat">No unpaid bills. ${plural(nb, 'treatment')} not billed yet: <a href="#/clinic/patients/${esc(cl.pid)}/treatments">tick them in Treatments and Generate bill</a>, then take the payment here.</div>` : ''}
    <div class="awrap" style="margin-top:8px"><table class="atbl"><thead><tr><th>Date</th><th>Receipt</th><th>Bill</th><th>Method</th><th>Transaction ref.</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${cl.pP === null ? '<tr><td colspan="8">Loading…</td></tr>' : P.map(x => `<tr data-pay="${esc(x.id)}"><td>${esc(fmtShort(x.date))}</td><td${x.reversedBy ? ' class="gone"' : ''}>${esc(x.receiptNo || '')}${x.kind === 'refund' ? ' <span class="upill gone">Refund</span>' : x.kind === 'reversal' ? ' <span class="upill gone">Cancellation</span>' : x.reversedBy ? ` <span class="upill gone" title="${esc(histNote(x.history))}">Cancelled</span>` : ''}${editedTag(x)}</td><td>${esc(x.billNo || (B.find(b => b.id === x.billId) || {}).billNo || '—')}</td><td>${esc((PMODES.find(m => m[0] === x.mode) || [0, x.mode])[1])}</td><td>${esc(x.txnRef || '')}</td><td>${esc(x.note || '')}${x.cash ? `<span class="sub2">${esc(cashLine(x))}</span>` : ''}</td><td class="num"><b class="${x.amount < 0 ? 'neg' : ''}">${inr(x.amount)}</b></td>
        <td style="white-space:nowrap"><button data-rcpt>🖨 Receipt</button>${canEditMoney() && (x.kind || 'payment') === 'payment' && x.amount > 0 && !x.reversedBy ? ' <button class="danger" data-pcancel>Cancel</button>' : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="stat">No payments yet.</td></tr>'}
    </tbody></table></div></div>`;
}
/* ---------- patient card: Patient ledger (like Dentee): what was charged and paid, by date, with the running balance ----------
   Charges are the treatments and medicines, on the day they were done, one line per day and bill (or "not billed"); payments
   on their day (a cancelled payment and its reversal cancel out). It ends at the header's Balance (treatment cost − paid). */
function clLedger(){
  if (cl.pT === null || cl.pP === null || cl.pB === null) return '<div class="empty">Loading…</div>';
  const cov = treatCover(cl.pT, cl.pP, cl.pB), G = {}, R = [];
  (cl.pT || []).filter(t => t.status !== 'planned').forEach(t => { const c = cov[t.id] || {}, bn = c.state === 'bill' ? c.bill.billNo : '', k = t.date + '|' + bn;
    const g = G[k] || (G[k] = {date:t.date, kind:0, at:0, names:[], ref:bn ? 'Bill ' + bn : c.state === 'settled' ? 'paid earlier' : 'not billed', dr:0});
    g.names.push((isMed(t) ? '💊 ' : '') + t.typeName + (t.tooth ? ' (' + t.tooth + ')' : '')); g.dr += net(t); });
  Object.values(G).forEach(g => R.push(Object.assign(g, {what:g.names.join(', ')})));
  (cl.pP || []).forEach(x => R.push({date:x.date, kind:1, at:x.createdAt || 0, what:x.kind === 'reversal' ? 'Payment cancelled' : x.kind === 'refund' ? 'Refund' : 'Payment · ' + ((PMODES.find(m => m[0] === x.mode) || [0, x.mode])[1] || ''), ref:[x.receiptNo, x.billNo].filter(Boolean).join(' · '), cr:+x.amount || 0}));
  R.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.kind - b.kind || a.at - b.at);
  let bal = 0; R.forEach(r => { bal += (r.dr || 0) - (r.cr || 0); r.bal = bal; });
  const money = v => v < 0 ? '− ' + inr(-v) : inr(v);
  return `<div class="sect"><div class="awrap" style="margin-top:0"><table class="atbl"><thead><tr><th>Date</th><th>Details</th><th>Bill / receipt</th><th class="num">Charged</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead><tbody>
    ${R.map(r => `<tr><td>${esc(fmtShort(r.date))}</td><td class="bitems">${esc(r.what)}</td><td>${esc(r.ref)}</td><td class="num">${r.dr ? inr(r.dr) : ''}</td><td class="num">${r.cr ? money(r.cr) : ''}</td><td class="num ${r.bal > 0 ? 'neg' : ''}"><b>${money(r.bal)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="stat">Nothing yet.</td></tr>'}
    </tbody></table></div><p class="stat">Balance = treatment cost − paid. A negative balance is money paid in advance.</p></div>`;
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
    if (t.closest('[data-bpay]')){ cl.payPick = [b.id]; cl.ptab = 'payments'; renderClinic(); return true; }
    if (t.closest('[data-bissue]')){ await issueBill(b, T()); info(`${b.billNo} issued.`); renderClinic(); return true; }
    if (t.closest('[data-breopen]')){ await reopenBill(b); info(`${b.billNo} is a draft again: change the treatments, then Issue.`); renderClinic(); return true; }
    if (t.closest('[data-back]')){ await ackBill(b); info(`${b.billNo} acknowledged.`); renderClinic(); return true; }
    if (t.closest('[data-bcancel]')){ if (+b.paid) throw custom('Cancel its payments first.'); const r = await cancelBill(b, T()); if (r){ info(r.fresh ? `${b.billNo} cancelled: payments moved to ${r.fresh.billNo} (draft: correct the treatments, then Issue).` : r.refund ? `${b.billNo} cancelled and ${inr(-r.refund.amount)} refunded (${r.refund.receiptNo}).` : `${b.billNo} cancelled.`); if (r.fresh) cl.billOpen = r.fresh.id; renderClinic(); } return true; }
    if (row.matches('tr.clk[data-bill]') && !t.closest('form,button,input,select')){ cl.billOpen = cl.billOpen === b.id ? null : b.id; renderClinic(); return true; }
  } catch(err){ info(errText(err)); return true; }
  return false;
}
// Treatments tab → Generate bill: the ticked treatments (and medicines) on one bill, dated as chosen (default today)
async function genBillSubmit(){
  const ids = [...document.querySelectorAll('[data-gbt]:checked')].map(c => c.dataset.gbt), cov = treatCover(cl.pT, cl.pP, cl.pB);
  const T = (cl.pT || []).filter(t => ids.includes(t.id) && cov[t.id] && cov[t.id].state === 'open'), date = ($('#gbDate') || {}).value || todayKey;
  if (!T.length) return info('Tick the treatments to bill.');
  if (date > todayKey) return info("The bill date can't be in the future.");
  const ap = [...new Set(T.map(t => t.appointmentId || ''))], a = ap.length === 1 && ap[0] ? (cl.pA || []).find(x => x.id === ap[0]) : null;
  const appt = a && (!a.billId || !(cl.pB || []).some(b => b.id === a.billId && billLive(b))) ? a : null, part = {};
  T.forEach(t => { if (cov[t.id].part > 0) part[t.id] = cov[t.id].part; });
  try { const b = await createBill({p:cl.p, appt, T, status:'ack', date, cover:part}); cl.billOpen = b.id; cl.ptab = 'billing'; info(`${b.billNo} generated · ${inr(b.total)}`); renderClinic(); }
  catch(e){ info(errText(e)); }
}
document.addEventListener('change', e => {
  const t = e.target; if (!t.matches || !t.matches('[data-gbt],[data-gbd]')) return;
  if (t.matches('[data-gbd]')) document.querySelectorAll(`[data-gbt][data-day="${t.dataset.gbd}"]`).forEach(c => c.checked = t.checked);
  const n = document.querySelectorAll('[data-gbt]:checked').length, sum = [...document.querySelectorAll('[data-gbt]:checked')].reduce((s, c) => s + (+c.dataset.amt || 0), 0);
  const btn = $('#gbGo'); if (btn){ btn.textContent = `Generate bill (${n})${n ? ' · ' + inr(sum) : ''}`; btn.disabled = !n; }
});
/* the old flow's leftovers, tidied once per patient when someone who can bill opens the card: drafts that were never issued and
   "Earlier balance" bills with nothing paid on them are cancelled (kept on record, with the reason). Their treatments are then
   simply "not billed" (or "settled earlier") and can be ticked and billed like any other. */
async function billCleanup(pid, B){
  if (!canW('billing') || !pid || !B || (cl.cleaned || (cl.cleaned = new Set())).has(pid)) return;
  cl.cleaned.add(pid);
  const X = B.filter(b => b.status !== 'cancelled' && !+b.paid && (b.status === 'draft' || ((b.items || []).length && b.items.every(i => i.legacy))));
  if (!X.length) return;
  const {F, fs} = cloud, by = cloud.user.email || '', now = Date.now(), bt = F.writeBatch(fs), reason = 'Billing simplified: treatments are now ticked and billed directly';
  const upd = b => ({status:'cancelled', cancel:{reason, by, at:now, payments:'none'}, history:(b.history || []).concat([{at:now, by, change:'cancelled', reason}])});
  X.forEach(b => bt.update(cDoc('bills', b.id), upd(b)));
  try { await bt.commit(); X.forEach(b => Object.assign(b, upd(b))); info(`Tidied ${plural(X.length, 'old bill')} (${X.map(b => b.billNo).join(', ')}): cancelled, nothing was paid on them.`); }
  catch(e){ cl.cleaned.delete(pid); }
}
