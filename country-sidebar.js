/* Country page right rail (desktop ≥1100px only). Real data only:
   quick facts (capital, local time, weather, market index with as-of + source),
   latest stories from other countries, follow control, and an optional sponsor card
   that stays hidden unless data/sponsor.json says enabled with a url + image. */
(function () {
  'use strict';
  var carousel = document.querySelector('#country-view .cv-carousel');
  if (!carousel || typeof COUNTRY_INFO === 'undefined') return;
  var aside = document.createElement('aside');
  aside.className = 'cv-rail';
  aside.setAttribute('aria-label', 'Country quick facts');
  carousel.appendChild(aside);
  var sponsor = null;
  var esc = function (s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s); };
  var txt = function (id) { var e = document.getElementById(id); return e ? e.textContent.trim() : ''; };
  var real = function (s) { return s && !/^(—|-|--:--|loading)$/i.test(s); };

  function currentId() {
    var m = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
    return (m && COUNTRY_INFO[m]) ? m : null;
  }
  function latestElsewhere(cc) {
    var out = [];
    try {
      Object.keys(AI_BRIEFS).forEach(function (id) {
        if (id === cc || !COUNTRY_INFO[id]) return;
        (AI_BRIEFS[id] || []).forEach(function (b) {
          var t = Date.parse(b && b.published);
          if (b && b.headline && b.slug && Number.isFinite(t) && t <= Date.now() + 300000) out.push({ id: id, b: b, t: t });
        });
      });
    } catch (e) { return []; }
    out.sort(function (a, z) { return z.t - a.t; });
    var seen = {}, picks = [];
    for (var i = 0; i < out.length && picks.length < 5; i++) { if (seen[out[i].id]) continue; seen[out[i].id] = 1; picks.push(out[i]); }
    return picks;
  }
  function factRow(k, v, sub) {
    if (!real(v)) return '';
    return '<div class="cv-rail-fact"><dt>' + esc(k) + '</dt><dd>' + esc(v) + (sub && real(sub) ? '<small>' + esc(sub) + '</small>' : '') + '</dd></div>';
  }
  // Quick facts must not repeat the header (capital, region) or the facts strip above,
  // whose cells change with the audience. Real data only; a missing fact is skipped.
  function shownKeys() {
    return Array.prototype.map.call(document.querySelectorAll('#country-view .cv-alm-key'), function (k) {
      return k.getClientRects().length ? k.textContent.trim().toLowerCase() : '';
    }).join(' | ');
  }
  function fxFact(cc, info) {
    try {
      var inv = investorForCountry(cc, info);
      var ccy = inv && inv.currency;
      var rate = ccy && (window.__FX || {})[ccy];
      var at = Date.parse(window.__FX_AT || '');
      if (!ccy || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(at)) return null;
      if (window.__FX_SOURCE === 'fallback' || Date.now() - at > 7 * 86400000) return null;
      return { k: 'US dollar', v: '1 USD = ' + formatFxRate(rate) + ' ' + ccy, sub: 'as of ' + formatFxDate(window.__FX_AT) + ' · ExchangeRate-API', ccy: ccy };
    } catch (e) { return null; }
  }
  function quickFacts(cc, info) {
    var shown = shownKeys();
    var rows = [];
    var fx = fxFact(cc, info);
    if (fx) rows.push(fx);
    var ccy = fx ? fx.ccy : (function () { try { return investorForCountry(cc, info).currency; } catch (e) { return ''; } }());
    if (ccy && typeof CCY_NAME !== 'undefined' && CCY_NAME[ccy] && !/payout|currency/.test(shown)) rows.push({ k: 'Currency', v: CCY_NAME[ccy] + ' (' + ccy + ')' });
    // Same figure the page shows elsewhere (live-ticking estimate), so the numbers agree.
    var live = (txt('cv-file-pop').match(/^([\d.]+)\s*([MB])/i) || []);
    var popText = live[1] ? live[1] + (live[2].toUpperCase() === 'B' ? ' billion' : ' million') : (Number.isFinite(info.pop) && info.pop > 0 ? (info.pop / 1e6).toFixed(info.pop >= 1e7 ? 0 : 1) + ' million' : '');
    if (popText && !/population/.test(shown)) rows.push({ k: 'Population', v: popText });
    return rows.slice(0, 3).map(function (r) { return factRow(r.k, r.v, r.sub); }).join('');
  }
  function render() {
    var cc = currentId();
    if (!cc) return;
    var info = COUNTRY_INFO[cc] || {};
    var html = '';
    var facts = quickFacts(cc, info);
    var idx = '';
    try { if (typeof renderIndexLine === 'function') idx = renderIndexLine(cc); } catch (e) {}
    html += '<section class="cv-rail-block"><h2 class="cv-rail-h">Quick facts</h2><dl class="cv-rail-facts">' + facts + '</dl>' +
      (idx ? '<div class="cv-rail-index"><div class="cv-rail-k">Market index</div>' + idx + '</div>' : '') + '</section>';
    var star = document.getElementById('cv-star');
    var following = star && star.getAttribute('aria-pressed') === 'true';
    html += '<section class="cv-rail-block"><button type="button" class="cv-rail-follow" aria-pressed="' + following + '">' +
      (following ? '★ Following ' : '☆ Follow ') + esc(info.name || '') + '</button></section>';
    var latest = latestElsewhere(cc);
    if (latest.length) {
      html += '<section class="cv-rail-block"><h2 class="cv-rail-h">Latest across Africa</h2><ul class="cv-rail-list">' +
        latest.map(function (x) {
          return '<li><a href="/' + x.id + '/' + encodeURIComponent(x.b.slug) + '/"><span class="cv-rail-cc">' + esc(COUNTRY_INFO[x.id].name) + '</span>' + esc(x.b.headline) + '</a></li>';
        }).join('') + '</ul></section>';
    }
    if (sponsor) {
      html += '<section class="cv-rail-block cv-rail-sponsor"><div class="cv-rail-k">Sponsored</div>' +
        '<a href="' + esc(sponsor.url) + '" target="_blank" rel="sponsored noopener">' +
        '<img src="' + esc(sponsor.image) + '" alt="' + esc(sponsor.alt || sponsor.label || 'Sponsor') + '" width="300" height="250" loading="lazy">' +
        (sponsor.label ? '<span>' + esc(sponsor.label) + '</span>' : '') + '</a></section>';
    }
    aside.innerHTML = html;
    var f = aside.querySelector('.cv-rail-follow');
    if (f && star) f.addEventListener('click', function () { star.click(); setTimeout(render, 50); });
  }
  window.__asjRailRender = render;
  document.addEventListener('fx-ready', function () { setTimeout(render, 30); });
  window.addEventListener('hashchange', function () { setTimeout(render, 60); });
  var name = document.getElementById('cv-name');
  if (name) new MutationObserver(function () { setTimeout(render, 60); }).observe(name, { childList: true, characterData: true, subtree: true });
  ['cv-pop', 'cv-weather', 'cv-time', 'cv-daylight'].forEach(function (id) {
    var e = document.getElementById(id);
    if (e) new MutationObserver(function () { clearTimeout(e.__r); e.__r = setTimeout(render, 400); }).observe(e, { childList: true, characterData: true, subtree: true });
  });
  if (window.matchMedia('(min-width:1100px)').matches || true) {
    fetch('/data/sponsor.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
      if (s && s.enabled === true && /^https:\/\//.test(s.url || '') && s.image) { sponsor = s; render(); }
    }).catch(function () {});
  }
  setTimeout(render, 0);
}());
