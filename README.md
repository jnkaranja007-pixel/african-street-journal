# The African Street Journal

**[Read it →](https://africanstreetjournal.com/)**

A daily newspaper for all 55 African countries. Every morning an AI desk searches the web,
writes ranked and source-cited briefs for each country, and publishes them. Alongside the
news sits a country dossier — economy, markets, agriculture, atlas — read through the lens
you choose: **farmer**, **investor**, or **diaspora**.

*From the streets, for the streets.*

---

## What's in it

- **The Wire** — a continental front page: lead story, topic filters, search, past editions,
  and a three-country compare table.
- **55 country dossiers** — live population, weather and local time; World Bank GDP and
  growth; the national exchange and its listings; a stylized GIS atlas with cities, rivers,
  landmarks and critical infrastructure.
- **Three audience lenses** — farmers get crop calendars, market hubs and export routes;
  investors get the economy chart, market heat map and sector brief; the diaspora gets a live
  FX send-home calculator and remittance context.
- **A watchlist** — follow countries and they surface on the landing page.
- **Works offline** — installable, and the last edition stays readable without a connection.

## How the data stays honest

Every figure carries its provenance, and the app never pretends to know more than it does:

| Layer | Source |
|---|---|
| News briefs | Claude with web search, ranked, each with real outlet + article URL |
| GDP, growth, history | World Bank API (refreshed monthly, vintage shown on every figure) |
| Exchange rates | open.er-api.com, with the "as of" date displayed |
| Weather | Open-Meteo |
| Remittances | World Bank / KNOMAD |
| Relief shading, crop windows | Labeled *stylized* and *indicative* — they are illustrative, not survey data |

A country with no briefs yet shows its **region's wire** rather than a dead end, and says so.
Nothing is invented to fill a gap.

## How it runs itself

| Schedule | Job |
|---|---|
| Daily, 05:00 UTC | AI desk writes fresh briefs for all 55 countries, validates, commits, redeploys |
| Monthly, 3rd | World Bank economy layer refreshed |

A **publication gate** (`scripts/validate-briefs.ps1`) runs before every commit and rejects
truncated files, invalid JSON, malformed briefs and non-http source URLs. A country whose run
fails keeps its last good briefs, so a flaky night never costs coverage.

## Running it locally

```powershell
powershell -File serve.ps1        # then open http://localhost:5733
```

No build step and no dependencies — plain HTML, CSS and JavaScript. Add `?selftest=1` to the
URL to run 26 built-in integrity and render checks.

To run the desk from your own machine (gather is free; writing needs an OpenRouter key):

```powershell
powershell -File scripts/fetch-news.ps1 -Only ng,ke,za
$env:OPENROUTER_API_KEY = 'sk-or-v1-...'
powershell -File scripts/write-briefs.ps1 -Only ng,ke,za -OutFile data/auto-briefs.json
powershell -File scripts/add-briefs.ps1 -InFile data/auto-briefs.json
```

See **[GO-LIVE.md](GO-LIVE.md)** for how the nightly desk works, what it costs, and what to do
when a feed rots.

## Layout

```
index.html          markup
styles.css          all styling
app.js              all behaviour
data/app-core.js    landing map + economy layer, loaded up front
data/countries/     55 lazy chunks — a country's geometry loads when opened
data/briefs.js      today's edition        data/archive/  past editions
scripts/            pipeline, validation, data builders
```
