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

/* follow-v1: the paper's accounts as one compact row at the foot of every About menu.
   Handles match data/social-config.js (which also feeds the static footers and sameAs). */
(function () {
  'use strict';
  var LINKS = [
    ['X', 'https://x.com/thestreetafrica'],
    ['Instagram', 'https://www.instagram.com/theafricanstreetjournal/'],
    ['YouTube', 'https://www.youtube.com/@theafricanstreetjournal']
  ];
  function add() {
    if (!document.getElementById('asj-follow-style')) {
      var st = document.createElement('style');
      st.id = 'asj-follow-style';
      st.textContent = '.asj-info-menu .asj-follow{display:grid;grid-template-columns:repeat(3,max-content);align-items:center;gap:0;margin:4px 0 0;padding:12px 8px 0 16px;border-top:1px solid var(--c-2c2c2c,var(--rule,#2c2c2c))}' +
        '.asj-info-menu .asj-follow span{grid-column:1 / -1;margin:0 0 2px;color:var(--c-8f8a83,var(--text-dim,#8f8a83));font:700 10px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase}' +
        '.asj-info-menu .asj-follow a,.asj-info-menu .asj-follow a:visited{display:inline-flex;align-items:center;min-height:44px;padding:0 14px 0 0!important;letter-spacing:.06em!important;white-space:nowrap}';
      (document.head || document.documentElement).appendChild(st);
    }
    Array.prototype.forEach.call(document.querySelectorAll('.asj-info-menu'), function (menu) {
      if (menu.querySelector('.asj-follow')) return;
      var row = document.createElement('div');
      row.className = 'asj-follow';
      var label = document.createElement('span');
      label.textContent = 'Follow';
      row.appendChild(label);
      LINKS.forEach(function (l) {
        var a = document.createElement('a');
        a.href = l[1]; a.target = '_blank'; a.rel = 'me noopener'; a.textContent = l[0];
        a.setAttribute('aria-label', 'Follow The African Street Journal on ' + l[0]);
        row.appendChild(a);
      });
      menu.appendChild(row);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
}());
