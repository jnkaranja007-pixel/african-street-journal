# News pipeline - the AI Desk

The country news is the **AI Desk**: each day Claude searches the web for the most important
current stories in each country and writes them up - neutral, factual, **ranked by usefulness
and popularity**, each with real source citations. There is no RSS aggregator and no templated
filler.

## How it works

```
Claude + web search  -->  scripts/build-briefs.ps1  -->  data/briefs.js  -->  index.html
  (per country)            (search + write + rank)      (window.UNITED_AFRICA_BRIEFS)
```

- `scripts/build-briefs.ps1` loops the ~55 countries. For each, it calls the Claude API with the
  **web_search** tool and a strict neutral-newswire system prompt: search for the real current
  news, write the top stories ranked best-first, cite the actual source name + URL, skip
  gossip / net-worth / betting / adult content, output JSON. It also returns a `markets` object
  (top listed companies + market cap + recent move) that drives the investor heat map.
- `index.html` loads `data/app-data.js` and `data/briefs.js`, then renders the **News** panel as
  a two-column editorial desk (rank / topic / headline / body / why it matters / sources). The
  landing "Today across Africa" entry opens a continental front page (lead story + ranked stories
  + topic filters + search).
  Countries with no briefs yet show an honest placeholder.

## Run it

```powershell
$env:ANTHROPIC_API_KEY = 'sk-ant-...'
powershell -ExecutionPolicy Bypass -File scripts/build-briefs.ps1               # all countries
powershell -ExecutionPolicy Bypass -File scripts/build-briefs.ps1 -Only ng,ke,za  # a few
```

- **Model**: defaults to `claude-haiku-4-5` (cheap/fast). For higher search + writing quality:
  `-Model claude-sonnet-4-6`.
- **Cost**: tokens are pennies; web search adds a small per-search fee. Budget on the order of a
  dollar or two per full daily run with Haiku - well within a launch budget.

## Daily auto-update (GitHub Actions - already wired)

`.github/workflows/update-news.yml` runs `build-briefs.ps1` every morning (05:00 UTC) on a cloud
Windows runner, commits the refreshed `data/briefs.js`, and pushes. No PC needed.

To turn it on:
1. Make this folder a Git repo and push it to GitHub (see "Git status" below).
2. Settings > Secrets and variables > Actions > New secret -> name `ANTHROPIC_API_KEY`, paste your key.
3. Settings > Actions > General > Workflow permissions -> Read and write (lets the bot commit briefs.js).
4. The cron runs daily; you can also trigger it from Actions > Update AI Desk > Run workflow.
5. Host the static site (GitHub Pages / Netlify / Vercel); each daily commit redeploys.

## Git status

This folder is NOT yet a Git repo. Before the GitHub Action can run, either:
- `git init` here, commit, and push to a new GitHub repo, OR
- move these files into your existing repo.

## Notes

- The old RSS aggregator has been removed. The app uses the AI Desk brief file as the single news
  source.
- Runtime data is intentionally lean: `data/app-data.js` is the compiled map/country bundle and
  `data/briefs.js` is the daily content bundle.
- `data/briefs.js` currently holds a small hand-seeded sample (Nigeria, Kenya) so the section is
  demoable before the first real run; the daily job overwrites it for every country.
