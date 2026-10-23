/* afx-relay: fetches the ten AFX exchange listing pages for the market refresh.

   afx.kwayisi.org drops traffic from GitHub's runners, so the listings could only be
   refreshed from the owner's PC. This Worker fetches the same public pages from
   Cloudflare's network and returns them unchanged. It is not an open proxy: only the ten
   exchange pages the refresh uses can be requested, only with GET, and each answer is
   cached for 30 minutes so a burst of requests reaches AFX once.

   Deploy (no Node needed): Cloudflare dashboard > Workers & Pages > Create > Worker,
   paste this file, Deploy. Then set the repository variable ASJ_AFX_RELAY to the Worker's
   URL (Settings > Secrets and variables > Actions > Variables). See README.md. */

const SLUGS = new Set(['nse', 'ngx', 'jse', 'gse', 'use', 'zse', 'bse', 'luse', 'mse', 'brvm']);

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    const slug = new URL(request.url).pathname.replace(/^\/+|\/+$/g, '');
    if (!SLUGS.has(slug)) return new Response('Not found', { status: 404 });

    const cache = caches.default;
    const key = new Request('https://afx-relay.cache/' + slug + '/');
    const hit = await cache.match(key);
    if (hit) return hit;

    const upstream = await fetch('https://afx.kwayisi.org/' + slug + '/', {
      headers: {
        'User-Agent': 'AfricanStreetJournal-markets/1.0 (+https://africanstreetjournal.com)',
        'Accept': 'text/html'
      },
      cf: { cacheTtl: 1800, cacheEverything: true }
    });
    const body = await upstream.text();
    const response = new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=1800',
        'X-Relay-Upstream-Status': String(upstream.status)
      }
    });
    if (upstream.ok) ctx.waitUntil(cache.put(key, response.clone()));
    return response;
  }
};
