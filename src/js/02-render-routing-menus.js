/* ================= render dispatch ================= */
const AGENDA_VIEWS = ['board', 'calendar', 'all', 'insights'];
const viewAllowed = v => {
  if (['calendar', 'all', 'insights'].includes(v)) v = 'board';     // these all live inside the Planning Board
  const t = document.querySelector(`#tabs [data-view="${v}"]`);
  return !!t && !t.hidden;
};
function render(){
  if (!viewAllowed(state.settings.view)){
    const first = [...document.querySelectorAll('#tabs [data-view]')].find(b => !b.hidden);
    state.settings.view = first ? first.dataset.view : 'board';
  }
  const v = state.settings.view, agenda = AGENDA_VIEWS.includes(v);
  applyTabOrder();
  document.querySelectorAll('#tabs [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === (AGENDA_VIEWS.includes(v) ? 'board' : v)));
  document.querySelectorAll('.plannav button').forEach(b => b.classList.toggle('on', b.dataset.pn === (['board', 'calendar'].includes(v) ? 'board' : v)));
  const pm = v === 'calendar' ? state.settings.calMode : 'day';
  document.querySelectorAll('.planSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === pm));
  document.querySelectorAll('.view').forEach(s => s.hidden = s.id !== 'v-' + v);
  $('#addForm').hidden = !agenda;
  if (agenda) fillNewWho();
  const noTabs = ![...document.querySelectorAll('#tabs [data-view]')].some(b => !b.hidden);
  if (noTabs) document.querySelectorAll('.view').forEach(s => s.hidden = true);
  else ({board:renderBoard, calendar:renderCalendar, all:renderAll, insights:renderInsights, attendance:renderAttendance, clinic:renderClinic, org:renderOrg, orgs:renderOrgs, home:renderHome})[v]();
  document.body.classList.toggle('inclinic', v === 'clinic');
  renderSideNav();
  applyLogo();
  const od = agendaOn() ? state.items.filter(it => isPastDue(it) && isMine(it)).length : 0;
  $('#overdueStat').textContent = od ? `🔥 ${od} overdue` : '';
  $('#overdueStat').hidden = !od;
  const oc = orgCtx(), nm = (oc && !oc.support ? oc.org.name : state.settings.name).trim(), sp = nm.lastIndexOf(' ');
  $('#appName').innerHTML = sp > 0 ? `${esc(nm.slice(0, sp))} <span class="w2">${esc(nm.slice(sp + 1))}</span>` : esc(nm);
  $('#appName').title = oc && !oc.support ? '' : 'Click to rename';
  $('#brandTag').innerHTML = oc && !oc.support ? '<span class="orgchip">on Zenvora Loop</span>' : (cloud && cloud.isSuper ? 'Super Admin · your personal day planner' : 'Your personal day planner');
  if (!flashTimer) document.title = oc && !oc.support ? oc.org.name + ' · Zenvora Loop' : state.settings.name;
  syncHash();
}
function setView(v){
  if (!viewAllowed(v)) return;
  if (v === 'board') state.settings.planMode = 'day';
  if (v === 'calendar') state.settings.planMode = state.settings.calMode;
  if (v === 'attendance' && state.settings.view !== 'attendance') att.key = '';
  if (v === 'home' && state.settings.view !== 'home'){                    // refresh Home's data at most once a minute
    if (Date.now() - (home.at || 0) > 60000) home.key = '';
    if (Date.now() - (window.__lastSync || 0) > 120000) clinicSync(true); }
  state.settings.view = v; save();
  if (v === 'board') setAddDay(boardDay >= todayKey ? boardDay : todayKey);
  render();
}

/* Many live updates can arrive together: draw each view at most once per frame */
const rsq = {};
function renderSoon(k, fn){ if (rsq[k]) return; rsq[k] = requestAnimationFrame(() => { rsq[k] = 0; fn(); }); setTimeout(() => { if (rsq[k]){ cancelAnimationFrame(rsq[k]); rsq[k] = 0; fn(); } }, 400); }

/* ================= addresses: every page has its own link (#/clinic/patients/…), so it can be opened in a new tab ================= */
function routeHash(){
  const v = state.settings.view;
  if (v !== 'clinic') return '#/' + v;
  let h = '#/clinic/' + (cl.sec || 'patients');
  if (cl.sec === 'patients' && cl.pid) h += '/' + cl.pid + (cl.ptab && cl.ptab !== 'profile' ? '/' + cl.ptab : '');
  if (cl.sec === 'reports') h += '/' + cl.rep.kind;
  if (cl.sec === 'accounts') h += '/' + cl.acc.tab;
  return h;
}
let routeApplying = false;
function syncHash(){ if (!appReady || routeApplying) return; const h = routeHash(); if (location.hash !== h) try { history.replaceState(null, '', h); } catch(e){} }
function applyHash(){
  const p = decodeURIComponent(location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean); if (!p.length) return false;
  routeApplying = true;
  try {
    if (p[0] === 'clinic' && p[1] === 'attendance' && viewAllowed('attendance')){ setView('attendance'); return true; }    // old link: Attendance is its own tab now
    if (p[0] === 'clinic' && viewAllowed('clinic')){
      const sec = p[1] || 'patients'; cl.sec = sec;
      if (sec === 'reports' && p[2]) cl.rep.kind = p[2];
      if (sec === 'accounts' && p[2]) cl.acc.tab = p[2];
      setView('clinic');
      if (sec === 'patients'){ if (p[2]){ cl.ptab = p[3] || 'profile'; clOpenPatient(p[2]); } else if (cl.pid){ cl.pUnsub.forEach(u => { try { u(); } catch(_){} }); cl.pUnsub = []; cl.pid = null; cl.newP = false; renderClinic(); } }
      return true;
    }
    if (viewAllowed(p[0])){ setView(p[0]); return true; }
  } finally { routeApplying = false; syncHash(); }
  return false;
}
window.addEventListener('hashchange', () => { if (appReady && location.hash !== routeHash()) applyHash(); });
// plain clicks stay inside the app; Ctrl / ⌘ / Shift / middle click and "Open in new tab" use the link
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="#/"]'); if (!a) return;
  if (a.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0){ e.stopImmediatePropagation(); return; }
  e.preventDefault();
}, true);

/* ================= menu order: drag the tabs to arrange them ================= */
const TAB_KEY = 'zenvora-loop-tab-order';
function tabOrder(){
  if (Array.isArray(state.settings.tabOrder) && state.settings.tabOrder.length) return state.settings.tabOrder;
  try { return JSON.parse(localStorage.getItem(TAB_KEY)) || []; } catch(e){ return []; }
}
function applyTabOrder(){
  const nav = $('#tabs'), ord = tabOrder();
  if (!ord.length || window.__tabDrag) return;              // never fight a drag in progress
  const cur = [...nav.children].map(b => b.dataset.view).join();
  const want = ord.filter(v => nav.querySelector(`[data-view="${v}"]`)).concat([...nav.children].map(b => b.dataset.view).filter(v => !ord.includes(v)));
  if (want.join() !== cur) want.forEach(v => nav.appendChild(nav.querySelector(`[data-view="${v}"]`)));
}
/* Drag to reorder. The pointer only has to be roughly level with the menu (it may drift above or below it),
   the dragged tab is placed by its horizontal (or, for a vertical menu, vertical) position among the visible
   items, and nothing re-renders the menu while a drag is in progress. */
function dragPlace(host, drag, e, vert){
  const items = [...host.children].filter(b => /^(BUTTON|A)$/.test(b.tagName) && b !== drag && !b.hidden && b.offsetParent !== null);
  const pos = vert ? e.clientY : e.clientX;
  const next = items.find(b => { const r = b.getBoundingClientRect(); return pos < (vert ? r.top + r.height / 2 : r.left + r.width / 2); });
  const vis = [...host.children].filter(b => /^(BUTTON|A)$/.test(b.tagName) && (b === drag || (!b.hidden && b.offsetParent !== null))), at = vis.indexOf(drag);
  if (next){ if (vis[at + 1] !== next) host.insertBefore(drag, next); }              // already right before it: leave hidden tabs alone
  else { const last = items[items.length - 1]; if (last && at !== vis.length - 1) host.insertBefore(drag, last.nextSibling); }
}
const nearHost = (host, e, vert) => { const r = host.getBoundingClientRect(), pad = 70; return vert ? e.clientX > r.left - pad && e.clientX < r.right + pad : e.clientY > r.top - pad && e.clientY < r.bottom + pad; };
(() => {
  const nav = $('#tabs'); let drag = null;
  const visOrd = () => [...nav.children].filter(b => !b.hidden).map(b => b.dataset.view).join();
  nav.querySelectorAll('[data-view]').forEach(b => { b.draggable = true; b.title += ' · drag to reorder · right-click to open in a new tab'; });
  let startOrd = '';
  nav.addEventListener('dragstart', e => { drag = e.target.closest('[data-view]'); if (!drag) return; window.__tabDrag = true; startOrd = visOrd(); drag.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', drag.dataset.view); } catch(_){} });
  document.addEventListener('dragover', e => { if (!drag) return; if (nearHost(nav, e, false)){ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; dragPlace(nav, drag, e, false); } });
  document.addEventListener('drop', e => { if (drag) e.preventDefault(); });
  nav.addEventListener('dragend', () => {
    window.__tabDrag = false;
    if (!drag) return; const d = drag; drag.classList.remove('dragging'); drag = null;
    const ord = [...nav.children].map(b => b.dataset.view);
    if (visOrd() === startOrd){ render(); return setView(d.dataset.view); }   // nothing moved: it was a click
    try { localStorage.setItem(TAB_KEY, JSON.stringify(ord)); } catch(e){}
    state.settings.tabOrder = ord;                            // follows you to your other devices
    save(); render();
  });
})();

