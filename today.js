/* The African Street Journal - "Today" section below the landing hero.
   Reads the edition already on the page (window.UNITED_AFRICA_BRIEFS) and renders a
   lead story, a scannable list and the country desks. No network requests of its own.
   Links go to the static story pages, which are small, crawlable and shareable. */
(function () {
  'use strict';
  var B = window.UNITED_AFRICA_BRIEFS;
  var lead = document.getElementById('today-lead');
  var list = document.getElementById('today-list');
  var countries = document.getElementById('today-country-list');
  if (!lead || !list) return;
  var INFO = (typeof COUNTRY_INFO !== 'undefined') ? COUNTRY_INFO : {};

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function name(code) { return (INFO[code] && INFO[code].name) || code.toUpperCase(); }
  function ago(iso) {
    var t = Date.parse(iso); if (!t) return '';
    var h = Math.round((Date.now() - t) / 36e5);
    if (h < 1) return 'Just now';
    if (h < 24) return h + 'h ago';
    var d = Math.round(h / 24); return d === 1 ? 'Yesterday' : d + ' days ago';
  }
  function href(code, s) { return s.slug ? '/' + code + '/' + s.slug + '/' : '/' + code + '/'; }

  var all = [];
  var by = (B && B.byCountry) || {};
  Object.keys(by).forEach(function (code) {
    (by[code] || []).forEach(function (s, rank) {
      if (!s || !s.headline) return;
      all.push({ code: code, s: s, rank: rank, t: Date.parse(s.published) || 0, score: Number(s.editorialScore || s.selectionScore || 0) - rank * 2 });
    });
  });
  var now = Date.now();
  var fresh = all.filter(function (x) { return now - x.t < 48 * 36e5; });
  var pool = (fresh.length >= 6 ? fresh : all).sort(function (a, b) { return b.score - a.score || b.t - a.t; });
  var seen = {}, top = [];
  pool.forEach(function (x) { if (!seen[x.code] && top.length < 9) { seen[x.code] = 1; top.push(x); } });

  var meta = document.getElementById('today-meta');
  if (meta) meta.textContent = all.length + ' stories \u00b7 ' + Object.keys(by).length + ' countries \u00b7 every one sourced';
  var dateEl = document.getElementById('today-date');
  if (dateEl && B && B.generated) {
    var g = new Date(B.generated);
    if (!isNaN(g)) dateEl.textContent = 'Today \u00b7 ' + g.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  if (top.length) {
    var L = top[0], src = (L.s.sources && L.s.sources[0] && L.s.sources[0].name) || '';
    lead.innerHTML =
      '<p class="today-label"><span class="today-country">' + esc(name(L.code)) + '</span><span>' + esc(L.s.topic || 'News') + '</span></p>' +
      '<h3 class="today-lead-title"><a href="' + href(L.code, L.s) + '">' + esc(L.s.headline) + '</a></h3>' +
      (L.s.dek ? '<p class="today-lead-dek">' + esc(L.s.dek) + '</p>' : '') +
      '<p class="today-byline">' + (src ? 'Source: ' + esc(src) + ' \u00b7 ' : '') + esc(ago(L.s.published)) +
      (L.s.readMinutes ? ' \u00b7 ' + esc(L.s.readMinutes) + ' min read' : '') + '</p>';
    list.innerHTML = top.slice(1).map(function (x) {
      return '<li><a href="' + href(x.code, x.s) + '"><span class="today-label"><span class="today-country">' + esc(name(x.code)) +
        '</span><span>' + esc(x.s.topic || 'News') + '</span><span class="today-ago">' + esc(ago(x.s.published)) + '</span></span>' +
        '<span class="today-item-title">' + esc(x.s.headline) + '</span></a></li>';
    }).join('');
  } else {
    lead.innerHTML = '<p class="today-lead-dek">Today\u2019s edition is loading. <a href="/ke/">Browse a country desk</a>.</p>';
  }

  if (countries) {
    var codes = Object.keys(INFO).length ? Object.keys(INFO) : Object.keys(by);
    codes.sort(function (a, b) { return name(a).localeCompare(name(b)); });
    countries.innerHTML = codes.map(function (c) {
      var n = (by[c] || []).length;
      return '<li><a href="/' + c + '/">' + esc(name(c)) + (n ? '<span class="today-count" aria-label="' + n + ' stories">' + n + '</span>' : '') + '</a></li>';
    }).join('');
  }
}());
