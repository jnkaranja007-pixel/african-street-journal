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
| `307f52da` | **Second-source checks (desktop, 23 Oct).** Rail is now route length (OSM counted each track of a double line: Algeria 6,606 -> 5,130 km, Morocco 3,314 -> 1,953), with the CIA World Factbook total shown beside it. Libya, Chad and Niger say "no railway in service". City populations are the median of Natural Earth, GeoNames and Wikidata (fixes Juba 112k, Benoni 2.99M, Kakamega's county figure; drops single-source entries such as Iran's Arak placed in Algeria). World Bank figures more than 7 years old show "last reported <year>". Landmarks were checked against Wikidata, OSM water and drawn river vertices. Lake Chad is now shown only in Chad and Cameroon; Niger and Nigeria get the Niger River; Ethiopia gets Lake Tana. Build-script sorts give the same order on PS 5.1 and pwsh. Six new self-tests (87 total). Asset version 78. |
| `10a00a28` | **News on the landing screen** (cloud, 23 Oct): a "Top story" card under the map on phones and tablets; a column beside the map at 1080px+. `renderHomeFront` in app.js. |
| `76e05017` | **Reader speed + data saver** (cloud): deep links skip the map animation (blocking time 2.4 -> 1.1 s); in Save-Data or 3G mode `briefs-full.js` (146 KB) is not downloaded; fixed a tab freeze. |
| `f1eabfda` | **55-country audit (desktop, 22 Oct):** per-country landmark points (42 landmarks, all 55 countries); main seaports from a checked list (Luanda, Tema, Maputo, Matadi, Durban...); the capital is always listed among the largest cities; impossible WB values hidden (`FACT_LIMITS`). |
| `344051eb` | Food: Algeria's Sahrawi camps (WFP spells "Laayoun") are camps; a camp-only country shows a warning; Sierra Leone SLL -> SLE; markets priced in the national currency preferred (Somalia); a market needs 2+ foods. |
| `d75605e0`, `5faa7551` | Exchange listings refresh from the **owner's PC** (AFX blocks GitHub runners): `scripts/refresh-markets-desktop.ps1`, run by the Windows scheduled task "ASJ markets refresh" (daily 18:30, from the worktree `C:\Users\karan\Documents\James Code\asj-markets-refresh`). Log: `%LOCALAPPDATA%\ASJ\markets-refresh.log`. |
| `836eae90` | Desk writer harness (`scripts/write-briefs.ps1`, prompt `story-v14`). See "How the desk writer works". |

Asset version is now **78** (`?v=` in `index.html`, `window.ASJ_ASSET_VERSION`, `const V` in
`sw.js`). `static-pages.css?v=69` is set inside `scripts/build-static-pages.ps1`.

## Do first (in order)

1. **CI for `307f52da`.** If `site-check` fails on "payload: every story has prose after
   hydration", see open item C1 below. Locally that check fails only on the first `?selftest=1`
   load (0/231) and passes on a rerun (`await runSelfTest()`).
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
| Crop lists and calendar | 60% | **Next job**: see A1-A2. |

### A. Next jobs, in order

**A1. Replace `FARM_EXPORTS` (app.js) with FAOSTAT.** This list is already computed from FAOSTAT
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

**A2. Replace the generic crop calendar with FAO's** where FAO covers the crop. Source:
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

**A3. Small data fixes found on 23 Oct:**
- Algeria's rail list shows "Ligne de Bechar a Gara Djebilet" twice (514 km with no gauge tag,
  415 km standard). In `scripts/build-country-rail.ps1`, merge a no-gauge group into a same-name
  group that has a gauge.
- Old town names in the city list: Nazret (now Adama), Ruhengeri (Musanze), Gitarama (Muhanga),
  Gisenyi (Rubavu), Butare (Huye), Baydhabo (Baidoa), Moutsamoudou (Mutsamudu), Ali Sabih
  (Ali Sabieh). Add an alias map in `scripts/build-city-populations.ps1`.
- South Africa's Factbook figure (30,400 km, 2021) is probably track length; OSM route length is
  14,234 km. Consider a note.
- Mauritania lists Cotton (FAOSTAT shows $9M; likely transit from Mali). Decide whether to keep it.

**A4. Food markets after the next monthly run (10 Nov).** The basket's city matching now uses
the new city list. Check that Algeria is still Tindouf, Kenya is still flagged as camp-only, and
Somalia picks a Somali-shilling market. Today's picks: Kenya IFO (Dadaab, flagged), Uganda
Imvepi (flagged), Ethiopia Jijiga, Somalia Kismayo, Zambia Kaputa (sugar, fish, meat; no
staple). Zambia's pick deserves a look.

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

1. On a cold local load, the self-test "payload: every story has prose after hydration" reports
   0/231 and passes on a rerun. It is a race between the self-test and story hydration, and it
   happened before the cloud's data-saver change too. If CI flakes on it, have the check wait for
   hydration.
2. News: Djibouti and Western Sahara have not filed since 6 Sep (read the desk log; do not lower
   `-MinEvidenceWords`). Ghana lacks strong domestic feeds (3News works: `https://3news.com/feed.xml`).

## Next fixes from the cloud session (not started)

1. Data saver part two: in `ASJ_SAVE_DATA` mode also skip Playfair Display (~60-90 KB) and the
   Wire's flagcdn images (~55 x 2 KB).
2. Wire on phones: the filters take ~300 px before the first story. Compact them so 3-4 stories show.
3. Map accuracy: rivers are not clipped to the country (Kenya's alt text lists Jubba, Pangani,
   Genale and an unnamed "River"); Western Sahara labels Lemsid (pop 100) and Dawra (pop 10);
   Hargeisa's dot hides under the HGA airport diamond.
4. Off-country stories: catch them at ranking (`scripts/news-ranking.ps1`) before the model call.
5. Per-country RSS (`/<cc>/feed.xml`).
6. The home map animation is choppy on mid-range phones (~100 ms per frame at 4x throttling).
7. `styles.css` (177 KB): trim overrides of retired designs, with before/after screenshots.

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
- Browser: `?selftest=1` (87 checks; the result is in `window.__selftest`; run
  `await runSelfTest()` again if the hydration check fails on a cold load).
- `node tools/stress/site-check.mjs` (what CI runs) and `node tools/stress/country-check.mjs <outDir>`
  both need Playwright. The desktop has no Node, so those run in CI or the cloud.
- Desktop preview: `.claude/launch.json` in `C:\Users\karan\Documents\James Code` starts
  `united-africa/serve.ps1` on port 8733.

## Cloud-session limits

The cloud sandbox reaches GitHub and package registries only. These are blocked there:
HDX/WFP, World Bank, GeoNames, OurAirports, Overpass, FAOSTAT, the FAO crop calendar, Wikidata,
OpenRouter and the live site. Workflow dispatch is refused and CI logs can't be downloaded.

The cloud can do A1 with the list above (no network needed). A2, A4 and the city or rail rebuilds
need the desktop.
