/* Water Log – Hugh's paddling log app.
 * Data lives in the "Canoe Log Book" Google Sheet; a small Apps Script web app is the go-between.
 * Everything is cached on the phone so the app opens and logs paddles with no signal.
 *
 * The code is split by feature so each part can carry over to Paddle Book:
 *   core.js     shared helpers, phone storage, small UI bits
 *   sync.js     talking to the sheet (the only part that knows about Google), offline queue, setup
 *   maps.js     map tiles, pins, the Map page
 *   places.js   access points
 *   levels.js   gauges, river levels and tides
 *   photos.js   trip photos
 *   logbook.js  home, trips, rivers, buddies, trip page, the log form
 *   app.js      screen router and start-up
 * core.js: */
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
  grow: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>',
  shrink: '<svg viewBox="0 0 24 24"><path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7"/></svg>',
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

// A trip can be on more than one water: the main river/water plus any "also on" (stored joined by " / ")
const alsoList = e => String(e.alsoOn || '').split('/').map(x => x.trim()).filter(Boolean);
const watersOf = e => [String(e.river || '').trim()].concat(alsoList(e)).filter(Boolean);
const onWater = (e, name) => watersOf(e).includes(name);

function stats(list) {
  const rivers = new Set(), buddies = new Set(), countries = new Set();
  list.forEach(e => {
    watersOf(e).forEach(w => rivers.add(w));
    splitNames(e.paddlers).forEach(n => buddies.add(n));
    if (e.country) countries.add(e.country);
  });
  return { rivers: rivers.size, trips: list.length, buddies: buddies.size, countries: countries.size };
}

function riverIndex(list) {
  const m = {};
  list.forEach(e => {
    watersOf(e).forEach(r => {
      (m[r] = m[r] || { name: r, entries: [], sections: new Set() }).entries.push(e);
      if (e.section && r === String(e.river || '').trim()) m[r].sections.add(e.section);
    });
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
/* ================= UI bits ================= */

// Phones: keep to portrait. iPhone web apps can't lock rotation, so cover the screen in landscape.
function checkTurn() {
  const t = screen.orientation && screen.orientation.type;
  const land = (t ? t.startsWith('landscape') : Math.abs(window.orientation || 0) === 90) && window.innerWidth > window.innerHeight;
  // the photo viewer and the level/tide graphs may turn sideways
  const free = document.body.classList.contains('viewing') || document.body.classList.contains('charting');
  document.body.classList.toggle('turned', !!land && Math.min(screen.width, screen.height) < 600 && !free);
}
try { screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait').catch(() => {}); } catch (e) {}
window.addEventListener('orientationchange', () => setTimeout(checkTurn, 300));
window.addEventListener('resize', checkTurn);
screen.orientation && screen.orientation.addEventListener && screen.orientation.addEventListener('change', checkTurn);
checkTurn();

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
function topbar(title, back, extraHtml) {
  return `<div class="topbar">${back ? `<button class="iconbtn" onclick="history.length>1?history.back():go('${back}')" aria-label="Back">${ICON.back}</button>` : ''}
    <h1>${esc(title)}${extraHtml || ''}</h1></div>`;
}
const go = h => { location.hash = h; };
// Allow or stop turning sideways (Android honours this; on iPhone the cover above does the job)
function freeTurn(on) {
  try { if (on) { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); }
    else { screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait').catch(() => {}); } } catch (e) {}
  checkTurn();
}
window.go = go;

function syncBanner() {
  if (!S.queue.length) return '';
  const err = S.queue.find(q => q.error);
  return `<div class="banner ${err ? '' : 'green'}"><div class="grow">${S.queue.length} waiting to send${err ? ' – ' + esc(err.error) : ''}${S.status ? `<br><small>${esc(S.status)}</small>` : ''}</div>
    <button class="btn small" onclick="sendNow(this)">Send now</button>
    ${err ? '<button class="btn small ghost" onclick="dropStuck()">Discard</button>' : ''}</div>`;
}
window.dropStuck = function () {
  // the sheet refused this change; drop it so the rest can send
  const i = S.queue.findIndex(q => q.error);
  if (i < 0) return;
  S.queue.splice(i, 1); saveQueue(); toast('Change discarded'); render(); flush();
};

