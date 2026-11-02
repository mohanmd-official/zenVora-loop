/* ================= Clinic ↔ Planning Board, visit summaries, patient documents ================= */
const DTYPE = {chief:'Chief doctor', primary:'Clinic doctor', consultant:'Consultant'};
const DOC_KINDS = ['OPG', 'X-ray (IOPA)', 'Intraoral scan', 'CBCT', 'Blood test', 'Prescription', 'Consent form', 'Lab report', 'Other'];
const NEEDS_DEFAULT = {'opg x-ray':'OPG', 'iopa x-ray':'X-ray (IOPA)', 'crown':'Intraoral scan'};
const needsDocOf = t => { if (!t) return ''; if (t.needsDoc !== undefined) return t.needsDoc; return NEEDS_DEFAULT[String(t.name || t.typeName || '').toLowerCase()] || ''; };
const typeNeeds = tr => needsDocOf(cl.types.find(x => x.id === tr.typeId) || {name:tr.typeName});

/* ---------- visit summary: what happened in this appointment ----------
   The treatment done (with its cost) is required; the written description may be skipped for now,
   which puts a reminder on everyone's Planning Board. Medicines are billed as tablets × price. */
const DOSE = [['m', 'Morning'], ['a', 'Afternoon'], ['e', 'Evening'], ['n', 'Night']];
const isMed = t => !!t && t.kind === 'medicine';
const doseTxt = d => DOSE.map(([k]) => d && d[k] ? 1 : 0).join('-');
const medDose = t => DOSE.some(([k]) => t.dose && t.dose[k]) ? `${doseTxt(t.dose)} <span class="stat">${esc(DOSE.filter(([k]) => t.dose[k]).map(d => d[1]).join(', '))}</span>` : '<span class="stat">—</span>';
async function clOpenSummary(appt, completing, back){
  cl.sum = {appt, completing, back:back || '', T:null};
  $('#clOv').classList.add('on'); $('#clOvBody').innerHTML = '<div class="empty">Loading…</div>';
  try { cl.sum.T = (can('treatments') || can('billing')) ? docsOf(await cloud.F.getDocs(cloud.F.query(cCol('treatments'), cloud.F.where('appointmentId', '==', appt.id)))) : []; }
  catch(e){ if (cl.sum) cl.sum.T = []; }
  if (cl.sum && appt.billId){ try { const bs = await cloud.F.getDoc(cDoc('bills', appt.billId)); const bb = bs.exists() ? Object.assign({id:bs.id}, bs.data()) : null; if (cl.sum && bb && billLive(bb) && bb.status !== 'draft') cl.sum.locked = bb; } catch(e){} }
  if (cl.sum && canW('treatments')){ await asStaff(); try { cl.sum.AS = docsOf(await cloud.F.getDocs(cloud.F.query(cCol('assists'), cloud.F.where('appointmentId', '==', appt.id)))).filter(x => x.status !== 'void'); } catch(e){ cl.sum.AS = []; } }
  if (cl.sum && cl.sum.appt === appt){ $('#clOvBody').innerHTML = clSummaryForm(); sumTotals(); }
}
function sumRow(i, a, t){
  const types = cl.types.filter(x => x.active !== false || (t && x.id === t.typeId));
  const doc = t ? t.doctorId : a.doctorId, cons = (cl.doctors.find(x => x.id === doc) || {}).type === 'consultant', pct = !!(t && t.discPct);
  return `<div class="srowf" data-sr="${i}"${t ? ` data-tid="${esc(t.id)}"` : ''}>
    <select data-sf="type" class="srch">${t ? '' : '<option value="">— Treatment * —</option>'}${types.map(x => `<option value="${esc(x.id)}" data-cost="${+x.cost || 0}"${t && x.id === t.typeId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
    <input data-sf="tooth" data-teeth placeholder="Tooth" autocomplete="off" value="${t ? esc(t.tooth || '') : ''}">
    <select data-sf="doc">${docOpts(doc, '— Doctor —')}</select>
    ${asPicker(t)}
    <input type="number" data-sf="cost" min="0" step="50" value="${t ? +t.cost || 0 : ''}" placeholder="Cost ₹ *">
    <span class="dsc"><input type="number" data-sf="disc" min="0" step="1" value="${t ? (pct ? +t.discPct : +t.discount || '') : ''}" placeholder="Disc."><select data-sf="dtype" title="Discount in ₹ or %"><option value="flat"${pct ? '' : ' selected'}>₹</option><option value="pct"${pct ? ' selected' : ''}>%</option></select></span>
    <select data-sf="status">${[['completed', 'Completed'], ['progress', 'In progress'], ['planned', 'Planned']].map(([k, l]) => `<option value="${k}"${t && t.status === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <input type="number" data-sf="fee" min="0" step="50" placeholder="Consultant fee" value="${t && +t.consultantFee ? +t.consultantFee : ''}"${cons ? '' : ' hidden'}>
    <button type="button" class="danger" data-srdel title="Remove">✕</button><div class="snet" data-sf="net"></div></div>`;
}
// a row's discount in ₹ (a % is of the cost)
const rowDisc = r => { const g = k => r.querySelector(`[data-sf="${k}"]`), cost = +g('cost').value || 0, v = Math.max(0, +g('disc').value || 0); return Math.min(cost, Math.round(g('dtype').value === 'pct' ? cost * Math.min(100, v) / 100 : v)); };
/* "Assisted by" for one treatment: a select like the doctor's (None or a name); "+" adds another assistant */
const asSel = uid => `<select data-asel><option value="">— Assistant —</option>${(cl.dir || []).map(p => `<option value="${esc(p.uid)}"${p.uid === uid ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
function asPicker(t){
  const on = t ? [...new Set(((cl.sum && cl.sum.AS) || []).filter(x => x.treatmentId === t.id).map(x => x.uid))] : [];
  return `<span class="asw" data-sf="asst">${(on.length ? on : ['']).map(asSel).join('')}<button type="button" class="ghost asplus" data-asplus title="Add another assistant">+</button></span>`;
}
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-asplus]'); if (b) b.insertAdjacentHTML('beforebegin', asSel('')); });
function medRow(i, m){
  const meds = (cl.meds || []).filter(x => x.active !== false || (m && x.id === m.medId)), d = (m && m.dose) || {};
  return `<div class="mrow" data-mr="${i}"${m ? ` data-tid="${esc(m.id)}"` : ''}>
    <select data-mf="med" class="srch"><option value="">— Medicine —</option>${meds.map(x => `<option value="${esc(x.id)}" data-price="${+x.price || 0}" data-unit="${esc(x.unit || 'Tablet')}"${m && x.id === m.medId ? ' selected' : ''}>${esc(x.name)} · ${inr(x.price)}/${esc((x.unit || 'Tablet').toLowerCase())}</option>`).join('')}</select>
    <span class="dose">${DOSE.map(([k, l]) => `<label title="${l}"><input type="checkbox" data-mf="${k}"${d[k] ? ' checked' : ''}><span>${l}</span></label>`).join('')}</span>
    <input type="number" data-mf="days" min="1" max="120" value="${m ? +m.days || '' : ''}" placeholder="Days" title="How many days">
    <input type="number" data-mf="qty" min="0" value="${m ? +m.qty || '' : ''}" placeholder="Qty" title="Number of tablets: ticks × days (you can change it)">
    <b data-mf="cost" class="num">${m ? inr(m.cost) : '₹0'}</b>
    <button type="button" class="danger" data-mrdel title="Remove">✕</button></div>`;
}
function medCalc(row){
  const g = k => row.querySelector(`[data-mf="${k}"]`), o = g('med').selectedOptions[0], price = o && o.value ? +o.dataset.price || 0 : 0, unit = o && o.value ? o.dataset.unit || 'Tablet' : '';
  const ticks = DOSE.filter(([k]) => g(k).checked).length, days = +g('days').value || 0;
  if (/tablet|capsule/i.test(unit)){ if (ticks && days) g('qty').value = ticks * days; }
  else if (unit && !g('qty').value) g('qty').value = 1;
  g('cost').textContent = inr((+g('qty').value || 0) * price);
}
const medTotal = () => [...document.querySelectorAll('#smMeds [data-mr]')].reduce((s, r) => { const o = r.querySelector('[data-mf="med"]').selectedOptions[0]; return s + (o && o.value ? (+r.querySelector('[data-mf="qty"]').value || 0) * (+o.dataset.price || 0) : 0); }, 0);
function clSummaryForm(){
  const {appt:a, completing, T, back, locked} = cl.sum, w = canW('treatments') && !locked;
  const TT = (T || []).filter(t => !isMed(t)), MM = (T || []).filter(isMed), notes = (a.summary && a.summary.notes) || '';
  const noTr = !TT.length && !!(a.noTr || a.noCost), noMed = !MM.length && !!(a.noMed || a.noCost);
  return `<div class="ah"><button type="button" class="abk" data-smback style="margin:0" title="${back === 'bill' ? 'Back to the bill' : 'Back to the queue: the patient stays In chair'}">← Back</button><h2 style="font-size:16px;margin:0">What happened in this appointment?</h2><span class="sp"></span><button data-ovclose>Close</button></div>
    <p class="stat" style="margin:4px 0 10px"><b>${esc(a.patientName)}</b> · ${esc(fmtShort(a.date))} ${esc(hm12(a.time))} · ${esc(dName(a.doctorId))}${a.reason ? ' · ' + esc(a.reason) : ''}</p>
    <form id="clSumForm" novalidate>
      ${w ? `<div class="fhead" style="margin:0 0 4px">Treatment *<span class="sp"></span><label class="ckl nox"><input type="checkbox" id="smNoTr"${noTr ? ' checked' : ''}> No treatment</label></div>
        <div id="smTrArea"${noTr ? ' hidden' : ''}><div id="smRows">${(TT.length ? TT : [null]).map((t, i) => sumRow(i, a, t)).join('')}</div>
        <button type="button" id="smAdd" style="margin-top:4px">+ Add treatment</button></div>
        <div class="fhead" style="margin:16px 0 4px">Medicines<span class="sp"></span><label class="ckl nox"><input type="checkbox" id="smNoMed"${noMed ? ' checked' : ''}> No medicine</label></div>
        <div id="smMedArea"${noMed ? ' hidden' : ''}><div id="smMeds">${MM.map((m, i) => medRow(i, m)).join('')}</div>
        <div class="btnrow"><button type="button" id="smMedAdd">+ Add medicine</button>${(cl.meds || []).filter(x => x.active !== false).length ? '' : ''}<span class="sp"></span><span class="stat">Medicines total <b id="smMedTot">${inr(MM.reduce((s, m) => s + (+m.cost || 0), 0))}</b></span></div></div>`
      : locked ? `<p class="stat">🔒 The treatments are on bill <b>${esc(locked.billNo)}</b> (${BST[locked.status][0]}). To change them, cancel that bill in the patient's Bills tab, then issue a fresh one.</p>` : '<p class="stat">Treatments and medicines are added by a doctor (you don\'t have Treatments access).</p>'}
      ${w ? `<div class="smtot" id="smTotals"><div><span>Cost</span><b data-tt="cost">₹0</b></div><i>−</i><div><span>Discount</span><b data-tt="disc">₹0</b></div><i>+</i><div><span>Medicines</span><b data-tt="md">₹0</b></div><i>=</i><div class="all"><span>Total</span><b data-tt="all">₹0</b></div></div>` : ''}
      <label class="stat" style="display:block;margin-top:14px">Notes<textarea id="smNotes" rows="3" style="width:100%" placeholder="Findings, what was done, plan…">${esc(notes)}</textarea></label>
      <label class="ckl" id="smSkipWrap" style="margin-top:6px"${noTr && noMed ? ' hidden' : ''}><input type="checkbox" id="smSkipDesc"> Add notes later</label>
      ${back === 'bill' ? '' : `<div class="fhead" style="margin:12px 0 4px">Next visit</div>
      <div class="nvrow"><span class="nvck"><input type="checkbox" id="smNext"> Book the next visit</span><input type="date" id="smNDate" value="${shiftDay(todayKey, 7)}" min="${todayKey}"><input type="time" id="smNTime" value="${esc(a.time || '10:00')}" step="300"><input id="smNReason" placeholder="Reason, e.g. RCT 2nd sitting"></div>`}
      <div class="btnrow" style="margin-top:14px"><button class="primary" type="submit" id="smSubmit">${completing || back === 'bill' ? 'Save & go to bill →' : 'Save'}</button></div>
    </form>`;
}
async function clSaveSummary(){
  const {F} = cloud, S = cl.sum; if (!S) return;
  const {appt:a, completing, back} = S, by = cloud.user.email || '', now = Date.now(), w = canW('treatments') && !S.locked, toBill = completing || back === 'bill';
  const noTr = !!($('#smNoTr') && $('#smNoTr').checked), noMed = !!($('#smNoMed') && $('#smNoMed').checked), noCost = noTr && noMed;
  const notes = ($('#smNotes') || {}).value.trim(), skipDesc = !noCost && !!($('#smSkipDesc') && $('#smSkipDesc').checked);
  if (noCost && !notes) return info('No treatment and no medicine: write the description of what was done.');
  const rows = w && !noTr ? [...document.querySelectorAll('#smRows [data-sr]')].map(r => { const v = k => r.querySelector(`[data-sf="${k}"]`).value; return {tid:r.dataset.tid || '', uids:[...new Set([...r.querySelectorAll('[data-asel]')].map(c => c.value).filter(Boolean))], typeId:v('type'), tooth:v('tooth').trim(), doctorId:v('doc'), costRaw:v('cost').trim(), cost:Math.max(0, +v('cost') || 0), discount:rowDisc(r), discPct:v('dtype') === 'pct' ? Math.min(100, Math.max(0, +v('disc') || 0)) : 0, status:v('status'), fee:Math.max(0, +v('fee') || 0)}; }) : [];
  const filled = rows.filter(r => r.typeId);
  if (w && toBill && !noTr && !filled.length) return info('Add the treatment done with its cost, or tick "No treatment".');
  if (filled.some(r => r.costRaw === '')) return info('Enter the cost for each treatment.');
  if (filled.some(r => !r.doctorId)) return info('Choose the doctor for each treatment.');
  const meds = w && !noMed ? [...document.querySelectorAll('#smMeds [data-mr]')].map(r => { const g = k => r.querySelector(`[data-mf="${k}"]`), o = g('med').selectedOptions[0];
    return {tid:r.dataset.tid || '', medId:g('med').value, dose:Object.fromEntries(DOSE.map(([k]) => [k, g(k).checked])), days:Math.max(0, +g('days').value || 0), qty:Math.max(0, +g('qty').value || 0), price:o && o.value ? +o.dataset.price || 0 : 0, unit:o && o.value ? o.dataset.unit || '' : ''}; }).filter(m => m.medId) : [];
  if (meds.some(m => !m.qty)) return info('For each medicine, tick when to take it and enter the number of days.');
  if (!notes && !skipDesc) return info('Write the notes, or tick "Add notes later".');
  try {
    if (w){
      const keep = new Set(filled.map(r => r.tid).concat(meds.map(m => m.tid)).filter(Boolean));   // ticking "No treatment" / "No medicine" removes this visit's entries of that kind
      for (const t of (S.T || [])) if (!keep.has(t.id)) await F.deleteDoc(cDoc('treatments', t.id));
      var saved = [];
      const base = {patientId:a.patientId, patientName:a.patientName, appointmentId:a.id, date:a.date <= todayKey ? a.date : todayKey};
      for (const r of filled){
        const ty = cl.types.find(t => t.id === r.typeId) || {id:r.typeId, name:''}, dd = cl.doctors.find(x => x.id === r.doctorId) || {};
        const d = {typeId:ty.id, typeName:ty.name, tooth:r.tooth, doctorId:r.doctorId, doctorName:dd.name || '', cost:r.cost, discount:Math.min(r.cost, r.discount), discPct:r.discPct, consultantFee:dd.type === 'consultant' ? r.fee : 0, status:r.status};
        let tid = r.tid; if (tid) await F.updateDoc(cDoc('treatments', tid), d); else tid = (await F.addDoc(cCol('treatments'), Object.assign({}, base, d, {notes:'', createdAt:now, by}))).id;
        saved.push({tid, t:Object.assign({}, base, d), uids:r.uids});
      }
      for (const m of meds){
        const md = (cl.meds || []).find(x => x.id === m.medId) || {name:''};
        const d = {kind:'medicine', medId:m.medId, typeId:'', typeName:md.name, unit:m.unit, dose:m.dose, days:m.days, qty:m.qty, unitPrice:m.price, cost:Math.round(m.qty * m.price), discount:0, status:'completed', doctorId:a.doctorId, doctorName:dName(a.doctorId), consultantFee:0};
        if (m.tid) await F.updateDoc(cDoc('treatments', m.tid), d); else await F.addDoc(cCol('treatments'), Object.assign({}, base, d, {tooth:'', notes:'', createdAt:now, by}));
      }
    }
    if (w && saved.length) try { await syncTreatmentAssists(a, saved); } catch(e){ info('Saved, but the assistants could not be recorded: ' + errText(e)); }
    const upd = notes ? {summaryPending:false, summary:{notes, by, at:now}} : {summaryPending:true, skippedBy:by};
    Object.assign(upd, {noTr, noMed, noCost});
    if (completing) Object.assign(upd, {status:'billing', summarizedAt:now});
    await F.updateDoc(cDoc('appointments', a.id), upd);
    if ($('#smNext') && $('#smNext').checked){
      const nd = $('#smNDate').value, nt = $('#smNTime').value;
      if (nd && nt) await F.addDoc(cCol('appointments'), {patientId:a.patientId, patientName:a.patientName, doctorId:a.doctorId, date:nd, time:nt, duration:a.duration || 15, reason:$('#smNReason').value.trim() || 'Follow-up', status:'scheduled', createdAt:now, createdBy:by, followOf:a.id});
    }
    $('#clOv').classList.remove('on'); cl.sum = null;
    info(notes ? 'Visit summary saved.' : `Saved. "Treatment plan description needs to be updated for ${a.patientName}" is on the Planning Board.`);
    clinicSync(true); renderClinic();
    if (toBill){ if (canW('billing')) clOpenBill(Object.assign({}, a, upd)); else if (completing) info(`${a.patientName} is now "At billing": the front desk will take the payment.`); }
  } catch(e){ info('Could not save: ' + errText(e)); }
}

/* ---------- patient documents: OPG, X-rays, intraoral scans, blood tests… ---------- */
function clDocs(){
  const D = (cl.pD || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.at || 0) - (a.at || 0)), w = canW('patients') || canW('treatments');
  const T = (cl.pT || []), missing = T.filter(t => typeNeeds(t) && !t.docAttached);
  const tOpts = T.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(t => `<option value="${esc(t.id)}" data-need="${esc(typeNeeds(t))}">${esc(fmtDM(t.date))} · ${esc(t.typeName)}${t.tooth ? ' (' + esc(t.tooth) + ')' : ''}</option>`).join('');
  return `<div class="sect">
    ${missing.length ? `<div class="nag late">⚠ Missing documents: ${missing.map(t => `${esc(typeNeeds(t))} for ${esc(t.typeName)} (${esc(fmtDM(t.date))})`).join(' · ')}. Upload them below; until then they stay on the Planning Board backlog.</div>` : ''}
    ${w ? `<div class="box"><h3>Upload a document</h3>
    <form class="aform" id="clDocForm2" novalidate>
      <label>Type<select id="dkKind">${DOC_KINDS.map(k => `<option>${k}</option>`).join('')}</select></label>
      <label class="grow">For treatment<select id="dkT"><option value="">— Not linked —</option>${tOpts}</select></label>
      <label>Date<input type="date" id="dkDate" value="${todayKey}"></label>
      <label class="grow">Title / findings<input id="dkTitle" placeholder="e.g. OPG – impacted 38"></label>
      <label>File(s)<input type="file" id="dkFiles" accept="image/*,application/pdf" multiple></label>
      <button class="primary" type="submit" id="dkBtn">Upload</button>
    </form></div>` : ''}
    ${cl.pD === null ? '<div class="empty">Loading…</div>' : D.length ? `<div class="docgrid">${D.map(x => `<div class="docc" data-doc2="${esc(x.id)}">
        ${x.thumb ? `<img src="${x.thumb}" alt="">` : '<div class="pdfic">PDF</div>'}
        <div class="docm"><b>${esc(x.kind)}</b><span>${esc(fmtShort(x.date))}${x.title ? ' · ' + esc(x.title) : ''}</span>${x.treatmentId ? `<span class="stat">${esc(((T.find(t => t.id === x.treatmentId) || {}).typeName) || '')}</span>` : ''}</div>
        ${w ? '<button class="phdel" data-docdel title="Delete">✕</button>' : ''}</div>`).join('')}</div>` : '<div class="empty">No documents yet.</div>'}</div>`;
}
async function clUploadDocs(){
  const {F} = cloud, files = [...($('#dkFiles').files || [])];
  if (!files.length) return info('Choose a file.');
  const meta = {kind:$('#dkKind').value, treatmentId:$('#dkT').value, date:$('#dkDate').value || todayKey, title:$('#dkTitle').value.trim(), at:Date.now(), by:cloud.user.email || ''};
  $('#dkBtn').disabled = true; $('#dkBtn').textContent = 'Uploading…';
  try {
    for (const f of files){
      const full = await readFileData(f), thumb = /^image\//.test(f.type) ? (await shrink(f, 320, 0.7)).data : '';
      const ref = F.doc(cCol('patients', cl.pid, 'docs'));
      await F.setDoc(cDoc('patients', cl.pid, 'docData', ref.id), full);
      await F.setDoc(ref, Object.assign({name:f.name, mime:full.mime, thumb}, meta));
    }
    if (meta.treatmentId) await F.updateDoc(cDoc('treatments', meta.treatmentId), {docAttached:true}).catch(() => {});
    info(`${plural(files.length, 'document')} uploaded.`); clinicSync(true);
  } catch(e){ info('Upload failed: ' + errText(e)); }
  cl.clear = true; document.activeElement.blur(); renderClinic();
}
async function openStoredFile(ref, title){
  try {
    const s = await cloud.F.getDoc(ref); if (!s.exists()) return info('File not found.');
    const d = s.data(), w = window.open('', '_blank'); if (!w) return info('Allow pop-ups to view files.');
    if ((d.mime || '').includes('pdf')){ w.document.write(`<title>${esc(title)}</title><iframe src="${d.data}" style="border:0;position:fixed;inset:0;width:100%;height:100%"></iframe>`); }
    else w.document.write(`<title>${esc(title)}</title><body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh"><img src="${d.data}" style="max-width:100%;max-height:100vh"></body>`);
    w.document.close();
  } catch(e){ info(errText(e)); }
}

