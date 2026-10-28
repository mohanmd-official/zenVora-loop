/* ================= shared helpers =================
   Small helpers every part of the app uses (money, names, times, tables). Features may use anything in core. */
const hm12 = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${(h + 11) % 12 + 1}:${pad2(m)} ${h < 12 ? 'AM' : 'PM'}`; };
const kpi = (l, v, s, c = '') => `<div class="kpi"><div class="kl">${l}</div><div class="kv ${c}">${v}</div><div class="ks">${s}</div></div>`;
const monthLabel = mk => parseDay(mk + '-01').toLocaleDateString([], {month:'long', year:'numeric'});
const mShift = (mk, n) => { const d = parseDay(mk + '-01'); d.setMonth(d.getMonth() + n); return dayKey(d).slice(0, 7); };
const mEnd = mk => monthBounds(mk).e;
const days = (a, b) => { const o = []; for (let k = a; k <= b && o.length < 400; k = shiftDay(k, 1)) o.push(k); return o; };
function tbl(head, rows, foot, cls = ''){
  return `<div class="awrap" style="margin-top:0"><table class="atbl ${cls}"><thead><tr>${head.map(h => `<th${/^#|₹/.test(h) ? ' class="num"' : ''}>${esc(h.replace(/^#/, ''))}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.attr || ''}>${r.c.map((c, i) => `<td${/^#|₹/.test(head[i]) ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" class="stat">Nothing in this period.</td></tr>`}${foot ? `<tr class="tot">${foot.map((c, i) => `<td${/^#|₹/.test(head[i]) ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>` : ''}</tbody></table></div>`;
}
const docsOf = qs => qs.docs.map(d => Object.assign({id:d.id}, d.data()));
const paidSum = ps => (ps || []).reduce((a, x) => a + (+x.amount || 0), 0);
// serial numbers (No. column) in every table
function numberTables(root){
  (root || document).querySelectorAll('table.atbl:not([data-num])').forEach(t => {
    t.dataset.num = '1';
    const hr = t.querySelector('thead tr'); if (hr){ const th = document.createElement('th'); th.className = 'rn'; th.textContent = 'No.'; hr.prepend(th); }
    let n = 0;
    t.querySelectorAll('tbody tr').forEach(r => {
      if (r.cells.length === 1){ r.cells[0].colSpan = (r.cells[0].colSpan || 1) + 1; return; }
      const td = document.createElement('td'); td.className = 'rn';
      if (!r.classList.contains('wk') && !r.classList.contains('tot')) td.textContent = ++n;
      r.prepend(td);
    });
  });
}
const tsMs = v => v == null ? null : typeof v === 'number' ? v : v.toMillis ? v.toMillis() : v.seconds != null ? v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6) : +new Date(v);
const hm = ms => { const m = Math.round((ms || 0) / 60000); return `${Math.floor(m / 60)}h ${pad2(m % 60)}m`; };
const hms = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`; };
const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const monthBounds = mk => { const [y, m] = mk.split('-').map(Number); return {s:dayKey(new Date(y, m - 1, 1)), e:dayKey(new Date(y, m, 0)), days:new Date(y, m, 0).getDate()}; };
const toMin = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + m; };
const titleOf = a => a && a.title && a.title !== ROLE_LABEL[a.role] ? a.title : '';
const firstName = n => { const w = String(n || '').trim().split(/\s+/); return /\.$/.test(w[0] || '') && w[1] ? w[0] + ' ' + w[1] : w[0] || ''; };   // "Dr. Ravi" stays "Dr. Ravi"
const fullName = a => (a && (a.name || (a.email || '').split('@')[0])) || '';
function greet(){ const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
