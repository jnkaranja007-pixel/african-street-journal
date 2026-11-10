// Signals section links on phones: each one must bring its section up under the link row,
// uncovered, and keep it there, on iPhones (WebKit) as well as on Android (Chromium). Taps
// are real touch taps, so anything covering the row or moving the page afterwards shows up.
// Three ways it went wrong on a real iPhone, each checked here:
//   - the last sections (Investors' Exchange and Indicators) are short, and on a tall
//     phone the page ran out before they reached the row: every link must land, the last
//     one included, on every device;
//   - parts of the page arrive after the tap and Safari does not hold the view on what
//     the reader was looking at: a block added above the section after the tap, and
//     exchange prices that arrive two seconds late, must not move it;
//   - web fonts are left to load, so text wraps as it does on a phone.
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
const wait = ms => new Promise(r => setTimeout(r, ms));

// Where a section sits against the bottom of the link row, and whether anything (a sticky
// header, the row itself) is drawn over its heading.
const MEASURE = id => {
  const cv = document.getElementById('country-view');
  const nav = document.querySelector('#cv-panel-signals .cv-panel-body > .cv-jump');
  const s = document.getElementById(id);
  const h = s && s.querySelector('.cv-section-head h4');
  if (!cv || !nav || !s || !h) return null;
  const r = h.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + Math.min(20, r.width / 2), r.top + r.height / 2);
  const covered = hit && s.contains(hit) ? ''
    : hit ? hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : hit.className ? '.' + String(hit.className).split(' ')[0] : '')
    : 'off screen';
  return { gap: Math.round(s.getBoundingClientRect().top - nav.getBoundingClientRect().bottom), top: Math.round(cv.scrollTop), covered };
};

const check = (tag, now, later) => {
  console.log(tag + ': gap ' + (now && now.gap) + ' -> ' + (later && later.gap) + ', scrollTop ' + (now && now.top) + ' -> ' + (later && later.top) + (later && later.covered ? ', heading under ' + later.covered : ''));
  if (!later) return fail(tag + ': section or link row missing');
  if (later.gap < -4 || later.gap > 40) fail(tag + ': section is ' + later.gap + 'px from the link row');
  else if (later.covered) fail(tag + ': heading is covered by ' + later.covered);
};

const tapLink = (pg, id) => pg.locator('#cv-panel-signals .cv-jump [data-jump="' + id + '"]').tap();
const linksNow = pg => pg.$$eval('#cv-panel-signals .cv-jump:not([hidden]) [data-jump]', bs => bs.map(b => ({ id: b.dataset.jump, label: b.textContent })));

async function runDevice(engine, device) {
  if (!pw.devices[device]) return fail('Playwright has no device profile named ' + device);
  const browser = await pw[engine].launch();
  for (const country of ['ke', 'ng', 'gh']) {
    const ctx = await browser.newContext({ ...pw.devices[device] });
    await ctx.route(/cloudflareinsights|supabase|open\.er-api|open-meteo|flagcdn|worldbank/, r => r.abort());
    // Exchange prices two seconds late, as on a slow phone connection.
    await ctx.route(/data\/markets\.json/, async r => { await wait(2000); await r.continue(); });
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(String(e)));
    await pg.goto(BASE + '#/' + country + '/investors', { waitUntil: 'load' });
    await pg.waitForSelector('#cv-panel-signals .cv-jump:not([hidden]) [data-jump]', { timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(300);

    // Late data: tap the last investor link before the prices arrive.
    const first = await linksNow(pg);
    const last = first[first.length - 1];
    if (last) {
      await tapLink(pg, last.id);
      const now = await pg.evaluate(MEASURE, last.id);
      await pg.waitForTimeout(2600);
      check(device + ' ' + country + ' investors "' + last.label + '" before prices load', now, await pg.evaluate(MEASURE, last.id));
    } else fail(device + ' ' + country + ': no investor links on open');

    for (const mode of ['farmers', 'investors', 'diaspora']) {
      await pg.locator('.cv-audience-tab[data-audience="' + mode + '"]').tap();
      await pg.waitForTimeout(500);
      const buttons = await linksNow(pg);
      for (const from of ['top', 'here']) {
        for (const b of buttons) {
          if (from === 'top') await pg.evaluate(() => { document.getElementById('country-view').scrollTop = 0; });
          await pg.waitForTimeout(200);
          await tapLink(pg, b.id);
          const now = await pg.evaluate(MEASURE, b.id);
          await pg.waitForTimeout(1000);
          const tag = device + ' ' + country + ' ' + mode + ' "' + b.label + '" from ' + from;
          check(tag, now, await pg.evaluate(MEASURE, b.id));
          if (from !== 'top') continue;
          // Something above the section grows after the tap, then goes away again.
          await pg.evaluate(() => {
            const block = document.createElement('div');
            block.id = 'signals-jump-late-block';
            block.style.height = '280px';
            document.getElementById('cv-glance').prepend(block);
          });
          await pg.waitForTimeout(600);
          check(tag + ', 280px added above', null, await pg.evaluate(MEASURE, b.id));
          await pg.evaluate(() => document.getElementById('signals-jump-late-block')?.remove());
          await pg.waitForTimeout(600);
          check(tag + ', then removed', null, await pg.evaluate(MEASURE, b.id));
        }
      }
    }
    errs.forEach(e => fail(device + ' ' + country + ' page error: ' + e));
    await ctx.close();
  }
  await browser.close();
}

// One chain per engine, side by side: the WebKit and Chromium runs share nothing.
const chains = [
  [['webkit', 'iPhone 13'], ['webkit', 'iPhone SE'], ['webkit', 'iPhone 14 Pro Max']],
  [['chromium', 'Pixel 7'], ['chromium', 'Galaxy S9+']]
];
await Promise.all(chains.map(async chain => { for (const [engine, device] of chain) await runDevice(engine, device); }));
server.close();
console.log(fails.length ? fails.length + ' failure(s)' : 'signals-jump: all passed');
process.exit(fails.length ? 1 : 0);
