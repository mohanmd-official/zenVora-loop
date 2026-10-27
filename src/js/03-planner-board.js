/* ================= kanban ================= */
function renderBoard(){
  renderOrgRem();
  const past = boardDay < todayKey;
  const items = past ? pastDayItems(boardDay) : state.items.filter(i => i.day === boardDay);
  document.body.classList.toggle('readonly', past);
  $('#dayPick').value = boardDay;
  $('#todayBtn').disabled = boardDay === todayKey;
  const rel = relDay(boardDay);
  $('#boardTitle').textContent = (/^(Today|Tomorrow|Yesterday)$/.test(rel) ? rel + ' · ' : '') + fmtLong(boardDay);
  const done = items.filter(i => i.status === 'done' && !i._snap).length;
  $('#boardStat').textContent = items.length ? `${done}/${items.length} done` : '';
  const b = $('#roBanner');
  if (past){
    const carried = items.filter(i => i._snap).length;
    b.textContent = items.length
      ? `📖 History for ${fmtShort(boardDay)}: ${done} completed` + (carried ? `, ${carried} not finished and carried forward.` : '.') + ' Click a task to see its details.'
      : `📖 Nothing was recorded for ${fmtShort(boardDay)}.`;
    b.hidden = false;
  } else if (boardDay > todayKey){
    b.textContent = `🗓 Planning ahead for ${fmtShort(boardDay)}. Tasks added now go onto that day.`;
    b.hidden = false;
  } else if (!items.length){
    b.textContent = '✨ Plan smarter. Live better. Add your first task for today above.';
    b.hidden = false;
  } else b.hidden = true;
  buildColumns($('#board'), items, {ro:past});
}

function buildColumns(host, items, opt = {}){
  host.innerHTML = '';
  COLS.forEach(col => {
    let list = items.filter(i => i.status === col.id);
    if (col.id === 'todo' && !opt.ro){
      const od = list.filter(isOverdue).sort((a, b) => a.remindAt - b.remindAt);
      list = od.concat(list.filter(i => !isOverdue(i)));
    }
    if (col.id === 'done' && opt.showDay) list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const el = document.createElement('section');
    el.className = 'col'; el.dataset.s = col.id;
    el.innerHTML = `<h2><i class="dot s-${col.id}"></i>${col.name}<span class="n">${list.length}</span></h2><div class="list"></div>`;
    const L = el.querySelector('.list');
    if (!list.length) L.innerHTML = `<div class="empty">${opt.ro ? '—' : 'Drop tasks here'}</div>`;
    list.forEach(it => L.appendChild(cardEl(it, opt)));
    host.appendChild(el);
    if (opt.ro) return;
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('over'); });
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('over');
      const it = byId(e.dataTransfer.getData('text/plain')); if (!it) return;
      const after = [...L.querySelectorAll('.card:not(.dragging)')].find(c => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
      state.items = state.items.filter(i => i !== it);
      setStatus(it, col.id);
      const idx = after ? state.items.findIndex(i => i.id === after.dataset.id) : -1;
      if (idx >= 0) state.items.splice(idx, 0, it); else state.items.push(it);
      placeOrd(it);
      commit();
    });
  });
}

function cardEl(it, opt = {}){
  const ro = !!opt.ro, now = Date.now();
  const od = !ro && isOverdue(it), late = !ro && isLate(it), soon = !ro && isSoon(it);
  const c = document.createElement('div');
  c.className = 'card ' + it.priority + (od ? ' overdue' : '') + (soon ? ' soon' : '') + (ro ? ' ro' : '');
  c.draggable = !ro; c.dataset.id = it.id;
  const idx = ORDER.indexOf(it.status);
  const nc = (it.comments || []).filter(x => !x.sys).length;
  const showRem = !ro && it.remindAt && it.status !== 'done';
  let tags = '';
  if (it.epic) tags += `<span class="epic" title="Added from the clinic">${esc(it.epic)}</span>`;
  if (it._snap) tags += `<span class="carry">↪ moved to ${esc(fmtShort(it.carriedTo))}</span>`;
  else if (!ro && it.carriedFrom && it.status !== 'done') tags += `<span class="carry" title="Not finished on ${esc(fmtShort(it.carriedFrom))}">↪ from ${esc(fmtDM(it.carriedFrom))}${it.carryCount > 1 ? ' ×' + it.carryCount : ''}</span>`;
  if (od) tags += `<span class="badge" title="Not started by its due time, so it was raised to High">OVERDUE ${dur(now - it.remindAt)}</span>`;
  else if (late) tags += `<span class="badge late">LATE ${dur(now - it.remindAt)}</span>`;
  else if (soon) tags += `<span class="badge soon">Due in ${dur(it.remindAt - now)}</span>`;
  if (opt.showDay) tags += `<span class="dchip">${esc(it.status === 'done' && it.doneAt ? '✓ ' + relDay(dayKey(it.doneAt)) : relDay(it.day))}</span>`;
  if (showRem) tags += `<span class="rem ${it.remindAt <= now ? 'due' : ''}" title="Due time">⏰ ${esc(fmtTime(it.remindAt))}</span>`;
  if (nc) tags += `<span>💬 ${nc}</span>`;
  if (it.desc) tags += '<span>📝</span>';
  c.innerHTML = `<div class="t">${esc(it.title)}</div><div class="meta">${tags}${ro ? '' : `<span class="mv">
      ${idx > 0 ? '<button class="ghost" data-mv="-1" title="Move back">◀</button>' : ''}
      ${idx < 2 ? '<button class="ghost" data-mv="1" title="Move forward">▶</button>' : ''}</span>`}</div>`;
  c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', it.id); c.classList.add('dragging'); });
  c.addEventListener('dragend', () => c.classList.remove('dragging'));
  c.addEventListener('click', e => {
    const mv = e.target.closest('[data-mv]');
    if (mv){ e.stopPropagation(); const n = idx + (+mv.dataset.mv); if (n >= 0 && n <= 2){ setStatus(it, ORDER[n]); commit(); } return; }
    openModal(it.id, it._snap ? it : null);
  });
  return c;
}

/* ================= calendar ================= */
function renderCalendar(){
  const mode = state.settings.calMode;
  let start, end, title;
  const a = parseDay(calCursor);
  if (mode === 'month'){
    const first = dayKey(new Date(a.getFullYear(), a.getMonth(), 1));
    const last = dayKey(new Date(a.getFullYear(), a.getMonth() + 1, 0));
    start = weekStart(first); end = shiftDay(weekStart(last), 6);
    title = a.toLocaleDateString([], {month:'long', year:'numeric'});
  } else {
    start = weekStart(calCursor); end = shiftDay(start, 6);
    title = `${fmtDM(start)} – ${fmtDM(end)} ${parseDay(end).getFullYear()}`;
  }
  $('#calTitle').textContent = title;
  $('#calHead').innerHTML = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => `<div>${d}</div>`).join('');
  const grid = $('#cal');
  grid.className = 'cal-grid ' + mode;
  const byDay = {};
  state.items.forEach(it => (byDay[it.day] = byDay[it.day] || []).push(it));
  const max = mode === 'month' ? 3 : 99;
  let html = '';
  for (let k = start; k <= end; k = shiftDay(k, 1)){
    const list = (byDay[k] || []).slice().sort((x, y) => (x.remindAt || 9e15) - (y.remindAt || 9e15) || ST_RANK[x.status] - ST_RANK[y.status]);
    const other = mode === 'month' && parseDay(k).getMonth() !== a.getMonth();
    const moved = k < todayKey ? ((state.history[k] || {}).items || []).filter(x => x.carriedTo).length : 0;
    const dn = list.filter(i => i.status === 'done').length;
    const ratio = list.length && k <= todayKey ? `${dn}/${list.length} ✓` : list.length ? plural(list.length, 'task') : '';
    const chips = list.slice(0, max).map(it => {
      const od = isPastDue(it), drag = it.status !== 'done';
      return `<div class="chip s-${it.status}${od ? ' od' : ''}" data-id="${it.id}" draggable="${drag}" title="${esc(it.title)} · ${colName(it.status)}${it.remindAt ? ' · due ' + esc(fmtTime(it.remindAt)) : ''}">
        <i class="dot s-${od ? 'od' : it.status}"></i>${it.remindAt ? `<span class="tm">${esc(timeOnly(it.remindAt))}</span>` : ''}<span class="tt">${esc(it.title)}</span></div>`;
    }).join('');
    html += `<div class="cell${other ? ' other' : ''}${k === todayKey ? ' today' : ''}${k === calSel ? ' sel' : ''}" data-day="${k}">
      <div class="ch"><button class="dn" title="Open this day's board">${parseDay(k).getDate()}</button>${k >= todayKey ? '<button class="addh" title="Add a task on this day">+</button>' : ''}<span class="ratio">${ratio}</span></div>
      ${chips}
      ${list.length > max ? `<button class="more">+${list.length - max} more</button>` : ''}
      ${moved ? `<div class="moved">↪ ${moved} moved on</div>` : ''}
    </div>`;
  }
  grid.innerHTML = html;
}
function calHandlers(){
  const grid = $('#cal');
  grid.addEventListener('click', e => {
    const cell = e.target.closest('.cell'); if (!cell) return;
    const k = cell.dataset.day;
    const chip = e.target.closest('.chip');
    if (chip){ openModal(chip.dataset.id); return; }
    if (e.target.closest('.dn') || e.target.closest('.more') || k < todayKey){ boardDay = k; setView('board'); return; }
    calSel = k; setAddDay(k); renderCalendar(); $('#newTitle').focus();
  });
  grid.addEventListener('dragstart', e => { const c = e.target.closest('.chip'); if (c) e.dataTransfer.setData('text/plain', c.dataset.id); });
  grid.addEventListener('dragover', e => {
    const cell = e.target.closest('.cell'); if (!cell || cell.dataset.day < todayKey) return;
    e.preventDefault(); grid.querySelectorAll('.cell.over').forEach(x => x !== cell && x.classList.remove('over')); cell.classList.add('over');
  });
  grid.addEventListener('dragleave', e => { const cell = e.target.closest('.cell'); if (cell && !cell.contains(e.relatedTarget)) cell.classList.remove('over'); });
  grid.addEventListener('drop', e => {
    const cell = e.target.closest('.cell'); if (!cell) return;
    e.preventDefault(); cell.classList.remove('over');
    const it = byId(e.dataTransfer.getData('text/plain'));
    if (it && reschedule(it, cell.dataset.day)){ commit(); info(`Moved “${it.title}” to ${relDay(it.day)}`); }
  });
}

/* ================= all tasks ================= */
const allF = {q:'', status:'all', range:'all', pri:'all'};
const allSort = {k:'smart', dir:1};
function periodOf(mode, k){
  if (mode === 'week'){ const s = weekStart(k); return {s, e:shiftDay(s, 6)}; }
  const d = parseDay(k);
  return {s:dayKey(new Date(d.getFullYear(), d.getMonth(), 1)), e:dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0))};
}
function filteredTasks(){
  const q = allF.q.trim().toLowerCase();
  const r = allF.range === 'today' ? {s:todayKey, e:todayKey} : allF.range === 'week' ? periodOf('week', todayKey) : allF.range === 'month' ? periodOf('month', todayKey) : null;
  return state.items.filter(it => {
    if (allF.status === 'due'){ if (!isPastDue(it)) return false; }
    else if (allF.status !== 'all' && it.status !== allF.status) return false;
    if (allF.pri !== 'all' && it.priority !== allF.pri) return false;
    if (allF.range === 'upcoming' && !(it.day > todayKey && it.status !== 'done')) return false;
    if (r && !inScope(it, r.s, r.e)) return false;
    if (q){
      const hay = (it.title + ' ' + (it.desc || '') + ' ' + it.comments.map(c => c.text).join(' ')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
function sortTasks(list){
  const k = allSort.k, d = allSort.dir;
  if (k === 'smart') return list.sort((a, b) =>
    (+isPastDue(b) - +isPastDue(a)) ||
    ((a.status === 'done') - (b.status === 'done')) ||
    (a.status === 'done' ? (b.doneAt || 0) - (a.doneAt || 0)
      : (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || PRI_RANK[a.priority] - PRI_RANK[b.priority] || ST_RANK[b.status] - ST_RANK[a.status]));
  const val = {status:i => ST_RANK[i.status], title:i => i.title.toLowerCase(), pri:i => PRI_RANK[i.priority],
    day:i => i.day, due:i => i.remindAt || 9e15, doneAt:i => i.doneAt || 0};
  return list.sort((a, b) => { const x = val[k](a), y = val[k](b); return (x < y ? -1 : x > y ? 1 : 0) * d; });
}
function renderAll(){
  document.querySelectorAll('#fStatus button').forEach(b => b.classList.toggle('on', b.dataset.s === allF.status));
  document.querySelectorAll('#allLayout button').forEach(b => b.classList.toggle('on', b.dataset.l === state.settings.allLayout));
  $('#fRange').value = allF.range; $('#fPri').value = allF.pri;
  const list = sortTasks(filteredTasks());
  const cnt = s => list.filter(i => i.status === s).length, due = list.filter(isPastDue).length;
  $('#allSummary').textContent = `${plural(list.length, 'task')} · ${cnt('todo')} to do · ${cnt('prog')} in progress · ${cnt('done')} completed` + (due ? ` · ${due} overdue` : '');
  const body = $('#allBody');
  if (state.settings.allLayout === 'board'){
    body.className = 'allbody boardmode';
    body.innerHTML = '<div class="board" id="allBoard"></div>';
    buildColumns($('#allBoard'), list, {showDay:true});
    return;
  }
  body.className = 'allbody';
  if (!list.length){ body.innerHTML = `<div class="empty">${state.items.length ? 'No tasks match these filters.' : 'No tasks yet. Add one above.'}</div>`; return; }
  const th = (k, label) => `<th data-k="${k}">${label}${allSort.k === k ? (allSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  body.innerHTML = `<table class="tbl"><thead><tr>${th('status','Status')}${th('title','Task')}${th('pri','Priority')}${th('day','Scheduled')}${th('due','Due')}${th('doneAt','Completed')}</tr></thead><tbody>${
    list.map(it => {
      const nc = it.comments.filter(c => !c.sys).length;
      const tags = (it.carryCount ? `<span class="tagi" title="Carried over ${it.carryCount}×">↪ ${it.carryCount}×</span>` : '')
        + (nc ? `<span class="tagi">💬 ${nc}</span>` : '') + (it.desc ? '<span class="tagi">📝</span>' : '');
      return `<tr data-id="${it.id}" class="${isPastDue(it) ? 'od' : ''}${it.status === 'done' ? ' isdone' : ''}">
        <td><select class="st s-${it.status}" data-id="${it.id}" aria-label="Status">${COLS.map(c => `<option value="${c.id}"${c.id === it.status ? ' selected' : ''}>${c.name}</option>`).join('')}</select></td>
        <td class="tt"><span class="ttl">${esc(it.title)}</span>${tags}</td>
        <td><i class="pdot p-${it.priority}"></i>${PRI_NAME[it.priority]}</td>
        <td>${esc(relDay(it.day))}</td>
        <td>${it.remindAt ? esc(fmtTime(it.remindAt)) + (isPastDue(it) ? ' ⚠' : '') : '<span class="muted">—</span>'}</td>
        <td>${it.status === 'done' && it.doneAt ? esc(fmt(it.doneAt)) : '<span class="muted">—</span>'}</td></tr>`;
    }).join('')}</tbody></table>`;
}
function allHandlers(){
  $('#q').addEventListener('input', e => { allF.q = e.target.value; renderAll(); });
  $('#fStatus').addEventListener('click', e => { const b = e.target.closest('button'); if (b){ allF.status = b.dataset.s; renderAll(); } });
  $('#fRange').addEventListener('change', e => { allF.range = e.target.value; renderAll(); });
  $('#fPri').addEventListener('change', e => { allF.pri = e.target.value; renderAll(); });
  $('#allLayout').addEventListener('click', e => { const b = e.target.closest('button'); if (b){ state.settings.allLayout = b.dataset.l; save(); renderAll(); } });
  const body = $('#allBody');
  body.addEventListener('change', e => {
    const s = e.target.closest('select.st'); if (!s) return;
    const it = byId(s.dataset.id); if (it){ setStatus(it, s.value); commit(); }
  });
  body.addEventListener('click', e => {
    const h = e.target.closest('th[data-k]');
    if (h){ const k = h.dataset.k; if (allSort.k === k) allSort.dir *= -1; else { allSort.k = k; allSort.dir = (k === 'doneAt' ? -1 : 1); } renderAll(); return; }
    if (e.target.closest('select')) return;
    const tr = e.target.closest('tr[data-id]'); if (tr) openModal(tr.dataset.id);
  });
}

/* ================= insights ================= */
function periodStats(s, e){
  const scope = state.items.filter(it => inScope(it, s, e));
  const done = scope.filter(it => { const d = doneDay(it); return d && d >= s && d <= e; });
  const doneSet = new Set(done);
  return {scope, done, open: scope.filter(it => !doneSet.has(it))};
}
function renderInsights(){
  const mode = state.settings.insMode;
  document.querySelectorAll('#insMode button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
  const P = periodOf(mode, insCursor);
  const cur = P.s <= todayKey && P.e >= todayKey, past = P.e < todayKey, word = mode === 'week' ? 'week' : 'month';
  $('#insNow').textContent = mode === 'week' ? 'This week' : 'This month';
  $('#insNow').disabled = cur;
  $('#insTitle').textContent = mode === 'week'
    ? `${cur ? 'This week · ' : ''}${fmtDM(P.s)} – ${fmtDM(P.e)}`
    : `${cur ? 'This month · ' : ''}${parseDay(P.s).toLocaleDateString([], {month:'long', year:'numeric'})}`;

  const st = periodStats(P.s, P.e);
  const n = st.scope.length, d = st.done.length, rate = pct(d, n);
  const prog = st.open.filter(i => i.status === 'prog'), todo = st.open.filter(i => i.status === 'todo'), later = st.open.filter(i => i.status === 'done');
  const overdue = st.open.filter(isPastDue);
  const carried = st.scope.filter(i => i.carryCount);
  const days = []; for (let k = P.s; k <= P.e; k = shiftDay(k, 1)) days.push(k);
  const rows = days.map(k => ({k, future: k > todayKey, today: k === todayKey,
    planned: state.items.filter(it => inScope(it, k, k)).length,
    done: state.items.filter(it => doneDay(it) === k).length}));
  const elapsed = rows.filter(r => !r.future).length || 1;

  const kpi = (label, val, sub, dot, extra = '') => `<div class="kpi"><div class="kl">${dot ? `<i class="dot ${dot}"></i>` : ''}${label}</div><div class="kv">${val}</div>${extra}<div class="ks">${sub}</div></div>`;
  let tiles = kpi('Scheduled', n, cur ? `on your plate this ${word}` : past ? `on your plate that ${word}` : `planned for that ${word}`)
    + kpi('Completed', d, `avg ${(d / elapsed).toFixed(1)} per day`, 's-done')
    + kpi('Completion', rate + '%', `${d} of ${n} scheduled`, '', `<div class="meter"><i style="width:${rate}%"></i></div>`);
  if (past){
    tiles += kpi('Not finished', st.open.length, later.length ? `${later.length} finished later` : 'carried to the next period', 's-od')
      + kpi('Slipped', carried.length, 'moved to a later day at least once', '');
  } else {
    tiles += kpi('In progress', prog.length, 'started, not finished', 's-prog')
      + kpi('To do', todo.length, carried.length ? `${carried.length} carried over` : 'not started yet', 's-todo')
      + kpi('Overdue', overdue.length, 'past their due time', 's-od');
  }

  const segs = past
    ? [{label:'Completed', v:d, cls:'done'}, {label:'Not finished', v:st.open.length, cls:'od'}]
    : [{label:'Completed', v:d, cls:'done'}, {label:'In progress', v:prog.length - prog.filter(isPastDue).length, cls:'prog'},
       {label:'To do', v:todo.length - todo.filter(isPastDue).length, cls:'todo'}, {label:'Overdue', v:overdue.length, cls:'od'}];

  const trendN = mode === 'week' ? 8 : 6;
  const trend = [];
  for (let i = trendN - 1; i >= 0; i--){
    const k = mode === 'week' ? shiftDay(P.s, -7 * i) : (() => { const x = parseDay(P.s); return dayKey(new Date(x.getFullYear(), x.getMonth() - i, 1)); })();
    const Q = periodOf(mode, k), s2 = periodStats(Q.s, Q.e);
    trend.push({label: mode === 'week' ? fmtDM(Q.s) : parseDay(Q.s).toLocaleDateString([], {month:'short'}),
      full: mode === 'week' ? `Week of ${fmtDM(Q.s)}` : parseDay(Q.s).toLocaleDateString([], {month:'long', year:'numeric'}),
      sched: s2.scope.length, done: s2.done.length, sel: i === 0, future: Q.s > todayKey});
  }

  // highlights
  const hl = [];
  const per = cur ? `this ${word}` : `that ${word}`;
  if (!n) hl.push(`Nothing was scheduled ${per} yet.`);
  else {
    hl.push(`You completed <b>${d}</b> of <b>${n}</b> scheduled tasks ${per} (<b>${rate}%</b>).`);
    const best = rows.filter(r => !r.future && r.done).sort((a, b) => b.done - a.done)[0];
    if (best) hl.push(`Most productive day: <b>${esc(fmtShort(best.k))}</b> with ${plural(best.done, 'task')} completed.`);
    const timed = st.done.filter(i => i.remindAt);
    if (timed.length){ const ok = timed.filter(i => i.doneAt <= i.remindAt + 60000).length; hl.push(`On time: <b>${ok}</b> of ${plural(timed.length, 'task')} with a due time were finished before it.`); }
    if (carried.length){
      const worst = carried.slice().sort((a, b) => b.carryCount - a.carryCount)[0];
      hl.push(`${plural(carried.length, 'task')} slipped to a later day` + (worst.carryCount > 1 ? `. “${esc(worst.title)}” has been carried ${worst.carryCount}×.` : '.'));
    }
    if (overdue.length && !past) hl.push(`<b>${plural(overdue.length, 'task')}</b> past due. They're at the top of your To Do.`);
    const ahead = st.open.filter(i => i.day > todayKey).length;
    if (cur && ahead) hl.push(`${plural(ahead, 'more task')} planned for the rest of the ${word}.`);
  }

  // task lanes
  const lane = (title, dot, list) => `<div class="lane"><h4><i class="dot ${dot}"></i>${title}<span class="n">${list.length}</span></h4><div class="lrows">${
    list.length ? list.map(it => `<div class="lrow${isPastDue(it) && !past ? ' od' : ''}" data-id="${it.id}"><i class="pdot p-${it.priority}"></i><span class="lt">${esc(it.title)}</span><span class="ld">${esc(it.status === 'done' && it.doneAt ? '✓ ' + fmtDM(dayKey(it.doneAt)) : relDay(it.day))}</span></div>`).join('')
    : '<div class="stat" style="padding:4px 2px">None</div>'}</div></div>`;
  const byDue = l => l.slice().sort((a, b) => (+isPastDue(b) - +isPastDue(a)) || (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const lanes = past
    ? lane('Completed', 's-done', st.done) + lane('Not finished', 's-od', st.open)
    : lane('To do', 's-todo', byDue(todo)) + lane('In progress', 's-prog', byDue(prog)) + lane('Completed', 's-done', st.done.slice().sort((a, b) => b.doneAt - a.doneAt));

  $('#insBody').innerHTML = `
    <div class="kpis">${tiles}</div>
    <div class="igrid">
      <div class="box wide"><h3>Scheduled vs completed, by day <span class="sub">how much of each day's plan you finished</span></h3>
        <div class="legend"><span><i class="sw done"></i>Completed</span><span><i class="sw plan"></i>Planned, not completed</span><span><i class="sw future"></i>Planned (upcoming)</span></div>
        <div id="chDaily"></div>
        <details class="tv"><summary>View as table</summary><table><tr><th>Day</th><th>Planned</th><th>Completed</th><th>Rate</th></tr>${
          rows.map(r => `<tr><td>${esc(fmtShort(r.k))}</td><td>${r.planned}</td><td>${r.future ? '—' : r.done}</td><td>${r.future || !r.planned ? '—' : pct(r.done, r.planned) + '%'}</td></tr>`).join('')}</table></details>
      </div>
      <div class="box"><h3>Where things stand</h3><div id="chDonut"></div></div>
      <div class="box"><h3>Completion rate <span class="sub">last ${trendN} ${word}s</span></h3><div id="chTrend"></div></div>
      <div class="box"><h3>Highlights</h3><ul class="hl">${hl.map(h => `<li>${h}</li>`).join('')}</ul></div>
      <div class="box wide"><h3>Tasks ${per}</h3><div class="lanes">${lanes}</div></div>
    </div>`;
  dailyChart($('#chDaily'), rows, mode);
  donutChart($('#chDonut'), segs, n ? rate + '%' : '—', 'completed');
  trendChart($('#chTrend'), trend);
}

/* ---------- charts (hand-drawn SVG, no libraries, works offline) ---------- */
function niceStep(max){ const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p; return Math.max(1, (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p); }
const barPath = (x, y, w, h, round) => {
  if (h <= 0) return '';
  const r = round ? Math.min(4, w / 2, h) : 0;
  return `M${x},${y + h}V${y + r}` + (r ? `Q${x},${y} ${x + r},${y}` : '') + `H${x + w - r}` + (r ? `Q${x + w},${y} ${x + w},${y + r}` : '') + `V${y + h}Z`;
};
function dailyChart(el, rows, mode){
  const W = Math.max(280, el.clientWidth), H = 200, m = {l:30, r:6, t:10, b:26};
  const iw = W - m.l - m.r, ih = H - m.t - m.b, base = m.t + ih;
  const maxV = Math.max(4, ...rows.map(r => r.planned)), step = niceStep(maxV), top = Math.ceil(maxV / step) * step;
  const y = v => base - v / top * ih;
  const band = iw / rows.length, bw = Math.max(4, Math.min(34, band * 0.62));
  const every = Math.max(1, Math.ceil((mode === 'week' ? 50 : 20) / band));
  let s = `<svg width="${W}" height="${H}" role="img" aria-label="Planned versus completed tasks per day"><defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)"><rect width="5" height="5" class="f-plan" opacity=".35"/><rect width="2" height="5" class="f-plan"/></pattern></defs>`;
  for (let v = 0; v <= top; v += step) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="s-grid"/><text x="${m.l - 6}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" class="f-muted">${v}</text>`;
  rows.forEach((r, i) => {
    const cx = m.l + band * i + band / 2, x = cx - bw / 2;
    if (r.future){
      if (r.planned) s += `<path d="${barPath(x, y(r.planned), bw, base - y(r.planned), true)}" fill="url(#hatch)" class="s-muted" stroke-dasharray="3 2" stroke-width="1"/>`;
    } else {
      const rest = r.planned - r.done;
      if (r.done) s += `<path d="${barPath(x, y(r.done), bw, base - y(r.done), rest <= 0)}" class="f-done"/>`;
      if (rest > 0){ const y0 = r.done ? y(r.done) - 2 : base, yt = y(r.planned); s += `<path d="${barPath(x, yt, bw, y0 - yt, true)}" class="f-plan"/>`; }
    }
    const tip = `${fmtShort(r.k)}${r.today ? ' (today)' : ''}\n` + (r.future ? `${plural(r.planned, 'task')} planned` : r.planned ? `${r.done} of ${r.planned} completed (${pct(r.done, r.planned)}%)` : 'Nothing planned');
    s += `<rect class="hit" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" rx="4" data-tip="${esc(tip)}"/>`;
    if (i % every === 0 || r.today){
      const lbl = mode === 'week' ? parseDay(r.k).toLocaleDateString([], {weekday:'short'}) + ' ' + parseDay(r.k).getDate() : String(parseDay(r.k).getDate());
      s += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10.5" class="${r.today ? 'f-ink' : 'f-muted'}" font-weight="${r.today ? 700 : 400}">${r.today && mode === 'week' ? 'Today' : lbl}</text>`;
    }
  });
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${base}" y2="${base}" class="s-base"/></svg>`;
  el.innerHTML = s;
}
function arcPath(cx, cy, r1, r0, a0, a1){
  const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`, L = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r1, a0)}A${r1},${r1} 0 ${L} 1 ${p(r1, a1)}L${p(r0, a1)}A${r0},${r0} 0 ${L} 0 ${p(r0, a0)}Z`;
}
function donutChart(el, segs, big, small){
  const total = segs.reduce((a, b) => a + b.v, 0), S = 150, cx = S / 2, cy = S / 2, r1 = 70, r0 = 50;
  let s = `<svg width="${S}" height="${S}" role="img" aria-label="Task status breakdown">`;
  const live = segs.filter(x => x.v > 0);
  if (!total) s += `<circle cx="${cx}" cy="${cy}" r="${(r1 + r0) / 2}" fill="none" stroke-width="${r1 - r0}" class="s-grid"/>`;
  else if (live.length === 1) s += `<circle cx="${cx}" cy="${cy}" r="${(r1 + r0) / 2}" fill="none" stroke-width="${r1 - r0}" style="stroke:var(--${live[0].cls === 'od' ? 'high' : live[0].cls})" data-tip="${esc(live[0].label + ': ' + live[0].v)}"/>`;
  else {
    const gap = 0.03; let a = -Math.PI / 2;
    live.forEach(g => {
      const span = g.v / total * Math.PI * 2;
      s += `<path d="${arcPath(cx, cy, r1, r0, a + gap / 2, a + span - gap / 2)}" class="f-${g.cls}" data-tip="${esc(`${g.label}: ${g.v} (${pct(g.v, total)}%)`)}"/>`;
      a += span;
    });
  }
  s += `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="24" font-weight="700" class="f-ink">${big}</text><text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="11" class="f-muted">${small}</text></svg>`;
  const leg = segs.map(g => `<div><i class="sw" style="background:var(--${g.cls === 'od' ? 'high' : g.cls})"></i>${g.label}<b>${g.v}</b><span class="pc">${total ? pct(g.v, total) + '%' : ''}</span></div>`).join('');
  el.innerHTML = `<div class="donut">${s}<div class="dleg">${leg}</div></div>`;
}
function trendChart(el, rows){
  const W = Math.max(260, el.clientWidth), H = 170, m = {l:34, r:6, t:16, b:24};
  const iw = W - m.l - m.r, ih = H - m.t - m.b, base = m.t + ih, y = v => base - v / 100 * ih;
  const band = iw / rows.length, bw = Math.max(6, Math.min(30, band * 0.55));
  const every = Math.max(1, Math.ceil(46 / band));
  let s = `<svg width="${W}" height="${H}" role="img" aria-label="Completion rate trend">`;
  [0, 50, 100].forEach(v => s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" class="s-grid"/><text x="${m.l - 6}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" class="f-muted">${v}%</text>`);
  rows.forEach((r, i) => {
    const cx = m.l + band * i + band / 2, rate = pct(r.done, r.sched);
    if (r.sched && !r.future) s += `<path d="${barPath(cx - bw / 2, y(rate), bw, base - y(rate), true)}" class="f-done" opacity="${r.sel ? 1 : .55}"/>`;
    else s += `<text x="${cx}" y="${base - 4}" text-anchor="middle" font-size="10" class="f-muted">–</text>`;
    if (r.sel && r.sched) s += `<text x="${cx}" y="${y(rate) - 5}" text-anchor="middle" font-size="11" font-weight="700" class="f-ink">${rate}%</text>`;
    s += `<rect class="hit" x="${m.l + band * i}" y="${m.t - 10}" width="${band}" height="${ih + 10}" rx="4" data-tip="${esc(`${r.full}\n${r.sched ? `${r.done} of ${r.sched} completed (${rate}%)` : 'Nothing scheduled'}`)}"/>`;
    if (r.sel || (rows.length - 1 - i) % every === 0) s += `<text x="${cx}" y="${H - 7}" text-anchor="middle" font-size="10.5" class="${r.sel ? 'f-ink' : 'f-muted'}" font-weight="${r.sel ? 700 : 400}">${esc(r.label)}</text>`;
  });
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${base}" y2="${base}" class="s-base"/></svg>`;
  el.innerHTML = s;
}

/* ================= add form ================= */
function setAddDay(k){
  const d = !k || k < todayKey ? todayKey : k;
  const inp = $('#newDay'); inp.min = todayKey; inp.value = d;
  $('#newTitle').placeholder = d === todayKey ? 'Add a task for today…' : `Add a task for ${relDay(d)}…`;
}
$('#newDay').addEventListener('change', e => setAddDay(e.target.value));
$('#addForm').addEventListener('submit', e => {
  e.preventDefault();
  const t = $('#newTitle'), tm = $('#newTime');
  const title = t.value.trim(); if (!title) return;
  let day = $('#newDay').value || todayKey; if (day < todayKey) day = todayKey;
  const item = {id:uid(), title, priority:$('#newPri').value, status:'todo', desc:'', comments:[], created:Date.now(), day, plannedDay:day, ord:nextOrd()};
  if (tm.value){
    const [h, mi] = tm.value.split(':').map(Number);
    const d = parseDay(day); d.setHours(h, mi, 0, 0);
    if (d.getTime() <= Date.now()){                       // time already passed today → tomorrow
      d.setDate(d.getDate() + 1); item.day = item.plannedDay = dayKey(d);
      info(`${tm.value} has already passed, so it's scheduled for tomorrow.`);
    }
    item.remindAt = d.getTime(); item.reminded = false;
    askPermission();
  }
  state.items.push(item);
  t.value = ''; tm.value = ''; commit(); t.focus();
});

/* ================= detail modal ================= */
const ov = $('#ov');
const mTitle = $('#mTitle'), mStatus = $('#mStatus'), mPri = $('#mPri'), mDesc = $('#mDesc'), mNew = $('#mNewComment'), mRemind = $('#mRemind'), mDay = $('#mDay');
const curItem = () => openSnap || byId(openId);
function openModal(id, snap){
  openSnap = snap || null; openId = id;
  const it = curItem(); if (!it){ openId = null; return; }
  const ro = !!openSnap;
  $('#modal').classList.toggle('ro', ro);
  [mTitle, mStatus, mPri, mDesc, mRemind, mDay].forEach(x => x.disabled = ro);
  fillModal(it);
  mNew.value = ''; ov.classList.add('on'); if (!ro) mTitle.focus();
}
function fillModal(it){
  mTitle.value = it.title; mStatus.value = it.status; mPri.value = it.priority; mDesc.value = it.desc || '';
  mRemind.value = it.remindAt ? toLocalInput(it.remindAt) : '';
  mDay.value = it.day; mDay.min = todayKey;
  mDay.disabled = !!openSnap || it.status === 'done';
  const bits = [`Created ${fmt(it.created || Date.now())}`];
  if (it.plannedDay && it.plannedDay !== it.day) bits.push(`first planned for ${fmtShort(it.plannedDay)}`);
  if (it.carryCount) bits.push(`carried over ${it.carryCount}×`);
  if (it.status === 'done' && it.doneAt) bits.push(`completed ${fmt(it.doneAt)}`);
  if (openSnap) bits.push(`snapshot from ${fmtShort(it.day)}`);
  $('#mMeta').textContent = bits.join(' · ');
  $('#mLink').hidden = !(it.link && orgCtx() && feat('clinic'));
  $('#mLink').onclick = () => { closeModal(); openLink(it.link); };
  renderComments();
}
function closeModal(){ ov.classList.remove('on'); openId = null; openSnap = null; render(); }
function renderComments(){
  const it = curItem(), box = $('#mComments');
  const cs = it.comments || [];
  box.innerHTML = cs.length ? '' : '<div class="stat">No comments yet.</div>';
  cs.forEach(cm => {
    const d = document.createElement('div'); d.className = 'cm' + (cm.sys ? ' sys' : '');
    const del = openSnap || cm.sys ? '' : '<button class="ghost" title="Delete comment">✕</button>';
    d.innerHTML = `<div class="when">${fmt(cm.at)}${del}</div><div class="txt">${esc(cm.text)}</div>`;
    if (del) d.querySelector('button').onclick = () => { it.comments = it.comments.filter(x => x.id !== cm.id); save(); renderComments(); };
    box.appendChild(d);
  });
}
function upd(fn){ if (openSnap) return; const it = byId(openId); if (it){ fn(it); save(); } }
mTitle.addEventListener('input', () => upd(it => it.title = mTitle.value.trim() || it.title));
mDesc.addEventListener('input', () => upd(it => it.desc = mDesc.value));
mPri.addEventListener('change', () => upd(it => { it.priority = mPri.value; delete it.prevPriority; }));   // your manual choice wins
mStatus.addEventListener('change', () => { upd(it => setStatus(it, mStatus.value)); const it = byId(openId); if (it) fillModal(it); });
mDay.addEventListener('change', () => {
  const it = byId(openId); if (!it) return;
  if (reschedule(it, mDay.value)){ save(); fillModal(it); } else mDay.value = it.day;
});
function setReminder(ms){
  upd(it => {
    if (ms){ it.remindAt = ms; it.reminded = ms <= Date.now(); const k = dayKey(ms); if (k !== it.day && k >= todayKey) reschedule(it, k), it.remindAt = ms; }
    else { delete it.remindAt; delete it.reminded; }
    if (!ms || ms > Date.now()) deescalate(it);
    escalate();
    mPri.value = it.priority; mDay.value = it.day;
  });
  mRemind.value = ms ? toLocalInput(ms) : '';
  if (ms) askPermission();
}
mRemind.addEventListener('change', () => setReminder(mRemind.value ? new Date(mRemind.value).getTime() : null));
$('#mRemClear').onclick = () => setReminder(null);
document.querySelectorAll('.chips [data-q]').forEach(b => b.onclick = () => setReminder(Date.now() + (+b.dataset.q) * 60000));
$('#mIcs').onclick = () => {
  const it = byId(openId); if (!it) return;
  if (!it.remindAt){ info('Set a due time first, then add it to your calendar.'); return; }
  downloadIcs(it);
};
function postComment(){
  const text = mNew.value.trim(); if (!text) return;
  upd(it => it.comments.push({id:uid(), text, at:Date.now()}));
  mNew.value = ''; renderComments();
}
$('#mAddComment').onclick = postComment;
mNew.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) postComment(); });
$('#mClose').onclick = closeModal;
$('#mDelete').onclick = () => {
  if (!confirm('Delete this task?')) return;
  state.items = state.items.filter(i => i.id !== openId); save(); closeModal();
};
ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });

/* ================= reminders & notifications ================= */
const notifBtn = $('#notifBtn');
const canNotify = 'Notification' in window;
function updNotifBtn(){
  if (!canNotify){ notifBtn.hidden = true; return; }
  const p = Notification.permission;
  notifBtn.hidden = p === 'granted';
  notifBtn.textContent = p === 'denied' ? '🔕 Alerts blocked' : '🔔 Enable alerts';
}
function askPermission(){
  if (canNotify && Notification.permission === 'default'){ try { Notification.requestPermission().then(updNotifBtn); } catch(e){} }
}
notifBtn.onclick = () => {
  if (Notification.permission === 'denied'){
    alert('Desktop alerts are blocked for this page.\n\nIn Chrome: click the icon at the left of the address bar (or ⋮ → App info) → Notifications → Allow.\nOn the Mac: System Settings → Notifications → Google Chrome → Allow Notifications.\n\nIn-app reminders with a sound still work while the app is open.');
    return;
  }
  Notification.requestPermission().then(p => {
    updNotifBtn();
    if (p === 'granted') try { new Notification('Alerts enabled ✅', {body:'You will be reminded of tasks with a due time.'}); } catch(e){}
  });
};
function checkReminders(){
  if (!appReady) return;
  const now = Date.now(); let changed = rollover();
  state.items.forEach(it => {
    if (it.remindAt && !it.reminded && it.status !== 'done' && it.remindAt <= now){
      it.reminded = true; changed = true;
      fire(it, now - it.remindAt > 5 * 60000);
    }
  });
  if (escalate()) changed = true;
  if (changed){ save(); render(); }
}
function fire(it, missed){
  const head = (missed ? 'Missed: ' : '⏰ ') + it.title;
  const body = `${missed ? 'Was due' : 'Due'} ${fmtTime(it.remindAt)} · ${colName(it.status)}` + (it.desc ? `\n${it.desc.slice(0, 120)}` : '');
  if (canNotify && Notification.permission === 'granted'){
    try { const n = new Notification(head, {body, tag:it.id, requireInteraction:true}); n.onclick = () => { window.focus(); openModal(it.id); n.close(); }; } catch(e){}
  }
  reminderToast(it, missed); beep(); flashTitle(it.title);
}
function reminderToast(it, missed){
  const t = document.createElement('div');
  t.className = 'toast' + (missed ? ' missed' : '');
  t.innerHTML = `<div class="tt">${missed ? 'Missed reminder' : '⏰ Reminder'}: ${esc(it.title)}</div>
    <div class="tb">${esc(fmtTime(it.remindAt))} · ${colName(it.status)}</div>
    <div class="ta"><button class="primary" data-a="open">Open</button>${it.status === 'todo' ? '<button class="warn" data-a="start">Start now</button>' : ''}<button data-a="snooze">Snooze 10 min</button><button class="ghost" data-a="x">Dismiss</button></div>`;
  t.addEventListener('click', e => {
    const a = (e.target.closest('[data-a]') || {}).dataset?.a; if (!a) return;
    const cur = byId(it.id);
    if (cur){
      if (a === 'open') openModal(cur.id);
      if (a === 'start'){ setStatus(cur, 'prog'); commit(); }
      if (a === 'snooze'){ cur.remindAt = Date.now() + 10 * 60000; cur.reminded = false; deescalate(cur); commit(); }
    }
    t.remove(); stopFlash();
  });
  $('#toasts').appendChild(t);
}
function info(msg){
  const t = document.createElement('div'); t.className = 'toast info';
  t.innerHTML = `<div class="tb" style="margin:0;color:var(--ink)">${esc(msg)}</div>`;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3500);
}
function beep(){
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, .25].forEach(off => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 880;
      g.gain.setValueAtTime(.12, ctx.currentTime + off);
      g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + off + .2);
      o.start(ctx.currentTime + off); o.stop(ctx.currentTime + off + .22);
    });
  } catch(e){}
}
let flashTimer = null;
function flashTitle(text){ stopFlash(); let on = false; flashTimer = setInterval(() => { document.title = (on = !on) ? '⏰ ' + text : state.settings.name; }, 1000); }
function stopFlash(){ clearInterval(flashTimer); flashTimer = null; document.title = state.settings.name; }
window.addEventListener('focus', () => { if (!document.querySelector('.toast:not(.info)')) stopFlash(); });
function downloadIcs(it){
  const local = ms => { const d = new Date(ms); return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`; };
  const utc = ms => new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const e = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Zenvora Loop//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',
    `UID:${it.id}@zenvora-loop`, `DTSTAMP:${utc(Date.now())}`, `DTSTART:${local(it.remindAt)}`, 'DURATION:PT30M',
    `SUMMARY:${e(it.title)}`, `DESCRIPTION:${e(it.desc)}`,
    'BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${e(it.title)}`,'TRIGGER:-PT0M','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
  download(new Blob([ics], {type:'text/calendar'}), `${it.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'task'}.ics`);
}
function download(blob, name){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================= tooltip ================= */
const tip = $('#tip');
document.addEventListener('mousemove', e => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t){ tip.hidden = true; return; }
  tip.textContent = t.getAttribute('data-tip'); tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 10;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 10;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
});
document.addEventListener('mouseleave', () => tip.hidden = true);

