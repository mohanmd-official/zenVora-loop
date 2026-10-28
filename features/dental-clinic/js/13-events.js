/* ---------- events ---------- */
// a page in the Clinic menu (left "Features" menu, or the row of pages on a phone)
function clGoSec(k){ cl.sec = k; if (cl.sec === 'setup') cl.members = null; if (cl.sec === 'assists') cl.asKey = ''; if (cl.sec === 'patients' && cl.pid){ cl.pUnsub.forEach(u => { try { u(); } catch(_){} }); cl.pUnsub = []; cl.pid = null; } cl.newP = false;
  if (state.settings.view !== 'clinic') setView('clinic'); else renderClinic(); }
/* type-to-search for long dropdowns (treatments, medicines): the select stays (hidden) and is set from the typed name */
let srchN = 0;
function enhanceSrch(sel){
  if (sel._srch) return; sel._srch = true;
  const id = 'srchdl' + (++srchN), inp = document.createElement('input'), dl = document.createElement('datalist'), ph = sel.options[0] && !sel.options[0].value ? sel.options[0].text.replace(/—/g, '').trim() : '';
  inp.className = 'srchin'; inp.setAttribute('list', id); inp.autocomplete = 'off'; inp.placeholder = '🔍 ' + (ph || 'Type to search…'); dl.id = id;
  const fill = () => { dl.innerHTML = [...sel.options].filter(o => o.value).map(o => `<option value="${esc(o.text)}"></option>`).join(''); };
  fill(); if (sel.value && sel.selectedOptions[0]) inp.value = sel.selectedOptions[0].text;
  sel.hidden = true; sel.after(inp, dl);
  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase(), opts = [...sel.options].filter(o => o.value);
    const o = opts.find(x => x.text.toLowerCase() === q) || (q.length > 1 ? (opts.filter(x => x.text.toLowerCase().startsWith(q)).length === 1 ? opts.find(x => x.text.toLowerCase().startsWith(q)) : null) : null);
    const exact = o && o.text.toLowerCase() === q, nv = exact ? o.value : '';
    if (sel.value !== nv && (nv || sel.options[0].value === '')){ sel.value = nv || ''; sel.dispatchEvent(new Event('change', {bubbles:true})); sel.dispatchEvent(new Event('input', {bubbles:true})); }
    inp.classList.toggle('bad', !!q && !exact);
  });
  inp.addEventListener('blur', () => { if (sel.value && sel.selectedOptions[0]) { inp.value = sel.selectedOptions[0].text; inp.classList.remove('bad'); } });
  inp.addEventListener('focus', () => inp.select());
  sel.addEventListener('change', () => { if (document.activeElement !== inp && sel.selectedOptions[0]) { inp.value = sel.value ? sel.selectedOptions[0].text : ''; inp.classList.remove('bad'); } });
}
new MutationObserver(() => document.querySelectorAll('select.srch').forEach(enhanceSrch)).observe(document.body, {childList:true, subtree:true});

/* tooth chart (FDI numbering): click teeth to pick them; the treatment cost = price × number of teeth */
const TROWS = [[18, 17, 16, 15, 14, 13, 12, 11, '|', 21, 22, 23, 24, 25, 26, 27, 28], [48, 47, 46, 45, 44, 43, 42, 41, '|', 31, 32, 33, 34, 35, 36, 37, 38]];
const TROWS_KID = [[55, 54, 53, 52, 51, '|', 61, 62, 63, 64, 65], [85, 84, 83, 82, 81, '|', 71, 72, 73, 74, 75]];
const isTooth = n => /^[1-8][1-8]$/.test(String(n)) && (+String(n)[0] <= 4 ? +String(n)[1] <= 8 : +String(n)[1] <= 5);
const PEDO_L = 'ABCDE';                                   // primary teeth letters A (central incisor) … E (second molar)
const toothTok = t => { const m = /^([1-8])([a-e])$/i.exec(t); return m ? String(+m[1] <= 4 ? +m[1] + 4 : +m[1]) + (PEDO_L.indexOf(m[2].toUpperCase()) + 1) : t; };   // Dentee styles 6D / 2D (quadrant + letter) → FDI 64
const normTeeth = s => String(s || '').split(/[\s,;+&]+/).filter(Boolean).map(toothTok).join(', ');
const teethIn = s => String(s || '').split(/[\s,;+&]+/).map(toothTok).filter(isTooth);
const teethCount = s => { const n = teethIn(s).length; return n || 1; };
let toothFor = null;
function toothPop(inp){
  let pop = $('#toothPop'); if (!pop){ pop = document.createElement('div'); pop.id = 'toothPop'; document.body.append(pop);
    pop.addEventListener('mousedown', e => e.preventDefault());
    pop.addEventListener('click', e => { e.stopPropagation(); if (!toothFor) return; const b = e.target.closest('[data-tn]'), x = e.target.closest('[data-tx]');
      if (b){ const cur = teethIn(toothFor.value), n = b.dataset.tn, other = String(toothFor.value || '').split(/[\s,;+&]+/).filter(t => t && !isTooth(toothTok(t)));
        const next = cur.includes(n) ? cur.filter(t => t !== n) : cur.concat(n), order = TROWS.concat(TROWS_KID).flat().map(String);
        toothFor.value = next.sort((p, q) => order.indexOf(p) - order.indexOf(q)).concat(other).join(', '); toothFor.dispatchEvent(new Event('input', {bubbles:true})); drawTooth(); }
      if (x){ if (x.dataset.tx === 'adult' || x.dataset.tx === 'pedo'){ pop.dataset.kid = x.dataset.tx === 'pedo' ? '1' : ''; drawTooth(); } if (x.dataset.tx === 'clear'){ toothFor.value = ''; toothFor.dispatchEvent(new Event('input', {bubbles:true})); drawTooth(); } if (x.dataset.tx === 'done') closeTooth(); } });
  }
  toothFor = inp;
  { const cur = teethIn(inp.value), pid = cl.sum ? cl.sum.appt.patientId : cl.pid, pt = (cl.p && cl.p.id === pid ? cl.p : null) || (cl.allP || []).find(x => x.id === pid), age = pt ? parseInt(ageOf(pt)) : NaN;     // open on Pedo for primary teeth or a child under 12
    pop.dataset.kid = cur.length ? (cur.some(t => +t[0] >= 5) ? '1' : '') : (age < 12 ? '1' : ''); }
  drawTooth();
  const r = inp.getBoundingClientRect(), W = Math.min(560, innerWidth - 16);
  pop.style.width = W + 'px'; pop.style.left = Math.max(8, Math.min(r.left, innerWidth - W - 8)) + scrollX + 'px'; pop.style.top = (r.bottom + 6 + scrollY) + 'px'; pop.classList.add('on');
}
function drawTooth(){
  const pop = $('#toothPop'); if (!pop || !toothFor) return;
  const sel = teethIn(toothFor.value), rows = pop.dataset.kid ? TROWS_KID : TROWS;
  const kid = !!pop.dataset.kid, lab = n => kid ? `${n}<small>${PEDO_L[(n % 10) - 1]}</small>` : n;
  const row = (r, l) => `<div class="trow2${kid ? ' kid' : ''}"><span class="tlab">${l}</span>${r.map(n => n === '|' ? '<i class="tmid"></i>' : `<button type="button" data-tn="${n}" class="${sel.includes(String(n)) ? 'on' : ''}" title="${kid ? 'Primary ' + n + ' (' + Math.floor(n / 10) + PEDO_L[(n % 10) - 1] + ')' : 'Permanent ' + n}">${lab(n)}</button>`).join('')}</div>`;
  const other = sel.filter(t => (+t[0] >= 5) !== kid).length;
  pop.innerHTML = `<div class="tph"><div class="seg mini"><button type="button" data-tx="adult" class="${kid ? '' : 'on'}">Adult (permanent)</button><button type="button" data-tx="pedo" class="${kid ? 'on' : ''}">Pedo (primary)</button></div>
    <span class="stat">${sel.length ? sel.length + (sel.length > 1 ? ' teeth' : ' tooth') + ' · cost × ' + sel.length + (other ? ` (${other} on the ${kid ? 'Adult' : 'Pedo'} chart)` : '') : 'FDI numbers · patient\'s right ← → left'}</span><span class="sp"></span>
    <button type="button" data-tx="clear">Clear</button><button type="button" class="primary" data-tx="done">Done</button></div>
    ${row(rows[0], 'Upper')}${row(rows[1], 'Lower')}
    ${kid ? '<div class="stat" style="margin-top:4px">Primary teeth: 55–51 · 61–65 (upper), 85–81 · 71–75 (lower); the letter is the old style (A = central incisor … E = 2nd molar), e.g. 64 = 6D.</div>' : ''}`;
}
function closeTooth(){ const pop = $('#toothPop'); if (pop) pop.classList.remove('on'); toothFor = null; }
document.addEventListener('focusin', e => { if (toothFor && e.target !== toothFor && !(e.target.closest && e.target.closest('#toothPop'))) closeTooth(); });
document.addEventListener('click', e => { if (e.target.matches && e.target.matches('input[data-teeth]')){ if (toothFor !== e.target) toothPop(e.target); return; } if (toothFor && !e.target.closest('#toothPop')) closeTooth(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && toothFor) closeTooth(); });
addEventListener('scroll', () => { if (!toothFor) return; const pop = $('#toothPop'), r = toothFor.getBoundingClientRect(); pop.style.top = (r.bottom + 6 + scrollY) + 'px'; }, true);
function toothCost(el){                 // price of the chosen treatment × number of teeth
  const row = el.closest('.srowf');
  if (row){ const o = row.querySelector('[data-sf="type"]').selectedOptions[0], c = row.querySelector('[data-sf="cost"]'), n = teethCount(row.querySelector('[data-sf="tooth"]').value);
    if (o && o.value && c){ c.value = (+o.dataset.cost || 0) * n; c.title = n > 1 ? `${inr(+o.dataset.cost || 0)} × ${n} teeth` : ''; } return; }
  if (el.closest('#clTForm')){ const o = $('#tfType').selectedOptions[0]; if (o) $('#tfCost').value = (+o.dataset.cost || 0) * teethCount($('#tfTooth').value); }
}
document.addEventListener('input', e => { if (e.target.matches && e.target.matches('input[data-teeth]')) toothCost(e.target); });
document.addEventListener('change', e => { if (e.target.matches && e.target.matches('[data-sf="type"],#tfType')) setTimeout(() => toothCost(e.target), 0); });

/* reschedule by dragging an appointment tile (mouse, pen or touch) to another time slot (day view) or another day (week view) */
{ let D = null;
  const clb = $('#clBody'), target = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('#clBody [data-slot], #clBody [data-dday]'); };
  const clear = () => document.querySelectorAll('.dropok,.achip.dragging').forEach(x => x.classList.remove('dropok', 'dragging'));
  clb.addEventListener('pointerdown', e => { if (e.button !== 0) return; const c = e.target.closest('.achip[data-drag]'); if (!c) return; D = {id:c.dataset.appt, c, x:e.clientX, y:e.clientY, on:false}; });
  document.addEventListener('pointermove', e => {
    if (!D) return;
    if (!D.on){ if (Math.hypot(e.clientX - D.x, e.clientY - D.y) < 6) return;
      D.on = true; window.__apDrag = true; D.c.classList.add('dragging'); const g = D.c.cloneNode(true); g.classList.add('dragghost'); g.classList.remove('dragging'); g.style.width = D.c.offsetWidth + 'px'; document.body.append(g); D.g = g;
      try { D.c.setPointerCapture(e.pointerId); } catch(_){} }
    e.preventDefault(); D.g.style.left = (e.clientX + 8) + 'px'; D.g.style.top = (e.clientY + 8) + 'px';
    const t = target(e.clientX, e.clientY); document.querySelectorAll('.dropok').forEach(x => x !== t && x.classList.remove('dropok')); if (t) t.classList.add('dropok');
    if (!D.sc){ let el = D.c.parentElement; while (el && el !== document.body && !(/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight)) el = el.parentElement; D.sc = el && el !== document.body ? el : document.scrollingElement; }
    const r = D.sc === document.scrollingElement ? {top:0, bottom:innerHeight} : D.sc.getBoundingClientRect();
    if (e.clientY < r.top + 60) D.sc.scrollTop -= 14; else if (e.clientY > r.bottom - 50) D.sc.scrollTop += 14;     // scroll while dragging near the edge
  });
  const end = async e => {
    if (!D) return; const d = D; D = null;
    if (!d.on) return; if (d.g) d.g.remove(); window.__apDrag = false;
    const blockClick = ev => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', blockClick, {capture:true, once:true}); setTimeout(() => document.removeEventListener('click', blockClick, true), 300);
    const t = e.type === 'pointerup' ? target(e.clientX, e.clientY) : null; clear();
    const a = (cl.appts || []).find(x => x.id === d.id); if (!t || !a) return renderClinic();
    const time = t.dataset.slot || a.time, date = t.dataset.dday || a.date;
    if (time === a.time && date === a.date) return renderClinic();
    if (date < todayKey) { info("Appointments can't be moved into the past."); return renderClinic(); }
    const clash = (cl.appts || []).find(x => x.id !== d.id && x.doctorId === a.doctorId && x.date === date && x.time === time && x.status !== 'cancelled');
    if (clash && !confirm(`${dName(a.doctorId)} already has ${clash.patientName} at ${hm12(time)}. Move anyway?`)) return renderClinic();
    const upd = {date, time, movedFrom:a.date + ' ' + a.time, movedAt:Date.now()}; if (a.status === 'missed') upd.status = 'scheduled';
    try { await cloud.F.updateDoc(cDoc('appointments', d.id), upd); Object.assign(a, upd); info(`${a.patientName} moved to ${date === todayKey ? 'today' : fmtShort(date)} ${hm12(time)}.`); }
    catch(err){ info('Could not move: ' + errText(err)); }
    renderClinic();
  };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  clb.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('.achip[data-drag]')) e.preventDefault(); });
}
$('#clBody').addEventListener('input', e => {
  const mr = e.target.closest('[data-mr]'); if (mr && e.target.matches('[data-mf]')){ medCalc(mr); const tt = $('#rxTot'); if (tt) tt.textContent = inr([...document.querySelectorAll('#rxMeds [data-mr]')].reduce((s, r) => s + parseInt((r.querySelector('b[data-mf="cost"]').textContent || '0').replace(/[^0-9]/g, '') || 0), 0)); }
  if (e.target.matches('#tlOut,#tlAdd,#tlTotal,[data-den],[data-dapp],#tlAck,#tlAckD')) tallyCalc();
  if (e.target.matches('[data-ccost]')){ clearTimeout(e.target._t); e.target._t = setTimeout(() => consSaveCost(e.target), 700); }
  if (e.target.id === 'clQ'){ cl.q = e.target.value; clearTimeout(clQTimer); clQTimer = setTimeout(clDoSearch, 250); }
  if (e.target.id === 'pfDob' && $('#pfAge')){ const a = $('#pfAge'); a.disabled = !!e.target.value; a.value = ''; a.placeholder = e.target.value ? ageOf({dob:e.target.value}) : 'if DOB unknown'; }
});
$('#clBody').addEventListener('change', async e => {
  const {F} = cloud, t = e.target;
  if (t.id === 'tfType'){ const o = t.selectedOptions[0]; if (o) $('#tfCost').value = o.dataset.cost; }
  if (t.id === 'aPick' && t.value){ cl.aDate = t.value; renderClinic(); }
  if (t.id === 'clPSort'){ cl.psort = t.value; return renderClinic(); }
  if (t.id === 'aDocF'){ cl.aDoc = t.value; renderClinic(); }
  if (t.matches('[data-dcolor]')){ try { await F.updateDoc(cDoc('doctors', t.closest('[data-doc]').dataset.doc), {color:t.value}); info('Doctor colour saved.'); } catch(err){ info(errText(err)); } return; }
  if (t.id === 'vFilter'){ cl.acc.vf = t.value; renderClinic(); }
  if (['efFrom', 'efTo', 'efSrc', 'efCat', 'efMode', 'efSt'].includes(t.id)){ const f = cl.acc.ef = cl.acc.ef || {}, k = {efFrom:'from', efTo:'to', efSrc:'src', efCat:'cat', efMode:'mode', efSt:'st'}[t.id]; f[k] = t.value;
    if (f.from && f.to && f.from > f.to) [f.from, f.to] = [f.to, f.from];
    if ((k === 'from' || k === 'to') && f.from && f.to && (f.from.slice(0, 7) < mShift(cl.acc.month, -5) || f.to.slice(0, 7) > mShift(cl.acc.month, 1))){ cl.acc.month = f.to.slice(0, 7) > todayKey.slice(0, 7) ? todayKey.slice(0, 7) : f.to.slice(0, 7); cl.acc.key = ''; }
    cl.clear = true; document.activeElement.blur(); return renderClinic(); }
  if (t.id === 'vOnly'){ cl.acc.vonly = t.value; renderClinic(); }
  if (t.id === 'stLogo' && t.files[0]){ try { const logo = await logoFromFile(t.files[0]); await F.updateDoc(cloud.F.doc(cloud.fs, 'orgs', orgCtx().orgId), {logo}); info('Logo updated.'); } catch(err){ info(errText(err)); } return; }
  if (t.id === 'tfDoc'){ const dd = cl.doctors.find(x => x.id === t.value), f = $('#tfFeeWrap'); if (f) f.hidden = !(dd && dd.type === 'consultant'); }
  if (t.matches('[data-rpgroup]')){ const o = cl.rep; o.group = t.value;
    if (o.group === 'month' && o.from.slice(0, 7) === o.to.slice(0, 7)){ o.from = todayKey.slice(0, 4) + '-01-01'; o.to = todayKey; o.preset = ''; }
    if (o.group === 'year' && o.from.slice(0, 4) === o.to.slice(0, 4)){ o.from = (+todayKey.slice(0, 4) - 4) + '-01-01'; o.to = todayKey; o.preset = ''; }
    document.activeElement.blur(); return renderClinic(); }
  if (t.matches('[data-rpmode]')){ cl.rep.mode = t.value; document.activeElement.blur(); return renderClinic(); }
  if (t.matches('[data-rpdoc]')){ cl.rep.dfil = t.value; document.activeElement.blur(); return renderClinic(); }
  try {
    if (t.matches('[data-tst]')){ await F.updateDoc(cDoc('treatments', t.closest('[data-tid]').dataset.tid), {status:t.value}); }
    if (t.id === 'stDueDay'){ const v = Math.round(+t.value || 0); if (v < 1 || v > 28) return info('Pick a day from 1 to 28.'); const m = ameta(); m.dueDay = v; await saveAMeta(m); cl.ameta = Object.assign({}, cl.ameta || {}, {dueDay:v}); info(`Payments are now due by day ${v} of the next month.`); clinicSync(true); return renderClinic(); }
    if (t.matches('[data-cmamt]')){ const m = ameta(), c = m.commitments.find(x => x.id === t.closest('[data-cm]').dataset.cm); c.amount = Math.max(0, +t.value || 0); await saveAMeta(m); info('Saved.'); }
    if (t.matches('[data-asrate]')){ const d = cl.asst.d, cur = ((d.pay || []).find(p => p.id === 'rates') || {}).rates || {}, rates = Object.assign({}, cur, {[t.closest('[data-asr]').dataset.asr]:Math.max(0, +t.value || 0)});
      await F.setDoc(cDoc('assistPay', 'rates'), {rates}); const r = (d.pay || []).find(p => p.id === 'rates'); if (r) r.rates = rates; else (d.pay = d.pay || []).push({id:'rates', rates}); info('Saved.'); document.activeElement.blur(); return renderClinic(); }
    if (t.matches('[data-aspay]')){ const d = cl.asst.d, id = 'e-' + t.closest('[data-as]').dataset.as, x = {amount:Math.max(0, +t.value || 0), at:Date.now()};
      await F.setDoc(cDoc('assistPay', id), x); const r = (d.pay || []).find(p => p.id === id); if (r) Object.assign(r, x); else (d.pay = d.pay || []).push(Object.assign({id}, x)); info('Saved.'); document.activeElement.blur(); return renderClinic(); }
    if (t.matches('[data-medprice]')){ await F.updateDoc(cDoc('medicines', t.closest('[data-med]').dataset.med), {price:Math.max(0, +t.value || 0)}); info('Saved.'); }
    if (t.matches('[data-medunit]')){ await F.updateDoc(cDoc('medicines', t.closest('[data-med]').dataset.med), {unit:t.value}); info('Saved.'); }
    if (t.matches('[data-tyneed]')){ await F.updateDoc(cDoc('treatmentTypes', t.closest('[data-ty]').dataset.ty), {needsDoc:t.value}); info('Saved.'); clinicSync(true); }
    if (t.matches('[data-doclogin]')){ const dd = cl.doctors.find(x => x.id === t.closest('[data-doc]').dataset.doc); await F.updateDoc(cDoc('doctors', dd.id), {memberUid:t.value});
      const m = (cl.members || []).find(x => x.id === t.value);
      if (m && (dd.type === 'chief') && isOwner() && !(m.perms || {}).assistApprove){ await F.updateDoc(cloud.F.doc(cloud.fs, 'orgs', orgCtx().orgId, 'members', m.id), {perms:Object.assign({}, m.perms || {}, {assistApprove:true})}); m.perms = Object.assign({}, m.perms, {assistApprove:true}); info(`Saved. ${fullName(m)} can now approve patient assists.`); }
      else info('Saved.'); }
    if (t.matches('[data-dtype]')){ await F.updateDoc(cDoc('doctors', t.closest('[data-doc]').dataset.doc), {type:t.value}); info('Saved.'); }
    if (t.matches('[data-tycost]')){ await F.updateDoc(cDoc('treatmentTypes', t.closest('[data-ty]').dataset.ty), {cost:Math.max(0, +t.value || 0)}); info('Saved.'); }
  } catch(err){ info('Could not save: ' + errText(err)); }
});
$('#clBody').addEventListener('submit', async e => {
  e.preventDefault();
  const {F} = cloud, id = e.target.id, by = cloud.user.email || '';
  try {
    if (id === 'clPForm') return clSavePatient();
    if (id === 'clTForm'){
      const ty = cl.types.find(t => t.id === $('#tfType').value); if (!ty) return info('Choose a treatment.');
      const doctorId = $('#tfDoc').value; if (!doctorId) return info('Choose the doctor who did this treatment.');
      const cost = Math.max(0, +$('#tfCost').value || 0), discount = Math.min(cost, Math.max(0, +$('#tfDisc').value || 0));
      await F.addDoc(cCol('treatments'), {patientId:cl.pid, patientName:pName(cl.p), date:$('#tfDate').value || todayKey, typeId:ty.id, typeName:ty.name, tooth:$('#tfTooth').value.trim(),
        doctorId, doctorName:dName(doctorId), cost, discount, consultantFee:(cl.doctors.find(x => x.id === doctorId) || {}).type === 'consultant' ? Math.max(0, +$('#tfFee').value || 0) : 0, status:$('#tfStatus').value, notes:$('#tfNotes').value.trim(), createdAt:Date.now(), by});
      info(`${ty.name} added for ${dName(doctorId)}.`);
    }
    if (id === 'clPayForm'){
      const amount = Math.round(+$('#pyAmt').value || 0); if (amount <= 0) return info('Enter the amount.');
      const cash = $('#pyMode').value === 'cash' ? cashRead('py', amount) : null;            // notes received + change given (daily tally, petty cash)
      const receiptNo = await nextNumber('receipt', 'R-', 5);
      const x = {patientId:cl.pid, patientName:pName(cl.p), date:$('#pyDate').value || todayKey, amount, mode:$('#pyMode').value, doctorId:$('#pyDoc').value, note:$('#pyNote').value.trim(), receiptNo, createdAt:Date.now(), by};
      if (cash) x.cash = cash;
      await savePaymentDoc(x); CDX.py = 0; cl.clear = true;
      info(`${inr(amount)} received · ${receiptNo}`); printReceipt(x);
    }
    if (id === 'clPhForm') return clUploadPhotos();
    if (id === 'clRxForm') return saveRx();
    if (id === 'clAsForm') return asSubmit();
    if (id.startsWith('acc')) return accSubmit(id, e.target);
    if (id === 'clDocForm2') return clUploadDocs();
    if (id === 'clDocForm'){
      const name = $('#dcName').value.trim(); if (!name) return info('Enter the doctor\'s name.');
      await F.addDoc(cCol('doctors'), {name, type:$('#dcType').value, specialty:$('#dcSpec').value.trim(), phone:$('#dcPhone').value.trim(), active:true, createdAt:Date.now()});
      info(`${name} added.`);
    }
    if (id === 'clMedForm'){
      const name = $('#mdName').value.trim(); if (!name) return info('Enter the medicine name.');
      if ((cl.meds || []).some(m => m.name.toLowerCase() === name.toLowerCase())) return info('That medicine is already in the list.');
      await F.addDoc(cCol('medicines'), {name, price:Math.max(0, +$('#mdPrice').value || 0), unit:$('#mdUnit').value, active:true, createdAt:Date.now()});
      info(`${name} added.`); cl.clear = true; document.activeElement.blur(); return renderClinic();
    }
    if (id === 'clTypeForm'){
      const name = $('#tyName').value.trim(); if (!name) return info('Enter the treatment name.');
      if (cl.types.some(t => t.name.toLowerCase() === name.toLowerCase())) return info('That treatment is already in the list.');
      await F.addDoc(cCol('treatmentTypes'), {name, cost:Math.max(0, +$('#tyCost').value || 0), active:true});
    }
    if (id === 'clSetForm'){
      await F.setDoc(cDoc('clinicMeta', 'settings'), {clinicName:$('#stName').value.trim(), address:$('#stAddr').value.trim(), phone:$('#stPhone').value.trim(), gstin:$('#stGst').value.trim(),
        prefix:($('#stPre').value.trim() || 'PT').toUpperCase().replace(/[^A-Z0-9]/g, ''), open:$('#stOpen').value || '09:00', close:$('#stClose').value || '21:00'}, {merge:true});
      info('Clinic details saved.');
    }
    cl.clear = true; document.activeElement.blur(); renderClinic();
  } catch(err){ info('Could not save: ' + errText(err)); }
});
$('#clBody').addEventListener('click', async e => {
  const {F} = cloud, t = e.target;
  const go = t.closest('[data-openp]'); if (go){ e.stopPropagation(); cl.sec = 'patients'; cl.ptab = 'profile'; return clOpenPatient(go.dataset.openp); }
  const pr = t.closest('[data-pid]'); if (pr){ cl.ptab = 'profile'; return clOpenPatient(pr.dataset.pid); }
  if (t.closest('#clNewP')) return clOpenPatient(null);
  if (t.closest('#clPRefresh')){ cl.allP = null; loadAllPatients(true); return renderClinic(); }
  if (t.closest('#clDelP')) return clDeletePatient();
  if (t.closest('#clBack') || t.closest('#clBack2')){ cl.pUnsub.forEach(u => { try { u(); } catch(_){} }); cl.pUnsub = []; cl.pid = null; cl.newP = false; return renderClinic(); }
  const pt = t.closest('[data-pt]'); if (pt){ cl.ptab = pt.dataset.pt; return renderClinic(); }
  const bk = t.closest('[data-book]'); if (bk){ return clOpenBook(bk.dataset.book ? {patientId:bk.dataset.book, patientName:pName(cl.p)} : {}); }
  const asf = t.closest('[data-astat]'); if (asf){ cl.aStat = cl.aStat === asf.dataset.astat ? '' : asf.dataset.astat; return renderClinic(); }
  const sl = t.closest('[data-slot]'); if (sl && t === sl) return clOpenBook({time:sl.dataset.slot});
  const ad = t.closest('[data-ad]'); if (ad){ const n = +ad.dataset.ad; cl.aDate = n ? shiftDay(cl.aDate, n * (cl.aMode === 'week' ? 7 : 1)) : todayKey; return renderClinic(); }
  const am = t.closest('[data-am]'); if (am){ cl.aMode = am.dataset.am; return renderClinic(); }
  const gd = t.closest('[data-goday]'); if (gd){ cl.aDate = gd.dataset.goday; cl.aMode = 'day'; return renderClinic(); }
  const rp = t.closest('[data-rp]'); if (rp){ const o = cl.rep; o.preset = 'today'; o.group = 'day'; [o.from, o.to] = presetRange(); return renderClinic(); }
  const rps = t.closest('[data-rpshift]'); if (rps){ const o = cl.rep, n = +rps.dataset.rpshift;
    if (o.group === 'month' || o.group === 'year'){ const step = o.group === 'year' ? 12 : Math.max(1, (+o.to.slice(0, 4) - +o.from.slice(0, 4)) * 12 + (+o.to.slice(5, 7) - +o.from.slice(5, 7)) + 1);
      const f = mShift(o.from.slice(0, 7), n * step) + '-01', e = mEnd(mShift(o.to.slice(0, 7), n * step)); o.from = f; o.to = e > todayKey ? todayKey : e; }
    else { const span = days(o.from, o.to).length || 1; o.from = shiftDay(o.from, n * span); o.to = shiftDay(o.to, n * span); if (o.to > todayKey){ o.to = todayKey; if (o.from > todayKey) o.from = todayKey; } }
    o.preset = o.from === todayKey && o.to === todayKey ? 'today' : ''; return renderClinic(); }
  if (t.closest('[data-rpgo]')){ const rg = t.closest('[data-range]'), o = cl.rep, f = rg.querySelector('[data-rf]').value, to = rg.querySelector('[data-rt]').value;
    if (!f || !to) return info('Choose both dates.'); if (f > to) return info('"From" must be on or before "To".');
    o.from = f; o.to = to > todayKey ? todayKey : to; o.preset = f === todayKey && to === todayKey ? 'today' : ''; return renderClinic(); }
  const rpv = t.closest('[data-rpv]'); if (rpv){ cl.rep.view = rpv.dataset.rpv; return renderClinic(); }
  const dr = t.closest('[data-drill]'); if (dr){ const o = cl.rep, k = dr.dataset.drill;
    if (k.length === 7){ o.from = k + '-01'; o.to = mEnd(k) > todayKey ? todayKey : mEnd(k); o.group = 'day'; }
    else { o.from = k + '-01-01'; o.to = k + '-12-31' > todayKey ? todayKey : k + '-12-31'; o.group = 'month'; }
    o.preset = ''; return renderClinic(); }
  const cmb = t.closest('[data-closem]'); if (cmb){ const pm = cmb.dataset.closem; if (!confirm(`Close the accounts for ${monthLabel(pm)}? This tells the team the month is checked and done.`)) return;
    const m = ameta(); m.closed = Object.assign({}, m.closed || {}, {[pm]:{by:cloud.uid, name:fullName(orgCtx().me) || '', at:Date.now()}});
    try { await saveAMeta(m); cl.ameta = m; info(`${monthLabel(pm)} accounts closed.`); clinicSync(true); } catch(err){ info(errText(err)); } return renderClinic(); }
  const am2 = t.closest('[data-am2]'); if (am2){ cl.acc.month = mShift(cl.acc.month, +am2.dataset.am2); return renderClinic(); }
  const at = t.closest('[data-at]'); if (at){ cl.acc.tab = at.dataset.at; cl.acc.pre = null; return renderClinic(); }
  const cm = t.closest('[data-commit]'); if (cm){ const c = ameta().commitments.find(x => x.id === cm.dataset.commit); if (c.id === 'petty') cl.acc.tab = 'petty'; else { cl.acc.tab = 'expenses'; cl.acc.exAdd = true; cl.acc.pre = {category:c.name, amount:c.amount || '', desc:`${c.name} · ${monthLabel(cl.acc.month)}`, serviceMonth:cl.acc.month}; } return renderClinic(); }
  const vb = t.closest('[data-vbill]'); if (vb){ const v = cl.acc.d.vendors.find(x => x.id === vb.closest('[data-ven]').dataset.ven); cl.acc.tab = 'expenses'; cl.acc.pre = {vendorId:v.id, category:v.type === 'Other' ? (expCats()[0] || '') : v.type, note:v.name + ' bill'}; return renderClinic(); }
  const rk = t.closest('[data-rk]'); if (rk){ cl.rep.kind = rk.dataset.rk; cl.rep.doc = ''; return renderClinic(); }
  const rd = t.closest('[data-repdoc]'); if (rd){ cl.rep.doc = rd.dataset.repdoc; const el = $('#repOut'); if (el){ el.innerHTML = clReportHtml(); numberTables(el); } return; }
  if (t.closest('[data-repcsv]') && repCsv){ download(new Blob([repCsv.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')], {type:'text/csv'}), `${slugify(orgCtx().org.name)}-${cl.rep.kind}-${cl.rep.from}-to-${cl.rep.to}.csv`); return; }
  if (t.closest('[data-repprint]')){ const el = $('#repOut').cloneNode(true); el.querySelectorAll('button,.rbar').forEach(b => b.remove()); return printDoc(el.querySelector('strong') ? el.querySelector('strong').textContent : 'Report', `<p>${esc(el.querySelector('.stat') ? el.querySelector('.stat').textContent : '')}</p>` + el.innerHTML.replace(/class="[^"]*"/g, '')); }
  const ph = t.closest('[data-ph]');
  if (ph && !t.closest('[data-phdel]')) return clViewPhoto(ph.dataset.ph);
  try {
    if (t.closest('[data-phdel]')){ if (!confirm('Delete this photo?')) return; const id = t.closest('[data-ph]').dataset.ph; await F.deleteDoc(cDoc('patients', cl.pid, 'photos', id)); await F.deleteDoc(cDoc('patients', cl.pid, 'photoData', id)); info('Photo deleted.'); }
    if (t.closest('#rxAdd')){ const box = $('#rxMeds'); box.insertAdjacentHTML('beforeend', medRow(box.children.length)); return; }
    if (t.closest('[data-mrdel]') && t.closest('#rxMeds')){ t.closest('[data-mr]').remove(); return; }
    const rxp = t.closest('[data-rxprint]'); if (rxp) return printRx(rxp.dataset.rxprint);
    const ast = t.closest('[data-astab]'); if (ast){ cl.asst.tab = ast.dataset.astab; cl.asst.person = ''; return renderClinic(); }
    const asm = t.closest('[data-asm]'); if (asm){ cl.asst.month = mShift(cl.asst.month, +asm.dataset.asm); cl.asKey = ''; return renderClinic(); }
    const asp = t.closest('[data-asperson]'); if (asp){ cl.asst.person = asp.dataset.asperson; return renderClinic(); }
    if (t.closest('[data-asok]')) return asDecide([t.closest('[data-as]').dataset.as], 'approved');
    if (t.closest('[data-asno]')) return asDecide([t.closest('[data-as]').dataset.as], 'rejected');
    const asd = t.closest('[data-asday]'); if (asd) return asDecide(cl.asst.d.all.filter(x => x.status === 'pending' && x.date === asd.dataset.asday).map(x => x.id), 'approved');
    if (t.closest('[data-asdel]')){ if (!confirm('Delete this entry?')) return; await F.deleteDoc(cDoc('assists', t.closest('[data-as]').dataset.as)); cl.asKey = ''; info('Deleted.'); return renderClinic(); }
    if (t.closest('[data-tdel]')){ if (!confirm('Delete this treatment?')) return; await F.deleteDoc(cDoc('treatments', t.closest('[data-tid]').dataset.tid)); }
    if (t.closest('[data-pdel]')){ if (!confirm('Delete this payment? Its receipt number will not be reused.')) return; const pid = t.closest('[data-pay]').dataset.pay; await deletePaymentDoc(pid, (cl.pP || []).find(p => p.id === pid)); }
    if (t.closest('[data-rcpt]')){ const x = (cl.pP || []).find(p => p.id === t.closest('[data-pay]').dataset.pay); if (x) printReceipt(x); }
    if (t.closest('[data-ldel]')){ if (!confirm('Delete this entry? A copy is kept in the audit log.')) return; const id = t.closest('[data-led]').dataset.led, d = cl.acc.d;
      let x = ((d.expAll || []).concat(d.led || [], d.pin || [], d.pout || [], d.cpay || [])).find(y => y.id === id); if (!x){ const sn = await F.getDoc(cDoc('ledger', id)); x = sn.exists() ? sn.data() : {}; }
      await auditDelete('ledger', id, x); await F.deleteDoc(cDoc('ledger', id)); cl.acc.key = ''; renderClinic(); clinicSync(true); }
    if (t.closest('[data-vact]')){ const v = cl.acc.d.vendors.find(x => x.id === t.closest('[data-ven]').dataset.ven); await F.updateDoc(cDoc('vendors', v.id), {active:v.active === false}); cl.acc.key = ''; renderClinic(); }
    if (t.closest('[data-cmdel]')){ const m = ameta(); m.commitments = m.commitments.filter(c => c.id !== t.closest('[data-cm]').dataset.cm); await saveAMeta(m); }
    if (t.closest('[data-catdel]')){ const m = ameta(); m.cats = m.cats.filter(c => c !== t.closest('[data-cat]').dataset.cat); await saveAMeta(m); }
    const cvw = t.closest('[data-cview]'); if (cvw){ cl.acc.cview = cvw.dataset.cview; return renderClinic(); }
    const cdy = t.closest('[data-cday]'); if (cdy){ cl.acc.cday = cdy.dataset.cday; return renderClinic(); }
    const cex = t.closest('[data-cexp]'); if (cex) return consExport(cex.dataset.cexp);
    const cf = t.closest('[data-cfee]'), cp = t.closest('[data-cpay]');
    if (cf || cp){
      const docId = t.closest('[data-cons]').dataset.cons, nm = dName(docId);
      const amt = Math.round(+prompt(cf ? `Consultant fee to add for ${nm} (₹):` : `Payment made to ${nm} (₹):`, cp ? cp.dataset.bal : '') || 0); if (amt <= 0) return;
      const note = prompt('Note (optional):', cf ? '' : `Payment · ${monthLabel(todayKey.slice(0, 7))}`) || '';
      await F.addDoc(cCol('ledger'), cf ? {kind:'expense', category:'Consultant fees', doctorId:docId, amount:amt, date:todayKey, mode:'cash', note, at:Date.now(), by:cloud.user.email || ''}
        : {kind:'cpayout', doctorId:docId, amount:amt, date:todayKey, mode:'bank', note, at:Date.now(), by:cloud.user.email || ''});
      info(cf ? `Fee of ${inr(amt)} added to Clinic expenses.` : `Payment of ${inr(amt)} to ${nm} recorded.`); cl.acc.key = ''; renderClinic();
    }
    const as = t.closest('[data-ast]');
    if (as){ const id = as.closest('[data-appt]').dataset.appt, upd = {status:as.dataset.ast};
      if (upd.status === 'completed'){ const a = (cl.appts || []).find(x => x.id === id); if (a) clOpenSummary(a, true); return; }
      if (upd.status === 'bill'){ const a = (cl.appts || []).find(x => x.id === id); if (a) clOpenBill(a); return; }
      if (upd.status === 'waiting') upd.checkedInAt = Date.now(); if (upd.status === 'engaged') upd.engagedAt = Date.now();
      await F.updateDoc(cDoc('appointments', id), upd); if (['missed', 'cancelled'].includes(upd.status)) clinicSync(true); return; }
    const ba = t.closest('[data-billappt]'); if (ba){ const a = (cl.pA || []).find(x => x.id === ba.closest('[data-appt]').dataset.appt); if (a) clOpenBill(a); return; }
    const sa = t.closest('[data-sumappt]'); if (sa){ const a = (cl.pA || []).find(x => x.id === sa.closest('[data-appt]').dataset.appt); if (a) clOpenSummary(a, !!sa.dataset.complete); return; }
    const dc = t.closest('[data-doc2]'); if (dc && !t.closest('[data-docdel]')){ const x = (cl.pD || []).find(y => y.id === dc.dataset.doc2); return openStoredFile(cDoc('patients', cl.pid, 'docData', dc.dataset.doc2), x ? x.kind : 'Document'); }
    if (t.closest('[data-docdel]')){ if (!confirm('Delete this document?')) return; const id = t.closest('[data-doc2]').dataset.doc2; await F.deleteDoc(cDoc('patients', cl.pid, 'docs', id)); await F.deleteDoc(cDoc('patients', cl.pid, 'docData', id)); info('Document deleted.'); return; }
    const bd = t.closest('[data-billdoc]'); if (bd) return openStoredFile(cDoc('ledgerDocs', bd.dataset.billdoc), 'Bill');
    if (t.closest('[data-billpay]')){ const id = t.closest('[data-led]').dataset.led, d = cl.acc.d, x = ((d.expAll || []).concat(d.led || [])).find(y => y.id === id) || {};
      const m = prompt('Paid how? Type: cash, upi, card, ccard (credit card), cheque, neft, rtgs or bank', 'bank'); if (m === null) return; const mode = (PMODES.find(p => p[0] === m.trim().toLowerCase()) || ['bank'])[0];
      const pd = prompt('Paid on (YYYY-MM-DD):', todayKey); if (pd === null) return; if (!/^\d{4}-\d{2}-\d{2}$/.test(pd.trim()) || pd.trim() > todayKey) return info('Enter a valid date, not in the future (e.g. ' + todayKey + ').');
      await F.updateDoc(cDoc('ledger', id), Object.assign({paid:true, paidAt:Date.now(), paidDate:pd.trim(), mode, paidBy:cloud.user.email || ''}, withHist(x, {paid:[false, true], mode, paidDate:pd.trim()})));
      info(`Marked paid on ${fmtShort(pd.trim())}.`); cl.acc.key = ''; clinicSync(true); return renderClinic(); }
    if (t.closest('[data-vfilter]')){ cl.acc.vf = t.closest('[data-ven]').dataset.ven; return renderClinic(); }
    const td = t.closest('[data-td]'); if (td){ const n = +td.dataset.td, d0 = cl.acc.tday || todayKey; cl.acc.tday = n ? shiftDay(d0, n) : todayKey; if (cl.acc.tday > todayKey) cl.acc.tday = todayKey; return renderClinic(); }
    const sp = t.closest('[data-salpay]'); if (sp){ const uid = t.closest('[data-sal]').dataset.sal, r = (cl.acc.d.staff || []).find(x => x.a.uid === uid); if (!r) return;
      const amt = Math.round(+prompt(`Salary paid to ${fullName(r.a)} for ${monthLabel(cl.acc.month)} (₹):`, sp.dataset.salpay) || 0); if (amt <= 0) return;
      const mode = (prompt('Paid how? cash, upi, bank or cheque', 'bank') || 'bank').trim().toLowerCase();
      await F.addDoc(cCol('ledger'), {kind:'expense', category:'Staff salary', staffUid:uid, staffName:fullName(r.a), salMonth:cl.acc.month, serviceMonth:cl.acc.month, dueDate:dueFor(cl.acc.month), amount:amt, date:todayKey, paidDate:todayKey, mode:(PMODES.find(p => p[0] === mode) || ['bank'])[0], paid:true, paidAt:Date.now(), note:`Salary ${monthLabel(cl.acc.month)} · ${fullName(r.a)}`, at:Date.now(), by:cloud.user.email || ''});
      info(`${inr(amt)} salary to ${fullName(r.a)} recorded as a clinic expense.`); cl.acc.key = ''; return renderClinic(); }
    const su = t.closest('[data-salundo]'); if (su){ if (!confirm('Remove the salary payment entry?')) return; for (const id of su.dataset.salundo.split(',')){ const sn = await F.getDoc(cDoc('ledger', id)); await auditDelete('ledger', id, sn.exists() ? sn.data() : {}); await F.deleteDoc(cDoc('ledger', id)); } cl.acc.key = ''; return renderClinic(); }
    if (t.closest('#efClear')){ cl.acc.ef = {}; cl.clear = true; return renderClinic(); }
    if (t.closest('#exAddBtn')){ cl.acc.exAdd = !cl.acc.exAdd; if (!cl.acc.exAdd) cl.acc.pre = null; return renderClinic(); }
    const exs = t.closest('[data-exsrc]'); if (exs){ const f = cl.acc.ef = cl.acc.ef || {}; f.src = f.src === exs.dataset.exsrc ? '' : exs.dataset.exsrc; cl.clear = true; return renderClinic(); }
    const srl = t.closest('a.srcl[data-at]'); if (srl){ e.preventDefault(); cl.acc.tab = srl.dataset.at; return renderClinic(); }
    const tlo = t.closest('[data-tlopen]'); if (tlo){ cl.acc.tOpenFix = tlo.dataset.tlopen; return renderClinic(); }
    const tdl = t.closest('[data-tldel]'); if (tdl){ if (!confirm(`Delete the saved tally for ${fmtLong(tdl.dataset.tldel)}? The day goes back to "Not tallied yet" and can be counted again.`)) return;
      { const sn = await F.getDoc(cDoc('tallies', tdl.dataset.tldel)); await auditDelete('tallies', tdl.dataset.tldel, sn.exists() ? sn.data() : {}); }
      await F.deleteDoc(cDoc('tallies', tdl.dataset.tldel)); cl.acc.key = ''; info('Tally deleted.'); clinicSync(true); return renderClinic(); }
    const tdy = t.closest('[data-tday]'); if (tdy){ cl.acc.tday = tdy.dataset.tday; return renderClinic(); }
    if (t.closest('#tlSave')) return saveTally();
    if (t.closest('#auditBtn')) return auditPack(+$('#fySel').value);
    if (t.closest('#lgUpBtn')) return $('#stLogo').click();
    const cr = t.closest('[data-cons]'); if (cr && !t.closest('button')){ cl.acc.cf = cr.dataset.cons; return renderClinic(); }
    if (t.closest('[data-edit-appt]')){ const a = (cl.appts || []).find(x => x.id === t.closest('[data-appt]').dataset.appt); if (a) clOpenBook(Object.assign({}, a)); return; }
    const ac = t.closest('.achip[data-appt]'); if (ac){ const a = (cl.appts || []).find(x => x.id === ac.dataset.appt); if (a){ cl.sec = 'patients'; cl.ptab = 'appointments'; clOpenPatient(a.patientId); } return; }
    if (t.closest('[data-docact]')){ const r = t.closest('[data-doc]'), d = cl.doctors.find(x => x.id === r.dataset.doc); await F.updateDoc(cDoc('doctors', d.id), {active:d.active === false}); }
    if (t.closest('[data-tyact]')){ const r = t.closest('[data-ty]'), ty = cl.types.find(x => x.id === r.dataset.ty); await F.updateDoc(cDoc('treatmentTypes', ty.id), {active:ty.active === false}); }
    if (t.closest('[data-medact]')){ const m = cl.meds.find(x => x.id === t.closest('[data-med]').dataset.med); await F.updateDoc(cDoc('medicines', m.id), {active:m.active === false}); }
    if (t.closest('#medSeed')){ const b = F.writeBatch(cloud.fs); DEFAULT_MEDS.forEach(([name, price, unit]) => b.set(F.doc(cCol('medicines')), {name, price, unit, active:true, createdAt:Date.now()})); await b.commit(); info('Common dental medicines added: check the prices.'); }
    if (t.closest('#tySeed')){ const b = F.writeBatch(cloud.fs); DEFAULT_TYPES.forEach(([name, cost]) => b.set(F.doc(cCol('treatmentTypes')), {name, cost, active:true})); await b.commit(); info('Common dental treatments added: edit prices as needed.'); }
  } catch(err){ info('That did not work: ' + errText(err)); }
});
/* booking overlay */
$('#clOv').addEventListener('click', e => {
  if (e.target.id === 'clOv' || e.target.closest('[data-ovclose]')){ $('#clOv').classList.remove('on'); cl.book = null; cl.sum = null; cl.bill = null; cl.cz = null; if (state.settings.view === 'clinic') renderClinic(); return; }
  if ((e.target.id === 'smNoTr' || e.target.id === 'smNoMed') && cl.sum){ $('#smTrArea').hidden = $('#smNoTr').checked; $('#smMedArea').hidden = $('#smNoMed').checked;
    const both = $('#smNoTr').checked && $('#smNoMed').checked; $('#smSkipWrap').hidden = both; if (both){ $('#smSkipDesc').checked = false; $('#smNotes').focus(); } return; }
  if (e.target.closest('#smAdd')){ const box = $('#smRows'), n = box.children.length; box.insertAdjacentHTML('beforeend', sumRow(n, cl.sum.appt)); return; }
  if (e.target.closest('[data-srdel]')){ e.target.closest('[data-sr]').remove(); return; }
  if (e.target.closest('#smMedAdd')){ const box = $('#smMeds'); box.insertAdjacentHTML('beforeend', medRow(box.children.length)); return; }
  if (e.target.closest('[data-mrdel]')){ e.target.closest('[data-mr]').remove(); const t = $('#smMedTot'); if (t) t.textContent = inr(medTotal()); return; }
  if (e.target.closest('[data-smback]')){ const S = cl.sum; cl.sum = null;
    if (S && S.back === 'bill') return clOpenBill(S.appt);
    $('#clOv').classList.remove('on'); if (S && S.completing) info(`${S.appt.patientName} is still In chair.`); if (state.settings.view === 'clinic') renderClinic(); return; }
  if (e.target.closest('[data-vbback]') && cl.bill){ const a = cl.bill.appt; cl.bill = null; return clOpenSummary(a, false, 'bill'); }
  const bm = e.target.closest('[data-bkmode]');
  if (bm && cl.book){ const keep = {doctorId:$('#bkDoc').value, date:$('#bkDate').value, time:$('#bkTime').value, reason:$('#bkReason').value}; Object.assign(cl.book, keep, {mode:bm.dataset.bkmode}); $('#clOvBody').innerHTML = clBookForm(); const f = $(cl.book.mode === 'new' ? '#npFirst' : '#bkQ'); if (f) f.focus(); return; }
  const r = e.target.closest('[data-pick]');
  if (r){ cl.book.patientId = r.dataset.pick; cl.book.patientName = r.dataset.name; const keep = {doctorId:$('#bkDoc').value, date:$('#bkDate').value, time:$('#bkTime').value, reason:$('#bkReason').value}; Object.assign(cl.book, keep); $('#clOvBody').innerHTML = clBookForm(); }
});
let bkTimer = null;
$('#clOv').addEventListener('input', e => {
  if (e.target.id !== 'bkQ') return;
  clearTimeout(bkTimer);
  bkTimer = setTimeout(async () => {
    const q = e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''), box = $('#bkRes'); if (!box) return;
    if (q.length < 2){ box.innerHTML = ''; return; }
    try { const qs = await cloud.F.getDocs(cloud.F.query(cCol('patients'), cloud.F.where('keys', 'array-contains', q), cloud.F.limit(8)));
      box.innerHTML = docsOf(qs).map(p => `<button type="button" data-pick="${esc(p.id)}" data-name="${esc(pName(p))}"><b>${esc(pName(p))}</b> <span class="stat">${esc(p.code || '')} · ${esc(p.phone || '')}</span></button>`).join('') || '<span class="stat">No match: fill in the new patient below.</span>'; }
    catch(err){ box.textContent = errText(err); }
  }, 250);
});
$('#clOv').addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'clBookForm') clSaveBook(); if (e.target.id === 'clSumForm') clSaveSummary(); });
const medEv = e => { const mr = e.target.closest('[data-mr]'); if (mr && e.target.matches('[data-mf]')){ medCalc(mr); const t = $('#smMedTot'); if (t) t.textContent = inr(medTotal()); } };
$('#clOv').addEventListener('input', medEv);
/* live totals on "What happened in this appointment?": treatments (cost − discount, planned ones not billed) + medicines */
function sumTotals(){
  const box = $('#smTotals'); if (!box) return;
  const noTr = $('#smNoTr') && $('#smNoTr').checked, noMed = $('#smNoMed') && $('#smNoMed').checked;
  const tr = noTr ? 0 : [...document.querySelectorAll('#smRows [data-sr]')].reduce((t, r) => { const g = k => r.querySelector(`[data-sf="${k}"]`);
    return g('type').value && g('status').value !== 'planned' ? t + Math.max(0, (+g('cost').value || 0) - (+g('disc').value || 0)) : t; }, 0);
  const md = noMed ? 0 : medTotal();
  box.querySelector('[data-tt=tr]').textContent = inr(tr); box.querySelector('[data-tt=md]').textContent = inr(md); box.querySelector('[data-tt=all]').textContent = inr(tr + md);
}
['input', 'change', 'click'].forEach(ev => $('#clOv').addEventListener(ev, () => setTimeout(sumTotals, 0)));
$('#clOv').addEventListener('change', e => {
  medEv(e);
  const r = e.target.closest('[data-sr]'); if (!r) return;
  if (e.target.matches('[data-sf="type"]')){ const o = e.target.selectedOptions[0]; r.querySelector('[data-sf="cost"]').value = o ? o.dataset.cost : ''; }
  if (e.target.matches('[data-sf="doc"]')){ const dd = cl.doctors.find(x => x.id === e.target.value); r.querySelector('[data-sf="fee"]').hidden = !(dd && dd.type === 'consultant'); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#clOv').classList.contains('on')){ $('#clOv').classList.remove('on'); cl.book = null; } });

/* Organization → People: clinic access editor (Account Manager) */
function clinicAccessHtml(m){
  if (!feat('clinic')) return '';
  const perms = m.perms || {};
  return `<div class="full cperm"><div class="fhead" style="margin:4px 0">Clinic access${m.role === 'orgadmin' ? ' <span class="stat">(Account Managers have full access)</span>' : ''}</div>
    <div class="btnrow"><select id="peCPre"><option value="">Apply a preset…</option>${CPRESETS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
    <div class="feats" style="margin-top:6px">${CPERMS.map(([k, l, d]) => `<label title="${esc(d)}"><input type="checkbox" data-cp="${k}"${perms[k] ? ' checked' : ''}${m.role === 'orgadmin' ? ' disabled' : ''}> ${l}</label>`).join('')}</div></div>`;
}

