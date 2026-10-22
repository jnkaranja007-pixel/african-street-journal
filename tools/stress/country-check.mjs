// Every country, every Signals set and the Atlas: no page errors, no "undefined"/"NaN",
// every section filled, the atlas drawn. Also lists what the inside-outline filter drops
// (ports, airports, places, landmarks), so a real JKIA hidden by a bad outline shows up.
// Run: node tools/stress/country-check.mjs [outDir] [--shots ke,so,eh]
// Writes <outDir>/country-check.json and phone-width screenshots. ASCII only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const args = process.argv.slice(2);
const outDir = path.resolve(args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--shots') || 'country-check');
const shotArg = args.indexOf('--shots');
const SHOTS = new Set((shotArg >= 0 ? args[shotArg + 1] : 'ke,so,eh,ma,za,ng,st,km,et,eg').split(','));
fs.mkdirSync(outDir, { recursive: true });

const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.xml':'application/xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const BASE = 'http://127.0.0.1:' + server.address().port + '/';

// Runs in the page: what one Signals set shows.
const READ_GRID = mode => {
  const grid = document.querySelector('.audience-mode.cv-info-grid[data-mode="' + mode + '"]');
  if (!grid) return { missing: true };
  const sections = Array.from(grid.children).map(sec => {
    const title = sec.querySelector('h4')?.textContent.trim() || '?';
    const body = Array.from(sec.children).filter(el => el.tagName !== 'HEADER');
    const text = body.map(el => el.innerText).join(' ').replace(/\s+/g, ' ').trim();
    return { title, meta: sec.querySelector('.cv-section-head .meta')?.textContent.trim() || '', text };
  });
  const head = document.querySelector('#cv-panel-signals .cv-panel-head')?.innerText.replace(/\s+/g, ' ').trim() || '';
  return { sections, head };
};

// Runs in the page: the atlas, and what the outline filter drops.
const READ_ATLAS = cc => {
  const c = document.getElementById('cv-country-map');
  let inked = 0;
  if (c && c.width > 300) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) inked++;
  }
  const f = countryFacts(cc) || {};
  const out = (list, tol) => (list || []).filter(p => p && Number.isFinite(p.lon) && !insideCountry(cc, p.lon, p.lat, tol)).map(p => p.name);
  const rail = COUNTRY_GIS[cc]?.rail;
  return {
    canvas: c ? [c.width, c.height] : null, inked,
    alt: document.getElementById('cv-atlas-alt')?.textContent.trim() || '',
    legend: document.querySelector('.cv-map-legend')?.innerText.replace(/\s+/g, ' ').trim() || '',
    markers: atlasInfraForCountry(cc).map(m => m.label),
    places: atlasPlaces(cc).length,
    dropped: {
      ports: out(f.ports, 30), airports: out(f.airports, 30),
      places: out(COUNTRY_GIS[cc]?.places, 5),
      landmarks: LANDMARK_POINTS.filter(p => p.countries?.includes(cc) && !insideCountry(cc, p.lon, p.lat)).map(p => p.name || p.label)
    },
    facts: {
      wb: Object.values(f.wb || {}).filter(v => v && v.value != null).length,
      wbOf: Object.keys((window.ASJ_COUNTRY_FACTS || {}).indicators || {}).length,
      ports: (f.ports || []).length, airports: (f.airports || []).length,
      gateway: (f.airports || []).some(a => a.gateway),
      food: f.food ? { market: f.food.market, date: f.food.date, camp: !!f.food.camp, items: (f.food.items || []).map(i => i.commodity) } : null,
      railKm: Math.round(Number(rail?.km) || 0), sgrKm: Math.round(Number(rail?.sgrKm) || 0)
    }
  };
};

const BAD_TEXT = /\bundefined\b|\bNaN\b|\[object |\bnull\b/;
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.route(/cloudflareinsights|googleapis|gstatic|supabase|open\.er-api|workers\.dev/, r => r.abort());
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'load' });
const ids = await page.evaluate(() => Object.keys(COUNTRY_INFO).sort());

const report = { generated: new Date().toISOString(), countries: {} };
let failures = 0;
for (const cc of ids) {
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  const row = { problems: [], signals: {} };
  await pg.goto(BASE + '#/' + cc + '/farmers', { waitUntil: 'load' });
  await pg.waitForFunction(id => typeof COUNTRY_DETAIL !== 'undefined' && COUNTRY_DETAIL[id], cc, { timeout: 15000 }).catch(() => row.problems.push('country chunk did not load'));
  for (const mode of ['farmers', 'investors', 'diaspora']) {
    await pg.evaluate(([id, m]) => { location.hash = '#/' + id + '/' + m; }, [cc, mode]);
    await pg.waitForTimeout(900);
    const g = await pg.evaluate(READ_GRID, mode);
    row.signals[mode] = g;
    if (g.missing) { row.problems.push(mode + ': grid missing'); continue; }
    for (const s of g.sections) {
      if (!s.text) row.problems.push(mode + '/' + s.title + ': empty');
      if (BAD_TEXT.test(s.text) || BAD_TEXT.test(s.meta)) row.problems.push(mode + '/' + s.title + ': ' + (s.text + ' ' + s.meta).match(BAD_TEXT)[0]);
    }
    if (BAD_TEXT.test(g.head)) row.problems.push(mode + '/header: ' + g.head.match(BAD_TEXT)[0]);
    if (SHOTS.has(cc)) await pg.screenshot({ path: path.join(outDir, cc + '-' + mode + '.png'), fullPage: false });
  }
  await pg.evaluate(id => { location.hash = '#/' + id + '/atlas'; }, cc);
  await pg.waitForTimeout(1500);
  const atlas = await pg.evaluate(READ_ATLAS, cc);
  row.atlas = atlas;
  if (!atlas.canvas || atlas.inked < 50) row.problems.push('atlas: canvas blank (' + JSON.stringify(atlas.canvas) + ', inked ' + atlas.inked + ')');
  if (BAD_TEXT.test(atlas.alt + ' ' + atlas.legend)) row.problems.push('atlas: ' + (atlas.alt + ' ' + atlas.legend).match(BAD_TEXT)[0]);
  if (SHOTS.has(cc)) await pg.screenshot({ path: path.join(outDir, cc + '-atlas.png'), fullPage: false });
  row.errors = errs;
  if (errs.length) row.problems.push(errs.length + ' page error(s): ' + errs[0]);
  report.countries[cc] = row;
  if (row.problems.length) failures++;
  const d = atlas.dropped;
  const dropped = d.ports.length + d.airports.length + d.places.length + d.landmarks.length;
  console.log((row.problems.length ? 'FAIL ' : 'OK   ') + cc + (row.problems.length ? '  ' + row.problems.join(' | ') : '') + (dropped ? '  (outside outline: ' + dropped + ')' : ''));
  await pg.close();
}
fs.writeFileSync(path.join(outDir, 'country-check.json'), JSON.stringify(report, null, 1));
await browser.close();
server.close();
console.log((failures ? 'FAIL' : 'OK') + ' - ' + (ids.length - failures) + '/' + ids.length + ' countries clean; report in ' + path.join(outDir, 'country-check.json'));
process.exit(failures ? 1 : 0);
