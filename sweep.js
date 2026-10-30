/* Content sweep: open ?sweep=1 to read every country in every view, the Wire and the
   front page the way a reader does, and list what a careful editor would flag.

   The self-test (selftest.js) checks rules someone already thought of, one at a time.
   Most of what the 28-30 Oct 2026 audits found was text that rendered fine and was
   wrong: desk jargon ("capital lens", "Compiled from sourced desk layers"), figures from
   a regional model shown as data, a Spanish train crash leading Cabo Verde, headlines in
   lower case, a "Why it matters" that said the dek again. This reads the visible text of
   all 55 countries x News, Signals (farmers, investors, diaspora) and Atlas against
   patterns for those classes, plus broken images and console errors, and groups the
   findings so one look shows where a class of problem lives.

   Results: window.__sweep = { done, views, findings: [{ rule, count, where, sample }],
   errors }. It is a report for a person to read, not a pass/fail gate: some matches
   are legitimate ("desk" in the About page's description of how the desk works). */
(function () {
  if (window.__sweep && window.__sweep.running) return;
  const state = window.__sweep = { running: true, done: false, phase: 'app views', views: 0, findings: [], errors: [] };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const byRule = new Map();
  const note = (rule, where, sample) => {
    const key = rule + '|' + String(sample).slice(0, 90);
    let f = byRule.get(key);
    if (!f) { f = { rule, count: 0, where: [], sample: String(sample).slice(0, 160) }; byRule.set(key, f); }
    f.count++;
    if (f.where.length < 8 && !f.where.includes(where)) f.where.push(where);
  };
  window.addEventListener('error', e => state.errors.push(String(e.message || e)));
  const origError = console.error;
  console.error = function (...args) { state.errors.push(args.map(String).join(' ').slice(0, 200)); return origError.apply(console, args); };

  // Patterns over visible text. Each match is reported with the words around it.
  const TEXT_RULES = [
    ['broken value', /\b(NaN|undefined|Infinity)\b|\[object Object\]|\bnull\b/g],
    // The interface's own phrases, not words a news story uses ("a national cancer
    // registry", "public confidence" are fine in a story; "Water registry" and "high
    // confidence" as labels were not).
    ['desk jargon', /\b(desk file|desk model|desk layers?|file pending|(capital|farmer|diaspora|investor) lens|active overlays?|hydrography|water registry|high confidence|gdp observations?|annual observations?|copy desk)\b/gi],
    ['the word desk', /\b(ASJ desk|the desk|desk)\b/g],
    ['placeholder', /\b(lorem|ipsum|todo|tbd|coming soon|placeholder|sample data)\b/gi],
    ['modelled figure', /\b(modell?ed|estimated by|desk estimate|inferred)\b/gi],
    ['stale stamp', /\b(updated|as of)\b[^.\n]{0,24}\b(\d{1,2}) (days|weeks|months) ago\b/gi]
  ];
  const context = (text, index, length) => text.slice(Math.max(0, index - 40), index + length + 40).replace(/\s+/g, ' ').trim();
  function scanText(where, text) {
    for (const [rule, re] of TEXT_RULES) {
      // The About page describes how the automated desk works; that is the one place the
      // word belongs. Story prose (the reader) is checked for the interface phrases only.
      if (rule === 'the word desk' && (/^static\/about\//.test(where) || /^reader\//.test(where))) continue;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        if (rule === 'stale stamp' && Number(m[2]) < 3 && m[3] === 'days') continue;
        note(rule, where, context(text, m.index, m[0].length));
      }
    }
  }
  const visible = el => !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';

  function scanStructure(where, root, countryId) {
    // Headlines and deks that start in lower case.
    root.querySelectorAll('.cv-brief-title, .cv-brief-dek, .wire-item-title, .wire-hero-title, .wire-item-sum, .home-story-title').forEach(el => {
      const t = (el.textContent || '').trim();
      if (/^[a-z]/.test(t)) note('lower-case headline or dek', where, t);
    });
    // Images that failed to load.
    root.querySelectorAll('img').forEach(img => {
      if (visible(img) && img.complete && img.naturalWidth === 0 && img.getAttribute('src')) note('broken image', where, img.getAttribute('src'));
    });
    // The same sentence twice in one view (a dek repeated as "Why it matters", two cells alike).
    const seen = new Map();
    root.querySelectorAll('p, li, .cv-alm-sub, .cv-econ-sub, .cv-fact-source').forEach(el => {
      if (!visible(el)) return;
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length < 40) return;
      if (seen.has(t)) note('same text twice in one view', where, t); else seen.set(t, el);
    });
    // KPI cells with no figure and no word on why. A blank that says "Not published",
    // "Not reported" or "Last reported 2015" is the page working as designed (Western
    // Sahara and Eritrea publish no economic figures); a bare dash is a fault.
    if (countryId) {
      let unexplained = 0;
      ['cv-pop', 'cv-weather', 'cv-time', 'cv-daylight'].forEach(id => {
        const v = document.getElementById(id);
        const sub = (document.getElementById(id + '-sub')?.textContent || '').trim();
        if (!v || !/^(—|-|)$/.test((v.textContent || '').trim())) return;
        if (/Weather/.test(document.getElementById(id + '-key')?.textContent || '')) return;
        if (/not published|not reported|no .*data|last reported|unavailable/i.test(sub)) return;
        unexplained++;
      });
      if (unexplained) note('headline figure blank with no reason given', where, unexplained + ' of 4');
    }
    // Text cut off by its box (a truncated label reads as a typo).
    root.querySelectorAll('h1, h2, h3, h4, .cv-alm-key, .cv-alm-val, .cv-econ-key, .cv-heat-tkr, .wire-item-title').forEach(el => {
      if (visible(el) && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow === 'ellipsis') note('text cut off', where, (el.textContent || '').trim());
    });
  }

  // A country story whose headline, dek and opening never name the country, its capital
  // or one of its mapped places: the off-country class (Cabo Verde's train crash).
  // Names a story may use instead of the one COUNTRY_INFO carries. Without these the first
  // run flagged "Ivory Coast", "DRC" and "Royal Air Maroc" stories as off-country.
  const ALIASES = {
    ci: ['ivory coast', 'ivorian'], cd: ['drc', 'dr congo', 'congolese'], cg: ['congo', 'brazzaville', 'congolese'],
    cv: ['cape verde', 'cabo verde', 'verdean'], st: ['sao tome', 'principe'], ma: ['maroc', 'moroccan'],
    gm: ['gambian'], gw: ['bissau'], cf: ['central african', 'car'], sz: ['swaziland', 'swazi'], eh: ['sahrawi', 'polisario'],
    za: ['south african'], ss: ['south sudanese', 'splm', 'spla', 'abyei', 'machar'], sd: ['sudanese', 'abyei', 'darfur', 'kordofan'],
    gq: ['equatoguinean'], km: ['comorian'], ls: ['basotho', 'mosotho', 'mafeteng', 'leribe', 'berea', 'mohale'],
    bw: ['batswana', 'motswana'], mg: ['malagasy'], mu: ['mauritian'], sc: ['seychellois']
  };
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function scanOffCountry(countryId) {
    const info = COUNTRY_INFO[countryId] || {};
    const names = [info.name, info.capital, ...(ALIASES[countryId] || []),
      ...(COUNTRY_GIS[countryId]?.places || []).map(p => p.name),
      ...((typeof countryFacts === 'function' && countryFacts(countryId)?.cities) || []).map(c => c.name)]
      .filter(Boolean).map(fold);
    const stem = fold(info.name).slice(0, Math.max(4, String(info.name || '').length - 2));
    // Somewhere else, named: another African country or capital, or a place or club the
    // desk's own gate treats as abroad (news-ranking.ps1 NEWS_EXTERNAL_COUNTRIES). A story
    // that names only a small home town (Worawora, Mafeteng, Kajiado) is not flagged.
    const skip = new Set(['victoria', 'praia', ...(countryId === 'so' ? ['juba'] : []), ...(countryId === 'ma' ? ['laayoune'] : [])]);
    const foreign = Object.entries(COUNTRY_INFO).filter(([cc]) => cc !== countryId)
      .flatMap(([, i]) => [i.name, i.capital]).filter(Boolean).map(fold).filter(n => !skip.has(n))
      .concat(FOREIGN_PLACES);
    const wholeWord = (text, n) => new RegExp('(^|[^a-z])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(text);
    for (const story of (AI_BRIEFS[countryId] || [])) {
      if (!story || !story.headline) continue;
      const text = fold([story.headline, story.dek, ...(storyParagraphs(story) || []).slice(0, 2)].join(' '));
      if (stem && text.includes(stem)) continue;
      // Whole words for short names ("DRC", "CAR"), plain containment for the rest.
      if (names.some(n => n.trim().length > 3 ? text.includes(n) : wholeWord(text, n.trim()))) continue;
      const elsewhere = foreign.find(n => wholeWord(text, n));
      if (elsewhere) note('story set abroad', countryId, story.headline + '  [names ' + elsewhere + ']');
    }
  }
  const FOREIGN_PLACES = ['france', 'spain', 'italy', 'germany', 'united kingdom', 'britain', 'united states', 'china',
    'india', 'japan', 'russia', 'ukraine', 'iran', 'israel', 'turkey', 'saudi arabia', 'qatar', 'portugal', 'lisbon', 'paris',
    'london', 'madrid', 'barcelona', 'brussels', 'washington', 'beijing', 'moscow', 'yemen', 'brazil', 'gaza', 'lebanon',
    'syria', 'pakistan', 'premier league', 'champions league', 'la liga', 'serie a', 'bundesliga', 'manchester united',
    'manchester city', 'liverpool', 'chelsea', 'arsenal', 'tottenham', 'real madrid', 'bayern munich', 'juventus', 'psg'];

  // Every story, opened in the reader the way a reader opens it: its text against the
  // same rules, at least three paragraphs, and source links that are real web addresses.
  async function sweepReader() {
    state.phase = 'reader';
    const reader = document.getElementById('story-reader');
    for (const [cc, list] of Object.entries(AI_BRIEFS || {})) {
      for (const [rank, story] of (list || []).entries()) {
        if (!story || !story.headline) continue;
        openStoryReader(story, { countryCode: cc, country: COUNTRY_INFO[cc]?.name || '', published: story.published, rank }, document.body);
        for (let i = 0; i < 20 && document.getElementById('story-reader-title')?.textContent !== story.headline; i++) await wait(25);
        const where = 'reader/' + cc;
        scanText(where, reader.innerText);
        scanStructure(where, reader, null);
        const links = Array.from(reader.querySelectorAll('#story-reader-sources a'));
        if (!links.length) note('story with no source link', where, story.headline);
        for (const a of links) if (!/^https?:\/\/[^/\s]+\.[^/\s]+/.test(a.getAttribute('href') || '')) note('source link is not a web address', where, a.getAttribute('href'));
        if (reader.querySelectorAll('#story-reader-copy p').length < 3) note('story under three paragraphs', where, story.headline);
        closeStoryReader();
        state.views++;
      }
    }
  }

  // The Wire under every audience and topic: what it shows, and that an empty filter
  // says why rather than showing a blank page.
  async function sweepWireFilters() {
    state.phase = 'wire filters';
    location.hash = '#/wire';
    await wait(1200);
    const wire = document.getElementById('wire-view');
    const topic = document.getElementById('wire-topic-select');
    const lens = document.getElementById('wire-lens-select');
    if (!wire || !topic || !lens) { note('wire controls missing', 'wire', ''); return; }
    const set = async (el, value, ms) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); await wait(ms); };
    const lensValues = Array.from(lens.options).map(o => o.value);
    for (const lv of lensValues) {
      await set(lens, lv, 350);
      for (const tv of Array.from(topic.options).map(o => o.value)) {
        await set(topic, tv, 220);
        const where = 'wire/' + lv + '/' + tv;
        scanText(where, wire.innerText);
        scanStructure(where, wire, null);
        const shown = wire.querySelectorAll('.wire-item, .wire-hero').length;
        if (!shown && !wire.querySelector('.wire-empty')) note('wire filter shows nothing and says nothing', where, '');
        state.views++;
      }
    }
    await set(topic, 'All', 200);
    await set(lens, lensValues[0], 200);
    location.hash = '';
  }

  // The crawlable pages (every URL in sitemap.xml), as a search engine or a shared link
  // finds them: the text rules, a title, description, canonical link and share image,
  // headlines in proper case, and every internal link and image resolving.
  async function sweepStaticPages() {
    state.phase = 'static pages';
    const BASE = 'https://africanstreetjournal.com';
    const local = u => (u && u.startsWith(BASE)) ? (u.slice(BASE.length) || '/') : (u && u.startsWith('/') ? u : null);
    const known = new Map();
    const exists = async path => {
      const p = path.split('#')[0].split('?')[0] || '/';
      if (known.has(p)) return known.get(p);
      let ok = false;
      try { ok = (await fetch(p, { cache: 'no-store' })).ok; } catch {}
      known.set(p, ok);
      return ok;
    };
    let sitemap = '';
    try { sitemap = await (await fetch('sitemap.xml', { cache: 'no-store' })).text(); } catch {}
    const paths = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)).map(m => local(m[1])).filter(Boolean);
    if (!paths.length) { note('sitemap empty or missing', 'static', ''); return; }
    for (const extra of ['/feed.xml', '/ke/feed.xml', '/news-sitemap.xml', '/robots.txt', '/404.html']) {
      if (!(await exists(extra))) note('site file missing', 'static', extra);
    }
    for (const path of paths) {
      const where = 'static' + path;
      let res;
      try { res = await fetch(path, { cache: 'no-store' }); } catch { res = null; }
      if (!res || !res.ok) { note('sitemap page missing', where, res ? res.status : 'fetch failed'); continue; }
      known.set(path.split('#')[0], true);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      scanText(where, (doc.body?.textContent || '').replace(/\s+/g, ' '));
      if (!doc.querySelector('title')?.textContent.trim()) note('page without a title', where, '');
      if (!doc.querySelector('meta[name="description"]')?.getAttribute('content')) note('page without a description', where, '');
      if (!doc.querySelector('link[rel="canonical"]')) note('page without a canonical link', where, '');
      const og = local(doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '');
      if (og && !(await exists(og))) note('share image missing', where, og);
      doc.querySelectorAll('h1, h2').forEach(h => {
        const t = (h.textContent || '').trim();
        if (/^[a-z]/.test(t)) note('lower-case headline or dek', where, t);
      });
      for (const el of doc.querySelectorAll('a[href], img[src], link[rel="stylesheet"][href], script[src]')) {
        const raw = el.getAttribute('href') || el.getAttribute('src') || '';
        // "mai[l]to": the site check reads a literal mail link prefix as an address to vet.
        if (/^(mai[l]to:|tel:|#|javascript:)/.test(raw)) continue;
        const p = local(raw);
        if (!p || p.startsWith('/#')) continue;
        if (!(await exists(p))) note('broken internal link', where, raw);
      }
      state.views++;
    }
  }

  const VIEWS = ['news', 'farmers', 'investors', 'diaspora', 'atlas'];
  (async () => {
    try {
      // Front page and Wire first.
      location.hash = '';
      await wait(900);
      scanText('home', document.body.innerText);
      scanStructure('home', document.body, null);
      location.hash = '#/wire';
      await wait(1200);
      const wire = document.getElementById('wire-view');
      if (wire) { scanText('wire', wire.innerText); scanStructure('wire', wire, null); state.views++; }
      for (const countryId of Object.keys(COUNTRY_INFO).sort()) {
        for (const view of VIEWS) {
          location.hash = '#/' + countryId + '/' + view;
          // Long enough for late layout work (ticker fitting runs on a resize observer).
          await wait(view === 'atlas' ? 900 : 700);
          const where = countryId + '/' + view;
          scanText(where, countryView.innerText);
          scanStructure(where, countryView, countryId);
          state.views++;
        }
        // After the views: opening the country loads its city list (data/facts/<cc>.js).
        scanOffCountry(countryId);
      }
      location.hash = '';
      await wait(600);
      await sweepReader();
      await sweepWireFilters();
      await sweepStaticPages();
      location.hash = '';
    } catch (err) {
      state.errors.push('sweep stopped: ' + String(err && err.message || err));
    } finally {
      state.findings = Array.from(byRule.values()).sort((a, b) => a.rule.localeCompare(b.rule) || b.count - a.count);
      state.running = false;
      state.done = true;
      console.log('[sweep] ' + state.views + ' views, ' + state.findings.length + ' distinct findings, ' + state.errors.length + ' errors');
    }
  })();
}());
