# asj-cron

Fires the ASJ desk on time. GitHub's own scheduler queues workflows for hours on free
public repositories - 05:00 started at 16:01, 05:17 started at 17:27 - so the paper was
publishing well after its readers had woken up. Cloudflare cron triggers fire on the
minute, and `workflow_dispatch` runs immediately instead of being queued.

The repository keeps its own `schedule:` block as a fallback. If this Worker is removed
or its token expires the paper still publishes, just later in the day.

## Deploy

1. Create a **fine-grained** GitHub token at
   <https://github.com/settings/personal-access-tokens/new>
   - Repository access: only `african-street-journal`
   - Permissions: **Actions: Read and write** (nothing else)
   - Expiry: set a reminder; a lapsed token fails silently apart from the Worker log

2. From this directory:

   ```
   npx wrangler login
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler deploy
   ```

   `secret put` prompts for the token. It is stored encrypted by Cloudflare and is never
   in this repository.

3. Test it immediately rather than waiting for 02:10: open the Worker URL that `deploy`
   prints. A `204` means GitHub accepted the dispatch and the run has started.

## Times

`02:10 UTC` is 05:10 in Nairobi and Addis, 04:10 in Lagos, 04:10 in Cairo and
Johannesburg. A run takes about 30 minutes, so the edition is live before the earliest
large market is properly awake. `06:10 UTC` is a second attempt; the freshness guard in
the workflow makes it a few-second no-op when the first one worked.
