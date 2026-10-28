/* ================= Payroll: how this feature plugs into core (see core/js/03-feature-registry.js) ================= */
ZL.add({
  id:'payroll',
  flags:[['attendance', 'Attendance', 'check-in / check-out'], ['payroll', 'Payroll', 'salary & payable (needs Attendance)', 'attendance']],
  views:{attendance:{render:renderAttendance, tab:'#attTab', on:() => feat('attendance'), key:'5'}},
  onView(v, from){ if (v === 'attendance' && from !== 'attendance') att.key = ''; },
  reset(){ attReset(); },
  roleChanged(){ attReset(); },
  supportView(){ if (!feat('attendance')) return null; att.mode = 'team'; return 'attendance'; },
  expose(z){ Object.defineProperty(z, 'att', {get:() => att}); Object.assign(z, {attSummary, sessionsOf}); },
  // what other features may use (Clinic → Accounts → Staff salary works from attendance)
  api:{attSummary, sessionsOf, attCol, attCfg, canManageAtt, payOn, titleOf, OFFS_PER_MONTH},
  home:{
    load:attHomeLoad, reset:attHomeReset, after(){ attTick(); },
    defaults:() => ['checkin', 'mark'],
    widgets:{
      checkin:{t:'Check in / out', ic:'⏱', d:'Your attendance timer and Check in / Check out button', ok:() => !!(attSelf() && feat('attendance')), r:wCheckin},
      regs:{t:'Attendance approvals', ic:'🗂', d:'Regularization requests waiting for you', ok:() => !!(orgCtx() && !orgCtx().support && feat('attendance') && regPendingForMe().length), r:wRegs, size:'full', pin:true},
      mark:{t:'Mark attendance', ic:'🕘', d:'Check other staff in and out (attendance proxy)', ok:() => !!(orgCtx() && feat('attendance') && canMarkAtt()), r:wMark, size:'full', ensure:1},
    },
    click(e){ const pb = e.target.closest('#punchBtn'); if (pb){ punch(pb.dataset.t, pb); return true; } },
  },
  // Organization → People: work timing, Proxy attendance
  person:{
    addHtml:() => feat('attendance') ? `<div class="full wtrow"><span class="fhead" style="margin:0">Work timing</span>${wtFields('paW', attCfg(null))}<span class="stat">time worked beyond these hours counts as overtime / extra hours</span></div>` : '',
    editHtml:m => feat('attendance') && m.role !== 'orgadmin' ? `<div class="full cperm"><div class="fhead" style="margin:4px 0">Attendance · work timing</div><div class="wtrow" style="margin-bottom:6px">${wtFields('peW', attCfg(m))}</div><label class="ckl" style="color:var(--ink)"><input type="checkbox" id="peProxy"${m.attProxy ? ' checked' : ''}> <b>Proxy attendance</b>&nbsp;<span class="stat">can check other staff in and out (e.g. reception)</span></label></div>` : '',
    read(where, role, m){
      if (where === 'add') return $('#paWS') && role !== 'orgadmin' ? {att:wtRead('paW')} : {};
      const o = {}; if ($('#peProxy')) o.attProxy = $('#peProxy').checked; if ($('#peWS')) o.att = wtRead('peW', (m || {}).att); return o;
    },
    titleTags:m => (m.attProxy && feat('attendance') ? ' <em class="rtag">Proxy attendance</em>' : '') + (feat('attendance') && m.role !== 'orgadmin' ? `<span class="sub2">⏰ ${esc(shiftTxt(attCfg(m)))}</span>` : ''),
    managerHint:() => feat('attendance') ? `sees and corrects everyone's attendance${feat('payroll') ? ' and pay' : ''}` : '',
    employeeHint:() => feat('attendance') ? 'check-in' : '',
  },
});
