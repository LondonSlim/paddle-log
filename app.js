/* Water Log – Hugh's paddling log app.
 * Data lives in the "Canoe Log Book" Google Sheet; a small Apps Script web app is the go-between.
 * Everything is cached on the phone so the app opens and logs paddles with no signal. */
'use strict';

// Each log (Hugh's, Clarissa's) keeps its own copy on the phone: the page sets WL_NS before loading this file
const NS = window.WL_NS || '';
const ROOT = window.WL_ROOT || '';
const LS = {
  cfg: NS + 'wl_cfg', data: NS + 'wl_data', queue: NS + 'wl_queue', draft: NS + 'wl_draft', sort: NS + 'wl_sort', budsort: NS + 'wl_budsort'
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
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  bin: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
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
const dateBox = d => `<div class="datebox"><b>${d ? d.getDate() : '?'}</b><span class="m">${d ? MONTHS[d.getMonth()] : ''}</span><span class="y">${d ? d.getFullYear() : ''}</span></div>`;
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
  const dels = new Set(S.queue.filter(q => q.kind === 'delete').map(q => String(q.row)));
  const all = base.filter(e => !dels.has(String(e.row))).map(e => updates[e.row] ? Object.assign({}, e, updates[e.row].paddle, { date: ukDate(updates[e.row].paddle.date), row: e.row, pendingUid: updates[e.row].uid }) : e)
    .concat(pending);
  // access points renamed on the phone but not yet sent
  const renames = S.queue.filter(q => q.kind === 'place' && q.fields && q.fields.name && q.fields.name !== q.name);
  if (renames.length) all.forEach((e, i) => {
    let a = e.putInPlace, b = e.takeOutPlace;
    renames.forEach(q => { if (a === q.name) a = q.fields.name; if (b === q.name) b = q.fields.name; });
    if (a !== e.putInPlace || b !== e.takeOutPlace) all[i] = Object.assign({}, e, { putInPlace: a, takeOutPlace: b });
  });
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
// Gauges the sheet can read automatically (England, Scotland, France)
const gaugeInfo = () => (S.data && S.data.gaugeInfo) || {};
const autoGauge = g => String(g || '').split('/').map(x => x.trim()).filter(Boolean).some(x => (gaugeInfo()[x] || {}).auto);

// "Now" to five minutes: up to a minute past a five-minute mark rounds down, after that rounds up (12:00:20 → 12:00, 12:01:01 → 12:05)
function roundNow(d) {
  d = d || new Date();
  const secs = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  const block = 300, into = secs % block;
  const t = (into < 60 ? secs - into : secs - into + block) % 86400;
  return String(Math.floor(t / 3600)).padStart(2, '0') + ':' + String(Math.floor(t % 3600 / 60)).padStart(2, '0');
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
    return false;
  }
  // don't redraw a form you're typing into
  if (/^#(addc?|edit|place)\b/.test(location.hash)) updateDot(); else render();
  return true;
}

// Buttons that say what they are doing, then leave the result on the page
const hhmm = () => new Date().toTimeString().slice(0, 5);
window.refreshNow = async function (btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Checking your sheet…'; }
  const ok = await refresh(true);
  S.status = ok ? `Up to date at ${hhmm()} – ${S.data.entries.length} trips, ${(S.data.photos || []).length} photos`
    : S.lastError ? 'Your sheet replied: ' + S.lastError : "Couldn't reach your sheet – check your signal and try again";
  render();
};
window.sendNow = async function (btn) {
  const n = S.queue.length;
  if (!n) { S.status = 'Nothing waiting to send'; render(); return; }
  if (btn) { btn.disabled = true; btn.textContent = `Sending ${n} ${n === 1 ? 'change' : 'changes'}…`; }
  for (let i = 0; S.syncing && i < 120; i++) await new Promise(r => setTimeout(r, 500)); // a send already under way
  await flush();
  const err = S.queue.find(q => q.error);
  S.status = !S.queue.length ? `All sent at ${hhmm()}`
    : err ? 'Not sent – your sheet replied: ' + err.error + '. Tap Discard to drop it.'
    : `${S.queue.length} still waiting – couldn't reach your sheet. It will try again when you have signal.`;
  render();
};

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
        else if (q.kind === 'candidate') await api('candidate', { id: q.id, status: q.status });
        else if (q.kind === 'photo') await api('addphoto', { trip: q.trip, photo: q.photo, uid: q.uid });
        else if (q.kind === 'delete') await api('delete', { row: q.row, expect: q.expect, uid: q.uid });
        else if (q.kind === 'delphoto') await api('deletephoto', { id: q.id, uid: q.uid });
        S.queue.shift(); sent++; saveQueue();
      } catch (e) {
        if (e.server && (q.kind === 'update' || q.kind === 'delete') && /moved/i.test(e.message) && !q.relocated && await relocate(q)) continue;
        if (e.server) { q.error = e.message; saveQueue(); toast('Not saved: ' + e.message); }
        break; // no signal (or a problem) – try again later
      }
    }
  } finally { S.syncing = false; }
  if (sent) { toast(sent === 1 ? 'Sent to your log' : sent + ' changes sent to your log'); await refresh(true); }
}

// The sheet was rearranged on the PC since the phone last loaded it: find the trip again by its date and river
async function relocate(q) {
  q.relocated = true;
  let d;
  try { d = await api('data'); } catch (e) { return false; }
  S.data = d; store.set(LS.data, d);
  const hits = (d.entries || []).filter(x => x.date === q.expect.date && x.river === q.expect.river);
  if (hits.length !== 1) return false;
  q.row = hits[0].row; delete q.error; saveQueue();
  return true;
}

function enqueue(item) {
  item.uid = item.uid || uid();
  if (item.paddle) item.paddle.uid = item.uid;
  S.queue.push(item); saveQueue();
  if (navigator.onLine) flush(); else toast('Saved on phone – will send when you have signal');
}

window.addEventListener('online', () => { flush(); refresh(true); });

// Phones: keep to portrait. iPhone web apps can't lock rotation, so cover the screen in landscape.
function checkTurn() {
  const t = screen.orientation && screen.orientation.type;
  const land = (t ? t.startsWith('landscape') : Math.abs(window.orientation || 0) === 90) && window.innerWidth > window.innerHeight;
  document.body.classList.toggle('turned', !!land && Math.min(screen.width, screen.height) < 600 && !document.body.classList.contains('viewing'));
}
try { screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait').catch(() => {}); } catch (e) {}
window.addEventListener('orientationchange', () => setTimeout(checkTurn, 300));
window.addEventListener('resize', checkTurn);
screen.orientation && screen.orientation.addEventListener && screen.orientation.addEventListener('change', checkTurn);
checkTurn();
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
  return `<div class="banner ${err ? '' : 'green'}"><div class="grow">${S.queue.length} waiting to send${err ? ' – ' + esc(err.error) : ''}${S.status ? `<br><small>${esc(S.status)}</small>` : ''}</div>
    <button class="btn small" onclick="sendNow(this)">Send now</button>
    ${err ? '<button class="btn small ghost" onclick="dropStuck()">Discard</button>' : ''}</div>`;
}
window.flush = flush;
window.dropStuck = function () {
  // the sheet refused this change; drop it so the rest can send
  const i = S.queue.findIndex(q => q.error);
  if (i < 0) return;
  S.queue.splice(i, 1); saveQueue(); toast('Change discarded'); render(); flush();
};

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

// Every access point looks the same: you choose on each trip which one you put in or took out at
function pinColour() {
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
    const c = pinColour();
    const m = p.n
      ? L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'wl-num', html: `<span class="seq">${p.n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(map)
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
        <div class="btnrow"><button class="btn small ghost" onclick="refreshNow(this)">${ICON.refresh} Refresh now</button>
        ${S.queue.length ? '<button class="btn small" onclick="sendNow(this)">Send now</button>' : ''}</div>
        ${S.status ? `<p class="status">${esc(S.status)}</p>` : ''}</div>` : ''}
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
  h.style.height = Math.round(746 * k) + 'px';
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
    <div class="legend" style="margin-top:12px"><span><i style="background:#6DB33F"></i>Access point</span><span><i class="ph"></i>Photo</span></div>
    <div class="mapfull" id="allMap"></div></div>`;
}
function afterMap() {
  const el = $('#allMap'); if (!el) return;
  const rb = riversByPlace();
  const pts = places().filter(p => p.latN != null).map(p => {
    const rivs = Array.from(rb[p.name] || [p.river]).filter(Boolean);
    const d = dirLink(p);
    return {
      lat: p.latN, lon: p.lonN,
      popup: `<b>${esc(p.name)}</b><br>${rivs.map(r => `<a href="#river/${enc(r)}">${esc(r)}</a>`).join(' · ')}` +
        (d ? `<br><a href="${d}" target="_blank" rel="noopener">Directions</a>` : '')
    };
  });
  const map = makeMap(el, pts, { maxZoom: 8 });
  if (map) addPhotoDots(map, livePhotos());
}

// Trips: one card per year; tap a year for its trips. Searching looks across all years.
function screenTrips(year) {
  const list = entries();
  if (year) {
    const yl = list.filter(e => e._d && String(e._d.getFullYear()) === String(year));
    return topbar(year + ' · ' + yl.length + (yl.length === 1 ? ' trip' : ' trips'), 'trips') + `<div class="wrap">
      <ul class="list">${tripRows(yl)}</ul></div>`;
  }
  return topbar('Trips', 'home') + `<div class="wrap">
    <input class="search" id="tq" placeholder="Search river, place, paddler…" oninput="filterTrips()">
    <div id="tripList">${yearCards(list)}</div></div>`;
}
function yearCards(list) {
  const ys = {};
  list.forEach(e => { const y = e._d ? e._d.getFullYear() : 'Undated'; (ys[y] = ys[y] || []).push(e); });
  const keys = Object.keys(ys).sort((a, b) => (b === 'Undated') - (a === 'Undated') || b - a);
  if (!keys.length) return '<div class="empty">No trips yet</div>';
  return `<div class="years">${keys.map(y => {
    const n = ys[y].length, rv = new Set(ys[y].map(e => e.river).filter(Boolean)).size;
    return `<a class="ycard" href="#trips/${enc(y)}"><b>${esc(y)}</b><span>${n} ${n === 1 ? 'trip' : 'trips'}</span><small>${rv} ${rv === 1 ? 'river' : 'rivers'}</small></a>`;
  }).join('')}</div>`;
}
function tripRows(list) {
  return list.map(e => `<li><a class="row" href="#trip/${e.row || 'p:' + e.pendingUid}">
      ${dateBox(e._d)}
      <div class="grow"><div class="t">${esc(e.river)}${e.section ? ' · ' + esc(e.section) : ''}</div>
      <div class="s">${esc([e.putInPlace, e.paddlers].filter(Boolean).join(' · ') || e.craft || '')}</div></div>
      ${e.pendingUid ? '<span class="badge orange">Waiting</span>' : ''}${ICON.chev}</a></li>`).join('') || '<div class="empty">No trips yet</div>';
}
window.filterTrips = function () {
  const q = $('#tq').value.trim().toLowerCase();
  if (!q) { $('#tripList').innerHTML = yearCards(entries()); return; }
  const list = entries().filter(e => [e.river, e.section, e.putInPlace, e.takeOutPlace, e.paddlers, e.notes, e.date].join(' ').toLowerCase().includes(q));
  $('#tripList').innerHTML = `<ul class="list">${tripRows(list)}</ul>`;
};

function screenBuddies() {
  const sort = store.get(LS.budsort, 'most');
  return topbar('Paddling buddies', 'home') + `<div class="wrap">
    <input class="search" id="bq" placeholder="Search names" oninput="filterBuddies()">
    <div class="seg"><button class="${sort === 'most' ? 'on' : ''}" onclick="setBudSort('most')">Most trips</button><button class="${sort === 'az' ? 'on' : ''}" onclick="setBudSort('az')">A–Z</button></div>
    <ul class="list" id="budList">${budRows(sortBuddies(buddyCounts(entries())))}</ul></div>`;
}
const sortBuddies = b => store.get(LS.budsort, 'most') === 'az' ? b.slice().sort((x, y) => x[0].localeCompare(y[0])) : b;
window.setBudSort = k => { store.set(LS.budsort, k); const q = $('#bq') && $('#bq').value; render(); if (q) { $('#bq').value = q; filterBuddies(); } };
const budRows = b => b.map(([n, c]) => `<li><a class="row" href="#buddy/${enc(n)}"><div class="grow"><div class="t">${esc(n)}</div></div>
  <span class="badge">${c} ${c === 1 ? 'trip' : 'trips'}</span>${ICON.chev}</a></li>`).join('');
window.filterBuddies = function () {
  const q = $('#bq').value.toLowerCase();
  $('#budList').innerHTML = budRows(sortBuddies(buddyCounts(entries())).filter(([n]) => n.toLowerCase().includes(q)));
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
    return Object.assign({}, p, { count: u.count, last: u.last });
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
  const cmp = (a, b) => (num(eff[a]) - num(eff[b])) || (num(sc[a]) - num(sc[b])) || ps[a].name.localeCompare(ps[b].name);
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
  const pos = p.position && p.position !== 'From log' ? `<span class="badge warn">${esc(p.position)}</span>` : '';
  const d = dirLink(p);
  return `<div class="card place">
    <h3>${esc(p.name)} ${pos}</h3>
    <div class="codes">${p.grid ? `<span>${esc(p.grid)}</span>` : ''}${p.w3w ? `<span><a href="${w3wLink(p.w3w)}" target="_blank" rel="noopener">${esc(p.w3w)}</a></span>` : ''}${p.count ? `<span>Used ${p.count}×</span>` : ''}${p.gauge ? `<span>Gauge: ${esc(p.gauge)}</span>` : ''}</div>
    ${p.notes ? `<div class="notes muted">${esc(p.notes)}</div>` : ''}
    <div class="btnrow">
      ${d ? `<a class="btn small" href="${d}" target="_blank" rel="noopener">${ICON.nav} Directions</a>` : ''}
      <button class="btn small share" onclick="sharePlace(${esc(JSON.stringify(p.name))})">${ICON.share} Share</button>
      ${noEdit ? '' : `<a class="btn small ghost" href="#place/${enc(p.name)}">${ICON.edit} ${p.latN == null ? 'Add position' : 'Edit'}</a>`}
    </div></div>`;
}

// One line per place; tap to open the details
function placeRow(p, i) {
  const d = dirLink(p);
  const pos = p.position && p.position !== 'From log' ? `<span class="badge warn">${esc(p.position)}</span>` : '';
  return `<details class="prow"><summary><span class="seq">${i + 1}</span><span class="nm">${esc(p.name)}</span>${ICON.chev}</summary>
    <div class="body">${pos}
      <div class="codes">${p.grid ? `<span>${esc(p.grid)}</span>` : ''}${p.w3w ? `<span><a href="${w3wLink(p.w3w)}" target="_blank" rel="noopener">${esc(p.w3w)}</a></span>` : ''}${p.count ? `<span>Used ${p.count}×</span>` : ''}${p.gauge ? `<span>Gauge: ${esc(p.gauge)}</span>` : ''}</div>
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
  // just the name and a map link
  const link = p.latN != null ? 'https://www.google.com/maps/search/?api=1&query=' + p.latN + ',' + p.lonN
    : p.w3w ? w3wLink(p.w3w) : '';
  const text = [p.name, link].filter(Boolean).join('\n');
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
    <div class="legend"><span><i style="background:#6DB33F"></i>Access point</span><span><i class="ph"></i>Photo</span></div>
    <h2>Access points</h2>
    ${ps.length ? `<div class="updown">Top of the river first, worked out from your trips. Tap a place for details.</div>
      <div class="places">${ps.map(placeRow).join('')}</div>` : '<div class="empty">No access points saved yet</div>'}
    ${Object.keys(gauges).length ? `<h2>Gauges</h2><div class="card">${Object.keys(gauges).map(g =>
      `<div class="row" style="box-shadow:none;margin:0;padding:8px 0;cursor:default"><div class="grow"><div class="t">${esc(g)}</div>
        <div class="s">${gauges[g]} ${gauges[g] === 1 ? 'reading' : 'readings'}${(S.data.gauges || {})[g] ? '' : ' · link searches the web'}</div></div>
        <a class="btn small orange" href="${gaugeLink(g)}" target="_blank" rel="noopener">${ICON.wave} Live level</a></div>`).join('')}</div>` : ''}
    <h2>Levels &amp; visits</h2>
    <ul class="list">${list.map(e => {
      const lv = [e.level !== '' && e.level != null ? e.level + ' m' : '', e.flow ? e.flow + ' cumecs' : ''].filter(Boolean).join(' · ');
      return `<li><a class="row" href="#trip/${e.row || 'p:' + e.pendingUid}">
        ${dateBox(e._d)}
        <div class="grow"><div class="t">${esc(e.section || e.putInPlace || e.river)}${lv ? ` <span class="badge">${esc(lv)}</span>` : ''}</div>
        <div class="s">${esc([e.gauge, e.levelComments].filter(Boolean).join(' – ') || 'No level noted')}</div></div>${ICON.chev}</a></li>`;
    }).join('')}</ul></div>`;
}
function afterRiver(name) {
  const el = $('#riverMap'); if (!el) return;
  const list = entries().filter(e => (e.river || '').trim() === name);
  const pts = riverPlaces(name, list).map((p, i) => Object.assign(p, { n: i + 1 })).filter(p => p.latN != null).map(p => ({
    lat: p.latN, lon: p.lonN, n: p.n,
    popup: `<b>${esc(p.name)}</b>${dirLink(p) ? `<br><a href="${dirLink(p)}" target="_blank" rel="noopener">Directions</a>` : ''}`
  }));
  const map = makeMap(el, pts, { big: true, maxZoom: 15, zoom: 14 });
  if (map) addPhotoDots(map, livePhotos().filter(p => (p.river || '').trim() === name));
}

/* ---------- photos ---------- */

const MAX_PHOTOS = 5;
const photoUrl = (id, w) => 'https://lh3.googleusercontent.com/d/' + id + '=w' + w;
// Photos in the sheet, less any waiting on the phone to be deleted
const livePhotos = () => {
  const gone = new Set(S.queue.filter(q => q.kind === 'delphoto').map(q => q.id));
  return ((S.data && S.data.photos) || []).filter(p => !gone.has(p.id));
};
const tripLabel = t => [t.river, t.section, fmtDate(parseDate(t.date))].filter(Boolean).join(' · ');

// Photos for a trip: those in the sheet plus any waiting on the phone
function tripPhotos(e) {
  const saved = livePhotos().filter(p => p.date === e.date && p.river === e.river)
    .map(p => Object.assign({}, p, { thumb: photoUrl(p.id, 400), full: photoUrl(p.id, 1600) }));
  const waiting = S.queue.filter(q => q.kind === 'photo' && q.trip.date === e.date && q.trip.river === e.river)
    .map(q => Object.assign({}, q.trip, { taken: q.photo.taken, lat: q.photo.lat, lon: q.photo.lon,
      thumb: 'data:image/jpeg;base64,' + q.photo.data, full: 'data:image/jpeg;base64,' + q.photo.data, waiting: true }));
  return saved.concat(waiting);
}

function photoSection(e) {
  const ph = tripPhotos(e), n = ph.length, id = e.row || 'p:' + e.pendingUid;
  const add = !e.row ? '<p class="muted">You can add photos once this trip has been sent to your log.</p>'
    : n >= MAX_PHOTOS ? ''
    : `<label class="btn small ghost">${ICON.camera} Add photos<input type="file" accept="image/*" multiple hidden onchange="addPhotos(this,'${id}')"></label>`;
  return `<h2>Photos</h2><div class="card">
    ${n ? `<button class="btn small" onclick="showPhotos('${id}')">Show photos (${n})</button>` : '<span class="muted">No photos yet</span>'}
    <div class="btnrow">${add}</div>
    ${add && e.row ? '<p class="muted droptip">On a computer you can also drag photos from a folder onto this page.</p>' : ''}
    <div class="phgrid" id="phGrid"></div></div>`;
}

window.showPhotos = function (id) {
  const e = findEntry(id); if (!e) return;
  const ph = tripPhotos(e);
  $('#phGrid').innerHTML = ph.map((p, i) => `<button class="phthumb" onclick="openTripPhoto('${id}',${i})">
    <img src="${p.thumb}" alt="" loading="lazy">${p.waiting ? '<span class="badge orange">Waiting</span>' : ''}</button>`).join('');
};
window.openTripPhoto = function (id, i) { const e = findEntry(id); if (e) openViewer(tripPhotos(e), i); };

// Read date and place from the photo, then shrink it for the phone (longest side 1600px)
async function preparePhoto(file) {
  let taken = '', lat = null, lon = null;
  try {
    if (window.exifr) {
      const x = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']).catch(() => null) || {};
      const t = x.DateTimeOriginal || x.CreateDate;
      if (t instanceof Date && !isNaN(t)) taken = isoDate(t) + ' ' + t.toTimeString().slice(0, 5);
      const g = await exifr.gps(file).catch(() => null);
      if (g && isFinite(g.latitude) && isFinite(g.longitude)) { lat = +g.latitude.toFixed(6); lon = +g.longitude.toFixed(6); }
    }
  } catch (err) {}
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL('image/jpeg', 0.82).split(',')[1];
    return { data, name: file.name || 'photo.jpg', taken, lat, lon };
  } finally { URL.revokeObjectURL(url); }
}

window.addPhotos = function (input, id) {
  const files = Array.from(input.files || []); input.value = '';
  addPhotoFiles(files, id);
};
async function addPhotoFiles(files, id) {
  files = files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name || ''));
  const e = findEntry(id);
  if (!e || !e.row) { toast('Open a saved trip first, then add photos'); return; }
  if (!files.length) { toast('No photos found in what was dropped'); return; }
  const room = MAX_PHOTOS - tripPhotos(e).length;
  if (room <= 0) { toast('This trip already has ' + MAX_PHOTOS + ' photos'); return; }
  if (files.length > room) toast('Only ' + room + ' more will fit – adding the first ' + room);
  toast('Preparing photos…');
  const trip = { date: e.date, river: e.river, section: e.section || '' };
  for (const f of files.slice(0, room)) {
    try {
      const photo = await preparePhoto(f);
      S.queue.push({ kind: 'photo', uid: uid(), trip, photo });
    } catch (err) { toast("Couldn't read one of the photos"); }
  }
  if (!store.set(LS.queue, S.queue)) toast('Phone storage full – keep the app open until the photos have sent');
  updateDot(); render(); showPhotos(id);
  if (navigator.onLine) flush(); else toast('Photos saved on phone – will send when you have signal');
}

// On a computer: drag photos from a folder onto an open trip page
(function () {
  const tripId = () => { const m = location.hash.match(/^#trip\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; };
  const hasFiles = ev => ev.dataTransfer && Array.from(ev.dataTransfer.types || []).includes('Files');
  let depth = 0;
  window.addEventListener('dragenter', ev => { if (!hasFiles(ev) || !tripId()) return; depth++; document.body.classList.add('dropping'); });
  window.addEventListener('dragleave', ev => { if (!hasFiles(ev)) return; depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove('dropping'); });
  window.addEventListener('dragover', ev => { if (hasFiles(ev)) { ev.preventDefault(); ev.dataTransfer.dropEffect = tripId() ? 'copy' : 'none'; } });
  window.addEventListener('drop', ev => {
    if (!hasFiles(ev)) return;
    ev.preventDefault(); depth = 0; document.body.classList.remove('dropping');
    const id = tripId();
    if (!id) { toast('Open a trip first, then drop its photos on it'); return; }
    addPhotoFiles(Array.from(ev.dataTransfer.files || []), id);
  });
})();

// Full-screen photo viewer: swipe or tap the arrows; turning the phone sideways is allowed here
let VIEW = null;
function openViewer(list, i) {
  if (!list.length) return;
  VIEW = { list, i: Math.max(0, Math.min(i, list.length - 1)), hash: location.hash };
  let v = $('#viewer');
  if (!v) {
    v = document.createElement('div'); v.id = 'viewer';
    v.innerHTML = `<img alt=""><button class="vclose" onclick="closeViewer()" aria-label="Close">✕</button>
      <button class="vprev" onclick="stepViewer(-1)" aria-label="Previous">‹</button><button class="vnext" onclick="stepViewer(1)" aria-label="Next">›</button>
      <div class="vcap"></div>
      <button class="vbin" onclick="askDelPhoto()" aria-label="Delete photo">${ICON.bin}</button>
      <div class="vask" hidden><div><b>Delete this photo?</b><br>It goes to the bin in your Google Drive.</div>
        <div class="btnrow"><button class="btn small danger" onclick="delPhoto()">Delete</button><button class="btn small ghost" onclick="keepPhoto()">Keep</button></div></div>`;
    let x0 = null;
    v.addEventListener('touchstart', ev => { x0 = ev.touches[0].clientX; }, { passive: true });
    v.addEventListener('touchend', ev => { if (x0 == null) return; const dx = ev.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) stepViewer(dx < 0 ? 1 : -1); });
    document.body.appendChild(v);
  }
  document.body.classList.add('viewing'); checkTurn(); drawViewer();
}
function drawViewer() {
  const v = $('#viewer'), p = VIEW.list[VIEW.i];
  v.querySelector('img').src = p.full;
  v.querySelector('.vcap').innerHTML = `<b>${esc(tripLabel(p))}</b>${VIEW.list.length > 1 ? `<span>${VIEW.i + 1} of ${VIEW.list.length}</span>` : ''}`;
  v.querySelector('.vbin').hidden = !p.id; v.querySelector('.vask').hidden = true;
  v.querySelector('.vprev').hidden = VIEW.i === 0; v.querySelector('.vnext').hidden = VIEW.i >= VIEW.list.length - 1;
}
window.stepViewer = d => { if (!VIEW) return; const j = VIEW.i + d; if (j < 0 || j >= VIEW.list.length) return; VIEW.i = j; drawViewer(); };
window.askDelPhoto = () => { $('#viewer .vask').hidden = false; };
window.keepPhoto = () => { $('#viewer .vask').hidden = true; };
window.delPhoto = function () {
  const p = VIEW && VIEW.list[VIEW.i]; if (!p || !p.id) return;
  enqueue({ kind: 'delphoto', id: p.id });
  toast('Photo deleted');
  VIEW.list.splice(VIEW.i, 1);
  if (!VIEW.list.length) { closeViewer(); render(); return; }
  VIEW.i = Math.min(VIEW.i, VIEW.list.length - 1); drawViewer();
  const m = location.hash.match(/^#trip\/(.+)$/); if (m) { render(); showPhotos(decodeURIComponent(m[1])); }
};
window.closeViewer = () => { const v = $('#viewer'); if (v) v.remove(); VIEW = null; document.body.classList.remove('viewing'); checkTurn(); };

// Photo markers: a blue camera dot, shown on the three most zoomed-in map levels.
// Built as an HTML marker with a generous invisible tap area so it is easy to hit on a phone.
const photoIcon = () => L.divIcon({ className: 'wl-photo', html: '<span><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span>', iconSize: [40, 40], iconAnchor: [20, 20] });
function addPhotoDots(map, list) {
  const pts = list.filter(p => p.lat != null && p.lon != null && isFinite(p.lat) && isFinite(p.lon));
  if (!pts.length) return;
  const group = L.layerGroup();
  pts.forEach(p => {
    const m = L.marker([p.lat, p.lon], { icon: photoIcon(), zIndexOffset: 1000, keyboard: false, title: tripLabel(p) });
    m.on('click', ev => {
      if (ev && ev.originalEvent) L.DomEvent.stop(ev.originalEvent);
      const same = pts.filter(q => q.date === p.date && q.river === p.river)
        .map(q => Object.assign({}, q, { full: photoUrl(q.id, 1600) }));
      openViewer(same, Math.max(0, same.findIndex(q => q.id === p.id)));
    });
    group.addLayer(m);
  });
  const show = () => { const on = map.getZoom() >= map.getMaxZoom() - 2; if (on && !map.hasLayer(group)) group.addTo(map); if (!on && map.hasLayer(group)) map.removeLayer(group); };
  map.on('zoomend', show); show();
}

/* ---------- delete a trip ---------- */
window.askDelete = () => { $('#delAsk').hidden = false; $('#delBtn').hidden = true; };
window.cancelDelete = () => { $('#delAsk').hidden = true; $('#delBtn').hidden = false; };
window.doDelete = function () {
  const id = String(FORM.id);
  if (id.startsWith('p:')) {
    // never sent: just drop it from the phone
    S.queue = S.queue.filter(q => q.uid !== id.slice(2)); saveQueue();
    toast('Trip deleted'); go('trips'); return;
  }
  const base = (S.data.entries || []).find(x => String(x.row) === id);
  if (!base) { toast('Not found – try refreshing'); return; }
  S.queue = S.queue.filter(q => !(q.kind === 'update' && String(q.row) === id));
  enqueue({ kind: 'delete', row: base.row, expect: { date: base.date, river: base.river } });
  toast('Trip deleted'); go('trips');
};

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
        ${e.gauge ? `<dt>Gauge</dt><dd>${esc(e.gauge)}${lv ? ' – ' + esc(lv) : ''}${e.levelAuto && lv ? ` <span class="badge grey">auto</span><br><small class="muted">${esc(e.levelAuto)}</small>` : ''}${!lv && e.start && autoGauge(e.gauge) ? '<br><small class="muted">Level will be filled in from the gauge</small>' : ''}</dd>` : ''}
        ${e.levelComments ? `<dt>Level</dt><dd>${esc(e.levelComments)}</dd>` : ''}
      </dl></div>
    ${splitNames(e.paddlers).length ? `<h2>Paddlers</h2><div class="chips">${splitNames(e.paddlers).map(n => `<a class="chip" href="#buddy/${enc(n)}" style="text-decoration:none;color:inherit">${esc(n)}</a>`).join('')}</div>` : ''}
    <h2>Notes</h2><div class="card notes">${e.notes ? esc(e.notes) : '<span class="muted">No notes yet</span>'}</div>
    ${photoSection(e)}
    ${editable ? `<div class="btnrow"><a class="btn block orange" href="#edit/${e.row || 'p:' + e.pendingUid}">${ICON.edit} ${e.notes ? 'Edit' : 'Finish this entry'}</a></div>` : ''}
  </div>`;
}

function screenFinish() {
  const list = toFinish(entries());
  const recent = list.filter(e => e._d && (Date.now() - e._d) < 400 * 864e5), older = list.filter(e => !recent.includes(e));
  const toReview = candidates().filter(c => c.status === 'To review' || c.status === 'Not sure').length;
  return topbar('To finish', '') + `<div class="wrap">${syncBanner()}
    ${toReview ? `<a class="card row" href="#review" style="text-decoration:none;color:inherit">
      <div class="grow"><div class="t">Old trips to check</div><div class="s">Found in your calendar and photos</div></div>
      <span class="badge orange">${toReview}</span>${ICON.chev}</a>` : ''}
    <p class="muted">Paddles that still need notes. Tap one to finish it.</p>
    <ul class="list">${tripRows(recent)}</ul>
    ${older.length ? `<details class="more"><summary>Older entries without notes (${older.length})</summary><ul class="list">${tripRows(older)}</ul></details>` : ''}
    ${!list.length ? '<div class="empty">All done</div>' : ''}</div>`;
}

/* ---------- old trips to check (Candidates tab) ---------- */

function candidates() {
  // Candidates from the sheet, with any choices made on the phone but not yet sent
  const base = (S.data && S.data.candidates) || [];
  const mine = {};
  S.queue.filter(q => q.kind === 'candidate').forEach(q => { mine[q.id] = q.status; });
  return base.map(c => Object.assign({}, c, mine[c.id] ? { status: mine[c.id] } : {}, { _d: parseDate(c.date) }));
}
const findCand = id => candidates().find(c => c.id === id);
let REVIEW = { show: 'To review', kind: 'All' };

function screenReview() {
  const all = candidates();
  const count = s => all.filter(c => c.status === s).length;
  const seg = (k, vals) => `<div class="seg">${vals.map(([v, l]) => `<button class="${REVIEW[k] === v ? 'on' : ''}" onclick="reviewFilter('${k}','${v}')">${l}</button>`).join('')}</div>`;
  return topbar('Old trips to check', 'finish') + `<div class="wrap">${syncBanner()}
    <p class="muted">Days your calendar or photos suggest you paddled but aren't in the log. Calendar entries marked tbc were often placeholders.</p>
    ${seg('show', [['To review', 'To check (' + count('To review') + ')'], ['Not sure', 'Not sure (' + count('Not sure') + ')'], ['Done', 'Done']])}
    ${seg('kind', [['All', 'All'], ['Trip', 'Trips'], ['Session', 'Club sessions']])}
    <ul class="list" id="candList">${candRows()}</ul></div>`;
}
function candRows() {
  const list = candidates().filter(c =>
    (REVIEW.show === 'Done' ? (c.status === 'Added' || c.status === "Didn't paddle") : c.status === REVIEW.show) &&
    (REVIEW.kind === 'All' || c.kind === REVIEW.kind));
  if (REVIEW.show === 'Done') list.reverse();
  return list.map(c => `<li><a class="row" href="#cand/${enc(c.id)}">
      ${dateBox(c._d)}
      <div class="grow"><div class="t">${esc(c.cal || String(c.folder).replace(/ \(.*$/, '') || 'Photos')}</div>
      <div class="s">${esc([c.river, c.folder && c.cal ? 'photos' : '', /tbc/i.test(c.evidence) ? 'tbc' : ''].filter(Boolean).join(' · ') || c.evidence)}</div></div>
      ${c.status === 'Added' ? '<span class="badge">Added</span>' : c.status === "Didn't paddle" ? '<span class="badge grey">No</span>' : ''}${ICON.chev}</a></li>`).join('')
    || '<div class="empty">Nothing here</div>';
}
window.reviewFilter = function (k, v) { REVIEW[k] = v; render(); };

function screenCand(id) {
  const c = findCand(id);
  if (!c) return topbar('Old trip', 'review') + '<div class="wrap empty">Not found – try refreshing.</div>';
  const row = (l, v) => v ? `<dt>${l}</dt><dd>${esc(v)}</dd>` : '';
  return topbar(fmtDate(c._d), 'review') + `<div class="wrap">
    <div class="card"><h3>${esc(c.cal || String(c.folder).replace(/ \(.*$/, '') || 'Photos')}</h3>
      <div class="meta"><span class="badge grey">${esc(c.kind)}</span><span class="badge ${/tbc/i.test(c.evidence) ? 'warn' : ''}">${esc(c.evidence)}</span>
        ${c.status !== 'To review' ? `<span class="badge orange">${esc(c.status)}</span>` : ''}</div>
      <dl class="kv" style="margin-top:12px">
        ${row('Calendar', c.cal)}${row('River (guess)', c.river)}${row('Photos', c.folder)}${row('Photo tags', c.tags)}
        ${c.gps ? `<dt>Photo spot</dt><dd><a href="https://www.google.com/maps?q=${enc(c.gps.replace(/\s/g, ''))}" target="_blank" rel="noopener">${esc(c.gps)}</a></dd>` : ''}
        ${row('Logged nearby', c.near)}${row('Notes', c.notes)}
      </dl></div>
    <div class="btnrow"><a class="btn block" href="#addc/${enc(c.id)}">${ICON.edit} I paddled – add to log</a></div>
    <div class="btnrow"><button class="btn ghost" style="flex:1" onclick="setCand('${esc(c.id)}',&quot;Didn't paddle&quot;)">Didn't paddle</button>
      <button class="btn ghost" style="flex:1" onclick="setCand('${esc(c.id)}','Not sure')">Not sure</button>
      ${c.status !== 'To review' ? `<button class="btn ghost" style="flex:1" onclick="setCand('${esc(c.id)}','To review')">Undo</button>` : ''}</div>
  </div>`;
}
function queueCand(id, status) {
  S.queue = S.queue.filter(q => !(q.kind === 'candidate' && q.id === id));
  enqueue({ kind: 'candidate', id, status });
}
window.setCand = function (id, status) {
  // move on to the next one still to check
  const list = candidates().filter(c => c.status === REVIEW.show && (REVIEW.kind === 'All' || c.kind === REVIEW.kind));
  const i = list.findIndex(c => c.id === id);
  queueCand(id, status);
  const next = list[i + 1];
  if (status !== 'To review' && next) go('cand/' + enc(next.id)); else go('review');
};

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
    <option value="__new">＋ New access point…</option>
    <optgroup label="All access points">${rest.map(opt).join('')}</optgroup>`;
}

function placeField(which, label, value) {
  return `<label>${label}</label>
    <select id="f_${which}" onchange="placeChanged('${which}')">${placeOptions(FORM.river, value)}
      ${which === 'out' ? `<option value="__same">Same as put in</option>` : ''}</select>
    <div id="np_${which}" class="subform" hidden>
      <label>Name of new access point</label><input id="np_${which}_name" placeholder="e.g. Ferry Lane slip">
      <div class="btnrow"><button type="button" class="btn small" onclick="useGPS('${which}')">${ICON.gps} Use my location</button>
        <button type="button" class="btn small ghost" onclick="pickOnMap('${which}')">${ICON.pin} Pick on map</button></div>
      <div id="np_${which}_map" class="pickmap" hidden></div>
      <div class="grid2"><div><label>OS grid ref</label><input id="np_${which}_grid" placeholder="SX 7506 6594" onchange="gridTyped('${which}')"></div>
        <div><label>what3words</label><input id="np_${which}_w3w" placeholder="///word.word.word"></div></div>
      <div class="muted" id="np_${which}_pos"></div>
      <label>Access notes (parking, carry, gates)</label><textarea id="np_${which}_notes" style="min-height:70px"></textarea>
    </div>`;
}

// Date picker as three plain drop-downs – quicker than the iPhone calendar for old trips
function dateSelects(iso) {
  const [y, m, d] = String(iso || isoDate(new Date())).split('-').map(Number);
  const now = new Date().getFullYear();
  const opt = (v, t, sel) => `<option value="${v}"${v === sel ? ' selected' : ''}>${t}</option>`;
  const days = Array.from({ length: 31 }, (_, i) => opt(i + 1, i + 1, d)).join('');
  const months = MONTHS.map((t, i) => opt(i + 1, t, m)).join('');
  const years = Array.from({ length: now - 1999 + 1 }, (_, i) => now + 1 - i).map(yy => opt(yy, yy, y)).join('');
  return `<label>Date</label><div class="dmy">
    <select id="f_dd" onchange="syncDate()" aria-label="Day">${days}</select>
    <select id="f_mm" onchange="syncDate()" aria-label="Month">${months}</select>
    <select id="f_yy" onchange="syncDate()" aria-label="Year">${years}</select></div>
    <input type="hidden" id="f_date" value="${esc(iso || isoDate(new Date()))}">`;
}
window.syncDate = function () {
  const y = +$('#f_yy').value, m = +$('#f_mm').value, last = new Date(y, m, 0).getDate();
  if (+$('#f_dd').value > last) $('#f_dd').value = last; // e.g. 31 June becomes 30 June
  $('#f_date').value = y + '-' + String(m).padStart(2, '0') + '-' + String($('#f_dd').value).padStart(2, '0');
  showNow();
};

// Start / finish time with a Now button when the trip is today
function timeField(k, label, value) {
  return `<label>${label}</label><div class="timerow"><input id="f_${k}" type="time" value="${esc(value || '')}">
    <button type="button" class="btn small ghost nowbtn" onclick="setNow('${k}')" hidden>Now</button></div>`;
}
function showNow() {
  const today = $('#f_date') && $('#f_date').value === isoDate(new Date());
  $$('.nowbtn').forEach(b => { b.hidden = !today; });
}
window.setNow = function (k) { $('#f_' + k).value = roundNow(); saveDraft(); };

// Gauges used on this river (from your trips, its access points and the Gauges tab)
function riverGauges(river) {
  if (!river) return [];
  const c = {};
  const add = (g, w) => { g = String(g || '').trim(); if (g) c[g] = (c[g] || 0) + w; };
  entries().filter(e => e.river === river).forEach(e => add(e.gauge, 1));
  places().filter(p => p.river === river).forEach(p => add(p.gauge, 1));
  Object.entries(gaugeInfo()).forEach(([g, i]) => { if (String(i.river || '').split('/').map(x => x.trim()).includes(river)) add(g, 0.5); });
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 8);
}
function drawGauges() {
  const box = $('#gaugeChips'); if (!box) return;
  const cur = $('#f_gauge').value.trim();
  box.innerHTML = riverGauges(FORM.river).map(g => `<button type="button" class="chip${g === cur ? ' on' : ''}" onclick="pickGauge(${esc(JSON.stringify(g))})">${esc(g)}</button>`).join('');
  const lv = $('#f_level').value.trim() || $('#f_flow').value.trim();
  $('#gaugeHint').textContent = cur && autoGauge(cur) && !lv ? 'Leave level and flow blank – they’ll be filled in from the gauge for your start time.' : '';
}
window.pickGauge = function (g) { $('#f_gauge').value = g; drawGauges(); saveDraft(); };
window.gaugeTyped = drawGauges;

function screenForm(id, candId) {
  const editing = id != null;
  let e = {};
  if (editing) {
    e = findEntry(id);
    if (!e) return topbar('Edit', 'home') + '<div class="wrap empty">Not found – try refreshing.</div>';
  }
  const cand = candId ? findCand(candId) : null;
  const draft = !editing && !cand ? store.get(LS.draft, null) : null;
  const v = Object.assign({ date: isoDate(new Date()), craft: 'Canoe' }, draft || {},
    editing ? Object.assign({}, e, { date: e._d ? isoDate(e._d) : '' }) : {},
    cand ? { date: cand._d ? isoDate(cand._d) : '', river: String(cand.river || '').split(' / ')[0] } : {});
  FORM.id = id; FORM.cand = cand ? cand.id : null; FORM.river = v.river || ''; FORM.np = { in: {}, out: {} };
  FORM.paddlers = splitNames(v.paddlers); FORM.askNames = [];
  const ents = entries();
  const rivers = Array.from(new Set(ents.map(x => x.river).filter(Boolean))).sort();
  const crafts = Array.from(new Set(['Canoe', 'Kayak', 'Sea kayak', 'SUP'].concat(ents.map(x => x.craft).filter(Boolean))));
  const gauges = Array.from(new Set(Object.keys((S.data && S.data.gauges) || {}).concat(ents.map(x => x.gauge).filter(Boolean)))).sort();
  const full = editing;
  const f = (k, l, ph, type) => `<label>${l}</label><input id="f_${k}" ${type ? `type="${type}"` : ''} value="${esc(v[k] || '')}" placeholder="${esc(ph || '')}">`;
  const ta = (k, l, ph) => `<label>${l}</label><textarea id="f_${k}" placeholder="${esc(ph || '')}">${esc(v[k] || '')}</textarea>`;
  const more = `
      ${f('weather', 'Weather', 'Sunny, light SW breeze')}
      ${f('tide', 'Tide', 'HW 14:41 Richmond')}
      ${ta('levelComments', 'Level comments', 'Good level, few scrapes')}
      ${ta('notes', 'Notes', 'How it went, lines, swims, lessons…')}
      ${ta('putInNotes', 'Put-in notes for this trip', '')}
      ${ta('takeOutNotes', 'Take-out notes for this trip', '')}`;
  return topbar(editing ? 'Edit paddle' : 'Log a paddle', editing ? 'trip/' + id : (cand ? 'cand/' + cand.id : 'home')) + `<div class="wrap form" id="paddleForm">
    ${!editing && draft ? '<div class="banner"><div class="grow">Carrying on from an unsaved draft.</div><button class="btn small ghost" onclick="clearDraft()">Start fresh</button></div>' : ''}
    ${cand ? `<div class="banner green"><div class="grow">From ${esc(cand.cal || cand.folder || 'your photos')}. Check the date and river.</div></div>` : ''}
    ${dateSelects(v.date)}
    <label>Craft</label><input id="f_craft" list="dl_crafts" value="${esc(v.craft || '')}">
    <label>River / water</label><input id="f_river" list="dl_rivers" value="${esc(v.river || '')}" onchange="riverChanged()" autocomplete="off">
    <label>Section</label><input id="f_section" list="dl_sections" value="${esc(v.section || '')}" autocomplete="off">
    ${placeField('in', 'Put in', v.putInPlace)}
    ${timeField('start', 'Start time', v.start)}
    ${placeField('out', 'Take out', v.takeOutPlace)}
    ${timeField('finish', 'Finish time', v.finish)}
    <label>Gauge</label><input id="f_gauge" list="dl_gauges" value="${esc(v.gauge || '')}" oninput="gaugeTyped()" autocomplete="off" placeholder="Tap one below or type">
    <div class="chips" id="gaugeChips"></div>
    <div class="grid2"><div>${f('level', 'Level (m)', '', 'text')}</div><div>${f('flow', 'Flow (cumecs)', '', 'text')}</div></div>
    <div class="muted small" id="gaugeHint"></div>
    <label>Paddlers</label>
    <div class="chips" id="padChips"></div>
    <input id="f_padIn" list="dl_buddies" placeholder="Add a name, then tap Add" onkeydown="if(event.key==='Enter'||event.key===','){event.preventDefault();addPaddler()}">
    <div class="btnrow"><button type="button" class="btn small ghost" onclick="addPaddler()">Add</button></div>
    <div class="padask" id="padAsk" hidden></div>
    <div class="chips" id="padSuggest"></div>
    ${full ? more : `<details class="more"><summary>More details (or finish later)</summary>${more}</details>`}
    <div class="btnrow" style="margin-top:22px"><button class="btn block" onclick="submitForm()">${editing ? 'Save changes' : 'Save paddle'}</button></div>
    ${editing ? `<div class="delzone"><button class="btn ghost danger" id="delBtn" onclick="askDelete()">${ICON.bin} Delete this trip</button>
      <div id="delAsk" class="banner warn" hidden><div class="grow"><b>Delete this trip?</b><br>It will be moved to the Deleted tab in your sheet.</div>
        <button class="btn small danger" onclick="doDelete()">Delete</button><button class="btn small ghost" onclick="cancelDelete()">Keep</button></div></div>` : ''}
    <datalist id="dl_rivers">${rivers.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <datalist id="dl_crafts">${crafts.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <datalist id="dl_gauges">${gauges.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <datalist id="dl_sections"></datalist>
    <datalist id="dl_buddies">${buddyCounts(ents).slice(0, 30).map(([n]) => n).sort((a, b) => a.localeCompare(b)).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
  </div>`;
}
function afterForm() {
  sectionsList(); drawPaddlers(); drawGauges(); showNow();
  ['level', 'flow'].forEach(k => { const el = $('#f_' + k); el && el.addEventListener('input', drawGauges); });
  if (!FORM.id && !FORM.cand) { const fm = $('#paddleForm'); fm && fm.addEventListener('input', saveDraft); fm && fm.addEventListener('change', saveDraft); }
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
  sectionsList(); drawPaddlers(); drawGauges();
};
window.placeChanged = function (w) {
  const v = $('#f_' + w).value;
  const box = $('#np_' + w); box.hidden = v !== '__new';
  // the access point's usual gauge, if none chosen yet
  const p = placeByName()[v], g = $('#f_gauge');
  if (p && p.gauge && g && !g.value.trim()) { g.value = p.gauge; drawGauges(); saveDraft(); }
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
  if (n) { if (!FORM.paddlers.includes(n)) FORM.paddlers.push(n); drawPaddlers(); return; } // tapped a known name
  const typed = splitNames(inp.value); inp.value = '';
  FORM.askNames = (FORM.askNames || []).concat(typed);
  nextNameCheck();
};
// Names already in the log that might be the same person as a typed name
function similarNames(x) {
  const known = buddyCounts(entries()), lx = x.toLowerCase(), first = lx.split(/\s+/)[0];
  const lev = (a, b) => { const d = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } } return d[b.length]; };
  return known.map(([n, c]) => [n, c, n.toLowerCase()]).filter(([n, c, ln]) => ln !== lx && (
    ln.split(/\s+/)[0] === first ||                                  // same first name: Mark / Mark Stanford
    (first.length >= 2 && ln.startsWith(first)) ||                     // short form: Al / Alistair
    (lx.length >= 5 && lev(ln, lx) <= (lx.length >= 8 ? 2 : 1))         // spelling slip: Kryzstof / Kryzsztof
  )).sort((a, b) => b[1] - a[1]).slice(0, 6).map(r => r[0]);
}
function nextNameCheck() {
  const box = $('#padAsk');
  while (FORM.askNames && FORM.askNames.length) {
    let x = FORM.askNames[0];
    const exact = buddyCounts(entries()).find(([n]) => n.toLowerCase() === x.toLowerCase());
    if (exact) x = exact[0];
    const sim = similarNames(x).filter(n => !FORM.paddlers.includes(n));
    const singleWord = !/\s/.test(x);
    // ask if it's a new name that looks like someone already logged, or a first name only when fuller names exist
    if (sim.length && (!exact || singleWord)) {
      box.hidden = false;
      box.innerHTML = `<div class="muted">${exact ? `Which ${esc(x)}?` : `“${esc(x)}” isn't in your log yet. Did you mean:`}</div>
        <div class="chips">${sim.map(n => `<button type="button" class="chip" onclick="pickName(${esc(JSON.stringify(n))})">${esc(n)}</button>`).join('')}
        <button type="button" class="chip keep" onclick="pickName(${esc(JSON.stringify(x))})">${exact ? 'Just' : 'Keep'} “${esc(x)}”</button></div>`;
      return;
    }
    FORM.askNames.shift();
    if (!FORM.paddlers.includes(x)) FORM.paddlers.push(x);
  }
  if (box) { box.hidden = true; box.innerHTML = ''; }
  drawPaddlers();
}
window.pickName = function (n) {
  FORM.askNames.shift();
  if (!FORM.paddlers.includes(n)) FORM.paddlers.push(n);
  drawPaddlers(); nextNameCheck();
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
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  if (FORM['map_' + w]) { FORM['map_' + w].invalidateSize(); return; }
  const near = places().filter(p => p.river === FORM.river && p.latN != null);
  const map = makeMap(el, near.map(p => ({ lat: p.latN, lon: p.lonN, popup: esc(p.name) })), { maxZoom: 14 });
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
  const newPlace = w => {
    const name = $('#np_' + w + '_name').value.trim();
    if (!name) return null;
    const pos = FORM.np[w] || {};
    return { name, river: p.river, gauge: p.gauge, lat: pos.lat != null ? pos.lat : '', lon: pos.lon != null ? pos.lon : '',
      grid: $('#np_' + w + '_grid').value.trim(), w3w: $('#np_' + w + '_w3w').value.trim(), notes: $('#np_' + w + '_notes').value.trim() };
  };
  const pin = val('in'), pout = val('out');
  if (pin === '__new') { const np = newPlace('in'); if (np) { p.newPlaces.push(np); p.putInPlace = np.name; } }
  else p.putInPlace = pin;
  if (pout === '__same') { p.takeOutPlace = p.putInPlace; }
  else if (pout === '__new') {
    const np = newPlace('out');
    if (np) { if (!(p.newPlaces[0] && p.newPlaces[0].name === np.name)) p.newPlaces.push(np); p.takeOutPlace = np.name; }
  } else p.takeOutPlace = pout;
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
  if ($('#f_in').value === '__new' && !p.putInPlace) { toast('Give the new access point a name'); return; }
  if ($('#f_out').value === '__new' && !p.takeOutPlace) { toast('Give the new access point a name'); return; }
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
    if (FORM.cand) queueCand(FORM.cand, 'Added'); else store.del(LS.draft);
    go('trip/p:' + item.uid);
  }
};

/* ---------- place edit ---------- */

function screenPlace(name) {
  const p = placeByName()[name];
  if (!p) return topbar('Access point', 'home') + '<div class="wrap empty">Access point not found – it may have been renamed. Go back and try again.</div>';
  const usedOn = entries().filter(e => e.putInPlace === name || e.takeOutPlace === name);
  FORM.place = { name, lat: p.latN, lon: p.lonN };
  const gs = Array.from(new Set(riverGauges(p.river).concat(Object.keys(gaugeInfo())))).sort();
  return topbar(name, 'home') + `<div class="wrap form">
    ${placeCard(Object.assign({}, p, { count: usedOn.length }), true)}
    <label>Name</label><input id="pl_name" value="${esc(p.name)}" autocomplete="off">
    <div class="muted small">Renaming also updates every trip that uses this access point.</div>
    <label>Gauge for this access point</label><input id="pl_gauge" list="dl_plgauges" value="${esc(p.gauge || '')}" autocomplete="off">
    <datalist id="dl_plgauges">${gs.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
    <h2>Position</h2>
    <div class="btnrow"><button class="btn small" onclick="placeGPS()">${ICON.gps} Use my location</button>
      <span class="muted" style="align-self:center">or tap the map</span></div>
    <div class="mapbox tall" id="placeMap"></div>
    <div class="grid2"><div><label>OS grid ref</label><input id="pl_grid" value="${esc(p.grid || '')}" onchange="placeGrid()"></div>
      <div><label>what3words</label><input id="pl_w3w" value="${esc(p.w3w || '')}"></div></div>
    <div class="muted" id="pl_pos">${p.latN != null ? p.latN.toFixed(5) + ', ' + p.lonN.toFixed(5) : 'No position yet'}</div>
    <label>Access notes</label><textarea id="pl_notes">${esc(p.notes || '')}</textarea>
    <div class="btnrow" style="margin-top:18px"><button class="btn block" onclick="savePlace()">Save access point</button></div>
    ${usedOn.length ? `<h2>Trips from here</h2><ul class="list">${tripRows(usedOn)}</ul>` : ''}
  </div>`;
}
function afterPlace(name) {
  const p = placeByName()[name]; const el = $('#placeMap'); if (!el || !p) return;
  const map = makeMap(el, p.latN != null ? [] : places().filter(x => x.river === p.river && x.latN != null).map(x => ({ lat: x.latN, lon: x.lonN, popup: esc(x.name) })), { big: true, zoom: 15, maxZoom: 13 });
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
  const fields = { grid: $('#pl_grid').value.trim(), w3w: $('#pl_w3w').value.trim(), notes: $('#pl_notes').value.trim(), gauge: $('#pl_gauge').value.trim() };
  if (FORM.place.moved) { fields.lat = FORM.place.lat; fields.lon = FORM.place.lon; }
  const newName = $('#pl_name').value.trim();
  if (!newName) { toast('The access point needs a name'); return; }
  if (newName !== FORM.place.name) {
    if (places().some(x => x.name.toLowerCase() === newName.toLowerCase() && x.name !== FORM.place.name)) { toast('There is already an access point called ' + newName); return; }
    fields.name = newName;
  }
  enqueue({ kind: 'place', name: FORM.place.name, fields });
  toast('Access point saved');
  history.back();
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
    place: [screenPlace, afterPlace], setup: [screenSetup], map: [screenMap, afterMap],
    review: [screenReview], cand: [screenCand], addc: [a => screenForm(null, a), afterForm]
  };
  if (VIEW && VIEW.hash !== location.hash) closeViewer();
  if (S.statusRoute !== location.hash) { S.status = ''; S.statusRoute = location.hash; }
  const [scr, after] = screens[route] || screens.home;
  app.innerHTML = scr(route === 'add' ? undefined : arg);
  if (after) after(arg);
  const tab = { home: 'home', trips: 'home', buddies: 'home', buddy: 'home', rivers: 'rivers', river: 'rivers', place: 'rivers', add: 'add', edit: 'finish', finish: 'finish', trip: 'home', map: 'map', review: 'finish', cand: 'finish', addc: 'finish' }[route] || 'home';
  document.body.classList.toggle('homepage', route === 'home' || !screens[route]);
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  updateDot();
  if (route !== 'add' && route !== 'edit' && route !== 'addc') window.scrollTo(0, 0);
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
    navigator.serviceWorker.register(ROOT + 'sw.js', { scope: ROOT || './', updateViaCache: 'none' }).then(reg => {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
    // a new version has taken over: reload, but never in the middle of a form
    let fresh = false;
    const reloadSoon = () => { if (/^#(addc?|edit|place)\b/.test(location.hash)) { fresh = true; } else location.reload(); };
    if (navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener('controllerchange', reloadSoon);
    window.addEventListener('hashchange', () => { if (fresh && !/^#(addc?|edit|place)\b/.test(location.hash)) location.reload(); });
  }
})();
