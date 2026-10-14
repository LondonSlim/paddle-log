/* Water Log service worker: keeps the app itself on the phone so it opens with no signal.
 * Bump VERSION whenever app files change so phones pick up the new version. */
const VERSION = 'wl-v4';
const SHELL = [
  './', 'index.html', 'app.css', 'app.js', 'osgrid.js', 'home1.jpg', 'home2.jpg', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'vendor/leaflet.js', 'vendor/leaflet.css',
  'vendor/fonts/bricolage-grotesque-latin-600-normal.woff2',
  'vendor/fonts/bricolage-grotesque-latin-800-normal.woff2',
  'vendor/fonts/inter-latin-400-normal.woff2',
  'vendor/fonts/inter-latin-600-normal.woff2'
];
const TILES = 'wl-tiles';
const MAX_TILES = 1500;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== VERSION && k !== TILES).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache the sheet API – the app keeps its own copy of the data
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  // Map tiles: use a saved tile if there's no signal, keep the ones you've looked at
  if (/tile\.opentopomap\.org$/.test(url.hostname) || url.hostname === 'api.os.uk') {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => {
        if (res.ok) { c.put(req, res.clone()); trimTiles(c); }
        return res;
      }).catch(() => hit || Response.error());
      return hit || net;
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // App files: from the phone first, refreshed in the background
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true }) ||
      (req.mode === 'navigate' ? await c.match('index.html') : null);
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});

let trimming = false;
async function trimTiles(c) {
  if (trimming) return; trimming = true;
  try {
    const keys = await c.keys();
    for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
  } finally { trimming = false; }
}
