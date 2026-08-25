# Running the journal

The site is live at **https://africanstreetjournal.com** and refreshes itself. This is the
operations note: how the desk works, what to do when it breaks, and what it costs.

---

## How the desk works

Three steps, nightly at 05:00 UTC, entirely in GitHub Actions. No PC needed.

| Step | Script | What it does |
|---|---|---|
| 1. Gather | `scripts/fetch-news.ps1` | Reads verified feeds, clusters the same event across languages, and scores six candidates on relevance, corroboration, source quality, freshness, impact and evidence. No API key. |
| 2. Write | `scripts/write-briefs.ps1` | Turns the five assignments into original 70-220 word on-site stories. The sixth candidate is reserve. |
| 3. Publish | `add-briefs` -> `validate-briefs` -> `audit-briefs` -> `build-static-pages` | Merges, gates, verifies every citation resolves, rebuilds the crawlable pages and sitemap, commits. |

**The model never sees a URL.** It is handed numbered items and returns an index; the citation
is attached afterwards from the feed. A fabricated source is structurally impossible rather
than something the audit has to catch.

---

## Cost

Do not estimate cost from the old short-brief workflow. Every run now writes exact usage and
reported cost to `data/desk-run-metrics.json`, and CI uploads that file as a 30-day artifact.
Story caching avoids paying twice for unchanged candidate sets, while countries with fewer than
five credible candidates are skipped before any model call. Set a hard monthly cap in OpenRouter.

To change model, edit the `-Model` default in `scripts/write-briefs.ps1`. Any OpenRouter slug
works; the writing step only rewrites supplied facts, so a small instruction-following model is
enough.

---

## Secrets and settings

| Thing | Where | Value |
|---|---|---|
| `OPENROUTER_API_KEY` | Repo secret | Required. Without it the nightly run fails loudly rather than going stale in silence. |
| `ANTHROPIC_API_KEY` | Repo secret | Legacy. Nothing calls it. Safe to delete. |
| Workflow permissions | Settings -> Actions -> General | Read and write, so the bot can commit stories. |
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

GitHub emails you only on failure. Trigger by hand at **Actions -> Update ASJ Desk -> Run workflow**;
the `only` input (`ng,ke,za`) limits it to a few countries for a quick test.

---

## Checking on it

```powershell
powershell -File serve.ps1          # then open http://localhost:5733/?selftest=1
powershell -File scripts/test-news-ranking.ps1           # assignment behavior
powershell -File scripts/test-story-contract.ps1          # story + cost gates
powershell -File scripts/test-publication-gate.ps1        # targeted-run publication gate
powershell -File scripts/validate-briefs.ps1              # is the current data publishable?
powershell -File scripts/audit-briefs.ps1 -CheckLinks     # does every citation resolve?
powershell -File scripts/check-sources.ps1                # which feeds have rotted?
```

`audit-briefs` prints a `REWRITE:` line naming the weakest countries. That is the input to the
weekly quality pass in `scripts/ROUTINE.md`. The full gate also requires five fresh story
packages for at least 50 countries, so a mostly carried-forward edition cannot pass as new.

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
