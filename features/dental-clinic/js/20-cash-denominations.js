/* ---------- cash denominations at billing ----------
   When a patient pays in cash, the front desk counts the notes received and the change given back, and says where
   the change came from: the purse (cash drawer) with its notes, and/or another place such as petty cash (an amount).
   Saved on the payment as `cash` {in, out, inTotal, outTotal, xs:[{src:'petty'|'other', name, amount}], petty, other, change}.
   The daily tally adds it all up (expected notes in the purse), and change taken from petty cash is booked out of the
   petty box (ledger chg-<paymentId>, kind pettyspend, change:true; not an expense, it went into the purse). */
const CDX = {};                                          // form prefix → number of "other place" rows
const cdCounts = (pre, part) => Object.fromEntries(DENOMS.map(v => [v, Math.max(0, Math.floor(+(($('#' + pre + part + v) || {}).value) || 0))]).filter(([, n]) => n));
const cdGrid = (pre, part) => `<div class="cdgrid">${DENOMS.map(v => `<label><span>₹${v}</span><input type="number" min="0" step="1" id="${pre}${part}${v}" data-cd="${pre}" placeholder="0" inputmode="numeric"></label>`).join('')}</div>`;
const cdChips = c => DENOMS.filter(v => +(c || {})[v]).map(v => `<span class="dchip">₹${v} × ${+c[v]}</span>`).join('');
function cashPanel(pre, show){
  const n = CDX[pre] || 0;
  return `<div class="cashd" id="${pre}Cash"${show ? '' : ' hidden'}>
    <div class="cdh"><b>💵 Cash denominations</b><span class="stat">count the notes: they go into the daily tally by themselves</span></div>
    <div class="cdsec"><div class="cdl">Received from the patient <b id="${pre}InT">₹0</b></div>${cdGrid(pre, 'In')}</div>
    <div class="cdchg" id="${pre}ChgL">Change to give back: <b id="${pre}ChgV">₹0</b></div>
    <div class="cdsec" id="${pre}OutBox"><div class="cdl">Change from the purse <small>(cash drawer)</small> <b id="${pre}OutT">₹0</b></div>${cdGrid(pre, 'Out')}</div>
    <div class="cdxs">${[...Array(n)].map((_, i) => `<div class="cdx" data-cdx="${i}">
      <span class="cdl">Change from</span><select id="${pre}X${i}Src" data-cd="${pre}"><option value="petty">Petty cash</option><option value="other">Somewhere else…</option></select>
      <input id="${pre}X${i}Name" data-cd="${pre}" placeholder="Where? (e.g. Doctor's wallet)" hidden><input type="number" min="0" step="1" id="${pre}X${i}Amt" data-cd="${pre}" placeholder="₹ amount">
      <button type="button" class="ghost" data-cdrm="${pre}" title="Remove">✕</button></div>`).join('')}</div>
    <button type="button" class="linkb" data-cdadd="${pre}">+ Take part of the change from another place (e.g. petty cash)</button>
    <div class="cdst" id="${pre}St"></div></div>`;
}
// read the panel; amount = the payment amount. Returns the figures (and fills in the totals on screen)
function cashCalc(pre, amount){
  if (!$('#' + pre + 'Cash')) return null;
  const inC = cdCounts(pre, 'In'), outC = cdCounts(pre, 'Out'), inT = denSum(inC), outT = denSum(outC);
  const xs = [...Array(CDX[pre] || 0)].map((_, i) => {
    const src = ($('#' + pre + 'X' + i + 'Src') || {}).value || 'petty', nm = $('#' + pre + 'X' + i + 'Name');
    if (nm) nm.hidden = src !== 'other';
    return {src, name:src === 'petty' ? 'Petty cash' : ((nm || {}).value || '').trim(), amount:Math.max(0, Math.round(+(($('#' + pre + 'X' + i + 'Amt') || {}).value) || 0))};
  }).filter(x => x.amount);
  const xT = xs.reduce((s, x) => s + x.amount, 0), change = Math.max(0, inT - amount), left = change - outT - xT;
  const set = (id, t) => { const e = $('#' + pre + id); if (e) e.textContent = t; };
  set('InT', inr(inT)); set('OutT', inr(outT)); set('ChgV', inr(change));
  const st = $('#' + pre + 'St'), msg = !inT ? ['wait', 'Enter the notes the patient gave.'] : inT < amount ? ['bad', `That's ${inr(amount - inT)} less than the amount (${inr(amount)}).`]
    : left > 0 ? ['wait', `${inr(left)} of the change still to say where it came from.`] : left < 0 ? ['bad', `The change entered is ${inr(-left)} more than the change due.`]
    : ['ok', change ? `✓ ${inr(inT)} received, ${inr(change)} change given` + (xT ? ` (${xs.map(x => inr(x.amount) + ' from ' + (x.name || 'elsewhere')).join(', ')})` : '') : `✓ Exact amount received`];
  if (st){ st.className = 'cdst ' + msg[0]; st.textContent = msg[1]; }
  const ob = $('#' + pre + 'OutBox'); if (ob) ob.classList.toggle('dim', !change);
  return {inC, outC, inT, outT, xs, xT, change, left, ok:msg[0] === 'ok'};
}
// the `cash` field to save on a payment (throws a readable error when the counts don't add up)
function cashRead(pre, amount){
  const c = cashCalc(pre, amount); if (!c) return null;
  if (!c.inT) throw custom('Enter the cash denominations the patient gave (the notes go into the daily tally).');
  if (!c.ok) throw custom($('#' + pre + 'St').textContent);
  if (c.xs.some(x => x.src === 'other' && !x.name)) throw custom('Say where the rest of the change came from.');
  const petty = c.xs.filter(x => x.src === 'petty').reduce((s, x) => s + x.amount, 0), other = c.xT - petty;
  return {in:c.inC, out:c.outC, inTotal:c.inT, outTotal:c.outT, change:c.change, xs:c.xs, petty, other};
}
// save a payment (and the petty-cash entry for change taken from the petty box) in one go
async function savePaymentDoc(x){
  const {F, fs} = cloud, ref = F.doc(cCol('payments')), b = F.writeBatch(fs);
  b.set(ref, x);
  if (x.cash && x.cash.petty > 0) b.set(cDoc('ledger', 'chg-' + ref.id), {kind:'pettyspend', change:true, paymentId:ref.id, date:x.date, mode:'cash', amount:x.cash.petty,
    note:`Change given to ${x.patientName} (${x.receiptNo})`, by:cloud.user.email || '', at:Date.now()});
  await b.commit();
  return ref;
}
async function deletePaymentDoc(id, x){
  const {F, fs} = cloud, b = F.writeBatch(fs);
  b.delete(cDoc('payments', id));
  if (x && x.cash && x.cash.petty > 0) b.delete(cDoc('ledger', 'chg-' + id));          // the change goes back to the petty box
  await b.commit();
}
const cashLine = x => x && x.cash ? `Received ${inr(x.cash.inTotal)}${x.cash.change ? ` · change ${inr(x.cash.change)}${x.cash.xs && x.cash.xs.length ? ' (' + x.cash.xs.map(s => inr(s.amount) + ' from ' + s.name).join(', ') + (x.cash.outTotal ? ', ' + inr(x.cash.outTotal) + ' from the purse' : '') + ')' : ''}` : ''}` : '';
// show / recount while typing (Bill after a visit: prefix vb, patient's Billing tab: py)
const CD_FORMS = {vb:['#vbAmt', '#vbMode'], py:['#pyAmt', '#pyMode']};
function cashRefresh(pre){ const [a, m] = CD_FORMS[pre], box = $('#' + pre + 'Cash'); if (!box) return; box.hidden = ($(m) || {}).value !== 'cash'; if (!box.hidden) cashCalc(pre, Math.round(+($(a) || {}).value || 0)); }
document.addEventListener('input', e => { const t = e.target; if (t.dataset && t.dataset.cd) return cashRefresh(t.dataset.cd); for (const p in CD_FORMS) if (t.matches(CD_FORMS[p].join(','))) return cashRefresh(p); });
document.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.cd) return cashRefresh(t.dataset.cd); for (const p in CD_FORMS) if (t.matches(CD_FORMS[p][1])) return cashRefresh(p); });
document.addEventListener('click', e => {
  const ad = e.target.closest('[data-cdadd]'), rm = e.target.closest('[data-cdrm]'); if (!ad && !rm) return;
  const pre = (ad || rm).dataset.cdadd || (ad || rm).dataset.cdrm, box = $('#' + pre + 'Cash'); if (!box) return;
  const keep = [...box.querySelectorAll('input[id],select[id]')].map(el => [el.id, el.value]);            // redraw the panel, keeping what was typed
  const gone = rm ? +rm.closest('[data-cdx]').dataset.cdx : -1, n = CDX[pre] || 0;
  if (ad) CDX[pre] = n + 1;
  else { CDX[pre] = n - 1; for (let i = gone; i < n - 1; i++) ['Src', 'Name', 'Amt'].forEach(k => { const nx = keep.find(([id]) => id === pre + 'X' + (i + 1) + k), cur = keep.find(([id]) => id === pre + 'X' + i + k); if (cur && nx) cur[1] = nx[1]; }); }
  box.outerHTML = cashPanel(pre, true);
  keep.forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.value = v; });
  if (ad){ const s = $('#' + pre + 'X' + n + 'Amt'); const c = cashCalc(pre, Math.round(+($(CD_FORMS[pre][0]) || {}).value || 0)); if (s && c && c.left > 0) s.value = c.left; s && s.focus(); }
  cashRefresh(pre);
});
