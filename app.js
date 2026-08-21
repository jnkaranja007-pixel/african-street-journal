const APP_DATA = window.UNITED_AFRICA_DATA || {};
const AI_BRIEFS = (window.UNITED_AFRICA_BRIEFS && window.UNITED_AFRICA_BRIEFS.byCountry) || {};
const AI_BRIEFS_AT = (window.UNITED_AFRICA_BRIEFS && window.UNITED_AFRICA_BRIEFS.generated) || null;
// Per-country brief dates: the pipeline carries a country's last good briefs through failed
// runs, so its stories can be older than the edition date — show the honest per-country stamp.
const AI_BRIEFS_DATES = (window.UNITED_AFRICA_BRIEFS && window.UNITED_AFRICA_BRIEFS.dates) || {};
// Live market heat data (top listed companies) written daily by build-briefs.ps1.
const LIVE_MARKETS = (window.UNITED_AFRICA_BRIEFS && window.UNITED_AFRICA_BRIEFS.markets) || {};
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
  const generatedAt = Date.parse(AI_BRIEFS_AT || '');
  const fresh = Number.isFinite(generatedAt) && (Date.now() - generatedAt) < 72 * 60 * 60 * 1000;
  if (fresh && live && Array.isArray(live.companies) && live.companies.length) {
    return { ...live, isLive:true, asOf:live.asOf || AI_BRIEFS_AT };
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
  return new Intl.DateTimeFormat('en-US', {
    month:'short', day:'numeric', year:'numeric', timeZone:'UTC'
  }).format(date);
}

function formatShortDate(value) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
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

const CRITICAL_INFRA_SEEDS = {
  ke: [
    { name: 'Mombasa Port', kind: 'port', place: 'Mombasa', lon: 39.67, lat: -4.05, note: 'Indian Ocean cargo gateway' },
    { name: 'Naivasha ICD', kind: 'dry_port', place: 'Naivasha', lon: 36.43, lat: -0.72, note: 'SGR-linked inland container depot' },
    { name: 'Nairobi SGR Terminal', kind: 'rail', place: 'Nairobi', lon: 36.89, lat: -1.36, note: 'Rail freight and passenger interchange' },
    { name: 'JKIA Air Cargo', kind: 'airport', place: 'Nairobi', lon: 36.93, lat: -1.32, note: 'Regional air cargo hub' },
    { name: 'Busia Border Post', kind: 'border', place: 'Busia', lon: 34.11, lat: 0.46, note: 'Kenya-Uganda trade crossing' },
    { name: 'Northern Corridor', kind: 'corridor', place: 'Mombasa-Nairobi', lon: 37.7, lat: -1.85, note: 'Port-to-interior freight spine' }
  ],
  ng: [
    { name: 'Apapa Port Complex', kind: 'port', place: 'Lagos', lon: 3.36, lat: 6.45, note: 'Container and bulk cargo gateway' },
    { name: 'Lekki Deep Sea Port', kind: 'port', place: 'Lekki', lon: 4.02, lat: 6.43, note: 'Deep-water maritime terminal' },
    { name: 'Lagos-Ibadan Rail', kind: 'rail', place: 'Lagos', lon: 3.38, lat: 6.52, note: 'Southwest freight corridor' },
    { name: 'Kano Dry Port', kind: 'dry_port', place: 'Kano', lon: 8.52, lat: 12.0, note: 'Inland cargo clearance node' },
    { name: 'Abuja Airport', kind: 'airport', place: 'Abuja', lon: 7.27, lat: 9.01, note: 'Central passenger and cargo hub' },
    { name: 'Seme Border Post', kind: 'border', place: 'Seme', lon: 2.75, lat: 6.37, note: 'Nigeria-Benin coastal crossing' }
  ],
  za: [
    { name: 'Durban Port', kind: 'port', place: 'Durban', lon: 31.02, lat: -29.88, note: 'Primary container gateway' },
    { name: 'Cape Town Port', kind: 'port', place: 'Cape Town', lon: 18.43, lat: -33.91, note: 'Atlantic maritime terminal' },
    { name: 'City Deep Dry Port', kind: 'dry_port', place: 'Johannesburg', lon: 28.07, lat: -26.23, note: 'Inland container depot' },
    { name: 'OR Tambo Cargo', kind: 'airport', place: 'Johannesburg', lon: 28.24, lat: -26.14, note: 'Air freight gateway' },
    { name: 'N3 Freight Corridor', kind: 'corridor', place: 'Durban-Johannesburg', lon: 29.4, lat: -28.1, note: 'Port-to-Gauteng road spine' },
    { name: 'Beitbridge Crossing', kind: 'border', place: 'Beitbridge', lon: 29.99, lat: -22.22, note: 'Southern Africa border gateway' }
  ],
  eg: [
    { name: 'Suez Canal', kind: 'corridor', place: 'Suez', lon: 32.55, lat: 29.97, note: 'Global maritime transit corridor' },
    { name: 'Port Said', kind: 'port', place: 'Port Said', lon: 32.3, lat: 31.26, note: 'Mediterranean container gateway' },
    { name: 'Alexandria Port', kind: 'port', place: 'Alexandria', lon: 29.9, lat: 31.2, note: 'Mediterranean import hub' },
    { name: 'Cairo Airport Cargo', kind: 'airport', place: 'Cairo', lon: 31.41, lat: 30.12, note: 'Air cargo interchange' },
    { name: '6th of October Dry Port', kind: 'dry_port', place: 'Giza', lon: 30.9, lat: 29.95, note: 'Inland customs and rail terminal' }
  ],
  gh: [
    { name: 'Tema Port', kind: 'port', place: 'Tema', lon: -0.02, lat: 5.64, note: 'Main container and industrial gateway' },
    { name: 'Takoradi Port', kind: 'port', place: 'Takoradi', lon: -1.75, lat: 4.89, note: 'Minerals and energy export terminal' },
    { name: 'Boankra Inland Port', kind: 'dry_port', place: 'Kumasi', lon: -1.41, lat: 6.74, note: 'Inland logistics platform' },
    { name: 'Kotoka Air Cargo', kind: 'airport', place: 'Accra', lon: -0.17, lat: 5.61, note: 'Air cargo and passenger hub' }
  ],
  cd: [
    { name: 'Matadi Port', kind: 'port', place: 'Matadi', lon: 13.45, lat: -5.82, note: 'Atlantic river-sea gateway' },
    { name: 'Kinshasa River Port', kind: 'port', place: 'Kinshasa', lon: 15.31, lat: -4.32, note: 'Congo River cargo node' },
    { name: 'Lubumbashi Rail Node', kind: 'rail', place: 'Lubumbashi', lon: 27.48, lat: -11.66, note: 'Copperbelt rail connection' },
    { name: 'N’djili Air Cargo', kind: 'airport', place: 'Kinshasa', lon: 15.44, lat: -4.39, note: 'National air cargo hub' },
    { name: 'Kasumbalesa Border', kind: 'border', place: 'Kasumbalesa', lon: 27.79, lat: -12.21, note: 'DRC-Zambia copperbelt crossing' }
  ],
  tz: [
    { name: 'Dar es Salaam Port', kind: 'port', place: 'Dar es Salaam', lon: 39.28, lat: -6.82, note: 'Regional maritime gateway' },
    { name: 'Central Railway', kind: 'rail', place: 'Dodoma', lon: 35.75, lat: -6.17, note: 'Interior rail spine' },
    { name: 'Julius Nyerere Cargo', kind: 'airport', place: 'Dar es Salaam', lon: 39.2, lat: -6.88, note: 'Air cargo hub' },
    { name: 'Isaka Dry Port', kind: 'dry_port', place: 'Isaka', lon: 32.93, lat: -3.9, note: 'Inland gateway to Great Lakes markets' }
  ]
};

const ISLAND_FULLSCREEN_BOUNDS = {
  mu: { minX: 57.28, maxX: 57.88, minY: 19.92, maxY: 20.58 },
  sc: { minX: 55.25, maxX: 55.62, minY: 4.48, maxY: 4.86 },
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

const LANDMARK_POINTS = [
  { name: 'Nairobi', kind: 'city', lon: 36.8219, lat: -1.2921, countries: ['ke'] },
  { name: 'Mombasa', kind: 'city', lon: 39.6682, lat: -4.0435, countries: ['ke'] },
  { name: 'Lake Victoria', kind: 'water', lon: 33.0, lat: -1.0, countries: ['ke', 'ug', 'tz'] },
  { name: 'Mount Kenya', kind: 'mountain', lon: 37.3075, lat: -0.1521, countries: ['ke'] },
  { name: 'Mount Kilimanjaro', kind: 'mountain', lon: 37.3556, lat: -3.0674, countries: ['ke', 'tz'] },
  { name: 'Nile River', kind: 'water', lon: 31.2, lat: 20.0, countries: ['eg', 'sd', 'ss', 'ug'] },
  { name: 'Sahara Desert', kind: 'landmark', lon: 13.0, lat: 23.0, countries: ['dz', 'ly', 'eg', 'td', 'ne', 'ml', 'mr', 'sd'] },
  { name: 'Congo Basin', kind: 'landmark', lon: 22.0, lat: -1.5, countries: ['cd', 'cg', 'cf', 'cm', 'ga'] },
  { name: 'Atlas Mountains', kind: 'mountain', lon: -5.0, lat: 31.5, countries: ['ma', 'dz', 'tn'] },
  { name: 'Lake Tanganyika', kind: 'water', lon: 29.6, lat: -6.0, countries: ['tz', 'bi', 'cd', 'zm'] },
  { name: 'Lake Malawi', kind: 'water', lon: 34.5, lat: -12.2, countries: ['mw', 'mz', 'tz'] },
  { name: 'Victoria Falls', kind: 'water', lon: 25.8572, lat: -17.9243, countries: ['zm', 'zw'] },
  { name: 'Lake Chad', kind: 'water', lon: 13.5, lat: 13.3, countries: ['td', 'ne', 'ng', 'cm'] },
  { name: 'Lake Turkana', kind: 'water', lon: 36.2, lat: 3.5, countries: ['ke', 'et'] },
  { name: 'Lake Volta', kind: 'water', lon: -0.15, lat: 7.4, countries: ['gh'] },
  { name: 'Okavango Delta', kind: 'landmark', lon: 22.9, lat: -19.3, countries: ['bw'] },
  { name: 'Mount Cameroon', kind: 'mountain', lon: 9.17, lat: 4.20, countries: ['cm'] }
];

const LANDMARK_LINES = [
  {
    name: 'Nile River',
    kind: 'water',
    countries: ['eg', 'sd', 'ss', 'ug'],
    points: [[32.3, 0.4], [31.6, 5.6], [31.8, 12.0], [32.5, 18.0], [31.2, 24.1], [31.8, 30.1]]
  },
  {
    name: 'Great Rift Valley',
    kind: 'landmark',
    countries: ['er', 'et', 'ke', 'tz', 'mw', 'mz'],
    points: [[39.5, 14.5], [40.2, 8.8], [38.5, 2.5], [36.8, -1.3], [36.0, -6.0], [34.7, -11.5], [35.0, -16.0]]
  },
  {
    name: 'Niger River',
    kind: 'water',
    countries: ['gn', 'ml', 'ne', 'ng'],
    points: [[-10.2, 12.1], [-6.1, 12.7], [-3.2, 12.2], [1.5, 14.9], [3.9, 13.5], [4.0, 11.7], [6.5, 7.6]]
  },
  {
    name: 'Congo River',
    kind: 'water',
    countries: ['cd', 'cg'],
    points: [[26.0, -9.8], [23.2, -6.5], [18.5, -5.8], [17.2, -2.5], [18.4, 0.3], [16.5, -4.3], [15.3, -4.4]]
  },
  {
    name: 'Zambezi River',
    kind: 'water',
    countries: ['zm', 'zw', 'mz', 'bw'],
    points: [[22.1, -12.1], [24.5, -14.8], [25.8, -17.9], [30.2, -17.5], [32.5, -16.2], [35.0, -18.1]]
  }
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
const FRONT_GREEN = getComputedStyle(document.documentElement).getPropertyValue('--front-green').trim() || '#3d8b40';

const dpr = Math.min(2, window.devicePixelRatio || 1);
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
const ISLAND_MARKERS = { cv: { tag: 'CPV', side: 'left' }, st: { tag: 'STP', side: 'left' }, km: { tag: 'COM', side: 'left' }, sc: { tag: 'SYC', side: 'right' }, mu: { tag: 'MUS', side: 'right' } };
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
    if (cx < 60) side = 'right';
    if (cx > 940) side = 'left';
    return { id, idx, cx, cy, side };
  })
  .filter(Boolean);

// Mainland micro-states (Gambia, Djibouti, Eswatini...) are near-invisible tap targets on
// phones; give them the same forgiving hit treatment as the island markers.
const microHitTargets = paths
  .map((p, idx) => ({ p, idx }))
  .filter(({ p }) => p.bbox && !ISLAND_MARKERS[p.id] && (p.bbox.width * p.bbox.height) < 620)
  .map(({ p, idx }) => ({ idx, cx: (p.bbox.minX + p.bbox.maxX) / 2, cy: (p.bbox.minY + p.bbox.maxY) / 2 }));

function drawOcean(elapsed) {
  const alpha = Math.min(1, elapsed / 1.2);
  if (alpha === 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
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
  ctx.globalAlpha = 1; // the erase must be full-strength even while the wash is fading in
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 1000, 1001);
  ctx.restore();
}

function drawIslandMarkers(elapsed) {
  const alpha = Math.max(0, Math.min(1, (elapsed - 2.4) / 0.8));
  if (alpha === 0) return;
  ctx.save();
  ctx.translate(0.41, 2);
  ctx.globalAlpha = alpha;
  ctx.font = '700 11px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.textBaseline = 'middle';
  for (const t of islandHitTargets) {
    const hovered = hoveredIdx === t.idx;
    ctx.beginPath();
    ctx.arc(t.cx, t.cy, 9, 0, Math.PI * 2);
    ctx.strokeStyle = hovered ? 'rgba(102,187,106,0.95)' : 'rgba(61,139,64,0.55)';
    ctx.lineWidth = hovered ? 1.6 : 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(t.cx, t.cy, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = hovered ? '#8fd694' : FRONT_GREEN;
    ctx.fill();
    ctx.textAlign = t.side === 'left' ? 'right' : 'left';
    ctx.fillStyle = hovered ? 'rgba(220,240,222,0.95)' : 'rgba(160,190,165,0.7)';
    ctx.fillText(ISLAND_MARKERS[t.id].tag, t.cx + (t.side === 'left' ? -14 : 14), t.cy);
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

function render(elapsed) {
  ctx.clearRect(0, 0, 1000, 1001);
  drawOcean(elapsed);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.8;
  const pulse = pulseAmount();

  for (let i = 0; i < paths.length; i++) {
    const c = paths[i];
    const t = c.dur === 0 ? 1 : Math.max(0, Math.min(1, (elapsed - c.delay) / c.dur));
    if (t === 0) continue;

    const eased = easeOut(t);
    const isHover = i === hoveredIdx && assemblyDone;
    ctx.save();
    ctx.translate(0.41 + c.sx * (1 - eased), 2 + c.sy * (1 - eased));
    ctx.globalAlpha = Math.min(1, t / 0.18);
    const pulsing = i === pulseIdx && pulse > 0 && !isHover;
    if (isHover) { ctx.shadowColor = 'rgba(76,175,80,0.5)'; ctx.shadowBlur = 18; }
    else if (pulsing) { ctx.shadowColor = 'rgba(102,187,106,' + (0.45 * pulse).toFixed(3) + ')'; ctx.shadowBlur = 22 * pulse; }
    ctx.fillStyle = isHover ? '#66bb6a'
      : pulsing ? 'rgb(' + Math.round(61 + 41 * pulse) + ',' + Math.round(139 + 48 * pulse) + ',' + Math.round(64 + 42 * pulse) + ')'
      : FRONT_GREEN;
    ctx.strokeStyle = '#1a1a1a';
    ctx.fill(c.shape);
    ctx.shadowBlur = 0;
    ctx.stroke(c.shape);
    ctx.restore();
  }
  drawIslandMarkers(elapsed);
}

function frame(now) {
  if (!startTime) startTime = now;
  const elapsed = (now - startTime) / 1000;
  render(elapsed);
  if (elapsed < 3.5 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    requestAnimationFrame(frame);
  } else {
    assemblyDone = true;
    render(3.5);
  }
}
requestAnimationFrame(frame);

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
    const rect = canvas.getBoundingClientRect();
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
const mapLayers = { terrain: true, water: true, places: true, infra: true, labels: true };
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
let currentSlideIndex = 0;
let activePanelIndex = 0;
const infoGridIndexByMode = { farmers: 0, investors: 0, diaspora: 0 };
const countryCarousel = track?.parentElement;
countryCarousel?.addEventListener('scroll', () => {
  if (countryCarousel.scrollLeft !== 0) countryCarousel.scrollLeft = 0;
}, { passive: true });

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
  if (activeCountryMap) requestAnimationFrame(() => drawCountryMap(activeCountryMap.countryId, activeCountryMap.countryPath, activeCountryMap.mapPins || activeCountryMap.stories, activeCountryMap.landmarks));
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
  const { step, maxIndex } = infoGridMetrics(grid);
  infoGridIndexByMode[mode] = Math.max(0, Math.min(maxIndex, Math.round(grid.scrollLeft / step)));
}

function restoreInfoGridPosition(mode = audienceSelect?.value || 'farmers') {
  requestAnimationFrame(() => {
    const grid = document.querySelector('.audience-mode.cv-info-grid[data-mode="' + mode + '"]');
    if (!grid) return;
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
  rememberInfoGridPosition(grid);
  const mode = grid.dataset.mode || 'farmers';
  const { step, maxIndex } = infoGridMetrics(grid);
  const delta = direction === 'prev' ? -1 : 1;
  const nextIndex = Math.max(0, Math.min(maxIndex, (infoGridIndexByMode[mode] || 0) + delta));
  infoGridIndexByMode[mode] = nextIndex;
  const next = nextIndex * step;
  if (window.matchMedia('(max-width: 720px)').matches) {
    grid.scrollLeft = next;
  } else {
    animateScrollLeft(grid, next);
  }
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
  renderAnthem(countryId, info);
  renderHeaderMeta(countryId, info);

  const flag = document.getElementById('cv-flag');
  flag.hidden = false;
  flag.src = 'https://flagcdn.com/w160/' + info.cc + '.png';
  flag.alt = info.name + ' flag';
  flag.onerror = () => { flag.hidden = true; };

  renderAlmanacFromGis(countryId, info);
  if (countryPopTimer) clearInterval(countryPopTimer);
  countryPopTimer = null;
  if (countryUtilityTimer) clearInterval(countryUtilityTimer);
  countryUtilityTimer = null;
  stopAudioChannel();

  countryView.classList.add('open');
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
  document.body.style.overflow = '';
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
  syncRoute();
}

function isTouchLikePointer() {
  return window.matchMedia('(pointer:coarse)').matches || window.matchMedia('(hover:none)').matches;
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

backBtn.addEventListener('click', closeCountry);
document.getElementById('cv-prev')?.addEventListener('click', () => openCountryByOffset(-1));
document.getElementById('cv-next')?.addEventListener('click', () => openCountryByOffset(1));
document.getElementById('cv-map-prev')?.addEventListener('click', () => openCountryByOffset(-1));
document.getElementById('cv-map-next')?.addEventListener('click', () => openCountryByOffset(1));
dots.forEach(dot => dot.addEventListener('click', () => {
  setPanel(Number(dot.dataset.panel));
  syncRoute();
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
  updateAudienceMeta();
  if (!activeCountryMap) { syncRoute(); return; }
  const countryId = activeCountryMap.countryId;
  const info = COUNTRY_INFO[countryId];
  renderAudienceKpis(countryId, info);
  syncRoute();
});
audienceTabs.forEach(tab => tab.addEventListener('click', () => {
  if (!audienceSelect) return;
  audienceSelect.value = tab.dataset.audience || 'farmers';
  audienceSelect.dispatchEvent(new Event('change'));
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
  if (event.key === 'Escape' && countryView.classList.contains('open')) closeCountry();
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

function updateOverlayAccessibility() {
  const main = document.querySelector('main');
  if (!main) return;
  const wireOpen = document.getElementById('wire-view')?.classList.contains('open');
  const countryOpen = countryView.classList.contains('open');
  const blocked = wireOpen || countryOpen;
  main.setAttribute('aria-hidden', String(blocked));
  if ('inert' in main) main.inert = blocked;
}
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

// The AI desk hasn't filed from most countries yet. Rather than a dead-end placeholder, the
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

  const stats = countryDeskStats(countryId);
  const dominant = Object.entries(stats.agCounts || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed';
  const crops = farmExportsForCountry(countryId, dominant).slice(0, 3).filter(c => CROP_SEASONS[c]);
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

  const dia = DIASPORA[countryId];
  if (dia && dia.remit) {
    rows.push({ tag: 'WB / KNOMAD 2024', text: 'Remittance inflows around <b>' + escapeHtml(dia.remit) + '</b> a year' + (dia.dia ? ', diaspora roughly <b>' + escapeHtml(dia.dia) + '</b> abroad.' : '.') });
  }

  const infra = criticalInfraForCountry(countryId).slice(0, 2).map(item => item.name).filter(Boolean);
  rows.push({ tag: 'GIS layer', text: 'Capital <b>' + escapeHtml(info.capital || '—') + '</b>' + (infra.length ? '; watching <b>' + infra.map(escapeHtml).join('</b> and <b>') + '</b>.' : '.') });

  return '<div class="cv-brief-desk cv-deskfile">' +
    '<div class="cv-brief-head"><span class="t">Country <b>file</b></span><span class="m">Compiled from sourced desk layers</span></div>' +
    rows.map(r => '<div class="cv-df-row"><span class="cv-df-tag">' + r.tag + '</span><p>' + r.text + '</p></div>').join('') +
    '<div class="cv-df-note">The AI news desk has not filed from ' + escapeHtml(info.name || 'this country') + ' yet — ranked, source-cited stories replace this file after the next daily run.</div>' +
  '</div>';
}

function briefRowHtml(b, i, countryTag) {
  return '<article class="cv-news-row' + (i === 0 ? ' is-open' : '') + '">' +
    '<button class="cv-news-summary" type="button" aria-expanded="' + (i === 0 ? 'true' : 'false') + '">' +
      '<span class="cv-brief-rank">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<div class="cv-news-summary-main">' +
        '<div class="cv-news-summary-meta">' +
          (countryTag ? '<span class="cv-news-country">' + escapeHtml(countryTag) + '</span><span>·</span>' : '') +
          '<span class="cv-brief-topic">' + escapeHtml(b.topic || 'News') + '</span>' +
          '<span>·</span><span class="cv-news-source">' + escapeHtml((b.sources?.[0]?.name) || 'Sourced report') + '</span></div>' +
        '<h4 class="cv-brief-title">' + escapeHtml(b.headline) + '</h4>' +
      '</div>' +
      '<span class="cv-news-toggle" aria-hidden="true"></span>' +
    '</button>' +
    '<div class="cv-brief-main"' + (i === 0 ? '' : ' hidden') + '>' +
      '<p class="cv-brief-body">' + escapeHtml(b.body) + '</p>' +
      '<p class="cv-brief-why"><b>Context</b>' + escapeHtml(briefWhy(b)) + '</p>' +
      '<div class="cv-brief-src">' +
        (Array.isArray(b.sources) ? b.sources.filter(s => s && s.url).map(s =>
          '<a href="' + escapeHtml(safeUrl(s.url)) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(s.name || 'Source') + ' ↗</a>'
        ).join('') : '') +
      '</div>' +
    '</div>' +
  '</article>';
}

// News must stay news: when the desk hasn't filed from a country, its News panel carries the
// REGION's current wire stories (continental fallback), each tagged with its origin country.
// The data prose lives in Signals; the Country File renders only if no briefs exist anywhere.
function regionalWireFor(countryId) {
  const info = COUNTRY_INFO[countryId] || {};
  const pool = Object.entries(AI_BRIEFS).filter(([id, list]) => id !== countryId && Array.isArray(list) && list.some(b => b && b.headline && b.body));
  if (!pool.length) return null;
  const same = pool.filter(([id]) => (COUNTRY_INFO[id] || {}).region === info.region);
  const chosen = same.length ? same : pool;
  const scope = same.length ? info.region : 'Across the continent';
  const picks = [];
  for (let i = 0; picks.length < 6; i++) {
    let any = false;
    for (const [id, list] of chosen) {
      const b = list[i];
      if (b && b.headline && b.body) {
        picks.push({ brief: b, country: (COUNTRY_INFO[id] || {}).name || id.toUpperCase() });
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
    picks.map((p, i) => briefRowHtml(p.brief, i, p.country)).join('') +
    '<div class="cv-df-note">The AI desk has not filed from ' + escapeHtml(info.name || 'this country') + ' yet — these are current stories from the ' +
      escapeHtml(scope === 'Across the continent' ? 'continental' : scope) + ' wire. ' + escapeHtml(info.name || 'Its') + '&rsquo;s data file lives under Signals.</div>' +
  '</div>';
  return { html, label: scope === 'Across the continent' ? 'Continental wire' : scope + ' wire' };
}

function renderBriefDesk(countryId) {
  const cards = document.getElementById('cv-cards');
  const meta = document.getElementById('cv-story-meta');
  cards.classList.remove('queue-collapsed', 'card-open');
  cards.classList.add('news-brief');
  const briefs = (AI_BRIEFS[countryId] || []).filter(b => b && b.headline && b.body);
  const sourceCount = uniqueSourceCount(briefs);
  if (meta && briefs.length) meta.textContent = briefs.length + ' stories · ' + sourceCount + ' sources';
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
  const when = relativeDateLabel(String(AI_BRIEFS_DATES[countryId] || AI_BRIEFS_AT || '').slice(0,10));
  cards.innerHTML =
    '<div class="cv-brief-desk">' +
      '<div class="cv-brief-head"><span class="t">Country <b>brief</b></span>' +
        '<span class="m">' + (when ? escapeHtml(when) : 'Top story first') + '</span></div>' +
      briefs.map((b, i) => briefRowHtml(b, i)).join('') +
    '</div>';
  wireBriefAccordion(cards);
}

function wireBriefAccordion(cards) {
  cards.onclick = event => {
    const summary = event.target.closest('.cv-news-summary');
    if (!summary) return;
    const row = summary.closest('.cv-news-row');
    const detail = row?.querySelector('.cv-brief-main');
    if (!row || !detail) return;
    const opening = !row.classList.contains('is-open');
    if (opening) {
      cards.querySelectorAll('.cv-news-row.is-open').forEach(openRow => {
        if (openRow === row) return;
        openRow.classList.remove('is-open');
        const openDetail = openRow.querySelector('.cv-brief-main');
        const openButton = openRow.querySelector('.cv-news-summary');
        if (openDetail) openDetail.hidden = true;
        if (openButton) openButton.setAttribute('aria-expanded', 'false');
      });
    }
    row.classList.toggle('is-open', opening);
    detail.hidden = !opening;
    summary.setAttribute('aria-expanded', String(opening));
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

  // Agriculture profile
  const agCounts = { crop_zone: 0, pastoral: 0, mixed: 0 };
  for (const p of places) if (p.ag_type && agCounts[p.ag_type] !== undefined) agCounts[p.ag_type]++;
  const agTotal = agCounts.crop_zone + agCounts.pastoral + agCounts.mixed;
  const ag = document.getElementById('cv-ag');
  const agMeta = document.getElementById('cv-ag-meta');

  if (agTotal === 0) {
    ag.innerHTML = '<div class="cv-empty">No agricultural classification on record.</div>';
    agMeta.textContent = '';
  } else {
    const pct = {
      crop_zone: Math.round((agCounts.crop_zone / agTotal) * 100),
      pastoral: Math.round((agCounts.pastoral / agTotal) * 100),
      mixed: Math.round((agCounts.mixed / agTotal) * 100)
    };
    const dominant = Object.entries(agCounts).sort((a, b) => b[1] - a[1])[0][0];
    const dominantLabel = dominant === 'crop_zone' ? 'Crop belt' : dominant === 'pastoral' ? 'Pastoral' : 'Mixed farming';
    const exportItems = farmExportsForCountry(countryId, dominant);
    const segs = [
      { cls: 'crop', label: 'Crop', val: pct.crop_zone },
      { cls: 'pastoral', label: 'Pastoral', val: pct.pastoral },
      { cls: 'mixed', label: 'Mixed', val: pct.mixed }
    ].filter(s => s.val > 0);
    agMeta.textContent = '';
    ag.innerHTML =
      '<div class="cv-ag-type"><em>' + dominantLabel + '</em></div>' +
      '<div class="cv-ag-bar" role="img" aria-label="Agriculture mix">' +
        segs.map(s => '<div class="' + s.cls + '" style="width:' + s.val + '%"></div>').join('') +
      '</div>' +
      '<div class="cv-ag-legend">' +
        segs.map(s => '<span><i class="' + s.cls + '"></i>' + s.label + ' <b>' + s.val + '%</b></span>').join('') +
      '</div>' +
      '<div class="cv-ag-line"><span class="cv-ag-line-key">Planting</span><span class="cv-ag-line-val">' + farmSeasonLabel(countryId) + '</span></div>' +
      '<div class="cv-ag-line"><span class="cv-ag-line-key">Exports</span><span class="cv-ag-line-val">' + exportItems.slice(0, 3).map(escapeHtml).join(' · ') + '</span></div>';
  }

  // Market hubs — include all is_market places, plus high-pop places with regional/export market_type
  const markets = places.filter(p => p.is_market).sort((a, b) => {
    const order = { export_hub: 0, regional: 1, local: 2 };
    return (order[a.market_type] ?? 3) - (order[b.market_type] ?? 3) || (b.pop || 0) - (a.pop || 0);
  });
  const mkt = document.getElementById('cv-markets');
  const mktMeta = document.getElementById('cv-mkt-meta');
  if (!markets.length) {
    mkt.innerHTML = '<div class="cv-empty">No designated market hubs in registry.</div>';
    mktMeta.textContent = '';
  } else {
    mktMeta.textContent = markets.length + ' ' + (markets.length === 1 ? 'hub' : 'hubs');
    const tierLabel = t => t === 'export_hub' ? 'Export hub' : t === 'regional' ? 'Regional' : 'Local';
    mkt.innerHTML =
      '<div class="cv-mkt-row head"><span>City</span><span>Tier</span><span>Pop</span></div>' +
      markets.map(p =>
        '<div class="cv-mkt-row">' +
          '<div class="cv-mkt-name"><i class="dot ' + (p.market_type || 'local') + '"></i><span>' + escapeHtml(p.name) + '</span></div>' +
          '<div class="cv-mkt-tier">' + tierLabel(p.market_type) + '</div>' +
          '<div class="cv-mkt-pop">' + formatCompactPop(p.pop) + '</div>' +
        '</div>'
      ).join('');
  }

  // Critical infrastructure roster
  const criticalInfra = criticalInfraForCountry(countryId);
  const infraCounts = countInfraKinds(criticalInfra);
  const infra = document.getElementById('cv-infra');
  const cell = (key) => {
    const meta = infraKindMeta(key);
    const count = infraCounts[key];
    const sample = criticalInfra.find(item => item.kind === key)?.place;
    return '<div class="cv-infra-cell' + (count === 0 ? ' zero' : '') + '">' +
      '<div class="cv-infra-icon">' + meta.glyph + '</div>' +
      '<div class="cv-infra-count">' + count + '</div>' +
      '<div class="cv-infra-key">' + meta.label + '</div>' +
      '<div class="cv-infra-sub">' + (sample ? 'incl. ' + escapeHtml(sample) : (count ? '&nbsp;' : 'None on file')) + '</div>' +
    '</div>';
  };
  infra.innerHTML =
    '<div class="cv-infra-summary">' +
      cell('port') + cell('rail') + cell('dry_port') + cell('airport') +
    '</div>';
}

function farmExportsForCountry(countryId, dominant) {
  if (FARM_EXPORTS[countryId]) return FARM_EXPORTS[countryId];
  if (dominant === 'pastoral') return ['Livestock', 'Hides', 'Dairy'];
  if (dominant === 'mixed') return ['Maize', 'Beans', 'Oilseed'];
  return ['Cereals', 'Coffee', 'Horticulture'];
}

function farmSeasonLabel(countryId) {
  const info = COUNTRY_INFO[countryId];
  const region = (info?.region || '').toLowerCase();
  if (['ug', 'ke', 'rw', 'bi'].includes(countryId)) return 'Mar-May';
  if (['tz', 'mw', 'zm', 'zw', 'mz'].includes(countryId)) return 'Nov-Apr';
  if (['sn', 'gm', 'ml', 'ne', 'bf', 'ng', 'bj', 'tg'].includes(countryId)) return 'Jun-Sep';
  if (['ma', 'dz', 'tn', 'ly', 'eg'].includes(countryId)) return 'Oct-Feb';
  if (['so', 'er', 'dj', 'km'].includes(countryId)) return 'Mar-May';
  if (['sd', 'ss', 'td', 'cf', 'mr'].includes(countryId)) return 'Jun-Sep';
  if (['za', 'na', 'bw', 'ls', 'sz'].includes(countryId)) return 'Nov-Feb';
  if (['ao', 'cd', 'cg', 'cm', 'ga', 'gq', 'st'].includes(countryId)) return 'Mar-Jun';
  if (region.includes('north')) return 'Oct-Feb';
  if (region.includes('southern')) return 'Nov-Mar';
  if (region.includes('west')) return 'May-Oct';
  return 'Seasonal';
}

function formatCompactPop(n) {
  if (!n) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k';
  return String(n);
}

function countryDeskStats(countryId) {
  const gis = COUNTRY_GIS[countryId] || { places: [], rivers: [], lakes: [] };
  const places = gis.places || [];
  const agCounts = { crop_zone: 0, pastoral: 0, mixed: 0 };
  const infraCounts = { port: 0, rail: 0, road: 0 };
  for (const place of places) {
    if (place.ag_type && agCounts[place.ag_type] !== undefined) agCounts[place.ag_type]++;
    for (const tag of (place.infrastructure || [])) if (infraCounts[tag] !== undefined) infraCounts[tag]++;
  }
  const markets = places.filter(p => p.is_market);
  const agTotal = agCounts.crop_zone + agCounts.pastoral + agCounts.mixed;
  const dominant = Object.entries(agCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed';
  const dominantLabel = dominant === 'crop_zone' ? 'Crop belt' : dominant === 'pastoral' ? 'Pastoral' : 'Mixed';
  return { gis, places, agCounts, agTotal, dominantLabel, markets, infraCounts };
}

function signalCardHtml(card) {
  const actionUrl = card.actionUrl ? safeUrl(card.actionUrl) : '';
  const action = actionUrl && actionUrl !== '#'
    ? '<a class="cv-signal-action" href="' + escapeHtml(actionUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(card.actionLabel || 'Open source') + ' <span aria-hidden="true">↗</span></a>'
    : '';
  return (
    '<article class="cv-signal-card">' +
      '<div class="cv-signal-kicker">' + escapeHtml(card.kicker) + '</div>' +
      '<h5 class="cv-signal-title">' + escapeHtml(card.title) + '</h5>' +
      '<p class="cv-signal-copy">' + escapeHtml(card.copy) + '</p>' +
      '<div class="cv-signal-footer"><span>' + escapeHtml(card.metric || 'Desk signal') + '</span>' + action + '</div>' +
    '</article>'
  );
}

function renderSignalCards(target, cards) {
  if (!target) return;
  if (!cards.length) {
    target.innerHTML = '<div class="cv-signal-empty">No decision signals generated yet.</div>';
    return;
  }
  target.innerHTML = '<div class="cv-signal-grid">' + cards.map(signalCardHtml).join('') + '</div>';
}

function renderFarmerSignals(countryId, stats) {
  const target = document.getElementById('cv-farmer-signals');
  if (!target) return;
  const info = COUNTRY_INFO[countryId] || {};
  const critical = criticalInfraForCountry(countryId);
  const dominant = Object.entries(stats.agCounts || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed';
  const exports = farmExportsForCountry(countryId, dominant);
  const firstMarket = stats.markets?.[0]?.name || info.capital || 'capital market';
  const waterCount = ((stats.gis?.rivers || []).length + (stats.gis?.lakes || []).length);
  const route = critical.find(item => ['corridor', 'road', 'rail', 'dry_port', 'port'].includes(item.kind));
  const cards = [
    {
      kicker: 'Crop read',
      title: (exports[0] || 'Food') + ' pricing window',
      copy: 'Watch ' + firstMarket + ' quotes during ' + farmSeasonLabel(countryId) + '. Treat it as a crop window, not a national forecast.',
      metric: stats.dominantLabel + ' profile'
    },
    {
      kicker: 'Water risk',
      title: waterCount + ' mapped water points',
      copy: 'Use rivers and lakes as the first irrigation and flood check. Live gauge data still needs local sourcing.',
      metric: 'Hydrology'
    },
    {
      kicker: 'Route watch',
      title: route ? route.name : 'Nearest market corridor',
      copy: route ? route.note + ' Watch dwell time, fuel cost, and road disruption here.' : 'No corridor lead is tagged yet; start with the capital market and nearest border route.',
      metric: route ? infraKindMeta(route.kind).label : 'Needs survey'
    },
    {
      kicker: 'Agtech wedge',
      title: 'Mechanization + market proof',
      copy: 'Best wedge: planting timing, buyer access, and transport reliability in one simple grower workflow.',
      metric: 'Operator angle'
    }
  ];
  renderSignalCards(target, cards);
}

function signalCardsHtml(cards) {
  if (!cards.length) return '<div class="cv-signal-empty">No decision signals generated yet.</div>';
  return '<div class="cv-signal-grid">' + cards.map(signalCardHtml).join('') + '</div>';
}

function sectorInsight(sector, inv, countryId) {
  const s = String(sector || '').toLowerCase();
  const access = inv.access || 'Open';
  const currency = inv.currency || 'local';
  const market = marketsForCountry(countryId);
  if (s.includes('oil') || s.includes('gas') || s.includes('lng') || s.includes('energy')) {
    return { demand: 'Export-linked', risk: inv.risk === 'high' ? 'Permit + security' : 'Policy watch', route: 'Ports + grid' };
  }
  if (s.includes('agri') || s.includes('cocoa') || s.includes('cashew') || s.includes('beef') || s.includes('coffee')) {
    return { demand: 'Food security', risk: 'Weather + logistics', route: 'Farmgate markets' };
  }
  if (s.includes('tour') || s.includes('hospitality')) {
    return { demand: 'Visitor spend', risk: 'FX + airlift', route: 'Airport access' };
  }
  if (s.includes('tech') || s.includes('ict') || s.includes('fintech') || s.includes('telecom')) {
    return { demand: 'Urban adoption', risk: 'Regulation', route: 'Mobile rails' };
  }
  if (s.includes('mining') || s.includes('gold') || s.includes('copper') || s.includes('diamond')) {
    return { demand: 'Commodity cycle', risk: 'License + ESG', route: 'Rail/port corridor' };
  }
  if (s.includes('finance') || s.includes('bank')) {
    return { demand: market ? market.exchange : 'Capital access', risk: 'Rates + FX', route: currency + ' liquidity' };
  }
  if (s.includes('manufact') || s.includes('automotive') || s.includes('textile') || s.includes('construction')) {
    return { demand: 'Industrial buildout', risk: 'Power + inputs', route: 'Supplier corridors' };
  }
  return { demand: 'Local demand', risk: access + ' access', route: currency + ' exposure' };
}

function renderInvestorSignals(countryId, inv, info) {
  const stats = countryDeskStats(countryId);
  const profile = marketProfileForCountry(countryId);
  const market = profile.market;
  const sectors = (inv.sectors || []).slice(0, 4);
  const topSector = sectors[0] || 'Growth sectors';
  const insight = sectorInsight(topSector, inv, countryId);
  const access = inv.access || 'Unrated';
  const currency = inv.currency || 'local currency';
  const countryName = info.name || 'This country';
  const capital = info.capital || countryName;
  const mappedMarkets = stats.markets || [];
  const mappedNames = mappedMarkets.slice(0, 2).map(place => place.name).join(' and ');
  const marketTitle = profile.exchange
    ? profile.exchange + ' · ' + profile.scope
    : 'No domestic exchange verified';
  const marketCopy = profile.exchange
    ? profile.name + ' is verified in the market directory. ' +
      (market?.companies?.length
        ? market.companies.length + ' reference listings are loaded; verify current prices, filings, liquidity, and free float before acting.'
        : 'Company-level data is not loaded here, so use the official venue for current listings, filings, and broker requirements.')
    : 'The directory has no verified domestic venue for ' + countryName + '. Check regional exchanges, licensed banks, and private financing instead.';
  return signalCardsHtml([
    {
      kicker: 'Sector hypothesis',
      title: topSector,
      copy: 'Demand lens: ' + insight.demand + '. Test ' + insight.risk.toLowerCase() + ', unit economics, and the route to market with customers and local operators.',
      metric: insight.route + ' · validate locally'
    },
    {
      kicker: 'Capital route',
      title: marketTitle,
      copy: marketCopy,
      metric: profile.exchange
        ? (market?.companies?.length ? market.companies.length + ' reference listings' : 'Official venue · current data')
        : 'Regional · bank · private capital',
      actionUrl: profile.url,
      actionLabel: profile.exchange ? 'Open ' + profile.exchange : ''
    },
    {
      kicker: 'Entry checks',
      title: access + ' access flag',
      copy: 'This is a screening label, not clearance. Confirm ownership rules, permits, tax treatment, and ' + currency + ' capital repatriation with licensed local advisers.',
      metric: 'Legal · tax · currency'
    },
    {
      kicker: 'Local evidence',
      title: mappedMarkets.length
        ? mappedMarkets.length + ' mapped market hub' + (mappedMarkets.length === 1 ? '' : 's')
        : 'Atlas coverage gap',
      copy: mappedMarkets.length
        ? mappedNames + (mappedMarkets.length === 1 ? ' is a starting point' : ' are starting points') + ', not proof of distribution. Confirm transport time, warehousing, customs, and counterparties locally.'
        : 'No market hub is verified in the ' + countryName + ' Atlas file yet. Start with ' + capital + ', then confirm distributors, warehousing, and transport routes locally.',
      metric: mappedMarkets.length ? 'Mapped lead · verify locally' : 'Missing data · verify locally'
    }
  ]);
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
}

function renderDiasporaKpis(countryId, info) {
  const inv = investorForCountry(countryId, info);
  const dia = DIASPORA[countryId] || {};
  setKpiCells([
    { key: 'Population', value: formatPop(livePopulation(info.pop, info.gr)), sub: 'At home', explain: 'Resident population estimate for the country.' },
    { key: 'Remittances', value: dia.remit || '—', sub: 'World Bank/KNOMAD 2024', explain: 'Annual inbound remittance scale where a sourced estimate is available.' },
    { key: 'Abroad', value: dia.dia || '—', sub: 'People in diaspora', explain: 'Approximate diaspora size where a sourced estimate is available.' },
    { key: 'Payout rail', value: inv.currency || '—', sub: 'Local currency', explain: 'Currency families and payout quotes should be checked against providers.' }
  ]);
}

function renderFarmerKpis(countryId) {
  const stats = countryDeskStats(countryId);
  const criticalInfra = criticalInfraForCountry(countryId);
  const infraTotal = criticalInfra.length;
  const infraKinds = countInfraKinds(criticalInfra);
  const waterCount = (stats.gis.rivers || []).length + (stats.gis.lakes || []).length;
  setKpiCells([
    { key: 'Weather · Live', value: '—', sub: 'Fetching station data', explain: 'Live weather is fetched for the capital or closest mapped reference point.' },
    { key: 'Market hubs', value: String(stats.markets.length), sub: stats.markets.length === 1 ? 'Designated hub' : 'Designated hubs', explain: 'Mapped market hubs from the country atlas layer.' },
    { key: 'Critical infra', value: String(infraTotal), sub: infraKinds.port + ' ports · ' + infraKinds.rail + ' rail · ' + infraKinds.dry_port + ' dry ports', explain: 'Tagged infrastructure nodes that matter for movement, trade, and access.' },
    { key: 'Water registry', value: String(waterCount), sub: (stats.gis.rivers || []).length + ' rivers · ' + (stats.gis.lakes || []).length + ' lakes', explain: 'Mapped rivers and lakes from the GIS country file.' }
  ]);
}

function criticalInfraForCountry(countryId) {
  const info = COUNTRY_INFO[countryId] || {};
  const gis = COUNTRY_GIS[countryId] || { places: [] };
  const seeded = CRITICAL_INFRA_SEEDS[countryId] || [];
  const items = [];
  const seen = new Set();
  const add = item => {
    if (!item || !item.name) return;
    const key = (item.kind || 'node') + ':' + normalizeName(item.name);
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      kind: item.kind || 'node',
      name: item.name,
      place: item.place || item.name,
      lon: item.lon,
      lat: item.lat,
      note: item.note || infraKindMeta(item.kind).note
    });
  };
  seeded.forEach(add);
  for (const place of (gis.places || [])) {
    for (const tag of (place.infrastructure || [])) {
      if (tag === 'port') add({ name: place.name + ' Port', kind: 'port', place: place.name, lon: place.lon, lat: place.lat, note: 'Cargo and passenger gateway' });
      if (tag === 'rail') add({ name: place.name + ' Rail Node', kind: 'rail', place: place.name, lon: place.lon, lat: place.lat, note: 'Rail logistics interchange' });
      if (tag === 'road') add({ name: place.name + ' Road Hub', kind: 'road', place: place.name, lon: place.lon, lat: place.lat, note: 'Road corridor junction' });
    }
  }
  const capital = (gis.places || []).find(p => p.capital) || (gis.places || [])[0];
  if (capital && !items.some(item => item.kind === 'airport')) {
    add({ name: capital.name + ' Air Gateway', kind: 'airport', place: capital.name, lon: capital.lon, lat: capital.lat, note: 'Air access and emergency logistics' });
  }
  if (capital && !items.some(item => item.kind === 'dry_port') && !items.some(item => item.kind === 'port')) {
    add({ name: capital.name + ' Inland Freight Desk', kind: 'dry_port', place: capital.name, lon: capital.lon, lat: capital.lat, note: 'Customs, warehousing, and inland cargo' });
  }
  if (capital && !items.some(item => item.kind === 'corridor')) {
    add({ name: info.name ? info.name + ' Primary Corridor' : capital.name + ' Corridor', kind: 'corridor', place: capital.name, lon: capital.lon, lat: capital.lat, note: 'Main movement corridor for people and goods' });
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
    airport: { label: 'Air cargo', short: 'AIR', glyph: 'A', note: 'Air logistics hub' },
    border: { label: 'Borders', short: 'BR', glyph: 'B', note: 'Cross-border trade post' },
    corridor: { label: 'Corridors', short: 'CO', glyph: 'C', note: 'Freight movement spine' }
  })[kind] || { label: 'Node', short: 'ND', glyph: 'N', note: 'Critical node' };
}

function renderInvestorKpis(countryId, info) {
  const inv = investorForCountry(countryId, info);
  const riskLabel = inv.risk === 'low' ? 'Low' : inv.risk === 'med' ? 'Medium' : 'High';
  setKpiCells([
    { key: 'GDP', value: inv.gdp, sub: gdpSubLabel(inv), green: true, explain: 'Nominal GDP in current US dollars from the latest available economy file.' },
    { key: 'GDP growth', value: (inv.gdp_growth > 0 ? '+' : '') + inv.gdp_growth + '%', sub: growthSubLabel(inv), green: inv.gdp_growth >= 4, explain: 'Latest annual real GDP growth rate available in the country file.' },
    { key: 'FDI inflows', value: inv.fdi, sub: inv.fdiYear ? 'World Bank ' + inv.fdiYear : (inv.estimated ? 'Desk model estimate' : 'Desk file · UNCTAD 2023-24'), explain: 'Foreign direct investment inflows where a sourced estimate is available.' },
    { key: 'Risk / access', value: riskLabel, sub: inv.access + ' · ' + inv.currency, explain: 'Qualitative access flag used to prompt due diligence, not an investment recommendation.' }
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
  const date = String(AI_BRIEFS_DATES[countryId] || AI_BRIEFS_AT || latestBriefDate() || new Date().toISOString()).slice(0, 10);
  const lines = ['The African Street Journal', (info.name || 'Country') + ' brief - ' + date, ''];
  if (!briefs.length) {
    lines.push('No AI Desk brief is loaded for this country yet.');
    return lines.join('\n');
  }
  briefs.slice(0, 6).forEach((brief, index) => {
    const sources = (brief.sources || []).map(source => source.name || source.url).filter(Boolean).join(', ');
    lines.push((index + 1) + '. ' + brief.headline);
    lines.push('   ' + (brief.body || ''));
    lines.push('   Why it matters: ' + briefWhy(brief));
    if (sources) lines.push('   Sources: ' + sources);
    lines.push('');
  });
  return lines.join('\n').trim();
}

function countryFocusPoint(countryId, info) {
  const gis = COUNTRY_GIS[countryId] || { places: [] };
  const capitalName = normalizeName(info.capital);
  return gis.places.find(place => place.capital) ||
    gis.places.find(place => normalizeName(place.name) === capitalName) ||
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
    source: src.name || 'AI Desk',
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

function atlasFeaturePoints(countryId) {
  return LANDMARK_POINTS.filter(item => item.countries?.includes(countryId));
}

function linesForCountry(countryId) {
  return LANDMARK_LINES.filter(item => item.countries?.includes(countryId));
}

function detailPoint(lon, lat) {
  return [lon, -lat];
}

function drawCountryMap(countryId, countryPath) {
  if (!countryMapCanvas || !countryMapCtx) return;
  const rect = countryMapCanvas.getBoundingClientRect();
  const isFs = document.getElementById('cv-map-portal').classList.contains('active');
  const baseDpr = Math.min(2, window.devicePixelRatio || 1);
  // The embedded map is physically small, so the same DPR puts far fewer device pixels on the
  // country than fullscreen does. Supersample it (render above display resolution, let the
  // browser downscale) so labels and contour lines are as crisp as the fullscreen view.
  const mapDpr = isFs ? baseDpr : Math.min(3, baseDpr * 2);
  const width = Math.max(520, Math.min(2600, Math.round(rect.width || 720)));
  const height = Math.max(420, Math.min(1600, Math.round(rect.height || 560)));
  countryMapCanvas.width = width * mapDpr;
  countryMapCanvas.height = height * mapDpr;
  countryMapCtx.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
  countryMapCtx.clearRect(0, 0, width, height);

  const detail = COUNTRY_DETAIL[countryId];
  const mapPath = detail
    ? { shape: new Path2D(detail.d), bbox: detail.bbox }
    : countryPath;
  if (!mapPath) return;

  const bounds = mapViewBounds(countryId, mapPath.bbox, isFs);
  // Padding scales with the canvas so small embedded maps don't spend ~18% of their width on
  // margin: ~5.5% of the short side, clamped to 28-72px (island focus crops keep extra room).
  const pad = isFs && ISLAND_FULLSCREEN_BOUNDS[countryId]
    ? 92
    : Math.max(28, Math.min(72, Math.round(Math.min(width, height) * 0.055)));
  const baseScale = Math.min((width - pad * 2) / bounds.width, (height - pad * 2) / bounds.height);
  const scale = baseScale * islandFullscreenZoom(countryId, isFs);
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
  countryMapCtx.fillStyle = '#3f8f49';
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

function islandFullscreenZoom(countryId, isFullscreen) {
  // Zoom-past-fit is only safe on top of an explicit ISLAND_FULLSCREEN_BOUNDS focus crop
  // (it trims empty ocean around archipelagos). Applied to a full-country fit it guarantees
  // overflow — e.g. Gambia at 1.6x spilled off both edges of the screen.
  if (!isFullscreen || !ISLAND_FULLSCREEN_BOUNDS[countryId]) return 1;
  return ({ cv: 1.15, km: 1.15, st: 1.15 })[countryId] || 1;
}

function mapViewBounds(countryId, bounds, isFullscreen) {
  const focus = isFullscreen ? ISLAND_FULLSCREEN_BOUNDS[countryId] : null;
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

  // Capital labels are orientation anchors. Pin them before collision checks so
  // a resize cannot make nearby labels push the capital name into another slot.
  if (force) {
    const [dx, dy] = order[0];
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

  if (mapLayers.places) {
    const places = (gis.places || [])
      .slice()
      .sort((a, b) => Number(!!b.capital) - Number(!!a.capital) || (b.pop || 0) - (a.pop || 0))
      .slice(0, 35);
    for (const place of places) {
      const [x, y] = project(place.lon, place.lat);
      let labelDrawn = false;
      const shouldLabel = place.capital || place.pop > 180000 || placedLabels.length < 14;
      if (mapLayers.labels && shouldLabel) {
        countryMapCtx.font = place.capital
          ? '800 10px ui-monospace, SFMono-Regular, Consolas, monospace'
          : '700 9px ui-monospace, SFMono-Regular, Consolas, monospace';
        labelDrawn = drawSmartLabel(place.name.toUpperCase(), x, y, place.capital ? '#f1f7ef' : '#e0ecdf', placedLabels, width, height, place.capital ? 'right' : 'top', !!place.capital);
      }
      if (!place.capital) {
        if (!mapLayers.labels || !labelDrawn) continue;
        continue;
      }
      countryMapCtx.beginPath();
      countryMapCtx.arc(x, y, 4.4, 0, Math.PI * 2);
      countryMapCtx.fillStyle = '#b9f2bc';
      countryMapCtx.fill();
      countryMapCtx.strokeStyle = 'rgba(9,28,14,0.88)';
      countryMapCtx.lineWidth = 1.2;
      countryMapCtx.stroke();
    }
    for (const landmark of atlasFeaturePoints(countryId)) {
      if (landmark.kind === 'city') continue;
      const [x, y] = project(landmark.lon, landmark.lat);
      if (mapLayers.labels) {
        countryMapCtx.font = '700 10px ui-monospace, SFMono-Regular, Consolas, monospace';
        const labelDrawn = drawSmartLabel(landmark.name.toUpperCase(), x, y, '#eef6ec', placedLabels, width, height, landmark.kind === 'water' ? 'left' : 'right');
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
  }

  if (mapLayers.infra) {
    for (const item of criticalInfraForCountry(countryId).slice(0, 9)) {
      if (!Number.isFinite(item.lon) || !Number.isFinite(item.lat)) continue;
      const [x, y] = project(item.lon, item.lat);
      if (mapLayers.labels) {
        countryMapCtx.font = '800 9px ui-monospace, SFMono-Regular, Consolas, monospace';
        const labelDrawn = drawSmartLabel(item.name.toUpperCase(), x, y, '#fff0a9', placedLabels, width, height, 'right');
        if (!labelDrawn) continue;
      }
      countryMapCtx.save();
      countryMapCtx.translate(x, y);
      countryMapCtx.rotate(Math.PI / 4);
      countryMapCtx.fillStyle = '#d6b74d';
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

function drawLinearFeatures(countryId, project, placedLabels, width, height) {
  for (const line of linesForCountry(countryId)) {
    if (line.kind === 'water' && !mapLayers.water) continue;
    if (line.kind !== 'water' && !mapLayers.places) continue;
    countryMapCtx.beginPath();
    line.points.forEach(([lon, lat], index) => {
      const [x, y] = project(lon, lat);
      if (index === 0) countryMapCtx.moveTo(x, y);
      else countryMapCtx.lineTo(x, y);
    });
    countryMapCtx.strokeStyle = line.kind === 'water' ? 'rgba(78,188,225,0.82)' : 'rgba(220,235,212,0.42)';
    countryMapCtx.lineWidth = line.kind === 'water' ? 2.2 : 1.1;
    countryMapCtx.stroke();
    if (mapLayers.labels) {
      const mid = line.points[Math.floor(line.points.length / 2)];
      const [x, y] = project(mid[0], mid[1]);
      countryMapCtx.font = '700 10px ui-monospace, SFMono-Regular, Consolas, monospace';
      drawSmartLabel(line.name.toUpperCase(), x, y, line.kind === 'water' ? '#c9f1ff' : '#e9f2df', placedLabels, width, height, 'top');
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

function relativeDateLabel(date) {
  if (!date) return '';
  const then = new Date(date + 'T00:00:00');
  if (isNaN(then)) return '';
  const days = Math.round((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return days + ' days ago';
  if (days < 30) return Math.round(days / 7) + 'w ago';
  return then.toISOString().slice(0, 10);
}

function storySummary(story) {
  if (story.summary) return story.summary;
  const place = story.place || 'the capital';
  const type = (story.type || 'local').toLowerCase();
  if (type.includes('climate')) return 'Residents and local officials are tracking weather shifts, water levels, and the street-level impact around ' + place + '.';
  if (type.includes('transport') || type.includes('movement')) return 'Commuters, drivers, and small businesses are watching how movement through ' + place + ' changes the cost of the day.';
  if (type.includes('market') || type.includes('business')) return 'Traders in ' + place + ' are reading demand, delays, and prices as early signals for the week ahead.';
  if (type.includes('river')) return 'Boat crews and river communities near ' + place + ' are mapping route changes as conditions shift.';
  return 'A street-level brief from ' + place + ', built around the voices, prices, and decisions shaping the day.';
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

function renderInvestorMarkets(countryId) {
  const wrap = document.getElementById('cv-heatmap');
  const meta = document.getElementById('cv-heat-meta');
  if (!wrap) return;
  const profile = marketProfileForCountry(countryId);
  const m = marketsForCountry(countryId);
  if (!profile.exchange) {
    if (meta) meta.textContent = 'Capital market directory';
    wrap.innerHTML = '<div class="cv-heat-empty"><b>N/A</b><br>No domestic securities exchange has been verified for this country. Review regional listings, private markets, and bank financing instead.</div>';
    return;
  }
  if (!m) {
    if (meta) meta.textContent = profile.exchange + ' · ' + profile.name;
    wrap.innerHTML = '<div class="cv-heat-empty"><b>' + escapeHtml(profile.exchange) + '</b> · ' + escapeHtml(profile.scope) + ' market<br>' +
      'A current listed-company dataset is not available.' +
      (profile.url ? '<br><a href="' + escapeHtml(safeUrl(profile.url)) + '" target="_blank" rel="noopener noreferrer">Open ' + escapeHtml(profile.exchange) + ' official site ↗</a>' : '') +
      '</div>';
    return;
  }
  const isLive = !!m.isLive;
  if (meta) meta.textContent = profile.exchange + ' · ' + profile.name;
  const sorted = m.companies.slice().filter(c => c && c.t && c.cap > 0).sort((a, b) => b.cap - a.cap);
  const items = sorted.map((c, i) => {
    const issuer = issuerForCountry(countryId, c.t);
    return {
      value:c.cap,
      t:c.t,
      name:c.name || issuer?.name || '',
      change:isLive ? Number(c.change) || 0 : 0,
      rank:i + 1,
      total:sorted.length
    };
  });
  const W = 1000, H = 560;
  const rects = squarifyTreemap(items, W, H);
  wrap.innerHTML =
    '<div class="cv-heat-grid">' +
      rects.map(r => {
        const wp = (r.w / W * 100), hp = (r.h / H * 100);
        const big = (r.w / W > 0.16 && r.h / H > 0.18);
        const fs = Math.max(8, Math.min(20, Math.round(Math.min(r.w / W * 70, r.h / H * 52))));
        const sign = r.change > 0 ? '+' : '';
        const title = isLive ? r.t + ' ' + sign + r.change + '%' : r.t + ' · reference company';
        return '<button class="cv-heat-tile" type="button" data-tkr="' + escapeHtml(r.t) + '" data-name="' + escapeHtml(r.name) + '" data-chg="' + r.change + '" data-rank="' + r.rank + '" data-total="' + r.total + '" style="left:' + (r.x / W * 100) + '%;top:' + (r.y / H * 100) + '%;width:' + wp + '%;height:' + hp + '%;background:' + (isLive ? heatColor(r.change) : 'rgb(28,66,42)') + '" title="' + escapeHtml(title) + '">' +
          '<span class="cv-heat-tkr" style="font-size:' + fs + 'px">' + escapeHtml(r.t) + '</span>' +
          (isLive && big ? '<span class="cv-heat-chg">' + sign + r.change.toFixed(1) + '%</span>' : '') +
        '</button>';
      }).join('') +
    '</div>' +
    '<div class="cv-heat-detail" id="cv-heat-detail" hidden></div>' +
    '<div class="cv-heat-key"><span class="cv-heat-note">' + (isLive ? 'Latest reported move · ' + escapeHtml(String(m.asOf || '').slice(0,10)) : 'Reference company size · no live price claim') + '</span></div>';
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

// Diaspora population + annual remittance inflows (USD bn) — World Bank/KNOMAD scale, approximate.
const DIASPORA = {
  ng:{remit:'$20B',dia:'1.7M'}, eg:{remit:'$29B',dia:'3.6M'}, ma:{remit:'$12B',dia:'5.1M'}, gh:{remit:'$4.6B',dia:'1.0M'},
  ke:{remit:'$4.9B',dia:'0.5M'}, sn:{remit:'$2.7B',dia:'0.6M'}, zw:{remit:'$2.0B',dia:'1.1M'}, ug:{remit:'$1.4B',dia:'0.7M'},
  dz:{remit:'$1.8B',dia:'1.8M'}, tn:{remit:'$2.8B',dia:'1.3M'}, et:{remit:'$0.5B',dia:'0.8M'}, za:{remit:'$0.9B',dia:'0.9M'},
  ml:{remit:'$1.1B',dia:'1.2M'}, cd:{remit:'$1.3B',dia:'1.4M'}, ci:{remit:'$0.5B',dia:'1.1M'}, so:{remit:'$1.7B',dia:'2.0M'},
  tz:{remit:'$0.6B',dia:'0.3M'}, lr:{remit:'$0.6B',dia:'0.2M'}
};
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
  const dia = DIASPORA[countryId] || {};
  const capitalPath = (inv.sectors || [])[0] || 'Family support';
  if (fxMeta) fxMeta.textContent = formatFxDate(window.__FX_AT) ? ('USD reference · ' + formatFxDate(window.__FX_AT)) : ccy;
  fxEl.innerHTML =
    '<div class="cv-dia-rate"><div class="cv-dia-rate-key">$1 USD buys</div>' +
      '<div class="cv-dia-rate-val">' + rateStr + ' <span>' + escapeHtml(ccy || '') + '</span></div>' +
      '<div class="cv-dia-rate-sub">' + escapeHtml(CCY_NAME[ccy] || 'local currency') + (Number.isFinite(rate) ? ' · automatic reference rate' : ' · reference unavailable') + '</div>' +
    '</div>' +
    '<div class="cv-dia-facts">' +
      '<div class="cv-dia-fact"><b>Fee spread</b><span>Compare provider quote</span></div>' +
      '<div class="cv-dia-fact"><b>' + escapeHtml(capitalPath) + '</b><span>Capital path</span></div>' +
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
  if (secEl) secEl.innerHTML = inv.sectors.map(s => '<div class="cv-sector">' + escapeHtml(s) + '</div>').join('');
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

  sectorsEl.innerHTML = inv.sectors.slice(0, 4).map((sector, index) => {
    const insight = sectorInsight(sector, inv, countryId);
    return '<div class="cv-sector" data-rank="' + String(index + 1).padStart(2, '0') + '">' +
      '<div class="cv-sector-main">' +
        '<div class="cv-sector-name">' + escapeHtml(sector) + '</div>' +
        '<div class="cv-sector-grid">' +
          '<div class="cv-sector-stat"><b>Demand</b><span>' + escapeHtml(insight.demand) + '</span></div>' +
          '<div class="cv-sector-stat"><b>Risk</b><span>' + escapeHtml(insight.risk) + '</span></div>' +
          '<div class="cv-sector-stat"><b>Route</b><span>' + escapeHtml(insight.route) + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }
  ).join('');

  briefWrap.innerHTML = renderInvestorSignals(countryId, inv, info);
  loadGdpHistory(countryId, info);
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
  return '<div class="cv-gdp-chart" aria-label="GDP history">' + head +
    '<svg viewBox="0 0 1000 250" preserveAspectRatio="none" role="img" aria-label="GDP trend from ' + first.year + ' to ' + latest.year + '">' +
      yTicks.map(value => {
        const y = yBottom - ((value - min) / range) * (yBottom - yTop);
        return '<text class="cv-gdp-value" x="64" y="' + (y + 4).toFixed(1) + '">' + formatBillions(value) + '</text>' +
          '<line class="cv-gdp-grid" x1="' + x0 + '" y1="' + y.toFixed(1) + '" x2="' + x1 + '" y2="' + y.toFixed(1) + '"></line>';
      }).join('') +
      xTickPoints.map(tick => {
        const point = points.find(item => item.year === tick.year);
        return '<line class="cv-gdp-grid cv-gdp-grid-x" x1="' + point.x.toFixed(1) + '" y1="' + yTop + '" x2="' + point.x.toFixed(1) + '" y2="' + yBottom + '"></line>' +
          '<text class="cv-gdp-year" x="' + point.x.toFixed(1) + '" y="240">' + point.year + '</text>';
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
    '</svg>' +
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
  const topicsEl = document.getElementById('wire-topics');
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
        const why = briefWhy(b);
        out.push({ code, country: info.name, cc: info.cc, title: b.headline||'', summary: b.body||'', why, source: src.name||'', sources, url: src.url||'', date: at, type: b.topic||'News', rank });
      });
    }
    // Surface each country's top story first (continental front-page ranking)
    out.sort((a, b) => a.rank - b.rank || a.country.localeCompare(b.country));
    return out;
  }
  function topicCounts(){
    const c = {}; TOPICS.forEach(t=>c[t]=0); c['All']=INDEX.length;
    INDEX.forEach(it=>{ if (c[it.type]!==undefined) c[it.type]++; });
    return c;
  }
  function renderTopics(){
    const c = topicCounts();
    topicsEl.innerHTML = TOPICS.filter(t=> t==='All' || c[t]>0).map(t=>
      '<button class="wire-topic" type="button" data-topic="'+t+'" aria-pressed="'+(t===activeTopic)+'">'+t+'<span class="n">'+c[t]+'</span></button>'
    ).join('');
  }
  function filtered(){
    const q = query.trim().toLowerCase();
    return INDEX.filter(it=>{
      if (activeTopic!=='All' && it.type!==activeTopic) return false;
      if (!q) return true;
      const sourceText = (it.sources || []).map(source => source.name || source.url || '').join(' ');
      return (it.title+' '+it.summary+' '+it.why+' '+it.type+' '+it.source+' '+sourceText+' '+it.country).toLowerCase().includes(q);
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
    const copy = 'Compared with the last brief opened in this browser. It catches changed country leads, new story fingerprints, and new topic coverage.';
    return '<section class="wire-movement">' +
      '<div><h3>What Changed</h3><p>' + escapeHtml(copy) + '</p></div>' +
      '<div class="wire-movement-grid">' +
        '<div class="wire-move-cell"><b>' + changed + '</b><span>Country leads changed</span></div>' +
        '<div class="wire-move-cell"><b>' + newStories + '</b><span>New story fingerprints</span></div>' +
        '<div class="wire-move-cell"><b>' + newTopics + '</b><span>New topics</span></div>' +
      '</div>' +
    '</section>';
  }
  function renderTrust(){
    if (!trustEl) return;
    const countries = new Set(INDEX.map(item => item.code)).size;
    const sources = new Set();
    INDEX.forEach(item => (item.sources?.length ? item.sources : [{ name: item.source }]).forEach(source => {
      if (source && (source.url || source.name)) sources.add(source.url || source.name);
    }));
    trustEl.innerHTML =
      '<span><b>' + INDEX.length + '</b> stories</span>' +
      '<span><b>' + countries + '</b> countries</span>' +
      '<span><b>' + sources.size + '</b> sources</span>';
  }
  function updateResultCount(items) {
    if (!resultCountEl) return;
    const q = query.trim();
    const isDefaultView = activeTopic === 'All' && !q;
    resultCountEl.hidden = isDefaultView;
    if (isDefaultView) {
      resultCountEl.textContent = '';
      return;
    }
    if (!INDEX.length) {
      resultCountEl.textContent = 'No stories loaded';
      return;
    }
    resultCountEl.textContent = items.length + ' ' + (items.length === 1 ? 'story' : 'stories') +
      (activeTopic !== 'All' ? ' in ' + activeTopic : '') +
      (q ? ' matching "' + q + '"' : '');
  }
  function storyLine(item, index){
    return (index + 1) + '. ' + item.country + ' - ' + item.title + '\n' +
      '   Why it matters: ' + (item.why || 'Track for local impact.') + '\n' +
      (item.source ? '   Source: ' + item.source + '\n' : '');
  }
  function dailyBriefText(items){
    const date = latestBriefDate() || new Date().toISOString().slice(0, 10);
    return ['The African Street Journal - Africa Brief', date, '']
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
    compareSummary.textContent = compareOpen && names.length ? names.slice(0, 3).join(' / ') : 'Optional';
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
        story: top.headline || 'No current brief'
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
  function itemMarkup(it){
    return '<a class="wire-item" href="'+escapeHtml(safeUrl(it.url))+'" target="_blank" rel="noopener noreferrer">' +
      '<img class="wire-item-flag" src="https://flagcdn.com/w80/'+it.cc+'.png" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="wire-item-body">' +
        '<div class="wire-item-kicker">' +
          '<span class="wire-item-topic">'+escapeHtml(it.type)+'</span><span class="dot"></span>' +
          '<span class="wire-item-country">'+escapeHtml(it.country)+'</span><span class="dot"></span>' +
          '<span class="wire-item-src">'+escapeHtml(it.source)+'</span>' +
          (relativeDateLabel(it.date)?'<span class="dot"></span><span class="wire-item-when">'+escapeHtml(relativeDateLabel(it.date))+'</span>':'') +
        '</div>' +
        '<div class="wire-item-title">'+escapeHtml(it.title)+'</div>' +
        (it.summary?'<div class="wire-item-sum">'+escapeHtml(it.summary)+'</div>':'') +
      '</div>' +
      '<span class="wire-item-go" aria-hidden="true">↗</span>' +
    '</a>';
  }
  function frontCardMarkup(it){
    return '<a class="wire-brief-card" href="'+escapeHtml(safeUrl(it.url))+'" target="_blank" rel="noopener noreferrer">' +
      '<div class="wire-item-kicker">' +
        '<span class="wire-item-topic">'+escapeHtml(it.type)+'</span><span class="dot"></span>' +
        '<span class="wire-item-country">'+escapeHtml(it.country)+'</span><span class="dot"></span>' +
        '<span class="wire-item-src">'+escapeHtml(it.source)+'</span>' +
      '</div>' +
      '<div>' +
        '<div class="wire-item-title">'+escapeHtml(it.title)+'</div>' +
      '</div>' +
    '</a>';
  }
  function heroMarkup(it){
    return '<a class="wire-hero" href="'+escapeHtml(safeUrl(it.url))+'" target="_blank" rel="noopener noreferrer">' +
      '<div class="wire-hero-kicker"><span class="wire-hero-lead">Lead story</span>' +
        '<img class="wire-item-flag" src="https://flagcdn.com/w80/'+it.cc+'.png" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="wire-item-country">'+escapeHtml(it.country)+'</span><span class="dot"></span>' +
        '<span class="wire-item-topic">'+escapeHtml(it.type)+'</span><span class="dot"></span>' +
        '<span class="wire-item-src">'+escapeHtml(it.source)+'</span></div>' +
      '<div class="wire-hero-title">'+escapeHtml(it.title)+'</div>' +
      (it.summary?'<div class="wire-hero-sum">'+escapeHtml(it.summary)+'</div>':'') +
    '</a>';
  }
  function renderResults(){
    if (!INDEX.length){ updateResultCount([]); resultsEl.innerHTML = '<div class="wire-empty">No stories loaded yet. The desk has not published a brief file.</div>'; return; }
    const items = filtered();
    updateResultCount(items);
    if (!items.length){ resultsEl.innerHTML = '<div class="wire-meta">0 stories</div><div class="wire-empty">No headlines match your search.</div>'; return; }
    const frontPage = (activeTopic==='All' && !query.trim());
    const hero = frontPage ? items[0] : null;
    const list = hero ? items.slice(1) : items;
    if (frontPage) {
      const frontCards = list.slice(0, 6);
      const more = list.slice(6);
      resultsEl.innerHTML =
        '<div class="wire-front">' +
          (hero ? heroMarkup(hero) : '') +
          '<div class="wire-meta">Highlights</div>' +
          '<div class="wire-front-grid">' + frontCards.map(frontCardMarkup).join('') + '</div>' +
          movementMarkup(items) +
          (more.length ? '<div class="wire-meta">More across the continent</div>' + more.slice(0, 200).map(itemMarkup).join('') : '') +
        '</div>';
      return;
    }
    resultsEl.innerHTML =
      (hero ? heroMarkup(hero) : '') +
      '<div class="wire-meta">'+(frontPage?'More across the continent':items.length+' '+(items.length===1?'story':'stories')+(activeTopic!=='All'?' · '+escapeHtml(activeTopic):'')+(query?' · “'+escapeHtml(query.trim())+'”':''))+'</div>' +
      list.slice(0,200).map(it=>
        '<a class="wire-item" href="'+escapeHtml(safeUrl(it.url))+'" target="_blank" rel="noopener noreferrer">' +
          '<img class="wire-item-flag" src="https://flagcdn.com/w80/'+it.cc+'.png" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
          '<div class="wire-item-body">' +
            '<div class="wire-item-kicker">' +
              '<span class="wire-item-topic">'+escapeHtml(it.type)+'</span><span class="dot"></span>' +
              '<span class="wire-item-country">'+escapeHtml(it.country)+'</span><span class="dot"></span>' +
              '<span class="wire-item-src">'+escapeHtml(it.source)+'</span>' +
              (relativeDateLabel(it.date)?'<span class="dot"></span><span class="wire-item-when">'+escapeHtml(relativeDateLabel(it.date))+'</span>':'') +
            '</div>' +
            '<div class="wire-item-title">'+escapeHtml(it.title)+'</div>' +
            (it.summary?'<div class="wire-item-sum">'+escapeHtml(it.summary)+'</div>':'') +
          '</div>' +
          '<span class="wire-item-go" aria-hidden="true">↗</span>' +
        '</a>'
      ).join('');
  }
  function openWire(topic){
    editionDate = null; editionBriefs = null; populateEditions();
    INDEX = buildIndex(); activeTopic = topic||'All'; query=''; searchInput.value='';
    const dateEl = document.getElementById('wire-date');
    const briefDate = latestBriefDate();
    if (dateEl) dateEl.textContent = briefDate ? 'Latest available · ' + formatShortDate(briefDate + 'T00:00:00Z') : 'Brief pending';
    wireLastFocus = document.activeElement;
    previousSnapshot = readWireSnapshot();
    setMobileActionsOpen(false);
    renderTopics(); renderTrust(); populateCompare(); renderResults();
    resultsEl.scrollTop = 0;
    if (!editionDate) saveWireSnapshot(INDEX);
    view.classList.add('open'); document.body.style.overflow='hidden';
    updateOverlayAccessibility();
    syncRoute();
    setTimeout(()=>searchInput.focus(), 60);
  }
  function closeWire(){
    view.classList.remove('open');
    if (!document.getElementById('country-view').classList.contains('open')) document.body.style.overflow='';
    updateOverlayAccessibility();
    if (wireLastFocus && wireLastFocus.focus) wireLastFocus.focus();
    syncRoute();
  }
  window.__wireOpen = openWire;
  window.__wireClose = closeWire;
  // Past editions: a journal keeps a record. The daily pipeline archives each edition to
  // data/archive/YYYY-MM-DD.js; this picker loads one and re-renders the wire from it.
  const editionSel = document.getElementById('wire-edition');
  function populateEditions(){
    if (!editionSel) return;
    const dates = Array.isArray(window.UNITED_AFRICA_ARCHIVE_INDEX) ? window.UNITED_AFRICA_ARCHIVE_INDEX : [];
    const currentDate = latestBriefDate();
    const pastDates = dates.filter(date => date && date !== currentDate);
    if (!pastDates.length) { editionSel.hidden = true; return; }
    editionSel.hidden = false;
    editionSel.innerHTML = '<option value="">Latest</option>' + pastDates.map(d => '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>').join('');
    editionSel.value = editionDate || '';
  }
  function applyEdition(){
    INDEX = buildIndex();
    const dateEl = document.getElementById('wire-date');
    const d = editionDate || latestBriefDate();
    if (dateEl) dateEl.textContent = d ? (editionDate ? 'Edition · ' : 'Latest available · ') + formatShortDate(d + 'T00:00:00Z') : 'Brief pending';
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
  topicsEl.addEventListener('click', e=>{
    const b = e.target.closest('.wire-topic'); if (!b) return;
    activeTopic = b.dataset.topic;
    topicsEl.querySelectorAll('.wire-topic').forEach(x=>x.setAttribute('aria-pressed', String(x.dataset.topic===activeTopic)));
    renderResults();
    resultsEl.scrollTop = 0;
  });
  searchInput.addEventListener('input', ()=>{ query = searchInput.value; renderResults(); resultsEl.scrollTop = 0; });
  document.addEventListener('keydown', e=>{ if (e.key==='Escape' && view.classList.contains('open')) closeWire(); });
  const n = Object.values(AI_BRIEFS||{}).reduce((a,arr)=>a+arr.length,0);
  entryCounts.forEach(el => { el.textContent = n ? (n+' stories') : 'The Wire'; });
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
  if (!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(url) || anonKey.length < 20) return null;
  return { url, anonKey, table };
}
function preferredDeskAudience() {
  const mode = audienceSelect?.value || document.body.dataset.audience || '';
  return ROUTE_AUDIENCES.includes(mode) ? mode : 'general';
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
  const payload = {
    email,
    watchlist: signupWatchlistPayload(),
    preferred_audience: audience,
    source: 'my_africa',
    user_agent: navigator.userAgent || ''
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
  const signup = getDeskSignup();
  const savedEmail = String(signup.email || '');
  const savedAudience = String(signup.audience || preferredDeskAudience());
  const savedState = signup.synced ? 'Synced' : (savedEmail ? 'Saved on this device' : 'Email only for now');
  const selected = value => value === savedAudience ? ' selected' : '';
  return '<form class="yd-signup" data-desk-signup>' +
    '<div class="yd-signup-copy"><b>Save this desk</b><span>Keep these countries across devices.</span></div>' +
    '<label class="sr-only" for="yd-signup-email">Email address</label>' +
    '<input id="yd-signup-email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="' + escapeHtml(savedEmail) + '" required>' +
    '<label class="sr-only" for="yd-signup-audience">Desk lens</label>' +
    '<select id="yd-signup-audience" name="audience" aria-label="Desk lens">' +
      '<option value="general"' + selected('general') + '>Morning desk</option>' +
      '<option value="farmers"' + selected('farmers') + '>Farmers</option>' +
      '<option value="investors"' + selected('investors') + '>Investors</option>' +
      '<option value="diaspora"' + selected('diaspora') + '>Diaspora</option>' +
    '</select>' +
    '<button type="submit">Save</button>' +
    '<p class="yd-signup-status" data-signup-status aria-live="polite">' + escapeHtml(savedState) + '</p>' +
  '</form>';
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
  el.innerHTML = '<div class="yd-head"><button class="yd-toggle" type="button" data-desk-toggle aria-expanded="' +
    String(yourDeskExpanded) + '" aria-controls="your-desk-list" aria-label="' + (yourDeskExpanded ? 'Collapse' : 'Expand') +
    ' My Africa"><span class="yd-head-copy"><span class="yd-key">My Africa</span><span class="yd-sub">' +
    list.length + ' followed</span></span><svg class="yd-toggle-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></button>' +
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
    const top = (AI_BRIEFS[id] || []).find(brief => brief && brief.headline);
    const fp = countryStoryFingerprint(id);
    const isNew = !!fp && seen[id] && seen[id] !== fp;
    const name = info.name || id.toUpperCase();
    const story = top ? (top.topic || 'News') + ' ' + String.fromCharCode(183) + ' ' + top.headline : 'Open country file';
    return '<button class="yd-country-card" type="button" data-country="' + id +
      '" aria-label="Open ' + escapeHtml(name) + ' country file">' +
      '<span class="yd-country"><span>' + escapeHtml(name) + '</span><span class="yd-country-meta">' +
        (isNew ? '<span class="yd-new">New</span>' : (growth ? '<b>' + escapeHtml(growth) + '</b>' : '')) +
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
  const stats = countryDeskStats(countryId);
  const dominant = Object.entries(stats.agCounts || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed';
  const crops = farmExportsForCountry(countryId, dominant).slice(0, 3);
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
  if (hash) location.hash = hash;
  else history.pushState(null, '', location.pathname + location.search);
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
  const D = window.UNITED_AFRICA_DATA || {};
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
  add('country nav alphabetized', sortedCountryIds[0] === 'dz' && sortedCountryIds[1] === 'ao', sortedCountryIds.slice(0, 5).join(','));
  add('core: WB economy coverage 50+', Object.keys(D.worldBankEconomy || {}).length >= 50, Object.keys(D.worldBankEconomy || {}).length);
  const badIds = obj => Object.keys(obj || {}).filter(id => !COUNTRY_INFO[id]);
  add('INVESTOR_INFO ids valid', badIds(INVESTOR_INFO).length === 0, badIds(INVESTOR_INFO).join(','));
  add('DIASPORA ids valid', badIds(DIASPORA).length === 0, badIds(DIASPORA).join(','));
  add('FARM_EXPORTS ids valid', badIds(FARM_EXPORTS).length === 0, badIds(FARM_EXPORTS).join(','));
  add('MARKETS_SEED ids valid', badIds(MARKETS_SEED).length === 0, badIds(MARKETS_SEED).join(','));
  const investorSignalProblems = sortedCountryIds.filter(id => {
    const profile = marketProfileForCountry(id);
    const html = renderInvestorSignals(id, investorForCountry(id, COUNTRY_INFO[id]), COUNTRY_INFO[id]);
    return (profile.exchange && !html.includes(profile.exchange)) ||
      /0 market hubs mapped|Pair the sector read|ND-GAIN rank/i.test(html);
  });
  add('investor checklist honors market directory', investorSignalProblems.length === 0, investorSignalProblems.join(','));
  const malawiInvestorHtml = renderInvestorSignals('mw', investorForCountry('mw', COUNTRY_INFO.mw), COUNTRY_INFO.mw);
  add('Malawi investor route uses verified MSE', /Malawi Stock Exchange/.test(malawiInvestorHtml) && /Open MSE/.test(malawiInvestorHtml), malawiInvestorHtml.includes('MSE') ? 'MSE present' : 'MSE missing');
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
  add('briefs schema + https sources', briefProblems.length === 0, briefProblems.slice(0, 3).join(' '));
  add('archive index present', Array.isArray(window.UNITED_AFRICA_ARCHIVE_INDEX));

  try {
    openCountry('ke');
    await new Promise(r => setTimeout(r, 900));
    add('smoke: Kenya dossier opens', countryView.classList.contains('open') && document.getElementById('cv-name').textContent === 'Kenya');
    add('smoke: header growth/vintage', /%/.test(document.getElementById('cv-growth')?.textContent || ''));
    add('smoke: news panel has content', (document.getElementById('cv-cards').innerHTML || '').length > 400);
    add('smoke: crop calendar rows', document.querySelectorAll('#cv-crop-cal .cv-cal-row').length > 0, document.querySelectorAll('#cv-crop-cal .cv-cal-row').length);
    add('smoke: route set', location.hash.indexOf('#/ke') === 0, location.hash);
    add('a11y: one country panel exposed', document.querySelectorAll('.cv-panel[aria-hidden="false"]').length === 1, document.querySelectorAll('.cv-panel[aria-hidden="false"]').length);
    add('a11y: ticker clones skip keyboard', !document.querySelector('.ticker-segment[aria-hidden="true"] button:not([tabindex="-1"])'));
    audienceSelect.value = 'investors';
    audienceSelect.dispatchEvent(new Event('change'));
    setPanel(1);
    // Idempotent: assert the index ADVANCED by one and the grid actually scrolled, rather than
    // hard-coding 1 — otherwise a second run in the same session fails spuriously.
    const stickyBefore = infoGridIndexByMode.investors || 0;
    scrollActiveInfoGrid('next');
    await new Promise(r => setTimeout(r, 520));
    openCountry('lr');
    await new Promise(r => setTimeout(r, 260));
    const stickyGrid = activeInfoGrid();
    add('smoke: signal card sticks across countries',
      infoGridIndexByMode.investors === stickyBefore + 1 && stickyGrid.scrollLeft > stickyGrid.clientWidth * 0.5,
      stickyBefore + '->' + infoGridIndexByMode.investors + ' @ ' + Math.round(stickyGrid.scrollLeft));
    closeCountry();
    await new Promise(r => setTimeout(r, 200));
    add('smoke: route cleared on close', !location.hash, location.hash);
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
    add('smoke: wire summary stays concise', wireTrust?.children.length === 3 && wireResultCount?.hidden, (wireTrust?.textContent || '').trim());
    add('smoke: wire opens at the lead story', wireResults?.scrollTop === 0, wireResults?.scrollTop);
    window.__wireClose();
  } catch (e) {
    add('smoke: dossier flow threw', false, e.message);
  }

  const failed = checks.filter(c => !c.pass);
  console.table(checks);
  window.__selftest = { total: checks.length, failed: failed.map(f => f.name + (f.note ? ' (' + f.note + ')' : '')), checks };
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:9999;bottom:12px;right:12px;max-width:360px;background:#111;border:1px solid ' + (failed.length ? '#c0392b' : '#2e7d32') + ';padding:12px 14px;font:11px/1.7 ui-monospace,monospace;color:#e8e6e3;white-space:pre-wrap';
  box.textContent = 'ASJ SELF-TEST  ' + (checks.length - failed.length) + '/' + checks.length + ' passed' +
    (failed.length ? '\n' + failed.map(f => '✗ ' + f.name + (f.note ? ' — ' + f.note : '')).join('\n') : '  ✓');
  document.body.appendChild(box);
}
