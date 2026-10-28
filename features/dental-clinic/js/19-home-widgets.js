/* ---------- Clinic on Home: reminders, today's appointments, today's collections, quick actions ---------- */
const clHome = {appts:null, pay:null};
const isClinicUser = () => !!(orgCtx() && feat('clinic'));
function clHomeReset(){ Object.assign(clHome, {appts:null, pay:null}); }
function clHomeLoad(again){
  clHomeReset();
  if (feat('clinic') && (can('appointments') || can('treatments'))) cloud.F.getDocs(cloud.F.query(cCol('appointments'), cloud.F.where('date', '==', todayKey))).then(qs => { clHome.appts = docsOf(qs); again(); }).catch(() => { clHome.appts = []; });
  if (feat('clinic') && (can('billing') || can('reports'))) cloud.F.getDocs(cloud.F.query(cCol('payments'), cloud.F.where('date', '==', todayKey))).then(qs => { clHome.pay = docsOf(qs); again(); }).catch(() => { clHome.pay = []; });
}
const remList = list => list.map(r => `<div class="hrem" data-rem="${esc(r.id)}"><span class="epic">${esc(r.epic)}</span><b>${esc(r.title)}</b>${r.link ? '<button>Open</button>' : ''}</div>`).join('') || '<div class="empty">Nothing waiting on you. 🎉</div>';
function wReminders(){ otWatch(); const O = otOpen(); return (O.length ? `<div class="stat" style="margin:0 0 6px">Organization reminders: closing one closes it for everyone</div>${O.slice(0, 12).map(otRow).join('')}${O.length > 12 ? `<div class="stat">+ ${O.length - 12} more on the Planning Board</div>` : ''}` : '')
  + ((cl.reminders || []).length ? `<div class="stat" style="margin:10px 0 6px">Yours</div>` + remList(cl.reminders) : O.length ? '' : remList([])); }
function wAppts(){
  const A = (clHome.appts || []).filter(a => a.status !== 'cancelled').sort((a, b) => String(a.time).localeCompare(String(b.time)));
  if (clHome.appts === null) return '<div class="stat">Loading…</div>';
  const c = s => A.filter(a => a.status === s).length;
  return `<div class="fchips" style="margin-bottom:8px">${['scheduled', 'waiting', 'engaged', 'billing', 'completed', 'missed'].map(s => `<span class="ast ${s}">${ASTATUS[s]} ${c(s)}</span>`).join('')}</div>`
    + (A.map((a, i) => `<div class="hrem" data-hopen="${esc(a.patientId)}"><span class="stat" style="width:18px">${i + 1}</span><span class="ast ${a.status}">${ASTATUS[a.status]}</span><b>${esc(hm12(a.time))} · ${esc(a.patientName)}</b><span class="stat">${esc(dName(a.doctorId))}${a.reason ? ' · ' + esc(a.reason) : ''}</span></div>`).join('') || '<div class="empty">No appointments today.</div>');
}
function wClinicToday(){
  const P = clHome.pay || [], tot = paidSum(P), A = (clHome.appts || []);
  return `<div class="hsum">${kpi('Collected today', inr(tot), plural(P.length, 'payment'))}${kpi('Patients seen', A.filter(a => a.status === 'completed').length, `${A.filter(a => ['waiting', 'engaged', 'billing'].includes(a.status)).length} in the clinic now`)}</div>
    <div class="fchips" style="margin-top:8px">${PMODES.map(([m, l]) => `<span class="fchip">${l} ${inr(paidSum(P.filter(x => x.mode === m)))}</span>`).join('')}</div>`;
}
function clQuick(){
  if (!isClinicUser()) return [];
  const a = [];
  if (canW('patients')) a.push(['newpatient', '🧑', 'New patient', 'Register a patient', () => { setView('clinic'); cl.sec = 'patients'; clOpenPatient(null); }]);
  if (canW('appointments')) a.push(['book', '📅', 'Book appointment', 'Schedule a visit', () => { setView('clinic'); cl.sec = 'appointments'; renderClinic(); clOpenBook({}); }]);
  if (canW('tally') || canW('accounts')) a.push(['tally', '🧮', 'Daily tally', 'Count the cash drawer', () => openLink({sec:'accounts', tab:'tally'})]);
  if (canW('petty') || canW('accounts')) a.push(['petty', '👛', 'Petty cash', 'Record a spend', () => openLink({sec:'accounts', tab:'petty'})]);
  if (can('reports')) a.push(['reports', '📊', 'Reports', 'Collections & more', () => { setView('clinic'); cl.sec = 'reports'; renderClinic(); }]);
  return a;
}
function clHomeClick(e){
  const rm = e.target.closest('[data-rem]'); if (rm){ const r = (cl.reminders || []).find(x => x.id === rm.dataset.rem); if (r && r.link) openLink(r.link); return true; }
  const ho = e.target.closest('[data-hopen]'); if (ho){ openLink({pid:ho.dataset.hopen, tab:'appointments'}); return true; }
}
