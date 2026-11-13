/* The African Street Journal - service worker.
   Code at this release's version: served from cache at once, refreshed behind.
   Pages and daily data: network first, but a slow network (a phone on 2G, a stalled
   connection) falls back to the cached copy after a few seconds instead of a blank
   screen; the network answer still lands in the cache for next time.
   Map files: their own long-lived cache, stale-while-revalidate (below). */

// One version constant drives both the cache name and every precached URL. They used
// to be separate strings and drifted: the cache said v18 while SHELL still asked for
// v16. Nothing broke - the fetch handler matches with ignoreSearch, and GitHub Pages
// ignores query strings - but the numbers lied, and a version that lies is worse than
// no version. Bump V alone; index.html's ?v= must match it.
const V = '124';
const CACHE = 'asj-v' + V;
// briefs-full.js (~500 KB of prose) is no longer precached on install; app.js fetches
// it after first paint and the network-first handler caches it then.
const SHELL = ['./', 'index.html', 'data/country-facts.js?v=' + V, 'styles.css?v=' + V, 'app.js?v=' + V, 'data/app-core.js?v=' + V, 'data/briefs.js?v=' + V, 'data/indices.js?v=' + V, 'data/archive/index.js?v=' + V, 'data/supabase-config.js?v=' + V, 'data/analytics-config.js?v=' + V, 'data/newsletter-config.js?v=' + V, 'data/social-config.js?v=' + V, 'manifest.json', 'icon.svg', 'info-panel.js', 'country-sidebar.js?v=' + V, 'story-kit.js?v=' + V, 'fx-trend.js?v=' + V];

// The Atlas's heavy files - relief images (up to 560 KB), map chunks, country facts -
// change a few times a month, but network-first made a returning reader wait a round
// trip (0.25-0.45 s to GitHub Pages, far more on a phone network) for each before the
// map could draw, and every version bump emptied the cache they lived in. They get their
// own cache, kept across versions, served from it at once and refreshed behind (stale-
// while-revalidate): a rebuilt map reaches a reader one visit late at most. Matched
// without the ?v= query, which changes with every front-end release. The desk never
// writes these files. A release whose app.js cannot draw the previous files (a renamed
// field, a new required one) bumps MAP_CACHE, so no reader pairs new code with old maps.
const MAP_CACHE = 'asj-maps-v1';
const MAP_ASSET = /\/data\/(relief\/[a-z]{2}(-s|-focus)?\.jpg|countries\/[a-z]{2}\.js|facts\/[a-z]{2}\.js|locator\.json)$/;
// Front-end code that ships with a ?v= stamp. Data files carry the stamp too
// (data/briefs.js?v=V) but the desk rewrites them every morning, so they are not here.
const CODE_ASSET = /\/(app\.js|styles\.css|story-kit\.js|country-sidebar\.js|data\/country-facts\.js)$/;
// How long a page or data request waits on the network before a cached copy answers.
const NETWORK_WAIT_MS = 3500;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE && key !== MAP_CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Serve the cached copy at once and refresh it behind; with no copy, wait for the network.
function staleWhileRevalidate(event, cacheName, key, revalidating) {
  return caches.open(cacheName).then(async cache => {
    const hit = await cache.match(key);
    const refresh = fetch(revalidating).then(response => {
      if (response.ok) cache.put(key, response.clone()).catch(() => {});
      return response;
    });
    if (hit) {
      event.waitUntil(refresh.catch(() => {}));
      return hit;
    }
    return refresh;
  });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;
  // `cache: 'no-cache'` forces a revalidation against the server (cheap: GitHub Pages answers
  // 304 when unchanged) instead of letting the browser's HTTP cache answer from memory. Without
  // it, a code fix never reaches a returning reader, because index.html asks for the same
  // versioned URL (app.js?v=N) and the browser happily serves its stale copy. Freshness must not
  // depend on a human remembering to bump N.
  const revalidating = new Request(event.request, { cache: 'no-cache' });
  const url = new URL(event.request.url);
  if (MAP_ASSET.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, MAP_CACHE, url.origin + url.pathname, revalidating));
    return;
  }
  // This release's own code (app.js?v=V and friends) changes under the same version only
  // when a fix is pushed without a bump; it still reaches the reader, one visit late.
  if (CODE_ASSET.test(url.pathname) && url.searchParams.get('v') === V) {
    event.respondWith(staleWhileRevalidate(event, CACHE, event.request, revalidating));
    return;
  }
  const network = fetch(revalidating).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
    }
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  event.respondWith(new Promise(resolve => {
    let settled = false;
    let timer = 0;
    const settle = response => {
      if (settled || !response) return;
      settled = true;
      clearTimeout(timer);
      resolve(response);
    };
    const cached = () => caches.match(event.request, { ignoreSearch: true });
    // Past this, with a copy in hand, the reader would be staring at nothing. With no
    // copy, keep waiting for the network.
    timer = setTimeout(() => { cached().then(settle); }, NETWORK_WAIT_MS);
    network.then(settle).catch(() => cached().then(hit => settle(hit || Response.error())));
  }));
});
