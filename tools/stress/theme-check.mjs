// Light and dark themes, checked the way a reader sees them, plus guards on what already
// works and must keep working.
//   - every piece of visible text meets WCAG AA contrast against what is behind it
//     (4.5:1, or 3:1 for large text), in both themes, on the front page, the Wire, a
//     country's News, Signals and Atlas, and the story reader;
//   - in the light theme no large panel is left dark (the atlas legend shipped dark-on-
//     light on 11 Nov 2026 and was unreadable on an iPhone);
//   - no page errors;
//   - the service worker still registers, so repeat visits paint from cache;
//   - story pages keep their search and share tags (NewsArticle and BreadcrumbList
//     JSON-LD, canonical, og:image, twitter card).
// Run: npx -y playwright@1 install --with-deps chromium && node tools/stress/theme-check.mjs
// Serves the repo itself, so it tests exactly what would deploy. ASCII only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.xml':'application/xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const BASE = 'http://127.0.0.1:' + server.address().port + '/';
const fails = [];
const fail = m => { fails.push(m); console.log('FAIL ' + m); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// Text whose contrast with its background is under AA. Map plates, heat tiles and
// anything aria-hidden are pictures, not text, and are skipped.
const CONTRAST = () => {
  const parse = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r:p[0], g:p[1], b:p[2], a:p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = el => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null;
      if (/gradient/.test(cs.backgroundImage)) { const g = cs.backgroundImage.match(/rgba?\([^)]+\)/); if (g) { layers.push(parse(g[0])); if (parse(g[0]).a >= 1) break; } }
      const c = parse(cs.backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) || { r:0, g:0, b:0, a:1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const out = [];
  document.querySelectorAll('body *').forEach(el => {
    if (el.closest('svg,canvas,[aria-hidden="true"],.cv-heat-tile,.asj-kit-map')) return;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) return;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight * 3) return;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.5) return;
    for (let n = el; n; n = n.parentElement) { const c2 = getComputedStyle(n); if (+c2.opacity < 0.5 || c2.display === 'none') return; }
    const bg = bgOf(el); if (!bg) return;
    const fg0 = parse(cs.color); if (!fg0) return;
    const fg = over(fg0, bg);
    const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 600;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    if (ratio < need - 0.05) out.push({ sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].join('.') : ''), text: el.textContent.trim().slice(0, 30), ratio: Math.round(ratio * 100) / 100, need, color: cs.color });
  });
  const seen = {}; return out.filter(o => { const k = o.sel + o.ratio; if (seen[k]) return false; seen[k] = 1; return true; });
};

// Light theme only: large boxes painted near-black.
const DARK_PANELS = () => {
  const out = [];
  const parse = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r:p[0], g:p[1], b:p[2], a:p.length > 3 ? p[3] : 1 }; };
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect(); if (r.width * r.height < 15000) return;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (el.closest('.cv-heat,.cv-heat-wrap,canvas,svg')) return;
    let c = parse(cs.backgroundColor);
    const g = /gradient/.test(cs.backgroundImage) && cs.backgroundImage.match(/rgba?\([^)]+\)/); if (g) c = parse(g[0]);
    if (!c || c.a < 0.85) return;
    if ((0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255 < 0.3) out.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].join('.') : ''));
  });
  return out;
};

const browser = await chromium.launch();
for (const theme of ['light', 'dark']) {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const tag = theme + ' ' + w + 'px';
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 700, hasTouch: w < 700, colorScheme: theme });
    await ctx.route(/cloudflareinsights|googleapis|gstatic|supabase|open\.er-api/, r => r.abort());
    await ctx.addInitScript(t => { try { localStorage.setItem('asj:theme', t); } catch (e) {} }, theme);
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(String(e)));
    await pg.goto(BASE, { waitUntil: 'load' }); await wait(2500);
    const got = await pg.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (got !== theme) fail(tag + ': page came up ' + got);
    let n = 0;
    const check = async where => {
      const bad = await pg.evaluate(CONTRAST);
      for (const b of bad.slice(0, 6)) fail(tag + ' ' + where + ': ' + b.sel + ' "' + b.text + '" ' + b.ratio + ':1, needs ' + b.need);
      n += bad.length;
      if (theme === 'light') for (const d of (await pg.evaluate(DARK_PANELS)).slice(0, 4)) { fail(tag + ' ' + where + ': dark panel ' + d); n++; }
    };
    await check('front page');
    await pg.evaluate(() => document.getElementById('wire-entry').click()); await wait(900);
    await check('Wire');
    // Compare countries, with its bars, colour swatches and story columns.
    await pg.evaluate(() => document.getElementById('wire-compare-toggle').click()); await wait(500);
    const cmp = await pg.evaluate(() => ({ cards: document.querySelectorAll('#wire-compare-panel .cmp-card').length, stories: document.querySelectorAll('#wire-compare-panel .cmp-story').length }));
    if (cmp.cards < 6 || !cmp.stories) fail(tag + ': Compare countries drew ' + cmp.cards + ' figure cards and ' + cmp.stories + ' stories');
    await check('Wire compare');
    await pg.evaluate(() => document.getElementById('wire-compare-toggle').click());
    await pg.evaluate(() => document.getElementById('wire-close').click()); await wait(400);
    await pg.evaluate(() => openCountry('ke')); await wait(1500);
    for (const [i, name] of [[0, 'News'], [1, 'Signals'], [2, 'Atlas']]) {
      await pg.evaluate(i => { document.querySelector('.cv-dot[data-panel="' + i + '"]').click(); }, i); await wait(1200);
      await pg.evaluate(() => document.querySelectorAll('#cv-panel-signals .cv-fold:not(.is-open) .cv-fold-btn').forEach(b => b.click())); await wait(400);
      await check('Kenya ' + name);
    }
    await pg.evaluate(() => { const k = Object.keys(AI_BRIEFS).find(c => (AI_BRIEFS[c] || []).length); openStoryReader(AI_BRIEFS[k][0], { countryCode:k, country:k, rank:0 }, document.body); }); await wait(1200);
    await check('story reader');
    if (errs.length) fail(tag + ': page errors: ' + errs.slice(0, 3).join(' | '));
    console.log((n ? 'FAIL ' : 'PASS ') + tag + ': ' + n + ' problem(s)');
    await ctx.close();
  }
}

// The service worker still registers, so repeat visits paint from cache.
{
  const ctx = await browser.newContext();
  const pg = await ctx.newPage();
  await pg.goto(BASE, { waitUntil: 'load' });
  const ok = await pg.evaluate(() => !('serviceWorker' in navigator) ? 'no api' : Promise.race([navigator.serviceWorker.ready.then(() => 'ok'), new Promise(res => setTimeout(() => res('timeout'), 8000))]));
  if (ok !== 'ok') fail('service worker did not become ready: ' + ok); else console.log('PASS service worker ready');
  await ctx.close();
}
await browser.close();
server.close();

// Story pages keep their search and share tags. The desk publishes them, so a fresh
// clone may hold none; then there is nothing to guard.
const pages = [];
for (const cc of fs.readdirSync(root).filter(d => /^[a-z]{2}$/.test(d) && fs.statSync(path.join(root, d)).isDirectory())) {
  for (const s of fs.readdirSync(path.join(root, cc))) {
    const f = path.join(root, cc, s, 'index.html');
    // A story whose headline was corrected keeps its old address as a redirect stub
    // (meta refresh to the new slug); that stub has no tags to guard.
    if (fs.existsSync(f) && !/http-equiv="refresh"/i.test(fs.readFileSync(f, 'utf8'))) { pages.push(f); break; }
  }
  if (pages.length >= 12) break;
}
for (const f of pages) {
  const html = fs.readFileSync(f, 'utf8');
  const name = path.relative(root, f);
  for (const [what, re] of [['NewsArticle JSON-LD', /"@type"\s*:\s*"NewsArticle"/], ['BreadcrumbList JSON-LD', /"@type"\s*:\s*"BreadcrumbList"/], ['canonical', /<link rel="canonical" href="https:\/\/[^"]+"/], ['og:image', /property="og:image" content="https:\/\/[^"]+"/], ['twitter card', /name="twitter:card" content="summary_large_image"/]]) {
    if (!re.test(html)) fail(name + ': missing ' + what);
  }
}
console.log((pages.length ? 'PASS ' : 'SKIP ') + pages.length + ' story pages checked for search and share tags');

if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1); }
console.log('OK - both themes readable, guards hold');
