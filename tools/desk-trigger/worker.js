// ASJ desk trigger: starts the morning desk on time.
//
// GitHub runs the desk's own schedule (01:40 UTC) five to seven hours late on a free
// public repository: over 26 Oct - 9 Nov 2026 the edition was written between 06:45 and
// 09:40 UTC, which is 10:00 to 12:40 in Nairobi. A Cloudflare Worker's cron fires on the
// minute, so this one asks GitHub to start the desk by dispatch at 01:40 UTC and again
// at 02:40 UTC. Both say timed=yes, so the desk treats them like its schedule: once the
// day's edition is out, later attempts (these or GitHub's own) stop in seconds.
//
// Setup (README.md in this folder). Needs one secret, GITHUB_TOKEN: a fine-grained
// token for this repository only, with "Actions: Read and write" and nothing else.
// ASCII only.

const REPO = 'jnkaranja007-pixel/african-street-journal';
const WORKFLOW = 'update-news.yml';

async function startDesk(env) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN secret is not set');
  const res = await fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW + '/dispatches', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'asj-desk-trigger',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ref: 'main', inputs: { timed: 'yes' } })
  });
  // 204 No Content is success. Anything else is logged in the Worker's own logs.
  if (res.status !== 204) throw new Error('GitHub answered ' + res.status + ': ' + (await res.text()).slice(0, 300));
  return res.status;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(startDesk(env).then(
      () => console.log('desk started (' + event.cron + ')'),
      err => console.error('desk not started: ' + err.message)
    ));
  },
  // Opening the Worker's address only says what it is; it never starts the desk, so a
  // stranger who finds the URL cannot run up the model bill.
  async fetch() {
    return new Response('ASJ desk trigger. Starts the morning desk at 01:40 and 02:40 UTC.\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }
};
