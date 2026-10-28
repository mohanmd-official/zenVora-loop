/* ---------- Patient record ---------- */
function clOpenPatient(pid){
  cl.pUnsub.forEach(u => { try { u(); } catch(e){} }); cl.pUnsub = [];
  Object.assign(cl, {pid, newP:!pid, p:null, pT:null, pP:null, pA:null, pPh:null, edit:{}});
  if (pid && !['profile', 'treatments', 'rx', 'billing', 'appointments', 'docs', 'photos', 'history'].includes(cl.ptab)) cl.ptab = 'profile';
  cl.pD = null;
  if (!pid){ cl.ptab = 'profile'; return renderClinic(); }
  const {F} = cloud, again = () => { if (state.settings.view === 'clinic' && cl.pid === pid) renderClinic(); };
  cl.pUnsub.push(F.onSnapshot(cDoc('patients', pid), s => { cl.p = s.exists() ? Object.assign({id:pid}, s.data()) : {missing:true}; again(); }, e => info(errText(e))));
  if (can('treatments') || can('billing')) cl.pUnsub.push(F.onSnapshot(F.query(cCol('treatments'), F.where('patientId', '==', pid)), qs => { cl.pT = docsOf(qs); again(); }, () => { cl.pT = []; }));
  if (can('billing')) cl.pUnsub.push(F.onSnapshot(F.query(cCol('payments'), F.where('patientId', '==', pid)), qs => { cl.pP = docsOf(qs); again(); }, () => { cl.pP = []; }));
  if (can('appointments') || can('treatments')) cl.pUnsub.push(F.onSnapshot(F.query(cCol('appointments'), F.where('patientId', '==', pid)), qs => { cl.pA = docsOf(qs); again(); }, () => { cl.pA = []; }));
  if (can('patients') || can('treatments')) cl.pUnsub.push(F.onSnapshot(cCol('patients', pid, 'docs'), qs => { cl.pD = docsOf(qs); again(); }, () => { cl.pD = []; }));
  if (can('treatments')) cl.pUnsub.push(F.onSnapshot(cCol('patients', pid, 'photos'), qs => { cl.pPh = docsOf(qs); again(); }, () => { cl.pPh = []; }));
  renderClinic();
}
const docOpts = (sel, blank) => (blank ? `<option value="">${blank}</option>` : '') + cl.doctors.filter(d => d.active !== false || d.id === sel).map(d => `<option value="${esc(d.id)}"${d.id === sel ? ' selected' : ''}>${esc(d.name)}${d.type === 'consultant' ? ' (consultant)' : ''}</option>`).join('');
function clPatient(){
  if (cl.newP) return `<button class="abk" id="clBack">← Patients</button><div class="box"><h3>New patient</h3>${clProfileForm({gender:'', title:''})}</div>`;
  const p = cl.p;
  if (!p) return '<button class="abk" id="clBack">← Patients</button><div class="empty">Loading…</div>';
  if (p.missing) return '<button class="abk" id="clBack">← Patients</button><div class="empty">This patient no longer exists.</div>';
  const T = cl.pT || [], P = cl.pP || [], bill = billed(T), paid = paidSum(P);
  const docs = [...new Set([p.primaryDoctorId].concat(T.map(t => t.doctorId), (cl.pA || []).filter(a => a.status !== 'cancelled').map(a => a.doctorId)).filter(Boolean))];
  const tabs = [['profile', 'Profile', true], ['treatments', 'Treatments', can('treatments') || can('billing')], ['rx', 'Tablets / prescriptions', can('treatments') || can('billing')], ['billing', 'Billing', can('billing')], ['appointments', 'Visits & summaries', can('appointments') || can('treatments')], ['docs', 'Documents', can('patients') || can('treatments')],
    ['photos', 'Pre / post-op photos', can('treatments')], ['history', 'History', true]].filter(t => t[2]);
  if (!tabs.some(t => t[0] === cl.ptab)) cl.ptab = 'profile';
  const body = ({profile:() => clProfileForm(p), treatments:clTreatments, rx:clRx, billing:clBilling, appointments:clPAppts, docs:clDocs, photos:clPhotos, history:clHistory})[cl.ptab]();
  return `<button class="abk" id="clBack">← Patients</button>
    <div class="phead">
      <div class="uav" style="width:46px;height:46px;font-size:19px">${initial(p.first)}</div>
      <div class="pinfo"><div><b>${esc(pName(p))}</b> <span class="pcode">${esc(p.code || '')}</span></div>
        <div class="stat">${esc([p.gender, ageOf(p), p.phone, p.bloodGroup && 'Blood ' + p.bloodGroup].filter(Boolean).join(' · '))}</div>
        <div class="stat">Doctors: ${docs.length ? docs.map(id => `<span class="fchip on">${esc(dName(id) || 'Unknown')}${id === p.primaryDoctorId ? ' · primary' : ''}</span>`).join(' ') : '—'}</div>
        ${p.allergies ? `<div class="alert">⚠ Allergies / alerts: ${esc(p.allergies)}</div>` : ''}</div>
      ${can('billing') ? `<div class="pmoney"><div><span>Treatment cost</span><b>${inr(bill)}</b></div><div><span>Paid</span><b>${inr(paid)}</b></div><div><span>Balance</span><b class="${bill - paid > 0 ? 'neg' : ''}">${inr(bill - paid)}</b></div></div>` : ''}
    </div>
    <div class="htabs" data-ord="ptab" data-ordattr="pt" title="Drag a tab to put it where you like">${ordered('ptab', tabs).map(([k, l]) => `<a draggable="true" data-pt="${k}" href="#/clinic/patients/${esc(cl.pid)}/${k}" class="${k === cl.ptab ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div style="margin-top:10px">${body}</div>`;
}
function clProfileForm(p){
  const ro = !canW('patients');
  const f = (id, label, v, type = 'text', extra = '') => `<label>${label}<input id="${id}" type="${type}" value="${esc(v ?? '')}"${ro ? ' disabled' : ''} ${extra}></label>`;
  const sel = (id, label, v, opts) => `<label>${label}<select id="${id}"${ro ? ' disabled' : ''}>${opts.map(o => `<option${o === (v || '') ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  return `<form class="aform pform" id="clPForm" novalidate>
    <div class="fhead">Personal details</div>
    ${sel('pfTitle', 'Title', p.title, ['', 'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Master', 'Baby', 'Dr.'])}
    ${f('pfFirst', 'First name *', p.first)}${f('pfLast', 'Last name', p.last)}
    ${sel('pfGender', 'Gender', p.gender, ['', 'Female', 'Male', 'Other'])}
    ${f('pfDob', 'Date of birth', p.dob, 'date', `max="${todayKey}"`)}
    <label>Age<input id="pfAge" type="number" min="0" max="120" placeholder="${esc(ageOf(p) || 'if DOB unknown')}" value="${p.dob ? '' : esc(p.ageYears || '')}"${ro || p.dob ? ' disabled' : ''} title="Worked out from the date of birth. Type an age only if the date of birth isn't known."></label>
    ${sel('pfBlood', 'Blood group', p.bloodGroup, ['', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'])}
    ${f('pfOcc', 'Occupation', p.occupation)}
    <div class="fhead">Contact</div>
    ${f('pfPhone', 'Mobile *', p.phone, 'tel')}${f('pfPhone2', 'Alternate phone', p.phone2, 'tel')}${f('pfEmail', 'Email', p.email, 'email')}
    <label class="grow">Address<input id="pfAddr" value="${esc(p.address || '')}"${ro ? ' disabled' : ''}></label>
    ${f('pfCity', 'City', p.city)}${f('pfPin', 'PIN code', p.pincode)}
    <div class="fhead">Clinical</div>
    <label>Primary doctor<select id="pfDoc"${ro ? ' disabled' : ''}>${docOpts(p.primaryDoctorId, '— Select —')}</select></label>
    ${f('pfRef', 'Referred by', p.referredBy)}
    <label class="grow">Allergies / medical alerts<input id="pfAll" value="${esc(p.allergies || '')}" placeholder="e.g. Penicillin, diabetic, on blood thinners"${ro ? ' disabled' : ''}></label>
    <label class="grow full">Medical history &amp; notes<textarea id="pfNotes" rows="3"${ro ? ' disabled' : ''}>${esc(p.notes || '')}</textarea></label>
    ${ro ? '' : `<div class="btnrow full"><button class="primary" type="submit">${p.id ? 'Save changes' : 'Register patient'}</button>${p.id ? '' : '<button type="button" id="clBack2">Cancel</button>'}${p.id && isOwner() ? '<span class="sp"></span><button type="button" class="danger" id="clDelP">Delete patient…</button>' : ''}</div>`}
  </form>`;
}
async function clDeletePatient(){
  const {F, fs} = cloud, p = cl.p, pid = cl.pid; if (!p || !pid || !isOwner()) return;
  const W = F.where, q = c => F.getDocs(F.query(cCol(c), W('patientId', '==', pid))).then(qs => qs.docs.map(d => d.id));
  let T, P, A, sub;
  info('Checking what will be deleted…');
  try { [T, P, A] = await Promise.all([q('treatments'), q('payments'), q('appointments')]);
    sub = (await Promise.all(['docs', 'docData', 'photos', 'photoData'].map(c => F.getDocs(cCol('patients', pid, c)).then(qs => qs.docs.map(d => ['patients', pid, c, d.id]))))).flat(); }
  catch(e){ return info('Could not check: ' + errText(e)); }
  const tot = billed(cl.pT || []), paid = paidSum(cl.pP || []);
  if (!confirm(`Delete ${pName(p)} (${p.code || ''}) permanently?\n\nThis also deletes ${plural(T.length, 'treatment')} (${inr(tot)}), ${plural(P.length, 'payment')} (${inr(paid)}), ${plural(A.length, 'appointment')} and ${plural(sub.length / 2 || 0, 'document / photo')}. Reports, collections and balances will no longer include them.\n\nThis cannot be undone.`)) return;
  if (!confirm(`Last check: delete ${pName(p)} and all their records?`)) return;
  info(`Deleting ${pName(p)} and ${plural(T.length + P.length + A.length, 'record')}…`);
  const refs = [...T.map(id => cDoc('treatments', id)), ...P.map(id => cDoc('payments', id)), ...A.map(id => cDoc('appointments', id)), ...sub.map(x => cDoc(...x)), cDoc('patients', pid)];
  try {
    cl.pUnsub.forEach(u => { try { u(); } catch(_){} }); cl.pUnsub = [];
    for (let i = 0; i < refs.length; i += 400){ const b = F.writeBatch(fs); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit(); }
    if (cl.allP) cl.allP = cl.allP.filter(x => x.id !== pid);
    cl.pid = null; cl.p = null; info(`${pName(p)} and all their records were deleted.`); cl.acc.key = ''; cl.rep.key = ''; clinicSync(true); renderClinic();
  } catch(e){ info('Could not delete everything: ' + errText(e) + '. Press Delete again to finish.'); }
}
async function clSavePatient(){
  const {F} = cloud, v = id => ($('#' + id) || {}).value || '';
  const d = {title:v('pfTitle'), first:v('pfFirst').trim(), last:v('pfLast').trim(), gender:v('pfGender'), dob:v('pfDob'), bloodGroup:v('pfBlood'), occupation:v('pfOcc').trim(),
    phone:v('pfPhone').replace(/[^\d+]/g, ''), phone2:v('pfPhone2').replace(/[^\d+]/g, ''), email:v('pfEmail').trim().toLowerCase(), address:v('pfAddr').trim(), city:v('pfCity').trim(), pincode:v('pfPin').trim(),
    primaryDoctorId:v('pfDoc'), referredBy:v('pfRef').trim(), allergies:v('pfAll').trim(), notes:v('pfNotes').trim(), updatedAt:Date.now()};
  if (!d.first) return info('Enter the first name.');
  if (!/^\+?\d{7,15}$/.test(d.phone)) return info('Enter a valid mobile number.');
  if (d.dob){ d.ageYears = null; d.ageAt = null; } else if (v('pfAge')){ d.ageYears = +v('pfAge'); d.ageAt = Date.now(); }
  try {
    if (cl.pid){ d.keys = searchKeys(Object.assign({}, cl.p, d)); await F.updateDoc(cDoc('patients', cl.pid), d); info('Saved.'); cl.clear = true; document.activeElement.blur(); renderClinic(); }
    else {
      const dup = await F.getDocs(F.query(cCol('patients'), F.where('keys', 'array-contains', d.phone.replace(/\D/g, '')), F.limit(3)));
      if (!dup.empty && !confirm(`${dup.docs.map(x => pName(x.data())).join(', ')} already has this phone number. Register a new patient anyway?`)) return;
      d.code = await newPatientCode();
      d.keys = searchKeys(d); d.createdAt = Date.now(); d.createdDay = todayKey; d.createdBy = cloud.user.email || '';
      const ref = await F.addDoc(cCol('patients'), d);
      info(`${pName(d)} registered as ${d.code}.`); cl.newP = false; document.activeElement.blur(); clOpenPatient(ref.id);
    }
  } catch(e){ info('Could not save: ' + errText(e)); }
}

/* treatments (each one records the doctor who did it) */
function clTreatments(){
  const T = (cl.pT || []).filter(t => !isMed(t)).sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0));
  const w = canW('treatments'), money = can('billing') || can('treatments');
  const types = cl.types.filter(t => t.active !== false);
  const lastAppt = (cl.pA || []).filter(a => a.date <= todayKey && a.status !== 'cancelled').sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time)))[0];
  const defDoc = (lastAppt && lastAppt.doctorId) || cl.p.primaryDoctorId || '';
  const add = w ? `<div class="box"><h3>Add treatment <span class="sub">the doctor chosen here is credited in reports</span></h3>
    <form class="aform" id="clTForm" novalidate>
      <label>Date<input type="date" id="tfDate" value="${todayKey}"></label>
      <label class="grow">Treatment<select id="tfType" class="srch">${types.map(t => `<option value="${esc(t.id)}" data-cost="${+t.cost || 0}">${esc(t.name)}</option>`).join('')}</select></label>
      <label>Tooth / area<input id="tfTooth" data-teeth autocomplete="off" placeholder="🦷 click to pick" style="min-width:120px"></label>
      <label>Doctor<select id="tfDoc">${docOpts(defDoc, '— Select —')}</select></label>
      <label id="tfFeeWrap"${(cl.doctors.find(x => x.id === defDoc) || {}).type === 'consultant' ? '' : ' hidden'}>Consultant fee (₹)<input type="number" id="tfFee" min="0" step="50" placeholder="paid to consultant"></label>
      <label>Cost (₹)<input type="number" id="tfCost" min="0" step="50" value="${types[0] ? +types[0].cost || 0 : ''}"></label>
      <label>Discount (₹)<input type="number" id="tfDisc" min="0" step="50" value="0"></label>
      <label>Status<select id="tfStatus"><option value="planned">Planned</option><option value="progress">In progress</option><option value="completed" selected>Completed</option></select></label>
      <label class="grow">Notes<input id="tfNotes" placeholder="clinical notes"></label>
      <button class="primary" type="submit">Add</button>
    </form>${types.length ? '' : '<p class="stat">Add your treatment list first in Clinic setup.</p>'}</div>` : '';
  let html = '', day = null;
  T.forEach(t => {
    if (t.date !== day){ day = t.date; html += `<tr class="wk"><td colspan="${w ? 7 : 6}">${esc(fmtShort(t.date))} · ${esc([...new Set(T.filter(x => x.date === day).map(x => dName(x.doctorId) || x.doctorName))].join(', '))}</td></tr>`; }
    html += `<tr data-tid="${esc(t.id)}"><td><b>${esc(t.typeName)}</b>${t.tooth ? `<span class="sub2">Tooth / area: ${esc(t.tooth)}</span>` : ''}${t.notes ? `<span class="sub2">${esc(t.notes)}</span>` : ''}</td>
      <td>${esc(dName(t.doctorId) || t.doctorName || '—')}${+t.consultantFee && money ? `<span class="sub2">consultant fee ${inr(t.consultantFee)}</span>` : ''}</td>
      ${money ? `<td class="num">${inr(t.cost)}</td><td class="num">${+t.discount ? inr(t.discount) : '—'}</td><td class="num"><b>${inr(net(t))}</b></td>` : '<td></td><td></td><td></td>'}
      <td>${w ? `<select data-tst class="tst ${t.status}">${Object.entries(TSTATUS).map(([k, [l]]) => `<option value="${k}"${k === t.status ? ' selected' : ''}>${l}</option>`).join('')}</select>` : `<span class="upill ${TSTATUS[t.status][1]}">${TSTATUS[t.status][0]}</span>`}</td>
      ${w ? '<td><button class="danger" data-tdel title="Delete">✕</button></td>' : ''}</tr>`;
  });
  return `<div class="sect">${add}
    <div class="awrap" style="margin-top:0"><table class="atbl"><thead><tr><th>Treatment</th><th>Doctor</th><th class="num">Cost</th><th class="num">Discount</th><th class="num">Net</th><th>Status</th>${w ? '<th></th>' : ''}</tr></thead>
    <tbody>${cl.pT === null ? '<tr><td colspan="7">Loading…</td></tr>' : html || '<tr><td colspan="7" class="stat">No treatments yet.</td></tr>'}</tbody></table></div>
    <p class="stat">Planned treatments aren't billed. In-progress and completed treatments count towards the patient's balance; completed ones count as earnings in reports.</p></div>`;
}
/* tablets / prescriptions */
function clRx(){
  const M = (cl.pT || []).filter(isMed).sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0)), w = canW('treatments'), money = can('billing') || can('treatments');
  const groups = []; M.forEach(m => { const k = m.date + '|' + (m.appointmentId || ''); let g = groups.find(x => x.k === k); if (!g) groups.push(g = {k, date:m.date, appt:m.appointmentId, doc:m.doctorId, items:[]}); g.items.push(m); });
  const lastAppt = (cl.pA || []).filter(a => a.date <= todayKey && a.status !== 'cancelled').sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time)))[0];
  return `<div class="sect">
    ${w ? `<div class="box"><h3>Add tablets / medicines <span class="sub">tick Morning / Afternoon / Evening / Night and the days: tablets and cost are worked out and billed</span></h3>
      <form id="clRxForm" novalidate>
        <div class="aform" style="margin-bottom:8px"><label>Date<input type="date" id="rxDate" value="${todayKey}" max="${todayKey}"></label><label>Doctor<select id="rxDoc">${docOpts((lastAppt && lastAppt.doctorId) || cl.p.primaryDoctorId || '', '— Select —')}</select></label></div>
        <div id="rxMeds">${medRow(0)}</div>
        <div class="btnrow"><button type="button" id="rxAdd">+ Another medicine</button><span class="sp"></span><span class="stat">Total <b id="rxTot">₹0</b></span><button class="primary" type="submit">Save</button></div>
      </form>${(cl.meds || []).filter(x => x.active !== false).length ? '' : '<p class="stat">Add your medicine price list in Clinic setup first.</p>'}</div>` : ''}
    ${cl.pT === null ? '<div class="empty">Loading…</div>' : groups.length ? groups.map(g => `<div class="box rxg"><div class="crow"><b>${esc(fmtLong(g.date))}</b><span class="stat">${esc(dName(g.doc) || '')}</span><span class="sp"></span><button data-rxprint="${esc(g.k)}">🖨 Print prescription</button></div>
      <div class="awrap" style="margin-top:6px"><table class="atbl"><thead><tr><th>Medicine</th><th>When</th><th class="num">Days</th><th class="num">Qty</th>${money ? '<th class="num">Price</th><th class="num">Amount</th>' : ''}${w ? '<th></th>' : ''}</tr></thead><tbody>
      ${g.items.map(m => `<tr data-tid="${esc(m.id)}"><td><b>${esc(m.typeName)}</b></td><td>${medDose(m)}</td><td class="num">${+m.days || '—'}</td><td class="num">${+m.qty || 0}</td>${money ? `<td class="num">${inr(m.unitPrice)}</td><td class="num"><b>${inr(m.cost)}</b></td>` : ''}${w ? '<td><button class="danger" data-tdel title="Delete">✕</button></td>' : ''}</tr>`).join('')}
      </tbody></table></div></div>`).join('') : '<div class="empty">No tablets or medicines prescribed yet.</div>'}</div>`;
}
function printRx(k){
  const M = (cl.pT || []).filter(m => isMed(m) && m.date + '|' + (m.appointmentId || '') === k), p = cl.p; if (!M.length) return;
  printDoc('Prescription', `<p><b>Patient:</b> ${esc(pName(p))} (${esc(p.code || '')}) · ${esc([p.gender, ageOf(p)].filter(Boolean).join(', '))}<br><b>Date:</b> ${esc(fmtLong(M[0].date))} · <b>Doctor:</b> ${esc(dName(M[0].doctorId) || '')}</p>
    <h2>℞</h2><table><tr><th>#</th><th>Medicine</th><th>Morning – Afternoon – Evening – Night</th><th class="n">Days</th><th class="n">Qty</th></tr>
    ${M.map((m, i) => `<tr><td>${i + 1}</td><td>${esc(m.typeName)}</td><td>${esc(doseTxt(m.dose))}</td><td class="n">${+m.days || ''}</td><td class="n">${+m.qty || ''}</td></tr>`).join('')}</table>
    ${p.allergies ? `<p><b>Allergies:</b> ${esc(p.allergies)}</p>` : ''}<p style="margin-top:40px">Doctor's signature: ______________________</p>`);
}
async function saveRx(){
  const {F} = cloud, doctorId = $('#rxDoc').value, date = $('#rxDate').value || todayKey, by = cloud.user.email || '', now = Date.now();
  if (!doctorId) return info('Choose the doctor who prescribed these.');
  const rows = [...document.querySelectorAll('#rxMeds [data-mr]')].map(r => { const g = k => r.querySelector(`[data-mf="${k}"]`), o = g('med').selectedOptions[0];
    return {medId:g('med').value, dose:Object.fromEntries(DOSE.map(([k]) => [k, g(k).checked])), days:Math.max(0, +g('days').value || 0), qty:Math.max(0, +g('qty').value || 0), price:o && o.value ? +o.dataset.price || 0 : 0, unit:o && o.value ? o.dataset.unit || '' : ''}; }).filter(m => m.medId);
  if (!rows.length) return info('Choose a medicine.');
  if (rows.some(m => !m.qty)) return info('For each medicine, tick when to take it and enter the number of days.');
  try {
    for (const m of rows){ const md = (cl.meds || []).find(x => x.id === m.medId) || {name:''};
      await F.addDoc(cCol('treatments'), {kind:'medicine', patientId:cl.pid, patientName:pName(cl.p), appointmentId:'', date, medId:m.medId, typeId:'', typeName:md.name, unit:m.unit, dose:m.dose, days:m.days, qty:m.qty, unitPrice:m.price, cost:Math.round(m.qty * m.price), discount:0, status:'completed', doctorId, doctorName:dName(doctorId), consultantFee:0, tooth:'', notes:'', createdAt:now, by}); }
    info(`${plural(rows.length, 'medicine')} added to the bill.`); cl.clear = true; document.activeElement.blur(); renderClinic();
  } catch(e){ info('Could not save: ' + errText(e)); }
}
/* billing */
function clBilling(){
  const P = (cl.pP || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0));
  const bal = billed(cl.pT) - paidSum(cl.pP), w = canW('billing');
  return `<div class="sect">${w ? `<div class="box"><h3>Take a payment</h3>
    <form class="aform" id="clPayForm" novalidate>
      <label>Bill date<input type="date" id="pyDate" value="${todayKey}" max="${todayKey}" title="The day this payment is counted in collections and the daily tally"></label>
      <label>Amount (₹)<input type="number" id="pyAmt" min="1" step="1" value="${bal > 0 ? bal : ''}"></label>
      <label>Mode<select id="pyMode">${PMODES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label>Towards doctor<select id="pyDoc">${docOpts(cl.p.primaryDoctorId, '— Clinic —')}</select></label>
      <label class="grow">Note<input id="pyNote" placeholder="e.g. RCT first sitting"></label>
      <button class="primary" type="submit">Save &amp; receipt</button>
      ${cashPanel('py', true)}
    </form></div>` : ''}
    <div class="awrap" style="margin-top:0"><table class="atbl"><thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${cl.pP === null ? '<tr><td colspan="6">Loading…</td></tr>' : P.map(x => `<tr data-pay="${esc(x.id)}"><td>${esc(x.receiptNo || '')}</td><td>${esc(fmtShort(x.date))}</td><td>${esc((PMODES.find(m => m[0] === x.mode) || [0, x.mode])[1])}</td><td>${esc(x.note || '')}</td><td class="num"><b>${inr(x.amount)}</b></td>
        <td><div class="uact"><button data-rcpt>🖨 Receipt</button>${w ? '<button class="danger" data-pdel>✕</button>' : ''}</div></td></tr>`).join('') || '<tr><td colspan="6" class="stat">No payments yet.</td></tr>'}
    </tbody></table></div></div>`;
}
function printDoc(title, inner){
  const w = window.open('', '_blank', 'width=820,height=900'); if (!w) return info('Allow pop-ups to print.');
  const s = cl.settings, org = orgCtx().org;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font:13px/1.5 -apple-system,Segoe UI,Inter,sans-serif;color:#111;margin:32px}h1{font-size:20px;margin:0}h2{font-size:15px;margin:18px 0 6px}
    .hd{display:flex;justify-content:space-between;border-bottom:2px solid ${esc(org.color || '#3730A3')};padding-bottom:10px;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd}td.n,th.n{text-align:right}
    .tot td{font-weight:700;border-top:2px solid #111}.muted{color:#666;font-size:12px}@media print{button{display:none}}</style></head><body>
    <div class="hd"><div style="display:flex;gap:12px;align-items:center">${org.logo ? `<img src="${org.logo}" style="height:46px">` : ''}<div><h1>${esc(s.clinicName || org.name)}</h1><div class="muted">${esc([s.address, s.phone, s.gstin && 'GSTIN ' + s.gstin].filter(Boolean).join(' · '))}</div></div></div><div style="text-align:right"><b>${esc(title)}</b><div class="muted">Printed ${esc(new Date().toLocaleString())}</div></div></div>
    ${inner}<p class="muted" style="margin-top:28px">Generated with Zenvora Loop</p><button onclick="print()">Print</button></body></html>`);
  w.document.close(); setTimeout(() => { try { w.print(); } catch(e){} }, 300);
}
function printReceipt(x, c){
  const p = (c && c.p) || cl.p, PT = (c && c.T) || cl.pT, P0 = (c && c.P) || cl.pP || [], P = P0.some(y => y.receiptNo === x.receiptNo) ? P0 : P0.concat([x]);
  printDoc('Payment receipt ' + (x.receiptNo || ''), `<p><b>Received from:</b> ${esc(pName(p))} (${esc(p.code || '')}) · ${esc(p.phone || '')}<br><b>Date:</b> ${esc(fmtLong(x.date))}<br><b>Mode:</b> ${esc((PMODES.find(m => m[0] === x.mode) || [0, x.mode])[1])}${x.doctorId ? `<br><b>Doctor:</b> ${esc(dName(x.doctorId))}` : ''}</p>
    <table><tr><th>Description</th><th class="n">Amount</th></tr><tr><td>${esc(x.note || 'Dental treatment')}</td><td class="n">${inr(x.amount)}</td></tr><tr class="tot"><td>Total received</td><td class="n">${inr(x.amount)}</td></tr></table>${x.cash ? `<p class="muted">Cash: ${esc(cashLine(x))}</p>` : ''}
    <p class="muted">Treatment cost to date ${inr(billed(PT))} · paid ${inr(paidSum(P))} · balance ${inr(billed(PT) - paidSum(P))}</p>`);
}
/* patient's appointments */
function clPAppts(){
  const A = (cl.pA || []).slice().sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time))), w = canW('appointments') || canW('treatments');
  return `<div class="sect">${canW('appointments') ? `<div class="btnrow"><button class="primary" data-book="${esc(cl.pid)}">+ Book appointment</button></div>` : ''}
    ${cl.pA === null ? '<div class="empty">Loading…</div>' : A.map(a => `<div class="visit ${a.status}" data-appt="${esc(a.id)}">
      <div class="vhead"><b>${esc(fmtShort(a.date))} · ${esc(hm12(a.time))}</b><span class="stat">${esc(dName(a.doctorId) || '—')}${a.reason ? ' · ' + esc(a.reason) : ''}</span><span class="ast ${a.status}">${ASTATUS[a.status]}</span><span class="sp"></span>
        ${w && a.status === 'engaged' ? '<button class="primary" data-sumappt data-complete="1">Complete visit</button>' : ''}
        ${a.status === 'billing' && can('billing') ? '<button class="primary" data-billappt>Bill & print</button>' : ''}
        ${w && a.status === 'completed' && (a.summaryPending || !a.summary) ? '<button class="primary" data-sumappt>Add treatment summary</button>' : ''}
        ${w && a.status === 'completed' && a.summary ? '<button data-sumappt>Edit summary</button>' : ''}</div>
      ${a.summary ? `<div class="vnote">${esc(a.summary.notes).replace(/\n/g, '<br>')}<span class="stat">— ${esc((a.summary.by || '').split('@')[0])}, ${esc(fmt(a.summary.at))}</span></div>` : a.summaryPending ? '<div class="vnote pend">Summary skipped: it is on the Planning Board until someone adds it.</div>' : ''}
      ${(cl.pT || []).some(t => t.appointmentId === a.id) ? `<div class="fchips">${(cl.pT || []).filter(t => t.appointmentId === a.id).map(t => `<span class="fchip on">${esc(t.typeName)}${t.tooth ? ' (' + esc(t.tooth) + ')' : ''} · ${esc(dName(t.doctorId))}</span>`).join('')}</div>` : ''}
    </div>`).join('') || '<div class="empty">No visits yet. Book an appointment to start.</div>'}</div>`;
}
/* pre-op / post-op photos */
const PSTAGES = [['pre', 'Pre-op'], ['post', 'Post-op'], ['xray', 'X-ray'], ['other', 'Other']];
function clPhotos(){
  const Ph = (cl.pPh || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.at || 0) - (a.at || 0)), w = canW('treatments');
  const tOpts = (cl.pT || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(t => `<option value="${esc(t.id)}">${esc(fmtDM(t.date))} · ${esc(t.typeName)}${t.tooth ? ' (' + esc(t.tooth) + ')' : ''}</option>`).join('');
  const byT = {};
  Ph.forEach(x => (byT[x.treatmentId || ''] = byT[x.treatmentId || ''] || []).push(x));
  const card = x => `<figure class="ph" data-ph="${esc(x.id)}"><img src="${x.thumb}" alt=""><figcaption><span class="pst ${x.stage}">${esc((PSTAGES.find(s => s[0] === x.stage) || [0, x.stage])[1])}</span> ${esc(fmtDM(x.date))}${x.caption ? '<br>' + esc(x.caption) : ''}</figcaption>${w ? '<button class="phdel" data-phdel title="Delete">✕</button>' : ''}</figure>`;
  const groups = Object.entries(byT).map(([tid, xs]) => {
    const t = (cl.pT || []).find(x => x.id === tid);
    return `<div class="box"><h3>${t ? `${esc(t.typeName)}${t.tooth ? ' · ' + esc(t.tooth) : ''} <span class="sub">${esc(fmtShort(t.date))} · ${esc(dName(t.doctorId))}</span>` : 'General'}</h3>
      <div class="phrow">${PSTAGES.map(([k, l]) => xs.some(x => x.stage === k) ? `<div class="phcol"><div class="stat">${l}</div><div class="phgrid">${xs.filter(x => x.stage === k).map(card).join('')}</div></div>` : '').join('')}</div></div>`;
  }).join('');
  return `<div class="sect">${w ? `<div class="box"><h3>Add photos <span class="sub">compressed in your browser before upload</span></h3>
    <form class="aform" id="clPhForm" novalidate>
      <label>Stage<select id="phStage">${PSTAGES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label class="grow">For treatment<select id="phT"><option value="">— General —</option>${tOpts}</select></label>
      <label>Date<input type="date" id="phDate" value="${todayKey}"></label>
      <label class="grow">Caption<input id="phCap" placeholder="optional"></label>
      <label>Photos<input type="file" id="phFiles" accept="image/*" multiple></label>
      <button class="primary" type="submit" id="phBtn">Upload</button>
    </form></div>` : ''}
    ${cl.pPh === null ? '<div class="empty">Loading…</div>' : groups || '<div class="empty">No photos yet.</div>'}</div>`;
}
function shrink(file, max, q){
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let qq = q, out = c.toDataURL('image/jpeg', qq);
      while (out.length > 900000 && qq > 0.35){ qq -= 0.1; out = c.toDataURL('image/jpeg', qq); }
      res({data:out, w:c.width, h:c.height});
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Not an image')); };
    img.src = url;
  });
}
async function clUploadPhotos(){
  const {F} = cloud, files = [...($('#phFiles').files || [])];
  if (!files.length) return info('Choose one or more photos.');
  const meta = {stage:$('#phStage').value, treatmentId:$('#phT').value, date:$('#phDate').value || todayKey, caption:$('#phCap').value.trim()};
  $('#phBtn').disabled = true; $('#phBtn').textContent = 'Uploading…';
  let n = 0;
  try {
    for (const f of files){
      const full = await shrink(f, 1600, 0.82), th = await shrink(f, 320, 0.7);
      const ref = F.doc(cCol('patients', cl.pid, 'photos'));
      await F.setDoc(F.doc(cloud.fs, 'orgs', orgCtx().orgId, 'patients', cl.pid, 'photoData', ref.id), {data:full.data, w:full.w, h:full.h});
      await F.setDoc(ref, Object.assign({thumb:th.data, at:Date.now(), by:cloud.user.email || ''}, meta));
      n++;
    }
    info(`${plural(n, 'photo')} added.`);
  } catch(e){ info('Upload failed: ' + errText(e)); }
  cl.clear = true; document.activeElement.blur(); renderClinic();
}
async function clViewPhoto(id){
  const x = (cl.pPh || []).find(p => p.id === id); if (!x) return;
  const ov = $('#clOv'); ov.classList.add('on');
  $('#clOvBody').innerHTML = `<div class="ah"><b>${esc((PSTAGES.find(s => s[0] === x.stage) || [0, x.stage])[1])} · ${esc(fmtShort(x.date))}</b><span class="sp"></span><button data-ovclose>Close</button></div><img src="${x.thumb}" class="phbig" id="phBig"><p class="stat">${esc(x.caption || '')}</p>`;
  try { const s = await cloud.F.getDoc(cDoc('patients', cl.pid, 'photoData', id)); if (s.exists() && $('#phBig')) $('#phBig').src = s.data().data; } catch(e){ info(errText(e)); }
}
/* history: one timeline of visits, treatments, payments, photos */
function clHistory(){
  const ev = [];
  (cl.pA || []).forEach(a => ev.push({d:a.date, t:a.time || '', h:`📅 Appointment with ${esc(dName(a.doctorId) || '—')} · <span class="ast ${a.status}">${ASTATUS[a.status]}</span>${a.reason ? ' · ' + esc(a.reason) : ''}`}));
  (cl.pT || []).forEach(t => ev.push({d:t.date, t:'~', h:`🦷 ${esc(t.typeName)}${t.tooth ? ' (' + esc(t.tooth) + ')' : ''} by ${esc(dName(t.doctorId) || t.doctorName || '—')} · ${TSTATUS[t.status][0]}${can('billing') || can('treatments') ? ' · ' + inr(net(t)) : ''}${t.notes ? `<div class="stat">${esc(t.notes)}</div>` : ''}`}));
  (cl.pP || []).forEach(x => ev.push({d:x.date, t:'~~', h:`💳 Paid ${inr(x.amount)} (${esc((PMODES.find(m => m[0] === x.mode) || [0, x.mode])[1])})${x.receiptNo ? ' · ' + esc(x.receiptNo) : ''}`}));
  (cl.pA || []).filter(a => a.summary).forEach(a => ev.push({d:a.date, t:(a.time || '') + '~', h:`📝 Visit summary: ${esc(a.summary.notes).replace(/\n/g, '<br>')}`}));
  (cl.pD || []).forEach(x => ev.push({d:x.date, t:'~~~~', h:`📄 ${esc(x.kind)}${x.title ? ' · ' + esc(x.title) : ''}`, img:x.thumb || '', did:x.id}));
  (cl.pPh || []).forEach(x => ev.push({d:x.date, t:'~~~', h:`📷 ${esc((PSTAGES.find(s => s[0] === x.stage) || [0, x.stage])[1])} photo${x.caption ? ' · ' + esc(x.caption) : ''}`, img:x.thumb, id:x.id}));
  if (cl.p.createdAt) ev.push({d:dayKey(cl.p.createdAt), t:'', h:`🆕 Registered${cl.p.createdBy ? ' by ' + esc(cl.p.createdBy) : ''}`});
  ev.sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t));
  let day = null;
  return `<div class="timeline">${ev.map(e => { const hd = e.d !== day ? `<div class="tday">${esc(fmtShort(e.d))}</div>` : ''; day = e.d;
    return hd + `<div class="titem">${e.h}${e.img ? `<div><img src="${e.img}" class="tthumb" ${e.did ? `data-doc2="${esc(e.did)}"` : `data-ph="${esc(e.id)}"`}></div>` : ''}</div>`; }).join('') || '<div class="empty">Nothing yet.</div>'}</div>`;
}

