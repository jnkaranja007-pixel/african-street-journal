# Go live

Two things need your accounts: an Anthropic API key (the journal's writing) and a GitHub
account (hosting + the daily refresh). Everything else is scripted.

---

## Step 1 — Fill the journal (~20 min)

Get a key at **https://console.anthropic.com/settings/keys**.

Taste test first — 3 countries, a few cents, so you can read the writing before paying for 55:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/go-live.ps1 -Key 'sk-ant-...' -Only ng,ke,za
```

Open `http://localhost:5733` (run `powershell -File serve.ps1` first) and read a few briefs.
Headlines should look like *"Kenya holds base rate at 12.5% as shilling steadies"* — actor,
active verb, the number. If the tone is off, that's a prompt edit in
`scripts/build-briefs.ps1` (the `$SYSTEM` block), not a rebuild.

Happy? Fill the continent:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/go-live.ps1 -Key 'sk-ant-...'
```

Cost is roughly a dollar or two with Haiku. For sharper writing, add `-Model claude-sonnet-4-6`.
Nothing is committed unless the publication gate passes, so a bad run can't damage good data.

---

## Step 2 — Publish (~10 min)

**a. Create an empty repo** at https://github.com/new — name it whatever you like, no README,
no .gitignore (you already have both).

**b. Push:**

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

**c. Add the key as a secret** so the journal refreshes itself:
Settings → Secrets and variables → Actions → New repository secret
Name `ANTHROPIC_API_KEY`, paste your key.

**d. Let the bots commit:**
Settings → Actions → General → Workflow permissions → **Read and write**

**e. Turn on hosting:**
Settings → Pages → Source: Deploy from a branch → `main` / root.
Your URL will be `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

**f. Make links unfurl properly:** in `index.html`, uncomment the `og:url` / `og:image` block
(around line 14) and replace `YOUR-DOMAIN` with your Pages URL. Commit and push.

---

## After that it runs itself

| When | What happens |
|---|---|
| Daily, 05:00 UTC | Claude searches the web, writes ranked briefs for all 55 countries, validates, commits, redeploys |
| Monthly, 3rd | World Bank GDP/growth refresh for all 55 countries |
| Every run | Publication gate blocks malformed data; a country that fails keeps its last good briefs |

You get an email from GitHub only when something fails. Otherwise there is nothing to manage.

To trigger a run by hand: **Actions → Update AI Desk → Run workflow**.

---

## Checking on it

- `http://localhost:5733/?selftest=1` — 26 automated checks, green badge bottom-right
- `powershell -File scripts/validate-briefs.ps1` — is the current data publishable?
- The wire's "Past editions" picker shows every archived day

## If something looks wrong

- **A country shows its region's wire instead of its own stories** — normal until the desk files
  from there; it fills in on the next run.
- **Stories look stale** — check Actions for a failed run. Each country shows its own date, so
  the site never claims data is fresher than it is.
- **A bad run got committed** — `git revert <sha>` and push; the site redeploys.
