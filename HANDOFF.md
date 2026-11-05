# Handoff: The African Street Journal (after the 28 Oct 2026 desktop session)

Site: africanstreetjournal.com. Repo: `jnkaranja007-pixel/african-street-journal`.
GitHub Pages serves `main`, so **whatever is on `main` is live**.

## Where things stand

- After the 28 Oct desktop session: the count-crash fix, the casing fix and the audit batch below
  were committed together; check `git log origin/main` to see whether they were pushed. To start:
  `git checkout main && git pull`.
- CI (`check.yml`) for `307f52da` was queued when this was written. Check it first:
  `gh run list -L 4`.
- The owner pushes to `main` only after saying yes. **Ask before every push.**
- Owner's goal: **98-100% confidence that what a reader sees for any country is correct.**
  The method: check every figure against a second, independent source, then fix it, hide it,
  or label it plainly. The "Confidence work" section below shows what is done and what is left.

## What shipped (newest first)

| Commit | What |
|---|---|
| (this push) | **Desk: a month in a story must come from its source (desktop, 5 Nov).** On 4 Nov "Ebola kills 5,103 in DR Congo" (Angola, `e9308991e0f7255e3d13`) said the figures were "as of March 11, 2026"; Folha 8's report (published 3 Nov) said only "ate a data" (to date). The number check passed it because `Get-ItemEvidenceText` includes the item's publication stamp, and 2026-11-03 (which pwsh renders `11/03/2026 18:36:30`) supplies both the 11 and the 2026; nothing checked "March". `Get-UngroundedMonths` in `write-briefs.ps1` now requires every month a draft names to be in the evidence: by name in English, French, Portuguese or Spanish (accents stripped), in a numeric date (`2026-11-03`; `03/11/2026` read both ways round), or as a source's publication month (through `Get-IsoDay`; the stamps are kept out of the scanned text with `Get-ItemEvidenceText -NoStamps`, whose default output, and so every cache key, is unchanged). March, April, May, June and August count only beside a day, a year or a word like "in" or "since", so "the Women's March", "May Ndlovu" and the verb "may" are not months; abbreviations count only beside a day. Weekdays and relative words are not checked, and a day is not paired with its month ("March 3" passes if the source has March and a 3 anywhere). A failure takes the REPAIR path like an unsupported number; final validation drops a story that still fails. Tests: three groups in `test-story-contract.ps1` (the Ebola case with a real `[datetime]` stamp; the four languages, numeric and publication dates; "may", "ago" and names) and a seventh harness assignment whose first draft invents "March 11, 2026" and whose repaired draft is published (`-MaxBriefs 6`, 12 calls). **Story cache:** the workflow's cache key hashes `write-briefs.ps1`, but `restore-keys` falls back to the newest `asj-story-v1-` cache and the entry keys do not include the script, so this change does *not* empty the cache and the next run does not rewrite every story. Instead, a cache hit is checked again and written afresh if it names an unsupported month. **Dry run** (fresh feed on 5 Nov, matched by URL to 83 of the 246 stories published 4 Nov; 50 of them name a month): 5 flagged. Two were invented, both "April 11, 2026" (a Folha 8 column on insult laws "detailed on April 11"; an EU visit ADI dated "4 novembre 2026"). Three are true dates from a second outlet that the 5 Nov feed did not carry (Tanzania's inquiry findings April 23, a Liberian arrest in January 2026, the Dakar Youth Olympics from 31 October), so whether the 4 Nov packets held them is unknown. Expect a few repair calls a day. |
| (this push) | **Atlas relief no longer jumps or flashes soft (desktop, 5 Nov).** The 320px previews (`<cc>-s.jpg`) were resampled by GDI+ with its default PixelOffsetMode, which samples from pixel corners: Djibouti's preview sat 0.375 of its own pixels off on both axes, so the terrain moved 1-2px up-left when the full image replaced it. `Write-ReliefPreview` (`scripts/build-country-relief.ps1`) uses PixelOffsetMode.HighQuality and TileFlipXY edges; all 55 previews rebuilt with `-PreviewsOnly` (Djibouti, Kenya, Rwanda within 0.125px, measured against an exact area-average of the full image). `RELIEF_FULL_GRACE_MS` (150 ms): the Atlas waits that long for the full image before settling for the preview, so from the HTTP or service-worker cache the first paint is the full image (Djibouti and Chad checked); a first visit still shows the preview while the full image downloads. |
| (this push) | **GDP chart readout (desktop, 5 Nov).** The hover tip was SVG text inside a chart stretched with `preserveAspectRatio="none"` (~7px type, shown only on a dot's hit circle, dots squashed into ovals on phones). Dots, guide line, marker and readout are now HTML over the SVG (`bindGdpChart`): hover, drag or arrow keys anywhere on the plot pick the nearest year; the readout shows the year, the figure at 30px (`formatGdpReadout`) and the change on the year before, beside the guide. On touch it stays until a tap elsewhere; `touch-action: pan-y` keeps scrolling. Gridlines fall on round figures (`gdpTicks`: 1, 2, 2.5 or 5 x 10^n, 3-5 intervals, least empty band); all 53 series give distinct tick labels. Gradient fill, header labels 8px to 12px. |
| (this push) | **`styles.css` trimmed 18% (desktop, 5 Nov).** 191,545 to 156,392 bytes by two mechanical passes: (1) 134 declarations that a later one always overrides (same selector and property, same @media/@supports block or a later top-level rule, at least as important; a later value with svh, clamp(), color-mix() and the like never counts, so fallbacks stay); (2) 282 rules no selector of which can match, because a class or ID appears in no file in the repo (3,351 files, built pages included), not even as a hyphen-cut piece ("cv-panel-" + id). They were retired designs: story detail modal, animated headline reader, card carousel and story rail, the Wire's lens and topic chips, the mobile home front, sector and diaspora fact cards. Verified by computing every element's style (and ::before/::after) under both files in the same page: 0 differences on home, News, Signals, Diaspora and the Wire at 375, 732 and 1280 px; self-test 103/103. Only `index.html` loads `styles.css`; built pages use `static-pages.css`. |
| (this push) | **Home map draw-in cheaper (desktop, 5 Nov).** The landing canvas was 1000 map units at the screen's pixel ratio whatever its size on screen; a ratio-3 phone painted 3000x3003 pixels for a map shown ~490px wide. `fitMapResolution` sizes the backing store and its layers to the canvas's on-screen width (quarter steps, never above the screen ratio or below 1; refitted on resize via `layoutHomeMap`), so desktop at ratio 1 is unchanged; `HAIR` still follows the screen ratio, so borders look the same. The 3.5 s draw-in blits per-country sprites (`paintAssemblySprites`, dropped when the map settles) instead of filling and stroking 55 coastlines a frame; the last draw-in frame matches the path-drawn one to 0.004/255. In the app's browser pane at phone size: 114-140 ms a forced frame before, 28-33 ms after. Not yet measured on a real phone. |
| (this push) | **Atlas labels (desktop, 5 Nov).** Places under 200 people (Natural Earth's 10/100 placeholders) are labelled only zoomed in, after the towns; the towns now fill whatever label budget is left at every zoom, which reaches only sparse maps (Western Sahara gains Boujdour and El Marsa instead of Lemsid and Dawra; Gambia Nema Kunku and Farafenni). A city's dot under a port/airport diamond is redrawn on top, ringed (Hargeisa under HGA). Rivers needed nothing: the map clips them to the country and the text alternative already keeps only water within 15 km. |
| (this push) | **Signals: "At a glance" card on phones (desktop, 5 Nov, v101).** Six cells under the section row (`renderGlance`): GDP growth, inflation, top farm export, food prices (median change on a year across WFP foods, else the latest price; camp markets named), main seaport (or Landlocked), main airport. Each switches audience if needed and lands its section under the sticky row (`scrollSignalsTo`, shared with the section row). Hidden above 720px. All 55 countries checked. |
| (this push) | **Desk: stories about another country are dropped, and their old pages withdrawn (desktop, 4 Nov).** One place matcher (`Get-NewsPlaceHits`, `news-ranking.ps1`: accent-folded, longest match first, own terms beat foreign) now serves ranking, the writer (`Get-StoryPlaceIssue` after drafting), the audit (OFF-COUNTRY is critical, so the story is dropped) and `build-static-pages.ps1` (pages failing it are deleted, logged as "withdrawn as off-country"). A story fails when its headline or dek names another country, African capital or outside place and none of headline, dek or first paragraph names its own (towns of 100k+ count). On 4 Nov it flagged 7 stories in the edition (Angola "Ebola kills 5,103 in DR Congo", Burkina Faso "Algeria sends troops to Niger", ...) and 48 old pages. **The story cache key hashes `write-briefs.ps1` and `news-ranking.ps1`, so the first run after this push rewrites every story.** |
| (this push) | **Atlas: more towns when zoomed in; neighbouring land blanked from every relief image (desktop, 4 Nov).** (1) `scripts/build-atlas-towns.ps1` takes Natural Earth populated places (10m) and GeoNames `cities15000` (CC BY 4.0), assigns them by country (Somaliland to `so`, Morocco south of 27.67N to `eh`), drops GeoNames PPLX/PPLH and "Estate" names, de-duplicates (same name, within 8 km, or one name inside the other within 25 km) and keeps the 120 largest per country: `data/country-towns.json`, 2,205 towns in 52 countries (149 KB). `split-app-data.ps1` attaches them as `countryGis[cc].towns`, like rail and roads, so every chunk changed. `app.js` draws them only when `atlasView.k > 1`, after the existing places, filtered to the outline (`atlasTowns`, cached per country); the minor-label budget is 14 at 1x and 22 zoomed, and the locator and zoom buttons (`reserved: true`) no longer count against it (`labelCount()`), so the 1x map is unchanged. (2) `build-country-relief.ps1` masks every image, not only the Equatorial Guinea focus: it renders a lossless PNG, paints everything outside the outline (nonzero fill, widened 8 px) one flat colour, then encodes a single JPEG. All 113 relief files rebuilt, folder 12.43 MB to 6.91 MB (Rwanda 546 to 168 KB, Lesotho 520 to 196 KB); `index.json` unchanged. Credits on About and the Places pill. Asset version 100. |
| `03f133e6` | **Atlas zoom and pan; relief memory cap; sharper Equatorial Guinea (desktop, 3 Nov).** (1) Zoom: pinch, Ctrl + scroll (a trackpad pinch arrives as one), plain scroll in fullscreen, double-click / double-tap (Shift + double-click out), and + / - / reset buttons under the fullscreen button (`atlasView`: k up to `ATLAS_MAX_ZOOM` 5, pan `ux`/`uy` as fractions of the canvas, so it survives resize and fullscreen; every country opens at 1x). Drag pans once zoomed; at 1x a finger still scrolls the page (`touch-action: pan-x pan-y`, `none` when zoomed). During a gesture each frame redraws a copy of the last full draw moved and scaled (`beginAtlasGesture` / `previewAtlasGesture`), the full draw follows on release: a pinch on South Africa runs at 16.7 ms a frame against 39 ms (p90 72) redrawing every frame. The locator inset now boxes the area on screen and shows whenever part of the country is off it (zoomed, or an island crop); labels avoid the buttons over the map; a capital zoomed off the map loses its pinned label. Touch screens hide + and - (pinch / double-tap), keeping reset. (2) `trimReliefImages`: at most 6 full relief images and 24 previews held (about 8 MB each decoded for a full one); paging all 55 used to keep 112. Never the map on screen or an image still loading. (3) `data/relief/gq-focus.jpg` (Bioko + Rio Muni, 267 m pixels against the country image's 535): `build-country-relief.ps1` now builds a crop image wherever the crop is under 3/4 of the country's extent, at least twice as fine as the country image, and paints its off-country pixels flat (`Set-ReliefMask`): 570 KB to 155 KB. `drawReliefFocus` measures stretch in device pixels, so the 2-3x embedded map uses the crop image too. gq.jpg / gq-s.jpg rebuilt byte-identical. Stress: 55 countries at 1x and 4x, 56 Next with zooms, 0 errors; self-test 103/103. Assets v99. |
| `7dd05364` | **Atlas: small island countries readable without fullscreen; fewer draws; maps cached (desktop, 3 Nov).** (1) The embedded and phone Atlas framed Seychelles, Mauritius and Equatorial Guinea by their full extent (outer islands, Annobon), so the inhabited island was a speck: Seychelles drew 0% land on desktop, SEZ and Victoria unreadable until fullscreen. They now use the island crop in every view (`atlasUsesIslandFocus`; Cabo Verde, Sao Tome and Comoros keep their own outline off fullscreen, their crop is wider than the islands) and a `Whole country` locator inset (`atlasLocatorBox` / `drawAtlasLocator`, bottom corner with least land, reserved before labels) shows what the crop leaves out. `gq` added to `ISLAND_FULLSCREEN_BOUNDS` (Bioko + Rio Muni; Annobon in the inset). Desktop land share: sc 0 -> 10%, mu 0.1 -> 22%, gq 4 -> 13%. (2) `drawCountryMap` skips a draw whose inputs (country, size, DPR, layers, relief images ready, data present, fonts) match the last one: one Next drew 5 times (~70 ms each at 3x on a phone), now 2 (preview relief, full relief). (3) Next/Previous prefetch the neighbours' relief previews (`prefetchReliefPreview`) as well as their data. (4) sw.js: relief images, map chunks and facts get their own cache `asj-maps-v1`, kept across versions and served stale-while-revalidate (4 ms from cache vs 0.3-0.8 s per file live); bump `MAP_CACHE` if app.js ever stops drawing the previous files. Stress test (55 countries x desktop, phone, fullscreen; 60 rapid Next/Prev): 0 errors, median draw 14 ms desktop (za 75 ms max), heap flat. Self-test 103/103. Assets v98. |
| `832265ff` | **Next/Previous country keeps the reader's place (desktop, 3 Nov).** `openCountry` ended with `backBtn.focus()` on every open; Back sits in the sticky header and focusing a sticky element scrolls its container to the top, so a real click on Next (which moves focus off Back first) threw the reader out of the Atlas, News or Signals tab to the header. Scripted `.click()` and ref-based browser clicks hid it (Back stayed focused / the tool scrolled the button into view). Now, on phone and desktop alike: paging while down in a tab lands at the top of the same tab for the new country (`panelStartScrollTop()`, panels just under the sticky header + tab row); paging from the header stays at the header; a same-country re-render (data arriving) moves nobody; focus stays on the control that paged (`preventScroll` otherwise); `lastFocus` is set only on a fresh open, so Back returns focus to what opened the view. Tab switches (`showPanelStart`, was `showMobilePanelStart`) now also land at the tab top on desktop when the reader is down in a panel. Assets v97. |
| `cdd4bf00` | **Reach 2: paste-ready posts, return-reader prompts, richer search results, weekly live check (desktop, 3 Nov).** (1) `/digest/` (noindex, not in the sitemap, rebuilt every edition, in `EDITION_PATHS`): the day's five best stories (one per country, by selectionScore, published in the last 30 h) as a WhatsApp post (`*bold*`), a Facebook post and an X post, then each country's top three for country groups; Copy, Send to WhatsApp (`wa.me`) and Send to Telegram buttons. WhatsApp and Facebook cannot be posted to by a script, so the desk writes and the owner pastes. (2) App: a follow nudge in the country view on the second distinct day a reader opens the same country (unless followed, or dismissed/unfollowed in the last 45 days), and an add-to-home-screen bar (Chrome/Android `beforeinstallprompt`, iPhone instructions) from the second visit day, 30-day snooze; both off under `navigator.webdriver` and `?selftest/sweep/perf`. `manifest.json` gains `id` and PNG icons (`icon-192.png`, `icon-512.png`) so Chrome offers install. (3) Search: story titles name the country when the headline does not; BreadcrumbList JSON-LD on story, country and topic pages; `xmlns:image` sitemap entries for the 55 lead share images; RSS items carry `<enclosure>` + `<media:content>` images. (4) `data/social-config.js` (`telegram`, `bluesky` handles, empty until the accounts exist): fills a Follow line in every built page's footer, `sameAs` on the publisher, and a Telegram link in the follow nudge. (5) Analytics config loads `async` (was render-blocking, ~170 ms). (6) `scripts/check-live-site.ps1` + `site-health.yml` (Mondays 07:00 UTC and on demand): fetches the live site - core files, every country and topic page, 80 random story pages (headline, canonical, og:image), up to 25 share images, the feed and its newest links, six earlier-story lists, the 404 page, http and www redirects (HttpClient: 5.1 loses the 301 with redirects off) - and opens/comments on one "Site health" issue, closed by the next clean run. Test: digest built, noindex, every story it posts exists. Assets v96. |
| `4d3e76b8` | **Reach: share images, topic pages, large previews, owner opt-out, social posting (desktop, 3 Nov).** (1) `<meta name="robots" content="max-image-preview:large">` on the app shell and every built page, so Search and Discover may show the large image. (2) `scripts/share-image.ps1` draws each country's lead story its own 1200x630 card (the country's `og/<cc>.jpg` with kicker and headline; System.Drawing, Georgia/Consolas, JPEG q62, ~40 KB) at `/<cc>/<slug>/share.jpg`, kept and swept with the page; redrawn only when the headline changes. Leads only: all ~230 stories an edition would add ~3 GB a year to the repo. (3) `/topics/<topic>/` (newest 60 stories per topic, any topic with 3+) and `/topics/`, in the sitemap; a story's topic line links there; "Topics" in the info menu; `topics` added to `EDITION_PATHS`. Older pages' topic is read from the line above their `<h1>`. static-pages.css v70. (4) `?notrack=1` on any page leaves that browser out of analytics (localStorage `asj-notrack`; `?notrack=0` undoes). (5) `scripts/post-social.ps1` after the IndexNow ping: up to 5 new stories (last 24 h, one per country, by `selectionScore`) as one Telegram message, the first 3 as Bluesky posts with link cards; switches on per service when `TELEGRAM_BOT_TOKEN`+`TELEGRAM_CHAT_ID` or `BLUESKY_HANDLE`+`BLUESKY_APP_PASSWORD` secrets exist; ids sent are kept in `data/social-posted.json` in the Actions cache (gitignored); never fails the run; `-DryRun` prints the posts. Tests: every named share image exists; topic pages exist and every story they list exists. Asset v95. |
| `de772ad7` | **One page per story (desktop, 3 Nov).** A story's address is made from its headline, and the desk rewrites headlines between editions, so each rewrite left another full page: 190 stories had 2-6 pages (396 in all), every one in the sitemap and the Earlier lists. `build-static-pages.ps1` now groups pages by article id (`<meta name="asj-story">` on new pages; older ones read in full, only when their 6-character address tail is shared) and keeps one full page per story: today's address for a story in the edition, otherwise the first by ordinal address. Every other address becomes a redirect page (`Write-MovedStoryPage`: canonical + meta refresh, `asj-published` so the 90-day sweep still finds it), left out of the sitemap and both Earlier lists. Keyed on the id, not the publish stamp, which 14 of the 190 changed between rewrites. `test-static-pages.ps1`: no story has two full pages; every redirect lands on a page. First run redirects ~206 addresses. |
| `375e6ee4` | **Earlier stories in the app, and the audit drop reaches committed stories (desktop, 3 Nov).** The app's country view showed only today's stories; the kept pages were reachable only from the static `/<cc>/` page. `build-static-pages.ps1` now writes `data/earlier/<cc>.json` (30 newest kept pages not in today's edition, `{h,u,d}`), committed by `publish-edition.ps1`; `app.js` `renderEarlierStories` shows 12 under the news cards (`#cv-earlier`) with a link to the country page for the rest. `Select-DistinctStories` drops near-repeats (Jaccard >= 0.75 on 3+ letter words) from both lists. `test-static-pages.ps1` checks every list parses and links to a page that exists. Separately, the audit step's degrade path now drops rejected `articleId`s from `briefs-state.json` too: a Namibia-only run failed because Mali stories from the morning edition cited bamada.net pages since taken down, and dropping them from today's drafts alone left them in state. Asset v94. |
| `f264744c` | **Story pages kept 90 days and in the sitemap (desktop, 3 Nov).** Search Console showed Google sending readers who search names from stories ("simon akpo", "gabon platform"), 409 pages indexed and 428 not. The 7-day sweep went by file timestamp, which every desk checkout resets, so it never removed a page; but the 2,718 kept pages were orphaned (sitemap listed only today's ~285). `build-static-pages.ps1`: `-StoryDays 90`, judged by each page's `datePublished` (`Read-StoryPageHead`, first 8 KB); every kept page goes in `sitemap.xml` with its date; each country page lists up to 20 "Earlier stories". `test-static-pages.ps1` checks every story page on disk is in the sitemap and every earlier-stories link resolves. Expect ~20,000 pages / ~200 MB at steady state. `sweep.js` samples 200 earlier pages instead of fetching all. |
| (this push) | **Content sweep (desktop, 30 Oct).** `?sweep=1` loads `sweep.js`: it opens all 55 countries x News, Signals (farmers, investors, diaspora) and Atlas, plus the Wire and front page (about 276 views, ~4 min at phone width) and reports, grouped, broken values, desk jargon, placeholder or "modelled" wording, stale stamps, lower-case headlines, broken images, repeated text, cut-off text, two or more empty headline figures, and stories that never name their country. Read `window.__sweep.findings`. It is a report for a person, not a gate. First run found: Ghana leading on Manchester United (European club names now count as foreign in `news-ranking.ps1`, tested), long tickers cut off (now fitted to their tile, `fitHeatTickers`). Also `f4922b62`: island tags never fall back onto land (CI's 320x568 put COM on Madagascar); a self-test sweeps scales 1.6-4.2. Asset version 85. |
| `1947389b` | **One RSS feed per country** (`/ke/feed.xml`, desktop 30 Oct). Built by `build-static-pages.ps1` (`New-RssFeed`, shared with the site feed, whose output is unchanged); advertised on country and story pages and explained on About and /countries/. `test-static-pages.ps1` checks every country feed parses and holds only its own stories. |
| `86f7ab62` | **CI builds the static pages under pwsh on every push** (`check.yml`, "Static pages build under pwsh"). |
| `0702655e` | **Desk crash, 29 Oct (fixed by the owner via another assistant).** The 28 Oct `Test-NewsClusterNamesCountry @($cluster.members)` threw "Argument types do not match" on pwsh 7.4 (a Generic.List bound to `[object[]]`); both scheduled runs published nothing until a manual run at 20:24 UTC. Local tests run on Windows PowerShell 5.1 and passed. Desk scripts must take collections untyped and enumerate through the pipeline. |
| `36d7e484` | **Second pass (desktop, 29 Oct).** *Relief tone*: the elevation relief came out ~10 levels darker with highlights 20-30 below Natural Earth's; `build-country-relief.ps1` now has a tunable tone curve (`-ToneBase/-ToneTint/-ToneShadow/-ToneLight`, lit slopes on their own gain) set so mean, median and p95 match the old images (Kenya 108/101/166 vs 110/105/166). *Season Calendar*: showed only export crops (Kenya: tea, flowers, coffee, all on typical months) and merged every zone's window (Kenya's rice "all 12 months"). Now months are those at least half the growing zones share, maize/cassava/wheat/teff/yams/sweet potatoes are mapped (FAO files grain maize as "Corn, sweet"), and the two food crops with the most FAOSTAT area harvested lead (`scripts/crop-calendar-facts.ps1`, shared by `build-country-facts.ps1` and `build-crop-calendar.ps1`; the latter now updates `data/facts/<cc>.js` in place). Kenya: maize and pulses; Uganda: bananas and maize; Senegal: groundnuts and millet. *Atlas*: a port or airport named after the city beside it shows its marker without repeating the name. *Fakes removed*: `STORY_PINS` (invented headlines with "popularity" scores, unused), made-up popularity/impact/date on country stories. *Words*: "Copy Desk", "file pending", "The ASJ desk has not filed", "the desk being honest", "Open the full desk", "Explore country desks"; WFP's "IFO (Daadab)" shown as Ifo (Dadaab). *Static pages* (`build-static-pages.ps1`, desk-built) apply the same why-restates and "News" rules. Header flag has a 3x source. Asset version 83. |
| `6358486b` | **Audit: what a reader sees, said plainly (desktop, 28 Oct).** *Relief* is now shaded from elevation (Mapzen Terrain Tiles on AWS: SRTM, GMTED2010, ETOPO1) at about 1,400 px a country, zoom chosen per country: Natural Earth's fixed 1.85 km pixels gave Rwanda 183 px and Sao Tome 121, stretched 7-10x on a phone. Sea is flattened (the seabed drew hills round the Comoros). 9.3 MB for all 55; tiles cached in %TEMP%\asj-terrain-cache. *Wire lead* is measured from the edition date (`isBeforeEdition`), not the clock: after 00:00 UTC the 102-dead Nyala strike lost the lead to a bail hearing. *Country gate*: a story set abroad needs two outlets AND a mention of the country in some member (`Test-NewsClusterNamesCountry`); Cabo Verde led on a Spanish train crash. *Why it matters*: the stock line per topic is gone, and a why that restates the dek is hidden in the app (`whyRestates`, 60 of 237 on 28 Oct) and sent back by the writer (`Test-WhyRestatesDek` in story-shape.ps1). *Economy*: no modelled figures (Eritrea's "growth" was its population growth, its FDI and Western Sahara's GDP a regional average), no sine-wave GDP history, no GDP per person from a GDP over five years old; the Risk row is gone from Compare. *Markets*: the panel fetches data/markets.json (briefs.js carries the desk-time copy, 23 Oct on the 28th), moves over 50% are dropped as listing errors (OCH +188.9%), stale prices are a sentence, not grey tiles; MARKETS_SEED is tickers only. *Words*: "desk" jargon, "capital lens", "high confidence", ISO code, "N active overlays", "Hydrography", the "News" kicker and the third tagline are gone; the masthead shows the edition date and story count; the farmer KPI "Water registry" (it counted the neighbours' lakes) is the top farm export. Atlas text alternative lists only this country's named water. Self-test 102 checks. Asset version 82. |
| `c4edffaa` | **Headline casing.** The model returned 24 headlines and 10 deks in lower case on 28 Oct. `Repair-StoryCase` (story-shape.ps1) re-cases them from the story's own text and the place-name list before publishing; `scripts/repair-story-case.ps1` fixed the published edition in place. 15 tests in `test-story-case.ps1` (in check.yml). |
| `f8892734` | **Desk crash, 25 and 27 Oct.** A headline containing the word "count" made the word hashtable's .Count return the entry, and [Math]::Min failed ("ambiguous overloads"). `get_Count()`/`get_Keys()` in Get-NewsSimilarity and fetch-news; test added. |
| `a424c345` | **Real relief and roads on the Atlas (desktop, 23 Oct).** The "Stylized relief" was sine waves seeded by the country code, with fake contour lines (`terrainHeight`, `drawRelief`, `drawContours`, now deleted). It is replaced by Natural Earth's 1:10m Gray Earth with Shaded Relief, cut per country and tinted green by `scripts/build-country-relief.ps1` (`data/relief/<cc>.jpg`, 2.7 MB for all 55, loaded only when the Atlas draws, not in data-saver mode; `data/relief/index.json` gives each image's edges). New Roads layer: Natural Earth main roads (scalerank 3-6) via `scripts/build-country-roads.ps1` -> `data/country-roads.json`, attached to the country chunks by `split-app-data.ps1` like rail. Both scripts are run by hand (sources change rarely). Self-test 95 checks. Asset version 81. |
| `ad77f93c` | **Desk hotfix.** `$style` in `write-briefs.ps1` overwrote `$STYLE`, the system prompt (PowerShell names ignore case), so the 23 Oct run published nothing; renamed. The harness's stand-in model now rejects non-text content as OpenRouter does. The re-run published at 07:37 UTC. |
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

Done 23 Oct: data saver part two, Wire on phones, off-country stories at ranking. Done since:
per-country RSS (`1947389b`); map accuracy, home map frame cost, the `styles.css` trim and the
Signals "At a glance" card (4-5 Nov, see What shipped). Left:
1. The Atlas text alternative lists one river under two names where Natural Earth splits it
   (Ethiopia: Shebele and Shabeelle; Abay and El Bahr el Azraq, both the Blue Nile).
2. The home map draw-in was measured only in the app's browser pane. Check it on a real
   mid-range phone, or with Playwright at 4x CPU throttling.

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
source, every month grounded in the source or its publication date (`Get-UngroundedMonths`),
`countryLink` ("none" -> dropped, reserve used), and house style (`Get-DraftStyleIssues`).

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
- Browser: `?selftest=1` (102 checks, from `selftest.js`; the result is in `window.__selftest`).
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
