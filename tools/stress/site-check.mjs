// Browser regression check for the hero map and the country panels.
// Run: npx -y playwright@1 install --with-deps chromium && node tools/stress/site-check.mjs
// Serves the repo itself, so it tests exactly what would deploy. ASCII only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
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
const fails = [];
const fail = m => { fails.push(m); console.log('FAIL ' + m); };

const HIT = () => {
  const bad = []; const probe = document.createElement('canvas').getContext('2d');
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i], b = p.bbox; if (!b) continue; let pt = null;
    for (let k = 0; k < 400 && !pt; k++) {
      const x = b.minX + (b.maxX - b.minX) * ((k * 0.618) % 1), y = b.minY + (b.maxY - b.minY) * ((k * 0.382 + 0.13) % 1);
      if (probe.isPointInPath(p.shape, x, y) && paths.every((q, j) => j === i || !probe.isPointInPath(q.shape, x, y))) pt = [x, y];
    }
    if (!pt) { const t = islandHitTargets.find(t => t.idx === i) || microHitTargets.find(t => t.idx === i); if (t) pt = [t.cx, t.cy]; }
    if (!pt) { bad.push(p.id + ': no interior point'); continue; }
    const r = hitTest(pt[0], pt[1]); if (r !== i) bad.push(p.id + ' hit ' + (paths[r] ? paths[r].id : 'nothing'));
  }
  return { n: paths.length, bad };
};
const LABELS = () => {
  const m = window.__islandLabels ? window.__islandLabels() : {}; const pr = document.createElement('canvas').getContext('2d'); const bad = [];
  const rs = Object.entries(m);
  for (const [id, L] of rs) {
    const r = L.r;
    outer: for (const p of paths) for (let i = 0; i <= 6; i++) for (let j = 0; j <= 3; j++) {
      if (pr.isPointInPath(p.shape, r.x0 + (r.x1 - r.x0) * i / 6, r.y0 + (r.y1 - r.y0) * j / 3)) { bad.push(id + ' tag touches ' + p.id); break outer; }
    }
    if (r.x0 < islandLabelBounds.x0 - 0.5 || r.x1 > islandLabelBounds.x1 + 0.5) bad.push(id + ' tag off screen');
    for (const [id2, L2] of rs) if (id2 > id && !(r.x1 < L2.r.x0 || L2.r.x1 < r.x0 || r.y1 < L2.r.y0 || L2.r.y1 < r.y0)) bad.push(id + ' tag overlaps ' + id2);
  }
  return { n: rs.length, bad, overflow: document.documentElement.scrollWidth > innerWidth };
};

const browser = await chromium.launch();
for (const [w, h, dpr] of [[320, 568, 2], [390, 844, 3], [768, 1024, 2], [1440, 900, 1], [2560, 1440, 1], [844, 390, 2]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 700, hasTouch: w < 900 });
  await ctx.route(/cloudflareinsights|googleapis|gstatic|supabase|open\.er-api/, r => r.abort());
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto(BASE, { waitUntil: 'load' }); await pg.waitForTimeout(3800);
  const tag = w + 'x' + h + '@' + dpr;
  const hit = await pg.evaluate(HIT); if (hit.n !== 55) fail(tag + ' expected 55 countries, got ' + hit.n);
  hit.bad.forEach(b => fail(tag + ' ' + b));
  const lb = await pg.evaluate(LABELS); if (lb.n < 5) fail(tag + ' island tags missing'); lb.bad.forEach(b => fail(tag + ' ' + b));
  if (lb.overflow) fail(tag + ' horizontal overflow');
  if (w === 390) {
    const ids = await pg.evaluate(() => paths.map(p => p.id));
    for (const id of ids) for (const route of ['', '/signals', '/investors', '/farmers', '/diaspora', '/atlas']) {
      await pg.evaluate(h => { location.hash = h; }, '#/' + id + route); await pg.waitForTimeout(120);
      const txt = await pg.evaluate(() => (document.getElementById('country-view') || document.body).innerText);
      for (const bad of ['NaN', 'undefined', 'Infinity', '[object Object]']) if (txt.includes(bad)) fail(id + route + ' shows "' + bad + '"');
    }
  }
  errs.forEach(e => fail(tag + ' page error: ' + e));
  await ctx.close();
}
await browser.close(); server.close();

// Market data must never carry a fake or impossible number.
const today = Date.now();
const markets = JSON.parse(fs.readFileSync(path.join(root, 'data/markets.json'), 'utf8'));
for (const [id, m] of Object.entries(markets)) {
  if (!m || !m.asOf || !Number.isFinite(Date.parse(m.asOf))) fail('markets ' + id + ' has no valid asOf');
  else if (Date.parse(m.asOf) > today + 2 * 864e5) fail('markets ' + id + ' asOf is in the future');
  for (const c of (m.companies || [])) if (!(Number(c.cap) > 0) || !Number.isFinite(Number(c.change))) fail('markets ' + id + ' ' + c.t + ' bad number');
}
const ijs = path.join(root, 'data/indices.js');
if (fs.existsSync(ijs)) {
  const o = JSON.parse(fs.readFileSync(ijs, 'utf8').replace(/^[\s\S]*?window\.ASJ_INDICES = /, '').replace(/;\s*$/, ''));
  for (const [k, r] of Object.entries(o.indices || {})) {
    if (!(r.level > 0)) fail('index ' + k + ' level not positive');
    if (r.changePct != null && Math.abs(r.changePct) > 25) fail('index ' + k + ' implausible move ' + r.changePct);
    if (!Number.isFinite(Date.parse(r.date)) || Date.parse(r.date) > today + 2 * 864e5) fail('index ' + k + ' bad date ' + r.date);
  }
} else fail('data/indices.js missing');

// Privacy: the owner's personal details must never ship.
// Only hello@africanstreetjournal.com may be published; no personal names or other inboxes.
const banned = [/jnkaranja007@/i, /karanja/i, /africanstreetj@gmail/i, /[a-z0-9._%+-]+@gmail\.com/i];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'tools' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const ALLOWED_EMAIL = 'hello@africanstreetjournal.com';
const emailRe = /mailto:([^"'?\s<>]+)|\b[a-z0-9._%+-]+@(?:gmail|yahoo|outlook|hotmail|icloud|proton(?:mail)?)\.[a-z]+\b|\b[a-z0-9._%+-]+@africanstreetjournal\.com\b/gi;
for (const f of walk(root)) if (/\.(html|js|xml|json|css|txt)$/.test(f)) {
  const s = fs.readFileSync(f, 'utf8');
  for (const b of banned) if (b.test(s)) fail('private detail in ' + path.relative(root, f));
  for (const m of s.matchAll(emailRe)) { const addr = (m[1] || m[0]).toLowerCase(); if (addr !== ALLOWED_EMAIL) fail('unexpected email ' + addr + ' in ' + path.relative(root, f)); }
}
for (const page of ['contact/index.html', 'corrections/index.html']) {
  const p = path.join(root, page);
  if (!fs.existsSync(p) || !fs.readFileSync(p, 'utf8').includes('mailto:' + ALLOWED_EMAIL)) fail(page + ' is missing the mailto:' + ALLOWED_EMAIL + ' link');
}

console.log(fails.length ? fails.length + ' failure(s)' : 'site-check: all passed');
process.exit(fails.length ? 1 : 0);
