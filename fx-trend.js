/* US dollar rates over time, from data/fx-history.json (saved once a day by the desk,
   scripts/update-fx-history.ps1, from 12 Nov 2026). Shared by the app's country pages
   and /markets/. Everything degrades: no file, one day, or a gap gives a shorter line,
   never an error. */
(function () {
  'use strict';
  if (window.ASJ_FX_TREND) return;
  var DAY = 864e5, cache = null;
  function load(base) {
    if (!cache) {
      cache = fetch((base || '/') + 'data/fx-history.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return cache;
  }
  function t(day) { return Date.parse(String(day) + 'T00:00:00Z'); }
  function series(h, ccy) {
    if (!h || !Array.isArray(h.days) || !h.rates || !Array.isArray(h.rates[ccy])) return [];
    var vals = h.rates[ccy], out = [];
    for (var i = 0; i < h.days.length; i++) {
      var v = vals[i];
      if (typeof v === 'number' && v > 0 && isFinite(v) && isFinite(t(h.days[i]))) out.push({ d: h.days[i], v: v });
    }
    return out;
  }
  function fmt(rate) {
    if (!isFinite(rate)) return '';
    if (rate >= 1000) return Math.round(rate).toLocaleString('en-US');
    if (rate >= 10) return rate.toFixed(2);
    return rate.toFixed(3);
  }
  function dayLabel(day) {
    var x = t(day);
    return isFinite(x) ? new Date(x).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  }
  // { ccy, now, nowDay, since, points, then?, thenDay?, days?, ago?, pct? }
  function trend(h, ccy) {
    var pts = series(h, ccy);
    if (!pts.length) return null;
    var last = pts[pts.length - 1], lastT = t(last.d);
    var out = { ccy: ccy, now: last.v, nowDay: last.d, since: pts[0].d, points: pts };
    if (pts.length < 2) return out;
    // The point nearest a month before the newest; with less history, the oldest.
    var target = lastT - 30 * DAY, best = null, bestT = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var pt = t(pts[i].d);
      if (!best || Math.abs(pt - target) < Math.abs(bestT - target)) { best = pts[i]; bestT = pt; }
    }
    var days = Math.round((lastT - bestT) / DAY);
    out.then = best.v; out.thenDay = best.d; out.days = days;
    out.ago = days >= 28 && days <= 33 ? 'a month ago' : days === 1 ? 'yesterday' : days === 7 ? 'a week ago' : days + ' days ago';
    out.pct = (last.v / best.v - 1) * 100;
    return out;
  }
  // "today" while the newest point is from the last two days; otherwise its date.
  function when(tr) {
    var age = (Date.now() - t(tr.nowDay)) / DAY;
    return age < 2 ? 'today' : 'on ' + dayLabel(tr.nowDay);
  }
  // A small line of the last 90 days. Empty below two points.
  function spark(points, w, h) {
    var pts = (points || []).slice(-90);
    if (pts.length < 2) return '';
    w = w || 120; h = h || 32;
    var lo = Infinity, hi = -Infinity;
    pts.forEach(function (p) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; });
    var span = hi - lo || hi * 0.001 || 1, pad = 3;
    var t0 = t(pts[0].d), t1 = t(pts[pts.length - 1].d), tw = (t1 - t0) || 1;
    var xy = pts.map(function (p) {
      return [pad + (t(p.d) - t0) / tw * (w - pad * 2), pad + (1 - (p.v - lo) / span) * (h - pad * 2)];
    });
    var d = xy.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('');
    var e = xy[xy.length - 1];
    return '<svg class="fx-spark" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true" focusable="false">' +
      '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + e[0].toFixed(1) + '" cy="' + e[1].toFixed(1) + '" r="2.6" fill="currentColor"/></svg>';
  }
  // Plain sentences for a reader: the rate then and now, and which way the dollar went.
  function sentence(tr) {
    if (!tr) return null;
    var head = '$1 buys ' + fmt(tr.now) + ' ' + tr.ccy + ' ' + when(tr);
    if (tr.then === undefined) {
      return { head: head + '.', sub: 'We save this rate every day from ' + dayLabel(tr.since) + '. The trend shows here as the days add up.' };
    }
    var pct = Math.abs(tr.pct), dir = tr.pct > 0 ? 'more' : 'less';
    var sub = pct < 0.05 ? 'About the same as ' + tr.ago + '.'
      : 'The dollar buys ' + (pct < 10 ? pct.toFixed(1) : Math.round(pct)) + '% ' + dir + ' than ' + tr.ago + '.';
    return { head: head + ', ' + fmt(tr.then) + ' ' + tr.ago + '.', sub: sub };
  }
  window.ASJ_FX_TREND = { load: load, series: series, trend: trend, spark: spark, sentence: sentence, fmt: fmt, dayLabel: dayLabel };
}());
