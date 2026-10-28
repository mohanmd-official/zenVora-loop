/* ---------- date range: Today or a custom From / To ---------- */
function rangeBar(o, id){             // one compact line: group · ‹ Today › · from – to · filters (Table / Chart sits in the report header)
  const k = o.kind;
  return `<div class="rangebar" data-range="${id}">
    <select data-rpgroup title="Show by">${[['day', 'Daily'], ['month', 'Monthly'], ['year', 'Yearly']].map(([v, l]) => `<option value="${v}"${o.group === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <span class="daynav rpnav"><button data-rpshift="-1" title="Previous">‹</button><button data-rp="today" class="${o.preset === 'today' ? 'on' : ''}">Today</button><button data-rpshift="1" title="Next"${o.to >= todayKey ? ' disabled' : ''}>›</button></span>
    <span class="rpdates"><input type="date" data-rf value="${o.from}" max="${todayKey}" title="From" aria-label="From"><i>–</i><input type="date" data-rt value="${o.to}" max="${todayKey}" title="To" aria-label="To"><button class="primary" data-rpgo title="Show this range">Go</button></span>
    ${k === 'collection' ? `<select data-rpmode title="Payment mode"><option value="">All modes</option>${PMODES.map(([v, l]) => `<option value="${v}"${o.mode === v ? ' selected' : ''}>${l}</option>`).join('')}</select>` : ''}
    <select data-rpdoc title="Doctor"><option value="">All doctors</option>${cl.doctors.map(d => `<option value="${esc(d.id)}"${o.dfil === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
  </div>`;
}
const rpViewToggle = v => `<div class="seg mini rpv" title="Table or chart"><button data-rpv="table" class="${v !== 'chart' ? 'on' : ''}" title="Table">☰</button><button data-rpv="chart" class="${v === 'chart' ? 'on' : ''}" title="Chart">📊</button></div>`;
/* reports: group by day / month / year, and a stacked bar chart */
const RP_COLORS = ['#0F766E', '#6366F1', '#F59E0B', '#EC4899', '#0EA5E9', '#84CC16', '#A855F7', '#EF4444'];
const inrK = n => { n = Math.round(n || 0); return n >= 1e7 ? '₹' + (n / 1e7).toFixed(1) + 'Cr' : n >= 1e5 ? '₹' + (n / 1e5).toFixed(1) + 'L' : n >= 1e3 ? '₹' + (n / 1e3).toFixed(1) + 'k' : '₹' + n; };
const perOf = (g, day) => g === 'month' ? day.slice(0, 7) : g === 'year' ? day.slice(0, 4) : day;
const perLabel = (g, k) => g === 'month' ? monthLabel(k) : g === 'year' ? k : fmtShort(k);
function periodsIn(g, from, to){
  if (g === 'day') return days(from, to);
  const out = []; let k = perOf(g, from); const end = perOf(g, to);
  while (k <= end && out.length < 400){ out.push(k); k = g === 'month' ? mShift(k, 1) : String(+k + 1); }
  return out;
}
function stackChart(cols, keys, names, money){
  const tot = c => keys.reduce((a, k) => a + (c.parts[k] || 0), 0);
  if (!cols.length || !cols.some(c => tot(c) > 0)) return '<div class="chartw"><div class="empty" style="margin:0">Nothing to chart in this period.</div></div>';
  const n = cols.length, bw = Math.max(8, Math.min(34, 620 / n * .6)), gap = bw * .7, W = Math.max(620, n * (bw + gap) + 70), H = 200, top = 14, max = Math.max(1, ...cols.map(tot));
  const step = Math.pow(10, Math.floor(Math.log10(max))), nice = Math.ceil(max / step) * step, y = v => top + H - v / nice * H, fmt = money ? inrK : v => Math.round(v);
  const every = Math.ceil(n / 14);
  let g = [0, .25, .5, .75, 1].map(f => `<line x1="48" x2="${W}" y1="${y(nice * f)}" y2="${y(nice * f)}" style="stroke:var(--line)"/><text x="44" y="${y(nice * f) + 4}" text-anchor="end">${fmt(nice * f)}</text>`).join('');
  cols.forEach((c, i) => { const x = 56 + i * (bw + gap); let acc = 0;
    keys.forEach((k, j) => { const v = c.parts[k] || 0; if (!v) return; const y1 = y(acc + v), h = y(acc) - y1; acc += v;
      g += `<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(h, 1)}" rx="${Math.min(4, bw / 4)}" fill="${RP_COLORS[j % RP_COLORS.length]}"><title>${esc(c.label)} · ${esc(names[k] || k)}: ${money ? inr(v) : v}</title></rect>`; });
    if (acc && n <= 31) g += `<text x="${x + bw / 2}" y="${y(acc) - 4}" text-anchor="middle" class="cv">${fmt(acc)}</text>`;
    if (i % every === 0) g += `<text x="${x + bw / 2}" y="${top + H + 16}" text-anchor="middle">${esc(c.short || c.label)}</text>`; });
  return `<div class="chartw"><svg viewBox="0 0 ${W} ${H + top + 26}" width="${W}" height="${H + top + 26}" style="${W > 1500 ? 'max-width:none' : ''}">${g}</svg>
    <div class="legend">${keys.map((k, j) => `<span><i style="background:${RP_COLORS[j % RP_COLORS.length]}"></i>${esc(names[k] || k)}</span>`).join('')}</div></div>`;
}
function hbarChart(items, money){
  if (!items.some(x => x.v > 0)) return '<div class="chartw"><div class="empty" style="margin:0">Nothing to chart in this period.</div></div>';
  items = items.slice(0, 20);
  const max = Math.max(1, ...items.map(x => x.v));
  return `<div class="hbars">${items.map((x, j) => `<div class="hb"><span>${esc(x.label)}</span><div><i style="width:${x.v / max * 100}%;background:${RP_COLORS[j % RP_COLORS.length]}"></i></div><b>${money ? inr(x.v) : x.v}</b></div>`).join('') || '<div class="empty">Nothing in this period.</div>'}</div>`;
}
function presetRange(){ return [todayKey, todayKey]; }

