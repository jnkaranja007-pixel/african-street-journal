/**
 * Fires the ASJ desk on time, because GitHub's scheduler will not.
 *
 * GitHub queues scheduled workflows and deprioritises them on free public repositories.
 * The 27 August run was queued at 05:00 and started at 16:01; the 28th, moved to 05:17,
 * started at 17:27. Neither published before Africa was awake, which is the whole point
 * of the paper.
 *
 * Cloudflare cron triggers fire on the minute. This Worker calls the workflow_dispatch
 * API, which GitHub runs immediately rather than queueing. The workflow's own freshness
 * guard means a duplicate call costs seconds, so firing more than once is safe.
 *
 * The repository keeps its own schedule as a fallback. If this Worker is ever removed or
 * its token expires, the paper still publishes - just later in the day.
 */

const OWNER = 'jnkaranja007-pixel';
const REPO = 'african-street-journal';
const WORKFLOW = 'update-news.yml';
const REF = 'main';

async function dispatch(env) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        // A fine-grained token with Actions: read and write on this repository only.
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        // GitHub rejects API calls without a User-Agent.
        'User-Agent': 'asj-cron-worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: REF }),
    }
  );

  // 204 No Content is success for this endpoint.
  if (res.status === 204) return { ok: true, status: 204 };
  const body = await res.text();
  return { ok: false, status: res.status, body: body.slice(0, 300) };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      dispatch(env).then((r) => {
        // Worker logs are the only place a cron failure surfaces, so say which it was.
        if (r.ok) console.log('ASJ desk dispatched');
        else console.error(`ASJ dispatch failed: HTTP ${r.status} ${r.body}`);
      })
    );
  },

  // Manual trigger for testing: visit the Worker URL. Returns what GitHub said.
  async fetch(request, env) {
    const r = await dispatch(env);
    return new Response(JSON.stringify(r, null, 2), {
      status: r.ok ? 200 : 502,
      headers: { 'content-type': 'application/json' },
    });
  },
};
