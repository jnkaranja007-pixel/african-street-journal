# Handoff: make Signals and Atlas real and equal for all 55 countries

You are picking up work on **The African Street Journal** (africanstreetjournal.com), a static
news site for all 55 African countries. Repo: `jnkaranja007-pixel/african-street-journal`.
**Work on branch `signals-atlas-real-data`.** Do not merge to `main` until the checks in
"Before merging" pass, and confirm with the owner before merging.

## What the owner asked for (their words)

- "all countries are not equal on the signal and atlas - some are missing information etc
  etc and things need to be all equal. I want citizens to feel like this is not ai slop"
- "research all 55 countries thoroughly for what we are looking for and then decide on how
  we can illustrate everything on our signal and atlas"
- "also I know berbera is in somaliland but we should have it a part of somalia until it
  becomes a country"
- "even kenya is missing jomo kenyatta airport and standard gauge railway from Nairobi to
  Mombasa. Idk if I trust your audit" - so verify what you claim, visually and per country.
- Also: find better news sources per country so stories are better.

## Ground rules for this repo

- Static vanilla JS site (`index.html`, `app.js`, `styles.css`, `sw.js`). No build step,
  no Node/Python in the project itself. Build scripts are **PowerShell**.
- Scripts and workflows must be **ASCII-only** (a CI check enforces it).
- Scripts must run on **Windows PowerShell 5.1 and pwsh 7**. Known traps:
  - pwsh's `ConvertFrom-Json` turns ISO date strings into `[datetime]`; 5.1 keeps strings.
    Never treat a date field as a string without normalising (see `Get-IsoDay` in
    `scripts/story-shape.ps1`).
  - `$x = if (...) { @(a) }` unrolls single-item arrays. Assign inside the branch.
  - 5.1 `Invoke-WebRequest` `.Content` decodes as Latin-1 when no charset; use `-OutFile`.
  - 5.1 does not follow HTTP 308 redirects.
- **Never commit country/story pages built locally** (`<cc>/index.html`, sitemaps, feed).
  The nightly desk (`update-news.yml` -> `scripts/publish-edition.ps1`) rebuilds them.
- Bump the asset version together when shipping front-end changes: `?v=` in `index.html`,
  `window.ASJ_ASSET_VERSION`, and `const V` in `sw.js` (currently `69`).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- In the cloud (Linux) install PowerShell first if `pwsh` is missing
  (the apt package may be missing; the GitHub release tarball works:
  `powershell-7.4.6-linux-x64.tar.gz` into /opt/pwsh). Two tests call `powershell` by
  name - symlink it to pwsh. The
  browser self-test needs a browser: CI uses Playwright (`tools/stress/site-check.mjs`);
  otherwise serve the folder (`python3 -m http.server` is fine in the cloud sandbox,
  only the project itself avoids Python) and open `/?selftest=1`, read `window.__selftest`.

## What was wrong (found in the audit)

- Signals was one template filled 55 times. `criticalInfraForCountry` **invented**
  infrastructure when none was on file ("<capital> Inland Freight Desk" dry port, "<capital>
  Air Gateway", "<country> Primary Corridor") - Sao Tome, an island, had a dry port.
- City records in the GIS files carry **generated** tags (`ag_type`, `is_market`,
  `market_type`, `infrastructure`). "Crop belt 100%", "market hubs" and Mombasa-with-no-port
  all came from them.
- "Key Sectors" mapped sector words to stock phrases; "Investor Checklist" was the same
  paragraph per country; a generic "Cereals, Coffee, Horticulture" fallback.
- Borders: Somalia excluded Somaliland; Western Sahara was only the strip east of the berm;
  Morocco covered all of Western Sahara.
- Landmarks/places in the wrong country: Kilimanjaro in Kenya, Mandera (Kenya) in Somalia,
  Laayoune in Morocco, Mayotte's Dzaoudzi as a Comoros port.
- Atlas hid any port/airport within 18px of a city label (JKIA, Mombasa port); no rail
  layer at all; a hand-drawn straight "Great Rift Valley" line.
- Exchange listings scraper (`scripts/update-markets.ps1`) failed silently from 22 Sep:
  AFX's table lost its closing tag; before that it was scraping the Top Gainers box.

## What is done on the branch (uncommitted on main; all in this branch)

- `scripts/build-country-facts.ps1` -> `data/country-facts.js`, same rules for every
  country: World Bank WDI (16 series, latest since 2015, with year), NGA World Port Index
  (oil terminals excluded), OurAirports (scheduled service, safari strips excluded, ordered
  by a checked `$GATEWAYS` list of main international airports), GeoNames cities (suburbs
  within 20 km of a bigger city dropped), WFP food prices via HDX. Run takes ~65 min with
  food prices; `-SkipFoodPrices` for a quick run.
- `scripts/build-country-rail.ps1` -> `data/country-rail.json` from OpenStreetMap Overpass
  (railway=rail, no service=*; gauge kept so standard gauge/SGR draws solid). Adaptive
  simplification keeps chunks small (South Africa 160 KB). Overpass is slow and flaky:
  overpass-api.de and kumi returned 502/504 often; `maps.mail.ru/osm/tools/overpass/api/interpreter`
  worked. The script falls back between endpoints and caches per country (`-CacheDir`).
- `scripts/split-app-data.ps1` now appends each country's rail to its chunk.
- `scripts/set-country-outline.ps1`: replaced `so` (geoBoundaries SOM, includes
  Somaliland), `eh` and `ma` (one geoBoundaries MAR shape split at 27.6667N: south =
  Western Sahara, north = Morocco). ASJ follows the African Union on both.
- `app.js`:
  - New helpers `FACT_DEFS`, `factGridHtml`, `countryPorts`, `countryAirports`,
    `largestCities`, `insideCountry` (point-in-outline test), `atlasPlaces`,
    `atlasInfraForCountry`, `railSummaryHtml`, `foodPricesHtml`.
  - Farmers: farming figures + main exports, Food prices, Largest cities, Ports/airports/rail,
    Season calendar. Investors: Economy, Exchange, Indicators. Diaspora: send money +
    remittances/connection. Header cells use World Bank figures.
  - Removed: invented infra, generated city tags, Key Sectors, Investor Checklist,
    `DIASPORA` table (18 countries only), `CRITICAL_INFRA_SEEDS`, `LANDMARK_LINES`.
  - Atlas: every port/airport marker is drawn; capital label first, then gateway airports
    and main port (fallback to IATA code when the full name does not fit), then towns
    (small dot under each labelled town); rail layer + legend; only points inside the
    country's outline (ports/airports 30 km tolerance, towns 5 km, landmarks 0).
  - Self-test (`/?selftest=1`) was 75/75 before the last data rebuilds, including checks
    for Berbera/Hargeisa in Somalia, Laayoune in Western Sahara not Morocco, no
    Kilimanjaro in Kenya, JKIA + SGR on Kenya's map, no invented infra.
- `data/sources.json`: 22 verified outlets added and 5 revived for gh, ug, cd, ma, dz, tn,
  bw, na, lr, sl, sz, cg, gq, sc (+ Djibouti's ADI re-enabled); Politico.cd removed
  (domain now redirects to a betting site). Edited as text to keep the pwsh JSON format.
- `scripts/update-markets.ps1`: table selection fixed (all 10 AFX exchanges parse again).
  `update-markets.yml`: job now fails when listings are more than 7 days old.
- `update-economy.yml`: also runs `build-country-facts.ps1` monthly.

## Progress in the 22 Oct cloud session

The cloud sandbox could only reach package registries and GitHub: HDX, World Bank,
GeoNames, OurAirports, Overpass, FAOSTAT and the news feeds were all blocked, so no data
build was re-run there. To rebuild data from the cloud, add those hosts under the
environment's Network access, or run the builds locally / via the workflows.

Done (commits on this branch):
- **Food-price picks** (`eeb40d5`): rules moved to `scripts/food-basket.ps1`: market =
  national average > capital > largest GeoNames cities > any town > camp (last resort,
  flagged `camp: true`, page says "refugee camp market"); foods = staples first, one per
  kind, no livestock or food-aid rations. 17 deterministic tests in
  `scripts/test-food-basket.ps1` (in `check.yml`). **`data/country-facts.js` still holds
  the old picks** (IFO, Awserd, ...) until the facts build runs with food prices.
- **55-country browser check** (`2474a07`): `tools/stress/country-check.mjs` opens every
  country's Farmers/Investors/Diaspora and Atlas at 390px, fails on page errors, empty
  sections, "undefined"/"NaN"/"null", or a blank canvas; screenshots ke,so,eh,ma,za,ng,
  st,km,et,eg; lists what the inside-outline filter drops. Result: 55/55 clean.
  Run: `npm i playwright` somewhere, then
  `NODE_PATH=<that>/node_modules PW_CHROMIUM=/opt/pw-browsers/chromium node tools/stress/country-check.mjs <outDir>`.
- Fixes it led to (same commit): Somalia now labels Hargeisa, Burao, Berbera, Borama,
  Erigavo, Las Anod (from Natural Earth's "Somaliland" unit); Western Sahara gets
  Laayoune, Dakhla, Smara back from Morocco's list - `scripts/set-country-places.ps1`.
  The atlas capital now follows `COUNTRY_INFO` (was Bujumbura, Cotonou, Dar es Salaam,
  Cape Town; none for Juba/Laayoune). Labels no longer sit under port/airport diamonds;
  label order capital > 1M+ cities > main port/airports > landmarks > other cities >
  towns, so Cape Town and Mount Kenya are labelled. Self-test now 77/77.
- **Workflow split** (`fab8f9c`): `update-economy.yml` runs facts with
  `-SkipFoodPrices`; new `update-food-rail.yml` (10th monthly) runs WFP food prices then
  OSM rail. Rail script now also tries the mail.ru Overpass mirror.

## What to do next, in order

1. **Rebuild facts with food prices** (needs HDX): locally `pwsh scripts/build-country-facts.ps1`,
   or after merge `gh workflow run update-food-rail.yml`. Then check 10 countries by eye
   (ke, ug, dz, ml, mr, bj, dj, eg, sd, ng): market is a town, basket is staples.
2. **Landmarks are single points**: the outline filter drops shared features from the
   countries they belong to - Egypt loses the Nile, Tanzania/Uganda Lake Victoria,
   Zambia Victoria Falls, Kenya Lake Victoria and "Mombasa"; Sahara/Congo Basin/Lake Chad
   likewise. Give `LANDMARK_POINTS` per-country points (or a list of points) instead
   of one shared point. Kenya's part of Lake Victoria is also not drawn as water.
3. **Rivers are not clipped to the country**: Kenya's atlas description lists Jubba,
   Pangani, Genale and an unnamed "River".
4. **Curated lists**: Kenya's season calendar is Tea / Cut flowers / Coffee - no maize.
   `FARM_EXPORTS` and `CROP_SEASONS` in `app.js` are still hand-made; replace with
   FAOSTAT top crops when its API is up.
5. **Publish an audit report** for the owner (after step 1, so food prices are real):
   what was wrong, sources, what each tab shows, and a 55-row table. `country-check.json`
   from the checker already holds per country: WB n/16, ports, airports, gateway, rail km
   / standard-gauge km, food market/date/camp, and what the outline filter drops.
6. **News supply**: Djibouti and Western Sahara have not filed since 6 Sep. Their feeds
   exist; the desk drops candidates in fetch/clustering gates ("nothing published
   recently", `eligible=0`). Read the desk log of the next run (`gh run view <id> --log`)
   and fix the cause without lowering `-MinEvidenceWords`. Ghana still lacks a strong
   domestic feed set (Citi, GhanaWeb, GNA feeds are off; 3News works at
   `https://3news.com/feed.xml`).
7. **Investors lens**: 68% of fresh stories score >= 41 for investors after the prompt
   fix; likely `Get-LensRelevanceBand` floors in `scripts/write-briefs.ps1`.
8. Minor: the inline "Hargeisa" dot sits under the Egal (HGA) airport diamond (5 km
   apart); Western Sahara labels tiny Lemsid (pop 100) and Dawra (pop 10).

## Before merging to main

- `pwsh scripts/check-workflows.ps1`, and every `scripts/test-*.ps1` pass
  (`test-static-pages.ps1 -UnitOnly`).
- Browser self-test all green (77/77 on 22 Oct); `tools/stress/country-check.mjs` 55/55
  with screenshots looked at.
- Bump asset version to 70 (three places).
- After merge, trigger `gh workflow run update-markets.yml` so listings refresh, and
  `gh workflow run update-food-rail.yml` so food prices use the new market rules.
