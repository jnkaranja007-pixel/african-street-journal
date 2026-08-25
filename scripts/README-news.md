# ASJ story pipeline

The African Street Journal publishes original, source-cited stories on site. The
pipeline uses public publisher feeds for evidence and OpenRouter only for grounded
writing. It does not ask a model to search for or invent URLs.

## Daily flow

```text
publisher feeds
  -> fetch-news.ps1       gather, cluster and rank six candidates per country
  -> write-briefs.ps1     turn the best five into original ASJ stories
  -> add-briefs.ps1       merge complete country desks and archive the edition
  -> validate-briefs.ps1  enforce structure, lenses, freshness and coverage
  -> audit-briefs.ps1     score quality and verify citations
  -> build-static-pages.ps1
```

The sixth candidate is reserve. A country needs five usable candidates and five
valid stories or its previous complete desk remains in place. The full scheduled
run is rejected unless at least 50 countries publish five fresh story packages.

## Ranking

`news-ranking.ps1` scores evidence before the model is called. The meter rewards:

- relevance to the country
- independent corroboration
- source quality and direct publisher links
- freshness
- concrete public, economic or practical impact
- evidence depth, figures and named actors
- topic and event diversity across the final desk

Tests in `test-news-ranking.ps1`, `test-story-contract.ps1`,
`test-article-evidence.ps1` and `test-publication-gate.ps1` protect those rules.

## Run locally

```powershell
# Free gather/ranking audit
powershell -File scripts/fetch-news.ps1 -Only ng,ke,za
powershell -File scripts/test-news-ranking.ps1

# Grounded writing and publication
$env:OPENROUTER_API_KEY = 'sk-or-v1-...'
powershell -File scripts/go-live.ps1 -Only ng,ke,za -NoCommit
```

Remove `-Only` only when the OpenRouter account has enough credit for a full run.
`data/desk-run-metrics.json` records calls, tokens, cache hits and reported cost.
The story cache avoids paying again when an evidence packet has not changed.

## Automation

`.github/workflows/update-news.yml` runs at 05:00 UTC. It fails loudly when the
OpenRouter secret is absent, when a requested country does not produce a complete
desk, when full-run freshness falls below 50 countries, or when a citation is dead.
Only a verified edition is committed and pushed.

Required repository secret: `OPENROUTER_API_KEY`.

## Files

- `data/feed-items.json`: ranked evidence packets; generated and not published.
- `data/briefs-state.json`: merge memory for the last complete country desks.
- `data/briefs.js`: current browser edition.
- `data/archive/`: rolling 30-day edition archive.
- `data/story-cache.json`: generated writing cache.
- `data/desk-run-metrics.json`: cost and efficiency report.

Do not hand-edit `data/briefs.js`. The next merge rebuilds it from
`data/briefs-state.json`.
