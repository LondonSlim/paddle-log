/* Water Log – charts: level graphs and stylised tide curves for each section of a river or water */
'use strict';

/* ---------- settings (edit these as thresholds and tide notes are worked out) ---------- */

// Level bands: the lowest level (m) at which each band starts. Below "scrape" is Empty.
const LEVEL_BANDS = {
  'Dart': {
    'Loop':   { gauge: 'Dunnabridge',     high: 1.2, medium: 0.74, low: 0.45, scrape: 0.30 },
    'Middle': { gauge: 'Dunnabridge',     high: 1.2, medium: 0.74, low: 0.45, scrape: 0.30 },
    'Lower':  { gauge: "Austin's Bridge", high: 1.2, medium: 0.70, low: 0.45, scrape: 0.35 }
  }
};

// Tide curve shape for each tidal water (normal if not listed), plus any notes drawn on the curve
const TIDE_WATERS = {
  'Chichester Harbour': { curve: 'stand' },
  'Poole Harbour': { curve: 'double' },
  'Old Harry Rocks': { curve: 'double' },
  'Thames': { curve: 'thames' },
  'Arun': { curve: 'normal', marks: [{ h: 2, l: 'Put in ≈ +2', k: 'note' }, { h: 4, l: 'Est. HW Pulborough ≈ +4 h', k: 'est' }] }
};

/* ---------- sections of a river ---------- */

// "Loop and Middle" counts towards both the Loop and the Middle
const secParts = s => String(s || '').split(/\s+and\s+|\s*\+\s*|\s*&\s*/i).map(x => x.trim()).filter(Boolean);
const ALL = '*';
const inSection = (e, key) => key === ALL || secParts(e.section).includes(key);
const firstGauge = e => String(e.gauge || '').split('/')[0].trim();
const tripId = e => e.row || 'p:' + e.pendingUid;
const chartHash = (kind, river, key) => kind + '/' + enc(river + '~' + key);
const secName = key => key === ALL ? 'All trips' : key;

function sectionKeys(list) {
  const keys = [];
  list.forEach(e => secParts(e.section).forEach(p => { if (!keys.includes(p)) keys.push(p); }));
  return keys;
}

// Trips with a level on this section, all read from one gauge (the set one, or the one used most)
// A reading as typed: "0.85", "18–22" (a range), "1.0 / 0.41" (two gauges: the first is used)
function readVal(v) {
  const s = String(v == null ? '' : v).split('/')[0];
  const r = s.match(/(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)/);
  if (r) { const a = +r[1], b = +r[2]; return { lo: Math.min(a, b), hi: Math.max(a, b) }; }
  const n = num(s); return n == null ? null : { lo: n, hi: n };
}
const sameGauge = (a, b) => String(a || '').toLowerCase().replace(/[^a-z]/g, '') === String(b || '').toLowerCase().replace(/[^a-z]/g, '');
const UNIT = { level: 'm', flow: 'cumecs' };
const fmtVal = (v, mode) => (v.lo === v.hi ? (mode === 'level' ? v.lo.toFixed(2) : String(+v.lo.toFixed(1))) : (mode === 'level' ? v.lo.toFixed(2) + '–' + v.hi.toFixed(2) : +v.lo.toFixed(1) + '–' + +v.hi.toFixed(1))) + ' ' + UNIT[mode];

// Trips with a level or a flow on this section. The graph uses whichever you record more often,
// with a switch when both are well recorded. Trips read at another gauge are kept but shown hollow.
function levelTrips(river, key, want) {
  const all = entries().filter(e => String(e.river || '').trim() === river && inSection(e, key));
  const lv = all.filter(e => readVal(e.level)), fl = all.filter(e => readVal(e.flow));
  const modes = [];
  if (lv.length) modes.push('level'); if (fl.length) modes.push('flow');
  const both = lv.length >= 2 && fl.length >= 2;
  let mode = want && modes.includes(want) && (both || modes.length === 1) ? want : (fl.length > lv.length ? 'flow' : lv.length ? 'level' : fl.length ? 'flow' : 'level');
  const list = (mode === 'flow' ? fl : lv).sort((a, b) => (a._d || 0) - (b._d || 0));
  const cfg = mode === 'level' ? (LEVEL_BANDS[river] || {})[key] : null;
  let gauge = cfg && cfg.gauge;
  if (!gauge) { const c = {}; list.forEach(e => { const g = firstGauge(e); if (g) c[g] = (c[g] || 0) + 1; }); gauge = Object.keys(c).sort((a, b) => c[b] - c[a])[0] || ''; }
  return { gauge, cfg, mode, toggle: both, trips: list, val: e => readVal(mode === 'flow' ? e.flow : e.level), main: e => sameGauge(firstGauge(e), gauge) };
}

// Trips with a tide time and a start time on this section
function tideTrips(river, key) {
  return entries().filter(e => onWater(e, river) && inSection(e, key) && tideRef(e) && mins(e.start) != null)
    .sort((a, b) => (a._d || 0) - (b._d || 0));
}

function sectionsCard(name, list) {
  // level graphs for sections read from a gauge, tide curves for sections with tide times (a river can have both)
  const main = list.filter(e => String(e.river || '').trim() === name);
  const rows = [];
  const lkeys = sectionKeys(main), lrows = [];
  const lsub = t => [t.gauge ? t.gauge + ' gauge' : '', t.toggle ? 'level and flow' : t.mode === 'flow' ? 'flow' : ''].filter(Boolean).join(' · ') || 'Level';
  lkeys.forEach(k => { const t = levelTrips(name, k); if (t.trips.length) lrows.push([k, t.trips.length, 'levels', lsub(t)]); });
  if (!lrows.length) { const t = levelTrips(name, ALL); if (t.trips.length) lrows.push([ALL, t.trips.length, 'levels', lsub(t)]); }
  const all = tideTrips(name, ALL), trows = [];
  if (all.length) {
    sectionKeys(all).forEach(k => { const n = tideTrips(name, k).length; if (n) trows.push([k, n, 'tides']); });
    if (trows.length !== 1 || trows[0][1] !== all.length) trows.push([ALL, all.length, 'tides']);
  }
  rows.push(...lrows, ...trows);
  if (!rows.length) return null;
  // "Levels paddled" – the levels you paddled at, not today's level
  const title = lrows.length && trows.length ? 'Levels and tides paddled' : lrows.length ? 'Levels paddled' : 'Tides paddled';
  return { title, n: rows.length, html: `<div class="card secs">${rows.map(([k, n, kind, gauge]) => `<div class="secrow">
      <div class="grow"><div class="t">${esc(secName(k))}</div><div class="s">${kind === 'levels' ? esc(gauge) : 'Tide'} · ${n} ${n === 1 ? 'trip' : 'trips'}</div></div>
      <a class="btn small${kind === 'tides' ? ' tidebtn' : ''}" href="#${chartHash(kind, name, k)}">${kind === 'levels' ? ICON.chart + ' Levels' : ICON.wave + ' Tides'}</a></div>`).join('')}</div>` };
}
ICON.chart = '<svg viewBox="0 0 24 24"><path d="M3 20h18M5 16l4-5 4 3 6-8"/></svg>';

/* ---------- shared chart screen ---------- */

const CH = { kind: null, river: '', key: '', sel: null, group: null, fromGroup: null };
function parseChartArg(arg) { const i = String(arg).lastIndexOf('~'); return i < 0 ? [arg, ALL] : [arg.slice(0, i), arg.slice(i + 1)]; }

function chartScreen(title, sub, backTo) {
  const back = `<button class="iconbtn" onclick="history.length>1?history.back():go('${backTo}')" aria-label="Back">${ICON.back}</button>`;
  const head = `<div class="tt"><h1 class="tt-river">${esc(title)}</h1><div class="tt-sec">${esc(sub)}</div></div>`;
  return `<div class="topbar tripbar chartbar">${back}${head}</div><div class="wrap chartwrap">
    <div class="stage"><div class="chartbox"><svg id="chart" role="img" aria-label="${esc(title)} graph"></svg></div>
      <div class="side"><div class="cardhead">${back}${head}</div><div class="ccard" id="ccard"></div></div></div></div>`;
}

const bandOf = (l, th) => l >= th.high ? 'high' : l >= th.medium ? 'medium' : l >= th.low ? 'low' : l >= th.scrape ? 'scrape' : 'empty';
const BANDS = [['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['scrape', 'Scrape'], ['empty', 'Empty']];
const bandLabel = k => BANDS.find(b => b[0] === k)[1];

function tripCard(e, lines, extraTop) {
  const place = [e.putInPlace, e.takeOutPlace && e.takeOutPlace !== e.putInPlace ? e.takeOutPlace : ''].filter(Boolean).join(' → ');
  const note = String(e.levelComments || e.notes || '').trim();
  return `<div class="txt">${extraTop || ''}${lines}
    ${place ? `<div class="where">${esc(place)}</div>` : ''}${note ? `<p>${esc(note.length > 160 ? note.slice(0, 157).replace(/\s+\S*$/, '') + '…' : note)}</p>` : ''}</div>
    <a class="btn small" href="#trip/${tripId(e)}">Open trip</a>`;
}

/* ---------- level graph ---------- */

function screenLevels(arg) {
  const [river, key] = parseChartArg(arg);
  const t = levelTrips(river, key);
  Object.assign(CH, { kind: 'levels', river, key, mode: t.mode, sel: t.trips[t.trips.length - 1] || null, group: null, fromGroup: null });
  if (!t.trips.length) return topbar(river, 'river/' + enc(river)) + '<div class="wrap empty">No trips with a level or flow on this section yet.</div>';
  return chartScreen(river + ' · ' + secName(key), t.gauge ? t.gauge + ' gauge' : 'Levels paddled', 'river/' + enc(river));
}
function afterLevels() { drawLevels(); levelCard(); }
const curLevels = () => levelTrips(CH.river, CH.key, CH.mode);

function levelCard() {
  const el = $('#ccard'); if (!el || !CH.sel) return;
  const t = curLevels(), e = CH.sel, v = t.val(e);
  if (!v) { el.innerHTML = ''; return; }
  const chip = t.cfg ? `<span class="chip band ${bandOf(v.lo, t.cfg)}">${bandLabel(bandOf(v.lo, t.cfg))}</span>` : '';
  const g = firstGauge(e), other = !t.main(e);
  const sw = t.toggle ? `<div class="seg mini">${['level', 'flow'].map(k => `<button class="${t.mode === k ? 'on' : ''}" data-mode="${k}">${k === 'level' ? 'Level' : 'Flow'}</button>`).join('')}</div>` : '';
  el.innerHTML = tripCard(e, `<div class="when"><span>${esc(fmtDate(e._d))}</span><span class="num">${fmtVal(v, t.mode)}</span>${chip}</div>
    <div class="where">${esc([e.river, e.section].filter(Boolean).join(' · '))}${g ? ' · ' + esc(g) + ' gauge' : ' · gauge not noted'}${other ? ' (not the usual gauge)' : ''}</div>`, sw);
  $$('[data-mode]', el).forEach(b => b.onclick = () => {
    CH.mode = b.dataset.mode; const t2 = curLevels();
    if (!t2.trips.includes(CH.sel)) CH.sel = t2.trips[t2.trips.length - 1] || null;
    drawLevels(); levelCard();
  });
}

function niceStep(span) { const raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map(k => k * p).find(k => k >= raw) || 10 * p; }

function drawLevels() {
  const svg = $('#chart'); if (!svg || CH.kind !== 'levels') return;
  const t = curLevels(), { trips, gauge, mode } = t, th = t.cfg, n = trips.length;
  const box = svg.parentElement, W = box.clientWidth - 12, H = box.clientHeight - 12; if (W < 50 || H < 50 || !n) return;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const now = gaugeNow(gauge), nowV = mode === 'flow' ? now.flow : now.level;
  const vals = trips.map(t.val);
  const m = { l: 40, r: 8, t: 10, b: 26 }, pad = 14;
  // to scale; with bands, the Empty band is cut short (wavy edge) but always has room for the latest reading
  const lo = Math.min(...vals.map(v => v.lo), nowV != null ? nowV : Infinity), hi = Math.max(...vals.map(v => v.hi), nowV != null ? nowV : -Infinity);
  let YMAX, YMIN;
  if (th) { YMAX = Math.max(th.high + 0.2, hi + 0.1); YMIN = Math.min(th.scrape - 0.17, lo - 0.05); }
  else { const span = Math.max(hi - lo, mode === 'flow' ? 4 : 0.3); YMAX = hi + span * 0.15; YMIN = Math.max(0, lo - span * 0.15); }
  const x = i => m.l + pad + (n > 1 ? i * (W - m.l - m.r - 2 * pad) / (n - 1) : (W - m.l - m.r - 2 * pad) / 2);
  const y = v => m.t + (1 - (v - YMIN) / (YMAX - YMIN)) * (H - m.t - m.b);
  const x0 = m.l, x1 = W - m.r, yb = y(YMIN);
  const url = gaugeLink(gauge);
  const txt = nowV != null ? `Gauge now ${fmtVal({ lo: nowV, hi: nowV }, mode)} ↗` : now.state === 'none' ? 'Gauge now: no reading ↗' : 'Gauge now ↗';
  const tw = txt.length * 6.6 + 18; let px, py, nowLine = '';
  if (nowV != null) { const yy = y(nowV); nowLine = `<line class="nowline" x1="${x0}" x2="${x1}" y1="${yy}" y2="${yy}"/>`; px = x0 + 6; py = Math.max(m.t + 2, yy - 30); }
  else { px = x1 - tw - 6; py = m.t + 6; }
  const pts = trips.map((e, i) => [x(i), y(vals[i].hi), y(vals[i].lo)]);
  const obst = pts.map(([cx, ya, yb2]) => [cx - 10, ya - 10, cx + 10, yb2 + 10]); obst.push([px, py, px + tw, py + 24]);
  if (nowV != null) obst.push([x0, y(nowV) - 4, x1, y(nowV) + 4]);
  const hits = r => obst.filter(o => !(r[2] < o[0] || r[0] > o[2] || r[3] < o[1] || r[1] > o[3])).length;
  const wave = () => { let d = ''; const N = Math.ceil((x1 - x0) / 10); for (let i = 0; i < N; i++) { const ex = Math.min(x1, x0 + (i + 1) * 10), cx = x0 + (i + .5) * 10; d += ` Q${cx},${yb + (i % 2 ? 7 : -7)} ${ex},${yb}`; } return d; };
  let g = '', ax = '';
  if (th) {
    const edges = [['high', th.high, YMAX], ['medium', th.medium, th.high], ['low', th.low, th.medium], ['scrape', th.scrape, th.low], ['empty', YMIN, th.scrape]];
    edges.forEach(([b, l0, h0]) => { const bot = b === 'empty' ? yb + 4 : y(l0); g += `<rect class="band ${b}" x="${x0}" y="${y(h0)}" width="${x1 - x0}" height="${bot - y(h0)}"/>`; });
    g += `<path d="M${x0},${yb}${wave()} V${yb + 8} H${x0} Z" class="cover"/><path class="brk" d="M${x0},${yb}${wave()}"/>`;
    // band names inside the chart, wherever no dot or label is in the way
    edges.forEach(([b, l0, h0]) => {
      const top = Math.max(y(h0), m.t) + 14, bot = Math.min(y(l0), yb - 8), mid = (Math.max(y(h0), m.t) + Math.min(y(l0), yb - 8)) / 2 + 4;
      const ys = bot > top ? [mid, top, bot] : [mid], w = bandLabel(b).length * 6.4 + 6; let best = null;
      outer: for (const by of ys) for (const [anc, ax_] of [['start', x0 + 6], ['end', x1 - 6]]) {
        const r0 = anc === 'start' ? ax_ : ax_ - w, c = hits([r0, by - 11, r0 + w, by + 3]);
        if (!best || c < best.c) best = { c, by, anc, ax_ }; if (c === 0) break outer;
      }
      g += `<text class="blabel" x="${best.ax_}" y="${best.by}" text-anchor="${best.anc}">${bandLabel(b)}</text>`;
    });
    [th.scrape, th.low, th.medium, th.high].forEach(v => { ax += `<line class="grid" x1="${x0}" x2="${x1}" y1="${y(v)}" y2="${y(v)}"/><text x="${x0 - 5}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(2)}</text>`; });
  } else {
    g += `<rect class="plain" x="${x0}" y="${m.t}" width="${x1 - x0}" height="${yb - m.t}"/>`;
    const step = niceStep(YMAX - YMIN), dp = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
    for (let v = Math.ceil(YMIN / step) * step; v <= YMAX + 1e-9; v += step) ax += `<line class="grid" x1="${x0}" x2="${x1}" y1="${y(v)}" y2="${y(v)}"/><text x="${x0 - 5}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(dp)}</text>`;
  }
  ax += `<text x="2" y="${m.t - 1}" text-anchor="start" class="unit">${UNIT[mode]}</text>`;
  const yrs = trips.map(e => e._d ? String(e._d.getFullYear()) : ''), stp = n > 1 ? (x1 - x0 - 2 * pad) / (n - 1) : 60; let i = 0;
  while (i < n) {
    let j = i; while (j + 1 < n && yrs[j + 1] === yrs[i]) j++;
    ax += `<text x="${(x(i) + x(j)) / 2}" y="${H - 8}" text-anchor="middle">${(j - i + 1) * stp >= 34 ? yrs[i] : '’' + yrs[i].slice(2)}</text>`;
    if (j + 1 < n) { const dx = (x(j) + x(j + 1)) / 2; ax += `<line class="yr" x1="${dx}" x2="${dx}" y1="${m.t}" y2="${yb}"/>`; }
    i = j + 1;
  }
  const pill = `${nowLine}<a href="${url}" target="_blank" rel="noopener"><rect class="nowpill" x="${px}" y="${py}" width="${tw}" height="24" rx="12"/><text class="nowtxt" x="${px + tw / 2}" y="${py + 16}" text-anchor="middle">${txt}</text></a>`;
  // a dot for a single reading, a short bar for a range; hollow when read at a different gauge
  const dots = trips.map((e, k) => { const [cx, ya, yb2] = pts[k], sel = e === CH.sel, hol = !t.main(e) ? ' other' : '';
    const mark = ya === yb2 ? `<circle class="dot${hol}${sel ? ' sel' : ''}" cx="${cx}" cy="${ya}" r="${sel ? 7 : 5}"/>`
      : `<rect class="dot bar${hol}${sel ? ' sel' : ''}" x="${cx - (sel ? 6 : 4.5)}" y="${ya - 3}" width="${sel ? 12 : 9}" height="${yb2 - ya + 6}" rx="${sel ? 6 : 4.5}"/>`;
    return `<g tabindex="0" role="button" data-i="${k}" aria-label="${esc(fmtDate(e._d))}, ${esc(fmtVal(vals[k], mode))}"><rect class="hit" x="${cx - 15}" y="${ya - 15}" width="30" height="${yb2 - ya + 30}"/>${mark}</g>`; }).join('');
  svg.innerHTML = g + `<g class="axis">${ax}</g>` + pill + dots;
  $$('g[data-i]', svg).forEach(el => {
    const pick = () => { CH.sel = trips[+el.dataset.i]; drawLevels(); levelCard(); };
    el.onclick = pick; el.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } };
  });
}

/* ---------- stylised tide curve ---------- */

const PERIOD = 12.42, RANGE = { springs: 1, mid: 0.75, neaps: 0.5 }; // neap range about half the spring range
const cosi = (a, b, t) => a + (b - a) * (1 - Math.cos(Math.PI * t)) / 2;
// key points cover one tide; beyond them the curve repeats every 12 h 25 min
const keyed = K => h => { h = ((h - K[0][0]) % PERIOD + PERIOD) % PERIOD + K[0][0]; for (let i = 0; i < K.length - 1; i++) { const [h0, v0] = K[i], [h1, v1] = K[i + 1]; if (h >= h0 && h <= h1) return cosi(v0, v1, (h - h0) / (h1 - h0)); } return h < K[0][0] ? K[0][1] : K[K.length - 1][1]; };
// Curves by hours from HW: 0 is low water, 1 is high water. lw is where low water falls before HW.
const CURVES = {
  normal: { f: h => .5 + .5 * Math.cos(2 * Math.PI * h / PERIOD), lw: -6.21 },
  stand:  { f: h => 1 - Math.pow(.5 - .5 * Math.cos(2 * Math.PI * h / PERIOD), 2), lw: -6.21 },          // long stand at HW (Solent-type)
  double: { f: keyed([[-8.42, 1], [-5, 0], [0, 1], [2, .86], [4, 1], [7.42, 0], [12.42, 1]]), lw: -5, hw2: 4 }, // Poole: HW1, small dip, HW2
  thames: { f: keyed([[-12.42, 1], [-5, 0], [0, 1], [7.42, 0], [12.42, 1]]), lw: -5 }                    // short flood, long ebb
};

const mins = s => { const m = /(\d{1,2})[:.](\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
function tideRef(e) {
  const m = /\b(HW1?|LW)\s*(\d{1,2}[:.]\d{2})/i.exec(e.tide || '');
  return m ? { type: /^LW/i.test(m[1]) ? 'LW' : 'HW', t: mins(m[2]), txt: m[0] } : null;
}
function tidePort(e) {
  const s = String(e.tide || '').replace(/\([^)]*\)/g, ''), all = s.match(/\d{1,2}[:.]\d{2}/g);
  if (!all) return '';
  return s.slice(s.lastIndexOf(all[all.length - 1]) + all[all.length - 1].length).replace(/^[\s,]+/, '').trim();
}
// Springs, mid or neaps: your own note (Tide or Conditions) if there is one, otherwise from the moon.
// Springs run about 1–2 days after new and full moon: the third of each half-cycle around them is springs,
// the third around the quarter moons is neaps, and the rest is mid.
const TIDE_LABEL = { springs: 'Springs', mid: 'Mid', neaps: 'Neaps' };
function tideState(e) {
  const note = (e.tide || '') + ' ' + (e.levelComments || '');
  if (/\bmid\b|mid[- ](range|tide)|between springs and neaps/i.test(note)) return 'mid';
  if (/closer?\s+(to\s+)?springs?/i.test(note)) return 'springs';
  if (/neap/i.test(note)) return 'neaps';
  if (/spring/i.test(note)) return 'springs';
  const d = e._d; if (!d) return 'mid';
  const SYN = 29.530588853, NM = Date.UTC(2000, 0, 6, 18, 14) / 864e5;
  const a = ((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12) / 864e5 - NM) % SYN + SYN) % SYN, half = SYN / 2;
  const q = ((a - 1.5) % half + half) % half, dist = Math.min(q, half - q);
  return dist <= half / 6 ? 'springs' : dist >= half / 3 ? 'neaps' : 'mid';
}

function tideSetup(river, key) {
  const trips = tideTrips(river, key), w = TIDE_WATERS[river] || {}, curve = CURVES[w.curve] || CURVES.normal;
  const lwCount = trips.filter(e => tideRef(e).type === 'LW').length;
  const ref = lwCount > trips.length / 2 ? 'LW' : (w.curve === 'double' ? 'HW1' : 'HW');
  const ports = {}; trips.forEach(e => { const p = tidePort(e); if (p) ports[p] = (ports[p] || 0) + 1; });
  const port = Object.keys(ports).sort((a, b) => ports[b] - ports[a])[0] || '';
  let range = ref === 'LW' ? [-6, 6] : curve.hw2 ? [-6, 8] : [-6, 6];
  // hours from the section's reference; a trip logged against the other tide is moved across using the curve
  const off = (e, which) => { const r = tideRef(e), v = mins(which === 'fi' ? e.finish : e.start); if (!r || v == null) return null;
    let h = (v - r.t) / 60; if (h < -12) h += 24; if (h > 12) h -= 24;
    if (r.type === 'LW' && ref !== 'LW') h += curve.lw; if (r.type === 'HW' && ref === 'LW') h -= curve.lw; return h; };
  // slide the window so every trip fits from start to finish; widen it only if the trips span more than the window
  const hs = []; trips.forEach(e => { const a = off(e, 'st'), b = off(e, 'fi'); if (a != null) hs.push(a); if (b != null) hs.push(b); });
  if (hs.length) {
    const lo = Math.min(...hs) - 0.5, hi = Math.max(...hs) + 0.5, w = range[1] - range[0];
    if (hi > range[1]) range = [hi - w, hi];
    if (lo < range[0]) range = [lo, Math.max(range[1], lo + w)];
    range = [Math.floor(range[0] * 2) / 2, Math.ceil(range[1] * 2) / 2];
  }
  const F = ref === 'LW' ? (h => curve.f(h + curve.lw)) : curve.f;
  const marks = [], inR = h => h >= range[0] && h <= range[1];
  for (let k = -1; k <= 1; k++) {
    const sh = k * PERIOD;
    if (ref === 'LW') { if (inR(sh)) marks.push({ h: sh, l: 'LW', k: 'hw' }); if (inR(sh - curve.lw)) marks.push({ h: sh - curve.lw, l: 'HW', k: 'hw' }); }
    else {
      if (inR(sh)) marks.push({ h: sh, l: curve.hw2 ? 'HW1' : 'HW', k: 'hw' });
      if (curve.hw2 && inR(sh + curve.hw2)) marks.push({ h: sh + curve.hw2, l: 'HW2', k: 'hw' });
      if (inR(sh + curve.lw)) marks.push({ h: sh + curve.lw, l: 'LW', k: 'hw' });
    }
  }
  if (ref !== 'LW') (w.marks || []).forEach(k => marks.push(k));
  return { trips, ref, port, range, off, F, marks };
}

function screenTides(arg) {
  const [river, key] = parseChartArg(arg);
  const s = tideSetup(river, key);
  Object.assign(CH, { kind: 'tides', river, key, sel: s.trips[s.trips.length - 1] || null, group: null, fromGroup: null });
  if (!s.trips.length) return topbar(river, 'river/' + enc(river)) + '<div class="wrap empty">No trips with tide and start times on this section yet.</div>';
  return chartScreen(river + ' · ' + secName(key), 'Stylised tide · hours from ' + s.ref + (s.port ? ' ' + s.port : ''), 'river/' + enc(river));
}
function afterTides() { drawTides(); tideCard(); }

const hm = h => { const sg = h < 0 ? '−' : '+', a = Math.abs(h); let H = Math.floor(a), M = Math.round((a - H) * 60); if (M === 60) { H++; M = 0; } return `${sg}${H}:${String(M).padStart(2, '0')}`; };

function tideCard() {
  const el = $('#ccard'); if (!el) return;
  const s = tideSetup(CH.river, CH.key);
  if (CH.group && CH.group.length > 1) {
    el.innerHTML = `<div class="txt"><div class="when">${CH.group.length} trips start here</div>
      <div class="glist">${CH.group.map((e, i) => { const st = tideState(e); return `<button data-li="${i}" class="${e === CH.sel ? 'on' : ''}"><span>${esc(fmtDate(e._d))}</span><span class="num">${esc(e.start)}${e.finish ? '–' + esc(e.finish) : ''}</span><span class="chip tide ${st}">${TIDE_LABEL[st]}</span></button>`; }).join('')}</div></div>`;
    $$('[data-li]', el).forEach(b => b.onclick = () => { CH.fromGroup = CH.group; CH.sel = CH.group[+b.dataset.li]; CH.group = null; drawTides(); tideCard(); });
    return;
  }
  const e = CH.sel; if (!e) return;
  const a = s.off(e, 'st'), b = s.off(e, 'fi'), st = tideState(e), r = tideRef(e);
  const conv = (r.type === 'LW') !== (s.ref === 'LW') ? ` (logged as ${esc(r.txt)})` : '';
  const back = CH.fromGroup ? `<button class="linkbtn" id="gback">‹ ${CH.fromGroup.length} trips here</button>` : '';
  el.innerHTML = tripCard(e, `<div class="when"><span>${esc(fmtDate(e._d))}</span><span class="num">${esc(e.start)}${e.finish ? '–' + esc(e.finish) : ''}</span><span class="chip tide ${st}">${TIDE_LABEL[st]}</span></div>
    <div class="where num">${s.ref.replace('1', '')} ${hm(a)}${b != null ? ' to ' + hm(b) : ''}${conv}</div>`, back);
  const gb = $('#gback'); if (gb) gb.onclick = () => { CH.group = CH.fromGroup; CH.fromGroup = null; drawTides(); tideCard(); };
}

function drawTides() {
  const svg = $('#chart'); if (!svg || CH.kind !== 'tides') return;
  const s = tideSetup(CH.river, CH.key), F = s.F, [h0, h1] = s.range;
  const box = svg.parentElement, W = box.clientWidth - 12, H = box.clientHeight - 12; if (W < 50 || H < 50) return;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const m = { l: 30, r: 10, t: 30, b: 26 };
  const x = h => m.l + (h - h0) / (h1 - h0) * (W - m.l - m.r), y = v => m.t + (1 - v) * (H - m.t - m.b), yb = y(0) + 10;
  const scaled = k => h => .5 + (F(h) - .5) * RANGE[k];
  const CF = { springs: F, mid: scaled('mid'), neaps: scaled('neaps') };
  const curveOf = e => CF[tideState(e)];
  const sample = (g, a, b, n) => { const p = []; for (let i = 0; i <= n; i++) { const h = a + (b - a) * i / n; p.push([x(h), y(g(h))]); } return p; };
  const pth = p => 'M' + p.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' L');
  const sp = sample(F, h0, h1, 240), mp = sample(CF.mid, h0, h1, 240), np = sample(CF.neaps, h0, h1, 240);
  let g = `<path class="seafill" d="${pth(sp)} L${x(h1)},${yb} L${x(h0)},${yb} Z"/>`;
  const sel = CH.sel;
  if (sel) { const G = curveOf(sel), a = Math.max(h0, s.off(sel, 'st')), b = Math.min(h1, s.off(sel, 'fi') != null ? s.off(sel, 'fi') : a);
    if (b > a) { const p = sample(G, a, b, 80); g += `<path class="selfill" d="${pth(p)} L${x(b)},${yb} L${x(a)},${yb} Z"/>`; } }
  let ax = '';
  for (let h = Math.ceil(h0); h <= h1; h++) { const X = x(h); ax += `<line class="grid" x1="${X}" x2="${X}" y1="${m.t - 6}" y2="${yb}"/>`;
    if (h % (W < 420 ? 2 : 1) === 0) ax += `<text x="${X}" y="${H - 8}" text-anchor="middle">${h === 0 ? '0' : (h > 0 ? '+' : '−') + Math.abs(h)}</text>`; }
  let mk = '';
  s.marks.forEach(k => { const X = x(k.h);
    if (k.k === 'hw') mk += `<line class="hwline" x1="${X}" x2="${X}" y1="${m.t - 4}" y2="${yb}"/><text class="hwtxt" x="${X}" y="${m.t - 10}" text-anchor="middle">${k.l}</text>`;
    else { const est = k.k === 'est', ty = est ? m.t + 16 : m.t + (H - m.t - m.b) * .42, anc = X > W * .7 ? 'end' : 'start', tx = anc === 'end' ? X - 4 : X + 4;
      mk += `<line class="${est ? 'est' : 'note'}line" x1="${X}" x2="${X}" y1="${est ? m.t - 4 : ty + 4}" y2="${yb}"/><text class="${est ? 'est' : 'note'}txt" x="${tx}" y="${ty}" text-anchor="${anc}">${esc(k.l)}</text>`; } });
  const lh = h0 + .35, cl = ['springs', 'mid', 'neaps'].map(k => `<text class="cname ${k}" x="${x(lh)}" y="${y(CF[k](lh)) - 7}">${TIDE_LABEL[k]}</text>`).join('');
  // dots on the springs or neaps curve; trips that would overlap become one numbered dot
  const pts = s.trips.map(e => { const h = s.off(e, 'st'); return { e, h, cx: x(h), cy: y(curveOf(e)(h)) }; }).filter(p => p.h >= h0 && p.h <= h1).sort((a, b) => a.cx - b.cx);
  const groups = [];
  pts.forEach(p => { const gp = groups.find(G => Math.hypot(G.cx - p.cx, G.cy - p.cy) < 14);
    if (gp) { gp.items.push(p); gp.cx = gp.items.reduce((a, q) => a + q.cx, 0) / gp.items.length; gp.cy = gp.items.reduce((a, q) => a + q.cy, 0) / gp.items.length; }
    else groups.push({ cx: p.cx, cy: p.cy, items: [p] }); });
  let dots = '';
  if (sel) { const fh = s.off(sel, 'fi'); if (fh != null && fh <= h1 && fh > s.off(sel, 'st')) dots += `<circle class="fin" cx="${x(fh)}" cy="${y(curveOf(sel)(fh))}" r="4"/>`; }
  groups.forEach((G, gi) => { const on = G.items.some(p => p.e === sel), n = G.items.length;
    const lbl = n > 1 ? n + ' trips' : fmtDate(G.items[0].e._d) + ', start ' + hm(G.items[0].h);
    dots += `<g tabindex="0" role="button" data-g="${gi}" aria-label="${esc(lbl)}"><circle class="hit" cx="${G.cx}" cy="${G.cy}" r="16"/>` +
      (n > 1 ? `<circle class="grp${on ? ' sel' : ''}" cx="${G.cx}" cy="${G.cy}" r="10"/><text class="grpn" x="${G.cx}" y="${G.cy + 4}" text-anchor="middle">${n}</text>`
        : `<circle class="dot${on ? ' sel' : ''}" cx="${G.cx}" cy="${G.cy}" r="${on ? 7 : 5.5}"/>`) + '</g>'; });
  svg.innerHTML = g + `<g class="axis">${ax}</g><path class="curve" d="${pth(sp)}"/><path class="curve mid" d="${pth(mp)}"/><path class="curve neap" d="${pth(np)}"/>` + mk + cl + dots;
  $$('g[data-g]', svg).forEach(el => {
    const G = groups[+el.dataset.g];
    const pick = () => {
      CH.fromGroup = null;
      if (G.items.length > 1) { CH.group = G.items.map(p => p.e); if (!CH.group.includes(CH.sel)) CH.sel = CH.group[0]; }
      else { CH.group = null; CH.sel = G.items[0].e; }
      drawTides(); tideCard();
    };
    el.onclick = pick; el.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } };
  });
}

// redraw when the phone turns or the window changes size
const redrawChart = () => { if (CH.kind === 'levels') drawLevels(); else if (CH.kind === 'tides') drawTides(); };
window.addEventListener('resize', () => { if (document.body.classList.contains('charting')) redrawChart(); });
window.addEventListener('orientationchange', () => setTimeout(() => { if (document.body.classList.contains('charting')) redrawChart(); }, 300));
