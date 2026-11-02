/* ---------- Printed Bill and Payment receipt (half A4, or full A4 when the content is long) ----------
   printBill(bill, p, P): treatments and medicines in separate tables, totals at the bottom, clinic seal box. No payments on it.
   printReceipt(x, ctx): what was done (the bill's items), the payments on that bill up to this one, paid now / paid so far / balance.
   The size is picked from the number of lines (SHEET_HALF_MAX); the print window has Half A4 / Full A4 buttons to change it. */
const SHEET_HALF_MAX = 6, SHEET_INK = '#8a3324';
const sheetDate = (d, y = true) => d ? parseDay(d).toLocaleDateString('en-GB', y ? {day:'2-digit', month:'short', year:'numeric'} : {day:'2-digit', month:'short'}) : '—';
const sheetMode = m => (PMODES.find(x => x[0] === m) || [0, m || ''])[1];
// Indian numbering: 1,23,45,678 → "One Lakh Twenty-Three Thousand ..."
function inWords(n){
  n = Math.round(Math.abs(+n || 0)); if (!n) return 'Zero';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const t = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = x => x < 20 ? a[x] : t[Math.floor(x / 10)] + (x % 10 ? '-' + a[x % 10] : '');
  const three = x => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + (x % 100 ? two(x % 100) : '');
  const parts = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']], out = [];
  for (const [d, w] of parts){ const q = Math.floor(n / d); if (q){ out.push((q >= 100 && d === 10000000 ? inWords(q) : three(q)) + ' ' + w); n %= d; } }
  if (n) out.push(three(n));
  return out.join(' ');
}
const rupeesWords = n => `Rupees ${inWords(n)} only`;
// the visit an item list belongs to (for "Visit:" on the bill)
const sheetVisit = id => id ? [].concat(cl.pA || [], cl.bill && cl.bill.appt ? [cl.bill.appt] : []).find(a => a.id === id) : null;
function sheetHead(kind, no, date){
  const s = cl.settings || {}, org = orgCtx().org || {}, name = s.clinicName || org.name || '';
  return `<div class="hd"><div class="brand">${org.logo ? `<img class="logo" src="${org.logo}" alt="">` : `<div class="logo ini">${esc((name || '?').trim().charAt(0).toUpperCase())}</div>`}
    <div><div class="cn">${esc(name)}</div><div class="ca">${esc([s.address, s.phone, s.gstin && 'GSTIN ' + s.gstin].filter(Boolean).join(' · '))}</div></div></div>
    <div class="doc"><b>${esc(kind)}</b>${no ? `<div>No. <b class="no">${esc(no)}</b></div>` : ''}<div>Date: ${esc(sheetDate(date))}</div></div></div>`;
}
const sheetFoot = (sign, tot) => `<div class="foot"><div class="seal">Clinic seal</div><div class="sign"><i></i>${esc(sign)}</div><div class="tot">${tot}</div></div><div class="note">Thank you</div>`;
function sheetWindow(title, body, half){
  const w = window.open('', '_blank', 'width=900,height=900'); if (!w) return info('Allow pop-ups to print.');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style id="pg">@page{size:210mm ${half ? '148.5mm' : '297mm'};margin:0}</style><style>
    *{box-sizing:border-box}body{margin:0;background:#e9e7e3;font:11px/1.45 "Segoe UI",Inter,-apple-system,Arial,sans-serif;color:#1d1d1f}
    .bar{position:sticky;top:0;display:flex;gap:8px;align-items:center;justify-content:center;padding:10px;background:#fff;border-bottom:1px solid #ddd;font:13px Inter,Arial,sans-serif;z-index:2}
    .bar button{font:inherit;padding:6px 14px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer}.bar button.on{background:${SHEET_INK};border-color:${SHEET_INK};color:#fff}.bar .pr{background:#1d1d1f;color:#fff;border-color:#1d1d1f}
    .page{background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.15);margin:20px auto;width:210mm;min-height:297mm;padding:9mm 11mm;display:flex;flex-direction:column}
    body.half .page{min-height:148.5mm}
    .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${SHEET_INK};padding-bottom:6px}
    .brand{display:flex;gap:10px;align-items:center}.logo{width:38px;height:38px;border-radius:9px;object-fit:contain}
    .logo.ini{background:${SHEET_INK};color:#fff;display:grid;place-items:center;font:700 17px Inter,Arial}
    .cn{font:700 16px Inter,Arial;letter-spacing:.2px}.ca{color:#666;font-size:9.5px}
    .doc{text-align:right}.doc>b{font:700 15px Inter,Arial;letter-spacing:2px;color:${SHEET_INK}}.doc div{color:#555;font-size:10px}.doc .no{font-size:11px;color:#1d1d1f}
    .meta{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:2px 16px;margin:7px 0 6px;font-size:10.5px}.meta span{color:#777}
    h4{margin:7px 0 3px;font:600 10.5px Inter,Arial;text-transform:uppercase;letter-spacing:.6px;color:${SHEET_INK}}
    table{width:100%;border-collapse:collapse}th{font-weight:600;color:#555;text-align:left;border-bottom:1px solid #bbb;padding:3px 5px;font-size:10px}
    td{padding:3px 5px;border-bottom:1px solid #eee}.n{text-align:right;white-space:nowrap}tr.st td{font-weight:600;border-top:1px solid #bbb;border-bottom:0}
    tr.now td{font-weight:700}tr.gone td{color:#999}
    .row{display:flex;gap:24px;align-items:flex-start}
    .foot{margin-top:auto;padding-top:10px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;break-inside:avoid}
    .tot{min-width:62mm}.tot>div{display:flex;justify-content:space-between;padding:2px 0}.tot .g{border-top:1.5px solid #1d1d1f;margin-top:3px;padding-top:4px;font:700 13px Inter,Arial}
    .tot .due{color:#b42318}.words{font-size:9.5px;color:#555;margin-top:3px;max-width:90mm;display:block!important}
    .seal{width:44mm;height:24mm;border:1px dashed #aaa;border-radius:6px;display:flex;align-items:flex-end;justify-content:center;color:#999;font-size:9px;padding-bottom:3px}
    .sign{text-align:center;font-size:9.5px;color:#555}.sign i{display:block;width:45mm;border-top:1px solid #777;margin-bottom:2px}
    .note{font-size:9px;color:#888;margin-top:5px;text-align:center}
    @media print{body{background:#fff}.bar{display:none}.page{margin:0;box-shadow:none;min-height:297mm}body.half .page{min-height:148.5mm}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body class="${half ? 'half' : ''}"><div class="bar"><span>Paper:</span><button data-sz="half"${half ? ' class="on"' : ''}>Half A4</button><button data-sz="full"${half ? '' : ' class="on"'}>Full A4</button><button class="pr" onclick="print()">🖨 Print</button></div>
  <div class="page">${body}</div>
  <script>document.querySelectorAll('[data-sz]').forEach(b=>b.onclick=()=>{const h=b.dataset.sz==='half';document.body.classList.toggle('half',h);document.getElementById('pg').textContent='@page{size:210mm '+(h?'148.5mm':'297mm')+';margin:0}';document.querySelectorAll('[data-sz]').forEach(x=>x.classList.toggle('on',x===b));});<\/script></body></html>`);
  w.document.close(); return w;
}
// the bill (or, before a bill exists, an estimate built from the same items)
function printBill(bill, p, P, kind){
  const I = bill.items || [], TR = I.filter(i => !i.med), MD = I.filter(i => i.med), disc = TR.some(i => +i.discount);
  const sum = xs => xs.reduce((a, i) => a + (+i.net || 0), 0), trT = sum(TR), mdT = sum(MD), total = bill.total != null ? +bill.total : trT + mdT;
  const v = sheetVisit(bill.appointmentId), doc = bill.doctorId || (v && v.doctorId) || (TR[0] && TR[0].doctorId) || '';
  const body = sheetHead(kind || 'BILL', bill.billNo, bill.date)
    + `<div class="meta"><div><span>Patient:</span> <b>${esc(pName(p))}</b>${p.code ? ` (${esc(p.code)})` : ''}</div><div><span>Age / Sex:</span> ${esc([ageOf(p), p.gender].filter(Boolean).join(' · ') || '—')}</div><div><span>Phone:</span> ${esc(p.phone || '—')}</div>
      <div><span>Doctor:</span> ${esc(dName(doc) || '—')}</div><div><span>Visit:</span> ${esc(sheetDate((v && v.date) || bill.date))}</div><div></div></div>`
    + (TR.length ? `<h4>Treatment</h4><table><tr><th>#</th><th>Treatment</th><th>Tooth</th><th class="n">Charge</th>${disc ? '<th class="n">Discount</th>' : ''}<th class="n">Amount</th></tr>
      ${TR.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.legacy ? i.name || 'Earlier balance' : i.name)}</td><td>${esc(i.tooth || '—')}</td><td class="n">${inr(i.cost)}</td>${disc ? `<td class="n">${+i.discount ? inr(i.discount) : '—'}</td>` : ''}<td class="n">${inr(i.net)}</td></tr>`).join('')}
      <tr class="st"><td></td><td colspan="${disc ? 4 : 3}">Treatment total</td><td class="n">${inr(trT)}</td></tr></table>` : '')
    + (MD.length ? `<h4>Medicines</h4><table><tr><th>#</th><th>Medicine</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th></tr>
      ${MD.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.name)}</td><td class="n">${+i.qty || '—'}</td><td class="n">${i.unitPrice ? inr(i.unitPrice) : '—'}</td><td class="n">${inr(i.net)}</td></tr>`).join('')}
      <tr class="st"><td></td><td colspan="3">Medicines total</td><td class="n">${inr(mdT)}</td></tr></table>` : '')
    + sheetFoot('Authorised signature', `${TR.length ? `<div><span>Treatment</span><span>${inr(trT)}</span></div>` : ''}${MD.length ? `<div><span>Medicines</span><span>${inr(mdT)}</span></div>` : ''}
      <div class="g"><span>Total</span><span>${inr(total)}</span></div><div class="words">${esc(rupeesWords(total))}</div>`);
  return sheetWindow((kind === 'ESTIMATE' ? 'Estimate ' : 'Bill ') + (bill.billNo || pName(p)), body, TR.length + MD.length <= SHEET_HALF_MAX);
}
// payment receipt: ctx {p, T, P, B} (defaults: the open patient card, or the visit being billed)
function printReceipt(x, c){
  if (!x) return;
  const vb = cl.bill && cl.bill.p && cl.bill.p.id === x.patientId ? cl.bill : null;
  const p = (c && c.p) || (vb && vb.p) || cl.p, T = (c && c.T) || (vb && vb.T) || cl.pT || [], P0 = (c && c.P) || (vb && vb.P) || cl.pP || [], B = (c && c.B) || (vb && vb.B) || cl.pB || [];
  const P = P0.some(y => y.id === x.id) ? P0 : P0.concat([x]), bill = x.billId ? B.find(b => b.id === x.billId) : null;
  const ord = y => String(y.date || '') + String(y.createdAt || 0).padStart(15, '0');
  let left, list, total, soFar;
  if (bill){
    const I = bill.items || [], TR = I.filter(i => !i.med), md = I.filter(i => i.med).reduce((s, i) => s + (+i.net || 0), 0);
    total = +bill.total || 0;
    left = `<h4>Treatment done</h4><table><tr><th>Treatment</th><th class="n">Amount</th></tr>
      ${TR.map(i => `<tr><td>${esc(i.name || 'Earlier balance')}${i.tooth ? ` (${esc(i.tooth)})` : ''}</td><td class="n">${inr(i.net)}</td></tr>`).join('')}
      ${md ? `<tr><td>Medicines</td><td class="n">${inr(md)}</td></tr>` : ''}<tr class="st"><td>Bill total</td><td class="n">${inr(total)}</td></tr></table>`;
    list = P.filter(y => y.billId === bill.id && ord(y) <= ord(x)).sort((a, b) => ord(a).localeCompare(ord(b)));
  } else {
    // a payment with no bill (older records): what it was for, and the patient's balance
    total = billed(T); left = `<h4>Payment for</h4><table><tr><th>Description</th><th class="n">Amount</th></tr><tr><td>${esc(x.note || 'Dental treatment')}</td><td class="n">${inr(x.amount)}</td></tr><tr class="st"><td>Treatment cost to date</td><td class="n">${inr(total)}</td></tr></table>`;
    list = P.filter(y => !y.billId && ord(y) <= ord(x)).sort((a, b) => ord(a).localeCompare(ord(b))).slice(-SHEET_HALF_MAX);
  }
  soFar = bill ? list.reduce((s, y) => s + (+y.amount || 0), 0) : paidSum(P.filter(y => ord(y) <= ord(x)));
  const bal = Math.max(0, total - soFar);
  // what the patient still owes on other bills / from before bills (as of today)
  const other = bill ? B.filter(b => billLive(b) && b.id !== bill.id).reduce((s, b) => s + billDue(b), 0) + earlierDue(T, P, B) : 0;
  const body = sheetHead('RECEIPT', x.receiptNo, x.date)
    + `<div class="meta"><div><span>Received from:</span> <b>${esc(pName(p))}</b>${p.code ? ` (${esc(p.code)})` : ''}</div><div><span>Phone:</span> ${esc(p.phone || '—')}</div><div>${bill ? `<span>Against bill:</span> ${esc(bill.billNo)}` : x.doctorId ? `<span>Doctor:</span> ${esc(dName(x.doctorId))}` : ''}</div></div>`
    + `<div class="row"><div style="flex:1.3">${left}</div><div style="flex:1"><h4>Payments</h4><table><tr><th>Date</th><th>Receipt</th><th>Mode</th><th class="n">Amount</th></tr>
      ${list.map(y => `<tr class="${y.id === x.id ? 'now' : ''}${y.reversedBy || y.kind === 'reversal' ? ' gone' : ''}"><td>${esc(sheetDate(y.date, false))}</td><td>${esc(y.receiptNo || '')}</td><td>${esc(y.kind === 'reversal' ? 'Cancelled' : y.kind === 'refund' ? 'Refund' : sheetMode(y.mode))}</td><td class="n">${inr(y.amount)}</td></tr>`).join('')}</table></div></div>`
    + sheetFoot('Received by', `<div><span>${bill ? 'Bill total' : 'Treatment cost'}</span><span>${inr(total)}</span></div><div><span>Paid now</span><span>${inr(x.amount)}</span></div><div><span>Paid so far</span><span>${inr(soFar)}</span></div>
      <div class="g${bal > 0 ? ' due' : ''}"><span>Balance to pay</span><span>${inr(bal)}</span></div>
      ${other > 0 ? `<div><span>Earlier dues</span><span>${inr(other)}</span></div><div class="g due"><span>Total to pay</span><span>${inr(bal + other)}</span></div>` : ''}
      <div class="words">Received with thanks ${esc(rupeesWords(x.amount))} (${esc(sheetMode(x.mode))}${x.txnRef ? ' · ' + esc(x.txnRef) : ''})</div>`);
  const lines = Math.max((bill ? (bill.items || []).filter(i => !i.med).length + 1 : 1), list.length);
  return sheetWindow('Receipt ' + (x.receiptNo || ''), body, lines <= SHEET_HALF_MAX);
}
