// The paper's own social accounts. Once a handle is set here, every page shows a
// "Follow" link to it and the app's follow prompt offers it. Handles only, never a
// token: the posting tokens are GitHub secrets (see scripts/post-social.ps1).
//   telegram: the public channel name without the @, e.g. 'africanstreetjournal'
//   bluesky:  the full handle, e.g. 'africanstreetjournal.bsky.social'
window.ASJ_SOCIAL = { telegram: '', bluesky: '' };
