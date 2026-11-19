// Butler's offline copy (a service worker). It keeps the app's own files so the installed app opens without
// internet: pages are fetched fresh when there's a connection (so every update arrives) and from this copy when
// there isn't. Only Butler's own files and its fonts are kept; your data never passes through here (the data file,
// OneDrive and To Do are reached directly, as before).
const CACHE = 'butler-v1';
const CORE = ['PA%20App.html', 'PA%20App%20Guide.html', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-maskable.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === self.location.origin;
  const font = /^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
  if (!own && !font) return; // OneDrive, Microsoft, price services: straight to the network
  if (own && url.search) return; // sign-in answers and the like: never from the copy
  if (font) { // fonts: the copy first, refreshed in the background
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const fresh = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || fresh;
    }));
    return;
  }
  // Butler's own files: fresh when online (kept for next time), the copy when not.
  e.respondWith(fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  }).catch(async () => (await caches.match(req)) || (req.mode === 'navigate' ? caches.match('PA%20App.html') : Response.error())));
});
