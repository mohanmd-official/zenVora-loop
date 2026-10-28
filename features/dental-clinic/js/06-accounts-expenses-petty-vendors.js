/* expense form, used for clinic expenses and for lab / material bills */
function expForm(pre, vendorType){
  pre = pre || {};
  const vs = (cl.acc.d.vendors || []).filter(v => v.active !== false && (!vendorType || v.type === vendorType));
  const cats = vendorType ? [vendorType] : otherCats(), sm = pre.serviceMonth || cl.acc.month;
  return `<form class="aform" id="accExpForm" data-vt="${esc(vendorType || '')}" novalidate>
    <label>Date<input type="date" id="exDate" value="${pre.date || (cl.acc.month === todayKey.slice(0, 7) ? todayKey : mEnd(cl.acc.month))}" max="${todayKey}"></label>
    ${vendorType ? `<label class="grow">${esc(vendorType)} vendor *<select id="exVendor">${vs.map(v => `<option value="${esc(v.id)}"${v.id === pre.vendorId ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>`
      : `<label>Category<select id="exCat">${cats.map(c => `<option${c === pre.category ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
         <label class="grow">Description *<input id="exDesc" value="${esc(pre.desc || '')}" placeholder="e.g. October rent, EB bill Sep–Oct"></label>`}
    <label>For month<input type="month" id="exSvc" value="${esc(sm)}" title="The month this expense belongs to (service month)"></label>
    <label>Amount (₹) *<input type="number" id="exAmt" min="1" value="${pre.amount || ''}"></label>
    <label>Bill / invoice no.<input id="exBill" placeholder="optional"></label>
    <label>GST in bill (₹)<input type="number" id="exGst" min="0" placeholder="0"></label>
    <label>Payment<select id="exMode"><option value="unpaid">Not paid yet</option>${PMODES.map(([m, l]) => `<option value="${m}"${!vendorType && m === 'cash' && pre.paid !== false ? ' selected' : ''}>Paid · ${l}</option>`).join('')}</select></label>
    <label>Paid on<input type="date" id="exPaidOn" value="${todayKey}" max="${todayKey}" title="Date the money was paid"></label>
    <label>Due date<input type="date" id="exDue" value="${esc(pre.dueDate || dueFor(sm))}" title="When it must be paid by (default: the ${dueDayOf()}th of the next month)"></label>
    <label class="grow">Note<input id="exNote" value="${esc(pre.note || '')}" placeholder="${vendorType === 'Lab' ? 'e.g. Zirconia crown · patient name' : vendorType ? 'e.g. Composite kit, gloves' : 'optional'}"></label>
    <label>Bill copy (photo / PDF)<input type="file" id="exFile" accept="image/*,application/pdf"></label>
    <button class="primary" type="submit">${vendorType ? 'Add bill' : 'Add expense'}</button></form>`;
}
const vName = id => ((cl.acc.d && cl.acc.d.vendors) || []).find(v => v.id === id) || {};
const billCell = x => x.hasDoc ? `<button class="ghost" data-billdoc="${esc(x.id)}" title="View bill copy">📎</button>` : '';
const EXP_COL = {lab:'#0EA5E9', materials:'#8B5CF6', consult:'#F59E0B', salary:'#10B981', petty:'#EC4899', other:'#64748B'};
function accExpenses(d){
  const a = cl.acc, w = canW('accounts'), f = a.ef = a.ef || {}, led = (d.led || []), fees = d.fees || [];
  // every source in one list, by the month each expense is for (or by date when a date range is picked)
  const months = f.from && f.to ? [...new Set(days(f.from, f.to).map(k => k.slice(0, 7)))] : [a.month];
  let all = months.flatMap(m => expensesOf(led, fees, m, {petty:true}));
  if (f.from && f.to) all = all.filter(x => (x.date || '') >= f.from && (x.date || '') <= f.to);
  const rows = all.filter(x => (!f.src || x.source === f.src) && (!f.cat || x.category === f.cat) && (!f.mode || (x.mode || '') === f.mode)
    && (!f.st || (f.st === 'paid' ? x.src === 'ledger' && x.paid !== false : f.st === 'unpaid' ? x.paid === false : f.st === 'overdue' ? payState(x) === 'overdue' : true)))
    .sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const total = paidSum(all), bySrc = Object.keys(EXP_SRC).map(k => [k, paidSum(all.filter(x => x.source === k))]);
  // outstanding: unpaid bills (any month), consultant balances, salary still to pay for a finished month
  const unpaid = (d.expAll || []).filter(x => x.paid === false).sort((x, y) => xDue(x).localeCompare(xDue(y))), overdue = unpaid.filter(x => payState(x) === 'overdue');
  const cons = cl.doctors.filter(x => x.type === 'consultant').map(c => { const fe = (d.cfeesAll || []).filter(t => t.doctorId === c.id).reduce((s2, t) => s2 + (+t.consultantFee || 0), 0) + paidSum((d.cfeeManual || []).filter(x => x.doctorId === c.id));
    return {c, bal:fe - paidSum((d.cpay || []).filter(x => x.doctorId === c.id))}; }).filter(x => x.bal > 0);
  const sal = a.month < todayKey.slice(0, 7) ? (d.staff || []).map(r => ({r, due:Math.max(0, Math.round(r.S.pay) - paidSum(r.paid))})).filter(x => x.due > 0) : [];
  const outTot = paidSum(unpaid) + cons.reduce((s2, x) => s2 + x.bal, 0) + sal.reduce((s2, x) => s2 + x.due, 0), nOut = unpaid.length + cons.length + sal.length;
  const party = x => x.vendorId ? vName(x.vendorId).name || '' : x.doctorId ? dName(x.doctorId) : x.staffName || '';
  const detail = x => [party(x), x.patientName && x.patientName !== party(x) ? x.patientName : '', x.note && !/^Consultant fee · /.test(x.note) ? x.note : '', x.billNo ? 'bill ' + x.billNo : '', x.kind === 'petty' ? ({drawer:'from the cash drawer', bank:'from the bank', owner:'from the owner'})[x.from] || '' : ''].filter(Boolean).join(' · ');
  const tag = k => `<span class="extag" style="--c:${EXP_COL[k]}">${EXP_SRC[k][0]}</span>`;
  const label = f.from && f.to ? `${fmtShort(f.from)} – ${fmtShort(f.to)}` : monthLabel(a.month);
  const sel = (id, opts, v, all0) => `<select id="${id}"><option value="">${all0}</option>${opts.map(([k, l]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const outRow = (dot, title, sub, right, amt, btn) => `<div class="orow"><span class="cdot${dot}"></span><div><b>${title}</b><span class="sub2">${sub}</span></div><div class="opill">${right}</div><b class="oamt">${amt}</b>${btn || '<span></span>'}</div>`;
  return `<div class="exhead">
      <div class="extot"><span>Clinic expenses · ${esc(label)}</span><b>${inr(total)}</b><em>${plural(all.length, 'expense')}</em></div>
      <div class="exout${overdue.length ? ' late' : ''}"><span>To pay</span><b>${inr(outTot)}</b><em>${overdue.length ? `${plural(overdue.length, 'payment')} overdue` : nOut ? `${plural(nOut, 'item')} · due by ${esc(fmtDM(dueFor(a.month)))}` : 'nothing outstanding'}</em></div>
      ${w ? `<button class="primary" id="exAddBtn">${a.exAdd ? '✕ Close' : '+ Add expense'}</button>` : ''}</div>
    <div class="exbar">${bySrc.filter(([, v]) => v).map(([k, v]) => `<i style="flex:${v};background:${EXP_COL[k]}" title="${EXP_SRC[k][0]} ${inr(v)}"></i>`).join('') || '<i style="flex:1;background:var(--line)"></i>'}</div>
    <div class="exchips">${bySrc.map(([k, v]) => `<button class="exchip${f.src === k ? ' on' : ''}${v ? '' : ' zero'}" data-exsrc="${k}" style="--c:${EXP_COL[k]}" title="Show only ${EXP_SRC[k][0]}"><i></i>${EXP_SRC[k][0]}<b>${inr(v)}</b></button>`).join('')}</div>
    ${w && a.exAdd ? `<div class="box exadd"><h3>Add an expense <span class="sub">rent, EB, clinic loan, internet, maintenance, miscellaneous … (lab, materials, consultants, salary and petty cash have their own pages)</span></h3>${expForm(a.pre)}</div>` : ''}
    ${nOut ? `<details class="box exoutl"${overdue.length || a.exOutOpen ? ' open' : ''}><summary><b>Payments to make</b> <span class="stat">${plural(nOut, 'item')} · ${inr(outTot)}</span></summary>
      ${unpaid.map(x => `<div class="orow" data-led="${esc(x.id)}"><span class="cdot${payState(x) === 'overdue' ? ' late' : ''}"></span><div><b>${esc(x.category)}</b><span class="sub2">${esc([party(x), x.note].filter(Boolean).join(' · ').slice(0, 60))} · ${esc(monthLabel(svcMonth(x)))}</span></div><div class="opill">${payPill(x)}</div><b class="oamt">${inr(x.amount)}</b>${w ? '<button class="primary sm" data-billpay>Mark paid</button>' : '<span></span>'}</div>`).join('')}
      ${cons.map(x => outRow('', 'Consultant fees', esc(x.c.name) + ': not yet paid', `<a class="srcl" data-at="consultants" href="#/clinic/accounts/consultants">Pay in Consultants</a>`, inr(x.bal))).join('')}
      ${sal.map(x => outRow(todayKey > dueFor(a.month) ? ' late' : '', 'Staff salary', esc(fullName(x.r.a)) + ' · ' + esc(monthLabel(a.month)), `<a class="srcl" data-at="salary" href="#/clinic/accounts/salary">Pay in Staff salary</a>`, inr(x.due))).join('')}</details>` : ''}
    <div class="exfilt"><input type="date" id="efFrom" value="${esc(f.from || '')}" title="From (leave empty for the whole month)"><i>–</i><input type="date" id="efTo" value="${esc(f.to || '')}" title="To">
      ${sel('efCat', [...new Set(all.map(x => x.category || 'Other'))].sort().map(c => [c, c]), f.cat, 'All categories')}${sel('efMode', PMODES, f.mode, 'Any method')}${sel('efSt', [['paid', 'Paid'], ['unpaid', 'Unpaid'], ['overdue', 'Overdue']], f.st, 'Any status')}
      ${f.from || f.to || f.src || f.cat || f.mode || f.st ? '<button class="linkb" id="efClear">Clear filters</button>' : ''}<span class="sp"></span><span class="stat">${plural(rows.length, 'expense')} · <b>${inr(paidSum(rows))}</b></span></div>
    <div class="awrap" style="margin-top:0"><table class="atbl extbl"><thead><tr><th>Date</th><th>Expense</th><th>From</th><th>Method</th><th>Status</th><th class="num">Amount</th><th></th></tr></thead><tbody>
    ${rows.map(x => { const own = x.source === 'other' && x.src === 'ledger';
      return `<tr${x.src === 'ledger' ? ` data-led="${esc(x.id)}"` : ''} class="${a.hl && a.hl === x.id ? 'hlrow' : ''}"><td class="nowrap">${esc(fmtDM(x.date))}${svcMonth(x) !== (x.date || '').slice(0, 7) ? `<span class="sub2">for ${esc(monthLabel(svcMonth(x)).split(' ')[0])}</span>` : ''}</td>
        <td><b>${esc(x.category || '')}</b>${detail(x) ? `<span class="sub2">${esc(detail(x))}</span>` : ''}</td>
        <td><a class="srcl0" data-at="${EXP_SRC[x.source][1]}" href="#/clinic/accounts/${EXP_SRC[x.source][1]}" title="Open ${EXP_SRC[x.source][0]}">${tag(x.source)}</a></td>
        <td>${esc((PMODES.find(m => m[0] === x.mode) || [0, ''])[1])}</td><td>${x.src === 'fee' ? '<span class="stat">see Consultants</span>' : payPill(x)}</td><td class="num"><b>${inr(x.amount)}</b></td>
        <td class="nowrap">${x.src === 'ledger' ? billCell(x) : ''}${w && x.src === 'ledger' && x.paid === false ? ' <button class="primary sm" data-billpay>Mark paid</button>' : ''}${w && own ? ' <button class="ghost xdel" data-ldel title="Delete (a copy is kept in the audit log)">✕</button>' : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="stat">No expenses for this selection.</td></tr>'}
    </tbody></table></div>
    <p class="stat">Each expense is recorded once, on its own page; this page adds them up. Petty cash counts when the box is topped up (the spends are listed on the Petty cash page). Consultant payouts settle fees already counted; the Daily tally is a cash check, not an expense.</p>`;
}
function accPetty(d){
  const a = cl.acc, owner = canW('accounts'), spend = canW('petty') || owner, inM = x => (x.date || '').slice(0, 7) === a.month;
  const L = (d.pin || []).concat(d.pout || []).filter(inM).sort((x, y) => String(y.date).localeCompare(String(x.date)) || (y.at || 0) - (x.at || 0));
  const tin = paidSum(L.filter(x => x.kind === 'petty')), tout = paidSum(L.filter(x => x.kind === 'pettyspend'));
  const dflt = a.month === todayKey.slice(0, 7) ? todayKey : mEnd(a.month);
  const bal = d.pettyBal, everIn = (d.pin || []).length;
  return `<div class="kpis">${kpi('Cash in the petty box', inr(Math.max(0, bal)), bal < 0 ? `<span class="neg">${inr(-bal)} spent more than was topped up</span>` : 'top-ups minus spends: count the box to check', bal < 0 ? 'neg' : '')}
      ${kpi('Topped up this month', inr(tin), esc(monthLabel(a.month)))}${kpi('Spent this month', inr(tout), plural(L.filter(x => x.kind === 'pettyspend' && !x.change).length, 'spend') + (L.some(x => x.change) ? ` · ${inr(paidSum(L.filter(x => x.change)))} given as change` : ''))}</div>
    ${bal < 0 || !everIn ? `<div class="nag${bal < 0 ? ' late' : ''}">${bal < 0 ? `⚠ ${inr(-bal)} more has been recorded as spent than was ever topped up, so the balance can't be right.` : 'No top-up or opening balance has been recorded yet.'} ${owner ? 'Count the cash in the petty box and enter it below: that sets the correct balance.' : 'Ask the clinic owner to count the box and set the opening balance.'}</div>` : ''}
    <div class="acards">
      ${owner ? `<div class="box"><h3>Count the box / opening balance <span class="sub">enter the cash in the petty box right now</span></h3><form class="aform" id="accPcountForm" novalidate>
        <label>Cash in the box now (₹) *<input type="number" id="pcAmt" min="0" placeholder="e.g. 2000"></label><button class="primary" type="submit">Set balance</button></form>
        <p class="stat" style="margin:6px 0 0">The difference is recorded as an opening balance (or a correction), so the balance shown always equals the cash you have.</p></div>` : ''}
      ${owner ? `<div class="box"><h3>Top up petty cash <span class="sub">clinic owner / accounts</span></h3><form class="aform" id="accPinForm" novalidate>
        <label>Date<input type="date" id="piDate" value="${dflt}" max="${todayKey}"></label><label>Amount (₹) *<input type="number" id="piAmt" min="1"></label>
        <label>Taken from<select id="piSrc"><option value="drawer">Main cash drawer</option><option value="bank">Bank</option><option value="owner">Owner / other</option></select></label>
        <label class="grow">Note *<input id="piNote" placeholder="e.g. Weekly top-up handed to Riya"></label><button class="primary" type="submit">Top up</button></form></div>` : ''}
      ${spend ? `<div class="box"><h3>Record a petty cash spend <span class="sub">front desk</span></h3><form class="aform" id="accPoutForm" novalidate>
        <label>Date<input type="date" id="poDate" value="${dflt}" max="${todayKey}"></label><label>Amount (₹) *<input type="number" id="poAmt" min="1"></label>
        <label class="grow">Spent on *<input id="poNote" placeholder="e.g. Tea, courier, cleaning supplies"></label><button class="primary" type="submit">Add spend</button></form></div>` : ''}
    </div>
    <div class="awrap"><table class="atbl"><thead><tr><th>Date</th><th>Entry</th><th>Note</th><th class="num">Top-up</th><th class="num">Spent</th><th>By</th><th></th></tr></thead><tbody>
      ${L.map(x => `<tr data-led="${esc(x.id)}"><td>${esc(fmtShort(x.date))}</td><td>${x.kind === 'petty' ? (x.opening ? '<b>Opening / count</b>' : '<b>Top-up</b>') : x.adjust ? 'Count correction' : x.change ? '<span title="Taken from the petty box to give a patient their change; the patient\'s notes went into the purse (see the daily tally)">Change to a patient</span>' : 'Spend'}</td><td>${esc(x.note || '')}</td><td class="num">${x.kind === 'petty' ? inr(x.amount) : ''}</td><td class="num">${x.kind === 'pettyspend' ? inr(x.amount) : ''}</td><td class="stat">${esc((x.by || '').split('@')[0])}</td><td>${owner && !x.change ? '<button class="danger" data-ldel>✕</button>' : x.change ? '<span class="stat" title="Delete the payment to undo it">from billing</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="stat">No petty cash entries this month.</td></tr>'}
    </tbody></table></div>`;
}
function accVendorTab(type){
  const a = cl.acc, d = a.d, w = canW('accounts');
  const vs = d.vendors.filter(v => v.type === type);
  const all = d.billsAll.filter(x => vs.some(v => v.id === x.vendorId));
  const f = a.vf && vs.some(v => v.id === a.vf) ? a.vf : '';
  const shown = all.filter(x => (!f || x.vendorId === f) && (a.vonly === 'unpaid' ? x.paid === false : svcMonth(x) === a.month || x.paid === false)).sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const vrows = vs.map(v => { const bills = all.filter(x => x.vendorId === v.id), due = paidSum(bills.filter(x => x.paid === false)), mo = paidSum(bills.filter(x => svcMonth(x) === a.month));
    return `<tr data-ven="${esc(v.id)}"${v.active === false ? ' style="opacity:.55"' : ''} class="clk"><td><b>${esc(v.name)}</b><span class="sub2">${esc([v.phone, v.gstin && 'GSTIN ' + v.gstin, v.notes].filter(Boolean).join(' · '))}</span></td><td class="num">${inr(mo)}</td><td class="num"><b class="${due ? 'neg' : ''}">${inr(due)}</b></td>
      <td>${w ? `<div class="uact"><button data-vfilter>Show bills</button><button data-vact>${v.active === false ? 'Activate' : 'Hide'}</button></div>` : ''}</td></tr>`; }).join('');
  return `<div class="acards">
      ${w ? `<div class="box"><h3>Add a ${type.toLowerCase()} vendor</h3><form class="aform" id="accVenForm" data-vt="${type}" novalidate><label class="grow">Name *<input id="vnName" placeholder="${type === 'Lab' ? 'e.g. Smile Dental Lab' : 'e.g. Dental Mart'}"></label>
        <label>Phone<input id="vnPhone"></label><label>GSTIN<input id="vnGst"></label><label class="grow">Notes<input id="vnNotes" placeholder="contact person, bank details…"></label><button class="primary" type="submit">Add vendor</button></form></div>` : ''}
    </div>
    <div class="awrap"><table class="atbl otbl"><thead><tr><th>${type} vendor</th><th class="num">Bills in ${esc(parseDay(a.month + '-01').toLocaleDateString([], {month:'short'}))}</th><th class="num">Unpaid now</th><th></th></tr></thead><tbody>${vrows || `<tr><td colspan="4" class="stat">No ${type.toLowerCase()} vendors yet.</td></tr>`}</tbody></table></div>
    ${vs.length && w ? `<div class="box"><h3>Add a ${type.toLowerCase()} bill</h3>${expForm(Object.assign({}, a.pre, {vendorId:a.pre && a.pre.vendorId || f}), type)}</div>` : ''}
    <div class="vbar" style="padding:0 0 8px"><strong>Bills</strong><select id="vFilter"><option value="">All ${type.toLowerCase()} vendors</option>${vs.map(v => `<option value="${esc(v.id)}"${v.id === f ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select>
      <select id="vOnly"><option value="month"${a.vonly !== 'unpaid' ? ' selected' : ''}>This month + unpaid</option><option value="unpaid"${a.vonly === 'unpaid' ? ' selected' : ''}>Unpaid only</option></select>
      <span class="sp"></span><span class="stat">Unpaid total: <b class="neg">${inr(paidSum(shown.filter(x => x.paid === false)))}</b></span></div>
    <div class="awrap" style="margin-top:0"><table class="atbl"><thead><tr><th>Date</th><th>Vendor</th><th>Bill no.</th><th>Note</th><th class="num">GST</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>
      ${shown.map(x => `<tr data-led="${esc(x.id)}"><td>${esc(fmtShort(x.date))}</td><td>${esc(vName(x.vendorId).name || '')}</td><td>${esc(x.billNo || '—')}</td><td>${esc(x.note || '')}</td><td class="num">${+x.gst ? inr(x.gst) : '—'}</td><td class="num"><b>${inr(x.amount)}</b></td>
        <td>${payPill(x)}${x.paid === false && w ? ' <button class="primary" data-billpay>Mark paid</button>' : ''}</td>
        <td>${billCell(x)}${w ? '<button class="danger" data-ldel>✕</button>' : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="stat">No bills.</td></tr>'}
    </tbody></table></div>`;
}
