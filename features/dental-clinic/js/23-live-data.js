/* ---------- Live copies of the big collections: patients, treatments, payments, bills ----------
   Firestore charges one read per document a query returns. Reports and the patient list used to fetch these whole
   collections every time they opened (thousands of reads each, which used up the free plan's 50,000 reads a day).
   liveCol(c) opens ONE listener per collection for the session: the first load reads each document once, after that only
   added / changed documents are read, and every report or list reuses the copy in memory. With the offline cache on,
   reopening the app within ~30 minutes resumes the listener and is charged only for what changed.
   cl.reset() (sign-out / other organization / permissions changed) closes them. */
function liveCol(c){ return liveQ(c, () => cCol(c)); }
// the same for any query (key names it): one listener per session, then only changes are read
function liveQ(key, make){
  const L = cl.live || (cl.live = {});
  if (L[key]) return L[key].ready.then(() => L[key] ? L[key].docs : []);   // always the latest copy, not the first one
  const e = L[key] = {docs:null, unsub:null};
  e.ready = new Promise((res, rej) => {
    e.unsub = cloud.F.onSnapshot(make(), {includeMetadataChanges:true}, qs => {
      const m = qs.metadata || {};
      if (m.fromCache && !e.docs) return;                     // wait for the server's answer the first time (the offline cache may be partial)
      e.docs = docsOf(qs); res(e.docs); liveChanged(key);
    }, err => { if (L[key] === e) delete L[key]; rej(err); });
  });
  return e.ready;
}
const liveDocs = c => cl.live && cl.live[c] && cl.live[c].docs;
function liveStop(){ Object.values(cl.live || {}).forEach(e => { try { e.unsub && e.unsub(); } catch(x){} }); cl.live = {}; }
// a change arrived: the patient list follows it; reports work it out again next time they're shown
function liveChanged(c){
  if (c === 'patients'){ cl.allP = liveDocs('patients').slice(); if (state.settings.view === 'clinic' && cl.sec === 'patients' && !cl.pid && !cl.newP) renderSoon('clinic', renderClinic); }
  if (cl.rep && cl.rep.data) cl.rep.key = '';            // a report already shown is worked out again (from memory) next time; one still loading isn't interrupted
}
// documents with date in [from, to]: from the live copy when it is already open, else a date-range query (reads only that range)
async function inRange(c, from, to){
  const L = liveDocs(c); if (L) return L.filter(x => x.date >= from && x.date <= to);
  const {F} = cloud; return docsOf(await F.getDocs(F.query(cCol(c), F.where('date', '>=', from), F.where('date', '<=', to))));
}
