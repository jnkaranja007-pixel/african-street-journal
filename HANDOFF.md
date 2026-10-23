# Handoff: The African Street Journal (after the 22 Oct 2026 cloud session)

Site: africanstreetjournal.com. Repo: `jnkaranja007-pixel/african-street-journal`.
GitHub Pages serves `main`, so **whatever is on `main` is live**.

## Where things stand

- Everything from this session is **merged and live**. `main` and `signals-atlas-real-data`
  point at the same commit. On the desktop:
  `git fetch origin && git checkout main && git pull`
  (the branch can be deleted once you are happy).
- CI (`check.yml`: syntax on Windows, browser checks and the new desk harness on Ubuntu)
  was green on the last push.
- The owner merges/pushes to `main` only after saying yes. Ask before going live.

## What shipped this session (newest first)

| Commit | What |
|---|---|
| `10a00a28` | **News on the landing screen** (owner approved 23 Oct, reversing the "map stands alone" design): phones/tablets get one "Top story" card under the map (still one screen, measured flush 320-915px tall phones and 768/820 tablets); 1080px+ gets a column beside the map (top story + dek, 3 more from other countries, "All N stories"). `renderHomeFront` in app.js, mounts `#home-front-side` / `#home-front-top`. site-check asserts both and that a phone landing page is one screen. |
| `76e05017` | **Reader speed**: Atlas not drawn while hidden; deep links skip the home-map animation (country link on a slow phone: blocking time 2.4 s -> 1.1 s). **Data saver** (Save-Data or 3G and slower): no 146 KB `briefs-full.js` per visit; an opened story fetches its own static page; Wire search fetches prose on demand. Fixed: a failed prose download froze the tab when a story was tapped. site-check covers both. |
| `836eae90` | **Desk writer harness** (`scripts/write-briefs.ps1`, prompt `story-v14`): lens floors removed, hedged lens reasons scored 0-20, style check with one rewrite and a fact-checked fallback, off-country drop via `countryLink`, rewritten prompt. New `scripts/test-desk-harness.ps1` + `desk` CI job. |
| `b889aa34` | About menu cut to 5 items (Text-only edition, About, Contact, Corrections, Privacy); `/countries/` became the **text-only edition**; new About copy (mission, low-data reading, RSS explained); `feed.xsl` makes `feed.xml` readable in a browser. |
| `b940b806` | Season calendar bars were invisible on every country (a blanket `#cv-panel-signals [class*="-cell"]` rule cleared their background). Fixed + self-test check. |
| `1fea8957` | ASJ Wire uses the width on wide screens (centred frame, two-column list, lead headline beside its summary). |
| `e3a8066d` | Restored the map-v2 landing map: `data/app-data.js` now carries map-v2's countries + lakes, so re-splitting no longer reverts `data/app-core.js`. |
| `2474a073` | Atlas: Somaliland towns in Somalia, Laayoune/Dakhla/Smara in Western Sahara (`scripts/set-country-places.ps1`), capitals follow `COUNTRY_INFO`, labels clear of port/airport diamonds, label priority order. `tools/stress/country-check.mjs` (55 countries x 4 views). |
| `eeb40d56` | WFP food prices: market = national average > capital > largest towns > camp (flagged), staples first (`scripts/food-basket.ps1`, `scripts/test-food-basket.ps1`). |
| `fab8f9cb` | `update-economy.yml` uses `-SkipFoodPrices`; new monthly `update-food-rail.yml` (food prices, then OSM rail). |
| `a4ba15bd` | The original Signals/Atlas real-data rebuild for all 55 countries. |

Asset version is now **77** (`?v=` in `index.html`, `window.ASJ_ASSET_VERSION`, `const V` in
`sw.js`). `static-pages.css?v=69` is set inside `scripts/build-static-pages.ps1`.

## Do first (in order)

1. **Check the first desk run on the new writer** (01:40 UTC, retry 03:40 UTC, 23 Oct).
   `gh run list --workflow update-news.yml -L 3`, then `gh run view <id> --log | Select-String '\[write\]'`.
   Look for the new line `[write] style: N rewrite(s), N fixed, N kept with notes; N off-country
   story(ies) dropped; N speculative lens score(s) capped`. The desk also writes these counts to
   `data/desk-run-metrics.json` (styleRewrites, styleFixedByRewrite, styleKeptWithNotes,
   offCountryDropped, lensScoresCappedAsSpeculative).
   Then re-measure the published edition against the 22 Oct baseline:
   - stock phrases ("crucial", "underscores", "broader strategy"...): 22 Oct = 68 of 231 stories
   - investors lens >= 41: 22 Oct = 157 of 231 (68%); expected <= 25%
   - diaspora lens >= 41: 22 Oct = 55 (24%); expected ~5-10% (see decision 1)
   - off-country stories: 22 Oct ~7 (Namibia: Lisbon, Yemen; Burundi: Paris v Barcelona; Sao Tome: Lisbon)
   If the edition looks wrong: `git revert 836eae90` restores the previous writer exactly.
2. **Run the food-price and rail job** (the cloud session could not dispatch workflows):
   `gh workflow run update-food-rail.yml`. About 1 hour for food, then rail. Afterwards check
   10 countries by eye (ke, ug, dz, ml, mr, bj, dj, eg, sd, ng): market is a town (or flagged
   "refugee camp market"), basket is staples. Until it runs, Kenya still shows IFO (Dadaab).
3. **Refresh exchange listings**: `gh workflow run update-markets.yml`.
4. **Confirm the static pages rebuilt** after the desk run: the About page has the new copy,
   `/countries/` is titled "Text-only edition", `feed.xml` starts with an
   `<?xml-stylesheet ... /feed.xsl?>` line.

## Decisions waiting for the owner

1. **Diaspora tab size.** The Wire's reader tabs show only stories rated >= 41
   (`LENS_RELEVANCE_FLOOR` in `app.js`). With honest scoring the Diaspora tab may drop from ~55
   to ~10-20 stories a day. Option: let that tab include reader-interest stories (21-40).
2. **Frontier model or not.** The desk uses `google/gemini-2.5-flash-lite` with fallbacks
   `google/gemini-3.1-flash-lite`, `deepseek/deepseek-v3.2` (~$2.80/month). A frontier model would
   write better prose and translations; estimated $40-170/month (unverified, check OpenRouter).
   The About page says "AI language models", not "frontier", for accuracy. To test: the
   `update-news.yml` dispatch has `model` and `only` inputs, but a dispatched run **publishes**,
   so test on a copy or with care. Changing the default is the `ASJ_MODEL` repository variable.

## Open work, by priority

1. **Landmarks are single points**, so the inside-outline filter drops shared features from the
   countries they belong to: Egypt loses the Nile, Tanzania/Uganda Lake Victoria, Zambia Victoria
   Falls, Kenya Lake Victoria and "Mombasa"; Sahara/Congo Basin/Lake Chad likewise. Give
   `LANDMARK_POINTS` (app.js) per-country points. Kenya's part of Lake Victoria is not drawn as water.
2. **Rivers are not clipped to the country**: Kenya's atlas alt text lists Jubba, Pangani, Genale
   and an unnamed "River".
3. **Curated crop lists**: `FARM_EXPORTS` and `CROP_SEASONS` (app.js) are hand-made; Kenya's
   calendar is Tea / Cut flowers / Coffee, no maize. Replace with FAOSTAT top crops when its API is up.
4. **Audit report for the owner**: what was wrong, sources, what each tab shows, a 55-row table.
   `node tools/stress/country-check.mjs <outDir>` writes `country-check.json` with WB n/16, ports,
   airports, gateway, rail km / standard-gauge km, food market/date/camp, and what the outline
   filter drops. Do it after step 2 so food prices are real.
5. **News supply**: Djibouti and Western Sahara have not filed since 6 Sep (feeds exist; the desk
   drops candidates in fetch/clustering gates; read the desk log, do not lower
   `-MinEvidenceWords`). Ghana lacks strong domestic feeds (3News works:
   `https://3news.com/feed.xml`). Off-country items are now dropped by the writer; fixing them
   upstream in `scripts/news-ranking.ps1` / `fetch-news.ps1` would save the model calls.
6. Optional: per-country RSS (`/<cc>/feed.xml`) for readers following one country. Note that
   Chrome is removing XSLT, so `feed.xsl` will eventually stop styling the feed there (it degrades
   to raw XML, as before).
7. Minor: Hargeisa's dot sits under the Egal (HGA) airport diamond; Western Sahara labels tiny
   Lemsid (pop 100) and Dawra (pop 10).

## How the desk writer works now (`scripts/write-briefs.ps1`)

Per assignment, one model call; then in order: item index, lens shape, dek trim, story contract
(3 paragraphs, 70-220 words), every figure grounded in the source, **countryLink** ("none" ->
dropped, reserve candidate used), **house style** (`Get-DraftStyleIssues`: stock phrases not in
the source, restated facts, hedged why). A style failure gets one rewrite with the previous draft
and the exact phrases (`Get-StyleRepairNote`); if the rewrite is no better or fails a fact check,
the best fact-checked draft is published. Lens scores: `Resolve-LensScore` (no floors except
farmers on Agriculture stories; diaspora identity topics 21-40; a reason with may/might/could is
scored 0-20 with the canned "no direct effect" reason). The banned list lives in
`Get-StockPhraseRules` and is injected into the prompt, so prompt and checker cannot drift.
`ASJ_OPENROUTER_URL` exists only for `test-desk-harness.ps1`.

## Ground rules for this repo

- Static vanilla JS site (`index.html`, `app.js`, `styles.css`, `sw.js`); no build step. Build
  scripts are PowerShell and must run on **Windows PowerShell 5.1 and pwsh 7** (no `&&`, `||`,
  `??`, ternary). Known traps: pwsh's `ConvertFrom-Json` turns ISO dates into `[datetime]`
  (use `Get-IsoDay`); `$x = if (...) { @(a) }` unrolls one-item arrays; 5.1 `Invoke-WebRequest`
  `.Content` decodes as Latin-1 (use `-OutFile`); 5.1 does not follow HTTP 308.
- Scripts and workflows must be **ASCII-only** (CI enforces it).
- **Never commit pages built locally** (`<cc>/index.html`, story pages, `about/` etc.,
  `countries/`, sitemaps, `feed.xml`). The nightly desk (`update-news.yml` ->
  `scripts/build-static-pages.ps1`) rebuilds them; change the generator instead.
- **`data/app-data.js` is the source for `data/app-core.js`** and the country chunks
  (`scripts/split-app-data.ps1`). Never hand-edit `app-core.js`; it will be reverted on the next
  split (that is how the map-v2 landing map was lost and restored this session).
- `#cv-panel-signals` in `styles.css` has blanket `!important` rules matching class fragments
  (`-cell`, `-card`, `-chart`). New Signals classes can be silently styled away.
- Bump the asset version (three places) when shipping front-end changes.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## How to verify

- PowerShell tests (all must pass; the desk runs the first five before writing):
  `scripts/test-news-ranking.ps1`, `test-story-contract.ps1`, `test-article-evidence.ps1`,
  `test-publication-gate.ps1`, `test-static-pages.ps1 -UnitOnly`, plus `test-food-basket.ps1`,
  `test-desk-harness.ps1`, `check-workflows.ps1`, `validate-briefs.ps1`.
- Browser: `?selftest=1` on the site (78 checks; result in `window.__selftest`);
  `node tools/stress/site-check.mjs` (what CI runs); `node tools/stress/country-check.mjs <outDir>`
  (every country, every Signals set and the Atlas, phone-width screenshots).
  Both need Playwright (`npm i playwright` somewhere, then `NODE_PATH=<that>/node_modules`).

## Cloud-session limits (why some things were not done there)

The cloud sandbox could reach only GitHub and package registries: HDX/WFP, World Bank,
GeoNames, OurAirports, Overpass, FAOSTAT, OpenRouter and the live site were blocked, workflow
dispatch was refused, and CI log downloads were blocked. Data builds, model tests and workflow
runs belong on the desktop or in the workflows.
