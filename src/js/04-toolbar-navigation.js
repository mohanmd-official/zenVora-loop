/* ================= toolbar & navigation ================= */
document.addEventListener('click', e => {               // Planning Board sub-menu: Board · All tasks · Insights
  const b = e.target.closest('[data-pn]'); if (!b) return;
  const v = b.dataset.pn;
  if (v === 'board') return setView(state.settings.planMode && state.settings.planMode !== 'day' ? 'calendar' : 'board');
  setView(v);
});
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-view]'); if (!b) return;
  if (b.dataset.view === 'board' && state.settings.view !== 'board' && state.settings.view !== 'calendar' && state.settings.planMode && state.settings.planMode !== 'day') return setView('calendar');   // reopen the last Daily / Weekly / Monthly choice
  setView(b.dataset.view);
});
$('#overdueStat').onclick = () => { allF.status = 'due'; allF.range = 'all'; setView('all'); };
$('#appName').onclick = () => {
  const oc = orgCtx(); if (oc && !oc.support) return;      // organization name is set by Zenvora Loop
  const n = prompt('Name this app:', state.settings.name);
  if (n && n.trim()){ state.settings.name = n.trim().slice(0, 40); save(); render(); }
};
const goBoardDay = k => { if (!k) return; boardDay = k; setAddDay(k); render(); };
$('#prevDay').onclick = () => goBoardDay(shiftDay(boardDay, -1));
$('#nextDay').onclick = () => goBoardDay(shiftDay(boardDay, 1));
$('#todayBtn').onclick = () => goBoardDay(todayKey);
$('#dayPick').onchange = e => goBoardDay(e.target.value);

const calStep = n => { const d = parseDay(calCursor); calCursor = state.settings.calMode === 'month' ? dayKey(new Date(d.getFullYear(), d.getMonth() + n, 1)) : shiftDay(calCursor, 7 * n); renderCalendar(); };
$('#calPrev').onclick = () => calStep(-1);
$('#calNext').onclick = () => calStep(1);
$('#calToday').onclick = () => { calCursor = todayKey; renderCalendar(); };
document.querySelectorAll('.planSeg').forEach(sg => sg.addEventListener('click', e => {      // Daily = kanban · Weekly / Monthly = calendar
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.m === 'day') setView('board');
  else { state.settings.calMode = b.dataset.m; setView('calendar'); }
}));

const insStep = n => { const d = parseDay(insCursor); insCursor = state.settings.insMode === 'month' ? dayKey(new Date(d.getFullYear(), d.getMonth() + n, 1)) : shiftDay(insCursor, 7 * n); renderInsights(); };
$('#insPrev').onclick = () => insStep(-1);
$('#insNext').onclick = () => insStep(1);
$('#insNow').onclick = () => { insCursor = todayKey; renderInsights(); };
$('#insMode').addEventListener('click', e => { const b = e.target.closest('button'); if (b){ state.settings.insMode = b.dataset.m; insCursor = todayKey; save(); renderInsights(); } });
$('#insBody').addEventListener('click', e => { const r = e.target.closest('.lrow'); if (r) openModal(r.dataset.id); });

$('#exportBtn').onclick = () => download(new Blob([JSON.stringify(state, null, 2)], {type:'application/json'}),
  `${state.settings.name.replace(/[^\w\-]+/g, '-').toLowerCase()}-backup-${todayKey}.json`);
const importFile = $('#importFile');
$('#importBtn').onclick = () => importFile.click();
importFile.onchange = () => {
  const f = importFile.files[0]; if (!f) return;
  f.text().then(t => {
    try { const s = JSON.parse(t); if (!Array.isArray(s.items)) throw 0;
      if (confirm(mode === 'cloud' ? 'Replace everything in your account with this backup?' : 'Replace everything in the app with this backup?')){ state = normalize(s); commit(); info('Backup restored.'); }
    } catch(e){ alert('That file is not a valid backup.'); }
    importFile.value = '';
  });
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ov.classList.contains('on')){ closeModal(); return; }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if (!appReady || typing || ov.classList.contains('on') || e.metaKey || e.ctrlKey || e.altKey) return;
  const v = {'1':'board', '2':'calendar', '3':'all', '4':'insights', '5':'attendance', '6':'org'}[e.key];
  if (v){ setView(v); e.preventDefault(); }
  if (e.key === 'n'){ $('#newTitle').focus(); e.preventDefault(); }
});

let rsz; window.addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(() => { if (state.settings.view === 'insights') renderInsights(); if (sideNavOn()) renderSideNav(); }, 150); });
window.addEventListener('storage', e => { if (mode === 'local' && appReady && e.key === KEY){ state = load(); render(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkReminders(); });

