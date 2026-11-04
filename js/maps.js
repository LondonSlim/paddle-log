/* Water Log – maps: map tiles, pins and the map of all access points */
'use strict';

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
    if (p.hidden) { ll.push([p.lat, p.lon]); return; } // counted when fitting the view, drawn elsewhere
    const c = pinColour();
    const m = p.n
      ? L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'wl-num', html: `<span class="seq">${p.n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(map)
      : L.circleMarker([p.lat, p.lon], { radius: opts.big ? 9 : 7, color: c.line, weight: 3, fillColor: c.fill, fillOpacity: .95 }).addTo(map);
    if (p.popup) m.bindPopup(p.popup);
    ll.push([p.lat, p.lon]);
  });
  if (opts.expand) addExpandButton(map, el);
  if (ll.length > 1) map.fitBounds(ll, { padding: [28, 28], maxZoom: opts.maxZoom || 14 });
  else if (ll.length === 1) map.setView(ll[0], opts.zoom || 14);
  else map.setView([52.6, -2.5], 6);
  S.maps.push(map);
  setTimeout(() => { if (S.maps.includes(map)) try { map.invalidateSize(); } catch (e) {} }, 60);
  return map;
}

// A button on small maps to make them about two-thirds of the screen, and back again
function addExpandButton(map, el) {
  const Ctl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const b = L.DomUtil.create('button', 'mapsize');
      b.type = 'button'; b.title = 'Bigger map'; b.innerHTML = ICON.grow;
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b, 'click', ev => {
        L.DomEvent.stop(ev);
        const big = el.classList.toggle('expanded');
        b.innerHTML = big ? ICON.shrink : ICON.grow; b.title = big ? 'Smaller map' : 'Bigger map';
        setTimeout(() => { map.invalidateSize(); if (big) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 220);
      });
      return b;
    }
  });
  new Ctl().addTo(map);
}

/* ---------- map of all places ---------- */
function riversByPlace() {
  const m = {};
  entries().forEach(e => [e.putInPlace, e.takeOutPlace].forEach(p => { if (p) (m[p] = m[p] || new Set()).add(e.river); }));
  return m;
}
function screenMap() {
  return topbar('Map', '') + `<div class="wrap">
    <div class="legend" style="margin-top:12px"><span><i style="background:#6DB33F"></i>Access point</span><span><i class="gauge"></i>Gauge</span><span><i class="ph"></i>Photo</span></div>
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
        `<br>${d ? `<a href="${d}" target="_blank" rel="noopener">Directions</a> · ` : ''}<a href="#" onclick="sharePlace(${esc(JSON.stringify(p.name))});return false">Share</a>`
    };
  });
  const map = makeMap(el, pts, { maxZoom: 8 });
  if (!map) return;
  addPhotoDots(map, livePhotos());
  addAllGauges(map);
}

// Gauges on the main map, with a button to hide or show them
const LS_GAUGES = NS + 'wl_mapgauges';
function addAllGauges(map) {
  const layer = L.layerGroup();
  allGauges().forEach(g => {
    const now = gaugeNow(g.name);
    const m = L.marker([g.lat, g.lon], {
      icon: L.divIcon({ className: 'wl-gauge', html: '<span class="gpin">G</span>', iconSize: [24, 20], iconAnchor: [12, 10] }),
      title: g.name + ' gauge', zIndexOffset: 400
    });
    m.bindPopup(`<b>${esc(g.name)} gauge</b>${g.river ? '<br>' + esc(g.river) : ''}` +
      (now.level != null ? `<br>Latest ${now.level.toFixed(2)} m` : now.state === 'none' ? '<br>No recent reading' : '') +
      `<br><a href="${gaugeLink(g.name)}" target="_blank" rel="noopener">Live level</a>`);
    layer.addLayer(m);
  });
  let on = store.get(LS_GAUGES, true);
  if (on) layer.addTo(map);
  const Ctl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const b = L.DomUtil.create('button', 'mapsize gtoggle' + (on ? ' on' : ''));
      b.type = 'button'; b.title = 'Show or hide gauges'; b.textContent = 'G';
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b, 'click', ev => {
        L.DomEvent.stop(ev); on = !on; store.set(LS_GAUGES, on);
        if (on) layer.addTo(map); else map.removeLayer(layer);
        b.classList.toggle('on', on); toast(on ? 'Gauges shown' : 'Gauges hidden');
      });
      return b;
    }
  });
  new Ctl().addTo(map);
}

