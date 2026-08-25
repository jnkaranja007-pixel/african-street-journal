# Weekly quality pass

Use this checklist in Codex once a week. It repairs the weakest country desks with
the same evidence, ranking, writing and publication contract as the daily run.

1. Run the quality audit and note the country codes printed after `REWRITE:`.

```powershell
powershell -File scripts/audit-briefs.ps1 -CheckLinks -Worst 6
```

2. If the audit reports a critical citation failure, remove or replace that source
before writing. Never preserve a story whose only citation is dead.

3. Re-run the normal pipeline for exactly those codes. This gathers six fresh
candidates, writes five original stories per country, checks every requested desk,
verifies citations and rebuilds static pages.

```powershell
$env:OPENROUTER_API_KEY = 'sk-or-v1-...'
powershell -File scripts/go-live.ps1 -Only ng,ke,za -NoCommit
```

4. Read at least one story from each repaired country through every audience lens.
The facts and article copy must remain canonical; only order and the grounded
"why" line may change for Farmers, Investors and Diaspora.

5. Run the browser self-test at `http://localhost:5733/?selftest=1`, then inspect
mobile and desktop layouts before committing and pushing.

6. Report the repaired countries, candidate counts, rejected candidates, citation
status, cache use and any repeated weakness that belongs in the ranking or writer
contract rather than another manual rewrite.
