const saveAMeta = m => cloud.F.setDoc(cDoc('clinicMeta', 'accounts'), m);
async function readFileData(file){
  if (/^image\//.test(file.type)){ const r = await shrink(file, 1800, 0.8); return {data:r.data, mime:'image/jpeg', name:file.name}; }
  if (file.size > 700000) throw custom('That PDF is larger than 700 KB. Please compress it or upload a photo instead.');
  const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  return {data, mime:file.type || 'application/pdf', name:file.name};
}
async function accSubmit(id, form){
  const {F} = cloud, by = cloud.user.email || '', a = cl.acc, num = s => Math.round(+($(s) || {}).value || 0), val = s => (($(s) || {}).value || '').trim();
  const add = x => F.addDoc(cCol('ledger'), Object.assign({at:Date.now(), by}, x));
  try {
    if (id === 'accExpForm'){
      const vt = form.dataset.vt, raw = +(($('#exAmt') || {}).value || 0), amt = Math.round(raw); if (!(raw > 0)) return info('Enter an amount above ₹0.');
      const vendorId = vt ? val('#exVendor') : ''; if (vt && !vendorId) return info(`Add a ${vt.toLowerCase()} vendor first.`);
      const mode = val('#exMode'), file = ($('#exFile').files || [])[0], date = val('#exDate') || todayKey, svc = val('#exSvc') || date.slice(0, 7), due = val('#exDue'), paidOn = val('#exPaidOn') || todayKey;
      if (date > todayKey) return info("The bill date can't be in the future.");
      if (!/^\d{4}-\d{2}$/.test(svc)) return info('Pick the month this expense is for.');
      if (mode !== 'unpaid' && paidOn > todayKey) return info("The paid date can't be in the future.");
      if (due && due < svc + '-01') return info('The due date is before the month it is for.');
      const desc = vt ? '' : val('#exDesc'); if (!vt && !desc) return info('Describe the expense (e.g. October rent).');
      const cat = vt || val('#exCat'); if (!vt && MODULE_CATS.includes(cat)) return info(`${cat} has its own page in Accounts: enter it there so it isn't counted twice.`);
      const L = ((a.d && a.d.expAll) || []).concat((a.d && a.d.led) || []);
      const dup = L.find(y => y.kind === 'expense' && y.category === cat && svcMonth(y) === svc && +y.amount === amt && (vt ? y.vendorId === vendorId && (y.billNo || '') === val('#exBill') : true));
      if (dup && !confirm(`${cat} of ${inr(amt)} for ${monthLabel(svc)} is already recorded (${fmtShort(dup.date)}${dup.billNo ? ', bill ' + dup.billNo : ''}). Add it again?`)) return;
      if (a.busy) return; a.busy = true;
      const x = {kind:'expense', date, serviceMonth:svc, dueDate:due || dueFor(svc), category:cat, vendorId, amount:amt, billNo:val('#exBill'), gst:num('#exGst'), note:[desc, val('#exNote')].filter(Boolean).join(' · '),
        mode:mode === 'unpaid' ? '' : mode, paid:mode !== 'unpaid', paidAt:mode === 'unpaid' ? null : Date.now(), paidDate:mode === 'unpaid' ? '' : paidOn, hasDoc:!!file, createdBy:by, createdAt:Date.now()};
      const fd = file ? await readFileData(file) : null;
      const ref = await add(x);
      if (fd) await F.setDoc(cDoc('ledgerDocs', ref.id), fd);
      a.pre = null; a.busy = false; if (!vt) a.exAdd = false; info(vt ? 'Bill added.' : 'Expense added.');
    }
    if (id === 'accPinForm'){ if (num('#piAmt') <= 0) return info('Enter the amount.'); if (!val('#piNote')) return info('Add a note for this top-up.'); if (val('#piDate') > todayKey) return info("The date can't be in the future.");
      await add({kind:'petty', date:val('#piDate') || todayKey, mode:'cash', amount:num('#piAmt'), source:val('#piSrc') || 'drawer', note:val('#piNote')}); info(val('#piSrc') === 'drawer' ? 'Petty cash topped up (taken out of the main drawer: shows in that day\'s tally).' : 'Petty cash topped up.'); }
    if (id === 'accPcountForm'){ const raw = val('#pcAmt'); if (raw === '') return info('Enter how much cash is in the petty box now.');
      const counted = Math.max(0, Math.round(+raw || 0)), bal = (a.d && a.d.pettyBal) || 0, diff = counted - bal;
      if (!diff) return info(`The box matches: ${inr(counted)}.`);
      await add(diff > 0 ? {kind:'petty', date:todayKey, mode:'cash', amount:diff, opening:true, note:`Opening balance / box counted: ${inr(counted)} in the box`} : {kind:'pettyspend', date:todayKey, mode:'cash', amount:-diff, adjust:true, note:`Box count correction: ${inr(counted)} in the box`});
      info(`Petty cash balance is now ${inr(counted)}.`); }
    if (id === 'accPoutForm'){ if (num('#poAmt') <= 0) return info('Enter the amount.'); if (!val('#poNote')) return info('Say what the money was spent on.');
      { const bal = (a.d && a.d.pettyBal) || 0; if (num('#poAmt') > bal && !confirm(`Only ${inr(Math.max(0, bal))} is left in the petty box. Record this spend of ${inr(num('#poAmt'))} anyway? Ask the owner to top up.`)) return; } await add({kind:'pettyspend', date:val('#poDate') || todayKey, mode:'cash', amount:num('#poAmt'), note:val('#poNote')}); info('Petty cash spend recorded.'); }
    if (id === 'accVenForm'){ if (!val('#vnName')) return info('Enter the vendor name.'); await F.addDoc(cCol('vendors'), {name:val('#vnName'), type:form.dataset.vt || 'Other', phone:val('#vnPhone'), gstin:val('#vnGst'), notes:val('#vnNotes'), active:true, createdAt:Date.now()}); info('Vendor added.'); }
    if (id === 'accCmForm'){ const n = val('#cmName'); if (!n) return info('Enter the commitment name.'); const m = ameta(); if (m.commitments.some(c => c.name.toLowerCase() === n.toLowerCase())) return info('Already in the list.'); m.commitments.push({id:'c' + Date.now().toString(36), name:n, amount:num('#cmAmt')}); await saveAMeta(m); }
    if (id === 'accCatForm'){ const n = val('#catName'); if (!n) return; const m = ameta(); if (!m.cats.includes(n)) m.cats.push(n); await saveAMeta(m); }
    if (id === 'accIncForm'){ const mk = val('#inMonth'); if (!/^\d{4}-\d{2}$/.test(mk)) return info('Pick the month.'); if (num('#inAmt') <= 0) return info('Enter the amount.'); await add({kind:'income', date:mEnd(mk) > todayKey ? todayKey : mEnd(mk), category:'Past collections', amount:num('#inAmt'), note:val('#inNote') || `Collections · ${monthLabel(mk)}`, mode:'cash'}); info(`Income added to ${monthLabel(mk)}.`); }
    if (id === 'accBulkForm'){
      const rows = val('#bkRows').split(/\n+/).map(l => l.split(/\t|,/).map(s => s.trim())).filter(r => r.length >= 4 && !/^date$/i.test(r[0]));
      const toKey = s => /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : (m => m ? `${m[3]}-${pad2(m[2])}-${pad2(m[1])}` : '')(s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/));
      const ok = [], bad = [];
      rows.forEach((r, i) => { const date = toKey(r[0]), kind = /^inc/i.test(r[1]) ? 'income' : /^exp/i.test(r[1]) ? 'expense' : '', amount = Math.round(+String(r[3]).replace(/[₹,\s]/g, ''));
        if (!date || !kind || !(amount > 0)) bad.push(i + 1); else ok.push({kind, date, category:r[2] || (kind === 'income' ? 'Past collections' : 'Other'), amount, note:r.slice(4).join(', '), mode:'cash', paid:true, at:Date.now(), by, imported:true}); });
      if (!ok.length) return info('No valid rows found. Use: date, income|expense, category, amount, note');
      if (!confirm(`Import ${ok.length} rows${bad.length ? ` (skipping ${bad.length} invalid: line ${bad.slice(0, 5).join(', ')})` : ''}?`)) return;
      for (let i = 0; i < ok.length; i += 400){ const b = F.writeBatch(cloud.fs); ok.slice(i, i + 400).forEach(x => b.set(F.doc(cCol('ledger')), x)); await b.commit(); }
      const m = ameta(), newCats = [...new Set(ok.filter(x => x.kind === 'expense').map(x => x.category))].filter(c => !expCats().includes(c));
      if (newCats.length){ m.cats = m.cats.concat(newCats); await saveAMeta(m); }
      info(`Imported ${ok.length} rows.`);
    }
  } catch(e){ a.busy = false; return info('Could not save: ' + errText(e)); }
  a.key = ''; cl.clear = true; document.activeElement.blur(); renderClinic(); clinicSync(true);
}

