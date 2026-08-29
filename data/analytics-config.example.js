// Copy over data/analytics-config.js and fill in ONE of the two, then commit it.
// It has to be committed: GitHub Pages serves this repository, so a file that is not
// in it is a 404 and no analytics load. That is fine - neither value below is a
// secret. A GoatCounter site code and a Cloudflare beacon token are visible in the
// page source of every site that uses them; they identify a dashboard, they do not
// grant access to one. Do not put anything here that is not already public.
//
// GoatCounter - free, cookieless. Sign up at goatcounter.com and use the subdomain
//   you chose there.
// Cloudflare - the DNS is already there. Web Analytics is free; enable it for
//   africanstreetjournal.com and copy the token out of the snippet it shows you.
//
// Both are cookieless and neither profiles readers across sites, so no consent banner
// is required. Leave the file as null to load nothing at all.
window.ASJ_ANALYTICS = {
  goatcounter: null,   // e.g. 'asj'  ->  https://asj.goatcounter.com/count
  cloudflare: null     // e.g. '0123456789abcdef0123456789abcdef'
};
