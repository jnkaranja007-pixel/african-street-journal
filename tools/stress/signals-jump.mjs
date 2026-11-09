// Signals section links on phones: each one must bring its section up under the link row,
// and keep it there, on an iPhone (WebKit) as well as on Android (Chromium). Taps are real
// touch taps, so anything covering the row or moving the page afterwards shows up.
// Run: npx -y playwright@1 install --with-deps chromium webkit && node tools/stress/signals-jump.mjs
// Serves the repo itself, so it tests exactly what would deploy. ASCII only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = await import('playwright'); }

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

// Where a section sits against the bottom of the link row, and whether the view can go
// any further down (the last section can stop lower when the page runs out).
const MEASURE = id => {
  const cv = document.getElementById('country-view');
  const nav = document.querySelector('#cv-panel-signals .cv-panel-body > .cv-jump');
  const s = document.getElementById(id);
  if (!cv || !nav || !s) return null;
  return {
    gap: Math.round(s.getBoundingClientRect().top - nav.getBoundingClientRect().bottom),
    top: Math.round(cv.scrollTop),
    atEnd: cv.scrollTop >= cv.scrollHeight - cv.clientHeight - 2,
    visible: s.getBoundingClientRect().top < innerHeight - 40
  };
};

const runs = [
  ['webkit', 'iPhone 13'], ['webkit', 'iPhone SE'],
  ['chromium', 'Pixel 7'], ['chromium', 'Galaxy S9+']
];
for (const [engine, device] of runs) {
  const browser = await pw[engine].launch();
  for (const country of ['ke', 'ng', 'gh']) {
    const ctx = await browser.newContext({ ...pw.devices[device] });
    await ctx.route(/cloudflareinsights|googleapis|gstatic|supabase|open\.er-api|open-meteo|flagcdn|worldbank/, r => r.abort());
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(String(e)));
    await pg.goto(BASE + '#/' + country + '/farmers', { waitUntil: 'load' }); await pg.waitForTimeout(2500);
    for (const mode of ['farmers', 'investors', 'diaspora']) {
      await pg.locator('.cv-audience-tab[data-audience="' + mode + '"]').tap();
      await pg.waitForTimeout(500);
      const buttons = await pg.$$eval('#cv-panel-signals .cv-jump:not([hidden]) [data-jump]', bs => bs.map(b => ({ id: b.dataset.jump, label: b.textContent })));
      for (const from of ['top', 'here']) {
        for (const b of buttons) {
          if (from === 'top') await pg.evaluate(() => { document.getElementById('country-view').scrollTop = 0; });
          await pg.waitForTimeout(200);
          await pg.locator('#cv-panel-signals .cv-jump [data-jump="' + b.id + '"]').tap();
          const now = await pg.evaluate(MEASURE, b.id);
          await pg.waitForTimeout(1500);
          const later = await pg.evaluate(MEASURE, b.id);
          const tag = device + ' ' + country + ' ' + mode + ' "' + b.label + '" from ' + from;
          console.log(tag + ': gap ' + (now && now.gap) + ' -> ' + (later && later.gap) + ', scrollTop ' + (now && now.top) + ' -> ' + (later && later.top));
          if (!later) { fail(tag + ': section or link row missing'); continue; }
          const landed = later.gap >= -4 && later.gap <= 40;
          if (!landed && !(later.atEnd && later.visible && later.gap > 0)) fail(tag + ': section is ' + later.gap + 'px from the link row');
        }
      }
    }
    errs.forEach(e => fail(device + ' ' + country + ' page error: ' + e));
    await ctx.close();
  }
  await browser.close();
}
server.close();
console.log(fails.length ? fails.length + ' failure(s)' : 'signals-jump: all passed');
process.exit(fails.length ? 1 : 0);
