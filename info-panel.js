/* About / Privacy / Contact / Corrections open in a small in-site sheet instead of
   navigating away. The links stay real hrefs (/about/ etc.), so without JavaScript, or
   with a modifier-click, they still go to the standalone pages. Deep-linkable: #about. */
(function () {
  'use strict';
  var PAGES = { about: 'About', privacy: 'Privacy', contact: 'Contact', corrections: 'Corrections', methods: 'How we check our figures' };
  var css = '.ip-back{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .18s}' +
    '.ip-back.ip-on{opacity:1}' +
    '.ip{position:relative;width:min(560px,calc(100vw - 32px));max-height:min(80vh,720px);overflow:auto;background:#171717;border:1px solid #2a2a2a;color:#e8e6e3;padding:28px 28px 24px;box-shadow:0 24px 64px rgba(0,0,0,.5);transform:translateY(8px);transition:transform .2s;font:15.5px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left}' +
    '.ip-back.ip-on .ip{transform:none}' +
    '.ip h2{margin:0 0 14px;font:700 30px/1.1 "Playfair Display",Georgia,serif;color:#f2f0ed}' +
    '.ip h3{margin:20px 0 6px;font:700 18px/1.3 "Playfair Display",Georgia,serif;color:#f2f0ed}' +
    '.ip *{text-transform:none;letter-spacing:normal}.ip p,.ip li{font:inherit;color:#c9c5c0;margin:0 0 10px}.ip ul{padding-left:20px;margin:0 0 10px}.ip a{color:#66bb6a}' +
    '.ip-x{position:absolute;top:10px;right:10px;width:40px;height:40px;border:0;background:none;color:#a8a39d;font:22px/1 system-ui;cursor:pointer}' +
    '.ip-x:hover,.ip-x:focus-visible{color:#fff;outline:2px solid #66bb6a;outline-offset:-4px}' +
    '.ip .ip-full{display:inline-block;letter-spacing:.12em;text-transform:uppercase;margin-top:8px;font:700 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;text-decoration:none}' +
    '@media (max-width:640px){.ip-back{align-items:flex-end}.ip{width:100%;max-height:85vh;border-radius:14px 14px 0 0;border-bottom:0;transform:translateY(100%);padding:30px 20px 28px}.ip-back.ip-on .ip{transform:none}}' +
    '@media (prefers-reduced-motion:reduce){.ip-back,.ip{transition:none}}';
  var MENU_CSS = ".asj-info{position:relative;display:inline-block;text-transform:uppercase}.asj-info>summary{list-style:none;display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:#8f8a83;padding:4px 0;white-space:nowrap;-webkit-user-select:none;user-select:none}.asj-info>summary::-webkit-details-marker{display:none}.asj-info>summary::marker{content:''}.asj-info>summary::after{content:'';width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform .18s}.asj-info[open]>summary::after{transform:translateY(1px) rotate(225deg)}.asj-info>summary:hover,.asj-info>summary:focus-visible,.asj-info[open]>summary{color:#66bb6a;outline:none}.asj-info>summary:focus-visible{outline:2px solid #66bb6a;outline-offset:3px}.asj-info-menu{position:absolute;top:calc(100% + 8px);left:0;z-index:2000;min-width:180px;max-width:calc(100vw - 24px);display:flex;flex-direction:column;background:#161616;border:1px solid #2c2c2c;border-radius:4px;box-shadow:0 12px 32px rgba(0,0,0,.55);padding:6px 0;text-align:left}.asj-info-menu a,.asj-info-menu a:visited{display:block;padding:10px 16px;color:#cfcbc6;text-decoration:none;border:0;font:700 11px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}.asj-info-menu a:hover,.asj-info-menu a:focus-visible{background:#1f241f;color:#66bb6a;outline:none}.asj-info--right{margin-left:auto;padding-left:10px}.asj-info--right .asj-info-menu{left:auto;right:0}";
  if (!document.getElementById('asj-info-style')) { var ms = document.createElement('style'); ms.id = 'asj-info-style'; ms.textContent = MENU_CSS; (document.head || document.documentElement).appendChild(ms); }
  var cache = {}, back = null, lastFocus = null, openSlug = '';

  function load(slug) {
    if (cache[slug]) return Promise.resolve(cache[slug]);
    return fetch('/' + slug + '/', { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error(r.status); return r.text();
    }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var wrap = doc.querySelector('.wrap') || doc.body;
      var out = document.createElement('div');
      var started = false;
      Array.prototype.forEach.call(wrap.children, function (el) {
        if (el.tagName === 'H1') { started = true; return; }
        if (!started || el.tagName === 'FOOTER') return;
        var c = el.cloneNode(true);
        if (c.tagName === 'H2') { var h = document.createElement('h3'); h.innerHTML = c.innerHTML; c = h; }
        out.appendChild(c);
      });
      return (cache[slug] = out.innerHTML);
    });
  }

  function focusables() { return back ? back.querySelectorAll('a[href],button,[tabindex]:not([tabindex="-1"])') : []; }

  function close(fromPop) {
    if (!back) return;
    var b = back; back = null; openSlug = '';
    b.classList.remove('ip-on');
    setTimeout(function () { b.remove(); }, 200);
    document.removeEventListener('keydown', onKey, true);
    if (!fromPop && location.hash.slice(1) in PAGES) history.back();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
    if (e.key !== 'Tab') return;
    var f = focusables(); if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open(slug, push) {
    if (!(slug in PAGES)) return;
    if (openSlug === slug) return;
    if (back) close(true);
    if (!document.getElementById('ip-style')) { var st = document.createElement('style'); st.id = 'ip-style'; st.textContent = css; document.head.appendChild(st); }
    lastFocus = document.activeElement;
    openSlug = slug;
    back = document.createElement('div');
    back.className = 'ip-back';
    back.innerHTML = '<div class="ip" role="dialog" aria-modal="true" aria-labelledby="ip-title"><button class="ip-x" type="button" aria-label="Close">&times;</button>' +
      '<h2 id="ip-title">' + PAGES[slug] + '</h2><div class="ip-body"><p>Loading&hellip;</p></div></div>';
    document.body.appendChild(back);
    var b = back;
    requestAnimationFrame(function () { b.classList.add('ip-on'); });
    b.addEventListener('click', function (e) { if (e.target === b) close(false); });
    b.querySelector('.ip-x').addEventListener('click', function () { close(false); });
    document.addEventListener('keydown', onKey, true);
    b.querySelector('.ip-x').focus();
    if (push) history.pushState({ ip: slug }, '', '#' + slug);
    load(slug).then(function (html) {
      if (back !== b) return;
      b.querySelector('.ip-body').innerHTML = html + '<a class="ip-full" href="/' + slug + '/">Open as a page &rarr;</a>';
    }).catch(function () { location.href = '/' + slug + '/'; });
  }

  function closeMenus(except) {
    Array.prototype.forEach.call(document.querySelectorAll('details.asj-info[open]'), function (d) { if (d !== except) d.removeAttribute('open'); });
  }
  document.addEventListener('click', function (e) {
    closeMenus(e.target.closest && e.target.closest('details.asj-info:not([open]) summary') ? e.target.closest('details') : (e.target.closest && e.target.closest('summary') ? null : null));
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.closest('.ip')) return;
    var u; try { u = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
    var sameSite = u.origin === location.origin || /(^|\.)africanstreetjournal\.com$/.test(u.hostname);
    var m = sameSite && u.pathname.match(/^\/(about|privacy|contact|corrections|methods)\/?$/);
    if (!m || u.hash) return;
    if (location.pathname === '/' + m[1] + '/') return;
    e.preventDefault();
    open(m[1], true);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || back) return;
    var d = document.querySelector('details.asj-info[open]');
    if (d) { d.removeAttribute('open'); d.querySelector('summary').focus(); }
  });
  window.addEventListener('popstate', function () {
    var h = location.hash.slice(1);
    if (h in PAGES) open(h, false); else close(true);
  });
  var h0 = location.hash.slice(1);
  if (h0 in PAGES) open(h0, false);
}());

/* readability-v2: show ISO dates (2026-10-21) as "21 Oct 2026" in visible text only.
   Machine-readable values (datetime attrs, JSON-LD, URLs, inputs) are untouched. */
(function () {
  var M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var RE = /\b(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b(?!T)/g;
  function fix(s) { return s.replace(RE, function (_, y, m, d) { return (+d) + ' ' + M[+m - 1] + ' ' + y; }); }
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, CODE: 1, PRE: 1, NOSCRIPT: 1 };
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (RE.test(root.nodeValue)) { RE.lastIndex = 0; root.nodeValue = fix(root.nodeValue); } RE.lastIndex = 0; return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName]) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, list = [];
    while ((n = w.nextNode())) { var p = n.parentNode; if (p && !SKIP[p.nodeName] && /20\d\d-\d\d-\d\d/.test(n.nodeValue)) list.push(n); }
    list.forEach(function (t) { var v = fix(t.nodeValue); if (v !== t.nodeValue) t.nodeValue = v; });
  }
  function start() {
    walk(document.body);
    new MutationObserver(function (ms) { ms.forEach(function (m) { if (m.type === 'characterData') walk(m.target); else m.addedNodes.forEach(walk); }); })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}());

/* Follow-channel slot: WhatsApp / Telegram channel and email-digest links appear in every
   About menu only once a URL is set in data/channels.json. Empty values render nothing. */
(function () {
  'use strict';
  var LABELS = { whatsapp: 'WhatsApp channel', telegram: 'Telegram channel', email: 'Daily email' };
  function ok(u) { return typeof u === 'string' && /^https:\/\/[^\s"<>]+$/.test(u); }
  fetch('/data/channels.json', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (cfg) {
    var keys = Object.keys(LABELS).filter(function (k) { return ok(cfg && cfg[k]); });
    if (!keys.length) return;
    Array.prototype.forEach.call(document.querySelectorAll('.asj-info-menu'), function (menu) {
      keys.forEach(function (k) {
        var a = document.createElement('a');
        a.href = cfg[k]; a.target = '_blank'; a.rel = 'noopener'; a.textContent = LABELS[k]; a.dataset.channel = k;
        menu.appendChild(a);
      });
    });
  }).catch(function () {});
})();
