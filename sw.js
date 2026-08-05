/* The African Street Journal — service worker.
   Network-first for everything same-origin (dev and daily data never go stale),
   cache fallback so the journal still opens offline. */
const CACHE = 'asj-v15';
const SHELL = ['./', 'index.html', 'styles.css?v=15', 'app.js?v=15', 'data/app-core.js?v=15', 'data/briefs.js?v=15', 'data/archive/index.js?v=15', 'manifest.json', 'icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
