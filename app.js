/* Water Log – Hugh's paddling log app.
 * Data lives in the "Canoe Log Book" Google Sheet; a small Apps Script web app is the go-between.
 * Everything is cached on the phone so the app opens and logs paddles with no signal. */
'use strict';

const LS = {
  cfg: 'wl_cfg', data: 'wl_data', queue: 'wl_queue', draft: 'wl_draft', sort: 'wl_sort'
};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

const S = {
  cfg: store.get(LS.cfg, null),        // {url, key}
  data: store.get(LS.data, null),      // last data from the sheet
  queue: store.get(LS.queue, []),      // paddles waiting to send
  syncing: false, lastError: '', maps: []
};

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent, dec = decodeURIComponent;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ICON = {
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  cog: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  nav: '<svg viewBox="0 0 24 24"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  gps: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  wave: '<svg viewBox="0 0 24 24"><path d="M2 12c3-3 5 3 8 0s5-3 8 0 4 1 4 1"/><path d="M2 17c3-3 5 3 8 0s5-3 8 0 4 1 4 1"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>'
};

/* ================= data helpers ================= */

function parseDate(s) {
  const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const i = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return i ? new Date(+i[1], +i[2] - 1, +i[3]) : null;
}
const fmtDate = d => d ? d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() : '';
const isoDate = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const ukDate = iso => { const p = String(iso).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; };
const splitNames = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : null; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function entries() {
  // Sheet entries plus anything saved on the phone but not yet sent
  const base = (S.data && S.data.entries) || [];
  const pending = S.queue.filter(q => q.kind === 'add').map(q => Object.assign({}, q.paddle, {
    date: ukDate(q.paddle.date), row: null, pendingUid: q.uid
  }));
  const updates = {};
  S.queue.filter(q => q.kind === 'update').forEach(q => { updates[q.row] = q; });
  const all = base.map(e => updates[e.row] ? Object.assign({}, e, updates[e.row].paddle, { date: ukDate(updates[e.row].paddle.date), row: e.row, pendingUid: updates[e.row].uid }) : e)
    .concat(pending);
  all.forEach(e => { e._d = parseDate(e.date); });
  return all.sort((a, b) => (b._d || 0) - (a._d || 0) || String(b.start).localeCompare(String(a.start)));
}

function places() {
  const list = ((S.data && S.data.locations) || []).map(p => Object.assign({}, p));
  const names = new Set(list.map(p => p.name.toLowerCase()));
  // Places created on the phone and still waiting to send
  S.queue.forEach(q => (q.paddle && q.paddle.newPlaces || []).forEach(np => {
    if (!names.has(np.name.toLowerCase())) { names.add(np.name.toLowerCase()); list.push(Object.assign({ position: 'Waiting to send' }, np)); }
  }));
  S.queue.filter(q => q.kind === 'place').forEach(q => {
    const p = list.find(x => x.name === q.name);
    if (p) Object.assign(p, q.fields);
  });
  list.forEach(p => { p.latN = num(p.lat); p.lonN = num(p.lon); });
  return list;
}
const placeByName = () => { const m = {}; places().forEach(p => { m[p.name] = p; }); return m; };

function stats(list) {
  const rivers = new Set(), buddies = new Set();
  list.forEach(e => { if (e.river) rivers.add(e.river.trim()); splitNames(e.paddlers).forEach(n => buddies.add(n)); });
  return { rivers: rivers.size, trips: list.length, buddies: buddies.size };
}

function riverIndex(list) {
  const m = {};
  list.forEach(e => {
    const r = (e.river || '').trim(); if (!r) return;
    (m[r] = m[r] || { name: r, entries: [], sections: new Set() }).entries.push(e);
    if (e.section) m[r].sections.add(e.section);
  });
  return Object.values(m).map(r => {
    const ds = r.entries.map(e => e._d).filter(Boolean).sort((a, b) => a - b);
    return Object.assign(r, { first: ds[0], last: ds[ds.length - 1] });
  });
}

function buddyCounts(list) {
  const c = {};
  list.forEach(e => splitNames(e.paddlers).forEach(n => { c[n] = (c[n] || 0) + 1; }));
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}

const toFinish = list => list.filter(e => !String(e.notes || '').trim());

/* ================= links ================= */

const dirLink = p => (p.latN != null && p.lonN != null)
  ? 'https://www.google.com/maps/dir/?api=1&destination=' + p.latN + ',' + p.lonN
  : (p.w3w ? 'https://what3words.com/' + String(p.w3w).replace(/^\/+/, '') : '');
const w3wLink = w => 'https://what3words.com/' + String(w).replace(/^\/+/, '');
function gaugeLink(name) {
  const g = (S.data && S.data.gauges) || {};
  return g[name] || ('https://www.google.com/search?q=' + enc(name + ' river level gauge'));
}

/* ================= API & sync ================= */

async function api(action, body) {
  if (!S.cfg || !S.cfg.url) throw new Error('not set up');
  let res;
  if (action === 'data' || action === 'photo') {
    res = await fetch(S.cfg.url + '?action=' + action + '&key=' + enc(S.cfg.key), { cache: 'no-store' });
  } else {
    res = await fetch(S.cfg.url, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, key: S.cfg.key }, body))
    });
  }
  if (!res.ok) throw new Error('Server replied ' + res.status);
  const j = await res.json();
  if (j && j.ok === false) { const e = new Error(j.error || 'Server error'); e.server = true; throw e; }
  return j;
}

async function refresh(quiet) {
  if (!S.cfg) return;
  try {
    const d = await api('data');
    S.data = d; store.set(LS.data, d); S.lastError = '';
    if (!quiet) toast('Up to date');
  } catch (e) {
    S.lastError = e.server ? e.message : '';
    if (!quiet) toast(e.server ? e.message : 'No signal – showing saved copy');
    return;
  }
  // don't redraw a form you're typing into
  if (/^#(add|edit|place)\b/.test(location.hash)) updateDot(); else render();
}

function saveQueue() { store.set(LS.queue, S.queue); updateDot(); }

async function flush() {
  if (S.syncing || !S.queue.length || !S.cfg) return;
  S.syncing = true;
  let sent = 0;
  try {
    while (S.queue.length) {
      const q = S.queue[0];
      try {
        if (q.kind === 'add') await api('add', { paddle: q.paddle });
        else if (q.kind === 'update') await api('update', { row: q.row, expect: q.expect, paddle: q.paddle });
        else if (q.kind === 'place') await api('place', { name: q.name, fields: q.fields });
        S.queue.shift(); sent++; saveQueue();
      } catch (e) {
        if (e.server) { q.error = e.message; saveQueue(); toast('Not saved: ' + e.message); }
        break; // no signal (or a problem) – try again later
      }
    }
  } finally { S.syncing = false; }
  if (sent) { toast(sent === 1 ? 'Sent to your log' : sent + ' paddles sent to your log'); await refresh(true); }
}

function enqueue(item) {
  item.uid = item.uid || uid();
  if (item.paddle) item.paddle.uid = item.uid;
  S.queue.push(item); saveQueue();
  if (navigator.onLine) flush(); else toast('Saved on phone – will send when you have signal');
}

window.addEventListener('online', () => { flush(); refresh(true); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { flush(); } });

/* ================= UI bits ================= */

let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
}
function updateDot() {
  const n = S.queue.length + (S.data ? toFinish(entries()).filter(e => e._d && (Date.now() - e._d) < 400 * 864e5).length : 0);
  const d = $('#finishDot'); if (!d) return;
  d.hidden = !n; d.textContent = n;
}
function topbar(title, back) {
  return `<div class="topbar">${back ? `<button class="iconbtn" onclick="history.length>1?history.back():go('${back}')" aria-label="Back">${ICON.back}</button>` : ''}
    <h1>${esc(title)}</h1></div>`;
}
const go = h => { location.hash = h; };
window.go = go;

function syncBanner() {
  if (!S.queue.length) return '';
  const err = S.queue.find(q => q.error);
  return `<div class="banner ${err ? '' : 'green'}"><div class="grow">${S.queue.length} waiting to send${err ? ' – ' + esc(err.error) : ''}</div>
    <button class="btn small" onclick="flush()">Send now</button></div>`;
}
window.flush = flush;

/* ---------- maps ---------- */

function clearMaps() { S.maps.forEach(m => { try { m.remove(); } catch (e) {} }); S.maps = []; }

function tileLayer() {
  const key = S.data && S.data.settings && S.data.settings.osKey;
  if (key) {
    return L.tileLayer('https://api.os.uk/maps/raster/v1/zxy/Outdoor_3857/{z}/{x}/{y}.png?key=' + enc(key), {
      maxZoom: 20, attribution: 'Contains OS data &copy; Crown copyright and database rights ' + new Date().getFullYear()
    });
  }
  return L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17, subdomains: 'abc',
    attribution: 'Map: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), &copy; OpenStreetMap contributors'
  });
}

function pinColour(use) {
  if (use === 'Take out') return { fill: '#F4A261', line: '#C96A2B' };
  if (use === 'Both') return { fill: '#6DB33F', line: '#C96A2B' };
  return { fill: '#6DB33F', line: '#3F7A22' };
}

const pinIcon = () => L.divIcon({ className: 'wl-pin', html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 33] });

function makeMap(el, pts, opts) {
  opts = opts || {};
  if (typeof L === 'undefined') { el.innerHTML = '<div class="empty">Map unavailable</div>'; return null; }
  const map = L.map(el, { zoomControl: false, attributionControl: true, tap: true });
  L.control.zoom({ position: 'topright' }).addTo(map);
  tileLayer().addTo(map);
  const ll = [];
  pts.forEach(p => {
    if (p.lat == null || p.lon == null) return;
    const c = pinColour(p.use);
    const m = p.n
      ? L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'wl-num', html: `<span class="seq ${p.use === 'Take out' ? 'out' : p.use === 'Both' ? 'both' : ''}">${p.n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(map)
      : L.circleMarker([p.lat, p.lon], { radius: opts.big ? 9 : 7, color: c.line, weight: 3, fillColor: c.fill, fillOpacity: .95 }).addTo(map);
    if (p.popup) m.bindPopup(p.popup);
    ll.push([p.lat, p.lon]);
  });
  if (ll.length > 1) map.fitBounds(ll, { padding: [28, 28], maxZoom: opts.maxZoom || 14 });
  else if (ll.length === 1) map.setView(ll[0], opts.zoom || 14);
  else map.setView([52.6, -2.5], 6);
  S.maps.push(map);
  setTimeout(() => { if (S.maps.includes(map)) try { map.invalidateSize(); } catch (e) {} }, 60);
  return map;
}

/* ================= screens ================= */

function screenSetup(msg) {
  const c = S.cfg || {};
  return topbar('Set up', S.cfg ? 'home' : '') + `<div class="wrap form">
    ${msg ? `<div class="banner">${esc(msg)}</div>` : ''}
    <p class="muted">Connect Water Log to your Canoe Log Book. Paste the web app address and the App key
      from the Settings tab of the sheet. You only do this once on each phone.</p>
    <div class="btnrow"><button class="btn block" onclick="pasteSetup()">Paste setup link</button></div>
    <p class="muted">Copy the setup link from your messages first, then tap the button. Or fill in the two boxes below.</p>
    <label>Web app address</label><input id="su_url" value="${esc(c.url || '')}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="url">
    <label>App key</label><input id="su_key" value="${esc(c.key || '')}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
    <div class="btnrow"><button class="btn block" onclick="saveSetup()">Connect</button></div>
    ${S.cfg ? `<h2>On this phone</h2>
      <div class="card flat"><div class="kv">
        <dt>Paddles saved</dt><dd>${S.data ? S.data.entries.length : 0}</dd>
        <dt>Last updated</dt><dd>${S.data ? fmtDate(new Date(S.data.loadedAt)) + ' ' + new Date(S.data.loadedAt).toTimeString().slice(0, 5) : '–'}</dd>
        <dt>Waiting to send</dt><dd>${S.queue.length}</dd></div>
        <div class="btnrow"><button class="btn small ghost" onclick="refresh()">${ICON.refresh} Refresh now</button>
        ${S.queue.length ? '<button class="btn small" onclick="flush()">Send now</button>' : ''}</div></div>` : ''}
  </div>`;
}
window.pasteSetup = async function () {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch (e) { toast('Couldn\'t read the clipboard – paste into the address box instead'); return; }
  if (!/#setup=/.test(text || '')) { toast('That isn\'t the setup link – copy it again and retry'); return; }
  $('#su_url').value = text.trim(); $('#su_key').value = '';
  saveSetup();
};
window.saveSetup = async function () {
  let raw = $('#su_url').value.replace(/\s+/g, ''), key = $('#su_key').value.replace(/\s+/g, '');
  // a whole setup link pasted into the box also works
  const link = raw.match(/#setup=([^&]+)&key=(.+)$/);
  if (link) { raw = dec(link[1]); key = dec(link[2]); }
  const m = raw.match(/script\.google\.com\/macros\/s\/([\w-]+)\/exec/i);
  if (!m) { toast('That doesn\'t look like a web app address ending /exec'); return; }
  const url = 'https://script.google.com/macros/s/' + m[1] + '/exec';
  if (!key) { toast('Add the App key'); return; }
  S.cfg = { url, key }; store.set(LS.cfg, S.cfg);
  toast('Connecting…');
  try { const d = await api('data'); S.data = d; store.set(LS.data, d); toast('Connected – ' + d.entries.length + ' paddles'); go('home'); render(); }
  catch (e) { toast(e.server ? e.message : 'Could not reach the sheet – check the address and signal'); }
};
window.refresh = refresh;

function screenHome() {
  const list = entries(), st = stats(list);
  const name = (S.data && S.data.settings && S.data.settings.appName) || 'Water Log';
  const n = S.queue.length;
  return `<section class="home" id="home"><div class="board" id="board">
      <div class="ph p1" role="img" aria-label="Hugh canoeing through white water"></div>
      ${n ? `<button class="pending" onclick="flush()">${n} waiting to send · Send now</button>` : ''}
      <button class="gear" onclick="go('setup')" aria-label="Settings">${ICON.cog}</button>
      <h1 class="title">${esc(name)}</h1>
      <button class="st s1" onclick="go('rivers')"><b>${st.rivers}</b><span>Rivers</span></button>
      <button class="st s2" onclick="go('trips')"><b>${st.trips}</b><span>Trips</span></button>
      <button class="st s3" onclick="go('buddies')"><b>${st.buddies}</b><span>Buddies</span></button>
      <div class="ph p2" role="img" aria-label="Hugh in his red canoe"></div>
    </div></section>`;
}
function fitHome() {
  const b = $('#board'), h = $('#home'); if (!b || !h) return;
  const k = h.clientWidth / 393;
  b.style.transform = 'scale(' + k + ')';
  h.style.height = Math.round(768 * k) + 'px';
}
function afterHome() { fitHome(); }
window.addEventListener('resize', fitHome);

/* ---------- map of all places ---------- */
function riversByPlace() {
  const m = {};
  entries().forEach(e => [e.putInPlace, e.takeOutPlace].forEach(p => { if (p) (m[p] = m[p] || new Set()).add(e.river); }));
  return m;
}
function screenMap() {
  return topbar('Map', '') + `<div class="wrap">
    <div class="legend" style="margin-top:12px"><span><i style="background:#6DB33F"></i>Get in</span><span><i class="out"></i>Take out</span><span><i class="both"></i>Both</span></div>
    <div class="mapfull" id="allMap"></div></div>`;
}
function afterMap() {
  const el = $('#allMap'); if (!el) return;
  const rb = riversByPlace();
  const pts = places().filter(p => p.latN != null).map(p => {
    const rivs = Array.from(rb[p.name] || [p.river]).filter(Boolean);
    const d = dirLink(p);
    return {
      lat: p.latN, lon: p.lonN, use: p.use,
      popup: `<b>${esc(p.name)}</b><br>${esc(p.use || '')}<br>${rivs.map(r => `<a href="#river/${enc(r)}">${esc(r)}</a>`).join(' · ')}` +
        (d ? `<br><a href="${d}" target="_blank" rel="noopener">Directions</a>` : '')
    };
  });
  makeMap(el, pts, { maxZoom: 8 });
}

function screenTrips() {
  const list = entries();
  return topbar('Trips', 'home') + `<div class="wrap">
    <input class="search" id="tq" placeholder="Search river, place, paddler…" oninput="filterTrips()">
    <ul class="list" id="tripList">${tripRows(list)}</ul></div>`;
}
function tripRows(list) {
  return list.map(e => `<li><a class="row" href="#trip/${e.row || 'p:' + e.pendingUid}">
      <div class="datebox"><b>${e._d ? e._d.getDate() : '?'}</b><span>${e._d ? MONTHS[e._d.getMonth()] + ' ' + String(e._d.getFullYear()).slice(2) : ''}</span></div>
      <div class="grow"><div class="t">${esc(e.river)}${e.section ? ' · ' + esc(e.section) : ''}</div>
      <div class="s">${esc([e.putInPlace, e.paddlers].filter(Boolean).join(' · ') || e.craft || '')}</div></div>
      ${e.pendingUid ? '<span class="badge orange">Waiting</span>' : ''}${ICON.chev}</a></li>`).join('') || '<div class="empty">No trips yet</div>';
}
window.filterTrips = function () {
  const q = $('#tq').value.toLowerCase();
  const list = entries().filter(e => [e.river, e.section, e.putInPlace, e.takeOutPlace, e.paddlers, e.notes, e.date].join(' ').toLowerCase().includes(q));
  $('#tripList').innerHTML = tripRows(list);
};

function screenBuddies() {
  const b = buddyCounts(entries());
  return topbar('Paddling buddies', 'home') + `<div class="wrap">
    <input class="search" id="bq" placeholder="Search names" oninput="filterBuddies()">
    <ul class="list" id="budList">${budRows(b)}</ul></div>`;
}
const budRows = b => b.map(([n, c]) => `<li><a class="row" href="#buddy/${enc(n)}"><div class="grow"><div class="t">${esc(n)}</div></div>
  <span class="badge">${c} ${c === 1 ? 'trip' : 'trips'}</span>${ICON.chev}</a></li>`).join('');
window.filterBuddies = function () {
  const q = $('#bq').value.toLowerCase();
  $('#budList').innerHTML = budRows(buddyCounts(entries()).filter(([n]) => n.toLowerCase().includes(q)));
};
function screenBuddy(name) {
  const list = entries().filter(e => splitNames(e.paddlers).includes(name));
  return topbar(name, 'buddies') + `<div class="wrap"><p class="muted">${list.length} ${list.length === 1 ? 'trip' : 'trips'} together</p>
    <ul class="list">${tripRows(list)}</ul></div>`;
}

function screenRivers() {
  const sort = store.get(LS.sort, 'recent');
  return topbar('Rivers', '') + `<div class="wrap">
    <input class="search" id="rq" placeholder="Search rivers" oninput="filterRivers()">
    <div class="seg">${[['recent', 'Recent'], ['most', 'Most paddled'], ['az', 'A–Z']].map(([k, l]) =>
      `<button class="${sort === k ? 'on' : ''}" onclick="setRiverSort('${k}')">${l}</button>`).join('')}</div>
    <ul class="list" id="riverList"></ul></div>`;
}
function afterRivers() { filterRivers(); }
window.setRiverSort = k => { store.set(LS.sort, k); render(); };
window.filterRivers = function () {
  const q = ($('#rq') && $('#rq').value || '').toLowerCase(), sort = store.get(LS.sort, 'recent');
  let rs = riverIndex(entries()).filter(r => r.name.toLowerCase().includes(q));
  if (sort === 'az') rs.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'most') rs.sort((a, b) => b.entries.length - a.entries.length || a.name.localeCompare(b.name));
  else rs.sort((a, b) => (b.last || 0) - (a.last || 0));
  $('#riverList').innerHTML = rs.map(r => `<li><a class="row" href="#river/${enc(r.name)}">
      <div class="grow"><div class="t">${esc(r.name)}</div>
      <div class="s">${r.entries.length} ${r.entries.length === 1 ? 'trip' : 'trips'} · last ${fmtDate(r.last)}</div></div>
      ${ICON.chev}</a></li>`).join('') || '<div class="empty">No rivers match</div>';
};

function riverPlaces(river, list) {
  const pm = placeByName(), used = {};
  list.forEach(e => {
    [['putInPlace', 'in'], ['takeOutPlace', 'out']].forEach(([k, kind]) => {
      const n = e[k]; if (!n) return;
      const u = used[n] = used[n] || { kinds: new Set(), count: 0, last: null };
      u.kinds.add(kind); u.count++; if (!u.last || (e._d && e._d > u.last)) u.last = e._d;
    });
  });
  // also places filed against this river that haven't been used yet
  places().forEach(p => { if (p.river === river && !used[p.name]) used[p.name] = { kinds: new Set(), count: 0 }; });
  const out = Object.entries(used).map(([n, u]) => {
    const p = pm[n] || { name: n };
    const use = p.use || (u.kinds.size === 2 ? 'Both' : u.kinds.has('out') ? 'Take out' : 'Get in');
    return Object.assign({}, p, { use, count: u.count, last: u.last });
  });
  return flowOrder(out, list);
}

// Order a river's places from the top of the river down. Each trip says its put-in is upstream of its
// take-out; places not linked by trips fall back to their position along the river's general direction.
function flowOrder(ps, list) {
  const n = ps.length, idx = {};
  ps.forEach((p, i) => { idx[p.name] = i; });
  let dx = 0, dy = 0;
  const out = ps.map(() => new Set()), indeg = Array(n).fill(0);
  list.forEach(e => {
    const a = idx[e.putInPlace], b = idx[e.takeOutPlace];
    if (a == null || b == null || a === b) return;
    if (!out[a].has(b)) { out[a].add(b); indeg[b]++; }
    const A = ps[a], B = ps[b];
    if (A.latN != null && B.latN != null) {
      const vx = (B.lonN - A.lonN) * Math.cos(A.latN * Math.PI / 180), vy = B.latN - A.latN, len = Math.hypot(vx, vy) || 1;
      dx += vx / len; dy += vy / len;
    }
  });
  const sc = ps.map(p => p.latN == null ? Infinity : p.lonN * Math.cos(p.latN * Math.PI / 180) * dx + p.latN * dy);
  // places with no position sit just below where they were put in from (or just above where they lead to)
  const preds = ps.map(() => []); out.forEach((set, a) => set.forEach(b => preds[b].push(a)));
  ps.forEach((p, i) => {
    if (sc[i] !== Infinity) return;
    const up = preds[i].map(a => sc[a]).filter(isFinite), down = Array.from(out[i]).map(b => sc[b]).filter(isFinite);
    if (up.length) sc[i] = Math.max(...up) + 1e-9; else if (down.length) sc[i] = Math.min(...down) - 1e-9;
  });
  // a put-in is never placed below anywhere it leads to, even if its saved position is off
  const eff = Array(n).fill(null), busy = Array(n).fill(false);
  const effOf = i => {
    if (eff[i] != null) return eff[i];
    if (busy[i]) return sc[i];
    busy[i] = true;
    let v = sc[i];
    out[i].forEach(j => { v = Math.min(v, effOf(j) - 1e-9); });
    busy[i] = false;
    return (eff[i] = v);
  };
  ps.forEach((p, i) => effOf(i));
  const num = v => v === Infinity ? 1e12 : v;
  const cmp = (a, b) => (num(eff[a]) - num(eff[b])) || (num(sc[a]) - num(sc[b])) ||
    (ps[a].use === 'Take out') - (ps[b].use === 'Take out') || ps[a].name.localeCompare(ps[b].name);
  const done = Array(n).fill(false), order = [];
  while (order.length < n) {
    let cand = [];
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] <= 0) cand.push(i);
    if (!cand.length) for (let i = 0; i < n; i++) if (!done[i]) cand.push(i); // trips that loop back
    cand.sort(cmp);
    const i = cand[0]; done[i] = true; order.push(i);
    out[i].forEach(j => { indeg[j]--; });
  }
  return order.map(i => ps[i]);
}

function placeCard(p, noEdit) {
  const badge = p.use === 'Take out' ? '<span class="badge orange">Take out</span>' : p.use === 'Both' ? '<span class="badge">Get in</span> <span class="badge orange">Take out</span>' : '<span class="badge">Get in</span>';
  const pos = p.position && p.position !== 'From log' ? `<span class="badge warn">${esc(p.position)}</span>` : '';
  const d = dirLink(p);
  return `<div class="card place">
    <h3>${esc(p.name)} ${badge} ${pos}</h3>
    <div class="codes">${p.grid ? `<span>${esc(p.grid)}</span>` : ''}${p.w3w ? `<span><a href="${w3wLink(p.w3w)}" target="_blank" rel="noopener">${esc(p.w3w)}</a></span>` : ''}${p.count ? `<span>Used ${p.count}×</span>` : ''}</div>
    ${p.notes ? `<div class="notes muted">${esc(p.notes)}</div>` : ''}
    <div class="btnrow">
      ${d ? `<a class="btn small" href="${d}" target="_blank" rel="noopener">${ICON.nav} Directions</a>` : ''}
      <button class="btn small share" onclick="sharePlace(${esc(JSON.stringify(p.name))})">${ICON.share} Share</button>
      ${noEdit ? '' : `<a class="btn small ghost" href="#place/${enc(p.name)}">${ICON.edit} ${p.latN == null ? 'Add position' : 'Edit'}</a>`}
    </div></div>`;
}

// One line per place; tap to open the details
function placeRow(p, i) {
  const cls = p.use === 'Take out' ? 'out' : p.use === 'Both' ? 'both' : '';
  const d = dirLink(p);
  const pos = p.position && p.position !== 'From log' ? `<span class="badge warn">${esc(p.position)}</span>` : '';
  return `<details class="prow"><summary><span class="seq ${cls}">${i + 1}</span><span class="nm">${esc(p.name)}</span><span class="use">${esc(p.use || '')}</span>${ICON.chev}</summary>
    <div class="body">${pos}
      <div class="codes">${p.grid ? `<span>${esc(p.grid)}</span>` : ''}${p.w3w ? `<span><a href="${w3wLink(p.w3w)}" target="_blank" rel="noopener">${esc(p.w3w)}</a></span>` : ''}${p.count ? `<span>Used ${p.count}×</span>` : ''}</div>
      ${p.notes ? `<div class="notes muted">${esc(p.notes)}</div>` : ''}
      <div class="btnrow">
        ${d ? `<a class="btn small" href="${d}" target="_blank" rel="noopener">${ICON.nav} Directions</a>` : ''}
        <button class="btn small share" onclick="sharePlace(${esc(JSON.stringify(p.name))})">${ICON.share} Share</button>
        <a class="btn small ghost" href="#place/${enc(p.name)}">${ICON.edit} ${p.latN == null ? 'Add position' : 'Edit'}</a>
      </div></div></details>`;
}

// Share a place through the phone's share sheet (WhatsApp, Messages, email…)
window.sharePlace = async function (name) {
  const p = placeByName()[name]; if (!p) return;
  const lines = [p.name + (p.river ? ' – ' + p.river : '') + (p.use ? ' (' + p.use.toLowerCase() + ')' : '')];
  if (p.latN != null) lines.push('Map: https://www.google.com/maps/search/?api=1&query=' + p.latN + ',' + p.lonN);
  if (p.grid) lines.push('OS grid ref: ' + p.grid);
  if (p.w3w) lines.push('what3words: ///' + String(p.w3w).replace(/^\/+/, ''));
  if (p.notes) lines.push(p.notes);
  const text = lines.join('\n');
  if (navigator.share) { try { await navigator.share({ title: p.name, text }); } catch (e) {} return; }
  try { await navigator.clipboard.writeText(text); toast('Copied – paste it into a message'); } catch (e) { toast('Sharing isn\'t available here'); }
};

function screenRiver(name) {
  const list = entries().filter(e => (e.river || '').trim() === name);
  const r = riverIndex(list)[0] || { entries: [], sections: new Set() };
  const ps = riverPlaces(name, list);
  const gauges = {};
  list.forEach(e => String(e.gauge || '').split('/').map(x => x.trim()).filter(Boolean).forEach(g => { gauges[g] = (gauges[g] || 0) + 1; }));
  const yrs = r.first ? (r.first.getFullYear() === r.last.getFullYear() ? r.first.getFullYear() : r.first.getFullYear() + '–' + r.last.getFullYear()) : '';
  return topbar(name, 'rivers') + `<div class="wrap">
    <div class="meta"><span class="badge">${list.length} ${list.length === 1 ? 'trip' : 'trips'}</span>${yrs ? `<span class="badge grey">${yrs}</span>` : ''}
      ${Array.from(r.sections).slice(0, 6).map(s => `<span class="badge orange">${esc(s)}</span>`).join('')}</div>
    <div class="mapbox small" id="riverMap"></div>
    <div class="legend"><span><i style="background:#6DB33F"></i>Get in</span><span><i class="out"></i>Take out</span><span><i class="both"></i>Both</span></div>
    <h2>Get-ins &amp; take-outs</h2>
    ${ps.length ? `<div class="updown">Top of the river first, worked out from your trips. Tap a place for details.</div>
      <div class="places">${ps.map(placeRow).join('')}</div>` : '<div class="empty">No places saved yet</div>'}
    ${Object.keys(gauges).length ? `<h2>Gauges</h2><div class="card">${Object.keys(gauges).map(g =>
      `<div class="row" style="box-shadow:none;margin:0;padding:8px 0;cursor:default"><div class="grow"><div class="t">${esc(g)}</div>
        <div class="s">${gauges[g]} ${gauges[g] === 1 ? 'reading' : 'readings'}${(S.data.gauges || {})[g] ? '' : ' · link searches the web'}</div></div>
        <a class="btn small orange" href="${gaugeLink(g)}" target="_blank" rel="noopener">${ICON.wave} Live level</a></div>`).join('')}</div>` : ''}
    <h2>Levels &amp; visits</h2>
    <ul class="list">${list.map(e => {
      const lv = [e.level !== '' && e.level != null ? e.level + ' m' : '', e.flow ? e.flow + ' cumecs' : ''].filter(Boolean).join(' · ');
      return `<li><a class="row" href="#trip/${e.row || 'p:' + e.pendingUid}">
        <div class="datebox"><b>${e._d ? e._d.getDate() : '?'}</b><span>${e._d ? MONTHS[e._d.getMonth()] + ' ' + String(e._d.getFullYear()).slice(2) : ''}</span></div>
        <div class="grow"><div class="t">${esc(e.section || e.putInPlace || e.river)}${lv ? ` <span class="badge">${esc(lv)}</span>` : ''}</div>
        <div class="s">${esc([e.gauge, e.levelComments].filter(Boolean).join(' – ') || 'No level noted')}</div></div>${ICON.chev}</a></li>`;
    }).join('')}</ul></div>`;
}
function afterRiver(name) {
  const el = $('#riverMap'); if (!el) return;
  const list = entries().filter(e => (e.river || '').trim() === name);
  const pts = riverPlaces(name, list).map((p, i) => Object.assign(p, { n: i + 1 })).filter(p => p.latN != null).map(p => ({
    lat: p.latN, lon: p.lonN, use: p.use, n: p.n,
    popup: `<b>${esc(p.name)}</b><br>${esc(p.use)}${dirLink(p) ? `<br><a href="${dirLink(p)}" target="_blank" rel="noopener">Directions</a>` : ''}`
  }));
  makeMap(el, pts, { big: true, maxZoom: 15, zoom: 14 });
}

function findEntry(id) {
  const list = entries();
  return id.startsWith('p:') ? list.find(e => e.pendingUid === id.slice(2)) : list.find(e => String(e.row) === String(id));
}

function screenTrip(id) {
  const e = findEntry(id);
  if (!e) return topbar('Trip', 'home') + '<div class="wrap empty">Not found – it may have moved. Try refreshing.</div>';
  const pm = placeByName();
  const placeLine = (label, n, notes) => {
    if (!n && !notes) return '';
    const p = pm[n] || {}; const d = dirLink(p);
    return `<dt>${label}</dt><dd>${n ? `<a href="#place/${enc(n)}">${esc(n)}</a>` : ''}${d ? ` · <a href="${d}" target="_blank" rel="noopener">Directions</a>` : ''}${notes ? '\n' + esc(notes) : ''}</dd>`;
  };
  const lv = [e.level !== '' && e.level != null ? e.level + ' m' : '', e.flow ? e.flow + ' cumecs' : ''].filter(Boolean).join(' · ');
  const editable = e.row || e.pendingUid;
  return topbar(fmtDate(e._d), 'home') + `<div class="wrap">
    ${e.pendingUid ? '<div class="banner">Saved on this phone, waiting to send.</div>' : ''}
    <div class="card"><h3><a href="#river/${enc(e.river)}">${esc(e.river)}</a>${e.section ? ' · ' + esc(e.section) : ''}</h3>
      <div class="meta">${e.craft ? `<span class="badge grey">${esc(e.craft)}</span>` : ''}${e.start || e.finish ? `<span class="badge grey">${esc(e.start || '?')}–${esc(e.finish || '?')}</span>` : ''}${lv ? `<span class="badge">${esc(lv)}</span>` : ''}</div>
      <dl class="kv" style="margin-top:12px">
        ${placeLine('Put in', e.putInPlace, e.putInNotes)}
        ${placeLine('Take out', e.takeOutPlace, e.takeOutNotes)}
        ${e.weather ? `<dt>Weather</dt><dd>${esc(e.weather)}</dd>` : ''}
        ${e.tide ? `<dt>Tide</dt><dd>${esc(e.tide)}</dd>` : ''}
        ${e.gauge ? `<dt>Gauge</dt><dd>${esc(e.gauge)}${lv ? ' – ' + esc(lv) : ''}</dd>` : ''}
        ${e.levelComments ? `<dt>Level</dt><dd>${esc(e.levelComments)}</dd>` : ''}
      </dl></div>
    ${splitNames(e.paddlers).length ? `<h2>Paddlers</h2><div class="chips">${splitNames(e.paddlers).map(n => `<a class="chip" href="#buddy/${enc(n)}" style="text-decoration:none;color:inherit">${esc(n)}</a>`).join('')}</div>` : ''}
    <h2>Notes</h2><div class="card notes">${e.notes ? esc(e.notes) : '<span class="muted">No notes yet</span>'}</div>
    ${editable ? `<div class="btnrow"><a class="btn block orange" href="#edit/${e.row || 'p:' + e.pendingUid}">${ICON.edit} ${e.notes ? 'Edit' : 'Finish this entry'}</a></div>` : ''}
  </div>`;
}

function screenFinish() {
  const list = toFinish(entries());
  const recent = list.filter(e => e._d && (Date.now() - e._d) < 400 * 864e5), older = list.filter(e => !recent.includes(e));
  return topbar('To finish', '') + `<div class="wrap">${syncBanner()}
    <p class="muted">Paddles that still need notes. Tap one to finish it.</p>
    <ul class="list">${tripRows(recent)}</ul>
    ${older.length ? `<details class="more"><summary>Older entries without notes (${older.length})</summary><ul class="list">${tripRows(older)}</ul></details>` : ''}
    ${!list.length ? '<div class="empty">All done</div>' : ''}</div>`;
}

/* ---------- add / edit form ---------- */

const FORM = {}; // state for the open form

function placeOptions(river, selected) {
  const ps = places();
  const mine = ps.filter(p => p.river === river).map(p => p.name);
  const used = new Set();
  entries().filter(e => e.river === river).forEach(e => { if (e.putInPlace) used.add(e.putInPlace); if (e.takeOutPlace) used.add(e.takeOutPlace); });
  const top = Array.from(new Set(mine.concat(Array.from(used)))).sort();
  const rest = ps.map(p => p.name).filter(n => !top.includes(n)).sort();
  const opt = n => `<option value="${esc(n)}"${n === selected ? ' selected' : ''}>${esc(n)}</option>`;
  return `<option value="">– choose –</option>
    ${top.length ? `<optgroup label="${esc(river || 'This river')}">${top.map(opt).join('')}</optgroup>` : ''}
    <option value="__new">＋ New place…</option>
    <optgroup label="All places">${rest.map(opt).join('')}</optgroup>`;
}

function placeField(which, label, value) {
  return `<label>${label}</label>
    <select id="f_${which}" onchange="placeChanged('${which}')">${placeOptions(FORM.river, value)}
      ${which === 'out' ? `<option value="__same">Same as put in</option>` : ''}</select>
    <div id="np_${which}" class="subform" hidden>
      <label>Name of new place</label><input id="np_${which}_name" placeholder="e.g. Ferry Lane slip">
      <div class="btnrow"><button type="button" class="btn small" onclick="useGPS('${which}')">${ICON.gps} Use my location</button>
        <button type="button" class="btn small ghost" onclick="pickOnMap('${which}')">${ICON.pin} Pick on map</button></div>
      <div id="np_${which}_map" class="pickmap" hidden></div>
      <div class="grid2"><div><label>OS grid ref</label><input id="np_${which}_grid" placeholder="SX 7506 6594" onchange="gridTyped('${which}')"></div>
        <div><label>what3words</label><input id="np_${which}_w3w" placeholder="///word.word.word"></div></div>
      <div class="muted" id="np_${which}_pos"></div>
      <label>Access notes (parking, carry, gates)</label><textarea id="np_${which}_notes" style="min-height:70px"></textarea>
    </div>`;
}

function screenForm(id) {
  const editing = id != null;
  let e = {};
  if (editing) {
    e = findEntry(id);
    if (!e) return topbar('Edit', 'home') + '<div class="wrap empty">Not found – try refreshing.</div>';
  }
  const draft = !editing ? store.get(LS.draft, null) : null;
  const v = Object.assign({ date: isoDate(new Date()), craft: 'Canoe' }, draft || {},
    editing ? Object.assign({}, e, { date: e._d ? isoDate(e._d) : '' }) : {});
  FORM.id = id; FORM.river = v.river || ''; FORM.np = { in: {}, out: {} };
  FORM.paddlers = splitNames(v.paddlers);
  const ents = entries();
  const rivers = Array.from(new Set(ents.map(x => x.river).filter(Boolean))).sort();
  const crafts = Array.from(new Set(['Canoe', 'Kayak', 'Sea kayak', 'SUP'].concat(ents.map(x => x.craft).filter(Boolean))));
  const gauges = Array.from(new Set(Object.keys((S.data && S.data.gauges) || {}).concat(ents.map(x => x.gauge).filter(Boolean)))).sort();
  const full = editing;
  const f = (k, l, ph, type) => `<label>${l}</label><input id="f_${k}" ${type ? `type="${type}"` : ''} value="${esc(v[k] || '')}" placeholder="${esc(ph || '')}">`;
  const ta = (k, l, ph) => `<label>${l}</label><textarea id="f_${k}" placeholder="${esc(ph || '')}">${esc(v[k] || '')}</textarea>`;
  const more = `
      <div class="grid2"><div>${f('start', 'Start', '', 'time')}</div><div>${f('finish', 'Finish', '', 'time')}</div></div>
      ${f('weather', 'Weather', 'Sunny, light SW breeze')}
      ${f('tide', 'Tide', 'HW 14:41 Richmond')}
      <label>Gauge</label><input id="f_gauge" list="dl_gauges" value="${esc(v.gauge || '')}">
      <div class="grid2"><div>${f('level', 'Level (m)', '0.75', 'text')}</div><div>${f('flow', 'Flow (cumecs)', '', 'text')}</div></div>
      ${ta('levelComments', 'Level comments', 'Good level, few scrapes')}
      ${ta('notes', 'Notes', 'How it went, lines, swims, lessons…')}
      ${ta('putInNotes', 'Put-in notes for this trip', '')}
      ${ta('takeOutNotes', 'Take-out notes for this trip', '')}`;
  return topbar(editing ? 'Edit paddle' : 'Log a paddle', editing ? 'trip/' + id : 'home') + `<div class="wrap form" id="paddleForm">
    ${!editing && draft ? '<div class="banner"><div class="grow">Carrying on from an unsaved draft.</div><button class="btn small ghost" onclick="clearDraft()">Start fresh</button></div>' : ''}
    <div class="grid2"><div>${f('date', 'Date', '', 'date')}</div>
      <div><label>Craft</label><input id="f_craft" list="dl_crafts" value="${esc(v.craft || '')}"></div></div>
    <label>River / water</label><input id="f_river" list="dl_rivers" value="${esc(v.river || '')}" onchange="riverChanged()" autocomplete="off">
    <label>Section</label><input id="f_section" list="dl_sections" value="${esc(v.section || '')}" autocomplete="off">
    ${placeField('in', 'Put in', v.putInPlace)}
    ${placeField('out', 'Take out', v.takeOutPlace)}
    <label>Paddlers</label>
    <div class="chips" id="padChips"></div>
    <input id="f_padIn" list="dl_buddies" placeholder="Add a name, then tap Add" onkeydown="if(event.key==='Enter'||event.key===','){event.preventDefault();addPaddler()}">
    <div class="btnrow"><button type="button" class="btn small ghost" onclick="addPaddler()">Add</button></div>
    <div class="chips" id="padSuggest"></div>
    ${full ? more : `<details class="more"><summary>More details (or finish later)</summary>${more}</details>`}
    <div class="btnrow" style="margin-top:22px"><button class="btn block" onclick="submitForm()">${editing ? 'Save changes' : 'Save paddle'}</button></div>
    <datalist id="dl_rivers">${rivers.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <datalist id="dl_crafts">${crafts.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <datalist id="dl_gauges">${gauges.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <datalist id="dl_sections"></datalist>
    <datalist id="dl_buddies">${buddyCounts(ents).map(([n]) => `<option value="${esc(n)}">`).join('')}</datalist>
  </div>`;
}
function afterForm() {
  sectionsList(); drawPaddlers();
  if (!FORM.id) { const fm = $('#paddleForm'); fm && fm.addEventListener('input', saveDraft); fm && fm.addEventListener('change', saveDraft); }
}
function sectionsList() {
  const r = $('#f_river').value.trim();
  const secs = Array.from(new Set(entries().filter(e => e.river === r).map(e => e.section).filter(Boolean)));
  $('#dl_sections').innerHTML = secs.map(s => `<option value="${esc(s)}">`).join('');
}
window.riverChanged = function () {
  FORM.river = $('#f_river').value.trim();
  ['in', 'out'].forEach(w => {
    const sel = $('#f_' + w), cur = sel.value;
    sel.innerHTML = placeOptions(FORM.river, cur) + (w === 'out' ? '<option value="__same">Same as put in</option>' : '');
    if (cur === '__same') sel.value = '__same';
  });
  sectionsList(); drawPaddlers();
};
window.placeChanged = function (w) {
  const box = $('#np_' + w); box.hidden = $('#f_' + w).value !== '__new';
};
function drawPaddlers() {
  $('#padChips').innerHTML = FORM.paddlers.map((n, i) => `<button type="button" class="chip on" onclick="removePaddler(${i})">${esc(n)}<span class="x">✕</span></button>`).join('');
  // suggestions: people paddled with on this river, then overall regulars
  const ents = entries();
  const onRiver = buddyCounts(ents.filter(e => e.river === FORM.river)).map(x => x[0]);
  const overall = buddyCounts(ents).map(x => x[0]);
  const sug = Array.from(new Set(onRiver.concat(overall))).filter(n => !FORM.paddlers.includes(n)).slice(0, 12);
  $('#padSuggest').innerHTML = sug.map(n => `<button type="button" class="chip" onclick="addPaddler(${esc(JSON.stringify(n))})">${esc(n)}</button>`).join('');
  saveDraft();
}
window.addPaddler = function (n) {
  const inp = $('#f_padIn');
  const names = n ? [n] : splitNames(inp.value);
  names.forEach(x => { if (!FORM.paddlers.includes(x)) FORM.paddlers.push(x); });
  if (!n) inp.value = '';
  drawPaddlers();
};
window.removePaddler = function (i) { FORM.paddlers.splice(i, 1); drawPaddlers(); };

function setNewPos(w, lat, lon, how) {
  FORM.np[w] = { lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
  const g = OSGrid.toGridRef(lat, lon);
  if (g) $('#np_' + w + '_grid').value = g;
  $('#np_' + w + '_pos').textContent = how + ': ' + lat.toFixed(5) + ', ' + lon.toFixed(5);
  if (FORM['pick_' + w]) FORM['pick_' + w].setLatLng([lat, lon]);
  saveDraft();
}
window.useGPS = function (w) {
  if (!navigator.geolocation) { toast('Location not available on this phone'); return; }
  toast('Finding you…');
  navigator.geolocation.getCurrentPosition(
    p => { setNewPos(w, p.coords.latitude, p.coords.longitude, 'From GPS (±' + Math.round(p.coords.accuracy) + ' m)'); toast('Position saved'); },
    err => toast(err.code === 1 ? 'Location permission is off for Safari – check Settings › Privacy › Location' : 'Could not get a fix – try Pick on map'),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
};
window.pickOnMap = function (w) {
  const el = $('#np_' + w + '_map'); el.hidden = false;
  if (FORM['map_' + w]) return;
  const near = places().filter(p => p.river === FORM.river && p.latN != null);
  const map = makeMap(el, near.map(p => ({ lat: p.latN, lon: p.lonN, use: p.use, popup: esc(p.name) })), { maxZoom: 14 });
  if (!map) return;
  FORM['map_' + w] = map;
  toast('Tap the map where the place is');
  map.on('click', ev => {
    if (!FORM['pick_' + w]) FORM['pick_' + w] = L.marker(ev.latlng, { icon: pinIcon() }).addTo(map);
    setNewPos(w, ev.latlng.lat, ev.latlng.lng, 'Picked on map');
  });
};
window.gridTyped = function (w) {
  const ll = OSGrid.fromGridRef($('#np_' + w + '_grid').value);
  if (ll) setNewPos(w, ll[0], ll[1], 'From grid ref'); else if ($('#np_' + w + '_grid').value) toast('Grid ref not recognised');
};

function collectForm() {
  const val = k => { const el = $('#f_' + k); return el ? el.value.trim() : ''; };
  const p = {
    date: val('date'), river: val('river'), section: val('section'), craft: val('craft'),
    paddlers: FORM.paddlers.join(', '),
    start: val('start'), finish: val('finish'), weather: val('weather'), tide: val('tide'), gauge: val('gauge'),
    level: val('level'), flow: val('flow'), levelComments: val('levelComments'), notes: val('notes'),
    putInNotes: val('putInNotes'), takeOutNotes: val('takeOutNotes'), newPlaces: []
  };
  const newPlace = (w, use) => {
    const name = $('#np_' + w + '_name').value.trim();
    if (!name) return null;
    const pos = FORM.np[w] || {};
    return { name, river: p.river, use, lat: pos.lat != null ? pos.lat : '', lon: pos.lon != null ? pos.lon : '',
      grid: $('#np_' + w + '_grid').value.trim(), w3w: $('#np_' + w + '_w3w').value.trim(), notes: $('#np_' + w + '_notes').value.trim() };
  };
  const pin = val('in'), pout = val('out');
  if (pin === '__new') { const np = newPlace('in', 'Get in'); if (np) { p.newPlaces.push(np); p.putInPlace = np.name; } }
  else p.putInPlace = pin;
  if (pout === '__same') { p.takeOutPlace = p.putInPlace; }
  else if (pout === '__new') {
    const np = newPlace('out', 'Take out');
    if (np) { if (p.newPlaces[0] && p.newPlaces[0].name === np.name) p.newPlaces[0].use = 'Both'; else p.newPlaces.push(np); p.takeOutPlace = np.name; }
  } else p.takeOutPlace = pout;
  if (p.takeOutPlace && p.takeOutPlace === p.putInPlace && p.newPlaces[0]) p.newPlaces[0].use = 'Both';
  return p;
}

function saveDraft() {
  if (FORM.id != null || !$('#paddleForm')) return;
  const p = collectForm(); delete p.newPlaces;
  store.set(LS.draft, p);
}
window.clearDraft = function () { store.del(LS.draft); render(); };

window.submitForm = function () {
  const p = collectForm();
  if (!p.date) { toast('Add a date'); return; }
  if (!p.river) { toast('Add the river or water'); return; }
  if ($('#f_in').value === '__new' && !p.putInPlace) { toast('Give the new put-in a name'); return; }
  if ($('#f_out').value === '__new' && !p.takeOutPlace) { toast('Give the new take-out a name'); return; }
  const id = FORM.id;
  if (id != null && String(id).startsWith('p:')) {
    // still on the phone: just replace the waiting item
    const q = S.queue.find(x => x.uid === id.slice(2));
    if (q) { q.paddle = Object.assign(p, { uid: q.uid }); delete q.error; saveQueue(); toast('Updated'); go('trip/' + id); flush(); return; }
  }
  if (id != null) {
    const e = findEntry(id);
    const base = (S.data.entries || []).find(x => String(x.row) === String(id)) || e;
    // drop any earlier waiting edit to the same row
    S.queue = S.queue.filter(q => !(q.kind === 'update' && String(q.row) === String(id)));
    enqueue({ kind: 'update', row: e.row, expect: { date: base.date, river: base.river }, paddle: p });
    go('trip/' + id);
  } else {
    const item = { kind: 'add', paddle: p };
    enqueue(item);
    store.del(LS.draft);
    go('trip/p:' + item.uid);
  }
};

/* ---------- place edit ---------- */

function screenPlace(name) {
  const p = placeByName()[name];
  if (!p) return topbar('Place', 'home') + '<div class="wrap empty">Place not found</div>';
  const usedOn = entries().filter(e => e.putInPlace === name || e.takeOutPlace === name);
  FORM.place = { name, lat: p.latN, lon: p.lonN };
  return topbar(name, 'home') + `<div class="wrap form">
    ${placeCard(Object.assign({}, p, { count: usedOn.length }), true)}
    <h2>Position</h2>
    <div class="btnrow"><button class="btn small" onclick="placeGPS()">${ICON.gps} Use my location</button>
      <span class="muted" style="align-self:center">or tap the map</span></div>
    <div class="mapbox small" id="placeMap"></div>
    <div class="grid2"><div><label>OS grid ref</label><input id="pl_grid" value="${esc(p.grid || '')}" onchange="placeGrid()"></div>
      <div><label>what3words</label><input id="pl_w3w" value="${esc(p.w3w || '')}"></div></div>
    <div class="muted" id="pl_pos">${p.latN != null ? p.latN.toFixed(5) + ', ' + p.lonN.toFixed(5) : 'No position yet'}</div>
    <label>Access notes</label><textarea id="pl_notes">${esc(p.notes || '')}</textarea>
    <div class="btnrow" style="margin-top:18px"><button class="btn block" onclick="savePlace()">Save place</button></div>
    ${usedOn.length ? `<h2>Trips from here</h2><ul class="list">${tripRows(usedOn)}</ul>` : ''}
  </div>`;
}
function afterPlace(name) {
  const p = placeByName()[name]; const el = $('#placeMap'); if (!el || !p) return;
  const map = makeMap(el, p.latN != null ? [] : places().filter(x => x.river === p.river && x.latN != null).map(x => ({ lat: x.latN, lon: x.lonN, use: x.use, popup: esc(x.name) })), { big: true, zoom: 15, maxZoom: 13 });
  if (!map) return;
  if (p.latN != null) map.setView([p.latN, p.lonN], 15);
  FORM.placeMap = map; FORM.placeMarker = p.latN != null ? L.marker([p.latN, p.lonN], { icon: pinIcon() }).addTo(map) : null;
  map.on('click', ev => setPlacePos(ev.latlng.lat, ev.latlng.lng, 'Picked on map'));
}
function setPlacePos(lat, lon, how) {
  FORM.place.lat = +lat.toFixed(6); FORM.place.lon = +lon.toFixed(6); FORM.place.moved = true;
  const g = OSGrid.toGridRef(lat, lon); if (g) $('#pl_grid').value = g;
  $('#pl_pos').textContent = how + ': ' + lat.toFixed(5) + ', ' + lon.toFixed(5);
  if (FORM.placeMarker) FORM.placeMarker.setLatLng([lat, lon]); else FORM.placeMarker = L.marker([lat, lon], { icon: pinIcon() }).addTo(FORM.placeMap);
}
window.placeGPS = function () {
  if (!navigator.geolocation) { toast('Location not available'); return; }
  toast('Finding you…');
  navigator.geolocation.getCurrentPosition(p => { setPlacePos(p.coords.latitude, p.coords.longitude, 'From GPS'); FORM.placeMap.setView([p.coords.latitude, p.coords.longitude], 16); },
    err => toast(err.code === 1 ? 'Location permission is off for Safari' : 'Could not get a fix – tap the map instead'),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
};
window.placeGrid = function () {
  const ll = OSGrid.fromGridRef($('#pl_grid').value);
  if (ll) { setPlacePos(ll[0], ll[1], 'From grid ref'); FORM.placeMap.setView(ll, 15); }
  else toast('Grid ref not recognised');
};
window.savePlace = function () {
  const fields = { grid: $('#pl_grid').value.trim(), w3w: $('#pl_w3w').value.trim(), notes: $('#pl_notes').value.trim() };
  if (FORM.place.moved) { fields.lat = FORM.place.lat; fields.lon = FORM.place.lon; }
  enqueue({ kind: 'place', name: FORM.place.name, fields });
  toast('Place saved'); history.back();
};

/* ================= router ================= */

function render() {
  clearMaps();
  const h = dec(location.hash.replace(/^#/, '')) || 'home';
  const [route, ...restParts] = h.split('/');
  const arg = restParts.join('/');
  const app = $('#app');
  const nav = $('#nav');
  if (!S.cfg && route !== 'setup') { app.innerHTML = screenSetup(); nav.hidden = true; return; }
  nav.hidden = false;
  if (!S.data && route !== 'setup') {
    app.innerHTML = topbar('Water Log', '') + '<div class="wrap empty">Loading your log…</div>';
    refresh(true).then(() => { if (!S.data) app.innerHTML = screenSetup('Could not load your log. Check the details below and your signal.'); });
    return;
  }
  const screens = {
    home: [screenHome, afterHome], rivers: [screenRivers, afterRivers], river: [screenRiver, afterRiver],
    trips: [screenTrips], trip: [screenTrip], buddies: [screenBuddies], buddy: [screenBuddy],
    add: [() => screenForm(null), afterForm], edit: [screenForm, afterForm], finish: [screenFinish],
    place: [screenPlace, afterPlace], setup: [screenSetup], map: [screenMap, afterMap]
  };
  const [scr, after] = screens[route] || screens.home;
  app.innerHTML = scr(route === 'add' ? undefined : arg);
  if (after) after(arg);
  const tab = { home: 'home', trips: 'home', buddies: 'home', buddy: 'home', rivers: 'rivers', river: 'rivers', place: 'rivers', add: 'add', edit: 'finish', finish: 'finish', trip: 'home', map: 'map' }[route] || 'home';
  document.body.classList.toggle('homepage', route === 'home' || !screens[route]);
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  updateDot();
  if (route !== 'add' && route !== 'edit') window.scrollTo(0, 0);
}

// One-tap setup link:  …/#setup=<web app url>&key=<app key>
function setupFromLink() {
  const m = location.hash.match(/^#setup=([^&]+)&key=(.+)$/);
  if (!m) return false;
  S.cfg = { url: dec(m[1]), key: dec(m[2]) }; store.set(LS.cfg, S.cfg);
  S.data = null; store.del(LS.data);
  history.replaceState(null, '', location.pathname + '#home');
  return true;
}

window.addEventListener('hashchange', () => { setupFromLink(); render(); });

/* ================= start ================= */

(function start() {
  setupFromLink();
  const had = !!S.data;
  render();
  if (S.cfg) { if (had) refresh(true); flush(); }
  if ('serviceWorker' in navigator) {
    // when a new version of the app arrives, switch to it straight away
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded && !/^#(add|edit|place)\b/.test(location.hash)) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  }
})();
