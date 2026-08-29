// Copy over data/newsletter-config.js, fill in the endpoint, and commit it. Until then
// no sign-up form renders anywhere - better nothing than a form that silently drops
// what people type into it.
//
// `endpoint` must accept a cross-origin POST. Any of these work without a server:
//   Buttondown   https://buttondown.email/api/emails/embed-subscribe/<your-username>
//   Formspree    https://formspree.io/f/<form-id>
//   Your own Cloudflare Worker, if you would rather hold the list yourself.
//
// `field` is the form field name the provider expects for the address. Buttondown uses
// 'email'; check your provider's embed snippet if the form appears to submit but the
// list stays empty.
//
// This is a public endpoint by design - it is in the page source of every newsletter
// sign-up on the web. Do not put an API key or an admin token here.
window.ASJ_NEWSLETTER = {
  endpoint: null,
  field: 'email',
  // Shown above the form. Say what arrives and how often; a promise you keep is the
  // whole of the relationship.
  pitch: 'One morning email. The lead story from each of the 55 countries you follow.'
};
