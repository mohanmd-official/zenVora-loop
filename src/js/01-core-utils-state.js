'use strict';
/* ================= constants & utilities ================= */
const KEY = 'agendaBoard.v1';                     // same storage as earlier versions → data carries over
const COLS = [{id:'todo', name:'To Do'}, {id:'prog', name:'In Progress'}, {id:'done', name:'Completed'}];
const ORDER = COLS.map(c => c.id);
const PRI_NAME = {high:'High', med:'Medium', low:'Low'}, PRI_RANK = {high:0, med:1, low:2}, ST_RANK = {todo:0, prog:1, done:2};
const DEFAULTS = {name:'Zenvora Loop', view:'home', allLayout:'list', calMode:'month', insMode:'week'};
const SOON_MS = 30 * 60000;

const $ = s => document.querySelector(s);
const pad2 = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => { d = new Date(d); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const shiftDay = (k, n) => { const d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d); };
const weekStart = k => shiftDay(k, -((parseDay(k).getDay() + 6) % 7));          // weeks start on Monday
const fmtShort = k => parseDay(k).toLocaleDateString([], {weekday:'short', day:'numeric', month:'short'});
const fmtDM = k => parseDay(k).toLocaleDateString([], {day:'numeric', month:'short'});
const fmtLong = k => parseDay(k).toLocaleDateString([], {weekday:'long', day:'numeric', month:'long'});
const fmt = ts => new Date(ts).toLocaleString([], {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
const timeOnly = ts => new Date(ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
const fmtTime = ts => dayKey(ts) === todayKey ? timeOnly(ts) : fmt(ts);
const toLocalInput = ms => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,16); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const dur = ms => { const m = Math.floor(ms / 60000); if (m < 1) return '<1m'; if (m < 60) return m + 'm';
  const h = Math.floor(m / 60); return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`; };
const colName = id => (COLS.find(c => c.id === id) || {}).name || '';

let todayKey = dayKey();
const relDay = k => k === todayKey ? 'Today' : k === shiftDay(todayKey, 1) ? 'Tomorrow' : k === shiftDay(todayKey, -1) ? 'Yesterday' : fmtShort(k);

/* ================= state ================= */
function normalize(s){
  s.items = Array.isArray(s.items) ? s.items : [];
  s.history = s.history || {};
  s.settings = Object.assign({}, DEFAULTS, s.settings || {});
  if (['Cadence', 'Agendly'].includes(s.settings.name)) s.settings.name = 'Zenvora Loop';   // earlier default names
  s.items.forEach(i => {
    if (!i.day) i.day = dayKey(i.created || Date.now());
    if (!i.plannedDay) i.plannedDay = i.carriedFrom || i.day;
    if (!Array.isArray(i.comments)) i.comments = [];
    if (!i.priority) i.priority = 'med';
  });
  // v1 kept finished tasks of past days only inside the day snapshots → bring them back for stats/calendar
  const ids = new Set(s.items.map(i => i.id));
  Object.entries(s.history).forEach(([d, h]) => (h.items || []).forEach(x => {
    if (x.status === 'done' && !ids.has(x.id)){
      const c = JSON.parse(JSON.stringify(x));
      c.day = c.day || d; c.plannedDay = c.plannedDay || c.carriedFrom || c.day;
      c.comments = c.comments || [];
      if (!c.doneAt) c.doneAt = parseDay(d).getTime() + 12 * 3600e3;
      delete c.carriedTo; s.items.push(c); ids.add(c.id);
    }
  }));
  if (s.items.some(i => typeof i.ord !== 'number')) s.items.forEach((i, n) => i.ord = (n + 1) * 1024);
  s.items.sort((a, b) => a.ord - b.ord);
  return s;
}
function load(){
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.items)) return normalize(s); } catch(e){}
  return normalize({});
}
function save(){
  if (mode === 'cloud'){ if (appReady) scheduleSync(); return; }
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e){}
}

let state = normalize({});
let mode = 'local', appReady = false, appStarted = false;
let boardDay = todayKey, calCursor = todayKey, calSel = null, insCursor = todayKey;
let openId = null, openSnap = null;
const byId = id => state.items.find(i => i.id === id);
const nextOrd = () => state.items.reduce((m, i) => Math.max(m, i.ord || 0), 0) + 1024;
function placeOrd(it){            // give a moved task an order between its new neighbours
  const i = state.items.indexOf(it), p = state.items[i - 1], n = state.items[i + 1];
  it.ord = p && n ? (p.ord + n.ord) / 2 : p ? p.ord + 1024 : n ? n.ord - 1024 : 1024;
}

/* ================= task logic ================= */
const doneDay = it => it.status === 'done' && it.doneAt ? dayKey(it.doneAt) : null;
const isOverdue = it => it.status === 'todo' && it.remindAt && it.remindAt <= Date.now();
const isLate = it => it.status === 'prog' && it.remindAt && it.remindAt <= Date.now();
const isPastDue = it => it.status !== 'done' && !!it.remindAt && it.remindAt <= Date.now();
const isSoon = it => it.status !== 'done' && it.remindAt && it.remindAt > Date.now() && it.remindAt - Date.now() <= SOON_MS;

// The days a task sat on your plate. Finished: planned day → completion day. Open: planned day → today,
// plus its future scheduled day if it was pushed ahead.
function inScope(it, a, b){
  const start = it.plannedDay || it.day;
  if (it.status === 'done'){
    let s = start, e = doneDay(it) || it.day; if (e < s) [s, e] = [e, s];
    return s <= b && e >= a;
  }
  if (it.day <= todayKey){ const s = start < it.day ? start : it.day; return s <= b && todayKey >= a; }
  if (it.day >= a && it.day <= b) return true;                              // scheduled in the future
  return start <= todayKey && start <= b && todayKey >= a;                  // was on an earlier plate, then pushed
}

function setStatus(it, s){
  it.status = s;
  if (s === 'done'){ if (!it.doneAt) it.doneAt = Date.now(); }
  else delete it.doneAt;
}
function escalate(){
  let ch = false;
  state.items.forEach(it => {
    if (isOverdue(it) && !it.escalated){ it.prevPriority = it.priority; it.priority = 'high'; it.escalated = true; ch = true; }
  });
  return ch;
}
function deescalate(it){
  if (!it.escalated) return;
  if (it.prevPriority) it.priority = it.prevPriority;
  delete it.escalated; delete it.prevPriority;
}
function reschedule(it, d){
  if (!d || d < todayKey || it.status === 'done') return false;
  if (it.plannedDay > todayKey || d < it.plannedDay) it.plannedDay = d;
  it.day = d;
  if (it.remindAt){
    const r = new Date(it.remindAt), nd = parseDay(d);
    nd.setHours(r.getHours(), r.getMinutes(), 0, 0);
    it.remindAt = nd.getTime();
    it.reminded = it.remindAt <= Date.now();
    if (it.remindAt > Date.now()) deescalate(it);
  }
  return true;
}

// End of day: snapshot each past day for history, carry unfinished tasks into today.
function rollover(){
  let ch = false;
  const now = dayKey();
  if (now !== todayKey){
    if (boardDay === todayKey) boardDay = now;
    if (calCursor === todayKey) calCursor = now;
    if (insCursor === todayKey) insCursor = now;
    todayKey = now; ch = true; setAddDay(todayKey);
  }
  const days = [...new Set(state.items.filter(i => i.day < todayKey && (i.status !== 'done' || !state.history[i.day])).map(i => i.day))].sort();
  days.forEach(d => {
    const dayItems = state.items.filter(i => i.day === d);
    const snap = JSON.parse(JSON.stringify(dayItems));
    snap.forEach(s => { if (s.status !== 'done') s.carriedTo = todayKey; });
    const prev = state.history[d] ? state.history[d].items.filter(x => !snap.some(s => s.id === x.id)) : [];
    state.history[d] = {items: prev.concat(snap), closedAt: Date.now()};
    dayItems.forEach(it => {
      if (it.status === 'done') return;
      it.day = todayKey;
      it.carriedFrom = it.carriedFrom || d;
      it.carryCount = (it.carryCount || 0) + 1;
      it.comments.push({id:uid(), sys:true, at:Date.now(), text:`↪ Carried over from ${fmtShort(d)} (not completed, was in ${colName(it.status)})`});
    });
    ch = true;
  });
  return ch;
}
function pastDayItems(d){
  const live = state.items.filter(i => i.day === d);
  const ids = new Set(live.map(i => i.id));
  const carried = ((state.history[d] || {}).items || []).filter(x => x.carriedTo && !ids.has(x.id)).map(x => Object.assign({}, x, {_snap:true}));
  return live.concat(carried);
}
function commit(){ rollover(); escalate(); save(); render(); }

