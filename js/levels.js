/* Water Log – levels: gauges and river levels */
'use strict';

// Gauges the sheet can read automatically (England, Scotland, France)
const gaugeInfo = () => (S.data && S.data.gaugeInfo) || {};
const autoGauge = g => String(g || '').split('/').map(x => x.trim()).filter(Boolean).some(x => (gaugeInfo()[x] || {}).auto);


// Level, flow or tide for a trip, as one short line
function levelText(e) {
  return [e.level !== '' && e.level != null ? e.level + ' m' : '', e.flow ? e.flow + ' cumecs' : ''].filter(Boolean).join(' · ');
}

// Gauges for a water: those used on its trips (most used first), then any listed against it in the Gauges tab
function riverGaugeList(name, list) {
  const c = {};
  list.forEach(e => String(e.gauge || '').split('/').map(x => x.trim()).filter(Boolean).forEach(g => { c[g] = (c[g] || 0) + 1; }));
  Object.entries(gaugeInfo()).forEach(([g, i]) => {
    if (!(g in c) && String(i.river || '').split('/').map(x => x.trim()).includes(name)) c[g] = 0;
  });
  return Object.keys(c).sort((a, b) => c[b] - c[a] || a.localeCompare(b)).map((g, i) => {
    const info = gaugeInfo()[g] || {};
    const lat = num(info.lat), lon = num(info.lon);
    return { name: g, n: i + 1, lat, lon };
  });
}

// Numbered gauge pins (G1, G2…); tapping one opens the gauge's live level page
function addGaugePins(map, gs) {
  gs.filter(g => g.lat != null && g.lon != null).forEach(g => {
    const m = L.marker([g.lat, g.lon], {
      icon: L.divIcon({ className: 'wl-gauge', html: `<span class="gpin">G${g.n}</span>`, iconSize: [30, 22], iconAnchor: [15, 11] }),
      title: g.name + ' gauge', zIndexOffset: 500
    }).addTo(map);
    m.on('click', ev => { if (ev && ev.originalEvent) L.DomEvent.stop(ev.originalEvent); window.open(gaugeLink(g.name), '_blank', 'noopener'); });
  });
}

// Latest reading for a gauge, when the sheet sends one (from the Status column of the Gauges tab)
function gaugeNow(name) {
  const info = gaugeInfo()[name] || {};
  const txt = Object.values(info).filter(v => typeof v === 'string').join(' ');
  const m = txt.match(/Level\s+(-?\d+(?:\.\d+)?)\s*m/i);
  if (m) return { level: +m[1], state: 'ok' };
  return { level: null, state: /no recent reading|offline|not read/i.test(txt) ? 'none' : 'unknown' };
}

// Every gauge with a position, for the main map
function allGauges() {
  return Object.entries(gaugeInfo()).map(([g, i]) => ({ name: g, lat: num(i.lat), lon: num(i.lon), river: i.river || '' }))
    .filter(g => g.lat != null && g.lon != null);
}

/* ---------- tides ---------- */

// Tide is kept in one cell as "HW 14:41 London Bridge"; the form shows the time and the place separately.
// Anything in another form (e.g. "LW 10:29, HW 16:30") is shown as it is and saved unchanged.
function splitTide(t) {
  const m = String(t || '').match(/^\s*HW\s+(\d{1,2})[:.](\d{2})\s*(.*)$/i);
  return m ? { time: m[1].padStart(2, '0') + ':' + m[2], place: m[3].trim() } : { time: '', place: String(t || '') };
}
const joinTide = (time, place) => time ? ('HW ' + time + (place ? ' ' + place : '')) : (place || '');

// Is this water tidal? Its past trips decide; with no history, its name does (coast, harbour, estuary…)
function isTidalWater(name) {
  if (!name) return false;
  const list = entries().filter(e => onWater(e, name));
  const tides = list.filter(e => String(e.tide || '').trim()).length, gauges = list.filter(e => String(e.gauge || '').trim()).length;
  if (tides || gauges) return tides > gauges;
  return /\b(coast|harbour|harbor|estuary|sea|bay|sound|firth|isles?|island|tideway|tidal|channel|strait|creek)\b/i.test(name);
}
