/* ---------- Clinic setup: doctors, treatment list, receipt details ---------- */
function clSetup(){
  const s = cl.settings;
  if (isOwner() && !cl.members && !cl.mLoading){ cl.mLoading = true; cloud.F.getDocs(cloud.F.collection(cloud.fs, 'orgs', orgCtx().orgId, 'members')).then(qs => { cl.members = docsOf(qs).filter(m => !m.removed && m.active); cl.mLoading = false; if (cl.sec === 'setup') renderClinic(); }).catch(() => { cl.mLoading = false; }); }
  return `<div class="clhead"><h2>Clinic setup</h2></div><div class="acards">
    <div class="box"><h3>Doctors <span class="sub">assigned to cases, appointments and treatments</span></h3>
      <form class="aform" id="clDocForm" novalidate>
        <label class="grow">Name<input id="dcName" placeholder="Dr. …"></label>
        <label>Type<select id="dcType">${Object.entries(DTYPE).map(([k, l]) => `<option value="${k}"${k === 'primary' ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Specialty<input id="dcSpec" placeholder="e.g. Endodontist"></label>
        <label>Phone<input id="dcPhone"></label>
        <button class="primary" type="submit">Add doctor</button></form>
      <div class="awrap"><table class="atbl"><thead><tr><th>Doctor</th><th>Post</th>${cl.members ? '<th>Login</th>' : ''}<th></th></tr></thead><tbody>
        ${cl.doctors.map(d => `<tr data-doc="${esc(d.id)}"${d.active === false ? ' style="opacity:.55"' : ''}><td><input type="color" data-dcolor value="${esc(docColor(d.id))}" title="Colour on the appointment tiles" class="dcol"${canW('setup') ? '' : ' disabled'}> <b>${esc(d.name)}</b><span class="sub2">${esc([d.specialty, d.phone].filter(Boolean).join(' · '))}</span></td>
          <td><select data-dtype>${Object.entries(DTYPE).map(([k, l]) => `<option value="${k}"${k === (d.type || 'primary') ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
          ${cl.members ? `<td><select data-doclogin title="Link to this doctor's Zenvora Loop login (the Chief doctor gets daily-tally reminders)"><option value="">— none —</option>${cl.members.map(m => `<option value="${esc(m.id)}"${m.id === d.memberUid ? ' selected' : ''}>${esc(fullName(m))}</option>`).join('')}</select></td>` : ''}
          <td><button data-docact>${d.active === false ? 'Activate' : 'Deactivate'}</button></td></tr>`).join('') || '<tr><td colspan="4" class="stat">No doctors yet.</td></tr>'}
      </tbody></table></div>
      <p class="stat">Consultants get a "Consultant fee" box on each treatment they do; it goes into Accounts automatically. Link the Chief doctor to their login so they get the daily-tally reminders.</p></div>
    <div class="box"><h3>Treatment list &amp; prices <span class="sub">each one is a reporting vertical</span></h3>
      <form class="aform" id="clTypeForm" novalidate><label class="grow">Treatment<input id="tyName" placeholder="e.g. Root canal (RCT)"></label><label>Default price (₹)<input type="number" id="tyCost" min="0" step="50"></label><button class="primary" type="submit">Add</button>
        ${cl.types.length ? '' : '<button type="button" id="tySeed">Add common dental treatments</button>'}</form>
      <div class="awrap"><table class="atbl"><thead><tr><th>Treatment</th><th class="num">Price (₹)</th><th title="Billing this treatment puts a document upload on the Planning Board backlog until it's attached">Needs document</th><th></th></tr></thead><tbody>
        ${cl.types.map(t => `<tr data-ty="${esc(t.id)}"${t.active === false ? ' style="opacity:.55"' : ''}><td>${esc(t.name)}</td><td class="num"><input type="number" data-tycost value="${+t.cost || 0}" min="0" step="50" style="width:100px"></td>
          <td><select data-tyneed><option value="">—</option>${DOC_KINDS.map(k => `<option${k === needsDocOf(t) ? ' selected' : ''}>${k}</option>`).join('')}</select></td><td><button data-tyact>${t.active === false ? 'Activate' : 'Hide'}</button></td></tr>`).join('') || '<tr><td colspan="4" class="stat">No treatments yet.</td></tr>'}
      </tbody></table></div></div>
    <div class="box"><h3>Medicine price list <span class="sub">price per tablet / unit: used for prescriptions and added to the bill</span></h3>
      <form class="aform" id="clMedForm" novalidate><label class="grow">Medicine<input id="mdName" placeholder="e.g. Amoxicillin 500 mg"></label><label>Price (₹) per unit<input type="number" id="mdPrice" min="0" step="0.5"></label>
        <label>Unit<select id="mdUnit">${MED_UNITS.map(u => `<option>${u}</option>`).join('')}</select></label><button class="primary" type="submit">Add</button>
        ${(cl.meds || []).length ? '' : '<button type="button" id="medSeed">Add common dental medicines</button>'}</form>
      <div class="awrap"><table class="atbl"><thead><tr><th>Medicine</th><th>Unit</th><th class="num">Price (₹)</th><th></th></tr></thead><tbody>
        ${(cl.meds || []).map(m => `<tr data-med="${esc(m.id)}"${m.active === false ? ' style="opacity:.55"' : ''}><td>${esc(m.name)}</td><td><select data-medunit>${MED_UNITS.map(u => `<option${u === (m.unit || 'Tablet') ? ' selected' : ''}>${u}</option>`).join('')}</select></td>
          <td class="num"><input type="number" data-medprice value="${+m.price || 0}" min="0" step="0.5" style="width:90px"></td><td><button data-medact>${m.active === false ? 'Activate' : 'Hide'}</button></td></tr>`).join('') || '<tr><td colspan="4" class="stat">No medicines yet.</td></tr>'}
      </tbody></table></div></div>
    <div class="box"><h3>Clinic details <span class="sub">printed on receipts and statements</span></h3>
      <form class="aform" id="clSetForm" novalidate>
        <label class="grow">Clinic name<input id="stName" value="${esc(s.clinicName || orgCtx().org.name)}"></label>
        <label class="grow full">Address<input id="stAddr" value="${esc(s.address || '')}"></label>
        <label>Phone<input id="stPhone" value="${esc(s.phone || '')}"></label><label>GSTIN<input id="stGst" value="${esc(s.gstin || '')}"></label>
        <label>Patient ID prefix<input id="stPre" value="${esc(s.prefix || 'PT')}" maxlength="6" style="min-width:80px"></label>
        <label>Opens<input type="time" id="stOpen" value="${esc(s.open || '09:00')}"></label><label>Closes<input type="time" id="stClose" value="${esc(s.close || '21:00')}"></label>
        <button class="primary" type="submit">Save</button></form>
      ${isOwner() ? `<div class="crow" style="margin-top:10px">${orgCtx().org.logo ? `<img src="${orgCtx().org.logo}" style="height:40px;border-radius:8px">` : '<span class="stat">No logo yet</span>'}<span class="sp"></span><button id="lgUpBtn">${orgCtx().org.logo ? 'Change logo' : 'Upload logo'}</button><input type="file" id="stLogo" accept="image/*" hidden></div>` : ''}</div>
  </div>${dtBox()}`;
}

