# Running the journal

The site is live at **https://africanstreetjournal.com** and refreshes itself. This is the
operations note: how the desk works, what to do when it breaks, and what it costs.

---

## How the desk works

Three steps, nightly at 05:00 UTC, entirely in GitHub Actions. No PC needed.

| Step | Script | What it does |
|---|---|---|
| 1. Gather | `scripts/fetch-news.ps1` | Reads ~150 verified feeds from `data/sources.json`, clusters the same story across outlets, ranks on corroboration, tier, recency and subject matter. No API key. |
| 2. Write | `scripts/write-briefs.ps1` | Sends the ranked items to a cheap model on OpenRouter and gets briefs back in house style. |
| 3. Publish | `add-briefs` -> `validate-briefs` -> `audit-briefs` -> `build-static-pages` | Merges, gates, verifies every citation resolves, rebuilds the crawlable pages and sitemap, commits. |

**The model never sees a URL.** It is handed numbered items and returns an index; the citation
is attached afterwards from the feed. A fabricated source is structurally impossible rather
than something the audit has to catch.

---

## Cost

About **$0.70/month** on `google/gemma-4-31b-it` at 55 countries a day. Fetching is free.

Do not trust that number without checking openrouter.ai Activity - an earlier estimate on this
project ("a dollar or two") was off by 10x. The key has a $5/month cap, so a runaway loop costs
five dollars, not a surprise.

To change model, edit the `-Model` default in `scripts/write-briefs.ps1`. Any OpenRouter slug
works; the writing step only rewrites supplied facts, so a small instruction-following model is
enough.

---

## Secrets and settings

| Thing | Where | Value |
|---|---|---|
| `OPENROUTER_API_KEY` | Repo secret | Required. Without it the nightly run fails loudly rather than going stale in silence. |
| `ANTHROPIC_API_KEY` | Repo secret | Legacy. Nothing calls it. Safe to delete. |
| Workflow permissions | Settings -> Actions -> General | Read and write, so the bot can commit briefs. |
| Pages | Settings -> Pages | Deploy from `main` / root, custom domain `africanstreetjournal.com`, Enforce HTTPS on. |
| DNS | Cloudflare | Four apex A records to GitHub Pages, `www` CNAME, **all DNS-only (grey cloud)**. SSL/TLS mode **Full**. |

`CNAME` is committed to the repo so a workflow run cannot drop the custom domain.

---

## Scheduled work

| When | What |
|---|---|
| Daily 05:00 UTC | The desk: gather, write, gate, publish |
| Sundays 04:00 UTC | `check-sources.yml` verifies every feed and repairs the registry |
| Monthly, 3rd | World Bank GDP/growth refresh |

GitHub emails you only on failure. Trigger by hand at **Actions -> Update AI Desk -> Run workflow**;
the `only` input (`ng,ke,za`) limits it to a few countries for a quick test.

---

## Checking on it

```powershell
powershell -File serve.ps1          # then open http://localhost:5733/?selftest=1  (26 checks)
powershell -File scripts/validate-briefs.ps1              # is the current data publishable?
powershell -File scripts/audit-briefs.ps1 -CheckLinks     # does every citation resolve?
powershell -File scripts/check-sources.ps1                # which feeds have rotted?
```

`audit-briefs` prints a `REWRITE:` line naming the weakest countries. That is the input to the
weekly quality pass in `scripts/ROUTINE.md`.

---

## When something looks wrong

**Stories are stale.** Check Actions for a failed run. Every country carries its own date, so
the site never claims data is fresher than it is.

**A country is thin or empty.** Run `scripts/check-sources.ps1 -Only <code>`. Feeds rot: papers
move CMS, drop RSS, or let a domain lapse. The checker separates `blocked` (Cloudflare refuses
automated readers - replace the source, CI is blocked harder than your laptop), `missing` (the
outlet genuinely has no RSS) and `hijacked` (the domain now serves someone else).

**The audit reports a FABRICATED source.** Check the URL before blaming the model, which never
sees one. Some feeds publish markup inside `<link>`; that surfaced once as a 404 that looked
like invention and was actually a publisher's malformed XML.

**A bad run got committed.** `git revert <sha>` and push; the site redeploys.

**HTTPS stops working after a domain change.** GitHub only provisions a certificate once DNS
resolves. If it stalls, remove and re-add the custom domain via the API - re-saving the same
value clears the error without triggering issuance.
