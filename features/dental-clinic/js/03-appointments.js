/* ---------- Appointments ---------- */
const autoMissed = new Set();
function autoMiss(list){                 // past days: a visit left "Scheduled" becomes "Missed" (the reminder to call them is raised by the clinic sync)
  if (!canW('appointments')) return;
  const stale = (list || []).filter(a => a.date < todayKey && a.status === 'scheduled' && !autoMissed.has(a.id)); if (!stale.length) return;
  stale.forEach(a => { autoMissed.add(a.id); a.status = 'missed'; a.autoMissed = true; cloud.F.updateDoc(cDoc('appointments', a.id), {status:'missed', autoMissed:true, missedAt:Date.now()}).catch(() => autoMissed.delete(a.id)); });
  clinicSync(true);
}
function clApptLoad(){
  const {F} = cloud, from = cl.aMode === 'day' ? cl.aDate : weekStart(cl.aDate), to = cl.aMode === 'day' ? cl.aDate : shiftDay(weekStart(cl.aDate), 6);
  const key = orgCtx().orgId + from + to;
  if (cl.aKey === key) return; cl.aKey = key; cl.appts = null;
  if (cl.aUnsub) try { cl.aUnsub(); } catch(e){}
  cl.aUnsub = F.onSnapshot(F.query(cCol('appointments'), F.where('date', '>=', from), F.where('date', '<=', to)), qs => { if (cl.aKey !== key) return; cl.appts = docsOf(qs); autoMiss(cl.appts); if (state.settings.view === 'clinic' && cl.sec === 'appointments') renderClinic(); }, e => { cl.appts = []; info('Appointments could not load: ' + errText(e)); });
}
const toHM = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
/* each doctor has a colour (Clinic setup → Doctors), used on appointment tiles */
const DOC_COLORS = ['#2563EB', '#DB2777', '#059669', '#D97706', '#7C3AED', '#0891B2', '#DC2626', '#65A30D', '#9333EA', '#EA580C'];
const docColor = id => { const d = cl.doctors.find(x => x.id === id); if (d && d.color) return d.color; const i = cl.doctors.findIndex(x => x.id === id); return i < 0 ? '#64748B' : DOC_COLORS[i % DOC_COLORS.length]; };
const plink = (id, name, cls = '') => `<a class="plink2 ${cls}" href="#/clinic/patients/${esc(id)}" target="_blank" rel="noopener" title="Open ${esc(name)} in a new tab">${esc(name)}</a>`;
function clAppointments(){
  clApptLoad();
  const w = canW('appointments'), A = (cl.appts || []).filter(a => !cl.aDoc || a.doctorId === cl.aDoc).sort((a, b) => String(a.date + a.time).localeCompare(String(b.date + b.time)));
  const title = cl.aMode === 'day' ? fmtLong(cl.aDate) : `${fmtDM(weekStart(cl.aDate))} – ${fmtDM(shiftDay(weekStart(cl.aDate), 6))}`;
  const bar = `<div class="clhead"><h2>Appointments</h2>${w ? '<button class="primary" data-book="">+ New appointment</button>' : ''}</div><div class="vbar" style="padding:0 0 10px">
    <div class="daynav"><button data-ad="-1">‹</button><button data-ad="0"${cl.aDate === todayKey ? ' disabled' : ''}>Today</button><button data-ad="1">›</button></div>
    <input type="date" id="aPick" value="${cl.aDate}"><strong>${esc(title)}</strong>
    <div class="seg" id="aModeSeg"><button data-am="day" class="${cl.aMode === 'day' ? 'on' : ''}">Day</button><button data-am="week" class="${cl.aMode === 'week' ? 'on' : ''}">Week</button></div>
    <select id="aDocF">${docOpts(cl.aDoc, 'All doctors')}</select></div>`;
  if (cl.appts === null) return bar + '<div class="empty">Loading…</div>';
  const live = A.filter(a => a.status !== 'cancelled'), gone = A.filter(a => a.status === 'cancelled');   // cancelled / rescheduled visits leave the schedule
  const chip = a => `<div class="achip ${a.status}${cl.aStat && cl.aStat !== a.status ? ' dim' : ''}" data-appt="${esc(a.id)}" style="--dc:${docColor(a.doctorId)}"${w && ['scheduled', 'missed'].includes(a.status) ? ' data-drag="1" title="Drag to another time to reschedule"' : ''}><b>${esc(hm12(a.time))}</b> ${esc(a.patientName)}<i class="astag ${a.status}">${ASTATUS[a.status]}</i><span>${esc(dName(a.doctorId))}${a.reason ? ' · ' + esc(a.reason) : ''}</span></div>`;
  const usedDocs = [...new Set(A.map(a => a.doctorId))].filter(Boolean), legend = usedDocs.length ? `<div class="dlegend">${usedDocs.map(id => `<span><i style="background:${docColor(id)}"></i>${esc(dName(id))}</span>`).join('')}</div>` : '';
  if (cl.aMode === 'week'){
    const days = [...Array(7)].map((_, i) => shiftDay(weekStart(cl.aDate), i));
    return bar + legend + `<div class="aweek">${days.map(d => `<div class="aday${d === todayKey ? ' today' : ''}"${w ? ` data-dday="${d}"` : ''}><div class="adh" data-goday="${d}">${esc(fmtShort(d))} <span class="stat">${live.filter(a => a.date === d).length || ''}</span></div>${live.filter(a => a.date === d).map(chip).join('') || '<div class="stat" style="padding:6px">—</div>'}</div>`).join('')}</div>
      ${gone.length ? `<details class="acx"><summary>Cancelled / rescheduled this week (${gone.length})</summary>${gone.map(a => `<div class="acxr" data-appt="${esc(a.id)}"><s>${esc(fmtShort(a.date))} ${esc(hm12(a.time))} · ${esc(a.patientName)}</s> <span class="stat">${esc(dName(a.doctorId))}</span></div>`).join('')}</details>` : ''}`;
  }
  const open = toMin(cl.settings.open || '09:00'), close = toMin(cl.settings.close || '21:00'), slot = 30;
  let grid = '';
  for (let m = open; m < close; m += slot){
    const inSlot = live.filter(a => toMin(a.time) >= m && toMin(a.time) < m + slot);
    grid += `<div class="srow"><div class="stime">${esc(hm12(toHM(m)))}</div><div class="scell"${w ? ` data-slot="${toHM(m)}"` : ''}>${inSlot.map(chip).join('')}</div></div>`;
  }
  const outside = live.filter(a => toMin(a.time) < open || toMin(a.time) >= close);
  const st = cl.aStat || '';
  const SHORT = {billing:'Billing'};
  const counts = Object.keys(ASTATUS).filter(k => k !== 'cancelled').map(k => [k, ASTATUS[k], A.filter(a => a.status === k).length])
    .map(([k, l, n]) => `<button type="button" class="acnt ${k}${st === k ? ' on' : ''}" data-astat="${k}" title="${l}: ${st === k ? 'click to show all again' : 'click to show only these'}"><b>${n}</b><span>${SHORT[k] || l}</span></button>`).join('');
  const NEXT = {scheduled:[['waiting', 'Check in'], ['missed', 'Missed']], waiting:[['engaged', 'In chair'], ['scheduled', '↩ Back']], engaged:[['completed', 'Done → summary'], ['waiting', '↩ Back']], billing:[['bill', 'Bill & print'], ['engaged', '↩ Back to In chair']], missed:[['scheduled', 'Re-open']], completed:[], cancelled:[['scheduled', 'Restore']]};
  const qcard = a => `<div class="aq ${a.status}" data-appt="${esc(a.id)}" style="--dc:${docColor(a.doctorId)}"><div class="aqm"><div class="aqh">${plink(a.patientId, a.patientName, 'lnk')}<span class="ast ${a.status}">${ASTATUS[a.status]}</span></div><span>${esc(hm12(a.time))} · ${esc(a.duration || 15)} min · ${esc(dName(a.doctorId))}</span></div>
    ${w ? `<div class="aqa">${NEXT[a.status].map(([s, l]) => `<button data-ast="${s}"${/^↩/.test(l) ? ' class="aback" title="Go one step back"' : ['waiting', 'engaged', 'completed', 'bill'].includes(s) ? ' class="primary"' : ''}>${l}</button>`).join('')}${a.status === 'scheduled' ? '<button data-edit-appt>Reschedule / edit</button><button class="danger" data-ast="cancelled">Cancel</button>' : ''}</div>` : ''}</div>`;
  const shown = st ? live.filter(a => a.status === st) : live;
  const side = (shown.map(qcard).join('') || `<div class="empty" style="margin:0">No ${esc((ASTATUS[st] || '').toLowerCase())} appointments.</div>`) + (!st && gone.length ? `<details class="acx"><summary>Cancelled / rescheduled (${gone.length})</summary>${gone.map(qcard).join('')}</details>` : '');
  return bar + legend + `<div class="agrid"><div class="aslots">${outside.length ? `<div class="srow"><div class="stime">Other</div><div class="scell">${outside.map(chip).join('')}</div></div>` : ''}${grid}</div>
    <div class="aside"><div class="acnts">${counts}</div>${A.length ? side : '<div class="empty">No appointments this day.</div>'}</div></div>`;
}
function clBookForm(){
  const b = cl.book, w = b.id ? (cl.appts || []).find(a => a.id === b.id) || b : b;
  return `<div class="ah"><h2 style="font-size:16px;margin:0">${b.id ? 'Edit appointment' : 'New appointment'}</h2><span class="sp"></span><button data-ovclose>Close</button></div>
    <form class="aform" id="clBookForm" novalidate style="margin-top:10px">
      ${b.patientId ? `<label class="grow full">Patient<input value="${esc(b.patientName)}" disabled></label>`
      : `<div class="full seg bkmode"><button type="button" data-bkmode="old" class="${b.mode !== 'new' ? 'on' : ''}">Existing patient</button><button type="button" data-bkmode="new" class="${b.mode === 'new' ? 'on' : ''}">+ New patient</button></div>
        ${b.mode === 'new' ? `<div class="full npbox">
          <label>Title<select id="npTitle">${['', 'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Master', 'Baby', 'Dr.'].map(x => `<option>${x}</option>`).join('')}</select></label>
          <label class="grow">First name *<input id="npFirst" autocomplete="off"></label><label class="grow">Last name<input id="npLast" autocomplete="off"></label>
          <label>Gender<select id="npGender"><option value=""></option><option>Female</option><option>Male</option><option>Other</option></select></label>
          <label>Date of birth<input type="date" id="npDob" max="${todayKey}"></label><label>or Age<input type="number" id="npAge" min="0" max="120" style="width:80px"></label>
          <label>Mobile *<input id="npPhone" inputmode="tel" autocomplete="off"></label><label>Other phone<input id="npPhone2" inputmode="tel"></label>
          <label class="grow">Email<input id="npEmail" type="email"></label>
          <label class="grow full">Address<input id="npAddr"></label><label>City<input id="npCity"></label><label>Pincode<input id="npPin" style="width:100px"></label>
          <label class="grow">Referred by<input id="npRef" placeholder="e.g. friend, Google, camp"></label>
          <label class="grow full">Allergies / medical alerts<input id="npAll" placeholder="e.g. Penicillin, diabetic, on blood thinners"></label></div>`
        : `<label class="grow full">Search patient<input id="bkQ" placeholder="Type name, phone or patient code…" autocomplete="off"><div id="bkRes" class="bkres"></div></label>`}`}
      <label class="grow">Doctor<select id="bkDoc">${docOpts(w.doctorId || cl.aDoc || '', '— Select —')}</select></label>
      <label>Date<input type="date" id="bkDate" value="${esc(w.date || cl.aDate)}"></label>
      <label>Time<input type="time" id="bkTime" step="300" value="${esc(w.time || b.time || '10:00')}"></label>
      <label>Minutes<select id="bkDur">${[15, 30, 45, 60, 90].map(n => `<option${n === +(w.duration || 15) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="grow full">Reason<input id="bkReason" value="${esc(w.reason || '')}" placeholder="e.g. Toothache, RCT 2nd sitting, review"></label>
      <div class="btnrow full"><button class="primary" type="submit">${b.id ? 'Save' : 'Book'}</button></div>
    </form>`;
}
async function newPatientCode(){          // same style as the clinic's existing numbers (imported Dentee codes: ADC00482)
  const st = cl.settings || {};
  if (st.codeFormat === 'compact') return nextNumber('patient', st.codePrefix || st.prefix || 'PT', 5);
  return nextNumber('patient', (st.prefix || 'PT') + '-', 6);
}
function clOpenBook(o){ cl.book = o; $('#clOv').classList.add('on'); $('#clOvBody').innerHTML = clBookForm(); const q = $('#bkQ'); if (q) q.focus(); }
async function clSaveBook(){
  const {F} = cloud, b = cl.book;
  const d = {doctorId:$('#bkDoc').value, date:$('#bkDate').value, time:$('#bkTime').value, duration:+$('#bkDur').value || 15, reason:$('#bkReason').value.trim()};
  if (!d.doctorId) return info('Choose the doctor.');
  if (!d.date || !d.time) return info('Choose the date and time.');
  try {
    if (!b.patientId){
      if (b.mode !== 'new') return info('Search and pick the patient, or switch to "+ New patient".');
      const v = id => (($('#' + id) || {}).value || '').trim(), ph = v('npPhone').replace(/[^\d+]/g, '');
      if (!v('npFirst')) return info('Enter the new patient\'s first name.');
      if (!/^\+?\d{7,15}$/.test(ph)) return info('Enter a valid mobile number for the new patient.');
      if (!canW('patients')) return info('You can\'t register new patients. Ask someone with Patients access.');
      const dup = await F.getDocs(F.query(cCol('patients'), F.where('keys', 'array-contains', ph.replace(/\D/g, '')), F.limit(3)));
      if (!dup.empty && !confirm(`${dup.docs.map(x => pName(x.data()) + ' (' + (x.data().code || '') + ')').join(', ')} already has this mobile number. Register a new patient anyway?`)) return;
      const dd = cl.doctors.find(x => x.id === d.doctorId) || {}, now = Date.now();
      const p = {title:v('npTitle'), first:v('npFirst'), last:v('npLast'), gender:v('npGender'), dob:v('npDob'), phone:ph, phone2:v('npPhone2').replace(/[^\d+]/g, ''), email:v('npEmail').toLowerCase(),
        address:v('npAddr'), city:v('npCity'), pincode:v('npPin'), referredBy:v('npRef'), allergies:v('npAll'), occupation:'', notes:'', bloodGroup:'',
        primaryDoctorId:dd.type === 'consultant' ? '' : d.doctorId, updatedAt:now, createdAt:now, createdDay:todayKey, createdBy:cloud.user.email || ''};
      if (!p.dob && v('npAge')){ p.ageYears = +v('npAge'); p.ageAt = now; }
      p.code = await newPatientCode(); p.keys = searchKeys(p);
      const ref = await F.addDoc(cCol('patients'), p); b.patientId = ref.id; b.patientName = pName(p);
      if (cl.allP) cl.allP.push(Object.assign({id:ref.id}, p));
      info(`${pName(p)} registered as ${p.code}.`);
    }
    const clash = (cl.appts || []).find(a => a.id !== b.id && a.doctorId === d.doctorId && a.date === d.date && a.status !== 'cancelled' && Math.abs(toMin(a.time) - toMin(d.time)) < Math.max(+a.duration || 15, d.duration));
    if (clash && !confirm(`${dName(d.doctorId)} already has ${clash.patientName} at ${hm12(clash.time)}. Book anyway?`)) return;
    if (b.id) await F.updateDoc(cDoc('appointments', b.id), d);
    else await F.addDoc(cCol('appointments'), Object.assign(d, {patientId:b.patientId, patientName:b.patientName, status:'scheduled', createdAt:Date.now(), createdBy:cloud.user.email || ''}));
    $('#clOv').classList.remove('on'); cl.book = null;
    info(b.id ? 'Appointment updated.' : `Booked ${b.patientName} with ${dName(d.doctorId)} on ${fmtShort(d.date)} at ${hm12(d.time)}.`);
    if (cl.sec === 'appointments'){ cl.aDate = d.date; } renderClinic();
  } catch(e){ info('Could not save: ' + errText(e)); }
}

