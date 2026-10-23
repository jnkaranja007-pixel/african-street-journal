# Handoff: The African Street Journal (after the 23 Oct 2026 desktop session)

Site: africanstreetjournal.com. Repo: `jnkaranja007-pixel/african-street-journal`.
GitHub Pages serves `main`, so **whatever is on `main` is live**.

## Where things stand

- Everything is **pushed and live**. `main` is at `307f52da` plus this handoff commit. Nothing is
  left uncommitted on the desktop. To start: `git checkout main && git pull`.
- CI (`check.yml`) for `307f52da` was queued when this was written. Check it first:
  `gh run list -L 4`.
- The owner pushes to `main` only after saying yes. **Ask before every push.**
- Owner's goal: **98-100% confidence that what a reader sees for any country is correct.**
  The method: check every figure against a second, independent source, then fix it, hide it,
  or label it plainly. The "Confidence work" section below shows what is done and what is left.

## What shipped (newest first)

| Commit | What |
|---|---|
| (this push) | **Real relief and a Roads layer in the Atlas (cloud, 23 Oct).** The made-up "stylized relief" (noise hills and contours) is gone. Each country's Atlas draws real shaded relief from Natural Earth (`data/relief/<cc>.png`, 55 images, 1.4 MB in all, ~1-70 KB each, built by `scripts/build-country-relief.ps1`) and Natural Earth main roads (`data/roads/<cc>.json`, 50 files; the five island states have none; built by `scripts/build-country-roads.ps1`). Both are fetched only when the Atlas tab is drawn, never on News or Signals. Data saver keeps roads but skips the relief image (plain green). Country chunks carry only the image bounds and road lengths (`countryGis[cc].relief`, `.roads`). New "Roads" layer pill and legend entry. Asset version 81. |
| `d8f77c3f` | **Reader and engineering batch (desktop, 23 Oct).** Readers: each World Bank figure shows the Africa median (`africaMedian()`; not for dollar totals); every country's figures end with "How we check these figures" (new `/methods/` page, opened in the in-site sheet) and "Report an error" (mailto with the country). Phones: Signals gets a sticky row of section links (`renderSignalsJump`; the Signals header itself is static on phones by design), and the Wire's filters are one row plus the edition (2 -> 3 stories on the first screen; More is a three-dot button; options say "All readers", "All topics", "Latest edition"). Data saver: no Playfair font, and the Wire shows country codes instead of 55 flags. Engineering: the self-test moved to `selftest.js`, loaded only with `?selftest=1` (app.js -32 KB), and its cold-load race is fixed (it waits for the prose). `country-facts.js` 137 KB -> 34 KB: ports, airports, cities, food and crop months are in `data/facts/<cc>.js`, loaded with the country (workflows commit `data/facts`). New `scripts/check-data-health.ps1` + `data-health.yml`: daily freshness, monthly second-source audit; problems open or update one "Data health" issue. Desk: big foreign cities and countries mark a story external at ranking, so it needs a second outlet before a model call (Paris v Barcelona on the Burundi desk). Cities take the capital from `COUNTRY_INFO`. Sierra Leone's freight railway is explained (`RAIL_NOTES`). `tools/afx-relay` (optional) lets GitHub fetch listings without the PC. Self-test 93 checks. Asset version 80. |
| `8e95a97a` | **Farm exports and crop calendar from FAO (desktop, 23 Oct).** Main farm exports come from FAOSTAT with their value (`scripts/build-farm-exports.ps1`); the hand-made `FARM_EXPORTS` list is gone. Season months come from the FAO Crop Calendar where FAO lists the crop (`scripts/build-crop-calendar.ps1`), with typical months labelled as such. Rail: Algeria's duplicate line merged; Morocco's LGV shown once. Renamed towns use their current names. Self-test 89 checks. Asset version 79. |
| `307f52da` | **Second-source checks (desktop, 23 Oct).** Rail is now route length (OSM counted each track of a double line: Algeria 6,606 -> 5,130 km, Morocco 3,314 -> 1,953), with the CIA World Factbook total shown beside it. Libya, Chad and Niger say "no railway in service". City populations are the median of Natural Earth, GeoNames and Wikidata (fixes Juba 112k, Benoni 2.99M, Kakamega's county figure; drops single-source entries such as Iran's Arak placed in Algeria). World Bank figures more than 7 years old show "last reported <year>". Landmarks were checked against Wikidata, OSM water and drawn river vertices. Lake Chad is now shown only in Chad and Cameroon; Niger and Nigeria get the Niger River; Ethiopia gets Lake Tana. Build-script sorts give the same order on PS 5.1 and pwsh. Six new self-tests (87 total). Asset version 78. |
| `10a00a28` | **News on the landing screen** (cloud, 23 Oct): a "Top story" card under the map on phones and tablets; a column beside the map at 1080px+. `renderHomeFront` in app.js. |
| `76e05017` | **Reader speed + data saver** (cloud): deep links skip the map animation (blocking time 2.4 -> 1.1 s); in Save-Data or 3G mode `briefs-full.js` (146 KB) is not downloaded; fixed a tab freeze. |
| `f1eabfda` | **55-country audit (desktop, 22 Oct):** per-country landmark points (42 landmarks, all 55 countries); main seaports from a checked list (Luanda, Tema, Maputo, Matadi, Durban...); the capital is always listed among the largest cities; impossible WB values hidden (`FACT_LIMITS`). |
| `344051eb` | Food: Algeria's Sahrawi camps (WFP spells "Laayoun") are camps; a camp-only country shows a warning; Sierra Leone SLL -> SLE; markets priced in the national currency preferred (Somalia); a market needs 2+ foods. |
| `d75605e0`, `5faa7551` | Exchange listings refresh from the **owner's PC** (AFX blocks GitHub runners): `scripts/refresh-markets-desktop.ps1`, run by the Windows scheduled task "ASJ markets refresh" (daily 18:30, from the worktree `C:\Users\karan\Documents\James Code\asj-markets-refresh`). Log: `%LOCALAPPDATA%\ASJ\markets-refresh.log`. |
| `836eae90` | Desk writer harness (`scripts/write-briefs.ps1`, prompt `story-v14`). See "How the desk writer works". |

Asset version is now **81** (`?v=` in `index.html`, `window.ASJ_ASSET_VERSION`, `const V` in
`sw.js`). `static-pages.css?v=69` is set inside `scripts/build-static-pages.ps1`.

## Do first (in order)

0. **Desktop: throw away the local relief work.** The desktop built its own relief script and
   images before it ran out of credits and never pushed them. The cloud version is on `main`
   now. On the PC: `git status`; delete any untracked `scripts/build-country-relief.ps1`,
   `data/relief/` or `data/country-relief.json` (or `git stash -u`), then `git pull`.
1. **CI for the latest push** (`gh run list -L 4`). The self-test's cold-load race is fixed (it
   waits for the prose before checking it).
2. **The first desk run on the new writer** has not happened yet (no `update-news.yml` run since
   22 Oct 08:54 UTC; GitHub's schedule is running hours late).
   `gh run list --workflow update-news.yml -L 3`, then `gh run view <id> --log | Select-String '\[write\]'`.
   Look for `[write] style: N rewrite(s), N fixed, N kept with notes; N off-country story(ies)
   dropped; N speculative lens score(s) capped` (also in `data/desk-run-metrics.json`).
   Re-measure against the 22 Oct baseline: stock phrases 68 of 231 stories; investors lens >= 41:
   157/231 (expect <= 25%); diaspora >= 41: 55 (expect ~5-10%); off-country ~7 (Namibia: Lisbon,
   Yemen; Burundi: Paris v Barcelona; Sao Tome: Lisbon). If it looks wrong: `git revert 836eae90`.
3. **Listings task first run**: 23 Oct 18:30 local. Check `%LOCALAPPDATA%\ASJ\markets-refresh.log`
   and for a commit "chore(markets): refresh exchange listings from desktop". The task has never
   run yet (`Get-ScheduledTaskInfo -TaskName 'ASJ markets refresh'`).
4. **Static pages after the desk run**: the About page has the new copy, `/countries/` is titled
   "Text-only edition", `feed.xml` starts with `<?xml-stylesheet ... /feed.xsl?>`.

## Confidence work (owner's 98% target): done, and what is left

### Current honest confidence, by area

| Area | Now | What it rests on / what would raise it |
|---|---|---|
| Borders and placement | 95% | 55 capitals match; every port, airport and landmark is tested inside its own country. Somaliland is in Somalia; Western Sahara is separate. |
| World Bank figures | 95% | Official, year shown, nothing older than 7 years shown as current (`FACT_MAX_AGE`). |
| Landmarks | 95% | Peaks, falls and parks within ~2 km of Wikidata (Mount Kenya and Bintumani differ only because Wikidata rounds); lakes inside OSM/Natural Earth water; rivers on drawn vertices. |
| Airports | 90% | Main gateways from a checked list (`$GATEWAYS`), OurAirports scheduled service. |
| Seaports | 90% | NGA World Port Index; main port per country from a checked list (`$MAIN_PORTS`). |
| Railways | 90% | OSM route length beside the Factbook total. The gap is mostly disused track (Kenya 1,886 vs 3,819). OSM's "in use" tagging varies by country. |
| City populations | 85-90% | Median of 3 sources, 2 required. "City" means city proper in some sources and metro in others, so Tunis shows 693k (city) while Cairo shows 9.8M; Kumasi ranks above Accra. |
| Food prices | 75% | WFP; ~38 countries current; Kenya and Uganda only have camp markets (flagged). |
| Listings | 70% | Depends on the owner's PC being on at 18:30. |
| News | 70% | Off-country stories and the Djibouti / Western Sahara supply gap (since 6 Sep). |
| Crop lists and calendar | 90% | **Done 23 Oct (desktop):** exports from FAOSTAT with their dollar value; months from the FAO Crop Calendar where FAO lists the crop for that country, and "typical months" (labelled as such) for tea, cocoa, livestock and the rest. |

### A. Data jobs

**A1-A3 are DONE (desktop, 23 Oct, second push).** What was built:
- `scripts/build-farm-exports.ps1` -> `data/farm-exports.json` (FAOSTAT bulk trade file; rules
  below). The hand-made `FARM_EXPORTS` constant is gone; `farmExportsForCountry()` reads
  `facts.farm.items`, and the Signals row shows each item's value plus a FAOSTAT source line.
  Countries with no list show a note instead.
- `scripts/build-crop-calendar.ps1` -> `data/crop-calendar.json` (FAO Crop Calendar, 39
  countries; Lesotho's request returned 503, but its exports are wool and mohair, so nothing is
  lost). `build-country-facts.ps1` attaches `facts.cropCal` for each country's export labels.
  `seasonSpecForCountry()` uses FAO months when present (`source: 'FAO'`) and otherwise
  `CROP_SEASONS` (`source: 'typical'`). The calendar legend and the country-file tag say which.
- Rail: Algeria's duplicate line is merged (an untagged way takes the line's only gauge). A line
  whose tracks carry the same words in a different order is one line (Morocco's LGV
  "Tanger - Kenitra" / "Kenitra-Tanger").
- Cities: renamed towns get their current name (`$NAME_NOW` in
  `build-city-populations.ps1`: Adama, Musanze, Baidoa, Mutsamudu, Ali Sabieh, Tadjourah,
  Mekelle).
- All of these are run by hand (desktop) and checked in. CI's monthly `build-country-facts.ps1`
  reads the JSON files, so it keeps them.

For reference, the list A1 produced, with the rules it used:

**A1 (done). FAOSTAT farm exports.** This list was computed from FAOSTAT
"Trade: crops and livestock products" (bulk file `Trade_CropsLivestock_E_Africa.zip` from
`https://bulks-faostat.fao.org/production/`, 12 MB, CC BY 4.0). Export value is the 2022-24
average. Rules used: the country must be a net exporter of the item (so Kenya's palm oil and
Djibouti's sugar, which are re-exports, are dropped); at least $2M; at least 10% of the
country's top item; at most 3 items. FAOSTAT items were mapped to labels, and processed goods
were excluded (flour, bran, beer, cigarettes, food preparations, refined sugar made from imported
cane). Cut flowers are FAOSTAT's "crude organic material n.e.c."; that mapping is used for Kenya
and Ethiopia only. The generic "Nuts" label was dropped (Gambia showed Brazil nuts). Paste this
list in place of the current one:

```
so ['Sheep and goats','Camels','Cattle']   ug ['Coffee','Cocoa']            ke ['Tea','Cut flowers','Coffee']
tz ['Tobacco','Cashew','Rice']             et ['Coffee','Cut flowers','Sesame']
ci ['Cocoa','Rubber','Cashew']             gh ['Cocoa','Cashew']            sn ['Groundnuts','Cashew','Melons']
ng ['Cocoa','Sesame','Soya']               ma ['Tomatoes','Berries','Citrus'] za ['Citrus','Maize','Grapes']
eg ['Citrus','Potatoes','Grapes']          dz ['Dates']                     ly ['Dates']
ao ['Banana']                              cd ['Cocoa']                     cg ['Cocoa','Coffee']
ga ['Palm oil','Rubber']                   gq ['Palm oil']                  cf ['Cattle']
rw ['Coffee','Tea']                        sd ['Sheep and goats','Sesame','Groundnuts']
td ['Sesame','Cotton']                     zm ['Tobacco','Soya','Sugar']    zw ['Tobacco']
mz ['Pulses','Tobacco','Sesame']           bw ['Cattle']                    na ['Cattle','Grapes','Sheep and goats']
sz ['Sugar']                               ls ['Wool','Mohair']             cm ['Cocoa','Cotton']
ml ['Cotton','Cattle']                     ne ['Onion','Cattle','Pulses']   mr ['Sheep and goats','Melons','Cotton']
bf ['Cotton','Cashew','Sesame']            gn ['Cocoa','Cashew','Rubber']   gw ['Cashew']
gm ['Groundnuts','Cashew']                 mg ['Vanilla','Cloves','Essential oils']
mw ['Tobacco','Pulses','Tea']              tn ['Olive oil','Dates']         lr ['Rubber','Cocoa','Palm oil']
sl ['Cocoa','Palm oil']                    bi ['Coffee','Tea']              bj ['Cotton','Cashew']
tg ['Soya','Cotton','Cocoa']               st ['Cocoa','Palm oil']          km ['Cloves','Essential oils','Vanilla']
mu ['Sugar']
none: cv, er, sc, ss (FAOSTAT records under $2M a year); dj (FAOSTAT's figures are re-exports
      through the port); eh (FAOSTAT does not report Western Sahara)
```

To do with it:
- Show a note for the "none" countries instead of an empty row.
- Change the row label to "Main farm exports" with a source line "FAOSTAT, export value 2022-24".
- Fish is not in this FAOSTAT domain, so the old "Fish" and "Prawns" entries go away.
- Add `CROP_SEASONS` entries for the new labels: Berries, Melons, Cattle, Sheep and goats, Camels,
  Mohair, Essential oils. Use `kind:'livestock'` for the animals and `kind:'fiber'` for Mohair
  (Lesotho shears in Feb-Mar and Aug-Sep).
- The self-test "CROP_SEASONS covers every export crop" enforces coverage.

**A2 (done). The FAO crop calendar**, used where FAO covers the crop. Source:
`https://api-cropcalendar.apps.fao.org/api/v1/countries/<ISO2>/cropCalendar?language=en`.
- Coverage: 40 of 55 countries. Not covered: ao, bj, bw, bf, cf, km, cg, cd, gm, ly, ng, sc, za, ss, eh.
- The API is slow (~15 s per country).
- Each record has `crop.name`, `aez.name` and `sessions[].early_sowing / later_sowing /
  early_harvest / late_harvest` (month, day), plus `all_year`.
- Map FAO crop names to labels:
  - Corn, sweet -> Maize; Peanut -> Groundnuts; Upland cotton / Cotonnier -> Cotton
  - Bean / Cowpea / Pigeon pea / Chick-pea / Lentil / Pea, dry -> Pulses
  - Potato -> Potatoes; Soybean -> Soya; Onion / Shallot -> Onion; Tomato -> Tomatoes
  - Watermelon / Melon -> Melons; Sugarcane -> Sugar; Coffee; Cashewnut -> Cashew
  - Avocado; Banana; Mandarin -> Citrus
- Take each window's months, wrapping past December, and the union over the agro-ecological
  zones.
- Tobacco is missing for Malawi and Tanzania. Keep `CROP_SEASONS` as the labelled fallback
  ("typical") where FAO has nothing.
- Best home for the data: `scripts/build-country-facts.ps1` as `facts[cc].cropCal`, with "keep
  previous" on failure, like the other sources. Needs desktop network access (the cloud cannot
  reach FAO).

**A3. Small data fixes found on 23 Oct.** Done: Algeria's duplicate rail line, Morocco's LGV
listed twice, and old town names (Adama, Musanze, Baidoa, Mutsamudu, Ali Sabieh, Tadjourah,
Mekelle). Left:
- Rwanda's other towns keep the names the sources use (Gitarama, Gisenyi, Butare). The official
  names are Muhanga, Rubavu and Huye. Check which English sources use before changing them.
- South Africa's Factbook figure (30,400 km, 2021) is probably track length; OSM route length is
  14,234 km. Consider a note.
- Mauritania lists Cotton (FAOSTAT shows $9M; likely transit from Mali). It is what the source
  says, so it stays unless the owner wants a transit rule.
- OSM line names that aren't line names show in rail lists only if 20 km or longer. Sudan shows
  "Railway market cross" (103 km). An exclusion list in `build-country-rail.ps1` would drop it.
- Tanzania's rice calendar is all months: the union of FAO's 7 zones, irrigated ones included.
  It's true, but not useful. Option: use only rain-fed sessions.

**A4. Food markets with the new city list: checked 23 Oct** (full local rebuild). Five picks
moved to the larger town under the cross-checked populations, none to a camp: DR Congo
Lubumbashi -> Mbuji-Mayi, Gambia Farafenni -> Banjul (the capital), Liberia Gbarnga -> Buchanan,
Malawi Karonga -> Mangochi, Niger Maradi -> Zinder. Algeria is still Tindouf, Kenya and Uganda
are still flagged camp-only, and Somalia is Kismayo. Zambia's Kaputa basket (sugar, fish, meat;
no staple) deserves a look.

### B. How the second-source checks were done (reuse them)

- **Rail**: CIA World Factbook via `github.com/factbook/factbook.json` (`africa/<gec>.json`,
  `Transportation.Railways.total.text`). Totals are in `RAIL_FACTBOOK` (app.js). Track with no
  trains (checked on Wikipedia) is in `RAIL_NOT_IN_SERVICE`. Route length comes from the C#
  `AsjRouteMeter` in `scripts/build-country-rail.ps1`: ~300 m cells, and a step within one cell of
  an already-counted line is not counted again.
- **Cities**: `scripts/build-city-populations.ps1` (run by hand a few times a year, not in CI).
  It writes `data/city-populations.json`, which `build-country-facts.ps1` uses for `cities`.
  Wikidata is matched by **English** label only, because French labels name counties by the bare
  name (fr "Kakamega" is Kakamega County). A merged GeoNames district name (Dixinn in Conakry)
  must be at least half the city's size. It prints every city whose sources differ by more than
  2.5x.
- **Landmarks**: Wikidata P625 for point features; OSM Overpass `is_in(lat,lon)` with
  `area[natural=water]` for lakes (the maps.mail.ru endpoint answers best); Natural Earth lake
  polygons and river vertices from the country chunks. Lake Chad's Natural Earth polygon is the
  current open water (14.25-14.77E, 12.87-13.25N).
- **World Bank staleness**: `FACT_MAX_AGE = 7` in app.js; `staleFactYear()` supplies "last reported".

### C. Open problems

1. News: Djibouti and Western Sahara have not filed since 6 Sep (read the desk log; do not lower
   `-MinEvidenceWords`). Ghana lacks strong domestic feeds (3News works: `https://3news.com/feed.xml`).

## Owner actions (optional)

- **Listings without the PC**: deploy `tools/afx-relay` (Cloudflare dashboard; no Node needed),
  then set the repository variable `ASJ_AFX_RELAY`. The steps, including how to tell whether AFX
  also blocks Cloudflare, are in `tools/afx-relay/README.md`. Until then the desktop task does it.
- **The `/methods/` page** is built by the nightly desk (`build-static-pages.ps1`; committed by
  `publish-edition.ps1`). Until the first desk run after this push, the "How we check these
  figures" link opens a 404.
- **Data health**: a "Data health" issue opens if a source goes stale. The monthly audit runs on
  the 2nd. Either mode can be run by hand: Actions > Data health > Run workflow.

## Next fixes (not started)

Done 23 Oct: data saver part two, Wire on phones, off-country stories at ranking. Left:
1. Map accuracy: rivers are not clipped to the country (Kenya's alt text lists Jubba, Pangani,
   Genale and an unnamed "River"); Western Sahara labels Lemsid (pop 100) and Dawra (pop 10);
   Hargeisa's dot hides under the HGA airport diamond.
2. Per-country RSS (`/<cc>/feed.xml`).
3. The home map animation is choppy on mid-range phones (~100 ms per frame at 4x throttling).
4. `styles.css` (now ~180 KB): trim overrides of retired designs, with before/after screenshots.
   Several later "-v2" blocks override earlier rules; for example, the Signals header was made
   static on phones after an earlier rule made it sticky.
5. The country page on phones: an "At a glance" card at the top of Signals (population, growth,
   main export, main port and airport, food-price trend) would answer most visits without
   scrolling.

Rebuilding the Atlas relief and roads (only needed if the outlines change; both run in seconds):
- Relief: download `https://naturalearth.s3.amazonaws.com/10m_raster/GRAY_HR_SR.zip` (Natural
  Earth gray shaded relief, 1:10m, 21600x10800; 75 MB zip, 233 MB unzipped; naciscdn.org is blocked in the
  cloud), unzip, then `scripts/build-country-relief.ps1 -Tif <path>\GRAY_HR_SR.tif`.
- Roads: download `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson`
  (50 MB), then `scripts/build-country-roads.ps1 -GeoJson <path>`.
- Neither download is committed. Both scripts re-run `split-app-data.ps1` at the end.

Measuring (cloud): Playwright, 4x CPU throttling via CDP, long tasks for blocking time, axe-core
4.10 for WCAG 2.2 AA (0 failures on all 8 screens on 23 Oct).

## Decisions waiting for the owner

1. **Diaspora tab size**: `LENS_RELEVANCE_FLOOR` (>= 41) may leave ~10-20 stories a day. Option:
   include reader-interest stories (21-40).
2. **Frontier model or not**: the desk uses `google/gemini-2.5-flash-lite` (~$2.80/month); a
   frontier model is an estimated $40-170/month (unverified). Repository variable `ASJ_MODEL`.

## How the desk writer works (`scripts/write-briefs.ps1`)

There is one model call per assignment. The checks then run in this order: item index, lens
shape, dek trim, story contract (3 paragraphs, 70-220 words), every figure grounded in the
source, `countryLink` ("none" -> dropped, reserve used), and house style (`Get-DraftStyleIssues`).

A draft that fails the style check gets one rewrite (`Get-StyleRepairNote`). If the rewrite is no
better, the best fact-checked draft is published. Lens scores come from `Resolve-LensScore`. The
banned phrases live in `Get-StockPhraseRules` and are injected into the prompt.

## Ground rules for this repo

- Static vanilla JS (`index.html`, `app.js`, `styles.css`, `sw.js`); no build step.
- Build scripts are PowerShell and must run on **Windows PowerShell 5.1 and pwsh 7**:
  - Don't use `&&`, `||`, `??` or the ternary operator.
  - pwsh's `ConvertFrom-Json` turns ISO dates into `[datetime]`; use `Get-IsoDay`.
  - `$x = if (...) { @(a) }` unrolls one-item arrays.
  - In 5.1, `Invoke-WebRequest .Content` decodes as Latin-1; use `-OutFile`.
  - 5.1 does not follow HTTP 308.
  - **Sort-Object orders ties and apostrophes differently**; tie-break with `Get-SortKey`
    (in `scripts/food-basket.ps1`).
- Scripts and workflows must be **ASCII-only** (CI enforces it).
- **Never commit pages built locally** (`<cc>/index.html`, story pages, `about/`, `countries/`,
  sitemaps, `feed.xml`).
- **`data/app-data.js` is the source for `data/app-core.js`** and the country chunks
  (`scripts/split-app-data.ps1`). Never hand-edit `app-core.js`. Rail is attached from
  `data/country-rail.json` at split time.
- `#cv-panel-signals` has blanket `!important` rules matching class fragments (`-cell`, `-card`,
  `-note`, `-chart`...), so new Signals classes can be silently styled away.
- Bump the asset version (three places) when shipping front-end changes.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## How to verify

- PowerShell tests: `scripts/test-news-ranking.ps1`, `test-story-contract.ps1`,
  `test-article-evidence.ps1`, `test-publication-gate.ps1`, `test-static-pages.ps1 -UnitOnly`,
  `test-food-basket.ps1` (21 checks), `test-desk-harness.ps1`, `check-workflows.ps1`,
  `validate-briefs.ps1`.
- Browser: `?selftest=1` (93 checks, from `selftest.js`; the result is in `window.__selftest`).
- Data: `scripts/check-data-health.ps1 -Mode Daily` (files only) and `-Mode Monthly`
  (Factbook and Wikidata cross-checks).
- `node tools/stress/site-check.mjs` (what CI runs) and `node tools/stress/country-check.mjs <outDir>`
  both need Playwright. The desktop has no Node, so those run in CI or the cloud.
- Desktop preview: `.claude/launch.json` in `C:\Users\karan\Documents\James Code` starts
  `united-africa/serve.ps1` on port 8733.

## Cloud-session limits

The cloud sandbox reaches GitHub and package registries only. These are blocked there:
HDX/WFP, World Bank, GeoNames, OurAirports, Overpass, FAOSTAT, the FAO crop calendar, Wikidata,
OpenRouter and the live site. Workflow dispatch is refused and CI logs can't be downloaded.

Data rebuilds (food, rail, cities, farm exports, crop calendar) need the desktop. The owner
prefers heavy work on the desktop.
