/* Water Log – app: screen router and start-up */
'use strict';

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
    review: [screenReview], cand: [screenCand], addc: [a => screenForm(null, a), afterForm],
    countries: [screenCountries], levels: [screenLevels, afterLevels], tides: [screenTides, afterTides],
    movephoto: [screenMovePhoto, afterMovePhoto]
  };
  if (VIEW && VIEW.hash !== location.hash) closeViewer();
  if (S.statusRoute !== location.hash) { S.status = ''; S.statusRoute = location.hash; }
  const [scr, after] = screens[route] || screens.home;
  const charting = route === 'levels' || route === 'tides';
  if (charting !== document.body.classList.contains('charting')) { document.body.classList.toggle('charting', charting); freeTurn(charting); }
  app.innerHTML = scr(route === 'add' ? undefined : arg);
  if (after) after(arg);
  const tab = { movephoto: 'map', countries: 'home', levels: 'rivers', tides: 'rivers', home: 'home', trips: 'home', buddies: 'home', buddy: 'home', rivers: 'rivers', river: 'rivers', place: 'rivers', add: 'add', edit: 'finish', finish: 'finish', trip: 'home', map: 'map', review: 'finish', cand: 'finish', addc: 'finish' }[route] || 'home';
  document.body.classList.toggle('homepage', route === 'home' || !screens[route]);
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  updateDot();
  if (route !== 'add' && route !== 'edit' && route !== 'addc') { app.scrollTop = 0; window.scrollTo(0, 0); }
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
