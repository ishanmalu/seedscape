// Offline support. Site files are network-first (so a deploy is never mixed
// with stale files), with the cache as the offline fallback. Bump VERSION when
// the file list changes, to drop old caches.
const VERSION = 'seedscape-v4';

const CORE = ['./', 'style.css', 'app.js', 'icons.js', 'finder-ui.js', 'view3d.js',
  'worker.js', 'finder.js', 'cubiomes.mjs', 'cubiomes.wasm',
  'vendor/three/three.module.min.js', 'vendor/three/OrbitControls.js', 'palette.js', 'tools.js',
  'fonts/inter-latin.woff2', 'fonts/jetbrains-mono-500-latin.woff2', 'waypoints-io.js', 'commands.js',
  'seed.js', 'saved.js'];

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
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    // Always revalidate with the server (cheap: unchanged files are a 304), so
    // HTML, JS and WebAssembly from one deploy are never mixed with another's.
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) ?? Response.error();
  }
}
