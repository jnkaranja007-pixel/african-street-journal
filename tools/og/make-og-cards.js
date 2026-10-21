// One-off generator for /og/<cc>.png share cards (1200x630), one per country.
// Run on a machine with Chrome:  node tools/og/make-og-cards.js
// Per-country rather than per-story on purpose: 55 files that never change, instead of
// ~230 new PNGs a night growing the repository by megabytes a day.
const fs = require('fs'), path = require('path'), vm = require('vm');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const root = path.resolve(__dirname, '../..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'data/app-core.js'), 'utf8'), sandbox);
const countries = sandbox.window.UNITED_AFRICA_DATA.countries;
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const info = {};
for (const m of appSrc.matchAll(/^\s+([a-z]{2}): \{ name: (?:'([^']+)'|"([^"]+)"),\s+region: '([^']+)'/gm)) info[m[1]] = { name: (m[2] || m[3]).replace("Cote d'Ivoire", "C&ocirc;te d&rsquo;Ivoire"), region: m[4] };
const font = fs.readFileSync(path.join(root, 'fonts/playfair-700.woff2')).toString('base64');
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage();
  await pg.setViewport({ width: 1200, height: 630 });
  fs.mkdirSync(path.join(root, 'og'), { recursive: true });
  for (const c of countries) {
    const i = info[c.id]; if (!i) continue;
    const all = countries.map(o => `<path d="${o.d}" fill="${o.id === c.id ? '#66bb6a' : '#262a26'}" stroke="#131313" stroke-width="1.2"/>`).join('');
    const html = `<html><head><style>@font-face{font-family:P;src:url(data:font/woff2;base64,${font})}
      body{margin:0;width:1200px;height:630px;background:#131313;color:#e8e6e3;font-family:ui-monospace,Consolas,monospace;display:flex;overflow:hidden}
      .l{flex:1;padding:72px 0 64px 80px;display:flex;flex-direction:column}
      .k{font-size:20px;letter-spacing:.22em;text-transform:uppercase;color:#66bb6a}
      h1{font:700 ${i.name.length > 16 ? 76 : 96}px/1.02 P,Georgia,serif;margin:28px 0 18px;color:#f4f2ef}
      .r{font-size:22px;letter-spacing:.16em;text-transform:uppercase;color:#948e85}
      .b{margin-top:auto;font:700 34px/1 P,Georgia,serif;color:#e8e6e3}.b span{color:#4caf50}
      svg{width:560px;height:630px;flex:none}</style></head><body>
      <div class="l"><div class="k">Today's desk</div><h1>${i.name}</h1><div class="r">${i.region} &middot; every story sourced</div>
      <div class="b">The African Street <span>Journal</span></div></div>
      <svg viewBox="-20 -20 1040 1041" preserveAspectRatio="xMidYMid meet">${all}</svg></body></html>`;
    await pg.setContent(html, { waitUntil: 'load' });
    await pg.screenshot({ path: path.join(root, 'og', c.id + '.jpg'), type: 'jpeg', quality: 82 });
  }
  await b.close();
})();
