/* ================= Clinic: patients, appointments, treatments, photos, billing, accounts, reports =================
   Enabled per organization by the Super Admin (feature "clinic"). Inside the org, the Account Manager decides
   who may do what (Organization → People → Edit → Clinic access). Everything is enforced by firestore.rules too. */
const CPERMS = [
  ['patients', 'Patients', 'add and edit patient details'],
  ['appointments', 'Appointments', 'book, check in, reschedule'],
  ['treatments', 'Treatments & photos', 'treatments, clinical notes, pre/post-op photos'],
  ['billing', 'Billing', 'take payments, see balances, receipts'],
  ['accounts', 'Accounts', 'expenses, vendors, consultants, commitments, petty cash top-ups'],
  ['petty', 'Petty cash spends', 'record what petty cash was spent on'],
  ['tally', 'Daily cash tally', 'count the cash drawer each day'],
  ['reports', 'Collection & treatment reports', ''],
  ['doctorReports', 'Doctor & consultant reports', 'consultant statements and payouts'],
  ['setup', 'Clinic setup', 'doctors, treatment list and prices'],
  ['assistApprove', 'Approve patient assists', "Chief doctor: approves the assists staff log each day"],
];
const CPRESETS = [
  ['receptionist', 'Receptionist', ['patients', 'appointments', 'petty']],
  ['frontdesk', 'Front desk + billing', ['patients', 'appointments', 'billing', 'petty', 'tally']],
  ['doctor', 'Doctor', ['patients', 'appointments', 'treatments']],
  ['accountant', 'Accountant', ['billing', 'accounts', 'petty', 'tally', 'reports', 'doctorReports']],
  ['all', 'Full clinic access', CPERMS.map(p => p[0])],
  ['none', 'No clinic access', []],
];
const permsFromPreset = k => Object.fromEntries(CPERMS.map(([p]) => [p, ((CPRESETS.find(x => x[0] === k) || [0, 0, []])[2]).includes(p)]));
const presetOf = perms => { const on = CPERMS.filter(([p]) => perms && perms[p]).map(p => p[0]).join(); const f = CPRESETS.find(x => x[2].join() === on); return f ? f[1] : on ? 'Custom' : 'No clinic access'; };
const can = p => { const oc = orgCtx(); if (!oc || !feat('clinic')) return false; if (oc.support) return 'ro'; return oc.role === 'orgadmin' || !!((oc.me.perms || {})[p]); };
const canW = p => can(p) === true;                      // may change things (support view is look-only)
const clinicAny = () => CPERMS.some(([p]) => can(p));
const TSTATUS = {planned:['Planned', 'pend'], progress:['In progress', 'prog'], completed:['Completed', 'on']};
const ASTATUS = {scheduled:'Scheduled', waiting:'Waiting', engaged:'In chair', billing:'At billing', completed:'Completed', missed:'Missed', cancelled:'Cancelled'};
const PMODES = [['cash', 'Cash'], ['upi', 'UPI / GPay'], ['card', 'Card'], ['ccard', 'Credit card'], ['cheque', 'Cheque'], ['neft', 'NEFT'], ['rtgs', 'RTGS'], ['bank', 'Bank transfer']];
const MED_UNITS = ['Tablet', 'Capsule', 'Syrup (bottle)', 'Gel / tube', 'Mouthwash (bottle)', 'Injection', 'Other'];
const DEFAULT_MEDS = [['Amoxicillin 500 mg', 8, 'Capsule'], ['Amoxicillin + Clavulanate 625 mg', 20, 'Tablet'], ['Metronidazole 400 mg', 2, 'Tablet'], ['Ibuprofen 400 mg', 2, 'Tablet'], ['Paracetamol 650 mg', 2, 'Tablet'], ['Aceclofenac + Paracetamol', 5, 'Tablet'], ['Ketorolac 10 mg', 4, 'Tablet'], ['Pantoprazole 40 mg', 8, 'Tablet'], ['Chlorhexidine mouthwash', 120, 'Mouthwash (bottle)'], ['Metrogyl DG gel', 90, 'Gel / tube']];
const DEFAULT_TYPES = [['Consultation', 200], ['OPG X-ray', 400], ['IOPA X-ray', 150], ['Scaling & polishing', 1000], ['Filling', 1200], ['Root canal (RCT)', 4500], ['Extraction', 800], ['Crown', 6000], ['Implant', 30000], ['Braces / aligners', 35000], ['Dentures', 12000], ['Teeth whitening', 8000]];
const cl = {sec:'patients', pid:null, ptab:'profile', doctors:[], types:[], settings:{}, recent:null, search:null, q:'', unsub:[], key:'',
  p:null, pT:null, pP:null, pA:null, pPh:null, pUnsub:[], pKey:'', newP:false, edit:{},
  aDate:todayKey, aMode:'day', aDoc:'', appts:null, aUnsub:null, aKey:'', book:null,
  acc:{month:'', tab:'overview', d:null, key:'', pre:null, tday:'', vf:'', vonly:'month', cf:''}, ameta:null, reminders:[], pD:null, sum:null,
  rep:{kind:'collection', preset:'today', from:'', to:'', data:null, key:'', doc:null, group:'day', view:'table', mode:'', dfil:''},
  reset(){ [...this.unsub, ...this.pUnsub, ...(this.otUnsub || [])].forEach(u => { try { u(); } catch(e){} }); if (this.aUnsub) try { this.aUnsub(); } catch(e){} this.otUnsub = []; this.otKey = ''; this.orgT = null; this.ownT = null;
    Object.assign(this, {pid:null, doctors:[], types:[], settings:{}, recent:null, search:null, q:'', unsub:[], key:'', p:null, pT:null, pP:null, pA:null, pPh:null, pUnsub:[], pKey:'',
      newP:false, edit:{}, appts:null, aUnsub:null, aKey:'', book:null, ameta:null, allP:null, allBusy:false, members:null, mLoading:false, reminders:[], pD:null, sum:null, meds:null, asst:null, asKey:''}); this.acc.key = ''; this.rep.key = ''; this.rep.data = null; }};
const cCol = (...p) => cloud.F.collection(cloud.fs, 'orgs', orgCtx().orgId, ...p);
const cDoc = (...p) => cloud.F.doc(cloud.fs, 'orgs', orgCtx().orgId, ...p);
const docsOf = qs => qs.docs.map(d => Object.assign({id:d.id}, d.data()));
const dName = id => { const d = cl.doctors.find(x => x.id === id); return d ? d.name : ''; };
const pName = p => [p.title, p.first, p.last].filter(Boolean).join(' ') || p.name || '—';
const net = t => Math.max(0, (+t.cost || 0) - (+t.discount || 0));
const billed = ts => (ts || []).filter(t => t.status !== 'planned').reduce((a, t) => a + net(t), 0);
const paidSum = ps => (ps || []).reduce((a, x) => a + (+x.amount || 0), 0);
function ageOf(p){
  const now = new Date();
  if (p.dob){
    const b = parseDay(p.dob); let y = now.getFullYear() - b.getFullYear(), m = now.getMonth() - b.getMonth();
    if (now.getDate() < b.getDate()) m--; if (m < 0){ y--; m += 12; }
    return y < 0 ? '' : y >= 2 ? `${y} y${m ? ' ' + m + ' m' : ''}` : `${y * 12 + m} months`;
  }
  if (p.ageYears) return `${+p.ageYears + Math.floor((Date.now() - (p.ageAt || Date.now())) / 31557600000)} y (approx.)`;
  return '';
}
const searchKeys = p => {
  const k = new Set();
  [p.first, p.last, p.title].concat(String(p.first || '').split(/\s+/), String(p.last || '').split(/\s+/)).filter(Boolean).forEach(w => { w = w.toLowerCase().replace(/[^a-z0-9]/g, ''); for (let i = 2; i <= Math.min(w.length, 12); i++) k.add(w.slice(0, i)); });
  const ph = String(p.phone || '').replace(/\D/g, ''); if (ph){ for (let i = 3; i <= ph.length; i++) k.add(ph.slice(0, i)); k.add(ph.slice(-4)); }
  const c = String(p.code || '').toLowerCase(); if (c){ k.add(c); k.add(c.replace(/\D/g, '').replace(/^0+/, '')); }
  return [...k].filter(Boolean).slice(0, 120);
};
async function nextNumber(field, prefix, width){
  const {F} = cloud, ref = cDoc('clinicMeta', 'counter');
  const n = await F.runTransaction(cloud.fs, async tx => { const s = await tx.get(ref); const v = ((s.exists() && s.data()[field]) || 0) + 1; tx.set(ref, {[field]:v}, {merge:true}); return v; });
  return prefix + String(n).padStart(width, '0');
}

/* ---------- shared data: doctors, treatment list, clinic settings, recent patients ---------- */
function clLoad(){
  const oc = orgCtx(); if (!oc) return;
  const key = oc.orgId + '|' + oc.role + '|' + oc.support + '|' + stable(oc.me.perms || {});
  if (cl.key === key) return;
  cl.reset(); cl.key = key;
  const {F} = cloud, again = () => { if (state.settings.view === 'clinic' && cl.key === key) renderSoon('clinic', () => { if (state.settings.view === 'clinic') renderClinic(); }); };
  cl.unsub.push(F.onSnapshot(cCol('doctors'), qs => { cl.doctors = docsOf(qs).sort((a, b) => (b.active !== false) - (a.active !== false) || String(a.name).localeCompare(String(b.name))); again(); }, () => {}));
  cl.unsub.push(F.onSnapshot(cCol('treatmentTypes'), qs => { cl.types = docsOf(qs).sort((a, b) => String(a.name).localeCompare(String(b.name))); again(); }, () => {}));
  cl.unsub.push(F.onSnapshot(cDoc('clinicMeta', 'settings'), s => { cl.settings = s.exists() ? s.data() : {}; again(); }, () => {}));
  cl.unsub.push(F.onSnapshot(cCol('medicines'), qs => { cl.meds = docsOf(qs).sort((a, b) => String(a.name).localeCompare(String(b.name))); again(); }, () => { cl.meds = []; }));
  if (can('accounts')) cl.unsub.push(F.onSnapshot(cDoc('clinicMeta', 'accounts'), s => { cl.ameta = s.exists() ? s.data() : null; again(); }, () => {}));
  if (can('patients') || can('appointments') || can('treatments') || can('billing'))
    cl.unsub.push(F.onSnapshot(F.query(cCol('patients'), F.orderBy('updatedAt', 'desc'), F.limit(30)), qs => { cl.recent = docsOf(qs);
      if (cl.allP){ const m = new Map(cl.allP.map(x => [x.id, x])); cl.recent.forEach(x => m.set(x.id, x)); cl.allP = [...m.values()]; } again(); }, e => { cl.recent = []; info('Patients could not load: ' + errText(e)); }));
}
const CI = {
  patients:'<circle cx="8" cy="5" r="2.6"/><path d="M3 14c.4-3 2.4-4.6 5-4.6s4.6 1.6 5 4.6"/>',
  appointments:'<rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/>',
  accounts:'<rect x="1.5" y="4" width="13" height="8.5" rx="1.5"/><circle cx="8" cy="8.2" r="1.8"/><path d="M4 6.2v.1M12 10.2v.1"/>',
  reports:'<path d="M2 14h12M4 11V8M7 11V4.5M10 11V6.5M13 11V3"/>',
  attendance:'<circle cx="8" cy="8.5" r="6"/><path d="M8 5v3.7l2.4 1.5M6 1.2h4"/>',
  assists:'<path d="M5.5 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 14c.3-2.6 1.8-4 4-4s3.7 1.4 4 4M10.5 8.5l1.6 1.6 3-3.2"/>',
  setup:'<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>'};
const CSECS = [['patients', 'Patients', () => can('patients') || can('treatments') || can('billing')], ['appointments', 'Appointments', () => can('appointments') || can('treatments')],
  ['accounts', 'Accounts', () => can('accounts') || can('petty') || can('tally') || isOwnerLike()], ['reports', 'Reports', () => can('reports') || can('doctorReports')], ['assists', 'Patient assists', () => !!(orgCtx() && !orgCtx().support)], ['setup', 'Clinic setup', () => can('setup')]];

/* clinic organizations: one menu on the left of every page — Organization, Home, Attendance, Planning Board, and Clinic as the master
   menu with its pages (Patients, Appointments, Accounts …) listed under it. On phones the top tabs stay and the Clinic pages show inside Clinic. */
const sideNavOn = () => { const oc = orgCtx(); return !!(oc && feat('clinic')); };
const SN_MAIN = ['org', 'home', 'attendance', 'board'];
function renderSideNav(){
  const nav = $('#clSeg'), oc = orgCtx(); if (!nav) return;
  const on = sideNavOn(); document.body.classList.toggle('sidenav', on);
  if (!on){ if (nav.parentElement === document.body){ $('#v-clinic .clwrap').prepend(nav); nav.innerHTML = ''; } return; }
  if (nav.parentElement !== document.body) $('header.top').after(nav);                      // lift the menu out of the Clinic page so it shows on every page
  document.documentElement.style.setProperty('--hdrH', Math.round($('header.top').getBoundingClientRect().bottom || 64) + 'px');
  const v = state.settings.view, cur = AGENDA_VIEWS.includes(v) ? 'board' : v, secs = CSECS.filter(x => x[2]());
  if (!secs.some(x => x[0] === cl.sec)) cl.sec = secs.length ? secs[0][0] : '';
  const main = SN_MAIN.map(k => $(`#tabs [data-view="${k}"]`)).filter(t => t && !t.hidden)
    .map(t => `<a data-goview="${t.dataset.view}" href="${t.getAttribute('href')}" class="${cur === t.dataset.view ? 'on' : ''}">${t.querySelector('svg').outerHTML}<span>${esc(t.querySelector('.lbl').textContent)}</span></a>`).join('');
  const ct = $('#clinicTab'), clinicOn = ct && !ct.hidden, open = cl.navOpen !== false || v === 'clinic';
  nav.innerHTML = `<div class="sn-main">${main}</div>`
    + (clinicOn ? `<a class="sn-master${v === 'clinic' ? ' on' : ''}" data-goview="clinic" href="#/clinic" aria-expanded="${open}">${ct.querySelector('svg').outerHTML}<span>Clinic</span>${v === 'clinic' ? '<i class="sn-chev">▾</i>' : `<i class="sn-chev" data-sntoggle title="${open ? 'Collapse' : 'Expand'}">${open ? '▾' : '▸'}</i>`}</a>
      <div class="sn-sub" data-ord="csec" data-ordattr="s" data-ordv="1"${open ? '' : ' hidden'}>${ordered('csec', secs).map(([k, l]) => `<a draggable="true" data-s="${k}" href="#/clinic/${k}" class="${v === 'clinic' && k === cl.sec ? 'on' : ''}"><svg viewBox="0 0 16 16">${CI[k]}</svg><span>${l}</span></a>`).join('')}</div>` : '')
    + (oc && oc.support ? '<div class="stat" style="padding:8px 10px">Read-only support view</div>' : '');
}
function renderClinic(){
  const oc = orgCtx(); if (!oc || !feat('clinic') || window.__ordDrag || window.__apDrag) return;
  clLoad();
  const secs = CSECS.filter(s => s[2]());
  if (!secs.some(s => s[0] === cl.sec)) cl.sec = secs.length ? secs[0][0] : '';
  renderSideNav();
  const body = $('#clBody');
  if (keepTyping(body)) return;
  parkAtt();
  if (cl.sec === 'attendance'){ body.innerHTML = '<div class="clhead"><h2>Attendance</h2></div><div id="clAttHost"></div>'; $('#clAttHost').append($('#attBar'), $('#attBody')); att.key = ''; return renderAttendance(); }
  if (!secs.length){ body.innerHTML = '<div class="empty">Your Account Manager hasn\'t given you access to any part of the clinic yet.</div>'; return; }
  const y = body.scrollTop, fkey = [cl.sec, cl.pid, cl.newP, cl.ptab, cl.acc.tab, cl.acc.month, cl.rep.kind, cl.asst ? cl.asst.tab + cl.asst.person : ''].join('|');
  // keep half-typed forms when live data refreshes the page (cleared after a successful save)
  const saved = cl.clear || cl.fkey !== fkey ? null : [...body.querySelectorAll('input[id],select[id],textarea[id]')].filter(e => e.type !== 'file' && !e.disabled).map(e => [e.id, e.type === 'checkbox' ? e.checked : e.value]);
  cl.clear = false; cl.fkey = fkey;
  body.innerHTML = ({patients:() => cl.pid || cl.newP ? clPatient() : clPatients(), appointments:clAppointments, accounts:clAccounts, reports:clReports, assists:clAssists, setup:clSetup})[cl.sec]();
  if (saved) saved.forEach(([id, v]) => { const e = document.getElementById(id); if (e && body.contains(e) && !e.disabled && !['clQ', 'aPick', 'rgDate'].includes(e.id)){ if (e.type === 'checkbox') e.checked = v; else e.value = v; } });
  tallyCalc();
  if ($('#tfDoc') && $('#tfFeeWrap')){ const dd = cl.doctors.find(x => x.id === $('#tfDoc').value); $('#tfFeeWrap').hidden = !(dd && dd.type === 'consultant'); }
  body.scrollTop = y;
  if (cl.sec === 'reports') clRunReport();
  numberTables(body);
  syncHash();
}

/* ---------- Patients: the whole list, in patient-number order, with instant filtering ---------- */
const codeNo = c => { const m = String(c || '').match(/(\d+)\D*$/); return m ? +m[1] : Infinity; };
const PSORT = {num:['Patient No. (1 → latest)', (a, b) => codeNo(a.code) - codeNo(b.code) || String(a.code).localeCompare(String(b.code))],
  numd:['Patient No. (latest first)', (a, b) => codeNo(b.code) - codeNo(a.code) || String(b.code).localeCompare(String(a.code))],
  name:['Name A–Z', (a, b) => pName(a).localeCompare(pName(b))], reg:['Recently registered', (a, b) => (b.createdAt || 0) - (a.createdAt || 0)]};
function loadAllPatients(force){
  if (cl.allBusy || (cl.allP && !force)) return;
  const {F} = cloud; cl.allBusy = true;
  F.getDocs(cCol('patients')).then(qs => { cl.allP = docsOf(qs); cl.allBusy = false; bumpCounter(); if (cl.sec === 'patients' && !cl.pid && !cl.newP) renderClinic(); })
    .catch(e => { cl.allBusy = false; cl.allP = []; info('Patients could not load: ' + errText(e)); });
}
async function bumpCounter(){          // new patients continue after the highest imported patient number
  if (!isOwner() || !cl.allP) return;
  const imp = cl.allP.filter(p => p.imported), max = Math.max(0, ...imp.map(p => codeNo(p.code)).filter(isFinite)); if (!max) return;
  if (!(cl.settings || {}).codeFormat){ const pre = (String((imp.find(p => /^[A-Za-z]+\d+$/.test(p.code || '')) || {}).code || '').match(/^[A-Za-z]+/) || [''])[0];
    if (pre) cloud.F.setDoc(cDoc('clinicMeta', 'settings'), {codeFormat:'compact', codePrefix:pre}, {merge:true}).catch(() => {}); }
  const {F} = cloud, ref = cDoc('clinicMeta', 'counter');
  try { await F.runTransaction(cloud.fs, async tx => { const s2 = await tx.get(ref), cur = (s2.exists() && s2.data().patient) || 0; if (cur < max) tx.set(ref, {patient:max}, {merge:true}); }); } catch(e){}
}
function pMatch(p, q){
  const n = q.toLowerCase().replace(/\s+/g, ' ').trim(); if (!n) return true;
  const digits = n.replace(/\D/g, ''), code = String(p.code || '').toLowerCase();
  if (code.includes(n.replace(/\s/g, ''))) return true;
  if (digits && /^[a-z-]*\d+$/i.test(n.replace(/\s/g, '')) && codeNo(code) === +digits) return true;      // "29", "ADC29", "adc-0029"
  if (digits.length >= 3 && String(p.phone || '').includes(digits)) return true;
  return pName(p).toLowerCase().includes(n);
}
function clPatients(){
  loadAllPatients();
  const all = cl.allP, sortK = cl.psort || 'num';
  const qd = cl.q.replace(/\s/g, ''), qn = /^[a-z-]*\d+$/i.test(qd) ? +qd.replace(/\D/g, '') : null;
  const exact = p => qn !== null && codeNo(p.code) === qn ? 0 : 1;            // the exact patient number comes first
  const list = all ? all.filter(p => pMatch(p, cl.q)).sort((a, b) => exact(a) - exact(b) || PSORT[sortK][1](a, b)) : null;
  const rows = (list || []).map(p => `<tr class="clk" data-pid="${esc(p.id)}"><td class="pcodec">${esc(p.code || '—')}</td><td><a class="plink" href="#/clinic/patients/${esc(p.id)}"><b>${esc(pName(p))}</b></a></td>
    <td>${esc(p.gender || '—')}${ageOf(p) ? ' · ' + esc(ageOf(p)) : ''}</td><td>${esc(p.phone || '—')}</td><td>${esc(dName(p.primaryDoctorId) || '—')}</td><td class="stat">${p.createdAt > 1 ? esc(fmtShort(dayKey(p.createdAt))) : ''}</td></tr>`).join('');
  return `<div class="clhead"><h2>Patients</h2></div><div class="sect">
    <div class="vbar" style="padding:0"><input type="search" id="clQ" placeholder="Filter by patient code, name or phone…" value="${esc(cl.q)}" style="flex:1;min-width:220px;font-size:14px;padding:8px 12px">
      <select id="clPSort" title="Order">${Object.entries(PSORT).map(([k, [l]]) => `<option value="${k}"${k === sortK ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <button id="clPRefresh" title="Reload the list">↻</button>
      ${canW('patients') ? '<button class="primary" id="clNewP">+ New patient</button>' : ''}</div>
    <div class="stat">${!all ? 'Loading all patients…' : cl.q ? `${list.length} of ${all.length} patients match "${esc(cl.q)}"` : `${all.length} patients`}</div>
    <div class="awrap pscroll" style="margin-top:0"><table class="atbl otbl"><thead><tr><th>Patient No.</th><th>Patient</th><th>Gender · Age</th><th>Phone</th><th>Primary doctor</th><th>Registered</th></tr></thead>
    <tbody>${list === null ? '<tr><td colspan="6">Loading…</td></tr>' : rows || `<tr><td colspan="6" class="stat">${cl.q ? 'No patient matches.' : 'No patients yet.'}</td></tr>`}</tbody></table></div></div>`;
}
let clQTimer = null;
function clDoSearch(){
  const el = $('#clQ'), pos = el ? el.selectionStart : 0; document.activeElement.blur(); renderClinic();
  const n = $('#clQ'); if (n){ n.focus(); n.setSelectionRange(pos, pos); }
}

