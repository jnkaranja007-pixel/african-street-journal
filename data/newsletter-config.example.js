// Copy over data/newsletter-config.js, fill in the endpoint, and commit it. Until then
// no sign-up form renders anywhere - better nothing than a form that silently drops
// what people type into it.
//
// This is the simpler of two backends. If data/supabase-config.js is filled in instead,
// the desk uses that and stores the reader's watchlist and lens alongside the address.
// This one takes the address only, and exists so a list can start on the day you have
// an endpoint rather than waiting for a database. Either way there is ONE signup record
// on the reader's device and one sync path; the front page, the Wire and the "Your desk"
// strip all write to it.
//
// `endpoint` must be https and accept a cross-origin POST. Any of these work with no
// server of your own:
//   Buttondown   https://buttondown.email/api/emails/embed-subscribe/<your-username>
//   Formspree    https://formspree.io/f/<form-id>
//   Your own Cloudflare Worker, if you would rather hold the list yourself.
// http endpoints are refused on purpose - an email address should not cross the network
// in the clear.
//
// `field` is the form field name the provider expects for the address. Buttondown uses
// 'email'; check your provider's embed snippet if the form submits but the list stays
// empty. Set `cors: false` if the provider does not send CORS headers.
//
// This value is public by design - it is in the page source of every newsletter sign-up
// on the web. Do not put an API key or an admin token here.
window.ASJ_NEWSLETTER = {
  endpoint: null,
  field: 'email',
  // Shown above the form. Say what arrives and how often; a promise you keep is the
  // whole of the relationship.
  pitch: 'One morning email. The lead story from each of the 55 countries you follow.'
};
