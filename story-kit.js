/* Story kit: what a story carries besides its words.
   - a locator map of where it happened (no photographs, nobody's to license),
   - the story's own big number when it has one,
   - one figure from Signals that the story is about (the sugar price under a sugar story),
   - and, on the static story pages, the way further into the paper: follow the country,
     three of its figures, earlier stories on the same subject, today's edition.
   One file for both places. The app calls mountVisual() from its reader; a static story
   page gets it from share.js, which every page ever published already loads, so pages
   written months ago pick this up without being rebuilt. Everything here is an
   enhancement: any failure leaves the page exactly as it was. */
(function () {
  'use strict';
  if (window.ASJ_STORY_KIT) return;

  var script = document.currentScript;
  var BASE = '/';
  try { BASE = new URL('.', script && script.src ? script.src : location.href).href; } catch (e) {}
  var VER = ((script && /[?&]v=([\w.-]+)/.exec(script.src || '')) || [])[1] || window.ASJ_ASSET_VERSION || '';
  var Q = VER ? '?v=' + VER : '';

  var CUR = {
    dz:'DZD', ao:'AOA', bj:'XOF', bw:'BWP', bf:'XOF', bi:'BIF', cv:'CVE', cm:'XAF', cf:'XAF', td:'XAF',
    km:'KMF', cd:'CDF', cg:'XAF', ci:'XOF', dj:'DJF', eg:'EGP', gq:'XAF', er:'ERN', sz:'SZL', et:'ETB',
    ga:'XAF', gm:'GMD', gh:'GHS', gn:'GNF', gw:'XOF', ke:'KES', ls:'LSL', lr:'LRD', ly:'LYD', mg:'MGA',
    mw:'MWK', ml:'XOF', mr:'MRU', mu:'MUR', ma:'MAD', mz:'MZN', na:'NAD', ne:'XOF', ng:'NGN', rw:'RWF',
    st:'STN', sn:'XOF', sc:'SCR', sl:'SLE', so:'SOS', za:'ZAR', ss:'SSP', sd:'SDG', tz:'TZS', tg:'XOF',
    tn:'TND', ug:'UGX', zm:'ZMW', zw:'ZWG', eh:'MAD'
  };
  var KNOWN_CODES = { USD: 1, EUR: 1, GBP: 1 };
  Object.keys(CUR).forEach(function (cc) { KNOWN_CODES[CUR[cc]] = 1; });

  // The Signals figures a story can point at: label, the line under it, how to print it,
  // and which Signals tab holds it.
  var FACTS = {
    growth:         { label: 'GDP growth',             sub: 'real, annual',       fmt: 'signedPct', tab: 'investors' },
    inflation:      { label: 'Inflation',              sub: 'consumer prices',    fmt: 'pct',       tab: 'investors' },
    fdi:            { label: 'Foreign investment',     sub: 'net inflows a year', fmt: 'usd',       tab: 'investors' },
    exports:        { label: 'Exports',                sub: 'share of GDP',       fmt: 'pct',       tab: 'investors' },
    unemployment:   { label: 'Unemployment',           sub: 'of labour force',    fmt: 'pct',       tab: 'investors' },
    extDebt:        { label: 'External debt',          sub: 'of national income', fmt: 'pct',       tab: 'investors' },
    agShare:        { label: 'Farming in the economy', sub: 'share of GDP',       fmt: 'pct',       tab: 'farmers' },
    undernourished: { label: 'Undernourishment',       sub: 'of population',      fmt: 'pct',       tab: 'farmers' },
    remitUsd:       { label: 'Remittances received',   sub: 'a year',             fmt: 'usd',       tab: 'diaspora' },
    internet:       { label: 'Internet users',         sub: 'of population',      fmt: 'pct',       tab: 'diaspora' },
    electricity:    { label: 'Electricity access',     sub: 'of population',      fmt: 'pct',       tab: 'diaspora' }
  };
  var LIMITS = { internet: [0, 100], electricity: [0, 100], undernourished: [0, 100], agShare: [0, 100], unemployment: [0, 100], exports: [0, 400] };

  // What a headline has to say for a figure to belong under it. First match wins, so the
  // specific (a named food, the currency) sits above the general (the economy).
  var FOODS = [
    [/\bsugar\b/i, /sugar/i],
    [/\b(maize|corn|unga|ugali|mealie)\b/i, /maize/i],
    [/\brice\b/i, /rice/i],
    [/\b(wheat|bread|flour)\b/i, /wheat|bread/i],
    [/\bbeans?\b/i, /bean/i, /\b(coffee|cocoa|cacao|soya?|soybeans?|vanilla|castor)\b/i],
    [/\b(cooking|vegetable|palm|edible) oil\b/i, /oil/i],
    [/\b(cassava|gari|garri)\b/i, /cassava|gari/i],
    [/\bsorghum\b/i, /sorghum/i],
    [/\bmillet\b/i, /millet/i],
    [/\bpotato(es)?\b/i, /potato/i],
    [/\b(beef|meat)\b/i, /meat|beef/i],
    [/\bfish\b/i, /fish/i],
    [/\bmilk\b/i, /milk/i],
    [/\beggs?\b/i, /egg/i],
    [/\bonions?\b/i, /onion/i],
    [/\btomato(es)?\b/i, /tomato/i],
    [/\byams?\b/i, /yam/i],
    [/\bteff\b/i, /teff/i],
    [/\b(petrol|diesel|fuel prices?|pump prices?)\b/i, /fuel|petrol|diesel/i]
  ];
  var RULES = [
    { re: /\b(food prices?|cost of food|hunger|famine|food (in)?security|food aid|staple foods?|malnutrition)\b/i, kind: 'food' },
    { re: /\b(currency|exchange rate|forex|foreign exchange|devalu\w*|depreciat\w*|against the dollar|to the dollar|dollar shortage|naira|cedi|shilling|rand|birr|kwacha|dinar|dirham|metical|kwanza|leone|dalasi|ouguiya|pula|loti|lilangeni|ariary|nakfa|rupee|escudo|dobra|cfa franc|egyptian pound|sudanese pound)\b/i, kind: 'fx' },
    { re: /\b(inflation|cost of living|consumer prices?|price (rises?|increases?|hikes?))\b/i, key: 'inflation' },
    { re: /\b(stock (market|exchange)|stocks|shares|bourse|securities exchange|ipo|listing|all[- ]share|equities)\b/i, kind: 'index' },
    { re: /\b(debt|eurobond|imf|bailout|borrow\w*|creditors?|restructur\w*|sovereign bond)\b/i, key: 'extDebt' },
    { re: /\b(unemploy\w*|jobless\w*|job (losses|cuts)|layoffs?|retrench\w*)\b/i, key: 'unemployment' },
    { re: /\b(remittances?|diaspora)\b/i, key: 'remitUsd' },
    { re: /\b(fdi|foreign (direct )?invest\w*|investors?)\b/i, key: 'fdi' },
    { re: /\b(exports?|trade (deal|deficit|surplus|balance))\b/i, key: 'exports' },
    { re: /\b(electricity|power (cuts?|outages?|plants?|grid|supply|station|tariffs?|rationing)|blackouts?|load[- ]?shedding|megawatts?|\d\s?mw|national grid)\b/i, key: 'electricity' },
    { re: /\b(internet|broadband|mobile data|telecoms?|fibre|5g|4g|connectivity|data centres?)\b/i, key: 'internet' },
    { re: /\b(farm\w*|agricultur\w*|crops?|harvests?|fertili[sz]ers?)\b/i, key: 'agShare' },
    { re: /\b(gdp|economy|economic growth|recession|budget)\b/i, key: 'growth' }
  ];
  var TOPIC_RULES = [
    [/agricultur|farm|food/i, { kind: 'food' }],
    [/energy|power/i, { key: 'electricity' }],
    [/tech|telecom/i, { key: 'internet' }],
    [/econom|business|market|financ/i, { key: 'inflation' }]
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var scripts = {}, jsons = {};
  function loadScript(url) {
    if (!scripts[url]) {
      scripts[url] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = url; s.async = true;
        s.onload = function () { resolve(); };
        s.onerror = function () { delete scripts[url]; reject(new Error('load ' + url)); };
        document.head.appendChild(s);
      });
    }
    return scripts[url];
  }
  function getJson(url) {
    if (!jsons[url]) {
      jsons[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
      jsons[url].catch(function () { delete jsons[url]; });
    }
    return jsons[url];
  }
  function facts(cc) {
    var f = window.ASJ_COUNTRY_FACTS;
    return (f && f.countries && f.countries[cc]) || null;
  }
  // The headline figures (one file for the continent), then this country's detail: its
  // towns, and the food prices WFP records there.
  function ensureFacts(cc) {
    var first = window.ASJ_COUNTRY_FACTS ? Promise.resolve() : loadScript(BASE + 'data/country-facts.js' + Q);
    return first.then(function () {
      var f = facts(cc);
      if (!f || f.cities || f.ports || f.food) return f;
      return loadScript(BASE + 'data/facts/' + cc + '.js' + Q).then(function () { return facts(cc); });
    }).catch(function () { return facts(cc); });
  }
  function locator() { return getJson(BASE + 'data/locator.json' + Q).catch(function () { return null; }); }

  var FX_KEY = 'african-street-journal:fx-usd:v1';
  function fxRates() {
    if (window.__FX) return Promise.resolve({ rates: window.__FX, at: window.__FX_AT || '' });
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(FX_KEY) || 'null'); } catch (e) {}
    var age = cached && Date.parse(cached.savedAt || '');
    if (cached && cached.rates && isFinite(age) && Date.now() - age < 24 * 3600 * 1000) {
      return Promise.resolve({ rates: cached.rates, at: cached.updatedAt || '' });
    }
    return fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.rates) return cached && cached.rates ? { rates: cached.rates, at: cached.updatedAt || '' } : null;
        var at = d.time_last_update_utc || new Date().toISOString();
        try { localStorage.setItem(FX_KEY, JSON.stringify({ rates: d.rates, updatedAt: at, savedAt: new Date().toISOString() })); } catch (e) {}
        return { rates: d.rates, at: at };
      })
      .catch(function () { return cached && cached.rates ? { rates: cached.rates, at: cached.updatedAt || '' } : null; });
  }

  function fmtFact(fmt, v) {
    if (!isFinite(v)) return '';
    if (fmt === 'usd') {
      var a = Math.abs(v), sign = v < 0 ? '-' : '';
      if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
      if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
      return sign + '$' + Math.round(a).toLocaleString('en-US');
    }
    var pct = (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + '%';
    return fmt === 'signedPct' && v > 0 ? '+' + pct : pct;
  }
  function fmtRate(rate) {
    if (rate >= 1000) return Math.round(rate).toLocaleString('en-US');
    if (rate >= 10) return rate.toFixed(2);
    return rate.toFixed(3);
  }
  function fmtNum(v) { return Number(v).toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 2 }); }
  function monthLabel(ym) {
    var p = String(ym || '').split('-').map(Number);
    if (!p[0] || !p[1]) return '';
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p[1] - 1] + ' ' + p[0];
  }
  function dayLabel(iso) {
    var d = new Date(iso || '');
    if (isNaN(d)) return '';
    return d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  }
  // A World Bank figure worth printing: present, physically possible, and not from
  // another decade (the dossier draws the same line at seven years).
  function wbFact(f, key) {
    var e = f && f.wb && f.wb[key];
    if (!e || !isFinite(e.v)) return null;
    var lim = LIMITS[key];
    if (lim && (e.v < lim[0] || e.v > lim[1])) return null;
    if (e.y && e.y < new Date().getFullYear() - 7) return null;
    return e;
  }

  /* ── The figure from Signals ── */
  function pickSignal(text, topic) {
    text = String(text || '');
    // A third pattern is what rules the word out: "beans" in a coffee story are not the
    // haricot beans the market price is for.
    for (var i = 0; i < FOODS.length; i++) {
      if (FOODS[i][0].test(text) && !(FOODS[i][2] && FOODS[i][2].test(text))) return { kind: 'food', item: FOODS[i][1] };
    }
    for (var j = 0; j < RULES.length; j++) if (RULES[j].re.test(text)) return { kind: RULES[j].kind || 'wb', key: RULES[j].key };
    for (var k = 0; k < TOPIC_RULES.length; k++) {
      if (TOPIC_RULES[k][0].test(String(topic || ''))) {
        var t = TOPIC_RULES[k][1];
        return { kind: t.kind || 'wb', key: t.key, soft: true };
      }
    }
    return null;
  }
  function foodSignal(f, want) {
    var food = f && f.food;
    var items = (food && food.items) || [];
    var raw = null;
    if (want.item) raw = items.filter(function (it) { return want.item.test(it.commodity || ''); })[0];
    else raw = items.filter(function (it) { return isFinite(it.yearAgo) && it.yearAgo > 0; })[0] || items[0];
    if (!raw || !isFinite(raw.price)) return null;
    // Sierra Leone redenominated in 2022; WFP still records old leones.
    var it = raw.currency === 'SLL'
      ? { commodity: raw.commodity, unit: raw.unit, currency: 'SLE', price: raw.price / 1000, yearAgo: isFinite(raw.yearAgo) ? raw.yearAgo / 1000 : raw.yearAgo }
      : raw;
    var change = isFinite(it.yearAgo) && it.yearAgo > 0 ? ((it.price - it.yearAgo) / it.yearAgo) * 100 : null;
    if (change !== null && (change > 300 || change < -75)) change = null;
    var market = String(food.market || '').replace(/\bDaadab\b/g, 'Dadaab').replace(/^IFO\b/, 'Ifo');
    var sub = 'per ' + it.unit + (market ? ' at ' + market + (food.camp ? ' refugee camp' : ' market') : '') +
      (monthLabel(food.date) ? ', ' + monthLabel(food.date) : '');
    if (change !== null) sub += ' · ' + (change > 0 ? '+' : '') + Math.round(change) + '% on a year';
    return { label: it.commodity, value: it.currency + ' ' + fmtNum(it.price), sub: sub, source: 'World Food Programme', tab: 'farmers' };
  }
  function resolveSignal(want, cc) {
    if (!want) return Promise.resolve(null);
    return ensureFacts(cc).then(function (f) {
      if (want.kind === 'food') {
        var fs = foodSignal(f, want);
        if (fs || want.item) return fs;
        want = { kind: 'wb', key: 'undernourished' };
      }
      if (want.kind === 'fx') {
        var code = CUR[cc];
        if (!code) return null;
        return fxRates().then(function (fx) {
          var rate = fx && fx.rates && fx.rates[code];
          if (!isFinite(rate) || rate <= 0) return null;
          return { label: 'Exchange rate', value: fmtRate(rate) + ' ' + code, sub: 'to one US dollar' + (dayLabel(fx.at) ? ', ' + dayLabel(fx.at) : ''), source: 'open.er-api.com', tab: 'diaspora' };
        });
      }
      if (want.kind === 'index') {
        var ready = window.ASJ_INDICES ? Promise.resolve() : loadScript(BASE + 'data/indices.js' + Q);
        return ready.then(function () {
          var all = (window.ASJ_INDICES && window.ASJ_INDICES.indices) || {};
          var hit = Object.keys(all).map(function (k) { return all[k]; })
            .filter(function (ix) { return ix && (ix.countries || []).indexOf(cc) >= 0 && isFinite(ix.level); })[0];
          if (!hit) return null;
          var ch = isFinite(hit.changePct) ? (hit.changePct > 0 ? '+' : '') + (Math.round(hit.changePct * 100) / 100) + '% on the day' : '';
          return { label: hit.label || hit.name || 'Stock index', value: fmtNum(hit.level), sub: [hit.name, ch, dayLabel(hit.date)].filter(Boolean).join(' · '), source: '', tab: 'investors' };
        }).catch(function () { return null; });
      }
      var def = FACTS[want.key], e = wbFact(f, want.key);
      if (!def || !e) return null;
      return { label: def.label, value: fmtFact(def.fmt, e.v), sub: def.sub + (e.y ? ', ' + e.y : ''), source: 'World Bank', tab: def.tab };
    }).catch(function () { return null; });
  }

  /* ── The story's own number ── */
  var RE_MONEY = /(?:US\$|USD\s?|[A-Z]{1,3}\$|\$|€|£|₦|GH₵|₵|KSh\s?|Ksh\s?|TSh\s?|Tsh\s?|USh\s?|Ush\s?|Sh(?=\d)|FCFA\s?|CFA\s?|ZiG\s?|R(?=\d)|N(?=\d)|K(?=\d)|[A-Z]{3}\s(?=\d))\d[\d,]*(?:\.\d+)?(?:\s?(?:trillion|billion|million|bn|tn|mn|[MBKmbk])\b)?/;
  var RE_PCT = /\d+(?:\.\d+)?\s?(?:%|percent\b|per cent\b)/;
  var RE_MAGN = /\d[\d,]*(?:\.\d+)?\s(?:trillion|billion|million)\b/;
  var RE_UNIT = /\d[\d,]*(?:\.\d+)?\s?(?:MW|GW|megawatts|km|kilometres|kilometers|tonnes|tons|hectares|barrels|litres|liters)\b/;
  var RE_COMMA = /\b\d{1,3}(?:,\d{3})+\b/;
  function moneyOk(m) {
    var hasMag = /(trillion|billion|million|bn|tn|mn|[MBKmbk])$/.test(m);
    var num = (/\d[\d,]*(?:\.\d+)?/.exec(m) || [''])[0];
    var plain = Number(num.replace(/,/g, ''));
    var code = /^[A-Z]{3}\s/.exec(m);
    if (code && !KNOWN_CODES[code[0].trim()]) return false;
    if (/^[RNK]\d/.test(m) && !hasMag && plain < 100) return false;
    if (!hasMag && /^\d{4}$/.test(num) && plain >= 1900 && plain <= 2100) return false;
    return true;
  }
  function firstFigure(text) {
    var best = null;
    [RE_MONEY, RE_PCT, RE_MAGN, RE_UNIT, RE_COMMA].forEach(function (re, n) {
      var m = re.exec(text);
      if (!m) return;
      if (n === 0 && !moneyOk(m[0])) return;
      if (!best || m.index < best.index || (m.index === best.index && m[0].length > best.text.length)) best = { index: m.index, text: m[0] };
    });
    // "$2.3" inside "$2.3 billion": the money pattern stops at the number when the
    // magnitude is a separate word it did not take; let the longer reading win.
    if (best) {
      var tail = /^\s(?:trillion|billion|million)\b/.exec(text.slice(best.index + best.text.length));
      if (tail && !/(trillion|billion|million)$/.test(best.text)) best.text += tail[0];
    }
    return best;
  }
  var CLAUSE_END = /[,;:.!?()—–"“”]|\s-\s/;
  var TRAIL = /^(to|by|at|of|a|an|the|about|nearly|over|around|some|almost|up|down|as|with|and|in|for|on|from|than|more|is|are|was|were)$/i;
  // "keeps key rate at 12 per cent as inflation rises": the words after the figure start
  // another clause, so the figure is not "as inflation rises" - it is the key rate.
  var NEW_CLAUSE = /^(as|while|after|amid|despite|because|since|when|but|though|although|following|ahead|before|until|unless|whereas|if|even)$/i;
  function caption(text, fig) {
    var afterRaw = text.slice(fig.index + fig.text.length);
    var cut = CLAUSE_END.exec(afterRaw);
    var afterWords = (cut ? afterRaw.slice(0, cut.index) : afterRaw).trim().split(/\s+/).filter(Boolean);
    var beforeRaw = text.slice(0, fig.index);
    var parts = beforeRaw.split(CLAUSE_END);
    var beforeWords = (parts[parts.length - 1] || '').trim().split(/\s+/).filter(Boolean);
    while (beforeWords.length && TRAIL.test(beforeWords[beforeWords.length - 1])) beforeWords.pop();
    var words, clipped = false;
    if ((afterWords.length >= 3 && !(beforeWords.length >= 2 && NEW_CLAUSE.test(afterWords[0]))) || !beforeWords.length) {
      words = afterWords;
      if (words.length > 7) { words = words.slice(0, 7); clipped = true; }
      while (clipped && words.length > 3 && TRAIL.test(words[words.length - 1])) words.pop();
    } else {
      words = beforeWords.slice(-7);
    }
    var out = words.join(' ');
    return out ? out + (clipped ? '…' : '') : '';
  }
  function bigNumber(headline, dek) {
    var sources = [String(headline || ''), String(dek || '')];
    for (var i = 0; i < sources.length; i++) {
      var fig = firstFigure(sources[i]);
      if (!fig) continue;
      var value = fig.text.replace(/\s?(percent|per cent)$/i, '%').replace(/\s+/g, ' ').trim();
      if (value.length > 16) continue;
      return { value: value, caption: caption(sources[i], fig) };
    }
    return null;
  }

  /* ── Where it happened ── */
  function findPlace(f, countryName, texts) {
    var places = [];
    ((f && f.cities) || []).forEach(function (c) {
      if (c && c.name && isFinite(c.lat) && isFinite(c.lon)) places.push(c);
    });
    if (!places.length) return null;
    var cn = String(countryName || '').toLowerCase();
    for (var t = 0; t < texts.length; t++) {
      var text = String(texts[t] || '');
      var best = null;
      for (var i = 0; i < places.length; i++) {
        var name = places[i].name;
        if (name.length < 4 || name.toLowerCase() === cn) continue;
        var at = text.search(new RegExp('(^|[^A-Za-z])' + name.replace(/[^A-Za-z' -]/g, '.') + '(?![A-Za-z])'));
        if (at >= 0 && (!best || at < best.at)) best = { at: at, place: places[i] };
      }
      if (best) return best.place;
    }
    return null;
  }
  function capitalOf(f) {
    return ((f && f.cities) || []).filter(function (c) { return c && c.capital; })[0] || null;
  }
  function people(n) {
    if (!isFinite(n) || n <= 0) return '';
    if (n >= 1e6) return 'about ' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' million people';
    if (n >= 10000) return 'about ' + (Math.round(n / 1000) * 1000).toLocaleString('en-US') + ' people';
    return '';
  }

  var AFRICA = [-18.6, -38.4, 52.2, 35.8];
  var allPaths = null, uid = 0;
  function locatorSvg(cc, loc, place) {
    var c = loc && loc.c && loc.c[cc];
    if (!c) return '';
    if (allPaths === null) allPaths = Object.keys(loc.c).map(function (k) { return loc.c[k].d; }).join('');
    var id = 'asjk' + (++uid);
    var S = 160, pad = 14;
    var b = c.b, cosv = Math.cos(((b[1] + b[3]) / 2) * Math.PI / 180);
    var w = Math.max(0.2, (b[2] - b[0]) * cosv), h = Math.max(0.2, b[3] - b[1]);
    var k = Math.min((S - pad * 2) / w, (S - pad * 2) / h), kx = k * cosv;
    var tx = (S - w * k) / 2 - b[0] * kx, ty = (S - h * k) / 2 - b[1] * k;
    var r2 = function (n) { return Math.round(n * 100) / 100; };
    var dot = '';
    var px = null, py = null;
    if (place) {
      px = tx + place.lon * kx; py = ty - place.lat * k;
      if (px < 5 || px > S - 5 || py < 5 || py > S - 5) { px = null; py = null; }
    }
    // The inset of the continent goes in the corner furthest from the dot.
    var iw = 46, ih = iw * (AFRICA[3] - AFRICA[1]) / (AFRICA[2] - AFRICA[0]);
    var right = px === null ? false : px < S / 2, bottom = px === null ? true : py < S / 2;
    var ix = right ? S - iw - 4 : 4, iy = bottom ? S - ih - 4 : 4;
    var ik = iw / (AFRICA[2] - AFRICA[0]);
    var icx = (((b[0] + b[2]) / 2) - AFRICA[0]) * ik, icy = (((b[1] + b[3]) / 2) - AFRICA[1]) * ik;
    if (px !== null) {
      var left = px > S * 0.58;
      dot = '<circle class="k-ring" cx="' + r2(px) + '" cy="' + r2(py) + '" r="6.5"/>' +
        '<circle class="k-dot" cx="' + r2(px) + '" cy="' + r2(py) + '" r="2.8"/>' +
        '<text class="k-txt" x="' + r2(px + (left ? -9 : 9)) + '" y="' + r2(py + 3.2) + '" text-anchor="' + (left ? 'end' : 'start') + '">' + esc(place.name) + '</text>';
    }
    return '<svg viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="' + esc('Map: ' + (place ? place.name + ', ' : '') + (c.n || 'the country') + ' in Africa') + '">' +
      '<defs><path vector-effect="non-scaling-stroke" id="' + id + 'a" d="' + allPaths + '"/><path vector-effect="non-scaling-stroke" id="' + id + 'c" d="' + c.d + '"/>' +
      '<clipPath id="' + id + 'i"><rect x="0" y="0" width="' + r2(iw) + '" height="' + r2(ih) + '"/></clipPath></defs>' +
      '<g transform="matrix(' + r2(kx) + ' 0 0 ' + r2(k) + ' ' + r2(tx) + ' ' + r2(ty) + ')">' +
        '<use href="#' + id + 'a" class="k-land"/><use href="#' + id + 'c" class="k-hi"/></g>' +
      dot +
      '<g transform="translate(' + r2(ix) + ' ' + r2(iy) + ')"><rect class="k-inset" x="-.5" y="-.5" width="' + r2(iw + 1) + '" height="' + r2(ih + 1) + '"/>' +
        '<g clip-path="url(#' + id + 'i)"><g transform="matrix(' + r2(ik) + ' 0 0 ' + r2(ik) + ' ' + r2(-AFRICA[0] * ik) + ' ' + r2(-AFRICA[1] * ik) + ')">' +
        '<use href="#' + id + 'a" class="k-land k-land--inset"/><use href="#' + id + 'c" class="k-hi k-hi--inset"/></g></g>' +
        '<circle class="k-ring" cx="' + r2(icx) + '" cy="' + r2(icy) + '" r="5"/></g>' +
      '</svg>';
  }

  /* ── Styles: the kit carries its own, reading the page's colours where it has them ── */
  var CSS = [
    '.asj-kit,.asj-listen,.asj-kit-share-label{--k-ink:var(--text,var(--c-e8e6e3,#e8e6e3));--k-muted:var(--text-muted,var(--c-a8a39d,#a8a39d));--k-dim:var(--text-dim,var(--c-8a847b,#8a847b));--k-rule:var(--rule,var(--c-2a2a2a,#2a2a2a));--k-surface:var(--surface,var(--c-181818,#1a1a1a));--k-accent:var(--green-bright,var(--c-66bb6a,#66bb6a));--k-hi:var(--front-green,#439447);--k-cta:var(--kit-cta,#2e7d32);--k-land:var(--kit-land,#2c322d);--k-sea:var(--kit-sea,#151816);--k-map-ink:#f2f0ed;--k-mono:var(--mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);--k-serif:var(--serif,"Playfair Display",Georgia,serif);box-sizing:border-box}',
    '.asj-kit *{box-sizing:border-box}',
    '.asj-kit[hidden]{display:none!important}',
    '.asj-kit-visual{display:flex;gap:18px;align-items:center;margin:22px 0 8px;padding:14px;border:1px solid var(--k-rule);background:var(--k-surface);text-align:left}',
    '.asj-kit-map{flex:0 0 150px;margin:0;padding:0}',
    '.asj-kit-map svg{display:block;width:150px;height:150px;background:var(--k-sea)}',
    '.asj-kit-map figcaption{margin-top:7px;font:500 11px/1.3 var(--k-mono);letter-spacing:.03em;text-transform:uppercase;color:var(--k-dim)}',
    '.asj-kit .k-land{fill:var(--k-land);stroke:var(--k-sea);stroke-width:.7;vector-effect:non-scaling-stroke}',
    '.asj-kit .k-land--inset{stroke-width:.2}',
    '.asj-kit .k-hi{fill:var(--k-hi);stroke:var(--k-accent);stroke-width:.8;vector-effect:non-scaling-stroke}',
    '.asj-kit .k-hi--inset{stroke-width:.4}',
    '.asj-kit .k-inset{fill:var(--k-sea);stroke:var(--k-dim);stroke-width:.6}',
    '.asj-kit .k-dot{fill:var(--k-map-ink)}',
    '.asj-kit .k-ring{fill:none;stroke:var(--k-map-ink);stroke-width:1}',
    '.asj-kit .k-txt{font:600 9.5px/1 system-ui,-apple-system,"Segoe UI",sans-serif;fill:var(--k-map-ink);paint-order:stroke;stroke:var(--k-sea);stroke-width:2.6px;stroke-linejoin:round}',
    '.asj-kit-stats{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:14px}',
    '.asj-kit-label,.asj-kit-signal small,.asj-kit-where small,.asj-kit-figs small{display:block;margin:0 0 5px;font:500 11px/1.3 var(--k-mono);letter-spacing:.03em;text-transform:uppercase;color:var(--k-hi)}',
    '.asj-kit-big b{display:block;font:700 clamp(32px,8vw,54px)/1 var(--k-serif);letter-spacing:0;color:var(--k-ink);overflow-wrap:anywhere}',
    '.asj-kit-big span{display:block;margin-top:7px;font-size:14px;line-height:1.35;color:var(--k-muted)}',
    '.asj-kit-signal{display:block;padding-top:12px;border-top:1px solid var(--k-rule);text-decoration:none!important;color:inherit!important}',
    '.asj-kit-stats>.asj-kit-signal:first-child{padding-top:0;border-top:0}',
    '.asj-kit-signal b,.asj-kit-where b{display:block;font:700 26px/1.1 var(--k-serif);letter-spacing:0;color:var(--k-ink)}',
    '.asj-kit-signal span,.asj-kit-where span{display:block;margin-top:5px;font-size:13px;line-height:1.4;color:var(--k-dim)}',
    '.asj-kit-signal em{font-style:normal;white-space:nowrap;color:var(--k-accent)}',
    '.asj-kit-signal:hover b,.asj-kit-signal:focus-visible b{color:var(--k-accent)}',
    '.asj-kit-signal:focus-visible,.asj-kit-figs a:focus-visible,.asj-kit-cta:focus-visible,.asj-kit-follow button:focus-visible{outline:2px solid var(--k-accent);outline-offset:3px}',
    '.asj-kit-land{margin:30px 0 10px;text-align:left}',
    '.asj-kit-follow{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;padding:14px 0;border-top:2px solid var(--k-hi);border-bottom:1px solid var(--k-rule)}',
    '.asj-kit-follow button{min-height:44px;padding:0 16px;border:1px solid var(--k-hi);border-radius:0;background:transparent;color:var(--k-accent);font:600 14px/1 inherit;font-family:inherit;cursor:pointer}',
    '.asj-kit-follow button[aria-pressed="true"]{background:var(--k-cta);border-color:var(--k-cta);color:#fff}',
    '.asj-kit-follow span{flex:1;min-width:190px;font-size:14px;line-height:1.4;color:var(--k-muted)}',
    '.asj-kit-figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:1px solid var(--k-rule)}',
    '.asj-kit-figs a{display:block;padding:14px 10px 14px 0;text-decoration:none!important;color:inherit!important}',
    '.asj-kit-figs a+a{padding-left:12px;border-left:1px solid var(--k-rule)}',
    '.asj-kit-figs b{display:block;font:700 24px/1.1 var(--k-serif);color:var(--k-ink)}',
    '.asj-kit-figs span{display:block;margin-top:4px;font-size:12px;line-height:1.35;color:var(--k-dim)}',
    '.asj-kit-figs a:hover b{color:var(--k-accent)}',
    '.asj-kit-figs-more{display:block;padding:9px 0 0;font-size:13px;color:var(--k-dim)}',
    '.asj-kit-earlier{margin-top:24px}',
    '.asj-kit-earlier ul{list-style:none;margin:0;padding:0}',
    '.asj-kit-earlier li{margin:0;padding:11px 0;border-bottom:1px solid var(--k-rule)}',
    '.asj-kit-earlier a{display:block;font-weight:600;font-size:16px;line-height:1.35;text-decoration:none!important;color:var(--k-ink)!important}',
    '.asj-kit-earlier a:hover{color:var(--k-accent)!important}',
    '.asj-kit-earlier time{display:block;margin-bottom:3px;font:500 11px/1.3 var(--k-mono);letter-spacing:.03em;text-transform:uppercase;color:var(--k-dim)}',
    '.asj-kit-cta{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:26px 0 0;padding:16px 18px;background:var(--k-cta);color:#fff!important;text-decoration:none!important}',
    '.asj-kit-cta b{display:block;font:700 21px/1.2 var(--k-serif)}',
    '.asj-kit-cta span{display:block;margin-top:3px;font-size:13.5px;line-height:1.35;color:#fff}',
    '.asj-kit-cta i{font-style:normal;font-size:24px;line-height:1}',
    '.asj-listen{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0 4px}',
    '.asj-listen[hidden],.asj-listen [hidden]{display:none!important}',
    '.asj-listen button{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 16px 0 12px;border:1px solid var(--k-rule);border-radius:999px;background:var(--k-surface);color:var(--k-ink);font:600 15px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:0;text-transform:none;cursor:pointer}',
    '.asj-listen button:hover{border-color:var(--k-hi)}',
    '.asj-listen button:focus-visible{outline:2px solid var(--k-hi);outline-offset:2px}',
    '.asj-listen svg{width:16px;height:16px;fill:currentColor;flex:none}',
    '.asj-listen .asj-listen-play svg{color:var(--k-hi)}',
    '.asj-listen .asj-listen-stop{padding:0 14px 0 12px}',
    '.asj-listen-note{font:400 14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--k-muted)}',
    // Story pages: Listen sits on the topic row, and a phone's first screen keeps the
    // headline, the summary and the opening sentence (the head was ~460px before).
    '.story-head .meta.asj-meta-listen{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px}',
    '.story-head .meta.asj-meta-listen .asj-listen{margin:0}',
    '@media (max-width:560px){.asj-story-page .wrap{padding-top:22px!important}.asj-story-page .masthead{padding-bottom:14px!important}.story-head h1{margin-top:8px!important}.story-head .dek{margin-bottom:10px!important}.story-head .byline{margin-bottom:0!important}body .story-head{padding-bottom:14px!important;margin-bottom:16px!important}}',
    '.asj-kit-share-label{margin:28px 0 8px;font:600 14px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--k-muted)}',
    '@media (max-width:520px){.asj-kit-visual{gap:12px;padding:10px;align-items:flex-start}.asj-kit-map{flex-basis:112px}.asj-kit-map svg{width:112px;height:112px}.asj-kit-signal b,.asj-kit-where b{font-size:22px}.asj-kit-figs b{font-size:20px}}'
  ].join('\n');
  function ensureCss() {
    if (document.getElementById('asj-kit-css')) return;
    var st = document.createElement('style');
    st.id = 'asj-kit-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ── The visual block: map, number, figure ── */
  var seq = 0;
  // o: { cc, country, headline, dek, paragraphs, topic, link(tab) -> href }
  function mountVisual(host, o) {
    if (!host || !o || !o.cc) return Promise.resolve(false);
    ensureCss();
    var token = String(++seq);
    host.setAttribute('data-kit-token', token);
    host.hidden = true;
    host.innerHTML = '';
    host.className = 'asj-kit asj-kit-visual';
    var text = [o.headline, o.dek].filter(Boolean).join('. ');
    var big = null;
    try { big = bigNumber(o.headline, o.dek); } catch (e) {}
    var want = null;
    try { want = pickSignal(text, o.topic); } catch (e) {}
    return Promise.all([ensureFacts(o.cc), locator(), resolveSignal(want, o.cc)]).then(function (got) {
      if (host.getAttribute('data-kit-token') !== token) return false;
      var f = got[0], loc = got[1], signal = got[2];
      var place = findPlace(f, o.country, [o.headline, o.dek].concat((o.paragraphs || []).slice(0, 2)));
      if (loc && loc.c && loc.c[o.cc]) loc.c[o.cc].n = o.country;
      var svg = locatorSvg(o.cc, loc, place);
      var html = '';
      if (svg) {
        html += '<figure class="asj-kit-map">' + svg + '<figcaption>' + esc((place ? place.name + ', ' : '') + (o.country || '')) + '</figcaption></figure>';
      }
      var stats = '';
      if (big) stats += '<div class="asj-kit-big"><b>' + esc(big.value) + '</b>' + (big.caption ? '<span>' + esc(big.caption) + '</span>' : '') + '</div>';
      if (signal) {
        var href = o.link ? o.link(signal.tab) : '';
        var inner = '<small>From Signals · ' + esc(signal.label) + '</small><b>' + esc(signal.value) + '</b>' +
          '<span>' + esc(signal.sub) + (signal.source ? ' · ' + esc(signal.source) : '') + (href ? ' <em>More figures →</em>' : '') + '</span>';
        stats += href ? '<a class="asj-kit-signal" href="' + esc(href) + '">' + inner + '</a>' : '<div class="asj-kit-signal">' + inner + '</div>';
      }
      if (!stats && svg) {
        var cap = capitalOf(f);
        stats = '<div class="asj-kit-where"><small>Where</small><b>' + esc(place ? place.name : (o.country || '')) + '</b><span>' +
          esc(place ? [o.country, people(place.pop)].filter(Boolean).join(' · ') : (cap ? 'Capital: ' + cap.name : 'Africa')) + '</span></div>';
      }
      if (!html && !stats) return false;
      host.innerHTML = html + (stats ? '<div class="asj-kit-stats">' + stats + '</div>' : '');
      host.hidden = false;
      return true;
    }).catch(function () { return false; });
  }

  /* -- Listen: the browser reads the story aloud --------------------------------------
     speechSynthesis, on the reader's own device: no server, no cost, nothing sent
     anywhere. The voice is whatever the phone or computer has, so quality varies. One
     utterance per paragraph: Chrome cuts a long single utterance off after ~15 s, and a
     paragraph is also where pause and resume land naturally. Hidden where unsupported. */
  var LISTEN_ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5h11v11h-11z"/></svg>'
  };
  var listenCurrent = null;
  function speechSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
  }
  function pickVoice() {
    try {
      var voices = window.speechSynthesis.getVoices() || [];
      var en = voices.filter(function (v) { return /^en(-|_|$)/i.test(v.lang || ''); });
      var rank = function (v) {
        var n = (v.name || '') + ' ' + (v.lang || '');
        return (/natural|enhanced|premium|neural/i.test(n) ? 0 : 4) + (/en[-_](GB|ZA|KE|NG|GH)/i.test(v.lang || '') ? 0 : /en[-_]US/i.test(v.lang || '') ? 1 : 2) + (v.localService ? 0 : 1);
      };
      en.sort(function (a, b) { return rank(a) - rank(b); });
      return en[0] || null;
    } catch (e) { return null; }
  }
  // host: an element to fill. getParts(): the text to read, as an array of strings.
  function mountListen(host, getParts) {
    if (!host) return null;
    if (listenCurrent && listenCurrent.host === host) listenCurrent.stop();
    host.className = 'asj-listen';
    if (!speechSupported()) { host.hidden = true; host.innerHTML = ''; return null; }
    ensureCss();
    host.hidden = false;
    host.innerHTML =
      '<button type="button" class="asj-listen-play" aria-label="Listen to this story">' + LISTEN_ICONS.play + '<span>Listen</span></button>' +
      '<button type="button" class="asj-listen-stop" hidden>' + LISTEN_ICONS.stop + '<span>Stop</span></button>' +
      '<span class="asj-listen-note" aria-live="polite"></span>';
    var play = host.querySelector('.asj-listen-play'), stopBtn = host.querySelector('.asj-listen-stop'), note = host.querySelector('.asj-listen-note');
    var synth = window.speechSynthesis, state = 'idle', queue = [], at = 0, run = 0;
    function paint() {
      var label = state === 'playing' ? 'Pause' : state === 'paused' ? 'Resume' : 'Listen';
      play.innerHTML = (state === 'playing' ? LISTEN_ICONS.pause : LISTEN_ICONS.play) + '<span>' + label + '</span>';
      play.setAttribute('aria-label', state === 'playing' ? 'Pause reading' : state === 'paused' ? 'Resume reading' : 'Listen to this story');
      stopBtn.hidden = state === 'idle';
      note.textContent = state === 'idle' ? '' : state === 'paused' ? 'Paused' : 'Reading aloud';
    }
    function speakNext(myRun) {
      if (myRun !== run || state === 'idle') return;
      if (at >= queue.length) { state = 'idle'; paint(); return; }
      var u = new window.SpeechSynthesisUtterance(queue[at]);
      var voice = pickVoice();
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en';
      u.rate = 0.98;
      u.onend = function () { if (myRun !== run) return; at++; speakNext(myRun); };
      u.onerror = function (e) {
        if (myRun !== run) return;
        if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
        state = 'idle'; paint(); note.textContent = 'Your browser could not read this aloud.';
      };
      synth.speak(u);
    }
    function start() {
      queue = [];
      (getParts() || []).forEach(function (t) {
        t = String(t || '').replace(/\s+/g, ' ').trim();
        if (!t) return;
        // Long paragraphs in sentence-sized pieces, under ~220 characters each.
        var pieces = t.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [t], buf = '';
        pieces.forEach(function (p) {
          if ((buf + p).length > 220 && buf) { queue.push(buf.trim()); buf = ''; }
          buf += p;
        });
        if (buf.trim()) queue.push(buf.trim());
      });
      if (!queue.length) return;
      if (listenCurrent && listenCurrent !== api) listenCurrent.stop();
      listenCurrent = api;
      try { synth.cancel(); } catch (e) {}
      at = 0; run++; state = 'playing'; paint();
      speakNext(run);
    }
    function stop() {
      run++; state = 'idle';
      try { synth.cancel(); } catch (e) {}
      paint();
    }
    play.addEventListener('click', function () {
      if (state === 'idle') start();
      else if (state === 'playing') { try { synth.pause(); } catch (e) {} state = 'paused'; paint(); }
      else {
        state = 'playing'; paint();
        try { synth.resume(); } catch (e) {}
        // Some engines (Android Chrome) drop a paused queue: speak from this paragraph.
        setTimeout(function () { if (state === 'playing' && !synth.speaking) { var r = ++run; try { synth.cancel(); } catch (e) {} speakNext(r); } }, 350);
      }
    });
    stopBtn.addEventListener('click', stop);
    var api = { host: host, stop: stop };
    paint();
    return api;
  }
  function stopListening() { if (listenCurrent) listenCurrent.stop(); }
  if (speechSupported()) {
    try { window.speechSynthesis.getVoices(); } catch (e) {}
    window.addEventListener('pagehide', stopListening);
  }

  /* ── Static story pages: the way further into the paper ── */
  var WATCH_KEY = 'asj:watchlist';
  function watchlist() {
    try { var l = JSON.parse(localStorage.getItem(WATCH_KEY)); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }
  var STOP = {};
  ('about above after again against also among been before being between both could does down during each from have having here into just more most much must only other over said same says should some such than that their them then there these they this those through under until very were what when where which while will with would year years country government minister president state national people new plan plans says after amid over').split(' ').forEach(function (w) { STOP[w] = 1; });
  function keywords(text, countryName) {
    var skip = {};
    String(countryName || '').toLowerCase().split(/[^a-z]+/).forEach(function (w) { if (w) { skip[w] = 1; skip[w + 's'] = 1; skip[w + 'n'] = 1; skip[w + 'an'] = 1; } });
    var out = {};
    String(text || '').toLowerCase().split(/[^a-z0-9]+/).forEach(function (w) {
      if (w.length < 4 || STOP[w] || skip[w]) return;
      out[w.length > 5 ? w.replace(/(ing|ed|es|s)$/, '') : w] = 1;
    });
    return out;
  }
  function earlierOnThis(list, headline, dek, countryName, selfPath) {
    var mine = keywords(headline + ' ' + (dek || ''), countryName);
    var strong = keywords(headline, countryName);
    return (list || []).map(function (e, i) {
      if (!e || !e.h || !e.u || e.u === selfPath) return null;
      var theirs = keywords(e.h, countryName), score = 0;
      Object.keys(theirs).forEach(function (w) { if (strong[w]) score += 2; else if (mine[w]) score += 1; });
      return { e: e, score: score, i: i };
    }).filter(function (x) { return x && x.score >= 3; })
      .sort(function (a, b) { return b.score - a.score || a.i - b.i; })
      .slice(0, 3).map(function (x) { return x.e; });
  }
  function initStaticStory() {
    var article = document.querySelector('article.story');
    if (!article || article.getAttribute('data-kit')) return;
    var m = /^\/([a-z]{2})\/[^/]+\/?/.exec(location.pathname);
    if (!m) return;
    var cc = m[1];
    article.setAttribute('data-kit', '1');
    ensureCss();
    var links = document.querySelectorAll('.masthead a');
    var country = links[1] ? links[1].textContent.trim() : '';
    var head = article.querySelector('.story-head');
    var headline = (article.querySelector('h1') || {}).textContent || '';
    var dek = (article.querySelector('.dek') || {}).textContent || '';
    var topic = head && head.querySelector('.meta') ? head.querySelector('.meta').textContent : '';
    var paragraphs = Array.prototype.slice.call(article.querySelectorAll('p'))
      .filter(function (p) { return !p.className && p.parentNode === article; })
      .map(function (p) { return p.textContent; });
    var home = new URL('.', BASE).href;
    var link = function (tab) { return home + '#/' + cc + '/' + tab; };

    // The story first (12 Nov 2026). The share buttons and this map card sat between the
    // byline and the first paragraph, which put the opening sentence below a phone's first
    // screen. Both now follow the story, before its sources. Pages built since carry the
    // share row there already; older ones are moved here.
    var after = article.querySelector('.share-after') || article.querySelector('.section-label') || null;
    var place = function (el) { if (after && after.parentNode === article) article.insertBefore(el, after); else article.appendChild(el); };
    if (head) {
      var visual = document.createElement('aside');
      visual.setAttribute('aria-label', 'This story at a glance');
      visual.hidden = true;
      place(visual);
      mountVisual(visual, { cc: cc, country: country, headline: headline, dek: dek, paragraphs: paragraphs, topic: topic, link: link });
      var oldShare = head.querySelector('.share');
      if (oldShare) {
        var label = document.createElement('p');
        label.className = 'asj-kit-share-label';
        label.textContent = 'Share this story';
        place(label);
        place(oldShare);
      }
      // A byline that named one outlet when the story cites several (pages built before
      // 12 Nov 2026): name them all, from the sources list under the story.
      var byline = head.querySelector('.byline');
      var srcLinks = Array.prototype.slice.call(article.querySelectorAll('.src a'));
      if (byline && srcLinks.length > 1 && /^\s*Source:/.test(byline.textContent)) {
        var first = byline.querySelector('a');
        var seen = {}, names = [];
        srcLinks.forEach(function (a) { var n = a.textContent.trim(); if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = 1; names.push(a); } });
        if (first && names.length > 1) {
          var frag = document.createDocumentFragment();
          names.forEach(function (a, i) {
            if (i) frag.appendChild(document.createTextNode(i === names.length - 1 ? ' and ' : ', '));
            var c = a.cloneNode(true); frag.appendChild(c);
          });
          if (first.previousSibling && first.previousSibling.nodeType === 3) first.previousSibling.textContent = first.previousSibling.textContent.replace('Source:', 'Sources:');
          first.parentNode.replaceChild(frag, first);
        }
      }
      // Listen, on the topic row (under the byline when a page has no topic row).
      var listen = document.createElement('div');
      document.documentElement.classList.add('asj-story-page');
      var metaRow = head.querySelector('.meta');
      if (metaRow) { metaRow.classList.add('asj-meta-listen'); metaRow.appendChild(listen); }
      else if (byline) byline.parentNode.insertBefore(listen, byline.nextSibling); else head.appendChild(listen);
      mountListen(listen, function () { return [headline, dek].concat(paragraphs); });
    }

    var land = document.createElement('section');
    land.className = 'asj-kit asj-kit-land';
    land.setAttribute('aria-label', 'More from The African Street Journal');
    var name = country || 'this country';
    land.innerHTML =
      '<div class="asj-kit-follow"><button type="button" aria-pressed="false"></button><span></span></div>' +
      '<div class="asj-kit-figs" hidden></div>' +
      '<div class="asj-kit-earlier" hidden></div>' +
      '<a class="asj-kit-cta" href="' + esc(home) + '"><div><b>Read today’s edition</b><span>Every African country on one front page, every source cited.</span></div><i aria-hidden="true">→</i></a>';
    article.parentNode.insertBefore(land, article.nextSibling);

    var button = land.querySelector('.asj-kit-follow button'), note = land.querySelector('.asj-kit-follow span');
    var paint = function () {
      var on = watchlist().indexOf(cc) >= 0;
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.textContent = on ? 'Following ' + name + ' ✓' : '+ Follow ' + name;
      note.textContent = on
        ? name + ' now leads your front page on this device. Tap again to stop.'
        : 'Put ' + name + '’s stories at the top of your front page. No account, no email.';
    };
    button.addEventListener('click', function () {
      var list = watchlist(), at = list.indexOf(cc);
      if (at >= 0) list.splice(at, 1); else list.push(cc);
      try { localStorage.setItem(WATCH_KEY, JSON.stringify(list)); } catch (e) {}
      paint();
    });
    paint();

    ensureFacts(cc).then(function (f) {
      var cells = [];
      ['growth', 'inflation', 'unemployment', 'electricity', 'internet', 'extDebt'].forEach(function (key) {
        var e = wbFact(f, key), def = FACTS[key];
        if (!e || cells.length >= 3) return;
        cells.push('<a href="' + esc(link(def.tab)) + '"><small>' + esc(def.label) + '</small><b>' + esc(fmtFact(def.fmt, e.v)) + '</b><span>' + esc(def.sub + (e.y ? ', ' + e.y : '')) + '</span></a>');
      });
      if (cells.length < 2) return;
      var figs = land.querySelector('.asj-kit-figs');
      figs.innerHTML = cells.join('');
      figs.style.gridTemplateColumns = 'repeat(' + cells.length + ',minmax(0,1fr))';
      figs.hidden = false;
      figs.insertAdjacentHTML('afterend', '<a class="asj-kit-figs-more" href="' + esc(home + '#/' + cc) + '">' + esc(name) + ' in full: map, prices, markets →</a>');
    });

    getJson(BASE + 'data/earlier/' + cc + '.json').then(function (list) {
      var hits = earlierOnThis(list, headline, dek, country, location.pathname);
      if (!hits.length) return;
      var box = land.querySelector('.asj-kit-earlier');
      box.innerHTML = '<h2 class="section-label">Earlier on this story</h2><ul>' + hits.map(function (e) {
        var day = dayLabel(e.d);
        return '<li>' + (day ? '<time datetime="' + esc(e.d) + '">' + esc(day) + '</time>' : '') + '<a href="' + esc(e.u) + '">' + esc(e.h) + '</a></li>';
      }).join('') + '</ul>';
      box.hidden = false;
    }).catch(function () {});
  }

  window.ASJ_STORY_KIT = {
    mountVisual: mountVisual,
    mountListen: mountListen,
    stopListening: stopListening,
    pickSignal: pickSignal,
    resolveSignal: resolveSignal,
    bigNumber: bigNumber,
    findPlace: findPlace,
    earlierOnThis: earlierOnThis,
    initStaticStory: initStaticStory
  };

  if (document.querySelector('article.story')) {
    try { initStaticStory(); } catch (e) {}
  }
}());
