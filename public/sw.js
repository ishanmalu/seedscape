// Offline support. Site files are network-first (so a deploy is never mixed
// with stale files) with the cache as the offline fallback; fonts are
// cache-first because their URLs never change. Bump VERSION to drop old caches.
const VERSION = 'seedscape-v2';
const CORE = ['./', 'index.html', 'style.css', 'app.js', 'icons.js', 'finder-ui.js', 'view3d.js',
  'worker.js', 'finder.js', 'cubiomes.mjs', 'cubiomes.wasm',
  'vendor/three/three.module.min.js', 'vendor/three/OrbitControls.js'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) e.respondWith(networkFirst(e.request));
  else if (FONT_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(e.request));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) ?? Response.error();
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
