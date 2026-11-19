/* About / Privacy / Contact / Corrections open in a small in-site sheet instead of
   navigating away. The links stay real hrefs (/about/ etc.), so without JavaScript, or
   with a modifier-click, they still go to the standalone pages. Deep-linkable: #about. */
(function () {
  'use strict';
  var PAGES = { about: 'About', privacy: 'Privacy', contact: 'Contact', corrections: 'Corrections', methods: 'How we check our figures' };
  var css = '.ip-back{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .18s}' +
    '.ip-back.ip-on{opacity:1}' +
    '.ip{position:relative;width:min(560px,calc(100vw - 32px));max-height:min(80vh,720px);overflow:auto;background:var(--c-161616,var(--surface,#171717));border:1px solid var(--c-2a2a2a,var(--rule,#2a2a2a));color:var(--c-e8e6e3,var(--text,#e8e6e3));padding:28px 28px 24px;box-shadow:0 24px 64px rgba(0,0,0,.5);transform:translateY(8px);transition:transform .2s;font:15.5px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left}' +
    '.ip-back.ip-on .ip{transform:none}' +
    '.ip h2{margin:0 0 14px;font:700 30px/1.1 "Playfair Display",Georgia,serif;color:var(--c-f2f0ed,var(--text,#f2f0ed))}' +
    '.ip h3{margin:20px 0 6px;font:700 18px/1.3 "Playfair Display",Georgia,serif;color:var(--c-f2f0ed,var(--text,#f2f0ed))}' +
    '.ip *{text-transform:none;letter-spacing:normal}.ip p,.ip li{font:inherit;color:var(--c-c9c5c0,var(--text-body,#c9c5c0));margin:0 0 10px}.ip ul{padding-left:20px;margin:0 0 10px}.ip a{color:var(--c-66bb6a,var(--green-bright,#66bb6a))}' +
    '.ip-x{position:absolute;top:10px;right:10px;width:40px;height:40px;border:0;background:none;color:var(--c-a8a39d,var(--text-muted,#a8a39d));font:22px/1 system-ui;cursor:pointer}' +
    '.ip-x:hover,.ip-x:focus-visible{color:var(--c-f2f0ed,var(--text,#fff));outline:2px solid var(--c-66bb6a,var(--green-bright,#66bb6a));outline-offset:-4px}' +
    '.ip .ip-full{display:inline-block;letter-spacing:.12em;text-transform:uppercase;margin-top:8px;font:700 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;text-decoration:none}' +
    '@media (max-width:640px){.ip-back{align-items:flex-end}.ip{width:100%;max-height:85vh;border-radius:14px 14px 0 0;border-bottom:0;transform:translateY(100%);padding:30px 20px 28px}.ip-back.ip-on .ip{transform:none}}' +
    '@media (prefers-reduced-motion:reduce){.ip-back,.ip{transition:none}}';
  var MENU_CSS = ".asj-info{position:relative;display:inline-block;text-transform:uppercase}.asj-info>summary{list-style:none;display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:max(12px,1em);min-height:32px;color:var(--c-8f8a83,var(--text-dim,#8f8a83));padding:4px 0;white-space:nowrap;-webkit-user-select:none;user-select:none}.asj-info>summary::-webkit-details-marker{display:none}.asj-info>summary::marker{content:''}.asj-info>summary::after{content:'';width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform .18s}.asj-info[open]>summary::after{transform:translateY(1px) rotate(225deg)}.asj-info>summary:hover,.asj-info>summary:focus-visible,.asj-info[open]>summary{color:var(--c-66bb6a,var(--green-bright,#66bb6a));outline:none}.asj-info>summary:focus-visible{outline:2px solid var(--c-66bb6a,var(--green-bright,#66bb6a));outline-offset:3px}.asj-info-menu{position:absolute;top:calc(100% + 8px);left:0;z-index:2000;min-width:180px;max-width:calc(100vw - 24px);display:flex;flex-direction:column;background:var(--c-161616,var(--surface,#161616));border:1px solid var(--c-2c2c2c,var(--rule,#2c2c2c));border-radius:4px;box-shadow:0 12px 32px rgba(0,0,0,.55);padding:6px 0;text-align:left}.asj-info-menu a,.asj-info-menu a:visited{display:block;padding:14px 16px;color:var(--c-cfcbc6,var(--text-muted,#cfcbc6));text-decoration:none;border:0;font:700 12px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}.asj-info-menu a:hover,.asj-info-menu a:focus-visible{background:var(--c-1f241f,var(--surface-raised,#1f241f));color:var(--c-66bb6a,var(--green-bright,#66bb6a));outline:none}.asj-info--right{margin-left:auto;padding-left:10px}.asj-info--right .asj-info-menu{left:auto;right:0}";
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
        menu.insertBefore(a, menu.querySelector('.asj-theme'));
      });
    });
  }).catch(function () {});
})();

/* theme-v1: a Light / Dark switch at the end of every About menu. The page head sets
   data-theme before first paint (the reader's choice in localStorage asj:theme, or light by
   default); this only changes it and remembers the choice. Pages that draw on a
   canvas (the home map) listen for asj:themechange and repaint. */
(function () {
  'use strict';
  var KEY = 'asj:theme';
  function current() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function label(btn) {
    var next = current() === 'light' ? 'dark' : 'light';
    btn.textContent = next === 'light' ? 'Light theme' : 'Dark theme';
    btn.setAttribute('aria-label', 'Switch to the ' + next + ' theme');
  }
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f5f2eb' : '#131313');
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    Array.prototype.forEach.call(document.querySelectorAll('.asj-theme'), label);
    try { window.dispatchEvent(new CustomEvent('asj:themechange', { detail: { theme: theme } })); } catch (e) {}
  }
  function add() {
    if (!document.getElementById('asj-theme-style')) {
      var st = document.createElement('style');
      st.id = 'asj-theme-style';
      st.textContent = '.asj-info-menu .asj-theme{display:block;width:100%;padding:14px 16px;margin:4px 0 0;border:0;border-top:1px solid var(--c-2c2c2c,var(--rule,#2c2c2c));background:none;color:var(--c-cfcbc6,var(--text-muted,#cfcbc6));text-align:left;cursor:pointer;font:700 12px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}' +
        '.asj-info-menu .asj-theme:hover,.asj-info-menu .asj-theme:focus-visible{background:var(--c-1f241f,var(--surface-raised,#1f241f));color:var(--c-66bb6a,var(--green-bright,#66bb6a));outline:none}';
      (document.head || document.documentElement).appendChild(st);
    }
    Array.prototype.forEach.call(document.querySelectorAll('.asj-info-menu'), function (menu) {
      if (menu.querySelector('.asj-theme')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'asj-theme';
      label(b);
      b.addEventListener('click', function (e) {
        e.preventDefault();
        apply(current() === 'light' ? 'dark' : 'light');
      });
      menu.appendChild(b);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
}());

/* report-v1: the site has no server to send errors to, so it keeps the last few script
   errors on the reader's own device (localStorage asj:errors, never sent anywhere by
   itself) and adds "Report a problem" to every About menu. That opens the reader's mail
   app with the page address, the site version, the browser and those errors filled in;
   the reader sees everything before choosing to send it. */
(function () {
  'use strict';
  var KEY = 'asj:errors';
  var MAX = 8;
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } }
  function note(message, where) {
    message = String(message || '').slice(0, 200);
    if (!message) return;
    try {
      var list = read();
      var last = list[list.length - 1];
      if (last && last.m === message) { last.n = (last.n || 1) + 1; last.t = new Date().toISOString(); }
      else list.push({ t: new Date().toISOString(), m: message, w: String(where || '').slice(0, 120), p: location.pathname + location.search.slice(0, 60) });
      localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
    } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    if (!e || !e.message) return;
    note(e.message, (e.filename || '').replace(location.origin, '') + ':' + (e.lineno || 0) + ':' + (e.colno || 0));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    note('Unhandled: ' + (r && (r.message || r.name) || String(r)), r && r.stack ? String(r.stack).split('\n')[1] : '');
  });
  function version() {
    if (window.ASJ_ASSET_VERSION) return 'v' + window.ASJ_ASSET_VERSION;
    var s = document.querySelector('script[src*="info-panel.js"]');
    var m = s && /[?&]v=([\w.]+)/.exec(s.getAttribute('src') || '');
    return m ? 'info-panel v' + m[1] : 'unknown';
  }
  function body() {
    var theme = document.documentElement.getAttribute('data-theme') || '';
    var lines = [
      'What went wrong (what you did, what you expected, what happened):',
      '', '', '',
      '--- Filled in by the site; delete anything you would rather not send ---',
      'Page: ' + location.href.split('#')[0].slice(0, 200) + (location.hash ? location.hash.slice(0, 40) : ''),
      'Version: ' + version(),
      'Screen: ' + window.innerWidth + 'x' + window.innerHeight + ' @' + (window.devicePixelRatio || 1) + ', ' + theme + ' theme',
      'Browser: ' + navigator.userAgent.slice(0, 180),
      'Time: ' + new Date().toISOString()
    ];
    var errs = read();
    lines.push(errs.length ? 'Recent errors on this device:' : 'Recent errors on this device: none');
    errs.slice(-5).forEach(function (x) { lines.push('- ' + x.t.slice(0, 16) + ' ' + x.m + (x.n > 1 ? ' (x' + x.n + ')' : '') + (x.w ? ' @ ' + x.w : '') + ' on ' + x.p); });
    return lines.join('\n');
  }
  function add() {
    Array.prototype.forEach.call(document.querySelectorAll('.asj-info-menu'), function (menu) {
      if (menu.querySelector('.asj-report')) return;
      var a = document.createElement('a');
      a.className = 'asj-report';
      a.href = 'mailto:hello@africanstreetjournal.com';
      a.textContent = 'Report a problem';
      a.addEventListener('click', function () {
        a.href = 'mailto:hello@africanstreetjournal.com?subject=' + encodeURIComponent('Problem on the site (' + version() + ')') + '&body=' + encodeURIComponent(body());
      });
      menu.insertBefore(a, menu.querySelector('.asj-theme'));
    });
  }
  window.ASJ_ERRORS = { list: read, clear: function () { try { localStorage.removeItem(KEY); } catch (e) {} } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
}());

/* menu-v2 (19 Nov 2026): the About menu as a compact panel, the same on every page.
   The site links sit in two columns, "Report a problem" and the theme switch share a
   row, and the paper's accounts are one row of icons. Sentence case throughout, and
   the panel scrolls rather than running off the screen if it ever grows.
   Icons: Simple Icons (CC0). Handles match data/social-config.js, which also feeds the
   static footers and sameAs. */
(function () {
  'use strict';
  var LINKS = [
    ['WhatsApp', 'whatsapp', 'https://whatsapp.com/channel/0029Vb9FDpiCRs1xMjnqBy3Q'],
    ['Telegram', 'telegram', 'https://t.me/theafricanstreetjournal'],
    ['X', 'x', 'https://x.com/thestreetafrica'],
    ['Instagram', 'instagram', 'https://www.instagram.com/theafricanstreetjournal/'],
    ['YouTube', 'youtube', 'https://www.youtube.com/@theafricanstreetjournal']
  ];
  var ICONS = {
    whatsapp: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z',
    telegram: 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
    x: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
    instagram: 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
    youtube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z'
  };
  var RULE = 'var(--c-2c2c2c,var(--rule,#2c2c2c))';
  var INK = 'var(--c-e8e6e3,var(--text,#e8e6e3))';
  var MUTED = 'var(--c-8f8a83,var(--text-dim,#8f8a83))';
  var HOVER_BG = 'var(--c-1f241f,var(--surface-raised,#1f241f))';
  var GREEN = 'var(--c-66bb6a,var(--green-bright,#66bb6a))';
  var SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";
  var CSS =
    '.asj-info .asj-info-menu{display:grid!important;grid-template-columns:1fr 1fr;gap:2px 4px;width:min(320px,calc(100vw - 24px));min-width:0!important;max-height:calc(100vh - 96px);overflow:auto;padding:8px!important;border-radius:12px!important;text-transform:none!important}' +
    '.asj-info .asj-info-menu>a,.asj-info .asj-info-menu>a:visited,.asj-info .asj-info-menu>.asj-theme{display:flex!important;align-items:center;min-height:42px;margin:0!important;padding:0 10px!important;border:0!important;border-radius:8px;background:none;color:' + INK + '!important;font:500 15px/1.25 ' + SANS + '!important;letter-spacing:0!important;text-transform:none!important;white-space:normal!important;text-align:left;width:auto!important;cursor:pointer}' +
    '.asj-info .asj-info-menu>a:hover,.asj-info .asj-info-menu>a:focus-visible,.asj-info .asj-info-menu>.asj-theme:hover,.asj-info .asj-info-menu>.asj-theme:focus-visible{background:' + HOVER_BG + '!important;color:' + GREEN + '!important;outline:none}' +
    '.asj-info .asj-info-menu>.asj-report{grid-column:1;position:relative;margin-top:9px!important;color:' + MUTED + '!important;font-size:14px!important}' +
    '.asj-info .asj-info-menu>.asj-theme{grid-column:2;margin-top:9px!important;color:' + MUTED + '!important;font-size:14px!important}' +
    '.asj-info .asj-info-menu>.asj-report::before{content:"";position:absolute;left:0;right:-200%;top:-6px;border-top:1px solid ' + RULE + '}' +
    '.asj-info .asj-info-menu>.asj-follow{grid-column:1 / -1;display:flex!important;align-items:center;gap:2px;margin:6px 0 0!important;padding:8px 2px 0 10px!important;border-top:1px solid ' + RULE + '}' +
    '.asj-info .asj-info-menu .asj-follow span{margin-right:auto;color:' + MUTED + ';font:500 14px/1 ' + SANS + ';letter-spacing:0;text-transform:none}' +
    '.asj-info .asj-info-menu .asj-follow a,.asj-info .asj-info-menu .asj-follow a:visited{display:inline-flex!important;align-items:center;justify-content:center;width:40px;height:40px;min-height:0!important;padding:0!important;border-radius:50%;color:' + MUTED + '!important}' +
    '.asj-info .asj-info-menu .asj-follow a:hover,.asj-info .asj-info-menu .asj-follow a:focus-visible{background:' + HOVER_BG + ';color:' + GREEN + '!important;outline:none}' +
    '.asj-info .asj-info-menu .asj-follow svg{width:19px;height:19px;fill:currentColor}';
  function add() {
    var old = document.getElementById('asj-follow-style'); if (old) old.remove();
    var st = document.getElementById('asj-menu-v2');
    if (!st) { st = document.createElement('style'); st.id = 'asj-menu-v2'; st.textContent = CSS; }
    // Last in the head, so it wins over the page's own menu rules and the theme switch's.
    (document.head || document.documentElement).appendChild(st);
    Array.prototype.forEach.call(document.querySelectorAll('.asj-info-menu'), function (menu) {
      if (menu.querySelector('.asj-follow')) return;
      var row = document.createElement('div');
      row.className = 'asj-follow';
      var label = document.createElement('span');
      label.textContent = 'Follow';
      row.appendChild(label);
      LINKS.forEach(function (l) {
        var a = document.createElement('a');
        a.href = l[2]; a.target = '_blank'; a.rel = 'me noopener';
        a.title = l[0];
        a.setAttribute('aria-label', 'Follow The African Street Journal on ' + l[0]);
        a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + ICONS[l[1]] + '"/></svg>';
        row.appendChild(a);
      });
      menu.appendChild(row);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
}());

// Language editions (v143). On a French page, the menu items this file adds are given
// in French. On an English page, the menu gains a link to the French edition: to the
// same story or country in French when that page exists, otherwise to /fr/. A story page
// with a French twin also says so under its byline.
(function () {
  var lang = (document.documentElement.getAttribute('lang') || 'en').slice(0, 2);
  var FR = { 'Report a problem': 'Signaler un probl\u00e8me', 'Dark theme': 'Th\u00e8me sombre', 'Light theme': 'Th\u00e8me clair', 'Follow': 'Suivre' };
  function relabel() {
    Array.prototype.forEach.call(document.querySelectorAll('.asj-info-menu a, .asj-info-menu button, .asj-info-menu span'), function (el) {
      if (el.children.length) return;
      var t = (el.textContent || '').trim();
      if (FR[t]) el.textContent = FR[t];
    });
  }
  function frenchLink(href) {
    Array.prototype.forEach.call(document.querySelectorAll('.asj-info-menu'), function (menu) {
      var a = menu.querySelector('a.asj-lang-fr');
      if (!a) {
        a = document.createElement('a');
        a.className = 'asj-lang-fr'; a.lang = 'fr'; a.hreflang = 'fr'; a.textContent = 'Fran\u00e7ais';
        menu.insertBefore(a, menu.querySelector('.asj-report') || menu.querySelector('.asj-theme'));
      }
      a.href = href;
    });
  }
  function start() {
    if (lang === 'fr') {
      relabel();
      document.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('.asj-theme')) setTimeout(relabel, 0); });
      return;
    }
    if (lang !== 'en') return;
    frenchLink('/fr/');
    var path = location.pathname;
    if (!/^\/[a-z]{2}\/([a-z0-9-]+\/)?$/.test(path) || path.indexOf('/fr/') === 0) return;
    var c = navigator.connection;
    if (c && c.saveData) return;
    fetch('/fr' + path, { method: 'HEAD', credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) return;
      frenchLink('/fr' + path);
      var by = document.querySelector('article.story .byline');
      if (by && !document.querySelector('.asj-lang-note')) {
        var p = document.createElement('p');
        p.className = 'meta asj-lang-note'; p.lang = 'fr';
        var l = document.createElement('a'); l.href = '/fr' + path; l.hreflang = 'fr'; l.textContent = 'Lire en fran\u00e7ais \u2192';
        p.appendChild(l); by.parentNode.insertBefore(p, by.nextSibling);
      }
    }).catch(function () {});
  }
  function later() { setTimeout(start, 0); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later); else later();
}());
