/* /markets/: every stock index the journal follows (data/indices.js, refreshed daily by
   update-markets.yml) and every African currency against the US dollar (data/fx-history.json,
   saved by the desk each day; the live reference rate if that file is missing or old).
   Sortable tables, readable on a phone: three columns, sentence case, 15-17px. */
(function () {
  'use strict';
  var NAMES = {
    dz:'Algeria',ao:'Angola',bj:'Benin',bw:'Botswana',bf:'Burkina Faso',bi:'Burundi',cv:'Cabo Verde',cm:'Cameroon',
    cf:'Central African Republic',td:'Chad',km:'Comoros',cd:'DR Congo',cg:'Republic of Congo',ci:"Côte d'Ivoire",
    dj:'Djibouti',eg:'Egypt',gq:'Equatorial Guinea',er:'Eritrea',sz:'Eswatini',et:'Ethiopia',ga:'Gabon',gm:'Gambia',
    gh:'Ghana',gn:'Guinea',gw:'Guinea-Bissau',ke:'Kenya',ls:'Lesotho',lr:'Liberia',ly:'Libya',mg:'Madagascar',
    mw:'Malawi',ml:'Mali',mr:'Mauritania',mu:'Mauritius',ma:'Morocco',mz:'Mozambique',na:'Namibia',ne:'Niger',
    ng:'Nigeria',rw:'Rwanda',st:'São Tomé and Príncipe',sn:'Senegal',sc:'Seychelles',sl:'Sierra Leone',so:'Somalia',
    za:'South Africa',ss:'South Sudan',sd:'Sudan',tz:'Tanzania',tg:'Togo',tn:'Tunisia',ug:'Uganda',eh:'Western Sahara',
    zm:'Zambia',zw:'Zimbabwe'
  };
  var CURRENCY = {
    dz:'DZD',so:'SOS',zw:'ZWG',zm:'ZMW',za:'ZAR',ug:'UGX',tz:'TZS',tn:'TND',tg:'XOF',td:'XAF',sz:'SZL',sl:'SLE',sn:'XOF',
    ss:'SSP',sd:'SDG',eh:'MAD',rw:'RWF',ng:'NGN',ne:'XOF',na:'NAD',mw:'MWK',mr:'MRU',mz:'MZN',ml:'XOF',mg:'MGA',ma:'MAD',
    ls:'LSL',ly:'LYD',lr:'LRD',ke:'KES',gq:'XAF',gw:'XOF',gm:'GMD',gn:'GNF',gh:'GHS',ga:'XAF',et:'ETB',er:'ERN',eg:'EGP',
    dj:'DJF',cg:'XAF',cd:'CDF',cm:'XAF',ci:'XOF',cf:'XAF',bw:'BWP',bf:'XOF',bj:'XOF',bi:'BIF',ao:'AOA',cv:'CVE',st:'STN',
    km:'KMF',mu:'MUR',sc:'SCR'
  };
  var CCY_NAME = {
    AOA:'Angolan kwanza',BIF:'Burundian franc',BWP:'Botswana pula',CDF:'Congolese franc',CVE:'Cabo Verde escudo',
    DJF:'Djiboutian franc',DZD:'Algerian dinar',EGP:'Egyptian pound',ERN:'Eritrean nakfa',ETB:'Ethiopian birr',
    GHS:'Ghanaian cedi',GMD:'Gambian dalasi',GNF:'Guinean franc',KES:'Kenyan shilling',KMF:'Comorian franc',
    LRD:'Liberian dollar',LSL:'Lesotho loti',LYD:'Libyan dinar',MAD:'Moroccan dirham',MGA:'Malagasy ariary',
    MRU:'Mauritanian ouguiya',MUR:'Mauritian rupee',MWK:'Malawian kwacha',MZN:'Mozambican metical',NAD:'Namibian dollar',
    NGN:'Nigerian naira',RWF:'Rwandan franc',SCR:'Seychellois rupee',SDG:'Sudanese pound',SLE:'Sierra Leonean leone',
    SOS:'Somali shilling',SSP:'South Sudanese pound',STN:'São Tomé dobra',SZL:'Swazi lilangeni',TND:'Tunisian dinar',
    TZS:'Tanzanian shilling',UGX:'Ugandan shilling',XAF:'Central African CFA franc',XOF:'West African CFA franc',
    ZAR:'South African rand',ZMW:'Zambian kwacha',ZWG:'Zimbabwe Gold'
  };
  var KIT = window.ASJ_FX_TREND;
  var collator = new Intl.Collator('en', { sensitivity: 'base' });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function day(iso) {
    var t = Date.parse(String(iso || '').slice(0, 10) + 'T12:00:00Z');
    return isFinite(t) ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
  }
  function ageDays(iso) { var t = Date.parse(String(iso || '').slice(0, 10) + 'T12:00:00Z'); return isFinite(t) ? (Date.now() - t) / 864e5 : Infinity; }
  function countriesText(list) {
    var names = list.map(function (c) { return NAMES[c] || c.toUpperCase(); }).sort(collator.compare);
    if (names.length <= 2) return names.join(' and ');
    return names.length + ' countries: ' + names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }
  function signed(p, digits) {
    if (!isFinite(p)) return '';
    var v = Math.abs(p) < 0.005 ? 0 : p;
    return (v > 0 ? '+' : v < 0 ? '\u2212' : '') + Math.abs(v).toFixed(digits == null ? 2 : digits) + '%';
  }
  function tone(p) { return !isFinite(p) || Math.abs(p) < 0.005 ? '' : p > 0 ? ' is-up' : ' is-down'; }

  /* -- Sortable tables ---------------------------------------------------------------- */
  function sortable(table, rows, render, initialKey, initialDir) {
    var state = { key: initialKey, dir: initialDir };
    function paint() {
      var key = state.key, dir = state.dir === 'ascending' ? 1 : -1;
      var sorted = rows.slice().sort(function (a, b) {
        var x = a.sort[key], y = b.sort[key];
        var xm = x === null || x === undefined || (typeof x === 'number' && !isFinite(x));
        var ym = y === null || y === undefined || (typeof y === 'number' && !isFinite(y));
        if (xm || ym) return xm && ym ? collator.compare(a.sort.name, b.sort.name) : xm ? 1 : -1;   // missing last
        var c = typeof x === 'string' ? collator.compare(x, y) : x - y;
        return c * dir || collator.compare(a.sort.name, b.sort.name);
      });
      table.querySelector('tbody').innerHTML = sorted.map(render).join('');
      table.querySelectorAll('th').forEach(function (th) {
        var b = th.querySelector('button');
        th.setAttribute('aria-sort', b && b.dataset.sort === state.key ? state.dir : 'none');
      });
    }
    table.querySelector('thead').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-sort]');
      if (!b) return;
      var k = b.dataset.sort;
      if (state.key === k) state.dir = state.dir === 'ascending' ? 'descending' : 'ascending';
      else { state.key = k; state.dir = k === 'name' ? 'ascending' : 'descending'; }
      paint();
    });
    paint();
  }

  /* -- Stock markets ------------------------------------------------------------------- */
  (function indices() {
    var table = document.getElementById('mk-idx');
    var data = window.ASJ_INDICES && window.ASJ_INDICES.indices;
    if (!table) return;
    if (!data) { table.querySelector('tbody').innerHTML = '<tr><td colspan="3" class="mk-loading">Market data could not be loaded. Try again later.</td></tr>'; return; }
    var rows = Object.keys(data).map(function (k) { return data[k]; })
      .filter(function (r) { return r && isFinite(r.level) && r.level > 0; })
      .map(function (r) {
        var cs = Array.isArray(r.countries) ? r.countries : [];
        var pct = isFinite(r.changePct) && Math.abs(r.changePct) <= 50 ? r.changePct : NaN;
        return { r: r, cs: cs, pct: pct, stale: ageDays(r.date) > 7,
          sort: { name: r.name || r.label || r.code, level: r.level, move: pct } };
      });
    var stale = rows.filter(function (x) { return x.stale; }).length;
    function render(x) {
      var r = x.r, single = x.cs.length === 1;
      var where = single
        ? '<a href="/#/' + x.cs[0] + '/investors">' + esc(NAMES[x.cs[0]] || x.cs[0]) + '</a>'
        : esc(countriesText(x.cs));
      return '<tr' + (x.stale ? ' class="is-stale"' : '') + '>' +
        '<th scope="row"><span class="mk-name">' + esc(r.name || r.label) + '</span><span class="mk-sub">' + where + '</span></th>' +
        '<td class="num"><span class="mk-val">' + esc(Number(r.level).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })) + '</span>' +
          '<span class="mk-sub">' + (x.stale ? 'Last traded ' : '') + esc(day(r.date)) + '</span></td>' +
        '<td class="num"><span class="mk-val' + tone(x.pct) + '">' + (isFinite(x.pct) ? esc(signed(x.pct)) : '<span class="mk-none">No move</span>') + '</span></td>' +
      '</tr>';
    }
    sortable(table, rows, render, 'name', 'ascending');
    var src = document.getElementById('mk-idx-source');
    var fetched = window.ASJ_INDICES.fetchedAt ? day(window.ASJ_INDICES.fetchedAt) : '';
    if (src) src.textContent = rows.length + ' indices. Source: ' + (window.ASJ_INDICES.source || 'exchange data') + (fetched ? ', checked ' + fetched : '') + '.' +
      (stale ? ' ' + stale + ' have not reported a session for over a week; their last date is shown.' : '');
  }());

  /* -- Currencies ---------------------------------------------------------------------- */
  (function currencies() {
    var table = document.getElementById('mk-fx');
    if (!table) return;
    var byCcy = {};
    Object.keys(CURRENCY).forEach(function (cc) { (byCcy[CURRENCY[cc]] = byCcy[CURRENCY[cc]] || []).push(cc); });
    function build(hist, live) {
      var rows = Object.keys(byCcy).map(function (ccy) {
        var tr = KIT && hist ? KIT.trend(hist, ccy) : null;
        var rate = tr ? tr.now : live && live.rates ? live.rates[ccy] : NaN;
        var pct = tr && tr.then !== undefined ? tr.pct : NaN;
        return { ccy: ccy, cs: byCcy[ccy], tr: tr, rate: rate, pct: pct,
          sort: { name: CCY_NAME[ccy] || ccy, rate: isFinite(rate) ? rate : NaN, change: pct } };
      });
      var withChange = rows.filter(function (x) { return isFinite(x.pct); });
      var ago = withChange.length ? withChange[0].tr.ago : '';
      var head = table.querySelector('th:nth-child(3) button');
      if (head) head.textContent = ago === 'a month ago' ? 'Month' : 'Change';
      function render(x) {
        var single = x.cs.length === 1;
        var where = single ? '<a href="/#/' + x.cs[0] + '/diaspora">' + esc(NAMES[x.cs[0]]) + '</a>' : esc(countriesText(x.cs));
        var line = x.tr && KIT ? KIT.spark(x.tr.points, 72, 22) : '';
        return '<tr>' +
          '<th scope="row"><span class="mk-name">' + esc(CCY_NAME[x.ccy] || x.ccy) + ' <span class="mk-code">' + esc(x.ccy) + '</span></span><span class="mk-sub">' + where + '</span></th>' +
          '<td class="num"><span class="mk-val">' + (isFinite(x.rate) ? esc(KIT ? KIT.fmt(x.rate) : x.rate) : '<span class="mk-none">No rate</span>') + '</span></td>' +
          '<td class="num">' + (isFinite(x.pct)
            ? '<span class="mk-val" title="' + esc('$1 bought ' + KIT.fmt(x.tr.then) + ' ' + x.ccy + ' ' + x.tr.ago) + '">' + esc(signed(x.pct, 1)) + '</span>' + (line ? '<span class="mk-spark">' + line + '</span>' : '')
            : '<span class="mk-none" aria-label="No change yet">\u2013</span>') + '</td>' +
        '</tr>';
      }
      sortable(table, rows, render, 'name', 'ascending');
      var note = document.getElementById('mk-fx-note');
      var src = document.getElementById('mk-fx-source');
      var first = rows.map(function (x) { return x.tr && x.tr.since; }).filter(Boolean).sort()[0];
      if (note) {
        note.textContent = withChange.length
          ? 'What one US dollar buys in each currency, and how that has changed since ' + ago + '. Up means the dollar buys more, so the local currency is weaker.'
          : 'What one US dollar buys in each currency. We save the rate every day' + (first ? ' from ' + KIT.dayLabel(first) : '') + ', so the change column fills in as the days add up.';
      }
      var asOf = rows.map(function (x) { return x.tr && x.tr.nowDay; }).filter(Boolean).sort().pop();
      if (src) src.innerHTML = rows.length + ' currencies used by the 55 countries. Reference rates from <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">ExchangeRate-API</a>' +
        (asOf ? ', ' + esc(KIT.dayLabel(asOf)) : live && live.time_last_update_utc ? ', ' + esc(day(new Date(live.time_last_update_utc).toISOString())) : '') + '.';
    }
    function liveRates() {
      return fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }
    var hist = KIT ? KIT.load('/') : Promise.resolve(null);
    hist.then(function (h) {
      var newest = h && Array.isArray(h.days) && h.days.length ? h.days[h.days.length - 1] : '';
      if (h && newest && ageDays(newest) < 4) { build(h, null); return; }
      liveRates().then(function (live) {
        if (!live && !h) { table.querySelector('tbody').innerHTML = '<tr><td colspan="3" class="mk-loading">Exchange rates could not be loaded. Try again later.</td></tr>'; return; }
        build(live ? null : h, live);
      });
    });
  }());
}());
