/* ================= start (always the last file of the build) ================= */
boot();
window.__zl = {get state(){ return state; }, get mode(){ return mode; }, get ready(){ return appReady; }, shiftDay, parseDay, dayKey, get todayKey(){ return todayKey; }, save};   // test hook
ZL.each('expose', window.__zl);                       // features add theirs (e.g. Payroll: att, attSummary, sessionsOf)
