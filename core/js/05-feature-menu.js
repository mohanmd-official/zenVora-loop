/* ================= sub-menus people can reorder by dragging (Accounts tabs, report tabs, patient tabs, clinic menu) ================= */
const ORD_KEY = k => 'zl-ord-' + k + '-' + ((cloud && cloud.uid) || 'local');
function ordOf(k){ const so = state.settings.subOrder; if (so && Array.isArray(so[k])) return so[k]; try { return JSON.parse(localStorage.getItem(ORD_KEY(k)) || '[]'); } catch(e){ return []; } }
function ordered(k, list){ const o = ordOf(k); if (!o.length) return list; const ix = x => { const i = o.indexOf(x[0]); return i < 0 ? 999 : i; }; return list.map((x, i) => [x, i]).sort((a, b) => ix(a[0]) - ix(b[0]) || a[1] - b[1]).map(x => x[0]); }
function saveOrd(k, keys){
  try { localStorage.setItem(ORD_KEY(k), JSON.stringify(keys)); } catch(e){}
  if (agendaOn()){ state.settings.subOrder = Object.assign({}, state.settings.subOrder || {}, {[k]:keys}); commit(); }
}
(() => {
  let dragB = null, startO = '';
  const host = b => b && b.parentElement && b.parentElement.matches('[data-ord]') ? b.parentElement : null;
  document.addEventListener('mousedown', e => { const b = e.target.closest('[data-ord] > :is(button,a)'); if (b) b.draggable = true; }, true);
  document.addEventListener('dragstart', e => { const b = e.target.closest && e.target.closest('[data-ord] > :is(button,a)'); if (!b) return; dragB = b; window.__ordDrag = true; startO = [...b.parentElement.children].map(x => x.textContent).join('|'); b.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'ord'); } catch(_){} });
  document.addEventListener('dragover', e => {
    if (!dragB) return; const h = host(dragB); if (!h) return; const vert = h.dataset.ordv === '1';
    if (!nearHost(h, e, vert)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; dragPlace(h, dragB, e, vert);
  });
  document.addEventListener('drop', e => { if (dragB) e.preventDefault(); });
  document.addEventListener('dragend', () => { window.__ordDrag = false; if (!dragB) return; const h = host(dragB); dragB.classList.remove('dragging');
    if (h && [...h.children].map(x => x.textContent).join('|') === startO){ const b = dragB; dragB = null; b.click(); return; }   // nothing moved: it was a click
    if (h) saveOrd(h.dataset.ord, [...h.querySelectorAll(':scope > :is(button,a)')].map(b => b.dataset[h.dataset.ordattr])); dragB = null; });
})();

/* ================= the "Features" menu on the left =================
   Home, Planning Board and Organization stay in the top bar; the features (Attendance, Clinic ▾ with its pages …)
   sit in this menu on every page when a feature with sub-pages is on. ▾ folds a feature's pages. On phones all tabs are on top. */
const snOpen = {};                                   // feature id → false when its pages are folded
const sideNavOn = () => !!orgCtx() && ZL.list.some(f => f.menu && f.menu.on());
function renderSideNav(){
  const nav = $('#clSeg'), oc = orgCtx(); if (!nav) return;
  const on = sideNavOn(), v = state.settings.view;
  document.body.classList.toggle('sidenav', on);
  document.body.classList.toggle('insubnav', ZL.list.some(f => f.menu && f.menu.view === v && f.menu.on()));
  nav.hidden = !on;
  if (!on){ nav.innerHTML = ''; return; }
  document.documentElement.style.setProperty('--hdrH', Math.round($('header.top').getBoundingClientRect().bottom || 64) + 'px');
  let main = '', masters = '';
  ZL.list.forEach(f => Object.entries(f.views || {}).forEach(([view, d]) => {
    const t = $(d.tab); if (!t || t.hidden) return;
    const svg = t.querySelector('svg').outerHTML, label = esc(t.querySelector('.lbl').textContent), href = t.getAttribute('href');
    const m = f.menu && f.menu.view === view ? f.menu : null;
    if (!m){ main += `<a data-goview="${view}" href="${href}" class="${v === view ? 'on' : ''}">${svg}<span>${label}</span></a>`; return; }
    const open = snOpen[f.id] !== false, cur = m.cur();
    masters += `<a class="sn-master${v === view ? ' on' : ''}" data-goview="${view}" data-snf="${f.id}" href="${href}" aria-expanded="${open}">${svg}<span>${label}</span><i class="sn-chev" data-sntoggle role="button" title="${open ? 'Fold the ' + label + ' menu' : 'Open the ' + label + ' menu'}">${open ? '▾' : '▸'}</i></a>
      <div class="sn-sub" data-ord="${m.ordKey}" data-ordattr="s" data-ordv="1"${open ? '' : ' hidden'}>${ordered(m.ordKey, m.subs()).map(([k, l, ic]) => `<a draggable="true" data-s="${k}" data-snf="${f.id}" href="${m.href(k)}" class="${v === view && k === cur ? 'on' : ''}"><svg viewBox="0 0 16 16">${ic}</svg><span>${l}</span></a>`).join('')}</div>`;
  }));
  nav.innerHTML = `<div class="clnavt">Features</div>` + (main ? `<div class="sn-main">${main}</div>` : '') + masters
    + (oc && oc.support ? '<div class="stat" style="padding:8px 10px">Read-only support view</div>' : '');
}
$('#clSeg').addEventListener('click', e => {
  const f = (el => el && ZL.list.find(x => x.id === el.dataset.snf))(e.target.closest('[data-snf]'));
  if (e.target.closest('[data-sntoggle]')){ e.preventDefault(); e.stopPropagation(); if (f) snOpen[f.id] = snOpen[f.id] === false; renderSideNav(); return; }
  const g = e.target.closest('[data-goview]'); if (g){ if (f) snOpen[f.id] = true; setView(g.dataset.goview); return; }
  const b = e.target.closest('[data-s]'); if (b && f) f.menu.go(b.dataset.s);
});
