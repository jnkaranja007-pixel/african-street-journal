/* About / Privacy / Contact / Corrections open in a small in-site sheet instead of
   navigating away. The links stay real hrefs (/about/ etc.), so without JavaScript, or
   with a modifier-click, they still go to the standalone pages. Deep-linkable: #about. */
(function () {
  'use strict';
  var PAGES = { about: 'About', privacy: 'Privacy', contact: 'Contact', corrections: 'Corrections' };
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
    var m = sameSite && u.pathname.match(/^\/(about|privacy|contact|corrections)\/?$/);
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
