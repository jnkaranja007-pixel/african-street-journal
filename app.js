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
  const why = String(raw?.why || '').trim() || briefWhy(story);
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

// Reference company lists: cap controls tile size. Seeded `change` values are not
// presented as current market movement; only fresh daily data may show direction.
const MARKETS_SEED = {
  ng: { exchange:'NGX', name:'Nigerian Exchange', companies:[
    {t:'AIRTELAFRI',cap:7.0,change:0.4},{t:'DANGCEM',cap:8.5,change:1.8},{t:'BUACEMENT',cap:4.2,change:0.9},
    {t:'MTNN',cap:5.0,change:-0.6},{t:'SEPLAT',cap:1.6,change:2.4},{t:'GTCO',cap:1.6,change:2.1},
    {t:'ZENITHBANK',cap:1.5,change:-0.3},{t:'UBA',cap:1.1,change:0.8},{t:'NESTLE',cap:0.9,change:-1.1},{t:'NB',cap:0.8,change:0.2} ] },
  za: { exchange:'JSE', name:'Johannesburg', companies:[
    {t:'NPN',cap:12,change:1.2},{t:'CFR',cap:11,change:0.5},{t:'AGL',cap:6,change:0.9},{t:'FSR',cap:5.5,change:-0.4},
    {t:'SBK',cap:5,change:0.7},{t:'CPI',cap:4.5,change:1.6},{t:'MTN',cap:4,change:1.5},{t:'VOD',cap:3,change:-0.2},
    {t:'SOL',cap:2.2,change:-2.1},{t:'BTI',cap:5,change:0.3} ] },
  ke: { exchange:'NSE', name:'Nairobi', companies:[
    {t:'SCOM',cap:10,change:1.1},{t:'EQTY',cap:2.0,change:0.6},{t:'KCB',cap:1.6,change:-0.8},{t:'EABL',cap:1.4,change:0.3},
    {t:'COOP',cap:1.0,change:0.5},{t:'ABSA',cap:0.8,change:0.2},{t:'SBIC',cap:0.7,change:-0.4},{t:'BAT',cap:0.9,change:0.7} ] },
  eg: { exchange:'EGX', name:'Egyptian Exchange', companies:[
    {t:'COMI',cap:6,change:0.9},{t:'TMGH',cap:3,change:0.6},{t:'SWDY',cap:1.8,change:1.4},{t:'HRHO',cap:1.2,change:-1.2},
    {t:'ETEL',cap:1.0,change:0.4},{t:'EFIH',cap:0.8,change:-0.5},{t:'FWRY',cap:0.6,change:-0.9},{t:'ABUK',cap:0.9,change:1.1} ] },
  ma: { exchange:'CSE', name:'Casablanca', companies:[
    {t:'IAM',cap:9,change:-0.7},{t:'ATW',cap:8,change:0.5},{t:'BCP',cap:4,change:0.4},{t:'LHM',cap:3,change:1.0},
    {t:'BOA',cap:2,change:0.2},{t:'MSA',cap:1.5,change:0.8},{t:'CMA',cap:1.2,change:-0.3},{t:'GAZ',cap:1.0,change:0.6} ] },
  gh: { exchange:'GSE', name:'Ghana', companies:[
    {t:'MTNGH',cap:12,change:0.7},{t:'SCB',cap:1.5,change:0.6},{t:'GCB',cap:1.0,change:0.3},{t:'EGH',cap:1.0,change:-0.4},
    {t:'TOTAL',cap:0.5,change:0.5},{t:'GOIL',cap:0.4,change:-0.2},{t:'CAL',cap:0.4,change:0.9} ] },
  tn: { exchange:'BVMT', name:'Tunis', companies:[
    {t:'SFBT',cap:3,change:0.4},{t:'BIAT',cap:2.5,change:0.6},{t:'POULINA',cap:1.5,change:-0.3},{t:'ATB',cap:1.0,change:0.2},
    {t:'BT',cap:1.2,change:0.5},{t:'TELNET',cap:0.6,change:1.1} ] },
  mu: { exchange:'SEM', name:'Mauritius', companies:[
    {t:'MCBG',cap:4,change:0.5},{t:'SBMH',cap:1.5,change:-0.2},{t:'IBL',cap:1.2,change:0.7},{t:'ENL',cap:0.9,change:0.3},
    {t:'CIEL',cap:0.7,change:-0.4},{t:'ALTEO',cap:0.6,change:0.8} ] },
  ci: { exchange:'BRVM', name:'Abidjan · regional', companies:[
    {t:'SNTS',cap:8,change:0.6},{t:'ETIT',cap:2.5,change:-0.3},{t:'ORAC',cap:2,change:0.4},{t:'SGBC',cap:1.5,change:0.2},
    {t:'SLBC',cap:0.9,change:0.7},{t:'BOAB',cap:0.8,change:-0.4},{t:'NTLC',cap:0.7,change:0.3},{t:'PALC',cap:0.6,change:1.0} ] },
  tz: { exchange:'DSE', name:'Dar es Salaam', companies:[
    {t:'TBL',cap:2.5,change:0.4},{t:'NMB',cap:1.8,change:0.9},{t:'CRDB',cap:1.6,change:1.2},{t:'VODA',cap:1.2,change:-0.3},
    {t:'TPCC',cap:1.0,change:0.2},{t:'TCC',cap:0.8,change:-0.5},{t:'SWIS',cap:0.4,change:0.6} ] },
  ug: { exchange:'USE', name:'Uganda', companies:[
    {t:'MTNU',cap:3,change:0.7},{t:'SBU',cap:1.5,change:0.4},{t:'UMEME',cap:0.6,change:-0.6},{t:'DFCU',cap:0.4,change:0.3},
    {t:'BATU',cap:0.3,change:0.2},{t:'EBL',cap:0.5,change:0.8} ] },
  zw: { exchange:'ZSE', name:'Zimbabwe', companies:[
    {t:'DLTA',cap:2.0,change:0.5},{t:'ECO',cap:1.5,change:-0.4},{t:'INN',cap:1.2,change:0.6},{t:'OMU',cap:0.9,change:0.2},
    {t:'SEED',cap:0.7,change:0.9},{t:'CBZ',cap:0.6,change:-0.3},{t:'NMBZ',cap:0.4,change:0.4} ] },
  bw: { exchange:'BSE', name:'Botswana', companies:[
    {t:'FNBB',cap:1.5,change:0.4},{t:'LETSHEGO',cap:0.9,change:-0.5},{t:'BIHL',cap:0.7,change:0.3},{t:'ABSA',cap:0.6,change:0.2},
    {t:'SCBB',cap:0.5,change:-0.2},{t:'SEFA',cap:0.4,change:0.7} ] },
  zm: { exchange:'LuSE', name:'Lusaka', companies:[
    {t:'ZCCM',cap:1.5,change:0.8},{t:'ZANACO',cap:0.8,change:0.3},{t:'CEC',cap:0.7,change:-0.4},{t:'ZSUG',cap:0.6,change:0.5},
    {t:'LAFA',cap:0.5,change:-0.2},{t:'REIZ',cap:0.3,change:0.6} ] },
  rw: { exchange:'RSE', name:'Rwanda', companies:[
    {t:'BOK',cap:1.0,change:0.5},{t:'BRALIRWA',cap:0.5,change:-0.3},{t:'IMR',cap:0.4,change:0.4},{t:'CTL',cap:0.3,change:0.2},
    {t:'RHB',cap:0.3,change:0.7} ] },
  na: { exchange:'NSX', name:'Namibia', companies:[
    {t:'CAP',cap:0.9,change:0.4},{t:'FNB',cap:1.0,change:0.3},{t:'NBS',cap:0.8,change:-0.2},{t:'ORY',cap:0.4,change:0.6},
    {t:'LHN',cap:0.3,change:0.2},{t:'NHL',cap:0.3,change:-0.4} ] }
};
function marketsForCountry(id){
  const live = LIVE_MARKETS[id];
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

const FARM_EXPORTS = {
  so: ['Sesame', 'Banana', 'Beef'],
  ug: ['Coffee', 'Fish', 'Tea'],
  ke: ['Tea', 'Cut flowers', 'Coffee'],
  tz: ['Tobacco', 'Coffee', 'Cashew'],
  et: ['Coffee', 'Sesame', 'Pulses'],
  er: ['Sorghum', 'Millet', 'Sesame'],
  ci: ['Cocoa', 'Cashew', 'Coffee'],
  gh: ['Cocoa', 'Cashew', 'Shea'],
  sn: ['Groundnuts', 'Fish', 'Cotton'],
  ng: ['Cocoa', 'Sesame', 'Cashew'],
  ma: ['Citrus', 'Tomatoes', 'Olives'],
  za: ['Citrus', 'Grapes', 'Wine'],
  eg: ['Citrus', 'Potatoes', 'Cotton'],
  dz: ['Dates', 'Citrus', 'Olive oil'],
  ly: ['Dates', 'Olives', 'Citrus'],
  ao: ['Coffee', 'Cassava', 'Sesame'],
  cd: ['Palm oil', 'Coffee', 'Cocoa'],
  cg: ['Cassava', 'Palm oil', 'Cocoa'],
  ga: ['Palm oil', 'Cocoa', 'Rubber'],
  gq: ['Cocoa', 'Cassava', 'Palm oil'],
  cf: ['Cotton', 'Coffee', 'Cassava'],
  rw: ['Coffee', 'Tea', 'Pyrethrum'],
  ss: ['Sorghum', 'Sesame', 'Maize'],
  sd: ['Sesame', 'Groundnuts', 'Cotton'],
  td: ['Cotton', 'Sesame', 'Groundnuts'],
  zm: ['Tobacco', 'Maize', 'Sugar'],
  zw: ['Tobacco', 'Soya', 'Cotton'],
  mz: ['Cashew', 'Prawns', 'Tobacco'],
  bw: ['Beef', 'Sorghum', 'Pulses'],
  na: ['Beef', 'Grapes', 'Fish'],
  sz: ['Sugar', 'Citrus', 'Maize'],
  ls: ['Maize', 'Sorghum', 'Wool'],
  cm: ['Cocoa', 'Coffee', 'Banana'],
  eh: ['Fish', 'Dates', 'Beef'],
  ml: ['Cotton', 'Millet', 'Shea'],
  ne: ['Cowpea', 'Millet', 'Onion'],
  mr: ['Fish', 'Dates', 'Millet'],
  bf: ['Cotton', 'Sesame', 'Shea'],
  gn: ['Coffee', 'Groundnuts', 'Cashew'],
  gw: ['Cashew', 'Rice', 'Groundnuts'],
  gm: ['Groundnuts', 'Fish', 'Millet'],
  mg: ['Vanilla', 'Cloves', 'Coffee'],
  mw: ['Tobacco', 'Sugar', 'Tea'],
  tn: ['Olive oil', 'Dates', 'Citrus'],
  lr: ['Rubber', 'Cocoa', 'Coffee'],
  sl: ['Coffee', 'Cocoa', 'Palm oil'],
  bi: ['Coffee', 'Tea', 'Cotton'],
  bj: ['Cotton', 'Cashew', 'Pineapple'],
  tg: ['Cotton', 'Cocoa', 'Coffee'],
  st: ['Cocoa', 'Coffee', 'Palm oil'],
  cv: ['Fish', 'Banana', 'Sugar'],
  dj: ['Beef', 'Sorghum', 'Millet'],
  km: ['Cloves', 'Vanilla', 'Banana'],
  mu: ['Sugar', 'Tea', 'Fish'],
  sc: ['Fish', 'Vanilla', 'Banana']
};

const ISLAND_FULLSCREEN_BOUNDS = {
  mu: { minX: 57.28, maxX: 57.88, minY: 19.92, maxY: 20.58 },
  sc: { minX: 55.34, maxX: 55.56, minY: 4.54, maxY: 4.82 },
  cv: { minX: -25.42, maxX: -22.52, minY: -17.45, maxY: -14.72 },
  km: { minX: 43.12, maxX: 44.58, minY: 11.18, maxY: 12.45 },
  st: { minX: 6.40, maxX: 7.58, minY: -1.78, maxY: 0.12 }
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

const STORY_PINS = {
  ke: [
    { title: 'Nairobi matatu routes test new fare pressure', place: 'Nairobi', type: 'Transport', popularity: 96, lon: 36.8219, lat: -1.2921 },
    { title: 'Lake Victoria fishing towns watch water levels', place: 'Kisumu', type: 'Climate', popularity: 88, lon: 34.7617, lat: -0.1022 },
    { title: 'Mombasa traders count port delays after rain', place: 'Mombasa', type: 'Business', popularity: 74, lon: 39.6682, lat: -4.0435 }
  ],
  ng: [
    { title: 'Lagos commuters track bridge repairs in real time', place: 'Lagos', type: 'Transport', popularity: 94, lon: 3.3792, lat: 6.5244 },
    { title: 'Abuja markets react to food price swings', place: 'Abuja', type: 'Markets', popularity: 83, lon: 7.4951, lat: 9.0579 }
  ],
  cd: [
    { title: 'Kinshasa neighborhoods map flood-prone streets', place: 'Kinshasa', type: 'Climate', popularity: 91, lon: 15.2663, lat: -4.4419 },
    { title: 'River transport crews report shifting Congo routes', place: 'Mbandaka', type: 'River desk', popularity: 79, lon: 18.2603, lat: 0.0478 }
  ]
};

// One point per country for each landmark ([lon, lat] keyed by country), so a feature
// shared by several countries is marked inside each of them. With a single point, the
// inside-the-outline check kept Lake Victoria only in Uganda, the Nile only in Sudan
// and the Sahara only in Niger, and Kilimanjaro - in Tanzania - was drawn in Kenya.
// Every country has at least one; the self-test checks both rules for all 55.
const LANDMARK_POINTS = [
  { name: 'Lake Victoria', kind: 'water', at: { ke: [34.35, -0.3], ug: [32.9, -0.4], tz: [32.9, -2.1] } },
  { name: 'Mount Kenya', kind: 'mountain', at: { ke: [37.3075, -0.1521] } },
  { name: 'Mount Kilimanjaro', kind: 'mountain', at: { tz: [37.3556, -3.0674] } },
  { name: 'Nile River', kind: 'water', at: { eg: [32.64, 25.7], sd: [32.55, 16.5], ss: [31.65, 6.8], ug: [31.75, 2.3] } },
  { name: 'Sahara Desert', kind: 'landmark', at: { dz: [3.5, 26.5], ly: [16.0, 25.0], eg: [28.0, 25.0], td: [18.5, 19.5], ne: [10.0, 19.5], ml: [-2.0, 20.5], mr: [-10.0, 21.5], sd: [28.5, 19.0], eh: [-12.5, 24.5], tn: [9.6, 31.6] } },
  { name: 'Congo Basin', kind: 'landmark', at: { cd: [22.0, -1.5], cg: [15.8, 0.5], cf: [17.5, 3.7], cm: [14.5, 3.0], ga: [12.0, -0.5] } },
  { name: 'Atlas Mountains', kind: 'mountain', at: { ma: [-5.0, 31.5], dz: [2.5, 34.5], tn: [8.8, 35.3] } },
  { name: 'Lake Tanganyika', kind: 'water', at: { tz: [29.9, -6.0], bi: [29.35, -3.9], cd: [29.3, -6.0], zm: [30.9, -8.5] } },
  { name: 'Lake Malawi', kind: 'water', at: { mw: [34.6, -12.0], mz: [34.75, -12.9], tz: [34.55, -10.4] } },
  { name: 'Victoria Falls', kind: 'water', at: { zm: [25.85, -17.92], zw: [25.86, -17.93] } },
  { name: 'Lake Chad', kind: 'water', at: { td: [14.0, 13.3], ne: [13.25, 13.75], ng: [13.6, 12.9], cm: [14.4, 12.6] } },
  { name: 'Lake Turkana', kind: 'water', at: { ke: [36.1, 3.4], et: [36.05, 4.6] } },
  { name: 'Lake Volta', kind: 'water', at: { gh: [-0.15, 7.4] } },
  { name: 'Okavango Delta', kind: 'landmark', at: { bw: [22.9, -19.3] } },
  { name: 'Mount Cameroon', kind: 'mountain', at: { cm: [9.17, 4.2] } },
  { name: 'Kalandula Falls', kind: 'water', at: { ao: [15.99, -9.07] } },
  { name: 'Lake Nokoue', kind: 'water', at: { bj: [2.45, 6.45] } },
  { name: 'Sindou Peaks', kind: 'landmark', at: { bf: [-5.17, 10.67] } },
  { name: 'Pico do Fogo', kind: 'mountain', at: { cv: [-24.35, 14.95] } },
  { name: 'Mount Karthala', kind: 'mountain', at: { km: [43.26, -11.75] } },
  { name: 'Tai National Park', kind: 'landmark', at: { ci: [-7.3, 5.75] } },
  { name: 'Lake Assal', kind: 'water', at: { dj: [42.42, 11.65] } },
  { name: 'Pico Basile', kind: 'mountain', at: { gq: [8.78, 3.58] } },
  { name: 'Mount Soira', kind: 'mountain', at: { er: [39.63, 14.65] } },
  { name: 'Sibebe Rock', kind: 'mountain', at: { sz: [31.18, -26.28] } },
  { name: 'Gambia River', kind: 'water', at: { gm: [-15.5, 13.45] } },
  { name: 'Fouta Djallon', kind: 'mountain', at: { gn: [-12.0, 11.3] } },
  { name: 'Cacheu Mangroves', kind: 'water', at: { gw: [-16.2, 12.25] } },
  { name: 'Maletsunyane Falls', kind: 'water', at: { ls: [28.07, -29.86] } },
  { name: 'Sapo National Park', kind: 'landmark', at: { lr: [-8.6, 5.3] } },
  { name: 'Tsingy de Bemaraha', kind: 'landmark', at: { mg: [44.8, -18.7] } },
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

const dpr = Math.min(3, window.devicePixelRatio || 1);
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
  wash.addColorStop(0, 'rgba(22,30,24,0.5)');
  wash.addColorStop(0.55, 'rgba(13,18,15,0.34)');
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
  const pad = 3 * u;
  // Other markers' rings are obstacles too.
  for (const o of islandHitTargets) placed.push({ x0: o.cx - ring, y0: o.cy - ring, x1: o.cx + ring, y1: o.cy + ring });
  for (const t of islandHitTargets) {
    const base = ISLAND_MARKERS[t.id].prefer || [t.side];
    const sides = base.concat(['above', 'below', 'right', 'left'].filter(s => !base.includes(s)));
    let pick = null;
    for (const mult of [1, 1.8, 2.6]) {
      for (const side of sides) {
        const c = islandLabelRect(t, side, gap * mult, w, h);
        const off = c.r.x0 < islandLabelBounds.x0 || c.r.x1 > islandLabelBounds.x1 || c.r.y0 < 4 || c.r.y1 > 997;
        if (off || rectHitsLand(c.r, pad) || placed.some(q => rectsOverlap(c.r, q, pad * 0.5))) continue;
        pick = c; break;
      }
      if (pick) break;
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
    ctx.fillStyle = hovered ? 'rgba(232,246,233,0.98)' : 'rgba(170,196,174,0.78)';
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
const HAIR = 1 / dpr;
function strokeBorders(x, shape) {
  x.lineWidth = Math.max(0.55, 1.6 * HAIR); x.strokeStyle = 'rgba(9,26,11,0.82)'; x.stroke(shape);
}
function paintShade() {
  // Soft contact shadow under the whole landmass: depth, not decoration.
  const [c, x] = offscreen();
  x.translate(0.41, 2);
  x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 26; x.shadowOffsetY = 7;
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
  x.fillStyle = '#121815'; x.fill(LAKES);
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
function drawCountryOverlay(c, fill, lift) {
  ctx.save(); ctx.translate(0.41, 2);
  if (lift) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 2; }
  ctx.fillStyle = fill; ctx.fill(c.shape);
  ctx.shadowColor = 'transparent';
  if (LAKES) { ctx.save(); ctx.clip(c.shape); ctx.fillStyle = '#121815'; ctx.fill(LAKES); ctx.restore(); }
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
  for (let i = 0; i < paths.length; i++) {
    const c = paths[i];
    const t = c.dur === 0 ? 1 : Math.max(0, Math.min(1, (elapsed - c.delay) / c.dur));
    if (t === 0) continue;
    const eased = easeOut(t);
    ctx.save();
    ctx.translate(0.41 + c.sx * (1 - eased), 2 + c.sy * (1 - eased));
    ctx.globalAlpha = Math.min(1, t / 0.18);
    ctx.fillStyle = FRONT_GREEN;
    ctx.fill(c.shape);
    strokeBorders(ctx, c.shape);
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
layoutPhoneMap();
window.addEventListener('resize', () => requestAnimationFrame(layoutPhoneMap));
(phoneMapMQ.addEventListener ? phoneMapMQ.addEventListener('change', layoutPhoneMap) : phoneMapMQ.addListener(layoutPhoneMap));

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
      if (activeCountryMap) drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath, activeCountryMap.mapPins || activeCountryMap.stories, activeCountryMap.landmarks);
    }, 80);
  }).observe(countryMapCanvas);
}
const layerPills = Array.from(document.querySelectorAll('.cv-layer-pill'));
const layerStatus = document.getElementById('cv-layer-status');
const mapToolbarRegion = document.getElementById('cv-map-toolbar-region');
const mapToolbarCountry = document.getElementById('cv-map-toolbar-country');
const mapLayers = { terrain: true, water: true, places: true, rail: true, infra: true, labels: true };
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
    drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath, activeCountryMap.mapPins || activeCountryMap.stories, activeCountryMap.landmarks);
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
    const lens = mode === 'investors' ? 'capital lens' : mode === 'diaspora' ? 'diaspora lens' : 'farmer lens';
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
      drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath, activeCountryMap.mapPins || activeCountryMap.stories, activeCountryMap.landmarks);
    }
  });
}

function updateLayerStatus() {
  const active = Object.values(mapLayers).filter(Boolean).length;
  if (layerStatus) layerStatus.textContent = active + ' active overlay' + (active === 1 ? '' : 's');
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
    drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath, activeCountryMap.mapPins || activeCountryMap.stories, activeCountryMap.landmarks);
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
  if (ROUTE_AUDIENCES.includes(options.audience) && audienceSelect) audienceSelect.value = options.audience;
  ensureCountryData(countryId);
  lastFocus = sourceElement;
  document.getElementById('cv-region').textContent = info.region;
  document.getElementById('cv-name').textContent = info.name;
  document.getElementById('cv-capital').textContent = info.capital;
  document.getElementById('cv-iso').textContent = info.cc.toUpperCase();
  updateCountryFileSummary(info);
  renderAnthem(countryId, info);
  renderHeaderMeta(countryId, info);

  const flag = document.getElementById('cv-flag');
  flag.hidden = false;
  flag.src = 'https://flagcdn.com/w160/' + info.cc + '.png';
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
  backBtn.focus();
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

function updateAudienceMeta() {
  const meta = document.getElementById('cv-audience-meta');
  const mode = audienceSelect?.value || 'farmers';
  document.body.dataset.audience = mode;
  audienceTabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.audience === mode)));
  if (meta) meta.textContent = mode === 'investors' ? 'capital lens' : mode === 'diaspora' ? 'diaspora lens' : 'farmer lens';
  restoreInfoGridPosition(mode);
}

function showMobilePanelStart() {
  if (!mobileDossierMedia.matches || !countryView.classList.contains('open')) return;
  const body = document.querySelector('.cv-body');
  const carousel = document.querySelector('.cv-carousel');
  const headerHeight = document.querySelector('.cv-header')?.offsetHeight || 0;
  const navHeight = document.getElementById('cv-dots')?.offsetHeight || 0;
  requestAnimationFrame(() => {
    const top = Math.max(0, (body?.offsetTop || 0) + (carousel?.offsetTop || 0) - headerHeight - navHeight);
    countryView.scrollTo({ top, behavior: 'auto' });
  });
}

function showMobileSignalStart() {
  showMobilePanelStart();
}

backBtn.addEventListener('click', closeCountry);
document.getElementById('cv-prev')?.addEventListener('click', () => openCountryByOffset(-1));
document.getElementById('cv-next')?.addEventListener('click', () => openCountryByOffset(1));
document.getElementById('cv-map-prev')?.addEventListener('click', () => openCountryByOffset(-1));
document.getElementById('cv-map-next')?.addEventListener('click', () => openCountryByOffset(1));
dots.forEach(dot => dot.addEventListener('click', () => {
  setPanel(Number(dot.dataset.panel));
  syncRoute();
  showMobilePanelStart();
}));
document.getElementById('cv-dots')?.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0
    : event.key === 'End' ? dots.length - 1
    : (activePanelIndex + (event.key === 'ArrowLeft' ? -1 : 1) + dots.length) % dots.length;
  setPanel(next);
  dots[next]?.focus();
  syncRoute();
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
  showMobileSignalStart();
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
  requestAnimationFrame(() => drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath, activeCountryMap.mapPins || activeCountryMap.stories, activeCountryMap.landmarks));
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
  const mapPins = mapPinsForCountry(countryId, stories);
  activeCountryMap = { countryId, countryPath, stories, landmarks, mapPins };
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
  renderCropCalendar(countryId);
  renderAtlasAltText(countryId, landmarks);
  if (activePanelIndex === 2 || mapPortal?.classList.contains('active')) {
    preloadAdjacentCountryData(countryId);
  }
  // Fullscreen country changes must replace the header and final map in the same paint.
  if (mapPortal?.classList.contains('active')) {
    drawCountryMap(countryId, countryPath, mapPins, landmarks);
  } else {
    requestAnimationFrame(() => drawCountryMap(countryId, countryPath, mapPins, landmarks));
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
    rows.push({ tag: inv.source === 'World Bank' ? 'World Bank ' + (inv.gdpYear || '') : 'Desk file', text: econ });
  }

  const profile = marketProfileForCountry(countryId);
  rows.push(profile.exchange
    ? { tag: 'Exchange directory', text: 'Listed market: <b>' + escapeHtml(profile.exchange) + '</b> · ' + escapeHtml(profile.name) + (profile.market?.companies?.length ? ', tracking <b>' + profile.market.companies.length + '</b> listings.' : '.') }
    : { tag: 'Exchange directory', text: 'No verified domestic securities exchange.' });

  const rate = (window.__FX || {})[inv.currency];
  if (Number.isFinite(rate)) {
    rows.push({ tag: 'Live FX reference', text: '$1 buys <b>' + formatFxRate(rate) + ' ' + escapeHtml(inv.currency) + '</b> at the automatic reference rate.' });
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
    rows.push({ tag: 'Crop calendar · indicative', text: status.join(' · ') + '.' });
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
    '<div class="cv-brief-head"><span class="t">Country <b>file</b></span><span class="m">Compiled from sourced desk layers</span></div>' +
    rows.map(r => '<div class="cv-df-row"><span class="cv-df-tag">' + r.tag + '</span><p>' + r.text + '</p></div>').join('') +
    '<div class="cv-df-note">The ASJ desk has not filed from ' + escapeHtml(info.name || 'this country') + ' yet — ranked, source-cited stories replace this file after the next daily run.</div>' +
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
  const confidence = String(story.confidence || '').trim();
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
  document.getElementById('story-reader-kicker').textContent = [topic, country].filter(Boolean).join(' · ');
  document.getElementById('story-reader-title').textContent = story.headline;
  const dek = document.getElementById('story-reader-dek');
  dek.textContent = story.dek || '';
  dek.hidden = !story.dek;
  const meta = [];
  if (published) meta.push('<span><b>' + escapeHtml(formatShortDate(published) || String(published).slice(0, 10)) + '</b></span>');
  meta.push('<span><b>' + readMinutes + ' min</b> read</span>');
  if (uniqueSources.length) meta.push('<span><b>' + uniqueSources.length + '</b> ' + (uniqueSources.length === 1 ? 'source' : 'sources') + '</span>');
  if (confidence) meta.push('<span><b>' + escapeHtml(confidence) + '</b> confidence</span>');
  if (readerLens !== 'general') meta.push('<span><b>' + escapeHtml(STORY_LENS_LABELS[readerLens]) + '</b> lens</span>');
  document.getElementById('story-reader-meta').innerHTML = meta.join('');
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
          '<span class="cv-brief-topic">' + escapeHtml(b.topic || 'News') + '</span>' +
          '<span>·</span><span class="cv-news-source">' + escapeHtml((b.sources?.[0]?.name) || 'Sourced report') + '</span>' +
          
          (read ? '<span>·</span><span class="cv-news-read-state">Read</span>' : '') + '</div>' +
        '<h4 class="cv-brief-title">' + escapeHtml(b.headline) + '</h4>' +
        (b.dek ? '<p class="cv-brief-dek">' + escapeHtml(b.dek) + '</p>' : '') +
      '</div>' +
      '<span class="cv-news-toggle" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M6 9l6 6 6-6"/></svg></span>' +
    '</button>' +
    '<div class="cv-brief-main" id="' + domId + '-detail" role="region" aria-labelledby="' + domId + '-summary" hidden>' +
      '<p class="cv-brief-body">' + escapeHtml(preview) + '</p>' +
      '<p class="cv-brief-why"><b>' + escapeHtml(whyLabel) + '</b>' + escapeHtml(lensData.why) + '</p>' +
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
      '<span class="m">' + escapeHtml(info.name || '') + ' file pending</span></div>' +
    picks.map((p, i) => briefRowHtml(p.brief, i, p.country, p.countryCode, p.published, p.sourceRank)).join('') +
    '<div class="cv-df-note">The ASJ desk has not filed from ' + escapeHtml(info.name || 'this country') + ' yet — these are current stories from the ' +
      escapeHtml(scope === 'Across Africa' ? 'Africa-wide' : scope) + ' wire. ' + escapeHtml(info.name || 'Its') + '&rsquo;s data file lives under Signals.</div>' +
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
      if (meta) meta.textContent = 'Desk file · no wire stories yet';
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

function briefWhy(brief) {
  if (brief && brief.why) return brief.why;
  const topic = String(brief?.topic || 'News').toLowerCase();
  if (topic.includes('business')) return 'This can affect prices, jobs, investment, or the cost of moving money.';
  if (topic.includes('politics')) return 'This can change public services, legal risk, investor confidence, or daily civic life.';
  if (topic.includes('agriculture')) return 'This can affect food supply, farm income, market prices, or planting decisions.';
  if (topic.includes('health')) return 'This can affect household safety, clinics, public spending, or travel decisions.';
  if (topic.includes('climate')) return 'This can affect water, roads, crops, power, and how quickly communities need to adapt.';
  if (topic.includes('sport') || topic.includes('culture')) return 'This is part of the public conversation shaping identity, attention, and national mood.';
  return 'This is worth tracking because it may affect how people move, spend, work, or plan today.';
}


function renderAlmanacFromGis(countryId, info) {
  const gis = COUNTRY_GIS[countryId] || { places: [] };
  const places = gis.places || [];

  // Agriculture: World Bank figures, then the desk's list of main farm exports.
  const ag = document.getElementById('cv-ag');
  const agMeta = document.getElementById('cv-ag-meta');
  const exportItems = farmExportsForCountry(countryId);
  if (agMeta) agMeta.textContent = '';
  ag.innerHTML = factGridHtml(countryId, 'farmers') +
    (exportItems.length
      ? '<div class="cv-ag-line"><span class="cv-ag-line-key">Main farm exports</span><span class="cv-ag-line-val">' + exportItems.slice(0, 3).map(escapeHtml).join(' · ') + '</span></div>'
      : '');

  // Food prices: WFP's retail prices at its best-covered market, against a year earlier.
  const foodEl = document.getElementById('cv-food');
  if (foodEl) foodEl.innerHTML = foodPricesHtml(countryId);

  // Largest cities, by Natural Earth population.
  const cities = largestCities(countryId);
  const mkt = document.getElementById('cv-markets');
  const mktMeta = document.getElementById('cv-mkt-meta');
  if (mktMeta) mktMeta.textContent = 'Population · Natural Earth, GeoNames';
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
    let change = Number.isFinite(item.yearAgo) && item.yearAgo > 0 ? ((item.price - item.yearAgo) / item.yearAgo) * 100 : null;
    // A fivefold jump (Nigeria's sugar, Oct 2026: NGN 968 to 4,800 for the same 500 g)
    // is far likelier a recording error than a price. Show no change rather than a
    // number nobody should act on.
    if (change !== null && (change > 300 || change < -75)) change = null;
    const cls = change === null ? '' : change > 0 ? ' up' : ' down';
    return '<li><span>' + escapeHtml(item.commodity) + ' <small>per ' + escapeHtml(item.unit) + '</small></span>' +
      '<b>' + escapeHtml(item.currency) + ' ' + num(item.price) + '</b>' +
      '<em class="cv-food-change' + cls + '">' + (change === null ? '—' : (change > 0 ? '+' : '') + Math.round(change) + '% on a year') + '</em></li>';
  }).join('');
  // In Kenya and Uganda WFP's only current retail monitoring is in refugee camps and
  // settlements. Those prices are real, but they are not the country's, so say so
  // before the list rather than in the source line under it.
  const campNote = food.camp
    ? '<p class="cv-food-warning">WFP currently records food prices in ' + escapeHtml(name) + ' only in refugee camps. These are prices at ' + escapeHtml(food.market) + ', not a national average.</p>'
    : '';
  return campNote + '<ul class="cv-food-list">' + rows + '</ul>' +
    '<div class="cv-fact-source">' + escapeHtml(food.market) + (food.camp ? ' refugee camp' : '') + ' market · retail · ' + escapeHtml(monthLabel(food.date)) + ' · World Food Programme</div>';
}

// Railways, from the OpenStreetMap lines the Atlas draws: total length, how much is
// standard gauge (the SGR-type lines), and the longest named lines.
function railSummaryHtml(countryId) {
  const rail = COUNTRY_GIS[countryId]?.rail;
  const km = Number(rail?.km) || 0;
  const named = (rail?.lines || []).filter(l => l.name && l.km >= 20).slice(0, 4);
  const fmt = n => Math.round(n).toLocaleString('en-US') + ' km';
  return '<div class="cv-route-group"><div class="cv-route-title">Railways <b>' + (km ? fmt(km) : '0') + '</b></div>' +
    (km
      ? (rail.sgrKm >= 20 ? '<p class="cv-route-empty">' + fmt(rail.sgrKm) + ' of it standard gauge.</p>' : '') +
        (named.length ? '<ul class="cv-route-list">' + named.map(l => '<li><span>' + escapeHtml(l.name) + '</span><small>' + fmt(l.km) + (l.gauge === 1435 ? ' · standard' : l.gauge ? ' · ' + l.gauge + ' mm' : '') + '</small></li>').join('') + '</ul>' : '')
      : '<p class="cv-route-empty">No active railway in OpenStreetMap.</p>') +
  '</div>';
}

// The desk's curated list of each country's main farm exports. Every country has one;
// there is no generic fallback any more ("Cereals, Coffee, Horticulture" was shown for
// any country missing from the list).
function farmExportsForCountry(countryId) {
  return FARM_EXPORTS[countryId] || [];
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
  return {
    key: keyLabel || FACT_DEFS[key].label,
    value: fact ? formatFactValue(FACT_DEFS[key].fmt, fact.v) : '—',
    sub: fact ? 'World Bank ' + fact.y : (countryId === 'eh' ? 'No World Bank data' : 'Not reported'),
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
  const stats = countryDeskStats(countryId);
  const ports = countryPorts(countryId);
  const airports = countryAirports(countryId);
  const waterCount = (stats.gis.rivers || []).length + (stats.gis.lakes || []).length;
  setKpiCells([
    { key: 'Weather · Live', value: '—', sub: 'Fetching station data', explain: 'Live weather is fetched for the capital or closest mapped reference point.' },
    { key: 'Seaports', value: String(ports.length), sub: ports.length ? 'incl. ' + ports[0].name : (LANDLOCKED.has(countryId) ? 'Landlocked' : 'None listed'), explain: 'Ports in the NGA World Port Index, offshore oil terminals excluded.' },
    { key: 'Airports', value: String(airports.length), sub: airports.length ? 'With scheduled flights' : 'None listed', explain: 'Airports with scheduled passenger service, from OurAirports.' },
    { key: 'Water registry', value: String(waterCount), sub: (stats.gis.rivers || []).length + ' rivers · ' + (stats.gis.lakes || []).length + ' lakes', explain: 'Mapped rivers and lakes from Natural Earth.' }
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

function countryFact(countryId, key) {
  const fact = countryFacts(countryId)?.wb?.[key];
  if (!fact || !Number.isFinite(Number(fact.v))) return null;
  const v = Number(fact.v);
  const [lo, hi] = FACT_LIMITS[key] || [-Infinity, Infinity];
  return v < lo || v > hi ? null : { v, y: fact.y };
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

function factCellHtml(countryId, key) {
  const def = FACT_DEFS[key];
  const fact = countryFact(countryId, key);
  return '<div class="cv-fact' + (fact ? '' : ' is-missing') + '">' +
    '<div class="cv-fact-key">' + escapeHtml(def.label) + '</div>' +
    '<div class="cv-fact-val">' + (fact ? escapeHtml(formatFactValue(def.fmt, fact.v)) : 'Not reported') + '</div>' +
    '<div class="cv-fact-sub">' + escapeHtml(def.sub) + (fact ? ' · ' + fact.y : '') + '</div>' +
  '</div>';
}

function factGridHtml(countryId, group) {
  if (!window.ASJ_COUNTRY_FACTS) return '<div class="cv-empty">Country figures are still loading.</div>';
  if (countryId === 'eh') {
    // Not a World Bank member, so there are no WDI series. Morocco's figures are not
    // substituted: that would answer a sovereignty question by spreadsheet.
    return '<div class="cv-empty">The World Bank does not publish figures for Western Sahara.</div>';
  }
  return '<div class="cv-facts">' + FACT_GROUPS[group].map(key => factCellHtml(countryId, key)).join('') + '</div>' +
    '<div class="cv-fact-source">World Bank, World Development Indicators · latest year reported since 2015</div>';
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

// The largest cities by population. Natural Earth first: its places are curated metro
// areas (Nairobi, Mombasa, Kisumu). GeoNames lists communes and towns with county-sized
// counts (Kakamega as Kenya's second city, Njeru in Uganda), so it is used only where
// Natural Earth has fewer than four places - the island states and Western Sahara.
function largestCities(countryId, limit = 6) {
  const byPop = list => list.filter(c => c && c.name && Number(c.pop) > 0).sort((a, b) => b.pop - a.pop);
  const natural = byPop(atlasPlaces(countryId));
  const list = natural.length >= 4 ? natural : byPop((countryFacts(countryId)?.cities || []).slice());
  const top = list.slice(0, limit);
  // The capital is always listed. Natural Earth's figure for Juba (112,000) put South
  // Sudan's capital and largest city below Yei, Malakal and Wau and off the list.
  const capital = normalizeName(COUNTRY_INFO[countryId]?.capital || '');
  const isCapital = c => c.capital || normalizeName(c.name) === capital || normalizeName(c.name) + 'city' === capital;
  if (capital && !top.some(isCapital)) {
    const cap = list.find(isCapital);
    if (cap) top.splice(Math.max(0, top.length - (top.length >= limit ? 1 : 0)), top.length >= limit ? 1 : 0, cap);
  }
  return top;
}

function renderInvestorKpis(countryId, info) {
  const inv = investorForCountry(countryId, info);
  // The fourth cell was "Risk / access: Medium · Open", a desk label with no source.
  setKpiCells([
    { key: 'GDP', value: inv.gdp, sub: gdpSubLabel(inv), green: true, explain: 'Nominal GDP in current US dollars from the latest available economy file.' },
    { key: 'GDP growth', value: (inv.gdp_growth > 0 ? '+' : '') + inv.gdp_growth + '%', sub: growthSubLabel(inv), green: inv.gdp_growth >= 4, explain: 'Latest annual real GDP growth rate available in the country file.' },
    { key: 'FDI inflows', value: inv.fdi, sub: inv.fdiYear ? 'World Bank ' + inv.fdiYear : (inv.estimated ? 'Desk model estimate' : 'Desk file · UNCTAD 2023-24'), explain: 'Foreign direct investment inflows where a sourced estimate is available.' },
    kpiFact(countryId, 'inflation', 'Inflation', 'Annual change in consumer prices, World Bank.')
  ]);
}

function gdpSubLabel(inv) {
  return inv.gdpYear ? 'World Bank ' + inv.gdpYear : inv.estimated ? 'Desk model' : 'Nominal desk file';
}

function growthSubLabel(inv) {
  return inv.growthYear ? 'World Bank ' + inv.growthYear : inv.estimated ? 'Desk model' : 'Year-on-year';
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
  const series = supplied.length ? supplied : gdpSeries(inv);
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
  const base = INVESTOR_INFO[countryId] || investorEstimate(countryId, info);
  const merged = { ...base };
  if (worldBank) {
    const wbSeries = Array.isArray(worldBank.gdpSeries) && worldBank.gdpSeries.length ? worldBank.gdpSeries : null;
    merged.gdp = Number.isFinite(worldBank.gdp) ? formatBillions(worldBank.gdp) : base.gdp;
    merged.gdp_growth = Number.isFinite(worldBank.gdp_growth) ? worldBank.gdp_growth : base.gdp_growth;
    merged.gdpYear = worldBank.gdpYear || base.gdpYear;
    merged.growthYear = worldBank.growthYear || base.growthYear;
    merged.gdpSeries = cachedSeries || (wbSeries?.length >= 2 ? wbSeries : null) || base.gdpSeries || wbSeries;
    merged.estimated = false;
    merged.source = 'World Bank';
  } else {
    merged.gdpSeries = cachedSeries || base.gdpSeries;
    merged.estimated = base.estimated !== false;
    merged.source = merged.estimated ? 'Desk model' : 'Desk file';
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
  const lines = ['The African Street Journal', (info.name || 'Country') + ' desk - ' + date, ''];
  if (!briefs.length) {
    lines.push('No ASJ story desk is loaded for this country yet.');
    return lines.join('\n');
  }
  rankedBriefs.slice(0, 6).forEach((entry, index) => {
    const brief = entry.story;
    const sources = (brief.sources || []).map(source => source.name || source.url).filter(Boolean).join(', ');
    lines.push((index + 1) + '. ' + brief.headline);
    lines.push('   ' + (brief.body || ''));
    lines.push('   Why it matters: ' + storyLensData(brief, 'general').why);
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

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
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
    summary: item.why || item.body || '',
    source: src.name || 'ASJ Desk',
    url: src.url || '',
    type: item.topic || 'News',
    place: info?.capital || (capital && capital.name) || '',
    lon: capital ? capital.lon : (info?.lon ?? 20),
    lat: capital ? capital.lat : (info?.lat ?? 0),
    date: generatedDate || storyDate(index),
    popularity: 90 - index * 3,
    impact: 72,
    live: true
    };
  });
}

function storyFeedForCountry(countryId) {
  // Live stories only — real, attributed news. No templated/synthetic filler.
  return aiStoriesForCountry(countryId)
    .map((story, index) => normalizeStory(story, index))
    .filter((story, index, all) => all.findIndex(other => other.title === story.title) === index)
    .slice(0, 14);
}

// Geo-located pins for the map only (not the news feed). Falls back to live-story
// capital coords when a country has no curated pins.
function mapPinsForCountry(countryId, liveStories) {
  const pins = (STORY_PINS[countryId] || []).slice();
  return pins.length ? pins : liveStories;
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
  const useIslandFocus = Object.prototype.hasOwnProperty.call(ISLAND_FULLSCREEN_BOUNDS, countryId);
  const bounds = mapViewBounds(countryId, mapPath.bbox, useIslandFocus);
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
  countryMapCanvas.width = width * mapDpr;
  countryMapCanvas.height = height * mapDpr;
  countryMapCtx.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
  countryMapCtx.clearRect(0, 0, width, height);

  // Archipelagos include remote specks that can make the inhabited island disappear in a narrow
  // embedded map. Reuse each established focus crop on mobile; desktop keeps the full extent.
  const useIslandFocus = isFs || (mobileDossierMedia.matches &&
    Object.prototype.hasOwnProperty.call(ISLAND_FULLSCREEN_BOUNDS, countryId));
  const bounds = mapViewBounds(countryId, mapPath.bbox, useIslandFocus);
  // Padding scales with the canvas so small embedded maps don't spend ~18% of their width on
  // margin: ~5.5% of the short side, clamped to 28-72px (island focus crops keep extra room).
  const pad = isFs && ISLAND_FULLSCREEN_BOUNDS[countryId]
    ? 92
    : Math.max(28, Math.min(72, Math.round(Math.min(width, height) * 0.055)));
  const baseScale = Math.min((width - pad * 2) / bounds.width, (height - pad * 2) / bounds.height);
  const scale = baseScale * islandMapZoom(countryId, isFs);
  const offsetX = (width - bounds.width * scale) / 2 - bounds.minX * scale;
  const offsetY = (height - bounds.height * scale) / 2 - bounds.minY * scale;
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
  if (mapLayers.terrain) {
    drawRelief(width, height, countryId);
    drawContours(width, height, countryId);
  } else {
    drawPaperTexture(width, height, countryId);
  }
  drawLinearFeatures(countryId, project, placedLabels, width, height);
  countryMapCtx.restore();

  drawCountryOutline(mapPath, offsetX, offsetY, scale);
  drawGisLayers(countryId, project, placedLabels, width, height, mapPath, offsetX, offsetY, scale, mapDpr);
}

function islandMapZoom(countryId, isFullscreen) {
  // Zoom-past-fit is only safe on top of an explicit ISLAND_FULLSCREEN_BOUNDS focus crop
  // (it trims empty ocean around archipelagos). Applied to a full-country fit it guarantees
  // overflow — e.g. Gambia at 1.6x spilled off both edges of the screen.
  if (!ISLAND_FULLSCREEN_BOUNDS[countryId]) return 1;
  if (isFullscreen) return ({ cv: 1.15, km: 1.15, st: 1.15 })[countryId] || 1;
  return 1;
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
  bg.addColorStop(0, '#171a17');
  bg.addColorStop(0.56, '#101210');
  bg.addColorStop(1, '#131313');
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
  if (capitalPlace && mapLayers.labels) {
    const [x, y] = project(capitalPlace.lon, capitalPlace.lat);
    countryMapCtx.font = '700 13px system-ui, -apple-system, "Segoe UI", sans-serif';
    drawSmartLabel(capitalPlace.name, x, y, '#f1f7ef', placedLabels, width, height, 'right', true);
    labelledPlaces.add(capitalPlace);
  }
  // Label order: capital, cities of a million or more, the main port and gateway
  // airports, landmarks, other cities, small towns. Cape Town lost its name to "Cape Town
  // port" and "CPT" when ports came first; Mount Kenya lost out to Sotik when landmarks
  // came last.
  const majorPlace = place => place.capital || place.pop > 180000;
  const drawPlace = place => {
    const [x, y] = project(place.lon, place.lat);
    let labelDrawn = labelledPlaces.has(place);
    const shouldLabel = majorPlace(place) || placedLabels.length - markerBoxes.length < 14;
    if (mapLayers.labels && shouldLabel && !labelDrawn) {
      countryMapCtx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
      labelDrawn = drawSmartLabel(place.name, x, y, '#e0ecdf', placedLabels, width, height, 'top');
    }
    if (!place.capital) {
      // A small dot under every labelled town, so a label nudged aside by a
      // neighbour still shows which point it names.
      if (!mapLayers.labels || !labelDrawn) return;
      countryMapCtx.beginPath();
      countryMapCtx.arc(x, y, 2.2, 0, Math.PI * 2);
      countryMapCtx.fillStyle = 'rgba(232,240,228,0.85)';
      countryMapCtx.fill();
      return;
    }
    countryMapCtx.beginPath();
    countryMapCtx.arc(x, y, 4.4, 0, Math.PI * 2);
    countryMapCtx.fillStyle = '#b9f2bc';
    countryMapCtx.fill();
    countryMapCtx.strokeStyle = 'rgba(9,28,14,0.88)';
    countryMapCtx.lineWidth = 1.2;
    countryMapCtx.stroke();
  };
  if (mapLayers.places) places.filter(p => !p.capital && p.pop >= 1000000).forEach(drawPlace);
  const labelledInfra = new Set();
  if (mapLayers.infra && mapLayers.labels) {
    countryMapCtx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
    for (const item of infraItems.filter(i => i.priority)) {
      const [x, y] = project(item.lon, item.lat);
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
    places.filter(p => p.capital).forEach(drawPlace);
    places.filter(p => !p.capital && p.pop > 180000 && p.pop < 1000000).forEach(drawPlace);
    places.filter(p => !p.capital && !(p.pop > 180000)).forEach(drawPlace);
  }

  if (mapLayers.infra) {
    // Every marker is drawn; only a label that has no room is dropped. This used to skip
    // any port or airport within 18px of a city, which hid exactly the ones that matter
    // most - Jomo Kenyatta beside Nairobi, Mombasa port beside Mombasa - and left the
    // map showing Amboseli's airstrip instead.
    for (const item of infraItems) {
      if (!Number.isFinite(item.lon) || !Number.isFinite(item.lat)) continue;
      const [x, y] = project(item.lon, item.lat);
      if (mapLayers.labels && !labelledInfra.has(item)) {
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

function terrainHeight(x, y, width, height, seed) {
  const nx = x / Math.max(1, width) - 0.5;
  const ny = y / Math.max(1, height) - 0.5;
  const angle = seed * 0.017;
  const rx = nx * Math.cos(angle) - ny * Math.sin(angle);
  const ry = nx * Math.sin(angle) + ny * Math.cos(angle);
  const broad =
    Math.sin(rx * 8.5 + seed * 0.13) * 0.24 +
    Math.cos(ry * 7.2 - seed * 0.09) * 0.22 +
    Math.sin((rx + ry) * 10.8 + seed * 0.04) * 0.18;
  const folded =
    (1 - Math.abs(Math.sin(rx * 24 + ry * 11 + seed * 0.31))) * 0.24 +
    (1 - Math.abs(Math.sin(rx * -17 + ry * 29 + seed * 0.23))) * 0.18;
  const drainage = -Math.abs(Math.sin(rx * 15 - ry * 19 + seed * 0.19)) * 0.16;
  const fine =
    Math.sin(rx * 58 + Math.cos(ry * 23 + seed)) * 0.055 +
    Math.cos(ry * 61 + Math.sin(rx * 18 + seed)) * 0.045;
  return broad + folded + drainage + fine;
}

function drawRelief(width, height, countryId) {
  const seed = countryId.charCodeAt(0) * 17 + countryId.charCodeAt(1) * 31;
  const step = width > 900 ? 3 : 4;
  const cacheKey = 'green-relief:' + countryId + ':' + width + 'x' + height + ':' + step;
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
      const h = terrainHeight(x, y, width, height, seed);
      const elevation = Math.max(0, Math.min(1, (h + 0.62) / 1.28));
      const grain = reliefNoise(x * 0.7, y * 0.7, seed) * 3;
      const r = Math.max(38, Math.min(82, 46 + elevation * 29 + grain));
      const g = Math.max(94, Math.min(158, 104 + elevation * 48 + grain));
      const b = Math.max(46, Math.min(91, 53 + elevation * 30 + grain * 0.5));
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

function drawContours(width, height, countryId) {
  const seed = countryId.charCodeAt(0) * 13 + countryId.charCodeAt(1) * 19;
  const grid = width > 900 ? 18 : 22;
  const levels = [-0.42, -0.28, -0.14, 0, 0.14, 0.28, 0.42, 0.56];
  countryMapCtx.lineWidth = 0.55;
  countryMapCtx.lineCap = 'round';
  countryMapCtx.strokeStyle = 'rgba(224,246,226,0.18)';

  const interp = (a, b, level) => Math.max(0, Math.min(1, (level - a) / ((b - a) || 1)));
  for (const level of levels) {
    countryMapCtx.beginPath();
    for (let y = -grid; y < height + grid; y += grid) {
      for (let x = -grid; x < width + grid; x += grid) {
        const h00 = terrainHeight(x, y, width, height, seed);
        const h10 = terrainHeight(x + grid, y, width, height, seed);
        const h11 = terrainHeight(x + grid, y + grid, width, height, seed);
        const h01 = terrainHeight(x, y + grid, width, height, seed);
        const points = [];
        if ((h00 < level) !== (h10 < level)) points.push([x + grid * interp(h00, h10, level), y]);
        if ((h10 < level) !== (h11 < level)) points.push([x + grid, y + grid * interp(h10, h11, level)]);
        if ((h11 < level) !== (h01 < level)) points.push([x + grid * (1 - interp(h11, h01, level)), y + grid]);
        if ((h01 < level) !== (h00 < level)) points.push([x, y + grid * (1 - interp(h01, h00, level))]);
        if (points.length >= 2) {
          countryMapCtx.moveTo(points[0][0], points[0][1]);
          countryMapCtx.lineTo(points[1][0], points[1][1]);
          if (points.length === 4) {
            countryMapCtx.moveTo(points[2][0], points[2][1]);
            countryMapCtx.lineTo(points[3][0], points[3][1]);
          }
        }
      }
    }
    countryMapCtx.stroke();
  }
}

// Railways from OpenStreetMap (active lines, sidings and yards excluded), built into
// each country's GIS file by scripts/build-country-rail.ps1. This used to draw a few
// hand-placed points as a "Great Rift Valley" and a "Nile River" - straight lines across
// the map that read as roads - while the real Nairobi-Mombasa SGR was absent.
function drawLinearFeatures(countryId, project, placedLabels, width, height) {
  if (mapLayers.rail === false) return;
  const rail = COUNTRY_GIS[countryId]?.rail?.lines || [];
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

function normalizeStory(story, index) {
  return {
    ...story,
    popularity: Number(story.popularity ?? (82 - index * 4)),
    impact: Number(story.impact ?? Math.max(42, 74 - index * 3)),
    date: story.date || storyDate(index)
  };
}

function storyDate(daysAgo) {
  const date = new Date(Date.now() - Number(daysAgo || 0) * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
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
function renderInvestorMarkets(countryId) {
  const wrap = document.getElementById('cv-heatmap');
  const meta = document.getElementById('cv-heat-meta');
  if (!wrap) return;
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
  // The 'cap' field is a SHARE PRICE (AFX publishes price, not market cap). Sizing tiles by
  // it made a KES 284 small-cap dwarf KCB and was captioned 'company size'. Live: size by
  // the size of the move. Stale: equal tiles, tickers only, with the fetch date shown.
  const sorted = m.companies.slice().filter(c => c && c.t && Number.isFinite(Number(c.cap)) && Number(c.cap) > 0)
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
        const title = isLive ? r.t + ' ' + sign + r.change + '%' : r.t + ' · price data stale';
        return '<button class="cv-heat-tile" type="button" data-tkr="' + escapeHtml(r.t) + '" data-name="' + escapeHtml(r.name) + '" data-chg="' + r.change + '" data-rank="' + r.rank + '" data-total="' + r.total + '" style="left:' + (r.x / W * 100) + '%;top:' + (r.y / H * 100) + '%;width:' + wp + '%;height:' + hp + '%;background:' + (isLive ? heatColor(r.change) : 'rgb(28,66,42)') + '" title="' + escapeHtml(title) + '">' +
          '<span class="cv-heat-tkr" style="font-size:' + fs + 'px">' + escapeHtml(r.t) + '</span>' +
          (isLive && big ? '<span class="cv-heat-chg">' + sign + r.change.toFixed(1) + '%</span>' : '') +
        '</button>';
      }).join('') +
    '</div>' +
    '<div class="cv-heat-detail" id="cv-heat-detail" hidden></div>' +
    '<div class="cv-heat-key"><span class="cv-heat-note">' + (isLive ? 'Biggest movers, share-price change · as of ' + escapeHtml(formatMarketDate(m.asOf)) : (m.asOf ? 'Listed companies · prices last fetched ' + escapeHtml(formatMarketDate(m.asOf)) + ', too old to show' : 'Listed companies · no current price data')) + '</span></div>';
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
      '<div class="cv-hd-meta">#' + tile.dataset.rank + ' of ' + tile.dataset.total + ' in the ' + (isLive ? 'current market-cap view' : 'reference company view') + ' on ' + escapeHtml(profile.exchange) +
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
      '<div class="cv-dia-rate-sub">' + escapeHtml(CCY_NAME[ccy] || 'local currency') + (Number.isFinite(rate) ? ' · automatic reference rate' : ' · reference unavailable') + '</div>' +
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
  const perResident = formatPerResident((gdpB * 1000000000) / Math.max(1, info?.pop || 1));
  const fdiIntensity = gdpB ? (fdiB / gdpB) * 100 : 0;
  const gdpYear = inv.gdpYear || summary.latest.year;
  const fdiAligned = !inv.fdiYear || !gdpYear || inv.fdiYear === gdpYear;
  const fdiMetric = fdiAligned ? formatPct(fdiIntensity).replace('+', '') : inv.fdi;
  const fdiKey = fdiAligned ? 'FDI intensity' : 'Latest FDI';
  const fdiSub = fdiAligned ? 'FDI share of GDP' : 'World Bank ' + inv.fdiYear;
  const dataLabel = inv.source || (inv.estimated ? 'Desk model' : 'Desk file');

  if (econMeta) {
    econMeta.textContent = summary.hasTrend
      ? 'Nominal GDP · ' + summary.first.year + '–' + summary.latest.year + (summary.reportingGap ? ' · reporting gap' : '')
      : 'Nominal GDP · latest observation';
  }

  const trendClass = !Number.isFinite(summary.cagr) ? '' : summary.cagr >= 4 ? 'up' : summary.cagr >= 1 ? '' : 'down';
  econWrap.innerHTML =
    '<div class="cv-econ">' +
      '<div class="cv-econ-cell"><div class="cv-econ-key">GDP / resident</div><div class="cv-econ-val">' + perResident + '</div><div class="cv-econ-sub">' + (gdpYear ? 'GDP ' + gdpYear + ' / current pop' : 'Output per person') + '</div></div>' +
      '<div class="cv-econ-cell"><div class="cv-econ-key">' + fdiKey + '</div><div class="cv-econ-val">' + fdiMetric + '</div><div class="cv-econ-sub">' + fdiSub + '</div></div>' +
      '<div class="cv-econ-cell"><div class="cv-econ-key">GDP added</div><div class="cv-econ-val ' + trendClass + '">' + (summary.hasTrend ? signedBillions(summary.delta) : '—') + '</div><div class="cv-econ-sub">' + (summary.hasTrend ? 'Since ' + summary.first.year : 'Trend unavailable') + '</div></div>' +
      '<div class="cv-econ-cell"><div class="cv-econ-key">Data source</div><div class="cv-econ-val">' + escapeHtml(dataLabel) + '</div><div class="cv-econ-sub">' + summary.observationCount + ' GDP observation' + (summary.observationCount === 1 ? '' : 's') + '</div></div>' +
    '</div>' +
    renderGdpChart(inv, summary);

  // Published indicators, not "Key Sectors" (each sector word mapped to the same three
  // stock phrases for every country) or an "Investor Checklist" of generic advice.
  if (sectorsEl) sectorsEl.innerHTML = factGridHtml(countryId, 'investors');
  if (briefWrap) briefWrap.innerHTML = '';
}

function renderGdpChart(inv, summary = economySeriesSummary(inv)) {
  const series = summary.series;
  const first = series[0] || {};
  const latest = series[series.length - 1] || first;
  const period = first.year && latest.year ? first.year + '–' + latest.year : 'Latest observation';
  const coverage = summary.reportingGap
    ? summary.observationCount + ' observations · no published GDP after ' + latest.year
    : summary.observationCount + ' annual observation' + (summary.observationCount === 1 ? '' : 's');
  const changeClass = Number.isFinite(summary.change) ? (summary.change >= 0 ? 'up' : 'down') : '';
  const head =
    '<div class="cv-gdp-chart-head">' +
      '<div class="cv-gdp-chart-title"><span>Nominal GDP history</span><b>' + period + '</b><small>' + coverage + '</small></div>' +
      '<div class="cv-gdp-chart-stat"><span>Latest</span><b>' + (Number.isFinite(latest.value) ? formatBillions(latest.value) : '—') + '</b></div>' +
      '<div class="cv-gdp-chart-stat"><span>Period change</span><b class="' + changeClass + '">' + formatPct(summary.change) + '</b></div>' +
    '</div>';

  if (!summary.hasTrend) {
    return '<div class="cv-gdp-chart" aria-label="GDP history unavailable">' + head +
      '<div class="cv-gdp-sparse"><div><b>Trend unavailable</b><span>Only one published GDP observation is on file. No modelled line is shown.</span></div></div>' +
    '</div>';
  }

  const observedMax = Math.max(...series.map(point => point.value));
  const observedMin = Math.min(...series.map(point => point.value));
  const rawRange = Math.max(0.1, observedMax - observedMin);
  const pad = rawRange * 0.14;
  const min = Math.max(0, observedMin - pad);
  const max = observedMax + pad;
  const range = max - min;
  const x0 = 76, x1 = 974, yTop = 20, yBottom = 214;
  const yearRange = Math.max(1, latest.year - first.year);
  const yTicks = [min, min + range / 2, max];
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
  // Axis labels live in HTML over the chart: the SVG stretches (preserveAspectRatio none),
  // which squashed its own text to ~7px and distorted it.
  const axisLabels =
    yTicks.map(value => {
      const y = yBottom - ((value - min) / range) * (yBottom - yTop);
      return '<span class="cv-gdp-ylab" aria-hidden="true" style="top:' + (y / 250 * 100).toFixed(2) + '%">' + formatBillions(value) + '</span>';
    }).join('') +
    xTickPoints.map(tick => {
      const point = points.find(item => item.year === tick.year);
      return '<span class="cv-gdp-xlab" aria-hidden="true" style="left:' + (point.x / 10).toFixed(2) + '%">' + point.year + '</span>';
    }).join('');
  return '<div class="cv-gdp-chart" aria-label="GDP history">' + head +
    '<div class="cv-gdp-plot">' + axisLabels +
    '<svg viewBox="0 0 1000 250" preserveAspectRatio="none" role="img" aria-label="GDP trend from ' + first.year + ' to ' + latest.year + '">' +
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
      points.map(point => {
        const tipX = Math.min(888, Math.max(78, point.x - 46));
        const tipY = Math.max(8, point.y - 42);
        return '<g class="cv-gdp-point" tabindex="0" aria-label="' + point.year + ' GDP ' + formatBillions(point.value) + '">' +
          '<circle class="cv-gdp-hit" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="15"></circle>' +
          '<circle class="cv-gdp-dot' + (point === points[points.length - 1] ? ' latest' : '') + '" cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="' + (point === points[points.length - 1] ? '4.2' : '3.4') + '"></circle>' +
          '<g class="cv-gdp-tip" transform="translate(' + tipX.toFixed(1) + ' ' + tipY.toFixed(1) + ')">' +
            '<rect width="96" height="26"></rect>' +
            '<text x="9" y="16">' + point.year + ' · ' + formatBillions(point.value) + '</text>' +
          '</g>' +
        '</g>';
      }).join('') +
    '</svg></div>' +
  '</div>';
}

function formatBillions(value) {
  if (!Number.isFinite(value)) return '$0B';
  if (value >= 1000) return '$' + (value / 1000).toFixed(value >= 10000 ? 0 : 1) + 'T';
  if (value >= 10) return '$' + Math.round(value) + 'B';
  return '$' + value.toFixed(1) + 'B';
}

async function loadGdpHistory(countryId, info) {
  if (GDP_SERIES_CACHE[countryId] || GDP_SERIES_PENDING[countryId]) return;
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

function gdpSeries(inv) {
  const current = parseMoneyToBillions(inv.gdp);
  const growth = Math.max(-0.02, Math.min(0.09, Number(inv.gdp_growth || 2) / 100));
  const currentYear = 2024;
  return Array.from({ length: 10 }, (_, i) => {
    const year = currentYear - 9 + i;
    const yearsBack = 9 - i;
    const cycle = Math.sin((i + current) * 1.7) * 0.018;
    return { year, value: current / Math.pow(1 + growth + cycle, yearsBack) };
  });
}

function parseMoneyToBillions(value) {
  const text = String(value || '$10B').replace(/[$,]/g, '').trim();
  const amount = parseFloat(text) || 10;
  if (/T/i.test(text)) return amount * 1000;
  if (/M/i.test(text)) return amount / 1000;
  return amount;
}

canvas.addEventListener('click', (e) => {
  if (!assemblyDone) return;
  const [x, y] = eventToLocal(e);
  const idx = hitTest(x, y);
  if (idx >= 0) openCountry(paths[idx].id, canvas);
});

canvas.addEventListener('touchstart', (e) => {
  if (!assemblyDone) return;
  e.preventDefault();
  const touch = e.touches[0];
  const [x, y] = eventToLocal(touch);
  const idx = hitTest(x, y);
  if (idx >= 0) openCountry(paths[idx].id, canvas);
}, { passive: false });

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
      '<option value="' + t + '">' + (t === 'All' ? 'All topics' : t) + ' (' + c[t] + ')</option>'
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
      '   Why it matters: ' + (item.why || 'Track for local impact.') + '\n' +
      (item.source ? '   Source: ' + item.source + '\n' : '');
  }
  function dailyBriefText(items){
    const date = latestBriefDate() || new Date().toISOString().slice(0, 10);
    return ['The African Street Journal - Daily Desk', date, '']
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
        risk: inv.risk === 'low' ? 'Low' : inv.risk === 'med' ? 'Medium' : 'High',
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
          row('Risk', 'risk', '') +
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
  // A story in the list. Country first: on a 55-country paper that is what a reader
  // scans for, and the old kicker led with the topic, so "News" and "Politics" were the
  // first word of most lines. The outlet moves under the headline with the time, where
  // it reads as attribution instead of a third tag.
  function itemMarkup(it){
    const when = relativeDateLabel(it.date);
    const meta = [it.source, when].filter(Boolean).map(escapeHtml).join(' \u00b7 ');
    return '<button class="wire-item' + (isStoryReadKey(it.storyKey) ? ' is-read' : '') + '" type="button" data-story-key="'+escapeHtml(it.storyKey)+'">' +
      '<img class="wire-item-flag" src="https://flagcdn.com/w80/'+it.cc+'.png" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="wire-item-body">' +
        '<div class="wire-item-kicker">' +
          '<span class="wire-item-country">'+escapeHtml(it.country)+'</span><span class="dot"></span>' +
          '<span class="wire-item-topic">'+escapeHtml(it.type)+'</span>' +
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
        '<img class="wire-item-flag" src="https://flagcdn.com/w80/'+it.cc+'.png" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="wire-item-country">'+escapeHtml(it.country)+'</span><span class="dot"></span>' +
        '<span class="wire-item-topic">'+escapeHtml(it.type)+'</span></div>' +
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
    if (!INDEX.length){ activeWireStoryKeys = []; updateResultCount([]); resultsEl.innerHTML = '<div class="wire-empty">No stories loaded yet. The desk has not published an edition.</div>'; return; }
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
          '. This is the desk being honest rather than padding the tab - switch to Top for the full edition.'
        : 'No headlines match your search.';
      resultsEl.innerHTML = '<div class="wire-empty">' + emptyCopy + '</div>';
      return;
    }
    const frontPage = (activeTopic==='All' && !query.trim());
    // The lead slot goes to the best story the desk filed FOR THIS EDITION. Sorting by
    // score alone once put a 21 August brief at the top of the 28 August paper, which is
    // the one thing a daily cannot do. If every story is old - a desk that has not run -
    // the best of them still leads, because a front page with nothing on it is worse.
    const hero = frontPage ? (items.find(it => !isStaleDate(it.date, 2)) || items[0]) : null;
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
    editionSel.innerHTML = '<option value="">Latest</option>' + pastDates.map(d => '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>').join('');
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
    const fresh = out.filter(it => !isStaleDate(it.date, 2));
    const ordered = fresh.length ? fresh.concat(out.filter(it => isStaleDate(it.date, 2))) : out;
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
        '<span>' + escapeHtml(item.topic) + '</span>' +
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
    if (fill(slots.top, items.slice(0, 1), { lead: true, cta: '', label: 'Top story', dek: false }) && typeof layoutPhoneMap === 'function') {
      requestAnimationFrame(layoutPhoneMap);
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

  const pending = new Promise(resolve => {
    const chunk = document.createElement('script');
    chunk.src = 'data/countries/' + countryId + '.js';
    chunk.dataset.countryChunk = countryId;
    chunk.onload = () => {
      delete COUNTRY_CHUNK_PENDING[countryId];
      resolve(!!COUNTRY_DETAIL[countryId]);
    };
    chunk.onerror = () => {
      delete COUNTRY_CHUNK_PENDING[countryId];
      resolve(false);
    };
    document.head.appendChild(chunk);
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
    '<div class="yd-signup-copy"><b>Join the ASJ desk</b><span>Save the countries and lens you follow.</span></div>' +
    '<label class="sr-only" for="yd-signup-email">Email address</label>' +
    '<input id="yd-signup-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="' + escapeHtml(savedEmail) + '" required>' +
    '<label class="sr-only" for="yd-signup-audience">Desk lens</label>' +
    '<select id="yd-signup-audience" name="audience" aria-label="Desk lens">' +
      '<option value="general"' + selected('general') + '>Morning desk</option>' +
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
    const storyLabel = activeStoryLens === 'general' ? (top?.topic || 'News') : STORY_LENS_LABELS[activeStoryLens] + ' lens';
    const story = top ? storyLabel + ' ' + String.fromCharCode(183) + ' ' + top.headline : 'Open country file';
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
  if (at >= 0) list.splice(at, 1); else { list.push(id); markCountrySeen(id); }
  if (at < 0 && list.length >= 2 && !getDeskSignup().email) yourDeskExpanded = true;
  saveWatchlist(list);
  updateStarButton(id);
  renderYourDesk();
});
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
  'Shea': { kind:'perennial', plantLabel:'Establish', s: [5,6,7], h: [5,6,7,8] }
};
function seasonSpecForCountry(countryId, crop) {
  const base = CROP_SEASONS[crop];
  if (!base) return null;
  const info = COUNTRY_INFO[countryId] || {};
  const southern = /southern/i.test(info.region || '');
  return southern && base.south ? { ...base, ...base.south } : base;
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
  const crops = farmExportsForCountry(countryId).slice(0, 3);
  if (!crops.length) { el.innerHTML = '<div class="cv-heat-empty">No crop calendar on file yet.</div>'; return; }
  const months = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  let html = '<div class="cv-cal-months"><i></i>' + months.map(m => '<u>' + m + '</u>').join('') + '</div>';
  for (const crop of crops) {
    const spec = seasonSpecForCountry(countryId, crop);
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
  html += '<div class="cv-cal-legend"><span><em class="h"></em>Harvest / market</span><span><em class="s"></em>Planting / establish</span><span>Indicative; rainfall and irrigation shift timing</span></div>';
  el.innerHTML = html;
}

/* ── Atlas text alternative: describe the canvas map for screen readers ── */
function renderAtlasAltText(countryId, landmarks) {
  const el = document.getElementById('cv-atlas-alt');
  if (!el) return;
  const info = COUNTRY_INFO[countryId] || {};
  const gis = COUNTRY_GIS[countryId] || {};
  const parts = [];
  const uniq = list => Array.from(new Set(list.filter(Boolean)));
  const places = uniq((gis.places || []).map(p => p.name)).slice(0, 12);
  if (places.length) parts.push('Cities: ' + places.join(', '));
  const rivers = uniq((gis.rivers || []).map(r => r.name));
  if (rivers.length) parts.push('Rivers: ' + rivers.join(', '));
  const lakes = uniq((gis.lakes || []).map(l => l.name));
  if (lakes.length) parts.push('Lakes: ' + lakes.join(', '));
  const marks = uniq((landmarks || []).map(l => l.name)).slice(0, 10);
  if (marks.length) parts.push('Landmarks and infrastructure: ' + marks.join(', '));
  el.textContent = 'Stylized map of ' + (info.name || countryId) + '. ' + (parts.length ? parts.join('. ') + '.' : 'Feature data is still being compiled.');
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
   Every regression this project has hit was found by hand; this is the standing net.
   Results land in console.table, window.__selftest, and a corner badge. ── */
if (new URLSearchParams(location.search).has('selftest')) {
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
  add('FARM_EXPORTS ids valid', badIds(FARM_EXPORTS).length === 0, badIds(FARM_EXPORTS).join(','));
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
  add('atlas: Mayotte is not listed as a Comoros port', !countryPorts('km').some(p => /Dzaoudzi/i.test(p.name)));
  add('atlas: Kenya marks JKIA and the Mombasa SGR', atlasInfraForCountry('ke').some(i => i.short === 'NBO') &&
    (COUNTRY_GIS.ke?.rail?.lines || []).some(l => l.gauge === 1435 && l.km > 300));
  add('facts: every coastal country has a seaport', sortedCountryIds.filter(id => !LANDLOCKED.has(id) && !countryPorts(id).length).length === 0,
    sortedCountryIds.filter(id => !LANDLOCKED.has(id) && !countryPorts(id).length).join(',') || 'all');
  const noSeason = Array.from(new Set([].concat(...Object.values(FARM_EXPORTS)))).filter(c => !CROP_SEASONS[c]);
  add('CROP_SEASONS covers every export crop', noSeason.length === 0, noSeason.join(','));
  const noPlantingKinds = new Set(['fishery', 'livestock', 'fiber']);
  const noPlanting = Array.from(new Set([].concat(...Object.values(FARM_EXPORTS))))
    .filter(c => CROP_SEASONS[c] && !(CROP_SEASONS[c].s || []).length && !noPlantingKinds.has(CROP_SEASONS[c].kind));
  add('crop calendar planting coverage', noPlanting.length === 0, noPlanting.join(','));
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
/* -- Sign-up ---------------------------------------------------------------
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
  const pitch = String(window.ASJ_NEWSLETTER?.pitch || 'One morning email from the desk.');

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
