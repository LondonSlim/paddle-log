/* Water Log – photos: trip photos, the viewer and photo dots on maps */
'use strict';

/* ---------- photos ---------- */

const MAX_PHOTOS = 5;
const photoUrl = (id, w) => 'https://lh3.googleusercontent.com/d/' + id + '=w' + w;
// Photos in the sheet, less any waiting on the phone to be deleted. A position moved by hand
// (Moved Lat / Moved Lon in the Photos tab, or a move waiting to send) is used in place of the geotag.
const livePhotos = () => {
  const gone = new Set(S.queue.filter(q => q.kind === 'delphoto').map(q => q.id));
  const moves = {}; S.queue.filter(q => q.kind === 'movephoto').forEach(q => { moves[q.id] = q; });
  return ((S.data && S.data.photos) || []).filter(p => !gone.has(p.id)).map(p => {
    const o = Object.assign({}, p, { tagLat: num(p.lat), tagLon: num(p.lon) });
    let ml = num(p.movedLat), mo = num(p.movedLon);
    if (moves[p.id]) { ml = num(moves[p.id].lat); mo = num(moves[p.id].lon); }
    if (ml != null && mo != null) Object.assign(o, { lat: ml, lon: mo, moved: true });
    else Object.assign(o, { lat: o.tagLat, lon: o.tagLon, moved: false });
    return o;
  });
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
      <button class="vmove" onclick="openMovePhoto()" aria-label="Move photo on the map">${ICON.pin}</button>
      <div class="vask" hidden><div><b>Delete this photo?</b><br>It goes to the bin in your Google Drive.</div>
        <div class="btnrow"><button class="btn small danger" onclick="delPhoto()">Delete</button><button class="btn small ghost" onclick="keepPhoto()">Keep</button></div></div>`;
    let x0 = null;
    v.addEventListener('touchstart', ev => { x0 = ev.target.closest && ev.target.closest('#vmovebox') ? null : ev.touches[0].clientX; }, { passive: true });
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
  v.querySelector('.vmove').hidden = !p.id;
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
window.closeViewer = () => { closeMovePhoto(); const v = $('#viewer'); if (v) v.remove(); VIEW = null; document.body.classList.remove('viewing'); checkTurn(); };

/* ---------- move a photo that sits in the wrong place ---------- */
// The geotag in the photo stays as it is; the new position is kept separately and can be undone.
let MOVE = null;
window.openMovePhoto = function () {
  const p = VIEW && VIEW.list[VIEW.i]; if (!p || !p.id || typeof L === 'undefined') return;
  const v = $('#viewer'); let box = $('#vmovebox');
  if (!box) {
    box = document.createElement('div'); box.id = 'vmovebox';
    box.innerHTML = `<div class="vm-head"><b>Move this photo</b><span id="vm_info">Tap the map where the photo was taken</span></div>
      <div id="vm_map"></div>
      <div class="btnrow"><button class="btn small" id="vm_save" disabled onclick="saveMovePhoto()">Save position</button>
        <button class="btn small ghost" id="vm_reset" onclick="resetMovePhoto()">Back to geotag</button>
        <button class="btn small ghost" onclick="closeMovePhoto()">Cancel</button></div>`;
    v.appendChild(box);
  }
  const live = livePhotos().find(x => x.id === p.id) || p;
  const trip = entries().find(e => e.date === p.date && onWater(e, p.river));
  const pl = trip && placeByName()[trip.putInPlace];
  const start = live.lat != null ? [live.lat, live.lon] : pl && pl.latN != null ? [pl.latN, pl.lonN] : null;
  $('#vm_reset').hidden = !live.moved;
  $('#vm_info').textContent = live.moved ? 'Moved by hand. Tap the map to move it again.' : live.lat != null ? 'Geotag shown. Tap the map where it was really taken.' : 'No geotag. Tap the map where it was taken.';
  const map = L.map($('#vm_map'), { zoomControl: true, attributionControl: true });
  tileLayer().addTo(map);
  if (start) map.setView(start, 16); else map.setView([52.6, -2.5], 6);
  const mk = start ? L.marker(start, { icon: photoIcon() }).addTo(map) : null;
  MOVE = { id: p.id, map, mk, lat: null, lon: null };
  map.on('click', ev => {
    MOVE.lat = +ev.latlng.lat.toFixed(6); MOVE.lon = +ev.latlng.lng.toFixed(6);
    if (MOVE.mk) MOVE.mk.setLatLng(ev.latlng); else MOVE.mk = L.marker(ev.latlng, { icon: photoIcon() }).addTo(map);
    $('#vm_save').disabled = false; $('#vm_info').textContent = 'New position: ' + MOVE.lat.toFixed(5) + ', ' + MOVE.lon.toFixed(5);
  });
  box.hidden = false; setTimeout(() => map.invalidateSize(), 60);
};
function queueMove(id, lat, lon) {
  S.queue = S.queue.filter(q => !(q.kind === 'movephoto' && q.id === id));
  enqueue({ kind: 'movephoto', id, lat, lon });
  const p = VIEW && VIEW.list.find(x => x.id === id);
  if (p) { const live = livePhotos().find(x => x.id === id); if (live) { p.lat = live.lat; p.lon = live.lon; } }
}
window.saveMovePhoto = function () { if (!MOVE || MOVE.lat == null) return; queueMove(MOVE.id, MOVE.lat, MOVE.lon); toast('Photo moved'); closeMovePhoto(); };
window.resetMovePhoto = function () { if (!MOVE) return; queueMove(MOVE.id, '', ''); toast('Photo back at its geotag'); closeMovePhoto(); };
function closeMovePhoto() {
  if (MOVE && MOVE.map) { try { MOVE.map.remove(); } catch (e) {} }
  MOVE = null; const box = $('#vmovebox'); if (box) box.remove();
}
window.closeMovePhoto = closeMovePhoto;

// Photo markers: a small blue camera dot, shown on the three most zoomed-in map levels.
// Built as an HTML marker with a generous invisible tap area so it is easy to hit on a phone.
const photoIcon = () => L.divIcon({ className: 'wl-photo', html: '<span><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span>', iconSize: [32, 32], iconAnchor: [16, 16] });
function addPhotoDots(map, list) {
  const pts = list.filter(p => p.lat != null && p.lon != null && isFinite(p.lat) && isFinite(p.lon));
  if (!pts.length) return;
  const group = L.layerGroup();
  pts.forEach(p => {
    const m = L.marker([p.lat, p.lon], { icon: photoIcon(), zIndexOffset: 1000, keyboard: false, title: tripLabel(p) });
    // tapping a photo dot shows a small card: the photo (tap to enlarge) and a link to its trip
    m.bindPopup(() => {
      const same = pts.filter(q => q.date === p.date && q.river === p.river)
        .map(q => Object.assign({}, q, { full: photoUrl(q.id, 1600) }));
      const trip = entries().find(e => e.date === p.date && onWater(e, p.river));
      const card = document.createElement('div'); card.className = 'phcard';
      card.innerHTML = `<button class="phcard-img" aria-label="Show photo"><img src="${photoUrl(p.id, 400)}" alt=""></button>
        ${trip ? `<a href="#trip/${trip.row || 'p:' + trip.pendingUid}">${esc(tripLabel(p))}</a>` : `<span>${esc(tripLabel(p))}</span>`}`;
      card.querySelector('button').addEventListener('click', ev => {
        ev.stopPropagation(); m.closePopup();
        openViewer(same, Math.max(0, same.findIndex(q => q.id === p.id)));
      });
      return card;
    }, { maxWidth: 220, minWidth: 180 });
    group.addLayer(m);
  });
  const show = () => { const on = map.getZoom() >= map.getMaxZoom() - 2; if (on && !map.hasLayer(group)) group.addTo(map); if (!on && map.hasLayer(group)) map.removeLayer(group); };
  map.on('zoomend', show); show();
}

