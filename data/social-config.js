// The paper's own social accounts. Once a handle is set here, every page shows a
// "Follow" link to it and the app's follow prompt offers it. Handles only, never a
// token: the posting tokens are GitHub secrets (see scripts/post-social.ps1).
//   telegram:  the public channel name without the @, e.g. 'africanstreetjournal'
//   bluesky:   the full handle, e.g. 'africanstreetjournal.bsky.social'
//   x, instagram, youtube: the handle without the @
// The About-menu Follow row lives in info-panel.js; keep its handles in step with these.
window.ASJ_SOCIAL = { telegram: '', bluesky: '', x: 'thestreetafrica', instagram: 'theafricanstreetjournal', youtube: 'theafricanstreetjournal' };
