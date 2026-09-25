// Cloudflare Web Analytics. Cookieless, no consent banner needed, and no personal data
// leaves the page - it reports page views and Core Web Vitals only.
//
// This token is public by design: it is in the page source of every site that uses
// Cloudflare Web Analytics. It names a dashboard, it does not grant access to one.
//
// JS-snippet mode on purpose. Cloudflare's "automatic setup" injects the beacon at its
// own edge, and africanstreetjournal.com is DNS-only - it resolves straight to GitHub
// Pages (185.199.108-111.153), so no request ever passes through Cloudflare. An
// automatic-setup site would have sat at zero for ever.
window.ASJ_ANALYTICS = {
  goatcounter: null,
  cloudflare: '3abb46c7260d4cb5914d98ebbebeb69c'
};
