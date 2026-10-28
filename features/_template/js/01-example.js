/* ================= Example feature: the page ================= */
const ex = {key:''};                                 // this feature's own state
function renderExample(){
  const oc = orgCtx();
  $('#exampleBody').innerHTML = `<div class="box"><div class="exhello">Hello ${esc(oc ? fullName(oc.me) : '')} 👋</div>
    <p class="stat">This page comes from features/_template. Read data with cloud.F (Firestore) under orgs/${esc(oc ? oc.orgId : '…')}/example.</p></div>`;
}
