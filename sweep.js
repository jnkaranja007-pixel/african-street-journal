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
  const state = window.__sweep = { running: true, done: false, views: 0, findings: [], errors: [] };
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
    ['desk jargon', /\b(desk file|desk model|desk layers?|file pending|lens|observations?|overlays?|hydrography|registry|confidence)\b/gi],
    ['the word desk', /\bdesk\b/gi],
    ['placeholder', /\b(lorem|ipsum|todo|tbd|coming soon|placeholder|sample data)\b/gi],
    ['modelled figure', /\b(modell?ed|estimated by|desk estimate|inferred)\b/gi],
    ['stale stamp', /\b(updated|as of)\b[^.\n]{0,24}\b(\d{1,2}) (days|weeks|months) ago\b/gi]
  ];
  const context = (text, index, length) => text.slice(Math.max(0, index - 40), index + length + 40).replace(/\s+/g, ' ').trim();
  function scanText(where, text) {
    for (const [rule, re] of TEXT_RULES) {
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
    // KPI cells with no figure.
    if (countryId) {
      let empty = 0;
      ['cv-pop', 'cv-weather', 'cv-time', 'cv-daylight'].forEach(id => {
        const v = document.getElementById(id);
        if (v && /^(—|-|)$/.test((v.textContent || '').trim()) && !/Weather/.test(document.getElementById(id + '-key')?.textContent || '')) empty++;
      });
      if (empty >= 2) note('two or more empty headline figures', where, empty + ' of 4');
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
