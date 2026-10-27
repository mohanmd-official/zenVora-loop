function accSetup(){
  const m = ameta(), w = canW('accounts');
  return `<div class="acards">
    <div class="box"><h3>Payment due date <span class="sub">for every month's bills, salaries and commitments</span></h3>
      <label class="stat">A month's payments are due by day <input type="number" id="stDueDay" min="1" max="28" value="${dueDayOf()}" style="width:70px"${w ? '' : ' disabled'}> of the next month
        <span class="stat">(e.g. October's by ${esc(fmtLong(dueFor(todayKey.slice(0, 4) + '-10')))}). Reminders: 3 days before, on the day and when overdue.</span></label></div>
    <div class="box"><h3>Monthly commitments <span class="sub">enter each month's amount by the due date, or a reminder goes to the Planning Board</span></h3>
      ${m.commitments.map(c => `<div class="crow" data-cm="${esc(c.id)}"><b>${esc(c.name)}</b><span class="sp"></span><label class="stat">Expected ₹ <input type="number" data-cmamt value="${+c.amount || ''}" min="0" style="width:100px"${w ? '' : ' disabled'}></label>${w ? '<button class="danger" data-cmdel>✕</button>' : ''}</div>`).join('') || '<div class="stat">None yet.</div>'}
      ${w ? `<form class="aform" id="accCmForm" novalidate style="margin-top:8px"><label class="grow">Add a commitment<input id="cmName" placeholder="e.g. Electricity, Internet, Salary"></label><label>Expected ₹<input type="number" id="cmAmt" min="0"></label><button class="primary" type="submit">Add</button></form>` : ''}</div>
    <div class="box"><h3>Expense categories <span class="sub">your own list, used in Clinic expenses</span></h3>
      <div class="chips">${m.cats.map(c => `<span class="chip" data-cat="${esc(c)}">${esc(c)}${w ? ' <button data-catdel title="Remove">✕</button>' : ''}</span>`).join('') || '<span class="stat">No categories yet.</span>'}</div>
      <p class="stat">Commitments, Lab, Materials and Consultant fees are always available. Petty cash is handled in its own tab.</p>
      ${w ? `<form class="aform" id="accCatForm" novalidate><label class="grow">New category<input id="catName" placeholder="e.g. Equipment repairs, Marketing"></label><button class="primary" type="submit">Add</button></form>` : ''}</div>
  </div>`;
}
/* past data (migration) + year-end audit pack */
const fyOf = k => { const y = +k.slice(0, 4), m = +k.slice(5, 7); return m >= 4 ? y : y - 1; };
function accImport(){
  const fy0 = fyOf(todayKey), fys = [fy0, fy0 - 1, fy0 - 2];
  return `<div class="acards">
    <div class="box"><h3>Add past income <span class="sub">e.g. collections before you started using Zenvora Loop</span></h3>
      <form class="aform" id="accIncForm" novalidate><label>Month<input type="month" id="inMonth" max="${todayKey.slice(0, 7)}" value="${mShift(todayKey.slice(0, 7), -1)}"></label><label>Amount (₹) *<input type="number" id="inAmt" min="1"></label>
        <label class="grow">Note<input id="inNote" placeholder="e.g. Total collections (from old register)"></label><button class="primary" type="submit">Add income</button></form>
      <p class="stat">Past expenses: use Clinic expenses with an old date, or paste many rows below.</p></div>
    <div class="box"><h3>Paste many rows <span class="sub">from Excel / Google Sheets</span></h3>
      <form id="accBulkForm" novalidate><textarea id="bkRows" rows="6" placeholder="date, income|expense, category, amount, note&#10;2026-08-05, expense, Rent, 25000, August rent&#10;2026-08-31, income, Past collections, 182000, August total"></textarea>
        <div class="btnrow" style="margin-top:6px"><button class="primary" type="submit">Import rows</button><span class="stat">Dates as YYYY-MM-DD or DD/MM/YYYY. One row per line.</span></div></form></div>
    <div class="box"><h3>Year-end audit pack <span class="sub">for your auditor</span></h3>
      <p class="stat" style="margin:0 0 8px">Downloads one ZIP with income, expenses (with bill numbers and GST), vendor bills, consultant payments, petty cash, daily tallies, a month-by-month summary, and every attached bill copy.</p>
      <div class="btnrow"><select id="fySel">${fys.map(y => `<option value="${y}">FY ${y}-${String(y + 1).slice(2)} (Apr ${y} – Mar ${y + 1})</option>`).join('')}</select><button class="primary" id="auditBtn">⬇ Download audit pack</button></div></div>
  </div>
  ${(cl.acc.d && cl.acc.d.audit) ? `<div class="box" style="margin-top:12px"><h3>Audit log <span class="sub">every deleted money record is kept here, with who deleted it and when</span></h3>
    ${tbl(['When', 'By', 'What', 'Details', '₹Amount'], cl.acc.d.audit.slice().sort((x, y) => (y.at || 0) - (x.at || 0)).slice(0, 100).map(x => { const d0 = x.data || {};
      return {c:[esc(fmt(x.at)), esc((x.by || '').split('@')[0]), esc(x.coll === 'tallies' ? 'Daily tally ' + (d0.date || '') : (d0.kind === 'pettyspend' ? 'Petty spend' : d0.kind === 'petty' ? 'Petty top-up' : d0.kind || 'Entry') + (d0.category ? ' · ' + d0.category : '')), esc([d0.date, d0.note].filter(Boolean).join(' · ').slice(0, 80)), inr(d0.amount != null ? d0.amount : d0.counted || 0)]}; }))}</div>` : ''}`;
}
const csvOf = rows => rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
function loadScript(src){ return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
async function auditPack(fy){
  const {F} = cloud, from = `${fy}-04-01`, to = `${fy + 1}-03-31`, W = F.where, btn = $('#auditBtn');
  btn.disabled = true; btn.textContent = 'Preparing…';
  try {
    if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const q = (c, ...w) => F.getDocs(F.query(cCol(c), ...w)).then(docsOf);
    const [pay, led, tr, ven, tal] = await Promise.all([q('payments', W('date', '>=', from), W('date', '<=', to)), q('ledger', W('date', '>=', from), W('date', '<=', to)),
      q('treatments', W('date', '>=', from), W('date', '<=', to)), q('vendors'), q('tallies', W('date', '>=', from), W('date', '<=', to))]);
    const vn = id => (ven.find(v => v.id === id) || {}).name || '', vg = id => (ven.find(v => v.id === id) || {}).gstin || '';
    const zip = new JSZip(), org = orgCtx().org, by = (a, b) => String(a.date).localeCompare(String(b.date));
    zip.file('income-patient-payments.csv', csvOf([['Date', 'Receipt', 'Patient', 'Mode', 'Amount', 'Note']].concat(pay.sort(by).map(x => [x.date, x.receiptNo, x.patientName, x.mode, x.amount, x.note]))));
    zip.file('income-other.csv', csvOf([['Date', 'Category', 'Amount', 'Note']].concat(led.filter(x => x.kind === 'income').sort(by).map(x => [x.date, x.category, x.amount, x.note]))));
    const exps = led.filter(x => x.kind === 'expense').sort(by), docs = folder => folder;
    zip.file('expenses.csv', csvOf([['Date', 'Category', 'Vendor', 'Vendor GSTIN', 'Bill no', 'GST', 'Amount', 'Paid', 'Mode', 'Note', 'Bill copy']].concat(exps.map(x => [x.date, x.category, vn(x.vendorId) || (x.doctorId ? dName(x.doctorId) : ''), vg(x.vendorId), x.billNo, x.gst, x.amount, x.paid === false ? 'No' : 'Yes', x.mode, x.note, x.hasDoc ? `bills/${x.date}-${x.id}` : '']))));
    zip.file('consultant-fees.csv', csvOf([['Date', 'Consultant', 'Patient', 'Treatment', 'Fee']].concat(tr.filter(t => +t.consultantFee > 0).sort(by).map(t => [t.date, dName(t.doctorId), t.patientName, t.typeName, t.consultantFee]))));
    zip.file('consultant-payments.csv', csvOf([['Date', 'Consultant', 'Amount', 'Mode', 'Note']].concat(led.filter(x => x.kind === 'cpayout').sort(by).map(x => [x.date, dName(x.doctorId), x.amount, x.mode, x.note]))));
    zip.file('petty-cash.csv', csvOf([['Date', 'Type', 'Amount', 'Note', 'By']].concat(led.filter(x => x.kind === 'petty' || x.kind === 'pettyspend').sort(by).map(x => [x.date, x.kind === 'petty' ? 'Top-up' : 'Spend', x.amount, x.note, x.by]))));
    zip.file('daily-tallies.csv', csvOf([['Date', 'Cash expected', 'Cash counted', 'Cash difference', 'UPI recorded', 'UPI per app', 'Cards & others recorded', 'Cards & others per app', 'Online difference', 'Note', 'By']].concat(tal.sort(by).map(t => { const g = t.digital || {}, v = (k, f) => g[k] ? +g[k][f] || 0 : 0;
      return [t.date, t.expected, t.counted, t.diff, v('upi', 'system'), v('upi', 'app'), v('card', 'system') + v('ccard', 'system') + v('other', 'system') + v('bank', 'system'), v('card', 'app') + v('ccard', 'app') + v('other', 'app') + v('bank', 'app'), t.digitalDiff || 0, t.note, t.by]; }))));
    const months = [...Array(12)].map((_, i) => mShift(`${fy}-04`, i));
    zip.file('summary-by-month.csv', csvOf([['Month', 'Patient payments', 'Other income', 'Clinic expenses', 'Consultant fees', 'Petty cash top-ups', 'Net']].concat(months.map(m => {
      const inM = x => (x.date || '').slice(0, 7) === m, p = paidSum(pay.filter(inM)), oi = paidSum(led.filter(x => x.kind === 'income' && inM(x))), e = paidSum(led.filter(x => x.kind === 'expense' && inM(x)));
      const cf = tr.filter(inM).reduce((s, t) => s + (+t.consultantFee || 0), 0), pc = paidSum(led.filter(x => x.kind === 'petty' && !x.opening && inM(x)));
      return [monthLabel(m), p, oi, e, cf, pc, p + oi - e - cf - pc]; }))));
    for (const x of exps.filter(x => x.hasDoc)){
      try { const s = await F.getDoc(cDoc('ledgerDocs', x.id)); if (!s.exists()) continue; const dd = s.data(), b64 = String(dd.data).split(',')[1], ext = (dd.mime || '').includes('pdf') ? 'pdf' : 'jpg';
        zip.file(`bills/${x.date}-${x.id}.${ext}`, b64, {base64:true}); } catch(e){}
    }
    zip.file('README.txt', `${org.name}: accounts for FY ${fy}-${String(fy + 1).slice(2)} (1 Apr ${fy} to 31 Mar ${fy + 1}).\nExported from Zenvora Loop on ${new Date().toLocaleString()}.\nAll amounts in INR.\n`);
    const blob = await zip.generateAsync({type:'blob'});
    download(blob, `${slugify(org.name)}-audit-FY${fy}-${String(fy + 1).slice(2)}.zip`);
    info('Audit pack downloaded.');
  } catch(e){ info('Could not build the audit pack: ' + errText(e)); }
  btn.disabled = false; btn.textContent = '⬇ Download audit pack';
}
