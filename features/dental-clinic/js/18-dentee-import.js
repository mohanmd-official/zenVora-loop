/* ---------- Import from Dentee (Account Manager): patients, appointments, treatments, medicines, payments, doctors, price lists ----------
   Read in the browser from Dentee's Excel export and written with the Account Manager's own sign-in, so the security rules apply.
   Every record gets a fixed id ("dt-…"), so running the import again updates instead of duplicating. */
const DT = {file:null, plan:null, busy:false, done:null, cut:true};
const dtNorm = s => String(s || '').toLowerCase().replace(/\bdr\b\.?/g, '').replace(/[^a-z]/g, '');
const dtSlug = s => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'x';
const dtNum = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; };
/* Dentee exports clock times in UTC (GMT): 9:00 AM in the clinic is "3:30:00 AM" in the file.
   utc = true for real moments (appointments, receipts, registrations); plain dates (treatment date, DOB) stay as they are. */
function dtDate(s, utc){
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?/i); if (!m) return null;
  let h = +(m[4] || 0); if (m[7]){ const pm = /p/i.test(m[7]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  const mi = +(m[5] || 0), se = +(m[6] || 0);
  if (utc && (h || mi || se)) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], h, mi, se));
  return new Date(+m[3], +m[1] - 1, +m[2], h, mi, se);
}
const DT_MED = /\bmg\b|\d\s*mg|syrup|syr\.|mouth ?wash|tooth ?paste|tooth ?brush|\bgel\b|tablet|\btab\.|\bcap\.|\bwax\b|astringent|^pan\.|zerodol|ketorol|flagyl|augmentin|chymerol|enafix|novamox|ibugesic|^medicine$/i;
const dtUnit = n => /cap\.|capsule|amox|mox\b|wymox/i.test(n) ? 'Capsule' : /syr|syrup/i.test(n) ? 'Syrup (bottle)' : /mouth ?wash/i.test(n) ? 'Mouthwash (bottle)' : /gel|paste|astringent|cream|wax/i.test(n) ? 'Gel / tube' : /brush/i.test(n) ? 'Other' : 'Tablet';
function dtSheets(wb){
  const get = n => { const ws = wb.Sheets[n]; return ws ? XLSX.utils.sheet_to_json(ws, {defval:'', raw:false}) : []; };
  const S = {patients:get('Patient'), treatments:get('Treatment'), payments:get('Payments'), appts:get('Appointments'), doctors:get('Doctors'), types:get('TreatmentType'), meds:get('Medicine'), notes:get('Clinical Notes')};
  if (!S.patients.length || !('PatientCode' in S.patients[0])) throw custom('This doesn\'t look like a Dentee export: no "Patient" sheet with PatientCode.');
  return S;
}
async function dtPlan(S){
  const {F} = cloud, W = F.where;
  // existing data in Zenvora
  const exP = docsOf(await F.getDocs(cCol('patients'))), since = shiftDay(todayKey, -60);
  const recent = (await Promise.all(['payments', 'treatments', 'appointments'].map(c => F.getDocs(F.query(cCol(c), W('date', '>=', since))).then(docsOf).catch(() => [])))).flat().filter(x => !x.imported);
  const ownPast = recent.filter(x => x.date && x.date <= todayKey), firstOwn = ownPast.map(x => x.date).sort()[0] || '';
  const ownWho = [...new Set(ownPast.map(x => x.patientName).filter(Boolean))].slice(0, 4);
  const progressed = {};       // imported visits already moved on in Zenvora (checked in, completed, billed…) keep their status
  docsOf(await F.getDocs(F.query(cCol('appointments'), W('date', '>=', shiftDay(todayKey, -1))))).filter(x => x.imported && x.status !== 'scheduled').forEach(x => progressed[x.id] = x);
  const ownFuture = new Set(docsOf(await F.getDocs(F.query(cCol('appointments'), W('date', '>=', todayKey)))).filter(x => !x.imported && x.status !== 'cancelled').map(x => x.patientId + '|' + x.date));
  // doctors
  const docs = cl.doctors.slice(), docMap = {}, newDocs = [];
  const findDoc = name => { const n = dtNorm(name); if (!n) return null; return docs.find(d => { const m = dtNorm(d.name); return m && (m === n || m.startsWith(n) || n.startsWith(m)); }); };
  S.doctors.concat(S.treatments.map(t => ({DoctorName:t.DoctorName})), S.appts.map(a => ({DoctorName:a.DoctorName})), S.patients.map(p => ({DoctorName:p.DrIncharge}))).forEach(r => {
    const name = String(r.DoctorName || '').trim(); if (!name || docMap[dtNorm(name)]) return;
    let d = findDoc(name);
    if (!d){ const spec = /prostho/i.test(name) ? 'Prosthodontist' : /perio/i.test(name) ? 'Periodontist' : /ortho/i.test(name) ? 'Orthodontist' : /mds/i.test(r.Email || '') ? 'MDS' : '';
      d = {id:'dt-doc-' + dtSlug(dtNorm(name)), name:name.replace(/^dr\.?\s*/i, 'Dr. ').replace(/\s+/g, ' ').trim(), type:'consultant', specialty:spec, phone:String(r.MobileNumber || '').replace(/[^\d+]/g, ''), email:String(r.Email || '').trim(), active:true, createdAt:Date.now(), imported:true};
      newDocs.push(d); docs.push(d); }
    docMap[dtNorm(name)] = d;
  });
  const docOf = name => (docMap[dtNorm(name)] || {}).id || '';
  // treatment list & medicines
  const typeIdx = {}; cl.types.forEach(t => typeIdx[t.name.toLowerCase().trim()] = t);
  const medIdx = {}; (cl.meds || []).forEach(m => medIdx[m.name.toLowerCase().trim()] = m);
  const newTypes = [], newMeds = [], priceOf = {};
  S.types.forEach(r => { const n = String(r.TreatmentName || '').trim(); if (n) priceOf[n.toLowerCase()] = dtNum(r.Cost); });
  const typeFor = name => { const k = name.toLowerCase().trim(); if (typeIdx[k]) return typeIdx[k];
    const t = {id:'dt-type-' + dtSlug(name), name:name.trim(), cost:priceOf[k] || 0, active:true, needsDoc:'', imported:true}; typeIdx[k] = t; newTypes.push(t); return t; };
  const medFor = name => { const k = name.toLowerCase().trim(); if (medIdx[k]) return medIdx[k];
    const m = {id:'dt-med-' + dtSlug(name), name:name.trim(), price:priceOf[k] || 0, unit:dtUnit(name), active:true, createdAt:Date.now(), imported:true}; medIdx[k] = m; newMeds.push(m); return m; };
  S.types.forEach(r => { const n = String(r.TreatmentName || '').trim(); if (!n) return; DT_MED.test(n) ? medFor(n) : typeFor(n); });
  S.meds.forEach(r => { const n = String(r.MedicineName || '').trim(); if (n) medFor(n); });
  // patients: same code may be shared by two people in Dentee, so a patient is code + first name
  const pKey = (code, first) => String(code || '').trim() + '|' + String(first || '').trim().toLowerCase();
  const byCode = {}; S.patients.forEach(p => (byCode[String(p.PatientCode).trim()] = byCode[String(p.PatientCode).trim()] || []).push(p));
  const phoneIdx = {}; exP.forEach(p => { const ph = String(p.phone || '').replace(/\D/g, '').slice(-10); if (ph) (phoneIdx[ph] = phoneIdx[ph] || []).push(p); });
  const pats = [], pById = {}, linked = [];
  let maxNo = 0;
  S.patients.forEach(r => {
    const code0 = String(r.PatientCode || '').trim(), dup = byCode[code0].length > 1 ? byCode[code0].indexOf(r) : 0, code = code0.replace(/^PATIENT-/i, '') + (dup ? '-' + String.fromCharCode(65 + dup) : '');
    maxNo = Math.max(maxNo, +(code0.match(/(\d+)$/) || [0, 0])[1]);
    const reg = dtDate(r.RegistrationDate, true) || new Date(), dob = dtDate(r.DOB), ph = String(r.MobileNumber || r.PhoneNumber || '').replace(/\D/g, '');
    const g = /^f/i.test(r.Gender) ? 'Female' : /^m/i.test(r.Gender) ? 'Male' : '';
    const ex = (phoneIdx[ph.slice(-10)] || []).find(p => String(p.first || '').trim().toLowerCase().split(/\s+/)[0] === String(r.FirstName || '').trim().toLowerCase().split(/\s+/)[0]);
    const d = {title:String(r.Title || '').trim(), first:String(r.FirstName || '').trim(), last:String(r.LastName || '').trim(), gender:g, dob:dob && dob.getFullYear() > 1900 ? dayKey(dob) : '',
      phone:ph, phone2:String(r.PhoneNumber || '').replace(/\D/g, '') !== ph ? String(r.PhoneNumber || '').replace(/\D/g, '') : '', email:String(r.EmailAddress1 || '').trim().toLowerCase(),
      address:[r.AddressLine1, r.AddressLine2, r.Street, r.Area].map(x => String(x || '').trim()).filter(Boolean).join(', '), city:String(r.City || '').trim(), pincode:String(r.ZipCode || '').trim(),
      occupation:String(r.Occupation || '').trim(), allergies:String(r.MedicalAlerts || '').trim(), notes:String(r.PatientNotes || '').trim(), primaryDoctorId:docOf(r.DrIncharge), referredBy:'',
      code, createdAt:reg.getTime(), createdDay:dayKey(reg), updatedAt:reg.getTime(), createdBy:'Dentee import', imported:true, denteeCode:code0};
    if (!d.dob && dtNum(r.Age)){ d.ageYears = dtNum(r.Age); d.ageAt = Date.now(); }
    d.keys = searchKeys(d);
    const id = ex ? ex.id : 'dt-' + dtSlug(code);
    if (ex) linked.push({ex, d});
    const P = {id, d, link:!!ex}; pats.push(P); pById[pKey(code0, r.FirstName)] = P;
  });
  S.notes.forEach(n => { const P = pById[pKey(n.PatientCode, n.FirstName)]; if (P && !P.link){ const dd = dtDate(n.DateOfDiagnosis); P.d.notes = [P.d.notes, `${dd ? fmtShort(dayKey(dd)) + ': ' : ''}${[n.ChiefComplaint, n.Diagnosis, n.Notes].filter(Boolean).join(' · ')}`].filter(Boolean).join('\n'); } });
  const patOf = r => pById[pKey(r.PatientCode, r.FirstName)] || (byCode[String(r.PatientCode).trim()] ? pById[pKey(r.PatientCode, byCode[String(r.PatientCode).trim()][0].FirstName)] : null);
  const cutoff = DT.cut && firstOwn ? firstOwn : '';
  const keep = day => !cutoff || day < cutoff;
  // activity per patient per day (to tell a visit that happened from one that didn't)
  const act = new Set(); S.treatments.forEach(t => { const d = dtDate(t.TreatmentDate), P = patOf(t); if (d && P) act.add(P.id + '|' + dayKey(d)); }); S.payments.forEach(t => { const d = dtDate(t.ReceiptDate, true), P = patOf(t); if (d && P) act.add(P.id + '|' + dayKey(d)); });
  // appointments
  const appts = [], apptOf = {}; let skipped = 0;
  S.appts.forEach((r, i) => {
    const s = dtDate(r.StartDateTime, true), e = dtDate(r.EndDateTime, true), P = patOf(r); if (!s || !P) return;
    const day = dayKey(s), past = s.getTime() < Date.now(), st0 = String(r.Status || '').toLowerCase();
    if (past ? !keep(day) : ownFuture.has(P.id + '|' + day)){ skipped++; return; }     // upcoming visits are kept unless already booked in Zenvora
    const status = st0 === 'cancelled' ? 'cancelled' : st0 === 'rescheduled' ? 'cancelled' : !past ? 'scheduled' : act.has(P.id + '|' + day) ? 'completed' : 'missed';
    const reason = [st0 === 'rescheduled' ? 'Rescheduled in Dentee' : '', String(r.Comments || '').trim()].filter(Boolean).join(' · ');
    const keepA = progressed['dt-a-' + (i + 1)];
    if (keepA){ appts.push({id:keepA.id, d:Object.assign({}, keepA, {date:day, time:pad2(s.getHours()) + ':' + pad2(s.getMinutes())}), keep:true}); delete appts[appts.length - 1].d.id; if (keepA.status === 'completed' && !apptOf[P.id + '|' + day]) apptOf[P.id + '|' + day] = keepA.id; return; }
    const a = {id:'dt-a-' + (i + 1), d:{patientId:P.id, patientName:pName(P.d), doctorId:docOf(r.DoctorName), date:day, time:pad2(s.getHours()) + ':' + pad2(s.getMinutes()), duration:e ? Math.max(5, Math.round((e - s) / 60000)) : 15, reason, status, createdAt:s.getTime(), createdBy:'Dentee import', imported:true, importedAt:Date.now()}};
    appts.push(a); if (status === 'completed' && !apptOf[P.id + '|' + day]) apptOf[P.id + '|' + day] = a.id;
  });
  // treatments (Dentee's total = cost × teeth − discount)
  const tr = [];
  S.treatments.forEach((r, i) => {
    const d0 = dtDate(r.TreatmentDate), P = patOf(r); if (!d0 || !P) return;
    const day = dayKey(d0); if (!keep(day)){ skipped++; return; }
    const total = dtNum(r.TreatmentTotalCost), disc = dtNum(r.TreatmentDiscount), name = String(r.TreatmentType || '').trim() || 'Treatment', docId = docOf(r.DoctorName);
    const base = {patientId:P.id, patientName:pName(P.d), appointmentId:apptOf[P.id + '|' + day] || '', date:day, doctorId:docId, doctorName:(docs.find(x => x.id === docId) || {}).name || '', status:'completed', consultantFee:0,
      createdAt:d0.getTime(), by:'Dentee import', imported:true, docAttached:true, notes:String(r.TeethTreatmentNote || '').trim()};
    if (DT_MED.test(name)){ const m = medFor(name), up = +m.price || 0, qty = total > 0 && up > 0 && Math.abs(total / up - Math.round(total / up)) < 0.01 ? Math.round(total / up) : 1;
      tr.push({id:'dt-t-' + (i + 1), d:Object.assign(base, {kind:'medicine', medId:m.id, typeId:'', typeName:m.name, unit:m.unit || 'Tablet', dose:{}, days:0, qty, unitPrice:qty === 1 ? total : up, cost:total, discount:0, tooth:''})}); }
    else { const t = typeFor(name); tr.push({id:'dt-t-' + (i + 1), d:Object.assign(base, {typeId:t.id, typeName:t.name, tooth:normTeeth(String(r.Tooths || '').trim()), cost:total + disc, discount:disc})}); }
  });
  // payments
  const MODE = m => /cash/i.test(m) ? 'cash' : /google|gpay|paytm|phone ?pe|upi/i.test(m) ? 'upi' : /credit/i.test(m) ? 'ccard' : /card/i.test(m) ? 'card' : /cheque|check/i.test(m) ? 'cheque' : /neft/i.test(m) ? 'neft' : /rtgs/i.test(m) ? 'rtgs' : /bank|transfer|imps/i.test(m) ? 'bank' : 'cash';
  const pays = [];
  S.payments.forEach(r => {
    if (/cancel/i.test(r.ReceiptStatus || '')) return;
    const d0 = dtDate(r.ReceiptDate, true), P = patOf(r), amt = dtNum(r.ReceiptPayment); if (!d0 || !P || !amt) return;
    const day = dayKey(d0); if (!keep(day)){ skipped++; return; }
    const no = String(r.ReceiptNumber || '').trim(), inv = String(r.InvoiceNumber || '').trim();
    pays.push({id:'dt-r-' + dtSlug(no || String(d0.getTime())), d:{patientId:P.id, patientName:pName(P.d), appointmentId:apptOf[P.id + '|' + day] || '', date:day, amount:Math.round(amt), mode:MODE(r.ModeofPayment), doctorId:(pats.find(x => x === P) && P.d.primaryDoctorId) || '',
      note:`Dentee receipt ${no}${inv ? ' · bill ' + inv : ''}`, receiptNo:'DT-' + no, createdAt:d0.getTime(), by:'Dentee import', imported:true}});
  });
  const billed = tr.reduce((s, x) => s + Math.max(0, (+x.d.cost || 0) - (+x.d.discount || 0)), 0), paid = pays.reduce((s, x) => s + x.d.amount, 0);
  return {S, pats, linked, newDocs, newTypes, newMeds, appts, tr, pays, billed, paid, cutoff, firstOwn, skipped, maxNo, ownWho, ownN:ownPast.length, docMatched:Object.values(docMap).filter((d, i, a) => !d.imported && a.indexOf(d) === i)};
}
function dtBox(){
  if (!isOwner()) return '';
  const p = DT.plan, k = (l, v, s) => `<div class="kpi"><div class="kl">${l}</div><div class="kv">${v}</div><div class="ks">${s || ''}</div></div>`;
  return `<div class="box" id="dtBox" style="margin-top:12px"><h3>Import from Dentee <span class="sub">bring in patients, appointments, treatments, medicines and payments from Dentee's Excel export</span></h3>
    ${DT.busy ? `<div class="dtprog"><i style="width:${DT.busy.pct || 0}%"></i></div><p class="stat">${esc(DT.busy.msg || 'Working…')}</p>`
    : DT.done ? `<div class="nag" style="border-color:var(--done)">✓ Import finished: ${esc(DT.done)}</div><button id="dtAgain">Import another file</button>`
    : !p ? `<form class="aform" id="dtForm" novalidate><label class="grow">Dentee export (.xlsx)<input type="file" id="dtFile" accept=".xlsx,.xls"></label><button class="primary" type="submit">Check the file</button></form>
      <p class="stat" style="margin:6px 0 0">Nothing is written until you have seen the summary and pressed Import. Running it again later updates the same records instead of duplicating them. <b>Times are converted from Dentee's UTC to India time (IST).</b></p>`
    : `<div class="kpis">${k('Patients', p.pats.length, p.linked.length ? p.linked.length + ' already in Zenvora (same phone): linked, not duplicated' : 'new')}${k('Appointments', p.appts.length, p.appts.filter(a => a.d.status === 'scheduled').length + ' upcoming')}${k('Treatments', p.tr.filter(x => !x.d.kind).length, inr(p.tr.filter(x => !x.d.kind).reduce((s, x) => s + x.d.cost - x.d.discount, 0)))}${k('Medicines sold', p.tr.filter(x => x.d.kind).length, inr(p.tr.filter(x => x.d.kind).reduce((s, x) => s + x.d.cost, 0)))}${k('Payments', p.pays.length, inr(p.paid))}${k('Balance due', inr(p.billed - p.paid), 'across all imported patients')}</div>
      <div class="stat" style="line-height:1.7">
        Doctors: ${p.docMatched.map(d => `<b>${esc(d.name)}</b> (existing)`).join(', ')}${p.newDocs.length ? ` · new: ${p.newDocs.map(d => esc(d.name)).join(', ')} <i>(added as Consultants: change in the table above if needed)</i>` : ''}<br>
        Treatment list: ${p.newTypes.length} new treatments with Dentee's prices · Medicine list: ${p.newMeds.length} new medicines & products<br>
        Appointments: past ones become <b>Completed</b> when the patient had a treatment or payment that day, otherwise <b>Missed</b>; Rescheduled and Cancelled ones become <b>Cancelled</b>.<br>
        Imported treatments count as done and don't add "upload document" reminders. Patient codes stay as in Dentee (e.g. ADC00001)${p.pats.some(x => /-[A-Z]$/.test(x.d.code)) ? `; Dentee gave two people the same code, so the second one gets a letter (${p.pats.filter(x => /-[A-Z]$/.test(x.d.code)).map(x => esc(x.d.code)).join(', ')})` : ''}.
      </div>
      ${p.firstOwn ? `<div class="nag" style="margin:10px 0"><label class="ckl" style="color:var(--ink)"><input type="checkbox" id="dtCut"${DT.cut ? ' checked' : ''}> Skip Dentee records from <b>&nbsp;${esc(fmtShort(p.firstOwn))}&nbsp;</b> onwards${DT.cut && p.skipped ? ` (${p.skipped} Dentee records will be skipped)` : ''}</label>
        <div class="stat" style="margin-top:4px">Zenvora already has ${plural(p.ownN, 'record')} from ${esc(fmtShort(p.firstOwn))} (${p.ownWho.map(esc).join(', ')}${p.ownN > p.ownWho.length ? '…' : ''}). Keep this ticked only if you entered those days' real visits in Zenvora too. If they were test entries, untick it so Dentee's records for those days come in, and delete the test patients.</div></div>` : ''}
      <div class="btnrow"><button class="primary" id="dtGo">Import ${p.pats.length + p.appts.length + p.tr.length + p.pays.length} records</button><button id="dtCancel">Cancel</button><span class="stat">Uses about ${p.pats.length + p.appts.length + p.tr.length + p.pays.length + p.newTypes.length + p.newMeds.length + p.newDocs.length} of the free plan's 20,000 writes a day.</span></div>`}
  </div>`;
}
async function dtCheck(){
  const f = ($('#dtFile') || {}).files && $('#dtFile').files[0]; if (!f) return info('Choose the Dentee .xlsx file.');
  DT.busy = {pct:20, msg:'Reading the file…'}; DT.done = null; renderClinic();
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    DT.file = XLSX.read(await f.arrayBuffer(), {type:'array'});
    DT.busy = {pct:60, msg:'Comparing with what is already in Zenvora…'}; renderClinic();
    DT.plan = await dtPlan(dtSheets(DT.file));
  } catch(e){ info('Could not read the file: ' + errText(e)); DT.plan = null; }
  DT.busy = false; renderClinic();
}
async function dtImport(){
  const p = DT.plan; if (!p) return;
  const {F, fs} = cloud, ops = [];
  p.newDocs.forEach(d => { const {id, ...x} = d; ops.push(['doctors', id, x]); });
  p.newTypes.forEach(d => { const {id, ...x} = d; ops.push(['treatmentTypes', id, x]); });
  p.newMeds.forEach(d => { const {id, ...x} = d; ops.push(['medicines', id, x]); });
  p.pats.filter(x => !x.link).forEach(x => ops.push(['patients', x.id, x.d]));
  p.appts.forEach(x => ops.push(['appointments', x.id, x.d]));
  p.tr.forEach(x => ops.push(['treatments', x.id, x.d]));
  p.pays.forEach(x => ops.push(['payments', x.id, x.d]));
  DT.busy = {pct:0, msg:'Starting…'}; renderClinic();
  try {
    for (let i = 0; i < ops.length; i += 400){
      const b = F.writeBatch(fs); ops.slice(i, i + 400).forEach(([c, id, d]) => b.set(cDoc(c, id), d)); await b.commit();
      DT.busy = {pct:Math.round(Math.min(ops.length, i + 400) / ops.length * 100), msg:`Saved ${Math.min(ops.length, i + 400)} of ${ops.length} records…`}; const bx = $('#dtBox'); if (bx) bx.outerHTML = dtBox();
    }
    try { const ref = cDoc('clinicMeta', 'counter'); await F.runTransaction(fs, async tx => { const s2 = await tx.get(ref), cur = (s2.exists() && s2.data().patient) || 0; if (cur < p.maxNo) tx.set(ref, {patient:p.maxNo}, {merge:true}); }); } catch(e){}
    cl.allP = null;
    DT.done = `${p.pats.length} patients (${p.linked.length} linked to existing), ${p.appts.length} appointments, ${p.tr.length} treatments & medicines, ${p.pays.length} payments.`;
    DT.plan = null; DT.file = null; info('Dentee data imported.'); clinicSync(true);
  } catch(e){ info('Import stopped: ' + errText(e) + '. Press Import again: it continues safely.'); }
  DT.busy = false; renderClinic();
}
document.addEventListener('submit', e => { if (e.target.id === 'dtForm'){ e.preventDefault(); e.stopPropagation(); dtCheck(); } }, true);
document.addEventListener('click', async e => {
  if (e.target.closest('#dtGo')) return dtImport();
  if (e.target.closest('#dtCancel') || e.target.closest('#dtAgain')){ DT.plan = null; DT.done = null; return renderClinic(); }
});
document.addEventListener('change', async e => { if (e.target.id === 'dtCut' && DT.file){ DT.cut = e.target.checked; DT.busy = {pct:50, msg:'Updating the summary…'}; renderClinic(); DT.plan = await dtPlan(dtSheets(DT.file)); DT.busy = false; renderClinic(); } });

