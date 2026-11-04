/* Water Log – logbook: home, trips, rivers, buddies, trip page and the log form */
'use strict';

function screenHome() {
  const list = entries(), st = stats(list);
  const name = (S.data && S.data.settings && S.data.settings.appName) || 'Water Log';
  const n = S.queue.length;
  return `<section class="home" id="home"><div class="board" id="board">
      <div class="ph p1" role="img" aria-label="Hugh canoeing through white water"></div>
      ${n ? `<button class="pending" onclick="flush()">${n} waiting to send · Send now</button>` : ''}
      <button class="gear" onclick="go('setup')" aria-label="Settings">${ICON.cog}</button>
      <h1 class="title">${titleLines(name)}</h1>
      <button class="st s1" onclick="go('rivers')"><b>${st.rivers}</b><span>Rivers / Waters</span></button>
      <button class="st s2" onclick="go('trips')"><b>${st.trips}</b><span>Trips</span></button>
      <button class="st s3" onclick="go('buddies')"><b>${st.buddies}</b><span>Buddies</span></button>
      <button class="st s4" onclick="go('countries')"><b>${st.countries}</b><span>Countries</span></button>
      <div class="ph p2" role="img" aria-label="Hugh in his red canoe"></div>
    </div></section>`;
}
// "Water Log" is set as two lines, Water above Log
const titleLines = n => esc(n).replace(/\s+/, '<br>');
function fitHome() {
  const b = $('#board'), h = $('#home'); if (!b || !h) return;
  const k = h.clientWidth / 393;
  b.style.transform = 'scale(' + k + ')';
  h.style.height = Math.round(746 * k) + 'px';
}
function afterHome() { fitHome(); }
window.addEventListener('resize', fitHome);

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
    <div class="btnrow"><a class="btn small ghost" href="#countries">Countries</a></div>
    <div id="tripList">${yearCards(list)}</div></div>`;
}
function yearCards(list) {
  const ys = {};
  list.forEach(e => { const y = e._d ? e._d.getFullYear() : 'Undated'; (ys[y] = ys[y] || []).push(e); });
  const keys = Object.keys(ys).sort((a, b) => (b === 'Undated') - (a === 'Undated') || b - a);
  if (!keys.length) return '<div class="empty">No trips yet</div>';
  return `<div class="years">${keys.map(y => {
    const n = ys[y].length, rv = new Set([].concat(...ys[y].map(watersOf))).size;
    return `<a class="ycard" href="#trips/${enc(y)}"><b>${esc(y)}</b><span>${n} ${n === 1 ? 'trip' : 'trips'}</span><small>${rv} ${rv === 1 ? 'water' : 'waters'}</small></a>`;
  }).join('')}</div>`;
}
function tripRows(list) {
  return list.map(e => `<li><a class="row" href="#trip/${e.row || 'p:' + e.pendingUid}">
      ${dateBox(e._d)}
      <div class="grow"><div class="t">${esc(watersOf(e).join(' + '))}${e.section ? ' · ' + esc(e.section) : ''}</div>
      <div class="s">${esc([e.putInPlace, e.paddlers].filter(Boolean).join(' · ') || e.craft || '')}</div></div>
      ${e.pendingUid ? '<span class="badge orange">Waiting</span>' : ''}${ICON.chev}</a></li>`).join('') || '<div class="empty">No trips yet</div>';
}
window.filterTrips = function () {
  const q = $('#tq').value.trim().toLowerCase();
  if (!q) { $('#tripList').innerHTML = yearCards(entries()); return; }
  const list = entries().filter(e => [e.river, e.alsoOn, e.section, e.putInPlace, e.takeOutPlace, e.paddlers, e.notes, e.date, e.country].join(' ').toLowerCase().includes(q));
  $('#tripList').innerHTML = `<ul class="list">${tripRows(list)}</ul>`;
};

// Countries: one card per country (like the years); tap one for its trips, newest first
function screenCountries(country) {
  const list = entries();
  if (country) {
    const cl = list.filter(e => String(e.country || '').trim() === country);
    return topbar(country + ' · ' + cl.length + (cl.length === 1 ? ' trip' : ' trips'), 'countries') + `<div class="wrap">
      <ul class="list">${tripRows(cl)}</ul></div>`;
  }
  const cs = {};
  list.forEach(e => { const c = String(e.country || '').trim(); if (c) (cs[c] = cs[c] || []).push(e); });
  const keys = Object.keys(cs).sort((a, b) => cs[b].length - cs[a].length || a.localeCompare(b));
  return topbar('Countries', 'home') + `<div class="wrap">
    ${keys.length ? `<div class="years">${keys.map(c => {
      const n = cs[c].length, rv = new Set([].concat(...cs[c].map(watersOf))).size;
      return `<a class="ycard country" href="#countries/${enc(c)}"><b>${esc(c)}</b><span>${n} ${n === 1 ? 'trip' : 'trips'}</span><small>${rv} ${rv === 1 ? 'water' : 'waters'}</small></a>`;
    }).join('')}</div>` : '<div class="empty">No countries recorded yet</div>'}</div>`;
}

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
  return topbar('Rivers / Waters', '') + `<div class="wrap">
    <input class="search" id="rq" placeholder="Search rivers, lakes, waterways and coasts" oninput="filterRivers()">
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
      ${ICON.chev}</a></li>`).join('') || '<div class="empty">Nothing matches</div>';
};

function screenRiver(name) {
  const list = entries().filter(e => onWater(e, name));
  const r = riverIndex(list).find(x => x.name === name) || { entries: [] };
  const ps = riverPlaces(name, list);
  const gs = riverGaugeList(name, list);
  const yrs = r.first ? (r.first.getFullYear() === r.last.getFullYear() ? r.first.getFullYear() : r.first.getFullYear() + '–' + r.last.getFullYear()) : '';
  return topbar(name, 'rivers') + `<div class="wrap">
    <div class="meta"><button class="badge linkish" onclick="document.getElementById('tripsLevels').scrollIntoView({behavior:'smooth'})">${list.length} ${list.length === 1 ? 'trip' : 'trips'}</button>${yrs ? `<span class="badge grey">${yrs}</span>` : ''}</div>
    ${sectionsCard(name, list)}
    <div class="mapbox small" id="riverMap"></div>
    <div class="legend"><span><i style="background:#6DB33F"></i>Access point</span>${gs.some(g => g.lat != null) ? '<span><i class="gauge"></i>Gauge</span>' : ''}<span><i class="ph"></i>Photo</span></div>
    <h2>Access points</h2>
    ${ps.length ? `<div class="updown">Top of the river first. Tap a place for details.</div>
      <div class="places">${ps.map(placeRow).join('')}</div>` : '<div class="empty">No access points saved yet</div>'}
    ${gs.length ? `<details class="gdet"><summary><h2>Gauges <span class="muted">(${gs.length})</span></h2>${ICON.chev}</summary><div class="card">${gs.map(g =>
      `<div class="row" style="box-shadow:none;margin:0;padding:8px 0;cursor:default"><span class="gnum">G${g.n}</span><div class="grow"><div class="t">${esc(g.name)}</div>
        ${(S.data.gauges || {})[g.name] ? '' : '<div class="s">Link searches the web</div>'}</div>
        <a class="btn small orange" href="${gaugeLink(g.name)}" target="_blank" rel="noopener">${ICON.wave} Live level</a></div>`).join('')}</div></details>` : ''}
    <h2 id="tripsLevels">Trips and levels</h2>
    <ul class="list">${list.map(e => {
      const lv = levelText(e);
      return `<li><a class="row" href="#trip/${e.row || 'p:' + e.pendingUid}">
        ${dateBox(e._d)}
        <div class="grow"><div class="t">${esc(e.section || e.putInPlace || e.river)}${lv ? ` <span class="badge">${esc(lv)}</span>` : ''}</div>
        <div class="s">${esc([e.tide ? 'Tide ' + e.tide : e.gauge, e.levelComments].filter(Boolean).join(' – ') || 'No level noted')}</div></div>${ICON.chev}</a></li>`;
    }).join('')}</ul></div>`;
}
function afterRiver(name) {
  const el = $('#riverMap'); if (!el) return;
  const list = entries().filter(e => onWater(e, name));
  const pts = riverPlaces(name, list).map((p, i) => Object.assign(p, { n: i + 1 })).filter(p => p.latN != null).map(p => ({
    lat: p.latN, lon: p.lonN, n: p.n,
    popup: `<b>${esc(p.name)}</b>${dirLink(p) ? `<br><a href="${dirLink(p)}" target="_blank" rel="noopener">Directions</a>` : ''}`
  }));
  const gs = riverGaugeList(name, list).filter(g => g.lat != null);
  const map = makeMap(el, pts.concat(gs.map(g => ({ lat: g.lat, lon: g.lon, hidden: true }))), { big: true, maxZoom: 15, zoom: 14, expand: true });
  if (!map) return;
  addGaugePins(map, gs);
  addPhotoDots(map, livePhotos().filter(p => (p.river || '').trim() === name));
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
  // put-in and take-out: just the name; tap it for the access point's details
  const placeLine = (label, n) => n ? `<dt>${label}</dt><dd><a href="#place/${enc(n)}">${esc(n)}</a></dd>` : '';
  const lv = levelText(e);
  const editable = e.row || e.pendingUid;
  const waters = watersOf(e);
  const craft = [e.craft, e.model].filter(Boolean).join(' – ');
  const wname = waters.join(' + ') || 'Trip';
  const size = wname.length > 26 ? ' long' : wname.length > 16 ? ' mid' : '';
  return `<div class="topbar tripbar"><button class="iconbtn" onclick="history.length>1?history.back():go('home')" aria-label="Back">${ICON.back}</button>
    <div class="tt"><h1 class="tt-river${size}">${waters.length ? waters.map(w => `<a href="#river/${enc(w)}">${esc(w)}</a>`).join(' + ') : 'Trip'}</h1>${e.section ? `<div class="tt-sec">${esc(e.section)}</div>` : ''}<div class="tt-date">${esc(fmtDate(e._d))}</div></div></div>` + `<div class="wrap">
    ${e.pendingUid ? '<div class="banner">Saved on this phone, waiting to send.</div>' : ''}
    <div class="card"><div class="meta" style="margin-top:0">${craft ? `<span class="badge grey">${esc(craft)}</span>` : ''}${e.start || e.finish ? `<span class="badge grey">${esc(e.start || '?')}–${esc(e.finish || '?')}</span>` : ''}${lv ? `<span class="badge">${esc(lv)}</span>` : ''}${e.country ? `<span class="badge grey">${esc(e.country)}</span>` : ''}</div>
      <dl class="kv" style="margin-top:12px">
        ${placeLine('Put in', e.putInPlace)}
        ${placeLine('Take out', e.takeOutPlace)}
        ${e.weather ? `<dt>Weather</dt><dd>${esc(e.weather)}</dd>` : ''}
        ${e.tide ? `<dt>Tide</dt><dd>${esc(e.tide)}</dd>` : ''}
        ${e.gauge ? `<dt>Gauge</dt><dd>${esc(e.gauge)}${lv ? ' – ' + esc(lv) : ''}${e.levelAuto && lv ? ` <span class="badge grey">auto</span><br><small class="muted">${esc(e.levelAuto)}</small>` : ''}${!lv && e.start && autoGauge(e.gauge) ? '<br><small class="muted">Level will be filled in from the gauge</small>' : ''}</dd>` : ''}
        ${e.levelComments ? `<dt>Conditions</dt><dd>${esc(e.levelComments)}</dd>` : ''}
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

// "Now" to five minutes: up to a minute past a five-minute mark rounds down, after that rounds up (12:00:20 → 12:00, 12:01:01 → 12:05)
function roundNow(d) {
  d = d || new Date();
  const secs = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  const block = 300, into = secs % block;
  const t = (into < 60 ? secs - into : secs - into + block) % 86400;
  return String(Math.floor(t / 3600)).padStart(2, '0') + ':' + String(Math.floor(t % 3600 / 60)).padStart(2, '0');
}

/* ---------- add / edit form ---------- */

const FORM = {}; // state for the open form

function placeOptions(river, selected) {
  const ps = places();
  const mine = ps.filter(p => p.river === river).map(p => p.name);
  const used = new Set();
  entries().filter(e => onWater(e, river)).forEach(e => { if (e.putInPlace) used.add(e.putInPlace); if (e.takeOutPlace) used.add(e.takeOutPlace); });
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
  const years = Array.from({ length: now + 1 - 1970 + 1 }, (_, i) => now + 1 - i).map(yy => opt(yy, yy, y)).join('');
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
  entries().filter(e => onWater(e, river)).forEach(e => add(e.gauge, 1));
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

// Craft is a short list; the model is remembered for each craft from your last trip in it
const CRAFTS = ['Canoe', 'Kayak', 'Sit on top', 'Sea kayak', 'Playboat', 'SUP'];
const lastModel = craft => (entries().find(e => e.craft === craft && e.model) || {}).model || '';
function modelsList() {
  const k = $('#f_craft') && $('#f_craft').value;
  const ms = Array.from(new Set(entries().filter(e => e.craft === k).map(e => e.model).filter(Boolean)));
  if ($('#dl_models')) $('#dl_models').innerHTML = ms.map(m => `<option value="${esc(m)}">`).join('');
}
window.craftChanged = function () {
  const m = $('#f_model');
  // replace the model only if it was filled in for you (or is empty)
  if (m && (!m.value.trim() || m.value === FORM.autoModel)) { m.value = FORM.autoModel = lastModel($('#f_craft').value); }
  modelsList(); saveDraft();
};

// More than one water on a trip, e.g. down the Tryweryn and on to the Dee
const alsoRow = (w, i) => `<div class="also"><input class="f_also" list="dl_rivers" value="${esc(w || '')}" placeholder="Another river, lake, waterway or coast" autocomplete="off">
  <button type="button" class="btn small ghost" onclick="this.parentNode.remove();saveDraft()" aria-label="Remove">✕</button></div>`;
window.addAlso = function () {
  const box = $('#alsoBox'); box.insertAdjacentHTML('beforeend', alsoRow('', box.children.length));
  box.lastElementChild.querySelector('input').focus();
};

// Gauge level for rivers, tide for the sea
window.setTideMode = function (on, quiet) {
  FORM.tide = !!on; if (!quiet) FORM.tideSet = true;
  $('#gaugeBlock').hidden = FORM.tide; $('#tideBlock').hidden = !FORM.tide;
  if (!quiet) saveDraft();
};

function screenForm(id, candId) {
  const editing = id != null;
  let e = {};
  if (editing) {
    e = findEntry(id);
    if (!e) return topbar('Edit', 'home') + '<div class="wrap empty">Not found – try refreshing.</div>';
  }
  const cand = candId ? findCand(candId) : null;
  const draft = !editing && !cand ? store.get(LS.draft, null) : null;
  const lastCraft = (entries().find(x => x.craft) || {}).craft || 'Canoe';
  const v = Object.assign({ date: isoDate(new Date()), craft: lastCraft }, draft || {},
    editing ? Object.assign({}, e, { date: e._d ? isoDate(e._d) : '' }) : {},
    cand ? { date: cand._d ? isoDate(cand._d) : '', river: String(cand.river || '').split(' / ')[0] } : {});
  FORM.id = id; FORM.cand = cand ? cand.id : null; FORM.river = v.river || ''; FORM.np = { in: {}, out: {} };
  FORM.paddlers = splitNames(v.paddlers); FORM.askNames = [];
  if (!editing && !(draft && draft.model) && !v.model) v.model = lastModel(v.craft);
  FORM.autoModel = v.model || '';
  FORM.also = alsoList(v);
  FORM.tide = v.tide ? true : v.gauge ? false : isTidalWater(v.river); FORM.tideSet = !!(v.tide || v.gauge);
  const ents = entries();
  const rivers = Array.from(new Set(ents.map(x => x.river).filter(Boolean))).sort();
  const crafts = Array.from(new Set(CRAFTS.concat(ents.map(x => x.craft).filter(Boolean), v.craft ? [v.craft] : [])));
  const tideSplit = splitTide(v.tide);
  const tidePlaces = Array.from(new Set(ents.map(x => splitTide(x.tide).time ? splitTide(x.tide).place : '').filter(Boolean))).sort();
  const gauges = Array.from(new Set(Object.keys((S.data && S.data.gauges) || {}).concat(ents.map(x => x.gauge).filter(Boolean)))).sort();
  const full = editing;
  const f = (k, l, ph, type) => `<label>${l}</label><input id="f_${k}" ${type ? `type="${type}"` : ''} value="${esc(v[k] || '')}" placeholder="${esc(ph || '')}">`;
  const ta = (k, l, ph) => `<label>${l}</label><textarea id="f_${k}" placeholder="${esc(ph || '')}">${esc(v[k] || '')}</textarea>`;
  const more = `
      ${f('weather', 'Weather', 'Sunny, light SW breeze')}
      ${ta('levelComments', 'Conditions', 'Good level, few scrapes – or sea state, swell, wind against tide')}
      ${ta('notes', 'Notes', 'How it went, lines, swims, lessons…')}
      ${ta('putInNotes', 'Put-in notes for this trip', '')}
      ${ta('takeOutNotes', 'Take-out notes for this trip', '')}`;
  return topbar(editing ? 'Edit paddle' : 'Log a paddle', editing ? 'trip/' + id : (cand ? 'cand/' + cand.id : 'home')) + `<div class="wrap form" id="paddleForm">
    ${!editing && draft ? '<div class="banner"><div class="grow">Carrying on from an unsaved draft.</div><button class="btn small ghost" onclick="clearDraft()">Start fresh</button></div>' : ''}
    ${cand ? `<div class="banner green"><div class="grow">From ${esc(cand.cal || cand.folder || 'your photos')}. Check the date and river.</div></div>` : ''}
    ${dateSelects(v.date)}
    <label>Craft</label><select id="f_craft" onchange="craftChanged()">${crafts.map(k => `<option${k === v.craft ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select>
    <label>Model</label><input id="f_model" list="dl_models" value="${esc(v.model || '')}" placeholder="e.g. Prospector 16" autocomplete="off">
    <label>River, lake, waterway, coast or other</label><input id="f_river" list="dl_rivers" value="${esc(v.river || '')}" onchange="riverChanged()" autocomplete="off" placeholder="e.g. Dart, Regent's Canal or Dorset coast">
    <div id="alsoBox">${FORM.also.map((w, i) => alsoRow(w, i)).join('')}</div>
    <button type="button" class="linkbtn" onclick="addAlso()">＋ Another water on this trip</button>
    <label>Section</label><input id="f_section" list="dl_sections" value="${esc(v.section || '')}" autocomplete="off">
    ${placeField('in', 'Put in', v.putInPlace)}
    ${timeField('start', 'Start time', v.start)}
    ${placeField('out', 'Take out', v.takeOutPlace)}
    ${timeField('finish', 'Finish time', v.finish)}
    <div id="gaugeBlock"${FORM.tide ? ' hidden' : ''}>
      <label>Gauge</label><input id="f_gauge" list="dl_gauges" value="${esc(v.gauge || '')}" oninput="gaugeTyped()" autocomplete="off" placeholder="Tap one below or type">
      <div class="chips" id="gaugeChips"></div>
      <div class="grid2"><div>${f('level', 'Level (m)', '', 'text')}</div><div>${f('flow', 'Flow (cumecs)', '', 'text')}</div></div>
      <div class="muted small" id="gaugeHint"></div>
      <button type="button" class="linkbtn" onclick="setTideMode(true)">Tidal water? Enter the tide instead</button>
    </div>
    <div id="tideBlock"${FORM.tide ? '' : ' hidden'}>
      <div class="grid2"><div><label>High water</label><input id="f_hw" type="time" value="${esc(tideSplit.time)}"></div>
        <div><label>At</label><input id="f_tidePlace" list="dl_tideplaces" value="${esc(tideSplit.place)}" placeholder="London Bridge" autocomplete="off"></div></div>
      <button type="button" class="linkbtn" onclick="setTideMode(false)">River? Enter the gauge level instead</button>
    </div>
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
    <datalist id="dl_models"></datalist>
    <datalist id="dl_tideplaces">${tidePlaces.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <datalist id="dl_gauges">${gauges.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
    <datalist id="dl_sections"></datalist>
    <datalist id="dl_buddies">${buddyCounts(ents).slice(0, 30).map(([n]) => n).sort((a, b) => a.localeCompare(b)).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
  </div>`;
}
function afterForm() {
  sectionsList(); drawPaddlers(); drawGauges(); showNow(); modelsList();
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
  // a new trip on a different kind of water: switch between gauge and tide, unless either has been filled in
  const filled = ['gauge', 'level', 'flow', 'hw', 'tidePlace'].some(k => ($('#f_' + k) || {}).value);
  if (!filled && !FORM.tideSet) setTideMode(isTidalWater(FORM.river), true);
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
  const onRiver = buddyCounts(ents.filter(e => onWater(e, FORM.river))).map(x => x[0]);
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
    model: val('model'), alsoOn: $$('#alsoBox input').map(i => i.value.trim()).filter(Boolean).join(' / '),
    start: val('start'), finish: val('finish'), weather: val('weather'), tide: joinTide(val('hw'), val('tidePlace')), gauge: val('gauge'),
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

