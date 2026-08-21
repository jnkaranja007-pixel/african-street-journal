/* The African Street Journal - service worker.
   Network-first for everything same-origin (dev and daily data never go stale),
   cache fallback so the journal still opens offline. */

// One version constant drives both the cache name and every precached URL. They used
// to be separate strings and drifted: the cache said v18 while SHELL still asked for
// v16. Nothing broke - the fetch handler matches with ignoreSearch, and GitHub Pages
// ignores query strings - but the numbers lied, and a version that lies is worse than
// no version. Bump V alone; index.html's ?v= must match it.
const V = '35';
const CACHE = 'asj-v' + V;
const SHELL = ['./', 'index.html', 'styles.css?v=' + V, 'app.js?v=' + V, 'data/app-core.js?v=' + V, 'data/briefs.js?v=' + V, 'data/archive/index.js?v=' + V, 'data/supabase-config.js?v=' + V, 'manifest.json', 'icon.svg'];

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
  // `cache: 'no-cache'` forces a revalidation against the server (cheap: GitHub Pages answers
  // 304 when unchanged) instead of letting the browser's HTTP cache answer from memory. Without
  // it, a code fix never reaches a returning reader, because index.html asks for the same
  // versioned URL (app.js?v=N) and the browser happily serves its stale copy. Freshness must not
  // depend on a human remembering to bump N.
  const revalidating = new Request(event.request, { cache: 'no-cache' });
  event.respondWith(
    fetch(revalidating)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
