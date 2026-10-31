/* ================= Super Admin: organizations, features, billing, support access ================= */
const supers = {orgs:null, legacy:null, sel:null, inv:null, reqs:null, unsub:null, dUnsub:[], dKey:'', onboard:false, msg:null, share:'', dmsg:null, dshare:'', tmp:'',
  reset(){ if (this.unsub) try { this.unsub(); } catch(e){} this.dUnsub.forEach(u => { try { u(); } catch(e){} }); clearInterval(supportTimer);
    Object.assign(this, {orgs:null, legacy:null, sel:null, inv:null, reqs:null, unsub:null, dUnsub:[], dKey:'', onboard:false, msg:null, share:'', dmsg:null, dshare:''}); }};
let supportTimer = null;
const slugify = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
const isSupportOpen = o => (o.supportUntil || 0) > Date.now();
const OST = {active:['Active', 'on'], suspended:['Suspended', 'sus'], offboarded:['Offboarded', 'gone']};

function supersLoad(){
  if (!cloud || !cloud.isSuper) return;
  const {F, fs} = cloud;
  if (!supers.unsub){
    supers.unsub = F.onSnapshot(F.collection(fs, 'orgs'), qs => {
      supers.orgs = qs.docs.map(d => Object.assign({id:d.id}, d.data()));
      const oc = orgCtx();
      if (oc && oc.support){                                   // keep the support view in step with the org's grant
        const o = supers.orgs.find(x => x.id === oc.orgId);
        if (!o || !isSupportOpen(o) || o.status !== 'active') exitSupport(`Support access to ${oc.org.name} has ended.`);
        else { oc.org = o; refreshTabs(); }
      }
      if (state.settings.view === 'orgs') renderOrgs();
      if (state.settings.view === 'home'){ home.key = ''; renderHome(); }
    }, e => { supers.orgs = []; info('Organizations could not load: ' + (e.code || e.message)); });
    F.getDocs(F.collection(fs, 'accounts')).then(qs => {
      supers.legacy = qs.docs.map(d => Object.assign({uid:d.id}, d.data())).filter(a => !a.orgId && a.email && a.email !== ADMIN_EMAIL && a.role !== 'admin');
      if (state.settings.view === 'orgs') renderOrgs();
    }).catch(() => { supers.legacy = []; });
  }
  const key = supers.sel || '';
  if (supers.dKey !== key){
    supers.dUnsub.forEach(u => { try { u(); } catch(e){} }); supers.dUnsub = []; supers.dKey = key; supers.inv = supers.reqs = null;
    if (key){
      const again = () => { if (state.settings.view === 'orgs' && supers.sel === key) renderOrgs(); };
      supers.dUnsub.push(F.onSnapshot(F.collection(fs, 'orgs', key, 'invoices'), qs => { supers.inv = qs.docs.map(d => Object.assign({id:d.id}, d.data())); again(); }, () => { supers.inv = []; }));
      supers.dUnsub.push(F.onSnapshot(F.collection(fs, 'orgs', key, 'accessRequests'), qs => { supers.reqs = qs.docs.map(d => Object.assign({id:d.id}, d.data())); again(); }, () => { supers.reqs = []; }));
    }
  }
}

function renderOrgs(){
  if (!cloud || !cloud.isSuper) return;
  supersLoad();
  $('#onboardBtn').hidden = !!supers.sel;
  const body = $('#orgsBody');
  if (keepTyping(body)) return;
  body.innerHTML = supers.sel ? orgsDetail() : orgsList();
  numberTables(body);
}

function orgsList(){
  const L = supers.orgs;
  if (!L) return '<div class="empty">Loading organizations…</div>';
  const act = L.filter(o => o.status === 'active');
  if (!supers.tmp) supers.tmp = genPass();
  const onboard = supers.onboard ? `<div class="box"><h3>Onboard a new organization</h3>
    <form class="aform" id="obForm" novalidate>
      <label class="grow">Organization name<input id="obName" autocomplete="off" placeholder="e.g. Abbi's Dental Care"></label>
      <label>Organization ID <span class="stat" style="text-transform:none">(permanent)</span><input id="obId" autocomplete="off" placeholder="from the name"></label>
      <div class="flbl">Theme colour${swatchesHtml('obColor', PALETTE[0])}</div>
      <label>Logo *<input type="file" id="obLogo" accept="image/*"></label>
      <div class="flbl grow">Features${featsHtml('obF', {agenda:true, attendance:true, payroll:false})}</div>
      <label>Plan name<input id="obPlan" value="Standard"></label>
      <label>Monthly fee (₹)<input id="obFee" type="number" min="0" step="50" placeholder="e.g. 999"></label>
      <div style="flex-basis:100%;height:0"></div>
      <label class="grow">Account Manager's name<input id="obAmName" autocomplete="off" placeholder="who runs this organization's account"></label>
      <label class="grow">Account Manager's email<input id="obAmEmail" type="email" autocomplete="off"></label>
      <label>Temporary password<span class="pwgen"><input id="obPass" value="${esc(supers.tmp)}" autocomplete="off"><button type="button" id="obGen" title="Generate a new password">↻</button></span></label>
      <button class="primary" type="submit" id="obSubmit">Onboard</button><button type="button" id="obCancel">Cancel</button>
    </form>
    <p class="stat" style="margin:8px 0 0">The Account Manager becomes the admin of this organization only: they add their own people and decide whether Zenvora Loop support may look inside.</p>
    ${msgHtml(supers.msg)}</div>` : (supers.msg || supers.share ? `<div class="box">${msgHtml(supers.msg)}${shareHtml('obShare', supers.share)}</div>` : '');
  const rows = L.slice().sort((a, b) => (a.status !== 'active') - (b.status !== 'active') || String(a.name).localeCompare(String(b.name))).map(o => {
    const st = OST[o.status] || [o.status, 'off'], f = o.features || {};
    return `<tr class="clk" data-org="${esc(o.id)}">
      <td><div style="display:flex;gap:9px;align-items:center">${o.logo ? `<img src="${o.logo}" style="width:22px;height:22px;object-fit:contain;border-radius:5px;background:#fff">` : `<span class="sw" style="width:16px;height:16px;border-radius:5px;background:${esc(o.color || '#3730A3')}"></span>`}<div><b>${esc(o.name)}</b><span class="sub2">${esc(o.id)}</span></div></div></td>
      <td><span class="upill ${st[1]}">${st[0]}</span></td>
      <td><div class="fchips">${FEATURES.map(([k, l]) => `<span class="fchip${f[k] ? ' on' : ''}">${f[k] ? '' : '<s>'}${l}${f[k] ? '' : '</s>'}</span>`).join('')}</div></td>
      <td>${esc(o.adminEmail || '—')}</td>
      <td class="num">${o.seats || 0}</td>
      <td class="num">${inr((o.plan || {}).fee)}<span class="sub2">${esc((o.plan || {}).name || '')}</span></td>
      <td>${isSupportOpen(o) ? `<span class="upill on">Open until ${esc(fmt(o.supportUntil))}</span>` : '<span class="stat">Closed</span>'}</td></tr>`;
  }).join('');
  const lg = supers.legacy || [];
  const legacy = lg.length && act.length ? `<div class="box legacy"><h3>Logins from before organizations <span class="sub">move each person into their organization; its Account Manager then clicks "Add to team"</span></h3>
    ${lg.map(a => `<div class="req" data-legacy="${esc(a.uid)}"><div class="rq"><b>${esc(a.name || a.email)}</b><span>${esc(a.email)}</span></div><select>${act.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select><button data-mv>Move</button></div>`).join('')}</div>` : '';
  return `<div class="sect">
    <div class="kpis">
      <div class="kpi"><div class="kl">Active organizations</div><div class="kv">${act.length}</div><div class="ks">${L.length - act.length} suspended or offboarded</div></div>
      <div class="kpi"><div class="kl">People</div><div class="kv">${act.reduce((a, o) => a + (o.seats || 0), 0)}</div><div class="ks">active logins</div></div>
      <div class="kpi"><div class="kl">Monthly subscriptions</div><div class="kv">${inr(act.reduce((a, o) => a + (+(o.plan || {}).fee || 0), 0))}</div><div class="ks">active organizations</div></div>
      <div class="kpi"><div class="kl">Support access open</div><div class="kv">${L.filter(isSupportOpen).length}</div><div class="ks">approved by Account Managers</div></div>
    </div>
    ${onboard}
    ${L.length ? `<div class="stat">Click an organization to change its features, theme, plan and billing, or to request support access.</div>
    <div class="awrap" style="margin-top:0"><table class="atbl otbl"><thead><tr><th>Organization</th><th>Status</th><th>Features</th><th>Account Manager</th><th class="num">People</th><th class="num">Plan / month</th><th>Support access</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : (supers.onboard ? '' : '<div class="empty">No organizations yet. Click <b>+ Onboard organization</b> to add your first client.</div>')}
    ${legacy}</div>`;
}

function orgsDetail(){
  const o = (supers.orgs || []).find(x => x.id === supers.sel);
  if (!o) return '<button class="abk" id="orgsBack">← Organizations</button><div class="empty">Loading…</div>';
  const st = OST[o.status] || [o.status, 'off'], p = o.plan || {}, open = isSupportOpen(o);
  const reqs = (supers.reqs || []).slice().sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
  const pending = reqs.find(r => r.status === 'pending');
  const RST = {pending:['Waiting for approval', 'pend'], approved:['Approved', 'on'], denied:['Denied', 'off'], revoked:['Revoked', 'off'], cancelled:['Withdrawn', 'off']};
  const inv = (supers.inv || []).slice().sort((a, b) => String(b.period).localeCompare(String(a.period)));
  const due = inv.filter(i => i.status !== 'paid').reduce((a, i) => a + (+i.amount || 0), 0);
  if (!supers.tmp) supers.tmp = genPass();
  const nextDue = shiftDay(todayKey, 10);
  return `<button class="abk" id="orgsBack">← Organizations</button>
    <div class="ahead">${o.logo ? `<img src="${o.logo}" style="width:38px;height:38px;object-fit:contain;border-radius:10px;background:#fff">` : `<div class="uav" style="background:${esc(o.color || '#3730A3')};border-radius:10px">${initial(o.name)}</div>`}<div><b style="font-size:16px">${esc(o.name)}</b> <span class="upill ${st[1]}">${st[0]}</span><div class="stat">ID ${esc(o.id)} · onboarded ${o.createdAt ? esc(fmtShort(dayKey(o.createdAt))) : '—'} · ${o.seats || 0} ${o.seats === 1 ? 'person' : 'people'}</div></div></div>
    ${shareLinkHtml(linkName(o.id, o), o.name)}
    ${msgHtml(supers.dmsg)}${shareHtml('amShare', supers.dshare)}
    <div class="acards">
      <div class="box"><h3>Plan, features &amp; theme</h3>
        <form class="aform" id="osForm" novalidate>
          <label class="grow">Organization name<input id="osName" value="${esc(o.name)}"></label>
          <div class="flbl">Theme colour${swatchesHtml('osColor', o.color || PALETTE[0])}</div>
          <label class="grow">Sign-in link <span class="stat">${esc(APP_BASE)}…</span><input id="osLink" value="${esc(linkName(o.id, o))}" placeholder="${esc(o.id)}" title="Lower-case letters, numbers and dashes, e.g. abbisdentalcare"></label>
          <label>Logo ${o.logo ? `<img src="${o.logo}" style="height:28px;vertical-align:middle;border-radius:6px">` : '<span class="neg">missing</span>'}<input type="file" id="osLogo" accept="image/*"></label>
          <div class="flbl grow">Features${featsHtml('osF', o.features || {})}</div>
          <label>Plan name<input id="osPlan" value="${esc(p.name || 'Standard')}"></label>
          <label>Monthly fee (₹)<input id="osFee" type="number" min="0" step="50" value="${+p.fee || ''}"></label>
          <button class="primary" type="submit">Save</button>
        </form>
        <p class="stat" style="margin:8px 0 0">Changes apply to everyone in ${esc(o.name)} within seconds.</p>
      </div>
      <div class="box"><h3>Status</h3>
        <p class="stat" style="margin:0 0 8px">${o.status === 'active' ? 'Everyone in this organization can sign in.' : o.status === 'suspended' ? 'Suspended: nobody in this organization can sign in until you reactivate it. Their data is kept.' : 'Offboarded: access is closed. Their data is kept, so you can reactivate them later.'}</p>
        <div class="btnrow">${o.status === 'active' ? '<button data-st="suspended">Suspend</button>' : '<button class="primary" data-st="active">Reactivate</button>'}${o.status !== 'offboarded' ? '<button class="danger" data-st="offboarded">Offboard</button>' : ''}</div>
        <h3 style="margin-top:14px">Account Manager</h3>
        <p class="stat" style="margin:0 0 8px">${esc(o.adminEmail || '—')}. If they leave, give the organization a new Account Manager:</p>
        <form class="aform" id="amForm" novalidate>
          <label class="grow">Name<input id="amName" autocomplete="off"></label>
          <label class="grow">Email<input id="amEmail" type="email" autocomplete="off"></label>
          <label>Temporary password<span class="pwgen"><input id="amPass" value="${esc(supers.tmp)}" autocomplete="off"><button type="button" id="amGen">↻</button></span></label>
          <button type="submit">Assign</button>
        </form>
      </div>
      <div class="box"><h3>Support access <span class="sub">read-only, only with the Account Manager's approval</span></h3>
        ${open ? `<div class="grant" style="margin-bottom:8px">✅ <span style="flex:1">Open until <b>${esc(fmt(o.supportUntil))}</b></span><button class="primary" data-enter="${esc(o.id)}">Open support view</button></div>`
          : pending ? `<p class="stat" style="margin:0 0 8px">Waiting for ${esc(o.adminEmail || 'the Account Manager')} to approve. They've been notified in the app.</p>`
          : `<form class="aform" id="rqForm" novalidate>
              <label class="grow">Reason<input id="rqReason" placeholder="e.g. Checking a payroll mismatch they reported"></label>
              <label>For<select id="rqHours">${DUR.map(([h, l]) => `<option value="${h}"${h === 24 ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
              <button class="primary" type="submit"${o.status !== 'active' ? ' disabled title="Reactivate the organization first"' : ''}>Request access</button>
            </form>`}
        <div class="sect" style="margin-top:8px;gap:6px">${reqs.slice(0, 6).map(r => `<div class="req ${r.status}" data-rq="${esc(r.id)}"><div class="rq"><b>${esc(r.reason || 'Support access')}</b><span>${esc(fmt(r.requestedAt))} · ${esc(durLabel(r.hours))}${r.decidedBy ? ' · by ' + esc(r.decidedBy) : ''}</span></div><span class="upill ${(RST[r.status] || ['', 'off'])[1]}">${(RST[r.status] || [esc(r.status)])[0]}</span>${r.status === 'pending' ? '<button data-cancel>Withdraw</button>' : ''}</div>`).join('')}</div>
      </div>
    </div>
    <div class="box"><h3>Billing <span class="sub">${due ? `<span class="neg">${inr(due)} outstanding</span>` : 'nothing outstanding'}</span></h3>
      <form class="aform" id="invForm" novalidate>
        <label>Invoice for<input type="month" id="ivPer" value="${todayKey.slice(0, 7)}"></label>
        <label>Amount (₹)<input type="number" id="ivAmt" min="0" step="50" value="${+p.fee || ''}"></label>
        <label>Due by<input type="date" id="ivDue" value="${nextDue}"></label>
        <button class="primary" type="submit">Create invoice</button>
      </form>
      <div class="awrap"><table class="atbl"><thead><tr><th>Invoice for</th><th class="num">Amount</th><th>Due by</th><th>Status</th><th>Paid on</th><th></th></tr></thead><tbody>
        ${supers.inv === null ? '<tr><td colspan="6">Loading…</td></tr>' : inv.length ? inv.map(i => `<tr data-inv="${esc(i.id)}"><td>${esc(monthName(i.period))}</td><td class="num">${inr(i.amount)}</td><td>${esc(i.due ? fmtShort(i.due) : '—')}</td><td><span class="upill ${i.status === 'paid' ? 'on' : 'pend'}">${i.status === 'paid' ? 'Paid' : 'Due'}</span></td><td>${i.paidAt ? esc(fmt(i.paidAt)) : '—'}</td>
          <td><div class="uact">${i.status === 'paid' ? '<button data-iv="due">Mark unpaid</button>' : '<button class="primary" data-iv="paid">Mark paid</button>'}<button class="danger" data-iv="del">Delete</button></div></td></tr>`).join('') : '<tr><td colspan="6" class="stat">No invoices yet.</td></tr>'}
      </tbody></table></div>
    </div>`;
}

async function onboardOrg(){
  const {F, fs} = cloud;
  supers.share = '';
  try {
    const name = $('#obName').value.trim(), id = slugify($('#obId').value.trim() || name), color = $('#obColor').value;
    const features = readFeats('obF'), plan = {name:$('#obPlan').value.trim() || 'Standard', fee:Math.max(0, +$('#obFee').value || 0)};
    const amName = $('#obAmName').value.trim(), amEmail = $('#obAmEmail').value.trim().toLowerCase(), pass = $('#obPass').value;
    if (!name) throw custom('Enter the organization name.');
    const logoFile = ($('#obLogo').files || [])[0]; if (!logoFile) throw custom('Upload the organization\'s logo: it is shown at the top of their app.');
    const logo = await logoFromFile(logoFile);
    if (!/^[a-z0-9][a-z0-9-]{1,29}$/.test(id)) throw custom('The organization ID needs 2–30 letters, numbers or dashes.');
    if (!amName || !EMAIL_RE.test(amEmail)) throw custom("Enter the Account Manager's name and a valid email.");
    if (amEmail === ADMIN_EMAIL) throw custom('Use a different email for the Account Manager: this one is the Super Admin.');
    if (pass.length < 8) throw custom('The temporary password needs at least 8 characters.');
    $('#obSubmit').disabled = true;
    if ((await F.getDoc(F.doc(fs, 'orgs', id))).exists()) throw custom(`The ID "${id}" is already used by another organization. Choose another.`);
    let uid;
    try { uid = await createAuthUser(amName, amEmail, pass); }
    catch(err){ if (err.code === 'auth/email-already-in-use') throw custom(`${amEmail} already has a Zenvora Loop login. Use a different email for this Account Manager.`); throw err; }
    { const a = await F.getDoc(F.doc(fs, 'accounts', uid)); if (a.exists() && a.data().orgId) throw custom(`${amEmail} already belongs to an organization. Use a different email.`); }
    const now = Date.now(), by = cloud.user.email || '';
    await F.setDoc(F.doc(fs, 'orgs', id), {name, color, logo, status:'active', features, plan, adminUid:uid, adminEmail:amEmail, seats:1, supportUntil:0, supportBy:'', createdAt:now, createdBy:by});
    await F.setDoc(F.doc(fs, 'orgs', id, 'members', uid), {email:amEmail, name:amName, role:'orgadmin', title:'Account Manager', reportsTo:'', active:true, removed:false, mustChangePassword:true, createdAt:now, createdBy:by});
    await F.setDoc(F.doc(fs, 'accounts', uid), {orgId:id, email:amEmail, createdAt:now});
    supers.onboard = false; supers.tmp = genPass();
    supers.share = inviteText(name, amEmail, pass, id); brandSync(id, {name, color, logo, status:'active'});
    supers.msg = {t:`${name} is live. Send ${amName} their login details: they'll set their own password and can then add their team.`, ok:true};
  } catch(err){ supers.msg = {t:errText(err)}; return formErr('obForm', supers.msg, '#obSubmit'); }
  document.activeElement.blur(); renderOrgs();
}

async function assignAccountManager(o){
  const {F, fs} = cloud;
  supers.dshare = '';
  try {
    const name = $('#amName').value.trim(), email = $('#amEmail').value.trim().toLowerCase(), pass = $('#amPass').value;
    if (!name || !EMAIL_RE.test(email)) throw custom('Enter a name and a valid email.');
    if (email === ADMIN_EMAIL) throw custom('That is the Super Admin account.');
    if (pass.length < 8) throw custom('The temporary password needs at least 8 characters.');
    let uid;
    try { uid = await createAuthUser(name, email, pass); }
    catch(err){ if (err.code === 'auth/email-already-in-use') throw custom(`${email} already has a login. If they're already in ${o.name}, ask the current Account Manager to set their role to Account Manager in People.`); throw err; }
    { const a = await F.getDoc(F.doc(fs, 'accounts', uid)); if (a.exists() && a.data().orgId) throw custom(`${email} already belongs to an organization. If they're in ${o.name}, ask the current Account Manager to make them Account Manager in People.`); }
    const now = Date.now(), by = cloud.user.email || '';
    await F.updateDoc(F.doc(fs, 'orgs', o.id), {adminUid:uid, adminEmail:email});
    await F.setDoc(F.doc(fs, 'orgs', o.id, 'members', uid), {email, name, role:'orgadmin', title:'Account Manager', reportsTo:'', active:true, removed:false, mustChangePassword:true, createdAt:now, createdBy:by});
    await F.setDoc(F.doc(fs, 'accounts', uid), {orgId:o.id, email, createdAt:now});
    supers.tmp = genPass(); supers.dshare = inviteText(o.name, email, pass, linkName(o.id, o));
    supers.dmsg = {t:`${name} is now an Account Manager of ${o.name}.`, ok:true};
  } catch(err){ supers.dmsg = {t:errText(err)}; return formErr('amForm', supers.dmsg, '#amForm button[type=submit]'); }
  document.activeElement.blur(); renderOrgs();
}

function enterSupport(id){
  const o = (supers.orgs || []).find(x => x.id === id);
  if (!o || !isSupportOpen(o)) return info('Support access is not open for this organization.');
  cloud.ctx = {orgId:id, org:o, me:{name:'Zenvora Loop support'}, role:'support', support:true};
  resetFeatures(); orgView.reset(); homeReset(); applyTheme(o.color); refreshTabs();
  orgView.sec = 'people';
  clearInterval(supportTimer);
  supportTimer = setInterval(() => { const oc = orgCtx(); if (oc && oc.support && !isSupportOpen(oc.org)) exitSupport(`Support access to ${oc.org.name} has ended.`); }, 20000);
  setView(ZL.collect('supportView')[0] || 'org');        // a feature may open first (Attendance → team view)
  info(`You're viewing ${o.name} as Zenvora Loop support (read-only).`);
}
function exitSupport(msg){
  if (!cloud) return;
  clearInterval(supportTimer);
  cloud.ctx = null; resetFeatures(); orgView.reset(); homeReset(); applyTheme(null); refreshTabs();
  if (msg) info(msg);
  if (appReady){ state.settings.view = 'orgs'; render(); }
}

$('#onboardBtn').onclick = () => { supers.onboard = true; supers.msg = null; supers.share = ''; supers.sel = null; renderOrgs(); setTimeout(() => { const n = $('#obName'); if (n) n.focus(); }, 0); };
$('#orgsBody').addEventListener('input', e => { if (e.target.id === 'obName' && !$('#obId').dataset.touched) $('#obId').value = slugify(e.target.value); if (e.target.id === 'obId') e.target.dataset.touched = '1'; });
$('#orgsBody').addEventListener('submit', async e => {
  e.preventDefault();
  const {F, fs} = cloud, o = (supers.orgs || []).find(x => x.id === supers.sel);
  if (e.target.id === 'obForm') return onboardOrg();
  if (!o) return;
  if (e.target.id === 'amForm') return assignAccountManager(o);
  try {
    if (e.target.id === 'osForm'){
      const name = $('#osName').value.trim(); if (!name) throw custom('Enter the organization name.');
      const lf = ($('#osLogo').files || [])[0], extra = lf ? {logo:await logoFromFile(lf)} : {};
      const link = ($('#osLink').value || '').trim().toLowerCase() || o.id, oldLink = linkName(o.id, o);
      if (!LINK_RE.test(link)) throw custom('The sign-in link needs 2–30 lower-case letters, numbers or dashes (e.g. abbisdentalcare).');
      if (link !== oldLink){ const t = await F.getDoc(F.doc(fs, 'brand', link)); if (t.exists() && t.data().orgId && t.data().orgId !== o.id) throw custom(`The link "${link}" is already used by another organization.`); }
      extra.link = link;
      await F.updateDoc(F.doc(fs, 'orgs', o.id), {...extra, name, color:$('#osColor').value, features:readFeats('osF'), plan:Object.assign({}, o.plan || {}, {name:$('#osPlan').value.trim() || 'Standard', fee:Math.max(0, +$('#osFee').value || 0)})});
      brandSync(o.id, Object.assign({}, o, extra, {name, color:$('#osColor').value}), linkName(o.id, o));
      info(`Saved ${name}.`);
    }
    if (e.target.id === 'rqForm'){
      const reason = $('#rqReason').value.trim(); if (!reason) throw custom('Say why you need access: the Account Manager sees this.');
      await F.addDoc(F.collection(fs, 'orgs', o.id, 'accessRequests'), {reason, hours:+$('#rqHours').value || 24, status:'pending', requestedAt:Date.now(), by:cloud.user.email || ''});
      info(`Request sent. ${o.adminEmail || 'The Account Manager'} will see it in the app.`);
    }
    if (e.target.id === 'invForm'){
      const period = $('#ivPer').value, amount = Math.max(0, +$('#ivAmt').value || 0), due = $('#ivDue').value;
      if (!/^\d{4}-\d{2}$/.test(period)) throw custom('Pick the month this invoice is for.');
      if (!amount) throw custom('Enter the amount.');
      if ((supers.inv || []).some(i => i.period === period)) throw custom(`There is already an invoice for ${monthName(period)}.`);
      await F.setDoc(F.doc(fs, 'orgs', o.id, 'invoices', period), {period, amount, due, status:'due', createdAt:Date.now()});
      info(`Invoice for ${monthName(period)} created.`);
    }
    document.activeElement.blur(); renderOrgs();
  } catch(err){ info(errText(err)); }
});
$('#orgsBody').addEventListener('click', async e => {
  const {F, fs} = cloud;
  if (e.target.closest('#obGen')){ $('#obPass').value = supers.tmp = genPass(); return; }
  if (e.target.closest('#amGen')){ $('#amPass').value = supers.tmp = genPass(); return; }
  if (e.target.closest('#obCancel')){ supers.onboard = false; supers.msg = null; document.activeElement.blur(); renderOrgs(); return; }
  if (e.target.closest('#orgsBack')){ supers.sel = null; supers.dmsg = null; supers.dshare = ''; renderOrgs(); return; }
  const en = e.target.closest('[data-enter]'); if (en) return enterSupport(en.dataset.enter);
  const mv = e.target.closest('[data-mv]');
  if (mv){
    const box = mv.closest('[data-legacy]'), a = supers.legacy.find(x => x.uid === box.dataset.legacy), orgId = box.querySelector('select').value;
    mv.disabled = true;
    try {
      await F.updateDoc(F.doc(fs, 'accounts', a.uid), {orgId});
      await F.setDoc(F.doc(fs, 'orgs', orgId, 'pending', a.uid), {email:a.email, name:a.name || '', at:Date.now()});
      supers.legacy = supers.legacy.filter(x => x.uid !== a.uid);
      info(`${a.email} moved. The Account Manager will see them under People → "Waiting to join".`); renderOrgs();
    } catch(err){ info('Could not move: ' + errText(err)); mv.disabled = false; }
    return;
  }
  const row = e.target.closest('[data-org]');
  if (row){ supers.sel = row.dataset.org; supers.onboard = false; supers.msg = null; supers.share = ''; supers.dmsg = null; supers.dshare = ''; renderOrgs(); return; }
  const o = (supers.orgs || []).find(x => x.id === supers.sel); if (!o) return;
  const stb = e.target.closest('[data-st]');
  if (stb){
    const to = stb.dataset.st;
    if (to === 'offboarded' && !confirm(`Offboard ${o.name}?\n\nEveryone in ${o.name} loses access immediately. Their data is kept, so you can reactivate them later.`)) return;
    if (to === 'suspended' && !confirm(`Suspend ${o.name}? Nobody there can sign in until you reactivate it.`)) return;
    try { await F.updateDoc(F.doc(fs, 'orgs', o.id), {status:to, statusAt:Date.now()}); brandSync(o.id, Object.assign({}, o, {status:to})); info(`${o.name}: ${OST[to][0].toLowerCase()}.`); } catch(err){ info('That did not work: ' + errText(err)); }
    return;
  }
  const cb = e.target.closest('[data-cancel]');
  if (cb){ try { await F.updateDoc(F.doc(fs, 'orgs', o.id, 'accessRequests', cb.closest('[data-rq]').dataset.rq), {status:'cancelled'}); } catch(err){ info('That did not work: ' + errText(err)); } return; }
  const iv = e.target.closest('[data-iv]');
  if (iv){
    const id = iv.closest('[data-inv]').dataset.inv, ref = F.doc(fs, 'orgs', o.id, 'invoices', id), a = iv.dataset.iv;
    try {
      if (a === 'paid') await F.updateDoc(ref, {status:'paid', paidAt:Date.now()});
      if (a === 'due') await F.updateDoc(ref, {status:'due', paidAt:null});
      if (a === 'del'){ if (!confirm(`Delete the invoice for ${monthName(id)}?`)) return; await F.deleteDoc(ref); }
    } catch(err){ info('That did not work: ' + errText(err)); }
  }
});

