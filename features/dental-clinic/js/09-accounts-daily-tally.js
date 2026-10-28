/* daily tally: opening cash (carried from the last tally) + change taken + today's count → cash collected today, checked against the Collection report;
   GPay / UPI, cards and others entered from the apps and checked against the same report */
const CHG = [200, 100, 50, 20, 10, 5, 2, 1];
const TMODES = [['upi', 'GPay / UPI', ['upi']], ['card', 'Debit card', ['card']], ['ccard', 'Credit card', ['ccard']], ['other', 'Others', ['cheque', 'neft', 'rtgs', 'bank']]];
/* cash received as per the count = closing count − opening − change − cash added from the bank − patients' change paid from petty cash / elsewhere
   (that cash stayed in the purse) + cash expenses + moved to petty cash + deposited */
const tCollected = t => (+t.counted || 0) - (+t.opening || 0) - (+t.change || 0) - (+t.added || 0) - (+t.chPetty || 0) - (+t.chOther || 0) + (+t.cashExp || 0) + (+t.toPetty || 0) + (+t.out || 0);
const tOk = t => t && !t.diff && !t.digitalDiff && t.manual !== false;
/* a saved tally checked against the payments as they are NOW (payments added or changed later turn a "Tallied" day into a mismatch) */
function tFig(t, ps){
  const rc = paidSum(ps.filter(x => x.mode === 'cash')), ru = paidSum(ps.filter(x => x.mode === 'upi')), ro = paidSum(ps.filter(x => x.mode !== 'cash' && x.mode !== 'upi'));
  const g = (t && t.digital) || {}, ap = k => g[k] ? +g[k].app || 0 : 0, tc = t ? tCollected(t) : 0, tu = ap('upi'), to = ap('card') + ap('ccard') + ap('other') + ap('bank');
  return {rc, ru, ro, tc, tu, to, dc:tc - rc, dd:(tu - ru) + (to - ro), ok:!!t && tc === rc && tu === ru && to === ro && t.manual !== false};
}
const denSum = (c, L) => (L || DENOMS).reduce((s, v) => s + v * (+(c || {})[v] || 0), 0);
function tallyBase(){
  const a = cl.acc, d = a.d, day = a.tday || todayKey, all = (d.tallies || []).slice().sort((x, y) => String(y.date).localeCompare(String(x.date)));
  const done = all.find(t => t.date === day), prev = all.find(t => t.date < day) || (d.prevT || [])[0], tPay = d.tPay || [];
  const pays = tPay.filter(x => x.mode === 'cash');
  const dig = TMODES.map(([k, l, ms]) => { const ps = tPay.filter(x => ms.includes(x.mode)); return {k, l, ms, ps, sys:paidSum(ps)}; });
  const pet = (d.tPin || []).filter(x => x.source === 'drawer' && !x.opening);                      // petty cash top-ups taken out of this drawer
  // notes counted at billing: what came into the purse and what went out of it as change; change paid from petty cash / elsewhere
  const withDen = pays.filter(x => x.cash), denIn = {}, denOut = {};
  withDen.forEach(x => DENOMS.forEach(v => { denIn[v] = (denIn[v] || 0) + (+(x.cash.in || {})[v] || 0); denOut[v] = (denOut[v] || 0) + (+(x.cash.out || {})[v] || 0); }));
  const chPetty = withDen.reduce((s, x) => s + (+x.cash.petty || 0), 0), chOther = withDen.reduce((s, x) => s + (+x.cash.other || 0), 0);
  const first = !prev && (!done || !!done.start);                                // first tally: what is counted now is the starting point
  return {day, tallies:all, done, prev, first, pays, dig, pet, withDen, denIn, denOut, noDen:pays.length - withDen.length, chPetty, chOther, toPetty:paidSum(pet), cashIn:paidSum(pays), cashExp:paidSum((d.tExp || []).filter(x => x.mode === 'cash' && x.paid !== false && (x.paidDate || x.date) === day))};
}
const denGrid = (L, pre, counts, w) => `<div class="denoms">${L.map(n => `<label><span>₹${n} ×</span><input type="number" min="0" id="${pre}${n}" data-den="${pre}" value="${+(counts || {})[n] || ''}" placeholder="0"${w ? '' : ' disabled'}><b id="${pre}T${n}">₹0</b></label>`).join('')}</div>`;
function accTally(){
  const B = tallyBase(), {day, done, prev, pays, first} = B, w = canW('tally') || canW('accounts');
  const fix = cl.acc.tOpenFix === day && canW('accounts') && !first, opening = done ? +done.opening || 0 : prev ? +prev.counted || 0 : 0;
  const openCounts = done ? done.openCounts || null : prev ? prev.counts || null : null;
  const gap = !done && prev && prev.date < shiftDay(day, -1);
  const chip = (c, L) => (L || DENOMS).filter(n => +c[n]).map(n => `<span class="dchip">₹${n} × ${+c[n]}</span>`).join('') || '<span class="stat">no denominations saved</span>';
  // not tallied yet: fill the purse count with what should be in it (opening notes + notes received at billing − change given from the purse)
  const exp = {}; DENOMS.forEach(v => { exp[v] = Math.max(0, (+(openCounts || {})[v] || 0) + (B.denIn[v] || 0) - (B.denOut[v] || 0)); });
  const prefill = !done && !first && openCounts ? exp : null;
  const F0 = done ? tFig(done, cl.acc.d.tPay || []) : null;
  const status = done ? (F0.ok ? `<span class="upill on">Tallied ✓ · ${esc((done.by || '').split('@')[0])}</span>` : `<span class="upill gone">Not tallied · ${[F0.dc ? 'cash ' + (F0.dc > 0 ? '+' : '−') + inr(Math.abs(F0.dc)) : '', F0.dd ? 'online ' + (F0.dd > 0 ? '+' : '−') + inr(Math.abs(F0.dd)) : ''].filter(Boolean).join(', ') || 'not counted by hand'} against today's report</span>`)
    + (canW('accounts') ? ` <button class="linkb danger" data-tldel="${esc(day)}" title="Delete this saved tally (e.g. test entries), then count again">🗑 Delete this tally</button>` : '') : '<span class="upill pend">Not tallied yet</span>';
  const more = fix || (done && (+done.change || +done.added || +done.out)) || B.cashExp || B.toPetty;
  const row = (l, v, id) => `<div class="payrow"><span>${l}</span><span${id ? ` id="${id}"` : ''}>${v}</span></div>`;
  return `<div class="vbar" style="padding:0 0 10px"><div class="daynav"><button data-td="-1">‹</button><button data-td="0"${day === todayKey ? ' disabled' : ''}>Today</button><button data-td="1"${day >= todayKey ? ' disabled' : ''}>›</button></div>
      <strong>${esc(fmtLong(day))}</strong>${status}${done && done.history && done.history.length ? `<details class="stat thist"><summary>Changed ${plural(done.history.length, 'time')}</summary>${done.history.slice().reverse().map(h => `<div>${esc(fmt(h.at))} · ${esc((h.by || '').split('@')[0])}: before, counted ${inr((h.prev || {}).counted)} · opening ${inr((h.prev || {}).opening)}</div>`).join('')}</details>` : ''}</div>
    ${first ? `<div class="nag soft tfirst">🆕 <b>First tally.</b> Count <b>all the cash in the purse now</b>, today's collections included, and save. That is your starting point: from the next tally on, every day is checked against it.</div>` : ''}
    ${gap ? `<div class="nag">The last tally was on ${esc(fmtLong(prev.date))}; the days in between weren't tallied, so their cash isn't checked. The opening here is that day's closing count.</div>` : ''}
    <div class="tally tmain">
      <div class="box tpurse"><h3>💵 Cash in the purse now <span class="sub">count every note and coin</span></h3>
        ${prefill ? `<div class="nag soft">Filled in from the opening cash${B.withDen.length ? ` and ${plural(B.withDen.length, 'cash bill')}'s notes` : ''}. Count the purse and change only what differs.${B.noDen ? ` ${plural(B.noDen, 'cash payment')} had no notes counted, so ${B.noDen === 1 ? "it isn't" : "they aren't"} included.` : ''}${B.cashExp || B.toPetty ? " Cash paid out for expenses / petty cash isn't taken off note by note: take those notes out too." : ''}</div>` : ''}
        ${denGrid(DENOMS, 'den', done ? done.counts : prefill, w)}
        <div class="ttot"><span>Cash in the purse</span><b id="tlCounted">₹0</b></div>
        ${w ? `<label class="tlalt">Not counting notes? Type the total <input type="number" class="tin" id="tlTotal" min="0" value="${done && !done.counts ? +done.counted || '' : ''}" placeholder="₹ total"></label>
        <label class="ack tick" id="tlAckL"><input type="checkbox" id="tlAck"${done && done.manual ? ' checked' : ''}> I counted the cash by hand</label>` : ''}</div>
      <div class="box tcash"><h3>Does it match?</h3>
        ${first ? row('Opening cash <span class="stat">worked out: what you counted − today\'s cash</span>', '—', 'tlOpenR') : row(`Opening cash <span class="stat">${prev && !done ? 'closing count of ' + esc(fmtDM(prev.date)) : 'as tallied'}${done && done.openingFix ? ' · corrected' : ''}</span>`, inr(opening), 'tlOpenR')}
        ${row(`+ Cash received <span class="stat">Collection report · ${plural(pays.length, 'payment')}</span>`, inr(B.cashIn))}
        ${B.chPetty || (done && +done.chPetty) ? row("+ Patients' change paid from petty cash <span class=\"stat\">their notes stayed in the purse</span>", inr(B.chPetty)) : ''}
        ${B.chOther || (done && +done.chOther) ? row(`+ Patients' change paid from elsewhere <span class="stat">${esc([...new Set(B.withDen.flatMap(x => (x.cash.xs || []).filter(s => s.src === 'other').map(s => s.name)))].join(', '))}</span>`, inr(B.chOther)) : ''}
        ${row('± Other cash in / out <span class="stat">change brought in, bank, expenses, petty cash (below)</span>', '₹0', 'tlOtherR')}
        <div class="payrow tsum"><span>Expected in the purse</span><b id="tlExpV">—</b></div>
        <div class="payrow"><span>Counted</span><b id="tlCountR">—</b></div>
        <div class="tdiff" id="tlDiff"></div>
        <div class="payrow stat"><span>Cash received as per the count <span class="stat">vs ${inr(B.cashIn)} in the report</span></span><span id="tlColl">—</span></div>
        ${pays.length ? `<details class="stat"><summary>Cash payments</summary>${pays.map(x => `<div>${esc(x.patientName)} · ${esc(x.receiptNo || '')} · ${inr(x.amount)}${x.cash ? ` · <span class="cdmini">${esc(cashLine(x))}</span>` : ' · <i>notes not counted</i>'}</div>`).join('')}</details>` : ''}</div>
    </div>
    <details class="box tmore"${more ? ' open' : ''}><summary><b>More</b> <span class="stat">opening cash · change brought in · bank withdrawals &amp; deposits · expenses &amp; petty cash</span></summary>
      ${first ? '' : `<div class="topen"><div class="tob"><span>Opening cash</span><b class="big" id="tlOpenV">${inr(opening)}</b>
        <span class="stat">${fix ? 'correcting the opening: count again and give the reason' : prev && !done ? 'closing count of the last tally, ' + esc(fmtDM(prev.date)) : 'as tallied' + (done && done.openingFix ? ` · corrected by ${esc((done.openingFix.by || '').split('@')[0])}: ${esc(done.openingFix.reason || '')}` : '')}</span>
        ${!fix && canW('accounts') ? `<button class="linkb" data-tlopen="${esc(day)}" title="Correct the opening cash (recorded with your name and reason)">✎ Correct opening</button>` : ''}${fix ? '<button class="linkb" data-tlopen="">Cancel</button>' : ''}</div>
        ${fix ? denGrid(DENOMS, 'op', openCounts || {}, w) : `<div class="dchips">${openCounts ? chip(openCounts) : ''}</div>`}
        ${fix ? '<input id="tlOpenWhy" placeholder="Reason for the correction *" style="flex-basis:100%">' : ''}</div>`}
      <div class="tally">
        <div><h3 class="tmh">Change brought in <span class="sub">coins &amp; notes added to the purse (e.g. from the bank)</span></h3>${denGrid(CHG, 'ch', done && done.changeCounts, w)}
          <div class="payrow tsum"><span>Change brought in</span><b id="tlChangeV">₹0</b></div></div>
        <div><h3 class="tmh">Bank, expenses &amp; petty cash</h3>
          <div class="payrow"><span>+ Cash withdrawn from the bank / added</span><span>${w ? `<input type="number" class="tin" id="tlAdd" min="0" value="${done && +done.added || ''}" placeholder="0">` : inr(done && done.added)}</span></div>
          ${row('− Cash expenses paid from the purse <span class="stat">from Accounts</span>', inr(B.cashExp))}
          ${row(`− Moved to petty cash <span class="stat">${B.pet.length ? 'petty top-ups from the purse' : 'none today'}</span>`, inr(B.toPetty))}
          <div class="payrow"><span>− Cash deposited into the bank / handed over</span><span>${w ? `<input type="number" class="tin" id="tlOut" min="0" value="${done && +done.out || ''}" placeholder="0">` : inr(done && done.out)}</span></div></div>
      </div></details>
    <div class="box"><h3>GPay / UPI, cards &amp; others</h3>
      <table class="dtbl"><thead><tr><th></th><th class="num">Report</th><th class="num">App / slip</th><th></th></tr></thead><tbody>
      ${B.dig.map(m => { const dm = (done && done.digital && done.digital[m.k]) || {};
        return `<tr><td><b>${esc(m.l)}</b>${m.ps.length ? `<details class="stat"><summary>${plural(m.ps.length, 'payment')}</summary>${m.ps.map(x => `<div>${esc(x.patientName || '')} · ${inr(x.amount)}${m.ms.length > 1 ? ' · ' + esc(x.mode) : ''}</div>`).join('')}</details>` : ''}</td>
          <td class="num">${inr(m.sys)}</td><td class="num">${w ? `<input type="number" class="tin" id="dg_${m.k}" data-dapp="${m.k}" value="${done && dm.app != null ? dm.app : ''}" placeholder="${m.sys ? 'enter' : '0'}">` : inr(dm.app)}</td><td id="dgDiff_${m.k}" class="dstat"></td></tr>`; }).join('')}
      </tbody></table>
      <div class="tdiff" id="tlDigDiff"></div>
      ${w ? `<label class="ack tick" id="tlAckDL"><input type="checkbox" id="tlAckD"${done && done.manual ? ' checked' : ''}> I checked each amount in the app / slip</label>` : ''}</div>
    ${w ? `<div class="btnrow" style="margin-top:10px"><input id="tlNote" placeholder="Note (required if anything doesn't match)" style="flex:1;min-width:200px" value="${esc(done ? done.note || '' : '')}"><button class="primary" id="tlSave">${done ? 'Update tally' : 'Save tally'}</button></div>` : ''}
    ${tallyMonth(B)}`;
}
function tallyMonth(B){
  const d = cl.acc.d, mk = B.day.slice(0, 7), mp = d.mPay || [], last = mEnd(mk) < todayKey ? mEnd(mk) : todayKey, byT = Object.fromEntries(B.tallies.map(t => [t.date, t]));
  const T = {rc:0, tc:0, ru:0, tu:0, ro:0, to:0, xc:0, xu:0, xo:0}, rows = [];
  for (let k = last; k >= mk + '-01'; k = shiftDay(k, -1)){
    const ps = mp.filter(x => x.date === k), t = byT[k];
    if (!ps.length && !t) continue;
    const {rc, ru, ro, tc, tu, to, ok:tok} = tFig(t, ps);
    T.rc += rc; T.ru += ru; T.ro += ro; if (t){ T.tc += tc; T.tu += tu; T.to += to; T.xc += rc; T.xu += ru; T.xo += ro; }
    const cell = (r, v) => t ? `<td class="num${v !== r ? ' neg' : ''}">${inr(v)}</td>` : '<td class="num stat">—</td>';
    rows.push(`<tr class="clk${k === B.day ? ' sel' : ''}" data-tday="${k}"><td>${esc(fmtShort(k))}</td><td class="num">${inr(rc)}</td>${cell(rc, tc)}<td class="num">${inr(ru)}</td>${cell(ru, tu)}<td class="num">${inr(ro)}</td>${cell(ro, to)}
      <td>${t ? tok ? '<span class="upill on">Tallied</span>' : '<span class="upill gone">Mismatch</span>' : '<span class="upill pend">Not done</span>'}</td></tr>`);
  }
  const dd = (r, v) => `<td class="num${r !== v ? ' neg' : ''}"><b>${inr(v)}</b></td>`;
  return `<h3 style="font-size:13px;margin:18px 0 6px">${esc(monthLabel(mk))} · report vs tally</h3>
    <div class="awrap"><table class="atbl"><thead><tr><th>Date</th><th class="num">Cash · report</th><th class="num">Cash · tally</th><th class="num">GPay/UPI · report</th><th class="num">GPay/UPI · tally</th><th class="num">Cards &amp; others · report</th><th class="num">Cards &amp; others · tally</th><th></th></tr></thead>
    <tbody>${rows.join('') || '<tr><td colspan="8" class="stat">No collections or tallies this month yet.</td></tr>'}
    ${rows.length ? `<tr class="tot"><td>Month total</td><td class="num"><b>${inr(T.rc)}</b></td>${dd(T.xc, T.tc)}<td class="num"><b>${inr(T.ru)}</b></td>${dd(T.xu, T.tu)}<td class="num"><b>${inr(T.ro)}</b></td>${dd(T.xo, T.to)}<td></td></tr>` : ''}</tbody></table></div>`;
}
function tallyCalc(){
  if (!$('#tlColl')) return null;
  const B = tallyBase(), n = id => { const e = $('#' + id); return e ? +e.value || 0 : 0; }, w = !!$('#tlSave'), set = (id, t) => { const e = $('#' + id); if (e) e.textContent = t; };
  const cnt = (pre, L) => Object.fromEntries(L.map(v => [v, Math.max(0, n(pre + v))]));
  const showT = (pre, L, c) => L.forEach(v => { const b = $('#' + pre + 'T' + v); if (b) b.textContent = inr(v * c[v]); });
  const openFix = !!$('#op500'), openCounts = openFix ? cnt('op', DENOMS) : B.first ? null : (B.done ? B.done.openCounts || null : B.prev ? B.prev.counts || null : null);
  if (openFix){ showT('op', DENOMS, openCounts); set('tlOpenV', inr(denSum(openCounts))); }
  const changeCounts = cnt('ch', CHG), change = denSum(changeCounts, CHG), gridCounts = cnt('den', DENOMS), gridSum = denSum(gridCounts);
  showT('ch', CHG, changeCounts); showT('den', DENOMS, gridCounts);
  const tot = $('#tlTotal'); if (tot){ tot.disabled = gridSum > 0; if (gridSum) tot.value = ''; }
  const byTotal = !gridSum && tot && +tot.value > 0, counted = byTotal ? Math.round(+tot.value) : gridSum, counts = byTotal ? null : gridCounts;   // notes counted, or just the total typed
  const out = Math.max(0, $('#tlOut') ? n('tlOut') : B.done ? +B.done.out || 0 : 0), added = Math.max(0, $('#tlAdd') ? n('tlAdd') : B.done ? +B.done.added || 0 : 0);
  const flow = B.cashIn + change + added + B.chPetty + B.chOther - B.cashExp - B.toPetty - out;            // today's cash in − out
  const opening = openFix ? denSum(openCounts) : B.first ? Math.max(0, counted - flow) : (B.done ? +B.done.opening || 0 : B.prev ? +B.prev.counted || 0 : 0);
  const expected = opening + flow, diff = counted - expected, coll = counted - opening - change - added - B.chPetty - B.chOther + B.cashExp + B.toPetty + out;
  const other = change + added - B.cashExp - B.toPetty - out;
  set('tlChangeV', inr(change)); set('tlCounted', inr(counted)); set('tlColl', inr(coll)); set('tlOpenR', inr(opening)); set('tlOtherR', (other < 0 ? '− ' : '') + inr(Math.abs(other)));
  set('tlExpV', inr(expected)); set('tlCountR', inr(counted));
  const ack = $('#tlAck') ? $('#tlAck').checked : !!(B.done && B.done.manual), dEl = $('#tlDiff');
  const startNow = B.first && !openFix;
  dEl.className = 'tdiff ' + (startNow && !counted ? 'wait' : diff ? 'bad' : ack ? 'ok' : 'wait');
  dEl.textContent = startNow && !counted ? 'Count the cash in the purse now (or type the total).' : startNow && !diff ? (ack ? `✓ Starting point: opening ${inr(opening)} + today's cash = ${inr(counted)} in the purse` : `Starting point: ${inr(counted)} in the purse · tick "counted by hand" to save`) : diff ? (diff > 0 ? `Excess ${inr(diff)}: counted is more than expected (against the report)` : `Short ${inr(-diff)}: counted is less than expected (against the report)`) : ack ? '✓ Cash tallied' : 'Matches the report · tick "counted by hand" to tally';
  const digital = {}; let digitalDiff = 0, blank = 0;
  B.dig.forEach(m => {
    const e = $('#dg_' + m.k), raw = e ? e.value.trim() : '', app = e ? (raw === '' ? (m.sys ? null : 0) : +raw || 0) : (((B.done || {}).digital || {})[m.k] || {}).app || 0;
    if (app == null) blank++;
    const dd = app == null ? 0 : app - m.sys; digitalDiff += dd;
    digital[m.k] = {system:m.sys, app:app == null ? 0 : app, diff:dd, count:m.ps.length, seen:[]};
    const de = $('#dgDiff_' + m.k); if (de){ de.className = 'dstat ' + (app == null ? '' : dd ? 'neg' : 'okc'); de.textContent = app == null ? '' : dd ? (dd > 0 ? '+' : '−') + inr(Math.abs(dd)) : '✓'; }
  });
  const ackD = $('#tlAckD') ? $('#tlAckD').checked : !!(B.done && B.done.manual), gEl = $('#tlDigDiff');
  gEl.className = 'tdiff ' + (blank ? 'wait' : digitalDiff ? 'bad' : ackD ? 'ok' : 'wait');
  gEl.textContent = blank ? `Enter the amount for ${plural(blank, 'mode')} from the app / slip` : digitalDiff ? `Differs from the report by ${inr(Math.abs(digitalDiff))}` : ackD ? '✓ GPay / UPI, cards & others tallied' : 'Matches the report · tick "checked" to tally';
  const L1 = $('#tlAckL'), L2 = $('#tlAckDL'); if (L1) L1.classList.toggle('on', ack && !diff); if (L2) L2.classList.toggle('on', ackD && !digitalDiff && !blank);
  return {B, opening, openCounts, openFix, change, changeCounts, out, added, counts, expected, counted, diff, digital, digitalDiff, blank, ack, ackD, w};
}
async function saveTally(){
  const T = tallyCalc(); if (!T) return;
  const note = (($('#tlNote') || {}).value || '').trim();
  if (!T.counted && !confirm('The purse count is empty. Save with ₹0 in the purse?')) return;
  if (T.blank) return info('Enter the amount each app / slip shows (0 if nothing came in).');
  if (!T.ack || !T.ackD) return info('Tick "I counted the cash by hand" and "I checked each amount" to confirm.');
  if ((T.diff || T.digitalDiff) && !note) return info('It doesn\'t match the Collection report. Add a note explaining the difference.');
  const D0 = T.B.done, by = cloud.user.email || '', now = Date.now(), why = T.openFix ? ($('#tlOpenWhy').value || '').trim() : '';
  const oldOpen = D0 ? +D0.opening || 0 : T.B.prev ? +T.B.prev.counted || 0 : 0;
  if (T.openFix && T.opening !== oldOpen && !why) return info('Give the reason for correcting the opening cash.');
  if (cl.acc.tSaving) return; cl.acc.tSaving = true;                                   // no double submits
  try {
    const x = {date:T.B.day, opening:T.opening, openCounts:T.openCounts || null, cashIn:T.B.cashIn, change:T.change, changeCounts:T.changeCounts, added:T.added, chPetty:T.B.chPetty, chOther:T.B.chOther, cashExp:T.B.cashExp, toPetty:T.B.toPetty, out:T.out, expected:T.expected,
      counts:T.counts, counted:T.counted, start:!!T.B.first && !T.openFix, diff:T.diff, digital:T.digital, digitalDiff:T.digitalDiff, unseen:0, manual:true, note, by, at:now, createdBy:(D0 && (D0.createdBy || D0.by)) || by, createdAt:(D0 && (D0.createdAt || D0.at)) || now};
    if (T.openFix && T.opening !== oldOpen) x.openingFix = {from:oldOpen, to:T.opening, reason:why, by, at:now};
    else if (D0 && D0.openingFix) x.openingFix = D0.openingFix;
    if (D0){ const {history, ...prevV} = D0; delete prevV.id; x.history = (D0.history || []).concat([{at:now, by, prev:prevV}]).slice(-20); }      // keep what it was before this change
    await cloud.F.setDoc(cDoc('tallies', T.B.day), x);
  } catch(e){ cl.acc.tSaving = false; return info('Could not save: ' + errText(e)); }
  cl.acc.tSaving = false; cl.acc.tOpenFix = '';
  cl.acc.key = ''; cl.clear = true; info(T.diff || T.digitalDiff ? `Saved, but not tallied: cash ${inr(T.diff)}, online ${inr(T.digitalDiff)} against the report.` : 'Tallied ✓ Cash and online match the Collection report.'); renderClinic(); clinicSync(true);
}
