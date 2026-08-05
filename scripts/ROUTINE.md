# Routine prompt - weekly quality pass

Paste into Claude Code Routines ("What do you want automated?"). Weekly is enough;
style drift is slow. Runs on your subscription, no API credits.

The bulk writer files all 55 countries nightly. This pass finds where that shows and
rewrites it. It repairs rather than reports - a review that only complains changes
nothing.

---

```
Weekly quality pass on The African Street Journal.
Repo: C:\Users\karan\Documents\James Code\united-africa

1. Find the weak spots. Run:
     powershell -ExecutionPolicy Bypass -File scripts/audit-briefs.ps1 -CheckLinks -Worst 6
   It prints a REWRITE line naming the six weakest country codes. Use exactly those.
   If it reports CRITICAL findings, fix those first - a fabricated source URL is the
   one thing this paper must never publish. If a brief's only source 404s, delete the
   brief. If it has another source that resolves, drop only the dead URL.

2. Rewrite those six countries. For each, search the web for that country's current
   news and write 4-6 briefs. House style:
     - Headline: actor + active verb + the key figure. "Kenya holds base rate at 12.5%
       as shilling steadies", never "Interest rate news". 90 characters maximum.
     - Body: 2-4 sentences. The most important fact AND its number in the first
       sentence. Attribution in the second. Never bury the figure.
     - Figures carry units, direction and a comparison where the source gives one.
     - "why": one concrete sentence on what this changes for money, food, safety,
       business or movement. Not "this could affect the economy".
     - Neutral. Report what happened and attribute claims. No opinion, no loaded
       adjectives, no speculation.
     - Cover what the news warrants - politics, economy, health, climate, agriculture,
       sport, culture. Not five versions of one story.
     - Skip celebrity gossip, net worth, betting, adult content.

3. Only write what your search results support. Never invent a fact, figure, name,
   quote, date or URL. Every brief needs at least one real source: outlet name plus
   the actual article URL from your results. If you cannot source a story, drop it.

4. Write the result to data/manual-briefs.json, keyed by ISO-2 code, in the shape:
     { "ke": [ { "headline": "...", "body": "...", "why": "...",
                 "topic": "Politics", "sources": [ { "name": "...", "url": "https://..." } ] } ] }
   Valid topics: Politics, Business, Sport, Tech, Climate, Agriculture, Culture,
   Health, Education, News.

5. Publish:
     powershell -ExecutionPolicy Bypass -File scripts/add-briefs.ps1
     powershell -ExecutionPolicy Bypass -File scripts/validate-briefs.ps1
     powershell -ExecutionPolicy Bypass -File scripts/audit-briefs.ps1 -CheckLinks
   All three must pass. add-briefs.ps1 writes both data/briefs.js and
   data/briefs-state.json - never hand-edit either, the next automated run rebuilds
   from the state file and would silently drop anything written only to briefs.js.

6. Commit and push to main. Do not push while a desk run is in progress; check with
   gh run list --repo jnkaranja007-pixel/african-street-journal --limit 3

7. Report: which countries you rewrote, what the audit found, and any pattern worth
   fixing in the nightly writer's prompt rather than by hand each week.
```

---

## Notes

- **Six countries per run.** More than that and the session runs out of context
  mid-way. Six weak countries repaired weekly is worth more than 55 skimmed.
- **The audit picks the targets, not you.** That keeps successive runs from
  re-polishing the same countries while genuinely weak ones rot.
- **Local routines need the machine awake.** Schedule it for a time you are working,
  or use a cloud routine.
