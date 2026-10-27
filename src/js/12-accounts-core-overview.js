/* ---------- Accounts ----------
   Income  = patient payments + any manual / past income entries.
   Clinic expenses = expenses (incl. lab & material bills) + consultant fees from treatments.
   Petty cash is a separate cash box: the owner tops it up, front desk records what it is spent on.
   Daily tally = counting the main cash drawer by denomination against what the system expects. */
const VENDOR_TYPES = ['Lab', 'Materials', 'Other'];
const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
const defaultAMeta = () => ({cats:[], commitments:[{id:'rent', name:'Rent', amount:0}]});
const ameta = () => { const m = Object.assign(defaultAMeta(), cl.ameta || {}); m.commitments = (m.commitments || []).filter(c => c.id !== 'petty'); m.cats = m.cats || []; return m; };
const monthLabel = mk => parseDay(mk + '-01').toLocaleDateString([], {month:'long', year:'numeric'});
const mShift = (mk, n) => { const d = parseDay(mk + '-01'); d.setMonth(d.getMonth() + n); return dayKey(d).slice(0, 7); };
const mEnd = mk => monthBounds(mk).e;
const expCats = () => { const m = ameta(); return [...new Set(m.commitments.map(c => c.name).concat(m.cats, ['Lab', 'Materials']))]; };
/* ----- payment tracking: every obligation has a service month; it is due on day N (Commitments & categories, default 15) of the NEXT month ----- */
const MODULE_CATS = ['Lab', 'Materials', 'Consultant fees', 'Staff salary'];        // these have their own pages; Clinic expenses only shows them
const OTHER_CATS = ['Rent', 'Electricity (EB)', 'Clinic loan', 'Internet & phone', 'Water & utilities', 'Maintenance & repairs', 'Miscellaneous'];
const otherCats = () => { const m = ameta(); return [...new Set(m.commitments.map(c => c.name).concat(OTHER_CATS, m.cats))].filter(c => !MODULE_CATS.includes(c)); };
const dueDayOf = () => Math.min(28, Math.max(1, Math.round(+ameta().dueDay || 15)));
const dueFor = mk => `${mShift(mk, 1)}-${pad2(dueDayOf())}`;
const svcMonth = x => x.serviceMonth || (x.date || '').slice(0, 7);
const xDue = x => x.dueDate || dueFor(svcMonth(x));
const payState = x => x.paid !== false ? 'paid' : todayKey > xDue(x) ? 'overdue' : todayKey === xDue(x) ? 'today' : shiftDay(todayKey, 3) >= xDue(x) ? 'soon' : 'open';
const PAYST = {paid:['Paid', 'on'], overdue:['Overdue', 'gone'], today:['Due today', 'gone'], soon:['Due soon', 'pend'], open:['Unpaid', 'pend']};
const payPill = x => { const st = payState(x); return `<span class="upill ${PAYST[st][1]}">${PAYST[st][0]}</span>${st !== 'paid' ? `<span class="sub2">due ${esc(fmtDM(xDue(x)))}</span>` : x.paidDate ? `<span class="sub2">${esc(fmtDM(x.paidDate))}</span>` : ''}`; };
/* every change to a money record keeps what it was before: who, when and the old values */
const withHist = (x, change) => ({history:(x.history || []).concat([{at:Date.now(), by:cloud.user.email || '', change}]).slice(-30)});
async function auditDelete(coll, id, data){
  try { await cloud.F.addDoc(cCol('auditLog'), {coll, docId:id, action:'delete', data:JSON.parse(JSON.stringify(data || {})), by:cloud.user.email || '', at:Date.now()}); } catch(e){ console.warn('audit', e); }
}
const isOwner = () => { const oc = orgCtx(); return !!(oc && !oc.support && oc.role === 'orgadmin'); };
function commitStatus(mk, led){
  const due = dueFor(mk);
  return ameta().commitments.map(c => {
    const xs = led.filter(x => svcMonth(x) === mk && x.kind === 'expense' && x.category === c.name);
    const done = xs.length > 0, late = !done && todayKey > due;
    return {c, done, late, due, amt:paidSum(xs), unpaid:xs.filter(x => x.paid === false)};
  });
}
const ACC_TABS = [['overview', 'Overview', 'accounts'], ['tally', 'Daily tally', 'tally'], ['expenses', 'Clinic expenses', 'accounts'], ['petty', 'Petty cash', 'petty'],
  ['lab', 'Lab', 'accounts'], ['materials', 'Materials', 'accounts'], ['consultants', 'Consultants', 'accounts'], ['salary', 'Staff salary', 'accounts'], ['setup', 'Commitments & categories', 'accounts'], ['import', 'Past data & audit', 'accounts']];
const accTabs = () => ACC_TABS.filter(t => t[0] !== 'salary' || (feat('attendance') && canManageAtt() && !(orgCtx() || {}).support)).filter(t => can(t[2]) || (t[2] !== 'accounts' && can('accounts')) || (t[0] === 'consultants' && isOwnerLike()));
function clAccLoad(){
  const {F} = cloud, a = cl.acc;
  if (!a.month) a.month = todayKey.slice(0, 7);
  const key = orgCtx().orgId + a.month + '|' + a.tab + '|' + (a.tab === 'tally' ? a.tday : '');
  if (a.key === key) return; a.key = key; a.d = null;
  const again = () => { if (a.key === key && state.settings.view === 'clinic' && cl.sec === 'accounts') renderClinic(); };
  const q = (c, ...w) => F.getDocs(F.query(cCol(c), ...w)).then(docsOf);
  const W = F.where, full = can('accounts') || (a.tab === 'consultants' && isOwnerLike());
  const from = mShift(a.month, -5) + '-01', to = mEnd(a.month), toN = mEnd(mShift(a.month, 1));
  const jobs = {};
  if (full){
    jobs.pay = q('payments', W('date', '>=', from), W('date', '<=', to));
    jobs.led = q('ledger', W('date', '>=', from), W('date', '<=', toN));                   // + next month: bills for this month are often entered after it ends
    jobs.fees = q('treatments', W('date', '>=', from), W('date', '<=', to)).then(ts => ts.filter(t => +t.consultantFee > 0));
    jobs.vendors = q('vendors');
    jobs.cpay = q('ledger', W('kind', '==', 'cpayout'));
    jobs.cfeesAll = q('treatments', W('consultantFee', '>', 0));
    jobs.expAll = q('ledger', W('kind', '==', 'expense'));
  }
  if (a.tab === 'import' && can('accounts')) jobs.audit = q('auditLog').catch(() => []);
  if (['salary', 'expenses'].includes(a.tab) && feat('attendance') && payOn() && canManageAtt() && !(orgCtx() || {}).support) jobs.staff = loadStaffPay(a.month).catch(() => null);
  if (full && a.tab === 'consultants') jobs.mAppts = q('appointments', W('date', '>=', a.month + '-01'), W('date', '<=', mEnd(a.month)));
  if (full || can('petty')){ jobs.pin = q('ledger', W('kind', '==', 'petty')); jobs.pout = q('ledger', W('kind', '==', 'pettyspend')); }
  if (a.tab === 'tally' && (full || can('tally'))){
    const d = a.tday || todayKey;
    jobs.tPay = q('payments', W('date', '==', d)); jobs.tExp = q('ledger', W('kind', '==', 'expense'), W('date', '==', d)).then(xs => q('ledger', W('kind', '==', 'expense'), W('paidDate', '==', d)).then(ys => xs.concat(ys.filter(y => !xs.some(z => z.id === y.id)))).catch(() => xs));
    jobs.tPin = q('ledger', W('kind', '==', 'petty'), W('date', '==', d));
    jobs.prevT = q('tallies', W('date', '<', d), F.orderBy('date', 'desc'), F.limit(1)).catch(() => []);
    const m0 = d.slice(0, 7) + '-01', lo = shiftDay(d, -40) < m0 ? shiftDay(d, -40) : m0;
    jobs.tallies = q('tallies', W('date', '>=', lo), W('date', '<=', mEnd(d.slice(0, 7))));
    jobs.mPay = q('payments', W('date', '>=', m0), W('date', '<=', mEnd(d.slice(0, 7))));
  }
  const ks = Object.keys(jobs);
  Promise.all(ks.map(k => jobs[k])).then(vals => {
    if (a.key !== key) return;
    const d = {}; ks.forEach((k, i) => d[k] = vals[i]);
    d.pettyBal = paidSum(d.pin || []) - paidSum(d.pout || []);
    if (d.expAll){ d.billsAll = d.expAll.filter(x => x.vendorId); d.cfeeManual = d.expAll.filter(x => x.doctorId && !x.vendorId); }
    a.d = d; again();
  }).catch(e => { a.d = {err:errText(e)}; again(); });
}
/* Clinic expenses = every real expense, each from the page where it is recorded (its source of truth):
   Lab / Materials bills (vendors), Consultant fees (treatments + per-visit costs + manual fees), Staff salary (paid), Petty cash TOP-UPS
   (money handed to the petty box counts as spent; the individual petty spends are only on the Petty cash page, so nothing is counted twice),
   and Other expenses entered directly (rent, EB, loan …). NOT included: petty box openings / count corrections, consultant payouts (paying
   a fee already counted), patient payments and the daily tally (cash movement, not expenses). */
function expSource(x){
  if (x.src === 'fee') return 'consult';
  if (x.kind === 'petty' || x.kind === 'pettyspend') return 'petty';
  if (x.staffUid || x.category === 'Staff salary') return 'salary';
  if (x.vendorId){ const t = (vName(x.vendorId).type || x.category || ''); return t === 'Lab' ? 'lab' : t === 'Materials' ? 'materials' : 'other'; }
  if (x.doctorId) return 'consult';
  return 'other';
}
const EXP_SRC = {lab:['Lab', 'lab'], materials:['Materials', 'materials'], consult:['Consultants', 'consultants'], salary:['Staff salary', 'salary'], petty:['Petty cash', 'petty'], other:['Other', 'expenses']};
const pettyTopups = (led, mk) => led.filter(x => x.kind === 'petty' && !x.opening && svcMonth(x) === mk);
function expensesOf(led, fees, mk, opt = {}){
  const inM = x => svcMonth(x) === mk;
  const rows = led.filter(x => x.kind === 'expense' && inM(x)).map(x => Object.assign({src:'ledger'}, x))
    .concat(fees.filter(x => (x.date || '').slice(0, 7) === mk).map(t => ({src:'fee', id:t.id, date:t.date, category:'Consultant fees', amount:+t.consultantFee, doctorId:t.doctorId, patientName:t.patientName, note:t.typeName, by:t.by})));
  if (opt.petty) rows.push(...pettyTopups(led, mk).map(x => Object.assign({src:'ledger', category:'Petty cash top-up', paid:true, mode:x.mode || 'cash'}, x, {from:x.source})));
  rows.forEach(x => x.source = expSource(x));
  return rows;
}
function monthNumbers(mk){
  const d = cl.acc.d, inM = x => (x.date || '').slice(0, 7) === mk;
  const income = paidSum(d.pay.filter(inM)) + paidSum(d.led.filter(x => x.kind === 'income' && inM(x))), exp = expensesOf(d.led, d.fees, mk), expense = paidSum(exp);
  const petty = paidSum(pettyTopups(d.led, mk));                                    // petty cash counts when the box is topped up
  return {income, expense, petty, net:income - expense - petty, exp};
}
function clAccounts(){
  const a = cl.acc, tabs = accTabs();
  if (!tabs.some(t => t[0] === a.tab)) a.tab = tabs[0][0];
  clAccLoad();
  const d = a.d, monthly = !['tally', 'import'].includes(a.tab);
  const head = `<div class="clhead"><h2>Accounts</h2>${monthly ? `<div class="mnav"><button data-am2="-1">‹</button><b>${esc(monthLabel(a.month))}</b><button data-am2="1"${a.month >= todayKey.slice(0, 7) ? ' disabled' : ''}>›</button></div>` : ''}</div>
    <div class="htabs" data-ord="acc" data-ordattr="at" title="Drag a tab to put it where you like">${ordered('acc', tabs).map(([k, l]) => `<a draggable="true" data-at="${k}" href="#/clinic/accounts/${k}" class="${a.tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
  if (!d) return head + '<div class="empty">Loading…</div>';
  if (d.err) return head + `<div class="auth-err">${esc(d.err)}</div>`;
  let banner = '';
  { const pm = mShift(todayKey.slice(0, 7), -1), cm = (ameta().closed || {})[pm];
    if (canW('accounts') && !cm) banner += `<div class="nag${+todayKey.slice(8) > 5 ? ' late' : ''}">${+todayKey.slice(8) > 5 ? '⚠ ' : ''}${esc(monthLabel(pm))} accounts aren't closed yet (due by the 5th). Check its expenses, bills and tallies, then <button class="primary" data-closem="${pm}" style="padding:3px 10px;margin-left:6px">Close ${esc(parseDay(pm + '-01').toLocaleDateString([], {month:'long'}))} accounts</button></div>`;
    else if (cm && a.month === pm) banner += `<div class="nag" style="border-color:var(--done)">✓ ${esc(monthLabel(pm))} accounts closed by ${esc(cm.name || '')} on ${esc(fmtShort(dayKey(cm.at)))}</div>`; }
  if (can('accounts') && d.led && monthly){
    const cs = commitStatus(a.month, d.led), late = cs.filter(x => x.late), due = cs.filter(x => !x.done && !x.late);
    banner += late.length ? `<div class="nag late">⚠ Overdue for ${esc(monthLabel(a.month))}: ${late.map(x => esc(x.c.name)).join(', ')}: these were due by ${esc(fmtLong(dueFor(a.month)))}.</div>`
      : due.length ? `<div class="nag">${esc(monthLabel(a.month))} commitments due by ${esc(fmtLong(dueFor(a.month)))}: ${due.map(x => esc(x.c.name)).join(', ')}</div>` : '';
  }
  return head + banner + ({overview:accOverview, tally:accTally, expenses:accExpenses, petty:accPetty, lab:() => accVendorTab('Lab'), materials:() => accVendorTab('Materials'), consultants:accConsultants, salary:accSalary, setup:accSetup, import:accImport})[a.tab](d);
}
const kpi = (l, v, s, c = '') => `<div class="kpi"><div class="kl">${l}</div><div class="kv ${c}">${v}</div><div class="ks">${s}</div></div>`;
function accOverview(d){
  const a = cl.acc, N = monthNumbers(a.month), w = canW('accounts'), cs = commitStatus(a.month, d.led);
  const months = [...Array(6)].map((_, i) => mShift(a.month, i - 5)), series = months.map(m => Object.assign({m}, monthNumbers(m)));
  const max = Math.max(1, ...series.map(s => Math.max(s.income, s.expense + s.petty)));
  const W = 900, H = 190, bw = 34, gap = W / 6;
  const bars = series.map((s, i) => { const x = i * gap + gap / 2, hi = s.income / max * 140, he = (s.expense + s.petty) / max * 140, any = s.income || s.expense || s.petty;
    return `<rect x="${x - bw - 2}" y="${160 - hi}" width="${bw}" height="${hi}" rx="4" fill="var(--done)"><title>Income ${inr(s.income)}</title></rect>
      <rect x="${x + 2}" y="${160 - he}" width="${bw}" height="${he}" rx="4" fill="var(--high)"><title>Expenses ${inr(s.expense + s.petty)}</title></rect>
      <text x="${x}" y="178" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(parseDay(s.m + '-01').toLocaleDateString([], {month:'short'}))}</text>
      ${any ? `<text x="${x}" y="${Math.min(160 - hi, 160 - he) - 5}" text-anchor="middle" font-size="10.5" font-weight="650" fill="${s.net >= 0 ? 'var(--done)' : 'var(--high)'}">${s.net >= 0 ? '+' : '−'}${esc(inr(Math.abs(s.net)).slice(1))}</text>` : ''}`; }).join('');
  const byCat = {}; N.exp.forEach(x => byCat[x.category || 'Other'] = (byCat[x.category || 'Other'] || 0) + (+x.amount || 0));
  if (N.petty) byCat['Petty cash top-ups'] = N.petty;
  const cats = Object.entries(byCat).sort((x, y) => y[1] - x[1]), ct = cats.reduce((s, x) => s + x[1], 0);
  return `<div class="kpis">
      ${kpi('Income', inr(N.income), 'patient payments + other income')}
      ${kpi('Clinic expenses', inr(N.expense), `${N.exp.length} ${N.exp.length === 1 ? 'entry' : 'entries'}`, N.expense ? 'neg' : '')}
      ${kpi('Petty cash top-ups', inr(N.petty), `box balance ${inr(d.pettyBal)}`)}
      ${kpi('Net', (N.net < 0 ? '− ' : '') + inr(Math.abs(N.net)), N.net < 0 ? 'loss this month' : N.income ? `${Math.round(N.net / N.income * 100)}% margin` : 'no income yet', N.net < 0 ? 'neg' : 'pos')}</div>
    <div class="acards">
      <div class="box wide"><h3>Clinic performance <span class="sub">last 6 months · <i class="lg" style="background:var(--done)"></i>income <i class="lg" style="background:var(--high)"></i>expenses</span></h3>
        <svg viewBox="0 0 ${W} ${H}" class="perf" role="img" aria-label="Income and expenses for the last 6 months"><line x1="0" y1="160" x2="${W}" y2="160" stroke="var(--line)"/>${bars}</svg></div>
      <div class="box"><h3>Monthly commitments <span class="sub">due by ${esc(fmtLong(dueFor(a.month)))}</span></h3>
        ${cs.map(x => `<div class="crow"><span class="cdot ${x.done ? 'ok' : x.late ? 'late' : ''}"></span><b>${esc(x.c.name)}</b><span class="stat">${x.done ? 'Entered ' + inr(x.amt) : x.c.amount ? 'Expected ' + inr(x.c.amount) : ''}</span><span class="sp"></span>
          ${x.done ? '<span class="upill on">Done</span>' : w ? `<button class="${x.late ? 'primary' : ''}" data-commit="${esc(x.c.id)}">Enter now</button>` : `<span class="upill ${x.late ? 'gone' : 'pend'}">${x.late ? 'Overdue' : 'Due'}</span>`}</div>`).join('') || '<div class="stat">No commitments set.</div>'}</div>
      <div class="box"><h3>Where the money went</h3>
        ${cats.map(([c, v]) => `<div class="catrow"><span>${esc(c)}</span><div class="rbar wide"><i style="width:${ct ? v / ct * 100 : 0}%"></i></div><b>${inr(v)}</b></div>`).join('') || '<div class="stat">No expenses this month.</div>'}</div>
    </div>`;
}
