/* ---------- the Planning Board connection ----------
   Clinic work that needs a person's attention becomes a task on their Planning Board, grouped by epic,
   and ticks itself off when the work is done in the clinic. Ids are stable so nothing is duplicated. */
let syncBusy = false, syncTimer2 = null;
function clinicSync(soon){ clearTimeout(syncTimer2); syncTimer2 = setTimeout(clinicSyncNow, soon ? 1200 : 0); }
async function clinicSyncNow(){
  const oc = orgCtx(); if (!oc || oc.support || !feat('clinic') || !appReady || syncBusy) return;
  syncBusy = true; window.__lastSync = Date.now();
  try {
    const {F} = cloud, W = F.where, q = (c, ...w) => F.getDocs(F.query(cCol(c), ...w)).then(docsOf), R = [], mk = todayKey.slice(0, 7), y = shiftDay(todayKey, -1);
    if (!cl.doctors.length) cl.doctors = await q('doctors').catch(() => []);
    if (!cl.types.length) cl.types = await q('treatmentTypes').catch(() => []);
    const tAt = (day, h) => { const d = parseDay(day); d.setHours(h, 0, 0, 0); return d.getTime(); };
    const push = (id, epic, title, o = {}) => R.push(Object.assign({id:'zc-' + id, epic, title, day:todayKey, priority:'med'}, o));
    // ---- organization reminders (one shared copy; anyone can close it for everyone) ----
    const ORG = [], OWN = [], cats = new Set(), ocats = new Set();
    const opush = (cat, id, epic, title, o = {}) => ORG.push(Object.assign({id:'zc-' + id, cat, epic, title, day:todayKey, priority:'med'}, o));
    const wpush = (cat, id, epic, title, o = {}) => OWN.push(Object.assign({id:'zc-' + id, cat, epic, title, day:todayKey, priority:'high'}, o));
    if (can('treatments') === true || can('appointments') === true){ cats.add('sum');
      (await q('appointments', W('summaryPending', '==', true))).forEach(a => opush('sum', 'sum-' + a.id, 'Treatment plan description', `Treatment plan description needs to be updated for ${a.patientName} (${fmtDM(a.date)}, ${dName(a.doctorId)})`, {priority:'high', link:{pid:a.patientId, tab:'appointments'}})); }
    if (can('treatments') === true || can('billing') === true){ cats.add('doc');
      (await q('treatments', W('date', '>=', shiftDay(todayKey, -90)))).filter(t => !isMed(t) && typeNeeds(t) && !t.docAttached && t.status !== 'planned')
        .forEach(t => opush('doc', 'doc-' + t.id, 'Patient documents', `Upload ${typeNeeds(t)} for ${t.patientName} (${t.typeName}, ${fmtDM(t.date)})`, {link:{pid:t.patientId, tab:'docs'}})); }
    if (can('appointments') === true){ cats.add('fu'); cats.add('miss');
      const recent = await q('appointments', W('date', '>=', shiftDay(todayKey, -14)), W('date', '<=', todayKey));
      if (canW('appointments')){                                   // a visit still "Scheduled" after its day is over becomes Missed (and gets a call-back reminder)
        const stale = recent.filter(a => a.date < todayKey && a.status === 'scheduled');
        for (const a of stale){ try { await F.updateDoc(cDoc('appointments', a.id), {status:'missed', autoMissed:true, missedAt:Date.now()}); Object.assign(a, {status:'missed', autoMissed:true}); const c = (cl.appts || []).find(x => x.id === a.id); if (c) Object.assign(c, {status:'missed', autoMissed:true}); } catch(_){} }
        if (stale.length && state.settings.view === 'clinic' && cl.sec === 'appointments') renderClinic();
      }
      recent.filter(a => a.date >= shiftDay(todayKey, -7)).forEach(a => {
        if (a.imported && !a.autoMissed) return;                  // history brought in from Dentee doesn't raise reminders
        if (a.status === 'completed' && a.date >= y) opush('fu', 'fu-' + a.id, 'Patient follow-ups', `Follow up with ${a.patientName}: seen on ${fmtDM(a.date)} by ${dName(a.doctorId)}${a.reason ? ' (' + a.reason + ')' : ''}`, {day:shiftDay(a.date, 1), link:{pid:a.patientId, tab:'appointments'}});
        if (a.status === 'missed' || (a.date < todayKey && ['scheduled', 'waiting'].includes(a.status))){ const d1 = shiftDay(a.date, 1) > todayKey ? shiftDay(a.date, 1) : todayKey;
          opush('miss', 'miss-' + a.id, 'Patient follow-ups', `Call ${a.patientName} to reschedule: missed ${fmtDM(a.date)} ${hm12(a.time)} with ${dName(a.doctorId)}`, {priority:'high', day:d1, link:{pid:a.patientId, tab:'appointments'}}); }
      }); }
    // ---- owner reminders: Account Manager and Chief doctor only ----
    const owner = isOwnerLike();
    if (owner){
      if (oc.role === 'orgadmin') await ensureChiefFlag();
      const pm = mShift(mk, -1), am = cl.ameta || await F.getDoc(cDoc('clinicMeta', 'accounts')).then(s => s.exists() ? s.data() : null).catch(() => null);
      if (am) cl.ameta = am;
      ocats.add('close');
      if (!((am && am.closed) || {})[pm]) wpush('close', 'close-' + pm, 'Accounts', `Close the accounts for ${monthLabel(pm)}${+todayKey.slice(8) > 5 ? ' (was due by the 5th)' : ' by the 5th of this month'}`, {link:{sec:'accounts', tab:'overview', month:pm}});
      if (can('accounts') === true){
        ['commit', 'vendor', 'lab', 'tally', 'pay', 'paysum', 'salpay', 'conspay'].forEach(c => ocats.add(c));
        await payReminders(wpush, q, W);
        const days = [1, 2, 3].map(n => shiftDay(todayKey, -n));
        const [pays, tals] = await Promise.all([q('payments', W('date', '>=', days[2]), W('date', '<=', days[0])), q('tallies', W('date', '>=', days[2]), W('date', '<=', days[0]))]);
        days.forEach(d => { if (pays.some(p => p.date === d) && !tals.some(t => t.date === d)) wpush('tally', 'tally-' + d, 'Daily tally', `Daily tally (cash + GPay / UPI) not done for ${fmtShort(d)}`, {link:{sec:'accounts', tab:'tally', day:d}}); });
        tals.filter(t => t.digitalDiff).forEach(t => wpush('tally', 'tddiff-' + t.date, 'Daily tally', `GPay / UPI, card or bank ${t.digitalDiff > 0 ? 'excess' : 'shortfall'} of ${inr(Math.abs(t.digitalDiff))} on ${fmtShort(t.date)}: review`, {link:{sec:'accounts', tab:'tally', day:t.date}}));
        tals.filter(t => t.diff).forEach(t => wpush('tally', 'tdiff-' + t.date, 'Daily tally', `Cash ${t.diff > 0 ? 'excess' : 'shortfall'} of ${inr(Math.abs(t.diff))} on ${fmtShort(t.date)}: review`, {link:{sec:'accounts', tab:'tally', day:t.date}}));
      }
    }
    await otMerge('orgTasks', ORG, cats, ['fu']);
    if (owner) await otMerge('ownerTasks', OWN, ocats, []);
    // ---- personal: only the visits waiting for your payment ----
    if (can('billing') === true){
      (await q('appointments', W('status', '==', 'billing'))).forEach(a => push('bill-' + a.id, 'Billing pending', `Take payment & complete the visit: ${a.patientName} (${fmtDM(a.date)})`, {priority:'high', link:{pid:a.patientId, tab:'appointments'}}));
    }
    const remChanged = stable(R.map(r => r.id + r.title)) !== stable((cl.reminders || []).map(r => r.id + r.title));
    cl.reminders = R;
    if (remChanged && state.settings.view === 'home') renderSoon('home', () => { if (state.settings.view === 'home') renderHome(); });
    if (!agendaOn()) return;
    let changed = false;
    // older versions copied every clinic reminder onto each person's board: those copies go; the shared ones live in "Organization reminders"
    const before = state.items.length;
    state.items = state.items.filter(it => !/^zc-/.test(it.id) || /^zc-bill-/.test(it.id));
    if (state.items.length !== before) changed = true;
    R.forEach(r => {
      const it = state.items.find(i => i.id === r.id);
      if (!it){ state.items.push({id:r.id, title:r.title, epic:r.epic, link:r.link, priority:r.priority, status:'todo', desc:'Added automatically from the clinic. It ticks itself off when done.', comments:[], created:Date.now(), day:r.day, plannedDay:r.day, ord:nextOrd()}); changed = true; }
      else if (it.status !== 'done' && it.title !== r.title){ it.title = r.title; changed = true; }
    });
    const live = new Set(R.map(r => r.id));
    state.items.forEach(it => { if (/^zc-/.test(it.id) && !live.has(it.id) && it.status !== 'done' && it.day <= todayKey){ it.status = 'done'; it.doneAt = Date.now(); changed = true; } });
    if (changed) commit();
  } catch(e){ console.warn('clinic sync', e); }
  finally { syncBusy = false; }
}
/* Merge freshly worked-out reminders into the shared list (in a transaction, so two people syncing never undo each other):
   new ones are added open; ones whose work is done in the clinic close themselves ("auto"), except follow-ups,
   which stay until a person closes them; closed ones are kept 14 days so everyone can see who closed them. */
/* payment reminders (Account Manager & Chief doctor): one per obligation, linked to its record; never duplicated (fixed ids) */
async function payReminders(wpush, q, W){
  const dd = dueDayOf(), pm = mShift(todayKey.slice(0, 7), -1), cm = todayKey.slice(0, 7), soon = shiftDay(todayKey, 3);
  const whenTxt = due => todayKey > due ? `OVERDUE since ${fmtDM(due)}` : todayKey === due ? 'due TODAY' : `due ${fmtDM(due)}`;
  const [vens, unpaid, ledR] = await Promise.all([q('vendors'), q('ledger', W('kind', '==', 'expense'), W('paid', '==', false)), q('ledger', W('date', '>=', mShift(pm, -1) + '-01'), W('date', '<=', todayKey))]);
  // 1) every unpaid bill / expense: from 3 days before its due date until it is marked paid
  unpaid.forEach(x => { const due = xDue(x); if (due > soon) return; const v = vens.find(z => z.id === x.vendorId) || {}, src = expSource(Object.assign({}, x, {vendorId:x.vendorId && v.type ? x.vendorId : ''}));
    const tab = x.vendorId ? (v.type === 'Lab' ? 'lab' : v.type === 'Materials' ? 'materials' : 'expenses') : 'expenses';
    wpush('pay', 'pay-' + x.id, 'Payments due', `Pay ${x.category}${v.name ? ' · ' + v.name : x.note ? ' · ' + x.note.slice(0, 40) : ''} ${inr(x.amount)} for ${monthLabel(svcMonth(x))}: ${whenTxt(due)}`,
      {priority:todayKey >= due ? 'high' : 'med', link:{sec:'accounts', tab:'expenses', month:svcMonth(x), led:x.id}}); });
  // 2) commitments (rent, EB …) not entered yet for last month / this month once its due date is near
  [pm, cm].forEach(mk => { const due = dueFor(mk); if (due > soon) return;
    const missing = commitStatus(mk, ledR).filter(x => !x.done).map(x => x.c.name);
    if (missing.length) wpush('commit', 'acct-' + mk, 'Payments due', `Enter & pay ${monthLabel(mk)} commitments (${whenTxt(due)}): ${missing.join(', ')}`, {priority:todayKey >= due ? 'high' : 'med', link:{sec:'accounts', tab:'expenses', month:mk}}); });
  // 3) staff salary for last month (people with a salary and no salary payment recorded)
  if (feat('attendance') && payOn()){ const due = dueFor(pm);
    if (due <= soon){ try { const mem = docsOf(await cloud.F.getDocs(cloud.F.collection(cloud.fs, 'orgs', orgCtx().orgId, 'members'))).filter(m => !m.removed && m.active !== false && m.role !== 'orgadmin' && +((m.att || {}).salary) > 0);
      const paidS = (await q('ledger', W('kind', '==', 'expense'), W('category', '==', 'Staff salary'))).filter(x => x.salMonth === pm);
      const left = mem.filter(m => !paidS.some(x => x.staffUid === m.id));
      if (left.length) wpush('salpay', 'sal-' + pm, 'Payments due', `Pay ${monthLabel(pm)} salary (${whenTxt(due)}): ${left.map(m => fullName(m)).join(', ')}`, {priority:todayKey >= due ? 'high' : 'med', link:{sec:'accounts', tab:'salary', month:pm}}); } catch(e){} } }
  // 4) consultants with fees not yet paid (up to the end of last month)
  { const due = dueFor(pm);
    if (due <= soon){ const [fees, man, outs] = await Promise.all([q('treatments', W('consultantFee', '>', 0)), q('ledger', W('kind', '==', 'expense')), q('ledger', W('kind', '==', 'cpayout'))]);
      cl.doctors.filter(c => c.type === 'consultant').forEach(c => { const upto = mEnd(pm);
        const owed = fees.filter(t => t.doctorId === c.id && t.date <= upto).reduce((s2, t) => s2 + (+t.consultantFee || 0), 0) + paidSum(man.filter(x => x.doctorId === c.id && !x.vendorId && (x.date || '') <= upto)) - paidSum(outs.filter(x => x.doctorId === c.id));
        if (owed > 0) wpush('conspay', 'cons-' + c.id + '-' + pm, 'Payments due', `Pay ${c.name} ${inr(owed)} consultant fees up to ${monthLabel(pm)} (${whenTxt(due)})`, {priority:todayKey >= due ? 'high' : 'med', link:{sec:'accounts', tab:'consultants', month:pm}}); }); } }
  // 5) monthly outstanding summary for last month
  { const due = dueFor(pm), xs = unpaid.filter(x => svcMonth(x) === pm);
    if (xs.length) wpush('paysum', 'paysum-' + pm, 'Payments due', `${monthLabel(pm)}: ${plural(xs.length, 'payment')} outstanding (${inr(paidSum(xs))}), ${whenTxt(due)}`, {priority:todayKey >= due ? 'high' : 'med', link:{sec:'accounts', tab:'expenses', month:pm}}); }
}
async function otMerge(docId, items, cats, manualCats){
  if (!cats.size) return;
  const {F, fs} = cloud, ref = cDoc('clinicMeta', docId), now = Date.now(), me = fullName(orgCtx().me) || cloud.user.email || '';
  try {
    await F.runTransaction(fs, async tx => {
      const s = await tx.get(ref), cur = (s.exists() && s.data().items) || {}, live = new Set(items.map(i => i.id));
      let ch = false;
      items.forEach(i => { const c = cur[i.id];
        if (!c){ cur[i.id] = {cat:i.cat, epic:i.epic, title:i.title, day:i.day, priority:i.priority, link:i.link || null, status:'open', createdAt:now}; ch = true; }
        else if (c.status === 'open' && (c.title !== i.title || c.day !== i.day)){ c.title = i.title; c.day = i.day; ch = true; } });
      Object.entries(cur).forEach(([id, c]) => {
        if (c.status === 'open' && cats.has(c.cat) && !manualCats.includes(c.cat) && !live.has(id)){ Object.assign(c, {status:'done', doneHow:'auto', doneBy:cloud.uid, doneName:'Done in the clinic', doneAt:now}); ch = true; }
        if (c.status === 'done' && !live.has(id) && now - (c.doneAt || 0) > 14 * 86400000){ delete cur[id]; ch = true; } });
      if (ch) tx.set(ref, {items:cur, at:now});
    });
  } catch(e){ console.warn('reminders', docId, e); }
}
async function otSet(docId, id, done){
  const {F, fs} = cloud, ref = cDoc('clinicMeta', docId), me = fullName(orgCtx().me) || cloud.user.email || '';
  try {
    await F.runTransaction(fs, async tx => {
      const s = await tx.get(ref), cur = (s.exists() && s.data().items) || {}; if (!cur[id]) return;
      if (done) Object.assign(cur[id], {status:'done', doneHow:'manual', doneBy:cloud.uid, doneName:me, doneAt:Date.now()});
      else Object.assign(cur[id], {status:'open', doneHow:'', doneBy:'', doneName:'', doneAt:0});
      tx.set(ref, {items:cur, at:Date.now()});
    });
    info(done ? 'Closed for everyone in the organization.' : 'Reopened.');
  } catch(e){ info('Could not save: ' + errText(e)); }
}
const isOwnerLike = () => { const oc = orgCtx(); return !!(oc && !oc.support && (oc.role === 'orgadmin' || (oc.me && oc.me.isChief) || cl.doctors.some(d => d.type === 'chief' && d.memberUid === cloud.uid))); };
let chiefChecked = false;
async function ensureChiefFlag(){            // the Chief doctor's login is marked so the rules can show them owner reminders
  if (chiefChecked) return; chiefChecked = true;
  const {F, fs} = cloud, oc = orgCtx();
  for (const d of cl.doctors.filter(x => x.type === 'chief' && x.memberUid)){
    try { const r = F.doc(fs, 'orgs', oc.orgId, 'members', d.memberUid), s = await F.getDoc(r); if (s.exists() && !s.data().isChief) await F.updateDoc(r, {isChief:true}); } catch(e){}
  }
}
/* live copy of the shared reminders for the Planning Board and Home */
function otWatch(){
  const oc = orgCtx(); if (!oc || oc.support || !feat('clinic')) return;
  const key = oc.orgId + '|' + cloud.uid + '|' + isOwnerLike(); if (cl.otKey === key) return; cl.otKey = key;
  (cl.otUnsub || []).forEach(u => { try { u(); } catch(e){} }); cl.otUnsub = [];
  const {F} = cloud, again = () => {
    const v = state.settings.view;
    if (v === 'board') renderSoon('orgrem', renderOrgRem);
    if (v === 'home') renderSoon('home', () => { if (state.settings.view === 'home') renderHome(); });
  };
  cl.otUnsub.push(F.onSnapshot(cDoc('clinicMeta', 'orgTasks'), s => { cl.orgT = (s.exists() && s.data().items) || {}; again(); }, () => { cl.orgT = {}; }));
  if (isOwnerLike()) cl.otUnsub.push(F.onSnapshot(cDoc('clinicMeta', 'ownerTasks'), s => { cl.ownT = (s.exists() && s.data().items) || {}; again(); }, () => { cl.ownT = {}; }));
}
const otList = () => [...Object.entries(cl.orgT || {}).map(([id, t]) => Object.assign({id, src:'orgTasks'}, t)), ...Object.entries(cl.ownT || {}).map(([id, t]) => Object.assign({id, src:'ownerTasks', owner:true}, t))];
const otOpen = () => otList().filter(t => t.status === 'open' && (t.day || '') <= todayKey).sort((a, b) => (b.priority === 'high') - (a.priority === 'high') || (a.createdAt || 0) - (b.createdAt || 0));
const agoTxt = ms => { const h = Math.floor((Date.now() - ms) / 3600000); return h < 1 ? 'just now' : h < 24 ? h + 'h ago' : Math.floor(h / 24) + 'd ago'; };
function otRow(t){
  const open = t.status === 'open';
  return `<div class="otr${open ? '' : ' done'}${t.priority === 'high' && open ? ' hi' : ''}" data-ot="${esc(t.id)}" data-otsrc="${t.src}">
    <div class="otm"><b>${esc(t.title)}</b><div class="otc"><span class="epic">${esc(t.epic)}</span>${t.owner ? '<span class="otown">Account Manager &amp; Chief only</span>' : ''}
      ${open ? `<span class="stat">open since ${esc(agoTxt(t.createdAt || Date.now()))}</span>` : `<span class="otby">✓ ${t.doneHow === 'auto' ? 'Done in the clinic' : 'Closed by ' + esc(t.doneName || '')} · ${esc(fmtTime(t.doneAt))}</span>`}</div></div>
    ${t.link ? '<button data-otopen>Open</button>' : ''}${open ? '<button class="primary" data-otdone>✓ Close</button>' : (t.doneHow === 'auto' ? '' : '<button data-otreopen title="Reopen for everyone">Reopen</button>')}</div>`;
}
let orgRemOpen = (() => { try { return localStorage.getItem('zl-orgrem') !== '0'; } catch(e){ return true; } })();
function renderOrgRem(){
  const host = $('#orgRem'); if (!host) return;
  const oc = orgCtx(); if (!oc || oc.support || !feat('clinic')){ host.innerHTML = ''; return; }
  clLoad(); otWatch();
  const L = otList(), open = otOpen(), done = L.filter(t => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 30);
  host.innerHTML = `<div class="orgrem${orgRemOpen ? ' open' : ''}">
    <button class="orh" data-ortoggle><span class="chev">${orgRemOpen ? '▾' : '▸'}</span><b>Organization reminders</b><span class="orn${open.length ? ' on' : ''}">${open.length} open</span>
      <span class="stat">shared by everyone in ${esc(oc.org.name)}: when one person closes it, it closes for all</span><span class="sp"></span>${done.length ? `<span class="stat">${done.length} closed recently</span>` : ''}</button>
    ${orgRemOpen ? `<div class="orb"><div class="orcol"><div class="orct"><i class="dot s-todo"></i>Open · ${open.length}</div>${open.map(otRow).join('') || '<div class="empty">Nothing open. 🎉</div>'}</div>
      <div class="orcol"><div class="orct"><i class="dot s-done"></i>Closed · last 14 days</div>${done.map(otRow).join('') || '<div class="empty">Nothing closed yet.</div>'}</div></div>` : ''}</div>`;
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-ortoggle]')){ orgRemOpen = !orgRemOpen; try { localStorage.setItem('zl-orgrem', orgRemOpen ? '1' : '0'); } catch(_){} return renderOrgRem(); }
  const r = e.target.closest('[data-ot]'); if (!r) return;
  const t = otList().find(x => x.id === r.dataset.ot && x.src === r.dataset.otsrc); if (!t) return;
  if (e.target.closest('[data-otdone]')) return otSet(t.src, t.id, true);
  if (e.target.closest('[data-otreopen]')) return otSet(t.src, t.id, false);
  if (e.target.closest('[data-otopen]') && t.link) return openLink(t.link);
});
setInterval(() => { if (orgCtx() && appReady) clinicSync(); }, 10 * 60000);
function openLink(link){
  if (!link) return;
  setView('clinic');
  if (link.sec === 'accounts'){ cl.sec = 'accounts'; if (link.tab) cl.acc.tab = link.tab; if (link.day) cl.acc.tday = link.day; if (link.month) cl.acc.month = link.month; cl.acc.hl = link.led || ''; if (link.led) cl.acc.ef = {}; cl.acc.key = '';
    if (state.settings.view !== 'clinic') setView('clinic'); else renderClinic();
    if (link.led) setTimeout(() => { const r = document.querySelector(`#clBody [data-led="${link.led}"]`); if (r) r.scrollIntoView({block:'center', behavior:'smooth'}); }, 900); return; }
  if (link.pid){ cl.sec = 'patients'; cl.ptab = link.tab || 'profile'; clOpenPatient(link.pid); }
}

