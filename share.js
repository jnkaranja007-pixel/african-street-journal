/* Share bar on static story pages: copy link + native share. WhatsApp and X are plain links. */
(function () {
  var bar = document.querySelector('.share'); if (!bar) return;
  var url = bar.getAttribute('data-url') || location.href, title = bar.getAttribute('data-title') || document.title;
  var status = bar.querySelector('.share-status');
  // The translated editions say it in their own language.
  var COPIED = { fr: "Lien copi\u00e9", pt: "Liga\u00e7\u00e3o copiada", sw: "Kiungo kimenakiliwa", ar: "\u062a\u0645 \u0646\u0633\u062e \u0627\u0644\u0631\u0627\u0628\u0637", am: "\u120a\u1295\u12a9 \u1270\u1240\u12f5\u1277\u120d", ha: "An kwafi maha\u0257a", so: "Xiriirka waa la koobiyeeyay", zu: "Ilinki ikopishiwe" }[(document.documentElement.lang || "en").slice(0, 2)] || "Link copied";
  function say(t) { if (status) { status.textContent = t; setTimeout(function () { status.textContent = ''; }, 2400); } }
  var copy = bar.querySelector('.share-copy');
  if (copy) copy.addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { say(COPIED); }, function () { say(url); });
    else { window.prompt('Copy this link', url); }
  });
  var nat = bar.querySelector('.share-native');
  if (nat && navigator.share) {
    nat.hidden = false;
    nat.addEventListener('click', function () { navigator.share({ title: title, url: url }).catch(function () {}); });
  }
}());

/* Story pages are written once and kept for weeks, and this file is the one script all
   of them load. So it is also how a kept page gets what was built after it: the story
   kit (locator map, the figure from Signals, follow button, earlier stories). The
   number below is the kit's version; raise it when story-kit.js changes. */
(function () {
  if (window.ASJ_STORY_KIT || !document.querySelector('article.story')) return;
  var me = document.currentScript, src = (me && me.src) || '';
  var s = document.createElement('script');
  s.src = (src ? src.replace(/share\.js(\?.*)?$/, '') : '/') + 'story-kit.js?v=145';
  s.async = true;
  document.head.appendChild(s);
}());
