/* The African Street Journal - self-test harness. Loaded by app.js only when the page
   is opened with ?selftest=1. It is a classic script, so it sees app.js's top-level
   functions and constants directly. Every regression this project has hit was found by
   hand; this is the standing net. Results land in console.table, window.__selftest,
   and a corner badge. */if (new URLSearchParams(location.search).has('selftest')) {
  const startSelfTest = () => {
    if (window.__selftestStarting) return;
    window.__selftestStarting = true;
    setTimeout(runSelfTest, 800);
  };
  setTimeout(startSelfTest, 0);
  window.addEventListener('load', startSelfTest, { once: true });
}
async function runSelfTest() {
  const checks = [];
  const add = (name, pass, note = '') => checks.push({ name, pass: !!pass, note: String(note) });

  // --- the payload the reader actually downloads --------------------------------
  // body is no longer shipped; app.js rebuilds it from paragraphs. If that ever stops
  // working the site looks fine until a story is opened, which is too late to notice.
  // The prose arrives after first paint (loadDeferredHalf); a run started before it
  // landed reported 0/231 on a cold load. Wait for it, as an opened story does.
  if (window.ASJ_LOAD_FULL) { try { await window.ASJ_LOAD_FULL(); } catch {} }
  {
    const stories = Object.values(AI_BRIEFS || {}).flat().filter(Boolean);
    const withProse = stories.filter(s => s.body && s.body.trim());
    add('payload: every story has prose after hydration', withProse.length === stories.length,
        withProse.length + '/' + stories.length);
    const sample = stories.find(s => Array.isArray(s.paragraphs) && s.paragraphs.length > 1);
    add('payload: rebuilt body matches its paragraphs',
        !sample || sample.body === sample.paragraphs.join('\n\n'), sample ? sample.headline : 'no sample');
    const badDates = stories.filter(s => s.published && !Number.isFinite(Date.parse(s.published)));
    add('payload: every published stamp parses as a date', badDates.length === 0,
        badDates.length ? badDates[0].published : 'all parse');
    add('payload: desk-only ranking fields are not shipped',
        !stories.some(s => 'scoreBreakdown' in s || 'rankReasons' in s),
        stories.length + ' stories checked');
  }

  // --- the front page on the landing screen -------------------------------------
  {
    add('landing: the home screen is a single screen (no below-hero stories block)',
        !document.getElementById('home-front-mobile'), 'headlines live in the Wire and country views');
    const titles = [...document.querySelectorAll('#home-front-mobile .home-story-title')]
      .map(el => el.textContent.trim());
    add('landing: no headline appears twice', new Set(titles).size === titles.length, titles.length + ' shown');
    // A daily cannot lead on a story from a previous edition while a current one exists.
    const leadEl = document.querySelector('.home-story--lead .home-story-title');
    const leadTitle = leadEl ? leadEl.textContent.trim() : '';
    const lead = Object.values(AI_BRIEFS || {}).flat().find(s => s && s.headline === leadTitle);
    const anyFresh = Object.values(AI_BRIEFS || {}).flat().some(s => s && s.published && !isStaleDate(s.published, 2));
    add('landing: the lead story is from a current edition',
        !lead || !anyFresh || !isStaleDate(lead.published || '', 2),
        leadTitle + ' @ ' + (lead ? lead.published : 'unknown'));
  }

  // --- an unscored story must not outrank the desk ------------------------------
  {
    const scored = { headline:'Scored', selectionScore:20, paragraphs:['x'], sources:[] };
    const unscored = { headline:'Unscored', paragraphs:['x'], sources:[] };
    add('ranking: a story with no score ranks below a well-scored one',
        storyLensRank(unscored, 'general', 0) < storyLensRank(scored, 'general', 0),
        storyLensRank(unscored, 'general', 0) + ' vs ' + storyLensRank(scored, 'general', 0));
  }

  // --- a story has its own address ----------------------------------------------
  {
    // Through the Wire, which is where readers open stories now. This used to click a
    // landing-page headline; that block was removed, the click found nothing, and the
    // check failed every run without testing sharing at all.
    window.__wireOpen?.('All');
    await new Promise(r => setTimeout(r, 260));
    const trigger = document.querySelector('#wire-results [data-story-key]');
    const before = new URLSearchParams(location.search).get('story');
    const historyBefore = history.length;
    trigger?.click();
    await new Promise(r => setTimeout(r, 400));
    const shared = new URLSearchParams(location.search).get('story');
    add('sharing: opening a story puts it in the address bar', !!shared && shared !== before, String(shared));
    add('sharing: opening a story adds exactly one history entry',
        history.length === historyBefore + 1, historyBefore + ' -> ' + history.length);
    // Back must return to the paper, not leave it. On a phone this is the main gesture.
    history.back();
    await new Promise(r => setTimeout(r, 400));
    add('sharing: back closes the story instead of leaving the site',
        !document.getElementById('story-reader')?.classList.contains('open'),
        location.search);
    add('sharing: a shared id resolves to a real story',
        !!(shared && findPublishedStory(shared)), String(shared));
    window.__wireClose?.();
    await new Promise(r => setTimeout(r, 120));
  }

  // --- search reaches the whole story, in any spelling ---------------------------
  {
    const stories = Object.values(AI_BRIEFS || {}).flat().filter(Boolean);
    const hay = stories.map(s => storySearchHaystack(s, { country: 'X' }));
    // The prose has to be in the haystack: search used to read only headline, dek,
    // why, topic, source and country, so "inflation" found nothing while stories
    // discussed it at length.
    const withBody = stories.filter((s, i) => {
      const first = (storyParagraphs(s)[0] || '').split(/\s+/).find(w => w.length > 6);
      return !first || hay[i].includes(foldForSearch(first));
    }).length;
    add('search: the body of every story is searchable', withBody === stories.length,
        withBody + '/' + stories.length);
    add('search: accents fold both ways',
        foldForSearch('SENEGAL') === foldForSearch('S\u00c9N\u00c9GAL') &&
        foldForSearch('C\u00f4te d\u2019Ivoire').startsWith('cote d'),
        foldForSearch('S\u00c9N\u00c9GAL'));
    add('search: nonsense still matches nothing',
        !hay.some(h => h.includes('zzzqqx')), 'zzzqqx');
  }

  // --- a lens shows only what it can honestly claim --------------------------------
  {
    const all = Object.values(AI_BRIEFS || {}).flat().filter(Boolean);
    const counts = {};
    for (const lens of ['farmers','investors','diaspora']) {
      counts[lens] = all.filter(s => storyLensData(s, lens).score >= 41).length;
    }
    // The lens used to be a sort, so every story appeared under every tab. Farmer
    // showed agriculture for a few slots and then business and politics scored 20.
    add('lens: each lens claims fewer stories than the whole edition',
        Object.values(counts).every(n => n < all.length),
        JSON.stringify(counts) + ' of ' + all.length);
    // Investors was the only lens with a real pool; the other two must not have been
    // quietly widened to match it.
    add('lens: the relevance floor actually excludes something',
        Math.min(...Object.values(counts)) < all.length * 0.9,
        'narrowest lens keeps ' + Math.min(...Object.values(counts)));
    const belowFloor = all.filter(s => storyLensData(s, 'farmers').score < 41).length;
    add('lens: stories below the floor exist and are held back',
        belowFloor > 0, belowFloor + ' stories score under 41 for farmers');
  }

  // --- the edition arrives in two halves ----------------------------------------
  {
    const all = Object.values(AI_BRIEFS || {}).flat().filter(Boolean);
    const withId = all.filter(s => s.articleId);
    add('payload: the deferred half loaded', window.ASJ_FULL_LOADED === true, String(window.ASJ_FULL_LOADED));
    // The merge must land on the same objects the wire index and the registry hold,
    // not on copies, or an open view keeps rendering the index-only record.
    add('payload: every story has its prose after the merge',
        withId.every(s => Array.isArray(s.paragraphs) && s.paragraphs.length),
        withId.filter(s => !(s.paragraphs||[]).length).length + ' without paragraphs');
    add('payload: source URLs arrive with the deferred half',
        withId.every(s => (s.sources||[]).some(x => x && x.url)),
        withId.filter(s => !(s.sources||[]).some(x=>x&&x.url)).length + ' without a citation URL');
    // Lens ranking has to be exact from the index alone, or the wire reorders itself
    // under a reader a second after they pick a lens.
    const sample = withId.find(s => s.lensScores || s.lenses);
    add('payload: lens scores are usable before the prose lands',
        !sample || Number.isFinite(storyLensData(sample, 'farmers').score),
        sample ? String(storyLensData(sample, 'farmers').score) : 'no lens data');
  }

  const D = window.UNITED_AFRICA_DATA || {};
  const originalStoryLens = activeStoryLens;
  const lensFixture = [
    {
      headline:'Harvest desk', body:'The harvest desk keeps one canonical story body.', topic:'Agriculture',
      selectionScore:20, published:new Date().toISOString(), why:'The harvest affects household and export income.',
      lenses:{ farmers:{ score:96, why:'The harvest directly affects growers and farm income.' }, investors:{ score:44, why:'The harvest has a secondary effect on listed businesses.' }, diaspora:{ score:40, why:'The harvest has a secondary effect on families abroad.' } }
    },
    {
      headline:'Markets desk', body:'The markets desk keeps one canonical story body.', topic:'Business',
      selectionScore:20, published:new Date().toISOString(), why:'The market move affects capital and company planning.',
      lenses:{ farmers:{ score:42, why:'The market move has an indirect effect on farm finance.' }, investors:{ score:98, why:'The market move directly affects capital allocation decisions.' }, diaspora:{ score:58, why:'The market move may affect savings and remittance choices.' } }
    }
  ];
  const farmerFixture = rankStoryEntries(lensFixture, 'farmers');
  const investorFixture = rankStoryEntries(lensFixture, 'investors');
  add('story lenses reorder one canonical desk',
    farmerFixture[0]?.story === lensFixture[0] && investorFixture[0]?.story === lensFixture[1] &&
      lensFixture[0].body === 'The harvest desk keeps one canonical story body.',
    farmerFixture[0]?.story?.headline + ' / ' + investorFixture[0]?.story?.headline);
  add('core: 55 landing countries', (D.countries || []).length === 55, (D.countries || []).length);
  const landingMapRect = canvas.getBoundingClientRect();
  const landingMapRatio = landingMapRect.height ? landingMapRect.width / landingMapRect.height : 0;
  // A background tab never lays the canvas out (rAF is paused), which would report a bogus 0x0.
  // Skip rather than cry wolf: a check that fails for environmental reasons trains you to
  // ignore real failures.
  if (!landingMapRect.width && document.hidden) {
    add('landing map keeps native aspect', true, 'skipped - tab hidden');
  } else {
    add('landing map keeps native aspect', Math.abs(landingMapRatio - (1000 / 1001)) < 0.02, landingMapRect.width.toFixed(0) + 'x' + landingMapRect.height.toFixed(0));
  }
  const populationRect = africaPopEl?.getBoundingClientRect();
  const populationVisible = !!populationRect && populationRect.width > 0 && populationRect.height > 0;
  const populationLargeEnough = window.innerWidth > 620 || (populationRect.width > 150 && populationRect.height > 25);
  add('landing population counter visible', populationVisible && populationLargeEnough,
    populationRect ? populationRect.width.toFixed(0) + 'x' + populationRect.height.toFixed(0) : 'missing');
  add('a11y: population counter does not announce every tick', africaPopEl?.getAttribute('aria-live') !== 'polite');
  add('country nav alphabetized', sortedCountryIds[0] === 'dz' && sortedCountryIds[1] === 'ao', sortedCountryIds.slice(0, 5).join(','));
  add('core: WB economy coverage 50+', Object.keys(D.worldBankEconomy || {}).length >= 50, Object.keys(D.worldBankEconomy || {}).length);
  const badIds = obj => Object.keys(obj || {}).filter(id => !COUNTRY_INFO[id]);
  add('INVESTOR_INFO ids valid', badIds(INVESTOR_INFO).length === 0, badIds(INVESTOR_INFO).join(','));
  add('MARKETS_SEED ids valid', badIds(MARKETS_SEED).length === 0, badIds(MARKETS_SEED).join(','));
  // Every country gets the same sourced figures. Western Sahara has no World Bank data
  // and says so; everyone else must carry most of the set.
  const factIds = Object.keys(window.ASJ_COUNTRY_FACTS?.countries || {});
  add('facts: one sourced file covers all 55', sortedCountryIds.every(id => factIds.includes(id)), factIds.length + ' countries');
  const thinFacts = sortedCountryIds.filter(id => id !== 'eh' &&
    Object.keys(FACT_DEFS).filter(key => countryFact(id, key)).length < 8);
  add('facts: every World Bank member has at least 8 of 16 figures', thinFacts.length === 0, thinFacts.join(',') || 'all');
  // Nothing on the Atlas or in Signals is invented to fill a gap.
  const invented = sortedCountryIds.filter(id => criticalInfraForCountry(id).some(item =>
    !['port', 'airport'].includes(item.kind) || /Air Gateway|Inland Freight Desk|Primary Corridor|Rail Node|Road Hub/.test(item.name)));
  add('atlas: ports and airports only, none invented', invented.length === 0, invented.join(',') || 'none');
  // Borders. ASJ follows the African Union: Somaliland is part of Somalia, and Western
  // Sahara is its own country, so Laayoune is not in Morocco.
  for (const id of ['so', 'eh', 'ma', 'ke', 'km']) { try { await ensureCountryData(id); } catch {} }
  add('outline: Berbera and Hargeisa are inside Somalia', insideCountry('so', 45.03, 10.44) && insideCountry('so', 44.06, 9.56));
  add('outline: Laayoune is in Western Sahara, not Morocco', insideCountry('eh', -13.2, 27.15) && !insideCountry('ma', -13.2, 27.15));
  for (const id of ['za', 'tz', 'bi', 'ss']) { try { await ensureCountryData(id); } catch {} }
  const capitalOf = id => atlasPlaces(id).filter(p => p.capital).map(p => p.name).join(',');
  add('atlas: the capital is the one the country file names', capitalOf('za') === 'Pretoria' && capitalOf('tz') === 'Dodoma' &&
    capitalOf('bi') === 'Gitega' && capitalOf('ss') === 'Juba' && capitalOf('eh') === 'Laayoune', ['za', 'tz', 'bi', 'ss', 'eh'].map(capitalOf).join(' '));
  add('atlas: Somalia labels Hargeisa and Burao, Western Sahara Laayoune and Dakhla',
    ['Hargeisa', 'Burco'].every(n => atlasPlaces('so').some(p => p.name === n)) &&
    ['Laayoune', 'Ad Dakhla'].every(n => atlasPlaces('eh').some(p => p.name === n)));
  add('atlas: Kilimanjaro is not drawn in Kenya', !atlasFeaturePoints('ke').some(l => /Kilimanjaro/.test(l.name)));
  // Every landmark point sits inside the country it is listed for, and every country
  // has one - the two rules a single shared point broke.
  const landmarkMisses = [];
  for (const item of LANDMARK_POINTS) {
    for (const id of Object.keys(item.at || {})) {
      try { await ensureCountryData(id); } catch {}
      if (!atlasFeaturePoints(id).some(l => l.name === item.name)) landmarkMisses.push(item.name + '@' + id);
    }
  }
  add('atlas: every landmark point is inside its country', landmarkMisses.length === 0, landmarkMisses.join(', ') || 'all inside');
  const noLandmark = sortedCountryIds.filter(id => !LANDMARK_POINTS.some(item => item.at?.[id]));
  add('atlas: every country has a landmark', noLandmark.length === 0, noLandmark.join(',') || 'all 55');
  const capitalMissing = [];
  for (const id of sortedCountryIds) {
    try { await ensureCountryData(id); } catch {}
    const cap = normalizeName(COUNTRY_INFO[id].capital);
    if (!largestCities(id).some(c => c.capital || normalizeName(c.name) === cap || normalizeName(c.name) + 'city' === cap)) capitalMissing.push(id);
  }
  add('facts: every country lists its capital among its largest cities', capitalMissing.length === 0, capitalMissing.join(',') || 'all 55');
  // Figures checked against a second source (22 Oct 2026): a city figure needs two of
  // three sources to agree, a railway total is route length beside the Factbook's, and
  // a World Bank figure older than seven years is not shown as current.
  const keCities = largestCities('ke').map(c => c.name);
  const juba = largestCities('ss')[0];
  add('cities: Juba leads South Sudan; Kakamega (a county figure) is not Kenya\'s second city',
    juba?.name === 'Juba' && juba.pop > 300000 && !keCities.includes('Kakamega') && keCities[1] === 'Mombasa', keCities.join(', '));
  const singleSource = sortedCountryIds.filter(id => (countryFacts(id)?.cities || []).filter(c => c.sources < 2).length > 2);
  add('cities: at most two single-source towns, only to fill a short list', singleSource.length === 0, singleSource.join(',') || 'all');
  add('facts: a figure older than seven years shows its year, not a value',
    !countryFact('cd', 'inflation') && staleFactYear('cd', 'inflation') === 2016 && !countryFact('ss', 'growth'));
  add('rail: Libya, Chad and Niger show no railway in service',
    ['ly', 'td', 'ne'].every(id => !countryRail(id) && /not in service|no railway/i.test(railSummaryHtml(id))));
  add('rail: route length, not track length (Algeria under 1.5x the Factbook)',
    (COUNTRY_GIS.dz?.rail?.km || 0) < RAIL_FACTBOOK.dz[0] * 1.5 && (COUNTRY_GIS.ma?.rail?.km || 0) < RAIL_FACTBOOK.ma[0] * 1.3,
    COUNTRY_GIS.dz?.rail?.km + ' / ' + COUNTRY_GIS.ma?.rail?.km);
  // 23 Oct 2026, second batch: per-country facts files, Africa medians, phone section
  // links, and Sierra Leone's freight line explained rather than flagged.
  add('facts: the shared index carries no per-country detail; it arrives with the country',
    !('ports' in (window.ASJ_COUNTRY_FACTS?.countries?.ml || {})) || !!countryFacts('ke')?.ports?.length,
    'ke ports ' + (countryFacts('ke')?.ports?.length || 0));
  add('facts: Africa medians exist for rates, not for dollar totals',
    Number.isFinite(africaMedian('inflation')) && africaMedian('remitUsd') === null, String(africaMedian('inflation')));
  renderSignalsJump('farmers');
  const jumpButtons = document.querySelectorAll('#cv-panel-signals .cv-jump [data-jump]');
  add('signals: phone section links cover every farmer section', jumpButtons.length === 5 &&
    Array.from(jumpButtons).every(b => document.getElementById(b.dataset.jump)), jumpButtons.length + ' links');
  renderSignalsJump();
  add('rail: Sierra Leone shows its freight line with a note', /Pepel-Tonkolili/.test(railSummaryHtml('sl')));
  // The Atlas relief is Natural Earth's shaded relief, not shapes generated from the
  // country code; and the Atlas has roads (Natural Earth), not only railways.
  await loadReliefIndex();
  const noRelief = sortedCountryIds.filter(id => !RELIEF.index?.[id]);
  add('atlas: every country has a real relief image', noRelief.length === 0 && typeof terrainHeight === 'undefined', noRelief.join(',') || 'all 55');
  const islands = new Set(['cv', 'km', 'mu', 'sc', 'st']);
  const noRoads = sortedCountryIds.filter(id => !islands.has(id) && !(COUNTRY_GIS[id]?.roads?.major || []).length);
  add('atlas: every mainland country has main roads', noRoads.length === 0, noRoads.join(',') || 'all');
  add('atlas: Lake Chad is marked only where it has open water', Object.keys(LANDMARK_POINTS.find(l => l.name === 'Lake Chad').at).sort().join() === 'cm,td');
  add('atlas: Mayotte is not listed as a Comoros port', !countryPorts('km').some(p => /Dzaoudzi/i.test(p.name)));
  add('atlas: Kenya marks JKIA and the Mombasa SGR', atlasInfraForCountry('ke').some(i => i.short === 'NBO') &&
    (COUNTRY_GIS.ke?.rail?.lines || []).some(l => l.gauge === 1435 && l.km > 300));
  add('facts: every coastal country has a seaport', sortedCountryIds.filter(id => !LANDLOCKED.has(id) && !countryPorts(id).length).length === 0,
    sortedCountryIds.filter(id => !LANDLOCKED.has(id) && !countryPorts(id).length).join(',') || 'all');
  const exportLabels = Array.from(new Set([].concat(...sortedCountryIds.map(farmExportsForCountry))));
  const noSeason = exportLabels.filter(c => !CROP_SEASONS[c]);
  add('CROP_SEASONS covers every export crop', noSeason.length === 0, noSeason.join(','));
  const noPlantingKinds = new Set(['fishery', 'livestock', 'fiber']);
  const noPlanting = exportLabels
    .filter(c => CROP_SEASONS[c] && !(CROP_SEASONS[c].s || []).length && !noPlantingKinds.has(CROP_SEASONS[c].kind));
  add('crop calendar planting coverage', noPlanting.length === 0, noPlanting.join(','));
  // Farm exports are FAOSTAT's, with a note where it shows little (22 Oct 2026 check:
  // Kenya Tea / Cut flowers / Coffee; Uganda's "Fish" and Tanzania's "Coffee" were hand-made).
  const noFarm = sortedCountryIds.filter(id => !farmExportsForCountry(id).length && !countryFacts(id)?.farm?.note);
  add('farm: every country has FAOSTAT exports or says why not', noFarm.length === 0, noFarm.join(',') || 'all 55');
  add('farm: Kenya is Tea, Cut flowers, Coffee; Uganda has no Fish', farmExportsForCountry('ke').join() === 'Tea,Cut flowers,Coffee' &&
    !farmExportsForCountry('ug').includes('Fish'), farmExportsForCountry('ke').join(', '));
  add('crop calendar: Sudan sesame uses FAO months (sown Jun-Jul)', seasonSpecForCountry('sd', 'Sesame')?.source === 'FAO' &&
    seasonSpecForCountry('sd', 'Sesame').s.join() === '6,7');
  const briefProblems = [];
  Object.entries(AI_BRIEFS).forEach(([c, list]) => (list || []).forEach((b, i) => {
    if (!b || !b.headline || !b.body) briefProblems.push(c + '#' + i);
    (b && b.sources || []).forEach(s => { if (s && s.url && !/^https?:\/\//i.test(s.url)) briefProblems.push(c + ':' + s.url); });
  }));
  add('published entries schema + https sources', briefProblems.length === 0, briefProblems.slice(0, 3).join(' '));
  add('archive index present', Array.isArray(window.UNITED_AFRICA_ARCHIVE_INDEX));

  try {
    openCountry('ke');
    await new Promise(r => setTimeout(r, 900));
    add('smoke: Kenya dossier opens', countryView.classList.contains('open') && document.getElementById('cv-name').textContent === 'Kenya');
    add('smoke: header growth/vintage', /%/.test(document.getElementById('cv-growth')?.textContent || ''));
    add('smoke: news panel has content', (document.getElementById('cv-cards').innerHTML || '').length > 400);
    add('smoke: crop calendar rows', document.querySelectorAll('#cv-crop-cal .cv-cal-row').length > 0, document.querySelectorAll('#cv-crop-cal .cv-cal-row').length);
    // The rows were there but invisible for weeks: a blanket Signals rule cleared every
    // "-cell" background, the calendar's bars included.
    const harvestCell = document.querySelector('#cv-crop-cal .cv-cal-cell.h');
    const harvestBg = harvestCell ? getComputedStyle(harvestCell).backgroundColor : '';
    add('smoke: crop calendar bars are coloured', !!harvestBg && !/rgba\(0, 0, 0, 0\)|transparent/.test(harvestBg), harvestBg || 'no harvest cell');
    add('smoke: route set', location.hash.indexOf('#/ke') === 0, location.hash);
    const countryRouteHistoryLength = history.length;
    add('a11y: one country panel exposed', document.querySelectorAll('.cv-panel[aria-hidden="false"]').length === 1, document.querySelectorAll('.cv-panel[aria-hidden="false"]').length);
    const fileContent = document.getElementById('cv-file-content');
    const sectionTabsRect = document.getElementById('cv-dots')?.getBoundingClientRect();
    const carouselRect = document.querySelector('.cv-carousel')?.getBoundingClientRect();
    const mobileDossierLayoutOk = !mobileDossierMedia.matches || (
      fileContent?.hidden &&
      sectionTabsRect?.bottom <= (carouselRect?.top || 0) + 1 &&
      Array.from(document.querySelectorAll('.cv-panel[aria-hidden="true"]')).every(panel => getComputedStyle(panel).display === 'none')
    );
    add('mobile dossier starts compact with sections above content', mobileDossierLayoutOk,
      mobileDossierMedia.matches ? Math.round(sectionTabsRect?.bottom || 0) + '/' + Math.round(carouselRect?.top || 0) : 'desktop skipped');
    add('a11y: ticker clones skip keyboard', !document.querySelector('.ticker-segment[aria-hidden="true"] button:not([tabindex="-1"])'));
    // A tab other than the current lens, so the check below can tell if it leaked.
    audienceSelect.value = originalStoryLens === 'diaspora' ? 'farmers' : 'diaspora';
    audienceSelect.dispatchEvent(new Event('change'));
    add('routing: lens changes replace the country history entry', history.length === countryRouteHistoryLength,
      countryRouteHistoryLength + '->' + history.length);
    // The lens lives in the Wire alone. A Signals tab must not set it, and a lens set in
    // the Wire must not reorder a country page that has no control to show it.
    add('signals tab does not set the Wire lens', activeStoryLens === originalStoryLens,
      originalStoryLens + ' -> ' + activeStoryLens);
    const generalOrder = Array.from(document.querySelectorAll('#cv-cards .cv-brief-title'), el => el.textContent);
    setStoryLens('investors', { syncSignals:false });
    const lensOrder = Array.from(document.querySelectorAll('#cv-cards .cv-brief-title'), el => el.textContent);
    add('country news has no lens control and keeps the desk order',
      !document.querySelector('#country-view [data-story-lens]') &&
        !/lens/i.test(document.getElementById('cv-story-meta')?.textContent || '') &&
        generalOrder.length > 0 && generalOrder.join('|') === lensOrder.join('|'),
      (document.getElementById('cv-story-meta')?.textContent || 'missing') + ' / ' + generalOrder.length + ' rows');
    setPanel(1);
    openCountry('lr');
    await new Promise(r => setTimeout(r, 260));
    // Signals is a stacked list at every width since signals-v1 (no side-scrolling card
    // carousel), so what must hold is that it never side-scrolls.
    const stickyGrid = activeInfoGrid();
    add('smoke: signals stack vertically, no side-scroll',
      !!stickyGrid && getComputedStyle(stickyGrid).flexDirection === 'column' && stickyGrid.scrollWidth <= stickyGrid.clientWidth + 2,
      stickyGrid ? 'vertical · ' + stickyGrid.scrollWidth + '/' + stickyGrid.clientWidth : 'missing');
    setPanel(2);
    // Wait for the redraw rather than a fixed 160 ms: Liberia's atlas takes 160-210 ms
    // to draw, so the old fixed wait raced it and failed on a slow frame.
    for (let waited = 0; waited < 1500; waited += 50) {
      await new Promise(r => setTimeout(r, 50));
      const r = countryMapCanvas.getBoundingClientRect();
      if (waited >= 150 && Math.abs(r.width / Math.max(1, r.height) - countryMapCanvas.width / Math.max(1, countryMapCanvas.height)) < 0.01) break;
    }
    const atlasRect = countryMapCanvas.getBoundingClientRect();
    add('mobile atlas viewport is bounded and page-width safe',
      !mobileDossierMedia.matches || (
        atlasRect.width >= Math.min(272, window.innerWidth - 48) &&
        atlasRect.height >= 300 &&
        atlasRect.height <= window.innerHeight * 0.62 + 1 &&
        countryView.scrollWidth <= countryView.clientWidth + 1
      ),
      Math.round(atlasRect.width) + 'x' + Math.round(atlasRect.height) + ' / root ' + countryView.scrollWidth + '/' + countryView.clientWidth);
    const atlasCssRatio = atlasRect.width / Math.max(1, atlasRect.height);
    const atlasBitmapRatio = countryMapCanvas.width / Math.max(1, countryMapCanvas.height);
    add('atlas country geometry keeps its display proportions',
      Math.abs(atlasCssRatio - atlasBitmapRatio) < 0.01,
      atlasCssRatio.toFixed(3) + ' css / ' + atlasBitmapRatio.toFixed(3) + ' bitmap');
    const tickerAnimation = tickerEl.getAnimations?.()[0];
    const tickerTimeBeforeClose = Number(tickerAnimation?.currentTime || 0);
    const timelineBeforeClose = Number(document.timeline?.currentTime || 0);
    closeCountry();
    await new Promise(r => setTimeout(r, 200));
    add('smoke: route cleared on close', !location.hash, location.hash);
    const tickerTimeAfterClose = Number(tickerAnimation?.currentTime || 0);
    // A page that is not painting (a background tab, a hidden preview pane - which can
    // still report itself visible) does not advance animation time at all, so it cannot
    // show this either way. Judge the ticker only when the document clock moved.
    const framesRendered = Number(document.timeline?.currentTime || 0) > timelineBeforeClose + 80;
    add('smoke: city ticker resumes after country close',
      !tickerAnimation || (tickerAnimation.playState === 'running' && (!framesRendered || tickerTimeAfterClose > tickerTimeBeforeClose + 80)),
      tickerAnimation ? tickerAnimation.playState + ' ' + Math.round(tickerTimeBeforeClose) + '->' + Math.round(tickerTimeAfterClose) + (framesRendered ? '' : ' (page not painting)') : 'reduced motion');
    openCountry('bw'); // a briefless country must show real wire stories (or the Country File fallback), never a dead end
    await new Promise(r => setTimeout(r, 900));
    const wireRows = document.querySelectorAll('#cv-cards .cv-news-row').length;
    const fileRows = document.querySelectorAll('#cv-cards .cv-df-row').length;
    add('smoke: briefless country News shows wire or file', wireRows >= 2 || fileRows >= 3, wireRows + ' wire rows, ' + fileRows + ' file rows');
    closeCountry();
    window.__wireOpen('All');
    await new Promise(r => setTimeout(r, 260));
    const wireTrust = document.getElementById('wire-trust');
    const wireResultCount = document.getElementById('wire-result-count');
    const wireResults = document.getElementById('wire-results');
    // One plain sentence, no stat cells, no second count line.
    add('smoke: wire summary is one sentence', !!wireTrust && wireTrust.children.length === 0 && /\d+ stor/.test(wireTrust.textContent) && wireResultCount?.hidden, (wireTrust?.textContent || '').trim());
    add('smoke: wire opens at the lead story', wireResults?.scrollTop === 0, wireResults?.scrollTop);
    // Every row says how old it is, and nothing over a week old sits above a current story.
    const rowAges = [...(wireResults?.querySelectorAll('.wire-item-meta') || [])].map(el => el.textContent.split('·').pop().trim());
    const isAgeLabel = text => /^(Today|Yesterday|\d+ days ago|\d{1,2} [A-Z][a-z]{2,3})$/.test(text);
    add('wire: every row shows its age', rowAges.length > 0 && rowAges.every(isAgeLabel),
        rowAges.find(text => !isAgeLabel(text)) || rowAges.length + ' rows');
    const firstOld = rowAges.findIndex(text => /^\d{1,2} [A-Z][a-z]{2,3}$/.test(text));
    add('wire: a week-old story never ranks above a current one',
        firstOld < 0 || rowAges.slice(firstOld).every(text => /^\d{1,2} [A-Z][a-z]{2,3}$/.test(text)),
        firstOld < 0 ? 'none older than a week in view' : 'first old row at ' + firstOld);
    const storyTrigger = wireResults?.querySelector('[data-story-key]');
    const openedStoryKey = storyTrigger?.dataset.storyKey || '';
    add('smoke: wire uses on-site story buttons', storyTrigger instanceof HTMLButtonElement, storyTrigger?.tagName || 'missing');
    storyTrigger?.click();
    await new Promise(r => setTimeout(r, 80));
    add('smoke: on-site story reader opens', storyReader?.classList.contains('open') && !!document.getElementById('story-reader-title')?.textContent);
    add('smoke: story reader carries copy and citations',
      document.querySelectorAll('#story-reader-copy p').length > 0 && document.querySelectorAll('#story-reader-sources a').length > 0,
      document.querySelectorAll('#story-reader-copy p').length + ' paragraphs, ' + document.querySelectorAll('#story-reader-sources a').length + ' sources');
    add('story reader uses the active lens without rewriting copy',
      /for investors/.test(document.getElementById('story-reader-why')?.textContent || '') &&
        document.querySelector('#story-reader-copy p')?.textContent === storyParagraphs(findPublishedStory(openedStoryKey)?.story)[0],
      document.getElementById('story-reader-why')?.textContent || 'missing');
    add('opened story is saved as read',
      !!openedStoryKey && isStoryReadKey(openedStoryKey) &&
        !!JSON.parse(localStorage.getItem(STORY_READ_KEY) || '{}')[openedStoryKey],
      openedStoryKey || 'missing');
    add('a11y: story reader hides underlying wire', document.getElementById('wire-view')?.getAttribute('aria-hidden') === 'true');
    const firstReaderTitle = document.getElementById('story-reader-title')?.textContent || '';
    const nextStoryButton = document.getElementById('story-reader-next');
    const nextStoryAvailable = !!nextStoryButton && !document.getElementById('story-reader-continue')?.hidden;
    nextStoryButton?.click();
    await new Promise(r => setTimeout(r, 80));
    add('retention: continue reading advances on site',
      nextStoryAvailable && document.getElementById('story-reader-title')?.textContent !== firstReaderTitle,
      nextStoryAvailable ? firstReaderTitle + ' -> ' + (document.getElementById('story-reader-title')?.textContent || '') : 'no next story');
    closeStoryReader();
    add('a11y: wire returns after story close', document.getElementById('wire-view')?.getAttribute('aria-hidden') === 'false');
    window.__wireClose();
    const signupMarkup = deskSignupHtml(['ke', 'ng']);
    add('trust: signup copy matches cloud connection state',
      // Unconfigured shows nothing at all - no form, no "not connected" notice.
      deskSignupConfig() ? signupMarkup.includes('data-desk-signup') : signupMarkup === '');
  } catch (e) {
    add('smoke: dossier flow threw', false, e.message);
  }

  setStoryLens(originalStoryLens);
  const failed = checks.filter(c => !c.pass);
  console.table(checks);
  window.__selftest = { total: checks.length, failed: failed.map(f => f.name + (f.note ? ' (' + f.note + ')' : '')), checks };
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:9999;bottom:12px;right:12px;max-width:360px;background:#111;border:1px solid ' + (failed.length ? '#c0392b' : '#2e7d32') + ';padding:12px 14px;font:11px/1.7 ui-monospace,monospace;color:#e8e6e3;white-space:pre-wrap';
  box.textContent = 'ASJ SELF-TEST  ' + (checks.length - failed.length) + '/' + checks.length + ' passed' +
    (failed.length ? '\n' + failed.map(f => '✗ ' + f.name + (f.note ? ' — ' + f.note : '')).join('\n') : '  ✓');
  document.body.appendChild(box);
}
