const APP_DATA = window.UNITED_AFRICA_DATA || {};

// A story's prose is shipped once, as paragraphs. The published payload used to carry
// `body` as well - the same text joined by blank lines - which was 31% of the file and
// bought the reader nothing. The desk still records both; this rebuilds the field the
// rest of the app reads, so nothing downstream has to know about the change.
// Archived editions come through the same door, hence a function rather than a loop.
function hydrateBriefs(byCountry) {
  if (!byCountry) return byCountry;
  for (const list of Object.values(byCountry)) {
    if (!Array.isArray(list)) continue;
    for (const story of list) {
      if (!story || story.body) continue;
      if (Array.isArray(story.paragraphs) && story.paragraphs.length) {
        story.body = story.paragraphs.join('\n\n');
      }
    }
  }
  return byCountry;
}

const AI_BRIEFS = hydrateBriefs((window.UNITED_AFRICA_BRIEFS && window.UNITED_AFRICA_BRIEFS.byCountry) || {});
const AI_BRIEFS_AT = (window.UNITED_AFRICA_BRIEFS && window.UNITED_AFRICA_BRIEFS.generated) || null;
// Per-country brief dates: the pipeline carries a country's last good briefs through failed
// runs, so its stories can be older than the edition date — show the honest per-country stamp.
const AI_BRIEFS_DATES = (window.UNITED_AFRICA_BRIEFS && window.UNITED_AFRICA_BRIEFS.dates) || {};
// Market heat data (top listed companies) carried by the published edition.
const LIVE_MARKETS = (window.UNITED_AFRICA_BRIEFS && window.UNITED_AFRICA_BRIEFS.markets) || {};
const STORY_LENS_KEY = 'asj:story-lens:v1';
const STORY_READ_KEY = 'asj:story-read:v1';
const STORY_LENSES = ['general','farmers','investors','diaspora'];
const WHY_STOP = new Set('the and for with from that this these those will would could may might has have had their his her they she our not but over after into more than about who which what when are was were been its also can said says'.split(' '));
const WHY_RESTATE_SHARE = 0.6;
const WHY_RESTATE_LEAD_SHARE = 0.7;
const STORY_LENS_LABELS = { general:'Top', farmers:'Farmer', investors:'Investor', diaspora:'Diaspora' };
const STORY_LENS_TOPIC_SCORES = {
  farmers: { Politics:48, Business:62, Sport:24, Tech:52, Climate:88, Agriculture:96, Culture:30, Health:58, Education:54, News:44 },
  investors: { Politics:72, Business:96, Sport:35, Tech:88, Climate:62, Agriculture:68, Culture:38, Health:54, Education:58, News:48 },
  diaspora: { Politics:78, Business:72, Sport:68, Tech:58, Climate:52, Agriculture:48, Culture:88, Health:66, Education:74, News:56 }
};

function normalizeStoryLens(value) {
  const lens = String(value || '').toLowerCase();
  return STORY_LENSES.includes(lens) ? lens : 'general';
}

function readStoryLens() {
  try { return normalizeStoryLens(localStorage.getItem(STORY_LENS_KEY)); }
  catch { return 'general'; }
}

let activeStoryLens = readStoryLens();
document.body.dataset.storyLens = activeStoryLens;

function readStoryHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(STORY_READ_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

let storyReadHistory = readStoryHistory();

function isStoryReadKey(key) {
  return !!storyReadHistory[String(key || '')];
}

function markStoryReadKey(key) {
  const id = String(key || '');
  if (!id) return;
  storyReadHistory[id] = new Date().toISOString();
  const recent = Object.entries(storyReadHistory)
    .sort((a, b) => String(b[1]).localeCompare(String(a[1])))
    .slice(0, 500);
  storyReadHistory = Object.fromEntries(recent);
  try { localStorage.setItem(STORY_READ_KEY, JSON.stringify(storyReadHistory)); } catch {}
  // The landing front page dims stories you have already read, so it needs to know.
  try { window.dispatchEvent(new CustomEvent('asj:story-read', { detail: { key: id } })); } catch {}
}

function storyLensData(story, lens = activeStoryLens) {
  const mode = normalizeStoryLens(lens);
  if (mode === 'general') return { score:100, why:briefWhy(story), explicit:true };
  const raw = story?.lenses?.[mode];
  // lensScores is the index's copy of the score without the why text, so the wire can
  // rank by a reader's lens the moment they pick one - before the deferred half has
  // arrived. Falling through to the topic table instead would rank the paper one way
  // for a second and then reorder it under the reader.
  const parsed = Number(raw?.score ?? story?.lensScores?.[mode]);
  const fallback = STORY_LENS_TOPIC_SCORES[mode]?.[story?.topic || 'News'] ?? 50;
  const score = Number.isFinite(parsed) ? Math.round(Math.max(0, Math.min(100, parsed))) : fallback;
  const lensWhy = String(raw?.why || '').trim();
  const why = lensWhy && !whyRestates(lensWhy, story) ? lensWhy : briefWhy(story);
  return { score, why, explicit:!!raw };
}

function storyFreshnessScore(story) {
  const published = Date.parse(story?.published || '');
  if (!Number.isFinite(published)) return 55;
  const ageHours = Math.max(0, (Date.now() - published) / 3600000);
  if (ageHours <= 18) return 100;
  if (ageHours <= 36) return 82;
  if (ageHours <= 60) return 64;
  if (ageHours <= 96) return 42;
  return 20;
}

function storyLensRank(story, lens = activeStoryLens, sourceIndex = 0) {
  const rawEditorial = Number(story?.selectionScore ?? story?.editorialScore);
  // A scored story lands on 4x its desk score; the 28 August edition ran from 3 to 90.2
  // with a median of 45. The fallback for an unscored story used to be 92 - rank*10,
  // which put it ABOVE every scored story in the paper: three hand-written Western
  // Sahara briefs from 21 August, carrying no score at all, took the lead slot and the
  // highlights grid off a full desk of same-day reporting.
  //
  // No score is not evidence of a good story, it is absence of evidence, so the honest
  // prior is the middle of the pack. Ranking within the country is preserved.
  const editorial = Number.isFinite(rawEditorial) && rawEditorial > 0
    ? Math.max(0, Math.min(100, rawEditorial * 4))
    : Math.max(20, 45 - sourceIndex * 6);
  const mode = normalizeStoryLens(lens);
  if (mode === 'general') return editorial;
  return editorial * 0.60 + storyLensData(story, mode).score * 0.30 + storyFreshnessScore(story) * 0.10;
}

function rankStoryEntries(stories, lens = activeStoryLens) {
  const mode = normalizeStoryLens(lens);
  const entries = (stories || []).map((story, sourceIndex) => ({
    story,
    sourceIndex,
    lensRank:storyLensRank(story, mode, sourceIndex)
  }));
  if (mode === 'general') return entries;
  return entries.sort((a, b) => b.lensRank - a.lensRank || a.sourceIndex - b.sourceIndex);
}

function updateStoryLensControls() {
  // The lens is chosen in one place only: the Wire's "Reading for" select. Country pages
  // used to carry their own Top / Farmers / Investors / Diaspora buttons; they read in
  // the desk's own order now.
  const lensSelect = document.getElementById('wire-lens-select');
  if (lensSelect && lensSelect.value !== activeStoryLens) lensSelect.value = activeStoryLens;
}

function persistStoryLens(lens) {
  try { localStorage.setItem(STORY_LENS_KEY, lens); } catch {}
  // Keep the existing saved-desk form aligned on this device. Cross-device updates still
  // require an authenticated profile; the public signup table is intentionally insert-only.
  try {
    const signup = JSON.parse(localStorage.getItem('asj:desk-signup:v1') || 'null');
    if (signup && typeof signup === 'object') {
      signup.audience = lens;
      if (signup.email) signup.synced = false;
      localStorage.setItem('asj:desk-signup:v1', JSON.stringify(signup));
    }
  } catch {}
}

function setStoryLens(lens, options = {}) {
  activeStoryLens = normalizeStoryLens(lens);
  document.body.dataset.storyLens = activeStoryLens;
  persistStoryLens(activeStoryLens);
  updateStoryLensControls();
  if (options.syncSignals !== false && activeStoryLens !== 'general' && audienceSelect) {
    audienceSelect.value = activeStoryLens;
    updateAudienceMeta();
    if (activeCountryMap) renderAudienceKpis(activeCountryMap.countryId, COUNTRY_INFO[activeCountryMap.countryId]);
  }
  if (activeCountryMap) renderNewsPanel(activeCountryMap.countryId, activeStoryFeed);
  renderYourDesk();
  window.dispatchEvent(new CustomEvent('asj:lenschange', { detail:{ lens:activeStoryLens } }));
}
const COUNTRY_CURRENCY = {
  dz:'DZD',so:'SOS',zw:'ZWG',zm:'ZMW',za:'ZAR',ug:'UGX',tz:'TZS',tn:'TND',tg:'XOF',td:'XAF',
  sz:'SZL',sl:'SLE',sn:'XOF',ss:'SSP',sd:'SDG',eh:'MAD',rw:'RWF',ng:'NGN',ne:'XOF',na:'NAD',
  mw:'MWK',mr:'MRU',mz:'MZN',ml:'XOF',mg:'MGA',ma:'MAD',ls:'LSL',ly:'LYD',lr:'LRD',ke:'KES',
  gq:'XAF',gw:'XOF',gm:'GMD',gn:'GNF',gh:'GHS',ga:'XAF',et:'ETB',er:'ERN',eg:'EGP',dj:'DJF',
  cg:'XAF',cd:'CDF',cm:'XAF',ci:'XOF',cf:'XAF',bw:'BWP',bf:'XOF',bj:'XOF',bi:'BIF',ao:'AOA',
  cv:'CVE',st:'STN',km:'KMF',mu:'MUR',sc:'SCR'
};

// Primary capital-market venues. Regional exchanges are assigned to every member
// country; an absent entry is rendered as unverified instead of borrowing a venue.
const MARKET_DIRECTORY = {
  dz:{exchange:'SGBV',name:'Algiers Stock Exchange',scope:'Domestic',url:'https://www.sgbv.dz/'},
  so:{exchange:'NSES',name:'National Securities Exchange of Somalia',scope:'Developing',url:'https://www.nses.so/'},
  zw:{exchange:'ZSE',name:'Zimbabwe Stock Exchange',scope:'Domestic',url:'https://www.zse.co.zw/'},
  zm:{exchange:'LuSE',name:'Lusaka Securities Exchange',scope:'Domestic',url:'https://www.luse.co.zm/'},
  za:{exchange:'JSE',name:'Johannesburg Stock Exchange',scope:'Domestic',url:'https://www.jse.co.za/'},
  ug:{exchange:'USE',name:'Uganda Securities Exchange',scope:'Domestic',url:'https://www.use.or.ug/'},
  tz:{exchange:'DSE',name:'Dar es Salaam Stock Exchange',scope:'Domestic',url:'https://www.dse.co.tz/'},
  tn:{exchange:'BVMT',name:'Bourse de Tunis',scope:'Domestic',url:'https://www.bvmt.com.tn/'},
  tg:{exchange:'BRVM',name:'Regional Securities Exchange',scope:'Regional',url:'https://www.brvm.org/'},
  td:{exchange:'BVMAC',name:'Central African Stock Exchange',scope:'Regional',url:'https://www.bvm-ac.org/'},
  sz:{exchange:'ESE',name:'Eswatini Stock Exchange',scope:'Domestic',url:'https://www.ese.co.sz/'},
  sl:{exchange:'SLSE',name:'Sierra Leone Stock Exchange',scope:'Limited',url:'https://slssec.com/'},
  sn:{exchange:'BRVM',name:'Regional Securities Exchange',scope:'Regional',url:'https://www.brvm.org/'},
  sd:{exchange:'KSE',name:'Khartoum Stock Exchange',scope:'Disrupted',url:''},
  rw:{exchange:'RSE',name:'Rwanda Stock Exchange',scope:'Domestic',url:'https://www.rse.rw/'},
  ng:{exchange:'NGX',name:'Nigerian Exchange',scope:'Domestic',url:'https://ngxgroup.com/'},
  ne:{exchange:'BRVM',name:'Regional Securities Exchange',scope:'Regional',url:'https://www.brvm.org/'},
  na:{exchange:'NSX',name:'Namibian Stock Exchange',scope:'Domestic',url:'https://nsx.com.na/'},
  mw:{exchange:'MSE',name:'Malawi Stock Exchange',scope:'Domestic',url:'https://mse.co.mw/'},
  mz:{exchange:'BVM',name:'Mozambique Stock Exchange',scope:'Domestic',url:'https://www.bvm.co.mz/'},
  ml:{exchange:'BRVM',name:'Regional Securities Exchange',scope:'Regional',url:'https://www.brvm.org/'},
  ma:{exchange:'CSE',name:'Casablanca Stock Exchange',scope:'Domestic',url:'https://www.casablanca-bourse.com/'},
  ls:{exchange:'MSM',name:'Maseru Securities Market',scope:'Domestic',url:'https://www.centralbank.org.ls/'},
  ly:{exchange:'LSM',name:'Libyan Stock Market',scope:'Reopened',url:'https://www.lsm.gov.ly/'},
  ke:{exchange:'NSE',name:'Nairobi Securities Exchange',scope:'Domestic',url:'https://www.nse.co.ke/'},
  gq:{exchange:'BVMAC',name:'Central African Stock Exchange',scope:'Regional',url:'https://www.bvm-ac.org/'},
  gw:{exchange:'BRVM',name:'Regional Securities Exchange',scope:'Regional',url:'https://www.brvm.org/'},
  gh:{exchange:'GSE',name:'Ghana Stock Exchange',scope:'Domestic',url:'https://gse.com.gh/'},
  ga:{exchange:'BVMAC',name:'Central African Stock Exchange',scope:'Regional',url:'https://www.bvm-ac.org/'},
  et:{exchange:'ESX',name:'Ethiopian Securities Exchange',scope:'Developing',url:'https://esx.et/'},
  eg:{exchange:'EGX',name:'Egyptian Exchange',scope:'Domestic',url:'https://www.egx.com.eg/'},
  cg:{exchange:'BVMAC',name:'Central African Stock Exchange',scope:'Regional',url:'https://www.bvm-ac.org/'},
  cm:{exchange:'BVMAC',name:'Central African Stock Exchange',scope:'Regional',url:'https://www.bvm-ac.org/'},
  ci:{exchange:'BRVM',name:'Regional Securities Exchange',scope:'Regional',url:'https://www.brvm.org/'},
  cf:{exchange:'BVMAC',name:'Central African Stock Exchange',scope:'Regional',url:'https://www.bvm-ac.org/'},
  bw:{exchange:'BSE',name:'Botswana Stock Exchange',scope:'Domestic',url:'https://www.bse.co.bw/'},
  bf:{exchange:'BRVM',name:'Regional Securities Exchange',scope:'Regional',url:'https://www.brvm.org/'},
  bj:{exchange:'BRVM',name:'Regional Securities Exchange',scope:'Regional',url:'https://www.brvm.org/'},
  ao:{exchange:'BODIVA',name:'Angola Debt and Securities Exchange',scope:'Developing',url:'https://www.bodiva.ao/'},
  cv:{exchange:'BVC',name:'Cabo Verde Stock Exchange',scope:'Domestic',url:'https://bvc.cv/'},
  mu:{exchange:'SEM',name:'Stock Exchange of Mauritius',scope:'Domestic',url:'https://www.stockexchangeofmauritius.com/'},
  sc:{exchange:'MERJ',name:'MERJ Exchange',scope:'Domestic',url:'https://merj.exchange/'}
};

// Verified issuer destinations. Unmapped companies fall back to the country's
// official exchange rather than an ambiguous ticker search.
const ISSUER_DIRECTORY = {
  ke: {
    SCOM:{name:'Safaricom',url:'https://www.safaricom.co.ke/investor-relations',label:'Investor relations'},
    EQTY:{name:'Equity Group Holdings',url:'https://equitygroupholdings.com/investor-relations/',label:'Investor relations'},
    KCB:{name:'KCB Group',url:'https://kcbgroup.com/investor-relations/',label:'Investor relations'},
    EABL:{name:'East African Breweries',url:'https://www.eabl.com/investors',label:'Investor relations'},
    COOP:{name:'Co-operative Bank of Kenya',url:'https://www.co-opbank.co.ke/investor-relations/',label:'Investor relations'},
    ABSA:{name:'Absa Bank Kenya',url:'https://www.absabank.co.ke/',label:'Official company site'},
    SBIC:{name:'Stanbic Holdings',url:'https://www.stanbicbank.co.ke/',label:'Official company site'},
    BAT:{name:'BAT Kenya',url:'https://www.batkenya.com/',label:'Official company site'}
  }
};

// Main listings for each exchange, tickers only. These carried made-up "cap" and "change"
// numbers; nothing showed them, and nothing should.
const MARKETS_SEED = {
  ng: { exchange:'NGX', name:'Nigerian Exchange', companies:[
    {t:'AIRTELAFRI'},{t:'DANGCEM'},{t:'BUACEMENT'},
    {t:'MTNN'},{t:'SEPLAT'},{t:'GTCO'},
    {t:'ZENITHBANK'},{t:'UBA'},{t:'NESTLE'},{t:'NB'} ] },
  za: { exchange:'JSE', name:'Johannesburg', companies:[
    {t:'NPN'},{t:'CFR'},{t:'AGL'},{t:'FSR'},
    {t:'SBK'},{t:'CPI'},{t:'MTN'},{t:'VOD'},
    {t:'SOL'},{t:'BTI'} ] },
  ke: { exchange:'NSE', name:'Nairobi', companies:[
    {t:'SCOM'},{t:'EQTY'},{t:'KCB'},{t:'EABL'},
    {t:'COOP'},{t:'ABSA'},{t:'SBIC'},{t:'BAT'} ] },
  eg: { exchange:'EGX', name:'Egyptian Exchange', companies:[
    {t:'COMI'},{t:'TMGH'},{t:'SWDY'},{t:'HRHO'},
    {t:'ETEL'},{t:'EFIH'},{t:'FWRY'},{t:'ABUK'} ] },
  ma: { exchange:'CSE', name:'Casablanca', companies:[
    {t:'IAM'},{t:'ATW'},{t:'BCP'},{t:'LHM'},
    {t:'BOA'},{t:'MSA'},{t:'CMA'},{t:'GAZ'} ] },
  gh: { exchange:'GSE', name:'Ghana', companies:[
    {t:'MTNGH'},{t:'SCB'},{t:'GCB'},{t:'EGH'},
    {t:'TOTAL'},{t:'GOIL'},{t:'CAL'} ] },
  tn: { exchange:'BVMT', name:'Tunis', companies:[
    {t:'SFBT'},{t:'BIAT'},{t:'POULINA'},{t:'ATB'},
    {t:'BT'},{t:'TELNET'} ] },
  mu: { exchange:'SEM', name:'Mauritius', companies:[
    {t:'MCBG'},{t:'SBMH'},{t:'IBL'},{t:'ENL'},
    {t:'CIEL'},{t:'ALTEO'} ] },
  ci: { exchange:'BRVM', name:'Abidjan · regional', companies:[
    {t:'SNTS'},{t:'ETIT'},{t:'ORAC'},{t:'SGBC'},
    {t:'SLBC'},{t:'BOAB'},{t:'NTLC'},{t:'PALC'} ] },
  tz: { exchange:'DSE', name:'Dar es Salaam', companies:[
    {t:'TBL'},{t:'NMB'},{t:'CRDB'},{t:'VODA'},
    {t:'TPCC'},{t:'TCC'},{t:'SWIS'} ] },
  ug: { exchange:'USE', name:'Uganda', companies:[
    {t:'MTNU'},{t:'SBU'},{t:'UMEME'},{t:'DFCU'},
    {t:'BATU'},{t:'EBL'} ] },
  zw: { exchange:'ZSE', name:'Zimbabwe', companies:[
    {t:'DLTA'},{t:'ECO'},{t:'INN'},{t:'OMU'},
    {t:'SEED'},{t:'CBZ'},{t:'NMBZ'} ] },
  bw: { exchange:'BSE', name:'Botswana', companies:[
    {t:'FNBB'},{t:'LETSHEGO'},{t:'BIHL'},{t:'ABSA'},
    {t:'SCBB'},{t:'SEFA'} ] },
  zm: { exchange:'LuSE', name:'Lusaka', companies:[
    {t:'ZCCM'},{t:'ZANACO'},{t:'CEC'},{t:'ZSUG'},
    {t:'LAFA'},{t:'REIZ'} ] },
  rw: { exchange:'RSE', name:'Rwanda', companies:[
    {t:'BOK'},{t:'BRALIRWA'},{t:'IMR'},{t:'CTL'},
    {t:'RHB'} ] },
  na: { exchange:'NSX', name:'Namibia', companies:[
    {t:'CAP'},{t:'FNB'},{t:'NBS'},{t:'ORY'},
    {t:'LHN'},{t:'NHL'} ] }
};
// Listings are refreshed on the owner's PC after the desk has run, so the copy inside
// briefs.js can be days behind data/markets.json (23 October against 28 October on the
// 28th). The investor panel fetches the file itself and keeps whichever copy is newer.
const MARKETS_FILE = { data: null, loading: null };
function loadMarketsFile() {
  if (MARKETS_FILE.data || MARKETS_FILE.loading) return MARKETS_FILE.loading;
  MARKETS_FILE.loading = fetch('data/markets.json?h=' + Math.floor(Date.now() / 3600000))
    .then(r => r.ok ? r.json() : {})
    .catch(() => ({}))
    .then(j => { MARKETS_FILE.data = j && typeof j === 'object' ? j : {}; return MARKETS_FILE.data; });
  return MARKETS_FILE.loading;
}
// A day's move this large is a listing error, not news: Nairobi caps a day at 10%, and
// on 28 October AFX had Olympia Capital up 188.9%.
const MARKET_MOVE_CEILING = 50;

function marketsForCountry(id){
  const embedded = LIVE_MARKETS[id];
  const fetched = MARKETS_FILE.data?.[id];
  const live = String(fetched?.asOf || '') > String(embedded?.asOf || '') ? fetched : embedded;
  // Judge market data by ITS OWN asOf, not by when the stories were written. These were
  // the same test, and because stories refresh daily it was always true - so prices from
  // November 2025 were labelled isLive. That is the one thing a markets panel must not do.
  // Five days covers a weekend plus a public holiday; beyond that the panel falls back to
  // the seed and says plainly that it is not live.
  const asOfAt = Date.parse((live && live.asOf) || "");
  const fresh = Number.isFinite(asOfAt) && (Date.now() - asOfAt) < 5 * 24 * 60 * 60 * 1000;
  if (fresh && live && Array.isArray(live.companies) && live.companies.length) {
    return { ...live, isLive:true, asOf:live.asOf };
  }
  // Stale real data still beats nothing. Algeria has AFX rows from June and no seed
  // entry, so rejecting stale prices outright left its panel empty. Show what was
  // actually fetched, flagged not-live and carrying its own asOf, and let the reader
  // judge. Only fall through to the seed when there is no fetched data at all.
  if (live && Array.isArray(live.companies) && live.companies.length) {
    return { ...live, isLive:false, asOf:live.asOf || null };
  }
  const seed = MARKETS_SEED[id];
  return seed ? { ...seed, isLive:false, asOf:null } : null;
}
function marketProfileForCountry(id){
  const profile = MARKET_DIRECTORY[id] || null;
  const market = marketsForCountry(id);
  if (!profile) return { exchange:null, name:'No domestic securities exchange verified', scope:'Unverified', url:'', market };
  return { ...profile, market };
}
function issuerForCountry(countryId, ticker){
  return ISSUER_DIRECTORY[countryId]?.[String(ticker || '').toUpperCase()] || null;
}
function formatFxRate(rate) {
  if (!Number.isFinite(rate)) return 'Unavailable';
  if (rate >= 1000) return Math.round(rate).toLocaleString('en-US');
  if (rate >= 10) return rate.toFixed(2);
  return rate.toFixed(3);
}

function formatFxDate(value) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    month:'short', day:'numeric', year:'numeric', timeZone:'UTC'
  }).format(date);
}

function formatShortDate(value) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    month:'short', day:'numeric', year:'numeric', timeZone:'UTC'
  }).format(date);
}

function latestBriefDate() {
  const dates = Object.values(AI_BRIEFS_DATES || {})
    .concat(AI_BRIEFS_AT || [])
    .map(value => String(value || '').slice(0, 10))
    .filter(Boolean)
    .sort();
  return dates[dates.length - 1] || '';
}

function isStaleDate(value, days = 3) {
  const date = new Date(String(value || '').slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime())) return false;
  return (Date.now() - date.getTime()) > days * 86400000;
}

// Dated more than `days` days before the edition on the page. This was measured from the
// clock: at 01:00 UTC on 29 October the 28 October lead, a 27 October strike that killed
// 102 people, was "over two days old" and a bail hearing led the paper instead.
function isBeforeEdition(value, days = 1) {
  const date = Date.parse(String(value || '').slice(0, 10) + 'T00:00:00Z');
  const edition = Date.parse(latestBriefDate() + 'T00:00:00Z');
  if (!Number.isFinite(date) || !Number.isFinite(edition)) return isStaleDate(value, 2);
  return edition - date > days * 86400000;
}

// "News" is the desk's catch-all topic, not a section; a kicker that says "News" over a
// news story says nothing, so it is left off.
function shownTopic(topic) {
  return topic && topic !== 'News' ? topic : '';
}
function topicKicker(topic) {
  const shown = shownTopic(topic);
  return shown ? '<span class="dot"></span><span class="wire-item-topic">' + escapeHtml(shown) + '</span>' : '';
}

const COUNTRIES = APP_DATA.countries || [];
const COUNTRY_DETAIL = APP_DATA.countryDetail || {};
const COUNTRY_GIS = APP_DATA.countryGis || {};
const WORLD_BANK_ECONOMY = APP_DATA.worldBankEconomy || {};

// pop: mid-2025 estimate, gr: annual growth rate (fraction), cc: ISO 3166-1 alpha-2
const INVESTOR_INFO = {
  ng: { gdp: '$377B', gdp_growth: 3.4, fdi: '$1.9B', currency: 'NGN', sectors: ['Oil & Gas', 'Fintech', 'Agriculture', 'Telecoms'], risk: 'med', climate: 131, access: 'Open' },
  za: { gdp: '$480B', gdp_growth: 1.5, fdi: '$5.2B', currency: 'ZAR', sectors: ['Mining', 'Finance', 'Manufacturing', 'Tourism'], risk: 'med', climate: 84, access: 'Open' },
  ke: { gdp: '$147B', gdp_growth: 5.0, fdi: '$1.5B', currency: 'KES', sectors: ['Tech', 'Agriculture', 'Tourism', 'Logistics'], risk: 'low', climate: 56, access: 'Open' },
  eg: { gdp: '$430B', gdp_growth: 4.0, fdi: '$10B', currency: 'EGP', sectors: ['Energy', 'Tourism', 'Construction', 'ICT'], risk: 'med', climate: 114, access: 'Open' },
  et: { gdp: '$122B', gdp_growth: 7.5, fdi: '$3.3B', currency: 'ETB', sectors: ['Manufacturing', 'Agriculture', 'Textiles', 'Energy'], risk: 'high', climate: 159, access: 'Restricted' },
  ma: { gdp: '$194B', gdp_growth: 3.8, fdi: '$1.6B', currency: 'MAD', sectors: ['Automotive', 'Tourism', 'Renewables', 'Aerospace'], risk: 'low', climate: 53, access: 'Open' },
  gh: { gdp: '$118B', gdp_growth: 5.0, fdi: '$1.5B', currency: 'GHS', sectors: ['Cocoa', 'Gold', 'Oil', 'Fintech'], risk: 'med', climate: 118, access: 'Open' },
  ci: { gdp: '$112B', gdp_growth: 6.3, fdi: '$1.7B', currency: 'XOF', sectors: ['Cocoa', 'Cashew', 'Energy', 'Banking'], risk: 'med', climate: 110, access: 'Open' },
  tz: { gdp: '$95B', gdp_growth: 6.0, fdi: '$1.2B', currency: 'TZS', sectors: ['Mining', 'Tourism', 'Agriculture', 'Energy'], risk: 'med', climate: 141, access: 'Open' },
  rw: { gdp: '$16B', gdp_growth: 8.5, fdi: '$0.4B', currency: 'RWF', sectors: ['Services', 'Tourism', 'ICT', 'Construction'], risk: 'low', climate: 38, access: 'Open' },
  sn: { gdp: '$40B', gdp_growth: 8.0, fdi: '$2.6B', currency: 'XOF', sectors: ['Energy', 'Mining', 'Fisheries', 'Agriculture'], risk: 'low', climate: 123, access: 'Open' },
  dz: { gdp: '$317B', gdp_growth: 3.5, fdi: '$1.1B', currency: 'DZD', sectors: ['Energy', 'Construction', 'Agriculture', 'Telecoms'], risk: 'med', climate: 143, access: 'Restricted' },
  ao: { gdp: '$152B', gdp_growth: 3.0, fdi: '$4.6B', currency: 'AOA', sectors: ['Oil & Gas', 'Construction', 'Agriculture', 'Logistics'], risk: 'high', climate: 162, access: 'Open' },
  ug: { gdp: '$73B', gdp_growth: 6.0, fdi: '$2.9B', currency: 'UGX', sectors: ['Agriculture', 'Oil & Gas', 'Tourism', 'ICT'], risk: 'med', climate: 142, access: 'Open' },
  tn: { gdp: '$61B', gdp_growth: 1.6, fdi: '$0.6B', currency: 'TND', sectors: ['Automotive', 'Tourism', 'Manufacturing', 'ICT'], risk: 'med', climate: 103, access: 'Open' },
  cm: { gdp: '$65B', gdp_growth: 4.0, fdi: '$0.8B', currency: 'XAF', sectors: ['Oil & Gas', 'Agriculture', 'Timber', 'Telecoms'], risk: 'high', climate: 154, access: 'Open' },
  zm: { gdp: '$41B', gdp_growth: 6.0, fdi: '$0.4B', currency: 'ZMW', sectors: ['Copper Mining', 'Agriculture', 'Tourism', 'Energy'], risk: 'med', climate: 147, access: 'Open' },
  mz: { gdp: '$23B', gdp_growth: 3.0, fdi: '$2.9B', currency: 'MZN', sectors: ['LNG', 'Mining', 'Agriculture', 'Ports'], risk: 'high', climate: 168, access: 'Open' },
  bw: { gdp: '$21B', gdp_growth: 3.0, fdi: '$0.3B', currency: 'BWP', sectors: ['Diamonds', 'Tourism', 'Finance', 'Beef'], risk: 'low', climate: 89, access: 'Open' },
  mu: { gdp: '$16B', gdp_growth: 5.0, fdi: '$0.4B', currency: 'MUR', sectors: ['Tourism', 'Finance', 'Ports', 'ICT'], risk: 'low', climate: 72, access: 'Open' },
  sc: { gdp: '$2.3B', gdp_growth: 4.0, fdi: '$0.2B', currency: 'SCR', sectors: ['Tourism', 'Fisheries', 'Finance', 'Ports'], risk: 'low', climate: 58, access: 'Open' },
  cv: { gdp: '$3B', gdp_growth: 5.0, fdi: '$0.1B', currency: 'CVE', sectors: ['Tourism', 'Ports', 'Renewables', 'Fisheries'], risk: 'med', climate: 91, access: 'Open' },
  cd: { gdp: '$123B', gdp_growth: 5.5, fdi: '$2.0B', currency: 'CDF', sectors: ['Copper', 'Cobalt', 'Mining', 'Agriculture'], risk: 'high', climate: 180, access: 'Open' },
  zw: { gdp: '$57B', gdp_growth: 3.0, fdi: '$0.4B', currency: 'ZWG', sectors: ['Mining', 'Agriculture', 'Tobacco', 'Tourism'], risk: 'high', climate: 150, access: 'Restricted' },
  ly: { gdp: '$52B', gdp_growth: 8.0, fdi: '$0.5B', currency: 'LYD', sectors: ['Oil & Gas', 'Construction', 'Energy', 'Logistics'], risk: 'high', climate: 170, access: 'Restricted' },
  sd: { gdp: '$45B', gdp_growth: -5.0, fdi: '$0.3B', currency: 'SDG', sectors: ['Agriculture', 'Gold', 'Livestock', 'Oil'], risk: 'high', climate: 176, access: 'Restricted' },
  ss: {
    gdp:'$12B', gdpYear:2015, gdp_growth:-10.8, growthYear:2015, fdi:'$83M', fdiYear:2024,
    currency:'SSP', sectors:['Oil & Gas','Agriculture','Infrastructure','Telecoms'],
    risk:'high', climate:175, access:'Selective', estimated:false, source:'World Bank',
    gdpSeries:[
      {year:2011,value:14.907},{year:2012,value:11.931},{year:2013,value:18.426},
      {year:2014,value:13.962},{year:2015,value:11.998}
    ]
  }
};

// The Atlas frame for countries whose remote islands would shrink the inhabited land to a
// speck: Seychelles' outer islands put Mahe at 3% of the frame's width, Annobon left
// Equatorial Guinea at a third. Used by every view (embedded, phone, fullscreen); what the
// crop leaves out is shown in a locator inset (drawAtlasLocator). The name is kept:
// scripts/build-country-relief.ps1 reads this block to cut the -focus relief images.
const ISLAND_FULLSCREEN_BOUNDS = {
  mu: { minX: 57.28, maxX: 57.88, minY: 19.92, maxY: 20.58 },
  sc: { minX: 55.34, maxX: 55.56, minY: 4.54, maxY: 4.82 },
  cv: { minX: -25.42, maxX: -22.52, minY: -17.45, maxY: -14.72 },
  km: { minX: 43.12, maxX: 44.58, minY: 11.18, maxY: 12.45 },
  st: { minX: 6.40, maxX: 7.58, minY: -1.78, maxY: 0.12 },
  gq: { minX: 8.30, maxX: 11.45, minY: -3.85, maxY: -0.70 }
};

const COUNTRY_INFO = {
  dz: { name: 'Algeria',                  region: 'North Africa',    capital: 'Algiers',        pop: 46800000,  gr: 0.015, cc: 'dz' },
  so: { name: 'Somalia',                  region: 'East Africa',     capital: 'Mogadishu',      pop: 18100000,  gr: 0.029, cc: 'so' },
  zw: { name: 'Zimbabwe',                 region: 'Southern Africa', capital: 'Harare',         pop: 16600000,  gr: 0.019, cc: 'zw' },
  zm: { name: 'Zambia',                   region: 'Southern Africa', capital: 'Lusaka',         pop: 20900000,  gr: 0.027, cc: 'zm' },
  za: { name: 'South Africa',             region: 'Southern Africa', capital: 'Pretoria',       pop: 62000000,  gr: 0.008, cc: 'za' },
  ug: { name: 'Uganda',                   region: 'East Africa',     capital: 'Kampala',        pop: 49600000,  gr: 0.030, cc: 'ug' },
  tz: { name: 'Tanzania',                 region: 'East Africa',     capital: 'Dodoma',         pop: 67400000,  gr: 0.029, cc: 'tz' },
  tn: { name: 'Tunisia',                  region: 'North Africa',    capital: 'Tunis',          pop: 12500000,  gr: 0.008, cc: 'tn' },
  tg: { name: 'Togo',                     region: 'West Africa',     capital: 'Lome',           pop: 9300000,   gr: 0.023, cc: 'tg' },
  td: { name: 'Chad',                     region: 'Central Africa',  capital: "N'Djamena",      pop: 18500000,  gr: 0.030, cc: 'td' },
  sz: { name: 'Eswatini',                 region: 'Southern Africa', capital: 'Mbabane',        pop: 1200000,   gr: 0.008, cc: 'sz' },
  sl: { name: 'Sierra Leone',             region: 'West Africa',     capital: 'Freetown',       pop: 8800000,   gr: 0.020, cc: 'sl' },
  sn: { name: 'Senegal',                  region: 'West Africa',     capital: 'Dakar',          pop: 18400000,  gr: 0.025, cc: 'sn' },
  ss: { name: 'South Sudan',              region: 'East Africa',     capital: 'Juba',           pop: 11500000,  gr: 0.009, cc: 'ss' },
  sd: { name: 'Sudan',                    region: 'North Africa',    capital: 'Khartoum',       pop: 48100000,  gr: 0.025, cc: 'sd' },
  eh: { name: 'Western Sahara',           region: 'North Africa',    capital: 'Laayoune',       pop: 620000,    gr: 0.025, cc: 'eh' },
  rw: { name: 'Rwanda',                   region: 'East Africa',     capital: 'Kigali',         pop: 14300000,  gr: 0.023, cc: 'rw' },
  ng: { name: 'Nigeria',                  region: 'West Africa',     capital: 'Abuja',          pop: 230000000, gr: 0.024, cc: 'ng' },
  ne: { name: 'Niger',                    region: 'West Africa',     capital: 'Niamey',         pop: 27200000,  gr: 0.037, cc: 'ne' },
  na: { name: 'Namibia',                  region: 'Southern Africa', capital: 'Windhoek',       pop: 2700000,   gr: 0.014, cc: 'na' },
  mw: { name: 'Malawi',                   region: 'East Africa',     capital: 'Lilongwe',       pop: 21500000,  gr: 0.026, cc: 'mw' },
  mr: { name: 'Mauritania',               region: 'West Africa',     capital: 'Nouakchott',     pop: 4900000,   gr: 0.026, cc: 'mr' },
  mz: { name: 'Mozambique',               region: 'East Africa',     capital: 'Maputo',         pop: 34000000,  gr: 0.027, cc: 'mz' },
  ml: { name: 'Mali',                     region: 'West Africa',     capital: 'Bamako',         pop: 23300000,  gr: 0.030, cc: 'ml' },
  mg: { name: 'Madagascar',               region: 'East Africa',     capital: 'Antananarivo',   pop: 30300000,  gr: 0.024, cc: 'mg' },
  ma: { name: 'Morocco',                  region: 'North Africa',    capital: 'Rabat',          pop: 37800000,  gr: 0.010, cc: 'ma' },
  ls: { name: 'Lesotho',                  region: 'Southern Africa', capital: 'Maseru',         pop: 2300000,   gr: 0.007, cc: 'ls' },
  ly: { name: 'Libya',                    region: 'North Africa',    capital: 'Tripoli',        pop: 7100000,   gr: 0.010, cc: 'ly' },
  lr: { name: 'Liberia',                  region: 'West Africa',     capital: 'Monrovia',       pop: 5500000,   gr: 0.023, cc: 'lr' },
  ke: { name: 'Kenya',                    region: 'East Africa',     capital: 'Nairobi',        pop: 56600000,  gr: 0.019, cc: 'ke' },
  gq: { name: 'Equatorial Guinea',        region: 'Central Africa',  capital: 'Malabo',         pop: 1700000,   gr: 0.032, cc: 'gq' },
  gw: { name: 'Guinea-Bissau',            region: 'West Africa',     capital: 'Bissau',         pop: 2200000,   gr: 0.024, cc: 'gw' },
  gm: { name: 'Gambia',                   region: 'West Africa',     capital: 'Banjul',         pop: 2800000,   gr: 0.025, cc: 'gm' },
  gn: { name: 'Guinea',                   region: 'West Africa',     capital: 'Conakry',        pop: 14600000,  gr: 0.024, cc: 'gn' },
  gh: { name: 'Ghana',                    region: 'West Africa',     capital: 'Accra',          pop: 34100000,  gr: 0.019, cc: 'gh' },
  ga: { name: 'Gabon',                    region: 'Central Africa',  capital: 'Libreville',     pop: 2500000,   gr: 0.023, cc: 'ga' },
  et: { name: 'Ethiopia',                 region: 'East Africa',     capital: 'Addis Ababa',    pop: 129000000, gr: 0.025, cc: 'et' },
  er: { name: 'Eritrea',                  region: 'East Africa',     capital: 'Asmara',         pop: 3700000,   gr: 0.011, cc: 'er' },
  eg: { name: 'Egypt',                    region: 'North Africa',    capital: 'Cairo',          pop: 106000000, gr: 0.016, cc: 'eg' },
  cv: { name: 'Cabo Verde',               region: 'West Africa',     capital: 'Praia',          pop: 520000,    gr: 0.006, cc: 'cv' },
  dj: { name: 'Djibouti',                 region: 'East Africa',     capital: 'Djibouti City',  pop: 1100000,   gr: 0.013, cc: 'dj' },
  cg: { name: 'Republic of Congo',        region: 'Central Africa',  capital: 'Brazzaville',    pop: 6200000,   gr: 0.024, cc: 'cg' },
  cd: { name: 'DR Congo',                 region: 'Central Africa',  capital: 'Kinshasa',       pop: 105000000, gr: 0.031, cc: 'cd' },
  cm: { name: 'Cameroon',                 region: 'Central Africa',  capital: 'Yaounde',        pop: 29300000,  gr: 0.025, cc: 'cm' },
  ci: { name: "Cote d'Ivoire",            region: 'West Africa',     capital: 'Yamoussoukro',   pop: 29400000,  gr: 0.024, cc: 'ci' },
  cf: { name: 'Central African Republic', region: 'Central Africa',  capital: 'Bangui',         pop: 5600000,   gr: 0.018, cc: 'cf' },
  bw: { name: 'Botswana',                 region: 'Southern Africa', capital: 'Gaborone',       pop: 2600000,   gr: 0.015, cc: 'bw' },
  bf: { name: 'Burkina Faso',             region: 'West Africa',     capital: 'Ouagadougou',    pop: 23000000,  gr: 0.025, cc: 'bf' },
  bj: { name: 'Benin',                    region: 'West Africa',     capital: 'Porto-Novo',     pop: 13700000,  gr: 0.026, cc: 'bj' },
  bi: { name: 'Burundi',                  region: 'East Africa',     capital: 'Gitega',         pop: 13600000,  gr: 0.027, cc: 'bi' },
  ao: { name: 'Angola',                   region: 'Southern Africa', capital: 'Luanda',         pop: 37000000,  gr: 0.031, cc: 'ao' },
  st: { name: 'Sao Tome and Principe',    region: 'Central Africa',  capital: 'Sao Tome',       pop: 240000,    gr: 0.019, cc: 'st' },
  km: { name: 'Comoros',                  region: 'East Africa',     capital: 'Moroni',         pop: 870000,    gr: 0.018, cc: 'km' },
  mu: { name: 'Mauritius',                region: 'East Africa',     capital: 'Port Louis',     pop: 1260000,   gr: 0.001, cc: 'mu' },
  sc: { name: 'Seychelles',               region: 'East Africa',     capital: 'Victoria',       pop: 120000,    gr: 0.006, cc: 'sc' }
};

const drawableCountries = COUNTRIES.map(country => ({
  ...country,
  info: COUNTRY_INFO[country.id]
})).filter(country => country.info);

// One point per country for each landmark ([lon, lat] keyed by country), so a feature
// shared by several countries is marked inside each of them. With a single point, the
// inside-the-outline check kept Lake Victoria only in Uganda, the Nile only in Sudan
// and the Sahara only in Niger, and Kilimanjaro - in Tanzania - was drawn in Kenya.
// Every country has at least one; the self-test checks both rules for all 55.
// Positions checked on 22 Oct 2026: peaks, falls and parks against Wikidata's
// coordinates; lakes inside their mapped water and the country (OpenStreetMap, Natural
// Earth); rivers on a vertex of the river the Atlas draws. Lake Chad's open water is now
// only in Chad and Cameroon, so Niger and Nigeria are marked on the Niger instead.
const LANDMARK_POINTS = [
  { name: 'Lake Victoria', kind: 'water', at: { ke: [34.55, -0.3], ug: [32.9, -0.4], tz: [32.9, -2.1] } },
  { name: 'Mount Kenya', kind: 'mountain', at: { ke: [37.3075, -0.1521] } },
  { name: 'Mount Kilimanjaro', kind: 'mountain', at: { tz: [37.3556, -3.0674] } },
  { name: 'Nile River', kind: 'water', at: { eg: [32.596, 25.636], sd: [30.479, 19.25], ss: [31.522, 6.198], ug: [31.755, 2.298] } },
  { name: 'Niger River', kind: 'water', at: { ne: [2.13, 13.448], ng: [6.758, 7.77] } },
  { name: 'Sahara Desert', kind: 'landmark', at: { dz: [3.5, 26.5], ly: [16.0, 25.0], eg: [28.0, 25.0], td: [18.5, 19.5], ne: [10.0, 19.5], ml: [-2.0, 20.5], mr: [-10.0, 21.5], sd: [28.5, 19.0], eh: [-12.5, 24.5], tn: [9.6, 31.6] } },
  { name: 'Congo Basin', kind: 'landmark', at: { cd: [22.0, -1.5], cg: [15.8, 0.5], cf: [17.5, 3.7], cm: [14.5, 3.0], ga: [12.0, -0.5] } },
  { name: 'Atlas Mountains', kind: 'mountain', at: { ma: [-5.0, 31.5], dz: [2.5, 34.5], tn: [8.8, 35.3] } },
  { name: 'Lake Tanganyika', kind: 'water', at: { tz: [29.65, -6.0], bi: [29.25, -3.9], cd: [29.3, -6.0], zm: [30.9, -8.5] } },
  { name: 'Lake Malawi', kind: 'water', at: { mw: [34.6, -12.0], mz: [34.75, -12.9], tz: [34.55, -10.4] } },
  { name: 'Victoria Falls', kind: 'water', at: { zm: [25.85, -17.92], zw: [25.86, -17.93] } },
  { name: 'Lake Chad', kind: 'water', at: { td: [14.54, 13.11], cm: [14.37, 12.98] } },
  { name: 'Lake Turkana', kind: 'water', at: { ke: [36.19, 3.51] } },
  // Ethiopia's corner of Lake Turkana is the Omo delta, land in OpenStreetMap.
  { name: 'Lake Tana', kind: 'water', at: { et: [37.3, 12.0] } },
  { name: 'Lake Volta', kind: 'water', at: { gh: [-0.24, 7.63] } },
  { name: 'Okavango Delta', kind: 'landmark', at: { bw: [22.9, -19.3] } },
  { name: 'Mount Cameroon', kind: 'mountain', at: { cm: [9.17, 4.2] } },
  { name: 'Kalandula Falls', kind: 'water', at: { ao: [15.99, -9.07] } },
  { name: 'Lake Nokoue', kind: 'water', at: { bj: [2.45, 6.45] } },
  { name: 'Sindou Peaks', kind: 'landmark', at: { bf: [-5.17, 10.67] } },
  { name: 'Pico do Fogo', kind: 'mountain', at: { cv: [-24.35, 14.95] } },
  { name: 'Mount Karthala', kind: 'mountain', at: { km: [43.35, -11.75] } },
  { name: 'Tai National Park', kind: 'landmark', at: { ci: [-7.12, 5.75] } },
  { name: 'Lake Assal', kind: 'water', at: { dj: [42.42, 11.65] } },
  { name: 'Pico Basile', kind: 'mountain', at: { gq: [8.78, 3.58] } },
  { name: 'Mount Soira', kind: 'mountain', at: { er: [39.53, 14.75] } },
  { name: 'Sibebe Rock', kind: 'mountain', at: { sz: [31.18, -26.28] } },
  { name: 'Gambia River', kind: 'water', at: { gm: [-15.5, 13.45] } },
  { name: 'Fouta Djallon', kind: 'mountain', at: { gn: [-12.0, 11.3] } },
  { name: 'Cacheu Mangroves', kind: 'water', at: { gw: [-16.2, 12.25] } },
  { name: 'Maletsunyane Falls', kind: 'water', at: { ls: [28.07, -29.86] } },
  { name: 'Sapo National Park', kind: 'landmark', at: { lr: [-8.5, 5.37] } },
  { name: 'Tsingy de Bemaraha', kind: 'landmark', at: { mg: [44.81, -18.9] } },
  { name: 'Le Morne Brabant', kind: 'mountain', at: { mu: [57.32, -20.45] } },
  { name: 'Sossusvlei', kind: 'landmark', at: { na: [15.29, -24.73] } },
  { name: 'Nyungwe Forest', kind: 'landmark', at: { rw: [29.25, -2.47] } },
  { name: 'Pico Cao Grande', kind: 'mountain', at: { st: [6.58, 0.12] } },
  { name: 'Lake Retba', kind: 'water', at: { sn: [-17.23, 14.84] } },
  { name: 'Morne Seychellois', kind: 'mountain', at: { sc: [55.45, -4.65] } },
  { name: 'Mount Bintumani', kind: 'mountain', at: { sl: [-11.12, 9.17] } },
  { name: 'Laas Geel', kind: 'landmark', at: { so: [44.36, 9.78] } },
  { name: 'Table Mountain', kind: 'mountain', at: { za: [18.4, -33.96] } },
  { name: 'Mount Agou', kind: 'mountain', at: { tg: [0.75, 6.87] } },
  { name: 'Saguia el-Hamra', kind: 'landmark', at: { eh: [-12.5, 27.0] } }
];

const BASELINE = new Date('2025-07-01T00:00:00Z').getTime();
const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

function livePopulation(pop, gr) {
  const elapsed = Date.now() - BASELINE;
  return Math.round(pop * Math.pow(1 + gr, elapsed / MS_PER_YEAR));
}

function formatPop(n) {
  return n.toLocaleString('en-US');
}

const africaPopEl = document.getElementById('africa-pop');
function updateAfricaPop() {
  let sum = 0;
  for (const info of Object.values(COUNTRY_INFO)) sum += livePopulation(info.pop, info.gr);
  africaPopEl.textContent = formatPop(sum);
}
updateAfricaPop();
setInterval(() => { if (!document.hidden && !countryView.classList.contains('open')) updateAfricaPop(); }, 1000);

// Which day's paper this is. The line under the title was "Culture · Politics · People",
// a third tagline after the kicker and the title, and it told a reader nothing.
const editionLineEl = document.getElementById('edition-line');
if (editionLineEl && AI_BRIEFS_AT) {
  const editionDate = new Date(AI_BRIEFS_AT);
  if (Number.isFinite(editionDate.getTime())) {
    const storyCount = Object.values(AI_BRIEFS).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
    editionLineEl.textContent = editionDate.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'UTC' }) +
      (storyCount ? ' · ' + storyCount + ' stories' : '');
  }
}

const cities = Object.entries(COUNTRY_INFO)
  .map(([id, info]) => ({ city: String(info.capital || info.name).toUpperCase(), id }))
  .sort((a, b) => a.city.localeCompare(b.city, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id));

const tickerEl = document.getElementById('ticker');

function makeCountryButton(label, id) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.country = id;
  button.addEventListener('click', () => {
    if (isTouchLikePointer()) button.blur();
    openCountry(id, button);
  });
  return button;
}

function renderTicker() {
  const fragment = document.createDocumentFragment();
  for (let copy = 0; copy < 3; copy++) {
    const segment = document.createElement('div');
    segment.className = 'ticker-segment';
    if (copy > 0) segment.setAttribute('aria-hidden', 'true');
    for (const item of cities) {
      const button = makeCountryButton(item.city, item.id);
      if (copy > 0) button.tabIndex = -1;
      segment.appendChild(button);
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.setAttribute('aria-hidden', 'true');
      dot.textContent = String.fromCharCode(183);
      segment.appendChild(dot);
    }
    fragment.appendChild(segment);
  }
  tickerEl.replaceChildren(fragment);
}

renderTicker();

/* Phones: drive the city ticker by scrolling the strip rather than translating a
   ~25,000px-wide element. iOS Safari drops composited layers that large, which left an
   empty band where the ticker should be. scrollLeft is tiled like ordinary content. */
(function phoneTicker() {
  const wrap = tickerEl && tickerEl.closest('.ticker-wrap');
  if (!wrap) return;
  const mq = window.matchMedia('(max-width:720px)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let last = 0, pos = 0, held = false, raf = 0;
  const SPEED = 38; // px per second: calm, readable
  function seg() { const s = tickerEl.querySelector('.ticker-segment'); return s ? s.offsetWidth : 0; }
  function step(now) {
    raf = 0;
    if (!mq.matches || reduce.matches) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    const w = seg();
    if (!held && !document.hidden && w) { pos += SPEED * dt; if (pos >= w) pos -= w; wrap.scrollLeft = pos; }
    raf = requestAnimationFrame(step);
  }
  function start() { if (!raf) { last = 0; raf = requestAnimationFrame(step); } }
  function sync() { document.documentElement.classList.toggle('ticker-js', mq.matches && !reduce.matches); if (mq.matches) start(); else wrap.scrollLeft = 0; }
  wrap.addEventListener('pointerdown', () => { held = true; });
  window.addEventListener('pointerup', () => { if (held) { held = false; pos = wrap.scrollLeft; } });
  wrap.addEventListener('focusin', () => { held = true; });
  wrap.addEventListener('focusout', () => { held = false; pos = wrap.scrollLeft; });
  wrap.addEventListener('scroll', () => { if (held) pos = wrap.scrollLeft; }, { passive: true });
  (mq.addEventListener ? mq.addEventListener('change', sync) : mq.addListener(sync));
  sync();
})();

// Every few seconds, ping the map country whose capital is currently centered in the ticker.
// Skipped when reduced motion is preferred, the tab is hidden, or the landing map isn't visible.
setInterval(() => {
  if (typeof assemblyDone === 'undefined' || !assemblyDone) return;
  if (document.hidden || !canvas.offsetParent) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (countryView.classList.contains('open')) return;
  const wrap = tickerEl.closest('.ticker-wrap');
  const wrapRect = wrap.getBoundingClientRect();
  if (wrapRect.bottom < 0 || wrapRect.top > window.innerHeight) return;
  const centerX = wrapRect.left + wrapRect.width / 2;
  let best = null, bestDist = Infinity;
  for (const b of tickerEl.querySelectorAll('button')) {
    const r = b.getBoundingClientRect();
    if (r.right < wrapRect.left || r.left > wrapRect.right) continue;
    const d = Math.abs((r.left + r.right) / 2 - centerX);
    if (d < bestDist) { bestDist = d; best = b; }
  }
  if (best && best.dataset.country) pingCountry(best.dataset.country);
}, 3200);

// Automatic FX: render immediately from the last successful response (or a dated
// bundled snapshot), then refresh in the background without user action.
(function(){
  const wrap = document.getElementById('fx-wrap');
  const el = document.getElementById('fx-ticker');
  const canRenderFxTicker = !!(wrap && el);
  const CACHE_KEY = 'african-street-journal:fx-usd:v1';
  const FALLBACK_AT = '2026-06-18T00:02:31Z';
  const FALLBACK_RATES = {
    AOA:923.963468,BIF:2989.610698,BWP:13.542717,CDF:2314.642628,CVE:95.446373,DJF:177.721,
    DZD:133.117006,EGP:49.929933,ERN:15,ETB:158.913142,GHS:11.170945,GMD:74.220379,
    GNF:8763.955021,KES:129.48044,KMF:425.851697,LRD:182.009482,LSL:16.285485,
    LYD:6.36707,MAD:9.239439,MGA:4193.18643,MRU:39.929644,MUR:47.227176,
    MWK:1740.048288,MZN:63.686147,NAD:16.285485,NGN:1359.172299,RWF:1467.154455,
    SCR:14.374903,SDG:544.13333,SLE:24.756356,SOS:571.750599,SSP:4706.441775,
    STN:21.20742,SZL:16.285485,TND:2.918677,TZS:2621.190557,UGX:3649.868852,
    XAF:567.802263,XOF:567.802263,ZAR:16.285941,ZMW:17.785031,ZWG:26.7699
  };
  const WANT = [
    ['NGN','Nigeria'],['ZAR','South Africa'],['EGP','Egypt'],['KES','Kenya'],['GHS','Ghana'],
    ['MAD','Morocco'],['XOF','West Africa'],['XAF','Central Africa'],['TZS','Tanzania'],['UGX','Uganda'],
    ['ETB','Ethiopia'],['DZD','Algeria'],['TND','Tunisia'],['ZMW','Zambia'],['MUR','Mauritius'],
    ['BWP','Botswana'],['RWF','Rwanda'],['MZN','Mozambique']
  ];
  const fmt = n => formatFxRate(n);
  function applySnapshot(rates, updatedAt, source) {
    if (!rates || typeof rates !== 'object') return;
    window.__FX = rates;
    window.__FX_AT = updatedAt || '';
    window.__FX_SOURCE = source;
    document.dispatchEvent(new CustomEvent('fx-ready'));
  }
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch {}
  if (cached?.rates && cached.updatedAt) applySnapshot(cached.rates, cached.updatedAt, 'cached');
  else applySnapshot(FALLBACK_RATES, FALLBACK_AT, 'fallback');

  // One live refresh every six hours is enough for a reference-rate tool. Previously every
  // page view called the API even when a minute-old successful response was already cached.
  const cachedAt = Date.parse(cached?.savedAt || '');
  if (cached?.rates && Number.isFinite(cachedAt) && Date.now() - cachedAt < 6 * 60 * 60 * 1000) return;

  fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(d => {
      const rates = d && d.rates; if (!rates) return;
      const updatedAt = d.time_last_update_utc || new Date().toISOString();
      applySnapshot(rates, updatedAt, 'live');
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ rates, updatedAt, savedAt:new Date().toISOString() })); } catch {}
      if (!canRenderFxTicker) return;
      const items = WANT.filter(([c]) => rates[c]).map(([c, name]) => ({ pair: 'USD/' + c, rate: fmt(rates[c]) }));
      if (!items.length) return;
      const frag = document.createDocumentFragment();
      for (let copy = 0; copy < 3; copy++){
        const seg = document.createElement('div');
        seg.className = 'ticker-segment';
        if (copy > 0) seg.setAttribute('aria-hidden', 'true');
        const lead = document.createElement('span'); lead.className = 'fx-lead'; lead.textContent = 'FX · USD'; seg.appendChild(lead);
        for (const it of items){
          const span = document.createElement('span'); span.className = 'fx-item';
          span.innerHTML = '<span class="fx-pair">' + it.pair + '</span><span class="fx-rate">' + it.rate + '</span>';
          seg.appendChild(span);
          const dot = document.createElement('span'); dot.className = 'dot'; dot.setAttribute('aria-hidden','true'); dot.textContent = String.fromCharCode(183);
          seg.appendChild(dot);
        }
        frag.appendChild(seg);
      }
      el.replaceChildren(frag);
      wrap.hidden = false;
    })
    .catch(() => {
      // The cached or bundled snapshot has already rendered.
    });
})();

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const FRONT_GREEN = getComputedStyle(document.documentElement).getPropertyValue('--front-green').trim() || '#439447';

// Line widths are set for the screen's pixel ratio (HAIR); the backing store's own
// resolution, dpr, is cut to the map's size on screen once it is laid out
// (fitMapResolution).
const SCREEN_DPR = Math.min(3, window.devicePixelRatio || 1);
let dpr = SCREEN_DPR;
canvas.width = 1000 * dpr;
canvas.height = 1001 * dpr;
ctx.scale(dpr, dpr);

const paths = drawableCountries.map(country => ({
  id: country.id,
  info: country.info,
  d: country.d,
  shape: new Path2D(country.d),
  sx: country.sx,
  sy: country.sy,
  delay: country.delay,
  dur: country.dur,
  cx: country.cx,
  cy: country.cy,
  bbox: pathBounds(country.d)
}));

const LAKES = window.UNITED_AFRICA_DATA && window.UNITED_AFRICA_DATA.lakes ? new Path2D(window.UNITED_AFRICA_DATA.lakes) : null;
const pathById = Object.fromEntries(paths.map(path => [path.id, path]));
function pathBounds(d) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length - 1; i += 2) {
    const x = nums[i], y = nums[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

const easeOut = t => 1 - Math.pow(1 - t, 3);

// Island nations are 1-3px paths on the continental map — invisible and untappable. Each gets
// a ringed, tagged marker sharing the country's hover/click behavior via a forgiving hit radius.
const ISLAND_MARKERS = { cv: { tag: 'CPV', side: 'below' }, st: { tag: 'STP', side: 'left' }, km: { tag: 'COM', side: 'right', prefer: ['right','above','below'] }, sc: { tag: 'SYC', side: 'above' }, mu: { tag: 'MUS', side: 'below' } };
const islandHitTargets = Object.keys(ISLAND_MARKERS)
  .map(id => {
    const idx = paths.findIndex(p => p.id === id);
    if (idx < 0 || !paths[idx].bbox) return null;
    const b = paths[idx].bbox;
    // Clamp into the canvas (Mauritius' path center sits at x~1014, past the 1000px edge) and
    // flip the tag inward near the borders so it can never render off-canvas.
    const cx = Math.max(18, Math.min(982, (b.minX + b.maxX) / 2));
    const cy = Math.max(18, Math.min(983, (b.minY + b.maxY) / 2));
    let side = ISLAND_MARKERS[id].side;
    if (side === 'left' && cx < 60) side = 'right';
    if (side === 'right' && cx > 940) side = 'left';
    return { id, idx, cx, cy, side };
  })
  .filter(Boolean);

// Mainland micro-states (Gambia, Djibouti, Eswatini...) are near-invisible tap targets on
// phones; give them the same forgiving hit treatment as the island markers.
const microHitTargets = paths
  .map((p, idx) => ({ p, idx }))
  .filter(({ p }) => p.bbox && !ISLAND_MARKERS[p.id] && (p.bbox.width * p.bbox.height) < 620)
  .map(({ p, idx }) => ({ idx, cx: (p.bbox.minX + p.bbox.maxX) / 2, cy: (p.bbox.minY + p.bbox.maxY) / 2 }));

// The ocean wash is identical every frame, so it is painted once to an offscreen canvas
// and blitted. Rebuilding two radial gradients 60 times a second was most of the
// landing page's main-thread time on a throttled Android profile.
let oceanLayer = null;
// The map is drawn on a canvas, so it reads the theme itself (styles.css --map-*).
const mapLight = () => document.documentElement.getAttribute('data-theme') === 'light';
const mapVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
function drawOcean(elapsed) {
  const alpha = Math.min(1, elapsed / 1.2);
  if (alpha === 0) return;
  if (!oceanLayer) {
    oceanLayer = document.createElement('canvas');
    oceanLayer.width = 1000 * dpr; oceanLayer.height = 1001 * dpr;
    const off = oceanLayer.getContext('2d');
    off.scale(dpr, dpr);
    paintOcean(off);
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(oceanLayer, 0, 0, 1000, 1001);
  ctx.restore();
}
function paintOcean(ctx) {
  ctx.save();
  // Deep-water wash that fades to transparent — no hard rectangle seam against the page.
  const wash = ctx.createRadialGradient(500, 480, 60, 500, 480, 640);
  const light = mapLight();
  wash.addColorStop(0, light ? 'rgba(120,150,128,0.16)' : 'rgba(22,30,24,0.5)');
  wash.addColorStop(0.55, light ? 'rgba(120,150,128,0.08)' : 'rgba(13,18,15,0.34)');
  wash.addColorStop(1, 'rgba(10,12,10,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 1000, 1001);
  // Whisper of a graticule.
  ctx.strokeStyle = 'rgba(133,166,140,0.05)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let x = 83; x < 1000; x += 83.4) { ctx.moveTo(x, 0); ctx.lineTo(x, 1001); }
  for (let y = 83; y < 1001; y += 83.4) { ctx.moveTo(0, y); ctx.lineTo(1000, y); }
  ctx.stroke();
  // Erase wash + grid toward the edges so nothing hard-stops at the canvas border. The fade must
  // COMPLETE inside the nearest canvas edge (~480px from center) or the leftover tint paints a
  // visible rectangle around the continent.
  const fade = ctx.createRadialGradient(500, 480, 320, 500, 480, 470);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 1000, 1001);
  ctx.restore();
}


// Island tags are placed, not hard-coded: each candidate side (and a farther ring of
// fallbacks with a leader line) is tested against every country path and every other
// marker/tag, so a tag never sits on a coast (Comoros' old left-hand tag touched
// Mozambique) at any width. Cached per layout because the answer only changes on resize.
const labelProbeCtx = document.createElement('canvas').getContext('2d');
let islandLabelCache = { key: '', map: {} };
// Visible window in map units. On phones the canvas overflows the screen, so a tag inside
// the canvas can still be off-screen (SYC was cut to 'SY'). layoutPhoneMap narrows this.
let islandLabelBounds = { x0: 4, x1: 996 };
function islandLabelRect(t, side, dist, w, h) {
  const vert = side === 'above' || side === 'below';
  // A tag above/below a ring docked at the canvas edge slides inward to stay readable
  // (the canvas clips anything past its edge, which cut 'CPV' to 'PV' on small maps).
  const x = vert ? Math.max(islandLabelBounds.x0 + w / 2 + 1, Math.min(islandLabelBounds.x1 - w / 2 - 1, t.cx)) : t.cx + (side === 'left' ? -dist : dist);
  const y = t.cy + (side === 'below' ? dist : side === 'above' ? -dist : 0);
  const align = vert ? 'center' : (side === 'left' ? 'right' : 'left');
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  return { x, y, align, side, dist, r: { x0, y0: y - h / 2, x1: x0 + w, y1: y + h / 2 } };
}
function rectHitsLand(r, pad) {
  const xs = [], ys = [];
  for (let i = 0; i <= 6; i++) xs.push(r.x0 - pad + (r.x1 - r.x0 + 2 * pad) * i / 6);
  for (let i = 0; i <= 3; i++) ys.push(r.y0 - pad + (r.y1 - r.y0 + 2 * pad) * i / 3);
  for (const p of paths) {
    const b = p.bbox;
    if (!b || r.x1 + pad < b.minX || r.x0 - pad > b.maxX || r.y1 + pad < b.minY || r.y0 - pad > b.maxY) continue;
    for (const x of xs) for (const y of ys) if (labelProbeCtx.isPointInPath(p.shape, x, y)) return true;
  }
  return false;
}
function rectsOverlap(a, b, pad) { return !(a.x1 + pad < b.x0 || b.x1 + pad < a.x0 || a.y1 + pad < b.y0 || b.y1 + pad < a.y0); }
function computeIslandLabels(u, ring, gap) {
  const map = {}, placed = [];
  const h = 9 * u, w = 3 * 8.5 * 0.62 * u; // three monospace glyphs
  // Other markers' rings are obstacles too.
  for (const o of islandHitTargets) placed.push({ x0: o.cx - ring, y0: o.cy - ring, x1: o.cx + ring, y1: o.cy + ring });
  const fits = (r, pad) => !(r.x0 < islandLabelBounds.x0 || r.x1 > islandLabelBounds.x1 || r.y0 < 4 || r.y1 > 997) &&
    !rectHitsLand(r, pad) && !placed.some(q => rectsOverlap(r, q, pad * 0.5));
  for (const t of islandHitTargets) {
    const base = ISLAND_MARKERS[t.id].prefer || [t.side];
    const sides = base.concat(['above', 'below', 'right', 'left'].filter(s => !base.includes(s)));
    let pick = null;
    // The four sides at three distances, first with a full margin and then a thinner one.
    for (const pad of [3 * u, 1.5 * u]) {
      for (const mult of [1, 1.8, 2.6]) {
        for (const side of sides) {
          const c = islandLabelRect(t, side, gap * mult, w, h);
          if (fits(c.r, pad)) { pick = c; break; }
        }
        if (pick) break;
      }
      if (pick) break;
    }
    // Still nothing: the nearest clear spot on a grid round the marker, tied by a leader.
    // On a short phone map (CI's 320x568 on 30 Oct 2026) Comoros had no clear side - the
    // Mozambique Channel on two, Madagascar below, the Seychelles ring above - and the old
    // fallback put "COM" on Madagascar. Open water lies diagonally off it.
    if (!pick) {
      let best = null;
      const step = h / 2;
      for (let gy = -12; gy <= 12; gy++) for (let gx = -12; gx <= 12; gx++) {
        const x = t.cx + gx * step, y = t.cy + gy * step, d = Math.hypot(x - t.cx, y - t.cy);
        if (d < gap || (best && d >= best.d)) continue;
        const r = { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
        if (fits(r, 0.5 * u)) best = { d, x, y, r };
      }
      if (best) {
        const vx = (best.x - t.cx) / best.d, vy = (best.y - t.cy) / best.d;
        const k = Math.min(Math.abs(vx) > 1e-6 ? (w / 2) / Math.abs(vx) : Infinity, Math.abs(vy) > 1e-6 ? (h / 2) / Math.abs(vy) : Infinity);
        pick = { x: best.x, y: best.y, align: 'center', side: 'free', dist: best.d, r: best.r, leader: true,
          lx0: t.cx + vx * (ring + u), ly0: t.cy + vy * (ring + u), lx1: best.x - vx * (k + 2 * u), ly1: best.y - vy * (k + 2 * u) };
        placed.push(pick.r);
        map[t.id] = pick;
        continue;
      }
    }
    if (!pick) pick = islandLabelRect(t, t.side, gap, w, h);
    pick.leader = pick.dist > gap * 1.05;
    if (pick.leader) {
      const vx = Math.sign(pick.x - t.cx) * (pick.side === 'left' || pick.side === 'right' ? 1 : 0);
      const vy = pick.side === 'below' ? 1 : pick.side === 'above' ? -1 : 0;
      pick.lx0 = t.cx + vx * (ring + 1 * u); pick.ly0 = t.cy + vy * (ring + 1 * u);
      pick.lx1 = pick.x - vx * (2 * u) - (vy ? 0 : 0); pick.ly1 = pick.y - vy * (h / 2 + 1.5 * u);
      if (vx) pick.lx1 = pick.side === 'left' ? pick.r.x1 + 2 * u : pick.r.x0 - 2 * u;
    }
    placed.push(pick.r);
    map[t.id] = pick;
  }
  return map;
}
function islandLabelPlacement(t, u, ring, gap) {
  const key = u.toFixed(3) + '|' + islandLabelBounds.x0.toFixed(1) + ',' + islandLabelBounds.x1.toFixed(1) + '|' + islandHitTargets.map(o => o.cx.toFixed(1) + ',' + o.cy.toFixed(1) + o.side).join(';');
  if (islandLabelCache.key !== key) islandLabelCache = { key, map: computeIslandLabels(u, ring, gap) };
  return islandLabelCache.map[t.id];
}
window.__islandLabels = () => islandLabelCache.map;

function drawIslandMarkers(elapsed) {
  const alpha = Math.max(0, Math.min(1, (elapsed - 2.4) / 0.8));
  if (alpha === 0) return;
  // Sizes are set in screen pixels, then converted to map units, so markers read the
  // same on a 360px phone and a 1440px desktop.
  const u = 1000 / (canvas.getBoundingClientRect().width || 1000);
  const ring = 6 * u, dot = 1.7 * u, gap = ring + 5 * u;
  ctx.save();
  ctx.translate(0.41, 2);
  ctx.globalAlpha = alpha;
  ctx.font = '600 ' + (8.5 * u).toFixed(1) + 'px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.textBaseline = 'middle';
  for (const t of islandHitTargets) {
    const hovered = hoveredIdx === t.idx;
    ctx.beginPath();
    ctx.arc(t.cx, t.cy, ring, 0, Math.PI * 2);
    if (hovered) { ctx.fillStyle = 'rgba(88,178,92,0.18)'; ctx.fill(); }
    ctx.strokeStyle = hovered ? 'rgba(170,225,172,0.95)' : 'rgba(102,170,106,0.5)';
    ctx.lineWidth = (hovered ? 1.3 : 1) * u;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(t.cx, t.cy, dot, 0, Math.PI * 2);
    ctx.fillStyle = hovered ? '#bfe8c1' : '#5cae60';
    ctx.fill();
    const L = islandLabelPlacement(t, u, ring, gap);
    if (L.leader) {
      // Pushed past the default gap to clear a coast: a hairline ties the tag to its ring.
      ctx.beginPath();
      ctx.moveTo(L.lx0, L.ly0); ctx.lineTo(L.lx1, L.ly1);
      ctx.strokeStyle = 'rgba(140,180,146,0.38)';
      ctx.lineWidth = 0.8 * u;
      ctx.stroke();
    }
    ctx.textAlign = L.align;
    ctx.fillStyle = hovered ? (mapLight() ? '#1b5e20' : 'rgba(232,246,233,0.98)') : mapVar('--map-tag', 'rgba(170,196,174,0.78)');
    ctx.fillText(ISLAND_MARKERS[t.id].tag, L.x, L.y);
  }
  ctx.restore();
}

// Ticker ping: briefly pulse the country whose capital is centered in the bottom cities ticker.
let pulseIdx = -1;
let pulseStart = 0;
const PULSE_MS = 1500;

function pulseAmount() {
  if (pulseIdx < 0) return 0;
  const t = (performance.now() - pulseStart) / PULSE_MS;
  if (t >= 1) return 0;
  return Math.sin(t * Math.PI); // ease in and out
}

function pingCountry(id) {
  const idx = paths.findIndex(p => p.id === id);
  if (idx < 0 || pulseIdx >= 0) return;
  pulseIdx = idx;
  pulseStart = performance.now();
  (function pulseFrame() {
    if (pulseIdx < 0) return;
    if ((performance.now() - pulseStart) >= PULSE_MS) {
      pulseIdx = -1;
      render(3.5);
      return;
    }
    render(3.5);
    requestAnimationFrame(pulseFrame);
  })();
}

let startTime = 0;
let hoveredIdx = -1;
let assemblyDone = false;
let lastFocus = null;

/* Rendering. The settled map (ocean, shade, countries, lakes, light) is painted once into
   an offscreen layer; hover, focus and ticker pulses then cost one drawImage plus a
   single country, instead of re-filling 55 shapes under a blurred shadow per event. */
let baseLayer = null, shadeLayer = null;
function offscreen() {
  const c = document.createElement('canvas');
  c.width = 1000 * dpr; c.height = 1001 * dpr;
  const x = c.getContext('2d'); x.scale(dpr, dpr); x.lineJoin = 'round';
  return [c, x];
}
const HAIR = 1 / SCREEN_DPR;
function strokeBorders(x, shape) {
  x.lineWidth = Math.max(0.55, 1.6 * HAIR); x.strokeStyle = 'rgba(9,26,11,0.82)'; x.stroke(shape);
}
function paintShade() {
  // Soft contact shadow under the whole landmass: depth, not decoration.
  const [c, x] = offscreen();
  x.translate(0.41, 2);
  // On the light page a black shadow read as a grey smudge round the continent.
  if (mapLight()) { x.shadowColor = 'rgba(40,64,46,0.22)'; x.shadowBlur = 16; x.shadowOffsetY = 4; }
  else { x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 26; x.shadowOffsetY = 7; }
  x.fillStyle = '#10301a';
  for (const p of paths) x.fill(p.shape);
  return c;
}
function paintLight(x) {
  // A whisper of north-west light across the land, clipped to the coastline.
  x.save(); x.translate(0.41, 2);
  const g = x.createLinearGradient(150, 60, 820, 940);
  g.addColorStop(0, 'rgba(255,255,255,0.07)');
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.10)');
  x.fillStyle = g;
  for (const p of paths) x.fill(p.shape);
  x.restore();
}
function paintLakes(x, alpha) {
  if (!LAKES || alpha <= 0) return;
  x.save(); x.translate(0.41, 2); x.globalAlpha = alpha;
  x.fillStyle = mapVar('--map-lake', '#121815'); x.fill(LAKES);
  x.lineWidth = Math.max(0.5, 1.4 * HAIR); x.strokeStyle = 'rgba(9,26,11,0.9)'; x.stroke(LAKES);
  x.restore();
}
function buildBase() {
  const [c, x] = offscreen();
  if (!oceanLayer) drawOcean(1.2);
  x.drawImage(oceanLayer, 0, 0, 1000, 1001);
  if (!shadeLayer) shadeLayer = paintShade();
  x.drawImage(shadeLayer, 0, 0, 1000, 1001);
  x.save(); x.translate(0.41, 2);
  x.fillStyle = FRONT_GREEN;
  for (const p of paths) x.fill(p.shape);
  x.restore();
  paintLight(x);
  x.save(); x.translate(0.41, 2);
  for (const p of paths) strokeBorders(x, p.shape);
  x.restore();
  paintLakes(x, 1);
  baseLayer = c;
}
// Each country filled and bordered once into its own small canvas, for the draw-in to
// blit: filling and stroking 55 coastlines every frame was the rest of a frame's cost.
// The box starts on a whole device pixel, so a landed country is blitted pixel-exact.
// Dropped when the map settles.
let assemblySprites = null;
function paintAssemblySprites() {
  return paths.map(c => {
    const b = c.bbox;
    if (!b || !Number.isFinite(b.minX)) return null;
    const x0 = Math.floor((b.minX + 0.41 - 2) * dpr), y0 = Math.floor((b.minY + 2 - 2) * dpr);
    const s = document.createElement('canvas');
    s.width = Math.max(1, Math.ceil((b.maxX + 0.41 + 2) * dpr) - x0);
    s.height = Math.max(1, Math.ceil((b.maxY + 2 + 2) * dpr) - y0);
    const x = s.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, -x0, -y0);
    x.translate(0.41, 2); x.lineJoin = 'round';
    x.fillStyle = FRONT_GREEN; x.fill(c.shape);
    strokeBorders(x, c.shape);
    return { canvas: s, x: x0, y: y0 };
  });
}
function drawCountryOverlay(c, fill, lift) {
  ctx.save(); ctx.translate(0.41, 2);
  if (lift) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 2; }
  ctx.fillStyle = fill; ctx.fill(c.shape);
  ctx.shadowColor = 'transparent';
  if (LAKES) { ctx.save(); ctx.clip(c.shape); ctx.fillStyle = mapVar('--map-lake', '#121815'); ctx.fill(LAKES); ctx.restore(); }
  ctx.restore();
}
function render(elapsed) {
  ctx.clearRect(0, 0, 1000, 1001);
  const pulse = pulseAmount();
  if (assemblyDone && elapsed >= 3.5) {
    if (!baseLayer) buildBase();
    ctx.drawImage(baseLayer, 0, 0, 1000, 1001);
    if (pulseIdx >= 0 && pulse > 0 && pulseIdx !== hoveredIdx) {
      ctx.save(); ctx.globalAlpha = pulse;
      drawCountryOverlay(paths[pulseIdx], '#66b56a', false);
      ctx.restore();
      ctx.save(); ctx.translate(0.41, 2); strokeBorders(ctx, paths[pulseIdx].shape); ctx.restore();
    }
    if (hoveredIdx >= 0) {
      const c = paths[hoveredIdx];
      drawCountryOverlay(c, '#58b25c', true);
      ctx.save(); ctx.translate(0.41, 2);
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, 2.2 * HAIR); ctx.strokeStyle = 'rgba(226,244,227,0.95)'; ctx.stroke(c.shape);
      ctx.restore();
    }
    drawIslandMarkers(elapsed);
    return;
  }
  // Draw-in: countries ease into place; the shade and lakes fade in as they land.
  drawOcean(elapsed);
  ctx.lineJoin = 'round';
  const settled = Math.max(0, Math.min(1, (elapsed - 2.5) / 1.0));
  if (settled > 0) {
    if (!shadeLayer) shadeLayer = paintShade();
    ctx.save(); ctx.globalAlpha = settled; ctx.drawImage(shadeLayer, 0, 0, 1000, 1001); ctx.restore();
  }
  if (!assemblySprites) assemblySprites = paintAssemblySprites();
  for (let i = 0; i < paths.length; i++) {
    const c = paths[i];
    const t = c.dur === 0 ? 1 : Math.max(0, Math.min(1, (elapsed - c.delay) / c.dur));
    if (t === 0) continue;
    const eased = easeOut(t);
    const sprite = assemblySprites[i];
    ctx.save();
    ctx.globalAlpha = Math.min(1, t / 0.18);
    if (sprite) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(sprite.canvas, sprite.x + c.sx * (1 - eased) * dpr, sprite.y + c.sy * (1 - eased) * dpr);
    } else {
      ctx.translate(0.41 + c.sx * (1 - eased), 2 + c.sy * (1 - eased));
      ctx.fillStyle = FRONT_GREEN;
      ctx.fill(c.shape);
      strokeBorders(ctx, c.shape);
    }
    ctx.restore();
  }
  paintLakes(ctx, Math.min(1, Math.max(0, (elapsed - 1.6) / 1.4)));
  drawIslandMarkers(elapsed);
}

// Low-end or data-saving devices, and readers who ask for reduced motion, get the
// finished map in one paint instead of a 3.5 s assembly animation.
const MAP_STATIC = window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
  !!(navigator.connection && navigator.connection.saveData) ||
  (navigator.deviceMemory && navigator.deviceMemory <= 2) ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
function finishAssembly() {
  if (assemblyDone) return;
  assemblyDone = true;
  assemblySprites = null;
  render(3.5);
}
function frame(now) {
  if (assemblyDone) return;
  if (!startTime) startTime = now;
  const elapsed = (now - startTime) / 1000;
  if (elapsed < 3.5) { render(elapsed); requestAnimationFrame(frame); }
  else finishAssembly();
}
// A link straight to a country or the Wire (#/ke, #/wire - most WhatsApp shares) opens
// an overlay over this map; animating it underneath cost a slow phone ~0.65 s of CPU
// while the reader was trying to scroll the news. Paint it finished, once.
const OPENED_ON_ROUTE = /^#\/./.test(location.hash || '');
if (MAP_STATIC || OPENED_ON_ROUTE) finishAssembly();
else requestAnimationFrame(frame);
// Safety net: rAF is paused in background tabs and can be starved on slow phones,
// which left the map half-assembled (missing countries, one shape stuck mid-flight).
// Whatever happens to the animation, the finished map is on screen by 4.2 s.
setTimeout(finishAssembly, 4200);
document.addEventListener('visibilitychange', () => { if (document.hidden) finishAssembly(); });

/* Phones: scale the MAINLAND (with Madagascar) to ~95% of the screen width instead of
   fitting the whole 1000-unit square, which the far-flung islands make mostly ocean.
   The canvas keeps its exact aspect ratio; the stage becomes a window onto the
   mainland's bounding box and the canvas is offset inside it. Island markers are
   pulled inside the visible area, next to their true positions, so they never shrink
   the map and are never clipped. */
const MAINLAND_BOX = (() => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of paths) {
    if (ISLAND_MARKERS[p.id] || !p.bbox) continue;
    x0 = Math.min(x0, p.bbox.minX); y0 = Math.min(y0, p.bbox.minY);
    x1 = Math.max(x1, p.bbox.maxX); y1 = Math.max(y1, p.bbox.maxY);
  }
  return { x0, y0, x1, y1 };
})();
for (const t of islandHitTargets) { t.ox = t.cx; t.oy = t.cy; t.oside = t.side; }
const phoneMapMQ = window.matchMedia('(max-width:640px)');
function layoutPhoneMap() {
  const stage = canvas.parentElement;
  const row = stage.parentElement;
  if (!phoneMapMQ.matches) {
    stage.style.removeProperty('width'); stage.style.removeProperty('height');
    canvas.style.removeProperty('width'); canvas.style.removeProperty('height');
    canvas.style.removeProperty('left'); canvas.style.removeProperty('top');
    stage.classList.remove('stage--phone');
    for (const t of islandHitTargets) { t.cx = t.ox; t.cy = t.oy; t.side = t.oside; }
    islandLabelBounds = { x0: 4, x1: 996 };
    return;
  }
  stage.classList.add('stage--phone');
  const vw = document.documentElement.clientWidth;
  const b = MAINLAND_BOX, mw = b.x1 - b.x0, mh = b.y1 - b.y0;
  // Height actually free for the map: the row's box once the stage is collapsed.
  stage.style.height = '0px';
  const availH = Math.max(160, row.getBoundingClientRect().height - 8);
  const s = Math.min((vw * 0.95) / mw, availH / mh); // px per map unit
  const boxW = mw * s, boxH = mh * s;
  stage.style.width = boxW + 'px';
  stage.style.height = boxH + 'px';
  canvas.style.width = (1000 * s) + 'px';
  canvas.style.height = (1001 * s) + 'px';
  canvas.style.left = (-b.x0 * s) + 'px';
  canvas.style.top = (-b.y0 * s) + 'px';
  // Visible window in map units, from the screen edges (the canvas overflows the box).
  const left = (vw - boxW) / 2;
  const ux0 = b.x0 - left / s, ux1 = b.x0 + (vw - left) / s;
  const padX = 22 / s, padY = 16 / s;
  islandLabelBounds = { x0: Math.max(4, ux0 + 6 / s), x1: Math.min(996, ux1 - 6 / s) };
  const bb = id => (pathById[id] && pathById[id].bbox) || null;
  const sl = bb('sl') || bb('lr'), mg = bb('mg');
  for (const t of islandHitTargets) {
    // Cape Verde and Mauritius sit beyond the scaled mainland: dock them in open
    // ocean at the screen edge (Atlantic below the western bulge; Indian Ocean
    // below Madagascar) rather than on top of Senegal or Madagascar.
    if (t.id === 'cv' && sl) { t.cx = ux0 + padX + 6 / s; t.cy = sl.maxY + 46 / s; t.side = 'below'; continue; }
    if (t.id === 'mu' && mg) { t.cx = Math.min(ux1 - padX, mg.maxX + 4 / s); t.cy = mg.maxY + 22 / s; t.side = 'left'; continue; }
    let cx = Math.max(ux0 + padX, Math.min(ux1 - padX, t.ox));
    let cy = Math.max(b.y0 + padY, Math.min(b.y1 + 6 / s, t.oy));
    t.cx = cx; t.cy = cy;
    t.side = t.oside;
    if (t.oside === 'below' || t.oside === 'above') {
      // keep a vertical label unless it would leave the visible window
      if (t.side === 'below' && cy + 20 > b.y1 + 14 / s) t.side = 'above';
    }
  }
  render(assemblyDone ? 3.5 : 0);
}
// The canvas is 1000 map units at the screen's pixel ratio, but a phone shows it about
// 490px wide: at dpr 3 that is 3000x3003 pixels for the 1,470 the screen has. Every
// assembly frame cleared and blitted that four times over (ocean, shade, 55 countries,
// lakes), ~100 ms a frame on a mid-range phone at 4x throttling. The backing store and
// its layers now match the size on screen, in quarter steps, never above the screen's
// ratio or below 1 - so a desktop at ratio 1 is unchanged.
function fitMapResolution() {
  const shown = canvas.getBoundingClientRect().width;
  if (!shown) return;
  const want = Math.min(SCREEN_DPR, Math.max(1, Math.ceil(shown * (window.devicePixelRatio || 1) / 1000 * 4) / 4));
  if (want === dpr) return;
  dpr = want;
  canvas.width = Math.round(1000 * dpr);
  canvas.height = Math.round(1001 * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  oceanLayer = shadeLayer = baseLayer = assemblySprites = null;
  render(assemblyDone ? 3.5 : 0);
}
// A theme switch repaints the map from scratch: its layers are cached pictures.
window.addEventListener('asj:themechange', () => {
  oceanLayer = shadeLayer = baseLayer = assemblySprites = null;
  render(assemblyDone ? 3.5 : 0);
  if (activeCountryMap) drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath);
});
function layoutHomeMap() {
  layoutPhoneMap();
  fitMapResolution();
}
layoutHomeMap();
window.addEventListener('resize', () => requestAnimationFrame(layoutHomeMap));
(phoneMapMQ.addEventListener ? phoneMapMQ.addEventListener('change', layoutHomeMap) : phoneMapMQ.addListener(layoutHomeMap));

function eventToLocal(e) {
  const rect = canvas.getBoundingClientRect();
  return [
    (e.clientX - rect.left) * 1000 / rect.width - 0.41,
    (e.clientY - rect.top) * 1001 / rect.height - 2
  ];
}

function hitTest(x, y) {
  // Forgiving radii scale with how small the canvas is DISPLAYED: path coords are a fixed
  // 1000-unit space, so on a 340px-wide phone one finger covers ~120 units — a fixed
  // 13-unit radius would be a ~4px target. Convert a screen-px target size to units.
  const rectWidth = canvas.getBoundingClientRect().width || 1000;
  const unitsPerPx = 1000 / rectWidth;
  // Caps in map units matter as much as the px scaling: on a small canvas an uncapped
  // finger-sized radius grows to country-sized in map units and steals the neighbors
  // (Gambia's zone was swallowing half of Senegal). Islands may run larger — open ocean.
  const islandR2 = Math.pow(Math.min(30, Math.max(13, 16 * unitsPerPx)), 2);
  const microR2 = Math.pow(Math.min(18, Math.max(9, 14 * unitsPerPx)), 2);
  // Island marker rings first: generous targets where the real path is a 1-3px speck.
  for (const t of islandHitTargets) {
    const dx = x - t.cx, dy = y - t.cy;
    if (dx * dx + dy * dy <= islandR2) return t.idx;
  }
  for (const t of microHitTargets) {
    const dx = x - t.cx, dy = y - t.cy;
    if (dx * dx + dy * dy <= microR2) return t.idx;
  }
  for (let i = paths.length - 1; i >= 0; i--) {
    const box = paths[i].bbox;
    if (box && (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY)) continue;
    if (ctx.isPointInPath(paths[i].shape, x * dpr, y * dpr)) return i;
  }
  return -1;
}

let pendingPointerEvent = null;
let pointerFrame = 0;

function updateMapPointer(e) {
  if (!assemblyDone) return;
  const [x, y] = eventToLocal(e);
  const idx = hitTest(x, y);
  if (idx !== hoveredIdx) {
    hoveredIdx = idx;
    render(3.5);
  }
  const country = idx >= 0 ? paths[idx] : null;
  canvas.style.cursor = country ? 'pointer' : 'default';
  if (country) {
    const rect = (tooltip.offsetParent || canvas).getBoundingClientRect();
    tooltip.textContent = country.info.name;
    tooltip.style.left = (e.clientX - rect.left) + 'px';
    tooltip.style.top = (e.clientY - rect.top) + 'px';
    tooltip.classList.add('show');
  } else {
    tooltip.classList.remove('show');
  }
}

canvas.addEventListener('mousemove', (e) => {
  if (!assemblyDone) return;
  pendingPointerEvent = e;
  if (pointerFrame) return;
  pointerFrame = requestAnimationFrame(() => {
    pointerFrame = 0;
    if (pendingPointerEvent) updateMapPointer(pendingPointerEvent);
    pendingPointerEvent = null;
  });
});

canvas.addEventListener('mouseleave', () => {
  pendingPointerEvent = null;
  if (pointerFrame) {
    cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
  }
  if (hoveredIdx !== -1) { hoveredIdx = -1; render(3.5); }
  canvas.style.cursor = 'default';
  tooltip.classList.remove('show');
});

const countryView = document.getElementById('country-view');
const storyReader = document.getElementById('story-reader');
const backBtn = document.getElementById('back-btn');
const countryMapCanvas = document.getElementById('cv-country-map');
const countryMapCtx = countryMapCanvas.getContext('2d');
// Redraw the country map at its true displayed size once layout settles (the open animation,
// window resizes, fullscreen toggles). The canvas display size is CSS-driven and independent of
// the backing store, so re-rendering here can't feedback-loop the observer.
if (typeof ResizeObserver !== 'undefined') {
  let mapResizeTimer = 0, lastMapW = 0, lastMapH = 0;
  new ResizeObserver(entries => {
    const r = entries[0]?.contentRect;
    if (!r) return;
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w === lastMapW && h === lastMapH) return;
    lastMapW = w; lastMapH = h;
    // Settle-debounce: redraw only once the size has stopped changing, so the multi-frame reflow
    // of a fullscreen toggle collapses into ONE clean redraw instead of re-projecting the map at
    // every intermediate size (which looks like a wobble). This is the single redraw-on-resize path.
    clearTimeout(mapResizeTimer);
    mapResizeTimer = setTimeout(() => {
      if (activeCountryMap) drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath);
    }, 80);
  }).observe(countryMapCanvas);
}
const layerPills = Array.from(document.querySelectorAll('.cv-layer-pill'));
const layerStatus = document.getElementById('cv-layer-status');
const mapToolbarRegion = document.getElementById('cv-map-toolbar-region');
const mapToolbarCountry = document.getElementById('cv-map-toolbar-country');
const mapLayers = { terrain: true, water: true, places: true, roads: true, rail: true, infra: true, labels: true };
const GDP_SERIES_CACHE = {};
const GDP_SERIES_PENDING = {};
const MAP_TEXTURE_CACHE = new Map();
const MAX_MAP_TEXTURES = 36;
function rememberMapTexture(key, canvas) {
  if (MAP_TEXTURE_CACHE.size >= MAX_MAP_TEXTURES) {
    const firstKey = MAP_TEXTURE_CACHE.keys().next().value;
    if (firstKey) MAP_TEXTURE_CACHE.delete(firstKey);
  }
  MAP_TEXTURE_CACHE.set(key, canvas);
  return canvas;
}
const ANTHEM_TITLES = {
  dz:'Kassaman', ao:'Angola Avante', bj:"L'Aube Nouvelle", bw:'Fatshe leno la rona', bf:'Une Seule Nuit',
  bi:'Burundi Bwacu', cm:'O Cameroon, Cradle of Our Forefathers', cv:'Cantico da Liberdade', cf:'La Renaissance',
  td:'La Tchadienne', km:'Udzima wa ya Masiwa', cg:'La Congolaise', cd:'Debout Congolais', ci:"L'Abidjanaise",
  dj:'Jabuuti', eg:'Bilady, Bilady, Bilady', gq:'Caminemos pisando las sendas', er:'Ertra, Ertra, Ertra',
  sz:'Nkulunkulu Mnikati wetibusiso temaSwati', et:'Whedefit Gesgeshi Woude Henate Ethiopia', ga:'La Concorde',
  gm:'For The Gambia Our Homeland', gh:'God Bless Our Homeland Ghana', gn:'Liberte', gw:'Esta e a Nossa Patria Bem Amada',
  ke:'Ee Mungu Nguvu Yetu', ls:'Lesotho Fatse La Bontata Rona', lr:'All Hail, Liberia, Hail!', ly:'Libya, Libya, Libya',
  mg:'Ry Tanindraza nay malala o!', mw:'Mulungu dalitsa Malawi', ml:'Le Mali', mr:'Bilada-l ubati-l hudati-l kiram',
  mu:'Motherland', ma:'Cherifian Anthem', mz:'Patria Amada', na:'Namibia, Land of the Brave', ne:"L'Honneur de la Patrie",
  ng:'Nigeria, We Hail Thee', rw:'Rwanda Nziza', st:'Independencia total', sn:'Pincez Tous vos Koras, Frappez les Balafons',
  sc:'Koste Seselwa', sl:'High We Exalt Thee, Realm of the Free', so:'Qolobaa Calankeed', za:'Nkosi Sikelel iAfrika',
  ss:'South Sudan Oyee!', sd:'Nahnu Jund Allah Jund Al-watan', tz:'Mungu ibariki Afrika', tg:'Terre de nos aieux',
  tn:'Humat al-Hima', ug:'Oh Uganda, Land of Beauty', zm:'Stand and Sing of Zambia, Proud and Free',
  zw:'Blessed be the Land of Zimbabwe', eh:'Ya Baniy As-Sahara'
};
const ANTHEM_AUDIO = {
  ao:'https://commons.wikimedia.org/wiki/Special:FilePath/Angolan-National-Anthem-%20US-Navy-Band.ogg',
  bf:'https://upload.wikimedia.org/wikipedia/commons/b/b0/National_anthem_of_Burkina_Faso.oga',
  bi:'https://upload.wikimedia.org/wikipedia/commons/7/71/Burundi_Bwacu_instrumental.ogg',
  bj:'https://commons.wikimedia.org/wiki/Special:FilePath/L%27Aube%20Nouvelle.ogg',
  bw:'https://commons.wikimedia.org/wiki/Special:FilePath/United%20States%20Navy%20Band%20-%20Fatshe%20leno%20la%20rona.ogg',
  cd:'https://upload.wikimedia.org/wikipedia/en/3/3f/Democratic_Republic_of_the_Congo%27s_national_anthem.ogg',
  cf:'https://commons.wikimedia.org/wiki/Special:FilePath/La%20Renaissance%20%281960s%20recording%29.ogg',
  cg:'https://commons.wikimedia.org/wiki/Special:FilePath/National%20anthem%20of%20the%20Republic%20of%20the%20Congo.oga',
  ci:'https://upload.wikimedia.org/wikipedia/commons/6/67/United_States_Navy_Band_-_National_Anthem_of_C%C3%B4te_D%27Ivoire_%22L%27Abidjanaise%22.ogg',
  cv:'https://commons.wikimedia.org/wiki/Special:FilePath/C%C3%A2ntico%20da%20Liberdade%20%28instrumental%29.ogg',
  dj:'https://commons.wikimedia.org/wiki/Special:FilePath/Djibouti%20anthem%20Somali%20lyrics.ogg',
  dz:'https://commons.wikimedia.org/wiki/Special:FilePath/Kassaman%20instrumental.ogg',
  eg:'https://commons.wikimedia.org/wiki/Special:FilePath/Bilady%2C%20Bilady%2C%20Bilady.ogg',
  eh:'https://upload.wikimedia.org/wikipedia/commons/0/0d/Yabaniy_es-sahara_SADR_anthem.ogg',
  er:'https://commons.wikimedia.org/wiki/Special:FilePath/National%20Anthem%20of%20Eritrea%20by%20US%20Navy%20Band.ogg',
  et:'https://commons.wikimedia.org/wiki/Special:FilePath/Wedefit%20Gesgeshi%20Widd%20Innat%20Ittyoppya.ogg',
  ga:'https://commons.wikimedia.org/wiki/Special:FilePath/La%20Concorde.ogg',
  gh:'https://commons.wikimedia.org/wiki/Special:FilePath/National%20Anthem%20of%20Ghana.ogg',
  gm:'https://upload.wikimedia.org/wikipedia/commons/0/05/For_The_Gambia_Our_Homeland_%28instrumental%29.ogg',
  gn:'https://commons.wikimedia.org/wiki/Special:FilePath/Libert%C3%A9.oga',
  gw:'https://commons.wikimedia.org/wiki/Special:FilePath/Anthem%20of%20Guinea%20Bissau.webm',
  gq:'https://commons.wikimedia.org/wiki/Special:FilePath/Equatorial%20Guinea%27s%20national%20anthem%2C%20performed%20by%20the%20United%20States%20Navy%20Band.oga',
  ke:'https://commons.wikimedia.org/wiki/Special:FilePath/National%20anthem%20of%20Kenya%2C%20performed%20by%20the%20United%20States%20Navy%20Band.wav',
  km:'https://commons.wikimedia.org/wiki/Special:FilePath/National%20anthem%20of%20the%20Comoros%2C%20performed%20by%20the%20U.S.%20Navy%20Band.oga',
  lr:'https://commons.wikimedia.org/wiki/Special:FilePath/Liberia%20National%20Anthem.ogg',
  ls:'https://commons.wikimedia.org/wiki/Special:FilePath/National%20anthem%20of%20Lesotho%2C%20performed%20by%20the%20U.S.%20Navy%20Band.wav',
  ly:'https://commons.wikimedia.org/wiki/Special:FilePath/Libya%2C%20Libya%2C%20Libya%20instrumental.ogg',
  ma:'https://commons.wikimedia.org/wiki/Special:FilePath/National%20Anthem%20of%20Morocco.ogg',
  mg:'https://commons.wikimedia.org/wiki/Special:FilePath/Ry%20Tanindrazanay%20malala%20%C3%B4%21%20%28instrumental%29.ogg',
  ml:'https://commons.wikimedia.org/wiki/Special:FilePath/Malian%20national%20anthem%2C%20performed%20by%20the%20United%20States%20Navy%20Band.oga',
  mr:'https://commons.wikimedia.org/wiki/Special:FilePath/United%20States%20Navy%20Band%20-%20Bil%C4%81da%20l-%CA%BEub%C4%81ti%20l-hud%C4%81ti%20l-kir%C4%81m.ogg',
  mu:'https://commons.wikimedia.org/wiki/Special:FilePath/Motherland%20%28instrumental%29.ogg',
  mw:'https://commons.wikimedia.org/wiki/Special:FilePath/Malawian%20national%20anthem.oga',
  mz:'https://commons.wikimedia.org/wiki/Special:FilePath/Mozambican%20national%20anthem%2C%20performed%20by%20the%20United%20States%20Navy%20Band.wav',
  na:'https://commons.wikimedia.org/wiki/Special:FilePath/Namibia%2C%20Land%20of%20the%20Brave%20%28OGG%29.ogg',
  ne:'https://commons.wikimedia.org/wiki/Special:FilePath/THE%20HONOR%20OF%20THE%20FATHERLAND.ogg',
  ng:'https://commons.wikimedia.org/wiki/Special:FilePath/Nigeria%20We%20Hail%20Thee.ogg',
  rw:'https://commons.wikimedia.org/wiki/Special:FilePath/Hymne%20National%20du%20Rwanda.ogg',
  sc:'https://commons.wikimedia.org/wiki/Special:FilePath/Koste%20Seselwa%20%28instrumental%29.ogg',
  sd:'https://commons.wikimedia.org/wiki/Special:FilePath/Sudanese%20national%20anthem%2C%20performed%20by%20the%20U.S.%20Navy%20Band.oga',
  sl:'https://commons.wikimedia.org/wiki/Special:FilePath/Sierra%20Leone%27s%20national%20anthem.ogg',
  sn:'https://upload.wikimedia.org/wikipedia/commons/8/8c/National_Anthem_of_Senegal.ogg',
  so:'https://commons.wikimedia.org/wiki/Special:FilePath/Somali%20national%20anthem%2C%20performed%20by%20the%20United%20States%20Navy%20Band.oga',
  ss:'https://commons.wikimedia.org/wiki/Special:FilePath/South%20Sudan%20Oyee%21%20%28instrumental%29.ogg',
  st:'https://commons.wikimedia.org/wiki/Special:FilePath/Independ%C3%AAncia%20total%20%28instrumental%29.ogg',
  sz:'https://commons.wikimedia.org/wiki/Special:FilePath/National%20anthem%20of%20the%20Kingdom%20of%20Eswatini.ogg',
  td:'https://commons.wikimedia.org/wiki/Special:FilePath/La%20Tchadienne%20%28instrumental%29.ogg',
  tg:'https://commons.wikimedia.org/wiki/Special:FilePath/Hymne%20du%20Togo%20-%20salut%20a%20toi.ogg',
  tn:'https://commons.wikimedia.org/wiki/Special:FilePath/Humat%20al-Hima.ogg',
  tz:'https://commons.wikimedia.org/wiki/Special:FilePath/Tanzanian%20national%20anthem%2C%20performed%20by%20the%20United%20States%20Navy%20Band.oga',
  ug:'https://commons.wikimedia.org/wiki/Special:FilePath/Ugandan%20national%20anthem%2C%20performed%20by%20the%20U.S.%20Navy%20Band.ogg',
  za:'https://commons.wikimedia.org/wiki/Special:FilePath/South%20African%20national%20anthem.oga',
  zm:'https://commons.wikimedia.org/wiki/Special:FilePath/National%20anthem%20of%20Zambia.oga',
  zw:'https://commons.wikimedia.org/wiki/Special:FilePath/National%20Anthem%20of%20Zimbabwe.ogg'
};
let anthemMedia = null;
let audioChannel = { type: null, id: null };
let activeCountryMap = null;
let countryPopTimer = null;
let countryUtilityTimer = null;
let storySlideTimer = null;
let activeStoryIndex = 0;
let activeStoryFeed = [];
let storyQueueOpen = true;
const countryNameCollator = new Intl.Collator('en', { sensitivity: 'base' });
const sortedCountryIds = paths.map(path => path.id).sort((a, b) => {
  const nameA = COUNTRY_INFO[a]?.name || a;
  const nameB = COUNTRY_INFO[b]?.name || b;
  return countryNameCollator.compare(nameA, nameB) || a.localeCompare(b);
});
const track = document.getElementById('cv-track');
const dots = Array.from(document.querySelectorAll('.cv-dot'));
const audienceSelect = document.getElementById('cv-audience');
const audienceTabs = Array.from(document.querySelectorAll('.cv-audience-tab'));
if (audienceSelect && activeStoryLens !== 'general') audienceSelect.value = activeStoryLens;
updateStoryLensControls();
const mobileDossierMedia = window.matchMedia('(max-width: 720px)');
const countryFile = document.getElementById('cv-country-file');
const countryFileToggle = document.getElementById('cv-file-toggle');
const countryFileContent = document.getElementById('cv-file-content');
let currentSlideIndex = 0;
let activePanelIndex = 0;
const infoGridIndexByMode = { farmers: 0, investors: 0, diaspora: 0 };
let countryFileExpanded = false;
const countryCarousel = track?.parentElement;
countryCarousel?.addEventListener('scroll', () => {
  if (countryCarousel.scrollLeft !== 0) countryCarousel.scrollLeft = 0;
}, { passive: true });

function setCountryFileExpanded(expanded) {
  countryFileExpanded = !!expanded;
  countryFile?.classList.toggle('is-expanded', countryFileExpanded);
  countryFileToggle?.setAttribute('aria-expanded', String(countryFileExpanded));
  if (countryFileContent) {
    const collapsed = mobileDossierMedia.matches && !countryFileExpanded;
    countryFileContent.hidden = collapsed;
    countryFileContent.setAttribute('aria-hidden', String(collapsed));
  }
}

function syncCountryFileViewport() {
  setCountryFileExpanded(countryFileExpanded);
  updateSlidePos();
}

countryFileToggle?.addEventListener('click', () => {
  setCountryFileExpanded(!countryFileExpanded);
});
if (mobileDossierMedia.addEventListener) mobileDossierMedia.addEventListener('change', syncCountryFileViewport);
else mobileDossierMedia.addListener?.(syncCountryFileViewport);

function updateSlidePos() {
  if (countryCarousel) countryCarousel.scrollLeft = 0;
  if (track) track.style.transform = 'translateX(-' + (activePanelIndex * 33.333333) + '%)';
  document.body.dataset.panel = String(activePanelIndex);
  dots.forEach(dot => {
    const selected = Number(dot.dataset.panel) === activePanelIndex;
    dot.setAttribute('aria-current', String(selected));
    dot.setAttribute('aria-selected', String(selected));
    dot.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll('.cv-panel').forEach(panel => {
    const selected = Number(panel.dataset.panel) === activePanelIndex;
    panel.setAttribute('aria-hidden', String(!selected));
    if ('inert' in panel) panel.inert = !selected;
  });
  const pos = document.getElementById('cv-pos');
  if (pos && sortedCountryIds.length) pos.textContent = String(currentSlideIndex + 1).padStart(2, '0') + '/' + String(sortedCountryIds.length).padStart(2, '0');
  // Redraw the atlas after the panel has actually laid out, and re-check activeCountryMap
  // at call time rather than schedule time. Deep-linking to #/xx/atlas sets the panel
  // before the map data is attached, so the old guard skipped the redraw and nothing ran
  // afterwards: the canvas kept its 300x150 browser default and a 1169x320 CSS box
  // stretched it almost twofold. Two frames plus a settle pass covers the carousel
  // transform; the redraw is cheap and idempotent.
  const repaintAtlas = () => {
    if (!activeCountryMap) return;
    drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath);
  };
  requestAnimationFrame(() => requestAnimationFrame(repaintAtlas));
  setTimeout(repaintAtlas, 250);
}

function setPanel(index) {
  activePanelIndex = Math.max(0, Math.min(2, Number(index) || 0));
  updateSlidePos();
  updateAudienceMeta();
  if (activePanelIndex === 1) requestAnimationFrame(updateInfoNavState);
  if (activePanelIndex === 2 && activeCountryMap) {
    preloadAdjacentCountryData(activeCountryMap.countryId);
  }
}

window.__resetPanel = () => setPanel(0);

function activeInfoGrid() {
  const mode = audienceSelect?.value || 'farmers';
  return document.querySelector('.audience-mode.cv-info-grid[data-mode="' + mode + '"]');
}

function infoGridMetrics(grid) {
  const firstCard = grid?.children[0];
  const gap = grid ? (parseFloat(getComputedStyle(grid).columnGap) || 14) : 14;
  const step = grid ? ((firstCard?.getBoundingClientRect().width || grid.clientWidth) + gap) : 1;
  const maxIndex = Math.max(0, (grid?.children.length || 1) - 1);
  return { step, maxIndex };
}

function rememberInfoGridPosition(grid = activeInfoGrid()) {
  if (!grid) return;
  const mode = grid.dataset.mode || 'farmers';
  if (mobileDossierMedia.matches) {
    infoGridIndexByMode[mode] = 0;
    return;
  }
  const { step, maxIndex } = infoGridMetrics(grid);
  infoGridIndexByMode[mode] = Math.max(0, Math.min(maxIndex, Math.round(grid.scrollLeft / step)));
}

function restoreInfoGridPosition(mode = audienceSelect?.value || 'farmers') {
  requestAnimationFrame(() => {
    const grid = document.querySelector('.audience-mode.cv-info-grid[data-mode="' + mode + '"]');
    if (!grid) return;
    if (mobileDossierMedia.matches) {
      infoGridIndexByMode[mode] = 0;
      grid.scrollLeft = 0;
      updateInfoNavState();
      return;
    }
    const { step, maxIndex } = infoGridMetrics(grid);
    const index = Math.max(0, Math.min(maxIndex, infoGridIndexByMode[mode] || 0));
    infoGridIndexByMode[mode] = index;
    grid.scrollLeft = index * step;
    updateInfoNavState();
  });
}

function updateInfoNavState() {
  const grid = activeInfoGrid();
  rememberInfoGridPosition(grid);
  const canScroll = !!grid && grid.scrollWidth > grid.clientWidth + 2;
  document.querySelectorAll('.cv-carousel-arrow[data-carousel="cv-info-grid"]').forEach(button => {
    button.disabled = !canScroll;
    if (!grid || !canScroll) {
      button.removeAttribute('data-edge');
      return;
    }
    const max = grid.scrollWidth - grid.clientWidth - 2;
    const atStart = grid.scrollLeft <= 2;
    const atEnd = grid.scrollLeft >= max;
    button.dataset.edge = button.dataset.direction === 'prev'
      ? String(atStart)
      : String(atEnd);
  });
  const meta = document.getElementById('cv-audience-meta');
  if (meta && grid) {
    const mode = audienceSelect?.value || 'farmers';
    const lens = audienceLabel(mode);
    const total = grid.children.length;
    const current = Math.min(total, (infoGridIndexByMode[mode] || 0) + 1);
    meta.textContent = total > 1 ? lens + ' · ' + current + '/' + total : lens;
  }
}

function scrollActiveInfoGrid(direction) {
  const grid = activeInfoGrid();
  if (!grid) return;
  if (mobileDossierMedia.matches) {
    grid.scrollLeft = 0;
    infoGridIndexByMode[grid.dataset.mode || 'farmers'] = 0;
    updateInfoNavState();
    return;
  }
  rememberInfoGridPosition(grid);
  const mode = grid.dataset.mode || 'farmers';
  const { step, maxIndex } = infoGridMetrics(grid);
  const delta = direction === 'prev' ? -1 : 1;
  const nextIndex = Math.max(0, Math.min(maxIndex, (infoGridIndexByMode[mode] || 0) + delta));
  infoGridIndexByMode[mode] = nextIndex;
  const next = nextIndex * step;
  animateScrollLeft(grid, next);
  setTimeout(updateInfoNavState, 420);
}

// Native smooth scrollTo() proved unreliable here (throttled frames abandon the animation and
// the grid never moves). This tween writes scrollLeft directly and a timeout guarantees arrival.
function animateScrollLeft(el, to, ms = 260) {
  const from = el.scrollLeft;
  if (Math.abs(to - from) < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.scrollLeft = to;
    return;
  }
  const t0 = performance.now();
  let done = false;
  const tick = now => {
    if (done) return;
    const t = Math.min(1, (now - t0) / ms);
    el.scrollLeft = from + (to - from) * (1 - Math.pow(1 - t, 3));
    if (t < 1) requestAnimationFrame(tick); else done = true;
  };
  requestAnimationFrame(tick);
  setTimeout(() => { if (!done) { done = true; el.scrollLeft = to; } }, ms + 120);
}

for (const pill of layerPills) {
  pill.addEventListener('click', () => {
    const key = pill.dataset.layer;
    const next = !(pill.getAttribute('aria-pressed') === 'true');
    pill.setAttribute('aria-pressed', String(next));
    mapLayers[key] = next;
    updateLayerStatus();
    if (activeCountryMap) {
      drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath);
    }
  });
}

function updateLayerStatus() {
  const active = Object.values(mapLayers).filter(Boolean).length;
  // The pills already show what is on; "7 active overlays" said nothing more.
  if (layerStatus) layerStatus.textContent = active ? '' : 'All layers off';
  document.querySelectorAll('[data-legend-layer]').forEach(item => {
    item.hidden = !mapLayers[item.dataset.legendLayer];
  });
}
updateLayerStatus();

function updateMapToolbarTitle() {
  if (!activeCountryMap) return;
  const info = COUNTRY_INFO[activeCountryMap.countryId];
  if (!info) return;
  if (mapToolbarRegion) mapToolbarRegion.textContent = info.region;
  if (mapToolbarCountry) mapToolbarCountry.textContent = info.name;
}

const mapFsBtn = document.getElementById('cv-map-fs');
const mapPortal = document.getElementById('cv-map-portal');
let mapOriginalParent = null;
let countryNavSerial = 0;
let countryNavBusy = false;

function setCountryNavBusy(busy) {
  countryNavBusy = !!busy;
  ['cv-prev', 'cv-next', 'cv-map-prev', 'cv-map-next'].forEach(id => {
    const button = document.getElementById(id);
    if (button) button.disabled = countryNavBusy;
  });
  if (mapPortal) mapPortal.setAttribute('aria-busy', String(countryNavBusy));
}

function updateMapPortalChrome() {
  updateMapToolbarTitle();
}

mapFsBtn.addEventListener('click', () => {
  const wrap = document.querySelector('.cv-map-wrap');
  document.getElementById('cv-layer-menu')?.removeAttribute('open');
  const isFs = !mapPortal.classList.contains('active');
  if (isFs) {
    mapOriginalParent = wrap.parentElement;
    mapPortal.classList.add('active');
    mapPortal.appendChild(wrap);
    updateMapPortalChrome();
    if (activeCountryMap) preloadAdjacentCountryData(activeCountryMap.countryId);
  } else {
    mapPortal.classList.remove('active');
    if (mapOriginalParent) mapOriginalParent.appendChild(wrap);
  }
  mapFsBtn.textContent = isFs ? '✕' : '⛶';
  mapFsBtn.title = isFs ? 'Exit fullscreen' : 'Toggle fullscreen';
  // Redraw SYNCHRONOUSLY, before the browser paints. The DOM change above has already resized the
  // canvas box; drawCountryMap reads the new size (getBoundingClientRect forces layout) and repaints
  // the bitmap at the correct aspect in this same task — so the browser never paints the old bitmap
  // stretched to the new shape (the "shape shift"). The ResizeObserver settle-redraw stays as a
  // backup for genuine window resizes.
  if (activeCountryMap) {
    drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath);
  }
});

function updateCountryFileSummary(info) {
  if (!info) return;
  const name = document.getElementById('cv-file-name');
  const capital = document.getElementById('cv-file-capital');
  const population = document.getElementById('cv-file-pop');
  if (name) name.textContent = info.name;
  if (capital) capital.textContent = info.capital;
  if (population) population.textContent = formatCompactPop(livePopulation(info.pop, info.gr)) + ' people';
}

function openCountry(countryId, sourceElement = document.activeElement, options = {}) {
  const info = COUNTRY_INFO[countryId];
  const countryPath = pathById[countryId];
  if (!info) return;
  const wasOpen = countryView.classList.contains('open');
  // Paging to the next country keeps the reader's place, on phone and desktop alike: a
  // reader down in a tab lands at the top of the same tab for the new country (not at a
  // pixel offset - the header above and the list below differ per country); a reader
  // still at the header stays there. A re-render of the same country (its data arriving)
  // moves nobody.
  const keepPanelStart = wasOpen && activeCountryMap?.countryId !== countryId &&
    countryView.scrollTop >= panelStartScrollTop() - 8;
  if (ROUTE_AUDIENCES.includes(options.audience) && audienceSelect) audienceSelect.value = options.audience;
  ensureCountryData(countryId);
  prefetchRelief(countryId);
  // The element to return focus to on close: what opened the view, not the Next button.
  if (!wasOpen) lastFocus = sourceElement;
  document.getElementById('cv-region').textContent = info.region;
  document.getElementById('cv-name').textContent = info.name;
  document.getElementById('cv-capital').textContent = info.capital;
  updateCountryFileSummary(info);
  renderAnthem(countryId, info);
  renderHeaderMeta(countryId, info);

  const flag = document.getElementById('cv-flag');
  flag.hidden = false;
  // 72 CSS px wide: a 160 px image is soft on a 3x phone, so offer 320 there.
  flag.srcset = 'https://flagcdn.com/w160/' + info.cc + '.png 2x, https://flagcdn.com/w320/' + info.cc + '.png 3x';
  flag.src = 'https://flagcdn.com/w80/' + info.cc + '.png';
  flag.alt = info.name + ' flag';
  flag.onerror = () => { flag.hidden = true; };

  renderAlmanacFromGis(countryId, info);
  if (countryPopTimer) clearInterval(countryPopTimer);
  countryPopTimer = setInterval(() => {
    if (!document.hidden && activeCountryMap?.countryId === countryId) updateCountryFileSummary(info);
  }, 5000);
  if (countryUtilityTimer) clearInterval(countryUtilityTimer);
  countryUtilityTimer = null;
  stopAudioChannel();

  countryView.classList.add('open');
  if (!wasOpen) {
    setCountryFileExpanded(false);
    if (mobileDossierMedia.matches) countryView.scrollTop = 0;
  } else {
    syncCountryFileViewport();
  }
  document.body.style.overflow = 'hidden';
  updateOverlayAccessibility();
  currentSlideIndex = sortedCountryIds.indexOf(countryId);
  if (currentSlideIndex < 0) currentSlideIndex = 0;
  updateSlidePos();
  restoreInfoGridPosition();
  if (Number.isInteger(options.panel)) setPanel(options.panel);
  else if (!wasOpen && window.__resetPanel) window.__resetPanel();
  renderCountryDesk(countryId, countryPath);
  // Paging through the Atlas: the neighbours' map data and relief load while this one is read.
  if (activePanelIndex === 2 || mapPortal?.classList.contains('active')) preloadAdjacentCountryData(countryId);
  updateStarButton(countryId);
  if (getWatchlist().includes(countryId)) {
    markCountrySeen(countryId);
    renderYourDesk();
  }
  syncRoute();
  renderInvestorPanel(countryId, info);
  renderDiasporaPanel(countryId, info);
  renderAudienceKpis(countryId, info);
  updateAudienceMeta();
  updateMapToolbarTitle();
  updateMapPortalChrome();
  if (keepPanelStart) countryView.scrollTop = panelStartScrollTop();
  // A fresh open moves focus to Back. Paging leaves it on the control that paged, so Next
  // can be pressed again; Back sits in the sticky header, and focusing a sticky element
  // scrolls the view to the top - which is what threw readers out of the Atlas.
  if (!wasOpen) backBtn.focus();
  else if (!countryView.contains(document.activeElement)) backBtn.focus({ preventScroll: true });
}

// Header meta line: growth (with vintage), live USD reference rate, and market code.
// FX may arrive after open — the fx-ready listener re-runs this.
function renderHeaderMeta(countryId, info) {
  const inv = investorForCountry(countryId, info);
  const growthEl = document.getElementById('cv-growth');
  if (growthEl) {
    growthEl.textContent = Number.isFinite(inv.gdp_growth)
      ? (inv.gdp_growth > 0 ? '+' : '') + inv.gdp_growth + '%' + (inv.growthYear ? ' · ' + inv.growthYear : '/yr')
      : '—';
  }
  const fxWrap = document.getElementById('cv-fx');
  if (fxWrap) {
    fxWrap.style.display = 'none';
  }
  const exWrap = document.getElementById('cv-exch');
  if (exWrap) {
    exWrap.style.display = 'none';
  }
}

function renderAnthem(countryId, info) {
  const wrap = document.getElementById('cv-anthem-wrap');
  const label = document.getElementById('cv-anthem');
  const button = document.getElementById('cv-anthem-btn');
  const title = ANTHEM_TITLES[countryId] || info.name + ' anthem';
  const source = ANTHEM_AUDIO[countryId];
  if (!wrap || !label || !button) return;
  label.textContent = title;
  label.title = title;
  wrap.hidden = false;
  button.hidden = !source;
  button.classList.remove('playing');
  button.title = source ? 'Play anthem: ' + title : 'No verified anthem audio';
  button.onclick = source ? () => playAnthemPreview(countryId) : null;
}

function stopAudioChannel() {
  if (anthemMedia) {
    anthemMedia.pause();
    anthemMedia = null;
  }
  audioChannel = { type: null, id: null };
  document.querySelectorAll('#cv-anthem-btn').forEach(button => button.classList.remove('playing'));
}

async function playAnthemPreview(countryId) {
  const source = ANTHEM_AUDIO[countryId];
  const button = document.getElementById('cv-anthem-btn');
  if (!source || !button) return;
  if (audioChannel.type === 'anthem' && audioChannel.id === countryId) {
    stopAudioChannel();
    return;
  }
  stopAudioChannel();
  audioChannel = { type: 'anthem', id: countryId };
  button.classList.add('playing');
  try {
    anthemMedia = new Audio(source);
    anthemMedia.volume = 0.72;
    anthemMedia.onended = stopAudioChannel;
    anthemMedia.onerror = () => {
      button.hidden = true;
      stopAudioChannel();
    };
    await anthemMedia.play();
  } catch {
    button.hidden = true;
    stopAudioChannel();
  }
}

function closeCountry() {
  countryNavSerial += 1;
  setCountryNavBusy(false);
  stopAudioChannel();
  countryView.classList.remove('open');
  const wireOpen = document.getElementById('wire-view')?.classList.contains('open');
  if (!wireOpen && !storyReader?.classList.contains('open')) document.body.style.overflow = '';
  updateOverlayAccessibility();
  if (countryPopTimer) clearInterval(countryPopTimer);
  if (countryUtilityTimer) clearInterval(countryUtilityTimer);
  countryPopTimer = null;
  countryUtilityTimer = null;
  if (shouldRestoreCountryFocus(lastFocus)) {
    lastFocus.focus();
  } else if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
  if (isTouchLikePointer()) resumeCityTicker();
  syncRoute();
}

function resumeCityTicker() {
  if (!tickerEl) return;
  requestAnimationFrame(() => {
    const focused = document.activeElement;
    if (focused?.closest?.('#ticker')) focused.blur();
    tickerEl.style.animationPlayState = 'running';
    tickerEl.getAnimations?.().forEach(animation => animation.play());
    window.setTimeout(() => tickerEl.style.removeProperty('animation-play-state'), 240);
  });
}

function isTouchLikePointer() {
  return window.matchMedia('(pointer:coarse)').matches ||
    window.matchMedia('(hover:none)').matches ||
    window.matchMedia('(max-width:720px)').matches;
}

function shouldRestoreCountryFocus(element) {
  if (!element || !element.focus) return false;
  if (isTouchLikePointer() && element.closest && element.closest('.ticker')) return false;
  return true;
}

async function openCountryByOffset(offset) {
  if (!sortedCountryIds.length) return;
  const next = (currentSlideIndex + offset + sortedCountryIds.length) % sortedCountryIds.length;
  const countryId = sortedCountryIds[next];
  const sourceElement = document.activeElement;
  const fromCountryId = activeCountryMap?.countryId;
  const serial = ++countryNavSerial;

  // Detailed country chunks replace the intentionally simplified landing-map outline.
  // In fullscreen that swap reads as a deformed intermediate shape, so keep the current
  // completed atlas on screen until the destination's final geometry is ready.
  if (mapPortal?.classList.contains('active') && !COUNTRY_DETAIL[countryId]) {
    setCountryNavBusy(true);
    try {
      await loadCountryData(countryId);
      if (
        serial !== countryNavSerial ||
        !countryView.classList.contains('open') ||
        activeCountryMap?.countryId !== fromCountryId
      ) return;
    } finally {
      if (serial === countryNavSerial) setCountryNavBusy(false);
    }
  }

  if (serial !== countryNavSerial) return;
  openCountry(countryId, sourceElement);
}

// Who the panel is for, in the reader's words ("capital lens" was the desk's).
function audienceLabel(mode) {
  return mode === 'investors' ? 'For investors' : mode === 'diaspora' ? 'For the diaspora' : 'For farmers';
}

function updateAudienceMeta() {
  const meta = document.getElementById('cv-audience-meta');
  const mode = audienceSelect?.value || 'farmers';
  document.body.dataset.audience = mode;
  audienceTabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.audience === mode)));
  if (meta) meta.textContent = audienceLabel(mode);
  restoreInfoGridPosition(mode);
  renderSignalsJump(mode);
  if (mode === 'investors') refitHeatTickers();
}

/* Signals sections fold on phones. There they stack into some 3,000px (three and a half
   screens for a farmer). A row of section links used to sit at the top and scroll the page
   to the section, but on a real iPhone the links kept landing short, past or nowhere
   (10 Nov 2026, all three lenses): Safari's own scrolling won over the jump however it
   was held. Now each section heading is a button that opens or closes the section in
   place, so nothing scrolls the page: the headings of a lens fit on one screen, and the
   reader opens the one they came for. Every section starts closed (owner, 10 Nov 2026).
   On wider screens the sections sit side by side and every section is always shown. */
const signalsOpenByMode = {};

function renderSignalsJump(mode = audienceSelect?.value || 'farmers') {
  const grid = document.querySelector('.audience-mode.cv-info-grid[data-mode="' + mode + '"]');
  if (!grid) return;
  if (!signalsOpenByMode[mode]) signalsOpenByMode[mode] = new Set();
  const open = signalsOpenByMode[mode];
  // A new lens, panel or country: drop any room a closed section left at the bottom.
  const body = grid.closest('.cv-panel-body');
  if (body) body.style.paddingBottom = '';
  Array.from(grid.children).filter(el => el.querySelector(':scope > .cv-section-head h4')).forEach((section, index) => {
    if (!section.id) section.id = 'cv-sec-' + mode + '-' + index;
    section.dataset.foldIndex = String(index);
    section.classList.add('cv-fold');
    const head = section.querySelector(':scope > .cv-section-head');
    const h4 = head.querySelector('h4');
    let button = h4.querySelector(':scope > .cv-fold-btn');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'cv-fold-btn';
      while (h4.firstChild) button.appendChild(h4.firstChild);
      h4.appendChild(button);
      // The section's content gets an id the button can point at.
      const content = Array.from(section.children).filter(el => el !== head);
      if (content[0]) {
        if (!content[0].id) content[0].id = section.id + '-body';
        button.setAttribute('aria-controls', content[0].id);
      }
      // The whole heading is the target (the meta beside the title too), not only the words.
      head.addEventListener('click', () => {
        if (!mobileDossierMedia.matches) return;
        setSignalsSectionOpen(section, !section.classList.contains('is-open'));
      });
      // The headline figure beside a closed heading, kept current as the section's
      // content arrives (country data, then prices and rates a moment later).
      const sum = document.createElement('span');
      sum.className = 'cv-fold-sum';
      sum.setAttribute('aria-hidden', 'true');
      head.appendChild(sum);
      if (typeof MutationObserver !== 'undefined') {
        let queued = false;
        new MutationObserver(() => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => { queued = false; updateSignalsFoldSummary(section); });
        }).observe(section, { childList: true, subtree: true, characterData: true });
      }
    }
    updateSignalsFoldSummary(section);
    const isOpen = open.has(index);
    section.classList.toggle('is-open', isOpen);
    button.setAttribute('aria-expanded', String(isOpen));
  });
}

function updateSignalsFoldSummary(section) {
  const sum = section.querySelector(':scope > .cv-section-head > .cv-fold-sum');
  if (!sum) return;
  const text = signalsFoldSummary(section);
  if (sum.textContent !== text) sum.textContent = text;
}

// One line a closed section can show without being opened: its first figure, in the
// words of the section itself. Empty when the section has nothing yet.
function signalsFoldSummary(section) {
  const clean = node => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  const q = selector => section.querySelector(selector);
  let el;
  if ((el = q('.cv-dia-rate-val'))) return '$1 = ' + clean(el);
  if ((el = q('.cv-index-line'))) return [clean(el.querySelector('.cv-index-name')), clean(el.querySelector('.cv-index-chg'))].filter(Boolean).join(' ');
  if ((el = q('.cv-food-list li'))) {
    const label = el.querySelector('span');
    const name = clean(label?.firstChild);
    const unit = clean(label?.querySelector('small')).replace(/^per\s+/i, '').toLowerCase();
    const price = clean(el.querySelector('b'));
    return price ? (name + ' ' + price + (unit ? '/' + unit : '')).trim() : '';
  }
  if ((el = q('.cv-mkt-row:not(.head)'))) return [clean(el.querySelector('.cv-mkt-name')), clean(el.querySelector('.cv-mkt-pop'))].filter(Boolean).join(' ');
  const routes = Array.from(section.querySelectorAll('.cv-route-title')).map(title => {
    const count = clean(title.querySelector('b'));
    const word = (clean(title).replace(count, '').trim().split(' ')[0] || '').toLowerCase();
    return count && count !== '0' && word ? count + ' ' + word : '';
  }).filter(Boolean);
  if (routes.length) return routes.slice(0, 2).join(' · ');
  const rows = section.querySelectorAll('.cv-cal-row');
  if (rows.length) {
    const month = new Date().getMonth();
    const now = kind => Array.from(rows).filter(row => row.querySelectorAll('.cv-cal-cell')[month]?.classList.contains(kind))
      .map(row => clean(row.querySelector('i b') || row.querySelector('i')));
    const list = names => names.slice(0, 2).join(', ') + (names.length > 2 ? ' +' + (names.length - 2) : '');
    const harvest = now('h');
    if (harvest.length) return 'Harvest now: ' + list(harvest);
    const sowing = now('s');
    if (sowing.length) return 'Sowing now: ' + list(sowing);
    // Nothing this month: the next harvest, so the line still answers "when".
    for (let ahead = 1; ahead < 12; ahead++) {
      const m = (month + ahead) % 12;
      const crops = Array.from(rows).filter(row => row.querySelectorAll('.cv-cal-cell')[m]?.classList.contains('h')).map(row => clean(row.querySelector('i b') || row.querySelector('i')));
      if (crops.length) return 'Next harvest: ' + list(crops) + ', ' + new Date(2000, m, 1).toLocaleString('en-GB', { month: 'short' });
    }
    return '';
  }
  if ((el = q('.cv-econ-cell'))) return [clean(el.querySelector('.cv-econ-val')), clean(el.querySelector('.cv-econ-key'))].filter(Boolean).join(' ');
  if ((el = q('.cv-fact'))) {
    const val = clean(el.querySelector('.cv-fact-val'));
    // A figure, not "No recent figure" or a dash.
    if (!/[0-9]/.test(val)) return '';
    const sub = clean(el.querySelector('.cv-fact-sub')).split('·')[0].trim();
    return val + ' ' + (/^(share of |of |per )/i.test(sub) ? sub.replace(/^share /i, '') : clean(el.querySelector('.cv-fact-key')));
  }
  return '';
}

function setSignalsSectionOpen(section, isOpen) {
  const grid = section?.closest('.audience-mode.cv-info-grid');
  if (!grid) return;
  const mode = grid.dataset.mode;
  const index = Number(section.dataset.foldIndex);
  const open = signalsOpenByMode[mode] || (signalsOpenByMode[mode] = new Set());
  // Closing a section near the end of the page would leave the page shorter than where it
  // is scrolled to, and the browser would pull it up under the reader's finger. Add that
  // room at the bottom first, so the heading stays put (no scrolling, here or anywhere).
  const body = section.closest('.cv-panel-body');
  if (!isOpen && body && section.classList.contains('is-open') && mobileDossierMedia.matches) {
    // The whole section, not only its content: the source line beside the title goes too,
    // and a closed heading may be a line shorter. Too much room only costs blank space.
    const removed = section.getBoundingClientRect().height;
    const room = countryView.scrollHeight - countryView.clientHeight - countryView.scrollTop;
    if (removed > room) body.style.paddingBottom = Math.ceil((parseFloat(getComputedStyle(body).paddingBottom) || 0) + removed - room) + 'px';
  }
  if (isOpen) open.add(index); else open.delete(index);
  section.classList.toggle('is-open', isOpen);
  section.querySelector('.cv-fold-btn')?.setAttribute('aria-expanded', String(isOpen));
  // Content drawn while folded had no width; tickers refit themselves once shown.
  if (isOpen && mode === 'investors') refitHeatTickers();
}

// The scroll position that puts the top of the panels just under the sticky header and
// tab row (both sticky on phone and desktop).
function panelStartScrollTop() {
  const body = document.querySelector('.cv-body');
  const carousel = document.querySelector('.cv-carousel');
  const headerHeight = document.querySelector('.cv-header')?.offsetHeight || 0;
  const navHeight = document.getElementById('cv-dots')?.offsetHeight || 0;
  return Math.max(0, (body?.offsetTop || 0) + (carousel?.offsetTop || 0) - headerHeight - navHeight);
}

// A tab opens at its top, as the next country does. Phones always bring the panels up
// under the tab row (they start below the fold); desktop only when the reader is already
// down in a panel, so a reader looking at the header is not moved.
function showPanelStart() {
  if (!countryView.classList.contains('open')) return;
  if (!mobileDossierMedia.matches && countryView.scrollTop < panelStartScrollTop() - 8) return;
  requestAnimationFrame(() => countryView.scrollTo({ top: panelStartScrollTop(), behavior: 'auto' }));
}

backBtn.addEventListener('click', closeCountry);
document.getElementById('cv-prev')?.addEventListener('click', () => openCountryByOffset(-1));
document.getElementById('cv-next')?.addEventListener('click', () => openCountryByOffset(1));
document.getElementById('cv-map-prev')?.addEventListener('click', () => openCountryByOffset(-1));
document.getElementById('cv-map-next')?.addEventListener('click', () => openCountryByOffset(1));
dots.forEach(dot => dot.addEventListener('click', () => {
  setPanel(Number(dot.dataset.panel));
  syncRoute();
  showPanelStart();
}));
document.getElementById('cv-dots')?.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0
    : event.key === 'End' ? dots.length - 1
    : (activePanelIndex + (event.key === 'ArrowLeft' ? -1 : 1) + dots.length) % dots.length;
  setPanel(next);
  dots[next]?.focus({ preventScroll: true });
  syncRoute();
  showPanelStart();
});
document.querySelectorAll('.cv-carousel-arrow[data-carousel="cv-info-grid"]').forEach(button => {
  button.addEventListener('click', () => scrollActiveInfoGrid(button.dataset.direction || 'next'));
});
document.querySelectorAll('.audience-mode.cv-info-grid').forEach(grid => {
  grid.addEventListener('scroll', () => {
    rememberInfoGridPosition(grid);
    updateInfoNavState();
  }, { passive: true });
});
audienceSelect?.addEventListener('change', () => {
  // Picks which Signals set to show, nothing more. It used to set the story lens too,
  // which - with the lens chosen only in the Wire - would quietly filter the Wire to
  // whichever Signals tab was last opened.
  updateAudienceMeta();
  if (!activeCountryMap) { syncRoute(); return; }
  const countryId = activeCountryMap.countryId;
  const info = COUNTRY_INFO[countryId];
  renderAudienceKpis(countryId, info);
  syncRoute();
});
audienceTabs.forEach(tab => tab.addEventListener('click', () => {
  if (!audienceSelect) return;
  const mode = tab.dataset.audience || 'farmers';
  audienceSelect.value = mode;
  if (mobileDossierMedia.matches) infoGridIndexByMode[mode] = 0;
  audienceSelect.dispatchEvent(new Event('change'));
  showPanelStart();
}));
document.addEventListener('fx-ready', () => {
  if (!activeCountryMap) return;
  const countryId = activeCountryMap.countryId;
  const info = COUNTRY_INFO[countryId];
  renderDiasporaPanel(countryId, info);
  renderHeaderMeta(countryId, info);
  renderAudienceKpis(countryId, info);
});
document.getElementById('cv-copy-brief')?.addEventListener('click', async event => {
  if (!activeCountryMap) return;
  const ok = await copyPlainText(countryBriefText(activeCountryMap.countryId));
  pulseButtonLabel(event.currentTarget, ok ? 'Copied' : 'Copy Failed');
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && countryView.classList.contains('open') && !storyReader?.classList.contains('open')) closeCountry();
});

// aria-modal promises focus stays inside the dialog; without a trap, Tab walks out into the
// hidden landing page behind it. Wrap focus at both ends for any open modal container.
function trapFocus(container) {
  if (!container) return;
  container.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !container.classList.contains('open')) return;
    const focusables = Array.from(container.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  });
}
trapFocus(countryView);
trapFocus(document.getElementById('wire-view'));
trapFocus(storyReader);

function updateOverlayAccessibility() {
  const main = document.querySelector('main');
  const wireView = document.getElementById('wire-view');
  const wireOpen = wireView?.classList.contains('open');
  const countryOpen = countryView.classList.contains('open');
  const storyOpen = storyReader?.classList.contains('open');
  const setBlocked = (element, blocked) => {
    if (!element) return;
    element.setAttribute('aria-hidden', String(blocked));
    if ('inert' in element) element.inert = blocked;
  };
  setBlocked(main, wireOpen || countryOpen || storyOpen);
  setBlocked(document.querySelector('.masthead'), wireOpen || countryOpen || storyOpen);
  setBlocked(document.querySelector('.sub-rule'), wireOpen || countryOpen || storyOpen);
  setBlocked(countryView, !countryOpen || wireOpen || storyOpen);
  setBlocked(wireView, !wireOpen || storyOpen);
  setBlocked(storyReader, !storyOpen);
}
updateOverlayAccessibility();
window.addEventListener('resize', () => {
  if (!activeCountryMap) return;
  requestAnimationFrame(() => drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath));
});

function landmarksForCountry(countryId) {
  const gis = (typeof COUNTRY_GIS !== 'undefined' && COUNTRY_GIS[countryId]) || null;
  const detail = (typeof COUNTRY_DETAIL !== 'undefined' && COUNTRY_DETAIL[countryId]) || null;
  const src = (gis && (gis.landmarks || gis.places)) || (detail && detail.landmarks) || [];
  return Array.isArray(src) ? src : [];
}

function renderCountryDesk(countryId, countryPath) {
  const stories = storyFeedForCountry(countryId);
  const landmarks = landmarksForCountry(countryId);
  activeCountryMap = { countryId, countryPath, stories, landmarks };
  activeStoryFeed = stories;
  // Extreme-aspect countries (Gambia ~4:1) letterbox badly in the fixed 4:3 box — let the
  // embedded canvas flatten toward the country's own shape. Fullscreen is untouched (the
  // portal rule sets aspect-ratio:auto, which beats these custom properties).
  const detailBounds = (COUNTRY_DETAIL[countryId] || countryPath || {}).bbox;
  const countryAspect = detailBounds && detailBounds.height > 0 ? detailBounds.width / detailBounds.height : 0;
  if (countryAspect > 2.2) {
    countryMapCanvas.style.setProperty('--map-aspect', Math.min(3, countryAspect * 0.9).toFixed(2) + ' / 1');
    countryMapCanvas.style.setProperty('--map-minh', '210px');
  } else {
    countryMapCanvas.style.removeProperty('--map-aspect');
    countryMapCanvas.style.removeProperty('--map-minh');
  }
  renderNewsPanel(countryId, stories);
  renderEarlierStories(countryId);
  renderFollowNudge(countryId);
  renderCropCalendar(countryId);
  renderAtlasAltText(countryId);
  if (activePanelIndex === 2 || mapPortal?.classList.contains('active')) {
    preloadAdjacentCountryData(countryId);
  }
  // Fullscreen country changes must replace the header and final map in the same paint.
  if (mapPortal?.classList.contains('active')) {
    drawCountryMap(countryId, countryPath);
  } else {
    requestAnimationFrame(() => drawCountryMap(countryId, countryPath));
  }
}

function renderNewsPanel(countryId, stories) {
  renderBriefDesk(countryId);
}

// The ASJ desk hasn't filed from most countries yet. Rather than a dead-end placeholder, the
// News panel opens on a "Country File": a desk briefing composed from the layers we already
// source and label — every line traceable, nothing invented, and the season line is computed
// against today's date. Replaced automatically by ranked stories once the daily desk files.
function renderCountryFile(countryId) {
  const info = COUNTRY_INFO[countryId] || {};
  const inv = investorForCountry(countryId, info);
  const rows = [];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  let econ = '';
  if (inv.gdp) {
    econ = 'GDP <b>' + escapeHtml(inv.gdp) + '</b>' +
      (Number.isFinite(inv.gdp_growth) ? ', growing <b>' + (inv.gdp_growth > 0 ? '+' : '') + inv.gdp_growth + '%</b> a year' : '') + '.';
    if (Array.isArray(inv.gdpSeries) && inv.gdpSeries.length >= 2) {
      const s = economySeriesSummary(inv);
      if (s && s.hasTrend) econ += ' Up from <b>$' + Math.round(s.first.value) + 'B</b> in ' + s.first.year + '.';
    }
    rows.push({ tag: inv.source === 'World Bank' ? 'World Bank ' + (inv.gdpYear || '') : 'Economy', text: econ });
  }

  const profile = marketProfileForCountry(countryId);
  rows.push(profile.exchange
    ? { tag: 'Exchange directory', text: 'Listed market: <b>' + escapeHtml(profile.exchange) + '</b> · ' + escapeHtml(profile.name) + (profile.market?.companies?.length ? ', tracking <b>' + profile.market.companies.length + '</b> listings.' : '.') }
    : { tag: 'Exchange directory', text: 'No verified domestic securities exchange.' });

  const rate = (window.__FX || {})[inv.currency];
  if (Number.isFinite(rate)) {
    rows.push({ tag: 'Exchange rate', text: '$1 buys <b>' + formatFxRate(rate) + ' ' + escapeHtml(inv.currency) + '</b> at today\'s reference rate.' });
  }

  const crops = farmExportsForCountry(countryId).slice(0, 3).filter(c => CROP_SEASONS[c]);
  if (crops.length) {
    const month = new Date().getMonth() + 1;
    const status = crops.map(crop => {
      const spec = seasonSpecForCountry(countryId, crop);
      const h = spec.h || [], s = spec.s || [];
      if (h.includes(month)) return '<b>' + escapeHtml(crop) + '</b> ' + seasonHarvestLabel(spec).toLowerCase() + ' window open';
      if (s.includes(month)) return '<b>' + escapeHtml(crop) + '</b> ' + seasonPlantLabel(spec).toLowerCase() + ' window open';
      const nextH = h.length ? h.find(m => m > month) || h[0] : null;
      return nextH ? '<b>' + escapeHtml(crop) + '</b> ' + seasonHarvestLabel(spec).toLowerCase() + ' opens ' + MONTHS[nextH - 1] : '<b>' + escapeHtml(crop) + '</b>';
    });
    const faoCount = crops.filter(crop => seasonSpecForCountry(countryId, crop)?.source === 'FAO').length;
    const calSource = faoCount === crops.length ? 'FAO' : faoCount ? 'FAO and typical months' : 'typical months';
    rows.push({ tag: 'Crop calendar · ' + calSource, text: status.join(' · ') + '.' });
  }

  const remit = countryFact(countryId, 'remitUsd');
  if (remit) {
    rows.push({ tag: 'World Bank ' + remit.y, text: 'Remittances received: <b>' + escapeHtml(formatFactValue('usd', remit.v)) + '</b> a year.' });
  }

  const port = countryPorts(countryId)[0];
  const airport = countryAirports(countryId)[0];
  const links = [port ? port.name + ' (seaport)' : '', airport ? airport.name : ''].filter(Boolean);
  rows.push({ tag: 'Ports · airports', text: 'Capital <b>' + escapeHtml(info.capital || '—') + '</b>' + (links.length ? '; main links <b>' + links.map(escapeHtml).join('</b> and <b>') + '</b>.' : '.') });

  return '<div class="cv-brief-desk cv-deskfile">' +
    '<div class="cv-brief-head"><span class="t">Country <b>file</b></span><span class="m">From public data</span></div>' +
    rows.map(r => '<div class="cv-df-row"><span class="cv-df-tag">' + r.tag + '</span><p>' + r.text + '</p></div>').join('') +
    '<div class="cv-df-note">No stories from ' + escapeHtml(info.name || 'this country') + ' in today\'s edition. They appear here when outlets report from it.</div>' +
  '</div>';
}

const STORY_REGISTRY = new Map();
let storyReaderLastFocus = null;
let activeReaderRecord = null;
let activeReaderQueue = [];
let activeReaderNextKey = '';
let activeWireStoryKeys = [];

// Search normalisation. Two things the wire search did not do.
//
// It stripped no accents, so a reader who spells their own country correctly got fewer
// results than one who did not: "senegal" matched two stories and "senegal" with the
// acute matched none. NFD splits a letter from its combining mark and the mark is then
// dropped, which is the same treatment ConvertTo-NewsText already applies on the desk
// side - the browser simply never got it.
//
// It also searched only headline, dek, why, topic, source and country. The desk writes
// about 250 original stories a day and none of their prose was reachable: "inflation"
// returned nothing while three stories discussed it, "drought" nothing while four did.
function foldForSearch(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Built once per story when the index is built. Folding six fields plus three
// paragraphs on every keystroke, across every story, is work that never changes.
function storySearchHaystack(story, context) {
  const sources = Array.isArray(story?.sources)
    ? story.sources.map(s => (s && (s.name || s.url)) || '').join(' ')
    : '';
  return foldForSearch([
    story?.headline,
    story?.dek,
    story?.why,
    story?.topic,
    context?.country,
    sources,
    storyParagraphs(story).join(' ')
  ].filter(Boolean).join(' '));
}

// The paragraphs of one story from its crawlable page (/<cc>/<slug>/, built nightly with
// the edition). Data-saver readers get prose this way instead of downloading all of it.
function fetchStoryParagraphs(story, countryCode) {
  if (!story?.slug || !/^[a-z]{2}$/.test(String(countryCode || ''))) return Promise.resolve(false);
  return fetch('/' + countryCode + '/' + encodeURIComponent(story.slug) + '/', { credentials: 'same-origin' })
    .then(response => response.ok ? response.text() : Promise.reject(new Error(String(response.status))))
    .then(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const paragraphs = Array.from(doc.querySelectorAll('article.story > p:not([class])'), p => p.textContent.trim()).filter(Boolean);
      if (!paragraphs.length) return false;
      story.paragraphs = paragraphs;
      return true;
    })
    .catch(() => false);
}

function storyParagraphs(story) {
  const filed = Array.isArray(story?.paragraphs)
    ? story.paragraphs.map(paragraph => String(paragraph || '').trim()).filter(Boolean)
    : [];
  if (filed.length) return filed;
  const body = String(story?.body || '').trim();
  if (!body) return [];
  const paragraphs = body.split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean);
  return paragraphs.length ? paragraphs : [body];
}

function storyWordCount(story) {
  const filed = Number(story?.wordCount);
  if (Number.isFinite(filed) && filed > 0) return Math.round(filed);
  return storyParagraphs(story).join(' ').split(/\s+/).filter(Boolean).length;
}

function storyClientId(story, context = {}) {
  if (story?.articleId) return 'id:' + String(story.articleId);
  const code = String(context.countryCode || 'africa').toLowerCase();
  const rank = Number.isInteger(context.rank) ? context.rank : 0;
  return 'slot:' + code + ':' + rank;
}

function registerStory(story, context = {}) {
  const key = storyClientId(story, context);
  STORY_REGISTRY.set(key, { story, context });
  return key;
}

function findPublishedStory(clientId) {
  const id = String(clientId || '');
  if (STORY_REGISTRY.has(id)) return STORY_REGISTRY.get(id);
  const slot = /^slot:([a-z]{2}):(\d+)$/.exec(id);
  if (slot) {
    const story = AI_BRIEFS[slot[1]]?.[Number(slot[2])];
    if (story) return {
      story,
      context: {
        countryCode: slot[1],
        country: COUNTRY_INFO[slot[1]]?.name || slot[1].toUpperCase(),
        published: story.published || AI_BRIEFS_DATES[slot[1]] || AI_BRIEFS_AT,
        rank: Number(slot[2])
      }
    };
  }
  if (id.startsWith('id:')) {
    const wanted = id.slice(3);
    for (const [countryCode, stories] of Object.entries(AI_BRIEFS)) {
      const rank = (stories || []).findIndex(story => String(story?.articleId || '') === wanted);
      if (rank >= 0) {
        const story = stories[rank];
        return {
          story,
          context: {
            countryCode,
            country: COUNTRY_INFO[countryCode]?.name || countryCode.toUpperCase(),
            published: story.published || AI_BRIEFS_DATES[countryCode] || AI_BRIEFS_AT,
            rank
          }
        };
      }
    }
  }
  return null;
}

function storyRecordKey(record) {
  return record ? storyClientId(record.story, record.context) : '';
}

function globalReaderQueue() {
  const rows = [];
  Object.entries(AI_BRIEFS).forEach(([countryCode, stories]) => {
    (stories || []).forEach((story, rank) => {
      if (!story?.headline) return;
      rows.push({
        story,
        context: {
          countryCode,
          country: COUNTRY_INFO[countryCode]?.name || countryCode.toUpperCase(),
          published: story.published || AI_BRIEFS_DATES[countryCode] || AI_BRIEFS_AT,
          rank
        },
        score: storyLensRank(story, activeStoryLens, rank),
        rank
      });
    });
  });
  return rows
    .sort((a, b) => b.score - a.score || a.rank - b.rank || a.context.country.localeCompare(b.context.country))
    .map(({ story, context }) => ({ story, context }));
}

function readerQueueFromSource(sourceElement, currentRecord) {
  let keys = [];
  if (sourceElement?.closest?.('#wire-results') && activeWireStoryKeys.length) {
    keys = activeWireStoryKeys.slice();
  } else if (sourceElement?.closest?.('#cv-cards')) {
    keys = Array.from(document.querySelectorAll('#cv-cards [data-story-key]'))
      .map(button => button.dataset.storyKey)
      .filter(Boolean);
  }
  const seen = new Set();
  const queue = keys
    .filter(key => key && !seen.has(key) && seen.add(key))
    .map(findPublishedStory)
    .filter(Boolean);
  if (!queue.length) queue.push(...globalReaderQueue());
  const currentKey = storyRecordKey(currentRecord);
  if (currentKey && !queue.some(record => storyRecordKey(record) === currentKey)) queue.unshift(currentRecord);
  return queue;
}

function nextReaderRecord() {
  if (!activeReaderRecord || activeReaderQueue.length < 2) return null;
  const currentKey = storyRecordKey(activeReaderRecord);
  const currentIndex = Math.max(0, activeReaderQueue.findIndex(record => storyRecordKey(record) === currentKey));
  for (let step = 1; step < activeReaderQueue.length; step++) {
    const record = activeReaderQueue[(currentIndex + step) % activeReaderQueue.length];
    const key = storyRecordKey(record);
    if (key && key !== currentKey && !isStoryReadKey(key)) return { record, unread:true };
  }
  const record = activeReaderQueue[(currentIndex + 1) % activeReaderQueue.length];
  return record && storyRecordKey(record) !== currentKey ? { record, unread:false } : null;
}

function updateReaderContinuation() {
  const wrap = document.getElementById('story-reader-continue');
  const next = nextReaderRecord();
  if (!wrap) return;
  wrap.hidden = !next;
  activeReaderNextKey = next ? storyRecordKey(next.record) : '';
  if (!next) return;
  const country = next.record.context.country || COUNTRY_INFO[next.record.context.countryCode]?.name || '';
  document.getElementById('story-reader-next-kicker').textContent =
    (next.unread ? 'Next unread' : 'Next story') + (country ? ' · ' + country : '');
  document.getElementById('story-reader-next-title').textContent = next.record.story.headline;
}

function openRegisteredStory(key, sourceElement = document.activeElement) {
  const record = STORY_REGISTRY.get(String(key || ''));
  if (record) openStoryReader(record.story, record.context, sourceElement);
}

// The story's own visual, drawn from data the journal already holds: where it happened,
// the number in the headline, and a matching figure from Signals. story-kit.js is the
// same code the static story pages run. It arrives deferred, so a story opened from a
// shared link before it has loaded is filled in when it lands.
var readerKitArgs = null;
function mountReaderKit(args) {
  const host = document.getElementById('story-reader-kit');
  if (!host) return;
  if (args) readerKitArgs = args;
  host.hidden = true;
  const o = readerKitArgs;
  if (!o || !o.cc || !window.ASJ_STORY_KIT) return;
  try {
    window.ASJ_STORY_KIT.mountVisual(host, { ...o, link: tab => '#/' + o.cc + '/' + tab });
  } catch {}
}
document.addEventListener('DOMContentLoaded', () => {
  if (storyReader?.classList.contains('open')) mountReaderKit();
});
// A link inside the reader that points into the journal (the Signals figure leads to
// the country's figures) has to close the reader first, or the page it opens stays
// hidden underneath it.
storyReader?.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#/"]');
  if (!link) return;
  event.preventDefault();
  const target = link.getAttribute('href');
  closeStoryReader();
  location.replace(target);
});

function openStoryReader(story, context = {}, sourceElement = document.activeElement, options = {}) {
  if (!storyReader || !story?.headline) return;
  // The prose arrives in a second file after first paint. A reader who clicks inside
  // that window would otherwise get a reader with a headline and nothing under it, so
  // wait for the half that has the paragraphs and then open properly. Once loaded this
  // is a synchronous path again.
  // ASJ_FULL_SETTLED, not just LOADED: when the prose file failed (a flaky mobile
  // connection), READY resolved, the reader reopened, still had no paragraphs, and waited
  // on the same resolved promise again - forever, freezing the tab. Once the load has
  // settled either way, the reader opens with what it has (the dek at worst).
  if (!window.ASJ_FULL_SETTLED && !storyParagraphs(story).length && window.ASJ_FULL_READY) {
    // On the reader itself this would be invisible - it is still closed. The class goes
    // on body so a click that is waiting on the network looks like it did something.
    document.body.classList.add('asj-waiting');
    const reopen = () => {
      document.body.classList.remove('asj-waiting');
      openStoryReader(story, context, sourceElement, { ...options, proseTried: true });
    };
    if (window.ASJ_SAVE_DATA && !options.proseTried) {
      // Data saver: this one story's page (~4 KB) rather than every story's prose
      // (~146 KB). Fall back to the full file only if the page cannot be read.
      fetchStoryParagraphs(story, context.countryCode).then(ok => {
        if (ok) reopen();
        else window.ASJ_LOAD_FULL().then(reopen);
      });
    } else if (!options.proseTried) {
      window.ASJ_LOAD_FULL().then(reopen);
    } else {
      document.body.classList.remove('asj-waiting');
    }
    if (!options.proseTried) return;
  }
  const country = context.country || COUNTRY_INFO[context.countryCode]?.name || '';
  const topic = story.topic || context.topic || 'News';
  const paragraphs = storyParagraphs(story);
  const wordCount = storyWordCount(story);
  const readMinutes = Math.max(1, Number(story.readMinutes) || Math.ceil(wordCount / 210));
  const published = story.published || context.published || '';
  const sources = Array.isArray(story.sources)
    ? story.sources.filter(source => source && source.url)
    : [];
  const sourceMap = new Map();
  sources.forEach(source => sourceMap.set(source.url, source));
  const uniqueSources = Array.from(sourceMap.values());
  const readerLens = normalizeStoryLens(activeStoryLens);
  const lensData = storyLensData(story, readerLens);
  const clientId = storyClientId(story, context);

  const nextRecord = { story, context: { ...context, country, topic, published }, clientId };
  if (!options.continueQueue) activeReaderQueue = readerQueueFromSource(sourceElement, nextRecord);
  activeReaderRecord = nextRecord;
  markStoryReadKey(clientId);
  document.querySelectorAll('[data-story-key]').forEach(control => {
    if (control.dataset.storyKey === clientId) {
      control.closest('.cv-news-row,.wire-item,.wire-brief-card,.wire-hero')?.classList.add('is-read');
    }
  });
  if (!options.continueQueue) storyReaderLastFocus = sourceElement;
  document.getElementById('story-reader-kicker').textContent = [shownTopic(topic), country].filter(Boolean).join(' · ');
  document.getElementById('story-reader-title').textContent = story.headline;
  const dek = document.getElementById('story-reader-dek');
  dek.textContent = story.dek || '';
  dek.hidden = !story.dek;
  const meta = [];
  if (published) meta.push('<span><b>' + escapeHtml(formatShortDate(published) || String(published).slice(0, 10)) + '</b></span>');
  meta.push('<span><b>' + readMinutes + ' min</b> read</span>');
  if (uniqueSources.length) meta.push('<span><b>' + uniqueSources.length + '</b> ' + (uniqueSources.length === 1 ? 'source' : 'sources') + '</span>');
  // 'high confidence' was the desk's own grade of its draft, not something a reader can use.
  if (readerLens !== 'general') meta.push('<span>' + escapeHtml(audienceLabel(readerLens)) + '</span>');
  document.getElementById('story-reader-meta').innerHTML = meta.join('');
  mountReaderKit({ cc: context.countryCode || '', country, headline: story.headline, dek: story.dek || '', paragraphs, topic });
  document.getElementById('story-reader-copy').innerHTML = paragraphs
    .map(paragraph => '<p>' + escapeHtml(paragraph) + '</p>').join('');
  const why = document.getElementById('story-reader-why');
  const whyText = lensData.why;
  // Same words as the country page's inline story. The bare relevance score meant
  // nothing to a reader - there is no scale on the page to read it against.
  const whyLabel = readerLens === 'general'
    ? 'Why it matters'
    : 'Why it matters for ' + ({ farmers:'farmers', investors:'investors', diaspora:'the diaspora' }[readerLens] || 'you');
  why.innerHTML = '<b>' + escapeHtml(whyLabel) + '</b>' + escapeHtml(whyText);
  why.hidden = !whyText;
  const sourcesEl = document.getElementById('story-reader-sources');
  sourcesEl.innerHTML = uniqueSources.length
    ? '<span>Reporting sources</span><div class="story-reader-source-list">' + uniqueSources.map(source =>
        '<a href="' + escapeHtml(safeUrl(source.url)) + '" target="_blank" rel="noopener noreferrer">' +
          escapeHtml(source.name || 'Source') + ' ↗</a>'
      ).join('') + '</div>'
    : '';
  sourcesEl.hidden = !uniqueSources.length;
  updateReaderContinuation();
  document.getElementById('story-reader-share').textContent = 'Share';
  try { updateReaderWhatsApp(); } catch {}
  // A story gets its own address. Without this the URL never changed when a story
  // opened, which cost two things that matter more on a phone than anywhere else:
  // the hardware Back button left the site instead of closing the story, and anyone
  // who shares by copying the address bar - which is most people - sent the front
  // page rather than the piece they were reading.
  // The first open pushes an entry so Back can consume it; moving to the next story
  // in the queue replaces it, so a reading run does not bury the way out.
  const wasOpen = storyReader.classList.contains('open');
  storyReader.classList.add('open');
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('selftest');
    url.searchParams.set('story', clientId);
    const href = url.pathname + url.search + url.hash;
    if (wasOpen || history.state?.asjStory) history.replaceState({ asjStory: clientId }, '', href);
    else history.pushState({ asjStory: clientId }, '', href);
  } catch {}
  document.body.style.overflow = 'hidden';
  updateOverlayAccessibility();
  const scroll = storyReader.querySelector('.story-reader-scroll');
  if (scroll) scroll.scrollTop = 0;
  document.getElementById('story-reader-back').focus();
  renderYourDesk();
}

function closeStoryReader() {
  if (!storyReader?.classList.contains('open')) return;
  storyReader.classList.remove('open');
  const wireOpen = document.getElementById('wire-view')?.classList.contains('open');
  const countryOpen = countryView.classList.contains('open');
  if (!wireOpen && !countryOpen) document.body.style.overflow = '';
  updateOverlayAccessibility();
  if (storyReaderLastFocus?.isConnected && storyReaderLastFocus.focus) storyReaderLastFocus.focus();
  else if (wireOpen) document.getElementById('wire-close')?.focus();
  else if (countryOpen) backBtn.focus();
  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.has('story')) {
    currentUrl.searchParams.delete('story');
    history.replaceState(null, '', currentUrl.pathname + currentUrl.search + currentUrl.hash);
  }
  activeReaderRecord = null;
  activeReaderQueue = [];
  activeReaderNextKey = '';
}

// The reader's own Back button walks the history entry the open pushed, so the UI
// control and the phone's Back gesture do the same thing and neither leaves a dead
// entry behind. When the reader was opened from a shared ?story= link there is no
// entry of ours to consume, so close directly.
function requestCloseStoryReader() {
  if (history.state?.asjStory) { history.back(); return; }
  closeStoryReader();
}
document.getElementById('story-reader-back')?.addEventListener('click', requestCloseStoryReader);

// Back out of a story instead of out of the paper. On Android this is the primary
// navigation gesture; before this it closed the site from the first story a reader
// opened, which is the worst possible moment to lose them.
window.addEventListener('popstate', () => {
  const stillAStory = new URLSearchParams(location.search).get('story');
  if (storyReader?.classList.contains('open') && !stillAStory) { closeStoryReader(); return; }
  if (stillAStory && !storyReader?.classList.contains('open')) {
    const found = findPublishedStory(stillAStory);
    if (found) openStoryReader(found.story, found.context, document.body);
  }
});
document.getElementById('story-reader-next')?.addEventListener('click', () => {
  const record = activeReaderQueue.find(item => storyRecordKey(item) === activeReaderNextKey);
  if (!record) return;
  openStoryReader(record.story, record.context, storyReaderLastFocus, { continueQueue:true });
});
function readerShareUrl(record) {
  const story = record.story;
  const shareUrl = new URL(window.location.href);
  shareUrl.search = '';
  shareUrl.hash = '';
  const shareCc = record.context?.countryCode;
  if (story.slug && shareCc) {
    shareUrl.pathname = '/' + shareCc + '/' + story.slug + '/';
  } else {
    // No page of its own: a hand-written brief with no articleId, or an edition older
    // than the retention window. The app link still opens the right story.
    shareUrl.searchParams.set('story', record.clientId);
  }
  return shareUrl;
}
// WhatsApp is how most of the audience passes news on; one tap, no share sheet.
function updateReaderWhatsApp() {
  const a = document.getElementById('story-reader-wa');
  if (!a || !activeReaderRecord) return;
  const u = readerShareUrl(activeReaderRecord).href;
  a.href = 'https://wa.me/?text=' + encodeURIComponent(activeReaderRecord.story.headline + ' ' + u);
}
document.getElementById('story-reader-share')?.addEventListener('click', async event => {
  if (!activeReaderRecord) return;
  const story = activeReaderRecord.story;
  const country = activeReaderRecord.context.country;
  // Share the story's own page, not the app shell. /?story=<id> serves index.html:
  // one title, one description, one image, for every story the desk has ever filed, so
  // a story sent to a chat app arrived as the masthead and a generic blurb. The slug
  // comes from the payload rather than being recomputed here - two implementations of
  // a URL is two chances to send someone somewhere that is not there.
  const shareUrl = readerShareUrl(activeReaderRecord);
  const text = [story.headline, story.dek || storyParagraphs(story)[0] || '', country ? 'The African Street Journal · ' + country : 'The African Street Journal']
    .filter(Boolean).join('\n\n');
  if (navigator.share) {
    try {
      await navigator.share({ title: story.headline, text, url: shareUrl.href });
      pulseButtonLabel(event.currentTarget, 'Shared');
      return;
    } catch {}
  }
  const ok = await copyPlainText(text + '\n\n' + shareUrl.href);
  pulseButtonLabel(event.currentTarget, ok ? 'Copied' : 'Share Failed');
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !storyReader?.classList.contains('open')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  // Escape goes through the same door as the Back button, so the pushed history
  // entry is consumed either way.
  requestCloseStoryReader();
}, true);

function briefRowHtml(b, i, countryTag, countryCode, published, sourceRank = i) {
  const domId = 'cv-brief-' + String(countryCode || 'wire').replace(/[^a-z0-9-]/gi, '') + '-' + i;
  const storyKey = registerStory(b, {
    countryCode,
    country: countryTag || COUNTRY_INFO[countryCode]?.name || '',
    published,
    rank: sourceRank
  });
  const preview = (b.dek ? storyParagraphs(b)[0] : '') || b.dek || storyParagraphs(b)[0] || '';
  const readMinutes = Math.max(1, Number(b.readMinutes) || Math.ceil(storyWordCount(b) / 210));
  // Country pages have no lens control, so they read for everyone.
  const lens = 'general';
  const lensData = storyLensData(b, lens);
  const read = isStoryReadKey(storyKey);
  const whyLabel = lens === 'general' ? 'Why it matters' : 'Why it matters for ' + ({ farmers:'farmers', investors:'investors', diaspora:'the diaspora' }[lens] || 'you');
  return '<article class="cv-news-row' + (read ? ' is-read' : '') + '">' +
    '<button class="cv-news-summary" id="' + domId + '-summary" type="button" aria-expanded="false" aria-controls="' + domId + '-detail">' +
      '<span class="cv-brief-rank">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<div class="cv-news-summary-main">' +
        '<div class="cv-news-summary-meta">' +
          (countryTag ? '<span class="cv-news-country">' + escapeHtml(countryTag) + '</span><span>·</span>' : '') +
          (shownTopic(b.topic) ? '<span class="cv-brief-topic">' + escapeHtml(b.topic) + '</span><span>·</span>' : '') +
          '<span class="cv-news-source">' + escapeHtml((b.sources?.[0]?.name) || 'Sourced report') + '</span>' +
          
          (read ? '<span>·</span><span class="cv-news-read-state">Read</span>' : '') + '</div>' +
        '<h4 class="cv-brief-title">' + escapeHtml(b.headline) + '</h4>' +
        (b.dek ? '<p class="cv-brief-dek">' + escapeHtml(b.dek) + '</p>' : '') +
      '</div>' +
      '<span class="cv-news-toggle" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M6 9l6 6 6-6"/></svg></span>' +
    '</button>' +
    '<div class="cv-brief-main" id="' + domId + '-detail" role="region" aria-labelledby="' + domId + '-summary" hidden>' +
      '<p class="cv-brief-body">' + escapeHtml(preview) + '</p>' +
      (lensData.why ? '<p class="cv-brief-why"><b>' + escapeHtml(whyLabel) + '</b>' + escapeHtml(lensData.why) + '</p>' : '') +
      '<div class="cv-brief-actions">' +
        '<span>' + readMinutes + ' min read</span>' +
        '<button class="cv-read-story" type="button" data-story-key="' + escapeHtml(storyKey) + '">Read on ASJ <span aria-hidden="true">→</span></button>' +
      '</div>' +
    '</div>' +
  '</article>';
}

// News must stay news: when the desk hasn't filed from a country, its News panel carries the
// REGION's current wire stories (continental fallback), each tagged with its origin country.
// The data prose lives in Signals; the Country File renders only if no briefs exist anywhere.
function regionalWireFor(countryId) {
  const info = COUNTRY_INFO[countryId] || {};
  const pool = Object.entries(AI_BRIEFS).filter(([id, list]) => id !== countryId && Array.isArray(list) && list.some(b => b && b.headline && (b.body || b.dek)));
  if (!pool.length) return null;
  const same = pool.filter(([id]) => (COUNTRY_INFO[id] || {}).region === info.region);
  const chosen = same.length ? same : pool;
  const scope = same.length ? info.region : 'Across Africa';
  const picks = [];
  for (let i = 0; picks.length < 6; i++) {
    let any = false;
    for (const [id, list] of chosen) {
      const b = list[i];
      if (b && b.headline && b.body) {
        picks.push({
          brief: b,
          countryCode: id,
          country: (COUNTRY_INFO[id] || {}).name || id.toUpperCase(),
          published: b.published || AI_BRIEFS_DATES[id] || AI_BRIEFS_AT,
          sourceRank: i
        });
        any = true;
        if (picks.length >= 6) break;
      }
    }
    if (!any) break;
  }
  if (!picks.length) return null;
  const html = '<div class="cv-brief-desk">' +
    '<div class="cv-brief-head"><span class="t">' + escapeHtml(scope) + ' <b>wire</b></span>' +
      '<span class="m">No ' + escapeHtml(info.name || 'local') + ' stories today</span></div>' +
    picks.map((p, i) => briefRowHtml(p.brief, i, p.country, p.countryCode, p.published, p.sourceRank)).join('') +
    '<div class="cv-df-note">Today\'s edition has no stories from ' + escapeHtml(info.name || 'this country') + '. These are today\'s stories from ' +
      escapeHtml(scope === 'Across Africa' ? 'across Africa' : scope) + '. ' + escapeHtml(info.name || 'The country') + '&rsquo;s figures are under Signals.</div>' +
  '</div>';
  return { html, label: scope === 'Across Africa' ? 'Africa-wide wire' : scope + ' wire' };
}

// "Updated …" for a country's News line. Uses the desk's filing time for that country, falling
// back to the newest story's publish time. Never the clock: no reliable stamp, no label.
function reliableStamp(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(value))) return null;
  const d = new Date(value);
  const t = d.getTime();
  if (!Number.isFinite(t) || t > Date.now() + 5 * 60 * 1000 || t < Date.UTC(2024, 0, 1)) return null;
  return d;
}
function countryUpdatedAt(countryId, briefs) {
  const filed = reliableStamp(AI_BRIEFS_DATES[countryId]);
  if (filed) return filed;
  let newest = null;
  for (const b of briefs || []) {
    const d = reliableStamp(b && b.published);
    if (d && (!newest || d > newest)) newest = d;
  }
  return newest;
}
function relativeUpdated(d) {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return mins + ' minutes ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs === 1 ? '1 hour ago' : hrs + ' hours ago';
  if (hrs < 48) return 'yesterday';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}
function updatedStampHtml(countryId, briefs) {
  const d = countryUpdatedAt(countryId, briefs);
  if (!d) return '';
  const full = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(d);
  return '<span class="cv-updated"> · <time datetime="' + d.toISOString() + '" title="Updated ' + escapeHtml(full) + '">Updated ' + escapeHtml(relativeUpdated(d)) + '</time></span>';
}

// Earlier stories under today's: the country's 30 newest from past editions
// (data/earlier/<cc>.json, written with the story pages by build-static-pages.ps1, which
// keeps each page 90 days). Each links to its own page. Until Nov 2026 a story could not
// be found again once it left the edition.
const EARLIER_STORIES = new Map();
function renderEarlierStories(countryId) {
  const el = document.getElementById('cv-earlier');
  if (!el) return;
  el.hidden = true;
  el.innerHTML = '';
  const show = list => {
    if (activeCountryMap?.countryId !== countryId || !Array.isArray(list) || !list.length) return;
    const name = COUNTRY_INFO[countryId]?.name || '';
    // Only our own story paths (/ke/some-slug/) are linked.
    const items = list.filter(s => s && s.h && /^\/[a-z]{2}\/[a-z0-9-]+\/$/.test(String(s.u || '')));
    if (!items.length) return;
    el.innerHTML = '<h3 class="cv-earlier-head">Earlier stories</h3><ul>' +
      items.slice(0, 12).map(s =>
        '<li><a href="' + escapeHtml(s.u) + '">' +
          (s.d ? '<span>' + escapeHtml(formatShortDate(s.d + 'T12:00:00Z')) + '</span>' : '') + escapeHtml(s.h) + '</a></li>').join('') +
      '</ul>' +
      (items.length > 12 ? '<a class="cv-earlier-all" href="/' + countryId + '/">More earlier ' + escapeHtml(name) + ' stories &rarr;</a>' : '');
    el.hidden = false;
  };
  if (EARLIER_STORIES.has(countryId)) { show(EARLIER_STORIES.get(countryId)); return; }
  fetch('data/earlier/' + countryId + '.json?v=' + encodeURIComponent(String(AI_BRIEFS_AT || '')))
    .then(r => (r.ok ? r.json() : []))
    .catch(() => [])
    .then(list => { EARLIER_STORIES.set(countryId, list); show(list); });
}

function renderBriefDesk(countryId) {
  const cards = document.getElementById('cv-cards');
  const meta = document.getElementById('cv-story-meta');
  cards.onclick = null;
  cards.onkeydown = null;
  cards.classList.remove('queue-collapsed', 'card-open');
  cards.classList.add('news-brief');
  updateStoryLensControls();
  const briefs = (AI_BRIEFS[countryId] || []).filter(b => b && b.headline && (b.body || b.dek));
  // The desk's own order. A lens chosen in the Wire does not reach in here: with no
  // control on this page, it would reorder the list for no visible reason.
  const rankedBriefs = rankStoryEntries(briefs, 'general');
  const sourceCount = uniqueSourceCount(briefs);
  if (meta && briefs.length) {
    meta.innerHTML = escapeHtml(briefs.length + (briefs.length === 1 ? ' story' : ' stories') + ' from ' + sourceCount + (sourceCount === 1 ? ' source' : ' sources')) + updatedStampHtml(countryId, briefs);
  }
  if (!briefs.length) {
    const wire = regionalWireFor(countryId);
    if (wire) {
      if (meta) meta.textContent = wire.label + ' · no local stories yet';
      cards.innerHTML = wire.html;
      wireBriefAccordion(cards);
    } else {
      if (meta) meta.textContent = 'No stories today';
      cards.innerHTML = renderCountryFile(countryId);
    }
    return;
  }
  cards.innerHTML =
    '<div class="cv-brief-desk">' +
      rankedBriefs.map((entry, i) => briefRowHtml(
        entry.story,
        i,
        '',
        countryId,
        entry.story.published || AI_BRIEFS_DATES[countryId] || AI_BRIEFS_AT,
        entry.sourceIndex
      )).join('') +
    '</div>';
  wireBriefAccordion(cards);
}

function wireBriefAccordion(cards) {
  const setRowOpen = (row, open) => {
    const summary = row?.querySelector('.cv-news-summary');
    const detail = row?.querySelector('.cv-brief-main');
    if (!row || !summary || !detail) return;
    row.classList.toggle('is-open', open);
    detail.hidden = !open;
    summary.setAttribute('aria-expanded', String(open));
  };

  cards.onclick = event => {
    const readerButton = event.target.closest('[data-story-key]');
    if (readerButton) {
      openRegisteredStory(readerButton.dataset.storyKey, readerButton);
      return;
    }
    const summary = event.target.closest('.cv-news-summary');
    if (!summary) return;
    const row = summary.closest('.cv-news-row');
    if (!row) return;
    const opening = !row.classList.contains('is-open');
    if (opening) {
      cards.querySelectorAll('.cv-news-row.is-open').forEach(openRow => {
        if (openRow !== row) setRowOpen(openRow, false);
      });
    }
    setRowOpen(row, opening);
    if (opening && window.matchMedia('(max-width:720px)').matches) {
      requestAnimationFrame(() => requestAnimationFrame(() => summary.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth'
      })));
    }
  };

  cards.onkeydown = event => {
    const summary = event.target.closest('.cv-news-summary');
    if (!summary) return;
    const summaries = Array.from(cards.querySelectorAll('.cv-news-summary'));
    const index = summaries.indexOf(summary);
    let next = -1;
    if (event.key === 'ArrowDown') next = (index + 1) % summaries.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + summaries.length) % summaries.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = summaries.length - 1;
    else if (event.key === 'Escape' && summary.getAttribute('aria-expanded') === 'true') {
      event.preventDefault();
      setRowOpen(summary.closest('.cv-news-row'), false);
      return;
    }
    if (next >= 0) {
      event.preventDefault();
      summaries[next].focus();
    }
  };
}

// "Why it matters" is shown only when it adds something. Many came back as the dek in
// other words, and a story without one got a stock line for its topic ("This can affect
// prices, jobs, investment, or the cost of moving money.") - the same sentence under
// every business story on the site. Neither is shown now.
function briefWhy(brief) {
  const why = String(brief?.why || '').trim();
  return why && !whyRestates(why, brief) && !whyGuesses(why) ? why : '';
}
// Nor one that has to guess: the desk asks for the effect the report states (the same
// words as story-shape.ps1 Test-WhyGuesses). Lower-case "may" only: "in May" is a month.
function whyGuesses(why) {
  return /\b(?:may|might|could)\b/.test(why) || /\b(?:potentially|possibly|perhaps|presumably|likely to)\b/i.test(why);
}

function whyWords(text) {
  return (String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(w => w.length > 2 && !WHY_STOP.has(w));
}
function whyRestates(why, story) {
  const words = whyWords(why);
  if (words.length < 4) return false;
  const share = text => { const told = new Set(whyWords(text)); return words.filter(w => told.has(w)).length / words.length; };
  const top = (story?.headline || '') + ' ' + (story?.dek || '');
  if (share(top) >= WHY_RESTATE_SHARE) return true;
  // The opening paragraph too (10 Nov 2026), at a higher bar, as story-shape.ps1
  // Test-WhyRestatesDek.
  const lead = (story?.paragraphs || []).find(p => String(p || '').trim()) || '';
  return !!lead && share(top + ' ' + lead) >= WHY_RESTATE_LEAD_SHARE;
}


function renderAlmanacFromGis(countryId, info) {
  const gis = COUNTRY_GIS[countryId] || { places: [] };
  const places = gis.places || [];

  // Agriculture: World Bank figures, then FAOSTAT's main farm exports with their value.
  const ag = document.getElementById('cv-ag');
  const agMeta = document.getElementById('cv-ag-meta');
  const farm = countryFacts(countryId)?.farm;
  const farmItems = (farm?.items || []).slice(0, 3);
  if (agMeta) agMeta.textContent = '';
  ag.innerHTML = factGridHtml(countryId, 'farmers') +
    (farmItems.length || farm?.note
      ? '<div class="cv-ag-line"><span class="cv-ag-line-key">Main farm exports, a year</span><span class="cv-ag-line-val">' +
          (farmItems.length
            ? farmItems.map(i => escapeHtml(i.label) + ' ' + escapeHtml(formatFactValue('usd', i.usd))).join(' · ')
            : escapeHtml(farm.note)) +
        '</span></div>' +
        '<div class="cv-fact-source">' + escapeHtml(window.ASJ_COUNTRY_FACTS?.sources?.farm || 'FAOSTAT') + '</div>'
      : '');

  // Food prices: WFP's retail prices at its best-covered market, against a year earlier.
  const foodEl = document.getElementById('cv-food');
  if (foodEl) foodEl.innerHTML = foodPricesHtml(countryId);

  // Largest cities: the median of three sources' populations.
  const cities = largestCities(countryId);
  const mkt = document.getElementById('cv-markets');
  const mktMeta = document.getElementById('cv-mkt-meta');
  if (mktMeta) mktMeta.textContent = 'Population · median of Natural Earth, GeoNames, Wikidata';
  mkt.innerHTML = cities.length
    ? '<div class="cv-mkt-row head"><span>City</span><span></span><span>Population</span></div>' +
      cities.map(p =>
        '<div class="cv-mkt-row">' +
          '<div class="cv-mkt-name"><span>' + escapeHtml(p.name) + '</span></div>' +
          '<div class="cv-mkt-tier">' + (p.capital ? 'Capital' : '') + '</div>' +
          '<div class="cv-mkt-pop">' + formatCompactPop(p.pop) + '</div>' +
        '</div>'
      ).join('')
    : '<div class="cv-empty">No city population figures on file.</div>';

  // Ports and airports: World Port Index and OurAirports, nothing inferred.
  const infra = document.getElementById('cv-infra');
  const ports = countryPorts(countryId);
  const airports = countryAirports(countryId);
  const list = (title, items, line, empty) =>
    '<div class="cv-route-group"><div class="cv-route-title">' + title + ' <b>' + items.length + '</b></div>' +
      (items.length ? '<ul class="cv-route-list">' + items.map(line).join('') + '</ul>' : '<p class="cv-route-empty">' + empty + '</p>') +
    '</div>';
  infra.innerHTML =
    list('Seaports', ports, p => '<li><span>' + escapeHtml(p.name) + '</span><small>' + escapeHtml(p.size || '') + (p.size ? ' harbour' : '') + '</small></li>',
      LANDLOCKED.has(countryId) ? 'Landlocked: no seaport.' : 'None in the World Port Index.') +
    list('Airports with scheduled flights', airports, a => '<li><span>' + escapeHtml(a.name) + (a.iata ? ' (' + escapeHtml(a.iata) + ')' : '') + '</span><small>' + escapeHtml(a.city || '') + '</small></li>',
      'None listed in OurAirports.') +
    railSummaryHtml(countryId) +
    '<div class="cv-fact-source">NGA World Port Index · OurAirports · OpenStreetMap</div>';

  renderGlance(countryId);
}

// A food's price against a year earlier, in percent, or null.
function foodPriceChange(item) {
  const change = Number.isFinite(item.yearAgo) && item.yearAgo > 0 ? ((item.price - item.yearAgo) / item.yearAgo) * 100 : null;
  // A fivefold jump (Nigeria's sugar, Oct 2026: NGN 968 to 4,800 for the same 500 g)
  // is far likelier a recording error than a price. Show no change rather than a
  // number nobody should act on.
  return change !== null && (change > 300 || change < -75) ? null : change;
}

// WFP's market names, spelled as the places spell themselves ("IFO (Daadab)" is Ifo,
// one of the Dadaab camps).
function foodMarketName(food) {
  return String(food?.market || '').replace(/\bDaadab\b/g, 'Dadaab').replace(/^IFO\b/, 'Ifo');
}

/* At a glance, phones only. There Signals stacks into some 3,000px, and the figures most
   visits come for - growth, inflation, the main export, port and airport, food prices -
   sat one to four screens down, two of them under another audience's tab. Each cell
   opens its section. */
function renderGlance(countryId) {
  const el = document.getElementById('cv-glance');
  if (!el) return;
  if (!el.dataset.wired) {
    el.dataset.wired = '1';
    el.addEventListener('click', event => {
      const button = event.target.closest('[data-glance-target]');
      if (!button) return;
      if (audienceSelect && audienceSelect.value !== button.dataset.glanceMode) {
        audienceSelect.value = button.dataset.glanceMode;
        audienceSelect.dispatchEvent(new Event('change'));
      }
      // Open that section alone, so it sits right under the headings above it, and bring
      // it up once if it starts low on the screen. One plain scroll from a page at rest,
      // not the held jumps the section links needed.
      const target = document.getElementById(button.dataset.glanceTarget);
      const section = target?.closest('.cv-info-grid > .cv-fold');
      if (!section) return;
      section.parentElement.querySelectorAll(':scope > .cv-fold.is-open').forEach(other => {
        if (other !== section) setSignalsSectionOpen(other, false);
      });
      setSignalsSectionOpen(section, true);
      if (section.getBoundingClientRect().top > window.innerHeight * 0.6) section.scrollIntoView({ block: 'start' });
    });
  }
  const cell = (item, mode, target, cls = '') =>
    '<button type="button" class="cv-glance-cell' + cls + (item.value === '—' ? ' is-missing' : '') + '" data-glance-mode="' + mode + '" data-glance-target="' + target + '">' +
      '<span class="cv-glance-key">' + escapeHtml(item.key) + '</span>' +
      '<span class="cv-glance-val">' + escapeHtml(item.value) + '</span>' +
      '<span class="cv-glance-sub">' + escapeHtml(item.sub) + '</span>' +
    '</button>';
  const farm = countryFacts(countryId)?.farm;
  const topExport = (farm?.items || [])[0];
  const port = countryPorts(countryId)[0];
  const portCount = countryPorts(countryId).length;
  const airport = countryAirports(countryId)[0];
  const food = countryFacts(countryId)?.food;
  const changes = (food?.items || []).map(foodPriceChange).filter(c => c !== null).sort((a, b) => a - b);
  const median = changes.length ? changes[Math.floor((changes.length - 1) / 2)] / 2 + changes[Math.ceil((changes.length - 1) / 2)] / 2 : null;
  // Without a year-earlier price (23 countries in Nov 2026), the first food's price.
  const firstFood = (food?.items || [])[0];
  const where = ' at ' + foodMarketName(food) + (food?.camp ? ', a refugee camp' : '');
  const foodItem = median !== null
    ? { key: 'Food prices', value: (median > 0 ? '+' : '') + Math.round(median) + '% on a year',
        sub: (changes.length > 1 ? 'Median of ' + changes.length + ' foods' : '1 food') + where }
    : firstFood
      ? { key: 'Food prices', value: firstFood.commodity,
          sub: (firstFood.currency === 'SLL' ? 'SLE ' + Math.round(firstFood.price / 1000) : firstFood.currency + ' ' + Math.round(firstFood.price).toLocaleString('en-US')) +
               ' a ' + String(firstFood.unit || '').toLowerCase() + where }
      : { key: 'Food prices', value: '—', sub: 'No current WFP prices' };
  el.innerHTML =
    '<header class="cv-section-head"><h4>At a glance</h4><span class="meta">Tap a figure for the detail</span></header>' +
    '<div class="cv-glance-grid">' +
      cell(kpiFact(countryId, 'growth'), 'investors', 'cv-econ-wrap') +
      cell(kpiFact(countryId, 'inflation'), 'investors', 'cv-econ-wrap') +
      cell({ key: 'Top farm export', value: topExport ? topExport.label : '—', sub: topExport ? formatFactValue('usd', topExport.usd) + ' a year' : 'Not published' }, 'farmers', 'cv-ag') +
      cell(foodItem, 'farmers', 'cv-food', median === null ? '' : median > 0 ? ' up' : ' down') +
      // The World Port Index's own spelling, or the English name it gives in brackets
      // ("Mina Tarabulus (Tripoli)"). The airport by name: OurAirports' city is often the
      // airport's own town (Lumbadzi for Lilongwe, Plaine Magnien for Mauritius).
      cell(port
        ? { key: 'Main seaport', value: (/\(([^)]+)\)/.exec(port.name) || [])[1] || port.name, sub: (port.size ? port.size.toLowerCase() + ' harbour' : 'Seaport') + (portCount > 1 ? ' · ' + portCount + ' in all' : '') }
        : { key: 'Main seaport', value: LANDLOCKED.has(countryId) ? 'Landlocked' : '—', sub: LANDLOCKED.has(countryId) ? 'No coast' : 'None listed' }, 'farmers', 'cv-infra') +
      cell(airport
        ? { key: 'Main airport', value: airport.name.replace(/\s+Airport$/i, ''), sub: (airport.city || '') + (airport.iata ? ' (' + airport.iata + ')' : '') }
        : { key: 'Main airport', value: '—', sub: 'No scheduled flights listed' }, 'farmers', 'cv-infra') +
    '</div>';
}

// WFP retail prices for the four foods it tracks most at one market. Where WFP has no
// current monitoring the section says so - it does not borrow a neighbour's prices.
function foodPricesHtml(countryId) {
  const food = countryFacts(countryId)?.food;
  const name = COUNTRY_INFO[countryId]?.name || 'this country';
  if (!food || !(food.items || []).length) {
    return '<div class="cv-empty">The World Food Programme publishes no current market prices for ' + escapeHtml(name) + '.</div>';
  }
  const monthLabel = ym => {
    const [y, m] = String(ym || '').split('-').map(Number);
    return y && m ? new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1))) : '';
  };
  const num = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 2 });
  const rows = food.items.map(raw => {
    // Sierra Leone redenominated in 2022 (1 new leone = 1,000 old); WFP still records
    // old leones, which no shop has priced in since. Show the currency people use.
    const item = raw.currency === 'SLL'
      ? { ...raw, currency: 'SLE', price: raw.price / 1000, yearAgo: Number.isFinite(raw.yearAgo) ? raw.yearAgo / 1000 : raw.yearAgo }
      : raw;
    const change = foodPriceChange(item);
    const cls = change === null ? '' : change > 0 ? ' up' : ' down';
    return '<li><span>' + escapeHtml(item.commodity) + ' <small>per ' + escapeHtml(item.unit) + '</small></span>' +
      '<b>' + escapeHtml(item.currency) + ' ' + num(item.price) + '</b>' +
      '<em class="cv-food-change' + cls + '">' + (change === null ? '—' : (change > 0 ? '+' : '') + Math.round(change) + '% on a year') + '</em></li>';
  }).join('');
  const market = foodMarketName(food);
  // In Kenya and Uganda WFP's only current retail monitoring is in refugee camps and
  // settlements. Those prices are real, but they are not the country's, so say so
  // before the list rather than in the source line under it.
  const campNote = food.camp
    ? '<p class="cv-food-warning">WFP currently records food prices in ' + escapeHtml(name) + ' only in refugee camps. These are prices at ' + escapeHtml(market) + ', not a national average.</p>'
    : '';
  return campNote + '<ul class="cv-food-list">' + rows + '</ul>' +
    '<div class="cv-fact-source">' + escapeHtml(market) + (food.camp ? ' refugee camp' : '') + ' market · retail · ' + escapeHtml(monthLabel(food.date)) + ' · World Food Programme</div>';
}

// CIA World Factbook railway totals (factbook.json, October 2026), [km, year]: the whole
// network, lines out of use included. A second, independent figure beside
// OpenStreetMap's, which maps only what is not marked disused - so Kenya is 1,886 km in
// OpenStreetMap against 3,819 in the Factbook, most of the old metre-gauge network idle.
const RAIL_FACTBOOK = {
  ao: [2761, 2022], bf: [622, 2014], bj: [438, 2014], bw: [888, 2014], cd: [4007, 2014], cg: [510, 2014],
  ci: [660, 2008], cm: [987, 2014], dj: [97, 2017], dz: [4020, 2019], eg: [5085, 2014], er: [306, 2018],
  et: [659, 2017], ga: [649, 2014], gh: [947, 2022], gn: [1086, 2017], ke: [3819, 2018], lr: [429, 2008],
  ma: [2067, 2014], mg: [836, 2018], ml: [593, 2014], mr: [728, 2014], mw: [767, 2014], mz: [4787, 2014],
  na: [2628, 2014], ng: [3798, 2014], sd: [7251, 2014], sn: [906, 2017], ss: [248, 2018], sz: [301, 2014],
  tg: [568, 2014], tn: [2173, 2014], tz: [4097, 2022], ug: [1244, 2014], za: [30400, 2021], zm: [3126, 2014],
  zw: [3427, 2014]
};
// Track OpenStreetMap maps as railway where no train runs (checked against Wikipedia,
// October 2026). Libya's 136 km were scraps of unfinished line and a road.
const RAIL_NOT_IN_SERVICE = {
  ly: 'Libya has had no railway in service since 1965. Work on new lines stopped in 2011.',
  td: 'Chad has no railway.',
  ne: 'The Niamey–Dosso line, about 145 km built in 2014–16, is not in service.'
};

// Lines the Factbook does not list but that run (checked on Wikipedia, October 2026).
const RAIL_NOTES = {
  sl: 'A private freight line: the 192 km Pepel-Tonkolili iron-ore railway, reopened in 2024. No passenger trains.'
};

function countryRail(countryId) {
  return RAIL_NOT_IN_SERVICE[countryId] ? null : COUNTRY_GIS[countryId]?.rail || null;
}

// Railways, from the OpenStreetMap lines the Atlas draws: route length (each double
// track counted once), how much is standard gauge (the SGR-type lines), the longest
// named lines, and the Factbook's figure for the whole network.
function railSummaryHtml(countryId) {
  const rail = countryRail(countryId);
  const km = Number(rail?.km) || 0;
  const named = (rail?.lines || []).filter(l => l.name && l.km >= 20).slice(0, 4);
  const fmt = n => Math.round(n).toLocaleString('en-US') + ' km';
  const fb = RAIL_FACTBOOK[countryId];
  const note = text => '<p class="cv-route-empty">' + text + '</p>';
  const body = RAIL_NOT_IN_SERVICE[countryId]
    ? note(escapeHtml(RAIL_NOT_IN_SERVICE[countryId]))
    : km
      ? note('Route length of lines not marked disused in OpenStreetMap' + (rail.sgrKm >= 20 ? '; ' + fmt(rail.sgrKm) + ' of it standard gauge' : '') + '.') +
        (named.length ? '<ul class="cv-route-list">' + named.map(l => '<li><span>' + escapeHtml(l.name) + '</span><small>' + fmt(l.km) + (l.gauge === 1435 ? ' · standard' : l.gauge ? ' · ' + l.gauge + ' mm' : '') + '</small></li>').join('') + '</ul>' : '')
      : note('No railway in OpenStreetMap.');
  // Its own year: Algeria has opened lines since the Factbook's 2019 figure.
  const factbook = fb ? note('CIA World Factbook, whole network including idle lines: ' + fmt(fb[0]) + ' (' + fb[1] + ').') : '';
  const extra = RAIL_NOTES[countryId] ? note(escapeHtml(RAIL_NOTES[countryId])) : '';
  return '<div class="cv-route-group"><div class="cv-route-title">Railways <b>' + (km ? fmt(km) : '0') + '</b></div>' + body + extra + factbook + '</div>';
}

// Each country's main farm exports by value, from FAOSTAT (scripts/build-farm-exports.ps1
// via the facts file). This was a hand-made list (Fish for Uganda, Coffee for Tanzania);
// a country FAOSTAT shows little for gets a note, never a generic fallback.
function farmExportsForCountry(countryId) {
  return (countryFacts(countryId)?.farm?.items || []).map(i => i.label);
}

// Africa's 16 landlocked countries, so "no seaport" can say why.
const LANDLOCKED = new Set(['bw', 'bf', 'bi', 'cf', 'td', 'sz', 'et', 'ls', 'mw', 'ml', 'ne', 'rw', 'ss', 'ug', 'zm', 'zw']);

function formatCompactPop(n) {
  if (!n) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k';
  return String(n);
}

function countryDeskStats(countryId) {
  const gis = COUNTRY_GIS[countryId] || { places: [], rivers: [], lakes: [] };
  const places = gis.places || [];
  // The GIS file's ag_type / is_market / infrastructure tags were generated, not
  // sourced, and are no longer read. "markets" is the largest cities.
  return { gis, places, markets: largestCities(countryId) };
}

function setKpiCells(items) {
  const refs = [
    ['cv-pop-key', 'cv-pop', 'cv-pop-sub'],
    ['cv-weather-key', 'cv-weather', 'cv-weather-sub'],
    ['cv-time-key', 'cv-time', 'cv-time-sub'],
    ['cv-daylight-key', 'cv-daylight', 'cv-daylight-sub']
  ];
  refs.forEach(([keyId, valId, subId], index) => {
    const item = items[index] || { key: '—', value: '—', sub: '—' };
    const valueEl = document.getElementById(valId);
    const cell = valueEl?.closest('.cv-alm-cell');
    document.getElementById(keyId).textContent = item.key;
    valueEl.textContent = item.value;
    valueEl.className = 'cv-alm-val' + (item.green ? ' green' : '');
    document.getElementById(subId).textContent = item.sub || '';
    if (cell) cell.title = item.explain || item.sub || item.key || '';
  });
}

function renderAudienceKpis(countryId, info) {
  const mode = audienceSelect?.value || document.body.dataset.audience || 'farmers';
  if (mode === 'farmers') {
    renderFarmerKpis(countryId);
    loadCountryUtility(countryId, info);
    return;
  }
  if (mode === 'diaspora') {
    renderDiasporaKpis(countryId, info);
    return;
  }
  renderInvestorKpis(countryId, info);
  loadGdpHistory(countryId, info);
}

function kpiFact(countryId, key, keyLabel, explain) {
  const fact = countryFact(countryId, key);
  const old = staleFactYear(countryId, key);
  return {
    key: keyLabel || FACT_DEFS[key].label,
    value: fact ? formatFactValue(FACT_DEFS[key].fmt, fact.v) : '—',
    sub: fact ? 'World Bank ' + fact.y : (countryId === 'eh' ? 'No World Bank data' : (old ? 'Last reported ' + old : 'Not reported')),
    explain
  };
}

function renderDiasporaKpis(countryId, info) {
  const inv = investorForCountry(countryId, info);
  setKpiCells([
    { key: 'Population', value: formatPop(livePopulation(info.pop, info.gr)), sub: 'At home', explain: 'Resident population estimate for the country.' },
    kpiFact(countryId, 'remitUsd', 'Remittances', 'Personal remittances received, current US dollars, World Bank.'),
    kpiFact(countryId, 'remitCost', 'Cost to send $200', 'Average total cost of sending $200 to this country, World Bank Remittance Prices Worldwide.'),
    { key: 'Currency', value: inv.currency || '—', sub: CCY_NAME[inv.currency] || 'Local currency', explain: 'The currency a transfer pays out in.' }
  ]);
}

function renderFarmerKpis(countryId) {
  const ports = countryPorts(countryId);
  const airports = countryAirports(countryId);
  // The fourth cell was "Water registry", a count of mapped rivers and lakes that
  // included the neighbours' (Kenya's 17 took in Lake Tanganyika).
  const farm = countryFacts(countryId)?.farm;
  const topExport = (farm?.items || [])[0];
  setKpiCells([
    { key: 'Weather · Live', value: '—', sub: 'Fetching station data', explain: 'Live weather is fetched for the capital or closest mapped reference point.' },
    { key: 'Seaports', value: String(ports.length), sub: ports.length ? 'incl. ' + ports[0].name : (LANDLOCKED.has(countryId) ? 'Landlocked' : 'None listed'), explain: 'Ports in the NGA World Port Index, offshore oil terminals excluded.' },
    { key: 'Airports', value: String(airports.length), sub: airports.length ? 'With scheduled flights' : 'None listed', explain: 'Airports with scheduled passenger service, from OurAirports.' },
    { key: 'Top farm export', value: topExport ? topExport.label : '—', sub: topExport ? formatFactValue('usd', topExport.usd) + ' a year' : 'Not published', explain: 'Largest crop or livestock export by value, FAOSTAT, 2022–24 average.' }
  ]);
}

// Ports and airports for the Atlas and the country file - real ones only. This used to
// invent nodes when nothing was on file: "<capital> Air Gateway", "<country> Primary
// Corridor", and an "Inland Freight Desk" dry port for any country without a port.
function criticalInfraForCountry(countryId) {
  const items = [];
  for (const p of countryPorts(countryId)) {
    items.push({ kind: 'port', name: p.name, place: p.name, lon: p.lon, lat: p.lat, note: (p.size ? p.size + ' harbour' : 'Seaport') });
  }
  for (const a of countryAirports(countryId)) {
    items.push({ kind: 'airport', name: a.name, place: a.city || a.name, lon: a.lon, lat: a.lat, note: 'Scheduled flights' + (a.iata ? ' · ' + a.iata : '') });
  }
  return items.slice(0, 10);
}

function countInfraKinds(items) {
  return items.reduce((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + 1;
    return acc;
  }, { port: 0, rail: 0, road: 0, dry_port: 0, airport: 0, border: 0, corridor: 0 });
}

function infraKindMeta(kind) {
  return ({
    port: { label: 'Ports', short: 'PT', glyph: 'P', note: 'Cargo gateway' },
    rail: { label: 'Rail', short: 'RL', glyph: 'R', note: 'Rail logistics node' },
    road: { label: 'Road hubs', short: 'RD', glyph: 'X', note: 'Road corridor hub' },
    dry_port: { label: 'Dry ports', short: 'DP', glyph: 'D', note: 'Inland cargo clearance' },
    airport: { label: 'Airports', short: 'AIR', glyph: 'A', note: 'Scheduled flights' },
    border: { label: 'Borders', short: 'BR', glyph: 'B', note: 'Cross-border trade post' },
    corridor: { label: 'Corridors', short: 'CO', glyph: 'C', note: 'Freight movement spine' }
  })[kind] || { label: 'Node', short: 'ND', glyph: 'N', note: 'Critical node' };
}

/* ── Country facts: the same sourced figures, by the same rules, for all 55 ──────────
   Built by scripts/build-country-facts.ps1 into data/country-facts.js. Signals used to
   be a template filled in 55 times: sector words mapped to stock phrases, made-up city
   attributes, a dry port invented for an island. Every figure here is a published value
   with its year; a figure a source does not report is shown as not reported. */
const FACT_DEFS = {
  growth:         { label: 'GDP growth',             sub: 'real, annual',        fmt: 'signedPct' },
  inflation:      { label: 'Inflation',              sub: 'consumer prices',     fmt: 'pct' },
  fdi:            { label: 'Foreign investment',     sub: 'net FDI inflows',     fmt: 'usd' },
  exports:        { label: 'Exports',                sub: 'share of GDP',        fmt: 'pct' },
  unemployment:   { label: 'Unemployment',           sub: 'of labour force',     fmt: 'pct' },
  extDebt:        { label: 'External debt',          sub: 'of national income',  fmt: 'pct' },
  agShare:        { label: 'Farming in the economy', sub: 'share of GDP',        fmt: 'pct' },
  agJobs:         { label: 'Jobs in farming',        sub: 'of all employment',   fmt: 'pct' },
  agLand:         { label: 'Farmland',               sub: 'of land area',        fmt: 'pct' },
  cerealYield:    { label: 'Cereal yield',           sub: 'per hectare',         fmt: 'kg' },
  undernourished: { label: 'Undernourishment',       sub: 'of population',       fmt: 'pct' },
  remitUsd:       { label: 'Remittances received',   sub: 'per year',            fmt: 'usd' },
  remitGdp:       { label: 'Remittances',            sub: 'share of GDP',        fmt: 'pct' },
  remitCost:      { label: 'Cost to send $200',      sub: 'average fee',         fmt: 'pct' },
  internet:       { label: 'Internet users',         sub: 'of population',       fmt: 'pct' },
  electricity:    { label: 'Electricity access',     sub: 'of population',       fmt: 'pct' }
};
const FACT_GROUPS = {
  farmers:   ['agShare', 'agJobs', 'agLand', 'cerealYield', 'undernourished'],
  investors: ['growth', 'inflation', 'fdi', 'exports', 'unemployment', 'extDebt'],
  diaspora:  ['remitUsd', 'remitGdp', 'remitCost', 'internet', 'electricity']
};

function countryFacts(countryId) {
  return window.ASJ_COUNTRY_FACTS?.countries?.[countryId] || null;
}

// Values a series cannot physically take. The World Bank publishes the odd recording
// error - Malawi's cost of sending $200 was -49.7% in the October 2026 pull - and one
// is better shown as not reported than as a number nobody can use.
const FACT_LIMITS = {
  remitCost: [0, 100], internet: [0, 100], electricity: [0, 100], undernourished: [0, 100],
  agJobs: [0, 100], agLand: [0, 100], agShare: [0, 100], unemployment: [0, 100], exports: [0, 400]
};

// A figure more than seven years old describes another economy: the World Bank's latest
// inflation figure for DR Congo is 2.9% for 2016, South Sudan's growth -10.8% for 2015.
// Those are shown as "last reported 2016", not as a number.
const FACT_MAX_AGE = 7;

function rawCountryFact(countryId, key) {
  const fact = countryFacts(countryId)?.wb?.[key];
  if (!fact || !Number.isFinite(Number(fact.v)) || !Number(fact.y)) return null;
  const v = Number(fact.v);
  const [lo, hi] = FACT_LIMITS[key] || [-Infinity, Infinity];
  return v < lo || v > hi ? null : { v, y: Number(fact.y) };
}

function countryFact(countryId, key) {
  const fact = rawCountryFact(countryId, key);
  return fact && fact.y >= new Date().getFullYear() - FACT_MAX_AGE ? fact : null;
}

// The year of a figure too old to show, or null.
function staleFactYear(countryId, key) {
  const fact = rawCountryFact(countryId, key);
  return fact && !countryFact(countryId, key) ? fact.y : null;
}

function formatFactValue(fmt, v) {
  if (!Number.isFinite(v)) return '';
  if (fmt === 'usd') {
    const a = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
    if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    return sign + '$' + Math.round(a).toLocaleString('en-US');
  }
  if (fmt === 'kg') return Math.round(v).toLocaleString('en-US') + ' kg';
  const pct = (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + '%';
  return fmt === 'signedPct' && v > 0 ? '+' + pct : pct;
}

// The middle of every country that reports a figure, so a reader can tell whether 12%
// inflation is high: "Africa median 5%". Dollar totals (FDI, remittances) are left out -
// they scale with the size of the economy and a median of them says nothing.
const FACT_MEDIANS = {};
function africaMedian(key) {
  if (FACT_MEDIANS[key] !== undefined) return FACT_MEDIANS[key];
  if (!window.ASJ_COUNTRY_FACTS || FACT_DEFS[key]?.fmt === 'usd') return null;
  const vals = Object.keys(COUNTRY_INFO).map(id => countryFact(id, key)?.v).filter(Number.isFinite).sort((a, b) => a - b);
  const mid = vals.length / 2;
  FACT_MEDIANS[key] = vals.length >= 10 ? (vals.length % 2 ? vals[Math.floor(mid)] : (vals[mid - 1] + vals[mid]) / 2) : null;
  return FACT_MEDIANS[key];
}

function factCellHtml(countryId, key) {
  const def = FACT_DEFS[key];
  const fact = countryFact(countryId, key);
  const old = staleFactYear(countryId, key);
  const median = fact ? africaMedian(key) : null;
  return '<div class="cv-fact' + (fact ? '' : ' is-missing') + '">' +
    '<div class="cv-fact-key">' + escapeHtml(def.label) + '</div>' +
    '<div class="cv-fact-val">' + (fact ? escapeHtml(formatFactValue(def.fmt, fact.v)) : (old ? 'No recent figure' : 'Not reported')) + '</div>' +
    '<div class="cv-fact-sub">' + escapeHtml(def.sub) + (fact ? ' · ' + fact.y : (old ? ' · last reported ' + old : '')) + '</div>' +
    (median !== null ? '<div class="cv-fact-sub">Africa median ' + escapeHtml(formatFactValue(def.fmt, median)) + '</div>' : '') +
  '</div>';
}

function factGridHtml(countryId, group) {
  if (!window.ASJ_COUNTRY_FACTS) return '<div class="cv-empty">Country figures are still loading.</div>';
  if (countryId === 'eh') {
    // Not a World Bank member, so there are no WDI series. Morocco's figures are not
    // substituted: that would answer a sovereignty question by spreadsheet.
    return '<div class="cv-empty">The World Bank does not publish figures for Western Sahara.</div>' + factCheckLinksHtml(countryId);
  }
  return '<div class="cv-facts">' + FACT_GROUPS[group].map(key => factCellHtml(countryId, key)).join('') + '</div>' +
    '<div class="cv-fact-source">World Bank, World Development Indicators · latest year reported, none older than ' + (new Date().getFullYear() - FACT_MAX_AGE) +
      ' · median of the African countries that report it</div>' + factCheckLinksHtml(countryId);
}

// Under every country's figures: how they are checked, and a way to say one is wrong.
// Reader reports are how errors no source catches get found.
function factCheckLinksHtml(countryId) {
  const name = COUNTRY_INFO[countryId]?.name || countryId.toUpperCase();
  return '<div class="cv-fact-source"><a href="/methods/">How we check these figures</a> · ' +
    '<a href="mailto:hello@africanstreetjournal.com?subject=' + encodeURIComponent('Data correction: ' + name) + '">Report an error</a></div>';
}

// Ports and airports from the facts file, the capital's airport first.
// 30 km of tolerance: outlines are simplified, so real coastal ports sit a few km
// "offshore", and small islands (Corisco, Equatorial Guinea) are not in the outline.
function countryPorts(countryId) {
  return (countryFacts(countryId)?.ports || []).filter(p => p && p.name && insideCountry(countryId, p.lon, p.lat, 30));
}

// In the build's order: each country's main international gateways first, then size.
function countryAirports(countryId) {
  return (countryFacts(countryId)?.airports || []).filter(a => a && a.name && insideCountry(countryId, a.lon, a.lat, 30));
}

// The largest cities by population. Each figure is the median of Natural Earth,
// GeoNames and Wikidata (scripts/build-city-populations.ps1): any one of them alone was
// badly wrong somewhere - Natural Earth had Juba at 112,000 and Benoni at 2.99 million,
// GeoNames gave Kakamega its county's 1.87 million. Natural Earth alone only if the
// facts file has no cities.
function largestCities(countryId, limit = 6) {
  const byPop = list => list.filter(c => c && c.name && Number(c.pop) > 0).sort((a, b) => b.pop - a.pop);
  const checked = byPop((countryFacts(countryId)?.cities || []).slice());
  const capital = normalizeName(COUNTRY_INFO[countryId]?.capital || '');
  const named = c => normalizeName(c.name) === capital || normalizeName(c.name) + 'city' === capital;
  // The capital is the one the country file names. The sources also flag Cotonou,
  // Bujumbura, Abidjan and Cape Town, so their own flag counts only when none matches.
  const list = (checked.length ? checked : byPop(atlasPlaces(countryId))).map(c =>
    capital && checked.some(named) ? { ...c, capital: named(c) } : c);
  const top = list.slice(0, limit);
  // The capital is always listed. Natural Earth's figure for Juba (112,000) put South
  // Sudan's capital and largest city below Yei, Malakal and Wau and off the list.
  const isCapital = c => c.capital || named(c);
  if (capital && !top.some(isCapital)) {
    const cap = list.find(isCapital);
    if (cap) top.splice(Math.max(0, top.length - (top.length >= limit ? 1 : 0)), top.length >= limit ? 1 : 0, cap);
  }
  return top;
}

function renderInvestorKpis(countryId, info) {
  const inv = investorForCountry(countryId, info);
  // The fourth cell was "Risk / access: Medium · Open", a desk label with no source.
  const hasGrowth = Number.isFinite(inv.gdp_growth);
  setKpiCells([
    { key: 'GDP', value: inv.gdp || '—', sub: gdpSubLabel(inv), green: !!inv.gdp, explain: 'Gross domestic product in current US dollars.' },
    { key: 'GDP growth', value: hasGrowth ? (inv.gdp_growth > 0 ? '+' : '') + inv.gdp_growth + '%' : '—', sub: hasGrowth ? growthSubLabel(inv) : 'Not published', green: inv.gdp_growth >= 4, explain: 'Annual real GDP growth.' },
    { key: 'FDI inflows', value: inv.fdi || '—', sub: !inv.fdi ? 'Not published' : inv.fdiYear ? 'World Bank ' + inv.fdiYear : 'UNCTAD, 2023–24', explain: 'Foreign direct investment flowing into the country in a year.' },
    kpiFact(countryId, 'inflation', 'Inflation', 'Annual change in consumer prices, World Bank.')
  ]);
}

function gdpSubLabel(inv) {
  return !inv.gdp ? 'Not published' : inv.gdpYear ? 'World Bank ' + inv.gdpYear : 'Current US dollars';
}

function growthSubLabel(inv) {
  return inv.growthYear ? 'World Bank ' + inv.growthYear : 'Year on year';
}

function formatPerResident(value) {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1000) return '$' + (value / 1000).toFixed(value >= 10000 ? 0 : 1) + 'k';
  return '$' + Math.round(value).toLocaleString('en-US');
}

function formatPct(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const places = abs >= 10 ? 0 : 1;
  return (value > 0 ? '+' : value < 0 ? '-' : '') + abs.toFixed(places) + '%';
}

function signedBillions(value) {
  if (!Number.isFinite(value)) return '—';
  return (value > 0 ? '+' : value < 0 ? '-' : '') + formatBillions(Math.abs(value));
}

function economySeriesSummary(inv) {
  const supplied = Array.isArray(inv.gdpSeries)
    ? inv.gdpSeries
        .filter(point => Number.isFinite(point?.year) && Number.isFinite(point?.value))
        .slice()
        .sort((a, b) => a.year - b.year)
    : [];
  // Published points only. The fallback was a sine-wave line drawn back ten years from
  // one figure, shown as "GDP history".
  const series = supplied;
  const first = series[0] || { value: 0 };
  const latest = series[series.length - 1] || first;
  const hasTrend = series.length >= 2 && latest.year > first.year;
  const delta = hasTrend ? latest.value - first.value : NaN;
  const change = hasTrend && first.value ? (delta / first.value) * 100 : NaN;
  const years = hasTrend ? latest.year - first.year : 0;
  const cagr = hasTrend && first.value && latest.value
    ? (Math.pow(latest.value / first.value, 1 / years) - 1) * 100
    : NaN;
  return {
    series, first, latest, delta, change, cagr, hasTrend,
    observationCount:series.length,
    reportingGap:latest.year ? Math.max(0, 2024 - latest.year) : 0
  };
}

function investorEstimate(countryId, info = COUNTRY_INFO[countryId]) {
  const region = (info?.region || '').toLowerCase();
  const popM = Math.max(0.4, (info?.pop || 8000000) / 1000000);
  const growthPct = Number(((info?.gr || 0.018) * 100).toFixed(1));
  const gdpPerCapita = region.includes('north') ? 3900 : region.includes('southern') ? 5200 : region.includes('east') ? 2400 : region.includes('west') ? 2600 : 2100;
  const gdpB = Math.max(1.2, popM * gdpPerCapita / 1000);
  const fdiB = Math.max(0.1, gdpB * (region.includes('north') ? 0.018 : 0.012));
  const risk = gdpB > 40 && growthPct >= 2 ? 'med' : gdpB > 12 || growthPct >= 2.5 ? 'med' : 'high';
  return {
    gdp: formatBillions(gdpB),
    gdp_growth: growthPct,
    fdi: '$' + (fdiB >= 1 ? fdiB.toFixed(1) : fdiB.toFixed(2)) + 'B',
    currency: COUNTRY_CURRENCY[countryId] || '',
    sectors: inferredSectors(countryId, region),
    risk,
    access: gdpB > 8 ? 'Open' : 'Selective',
    gdpSeries: null,
    estimated: true
  };
}

function investorForCountry(countryId, info = COUNTRY_INFO[countryId]) {
  const cachedSeries = GDP_SERIES_CACHE[countryId];
  const worldBank = WORLD_BANK_ECONOMY[countryId];
  const listed = INVESTOR_INFO[countryId];
  const base = listed || investorEstimate(countryId, info);
  const merged = { ...base };
  if (worldBank) {
    const wbSeries = Array.isArray(worldBank.gdpSeries) && worldBank.gdpSeries.length ? worldBank.gdpSeries : null;
    merged.gdp = Number.isFinite(worldBank.gdp) ? formatBillions(worldBank.gdp) : base.gdp;
    merged.gdp_growth = Number.isFinite(worldBank.gdp_growth) ? worldBank.gdp_growth : base.gdp_growth;
    merged.gdpYear = worldBank.gdpYear || base.gdpYear;
    merged.growthYear = worldBank.growthYear || base.growthYear;
    merged.gdpSeries = (wbSeries?.length >= 2 ? wbSeries : null) || cachedSeries || base.gdpSeries || wbSeries;
    merged.estimated = false;
    merged.source = 'World Bank';
  } else {
    merged.gdpSeries = cachedSeries || base.gdpSeries;
    merged.estimated = base.estimated !== false;
    merged.source = '';
  }
  // investorEstimate is a regional per-person average, kept for the currency and sector
  // words only. Its GDP, growth and FDI were shown as figures (Eritrea's "growth" was its
  // population growth); with no published number the cell now says so.
  if (!listed) {
    if (!worldBank || !Number.isFinite(worldBank.gdp)) merged.gdp = '';
    if (!worldBank || !Number.isFinite(worldBank.gdp_growth)) merged.gdp_growth = NaN;
    merged.fdi = '';
  }
  return merged;
}

function inferredSectors(countryId, region) {
  if (['mu','sc','cv','km','st'].includes(countryId)) return ['Tourism', 'Ports', 'Fisheries', 'Services'];
  if (region.includes('north')) return ['Energy', 'Logistics', 'Tourism', 'Agriculture'];
  if (region.includes('southern')) return ['Mining', 'Agriculture', 'Power', 'Logistics'];
  if (region.includes('west')) return ['Agriculture', 'Mining', 'Ports', 'Telecoms'];
  if (region.includes('east')) return ['Agriculture', 'Tourism', 'Logistics', 'Energy'];
  return ['Agriculture', 'Services', 'Logistics', 'Energy'];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Links from the AI pipeline (web-searched sources) are external input: allow only http(s),
// so a hostile `javascript:` URL in scraped content can never become a live link.
function safeUrl(u) {
  u = String(u || '').trim();
  return /^https?:\/\//i.test(u) ? u : '#';
}

async function copyPlainText(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  textarea.remove();
  return ok;
}

function pulseButtonLabel(button, label) {
  if (!button) return;
  const original = button.textContent;
  button.textContent = label;
  window.setTimeout(() => { button.textContent = original; }, 1400);
}

function uniqueSourceCount(briefs) {
  const sources = new Set();
  (briefs || []).forEach(brief => {
    (brief.sources || []).forEach(source => {
      if (source && (source.url || source.name)) sources.add(source.url || source.name);
    });
  });
  return sources.size;
}

function countryBriefText(countryId) {
  const info = COUNTRY_INFO[countryId] || {};
  const briefs = (AI_BRIEFS[countryId] || []).filter(b => b && b.headline);
  // Copies what the country page shows: the desk's order, no lens.
  const rankedBriefs = rankStoryEntries(briefs, 'general');
  const date = String(AI_BRIEFS_DATES[countryId] || AI_BRIEFS_AT || latestBriefDate() || new Date().toISOString()).slice(0, 10);
  const lines = ['The African Street Journal', (info.name || 'Country') + ' - ' + date, ''];
  if (!briefs.length) {
    lines.push('No stories from this country in today\'s edition.');
    return lines.join('\n');
  }
  rankedBriefs.slice(0, 6).forEach((entry, index) => {
    const brief = entry.story;
    const sources = (brief.sources || []).map(source => source.name || source.url).filter(Boolean).join(', ');
    lines.push((index + 1) + '. ' + brief.headline);
    lines.push('   ' + (brief.body || ''));
    const why = storyLensData(brief, 'general').why;
    if (why) lines.push('   Why it matters: ' + why);
    if (sources) lines.push('   Sources: ' + sources);
    lines.push('');
  });
  return lines.join('\n').trim();
}

function countryFocusPoint(countryId, info) {
  const gis = COUNTRY_GIS[countryId] || { places: [] };
  const capitalName = normalizeName(info.capital);
  return gis.places.find(place => normalizeName(place.name) === capitalName) ||
    gis.places.find(place => place.capital) ||
    gis.places[0] ||
    { name: info.capital, lat: 0, lon: 20 };
}

// Accents folded first: without it "Lomé" was "lom" and never matched "Lome".
function normalizeName(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

function weatherCodeLabel(code) {
  const n = Number(code);
  if (n === 0) return 'Clear';
  if (n <= 3) return 'Cloudy';
  if (n <= 48) return 'Fog';
  if (n <= 57) return 'Drizzle';
  if (n <= 67) return 'Rain';
  if (n <= 77) return 'Snow';
  if (n <= 82) return 'Showers';
  if (n <= 99) return 'Storms';
  return 'Weather';
}

async function loadCountryUtility(countryId, info) {
  const point = countryFocusPoint(countryId, info);
  if (countryUtilityTimer) { clearInterval(countryUtilityTimer); countryUtilityTimer = null; }

  const setWeatherCell = (value, sub) => {
    if (document.body.dataset.audience !== 'farmers') return;
    if (!activeCountryMap || activeCountryMap.countryId !== countryId) return;
    document.getElementById('cv-pop-key').textContent = 'Weather · Live';
    const el = document.getElementById('cv-pop');
    el.textContent = value;
    el.className = 'cv-alm-val';
    document.getElementById('cv-pop-sub').textContent = sub;
  };

  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(point.lat) +
      '&longitude=' + encodeURIComponent(point.lon) +
      '&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto&forecast_days=1';
    const res = await fetch(url);
    if (!res.ok) throw new Error('unavailable');
    const data = await res.json();
    if (!activeCountryMap || activeCountryMap.countryId !== countryId) return;
    const c = data.current || {};
    const label = weatherCodeLabel(c.weather_code);
    const temp = c.temperature_2m != null ? Math.round(c.temperature_2m) + '°C / ' + Math.round(c.temperature_2m * 9/5 + 32) + '°F' : '—';
    const wind = c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) + ' km/h' : '';
    const update = () => setWeatherCell(label + ' · ' + temp, point.name + (wind ? ' · ' + wind + ' wind' : ''));
    update();
    countryUtilityTimer = setInterval(update, 60000);
  } catch {
    setWeatherCell('Offline', point.name + ' station unreachable');
  }
}

function aiStoriesForCountry(countryId) {
  const info = COUNTRY_INFO[countryId];
  const gis = COUNTRY_GIS[countryId] || { places: [] };
  const capital = (gis.places || []).find(p => /capital/i.test(p.rank || '') || p.name === info?.capital) || (gis.places || [])[0];
  const items = (AI_BRIEFS[countryId] || []).filter(item => item && item.headline);
  const generatedDate = AI_BRIEFS_AT ? String(AI_BRIEFS_AT).slice(0, 10) : '';
  return items.map((item, index) => {
    const src = (Array.isArray(item.sources) && item.sources[0]) || {};
    return {
    title: item.headline,
    summary: item.dek || item.body || '',
    source: src.name || '',
    url: src.url || '',
    type: item.topic || 'News',
    place: info?.capital || (capital && capital.name) || '',
    lon: capital ? capital.lon : (info?.lon ?? 20),
    lat: capital ? capital.lat : (info?.lat ?? 0),
    // The story's own date. "popularity" and "impact" scores made up from its position
    // and a date of "index days ago" stood in here; nothing read the scores.
    date: item.published || generatedDate,
    live: true
    };
  });
}

function storyFeedForCountry(countryId) {
  // Live stories only — real, attributed news. No templated/synthetic filler.
  return aiStoriesForCountry(countryId)
    .filter((story, index, all) => all.findIndex(other => other.title === story.title) === index)
    .slice(0, 14);
}

// Is a point inside the country's own outline (within toleranceKm of its edge)?
// Every Atlas point is checked, because the sources were not: a landmark list put
// Kilimanjaro in Kenya, the place file put Mandera (Kenya) in Somalia and Laayoune in
// Morocco, and the port index files Mayotte's Dzaoudzi under Comoros. Returns true when
// the outline is not loaded yet, so nothing disappears for want of a shape.
const OUTLINE_TESTERS = new Map();
const OUTLINE_SCALE = 1000;
let outlineTestCtx = null;
function countryOutlineTester(countryId) {
  if (OUTLINE_TESTERS.has(countryId)) return OUTLINE_TESTERS.get(countryId);
  const d = window.UNITED_AFRICA_DATA?.countryDetail?.[countryId]?.d;
  if (!d || typeof Path2D === 'undefined') return null;
  outlineTestCtx = outlineTestCtx || document.createElement('canvas').getContext('2d');
  const S = OUTLINE_SCALE;
  const path = new Path2D();
  path.addPath(new Path2D(d), new DOMMatrix([S, 0, 0, S, 200 * S, 100 * S]));
  const nums = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const vertices = [];
  for (let i = 0; i + 1 < nums.length; i += 2) vertices.push([nums[i], -nums[i + 1]]);
  const tester = { path, vertices };
  OUTLINE_TESTERS.set(countryId, tester);
  return tester;
}

function insideCountry(countryId, lon, lat, toleranceKm = 0) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  const tester = countryOutlineTester(countryId);
  if (!tester) return true;
  const S = OUTLINE_SCALE;
  if (outlineTestCtx.isPointInPath(tester.path, lon * S + 200 * S, -lat * S + 100 * S)) return true;
  if (!toleranceKm) return false;
  const kx = 111.32 * Math.cos(lat * Math.PI / 180);
  return tester.vertices.some(([x, y]) => Math.hypot((x - lon) * kx, (y - lat) * 111.32) <= toleranceKm);
}

// This country's point for each landmark it has. Water gets 15 km of tolerance: many
// outlines cut lakes out, so a point on Lake Malawi is in no country's land shape.
function atlasFeaturePoints(countryId) {
  const out = [];
  for (const item of LANDMARK_POINTS) {
    const at = item.at?.[countryId];
    if (!at) continue;
    const [lon, lat] = at;
    if (insideCountry(countryId, lon, lat, item.kind === 'water' ? 15 : 0)) out.push({ name: item.name, kind: item.kind, lon, lat });
  }
  return out;
}

// What the map marks: the significant ports and airports, not all of them. A port of
// "Very Small" harbour size and a medium regional airport are listed in Signals, but on
// a phone-sized map they crowd out the gateways. Labels are short ("Mombasa port",
// "JKIA (NBO)"-style IATA), since the city name is usually already on the map.
function atlasInfraForCountry(countryId) {
  const ports = countryPorts(countryId);
  const majorPorts = ports.filter(p => p.size && p.size !== 'Very Small');
  const portPick = (majorPorts.length ? majorPorts : ports).slice(0, 4);
  const airports = countryAirports(countryId);
  const largeAirports = airports.filter(a => a.gateway || a.type === 'Large');
  const airportPick = (largeAirports.length ? largeAirports : airports).slice(0, 4);
  return [
    ...portPick.map((p, i) => ({ kind: 'port', label: p.name + ' port', lon: p.lon, lat: p.lat, priority: i === 0 })),
    ...airportPick.map(a => ({ kind: 'airport', label: a.iata ? a.name.replace(/ International Airport$| Airport$/, '') + ' (' + a.iata + ')' : a.name, lon: a.lon, lat: a.lat, priority: !!a.gateway, short: a.iata || '' }))
  ];
}

// Natural Earth places, minus any that fall in a neighbour. The capital is the one the
// country file names: Natural Earth flags the old or biggest city (Bujumbura, Cotonou,
// Dar es Salaam), all three of South Africa's, and none for Juba or Laayoune.
function atlasPlaces(countryId) {
  const capital = normalizeName(COUNTRY_INFO[countryId]?.capital);
  const isCapital = place => { const key = normalizeName(place.name); return key === capital || key + 'city' === capital; };
  const places = (COUNTRY_GIS[countryId]?.places || []).filter(place => insideCountry(countryId, place.lon, place.lat, 5));
  if (!capital || !places.some(isCapital)) return places;
  return places.map(place => isCapital(place) === !!place.capital ? place : { ...place, capital: isCapital(place) });
}

// The towns the Atlas adds when zoomed in (data/country-towns.json: Natural Earth's other
// populated places and GeoNames' towns of 15,000+, by scripts/build-atlas-towns.ps1),
// minus any in a neighbour. Separate from the places, which everything else reads.
const ATLAS_TOWNS = new Map();
function atlasTowns(countryId) {
  if (!ATLAS_TOWNS.has(countryId)) {
    const towns = COUNTRY_GIS[countryId]?.towns?.places;
    if (!towns) return [];
    ATLAS_TOWNS.set(countryId, towns.filter(town => insideCountry(countryId, town.lon, town.lat, 5)));
  }
  return ATLAS_TOWNS.get(countryId);
}

function detailPoint(lon, lat) {
  return [lon, -lat];
}

function syncMobileAtlasStage(countryId, mapPath, isFullscreen) {
  const stage = countryMapCanvas?.closest('.cv-map-stage');
  if (!stage) return;
  if (!mobileDossierMedia.matches || isFullscreen || !mapPath?.bbox) {
    stage.style.removeProperty('--atlas-mobile-height');
    return;
  }
  const bounds = mapViewBounds(countryId, mapPath.bbox, atlasUsesIslandFocus(countryId, mapPath.bbox, false));
  const width = stage.getBoundingClientRect().width || countryMapCanvas.getBoundingClientRect().width || window.innerWidth - 48;
  const aspect = bounds.width / Math.max(0.001, bounds.height);
  const framedAspect = Math.max(0.74, Math.min(1.08, aspect));
  const maxHeight = Math.min(460, window.innerHeight * 0.62);
  const height = Math.round(Math.max(320, Math.min(maxHeight, width / framedAspect)));
  stage.style.setProperty('--atlas-mobile-height', height + 'px');
}

function drawCountryMap(countryId, countryPath) {
  if (!countryMapCanvas || !countryMapCtx) return;
  const isFs = document.getElementById('cv-map-portal').classList.contains('active');
  // Nothing to see: the Atlas panel is hidden because the reader is on News or Signals.
  // Every country open used to draw it anyway - relief, contours and labels, about 0.6 s
  // of a slow phone's CPU - onto a canvas with no size (it fell back to 720x560), and
  // then draw it again when the panel opened. Opening the panel (setPanel ->
  // updateSlidePos -> repaintAtlas) draws it at its real size.
  if (!isFs && countryMapCanvas.getClientRects().length === 0) return;
  const detail = COUNTRY_DETAIL[countryId];
  const mapPath = detail
    ? { shape: new Path2D(detail.d), bbox: detail.bbox }
    : countryPath;
  if (!mapPath) return;
  if (holdAtlasForRelief(countryId)) return;
  syncMobileAtlasStage(countryId, mapPath, isFs);
  const rect = countryMapCanvas.getBoundingClientRect();
  const baseDpr = Math.min(2, window.devicePixelRatio || 1);
  // The embedded map is physically small, so the same DPR puts far fewer device pixels on the
  // country than fullscreen does. Supersample it (render above display resolution, let the
  // browser downscale) so labels and contour lines are as crisp as the fullscreen view.
  const mapDpr = isFs ? baseDpr : Math.min(3, baseDpr * 2);
  // Keep the backing bitmap and its CSS box at the same aspect ratio. Independent minimum
  // dimensions made the tall mobile Atlas squeeze a desktop-shaped bitmap horizontally.
  // mapDpr already supplies the extra pixels needed for crisp embedded-map rendering.
  const width = Math.max(1, Math.min(2600, Math.round(rect.width || 720)));
  const height = Math.max(1, Math.min(1600, Math.round(rect.height || 560)));
  const view = atlasViewFor(countryId);
  // One Next drew the map five times - the open, two layout-settle passes, the relief
  // preview, the full relief - about 70 ms each at 3x on a phone. A draw whose inputs are
  // all unchanged is skipped (before the canvas is resized, which would clear it).
  const signature = [countryId, !!detail, isFs, width, height, mapDpr, mobileDossierMedia.matches, mapLight(),
    view.k, view.ux, view.uy, JSON.stringify(mapLayers), !!window.ASJ_SAVE_DATA, !!RELIEF.index,
    reliefReady(RELIEF.images.get(countryId)), reliefReady(RELIEF.images.get(countryId + '-s')),
    reliefReady(RELIEF.images.get(countryId + '-focus')), !!COUNTRY_GIS[countryId],
    !!countryFacts(countryId), document.fonts?.status || ''].join('|');
  if (signature === lastAtlasSignature && countryMapCanvas.width === width * mapDpr) return;
  lastAtlasSignature = '';
  countryMapCanvas.width = width * mapDpr;
  countryMapCanvas.height = height * mapDpr;
  countryMapCtx.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
  countryMapCtx.clearRect(0, 0, width, height);

  // Archipelagos include remote specks that make the inhabited island disappear: the
  // desktop map used to keep the full extent, and Seychelles drew as a dot in a corner.
  // Every view now uses the island crop; the locator inset shows what it leaves out.
  const useIslandFocus = atlasUsesIslandFocus(countryId, mapPath.bbox, isFs);
  const bounds = mapViewBounds(countryId, mapPath.bbox, useIslandFocus);
  // Padding scales with the canvas so small embedded maps don't spend ~18% of their width on
  // margin: ~5.5% of the short side, clamped to 28-72px (island focus crops keep extra room).
  const pad = isFs && ISLAND_FULLSCREEN_BOUNDS[countryId]
    ? 92
    : Math.max(28, Math.min(72, Math.round(Math.min(width, height) * 0.055)));
  const baseScale = Math.min((width - pad * 2) / bounds.width, (height - pad * 2) / bounds.height);
  const fitScale = baseScale * islandMapZoom(countryId, isFs);
  // The reader's zoom and pan (atlasView) on top of the fitted view.
  const scale = fitScale * view.k;
  const offsetX = ((width - bounds.width * fitScale) / 2 - bounds.minX * fitScale) * view.k + view.ux * width;
  const offsetY = ((height - bounds.height * fitScale) / 2 - bounds.minY * fitScale) * view.k + view.uy * height;
  const project = (lon, lat) => {
    const [x, y] = detailPoint(lon, lat);
    return [offsetX + x * scale, offsetY + y * scale];
  };
  const placedLabels = [];

  fillMapBackdrop(width, height);
  countryMapCtx.save();
  applyMapClip(mapPath, offsetX, offsetY, scale, mapDpr);
  countryMapCtx.fillStyle = FRONT_GREEN;
  countryMapCtx.fillRect(0, 0, width, height);
  if (!(mapLayers.terrain && drawCountryRelief(countryId, project))) drawPaperTexture(width, height, countryId);
  drawRoads(countryId, project);
  drawLinearFeatures(countryId, project, placedLabels, width, height);
  countryMapCtx.restore();

  drawCountryOutline(mapPath, offsetX, offsetY, scale);
  // The part of the country on screen, in map units. Wherever some of the country is off
  // it - an island crop, or the reader zoomed in - a locator inset shows the whole. Reserved
  // before the labels are placed, so none lands under it; drawn over them.
  const visible = { minX: -offsetX / scale, maxX: (width - offsetX) / scale, minY: -offsetY / scale, maxY: (height - offsetY) / scale };
  const locator = atlasLocatorBox(mapPath, visible, width, height, offsetX, offsetY, scale);
  if (locator) placedLabels.push({ left: locator.x - 4, top: locator.y - 4, right: locator.x + locator.w + 4, bottom: locator.y + locator.h + 4, reserved: true });
  // So are the buttons over the map (fullscreen, zoom): a label under one could not be read.
  for (const button of countryMapCanvas.parentElement?.querySelectorAll('button') || []) {
    const b = button.getBoundingClientRect();
    if (b.width) placedLabels.push({ left: b.left - rect.left - 4, top: b.top - rect.top - 4, right: b.right - rect.left + 4, bottom: b.bottom - rect.top + 4, reserved: true });
  }
  drawGisLayers(countryId, project, placedLabels, width, height, mapPath, offsetX, offsetY, scale, mapDpr);
  if (locator) drawAtlasLocator(countryId, mapPath, visible, locator);
  ATLAS_FRAME.width = width; ATLAS_FRAME.height = height; ATLAS_FRAME.dpr = mapDpr;
  // Set only once the draw has completed: one that threw part-way is not taken as done.
  lastAtlasSignature = signature;
}
let lastAtlasSignature = '';
// The last full draw's size, for the gesture preview.
const ATLAS_FRAME = { width: 0, height: 0, dpr: 1 };

/* Zoom and pan. k magnifies the fitted view; ux and uy pan it, as fractions of the canvas,
   so a point the fitted view draws at X is drawn at X * k + ux * width - and the view keeps
   its place through a resize or the fullscreen toggle. Every country opens unzoomed.
   Pinch, ctrl + scroll (a trackpad pinch arrives as one), plain scroll in fullscreen,
   double-click or double-tap, and the + / - buttons; drag pans once zoomed. At 1x a finger
   on the map still scrolls the page (touch-action pan-x pan-y); zoomed, it moves the map. */
const ATLAS_MAX_ZOOM = 5;
let atlasView = { countryId: '', k: 1, ux: 0, uy: 0 };
function atlasViewFor(countryId) {
  if (atlasView.countryId !== countryId) {
    atlasView = { countryId, k: 1, ux: 0, uy: 0 };
    syncAtlasZoomControls();
  }
  return atlasView;
}
// Zoom by f about the canvas point (px, py), in CSS pixels: the point under it stays put.
// The pan is held so the zoomed view never leaves the fitted frame.
function zoomAtlasAt(f, px, py, width, height) {
  const v = atlasView;
  const k = Math.max(1, Math.min(ATLAS_MAX_ZOOM, v.k * f));
  const r = k / v.k;
  v.ux = (px - (px - v.ux * width) * r) / width;
  v.uy = (py - (py - v.uy * height) * r) / height;
  v.k = k;
  clampAtlasView();
}
function panAtlasBy(dx, dy, width, height) {
  atlasView.ux += dx / width;
  atlasView.uy += dy / height;
  clampAtlasView();
}
function clampAtlasView() {
  const v = atlasView;
  if (v.k < 1.001) { v.k = 1; v.ux = 0; v.uy = 0; return; }
  v.ux = Math.max(1 - v.k, Math.min(0, v.ux));
  v.uy = Math.max(1 - v.k, Math.min(0, v.uy));
}

const atlasZoomIn = document.getElementById('cv-map-zoom-in');
const atlasZoomOut = document.getElementById('cv-map-zoom-out');
const atlasZoomReset = document.getElementById('cv-map-zoom-reset');
function syncAtlasZoomControls() {
  const k = atlasView.k;
  if (atlasZoomIn) atlasZoomIn.disabled = k >= ATLAS_MAX_ZOOM - 0.001;
  if (atlasZoomOut) atlasZoomOut.disabled = k <= 1;
  if (atlasZoomReset) atlasZoomReset.hidden = k <= 1;
  countryMapCanvas.classList.toggle('cv-map-zoomed', k > 1);
}

// While a gesture runs, each frame redraws the last full draw moved and scaled - one image
// copy, where a full draw is 6-75 ms on a laptop and more on a phone - and the full draw
// follows when the gesture ends.
const atlasGesture = { snapshot: null, from: null, frame: 0, settle: 0 };
function beginAtlasGesture() {
  if (atlasGesture.from || !countryMapCanvas.width) return;
  const snap = atlasGesture.snapshot || (atlasGesture.snapshot = document.createElement('canvas'));
  snap.width = countryMapCanvas.width;
  snap.height = countryMapCanvas.height;
  snap.getContext('2d').drawImage(countryMapCanvas, 0, 0);
  atlasGesture.from = { ...atlasView };
}
function previewAtlasGesture() {
  if (atlasGesture.frame || !atlasGesture.from) return;
  atlasGesture.frame = requestAnimationFrame(() => {
    atlasGesture.frame = 0;
    const from = atlasGesture.from;
    if (!from || from.countryId !== atlasView.countryId) return;
    const { width: w, height: h, dpr } = ATLAS_FRAME;
    const r = atlasView.k / from.k;
    countryMapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fillMapBackdrop(w, h);
    countryMapCtx.setTransform(dpr * r, 0, 0, dpr * r, dpr * (atlasView.ux - from.ux * r) * w, dpr * (atlasView.uy - from.uy * r) * h);
    countryMapCtx.drawImage(atlasGesture.snapshot, 0, 0, w, h);
    countryMapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lastAtlasSignature = '';
  });
}
function endAtlasGesture() {
  clearTimeout(atlasGesture.settle);
  cancelAnimationFrame(atlasGesture.frame);
  atlasGesture.frame = 0;
  atlasGesture.from = null;
  redrawAtlasView();
}
function redrawAtlasView() {
  syncAtlasZoomControls();
  if (activeCountryMap) drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath);
}
function atlasPoint(e) {
  const r = countryMapCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width || 1, h: r.height || 1 };
}
function zoomAtlasStep(f) {
  if (!activeCountryMap) return;
  const r = countryMapCanvas.getBoundingClientRect();
  zoomAtlasAt(f, r.width / 2, r.height / 2, r.width || 1, r.height || 1);
  redrawAtlasView();
}
// A button that disables itself (- at 1x, + at the limit) hands focus to its partner.
atlasZoomIn?.addEventListener('click', () => { zoomAtlasStep(2); if (atlasZoomIn.disabled) atlasZoomOut?.focus({ preventScroll: true }); });
atlasZoomOut?.addEventListener('click', () => { zoomAtlasStep(0.5); if (atlasZoomOut.disabled) atlasZoomIn?.focus({ preventScroll: true }); });
atlasZoomReset?.addEventListener('click', () => { zoomAtlasStep(1 / ATLAS_MAX_ZOOM); atlasZoomIn?.focus({ preventScroll: true }); });

countryMapCanvas.addEventListener('wheel', e => {
  if (!activeCountryMap) return;
  if (!mapPortal.classList.contains('active') && !e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const p = atlasPoint(e);
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  beginAtlasGesture();
  zoomAtlasAt(Math.max(0.5, Math.min(2, Math.pow(2, -e.deltaY * unit / 200))), p.x, p.y, p.w, p.h);
  previewAtlasGesture();
  clearTimeout(atlasGesture.settle);
  atlasGesture.settle = setTimeout(endAtlasGesture, 160);
}, { passive: false });

const atlasPointers = new Map();
let atlasLastTap = null;
let atlasTouchZoomAt = 0;
countryMapCanvas.addEventListener('pointerdown', e => {
  if (!activeCountryMap || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const p = atlasPoint(e);
  atlasPointers.set(e.pointerId, { x: p.x, y: p.y, x0: p.x, y0: p.y });
  // At 1x a single finger or mouse has nothing to pan: the page keeps the gesture.
  if (atlasPointers.size < 2 && atlasView.k <= 1) return;
  // Throws for a pointer already gone (lifted between the event and this line).
  try { countryMapCanvas.setPointerCapture(e.pointerId); } catch {}
  if (e.pointerType === 'mouse') countryMapCanvas.classList.add('cv-map-panning');
  clearTimeout(atlasGesture.settle);
  beginAtlasGesture();
});
countryMapCanvas.addEventListener('pointermove', e => {
  const prev = atlasPointers.get(e.pointerId);
  if (!prev || !atlasGesture.from) return;
  const p = atlasPoint(e);
  if (atlasPointers.size >= 2) {
    const [a, b] = [...atlasPointers.values()];
    const other = a === prev ? b : a;
    const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
    const d1 = Math.hypot(p.x - other.x, p.y - other.y);
    // Half the finger's move pans (the midpoint's move); the spread zooms about the midpoint.
    panAtlasBy((p.x - prev.x) / 2, (p.y - prev.y) / 2, p.w, p.h);
    if (d0 > 8) zoomAtlasAt(d1 / d0, (p.x + other.x) / 2, (p.y + other.y) / 2, p.w, p.h);
  } else {
    panAtlasBy(p.x - prev.x, p.y - prev.y, p.w, p.h);
  }
  prev.x = p.x; prev.y = p.y;
  previewAtlasGesture();
});
function releaseAtlasPointer(e) {
  const prev = atlasPointers.get(e.pointerId);
  if (!prev) return;
  atlasPointers.delete(e.pointerId);
  countryMapCanvas.classList.remove('cv-map-panning');
  // Double-tap zooms in where it lands. (Phones' own double-click events are not relied
  // on: some send none to an element that handles touches.)
  if (e.type === 'pointerup' && e.pointerType === 'touch' && !atlasPointers.size && Math.hypot(prev.x - prev.x0, prev.y - prev.y0) < 10) {
    const now = performance.now();
    if (atlasLastTap && now - atlasLastTap.t < 320 && Math.hypot(prev.x - atlasLastTap.x, prev.y - atlasLastTap.y) < 32) {
      atlasLastTap = null;
      atlasTouchZoomAt = now;
      const p = atlasPoint(e);
      atlasGesture.from = null;
      zoomAtlasAt(2, prev.x, prev.y, p.w, p.h);
      redrawAtlasView();
      return;
    }
    atlasLastTap = { t: now, x: prev.x, y: prev.y };
  }
  if (!atlasPointers.size && atlasGesture.from) endAtlasGesture();
}
countryMapCanvas.addEventListener('pointerup', releaseAtlasPointer);
countryMapCanvas.addEventListener('pointercancel', releaseAtlasPointer);
countryMapCanvas.addEventListener('dblclick', e => {
  if (!activeCountryMap || performance.now() - atlasTouchZoomAt < 600) return;
  e.preventDefault();
  const p = atlasPoint(e);
  zoomAtlasAt(e.shiftKey ? 0.5 : 2, p.x, p.y, p.w, p.h);
  redrawAtlasView();
});

// Locator inset for an island crop that leaves part of the country out (Seychelles'
// outer islands, Mauritius' Rodrigues and Agalega, Equatorial Guinea's Annobon): the whole
// country small, each island at least a dot, the area on screen boxed. A bottom corner -
// the fullscreen button sits in a top one - whichever covers less land.
function atlasLocatorBox(mapPath, view, width, height, offsetX, offsetY, scale) {
  const b = mapPath.bbox;
  const outside = b.minX < view.minX - 0.02 || b.maxX > view.maxX + 0.02 || b.minY < view.minY - 0.02 || b.maxY > view.maxY + 0.02;
  if (!outside || width < 260 || height < 220) return null;
  const side = Math.round(Math.max(88, Math.min(150, Math.min(width, height) * 0.24)));
  const aspect = b.width / Math.max(0.001, b.height);
  const w = Math.round(aspect >= 1 ? side : Math.max(72, side * aspect));
  const h = Math.round((aspect >= 1 ? Math.max(56, side / aspect) : side) + 16);
  const margin = 12;
  const landIn = (x, y) => {
    let hits = 0;
    countryMapCtx.save();
    countryMapCtx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const px = (x + w * i / 4 - offsetX) / scale, py = (y + h * j / 4 - offsetY) / scale;
      if (countryMapCtx.isPointInPath(mapPath.shape, px, py)) hits++;
    }
    countryMapCtx.restore();
    return hits;
  };
  const left = { x: margin, y: height - margin - h };
  const right = { x: width - margin - w, y: height - margin - h };
  const pick = landIn(right.x, right.y) < landIn(left.x, left.y) ? right : left;
  return { ...pick, w, h };
}

const ATLAS_ISLAND_STARTS = new Map();
function atlasIslandStarts(countryId, d) {
  if (!ATLAS_ISLAND_STARTS.has(countryId)) {
    ATLAS_ISLAND_STARTS.set(countryId, Array.from(String(d || '').matchAll(/M\s*(-?[\d.]+)[ ,](-?[\d.]+)/g), m => [Number(m[1]), Number(m[2])]));
  }
  return ATLAS_ISLAND_STARTS.get(countryId);
}

function drawAtlasLocator(countryId, mapPath, view, box) {
  const ctx = countryMapCtx;
  const b = mapPath.bbox;
  const cap = 16, pad = 8;
  const s = Math.min((box.w - pad * 2) / Math.max(0.001, b.width), (box.h - cap - pad * 2) / Math.max(0.001, b.height));
  const ox = box.x + (box.w - b.width * s) / 2 - b.minX * s;
  const oy = box.y + cap + (box.h - cap - b.height * s) / 2 - b.minY * s;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(box.x, box.y, box.w, box.h, 6) : ctx.rect(box.x, box.y, box.w, box.h);
  ctx.fillStyle = 'rgba(10,14,11,0.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(230,248,231,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = '600 10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(230,248,231,0.72)';
  ctx.fillText('Whole country', box.x + pad, box.y + cap / 2 + 3);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(s, s);
  ctx.fillStyle = FRONT_GREEN;
  ctx.fill(mapPath.shape);
  ctx.restore();
  // Islands smaller than a pixel at this scale still get a dot.
  const detail = COUNTRY_DETAIL[countryId];
  ctx.fillStyle = FRONT_GREEN;
  for (const [x, y] of atlasIslandStarts(countryId, detail?.d)) {
    ctx.beginPath();
    ctx.arc(ox + x * s, oy + y * s, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // The area on screen, kept inside the inset: it is often wider than the country itself.
  const rw = Math.max(8, (view.maxX - view.minX) * s), rh = Math.max(8, (view.maxY - view.minY) * s);
  const cx = ox + (view.minX + view.maxX) / 2 * s, cy = oy + (view.minY + view.maxY) / 2 * s;
  const left = Math.max(box.x + 3, cx - rw / 2), right = Math.min(box.x + box.w - 3, cx + rw / 2);
  const top = Math.max(box.y + cap, cy - rh / 2), bottom = Math.min(box.y + box.h - 3, cy + rh / 2);
  ctx.strokeStyle = 'rgba(244,250,244,0.92)';
  ctx.lineWidth = 1.25;
  if (right > left && bottom > top) ctx.strokeRect(left, top, right - left, bottom - top);
  ctx.restore();
}

function islandMapZoom(countryId, isFullscreen) {
  // Zoom-past-fit is only safe on top of an explicit ISLAND_FULLSCREEN_BOUNDS focus crop
  // (it trims empty ocean around archipelagos). Applied to a full-country fit it guarantees
  // overflow — e.g. Gambia at 1.6x spilled off both edges of the screen.
  if (!ISLAND_FULLSCREEN_BOUNDS[countryId]) return 1;
  if (isFullscreen) return ({ cv: 1.15, km: 1.15, st: 1.15 })[countryId] || 1;
  return 1;
}

// Fullscreen takes every island frame. The embedded and phone maps take only those that
// crop something away (Seychelles, Mauritius, Equatorial Guinea): the Cabo Verde, Sao Tome
// and Comoros frames are a little wider than the islands themselves, room for fullscreen's
// zoom, and drew the small map smaller than its own outline did (Comoros 7.6% land to 4.7%).
function atlasUsesIslandFocus(countryId, bbox, isFullscreen) {
  const focus = ISLAND_FULLSCREEN_BOUNDS[countryId];
  if (!focus) return false;
  if (isFullscreen || !bbox) return true;
  return bbox.minX < focus.minX - 0.02 || bbox.maxX > focus.maxX + 0.02 ||
    bbox.minY < focus.minY - 0.02 || bbox.maxY > focus.maxY + 0.02;
}

function mapViewBounds(countryId, bounds, useIslandFocus) {
  const focus = useIslandFocus ? ISLAND_FULLSCREEN_BOUNDS[countryId] : null;
  if (!focus) return bounds;
  return {
    minX: focus.minX,
    maxX: focus.maxX,
    minY: focus.minY,
    maxY: focus.maxY,
    width: focus.maxX - focus.minX,
    height: focus.maxY - focus.minY
  };
}

function fillMapBackdrop(width, height) {
  const bg = countryMapCtx.createLinearGradient(0, 0, width, height);
  const light = mapLight();
  bg.addColorStop(0, light ? '#ece7dc' : '#171a17');
  bg.addColorStop(0.56, light ? '#e5e0d4' : '#101210');
  bg.addColorStop(1, light ? '#e9e4d9' : '#131313');
  countryMapCtx.fillStyle = bg;
  countryMapCtx.fillRect(0, 0, width, height);

  const glow = countryMapCtx.createRadialGradient(width * 0.5, height * 0.46, 0, width * 0.5, height * 0.46, Math.max(width, height) * 0.58);
  glow.addColorStop(0, 'rgba(76,175,80,0.075)');
  glow.addColorStop(0.42, 'rgba(76,175,80,0.024)');
  glow.addColorStop(1, 'rgba(76,175,80,0)');
  countryMapCtx.fillStyle = glow;
  countryMapCtx.fillRect(0, 0, width, height);
}

function drawSmartLabel(text, x, y, color, placed, width, height, anchor = 'right', force = false) {
  const order = {
    right: [[9, 0], [9, -14], [9, 14], [-9, 0], [-9, -14], [-9, 14]],
    left: [[-9, 0], [-9, -14], [-9, 14], [9, 0], [9, -14], [9, 14]],
    top: [[10, -14], [-10, -14], [10, 14], [-10, 14], [12, 0], [-12, 0]]
  }[anchor] || [[9, 0]];

  countryMapCtx.textBaseline = 'middle';
  countryMapCtx.lineJoin = 'round';
  const metrics = countryMapCtx.measureText(text);
  const labelWidth = Math.ceil(metrics.width);
  const labelHeight = 12;
  const margin = 10;

  // Capital labels are orientation anchors: drawn whatever is in the way, in the first
  // free slot if there is one, else pinned to the first slot.
  if (force) {
    const free = order.find(([dx, dy]) => {
      const left = dx >= 0 ? x + dx : x + dx - labelWidth;
      const top = y + dy - labelHeight / 2;
      const box = { left: left - 3, top: top - 2, right: left + labelWidth + 3, bottom: top + labelHeight + 2 };
      return box.left >= margin && box.right <= width - margin && box.top >= margin && box.bottom <= height - margin &&
        !placed.some(other => boxesOverlap(box, other));
    });
    const [dx, dy] = free || order[0];
    const alignLeft = dx >= 0;
    let left = alignLeft ? x + dx : x + dx - labelWidth;
    let top = y + dy - labelHeight / 2;
    left = Math.max(margin, Math.min(width - margin - labelWidth, left));
    top = Math.max(margin, Math.min(height - margin - labelHeight, top));
    const drawX = alignLeft ? left : left + labelWidth;
    const drawY = top + labelHeight / 2;
    countryMapCtx.textAlign = alignLeft ? 'left' : 'right';
    countryMapCtx.strokeStyle = 'rgba(8,15,10,0.9)';
    countryMapCtx.lineWidth = 3;
    countryMapCtx.strokeText(text, drawX, drawY);
    countryMapCtx.fillStyle = color;
    countryMapCtx.fillText(text, drawX, drawY);
    placed.push({ left: left - 3, top: top - 2, right: left + labelWidth + 3, bottom: top + labelHeight + 2 });
    return true;
  }

  for (const [dx, dy] of order) {
    const alignLeft = dx >= 0;
    const left = alignLeft ? x + dx : x + dx - labelWidth;
    const top = y + dy - labelHeight / 2;
    const box = { left: left - 3, top: top - 2, right: left + labelWidth + 3, bottom: top + labelHeight + 2 };
    if (box.left < margin || box.right > width - margin || box.top < margin || box.bottom > height - margin) continue;
    if (placed.some(other => boxesOverlap(box, other))) continue;

    countryMapCtx.textAlign = alignLeft ? 'left' : 'right';
    countryMapCtx.strokeStyle = 'rgba(8,15,10,0.9)';
    countryMapCtx.lineWidth = 3;
    countryMapCtx.strokeText(text, alignLeft ? left : left + labelWidth, y + dy);
    countryMapCtx.fillStyle = color;
    countryMapCtx.fillText(text, alignLeft ? left : left + labelWidth, y + dy);
    placed.push(box);
    return true;
  }
  return false;
}

function boxesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function drawGisLayers(countryId, project, placedLabels, width, height, mapPath, offsetX, offsetY, scale, mapDpr) {
  const gis = COUNTRY_GIS[countryId] || { places: [], rivers: [], lakes: [] };

  if (mapLayers.water) {
    countryMapCtx.save();
    applyMapClip(mapPath, offsetX, offsetY, scale, mapDpr);
    for (const lake of gis.lakes || []) {
      countryMapCtx.fillStyle = 'rgba(74,163,199,0.58)';
      countryMapCtx.strokeStyle = 'rgba(17,72,98,0.88)';
      countryMapCtx.lineWidth = 0.8;
      for (const ring of lake.rings || []) {
        countryMapCtx.beginPath();
        ring.forEach(([lon, lat], index) => {
          const [x, y] = project(lon, lat);
          if (index === 0) countryMapCtx.moveTo(x, y);
          else countryMapCtx.lineTo(x, y);
        });
        countryMapCtx.closePath();
        countryMapCtx.fill();
        countryMapCtx.stroke();
      }
    }
    for (const river of gis.rivers || []) {
      countryMapCtx.strokeStyle = 'rgba(78,188,225,0.84)';
      countryMapCtx.lineWidth = Math.max(0.65, 1.8 - river.rank * 0.12);
      for (const line of river.lines || []) {
        countryMapCtx.beginPath();
        line.forEach(([lon, lat], index) => {
          const [x, y] = project(lon, lat);
          if (index === 0) countryMapCtx.moveTo(x, y);
          else countryMapCtx.lineTo(x, y);
        });
        countryMapCtx.stroke();
      }
    }
    countryMapCtx.restore();
  }

  const places = mapLayers.places
    ? atlasPlaces(countryId)
        .slice()
        .sort((a, b) => Number(!!b.capital) - Number(!!a.capital) || (b.pop || 0) - (a.pop || 0))
        .slice(0, 35)
    : [];
  // The capital label is drawn regardless of collisions, so it goes first; anything
  // placed before it could be painted over - "Jomo Kenyatta (NBO)" was, under "Nairobi".
  const infraItems = mapLayers.infra ? atlasInfraForCountry(countryId) : [];
  // The diamonds are drawn last, over everything; reserve their squares now so no label
  // is placed under one ("K<diamond>sumu" under Kisumu's airport, Borama under Hargeisa's).
  const markerBoxes = infraItems.filter(i => Number.isFinite(i.lon) && Number.isFinite(i.lat)).map(i => {
    const [x, y] = project(i.lon, i.lat);
    return { left: x - 6, top: y - 6, right: x + 6, bottom: y + 6, marker: true };
  });
  placedLabels.push(...markerBoxes);
  const labelledPlaces = new Set();
  const capitalPlace = places.find(p => p.capital);
  const capitalXY = capitalPlace && project(capitalPlace.lon, capitalPlace.lat);
  // Zoomed in, the capital can be off the map: its forced label would be pinned to an edge.
  if (capitalPlace && mapLayers.labels && capitalXY[0] >= 0 && capitalXY[0] <= width && capitalXY[1] >= 0 && capitalXY[1] <= height) {
    const [x, y] = capitalXY;
    countryMapCtx.font = '700 13px system-ui, -apple-system, "Segoe UI", sans-serif';
    drawSmartLabel(capitalPlace.name, x, y, '#f1f7ef', placedLabels, width, height, 'right', true);
    labelledPlaces.add(capitalPlace);
  }
  // Label order: capital, cities of a million or more, the main port and gateway
  // airports, landmarks, other cities, small towns. Cape Town lost its name to "Cape Town
  // port" and "CPT" when ports came first; Mount Kenya lost out to Sotik when landmarks
  // came last.
  const majorPlace = place => place.capital || place.pop > 180000;
  // Small towns are labelled up to a budget, counting labels only - not the infrastructure
  // squares, the locator inset or the buttons reserved above. Zoomed in, the screen holds
  // a smaller area, with room for more.
  const reservedBoxes = placedLabels.filter(box => box.reserved).length;
  const labelCount = () => placedLabels.length - markerBoxes.length - reservedBoxes;
  const minorBudget = atlasView.k > 1 ? 22 : 14;
  const placeDots = [];
  const drawPlaceDot = (x, y, capital, ringed = false) => {
    countryMapCtx.beginPath();
    if (!capital) {
      countryMapCtx.arc(x, y, 2.2, 0, Math.PI * 2);
      countryMapCtx.fillStyle = 'rgba(232,240,228,0.85)';
      countryMapCtx.fill();
      if (!ringed) return;
      countryMapCtx.strokeStyle = 'rgba(9,28,14,0.88)';
      countryMapCtx.lineWidth = 1;
      countryMapCtx.stroke();
      return;
    }
    countryMapCtx.arc(x, y, 4.4, 0, Math.PI * 2);
    countryMapCtx.fillStyle = '#b9f2bc';
    countryMapCtx.fill();
    countryMapCtx.strokeStyle = 'rgba(9,28,14,0.88)';
    countryMapCtx.lineWidth = 1.2;
    countryMapCtx.stroke();
  };
  const drawPlace = (place, town = false) => {
    const [x, y] = project(place.lon, place.lat);
    let labelDrawn = labelledPlaces.has(place);
    const shouldLabel = (!town && majorPlace(place)) || labelCount() < minorBudget;
    if (mapLayers.labels && shouldLabel && !labelDrawn) {
      countryMapCtx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
      labelDrawn = drawSmartLabel(place.name, x, y, '#e0ecdf', placedLabels, width, height, 'top');
    }
    // A small dot under every labelled town, so a label nudged aside by a
    // neighbour still shows which point it names.
    if (!place.capital && (!mapLayers.labels || !labelDrawn)) return;
    drawPlaceDot(x, y, !!place.capital);
    placeDots.push({ x, y, capital: !!place.capital });
  };
  if (mapLayers.places) places.filter(p => !p.capital && p.pop >= 1000000).forEach(p => drawPlace(p));
  const labelledInfra = new Set();
  // A port or airport named after the city it sits beside needs no label of its own:
  // the diamond is on the map and the city's name is next to it. On a phone, Kenya's
  // Atlas read "Eldoret / Eldoret (EDL)", "Kisumu / KIS" and "Mombasa / Moi (MBA) /
  // Mombasa port" in a pile. The marker is still drawn.
  const besideNamesake = (item, x, y) => places.some(p => {
    if (!(p.capital || p.pop > 180000)) return false;
    if (!item.label.toLowerCase().startsWith(String(p.name).toLowerCase())) return false;
    const [px, py] = project(p.lon, p.lat);
    return Math.hypot(px - x, py - y) < 50;
  });
  if (mapLayers.infra && mapLayers.labels) {
    countryMapCtx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
    for (const item of infraItems.filter(i => i.priority)) {
      const [x, y] = project(item.lon, item.lat);
      if (besideNamesake(item, x, y)) { labelledInfra.add(item); continue; }
      // Full name if it fits, else the IATA code: on a 330px phone map JKIA sits 4px
      // from Nairobi and "Jomo Kenyatta (NBO)" has nowhere to go.
      if (drawSmartLabel(item.label, x, y, '#fff0a9', placedLabels, width, height, 'top') ||
          (item.short && drawSmartLabel(item.short, x, y, '#fff0a9', placedLabels, width, height, 'top'))) labelledInfra.add(item);
    }
  }

  if (mapLayers.places) {
    for (const landmark of atlasFeaturePoints(countryId)) {
      if (landmark.kind === 'city') continue;
      const [x, y] = project(landmark.lon, landmark.lat);
      if (mapLayers.labels) {
        countryMapCtx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
        const labelDrawn = drawSmartLabel(landmark.name, x, y, '#eef6ec', placedLabels, width, height, landmark.kind === 'water' ? 'left' : 'right');
        if (!labelDrawn) continue;
      }
      const color = landmark.kind === 'water' ? '#55b8df' : '#e7eadf';
      countryMapCtx.beginPath();
      countryMapCtx.arc(x, y, 5.5, 0, Math.PI * 2);
      countryMapCtx.fillStyle = color;
      countryMapCtx.fill();
      countryMapCtx.strokeStyle = '#111';
      countryMapCtx.lineWidth = 1.2;
      countryMapCtx.stroke();
    }
    places.filter(p => p.capital).forEach(p => drawPlace(p));
    places.filter(p => !p.capital && p.pop > 180000 && p.pop < 1000000).forEach(p => drawPlace(p));
    // Natural Earth gives some hamlets a population of 10 or 100. They go after the
    // towns, and only zoomed in: Western Sahara was labelled Lemsid (100) and Dawra (10)
    // and not Boujdour (42,651), which is only in the towns.
    const hamlet = p => !p.capital && (p.pop || 0) < 200;
    places.filter(p => !p.capital && !(p.pop > 180000) && !hamlet(p)).forEach(p => drawPlace(p));
    // Then the towns (atlasTowns), largest first, as far as the label budget goes; a
    // town with no room gets no dot either. Most countries' places fill the budget, so
    // unzoomed this reaches only the sparse ones: Gambia's Serekunda (340,000), Benin's
    // Abomey-Calavi, Togo's Kara.
    for (const town of atlasTowns(countryId)) {
      if (!mapLayers.labels || labelCount() >= minorBudget) break;
      drawPlace(town, true);
    }
    if (atlasView.k > 1) places.filter(hamlet).forEach(p => drawPlace(p));
  }

  if (mapLayers.infra) {
    // Every marker is drawn; only a label that has no room is dropped. This used to skip
    // any port or airport within 18px of a city, which hid exactly the ones that matter
    // most - Jomo Kenyatta beside Nairobi, Mombasa port beside Mombasa - and left the
    // map showing Amboseli's airstrip instead.
    for (const item of infraItems) {
      if (!Number.isFinite(item.lon) || !Number.isFinite(item.lat)) continue;
      const [x, y] = project(item.lon, item.lat);
      if (mapLayers.labels && !labelledInfra.has(item) && !besideNamesake(item, x, y)) {
        countryMapCtx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
        drawSmartLabel(item.label, x, y, '#fff0a9', placedLabels, width, height, 'right') ||
          (item.short && drawSmartLabel(item.short, x, y, '#fff0a9', placedLabels, width, height, 'right'));
      }
      countryMapCtx.save();
      countryMapCtx.translate(x, y);
      countryMapCtx.rotate(Math.PI / 4);
      countryMapCtx.fillStyle = item.kind === 'airport' ? '#8fc3ff' : '#d6b74d';
      countryMapCtx.strokeStyle = 'rgba(17,17,17,0.82)';
      countryMapCtx.lineWidth = 1;
      countryMapCtx.fillRect(-4, -4, 8, 8);
      countryMapCtx.strokeRect(-4, -4, 8, 8);
      countryMapCtx.restore();
    }
    // A city's dot under a diamond goes back on top, ringed: Hargeisa's sat under its
    // airport's, so its label pointed at "HGA".
    for (const dot of placeDots) {
      if (markerBoxes.some(box => dot.x > box.left && dot.x < box.right && dot.y > box.top && dot.y < box.bottom)) drawPlaceDot(dot.x, dot.y, dot.capital, true);
    }
  }
}

function applyMapClip(mapPath, offsetX, offsetY, scale, mapDpr) {
  countryMapCtx.translate(offsetX, offsetY);
  countryMapCtx.scale(scale, scale);
  countryMapCtx.clip(mapPath.shape);
  countryMapCtx.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
}

function drawCountryOutline(mapPath, offsetX, offsetY, scale) {
  const bbox = mapPath.bbox;
  const shortest = Math.max(1, Math.min(bbox.width, bbox.height));
  const longest = Math.max(shortest, bbox.width, bbox.height);
  const slenderness = shortest / longest;
  const outerPx = slenderness < 0.18 ? 0.42 : 0.78;
  const innerPx = slenderness < 0.18 ? 0.1 : 0.2;
  countryMapCtx.save();
  countryMapCtx.translate(offsetX, offsetY);
  countryMapCtx.scale(scale, scale);
  countryMapCtx.lineJoin = 'round';
  countryMapCtx.lineCap = 'round';
  countryMapCtx.miterLimit = 2;
  countryMapCtx.lineWidth = outerPx / scale;
  countryMapCtx.strokeStyle = 'rgba(5,11,7,0.94)';
  countryMapCtx.stroke(mapPath.shape);
  countryMapCtx.lineWidth = innerPx / scale;
  countryMapCtx.strokeStyle = 'rgba(230,248,231,0.32)';
  countryMapCtx.stroke(mapPath.shape);
  countryMapCtx.restore();
}

function reliefNoise(x, y, seed) {
  return (
    Math.sin((x * 0.018 + seed) + Math.cos(y * 0.011)) +
    0.62 * Math.sin((x + y) * 0.032 + seed * 1.7) +
    0.38 * Math.cos((x * 0.051 - y * 0.043) + seed * 2.3)
  ) / 2;
}

/* Real relief: hill-shaded from elevation (Mapzen Terrain Tiles: SRTM, GMTED2010, ETOPO1)
   by scripts/build-country-relief.ps1, about 1,400 px a country whatever its size
   (data/relief/<cc>.jpg; Natural Earth's fixed 1.85 km pixels gave Rwanda 183 px;
   data/relief/index.json gives each image's edges). Raster and Atlas share one plain
   longitude/latitude projection, so the image is placed by its corners. This replaced a
   "Stylized relief" that was sine waves seeded by the country code, with contour lines
   drawn on them: hills and ridges where there are none. Not drawn in data-saver mode. */
const RELIEF = { index: null, loading: null, images: new Map(), waitStart: new Map(), holdTimer: 0 };

function loadReliefIndex() {
  if (RELIEF.index || RELIEF.loading) return RELIEF.loading;
  RELIEF.loading = fetch('data/relief/index.json?v=' + (window.ASJ_ASSET_VERSION || '1'))
    .then(r => (r.ok ? r.json() : null))
    .then(j => { RELIEF.index = j?.countries || {}; return RELIEF.index; })
    .catch(() => { RELIEF.index = {}; return RELIEF.index; });
  return RELIEF.loading;
}

// One relief image, fetched once. Once it has loaded it is decoded before the redraw -
// drawing a freshly loaded 1,400 px JPEG decodes it on the spot, a hitch on a phone - but
// decode() can wait indefinitely in a tab that is not showing, so a load is enough after
// 300 ms: a page opened in a background tab still gets its relief.
function reliefImage(key, countryId) {
  let img = RELIEF.images.get(key);
  if (img) {
    // Most recently used last, for trimReliefImages.
    RELIEF.images.delete(key);
    RELIEF.images.set(key, img);
    return img;
  }
  img = new Image();
  img.decoding = 'async';
  const ready = () => { if (img.__ready) return; img.__ready = true; repaintAtlasFor(countryId); };
  img.onload = () => {
    if (img.decode) img.decode().then(ready, ready);
    setTimeout(ready, 300);
  };
  img.src = 'data/relief/' + key + '.jpg?v=' + (window.ASJ_ASSET_VERSION || '1');
  RELIEF.images.set(key, img);
  trimReliefImages();
  return img;
}
// Decoded, a 1,400 px relief image holds about 8 MB; paging through every country kept all
// of them and their previews - several hundred MB, enough for a cheap phone to kill the tab.
// The most recently used are kept; an older one dropped comes back from the HTTP or service-
// worker cache in milliseconds if its country is opened again. Never the map on screen, or
// an image still loading.
const RELIEF_KEEP = 6, RELIEF_KEEP_PREVIEWS = 24;
function trimReliefImages() {
  const onScreen = activeCountryMap?.countryId;
  let full = 0, previews = 0;
  for (const key of RELIEF.images.keys()) key.endsWith('-s') ? previews++ : full++;
  for (const [key, img] of RELIEF.images) {
    const preview = key.endsWith('-s');
    if (preview ? previews <= RELIEF_KEEP_PREVIEWS : full <= RELIEF_KEEP) continue;
    if (!img.__ready || key.slice(0, 2) === onScreen) continue;
    RELIEF.images.delete(key);
    img.onload = null;
    img.removeAttribute('src');
    if (preview) previews--; else full--;
  }
}
const reliefReady = img => !!img && img.__ready && img.naturalWidth > 0;
// The index is 3 KB: fetched once the page is idle, so the first country opened goes
// straight to its image.
if (!window.ASJ_SAVE_DATA) (window.requestIdleCallback || (fn => setTimeout(fn, 2500)))(() => loadReliefIndex());

// Start the relief downloads when a country opens, not when the Atlas is first drawn.
// The Atlas used to ask for the index, wait, ask for the image, wait, and redraw: the map
// appeared flat and the relief arrived a beat later (and an island crop a beat after
// that). Not in data-saver mode or on a slow connection, where relief is not drawn.
function prefetchRelief(countryId) {
  if (window.ASJ_SAVE_DATA) return;
  RELIEF.waitStart.set(countryId, performance.now());
  startReliefLoad(countryId);
}
function prefetchReliefPreview(countryId) {
  if (window.ASJ_SAVE_DATA) return;
  loadReliefIndex()?.then(index => { if (index?.[countryId]) reliefImage(countryId + '-s', countryId); });
}
function startReliefLoad(countryId) {
  loadReliefIndex()?.then(index => {
    const box = index?.[countryId];
    if (!box) return;
    // The ~15 KB preview first, so the Atlas has relief to show within moments.
    reliefImage(countryId + '-s', countryId);
    reliefImage(countryId, countryId);
    if (box.focus) reliefImage(countryId + '-focus', countryId);
  });
}

// Map and relief appear together. For up to RELIEF_WAIT_MS after a country opens, the
// Atlas stays faded out until it can draw relief (the preview at least). It used to draw
// at once with a flat texture and the relief arrived seconds later on a phone - Rwanda's
// image is 560 KB - changing the map under the reader. Past the wait it draws anyway.
const RELIEF_WAIT_MS = 2500;
// The preview only after this long without the full image: from the HTTP or service-worker
// cache the full one lands a few milliseconds after it, and the map showed the soft
// preview for a frame and then sharpened.
const RELIEF_FULL_GRACE_MS = 150;
function reliefDrawable(countryId) {
  if (!RELIEF.index) return false;
  if (!RELIEF.index[countryId]) return true;
  if (reliefReady(RELIEF.images.get(countryId))) return true;
  const waited = performance.now() - (RELIEF.waitStart.get(countryId) || 0);
  return waited >= RELIEF_FULL_GRACE_MS && reliefReady(RELIEF.images.get(countryId + '-s'));
}
function holdAtlasForRelief(countryId) {
  if (!RELIEF.waitStart.has(countryId)) RELIEF.waitStart.set(countryId, performance.now());
  const waiting = mapLayers.terrain && !window.ASJ_SAVE_DATA && !reliefDrawable(countryId);
  const waited = performance.now() - RELIEF.waitStart.get(countryId);
  const left = RELIEF_WAIT_MS - waited;
  if (waiting && left > 0) {
    countryMapCanvas.classList.add('cv-map-waiting');
    if (!RELIEF.images.has(countryId + '-s')) startReliefLoad(countryId);
    clearTimeout(RELIEF.holdTimer);
    // Check again when the grace for the full image ends (the preview may be in by then),
    // or when the whole wait does.
    const next = waited < RELIEF_FULL_GRACE_MS ? RELIEF_FULL_GRACE_MS - waited : left;
    RELIEF.holdTimer = setTimeout(() => repaintAtlasFor(countryId), next + 20);
    return true;
  }
  countryMapCanvas.classList.remove('cv-map-waiting');
  clearTimeout(RELIEF.holdTimer);
  return false;
}

// Draws the country's relief image - the full one once it has arrived, the preview until
// then; false when neither is there (yet), and the caller draws the flat texture.
function drawCountryRelief(countryId, project) {
  if (window.ASJ_SAVE_DATA) return false;
  if (!RELIEF.index) { loadReliefIndex()?.then(() => repaintAtlasFor(countryId)); return false; }
  const box = RELIEF.index[countryId];
  if (!box) return false;
  const full = reliefImage(countryId, countryId);
  const img = reliefReady(full) ? full : RELIEF.images.get(countryId + '-s');
  if (!reliefReady(img)) return false;
  const [x0, y0] = project(box.w, box.n);
  const [x1, y1] = project(box.e, box.s);
  countryMapCtx.imageSmoothingEnabled = true;
  countryMapCtx.imageSmoothingQuality = 'high';
  countryMapCtx.drawImage(img, x0, y0, x1 - x0, y1 - y0);
  if (img === full) drawReliefFocus(countryId, box, img, x1 - x0, project);
  return true;
}

// The island crop's own image (scripts/build-country-relief.ps1), over the country one,
// once the view stretches the country image past its pixels. Seychelles' image spans
// 11 degrees of ocean and outer islands, so zoomed to Mahe it was about 28 pixels drawn
// across a phone screen; the crop's image has 33 m pixels. Not fetched for a view that
// does not need it (the full-country desktop map).
function drawReliefFocus(countryId, box, baseImg, baseDrawnWidth, project) {
  const focus = box.focus;
  if (!focus) return;
  // In device pixels: the embedded map draws at 2-3x, so a country image that looks
  // unstretched in CSS pixels is still blown up two or three times on the screen.
  const stretch = baseDrawnWidth * (countryMapCtx.getTransform?.().a || 1) / baseImg.naturalWidth;
  if (stretch < 1.5) return;
  const img = reliefImage(countryId + '-focus', countryId);
  if (!reliefReady(img)) return;
  const [fx0, fy0] = project(focus.w, focus.n);
  const [fx1, fy1] = project(focus.e, focus.s);
  countryMapCtx.drawImage(img, fx0, fy0, fx1 - fx0, fy1 - fy0);
}

function repaintAtlasFor(countryId) {
  if (activeCountryMap?.countryId !== countryId) return;
  drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath);
}

function drawPaperTexture(width, height, countryId) {
  const seed = countryId.charCodeAt(0) + countryId.charCodeAt(1);
  const step = width > 800 ? 6 : 4;
  const cacheKey = 'green-paper:' + countryId + ':' + width + 'x' + height + ':' + step;
  const cached = MAP_TEXTURE_CACHE.get(cacheKey);
  if (cached) {
    countryMapCtx.drawImage(cached, 0, 0);
    return;
  }
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const octx = off.getContext('2d');
  const img = octx.createImageData(width, height);
  const d = img.data;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const grain = reliefNoise(x, y, seed) * 6;
      const r = 52 + grain;
      const g = 126 + grain;
      const b = 61 + grain * 0.6;
      for (let dy = 0; dy < step && y + dy < height; dy++) {
        for (let dx = 0; dx < step && x + dx < width; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          d[i] = r;
          d[i + 1] = g;
          d[i + 2] = b;
          d[i + 3] = 255;
        }
      }
    }
  }
  octx.putImageData(img, 0, 0);
  rememberMapTexture(cacheKey, off);
  countryMapCtx.drawImage(off, 0, 0);
}

// Main roads from Natural Earth (scripts/build-country-roads.ps1: the trunk network and
// main regional roads, scalerank 3-6), attached to each country's GIS file. Drawn under
// the railways and labels, inside the outline clip, quieter than rail: a road map, not a
// road atlas. The Atlas had railways and no roads at all.
function drawRoads(countryId, project) {
  if (mapLayers.roads === false) return;
  const roads = COUNTRY_GIS[countryId]?.roads;
  if (!roads) return;
  const stroke = (lines, width, color) => {
    countryMapCtx.beginPath();
    for (const line of lines || []) {
      line.forEach(([lon, lat], index) => {
        const [x, y] = project(lon, lat);
        if (index === 0) countryMapCtx.moveTo(x, y);
        else countryMapCtx.lineTo(x, y);
      });
    }
    countryMapCtx.lineWidth = width;
    countryMapCtx.strokeStyle = color;
    countryMapCtx.stroke();
  };
  countryMapCtx.save();
  countryMapCtx.lineJoin = 'round';
  countryMapCtx.lineCap = 'round';
  countryMapCtx.setLineDash([]);
  stroke(roads.secondary, 1, 'rgba(246,238,214,0.42)');
  stroke(roads.major, 2.4, 'rgba(18,22,18,0.35)');
  stroke(roads.major, 1.5, 'rgba(250,242,220,0.78)');
  countryMapCtx.restore();
}

// Railways from OpenStreetMap (active lines, sidings and yards excluded), built into
// each country's GIS file by scripts/build-country-rail.ps1. This used to draw a few
// hand-placed points as a "Great Rift Valley" and a "Nile River" - straight lines across
// the map that read as roads - while the real Nairobi-Mombasa SGR was absent.
function drawLinearFeatures(countryId, project, placedLabels, width, height) {
  if (mapLayers.rail === false) return;
  const rail = countryRail(countryId)?.lines || [];
  for (const line of rail) {
    const sgr = line.gauge === 1435;
    for (const part of line.parts || []) {
      countryMapCtx.beginPath();
      part.forEach(([lon, lat], index) => {
        const [x, y] = project(lon, lat);
        if (index === 0) countryMapCtx.moveTo(x, y);
        else countryMapCtx.lineTo(x, y);
      });
      countryMapCtx.strokeStyle = 'rgba(14,16,14,0.85)';
      countryMapCtx.lineWidth = sgr ? 3.4 : 2.6;
      countryMapCtx.stroke();
      countryMapCtx.strokeStyle = sgr ? '#f2dfae' : 'rgba(232,217,181,0.78)';
      countryMapCtx.lineWidth = sgr ? 1.8 : 1.2;
      countryMapCtx.setLineDash(sgr ? [] : [5, 3]);
      countryMapCtx.stroke();
      countryMapCtx.setLineDash([]);
    }
  }
}

// Calendar days between a story's date and a reference moment, in the reader's own time
// zone rather than 24-hour blocks: a story filed at 23:00 yesterday is one day old at
// 07:00 today. Accepts a bare day or a full timestamp. NaN when unparseable.
function calendarDaysBefore(date, reference = Date.now()) {
  if (!date) return NaN;
  const value = String(date);
  const then = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00' : value);
  if (isNaN(then)) return NaN;
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(new Date(reference)) - startOfDay(then)) / 86400000);
}

function relativeDateLabel(date) {
  // Stories carry full timestamps ("2026-10-20T22:48:19Z"). This used to append
  // T00:00:00 to whatever it was given, which only parses for a bare day, so every Wire
  // row lost its age - and a story six weeks old read exactly like this morning's.
  const days = calendarDaysBefore(date);
  if (!Number.isFinite(days)) return '';
  const value = String(date);
  const then = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00' : value);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return days + ' days ago';
  return new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short' }).format(then);
}

function storySummary(story) {
  if (story.summary) return story.summary;
  const place = story.place || 'the capital';
  const type = (story.type || 'local').toLowerCase();
  if (type.includes('climate')) return 'Residents and local officials are tracking weather shifts, water levels, and the street-level impact around ' + place + '.';
  if (type.includes('transport') || type.includes('movement')) return 'Commuters, drivers, and small businesses are watching how movement through ' + place + ' changes the cost of the day.';
  if (type.includes('market') || type.includes('business')) return 'Traders in ' + place + ' are reading demand, delays, and prices as early signals for the week ahead.';
  if (type.includes('river')) return 'Boat crews and river communities near ' + place + ' are mapping route changes as conditions shift.';
  return 'A street-level report from ' + place + ', built around the voices, prices, and decisions shaping the day.';
}

function squarifyTreemap(items, W, H) {
  const out = [];
  const total = items.reduce((s, it) => s + it.value, 0) || 1;
  const area = W * H;
  const nodes = items.map(it => ({ it, area: it.value / total * area }));
  let rx = 0, ry = 0, rw = W, rh = H, i = 0;
  const worst = (row, side) => {
    let mx = -Infinity, mn = Infinity, sum = 0;
    for (const r of row) { sum += r.area; if (r.area > mx) mx = r.area; if (r.area < mn) mn = r.area; }
    const s2 = sum * sum, d2 = side * side;
    return Math.max((d2 * mx) / s2, s2 / (d2 * mn));
  };
  while (i < nodes.length) {
    const side = Math.min(rw, rh);
    const row = [nodes[i]]; let j = i + 1;
    while (j < nodes.length && worst([...row, nodes[j]], side) <= worst(row, side)) { row.push(nodes[j]); j++; }
    const rowArea = row.reduce((s, n) => s + n.area, 0);
    if (rw >= rh) {
      const colW = rowArea / rh; let cy = ry;
      for (const n of row) { const cellH = n.area / colW; out.push({ ...n.it, x: rx, y: cy, w: colW, h: cellH }); cy += cellH; }
      rx += colW; rw -= colW;
    } else {
      const rowH = rowArea / rw; let cx = rx;
      for (const n of row) { const cellW = n.area / rowH; out.push({ ...n.it, x: cx, y: ry, w: cellW, h: rowH }); cx += cellW; }
      ry += rowH; rh -= rowH;
    }
    i = j;
  }
  return out;
}
function heatColor(ch) {
  const t = Math.max(-1, Math.min(1, ch / 3));
  if (Math.abs(ch) < 0.06) return 'rgb(40,46,42)';
  if (t >= 0) return 'rgb(' + Math.round(26 + 6 * t) + ',' + Math.round(60 + 110 * t) + ',' + Math.round(40 + 24 * t) + ')';
  const a = -t;
  return 'rgb(' + Math.round(70 + 130 * a) + ',' + Math.round(40 - 14 * a) + ',' + Math.round(40 - 14 * a) + ')';
}


// Headline exchange index (data/indices.js, refreshed daily from a source GitHub's runners
// can reach). One real number with the session date it is from; never padded or guessed.
function indexForCountry(countryId) {
  const d = window.ASJ_INDICES && window.ASJ_INDICES.indices;
  if (!d) return null;
  for (const k of Object.keys(d)) {
    const r = d[k];
    if (r && Array.isArray(r.countries) && r.countries.includes(countryId) && Number.isFinite(r.level) && r.level > 0) return r;
  }
  return null;
}
function formatMarketDate(iso) {
  const t = Date.parse(String(iso || '').slice(0, 10) + 'T12:00:00Z');
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' });
}
function marketAgeDays(iso) {
  const t = Date.parse(String(iso || '').slice(0, 10) + 'T12:00:00Z');
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : Infinity;
}
function renderIndexLine(countryId) {
  const r = indexForCountry(countryId);
  if (!r) return '';
  const stale = marketAgeDays(r.date) > 7;
  const pct = Number.isFinite(r.changePct) ? r.changePct : null;
  const cls = pct == null ? '' : pct > 0 ? ' is-up' : pct < 0 ? ' is-down' : '';
  return '<div class="cv-index-line' + (stale ? ' is-stale' : '') + '">' +
    '<span class="cv-index-name">' + escapeHtml(r.name) + '</span> ' +
    '<b class="cv-index-level">' + escapeHtml(r.level.toLocaleString('en-US', { maximumFractionDigits: 2 })) + '</b> ' +
    (pct == null ? '<span class="cv-index-chg">flat / n.a.</span>' : '<span class="cv-index-chg' + cls + '">' + (pct > 0 ? '+' : '') + pct.toFixed(2) + '%</span>') +
    '<span class="cv-index-asof">' + (stale ? 'Stale · ' : '') + 'as of ' + escapeHtml(formatMarketDate(r.date)) + ' · ' + escapeHtml(window.ASJ_INDICES.source || '') + '</span>' +
  '</div>';
}
// A ticker wider than its tile was cut to "STANDA..." or "NPFMCR..." (the Signals panel
// sets tile text to 13px). Shrink each one that overflows, a pixel at a time down to 9px,
// once the grid has a width - it can render while its panel is hidden - and again when
// the grid is resized.
const heatTickerObservers = new WeakMap();
function fitHeatTickers(wrap) {
  const grid = wrap?.querySelector('.cv-heat-grid');
  if (!grid) return;
  const fit = () => {
    if (!grid.clientWidth) return;
    grid.querySelectorAll('.cv-heat-tkr').forEach(el => {
      el.style.removeProperty('font-size');
      el.style.removeProperty('white-space');
      el.style.removeProperty('word-break');
      for (let size = 12; size >= 9 && el.scrollWidth > el.clientWidth + 1; size--) el.style.setProperty('font-size', size + 'px', 'important');
      // Still too long at 9px (NPFMCRFBK in a 47px tile): two lines beat a cut-off name.
      if (el.scrollWidth > el.clientWidth + 1) {
        el.style.setProperty('font-size', '10px', 'important');
        el.style.whiteSpace = 'normal';
        el.style.wordBreak = 'break-all';
      }
    });
  };
  fit();
  // Also refitted on the next frame whenever the panel or audience changes
  // (refitHeatTickers): a grid rendered while hidden was sometimes shown before the
  // observer fired, and the sweep still found STANDARD cut off.
  wrap.__fitTickers = fit;
  if (typeof ResizeObserver === 'undefined') return;
  heatTickerObservers.get(wrap)?.disconnect();
  const observer = new ResizeObserver(() => fit());
  observer.observe(grid);
  heatTickerObservers.set(wrap, observer);
}

// Now and on the next frame: a page in a background tab runs no animation frames and no
// resize observers, so a frame-only refit never happened there.
function refitHeatTickers() {
  const fit = () => document.getElementById('cv-heatmap')?.__fitTickers?.();
  fit();
  requestAnimationFrame(fit);
}

function renderInvestorMarkets(countryId) {
  const wrap = document.getElementById('cv-heatmap');
  const meta = document.getElementById('cv-heat-meta');
  if (!wrap) return;
  if (!MARKETS_FILE.data) {
    loadMarketsFile()?.then(() => {
      if (activeCountryMap?.countryId === countryId && document.body.dataset.audience === 'investors') renderInvestorMarkets(countryId);
    });
  }
  const profile = marketProfileForCountry(countryId);
  const m = marketsForCountry(countryId);
  if (!profile.exchange) {
    if (meta) meta.textContent = 'Capital market directory';
    wrap.innerHTML = renderIndexLine(countryId) + '<div class="cv-heat-empty"><b>N/A</b><br>No domestic securities exchange has been verified for this country. Review regional listings, private markets, and bank financing instead.</div>';
    return;
  }
  if (!m) {
    if (meta) meta.textContent = profile.exchange + ' · ' + profile.name;
    wrap.innerHTML = renderIndexLine(countryId) + '<div class="cv-heat-empty"><b>' + escapeHtml(profile.exchange) + '</b> · ' + escapeHtml(profile.scope) + ' market<br>' +
      'A current listed-company dataset is not available.' +
      (profile.url ? '<br><a href="' + escapeHtml(safeUrl(profile.url)) + '" target="_blank" rel="noopener noreferrer">Open ' + escapeHtml(profile.exchange) + ' official site ↗</a>' : '') +
      '</div>';
    return;
  }
  const isLive = !!m.isLive;
  if (meta) meta.textContent = profile.exchange + ' · ' + profile.name;
  // Old or no prices: say so in words. This drew a grid of grey ticker tiles that looked
  // like a market map and showed nothing, under "too old to show".
  if (!isLive) {
    const tickers = m.companies.map(c => c && c.t).filter(Boolean);
    wrap.innerHTML = renderIndexLine(countryId) + '<div class="cv-heat-empty"><b>' + escapeHtml(profile.exchange) + '</b> · ' +
      (m.asOf ? 'Prices last updated ' + escapeHtml(formatMarketDate(m.asOf)) + ', too long ago to show as today\'s.' : 'No current prices.') +
      (tickers.length ? '<br>Main listings: ' + tickers.map(escapeHtml).join(', ') + '.' : '') +
      (profile.url ? '<br><a href="' + escapeHtml(safeUrl(profile.url)) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(profile.exchange) + ' official site ↗</a>' : '') +
      '</div>';
    return;
  }
  // The 'cap' field is a SHARE PRICE (AFX publishes price, not market cap). Sizing tiles by
  // it made a KES 284 small-cap dwarf KCB and was captioned 'company size'. Tiles are sized
  // by the size of the day's move.
  const sorted = m.companies.slice().filter(c => c && c.t && Number.isFinite(Number(c.cap)) && Number(c.cap) > 0 && Math.abs(Number(c.change) || 0) <= MARKET_MOVE_CEILING)
    .sort((a, b) => isLive ? Math.abs(Number(b.change) || 0) - Math.abs(Number(a.change) || 0) : String(a.t).localeCompare(String(b.t)));
  const items = sorted.map((c, i) => {
    const issuer = issuerForCountry(countryId, c.t);
    return {
      value:isLive ? 1 + Math.abs(Number(c.change) || 0) : 1,
      t:c.t,
      name:c.name || issuer?.name || '',
      change:isLive ? Number(c.change) || 0 : 0,
      rank:i + 1,
      total:sorted.length
    };
  });
  const W = 1000, H = 560;
  const rects = squarifyTreemap(items, W, H);
  wrap.innerHTML = renderIndexLine(countryId) +
    '<div class="cv-heat-grid">' +
      rects.map(r => {
        const wp = (r.w / W * 100), hp = (r.h / H * 100);
        const big = (r.w / W > 0.16 && r.h / H > 0.18);
        const fs = Math.max(8, Math.min(20, Math.round(Math.min(r.w / W * 70, r.h / H * 52))));
        const sign = r.change > 0 ? '+' : '';
        const title = r.t + ' ' + sign + r.change + '%';
        return '<button class="cv-heat-tile" type="button" data-tkr="' + escapeHtml(r.t) + '" data-name="' + escapeHtml(r.name) + '" data-chg="' + r.change + '" data-rank="' + r.rank + '" data-total="' + r.total + '" style="left:' + (r.x / W * 100) + '%;top:' + (r.y / H * 100) + '%;width:' + wp + '%;height:' + hp + '%;background:' + (isLive ? heatColor(r.change) : 'rgb(28,66,42)') + '" title="' + escapeHtml(title) + '">' +
          '<span class="cv-heat-tkr" style="font-size:' + fs + 'px">' + escapeHtml(r.t) + '</span>' +
          (isLive && big ? '<span class="cv-heat-chg">' + sign + r.change.toFixed(1) + '%</span>' : '') +
        '</button>';
      }).join('') +
    '</div>' +
    '<div class="cv-heat-detail" id="cv-heat-detail" hidden></div>' +
    '<div class="cv-heat-key"><span class="cv-heat-note">' + 'Biggest movers, share-price change · ' + escapeHtml(formatMarketDate(m.asOf)) + '</span></div>';
  fitHeatTickers(wrap);
  wrap.onclick = (e) => {
    const tile = e.target.closest('.cv-heat-tile'); if (!tile) return;
    const detail = document.getElementById('cv-heat-detail'); if (!detail) return;
    const tkr = tile.dataset.tkr, name = tile.dataset.name, chg = Number(tile.dataset.chg);
    const sign = chg > 0 ? '+' : '';
    const cls = chg > 0.06 ? 'up' : chg < -0.06 ? 'down' : '';
    const issuer = issuerForCountry(countryId, tkr);
    const destination = issuer?.url || profile.url || '';
    const destinationLabel = issuer?.label || (profile.exchange ? 'Official exchange' : '');
    const destinationLink = destination
      ? ' · <a href="' + escapeHtml(safeUrl(destination)) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(destinationLabel) + ' ↗</a>'
      : '';
    detail.innerHTML =
      '<div class="cv-hd-main"><span class="cv-hd-tkr">' + escapeHtml(tkr) + '</span>' +
        (name ? '<span class="cv-hd-name">' + escapeHtml(name) + '</span>' : '') +
        (isLive ? '<span class="cv-hd-chg ' + cls + '">' + sign + chg.toFixed(1) + '%</span>' : '') + '</div>' +
      '<div class="cv-hd-meta">#' + tile.dataset.rank + ' of ' + tile.dataset.total + ' by size of move on ' + escapeHtml(profile.exchange) + ', ' + escapeHtml(formatMarketDate(m.asOf)) +
        destinationLink + '</div>';
    detail.hidden = false;
    wrap.querySelectorAll('.cv-heat-tile').forEach(t => t.classList.toggle('sel', t === tile));
  };
}

const CCY_NAME = {
  AOA:'Kwanza',BIF:'Burundian franc',BWP:'Pula',CDF:'Congolese franc',CVE:'Cabo Verde escudo',
  DJF:'Djiboutian franc',DZD:'Algerian dinar',EGP:'Egyptian pound',ERN:'Nakfa',ETB:'Birr',
  GHS:'Cedi',GMD:'Dalasi',GNF:'Guinean franc',KES:'Kenyan shilling',KMF:'Comorian franc',
  LRD:'Liberian dollar',LSL:'Loti',LYD:'Libyan dinar',MAD:'Moroccan dirham',MGA:'Ariary',
  MRU:'Ouguiya',MUR:'Mauritian rupee',MWK:'Kwacha',MZN:'Metical',NAD:'Namibian dollar',
  NGN:'Naira',RWF:'Rwandan franc',SCR:'Seychellois rupee',SDG:'Sudanese pound',SLE:'Leone',
  SOS:'Somali shilling',SSP:'South Sudanese pound',STN:'Dobra',SZL:'Lilangeni',TND:'Tunisian dinar',
  TZS:'Tanzanian shilling',UGX:'Ugandan shilling',XAF:'Central African CFA franc',
  XOF:'West African CFA franc',ZAR:'Rand',ZMW:'Kwacha',ZWG:'Zimbabwe Gold'
};

function renderDiasporaPanel(countryId, info) {
  const inv = investorForCountry(countryId, info);
  const ccy = inv.currency;
  const fxEl = document.getElementById('cv-dia-fx');
  const fxMeta = document.getElementById('cv-dia-fx-meta');
  const secEl = document.getElementById('cv-dia-sectors');
  if (!fxEl) return;
  const rates = window.__FX || {};
  const rate = rates[ccy];
  const rateStr = Number.isFinite(rate) ? formatFxRate(rate) : 'Unavailable';
  if (fxMeta) fxMeta.textContent = formatFxDate(window.__FX_AT) ? ('USD reference · ' + formatFxDate(window.__FX_AT)) : ccy;
  fxEl.innerHTML =
    '<div class="cv-dia-rate"><div class="cv-dia-rate-key">$1 USD buys</div>' +
      '<div class="cv-dia-rate-val">' + rateStr + ' <span>' + escapeHtml(ccy || '') + '</span></div>' +
      '<div class="cv-dia-rate-sub">' + escapeHtml(CCY_NAME[ccy] || 'local currency') + (Number.isFinite(rate) ? ' · reference rate, updated daily' : ' · rate unavailable') + '</div>' +
    '</div>' +
    (Number.isFinite(rate)
      ? '<div class="cv-dia-calc"><label for="cv-dia-amount">Sending</label><span>$</span><input id="cv-dia-amount" type="number" min="0" step="10" inputmode="decimal" aria-label="Amount in US dollars"><span aria-hidden="true">=</span><b id="cv-dia-converted">—</b></div>'
      : '') +
    '<div class="cv-dia-note">Compare licensed transfer services before you send — this reference rate is not a provider quote. <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates by Exchange Rate API</a>.</div>';
  const amountEl = document.getElementById('cv-dia-amount');
  if (amountEl) {
    const savedAmount = parseFloat(localStorage.getItem('asj:send-amount'));
    amountEl.value = Number.isFinite(savedAmount) && savedAmount >= 0 ? savedAmount : 200;
    const convertedEl = document.getElementById('cv-dia-converted');
    const updateConversion = () => {
      const amount = parseFloat(amountEl.value);
      if (Number.isFinite(amount) && amount >= 0) {
        convertedEl.textContent = new Intl.NumberFormat('en-US', { maximumFractionDigits: rate >= 20 ? 0 : 2 }).format(amount * rate) + ' ' + (ccy || '');
        try { localStorage.setItem('asj:send-amount', String(amount)); } catch {}
      } else {
        convertedEl.textContent = '—';
      }
    };
    amountEl.addEventListener('input', updateConversion);
    updateConversion();
  }
  // Remittances and connection, from the World Bank, where "Where Capital Goes" listed
  // four sector words.
  if (secEl) secEl.innerHTML = factGridHtml(countryId, 'diaspora');
}

function renderInvestorPanel(countryId, info) {
  const inv = investorForCountry(countryId, info);
  const econWrap = document.getElementById('cv-econ-wrap');
  const sectorsEl = document.getElementById('cv-sectors');
  const briefWrap = document.getElementById('cv-brief-wrap');
  const econMeta = document.getElementById('cv-econ-meta');
  renderInvestorMarkets(countryId);

  const summary = economySeriesSummary(inv);
  const gdpB = parseMoneyToBillions(inv.gdp);
  const fdiB = parseMoneyToBillions(inv.fdi);
  // Today's population over an old GDP is not GDP per person: Eritrea's 2011 figure over
  // 2025 people gave $568. Five years is as far apart as the two may be.
  const gdpYearShown = inv.gdpYear || economySeriesSummary(inv).latest.year;
  const perPersonOk = !!inv.gdp && (!gdpYearShown || gdpYearShown >= new Date().getUTCFullYear() - 5);
  const perResident = perPersonOk ? formatPerResident((gdpB * 1000000000) / Math.max(1, info?.pop || 1)) : '—';
  const fdiShare = gdpB && Number.isFinite(fdiB) ? (fdiB / gdpB) * 100 : NaN;
  const gdpYear = inv.gdpYear || summary.latest.year;
  const fdiAligned = !inv.fdiYear || !gdpYear || inv.fdiYear === gdpYear;
  const fdiMetric = !inv.fdi ? '—' : fdiAligned ? formatPct(fdiShare).replace('+', '') : inv.fdi;
  const fdiKey = fdiAligned ? 'Foreign investment' : 'FDI inflows';
  const fdiSub = !inv.fdi ? 'Not published' : fdiAligned ? 'Share of GDP' : 'World Bank ' + inv.fdiYear;
  const years = summary.hasTrend ? summary.first.year + '–' + summary.latest.year : (summary.latest.year || '');

  if (econMeta) {
    econMeta.textContent = 'Current US dollars' + (years ? ' · ' + years : '');
  }

  const trendClass = !Number.isFinite(summary.cagr) ? '' : summary.cagr >= 4 ? 'up' : summary.cagr >= 1 ? '' : 'down';
  econWrap.innerHTML =
    '<div class="cv-econ">' +
      '<div class="cv-econ-cell"><div class="cv-econ-key">GDP per person</div><div class="cv-econ-val">' + perResident + '</div><div class="cv-econ-sub">' + (perPersonOk ? (gdpYear ? gdpYear + ' GDP ÷ population' : 'GDP ÷ population') : inv.gdp ? 'GDP figure is from ' + gdpYear : 'Not published') + '</div></div>' +
      '<div class="cv-econ-cell"><div class="cv-econ-key">' + fdiKey + '</div><div class="cv-econ-val">' + fdiMetric + '</div><div class="cv-econ-sub">' + fdiSub + '</div></div>' +
      '<div class="cv-econ-cell"><div class="cv-econ-key">GDP change</div><div class="cv-econ-val ' + trendClass + '">' + (summary.hasTrend ? signedBillions(summary.delta) : '—') + '</div><div class="cv-econ-sub">' + (summary.hasTrend ? 'Since ' + summary.first.year : 'No series') + '</div></div>' +
      '<div class="cv-econ-cell"><div class="cv-econ-key">Source</div><div class="cv-econ-val">' + escapeHtml(inv.source || '—') + '</div><div class="cv-econ-sub">' + (inv.source ? 'Annual figures' : 'No published series') + '</div></div>' +
    '</div>' +
    renderGdpChart(inv, summary);
  bindGdpChart(econWrap);

  // Published indicators, not "Key Sectors" (each sector word mapped to the same three
  // stock phrases for every country) or an "Investor Checklist" of generic advice.
  if (sectorsEl) sectorsEl.innerHTML = factGridHtml(countryId, 'investors');
  if (briefWrap) briefWrap.innerHTML = '';
}

function renderGdpChart(inv, summary = economySeriesSummary(inv)) {
  const series = summary.series;
  const first = series[0] || {};
  const latest = series[series.length - 1] || first;
  const period = !first.year ? '' : latest.year > first.year ? first.year + '–' + latest.year : String(first.year);
  const coverage = summary.reportingGap && summary.hasTrend ? 'No figure published after ' + latest.year : '';
  const changeClass = Number.isFinite(summary.change) ? (summary.change >= 0 ? 'up' : 'down') : '';
  const head =
    '<div class="cv-gdp-chart-head">' +
      '<div class="cv-gdp-chart-title"><span>GDP, current US dollars</span><b>' + period + '</b>' + (coverage ? '<small>' + coverage + '</small>' : '') + '</div>' +
      '<div class="cv-gdp-chart-stat"><span>Latest</span><b>' + (Number.isFinite(latest.value) ? formatBillions(latest.value) : '—') + '</b></div>' +
      '<div class="cv-gdp-chart-stat"><span>Period change</span><b class="' + changeClass + '">' + formatPct(summary.change) + '</b></div>' +
    '</div>';

  if (!summary.hasTrend) {
    return '<div class="cv-gdp-chart" aria-label="GDP history unavailable">' + head +
      '<div class="cv-gdp-sparse"><div><b>No GDP series</b><span>' + (summary.observationCount === 1 ? 'The World Bank has one figure, for ' + latest.year + '.' : 'No GDP figures are published for this country.') + '</span></div></div>' +
    '</div>';
  }

  const observedMax = Math.max(...series.map(point => point.value));
  const observedMin = Math.min(...series.map(point => point.value));
  // Gridlines on round figures ($40B, $80B, $120B), not the padded range's min, middle and
  // max ($34B, $91B, $148B).
  const yTicks = gdpTicks(observedMin, observedMax);
  const min = yTicks[0];
  const max = yTicks[yTicks.length - 1];
  const range = Math.max(1e-9, max - min);
  const tickStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : 1;
  const x0 = 76, x1 = 974, yTop = 20, yBottom = 214;
  const yearRange = Math.max(1, latest.year - first.year);
  const xTickPoints = series.length <= 6
    ? series
    : [series[0], series[Math.round((series.length - 1) / 3)], series[Math.round((series.length - 1) * 2 / 3)], series[series.length - 1]]
        .filter((point, index, arr) => arr.findIndex(item => item.year === point.year) === index);
  const points = series.map((point, i) => {
    const x = x0 + ((point.year - first.year) / yearRange) * (x1 - x0);
    const y = yBottom - ((point.value - min) / range) * (yBottom - yTop);
    return { ...point, x, y };
  });
  const line = points.map(point => point.x.toFixed(1) + ',' + point.y.toFixed(1)).join(' ');
  const area = x0 + ',' + yBottom + ' ' + line + ' ' + x1 + ',' + yBottom;
  // Axis labels, dots and the hover readout live in HTML over the chart: the SVG stretches
  // (preserveAspectRatio none), which squashed its own text to ~7px and its dots to ovals.
  const axisLabels =
    yTicks.map(value => {
      const y = yBottom - ((value - min) / range) * (yBottom - yTop);
      return '<span class="cv-gdp-ylab" aria-hidden="true" style="top:' + (y / 250 * 100).toFixed(2) + '%">' + formatGdpTick(value, tickStep) + '</span>';
    }).join('') +
    xTickPoints.map(tick => {
      const point = points.find(item => item.year === tick.year);
      return '<span class="cv-gdp-xlab" aria-hidden="true" style="left:' + (point.x / 10).toFixed(2) + '%">' + point.year + '</span>';
    }).join('');
  const pointData = JSON.stringify(points.map(point => [point.year, point.value, +point.x.toFixed(1), +point.y.toFixed(1)]));
  return '<div class="cv-gdp-chart" aria-label="GDP history">' + head +
    '<div class="cv-gdp-plot" tabindex="0" data-points="' + pointData + '" aria-label="GDP by year. Hover, drag, or use the arrow keys to read each year.">' + axisLabels +
    '<svg viewBox="0 0 1000 250" preserveAspectRatio="none" role="img" aria-label="GDP trend from ' + first.year + ' to ' + latest.year + '">' +
      '<defs><linearGradient id="cv-gdp-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#66bb6a" stop-opacity=".30"></stop><stop offset="1" stop-color="#66bb6a" stop-opacity="0"></stop></linearGradient></defs>' +
      yTicks.map(value => {
        const y = yBottom - ((value - min) / range) * (yBottom - yTop);
        return '' +
          '<line class="cv-gdp-grid" x1="' + x0 + '" y1="' + y.toFixed(1) + '" x2="' + x1 + '" y2="' + y.toFixed(1) + '"></line>';
      }).join('') +
      xTickPoints.map(tick => {
        const point = points.find(item => item.year === tick.year);
        return '<line class="cv-gdp-grid cv-gdp-grid-x" x1="' + point.x.toFixed(1) + '" y1="' + yTop + '" x2="' + point.x.toFixed(1) + '" y2="' + yBottom + '"></line>' +
          '';
      }).join('') +
      '<line class="cv-gdp-axis" x1="' + x0 + '" y1="' + yBottom + '" x2="' + x1 + '" y2="' + yBottom + '"></line>' +
      '<polygon class="cv-gdp-area" points="' + area + '"></polygon>' +
      '<polyline class="cv-gdp-line" points="' + line + '"></polyline>' +
    '</svg>' +
    points.map((point, i) =>
      '<span class="cv-gdp-pt' + (i === points.length - 1 ? ' latest' : '') + '" aria-hidden="true" style="left:' + (point.x / 10).toFixed(2) + '%;top:' + (point.y / 250 * 100).toFixed(2) + '%"></span>'
    ).join('') +
    '<span class="cv-gdp-guide" aria-hidden="true" hidden style="top:' + (yTop / 2.5).toFixed(2) + '%;height:' + ((yBottom - yTop) / 2.5).toFixed(2) + '%"></span>' +
    '<span class="cv-gdp-mark" aria-hidden="true" hidden></span>' +
    '<div class="cv-gdp-read" aria-live="polite" hidden></div>' +
    '</div>' +
  '</div>';
}

// Round gridline values spanning lo..hi: the step of 1, 2, 2.5 or 5 x 10^n that covers
// the data in 3-5 intervals with the least empty band (Nigeria's $252-668B is
// $200-700B, not $200-800B).
function gdpTicks(lo, hi) {
  if (!(hi > lo)) hi = lo + Math.max(0.1, Math.abs(lo) * 0.1);
  const mag = Math.pow(10, Math.floor(Math.log10(hi - lo)));
  let best = null;
  for (const m of [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5]) {
    const step = m * mag;
    const start = Math.floor(lo / step + 1e-9), end = Math.ceil(hi / step - 1e-9);
    const n = end - start;
    if (n < 3 || n > 5) continue;
    const waste = n * step - (hi - lo);
    if (!best || waste < best.waste - 1e-9) best = { step, start, n, waste };
  }
  if (!best) { const step = (hi - lo) / 4; return [0, 1, 2, 3, 4].map(i => lo + i * step); }
  return Array.from({ length: best.n + 1 }, (_, i) => +((best.start + i) * best.step).toPrecision(12));
}

// A tick label with as many decimals as its step needs: $0.45B, not two "$0.5B" lines.
function formatGdpTick(value, step) {
  const trillions = value >= 1000;
  const v = trillions ? value / 1000 : value;
  const s = trillions ? step / 1000 : step;
  const decimals = Math.min(2, (String(+s.toPrecision(6)).split('.')[1] || '').length);
  return '$' + v.toFixed(decimals) + (trillions ? 'T' : 'B');
}

// The hover readout: one more significant figure than the axis ($82.4B).
function formatGdpReadout(value) {
  if (value >= 1000) return '$' + (value / 1000).toFixed(2) + 'T';
  if (value >= 100) return '$' + Math.round(value) + 'B';
  return '$' + value.toFixed(value >= 1 ? 1 : 2) + 'B';
}

// Hover, drag or arrow keys anywhere on the plot pick the nearest year: a guide line, a
// marker and a readout with the year, the figure and the change on the year before.
function bindGdpChart(root) {
  const plot = root && root.querySelector('.cv-gdp-plot');
  if (!plot) return;
  let points;
  try { points = JSON.parse(plot.dataset.points || '[]'); } catch { points = []; }
  if (!points.length) return;
  const guide = plot.querySelector('.cv-gdp-guide');
  const mark = plot.querySelector('.cv-gdp-mark');
  const read = plot.querySelector('.cv-gdp-read');
  let active = -1;
  let touchHeld = false;
  const show = index => {
    active = Math.max(0, Math.min(points.length - 1, index));
    const [year, value, x, y] = points[active];
    const prev = points[active - 1];
    const change = prev && prev[1] ? (value - prev[1]) / prev[1] * 100 : NaN;
    read.innerHTML = '<span>' + year + '</span><b>' + formatGdpReadout(value) + '</b>' +
      (prev ? '<span class="' + (change >= 0 ? 'up' : 'down') + '">' + formatPct(change) + ' on ' + prev[0] + '</span>' : '<span>First year shown</span>');
    guide.style.left = mark.style.left = (x / 10) + '%';
    mark.style.top = (y / 2.5) + '%';
    guide.hidden = mark.hidden = read.hidden = false;
    const w = plot.clientWidth, h = plot.clientHeight;
    const px = x / 1000 * w, py = y / 250 * h;
    // Beside the guide, not over the point: right of it in the left half, left of it in
    // the right half; level with the point, reaching up from a low one, down from a high one.
    const cw = read.offsetWidth, ch = read.offsetHeight;
    const left = px > w * 0.55 ? px - cw - 16 : px + 16;
    read.style.left = Math.max(0, Math.min(w - cw, left)) + 'px';
    read.style.top = Math.max(0, Math.min(h - ch, py >= h / 2 ? py - ch + 8 : py - 8)) + 'px';
  };
  const hide = () => { active = -1; guide.hidden = mark.hidden = read.hidden = true; };
  const nearest = clientX => {
    const rect = plot.getBoundingClientRect();
    const ux = (clientX - rect.left) / Math.max(1, rect.width) * 1000;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(p[2] - ux) < Math.abs(points[best][2] - ux)) best = i; });
    return best;
  };
  plot.addEventListener('pointerdown', event => { touchHeld = event.pointerType !== 'mouse'; show(nearest(event.clientX)); });
  plot.addEventListener('pointermove', event => show(nearest(event.clientX)));
  // A finger lifting "leaves" the plot; on touch the readout stays until a tap elsewhere.
  plot.addEventListener('pointerleave', () => { if (!touchHeld) hide(); });
  document.addEventListener('pointerdown', event => { if (touchHeld && !plot.contains(event.target)) { touchHeld = false; hide(); } });
  plot.addEventListener('focus', () => show(active >= 0 ? active : points.length - 1));
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', event => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (step) { event.preventDefault(); show((active >= 0 ? active : points.length - 1) + step); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); show(event.key === 'Home' ? 0 : points.length - 1); }
    else if (event.key === 'Escape') hide();
  });
}

function formatBillions(value) {
  if (!Number.isFinite(value)) return '$0B';
  if (value >= 1000) return '$' + (value / 1000).toFixed(value >= 10000 ? 0 : 1) + 'T';
  if (value >= 10) return '$' + Math.round(value) + 'B';
  return '$' + value.toFixed(1) + 'B';
}

async function loadGdpHistory(countryId, info) {
  if (GDP_SERIES_CACHE[countryId] || GDP_SERIES_PENDING[countryId]) return;
  // The pipeline ships the World Bank series (to 2025 for most countries). This fetch
  // asks for 2011-2024 and, when it landed, replaced it: Kenya's chart ended at 2024 under
  // a 2025 GDP figure. Only fetch for a country the pipeline has no series for.
  if ((WORLD_BANK_ECONOMY[countryId]?.gdpSeries || []).length >= 2) return;
  const iso = (info?.cc || countryId || '').toLowerCase();
  if (!/^[a-z]{2}$/.test(iso)) return;
  GDP_SERIES_PENDING[countryId] = true;
  try {
    const url = 'https://api.worldbank.org/v2/country/' + encodeURIComponent(iso) + '/indicator/NY.GDP.MKTP.CD?format=json&per_page=30&date=2011:2024';
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error('GDP response ' + response.status);
    const payload = await response.json();
    const records = Array.isArray(payload?.[1]) ? payload[1] : [];
    const series = records
      .filter(row => row && row.value != null && row.date)
      .map(row => ({ year: Number(row.date), value: Number(row.value) / 1000000000 }))
      .filter(row => Number.isFinite(row.year) && Number.isFinite(row.value))
      .sort((a, b) => a.year - b.year);
    if (series.length >= 2) {
      GDP_SERIES_CACHE[countryId] = series;
      if (activeCountryMap?.countryId === countryId && document.body.dataset.audience === 'investors') {
        renderInvestorPanel(countryId, info);
        renderInvestorKpis(countryId, info);
      }
    }
  } catch (err) {
    console.debug('GDP series unavailable for', countryId, err);
  } finally {
    delete GDP_SERIES_PENDING[countryId];
  }
}

function parseMoneyToBillions(value) {
  // A missing figure is NaN, not $10B.
  const text = String(value || '').replace(/[$,]/g, '').trim();
  const amount = parseFloat(text);
  if (!Number.isFinite(amount)) return NaN;
  if (/T/i.test(text)) return amount * 1000;
  if (/M/i.test(text)) return amount / 1000;
  return amount;
}

canvas.addEventListener('click', (e) => {
  if (!assemblyDone) return;
  const [x, y] = eventToLocal(e);
  const idx = hitTest(x, y);
  if (idx < 0) return;
  // A tap leaves no mouseleave behind it, so the name tag and the highlight a touch
  // raised would still be on the map when the reader comes back.
  pendingPointerEvent = null;
  tooltip.classList.remove('show');
  if (hoveredIdx !== -1) { hoveredIdx = -1; render(3.5); }
  openCountry(paths[idx].id, canvas);
});
// No touchstart handler. It used to open the country the moment a finger landed and
// cancelled the touch, so a finger meant to scroll or pinch opened a country. A tap
// still arrives as a click.

/* ── The Wire: continental topic + search axis ───────────────────────── */
(function(){
  const TOPICS = ['All','Politics','Business','Sport','Tech','Climate','Agriculture','Culture','Health','Education','News'];
  const view = document.getElementById('wire-view');
  const entries = Array.from(document.querySelectorAll('#wire-entry,[data-wire-entry]'));
  const entry = entries[0] || null;
  const entryCounts = Array.from(document.querySelectorAll('.wire-entry-count'));
  const closeBtn = document.getElementById('wire-close');
  const searchInput = document.getElementById('wire-search-input');
  const topicSelect = document.getElementById('wire-topic-select');
  const lensSelect = document.getElementById('wire-lens-select');
  const editionPick = document.getElementById('wire-edition-pick');
  const resultsEl = document.getElementById('wire-results');
  const trustEl = document.getElementById('wire-trust');
  const resultCountEl = document.getElementById('wire-result-count');
  const mobileActionsToggle = document.getElementById('wire-mobile-actions-toggle');
  const actionsEl = document.getElementById('wire-actions');
  const copyBtn = document.getElementById('wire-copy');
  const shareBtn = document.getElementById('wire-share');
  const compareToggle = document.getElementById('wire-compare-toggle');
  const compareBody = document.getElementById('wire-compare-body');
  const compareSummary = document.getElementById('wire-compare-summary');
  const comparePanel = document.getElementById('wire-compare-panel');
  const compareSelects = ['wire-compare-a','wire-compare-b','wire-compare-c'].map(id => document.getElementById(id)).filter(Boolean);
  if (!view || !entries.length) return;
  let activeTopic = 'All', query = '', wireLastFocus = null, INDEX = [], previousSnapshot = null, compareOpen = false, mobileActionsOpen = false;
  let visibleCount = 60;
  let editionDate = null, editionBriefs = null;
  const editionCache = {};

  function buildIndex(){
    const out = [];
    const briefsByCountry = editionBriefs || AI_BRIEFS || {};
    const at = editionDate || (AI_BRIEFS_AT ? String(AI_BRIEFS_AT).slice(0,10) : '');
    for (const code of Object.keys(briefsByCountry)){
      const info = COUNTRY_INFO[code]; if (!info) continue;
      (briefsByCountry[code] || []).forEach((b, rank) => {
        const src = (Array.isArray(b.sources) && b.sources[0]) || {};
        const sources = Array.isArray(b.sources) ? b.sources.filter(s => s && (s.name || s.url)) : [];
        const lensData = storyLensData(b, activeStoryLens);
        const why = lensData.why;
        const date = b.published || AI_BRIEFS_DATES[code] || at;
        const editorialScore = Number(b.selectionScore ?? b.editorialScore ?? 0) || 0;
        const score = storyLensRank(b, activeStoryLens, rank);
        const storyKey = registerStory(b, { countryCode: code, country: info.name, published: date, rank });
        out.push({
          code,
          country: info.name,
          cc: info.cc,
          title: b.headline || '',
          summary: b.dek || storyParagraphs(b)[0] || '',
          why,
          source: src.name || '',
          sources,
          url: src.url || '',
          date,
          type: b.topic || 'News',
          rank,
          score,
          editorialScore,
          lensScore:lensData.score,
          storyKey,
          // Folded once here so search is a substring test, not a rebuild per keystroke.
          haystack: storySearchHaystack(b, { country: info.name }),
          story: b
        });
      });
    }
    // A country whose desk has not filed for a while keeps its last stories, and they
    // keep their old selection scores - so a six-week-old Ethiopia story could lead the
    // Wire. Anything over a week older than the edition goes below everything current;
    // it stays readable, dated, and in the country's own column.
    // Same calendar-day rule as the age label, so a row dated rather than "N days ago" is
    // exactly a row that has been moved down.
    const reference = editionDate ? Date.parse(editionDate + 'T12:00:00') : Date.now();
    out.forEach(item => { item.stale = calendarDaysBefore(item.date, reference) >= 7; });
    // The assignment meter remains the strongest component. A selected reader lens adds
    // audience fit and freshness without changing the canonical story or its source rank.
    out.sort((a, b) => (a.stale - b.stale) || b.score - a.score || a.rank - b.rank || a.country.localeCompare(b.country));
    return out;
  }
  function topicCounts(){
    const c = {}; TOPICS.forEach(t=>c[t]=0); c['All']=INDEX.length;
    INDEX.forEach(it=>{ if (c[it.type]!==undefined) c[it.type]++; });
    return c;
  }
  function renderTopics(){
    if (!topicSelect) return;
    const c = topicCounts();
    // Counts stay in the labels: "Agriculture (6)" tells a reader what is in today's
    // paper before they choose, which the old pills did and a bare dropdown would not.
    topicSelect.innerHTML = TOPICS.filter(t => t === 'All' || c[t] > 0).map(t =>
      // "All topics" carries no count: the line under the filters already says how many
      // stories there are, and on a phone the count pushed the label out of its box.
      '<option value="' + t + '">' + (t === 'All' ? 'All topics' : (t === 'News' ? 'Other' : t) + ' (' + c[t] + ')') + '</option>'
    ).join('');
    topicSelect.value = TOPICS.includes(activeTopic) && (activeTopic === 'All' || c[activeTopic] > 0) ? activeTopic : 'All';
  }
  // The relevance floor a lens has to clear before it may claim a story.
  //
  // The desk scores every story 0-100 for each audience, and the prompt defines the
  // bands: 0-20 no direct connection, 21-40 reader interest only, 41-60 a supported
  // indirect effect, 61-80 a direct practical or financial effect, 81-100 central.
  // The lens was only ever a SORT, so all 235 stories appeared under every tab and a
  // reader who picked Farmer got the whole paper reordered - agriculture for the first
  // few, then business and politics scored 20 for farmers, presented as farming news.
  // Measured on the 6 September edition: 145 of 235 stories cleared 61 for investors,
  // 34 for farmers, 31 for diaspora. One lens discriminated; two padded.
  //
  // 41 is the lowest band the desk itself calls a real connection, so it is the lowest
  // number this tab can honestly show.
  const LENS_RELEVANCE_FLOOR = 41;

  function lensQualifies(it){
    if (activeStoryLens === 'general') return true;
    return storyLensData(it.story, activeStoryLens).score >= LENS_RELEVANCE_FLOOR;
  }

  function filtered(){
    const q = foldForSearch(query);
    const lensAll = activeStoryLens === 'general';
    if (activeTopic === 'All' && !q && lensAll) return INDEX;
    return INDEX.filter(it=>{
      if (activeTopic!=='All' && it.type!==activeTopic) return false;
      if (!lensAll && !lensQualifies(it)) return false;
      if (!q) return true;
      // haystack is folded once when the index is built, not rebuilt on every keystroke
      // across 250 stories.
      return it.haystack.includes(q);
    });
  }
  function wireSnapshot(items){
    const topByCountry = {};
    items.forEach(item => {
      if (!topByCountry[item.code] || item.rank < topByCountry[item.code].rank) {
        topByCountry[item.code] = { title: item.title, type: item.type, rank: item.rank };
      }
    });
    return {
      at: AI_BRIEFS_AT || new Date().toISOString(),
      keys: items.map(item => item.code + ':' + item.rank + ':' + item.title).sort(),
      topics: [...new Set(items.map(item => item.type).filter(Boolean))].sort(),
      topByCountry
    };
  }
  function readWireSnapshot(){
    try { return JSON.parse(localStorage.getItem('asj-wire-snapshot') || 'null'); } catch { return null; }
  }
  function saveWireSnapshot(items){
    try { localStorage.setItem('asj-wire-snapshot', JSON.stringify(wireSnapshot(items))); } catch {}
  }
  function movementMarkup(items){
    const current = wireSnapshot(INDEX);
    let changed = 0, newTopics = 0, newStories = 0;
    if (previousSnapshot) {
      const oldKeys = new Set(previousSnapshot.keys || []);
      const oldTopics = new Set(previousSnapshot.topics || []);
      newStories = current.keys.filter(key => !oldKeys.has(key)).length;
      newTopics = current.topics.filter(topic => !oldTopics.has(topic)).length;
      changed = Object.keys(current.topByCountry || {}).filter(code => {
        const prev = previousSnapshot.topByCountry && previousSnapshot.topByCountry[code];
        return prev && prev.title !== current.topByCountry[code].title;
      }).length;
    }
    if (!previousSnapshot || (!changed && !newStories && !newTopics)) return '';
    // One line for a returning reader. This was a boxed panel with a heading, an
    // explanatory paragraph and a three-cell grid - "New story fingerprints" among the
    // labels - sitting between the lead and the list.
    const bits = [];
    if (newStories) bits.push(newStories + (newStories === 1 ? ' new story' : ' new stories'));
    if (changed) bits.push(changed + (changed === 1 ? ' country has a new lead' : ' countries have a new lead'));
    if (newTopics) bits.push(newTopics + (newTopics === 1 ? ' new topic' : ' new topics'));
    return '<p class="wire-movement-line">Since you last looked: ' + escapeHtml(bits.join(', ')) + '.</p>';
  }
  // One plain sentence where there used to be three things saying overlapping things:
  // a stats row in 10px uppercase, a separate result count, and an amber box under a
  // lens. The sentence changes with what the reader is doing, so it is always the
  // answer to "what am I looking at".
  //
  // Outlets are counted by NAME. Since the edition ships in two halves, a story's
  // sources carry names in the index and URLs only once the prose lands - counting
  // url-or-name made "115 sources" jump to ~289 a second after the page opened, because
  // it was suddenly counting articles rather than newsrooms.
  function editionStats(){
    const countries = new Set(INDEX.map(item => item.code)).size;
    const outlets = new Set();
    INDEX.forEach(item => (item.sources?.length ? item.sources : [{ name: item.source }]).forEach(source => {
      const name = String(source?.name || '').trim().toLowerCase();
      if (name) outlets.add(name);
    }));
    return { stories: INDEX.length, countries, outlets: outlets.size };
  }
  function renderTrust(){ /* folded into updateResultCount, which every render calls */ }
  function updateResultCount(items) {
    if (resultCountEl) { resultCountEl.hidden = true; resultCountEl.textContent = ''; }
    if (!trustEl) return;
    if (!INDEX.length) { trustEl.textContent = 'No edition has been published yet.'; return; }
    const s = editionStats();
    const q = query.trim();
    const n = items.length;
    const noun = n === 1 ? 'story' : 'stories';
    const lens = activeStoryLens !== 'general' ? STORY_LENS_LABELS[activeStoryLens].toLowerCase() : '';
    const lensWho = { farmers:'farmers', investors:'investors', diaspora:'the diaspora' }[activeStoryLens] || lens;
    let text;
    if (q) {
      text = n + ' ' + noun + ' matching \u201c' + q + '\u201d' + (activeTopic !== 'All' ? ' in ' + activeTopic : '');
    } else if (lens) {
      text = n + ' of ' + s.stories + ' stories have a direct effect on ' + lensWho +
        (activeTopic !== 'All' ? ' in ' + activeTopic : '') + ' today';
    } else if (activeTopic !== 'All') {
      text = n + ' ' + noun + ' in ' + activeTopic;
    } else {
      text = s.stories + ' stories from ' + s.outlets + ' outlets across ' + s.countries + ' countries';
    }
    trustEl.textContent = text;
  }
  function storyLine(item, index){
    return (index + 1) + '. ' + item.country + ' - ' + item.title + '\n' +
      (item.why ? '   Why it matters: ' + item.why + '\n' : '') +
      (item.source ? '   Source: ' + item.source + '\n' : '');
  }
  function dailyBriefText(items){
    const date = latestBriefDate() || new Date().toISOString().slice(0, 10);
    return ['The African Street Journal - today\'s headlines', date, '']
      .concat(items.slice(0, 12).map(storyLine))
      .join('\n')
      .trim();
  }
  function countryOptions(){
    return Object.entries(COUNTRY_INFO)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([code, info]) => '<option value="' + code + '">' + escapeHtml(info.name) + '</option>')
      .join('');
  }
  function populateCompare(){
    if (!compareSelects.length) return;
    const defaults = ['ng','ke','za'];
    const options = countryOptions();
    compareSelects.forEach((select, index) => {
      if (!select.options.length) select.innerHTML = options;
      select.value = defaults[index] || Object.keys(COUNTRY_INFO)[index] || '';
    });
    renderCompare();
    setCompareOpen(false);
  }
  function compareNames(){
    return compareSelects.map(select => COUNTRY_INFO[select.value]?.name).filter(Boolean);
  }
  function updateCompareSummary(){
    if (!compareSummary) return;
    const names = compareNames();
    compareSummary.textContent = compareOpen && names.length ? names.slice(0, 3).join(' / ') : '';
  }
  function setMobileActionsOpen(open){
    mobileActionsOpen = !!open;
    actionsEl?.classList.toggle('mobile-open', mobileActionsOpen);
    mobileActionsToggle?.setAttribute('aria-expanded', String(mobileActionsOpen));
  }
  function setCompareOpen(open){
    compareOpen = !!open;
    if (compareBody) compareBody.hidden = !compareOpen;
    if (compareToggle) compareToggle.setAttribute('aria-expanded', String(compareOpen));
    updateCompareSummary();
  }
  function renderCompare(){
    if (!comparePanel || !compareSelects.length) return;
    const seen = new Set();
    const codes = compareSelects.map(select => select.value).filter(code => {
      if (!code || seen.has(code)) return false;
      seen.add(code);
      return true;
    });
    const countries = codes.map(code => {
      const info = COUNTRY_INFO[code] || {};
      const inv = investorForCountry(code, info);
      const top = (AI_BRIEFS[code] || []).find(brief => brief && brief.headline) || {};
      return {
        code,
        name: info.name || code.toUpperCase(),
        gdp: inv.gdp || '—',
        growth: Number.isFinite(inv.gdp_growth) ? formatPct(inv.gdp_growth) : '—',
        currency: inv.currency || '—',
        sources: uniqueSourceCount(AI_BRIEFS[code] || []),
        story: top.headline || 'No current story'
      };
    });
    const row = (label, key, className = 'metric') =>
      '<tr><th scope="row">' + label + '</th>' +
        countries.map(country => '<td class="' + className + '">' + escapeHtml(String(country[key])) + '</td>').join('') +
      '</tr>';
    comparePanel.innerHTML =
      '<div class="wire-compare-table-wrap"><table class="wire-compare-table">' +
        '<thead><tr><th scope="col">Metric</th>' +
          countries.map(country => '<th scope="col">' + escapeHtml(country.name) + '</th>').join('') +
        '</tr></thead>' +
        '<tbody>' +
          row('GDP', 'gdp') +
          row('Growth', 'growth') +
          row('Currency', 'currency', '') +
          row('Sources', 'sources', '') +
          row('Top story', 'story', 'story') +
          '<tr><th scope="row">Country file</th>' +
            countries.map(country => '<td><button class="wire-compare-open" type="button" data-open-country="' + country.code + '">Open ' + escapeHtml(country.name) + '</button></td>').join('') +
          '</tr>' +
        '</tbody>' +
      '</table></div>';
    updateCompareSummary();
  }
  // The flag beside each story. In data-saver mode (window.ASJ_SAVE_DATA) the Wire would
  // fetch up to 55 flag images; the country code in text costs nothing and the country
  // name is written out beside it anyway.
  function wireFlagMarkup(cc){
    if (window.ASJ_SAVE_DATA) return '<span class="wire-item-flag wire-item-code" aria-hidden="true">' + escapeHtml(String(cc || '').toUpperCase()) + '</span>';
    return '<img class="wire-item-flag" src="https://flagcdn.com/w80/' + cc + '.png" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">';
  }
  // A story in the list. Country first: on a 55-country paper that is what a reader
  // scans for, and the old kicker led with the topic, so "News" and "Politics" were the
  // first word of most lines. The outlet moves under the headline with the time, where
  // it reads as attribution instead of a third tag.
  function itemMarkup(it){
    const when = relativeDateLabel(it.date);
    const meta = [it.source, when].filter(Boolean).map(escapeHtml).join(' \u00b7 ');
    return '<button class="wire-item' + (isStoryReadKey(it.storyKey) ? ' is-read' : '') + '" type="button" data-story-key="'+escapeHtml(it.storyKey)+'">' +
      wireFlagMarkup(it.cc) +
      '<div class="wire-item-body">' +
        '<div class="wire-item-kicker">' +
          '<span class="wire-item-country">'+escapeHtml(it.country)+'</span>' + topicKicker(it.type) +
        '</div>' +
        '<div class="wire-item-title">'+escapeHtml(it.title)+'</div>' +
        (it.summary?'<div class="wire-item-sum">'+escapeHtml(it.summary)+'</div>':'') +
        (meta ? '<div class="wire-item-meta">' + meta + '</div>' : '') +
      '</div>' +
    '</button>';
  }
  function heroMarkup(it){
    const lensLead = activeStoryLens === 'general' ? 'Lead story' : 'Top for ' + ({ farmers:'farmers', investors:'investors', diaspora:'the diaspora' }[activeStoryLens] || 'you');
    const when = relativeDateLabel(it.date);
    const meta = [it.source, when].filter(Boolean).map(escapeHtml).join(' \u00b7 ');
    return '<button class="wire-hero' + (isStoryReadKey(it.storyKey) ? ' is-read' : '') + '" type="button" data-story-key="'+escapeHtml(it.storyKey)+'">' +
      '<div class="wire-hero-kicker"><span class="wire-hero-lead">' + escapeHtml(lensLead) + '</span><span class="dot"></span>' +
        wireFlagMarkup(it.cc) +
        '<span class="wire-item-country">'+escapeHtml(it.country)+'</span>' + topicKicker(it.type) + '</div>' +
      '<div class="wire-hero-title">'+escapeHtml(it.title)+'</div>' +
      (it.summary?'<div class="wire-hero-sum">'+escapeHtml(it.summary)+'</div>':'') +
      (meta ? '<div class="wire-item-meta">' + meta + '</div>' : '') +
    '</button>';
  }
  function loadMoreMarkup(total, shown){
    if (shown >= total) return '';
    return '<div class="wire-load-wrap"><button class="wire-load-more" type="button" data-wire-load-more>Load more <span>' +
      Math.min(60, total - shown) + '</span></button></div>';
  }
  function renderResults(){
    if (!INDEX.length){ activeWireStoryKeys = []; updateResultCount([]); resultsEl.innerHTML = '<div class="wire-empty">No edition has been published yet.</div>'; return; }
    const items = filtered();
    activeWireStoryKeys = items.map(item => item.storyKey);
    updateResultCount(items);
    if (!items.length){
      // Say which of the two it is. "No headlines match your search" over an empty
      // Farmer tab reads as a broken filter; the truth is that the desk filed nothing
      // for farmers today, and a reader is owed that rather than left guessing.
      const lensName = STORY_LENS_LABELS[activeStoryLens];
      const emptyCopy = (activeStoryLens !== 'general' && !query.trim())
        ? 'Nothing in today\'s edition has a direct effect on ' + escapeHtml(lensName.toLowerCase()) +
          ' readers' + (activeTopic !== 'All' ? ' under ' + escapeHtml(activeTopic) : '') +
          '. Choose All readers for the full edition.'
        : 'No headlines match your search.';
      resultsEl.innerHTML = '<div class="wire-empty">' + emptyCopy + '</div>';
      return;
    }
    const frontPage = (activeTopic==='All' && !query.trim());
    // The lead slot goes to the best story the desk filed FOR THIS EDITION. Sorting by
    // score alone once put a 21 August brief at the top of the 28 August paper, which is
    // the one thing a daily cannot do. If every story is old - a desk that has not run -
    // the best of them still leads, because a front page with nothing on it is worse.
    const hero = frontPage ? (items.find(it => !isBeforeEdition(it.date)) || items[0]) : null;
    // Remove the hero by identity, not by position: it is no longer guaranteed to be
    // items[0], and slicing blindly would both duplicate it and drop the story it skipped.
    const list = hero ? items.filter(it => it !== hero) : items;
    const visible = list.slice(0, visibleCount);
    // A lead, then one list. There used to be a lead, a three-column "Highlights" grid of
    // six, a "What changed" box and THEN the list - four layouts to read through before
    // the paper settled into one. The six best stories are simply the top of the list.
    resultsEl.innerHTML =
      (hero ? heroMarkup(hero) : '') +
      (frontPage ? movementMarkup(items) : '') +
      '<div class="wire-list">' + visible.map(itemMarkup).join('') + '</div>' +
      loadMoreMarkup(list.length, visible.length) +
      // Mount point for the sign-up, after the reader has had the front page.
      (frontPage ? '<div id="wire-signup"></div>' : '');
  }
  function openWire(topic){
    editionDate = null; editionBriefs = null; populateEditions();
    INDEX = buildIndex(); activeTopic = topic||'All'; query=''; visibleCount = 60; searchInput.value='';
    const dateEl = document.getElementById('wire-date');
    const briefDate = latestBriefDate();
    if (dateEl) dateEl.textContent = briefDate ? 'Updated ' + formatShortDate(briefDate + 'T00:00:00Z') : 'Edition pending';
    wireLastFocus = document.activeElement;
    previousSnapshot = readWireSnapshot();
    setMobileActionsOpen(false);
    updateStoryLensControls(); renderTopics(); renderTrust(); populateCompare(); renderResults();
    resultsEl.scrollTop = 0;
    if (!editionDate) saveWireSnapshot(INDEX);
    view.classList.add('open'); document.body.style.overflow='hidden';
    updateOverlayAccessibility();
    syncRoute();
    setTimeout(() => {
      if (window.matchMedia('(max-width:720px)').matches) closeBtn.focus();
      else searchInput.focus();
    }, 60);
  }
  function closeWire(){
    // The wire is closing under the reader, so drop our history entry with it rather
    // than leaving a Back that reopens a story over a page the reader has left.
    if (storyReader?.classList.contains('open')) requestCloseStoryReader();
    view.classList.remove('open');
    if (!document.getElementById('country-view').classList.contains('open')) document.body.style.overflow='';
    updateOverlayAccessibility();
    if (wireLastFocus && wireLastFocus.focus) wireLastFocus.focus();
    if (isTouchLikePointer()) resumeCityTicker();
    syncRoute();
  }
  window.__wireOpen = openWire;
  window.__wireClose = closeWire;
  // The wire's index carries a folded search haystack built from whatever the story had
  // at the time. Built before the prose arrived, it holds headlines and deks only, and
  // full-text search would keep quietly missing until the next open. Rebuild in place.
  window.addEventListener('asj:full-loaded', () => {
    if (!INDEX.length) return;
    INDEX = buildIndex();
    if (view.classList.contains('open')) renderResults();
  });
  // Past editions: a journal keeps a record. The daily pipeline archives each edition to
  // data/archive/YYYY-MM-DD.js; this picker loads one and re-renders the wire from it.
  const editionSel = document.getElementById('wire-edition');
  function populateEditions(){
    if (!editionSel) return;
    const dates = Array.isArray(window.UNITED_AFRICA_ARCHIVE_INDEX) ? window.UNITED_AFRICA_ARCHIVE_INDEX : [];
    const currentDate = latestBriefDate();
    const pastDates = dates.filter(date => date && date !== currentDate);
    if (editionPick) editionPick.hidden = !pastDates.length;
    if (!pastDates.length) { editionSel.hidden = true; return; }
    editionSel.hidden = false;
    editionSel.innerHTML = '<option value="">Latest edition</option>' + pastDates.map(d => '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>').join('');
    editionSel.value = editionDate || '';
  }
  function applyEdition(){
    INDEX = buildIndex();
    visibleCount = 60;
    const dateEl = document.getElementById('wire-date');
    const d = editionDate || latestBriefDate();
    if (dateEl) dateEl.textContent = d ? (editionDate ? 'Edition · ' : 'Latest available · ') + formatShortDate(d + 'T00:00:00Z') : 'Edition pending';
    renderTopics(); renderTrust(); renderResults();
  }
  editionSel?.addEventListener('change', () => {
    const day = editionSel.value;
    if (!day) { editionDate = null; editionBriefs = null; applyEdition(); return; }
    if (editionCache[day]) { editionDate = day; editionBriefs = editionCache[day]; applyEdition(); return; }
    const loader = document.createElement('script');
    loader.src = 'data/archive/' + encodeURIComponent(day) + '.js';
    loader.onload = () => {
      const dayData = window.__ASJ_ARCHIVE_DAY;
      if (dayData && dayData.byCountry) {
        hydrateBriefs(dayData.byCountry);
        editionCache[day] = dayData.byCountry;
        editionDate = day; editionBriefs = dayData.byCountry;
        applyEdition();
      } else { editionSel.value = editionDate || ''; }
    };
    loader.onerror = () => { editionSel.value = editionDate || ''; };
    document.head.appendChild(loader);
  });
  entries.forEach(button => button.addEventListener('click', () => openWire('All')));
  closeBtn.addEventListener('click', closeWire);
  mobileActionsToggle?.addEventListener('click', () => setMobileActionsOpen(!mobileActionsOpen));
  // A menu that stays open after you have used it, or that only closes from its own
  // button, sits over the headlines. Close it on an outside click, on Escape, and as
  // soon as one of its actions is chosen.
  document.addEventListener('click', e => {
    if (!mobileActionsOpen) return;
    if (e.target.closest('.wire-more')) return;
    setMobileActionsOpen(false);
  });
  actionsEl?.addEventListener('click', e => {
    if (e.target.closest('.wire-action')) setTimeout(() => setMobileActionsOpen(false), 0);
  });
  view.addEventListener('keydown', e => {
    if (e.key === 'Escape' && mobileActionsOpen) {
      e.stopPropagation();
      setMobileActionsOpen(false);
      mobileActionsToggle?.focus();
    }
  }, true);
  compareToggle?.addEventListener('click', () => setCompareOpen(!compareOpen));
  compareSelects.forEach(select => select.addEventListener('change', renderCompare));
  comparePanel?.addEventListener('click', event => {
    const button = event.target.closest('[data-open-country]');
    if (!button) return;
    const code = button.dataset.openCountry;
    closeWire();
    window.setTimeout(() => openCountry(code, entry || canvas), 80);
  });
  copyBtn?.addEventListener('click', async event => {
    const ok = await copyPlainText(dailyBriefText(filtered()));
    pulseButtonLabel(event.currentTarget, ok ? 'Copied' : 'Copy Failed');
  });
  shareBtn?.addEventListener('click', async event => {
    const text = dailyBriefText(filtered());
    if (navigator.share) {
      try {
        await navigator.share({ title: 'The African Street Journal', text });
        pulseButtonLabel(event.currentTarget, 'Shared');
        return;
      } catch {}
    }
    const ok = await copyPlainText(text);
    pulseButtonLabel(event.currentTarget, ok ? 'Copied' : 'Share Failed');
  });
  topicSelect?.addEventListener('change', () => {
    activeTopic = topicSelect.value || 'All';
    visibleCount = 60;
    renderResults();
    resultsEl.scrollTop = 0;
  });
  // The audience select drives the same setStoryLens() the country page's lens buttons
  // do, so the choice follows the reader between the Wire and a country, and is saved.
  lensSelect?.addEventListener('change', () => setStoryLens(lensSelect.value || 'general'));
  window.addEventListener('asj:lenschange', () => {
    if (!view.classList.contains('open')) return;
    INDEX = buildIndex();
    visibleCount = 60;
    renderTopics(); renderTrust(); renderResults();
    resultsEl.scrollTop = 0;
  });
  searchInput.addEventListener('input', ()=>{
    query = searchInput.value; visibleCount = 60; renderResults(); resultsEl.scrollTop = 0;
    // Data saver skips the prose download; a reader who searches has asked for it, and
    // without it search sees only headlines and deks. The index rebuilds on arrival.
    if (window.ASJ_SAVE_DATA && query.trim().length >= 3 && window.ASJ_LOAD_FULL) window.ASJ_LOAD_FULL();
  });
  resultsEl.addEventListener('click', event => {
    const loadMore = event.target.closest('[data-wire-load-more]');
    if (loadMore) {
      const scrollTop = resultsEl.scrollTop;
      visibleCount += 60;
      renderResults();
      resultsEl.scrollTop = scrollTop;
      return;
    }
    const storyButton = event.target.closest('[data-story-key]');
    if (storyButton) openRegisteredStory(storyButton.dataset.storyKey, storyButton);
  });
  document.addEventListener('keydown', e=>{
    if (e.key==='Escape' && view.classList.contains('open') && !storyReader?.classList.contains('open')) closeWire();
  });
  const n = Object.values(AI_BRIEFS||{}).reduce((a,arr)=>a+arr.length,0);
  entryCounts.forEach(el => { el.textContent = n ? (n+' stories') : 'ASJ Wire'; });
})();

/* ── The front page on the landing screen ──────────────────────────────────
   A daily whose landing screen shows no journalism is a poster. The Wire already
   builds a proper front page, but it lived behind a button in the corner, so a
   stranger arriving from a search result or a shared link saw a map and a population
   counter and had to guess.
   These headlines fill the empty columns either side of the map on a wide screen and
   sit under the ticker on a phone. Ranking is the desk's own: same scores, same lens,
   so the landing page and the Wire never disagree about what today's lead is. */
(function renderHomeFront(){
  // A column beside the map on wide screens, one top-story card under it on phones and
  // tablets. CSS shows one or the other; both are filled so a rotation or resize needs
  // no repaint. (The sign-up form mounts into #home-front-mobile, which no longer
  // exists: the landing screen stays news, not a form.)
  const slots = {
    side: document.getElementById('home-front-side'),
    top: document.getElementById('home-front-top')
  };
  if (!slots.side && !slots.top) return;

  function topStories(limit) {
    const out = [];
    for (const [code, list] of Object.entries(AI_BRIEFS || {})) {
      const info = COUNTRY_INFO[code];
      if (!info || !Array.isArray(list)) continue;
      list.forEach((story, rank) => {
        if (!story || !story.headline) return;
        out.push({
          code, story, rank,
          country: info.name,
          source: (Array.isArray(story.sources) && story.sources[0]?.name) || '',
          topic: story.topic || 'News',
          date: story.published || AI_BRIEFS_DATES[code] || AI_BRIEFS_AT || '',
          score: storyLensRank(story, 'general', rank),
          key: registerStory(story, { countryCode: code, country: info.name, published: story.published || AI_BRIEFS_DATES[code], rank })
        });
      });
    }
    out.sort((a, b) => b.score - a.score || a.rank - b.rank || a.country.localeCompare(b.country));
    // Same rule the Wire's lead slot uses: a story from a previous edition does not
    // lead today's paper unless there is nothing else.
    const fresh = out.filter(it => !isBeforeEdition(it.date));
    const ordered = fresh.length ? fresh.concat(out.filter(it => isBeforeEdition(it.date))) : out;
    // One story per country, so the front page reads as a continent rather than as
    // whichever country the ranker liked most that morning.
    const seen = new Set();
    const spread = [];
    for (const item of ordered) {
      if (seen.has(item.code)) continue;
      seen.add(item.code);
      spread.push(item);
      if (spread.length >= limit) break;
    }
    return spread;
  }

  // What a returning reader wants to know before anything else: is there anything new.
  // The Wire already computes this ("What Changed") but only once you have opened it,
  // which is the wrong order - the count is the reason to open it. The snapshot is the
  // same one the Wire writes, so the two can never disagree.
  function newSinceLastVisit(items) {
    let snapshot = null;
    try { snapshot = JSON.parse(localStorage.getItem('asj-wire-snapshot') || 'null'); } catch { return 0; }
    if (!snapshot || !Array.isArray(snapshot.keys)) return 0;
    const seen = new Set(snapshot.keys);
    let n = 0;
    for (const [code, list] of Object.entries(AI_BRIEFS || {})) {
      (list || []).forEach((story, rank) => {
        if (!story || !story.headline) return;
        if (!seen.has(code + ':' + rank + ':' + story.headline)) n++;
      });
    }
    return n;
  }

  function storyMarkup(item, isLead, opts = {}) {
    const dek = opts.dek === false ? '' : (item.story.dek || storyParagraphs(item.story)[0] || '');
    return '<button class="home-story' + (isLead ? ' home-story--lead' : '') +
        (isStoryReadKey(item.key) ? ' is-read' : '') +
        '" type="button" data-home-story="' + escapeHtml(item.key) + '">' +
      '<span class="home-story-kicker">' +
        (isLead && opts.label ? '<span class="home-front-kicker-label">' + escapeHtml(opts.label) + '</span>' : '') +
        '<span>' + escapeHtml(item.country) + '</span>' +
        (shownTopic(item.topic) ? '<span>' + escapeHtml(item.topic) + '</span>' : '') +
        (item.source ? '<span class="home-story-src">' + escapeHtml(item.source) + '</span>' : '') +
      '</span>' +
      '<span class="home-story-title">' + escapeHtml(item.story.headline) + '</span>' +
      (isLead && dek ? '<span class="home-story-dek">' + escapeHtml(dek) + '</span>' : '') +
    '</button>';
  }

  function fill(el, items, opts) {
    if (!el) return false;
    if (!items.length) { el.innerHTML = ''; el.hidden = true; return false; }
    // No column heading. The headlines carry their own country, topic and outlet, and
    // a label above them only repeated the masthead or made a claim about the clock.
    el.innerHTML =
      items.map((item, i) => storyMarkup(item, opts.lead && i === 0, opts)).join('') +
      // One call to action per block, and it says what is behind it.
      (opts.cta ? '<button class="home-front-all" type="button" data-home-all>' + escapeHtml(opts.cta) + ' &rarr;</button>' : '');
    const wasHidden = el.hidden;
    el.hidden = false;
    return wasHidden;
  }

  function paint() {
    const items = topStories(4);
    if (!items.length) return;
    const fresh = newSinceLastVisit();
    const total = Object.values(AI_BRIEFS || {}).reduce((n, list) => n + (Array.isArray(list) ? list.filter(s => s && s.headline).length : 0), 0);
    const countries = Object.values(AI_BRIEFS || {}).filter(list => Array.isArray(list) && list.length).length;
    const cta = fresh > 0
      ? fresh + ' new since your last visit'
      : 'All ' + total + ' stories from ' + countries + ' countries';
    fill(slots.side, items, { lead: true, cta, label: 'Top story' });
    // The phone card is one story, no dek and no button, so the landing page stays one
    // screen: the masthead's own "231 stories" entry (it turns into "N new" for a
    // returning reader, below) already leads to the rest. The map is re-fitted to the
    // space left the first time the card appears.
    if (fill(slots.top, items.slice(0, 1), { lead: true, cta: '', label: 'Top story', dek: false }) && typeof layoutHomeMap === 'function') {
      requestAnimationFrame(layoutHomeMap);
    }
    // The sign-up form lives inside these blocks and is wiped by the repaint above.
    try { window.dispatchEvent(new CustomEvent('asj:front-painted')); } catch {}
    // The entry button is the other place a returning reader looks. Saying "12 new"
    // there is the difference between a bookmark that gets opened and one that does not.
    if (fresh > 0) {
      document.querySelectorAll('#wire-entry-count, .wire-entry-count').forEach(el => {
        el.textContent = fresh + ' new';
        el.classList.add('is-new');
      });
    }
  }

  document.addEventListener('click', event => {
    const all = event.target.closest('[data-home-all]');
    if (all) { window.__wireOpen?.('All'); return; }
    const trigger = event.target.closest('[data-home-story]');
    if (!trigger) return;
    const found = findPublishedStory(trigger.dataset.homeStory);
    if (found) openStoryReader(found.story, found.context, trigger);
  });


  paint();
  // Repaint when a story is marked read, so the landing page dims what you have seen.
  window.addEventListener('asj:story-read', paint);
  // Deks come from the index so the columns are right immediately, but the why lines
  // and the paragraph fallback only exist once the prose lands. Repaint then.
  window.addEventListener('asj:full-loaded', paint);
  // Opening the Wire rewrites the snapshot, so the count is stale the moment the reader
  // comes back to the landing page. Repaint on the route change that brings them here.
  window.addEventListener('hashchange', paint);
})();

/* ── Lazy country data: detail outline + GIS load per country, on demand ──
   app-core.js ships only the landing map + economy layer (~15% of the old bundle).
   Country dossiers may use that lightweight outline while their chunk arrives, but
   fullscreen navigation waits for final geometry and preloads adjacent countries. */
const COUNTRY_CHUNK_PENDING = {};
const COUNTRY_CHUNK_REFRESH_PENDING = {};

function loadCountryData(countryId) {
  if (!/^[a-z]{2}$/.test(String(countryId))) return Promise.resolve(false);
  if (COUNTRY_DETAIL[countryId]) return Promise.resolve(true);
  if (COUNTRY_CHUNK_PENDING[countryId]) return COUNTRY_CHUNK_PENDING[countryId];

  // The map chunk and the country's facts (ports, airports, cities, food prices, crop
  // months: data/facts/<cc>.js, merged into ASJ_COUNTRY_FACTS) load side by side. A
  // missing facts file is not fatal: those panels say "not on file", the map still draws.
  const loadScript = (src, mark) => new Promise(done => {
    const s = document.createElement('script');
    s.src = src;
    s.dataset[mark] = countryId;
    s.onload = () => done(true);
    s.onerror = () => done(false);
    document.head.appendChild(s);
  });
  const factsLoaded = countryFacts(countryId)?.ports
    ? Promise.resolve(true)
    : loadScript('data/facts/' + countryId + '.js?v=' + (window.ASJ_ASSET_VERSION || '1'), 'countryFacts');
  const pending = Promise.all([loadScript('data/countries/' + countryId + '.js', 'countryChunk'), factsLoaded]).then(() => {
    delete COUNTRY_CHUNK_PENDING[countryId];
    return !!COUNTRY_DETAIL[countryId];
  });
  COUNTRY_CHUNK_PENDING[countryId] = pending;
  return pending;
}

function ensureCountryData(countryId) {
  if (!/^[a-z]{2}$/.test(String(countryId))) return Promise.resolve(false);
  if (COUNTRY_DETAIL[countryId]) return Promise.resolve(true);
  const pending = loadCountryData(countryId);
  if (!COUNTRY_CHUNK_REFRESH_PENDING[countryId]) {
    COUNTRY_CHUNK_REFRESH_PENDING[countryId] = pending;
    pending.then(loaded => {
      if (COUNTRY_CHUNK_REFRESH_PENDING[countryId] !== pending) return;
      delete COUNTRY_CHUNK_REFRESH_PENDING[countryId];
      if (
        loaded &&
        !countryNavBusy &&
        countryView.classList.contains('open') &&
        activeCountryMap &&
        activeCountryMap.countryId === countryId
      ) {
        openCountry(countryId, lastFocus);
      }
    });
  }
  return pending;
}

function preloadAdjacentCountryData(countryId) {
  const index = sortedCountryIds.indexOf(countryId);
  if (index < 0 || sortedCountryIds.length < 2) return;
  const previous = sortedCountryIds[(index - 1 + sortedCountryIds.length) % sortedCountryIds.length];
  const next = sortedCountryIds[(index + 1) % sortedCountryIds.length];
  loadCountryData(previous);
  loadCountryData(next);
  // And their relief previews (15-30 KB): the Atlas holds its map until relief can draw,
  // and on the live site that preview was a 0.3-0.4 s round trip on every Next.
  prefetchReliefPreview(previous);
  prefetchReliefPreview(next);
}

/* ── Watchlist: follow countries, "Your desk" strip on the landing ────── */
const WATCHLIST_KEY = 'asj:watchlist';
const WATCHLIST_SEEN_KEY = 'asj:watchlist-seen:v1';
const DESK_SIGNUP_KEY = 'asj:desk-signup:v1';
function getWatchlist() {
  try {
    const list = JSON.parse(localStorage.getItem(WATCHLIST_KEY));
    return Array.isArray(list) ? list.filter(id => COUNTRY_INFO[id]) : [];
  } catch { return []; }
}
function saveWatchlist(list) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list)); } catch {}
  try { window.dispatchEvent(new CustomEvent('asj:watchlist-changed')); } catch {}
}
function getDeskSignup() {
  try {
    const signup = JSON.parse(localStorage.getItem(DESK_SIGNUP_KEY) || 'null');
    return signup && typeof signup === 'object' ? signup : {};
  } catch { return {}; }
}
function saveDeskSignup(signup) {
  try { localStorage.setItem(DESK_SIGNUP_KEY, JSON.stringify(signup || {})); } catch {}
}
function readWatchlistSeen() {
  try {
    const seen = JSON.parse(localStorage.getItem(WATCHLIST_SEEN_KEY) || '{}');
    return seen && typeof seen === 'object' ? seen : {};
  } catch { return {}; }
}
function saveWatchlistSeen(seen) {
  try { localStorage.setItem(WATCHLIST_SEEN_KEY, JSON.stringify(seen || {})); } catch {}
}
function countryStoryFingerprint(countryId) {
  const top = (AI_BRIEFS[countryId] || []).find(brief => brief && brief.headline);
  const date = String(AI_BRIEFS_DATES[countryId] || AI_BRIEFS_AT || '').slice(0, 10);
  return top ? [date, top.topic || '', top.headline || ''].join('|') : '';
}
function markCountrySeen(countryId) {
  const fp = countryStoryFingerprint(countryId);
  if (!fp) return;
  const seen = readWatchlistSeen();
  seen[countryId] = fp;
  saveWatchlistSeen(seen);
}
function updateStarButton(countryId) {
  const btn = document.getElementById('cv-star');
  if (!btn) return;
  const on = getWatchlist().includes(countryId);
  const countryName = COUNTRY_INFO[countryId]?.name || 'this country';
  btn.setAttribute('aria-pressed', String(on));
  btn.textContent = on ? '★' : '☆';
  btn.title = on ? 'Unfollow ' + countryName : 'Follow ' + countryName;
  btn.setAttribute('aria-label', btn.title);
}

let yourDeskIndex = 0;
let yourDeskScrollFrame = 0;
let yourDeskExpanded = false;

function setYourDeskExpanded(expanded) {
  const el = document.getElementById('your-desk');
  if (!el) return;
  yourDeskExpanded = !!expanded;
  el.classList.toggle('is-collapsed', !yourDeskExpanded);
  const toggle = el.querySelector('[data-desk-toggle]');
  const rail = el.querySelector('.yd-list');
  const nav = el.querySelector('.yd-nav');
  const cardCount = rail?.querySelectorAll('.yd-country-card').length || 0;
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(yourDeskExpanded));
    toggle.setAttribute('aria-label', (yourDeskExpanded ? 'Collapse' : 'Expand') + ' My Africa');
  }
  if (rail) rail.hidden = !yourDeskExpanded;
  if (nav) nav.hidden = !yourDeskExpanded || cardCount < 2;
  if (yourDeskExpanded) requestAnimationFrame(() => setYourDeskIndex(yourDeskIndex, 'auto'));
}

function updateYourDeskNav() {
  const el = document.getElementById('your-desk');
  const rail = el?.querySelector('.yd-list');
  const cards = Array.from(rail?.querySelectorAll('.yd-country-card') || []);
  if (!rail || !cards.length) return;

  const railLeft = rail.getBoundingClientRect().left;
  let nearest = 0;
  let nearestDistance = Infinity;
  cards.forEach((card, index) => {
    const distance = Math.abs(card.getBoundingClientRect().left - railLeft);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  yourDeskIndex = nearest;

  const position = el.querySelector('.yd-pos');
  const previous = el.querySelector('[data-desk-nav="prev"]');
  const next = el.querySelector('[data-desk-nav="next"]');
  if (position) position.textContent = (nearest + 1) + '/' + cards.length;
  if (previous) previous.disabled = nearest === 0;
  if (next) next.disabled = nearest === cards.length - 1;
}

function setYourDeskIndex(index, behavior = 'smooth') {
  const el = document.getElementById('your-desk');
  const rail = el?.querySelector('.yd-list');
  const cards = Array.from(rail?.querySelectorAll('.yd-country-card') || []);
  if (!rail || !cards.length) return;

  yourDeskIndex = Math.max(0, Math.min(cards.length - 1, index));
  const railRect = rail.getBoundingClientRect();
  const cardRect = cards[yourDeskIndex].getBoundingClientRect();
  const left = rail.scrollLeft + cardRect.left - railRect.left;
  rail.scrollTo({
    left,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : behavior
  });
  requestAnimationFrame(updateYourDeskNav);
}

function deskSignupConfig() {
  const cfg = window.ASJ_SUPABASE_CONFIG || null;
  const url = String(cfg?.url || '').replace(/\/+$/, '');
  const anonKey = String(cfg?.anonKey || '');
  const table = String(cfg?.table || 'asj_signups');
  if (/^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(url) && anonKey.length >= 20) {
    return { kind: 'supabase', url, anonKey, table };
  }
  // Supabase keeps the watchlist and the lens alongside the address, which is what
  // this desk is really for. A plain list endpoint - Buttondown, Formspree, a Worker -
  // takes the address only. Accepting the simpler one means a reader can be signed up
  // the day an endpoint is pasted in, rather than waiting for a database to exist.
  const list = window.ASJ_NEWSLETTER || null;
  const endpoint = String(list?.endpoint || '');
  if (/^https:\/\//i.test(endpoint)) {
    return { kind: 'endpoint', endpoint, field: String(list.field || 'email'), cors: list.cors !== false };
  }
  return null;
}
function preferredDeskAudience() {
  return normalizeStoryLens(activeStoryLens);
}
function signupWatchlistPayload() {
  return getWatchlist().map(id => ({
    id,
    name: COUNTRY_INFO[id]?.name || id.toUpperCase()
  }));
}
async function syncDeskSignup(email, audience) {
  const cfg = deskSignupConfig();
  if (!cfg) return { synced: false, reason: 'missing-config' };

  if (cfg.kind === 'endpoint') {
    // A list provider takes a form post and usually answers without CORS headers, so
    // the response is opaque and cannot be read. That is fine: what must not happen is
    // reporting a failure for a submission that actually landed.
    const body = new FormData();
    body.append(cfg.field, email);
    body.append('audience', audience);
    await fetch(cfg.endpoint, { method: 'POST', body, mode: cfg.cors ? 'cors' : 'no-cors' });
    return { synced: true };
  }

  const payload = {
    email,
    watchlist: signupWatchlistPayload(),
    preferred_audience: audience,
    source: 'my_africa'
  };
  const res = await fetch(cfg.url + '/rest/v1/' + encodeURIComponent(cfg.table), {
    method: 'POST',
    headers: {
      apikey: cfg.anonKey,
      Authorization: 'Bearer ' + cfg.anonKey,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(payload)
  });
  if (res.ok) return { synced: true };
  if (res.status === 409) return { synced: true, duplicate: true };
  let detail = '';
  try { detail = await res.text(); } catch {}
  throw new Error('Supabase signup failed: ' + res.status + (detail ? ' ' + detail.slice(0, 160) : ''));
}
function deskSignupHtml(list) {
  if (list.length < 2) return '';
  // No newsletter backend is configured, so show nothing rather than a form or a
  // 'not connected yet' notice. Wiring a provider in data/newsletter-config.js brings it back.
  if (!deskSignupConfig()) return '';
  const signup = getDeskSignup();
  const savedEmail = String(signup.email || '');
  const savedAudience = String(signup.audience || preferredDeskAudience());
  const savedState = signup.synced ? 'Joined' : 'Ready to join';
  const selected = value => value === savedAudience ? ' selected' : '';
  return '<form class="yd-signup" data-desk-signup>' +
    '<div class="yd-signup-copy"><b>Get the morning email</b><span>The day\'s stories from the countries you follow.</span></div>' +
    '<label class="sr-only" for="yd-signup-email">Email address</label>' +
    '<input id="yd-signup-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="' + escapeHtml(savedEmail) + '" required>' +
    '<label class="sr-only" for="yd-signup-audience">Reading for</label>' +
    '<select id="yd-signup-audience" name="audience" aria-label="Reading for">' +
      '<option value="general"' + selected('general') + '>All readers</option>' +
      '<option value="farmers"' + selected('farmers') + '>Farmers</option>' +
      '<option value="investors"' + selected('investors') + '>Investors</option>' +
      '<option value="diaspora"' + selected('diaspora') + '>Diaspora</option>' +
    '</select>' +
    '<button type="submit">Join</button>' +
    '<p class="yd-signup-status" data-signup-status aria-live="polite">' + escapeHtml(savedState) + '</p>' +
  '</form>';
}

function deskStoryEntry(countryId) {
  const entries = rankStoryEntries(
    (AI_BRIEFS[countryId] || []).filter(brief => brief && brief.headline),
    activeStoryLens
  );
  if (!entries.length) return null;
  return entries.find(entry => !isStoryReadKey(storyClientId(entry.story, {
    countryCode:countryId,
    rank:entry.sourceIndex
  }))) || entries[0];
}

function renderYourDesk() {
  const el = document.getElementById('your-desk');
  if (!el) return;
  const list = getWatchlist();
  if (!list.length) {
    yourDeskIndex = 0;
    yourDeskExpanded = false;
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const seen = readWatchlistSeen();
  yourDeskIndex = Math.max(0, Math.min(list.length - 1, yourDeskIndex));
  el.hidden = false;
  el.classList.toggle('is-collapsed', !yourDeskExpanded);
  const deskLensLabel = activeStoryLens === 'general' ? '' : ' · ' + STORY_LENS_LABELS[activeStoryLens];
  el.innerHTML = '<div class="yd-head"><button class="yd-toggle" type="button" data-desk-toggle aria-expanded="' +
    String(yourDeskExpanded) + '" aria-controls="your-desk-list" aria-label="' + (yourDeskExpanded ? 'Collapse' : 'Expand') +
    ' My Africa"><span class="yd-head-copy"><span class="yd-key">My Africa</span><span class="yd-sub">' +
    list.length + ' followed' + deskLensLabel + '</span></span><svg class="yd-toggle-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></button>' +
    '<div class="yd-nav"' + (yourDeskExpanded && list.length > 1 ? '' : ' hidden') + '>' +
    '<button class="yd-nav-btn" type="button" data-desk-nav="prev" aria-label="Previous followed country" disabled>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"></path></svg></button>' +
    '<span class="yd-pos" aria-live="polite">' + (yourDeskIndex + 1) + '/' + list.length + '</span>' +
    '<button class="yd-nav-btn" type="button" data-desk-nav="next" aria-label="Next followed country">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"></path></svg></button>' +
    '</div></div><div class="yd-list" id="your-desk-list" role="group" aria-label="Followed country files"' +
    (yourDeskExpanded ? '' : ' hidden') + '>' + list.map(id => {
    const info = COUNTRY_INFO[id] || {};
    const inv = investorForCountry(id);
    const growth = Number.isFinite(inv.gdp_growth) ? (inv.gdp_growth > 0 ? '+' : '') + inv.gdp_growth + '%' : '';
    const topEntry = deskStoryEntry(id);
    const top = topEntry?.story;
    const unread = !!topEntry && !isStoryReadKey(storyClientId(top, { countryCode:id, rank:topEntry.sourceIndex }));
    const fp = countryStoryFingerprint(id);
    const isNew = !!fp && seen[id] && seen[id] !== fp;
    const name = info.name || id.toUpperCase();
    const storyLabel = activeStoryLens === 'general' ? shownTopic(top?.topic) : audienceLabel(activeStoryLens);
    const story = top ? (storyLabel ? storyLabel + ' ' + String.fromCharCode(183) + ' ' : '') + top.headline : 'Open country file';
    return '<button class="yd-country-card" type="button" data-country="' + id +
      '" aria-label="Open ' + escapeHtml(name) + ' country file">' +
      '<span class="yd-country"><span>' + escapeHtml(name) + '</span><span class="yd-country-meta">' +
        (isNew ? '<span class="yd-new">New</span>' : (unread ? '<span class="yd-new">Unread</span>' : (growth ? '<b>' + escapeHtml(growth) + '</b>' : ''))) +
        '<svg class="yd-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"></path></svg>' +
      '</span></span><small>' + escapeHtml(story) + '</small></button>';
  }).join('') + '</div>' + (yourDeskExpanded ? deskSignupHtml(list) : '');

  const rail = el.querySelector('.yd-list');
  rail?.addEventListener('scroll', () => {
    if (yourDeskScrollFrame) cancelAnimationFrame(yourDeskScrollFrame);
    yourDeskScrollFrame = requestAnimationFrame(() => {
      yourDeskScrollFrame = 0;
      updateYourDeskNav();
    });
  }, { passive: true });
  if (yourDeskExpanded) requestAnimationFrame(() => setYourDeskIndex(yourDeskIndex, 'auto'));
}
document.getElementById('cv-star')?.addEventListener('click', () => {
  if (!activeCountryMap) return;
  const id = activeCountryMap.countryId;
  const list = getWatchlist();
  const at = list.indexOf(id);
  // An unfollow is a deliberate no: the follow nudge does not ask again straight away.
  if (at >= 0) { list.splice(at, 1); dismissPrompt('follow-' + id); } else { list.push(id); markCountrySeen(id); }
  if (at < 0 && list.length >= 2 && !getDeskSignup().email) yourDeskExpanded = true;
  saveWatchlist(list);
  updateStarButton(id);
  renderYourDesk();
  renderFollowNudge(id);
});

/* ── Return-reader prompts: follow a country; add the app to the home screen ── */
// A reader who comes back is the cheapest reader to keep, and until Nov 2026 nothing
// asked them to stay: the star sat unlabelled in the header, and the app could be
// installed only by someone who already knew the browser menu. Both prompts wait for
// a second visit, say "Not now" once and stay away for weeks, and never show to a
// test runner.
const VISIT_DAYS_KEY = 'asj:visit-days:v1';
const COUNTRY_DAYS_KEY = 'asj:country-days:v1';
const PROMPT_DISMISS_KEY = 'asj:prompt-dismissed:v1';
const TODAY_ISO = new Date().toISOString().slice(0, 10);
const PROMPTS_OFF = navigator.webdriver === true || /[?&](selftest|sweep|perf)=/.test(location.search);
function readStore(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && typeof v === 'object' ? v : fallback; } catch { return fallback; }
}
function writeStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
const VISIT_DAYS = (() => {
  const stored = readStore(VISIT_DAYS_KEY, []);
  const days = (Array.isArray(stored) ? stored : []).filter(d => typeof d === 'string');
  if (!days.includes(TODAY_ISO)) { days.push(TODAY_ISO); writeStore(VISIT_DAYS_KEY, days.slice(-30)); }
  return days;
})();
function promptDismissedRecently(name, days) {
  const at = Number(readStore(PROMPT_DISMISS_KEY, {})[name] || 0);
  return at > 0 && Date.now() - at < days * 86400000;
}
function dismissPrompt(name) {
  const all = readStore(PROMPT_DISMISS_KEY, {});
  all[name] = Date.now();
  writeStore(PROMPT_DISMISS_KEY, all);
}
// Days on which each country was opened: the second distinct day is "back for it".
function countCountryDay(countryId) {
  const all = readStore(COUNTRY_DAYS_KEY, {});
  const rec = all[countryId] && typeof all[countryId] === 'object' ? all[countryId] : { n: 0, d: '' };
  if (rec.d !== TODAY_ISO) { rec.n = (Number(rec.n) || 0) + 1; rec.d = TODAY_ISO; all[countryId] = rec; writeStore(COUNTRY_DAYS_KEY, all); }
  return rec.n;
}
function renderFollowNudge(countryId) {
  const el = document.getElementById('cv-follow');
  if (!el) return;
  const name = COUNTRY_INFO[countryId]?.name || '';
  const days = countCountryDay(countryId);
  if (PROMPTS_OFF || !name || days < 2 || getWatchlist().includes(countryId) || promptDismissedRecently('follow-' + countryId, 45)) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const tg = String(window.ASJ_SOCIAL?.telegram || '');
  el.innerHTML = '<p class="cv-follow-copy"><b>Back for ' + escapeHtml(name) + '?</b> Follow it, and its new stories wait for you at the top of the front page on this device.</p>' +
    '<div class="cv-follow-actions"><button type="button" class="cv-follow-go" data-follow>Follow ' + escapeHtml(name) + '</button>' +
    (/^[A-Za-z0-9_]{5,32}$/.test(tg) ? '<a href="https://t.me/' + tg + '" target="_blank" rel="noopener">Get the paper on Telegram</a>' : '') +
    '<button type="button" class="cv-follow-later" data-later>Not now</button></div>';
  el.hidden = false;
  el.onclick = e => {
    if (e.target.closest('[data-follow]')) {
      if (!getWatchlist().includes(countryId)) document.getElementById('cv-star')?.click();
      el.innerHTML = '<p class="cv-follow-copy"><b>Following ' + escapeHtml(name) + '.</b> Its new stories are at the top of the front page now.</p>';
      el.hidden = false;
      setTimeout(() => { if (activeCountryMap?.countryId === countryId) el.hidden = true; }, 4000);
    } else if (e.target.closest('[data-later]')) {
      dismissPrompt('follow-' + countryId);
      el.hidden = true;
    }
  };
}

let deferredInstallPrompt = null;
let installPromptShown = false;
function isStandaloneApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}
function isIosSafari() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}
function maybeShowInstallPrompt() {
  if (installPromptShown || PROMPTS_OFF || isStandaloneApp() || VISIT_DAYS.length < 2 || promptDismissedRecently('install', 30)) return;
  if (!deferredInstallPrompt && !isIosSafari()) return;
  const el = document.getElementById('asj-install');
  if (!el) return;
  installPromptShown = true;
  el.innerHTML = '<p><b>Keep the paper on your home screen.</b> ' +
    (deferredInstallPrompt ? 'One tap opens it like an app, and it works on a weak signal.' : 'On iPhone: tap the Share button, then <b>Add to Home Screen</b>.') + '</p>' +
    '<div class="asj-install-actions">' + (deferredInstallPrompt ? '<button type="button" data-install>Add it</button>' : '') +
    '<button type="button" data-later>' + (deferredInstallPrompt ? 'Not now' : 'OK') + '</button></div>';
  el.hidden = false;
  el.onclick = async e => {
    if (e.target.closest('[data-install]') && deferredInstallPrompt) {
      const ask = deferredInstallPrompt;
      deferredInstallPrompt = null;
      el.hidden = true;
      try { await ask.prompt(); const choice = await ask.userChoice; if (choice?.outcome !== 'accepted') dismissPrompt('install'); } catch {}
    } else if (e.target.closest('[data-later]')) {
      dismissPrompt('install');
      el.hidden = true;
    }
  };
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  setTimeout(maybeShowInstallPrompt, 6000);
});
window.addEventListener('appinstalled', () => {
  dismissPrompt('install');
  const el = document.getElementById('asj-install');
  if (el) el.hidden = true;
});
if (isIosSafari()) setTimeout(maybeShowInstallPrompt, 8000);
document.getElementById('your-desk')?.addEventListener('click', e => {
  const toggle = e.target.closest('button[data-desk-toggle]');
  if (toggle) {
    setYourDeskExpanded(!yourDeskExpanded);
    return;
  }
  const nav = e.target.closest('button[data-desk-nav]');
  if (nav) {
    setYourDeskIndex(yourDeskIndex + (nav.dataset.deskNav === 'prev' ? -1 : 1));
    return;
  }
  const btn = e.target.closest('button[data-country]');
  if (btn) {
    markCountrySeen(btn.dataset.country);
    yourDeskExpanded = false;
    renderYourDesk();
    openCountry(btn.dataset.country, btn);
  }
});
document.getElementById('your-desk')?.addEventListener('submit', async e => {
  const form = e.target.closest('form[data-desk-signup]');
  if (!form) return;
  e.preventDefault();
  const status = form.querySelector('[data-signup-status]');
  const button = form.querySelector('button[type="submit"]');
  const email = String(new FormData(form).get('email') || '').trim().toLowerCase();
  const audience = String(new FormData(form).get('audience') || preferredDeskAudience());
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    if (status) status.textContent = 'Enter a valid email.';
    return;
  }
  if (status) status.textContent = 'Saving...';
  if (button) button.disabled = true;
  saveDeskSignup({ email, audience, synced: false, watchlist: getWatchlist(), savedAt: new Date().toISOString() });
  try {
    const result = await syncDeskSignup(email, audience);
    saveDeskSignup({ email, audience, synced: !!result.synced, duplicate: !!result.duplicate, watchlist: getWatchlist(), savedAt: new Date().toISOString() });
    if (status) status.textContent = result.synced ? (result.duplicate ? 'Already saved.' : 'Desk saved.') : 'Saved on this device.';
  } catch (err) {
    console.warn(err);
    if (status) status.textContent = 'Saved here. Server sync needs Supabase access.';
  } finally {
    if (button) button.disabled = false;
  }
});
renderYourDesk();

/* ── Crop calendar: indicative planting/harvest windows per top export ── */
// Continental norms, not local gospel — the card is labeled "indicative" on purpose.
// s = planting months, h = harvest months (1-12); `south` overrides for Southern Africa.
const CROP_SEASONS = {
  'Coffee': { kind:'perennial', plantLabel:'Establish', s: [3,4,5,10,11], h: [10,11,12,1] },
  'Tea': { kind:'perennial', plantLabel:'Establish', s: [3,4,5,10,11], h: [3,4,5,10,11,12] },
  'Cut flowers': { kind:'protected', plantLabel:'Plant', s: [1,2,3,4,5,6,7,8,9,10,11,12], h: [1,2,3,4,5,6,7,8,9,10,11,12] },
  'Cocoa': { kind:'perennial', plantLabel:'Establish', s: [4,5,6,9,10], h: [10,11,12,1,2] },
  'Cashew': { kind:'perennial', plantLabel:'Establish', s: [5,6,7], h: [1,2,3,4,5] },
  'Sesame': { s: [6,7], h: [10,11,12] },
  'Pulses': { s: [6,7], h: [10,11,12] },
  'Fish': { kind:'fishery', h: [1,2,3,4,5,6,7,8,9,10,11,12] },
  'Tobacco': { s: [9,10,11], h: [1,2,3,4] },
  'Groundnuts': { s: [5,6,7], h: [9,10,11] },
  'Cotton': { s: [5,6,7], h: [10,11,12,1] },
  'Citrus': { kind:'perennial', plantLabel:'Plant', s: [2,3,4,10,11], h: [11,12,1,2,3], south: { s: [8,9,10], h: [4,5,6,7,8] } },
  'Tomatoes': { s: [8,9,10,11,12,1,2,3], h: [10,11,12,1,2,3,4,5] },
  'Olives': { kind:'perennial', plantLabel:'Plant', s: [2,3,4,10,11], h: [10,11,12,1] },
  'Olive oil': { kind:'perennial', plantLabel:'Plant', s: [2,3,4,10,11], h: [10,11,12,1] },
  'Grapes': { kind:'perennial', plantLabel:'Plant', s: [2,3,4], h: [8,9,10], south: { s: [8,9,10], h: [1,2,3,4] } },
  'Wine': { kind:'perennial', plantLabel:'Plant', s: [2,3,4], h: [8,9,10], south: { s: [8,9,10], h: [1,2,3,4] } },
  'Potatoes': { s: [8,9,10,1,2], h: [11,12,1,2,3], south: { s: [6,7,8,1,2], h: [10,11,12,4,5] } },
  'Dates': { kind:'perennial', plantLabel:'Plant', s: [2,3,4], h: [9,10,11] },
  'Cassava': { s: [3,4,5,9,10,11], h: [1,2,3,4,5,6,7,8,9,10,11,12] },
  'Palm oil': { kind:'perennial', plantLabel:'Establish', s: [3,4,5,9,10], h: [1,2,3,4,5,6,7,8,9,10,11,12] },
  'Pyrethrum': { kind:'perennial', plantLabel:'Transplant', s: [3,4,5,10,11], h: [6,7,8,9] },
  'Maize': { s: [3,4,5], h: [8,9,10], south: { s: [10,11,12], h: [4,5,6,7] } },
  'Sugar': { plantLabel:'Plant cane', s: [3,4,5,10,11], h: [6,7,8,9,10,11], south: { s: [8,9,10,11], h: [4,5,6,7,8,9,10,11] } },
  'Soya': { s: [6,7], h: [10,11], south: { s: [11,12], h: [4,5] } },
  'Prawns': { kind:'fishery', h: [1,2,3,4,5,6,7,8,9,10,11,12] },
  'Beef': { kind:'livestock', h: [1,2,3,4,5,6,7,8,9,10,11,12] },
  'Sorghum': { s: [6,7], h: [10,11] },
  'Millet': { s: [6,7], h: [9,10,11] },
  'Banana': { kind:'perennial', plantLabel:'Plant suckers', s: [3,4,5,9,10,11], h: [1,2,3,4,5,6,7,8,9,10,11,12] },
  'Cowpea': { s: [6,7], h: [9,10] },
  'Onion': { s: [10,11,12], h: [2,3,4] },
  'Rice': { s: [5,6,7], h: [9,10,11], south: { s: [11,12], h: [4,5,6] } },
  'Pineapple': { kind:'perennial', plantLabel:'Plant slips', s: [1,2,3,4,5,6,7,8,9,10,11,12], h: [1,2,3,4,5,6,7,8,9,10,11,12] },
  'Wool': { kind:'fiber', h: [9,10,11,12] },
  'Vanilla': { kind:'perennial', plantLabel:'Plant cuttings', s: [9,10,11], h: [6,7,8] },
  'Cloves': { kind:'perennial', plantLabel:'Plant seedlings', s: [11,12,1], h: [10,11,12,1] },
  'Rubber': { kind:'perennial', plantLabel:'Plant seedlings', s: [4,5,6,7], h: [1,2,3,4,5,6,7,8,9,10,11,12] },
  'Shea': { kind:'perennial', plantLabel:'Establish', s: [5,6,7], h: [5,6,7,8] },
  // FAOSTAT export labels that are not crops: sold all year, shorn twice (Lesotho's
  // mohair, Feb-Mar and Aug-Sep), or distilled from flowers picked all year (ylang-ylang).
  'Cattle': { kind:'livestock', h: [1,2,3,4,5,6,7,8,9,10,11,12] },
  'Sheep and goats': { kind:'livestock', h: [1,2,3,4,5,6,7,8,9,10,11,12] },
  'Camels': { kind:'livestock', h: [1,2,3,4,5,6,7,8,9,10,11,12] },
  'Mohair': { kind:'fiber', h: [2,3,8,9] },
  'Essential oils': { kind:'perennial', plantLabel:'Establish', s: [11,12,1], h: [1,2,3,4,5,6,7,8,9,10,11,12] },
  'Berries': { s: [9,10], h: [12,1,2,3,4,5] },
  'Melons': { s: [10,11,12], h: [1,2,3,4,5] },
  'Avocados': { kind:'perennial', plantLabel:'Establish', s: [3,4,10,11], h: [3,4,5,6,7,8,9] }
};
// FAO Crop Calendar months for this country (scripts/build-crop-calendar.ps1) where FAO
// lists the crop; otherwise the typical months above. `source` says which.
function seasonSpecForCountry(countryId, crop) {
  const base = CROP_SEASONS[crop];
  const fao = countryFacts(countryId)?.cropCal?.[crop];
  if (fao && (fao.s?.length || fao.h?.length)) return { ...(base || {}), s: fao.s || [], h: fao.h || [], south: undefined, source: 'FAO' };
  if (!base) return null;
  const info = COUNTRY_INFO[countryId] || {};
  const southern = /southern/i.test(info.region || '');
  return { ...(southern && base.south ? { ...base, ...base.south } : base), source: 'typical' };
}
function seasonPlantLabel(spec) {
  if (!spec) return 'Planting';
  if (spec.plantLabel) return spec.plantLabel;
  if (spec.kind === 'perennial') return 'Establish';
  return 'Planting';
}
function seasonHarvestLabel(spec) {
  if (!spec) return 'Harvest';
  if (spec.kind === 'fishery') return 'Landing';
  if (spec.kind === 'livestock') return 'Market';
  if (spec.kind === 'fiber') return 'Shearing';
  return 'Harvest';
}
function seasonRowNote(spec) {
  if (!spec) return 'No season file';
  if (spec.kind === 'fishery') return 'Landing';
  if (spec.kind === 'livestock') return 'Market';
  if (spec.kind === 'fiber') return 'Shearing';
  if ((spec.s || []).length && spec.kind === 'perennial') return seasonPlantLabel(spec);
  return '';
}
function renderCropCalendar(countryId) {
  const el = document.getElementById('cv-crop-cal');
  if (!el) return;
  // The two food crops FAO lists in the most zones, then the main exports: Kenya's showed
  // tea, cut flowers and coffee, and never maize or beans (scripts/crop-calendar-facts.ps1).
  const staples = (countryFacts(countryId)?.staples || []).filter(Boolean);
  const crops = Array.from(new Set([...staples, ...farmExportsForCountry(countryId).slice(0, 3)])).slice(0, 5);
  if (!crops.length) { el.innerHTML = '<div class="cv-heat-empty">' + escapeHtml(countryFacts(countryId)?.farm?.note || 'No farm exports on file.') + '</div>'; return; }
  const months = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  let html = '<div class="cv-cal-months"><i></i>' + months.map(m => '<u>' + m + '</u>').join('') + '</div>';
  const fromFao = [], typical = [];
  for (const crop of crops) {
    const spec = seasonSpecForCountry(countryId, crop);
    (spec?.source === 'FAO' ? fromFao : typical).push(crop);
    const note = seasonRowNote(spec);
    const sow = new Set(spec?.s || []);
    const harvest = new Set(spec?.h || []);
    html += '<div class="cv-cal-row' + (note ? ' has-note' : '') + '"><i><b>' + escapeHtml(crop) + '</b>' + (note ? '<small>' + note + '</small>' : '') + '</i>' + Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      const cls = !spec ? 'cv-cal-cell empty'
        : harvest.has(m) ? (sow.has(m) ? 'cv-cal-cell hs' : 'cv-cal-cell h')
        : sow.has(m) ? 'cv-cal-cell s'
        : 'cv-cal-cell';
      return '<span class="' + cls + '"></span>';
    }).join('') + '</div>';
  }
  // Say where each row's months come from: FAO's calendar for this country, or typical
  // months for the crop where FAO does not list it (tea, cocoa, livestock...).
  const sourceNote = [
    fromFao.length ? 'FAO Crop Calendar for ' + fromFao.join(', ') + ' (months most growing zones share)' : '',
    typical.length ? 'typical months for ' + typical.join(', ') : ''
  ].filter(Boolean).join('; ');
  html += '<div class="cv-cal-legend"><span><em class="h"></em>Harvest / market</span><span><em class="s"></em>Planting / establish</span><span>' + escapeHtml(sourceNote) + '</span></div>';
  el.innerHTML = html;
}

/* ── Atlas text alternative: describe the canvas map for screen readers ── */
function renderAtlasAltText(countryId) {
  const el = document.getElementById('cv-atlas-alt');
  if (!el) return;
  const info = COUNTRY_INFO[countryId] || {};
  const gis = COUNTRY_GIS[countryId] || {};
  const parts = [];
  const uniq = list => Array.from(new Set(list.filter(Boolean)));
  // Water is clipped to the map's box, so it includes the neighbours' (Kenya's listed
  // Lake Eyasi and the Pangani) and Natural Earth's unnamed "River"/"Lake" pieces. Keep
  // named water with a point in, or within 15 km of, this country.
  const named = name => name && !/^(river|lake)$/i.test(name);
  // The strict test is one isPointInPath a point; the 15 km one walks the outline, so it
  // runs on every eighth point and only when no point is strictly inside.
  const points = coords => (coords || []).flat().filter(pt => Array.isArray(pt));
  const touches = coords => {
    const pts = points(coords);
    return pts.some(([lon, lat]) => insideCountry(countryId, lon, lat)) ||
      pts.some(([lon, lat], i) => i % 8 === 0 && insideCountry(countryId, lon, lat, 15));
  };
  const waterNames = list => uniq((list || []).filter(w => named(w.name) && touches(w.lines || w.rings)).map(w => w.name.replace(/ Res\.$/, ' Reservoir')));
  const places = uniq(atlasPlaces(countryId).filter(p => p.capital || (p.pop || 0) >= 200).map(p => p.name)).slice(0, 12);
  if (places.length) parts.push('Cities: ' + places.join(', '));
  const rivers = waterNames(gis.rivers);
  if (rivers.length) parts.push('Rivers: ' + rivers.join(', '));
  const lakes = waterNames(gis.lakes);
  if (lakes.length) parts.push('Lakes: ' + lakes.join(', '));
  const cityKeys = new Set(places.map(normalizeName));
  const marks = uniq([
    ...atlasFeaturePoints(countryId).map(l => l.name),
    ...atlasInfraForCountry(countryId).map(l => l.label)
  ]).filter(name => !cityKeys.has(normalizeName(name))).slice(0, 10);
  if (marks.length) parts.push('Landmarks, ports and airports: ' + marks.join(', '));
  el.textContent = 'Map of ' + (info.name || countryId) + ' with shaded relief. ' + (parts.length ? parts.join('. ') + '.' : '');
}

/* ── Deep links: #/ke/news, #/ke/farmers, #/ke/investors, #/ke/diaspora, #/ke/atlas ── */
const ROUTE_AUDIENCES = ['farmers', 'investors', 'diaspora'];
const ROUTE_PANELS = { news: 0, signals: 1, atlas: 2 };
let routeApplying = false;
function syncRoute() {
  if (routeApplying) return;
  const wireView = document.getElementById('wire-view');
  let hash = '';
  if (wireView?.classList.contains('open')) hash = '#/wire';
  else if (countryView.classList.contains('open') && activeCountryMap) {
    hash = '#/' + activeCountryMap.countryId;
    if (activePanelIndex === 0) hash += '/news';
    else if (activePanelIndex === 2) hash += '/atlas';
    else {
      const audience = audienceSelect?.value || document.body.dataset.audience;
      hash += '/' + (ROUTE_AUDIENCES.includes(audience) ? audience : 'farmers');
    }
  }
  if ((location.hash || '') === hash) return;
  // Opening an overlay creates one browser-history entry so the device Back button
  // closes it. Changes inside that overlay replace the entry; otherwise every tab,
  // lens and country hop becomes another Back press. Closing also replaces the route,
  // which prevents the country the reader just left from reopening on the next Back.
  if (hash && !location.hash) location.hash = hash;
  else history.replaceState(null, '', location.pathname + location.search + hash);
}

function applyRoute() {
  routeApplying = true;
  try {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const wireView = document.getElementById('wire-view');
    if (!parts.length) {
      if (wireView?.classList.contains('open') && window.__wireClose) window.__wireClose();
      if (countryView.classList.contains('open')) closeCountry();
    } else if (parts[0] === 'wire') {
      if (countryView.classList.contains('open')) closeCountry();
      if (window.__wireOpen && wireView && !wireView.classList.contains('open')) window.__wireOpen('All');
    } else if (COUNTRY_INFO[parts[0]]) {
      if (wireView?.classList.contains('open') && window.__wireClose) window.__wireClose();
      const routeKey = parts[1] || '';
      const audience = ROUTE_AUDIENCES.includes(routeKey) ? routeKey : '';
      const panel = audience ? 1 : (Object.prototype.hasOwnProperty.call(ROUTE_PANELS, routeKey) ? ROUTE_PANELS[routeKey] : 0);
      if (audience && audienceSelect) audienceSelect.value = audience;
      const alreadyOpen = countryView.classList.contains('open') && activeCountryMap?.countryId === parts[0];
      if (!alreadyOpen) openCountry(parts[0], document.activeElement, { panel, audience });
      else {
        if (audience && audienceSelect) audienceSelect.value = audience;
        setPanel(panel);
        updateAudienceMeta();
        renderAudienceKpis(parts[0], COUNTRY_INFO[parts[0]]);
      }
    }
  } finally { routeApplying = false; }
}
window.addEventListener('hashchange', applyRoute);
if (location.hash) applyRoute();
const directStoryId = new URLSearchParams(location.search).get('story');
if (directStoryId) {
  const directStory = findPublishedStory(directStoryId);
  if (directStory) {
    // setTimeout, not requestAnimationFrame: rAF does not run while the tab is
    // hidden, and a shared link is very often opened into a background tab - from a
    // chat app, or by a browser restoring tabs at launch. The story then sat closed
    // until the reader happened to focus it. Opening a story is not an animation.
    setTimeout(() => openStoryReader(directStory.story, directStory.context, document.body), 0);
  }
}

/* ── PWA: installable shell, offline fallback (https/localhost only) ── */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

/* ── Self-test harness: open ?selftest=1 to run data-integrity + render-smoke checks.
   The checks live in selftest.js and load only with that flag: they were ~30 KB of
   every reader's app.js, run by nobody but the desk. ── */
if (new URLSearchParams(location.search).has('selftest')) {
  const selftestScript = document.createElement('script');
  selftestScript.src = 'selftest.js?v=' + (window.ASJ_ASSET_VERSION || '1');
  document.head.appendChild(selftestScript);
}
// ?sweep=1 reads every country and view for content problems (sweep.js); a report for a
// person, loaded only with the flag.
if (new URLSearchParams(location.search).has('sweep')) {
  const sweepScript = document.createElement('script');
  sweepScript.src = 'sweep.js?v=' + (window.ASJ_ASSET_VERSION || '1');
  document.head.appendChild(sweepScript);
}/* -- Sign-up ---------------------------------------------------------------
   The journal has no way to bring a reader back. A bookmark is not a relationship,
   and a watchlist that lives in localStorage is lost the first time someone clears
   their browser or picks up a different phone.

   There is exactly one signup. The "Your desk" strip already had one, but it only
   appeared after a reader followed two countries, which is a long way past the moment
   they might have said yes. This mounts the same record and the same sync on the front
   page and in the Wire, where readers actually are. Two forms writing two records
   would have made the list impossible to trust.

   Nothing renders unless a backend is configured - Supabase, or a plain list endpoint
   in data/newsletter-config.js - because a form that quietly discards what people type
   is worse than no form. */
(function frontPageSignup(){
  if (!deskSignupConfig()) return;
  const pitch = String(window.ASJ_NEWSLETTER?.pitch || 'One morning email with the day\'s stories.');

  // Mounted where there is room to scroll: the phone front page, and the Wire, where
  // the reader has just finished the front page. The desktop side columns are capped
  // at the height of the map, so a form there would simply be clipped.
  function hosts() {
    return [document.getElementById('home-front-mobile'), document.getElementById('wire-signup')].filter(Boolean);
  }

  function mount(host) {
    if (host.querySelector('.asj-signup')) return;
    const form = document.createElement('form');
    form.className = 'asj-signup';
    form.noValidate = true;
    if (getDeskSignup().email) {
      form.innerHTML = '<p class="asj-signup-done">You are on the morning list.</p>';
      host.appendChild(form);
      return;
    }
    form.innerHTML =
      '<p class="asj-signup-pitch">' + escapeHtml(pitch) + '</p>' +
      '<div class="asj-signup-row">' +
        '<input class="asj-signup-input" type="email" name="email" autocomplete="email" ' +
          'inputmode="email" required placeholder="you@example.com" aria-label="Email address">' +
        '<button class="asj-signup-btn" type="submit">Join</button>' +
      '</div>' +
      '<p class="asj-signup-note" role="status"></p>';
    host.appendChild(form);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const input = form.querySelector('.asj-signup-input');
      const note = form.querySelector('.asj-signup-note');
      const email = String(input.value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        note.textContent = 'That does not look like an email address.';
        input.focus();
        return;
      }
      const audience = preferredDeskAudience();
      note.textContent = 'Sending...';
      // Saved locally first, so a reader who signs up on a train keeps their place in
      // the paper even if the request never lands.
      saveDeskSignup({ email, audience, synced: false, watchlist: getWatchlist(), savedAt: new Date().toISOString() });
      try {
        const result = await syncDeskSignup(email, audience);
        saveDeskSignup({ email, audience, synced: !!result.synced, duplicate: !!result.duplicate, watchlist: getWatchlist(), savedAt: new Date().toISOString() });
        form.innerHTML = '<p class="asj-signup-done">Thank you. The next edition lands before dawn.</p>';
      } catch {
        note.textContent = 'That did not go through. Try again in a moment.';
      }
    });
  }

  function mountAll() { hosts().forEach(mount); }
  mountAll();
  // Both hosts have their innerHTML rewritten when they repaint, which removes the
  // form. Re-mount whenever that happens rather than assuming one pass is enough.
  window.addEventListener('asj:front-painted', mountAll);
  document.addEventListener('click', () => setTimeout(mountAll, 250));
}());

/* ── The deferred half of the edition ──────────────────────────────────────
   data/briefs.js is an index: headlines, deks, topics, dates, source names and lens
   scores - 37KB gzipped, enough for the front page, the wire list, the map, the
   counts and the ranking. The prose is 153KB more, and none of it is needed until a
   reader opens something. It used to be in front of the map.

   This loads it once the page is up and merges it into the SAME story objects the
   rest of the app already holds, so nothing has to know the data arrived in two
   pieces. Everything below degrades honestly in the window before it lands: deks
   show, lens ranking is exact, why lines fall back to their topic sentence, and an
   opened story waits rather than rendering half of itself. */
(function loadDeferredHalf(){
  let resolveReady;
  let started = false;
  window.ASJ_FULL_READY = new Promise(r => { resolveReady = r; });
  window.ASJ_FULL_LOADED = false;
  window.ASJ_FULL_SETTLED = false;
  // Data saver: the phone asked to save data, or the connection is 3G or slower. The
  // prose for every story (~146 KB gzipped, new every day) is then not fetched on every
  // visit; an opened story fetches its own page instead (see openStoryReader), and Wire
  // search fetches the prose only once the reader actually searches.
  const conn = navigator.connection;
  window.ASJ_SAVE_DATA = !!(conn && (conn.saveData || /^(slow-2g|2g|3g)$/.test(String(conn.effectiveType || ''))));
  const settle = ok => { window.ASJ_FULL_SETTLED = true; resolveReady(ok); };

  function merge(full) {
    if (!full || !full.byCountry) return false;
    let merged = 0;
    for (const [code, records] of Object.entries(full.byCountry)) {
      const target = AI_BRIEFS[code];
      if (!Array.isArray(target) || !Array.isArray(records)) continue;
      const byId = new Map(records.map(r => [String(r && r.articleId), r]));
      for (const story of target) {
        const rec = byId.get(String(story && story.articleId));
        if (!rec) continue;
        // Assign onto the existing object: the wire index, the registry and any open
        // view already hold this reference.
        for (const [k, v] of Object.entries(rec)) {
          if (k === 'articleId') continue;
          story[k] = v;
        }
        merged++;
      }
    }
    hydrateBriefs(AI_BRIEFS);
    window.ASJ_FULL_LOADED = true;
    // Search matches against a folded haystack built when the index was built, and it
    // had no prose in it until now. Anything already built has to be rebuilt or
    // full-text search silently keeps missing.
    window.dispatchEvent(new CustomEvent('asj:full-loaded', { detail: { merged } }));
    return merged > 0;
  }

  function start() {
    if (started) return;
    started = true;
    if (window.UNITED_AFRICA_BRIEFS_FULL) { merge(window.UNITED_AFRICA_BRIEFS_FULL); settle(true); return; }
    const s = document.createElement('script');
    s.src = 'data/briefs-full.js?v=' + (window.ASJ_ASSET_VERSION || '1');
    s.async = true;
    s.onload = () => { merge(window.UNITED_AFRICA_BRIEFS_FULL); settle(true); };
    // A failed load is not fatal: headlines, deks and citations still render, and an
    // opened story falls back to its dek. Better a thin paper than a blank one.
    s.onerror = () => { window.ASJ_FULL_LOADED = false; settle(false); };
    document.head.appendChild(s);
  }
  window.ASJ_LOAD_FULL = () => { start(); return window.ASJ_FULL_READY; };
  if (window.ASJ_SAVE_DATA) return;

  // After first paint, not during it. requestIdleCallback where it exists, a timeout
  // where it does not - and never rAF, which does not run in a hidden tab, so a page
  // restored into a background tab would sit with no prose until it was looked at.
  if (document.readyState === 'complete') {
    (window.requestIdleCallback || (f => setTimeout(f, 60)))(start, { timeout: 1500 });
  } else {
    window.addEventListener('load', () => {
      (window.requestIdleCallback || (f => setTimeout(f, 60)))(start, { timeout: 1500 });
    }, { once: true });
  }
}());

// seam-v1: a deep link (#/ke) can render the News panel before the prose half of the
// edition arrives. Repaint the open country's stories once it lands so expanded rows
// carry the full first paragraph rather than the dek.
window.addEventListener('asj:full-loaded', () => {
  try {
    if (countryView.classList.contains('open') && activeCountryMap?.countryId) {
      const open = document.querySelector('#cv-cards .cv-news-summary[aria-expanded="true"]');
      if (!open) renderBriefDesk(activeCountryMap.countryId);
    }
  } catch {}
});
