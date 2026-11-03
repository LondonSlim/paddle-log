/* Water Log – places: access points: river order, cards, sharing and the edit screen */
'use strict';

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

