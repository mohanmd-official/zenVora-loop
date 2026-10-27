/* ---------- serial numbers in every table ---------- */
function numberTables(root){
  (root || document).querySelectorAll('table.atbl:not([data-num])').forEach(t => {
    t.dataset.num = '1';
    const hr = t.querySelector('thead tr'); if (hr){ const th = document.createElement('th'); th.className = 'rn'; th.textContent = 'No.'; hr.prepend(th); }
    let n = 0;
    t.querySelectorAll('tbody tr').forEach(r => {
      if (r.cells.length === 1){ r.cells[0].colSpan = (r.cells[0].colSpan || 1) + 1; return; }
      const td = document.createElement('td'); td.className = 'rn';
      if (!r.classList.contains('wk') && !r.classList.contains('tot')) td.textContent = ++n;
      r.prepend(td);
    });
  });
}

/* ---------- Attendance lives inside the Clinic when the org has the Clinic ---------- */
function parkAtt(){ const v = $('#v-attendance'); if ($('#attBar') && $('#attBar').parentElement !== v){ v.prepend($('#attBar')); v.append($('#attBody')); } }

/* ================= attendance: check-in / check-out, team summary, pay ================= */
const OFFS_PER_MONTH = 4;
const att = {mode:null, month:todayKey.slice(0, 7), ev:{}, accts:[], detail:null, unsub:null, key:'', tick:null};
const tsMs = v => v == null ? null : typeof v === 'number' ? v : v.toMillis ? v.toMillis() : v.seconds != null ? v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6) : +new Date(v);
const hm = ms => { const m = Math.round((ms || 0) / 60000); return `${Math.floor(m / 60)}h ${pad2(m % 60)}m`; };
const hms = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`; };
const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const monthBounds = mk => { const [y, m] = mk.split('-').map(Number); return {s:dayKey(new Date(y, m - 1, 1)), e:dayKey(new Date(y, m, 0)), days:new Date(y, m, 0).getDate()}; };
const attCfg = a => Object.assign({shiftStart:'09:00', shiftEnd:'18:00', brk:0, salary:0, otMult:1}, (a && a.att) || {});
const shiftTxt = c => c.brkS && c.brkE ? `${hm12(c.shiftStart)} – ${hm12(c.brkS)}, ${hm12(c.brkE)} – ${hm12(c.shiftEnd)}` : `${hm12(c.shiftStart)} – ${hm12(c.shiftEnd)}`;
/* work timing fields (People → Add / Edit, Attendance → shift settings): start, end, unpaid break (e.g. 9:30–7:00 with a 60 min lunch) */
const wtFields = (pre, c) => `<label>Work starts<input type="time" id="${pre}S" value="${esc(c.shiftStart)}"></label><label>Work ends<input type="time" id="${pre}E" value="${esc(c.shiftEnd)}"></label>
  <label>Break from<input type="time" id="${pre}BS" value="${esc(c.brkS || '')}" title="Optional: lunch / break start, e.g. 3:00 PM"></label><label>Break to<input type="time" id="${pre}BE" value="${esc(c.brkE || '')}" title="Back from the break, e.g. 4:00 PM"></label>`;
function wtRead(pre, prev){
  const g = k => ($('#' + pre + k) || {}).value || '', S = g('S') || '09:00', E = g('E') || '18:00', BS = g('BS'), BE = g('BE');
  if (toMin(E) <= toMin(S)) throw custom('Work end time must be after the start time.');
  if (!!BS !== !!BE) throw custom('Enter both the break start and the break end, or leave both empty.');
  if (BS && !(toMin(S) < toMin(BS) && toMin(BS) < toMin(BE) && toMin(BE) < toMin(E))) throw custom('The break must be inside the working hours, and end after it starts.');
  return Object.assign({}, attCfg({att:prev || {}}), {shiftStart:S, shiftEnd:E, brkS:BS, brkE:BE, brk:BS ? toMin(BE) - toMin(BS) : 0});
}
const toMin = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + m; };
const shiftMs = c => Math.max(1, toMin(c.shiftEnd) - toMin(c.shiftStart) - (+c.brk || 0)) * 60000;
const canManageAtt = () => { const oc = orgCtx(); return !!(oc && (oc.support || oc.role === 'orgadmin' || oc.role === 'manager')); };
const attRO = () => !!(orgCtx() && orgCtx().support);          // Zenvora support: look, don't touch
const isProxyMe = () => { const oc = orgCtx(); return !!(oc && !oc.support && feat('attendance') && oc.me && oc.me.attProxy); };
const canMarkAtt = () => !attRO() && (isProxyMe() || canManageAtt());
const attSelf = () => { const oc = orgCtx(); return !!(oc && !oc.support && oc.role !== 'orgadmin'); };   // Account Managers don't check in
const payOn = () => feat('payroll');
const attCol = uid => cloud.F.collection(cloud.fs, 'orgs', orgCtx().orgId, 'attendance', uid, 'events');
const titleOf = a => a && a.title && a.title !== ROLE_LABEL[a.role] ? a.title : '';
const firstName = n => { const w = String(n || '').trim().split(/\s+/); return /\.$/.test(w[0] || '') && w[1] ? w[0] + ' ' + w[1] : w[0] || ''; };   // "Dr. Ravi" stays "Dr. Ravi"
const fullName = a => (a && (a.name || (a.email || '').split('@')[0])) || '';

function attReset(){ if (att.unsub){ att.unsub(); att.unsub = null; } clearInterval(att.tick); Object.assign(att, {mode:null, ev:{}, accts:[], detail:null, key:''}); }

// Pair check-ins with check-outs (several sessions per day are fine)
function sessionsOf(events){
  const ev = (events || []).filter(e => e.at != null).sort((a, b) => a.at - b.at), out = [];
  let open = null;
  const MAX = 16 * 3600000;                         // a forgotten check-out never runs into the next working day
  const abandon = () => { out.push({in:open.at, out:null, ids:[open.id], m:open.src === 'manager'}); open = null; };
  for (const e of ev){
    if (open && (e.at - open.at > MAX || (e.type === 'in' && dayKey(e.at) !== dayKey(open.at)))) abandon();
    if (e.type === 'in'){ if (!open) open = e; }
    else if (open){ out.push({in:open.at, out:e.at, ids:[open.id, e.id], m:open.src === 'manager' || e.src === 'manager'}); open = null; }
  }
  if (open) out.push({in:open.at, out:null, ids:[open.id], m:open.src === 'manager'});
  return out;
}
function attSummary(events, mk, acc){
  const c = attCfg(acc), sh = shiftMs(c), B = monthBounds(mk), now = Date.now();
  const evs0 = (events || []).filter(e => e.at != null), firstEv = evs0.length ? dayKey(Math.min(...evs0.map(e => e.at))) : null;
  let join = acc && acc.createdAt ? dayKey(acc.createdAt) : B.s; if (firstEv && firstEv < join) join = firstEv;
  const byDay = {};
  sessionsOf(events).forEach(s => (byDay[dayKey(s.in)] = byDay[dayKey(s.in)] || []).push(s));
  const rows = []; let P = 0, L = 0, H = 0, OT = 0, effMonth = 0, sun = 0;
  for (let k = B.s; k <= B.e; k = shiftDay(k, 1)){
    if (k >= join) effMonth++;
    const ss = byDay[k] || [];
    if (k > todayKey || k < join){ rows.push({k, st:k > todayKey ? 'future' : 'na', ss}); continue; }
    const open = ss.find(s => !s.out);
    const worked = ss.reduce((t, s) => t + (s.out ? s.out - s.in : (k === todayKey ? now - s.in : 0)), 0);
    const ot = Math.max(0, worked - sh);
    let st;
    if (ss.length){ st = open ? (k < todayKey ? 'missed' : 'in') : 'present'; P++; if (parseDay(k).getDay() === 0) sun++; }
    else st = k === todayKey ? 'notyet' : 'leave';
    if (st === 'leave') L++;
    H += worked; OT += ot;
    rows.push({k, st, ss, worked, ot});
  }
  const lop = Math.max(0, L - OFFS_PER_MONTH), otDays = Math.max(0, P - (effMonth - OFFS_PER_MONTH));
  const perDay = (+c.salary || 0) / B.days, perHour = perDay / (sh / 3600000), mult = +c.otMult || 1;
  const base = perDay * effMonth, lopAmt = lop * perDay, otDayPay = otDays * perDay, otHrPay = (OT / 3600000) * perHour * mult;
  const inc = acc && acc._inc != null ? +acc._inc || 0 : acc && att.inc && att.incM === mk && att.inc[acc.uid] != null ? +att.inc[acc.uid] || 0 : 0;
  const pay0 = base - lopAmt + otDayPay + otHrPay;
  return {rows, c, sh, B, P, L, H, OT, lop, otDays, sun, offsUsed:Math.min(L, OFFS_PER_MONTH), perDay, perHour, mult, base, lopAmt, otDayPay, otHrPay, inc,
          salary:base - lopAmt, extra:otDayPay + otHrPay, pay:pay0 + inc, done:B.e < todayKey, effMonth};
}

async function attLoad(){
  if (!cloud || !cloud.uid || !orgCtx()) return;
  const key = orgCtx().orgId + '|' + att.mode + '|' + att.month + '|' + (att.detail || '');
  if (key === att.key) return;
  att.key = key;
  if (att.unsub){ att.unsub(); att.unsub = null; }
  const {F, fs} = cloud, B = monthBounds(att.month);
  const from = F.Timestamp.fromDate(parseDay(shiftDay(B.s, -1))), to = F.Timestamp.fromDate(parseDay(shiftDay(B.e, 2)));
  const q = uid => F.query(attCol(uid), F.where('at', '>=', from), F.where('at', '<', to));
  const map = d => { const x = d.data({serverTimestamps:'estimate'}); return {id:d.id, type:x.type, src:x.src, at:tsMs(x.at)}; };
  const watch = uid => { att.unsub = F.onSnapshot(q(uid), qs => { att.ev[uid] = qs.docs.map(map); if (att.key === key) renderAttendance(); }, e => { if (!attRO()) info('Attendance could not load: ' + (e.code || e.message)); }); };
  try {
    if (att.mode === 'me') return watch(cloud.uid);
    const accs = await F.getDocs(F.collection(fs, 'orgs', orgCtx().orgId, 'members'));
    att.accts = accs.docs.map(d => Object.assign({uid:d.id}, d.data())).filter(a => !a.removed && a.role !== 'orgadmin')
      .sort((a, b) => roleRank(a.role) - roleRank(b.role) || fullName(a).localeCompare(fullName(b)));
    if (payOn()){ const m0 = att.month; loadIncentives(m0).then(m => { att.inc = m; att.incM = m0; if (att.key === key) renderAttendance(); }); }
    if (att.detail) return watch(att.detail);
    await Promise.all(att.accts.map(async a => { const qs = await F.getDocs(q(a.uid)); att.ev[a.uid] = qs.docs.map(map); }));
    if (att.key === key) renderAttendance();
  } catch(e){ info('Attendance could not load: ' + (e.code || e.message)); }
}

function renderAttendance(){
  if (!cloud || !cloud.uid || !orgCtx()) return;
  regLoad();
  const mgr = canManageAtt(), modes = [mgr && 'team', attSelf() && 'me', canMarkAtt() && 'mark', !attRO() && regApprover() && 'appr'].filter(Boolean);
  if (attRO()) att.mode = 'team'; else if (!modes.includes(att.mode)) att.mode = modes[0] || 'me';
  $('#attMode').hidden = modes.length < 2 || attRO();
  document.querySelectorAll('#attMode button').forEach(b => { b.hidden = !modes.includes(b.dataset.m); b.classList.toggle('on', b.dataset.m === att.mode); });
  { const n = regPendingForMe().length, ab = $('#attMode [data-m=appr]'); if (ab) ab.textContent = 'Approvals' + (n ? ` (${n})` : ''); }
  const cur = att.month === todayKey.slice(0, 7);
  $('#attTitle').textContent = parseDay(att.month + '-01').toLocaleDateString([], {month:'long', year:'numeric'});
  $('#attNow').disabled = cur;
  $('#attExport').hidden = !(mgr && att.mode === 'team' && !att.detail);
  attLoad();
  const body = $('#attBody');
  if (body.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) return;   // don't wipe a form being typed in
  if (body.querySelector('[data-ed].dirty')) return;                                                       // nor unsaved attendance edits
  body.innerHTML = att.mode === 'me' ? attMine() : att.mode === 'mark' ? attMark() : att.mode === 'appr' ? attApprovals() : att.detail ? attDetail() : attTeam();
  numberTables(body);
  attTick();
}

function greet(){ const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
function attMine(){
  const evs = att.ev[cloud.uid];
  if (!evs) return '<div class="empty">Loading your attendance…</div>';
  const S = attSummary(evs, att.month, orgCtx().me || {}), cur = att.month === todayKey.slice(0, 7);
  let card = '';
  if (cur){
    const t = S.rows.find(r => r.k === todayKey) || {ss:[]}, ss = t.ss, open = ss.find(s => !s.out);
    const done = ss.filter(s => s.out).reduce((a, s) => a + s.out - s.in, 0);
    card = `<div class="punch${open ? ' isin' : ''}">
      <div>
        <div class="pg">${greet()}, ${esc(firstName(fullName(orgCtx().me || {}) || (cloud.user && cloud.user.displayName) || ''))}</div>
        <div class="pd">${esc(fmtLong(todayKey))} · Work ${esc(shiftTxt(S.c))} (${hm(S.sh)})</div>
        <div class="pstat">${open ? `<i class="dot s-done"></i>Checked in since ${esc(timeOnly(open.in))}` : ss.length ? `<i class="dot s-off"></i>Checked out at ${esc(timeOnly(ss[ss.length - 1].out))}` : '<i class="dot s-off"></i>Not checked in yet'}</div>
        <div class="psess">${ss.map(s => `<span>${esc(timeOnly(s.in))} → ${s.out ? esc(timeOnly(s.out)) : 'now'}</span>`).join('')}</div>
      </div>
      <div class="pr">
        <div class="ptimer" id="attTimer" data-done="${done}" data-open="${open ? open.in : ''}">${hms(done + (open ? Date.now() - open.in : 0))}</div>
        <div class="plbl">worked today</div>
        <button class="pbtn ${open ? 'out' : 'in'}" id="punchBtn" data-t="${open ? 'out' : 'in'}">${open ? 'Check out' : ss.length ? 'Check in again' : 'Check in'}</button>
      </div></div>`;
  }
  return card + attKpis(S, false) + regMineBox() + attTable(S, false, true);
}

/* Mark attendance: an attendance proxy (or a manager) checks staff in and out */
function markList(accts, ev){
  const rows = accts.filter(a => a.active !== false).map(a => {
    const ss = sessionsOf(ev[a.uid] || []).filter(x => dayKey(x.in) === todayKey), open = ss.find(x => !x.out), last = ss[ss.length - 1];
    return `<tr data-mk="${esc(a.uid)}"><td><b>${esc(fullName(a))}</b>${a.uid === cloud.uid ? ' <span class="stat">(you)</span>' : ''}<div class="stat">${esc(titleOf(a) || ROLE_LABEL[a.role] || '')}</div></td>
      <td>${open ? `<span class="astat in">In since ${esc(timeOnly(open.in))}</span>` : ss.length ? `<span class="astat out">Out at ${esc(timeOnly(last.out))}</span>` : '<span class="astat notyet">Not in yet</span>'}</td>
      <td class="stat">${ss.map(x => `${esc(timeOnly(x.in))}–${x.out ? esc(timeOnly(x.out)) : '…'}`).join(', ') || '—'}</td>
      <td style="text-align:right"><button class="pbtn sm ${open ? 'out' : 'in'}" data-mkt="${open ? 'out' : 'in'}">${open ? 'Check out' : ss.length ? 'Check in again' : 'Check in'}</button></td></tr>`; }).join('');
  return `<div class="awrap"><table class="atbl"><thead><tr><th>Staff</th><th>Now</th><th>Today</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="stat">No staff yet.</td></tr>'}</tbody></table></div>`;
}
function attMark(){
  if (!att.accts.length) return att.key ? '<div class="empty">No staff yet.</div>' : '<div class="empty">Loading team…</div>';
  return `<p class="stat" style="margin:0 0 8px">Check staff in or out when they can't do it themselves. The time is taken from the server clock and the entry is marked as done by you.</p>` + markList(att.accts, att.ev)
    + '<div style="height:14px"></div>' + regProxyBox(att.accts.filter(a => a.active !== false));
}
async function proxyPunch(uid, type, btn){
  if (!navigator.onLine) return info("You're offline. Connect to the internet first.");
  const {F} = cloud; if (btn) btn.disabled = true;
  try { await F.addDoc(attCol(uid), {type, at:F.serverTimestamp(), src:'proxy', by:cloud.uid}); info(type === 'in' ? 'Checked in ✔' : 'Checked out ✔'); return true; }
  catch(e){ info('Could not save: ' + (e.code || e.message)); if (btn) btn.disabled = false; return false; }
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-mkt]'); if (!b) return;
  const uid = b.closest('[data-mk]').dataset.mk;
  if (!(await proxyPunch(uid, b.dataset.mkt, b))) return;
  if (state.settings.view === 'home'){ home.px = null; renderHome(); } else { att.key = ''; renderAttendance(); }
});
function attKpis(S, pay){
  const k = (l, v, s, cls = '') => `<div class="kpi"><div class="kl">${l}</div><div class="kv ${cls}">${v}</div><div class="ks">${s}</div></div>`;
  return `<div class="kpis">
    ${k('Days present', S.P, S.done ? `of ${S.effMonth} days` : 'so far this month')}
    ${k('Offs used', `${S.offsUsed}/${OFFS_PER_MONTH}`, S.lop ? `<span class="neg">${S.lop} day${S.lop > 1 ? 's' : ''} loss of pay</span>` : `${OFFS_PER_MONTH - S.offsUsed} paid off${OFFS_PER_MONTH - S.offsUsed === 1 ? '' : 's'} left`)}
    ${k('Hours worked', hm(S.H), `shift ${hm(S.sh)} / day`)}
    ${k('Overtime hours', hm(S.OT), 'beyond shift timing')}
    ${k('Overtime days', S.otDays, 'worked on paid offs')}
    ${pay ? k(S.done ? 'Payable' : 'Payable so far', inr(S.pay), (+S.c.salary ? `salary ${inr(S.c.salary)}/month` : 'set salary below')) : ''}
  </div>`;
}

const ST_LABEL = {present:'Present', in:'Checked in', leave:'Leave', missed:'Missed check-out', notyet:'Not checked in'};
function attTable(S, edit, reg){
  const rows = S.rows.filter(r => r.st !== 'future' && r.st !== 'na').reverse();
  if (!rows.length) return '<div class="empty" style="margin-top:10px">No working days in this month yet.</div>';
  let html = '', wk = null;
  const wkTot = w => { const rs = rows.filter(r => weekStart(r.k) === w); return `${hm(rs.reduce((a, r) => a + r.worked, 0))} worked · ${hm(rs.reduce((a, r) => a + r.ot, 0))} overtime · ${rs.filter(r => r.ss.length).length} day(s) present`; };
  rows.forEach(r => {
    const w = weekStart(r.k);
    if (w !== wk){ wk = w; html += `<tr class="wk"><td colspan="${edit ? 7 : 6}">Week of ${esc(fmtDM(w))} – ${esc(fmtDM(shiftDay(w, 6)))} · ${wkTot(w)}</td></tr>`; }
    const first = r.ss[0], last = r.ss[r.ss.length - 1];
    html += `<tr>
      <td>${esc(fmtShort(r.k))}</td>
      <td><span class="astat ${r.st}">${ST_LABEL[r.st]}</span>${reg && ['missed', 'leave'].includes(r.st) ? ` <button class="linkb" data-regday="${r.k}">Regularize</button>` : ''}</td>
      <td>${first ? esc(timeOnly(first.in)) : '—'}</td>
      <td>${last && last.out ? esc(timeOnly(last.out)) : last ? '<span class="neg">—</span>' : '—'}</td>
      <td class="num">${r.ss.length ? hm(r.worked) : '—'}</td>
      <td class="num ${r.ot ? 'ot' : ''}">${r.ot ? hm(r.ot) : '—'}</td>
      ${edit ? `<td>${r.ss.map(s => `<span class="sesx${s.m ? ' m' : ''}" title="${s.m ? 'Added by manager' : 'Staff check-in'}">${esc(timeOnly(s.in))}–${s.out ? esc(timeOnly(s.out)) : '…'}<button data-del="${s.ids.join(',')}" title="Delete this entry">✕</button></span>`).join('')}</td>` : ''}
    </tr>`;
  });
  return `<div class="awrap"><table class="atbl"><thead><tr><th>Date</th><th>Status</th><th>First in</th><th>Last out</th><th class="num">Worked</th><th class="num">Overtime</th>${edit ? '<th>Entries</th>' : ''}</tr></thead><tbody>${html}</tbody></table></div>`;
}

function attTeam(){
  if (!att.accts.length) return att.key ? '<div class="empty">No people yet. The Account Manager adds them in Organization → People, then they can check in here.</div>' : '<div class="empty">Loading team…</div>';
  const cur = att.month === todayKey.slice(0, 7), pay = payOn();
  let inNow = 0, outNow = 0, notIn = 0, totPay = 0;
  const rows = att.accts.map(a => {
    const S = attSummary(att.ev[a.uid] || [], att.month, a), t = S.rows.find(r => r.k === todayKey);
    let today = '—';
    if (cur && t){
      if (t.st === 'in'){ inNow++; today = `<span class="astat in">In since ${esc(timeOnly(t.ss.find(s => !s.out).in))}</span>`; }
      else if (t.st === 'present'){ outNow++; today = `<span class="astat out">Out · ${hm(t.worked)}</span>`; }
      else if (t.st === 'notyet'){ notIn++; today = '<span class="astat notyet">Not in yet</span>'; }
    }
    if (!a.active) today = '<span class="astat out">Disabled</span>';
    totPay += S.pay;
    return `<tr class="clk" data-staff="${esc(a.uid)}">
      <td><b>${esc(fullName(a))}</b>${a.role !== 'employee' && ROLE_LABEL[a.role] ? `<em class="rtag">${ROLE_LABEL[a.role]}</em>` : ''}<div class="stat">${esc(titleOf(a) ? titleOf(a) + ' · ' : '')}${esc(shiftTxt(attCfg(a)))}</div></td>
      <td>${today}</td><td class="num">${S.P}</td><td class="num">${S.offsUsed}/${OFFS_PER_MONTH}</td>
      <td class="num ${S.lop ? 'neg' : ''}">${S.lop || '—'}</td><td class="num">${hm(S.H)}</td>
      <td class="num ${S.OT ? 'ot' : ''}">${S.OT ? hm(S.OT) : '—'}</td><td class="num ${S.otDays ? 'ot' : ''}">${S.otDays || '—'}</td><td class="num">${S.sun || '—'}</td>
      ${pay ? `<td class="num">${+S.c.salary ? inr(S.c.salary) : '<span class="stat">not set</span>'}</td><td class="num">${S.extra ? '+ ' + inr(S.extra) : '—'}</td>${feat('clinic') ? `<td class="num">${S.inc ? '+ ' + inr(S.inc) : '—'}</td>` : ''}<td class="num"><b>${inr(S.pay)}</b></td>` : ''}
      ${attRO() ? '' : `<td><button type="button" class="edbtn" data-staffed="${esc(a.uid)}" title="Mark or fix check-in / check-out times for any day of this month">✎ Edit times</button></td>`}</tr>`;
  }).join('');
  return `${cur ? `<div class="kpis">
      <div class="kpi"><div class="kl"><i class="dot s-done"></i>Checked in now</div><div class="kv">${inNow}</div><div class="ks">at the clinic</div></div>
      <div class="kpi"><div class="kl"><i class="dot s-off"></i>Checked out</div><div class="kv">${outNow}</div><div class="ks">done for now</div></div>
      <div class="kpi"><div class="kl"><i class="dot s-prog"></i>Not in yet</div><div class="kv">${notIn}</div><div class="ks">today</div></div>
      ${pay ? `<div class="kpi"><div class="kl">Team payable</div><div class="kv">${inr(totPay)}</div><div class="ks">${cur ? 'so far this month' : 'this month'}</div></div>` : ''}</div>` : ''}
    <div class="stat">Click a person to see their daily and weekly hours${attRO() ? '' : pay ? ', fix entries, or set their shift and salary' : ', fix entries, or set their shift'}.</div>
    <div class="awrap"><table class="atbl"><thead><tr><th>Staff</th><th>Today</th><th class="num">Present</th><th class="num">Offs used</th><th class="num">Loss of pay</th><th class="num">Hours</th><th class="num">OT hours</th><th class="num">OT days</th><th class="num">Sundays</th>${pay ? `<th class="num">Salary</th><th class="num">Extra hrs / days</th>${feat('clinic') ? '<th class="num">Incentive</th>' : ''}<th class="num">Payable</th>` : ''}${attRO() ? '' : '<th></th>'}</tr></thead>
    <tbody>${rows}${pay ? `<tr class="tot"><td colspan="${feat('clinic') ? 12 : 11}">Total payable</td><td class="num">${inr(totPay)}</td>${attRO() ? '' : '<td></td>'}</tr>` : ''}</tbody></table></div>`;
}

function attDetail(){
  const a = att.accts.find(x => x.uid === att.detail);
  if (!a) return '<div class="empty">Loading…</div>';
  if (!att.ev[a.uid]) return '<button class="abk" id="attBack">← Team</button><div class="empty">Loading…</div>';
  const S = attSummary(att.ev[a.uid], att.month, a), c = S.c, pay = payOn(), ro = attRO();
  const pr = (l, v) => `<div class="payrow"><span>${l}</span><span>${v}</span></div>`;
  return `<button class="abk" id="attBack">← Team</button>
    <div class="ahead"><div class="uav">${esc(fullName(a).charAt(0).toUpperCase())}</div><div><b>${esc(fullName(a))}</b>${a.role !== 'employee' && ROLE_LABEL[a.role] ? `<em class="rtag">${ROLE_LABEL[a.role]}</em>` : ''}<div class="stat">${esc(titleOf(a) ? titleOf(a) + ' · ' : '')}${esc(a.email || '')}</div></div></div>
    ${attKpis(S, pay)}
    <div class="acards">
      ${ro ? '' : `<div class="box"><h3>Shift${pay ? ' &amp; pay' : ''} settings</h3>
        <form class="aform" id="attCfgForm">
          ${wtFields('cf', c)}
          ${pay ? `<label>Monthly salary (₹)<input type="number" id="cfSal" min="0" step="100" value="${+c.salary || ''}" placeholder="e.g. 15000"></label>
          <label>Overtime rate<select id="cfOT">${[1, 1.5, 2].map(m => `<option value="${m}"${+c.otMult === m ? ' selected' : ''}>${m}× hourly</option>`).join('')}</select></label>` : ''}
          <button class="primary" type="submit">Save</button>
        </form>
        <p class="stat" style="margin:8px 0 0">${OFFS_PER_MONTH} paid offs per month. Hours beyond the shift each day count as overtime; working on unused offs counts as overtime days.</p>
      </div>`}
      ${pay ? `<div class="box"><h3>Pay for ${esc(parseDay(att.month + '-01').toLocaleDateString([], {month:'long'}))}${S.done ? '' : ' (so far)'}</h3>
        ${pr(`Base: ${S.effMonth} days × ${inr(S.perDay)}/day`, inr(S.base))}
        ${pr(`Loss of pay: ${S.lop} day(s) beyond ${OFFS_PER_MONTH} offs`, S.lop ? '− ' + inr(S.lopAmt) : inr(0))}
        ${pr(`Overtime days: ${S.otDays} × ${inr(S.perDay)}`, '+ ' + inr(S.otDayPay))}
        ${pr(`Overtime hours: ${hm(S.OT)} × ${inr(S.perHour)}/h × ${S.mult}`, '+ ' + inr(S.otHrPay))}
        ${feat('clinic') ? pr('Incentive (approved patient assists)', '+ ' + inr(S.inc)) : ''}
        ${pr(`Salary ${inr(S.salary)} + extra hours / days ${inr(S.extra)}${feat('clinic') ? ' + incentive ' + inr(S.inc) : ''} = <b>Payable</b>`, '<b>' + inr(S.pay) + '</b>')}
        <p class="stat" style="margin:6px 0 0">Sundays worked this month: <b>${S.sun}</b></p>
      </div>` : ''}
    </div>
    ${ro ? attTable(S, false) : attMonthEditor(S, a)}`;
}

/* Account Manager / Manager: edit the whole month, any number of check-in / check-out sessions a day (e.g. in → lunch out → in → out) */
const hhmm = ms => { const d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
const edSess = (i, o) => `<span class="eds1"><input type="time" data-ein value="${i || ''}" title="Check-in"><i>→</i><input type="time" data-eout value="${o || ''}" title="Check-out"><button type="button" class="danger" data-edrm title="Remove this session">✕</button></span>`;
function attMonthEditor(S, a){
  const B = S.B, last = B.e < todayKey ? B.e : todayKey, byDay = Object.fromEntries(S.rows.map(r => [r.k, r]));
  let html = '', wk = null;
  for (let k = last; k >= B.s; k = shiftDay(k, -1)){
    const r = byDay[k] || {k, st:'na', ss:[]}, ss = r.ss || [], ids = ss.flatMap(x => x.ids).join(','), w = weekStart(k);
    if (w !== wk){ wk = w; html += `<tr class="wk"><td colspan="5">Week of ${esc(fmtDM(w))} – ${esc(fmtDM(shiftDay(w, 6)))}</td></tr>`; }
    html += `<tr data-ed="${k}" data-ids="${esc(ids)}"><td style="white-space:nowrap"><b>${esc(fmtShort(k))}</b></td>
      <td>${r.st === 'na' ? '<span class="stat">—</span>' : `<span class="astat ${r.st}">${ST_LABEL[r.st] || ''}</span>`}</td>
      <td class="edsc">${ss.map(x => edSess(hhmm(x.in), x.out ? hhmm(x.out) : '')).join('')}<button type="button" data-edadd title="Add a check-in / check-out">+ Session</button></td>
      <td class="num">${ss.length ? hm(r.worked || 0) + (r.ot ? `<div class="ot" style="font-size:11.5px">+${hm(r.ot)} OT</div>` : '') : '—'}</td>
      <td style="white-space:nowrap">${ss.length ? '' : `<button type="button" data-edshift title="Fill with the work timing: ${esc(shiftTxt(S.c))}">Fill shift</button> `}<button type="button" class="primary" data-edsave disabled>Save</button></td></tr>`;
  }
  return `<div class="box" id="attEditor"><h3>Edit attendance for ${esc(parseDay(att.month + '-01').toLocaleDateString([], {month:'long', year:'numeric'}))} <span class="sub">add, change or remove check-ins and check-outs for any day; several sessions a day are fine (e.g. lunch break)</span></h3>
    <div class="btnrow" style="margin:0 0 8px"><span class="stat">Change the times, then <b>Save</b> that day, or</span><button class="primary" id="edSaveAll" disabled>Save all changed days</button></div>
    <div class="awrap" style="margin-top:0"><table class="atbl edtbl"><thead><tr><th>Date</th><th>Status</th><th>Check-in → Check-out</th><th class="num">Worked</th><th></th></tr></thead><tbody>${html}</tbody></table></div></div>`;
}
function edDirty(row){ row.classList.add('dirty'); row.querySelector('[data-edsave]').disabled = false; const b = $('#edSaveAll'); if (b) b.disabled = false; }
async function attSaveDay(row, quiet){
  const k = row.dataset.ed, uid = att.detail, ids = row.dataset.ids ? row.dataset.ids.split(',').filter(Boolean) : [];
  const at = t => { const x = parseDay(k); const [hh, mm] = t.split(':').map(Number); x.setHours(hh, mm, 0, 0); return x; };
  const pairs = [...row.querySelectorAll('.eds1')].map(x => [x.querySelector('[data-ein]').value, x.querySelector('[data-eout]').value]).filter(([i, o]) => i || o);
  for (const [i, o] of pairs){ if (!i){ info(`${fmtShort(k)}: every session needs a check-in time.`); return false; } if (o && at(o) <= at(i)){ info(`${fmtShort(k)}: check-out ${hm12(o)} must be after check-in ${hm12(i)}.`); return false; }
    if (at(i) > Date.now() || (o && at(o) > Date.now())){ info(`${fmtShort(k)}: that time hasn't happened yet.`); return false; } }
  pairs.sort((x, y) => x[0].localeCompare(y[0]));
  for (let n = 1; n < pairs.length; n++) if (!pairs[n - 1][1] || pairs[n][0] < pairs[n - 1][1]){ info(`${fmtShort(k)}: sessions overlap. Each check-in must come after the previous check-out.`); return false; }
  const {F, fs} = cloud, b = F.writeBatch(fs), by = cloud.user.email || '';
  ids.forEach(id => b.delete(F.doc(fs, 'orgs', orgCtx().orgId, 'attendance', uid, 'events', id)));
  pairs.forEach(([i, o]) => { b.set(F.doc(attCol(uid)), {type:'in', at:F.Timestamp.fromDate(at(i)), src:'manager', by}); if (o) b.set(F.doc(attCol(uid)), {type:'out', at:F.Timestamp.fromDate(at(o)), src:'manager', by}); });
  try { await b.commit(); row.classList.remove('dirty'); if (!quiet) info(`${fmtShort(k)} saved.`); return true; }
  catch(e){ info('Could not save: ' + errText(e)); return false; }
}
function attTick(){
  clearInterval(att.tick);
  att.tick = setInterval(() => {
    const t = document.getElementById('attTimer');
    if (!t || !['attendance', 'home', 'clinic'].includes(state.settings.view)){ clearInterval(att.tick); return; }
    const open = t.dataset.open ? +t.dataset.open : 0, v = hms(+t.dataset.done + (open ? Date.now() - open : 0));
    if (t.classList.contains('htimer')) t.innerHTML = v.split(':').map(x => `<span>${x}</span>`).join('<i>:</i>'); else t.textContent = v;
  }, 1000);
}

async function punch(type, btn){
  if (!navigator.onLine) return info("You're offline. Connect to the internet to check in or out.");
  const {F, fs} = cloud; btn.disabled = true;
  try { await F.addDoc(attCol(cloud.uid), {type, at:F.serverTimestamp(), src:'self'}); info(type === 'in' ? 'Checked in ✔' : 'Checked out ✔'); }
  catch(e){ info('Could not save: ' + (e.code || e.message)); btn.disabled = false; }
}
function attCsv(){
  const pay = payOn();
  const head = ['Staff', 'Email', 'Job title', 'Shift', 'Days present', 'Offs used', 'Loss of pay days', 'Hours worked', 'Overtime hours', 'Overtime days'].concat(pay ? ['Monthly salary', 'Payable'] : []);
  const lines = [head].concat(att.accts.map(a => { const S = attSummary(att.ev[a.uid] || [], att.month, a);
    return [fullName(a), a.email, a.title || '', `${S.c.shiftStart}-${S.c.shiftEnd}`, S.P, S.offsUsed, S.lop, (S.H / 3600000).toFixed(2), (S.OT / 3600000).toFixed(2), S.otDays].concat(pay ? [+S.c.salary || 0, Math.round(S.pay)] : []); }));
  download(new Blob([lines.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')], {type:'text/csv'}), `${slugify(orgCtx().org.name) || 'team'}-attendance-${att.month}.csv`);
}
function attStepMonth(n){ const d = parseDay(att.month + '-01'); d.setMonth(d.getMonth() + n); att.month = dayKey(d).slice(0, 7); renderAttendance(); }
$('#attPrev').onclick = () => attStepMonth(-1);
$('#attNext').onclick = () => attStepMonth(1);
$('#attNow').onclick = () => { att.month = todayKey.slice(0, 7); renderAttendance(); };
$('#attMode').addEventListener('click', e => { const b = e.target.closest('button'); if (b){ att.mode = b.dataset.m; att.detail = null; renderAttendance(); } });
$('#attExport').onclick = attCsv;
$('#attBody').addEventListener('input', e => { const r = e.target.closest('[data-ed]'); if (r && e.target.matches('[data-ein],[data-eout]')) edDirty(r); });
$('#attBody').addEventListener('click', async e => {
  const pb = e.target.closest('#punchBtn'); if (pb) return punch(pb.dataset.t, pb);
  const er = e.target.closest('[data-ed]');
  if (er && e.target.closest('[data-edadd]')){ const prev = [...er.querySelectorAll('[data-eout]')].pop(); e.target.closest('[data-edadd]').insertAdjacentHTML('beforebegin', edSess(prev && prev.value ? '' : '', '')); edDirty(er); er.querySelector('.eds1:last-of-type [data-ein]').focus(); return; }
  if (er && e.target.closest('[data-edrm]')){ e.target.closest('.eds1').remove(); edDirty(er); return; }
  if (er && e.target.closest('[data-edshift]')){ const c = attCfg(att.accts.find(x => x.uid === att.detail)); e.target.closest('[data-edshift]').remove(); er.querySelector('[data-edadd]').insertAdjacentHTML('beforebegin', c.brkS && c.brkE ? edSess(c.shiftStart, c.brkS) + edSess(c.brkE, c.shiftEnd) : edSess(c.shiftStart, c.shiftEnd)); edDirty(er); return; }
  if (er && e.target.closest('[data-edsave]')){ const b = e.target.closest('[data-edsave]'); b.disabled = true; if (!(await attSaveDay(er))) b.disabled = false; else { document.activeElement.blur(); att.key = ''; renderAttendance(); } return; }
  if (e.target.closest('#edSaveAll')){ const rows = [...document.querySelectorAll('#attBody [data-ed].dirty')]; let ok = 0;
    for (const r of rows){ if (await attSaveDay(r, true)) ok++; else break; }
    if (ok) info(`${plural(ok, 'day')} saved.`); document.activeElement.blur(); att.key = ''; renderAttendance(); return; }
  if (e.target.closest('#attBack')){ att.detail = null; renderAttendance(); return; }
  const del = e.target.closest('[data-del]');
  if (del){
    if (!confirm('Delete this attendance entry?')) return;
    const {F, fs} = cloud;
    try { await Promise.all(del.dataset.del.split(',').map(id => F.deleteDoc(F.doc(fs, 'orgs', orgCtx().orgId, 'attendance', att.detail, 'events', id)))); info('Entry deleted.'); }
    catch(err){ info('Could not delete: ' + (err.code || err.message)); }
    return;
  }
  const sed = e.target.closest('[data-staffed]');
  if (sed){ att.detail = sed.dataset.staffed; renderAttendance(); setTimeout(() => { const b = $('#attEditor'); if (b) b.scrollIntoView({behavior:'smooth', block:'start'}); }, 60); return; }
  const row = e.target.closest('[data-staff]');
  if (row){ att.detail = row.dataset.staff; renderAttendance(); }
});
$('#attBody').addEventListener('submit', async e => {
  e.preventDefault();
  const {F, fs} = cloud, uid = att.detail;
  if (attRO()) return;
  if (e.target.id === 'attCfgForm'){
    const prev = attCfg(att.accts.find(x => x.uid === uid));
    let cfg; try { cfg = wtRead('cf', prev); } catch(err){ return info(err.message); }
    cfg.salary = $('#cfSal') ? Math.max(0, +$('#cfSal').value || 0) : +prev.salary || 0; cfg.otMult = $('#cfOT') ? +$('#cfOT').value || 1 : +prev.otMult || 1;
    try { await F.updateDoc(F.doc(fs, 'orgs', orgCtx().orgId, 'members', uid), {att:cfg}); const a = att.accts.find(x => x.uid === uid); if (a) a.att = cfg; document.activeElement.blur(); renderAttendance(); info('Saved shift and pay settings.'); }
    catch(err){ info('Could not save: ' + (err.code || err.message)); }
  }
  if (e.target.id === 'attAddForm'){
    const d = $('#adD').value, i = $('#adI').value, o = $('#adO').value;
    if (!d || (!i && !o)) return info('Pick a date and at least a check-in or check-out time.');
    if (d > todayKey) return info("You can't add entries for future days.");
    const at = t => { const x = parseDay(d); const [hh, mm] = t.split(':').map(Number); x.setHours(hh, mm, 0, 0); return x; };
    if (i && o && at(o) <= at(i)) return info('Check-out must be after check-in.');
    const col = attCol(uid), by = cloud.user.email || '';
    try {
      if (i) await F.addDoc(col, {type:'in', at:F.Timestamp.fromDate(at(i)), src:'manager', by});
      if (o) await F.addDoc(col, {type:'out', at:F.Timestamp.fromDate(at(o)), src:'manager', by});
      document.activeElement.blur(); info('Entry added.');
    } catch(err){ info('Could not add: ' + (err.code || err.message)); }
  }
});

