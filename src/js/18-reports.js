/* ---------- Reports ---------- */
const REPORTS = [['collection', 'Collection', 'reports'], ['treatments', 'Treatment-wise earnings', 'reports'], ['doctors', 'Doctors & consultants', 'doctorReports'], ['outstanding', 'Outstanding balances', 'reports'], ['appointments', 'Appointments', 'reports'], ['newpatients', 'New patients', 'reports']];
function clReports(){
  const r = cl.rep, avail = REPORTS.filter(x => can(x[2]));
  if (!avail.some(x => x[0] === r.kind)) r.kind = avail[0][0];
  if (!r.from){ r.preset = 'today'; r.from = r.to = todayKey; }
  return `<div class="clhead"><h2>Reports</h2></div><div class="htabs" data-ord="rep" data-ordattr="rk">${ordered('rep', avail).map(([k, l]) => `<a draggable="true" data-rk="${k}" href="#/clinic/reports/${k}" class="${k === r.kind ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div>${rangeBar(r, 'rep')}</div><div id="repOut"><div class="empty">Loading…</div></div>`;
}
async function clRunReport(){
  const {F} = cloud, r = cl.rep, key = [orgCtx().orgId, r.kind, r.from, r.to, r.doc || ''].join('|');
  const out = () => { const el = $('#repOut'); if (el){ el.innerHTML = clReportHtml(); numberTables(el); } };
  if (r.key === key && r.data) return out();
  r.key = key; r.data = null;
  const rq = c => F.query(cCol(c), F.where('date', '>=', r.from), F.where('date', '<=', r.to));
  try {
    let d = {};
    if (r.kind === 'collection') d.pay = docsOf(await F.getDocs(rq('payments')));
    if (r.kind === 'treatments') d.t = docsOf(await F.getDocs(rq('treatments')));
    if (r.kind === 'doctors'){ d.t = docsOf(await F.getDocs(rq('treatments'))); d.a = docsOf(await F.getDocs(rq('appointments'))); }
    if (r.kind === 'appointments') d.a = docsOf(await F.getDocs(rq('appointments')));
    if (r.kind === 'newpatients') d.p = docsOf(await F.getDocs(F.query(cCol('patients'), F.where('createdDay', '>=', r.from), F.where('createdDay', '<=', r.to))));
    if (r.kind === 'outstanding'){ const [t, p, pt] = await Promise.all([F.getDocs(cCol('treatments')), F.getDocs(cCol('payments')), F.getDocs(cCol('patients'))]); d.t = docsOf(t); d.pay = docsOf(p); d.pt = docsOf(pt); }
    if (r.key !== key) return;
    r.data = d; out();
  } catch(e){ r.key = ''; const el = $('#repOut'); if (el) el.innerHTML = `<div class="auth-err">${esc(errText(e))}</div>`; }
}
const days = (a, b) => { const o = []; for (let k = a; k <= b && o.length < 400; k = shiftDay(k, 1)) o.push(k); return o; };
function tbl(head, rows, foot, cls = ''){
  return `<div class="awrap" style="margin-top:0"><table class="atbl ${cls}"><thead><tr>${head.map(h => `<th${/^#|₹/.test(h) ? ' class="num"' : ''}>${esc(h.replace(/^#/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.attr || ''}>${r.c.map((c, i) => `<td${/^#|₹/.test(head[i]) ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" class="stat">Nothing in this period.</td></tr>`}${foot ? `<tr class="tot">${foot.map((c, i) => `<td${/^#|₹/.test(head[i]) ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>` : ''}</tbody></table></div>`;
}
let repCsv = null;
function clReportHtml(){
  const r = cl.rep, d = r.data; if (!d) return '<div class="empty">Loading…</div>';
  const per = r.kind === 'outstanding' ? 'as of ' + fmtLong(r.to) : r.from === r.to ? fmtLong(r.from) : `${fmtShort(r.from)} – ${fmtShort(r.to)}`;
  const bar = t => `<div class="vbar" style="padding:0 0 8px"><strong>${esc(t)}</strong><span class="stat">${esc(per)}</span><span class="sp"></span>${rpViewToggle(r.view)}<button data-repcsv>⬇ CSV</button><button data-repprint>🖨 Print</button></div>`;
  const k = (l, v, s) => `<div class="kpi"><div class="kl">${l}</div><div class="kv">${v}</div><div class="ks">${s}</div></div>`;
  let html = '';
  const G = r.group || 'day', chart = r.view === 'chart', drill = (k, label) => ` class="clk" data-drill="${esc(k)}" title="Open ${esc(label)} day by day"`;
  if (r.kind === 'collection'){
    const P = d.pay.filter(x => (!r.mode || x.mode === r.mode) && (!r.dfil || x.doctorId === r.dfil)).sort((x, y) => String(y.date).localeCompare(String(x.date)) || String(y.receiptNo || '').localeCompare(String(x.receiptNo || ''))), tot = paidSum(P), by = (xs, m) => paidSum(xs.filter(x => x.mode === m));
    const mode = x => (PMODES.find(m => m[0] === x.mode) || [0, x.mode])[1];
    const used = PMODES.filter(([m]) => ['cash', 'upi'].includes(m) || by(P, m) > 0), names = Object.fromEntries(PMODES);
    const kp = `<div class="kpis">${k('Total collected', inr(tot), plural(P.length, 'payment'))}${used.map(([m, l]) => k(l, inr(by(P, m)), tot ? Math.round(by(P, m) / tot * 100) + '%' : '—')).join('')}</div>`;
    const title = `Collection report${r.mode ? ' · ' + names[r.mode] : ''}${r.dfil ? ' · ' + dName(r.dfil) : ''}`;
    const pers = periodsIn(G, r.from, r.to).reverse();
    if (chart){
      const cols = pers.slice().reverse().map(pk => { const xs = P.filter(x => perOf(G, x.date) === pk); return {label:perLabel(G, pk), short:G === 'day' ? fmtDM(pk) : G === 'month' ? parseDay(pk + '-01').toLocaleDateString([], {month:'short', year:'2-digit'}) : pk, parts:Object.fromEntries(used.map(([m]) => [m, by(xs, m)]))}; });
      repCsv = [['Period', ...used.map(u => u[1]), 'Total']].concat(cols.map(c => [c.label, ...used.map(([m]) => c.parts[m]), used.reduce((a, [m]) => a + c.parts[m], 0)]));
      html = bar(title) + kp + stackChart(cols, used.map(u => u[0]), names, true);
    } else if (G === 'day'){
      const rows = []; let day = null;
      P.forEach(x => { if (x.date !== day){ day = x.date; const xs = P.filter(y => y.date === day); rows.push({attr:' class="wk"', c:[`<b>${esc(fmtShort(day))}</b>`, '', `${plural(xs.length, 'payment')}`, '', '', `<b>${inr(paidSum(xs))}</b>`]}); }
        rows.push({attr:` class="clk" data-openp="${esc(x.patientId)}"`, c:['', esc(x.receiptNo || ''), `<b>${esc(x.patientName || '—')}</b>`, esc(x.doctorId ? dName(x.doctorId) : '—'), esc(mode(x)), inr(x.amount)]}); });
      repCsv = [['Date', 'Receipt', 'Patient', 'Doctor', 'Mode', 'Amount', 'Note']].concat(P.map(x => [x.date, x.receiptNo, x.patientName, x.doctorId ? dName(x.doctorId) : '', mode(x), x.amount, x.note]));
      html = bar(title) + kp + tbl(['Date', 'Receipt', 'Patient', 'Doctor', 'Mode', '₹Amount'], rows, ['Total', '', '', '', '', inr(tot)]);
    } else {
      const rows = pers.map(pk => { const xs = P.filter(x => perOf(G, x.date) === pk); return {xs, pk}; }).filter(x => x.xs.length);
      repCsv = [[G === 'month' ? 'Month' : 'Year', 'Payments', ...used.map(u => u[1]), 'Total']].concat(rows.map(({xs, pk}) => [perLabel(G, pk), xs.length, ...used.map(([m]) => by(xs, m)), paidSum(xs)]));
      html = bar(title) + kp + tbl([G === 'month' ? 'Month' : 'Year', '#Payments', ...used.map(u => '₹' + u[1]), '₹Total'], rows.map(({xs, pk}) => ({attr:drill(pk, perLabel(G, pk)), c:[`<b>${esc(perLabel(G, pk))}</b>`, xs.length, ...used.map(([m]) => inr(by(xs, m))), `<b>${inr(paidSum(xs))}</b>`]})), ['Total', P.length, ...used.map(([m]) => inr(by(P, m))), inr(tot)]);
    }
  }
  if (r.kind === 'treatments'){
    const T = d.t.filter(t => t.status === 'completed' && (!r.dfil || t.doctorId === r.dfil)), groups = {};
    T.forEach(t => { const g = groups[isMed(t) ? 'Medicines (tablets)' : t.typeName] = groups[isMed(t) ? 'Medicines (tablets)' : t.typeName] = groups[t.typeName] || {n:0, gross:0, disc:0, net:0, pts:new Set()}; g.n++; g.gross += +t.cost || 0; g.disc += +t.discount || 0; g.net += net(t); g.pts.add(t.patientId); });
    const tot = Object.values(groups).reduce((a, g) => a + g.net, 0);
    const rows = Object.entries(groups).sort((a, b) => b[1].net - a[1].net).map(([n, g]) => ({c:[`<b>${esc(n)}</b>`, g.n, g.pts.size, inr(g.gross), inr(g.disc), `<b>${inr(g.net)}</b>`, `<div class="rbar"><i style="width:${tot ? g.net / tot * 100 : 0}%"></i></div>${tot ? Math.round(g.net / tot * 100) : 0}%`], raw:[n, g.n, g.pts.size, g.gross, g.disc, g.net]}));
    repCsv = [['Treatment', 'Done', 'Patients', 'Gross', 'Discount', 'Net']].concat(rows.map(x => x.raw));
    html = bar('Treatment-wise earnings') + `<div class="kpis">${k('Earned', inr(tot), 'completed treatments')}${k('Treatments done', T.length, plural(new Set(T.map(t => t.patientId)).size, 'patient'))}${k('Planned / in progress', d.t.length - T.length, 'not counted yet')}</div>`
      + (chart ? `<h3 style="font-size:13px;margin:6px 0">Earnings by treatment</h3>` + hbarChart(Object.entries(groups).sort((a, b) => b[1].net - a[1].net).map(([n, g]) => ({label:n, v:g.net})), true)
          + `<h3 style="font-size:13px;margin:16px 0 6px">Earnings by ${G === 'month' ? 'month' : G === 'year' ? 'year' : 'day'}</h3>` + stackChart(periodsIn(G, r.from, r.to).map(pk => ({label:perLabel(G, pk), short:G === 'day' ? fmtDM(pk) : G === 'month' ? parseDay(pk + '-01').toLocaleDateString([], {month:'short', year:'2-digit'}) : pk, parts:{net:T.filter(t => perOf(G, t.date) === pk).reduce((a, t) => a + net(t), 0)}})), ['net'], {net:'Net earned'}, true)
        : (G !== 'day' ? tbl([G === 'month' ? 'Month' : 'Year', '#Treatments', '₹Net earned'], periodsIn(G, r.from, r.to).reverse().map(pk => { const xs = T.filter(t => perOf(G, t.date) === pk); return {attr:drill(pk, perLabel(G, pk)), c:[`<b>${esc(perLabel(G, pk))}</b>`, xs.length, `<b>${inr(xs.reduce((a, t) => a + net(t), 0))}</b>`], n:xs.length}; }).filter(x => x.n), ['Total', T.length, inr(tot)]) + '<div style="height:12px"></div>' : '')
          + tbl(['Treatment', '#Done', '#Patients', '₹Gross', '₹Discount', '₹Net earned', 'Share'], rows, ['Total', T.length, '', '', '', inr(tot), '']))
      + (chart ? '' : `<h3 style="font-size:13px;margin:16px 0 6px">Every treatment, with the patient</h3>` + tbl(['Date', 'Patient', 'Treatment', 'Doctor', '₹Net'], T.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(t => ({attr:` class="clk" data-openp="${esc(t.patientId)}"`, c:[esc(fmtShort(t.date)), `<b>${esc(t.patientName)}</b>`, esc(t.typeName + (t.tooth ? ' (' + t.tooth + ')' : '')), esc(dName(t.doctorId) || t.doctorName || ''), inr(net(t))]}))));
    repCsv = [['Date', 'Patient', 'Treatment', 'Tooth', 'Doctor', 'Gross', 'Discount', 'Net']].concat(T.map(t => [t.date, t.patientName, t.typeName, t.tooth || '', dName(t.doctorId) || t.doctorName || '', +t.cost || 0, +t.discount || 0, net(t)]));
  }
  const short = pk => G === 'day' ? fmtDM(pk) : G === 'month' ? parseDay(pk + '-01').toLocaleDateString([], {month:'short', year:'2-digit'}) : pk;
  const perTable = (title, keys, names, valOf, money) => { const ps = periodsIn(G, r.from, r.to).reverse(), cells = ps.map(pk => ({pk, v:keys.map(kk => valOf(pk, kk))})).filter(x => x.v.some(Boolean));
    return `<h3 style="font-size:13px;margin:4px 0 6px">${esc(title)}</h3>` + tbl([G === 'month' ? 'Month' : G === 'year' ? 'Year' : 'Date', ...keys.map(kk => (money ? '₹' : '#') + names[kk]), (money ? '₹' : '#') + 'Total'],
      cells.map(x => ({attr:G === 'day' ? '' : drill(x.pk, perLabel(G, x.pk)), c:[`<b>${esc(perLabel(G, x.pk))}</b>`, ...x.v.map(v => money ? inr(v) : v), `<b>${money ? inr(x.v.reduce((a, b) => a + b, 0)) : x.v.reduce((a, b) => a + b, 0)}</b>`]})),
      ['Total', ...keys.map((kk, ii) => { const t2 = cells.reduce((a, x) => a + x.v[ii], 0); return money ? inr(t2) : t2; }), money ? inr(cells.reduce((a, x) => a + x.v.reduce((p, q) => p + q, 0), 0)) : cells.reduce((a, x) => a + x.v.reduce((p, q) => p + q, 0), 0)]) + '<div style="height:12px"></div>'; };
  if (r.kind === 'doctors'){
    const fee = t => +t.consultantFee || 0, docSel = r.doc || r.dfil;
    if (docSel){
      const doc = cl.doctors.find(x => x.id === docSel) || {name:'—'}, T = d.t.filter(t => t.doctorId === docSel && t.status === 'completed').sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const tot = T.reduce((a, t) => a + net(t), 0), fees = T.reduce((a, t) => a + fee(t), 0), cons = doc.type === 'consultant';
      repCsv = [['Date', 'Patient', 'Treatment', 'Tooth', 'Net'].concat(cons ? ['Consultant fee'] : [])].concat(T.map(t => [t.date, t.patientName, t.typeName, t.tooth || '', net(t)].concat(cons ? [fee(t)] : []))).concat([['', '', '', 'Total', tot].concat(cons ? [fees] : [])]);
      const kp = `<div class="kpis">${k('Treatments', T.length, plural(new Set(T.map(t => t.patientId)).size, 'patient'))}${k('Treatment value', inr(tot), 'completed, after discount')}${cons ? k('Consultant fees', inr(fees), 'from the fee on each treatment') : ''}</div>`;
      const head = (r.doc ? `<button class="abk" data-repdoc="">← All doctors</button>` : '') + bar(`${doc.name} · ${cons ? 'Consultant statement' : 'Doctor statement'}`) + kp;
      if (chart) return head + stackChart(periodsIn(G, r.from, r.to).map(pk => ({label:perLabel(G, pk), short:short(pk), parts:{v:T.filter(t => perOf(G, t.date) === pk).reduce((a, t) => a + net(t), 0)}})), ['v'], {v:'Treatment value'}, true);
      return head + (G !== 'day' ? perTable('By ' + (G === 'month' ? 'month' : 'year'), ['v'], {v:'Treatment value'}, (pk) => T.filter(t => perOf(G, t.date) === pk).reduce((a, t) => a + net(t), 0), true) : '')
        + tbl(['Date', 'Patient', 'Treatment', 'Tooth / area', '₹Net'].concat(cons ? ['₹Consultant fee'] : []), T.map(t => ({attr:` class="clk" data-openp="${esc(t.patientId)}"`, c:[esc(fmtShort(t.date)), esc(t.patientName), esc(t.typeName), esc(t.tooth || ''), inr(net(t))].concat(cons ? [inr(fee(t))] : [])})), ['Total', '', '', '', inr(tot)].concat(cons ? [inr(fees)] : []));
    }
    const ids = [...new Set(cl.doctors.map(x => x.id).concat(d.t.map(t => t.doctorId), d.a.map(a => a.doctorId)).filter(Boolean))];
    const names = Object.fromEntries(ids.map(id => [id, (cl.doctors.find(x => x.id === id) || {name:'Unknown'}).name]));
    const rows = ids.map(id => { const doc = cl.doctors.find(x => x.id === id) || {name:'Unknown'}, T = d.t.filter(t => t.doctorId === id && t.status === 'completed'), A = d.a.filter(a => a.doctorId === id);
      const tot = T.reduce((a, t) => a + net(t), 0), fees = T.reduce((a, t) => a + fee(t), 0);
      return {attr:` class="clk" data-repdoc="${esc(id)}"`, c:[`<b>${esc(doc.name)}</b><span class="sub2">${DTYPE[doc.type] || 'Clinic doctor'}${doc.specialty ? ' · ' + esc(doc.specialty) : ''}</span>`, A.filter(a => a.status === 'completed').length, new Set(T.map(t => t.patientId)).size, T.length, inr(tot), doc.type === 'consultant' ? inr(fees) : '—'],
        raw:[doc.name, doc.type || 'primary', A.filter(a => a.status === 'completed').length, new Set(T.map(t => t.patientId)).size, T.length, tot, fees], tot, id}; }).sort((a, b) => b.tot - a.tot);
    repCsv = [['Doctor', 'Type', 'Visits completed', 'Patients', 'Treatments', 'Treatment value', 'Consultant fees']].concat(rows.map(x => x.raw));
    const val = (pk, id) => d.t.filter(t => t.doctorId === id && t.status === 'completed' && perOf(G, t.date) === pk).reduce((a, t) => a + net(t), 0), used = rows.filter(x => x.tot > 0).map(x => x.id);
    if (chart) return bar('Doctors & consultants') + `<h3 style="font-size:13px;margin:4px 0 6px">Treatment value by doctor</h3>` + hbarChart(rows.map(x => ({label:x.raw[0], v:x.tot})), true)
      + `<h3 style="font-size:13px;margin:16px 0 6px">By ${G === 'month' ? 'month' : G === 'year' ? 'year' : 'day'}</h3>` + stackChart(periodsIn(G, r.from, r.to).map(pk => ({label:perLabel(G, pk), short:short(pk), parts:Object.fromEntries(used.map(id => [id, val(pk, id)]))})), used, names, true);
    html = bar('Doctors & consultants') + '<p class="stat">Each treatment is credited to the doctor recorded on it. Click a doctor for their statement.</p>'
      + (G !== 'day' && used.length ? perTable('Treatment value by ' + (G === 'month' ? 'month' : 'year'), used, names, val, true) : '')
      + tbl(['Doctor', '#Visits done', '#Patients', '#Treatments', '₹Treatment value', '₹Consultant fees'], rows, null, 'otbl');
  }
  if (r.kind === 'outstanding'){
    const pts = d.pt.filter(p => !r.dfil || p.primaryDoctorId === r.dfil), upto = day => {
      const T = d.t.filter(t => t.date <= day && t.status !== 'planned'), P = d.pay.filter(x => x.date <= day), bt = {}, pd = {};
      T.forEach(t => bt[t.patientId] = (bt[t.patientId] || 0) + net(t)); P.forEach(x => pd[x.patientId] = (pd[x.patientId] || 0) + (+x.amount || 0));
      return pts.map(p => ({p, b:bt[p.id] || 0, pd:pd[p.id] || 0, bal:(bt[p.id] || 0) - (pd[p.id] || 0)})).filter(x => x.bal > 0.5).sort((a, b) => b.bal - a.bal); };
    const rows = upto(r.to), tot = rows.reduce((a, x) => a + x.bal, 0);
    const ends = periodsIn(G, r.from, r.to).map(pk => { const e = G === 'day' ? pk : G === 'month' ? mEnd(pk) : pk + '-12-31'; return {pk, e:e > r.to ? r.to : e}; });
    const series = ends.length <= 120 ? ends.map(x => { const rs = upto(x.e); return {pk:x.pk, tot:rs.reduce((a, y) => a + y.bal, 0), n:rs.length}; }) : [];
    repCsv = [['Patient', 'ID', 'Phone', 'Treatment cost', 'Paid', 'Balance']].concat(rows.map(x => [pName(x.p), x.p.code, x.p.phone, x.b, x.pd, x.bal]));
    const kp = `<div class="kpis">${k('Total outstanding', inr(tot), plural(rows.length, 'patient') + ' · as of ' + fmtShort(r.to))}</div>`;
    if (chart) return bar('Outstanding balances') + kp + `<h3 style="font-size:13px;margin:4px 0 6px">Outstanding at the end of each ${G === 'month' ? 'month' : G === 'year' ? 'year' : 'day'}</h3>`
      + stackChart(series.map(x => ({label:perLabel(G, x.pk), short:short(x.pk), parts:{v:x.tot}})), ['v'], {v:'Outstanding'}, true)
      + `<h3 style="font-size:13px;margin:16px 0 6px">Biggest balances</h3>` + hbarChart(rows.map(x => ({label:pName(x.p) + ' · ' + (x.p.code || ''), v:x.bal})), true);
    html = bar('Outstanding balances') + kp
      + (G !== 'day' && series.length ? `<h3 style="font-size:13px;margin:4px 0 6px">Outstanding at the end of each ${G === 'month' ? 'month' : 'year'}</h3>` + tbl([G === 'month' ? 'Month' : 'Year', '#Patients owing', '₹Outstanding'], series.slice().reverse().map(x => ({c:[`<b>${esc(perLabel(G, x.pk))}</b>`, x.n, `<b>${inr(x.tot)}</b>`]}))) + '<div style="height:12px"></div>' : '')
      + tbl(['Patient', 'Phone', '₹Treatment cost', '₹Paid', '₹Balance'], rows.map(x => ({attr:` class="clk" data-openp="${esc(x.p.id)}"`, c:[`<b>${esc(pName(x.p))}</b><span class="sub2">${esc(x.p.code || '')}</span>`, esc(x.p.phone || ''), inr(x.b), inr(x.pd), `<b class="neg">${inr(x.bal)}</b>`]})), ['Total', '', '', '', inr(tot)], 'otbl');
  }
  if (r.kind === 'appointments'){
    const A = d.a.filter(a => !r.dfil || a.doctorId === r.dfil), st = Object.keys(ASTATUS);
    const rows = periodsIn(G, r.from, r.to).map(pk => { const xs = A.filter(a => perOf(G, a.date) === pk); return {attr:G === 'day' ? '' : drill(pk, perLabel(G, pk)), c:[esc(perLabel(G, pk)), xs.length, ...st.map(s => xs.filter(a => a.status === s).length)], raw:[pk, xs.length, ...st.map(s => xs.filter(a => a.status === s).length)]}; }).filter(x => x.raw[1]).reverse();
    if (chart){ const cols = rows.slice().reverse().map(x => ({label:perLabel(G, x.raw[0]), short:G === 'day' ? fmtDM(x.raw[0]) : x.raw[0], parts:Object.fromEntries(st.map((s, i) => [s, x.raw[2 + i]]))}));
      repCsv = [['Period', 'Total', ...st.map(s => ASTATUS[s])]].concat(rows.map(x => x.raw));
      return bar('Appointments') + stackChart(cols, st, ASTATUS, false); }
    repCsv = [['Date', 'Total', ...st.map(s => ASTATUS[s])]].concat(rows.map(x => x.raw));
    html = bar('Appointments') + `<div class="kpis">${k('Booked', A.length, 'in this period')}${k('Completed', A.filter(a => a.status === 'completed').length, '')}${k('Missed', A.filter(a => a.status === 'missed').length, A.length ? Math.round(A.filter(a => a.status === 'missed').length / A.length * 100) + '% no-show' : '')}</div>`
      + tbl([G === 'month' ? 'Month' : G === 'year' ? 'Year' : 'Date', '#Total', ...st.map(s => '#' + ASTATUS[s])], rows, ['Total', A.length, ...st.map(s => A.filter(a => a.status === s).length)]);
  }
  if (r.kind === 'newpatients'){
    const P = d.p.filter(p => !r.dfil || p.primaryDoctorId === r.dfil).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    repCsv = [['Registered', 'Patient', 'ID', 'Phone', 'Referred by']].concat(P.map(p => [p.createdDay, pName(p), p.code, p.phone, p.referredBy || '']));
    const refs = {}; P.forEach(p => { const k2 = p.referredBy || 'Not recorded'; refs[k2] = (refs[k2] || 0) + 1; });
    const kp = `<div class="kpis">${k('New patients', P.length, 'registered')}${Object.entries(refs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => k('Referred by', esc(n), plural(c, 'patient'))).join('')}</div>`;
    const cnt = pk => P.filter(p => perOf(G, p.createdDay || '') === pk).length;
    if (chart) return bar('New patients') + kp + stackChart(periodsIn(G, r.from, r.to).map(pk => ({label:perLabel(G, pk), short:short(pk), parts:{v:cnt(pk)}})), ['v'], {v:'New patients'}, false);
    html = bar('New patients') + kp + (G !== 'day' ? perTable('By ' + (G === 'month' ? 'month' : 'year'), ['v'], {v:'New patients'}, pk => cnt(pk), false) : '')
      + tbl(['Registered', 'Patient', 'Phone', 'Referred by'], P.map(p => ({attr:` class="clk" data-openp="${esc(p.id)}"`, c:[esc(fmtShort(p.createdDay)), `<b>${esc(pName(p))}</b><span class="sub2">${esc(p.code || '')}</span>`, esc(p.phone || ''), esc(p.referredBy || '—')]})), null, 'otbl');
  }
  return html;
}

