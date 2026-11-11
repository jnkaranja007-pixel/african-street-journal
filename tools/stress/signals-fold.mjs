// Signals sections on phones: each heading opens or closes its section in place, on
// iPhones (WebKit) as well as on Android (Chromium). Taps are real touch taps.
// The row of section links this replaced scrolled the page to a section, and on a real
// iPhone (10 Nov 2026) it kept landing short, past or nowhere in all three lenses. So:
//   - a heading tap must never move the page: the heading stays where the finger was;
//   - it must open the section (content shown, with height) and a second tap close it;
//   - every section starts closed;
//   - an At a glance figure must open its section, alone, and leave it on screen;
//   - wider screens show every section, with nothing to tap.
// Run: npx -y playwright@1 install --with-deps chromium webkit && node tools/stress/signals-fold.mjs
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

// The sections of a lens: id, label, open or not, content height, heading position.
const SECTIONS = mode => Array.from(document.querySelectorAll('.audience-mode[data-mode="' + mode + '"] > .cv-fold')).map(s => {
  const head = s.querySelector(':scope > .cv-section-head');
  const content = Array.from(s.children).filter(el => el !== head);
  return {
    id: s.id,
    label: head.querySelector('h4').textContent.trim(),
    open: s.classList.contains('is-open'),
    expanded: head.querySelector('.cv-fold-btn')?.getAttribute('aria-expanded'),
    contentHeight: Math.round(content.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0)),
    headTop: Math.round(head.getBoundingClientRect().top)
  };
});
const scrollTop = pg => pg.evaluate(() => Math.round(document.getElementById('country-view').scrollTop));
const section = (pg, mode, id) => pg.evaluate(([m, i]) => SECTIONS_FN(m).find(s => s.id === i), [mode, id]);

async function runDevice(engine, device) {
  if (!pw.devices[device]) return fail('Playwright has no device profile named ' + device);
  const browser = await pw[engine].launch();
  for (const country of ['ke', 'ng', 'gh']) {
    const ctx = await browser.newContext({ ...pw.devices[device] });
    await ctx.route(/cloudflareinsights|supabase|open\.er-api|open-meteo|flagcdn|worldbank/, r => r.abort());
    await ctx.addInitScript('window.SECTIONS_FN = ' + SECTIONS.toString());
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(String(e)));
    await pg.goto(BASE + '#/' + country + '/farmers', { waitUntil: 'load' });
    await pg.waitForSelector('.audience-mode[data-mode="farmers"] > .cv-fold', { timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(400);

    for (const mode of ['farmers', 'investors', 'diaspora']) {
      await pg.locator('.cv-audience-tab[data-audience="' + mode + '"]').tap();
      await pg.waitForTimeout(400);
      const start = await pg.evaluate(SECTIONS, mode);
      const tag0 = device + ' ' + country + ' ' + mode;
      if (start.length < 2) { fail(tag0 + ': ' + start.length + ' fold sections'); continue; }
      if (start.some(s => s.open)) fail(tag0 + ': on open, expected every section closed (' + start.map(s => s.open ? 1 : 0).join('') + ')');
      for (const s of start) {
        const tag = tag0 + ' "' + s.label + '"';
        const head = pg.locator('#' + s.id + ' > .cv-section-head');
        await head.scrollIntoViewIfNeeded();
        await pg.waitForTimeout(150);
        const before = await section(pg, mode, s.id), top0 = await scrollTop(pg);
        await head.tap();
        await pg.waitForTimeout(350);
        const after = await section(pg, mode, s.id), top1 = await scrollTop(pg);
        console.log(tag + ': open ' + before.open + ' -> ' + after.open + ', content ' + after.contentHeight + 'px, heading ' + before.headTop + ' -> ' + after.headTop + ', scrollTop ' + top0 + ' -> ' + top1);
        if (after.open === before.open) fail(tag + ': tap did not toggle the section');
        if (after.expanded !== String(after.open)) fail(tag + ': aria-expanded ' + after.expanded + ' but open ' + after.open);
        if (after.open && after.contentHeight < 20) fail(tag + ': opened but its content is ' + after.contentHeight + 'px tall');
        if (!after.open && after.contentHeight !== 0) fail(tag + ': closed but its content is ' + after.contentHeight + 'px tall');
        if (Math.abs(top1 - top0) > 2 || Math.abs(after.headTop - before.headTop) > 2) fail(tag + ': the page moved on a heading tap');
        // And back again.
        await head.tap();
        await pg.waitForTimeout(300);
        const back = await section(pg, mode, s.id);
        if (back.open !== before.open) fail(tag + ': a second tap did not toggle it back');
      }
    }

    // At a glance follows the lens: in each, every figure belongs to that lens, opens its
    // section alone, leaves the lens as it was and the heading on screen.
    for (const lens of ['farmers', 'investors', 'diaspora']) {
    await pg.locator('.cv-audience-tab[data-audience="' + lens + '"]').tap();
    await pg.waitForTimeout(400);
    await pg.evaluate(() => { document.getElementById('country-view').scrollTop = 0; });
    await pg.waitForTimeout(200);
    const cells = await pg.$$eval('#cv-glance [data-glance-target]', bs => bs.map(b => ({ target: b.dataset.glanceTarget, mode: b.dataset.glanceMode, key: b.querySelector('.cv-glance-key')?.textContent })));
    if (!cells.length) fail(device + ' ' + country + ': no At a glance figures');
    if (cells.some(c => c.mode !== lens)) fail(device + ' ' + country + ' ' + lens + ': At a glance shows another lens\x27s figures (' + cells.map(c => c.key + '/' + c.mode).join(', ') + ')');
    for (const cell of cells) {
      await pg.evaluate(() => { document.getElementById('country-view').scrollTop = 0; });
      await pg.waitForTimeout(200);
      await pg.locator('#cv-glance [data-glance-target="' + cell.target + '"][data-glance-mode="' + cell.mode + '"]').first().tap();
      await pg.waitForTimeout(500);
      const r = await pg.evaluate(([target, mode]) => {
        const s = document.getElementById(target)?.closest('.cv-fold');
        if (!s) return null;
        const head = s.querySelector('.cv-section-head').getBoundingClientRect();
        const others = Array.from(s.parentElement.querySelectorAll(':scope > .cv-fold.is-open')).filter(o => o !== s).length;
        return { lens: document.body.dataset.audience, open: s.classList.contains('is-open'), others, top: Math.round(head.top), bottom: Math.round(head.bottom), vh: innerHeight };
      }, [cell.target, cell.mode]);
      const tag = device + ' ' + country + ' glance "' + cell.key + '"';
      console.log(tag + ': ' + JSON.stringify(r));
      if (!r) { fail(tag + ': no section for ' + cell.target); continue; }
      if (r.lens !== cell.mode) fail(tag + ': lens is ' + r.lens + ', expected ' + cell.mode);
      if (!r.open || r.others) fail(tag + ': section open ' + r.open + ', ' + r.others + ' others open');
      if (r.top < 0 || r.bottom > r.vh) fail(tag + ': heading off screen (' + r.top + '..' + r.bottom + ' of ' + r.vh + ')');
    }
    }
    errs.forEach(e => fail(device + ' ' + country + ' page error: ' + e));
    await ctx.close();
  }
  await browser.close();
}

// Wider screens: every section shown, nothing folded.
async function runDesktop() {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/cloudflareinsights|supabase|open\.er-api|open-meteo|flagcdn|worldbank/, r => r.abort());
  const pg = await ctx.newPage();
  await pg.goto(BASE + '#/ke/farmers', { waitUntil: 'load' });
  await pg.waitForSelector('.audience-mode[data-mode="farmers"] > .cv-fold', { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(400);
  const hidden = await pg.evaluate(() => Array.from(document.querySelectorAll('.audience-mode[data-mode="farmers"] > .cv-fold'))
    .filter(s => Array.from(s.children).some(el => !el.matches('.cv-section-head') && getComputedStyle(el).display === 'none')).map(s => s.id));
  console.log('desktop ke farmers: hidden sections ' + JSON.stringify(hidden));
  if (hidden.length) fail('desktop: sections hidden on a wide screen: ' + hidden.join(', '));
  await browser.close();
}

// One chain per engine, side by side: the WebKit and Chromium runs share nothing.
const chains = [
  [['webkit', 'iPhone 13'], ['webkit', 'iPhone SE'], ['webkit', 'iPhone 14 Pro Max']],
  [['chromium', 'Pixel 7'], ['chromium', 'Galaxy S9+']]
];
await Promise.all([runDesktop(), ...chains.map(async chain => { for (const [engine, device] of chain) await runDevice(engine, device); })]);
server.close();
console.log(fails.length ? fails.length + ' failure(s)' : 'signals-fold: all passed');
process.exit(fails.length ? 1 : 0);
