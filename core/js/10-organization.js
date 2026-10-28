/* ================= Organization view: people, org chart, support access, billing ================= */
const orgView = {sec:'people', members:null, reqs:[], invoices:null, pending:[], unsub:[], edit:null, msg:null, share:'', key:'', tmp:'',
  reset(){ this.unsub.forEach(u => { try { u(); } catch(e){} }); Object.assign(this, {members:null, invoices:null, pending:[], unsub:[], edit:null, msg:null, share:'', key:''}); }};
const isOrgAdmin = () => { const oc = orgCtx(); return !!(oc && !oc.support && oc.role === 'orgadmin'); };
const orgDoc = (...p) => cloud.F.doc(cloud.fs, 'orgs', orgCtx().orgId, ...p);
const orgCol = (...p) => cloud.F.collection(cloud.fs, 'orgs', orgCtx().orgId, ...p);

function orgLoad(){
  const oc = orgCtx(); if (!oc) return;
  const key = oc.orgId + '|' + oc.role + '|' + oc.support;
  if (orgView.key === key) return;
  orgView.reset(); orgView.key = key;
  const {F} = cloud, again = () => { if (state.settings.view === 'org' && orgView.key === key) renderOrg(); };
  orgView.unsub.push(F.onSnapshot(orgCol('members'), qs => {
    orgView.members = qs.docs.map(d => Object.assign({uid:d.id}, d.data()));
    if (isOrgAdmin()){                                  // keep the seat count the Super Admin bills on up to date
      const seats = orgView.members.filter(m => m.active && !m.removed).length;
      if (oc.org.seats !== seats) F.updateDoc(F.doc(cloud.fs, 'orgs', oc.orgId), {seats}).catch(() => {});
      dirSync(orgView.members);                         // the names colleagues pick from when giving a task
    }
    again();
  }, e => { orgView.members = []; info('People could not load: ' + (e.code || e.message)); again(); }));
  if (isOrgAdmin()){
    orgView.unsub.push(F.onSnapshot(orgCol('invoices'), qs => { orgView.invoices = qs.docs.map(d => Object.assign({id:d.id}, d.data())); again(); }, () => {}));
    orgView.unsub.push(F.onSnapshot(orgCol('pending'), qs => { orgView.pending = qs.docs.map(d => Object.assign({uid:d.id}, d.data())); again(); }, () => {}));
  }
}

function renderOrg(){
  const oc = orgCtx(); if (!oc) return;
  const admin = isOrgAdmin(), secs = admin ? ['people', 'chart', 'planner', 'support', 'billing'] : ['people', 'chart'];
  if (!secs.includes(orgView.sec)) orgView.sec = 'people';
  document.querySelectorAll('#orgSeg button').forEach(b => { b.hidden = !secs.includes(b.dataset.s); b.classList.toggle('on', b.dataset.s === orgView.sec); });
  const pend = (orgView.reqs || []).filter(r => r.status === 'pending').length;
  $('#orgSeg [data-s=support]').textContent = 'Support access' + (pend ? ` (${pend})` : '');
  $('#orgTitle').innerHTML = `<span class="sw" style="background:${esc(oc.org.color || '#3730A3')}"></span> ${esc(oc.org.name)}`;
  orgLoad();
  const L = orgView.members;
  $('#orgStat').textContent = L ? `${(n => n + (n === 1 ? ' active person' : ' active people'))(L.filter(m => m.active && !m.removed).length)}${oc.support ? ' · read-only support view' : ''}` : '';
  const body = $('#orgBody');
  if (keepTyping(body)) return;
  body.innerHTML = ({people:orgPeople, chart:orgChart, planner:orgPlanner, support:orgSupport, billing:orgBilling})[orgView.sec]();
  numberTables(body);
}

function orgPeople(){
  const oc = orgCtx(), admin = isOrgAdmin(), L = orgView.members;
  if (!L) return '<div class="empty">Loading people…</div>';
  const list = L.filter(m => !m.removed).sort((a, b) => roleRank(a.role) - roleRank(b.role) || fullName(a).localeCompare(fullName(b)));
  const byUid = Object.fromEntries(list.map(m => [m.uid, m]));
  const toOpts = (sel, self) => `<option value="">— Nobody (top of the organization)</option>` + list.filter(m => m.uid !== self).map(m => `<option value="${esc(m.uid)}"${m.uid === sel ? ' selected' : ''}>${esc(fullName(m))}${m.title ? ' · ' + esc(m.title) : ''}</option>`).join('');
  const roleOpts = sel => ['employee', 'manager', 'orgadmin'].map(r => `<option value="${r}"${r === sel ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('');
  if (!orgView.tmp) orgView.tmp = genPass();
  let top = '';
  if (admin){
    top = `<div class="box"><h3>Add a person <span class="sub">creates their login for ${esc(oc.org.name)}</span></h3>
      <form class="aform" id="pAdd" novalidate>
        <label class="grow">Full name<input id="paName" autocomplete="off" placeholder="e.g. Priya S"></label>
        <label class="grow">Email<input id="paEmail" type="email" autocomplete="off" placeholder="name@example.com"></label>
        <label>Job title<input id="paTitle" autocomplete="off" placeholder="e.g. Dental assistant"></label>
        <label>Reports to<select id="paTo">${toOpts(cloud.uid, '')}</select></label>
        <label>Role<select id="paRole">${roleOpts('employee')}</select></label>
        ${ZL.part('person', 'addHtml').join('')}
        <label>Temporary password<span class="pwgen"><input id="paPass" value="${esc(orgView.tmp)}" autocomplete="off"><button type="button" id="paGen" title="Generate a new password">↻</button></span></label>
        <button class="primary" type="submit" id="paSubmit">Create login</button>
      </form>
      <p class="stat" style="margin:8px 0 0"><b>Account Manager</b>: full admin of ${esc(oc.org.name)} · <b>Manager</b>: ${ZL.part('person', 'managerHint').join(', ') || 'helps run the team'} · <b>Employee</b>: their own ${ZL.part('person', 'employeeHint').concat(feat('agenda') ? ['planner'] : []).join(' and ') || 'account'}.</p>
      ${msgHtml(orgView.msg)}${shareHtml('pShare', orgView.share)}
    </div>`;
    if (orgView.pending.length) top += `<div class="box legacy"><h3>Waiting to join <span class="sub">existing Zenvora Loop logins moved to your organization by Zenvora support</span></h3>
      ${orgView.pending.map(p => `<div class="req"><div class="rq"><b>${esc(p.name || p.email)}</b><span>${esc(p.email)}</span></div><button class="primary" data-pend="${esc(p.uid)}">Add to team</button></div>`).join('')}</div>`;
  }
  const rows = list.map(m => {
    const me = m.uid === cloud.uid, mgr = byUid[m.reportsTo];
    if (admin && orgView.edit === m.uid) return `<tr class="peditrow" data-uid="${esc(m.uid)}"><td colspan="7">
      <form class="aform" id="pEdit" data-uid="${esc(m.uid)}">
        <label class="grow">Full name<input id="peName" value="${esc(m.name || '')}"></label>
        <label>Job title<input id="peTitle" value="${esc(m.title || '')}"></label>
        <label>Reports to<select id="peTo">${toOpts(m.reportsTo || '', m.uid)}</select></label>
        <label>Role<select id="peRole"${me ? ' disabled title="You can\'t change your own role"' : ''}>${roleOpts(m.role)}</select></label>
        ${ZL.part('person', 'editHtml', m, me).join('')}
        <button class="primary" type="submit">Save</button><button type="button" data-pa="cancel">Cancel</button>
      </form></td></tr>`;
    const st = !m.active ? ['Disabled', 'off'] : m.mustChangePassword ? ['Awaiting first sign-in', 'pend'] : ['Active', 'on'];
    return `<tr data-uid="${esc(m.uid)}" data-email="${esc(m.email)}">
      <td><div style="display:flex;gap:9px;align-items:center"><div class="uav" style="width:28px;height:28px;font-size:12px">${initial(fullName(m))}</div><div><b>${esc(fullName(m))}</b>${me ? ' <span class="stat">(you)</span>' : ''}<span class="sub2">${esc(m.email)}</span></div></div></td>
      <td>${esc(m.title || '—')}${ZL.part('person', 'titleTags', m).join('')}</td>
      <td>${mgr ? esc(fullName(mgr)) : '<span class="stat">—</span>'}</td>
      <td>${m.role === 'employee' ? 'Employee' : `<em class="rtag" style="margin:0">${ROLE_LABEL[m.role] || m.role}</em>`}${ZL.part('person', 'roleTags', m).join('')}</td>
      <td><span class="upill ${st[1]}">${st[0]}</span></td>
      <td class="stat">${m.lastLogin ? esc(fmt(m.lastLogin)) : 'Never'}</td>
      ${admin ? `<td><div class="uact"><button data-pa="edit">Edit</button>${me ? '' : `<button data-pa="toggle">${m.active ? 'Disable' : 'Enable'}</button><button data-pa="reset" title="Email them a link to choose a new password">Reset password</button><button data-pa="remove" class="danger">Remove</button>`}</div></td>` : ''}
    </tr>`;
  }).join('');
  return `<div class="sect">${top}
    <div class="awrap" style="margin-top:0"><table class="atbl otbl"><thead><tr><th>Person</th><th>Job title</th><th>Reports to</th><th>Role</th><th>Status</th><th>Last seen</th>${admin ? '<th></th>' : ''}</tr></thead>
    <tbody>${rows || `<tr><td colspan="7"><div class="empty">Nobody here yet.</div></td></tr>`}</tbody></table></div>
    ${admin ? '' : '<p class="stat">Only the Account Manager can add people or change roles.</p>'}</div>`;
}

function orgChart(){
  const L = orgView.members;
  if (!L) return '<div class="empty">Loading…</div>';
  const list = L.filter(m => !m.removed), ids = new Set(list.map(m => m.uid)), kids = {};
  const roots = [];
  list.sort((a, b) => roleRank(a.role) - roleRank(b.role) || fullName(a).localeCompare(fullName(b))).forEach(m => {
    if (m.reportsTo && ids.has(m.reportsTo) && m.reportsTo !== m.uid) (kids[m.reportsTo] = kids[m.reportsTo] || []).push(m); else roots.push(m);
  });
  const seen = new Set();
  const node = m => {
    if (seen.has(m.uid)) return ''; seen.add(m.uid);
    const ch = (kids[m.uid] || []).map(node).join('');
    return `<li><div class="tnode${m.active ? '' : ' off'}"><div class="uav">${initial(fullName(m))}</div><div><b>${esc(fullName(m))}</b>${m.role !== 'employee' ? `<em class="rtag">${ROLE_LABEL[m.role]}</em>` : ''}<br><span>${esc(m.title && m.title !== ROLE_LABEL[m.role] ? m.title : m.role === 'employee' ? 'Employee' : '')}${(kids[m.uid] || []).length ? `${m.title && m.title !== ROLE_LABEL[m.role] || m.role === 'employee' ? ' · ' : ''}${plural(kids[m.uid].length, 'direct report')}` : ''}</span></div></div>${ch ? `<ul>${ch}</ul>` : ''}</li>`;
  };
  let html = roots.map(node).join('');
  const orphans = list.filter(m => !seen.has(m.uid));                // reporting loops: show them anyway
  if (orphans.length) html += orphans.map(m => { kids[m.uid] = []; return node(m); }).join('');
  return `<div class="box"><h3>Org chart <span class="sub">who reports to whom${isOrgAdmin() ? ' · change it with Edit → Reports to, in People' : ''}</span></h3>
    ${html ? `<ul class="tree">${html}</ul>` : '<div class="empty">Nobody here yet.</div>'}</div>`;
}

const DUR = [[1, '1 hour'], [24, '24 hours'], [168, '7 days']];
const durLabel = h => (DUR.find(d => d[0] === +h) || [0, `${h} hours`])[1];
/* Planning Board switches for the whole organization (Account Manager): saved on the org as `planner` */
function orgPlanner(){
  const oc = orgCtx(), c = plannerCfg(), agenda = feat('agenda'), rem = ZL.list.filter(f => f.remHint && f.flags && f.flags.some(x => feat(x[0])));
  const sw = (k, on, title, sub, dis) => `<label class="psw${dis ? ' dis' : ''}"><input type="checkbox" data-pl="${k}"${on ? ' checked' : ''}${dis ? ' disabled' : ''}><span class="tg"></span><span class="pst"><b>${title}</b><small>${sub}</small></span></label>`;
  return `<div class="sect"><div class="box"><h3>Planning Board for ${esc(oc.org.name)} <span class="sub">applies to everyone straight away</span></h3>
    ${agenda ? '' : '<p class="stat" style="margin-top:0">The Planning Board is not part of your plan. Ask Zenvora Loop to add it.</p>'}
    <div class="psws">
      ${sw('board', c.board !== false, 'Planning Board for everyone', 'Off: only Account Managers keep the Planning Board. Everyone\'s tasks are kept and come back when you turn it on again.', !agenda)}
      ${sw('rem', c.rem !== false, 'Organization reminders', rem.length ? rem.map(f => f.remHint).join(' · ') + ' on the Planning Board and Home, for everyone. Off: nobody sees them.' : 'Shared reminders on the Planning Board and Home (they come from features such as the Clinic).', !(agenda || rem.length))}
      <div class="psw sel${agenda ? '' : ' dis'}"><span class="pst"><b>Who can give tasks to colleagues</b><small>A task given to someone shows on both boards (theirs and the person who gave it), like Jira. The Account Manager sees who did what in each task's activity.</small></span>
        <select data-pl="assign"${agenda ? '' : ' disabled'}>${[['all', 'Everyone'], ['mgr', 'Managers & Account Managers'], ['off', 'Nobody (switched off)']].map(([v, l]) => `<option value="${v}"${c.assign === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    </div></div></div>`;
}
async function savePlanner(k, v){
  const oc = orgCtx(), cur = Object.assign({board:true, rem:true, assign:'all'}, oc.org.planner || {}), next = Object.assign({}, cur, {[k]:v});
  try { await cloud.F.updateDoc(cloud.F.doc(cloud.fs, 'orgs', oc.orgId), {planner:next}); oc.org.planner = next; info('Saved for everyone in ' + oc.org.name + '.'); render(); }
  catch(err){ info('Could not save: ' + errText(err)); renderOrg(); }
}
function orgSupport(){
  const oc = orgCtx(), org = oc.org, now = Date.now(), open = (org.supportUntil || 0) > now;
  const reqs = (orgView.reqs || []).slice().sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
  const ST = {pending:['Waiting for you', 'pend'], approved:['Approved', 'on'], denied:['Denied', 'off'], revoked:['Revoked', 'off'], cancelled:['Withdrawn', 'off']};
  return `<div class="sect">
    ${open ? `<div class="grant">✅ <span style="flex:1;min-width:220px"><b>Zenvora Loop support can currently view</b> your people and attendance (read-only) until <b>${esc(fmt(org.supportUntil))}</b>.</span><button class="danger" data-sup="revoke">Revoke now</button></div>`
      : `<div class="box"><h3>Zenvora Loop support can't see your data</h3><p class="stat" style="margin:0">Zenvora Loop manages your subscription but cannot see your people, attendance or anyone's planner. If they need to look into an issue, they send a request here: you choose whether to allow a <b>read-only</b> view and for how long. You can revoke it at any time.</p></div>`}
    <div class="box"><h3>Requests</h3>
      ${reqs.length ? reqs.map(r => `<div class="req ${r.status}" data-req="${esc(r.id)}">
        <div class="rq"><b>${esc(r.reason || 'Support access')}</b><span>Asked ${esc(fmt(r.requestedAt))} by ${esc(r.by || 'Zenvora Loop')} · for ${esc(durLabel(r.hours))}${r.status === 'approved' && r.until ? ` · until ${esc(fmt(r.until))}` : ''}</span></div>
        ${r.status === 'pending' ? `<label class="stat">Allow for <select data-h>${DUR.map(([h, l]) => `<option value="${h}"${h === +r.hours ? ' selected' : ''}>${l}</option>`).join('')}</select></label><button class="primary" data-sup="approve">Approve</button><button data-sup="deny">Deny</button>`
          : `<span class="upill ${ST[r.status] ? ST[r.status][1] : 'off'}">${ST[r.status] ? ST[r.status][0] : esc(r.status)}</span>`}
      </div>`).join('') : '<div class="empty">No requests yet.</div>'}
    </div></div>`;
}

function orgBilling(){
  const org = orgCtx().org, p = org.plan || {}, inv = orgView.invoices;
  const due = (inv || []).filter(i => i.status !== 'paid').reduce((a, i) => a + (+i.amount || 0), 0);
  const on = FEATURES.filter(([k]) => (org.features || {})[k]).map(f => f[1]);
  return `<div class="sect"><div class="kpis">
      <div class="kpi"><div class="kl">Plan</div><div class="kv" style="font-size:18px">${esc(p.name || 'Standard')}</div><div class="ks">${esc(on.join(' · ') || 'no features')}</div></div>
      <div class="kpi"><div class="kl">Subscription</div><div class="kv">${inr(p.fee)}</div><div class="ks">per month</div></div>
      <div class="kpi"><div class="kl">People</div><div class="kv">${org.seats || 0}</div><div class="ks">active logins</div></div>
      <div class="kpi"><div class="kl">Outstanding</div><div class="kv ${due ? 'neg' : ''}">${inr(due)}</div><div class="ks">${due ? 'please pay Zenvora Loop' : 'all paid, thank you'}</div></div></div>
    <div class="awrap" style="margin-top:0"><table class="atbl"><thead><tr><th>Invoice for</th><th class="num">Amount</th><th>Due by</th><th>Status</th><th>Paid on</th></tr></thead><tbody>
      ${inv === null ? '<tr><td colspan="5">Loading…</td></tr>' : inv.length ? inv.sort((a, b) => String(b.period).localeCompare(String(a.period))).map(i => `<tr><td>${esc(monthName(i.period))}</td><td class="num">${inr(i.amount)}</td><td>${esc(i.due ? fmtShort(i.due) : '—')}</td><td><span class="upill ${i.status === 'paid' ? 'on' : 'pend'}">${i.status === 'paid' ? 'Paid' : 'Due'}</span></td><td>${i.paidAt ? esc(fmt(i.paidAt)) : '—'}</td></tr>`).join('') : '<tr><td colspan="5" class="stat">No invoices yet.</td></tr>'}
    </tbody></table></div>
    <p class="stat">Billing questions or plan changes: contact Zenvora Loop at ${esc(ADMIN_EMAIL)}.</p></div>`;
}
const monthName = mk => /^\d{4}-\d{2}$/.test(mk || '') ? parseDay(mk + '-01').toLocaleDateString([], {month:'long', year:'numeric'}) : (mk || '—');

function noReportLoop(uid, to){
  const by = Object.fromEntries((orgView.members || []).map(m => [m.uid, m]));
  for (let x = to, n = 0; x && n < 100; x = by[x] && by[x].reportsTo, n++) if (x === uid) return false;
  return true;
}
async function addPerson(){
  const {F, fs} = cloud, oc = orgCtx();
  const name = $('#paName').value.trim(), email = $('#paEmail').value.trim().toLowerCase(), title = $('#paTitle').value.trim();
  const reportsTo = $('#paTo').value, role = $('#paRole').value, pass = $('#paPass').value;
  orgView.share = '';
  try {
    const extra = Object.assign({}, ...ZL.part('person', 'read', 'add', role, null)), {perms = {}} = extra;   // features' fields (clinic access, work timing …)
    delete extra.perms;
    if (!name) throw custom('Enter their name.');
    if (!EMAIL_RE.test(email)) throw custom('Enter a valid email address.');
    if (email === ADMIN_EMAIL) throw custom('That is the Zenvora Loop Super Admin account.');
    if (pass.length < 8) throw custom('The temporary password needs at least 8 characters.');
    const ex = (orgView.members || []).find(m => (m.email || '').toLowerCase() === email);
    if (ex && !ex.removed) throw custom(`${email} is already in ${oc.org.name}.`);
    $('#paSubmit').disabled = true;
    if (ex){                                                   // removed earlier: bring them back
      await F.updateDoc(orgDoc('members', ex.uid), Object.assign({active:true, removed:false, name, title, reportsTo, role}, extra));
      await F.sendPasswordResetEmail(cloud.auth, email);
      orgView.msg = {t:`${email} was in ${oc.org.name} before. Access is restored and a password-reset email was sent.`, ok:true};
    } else {
      const pend = orgView.pending.find(p => (p.email || '').toLowerCase() === email);
      if (pend){ await joinPending(pend.uid, {name, title, reportsTo, role}); orgView.msg = {t:`${email} already had a login and has joined ${oc.org.name}.`, ok:true}; }
      else {
        let uid;
        try { uid = await createAuthUser(name, email, pass); }
        catch(err){ if (err.code === 'auth/email-already-in-use') throw custom(`${email} already has a Zenvora Loop login (from before organizations, or in another organization). Ask Zenvora Loop (${ADMIN_EMAIL}) to move it into ${oc.org.name}: it then appears here under "Waiting to join" and you click Add to team.`); throw err; }
        const now = Date.now();
        await F.setDoc(F.doc(fs, 'accounts', uid), {orgId:oc.orgId, email, createdAt:now});
        const mg = (orgView.members || []).find(m => m.uid === reportsTo);
        await F.setDoc(orgDoc('members', uid), Object.assign({email, name, title, reportsTo, reportsToName:mg ? fullName(mg) : '', reportsToTitle:mg ? (mg.title || ROLE_LABEL[mg.role] || '') : '', role, perms, active:true, removed:false, mustChangePassword:true, createdAt:now, createdBy:cloud.user.email || ''}, extra));
        orgView.share = inviteText(oc.org.name, email, pass);
        orgView.msg = {t:`${name} can now sign in. Share the login details below.`, ok:true};
      }
    }
    orgView.tmp = genPass();
  } catch(err){ orgView.msg = {t:errText(err)}; return formErr('pAdd', orgView.msg, '#paSubmit'); }
  document.activeElement.blur(); renderOrg();
  if (orgView.msg && orgView.msg.ok){ ['#paName', '#paEmail', '#paTitle'].forEach(s => { const el = $(s); if (el) el.value = ''; }); }
}
async function joinPending(uid, extra){
  const {F} = cloud, p = orgView.pending.find(x => x.uid === uid); if (!p) return;
  await F.setDoc(orgDoc('members', uid), Object.assign({email:(p.email || '').toLowerCase(), name:p.name || '', title:'', reportsTo:'', role:'employee', active:true, removed:false, mustChangePassword:false, createdAt:Date.now(), createdBy:cloud.user.email || ''}, extra || {}));
  await F.deleteDoc(orgDoc('pending', uid));
}
$('#orgSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b){ orgView.sec = b.dataset.s; orgView.edit = null; orgView.msg = null; renderOrg(); } });
$('#orgBody').addEventListener('change', e => {
  const pl = e.target.closest('[data-pl]'); if (pl) return savePlanner(pl.dataset.pl, pl.type === 'checkbox' ? pl.checked : pl.value);
});
$('#orgBody').addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'pAdd') return addPerson();
  if (e.target.id === 'pEdit'){
    const uid = e.target.dataset.uid, upd = {name:$('#peName').value.trim(), title:$('#peTitle').value.trim(), reportsTo:$('#peTo').value};
    if (!$('#peRole').disabled) upd.role = $('#peRole').value;
    try { Object.assign(upd, ...ZL.part('person', 'read', 'edit', upd.role, (orgView.members || []).find(m => m.uid === uid) || {})); } catch(err){ return info(err.message); }
    if (!upd.name) return info('Enter their name.');
    if (!noReportLoop(uid, upd.reportsTo)) return info("That would make a reporting loop: pick someone who doesn't report to this person.");
    { const mg = (orgView.members || []).find(m => m.uid === upd.reportsTo); upd.reportsToName = mg ? fullName(mg) : ''; upd.reportsToTitle = mg ? (mg.title || ROLE_LABEL[mg.role] || '') : ''; }
    try { await cloud.F.updateDoc(orgDoc('members', uid), upd); orgView.edit = null; document.activeElement.blur(); renderOrg(); info('Saved.'); }
    catch(err){ info('Could not save: ' + errText(err)); }
  }
});
$('#orgBody').addEventListener('click', async e => {
  const {F} = cloud;
  if (e.target.closest('#paGen')){ $('#paPass').value = orgView.tmp = genPass(); return; }
  const pend = e.target.closest('[data-pend]');
  if (pend){ pend.disabled = true; try { await joinPending(pend.dataset.pend); info('Added to the team.'); } catch(err){ info('Could not add: ' + errText(err)); pend.disabled = false; } return; }
  const pa = e.target.closest('[data-pa]');
  if (pa){
    const row = pa.closest('[data-uid]'), uid = row.dataset.uid, m = (orgView.members || []).find(x => x.uid === uid), a = pa.dataset.pa;
    if (a === 'edit'){ orgView.edit = uid; renderOrg(); return; }
    if (a === 'cancel'){ orgView.edit = null; document.activeElement.blur(); renderOrg(); return; }
    pa.disabled = true;
    try {
      if (a === 'toggle'){ await F.updateDoc(orgDoc('members', uid), {active:!m.active}); info(m.active ? `${m.email} can no longer sign in (signed out immediately).` : `${m.email} can sign in again.`); }
      if (a === 'reset'){ await F.sendPasswordResetEmail(cloud.auth, m.email); info(`Password-reset email sent to ${m.email}.`); }
      if (a === 'remove'){
        if (!confirm(`Remove ${fullName(m)} from ${orgCtx().org.name}?\n\nThey lose access immediately. Their attendance history is kept, and adding the same email again later restores it.`)){ pa.disabled = false; return; }
        await F.updateDoc(orgDoc('members', uid), {active:false, removed:true}); info(`${m.email} has been removed.`);
      }
    } catch(err){ info('That did not work: ' + errText(err)); pa.disabled = false; }
    return;
  }
  const sup = e.target.closest('[data-sup]');
  if (sup){
    const oc = orgCtx(), now = Date.now(), act = sup.dataset.sup, by = cloud.user.email || '';
    sup.disabled = true;
    try {
      if (act === 'revoke'){
        await F.updateDoc(F.doc(cloud.fs, 'orgs', oc.orgId), {supportUntil:0, supportBy:''});
        await Promise.all((orgView.reqs || []).filter(r => r.status === 'approved' && (r.until || 0) > now).map(r => F.updateDoc(orgDoc('accessRequests', r.id), {status:'revoked', decidedAt:now, decidedBy:by})));
        info('Support access revoked.');
      } else {
        const box = sup.closest('[data-req]'), r = orgView.reqs.find(x => x.id === box.dataset.req);
        if (act === 'approve'){
          const h = +box.querySelector('[data-h]').value || 1, until = now + h * 3600000;
          await F.updateDoc(F.doc(cloud.fs, 'orgs', oc.orgId), {supportUntil:until, supportBy:r.by || ADMIN_EMAIL});
          await F.updateDoc(orgDoc('accessRequests', r.id), {status:'approved', hours:h, until, decidedAt:now, decidedBy:by});
          info(`Approved: Zenvora Loop support can view ${oc.org.name} (read-only) until ${fmt(until)}.`);
        }
        if (act === 'deny'){ await F.updateDoc(orgDoc('accessRequests', r.id), {status:'denied', decidedAt:now, decidedBy:by}); info('Request denied.'); }
      }
    } catch(err){ info('That did not work: ' + errText(err)); sup.disabled = false; }
  }
});

/* the Account Manager is told the moment Zenvora Loop support asks for access */
function watchSupportRequests(){
  if (cloud.reqUnsub){ try { cloud.reqUnsub(); } catch(e){} cloud.reqUnsub = null; }
  $('#reqBell').hidden = true; orgView.reqs = [];
  if (!isOrgAdmin()) return;
  const {F} = cloud, seen = new Set();
  const u = F.onSnapshot(orgCol('accessRequests'), qs => {
    orgView.reqs = qs.docs.map(d => Object.assign({id:d.id}, d.data()));
    const pend = orgView.reqs.filter(r => r.status === 'pending');
    $('#reqBell').hidden = !pend.length;
    $('#reqBell').textContent = `🛟 Support request${pend.length > 1 ? 's (' + pend.length + ')' : ''}`;
    pend.forEach(r => {
      if (seen.has(r.id)) return; seen.add(r.id);
      const t = document.createElement('div'); t.className = 'toast supreq';
      t.innerHTML = `<div class="tt">🛟 Zenvora Loop support is asking for access</div><div class="tb">${esc(r.reason || '')} · read-only, for ${esc(durLabel(r.hours))}</div><div class="ta"><button class="primary" data-review>Review</button><button data-x>Later</button></div>`;
      t.querySelector('[data-review]').onclick = () => { t.remove(); orgView.sec = 'support'; setView('org'); };
      t.querySelector('[data-x]').onclick = () => t.remove();
      $('#toasts').appendChild(t);
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Zenvora Loop support is asking for access', {body:(r.reason || '') + ' · open Organization → Support access to decide'}); } catch(e){}
    });
    if (state.settings.view === 'org') renderOrg();
  }, () => {});
  cloud.reqUnsub = u; unsubs.push(u);
}

