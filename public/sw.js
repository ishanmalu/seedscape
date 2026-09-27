// Offline + instant repeat visits: serve cached files immediately and refresh
// them in the background (stale-while-revalidate). Bump VERSION to drop old caches.
const VERSION = 'seedscape-v1';
const CORE = ['./', 'index.html', 'style.css', 'app.js', 'icons.js', 'finder-ui.js', 'view3d.js',
  'worker.js', 'finder.js', 'cubiomes.mjs', 'cubiomes.wasm'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const cacheable = e.request.method === 'GET' &&
    (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com');
  if (!cacheable) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: url.origin === location.origin });
    const fresh = fetch(e.request).then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    return hit ?? fresh;
  }));
});
