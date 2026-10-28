/* ================= Dental Clinic: how this feature plugs into core (see core/js/03-feature-registry.js) ================= */
ZL.add({
  id:'dental-clinic',
  flags:[['clinic', 'Clinic', 'patients, appointments, billing, accounts, reports']],
  api:{loadIncentives},                               // Payroll adds patient-assist incentives to pay
  views:{clinic:{render:renderClinic, tab:'#clinicTab', on:() => feat('clinic')}},     // every clinic member at least logs their Patient assists there
  // the Clinic entry in the left "Features" menu, with its pages
  menu:{view:'clinic', ordKey:'csec', on:() => feat('clinic'), href:k => '#/clinic/' + k, go:clGoSec,
    subs:() => CSECS.filter(x => x[2]()).map(([k, l]) => [k, l, CI[k]]),
    cur(){ const s = CSECS.filter(x => x[2]()); if (!s.some(x => x[0] === cl.sec)) cl.sec = s.length ? s[0][0] : ''; return cl.sec; }},
  // addresses: #/clinic/<page>[/<patient id>[/<tab>]] · #/clinic/reports/<kind> · #/clinic/accounts/<tab>
  route:{
    hash(v){
      if (v !== 'clinic') return null;
      let h = '#/clinic/' + (cl.sec || 'patients');
      if (cl.sec === 'patients' && cl.pid) h += '/' + cl.pid + (cl.ptab && cl.ptab !== 'profile' ? '/' + cl.ptab : '');
      if (cl.sec === 'reports') h += '/' + cl.rep.kind;
      if (cl.sec === 'accounts') h += '/' + cl.acc.tab;
      return h;
    },
    apply(p){
      if (p[0] !== 'clinic') return false;
      if (p[1] === 'attendance' && viewAllowed('attendance')){ setView('attendance'); return true; }    // old link: Attendance is its own tab now
      if (!viewAllowed('clinic')) return false;
      const sec = p[1] || 'patients'; cl.sec = sec;
      if (sec === 'reports' && p[2]) cl.rep.kind = p[2];
      if (sec === 'accounts' && p[2]) cl.acc.tab = p[2];
      setView('clinic');
      if (sec === 'patients'){ if (p[2]){ cl.ptab = p[3] || 'profile'; clOpenPatient(p[2]); } else if (cl.pid){ cl.pUnsub.forEach(u => { try { u(); } catch(_){} }); cl.pUnsub = []; cl.pid = null; cl.newP = false; renderClinic(); } }
      return true;
    },
  },
  onView(v, from){ if (v === 'home' && from !== 'home' && Date.now() - (window.__lastSync || 0) > 120000) clinicSync(true); },
  reset(){ cl.reset(); },
  start(){ setTimeout(() => clinicSync(), 1500); },
  // the Planning Board: organization reminders panel, and tasks that open a patient / an account page
  boardPanel:renderOrgRem,
  remHint:'Clinic reminders (follow-ups, documents, payments due, tallies)',
  link:{ok:link => !!(link && orgCtx() && feat('clinic')), open:clOpenLink, label:'Open in Clinic →'},
  home:{
    load:clHomeLoad, reset:clHomeReset, quick:clQuick, click:clHomeClick,
    defaults:() => ['reminders', 'appts', 'clinicToday'],
    widgets:{
      reminders:{t:'Reminders', ic:'🔔', d:'Everything the clinic needs from you: summaries, documents, follow-ups, tallies', ok:() => isClinicUser() && remOn(), r:wReminders, size:'full'},
      appts:{t:"Today's appointments", ic:'📅', d:'Who is coming today and where they are in the queue', ok:() => isClinicUser() && !!(can('appointments') || can('treatments')), r:wAppts, size:'full'},
      clinicToday:{t:'Clinic today', ic:'💰', d:"Today's collections by mode and patients seen", ok:() => isClinicUser() && !!(can('billing') || can('reports')), r:wClinicToday},
    },
  },
  // Organization → People: what each person may do in the clinic
  person:{order:10,                                  // Clinic access sits next to Role, before Work timing
    addHtml:() => feat('clinic') ? `<label>Clinic access<select id="paCPre">${CPRESETS.map(([k, l]) => `<option value="${k}"${k === 'receptionist' ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : '',
    editHtml:m => clinicAccessHtml(m),
    read(where){
      if (where === 'add') return $('#paCPre') ? {perms:permsFromPreset($('#paCPre').value)} : {};
      return document.querySelector('#pEdit [data-cp]') ? {perms:Object.fromEntries([...document.querySelectorAll('#pEdit [data-cp]')].map(c => [c.dataset.cp, c.checked]))} : {};
    },
    roleTags:m => feat('clinic') ? `<span class="sub2">Clinic: ${esc(m.role === 'orgadmin' ? 'full access' : presetOf(m.perms))}</span>` : '',
  },
});
// Organization → People → Edit: "Apply a preset…" ticks the clinic permissions
document.addEventListener('change', e => {
  if (e.target.id === 'peCPre' && e.target.value){ const p = permsFromPreset(e.target.value); document.querySelectorAll('#pEdit [data-cp]').forEach(c => { if (!c.disabled) c.checked = !!p[c.dataset.cp]; }); e.target.value = ''; }
});
