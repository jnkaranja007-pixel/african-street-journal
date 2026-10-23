# afx-relay

Lets the GitHub workflow refresh exchange listings without the owner's PC.

`afx.kwayisi.org` drops traffic from GitHub's runners, so `update-markets.yml` timed out
every day (16-20 Oct 2026). Since then the listings have been refreshed by a scheduled task on
the owner's PC (`scripts/refresh-markets-desktop.ps1`, daily at 18:30). That only works while
the PC is on.

This Worker fetches the same ten public listing pages through Cloudflare. It serves nothing
else: other paths return 404, and only GET is allowed. Each page is cached for 30 minutes.

## Deploy (about five minutes, no Node needed)

1. In the Cloudflare dashboard: **Workers & Pages > Create > Create Worker**. Name it
   `afx-relay` and click **Deploy**.
2. Click **Edit code**, replace everything with the contents of `worker.js`, then **Deploy**.
3. Open `https://afx-relay.<your-subdomain>.workers.dev/nse/` in a browser. You should see
   the Nairobi Securities Exchange listing page. A 404 means the path is wrong; a 403 or 503
   means AFX blocks Cloudflare too. In that case, delete the Worker and keep the desktop task.
4. In GitHub: **Settings > Secrets and variables > Actions > Variables > New repository
   variable**. Name `ASJ_AFX_RELAY`, value `https://afx-relay.<your-subdomain>.workers.dev`.
5. Run **Actions > Refresh market data > Run workflow**. The log should list rows for each
   exchange.

Once the workflow refreshes listings on its own, the desktop task can be switched off:
`Disable-ScheduledTask -TaskName 'ASJ markets refresh'`. It can also stay on as a backup,
because both commit the same file.

## Undo

Delete the `ASJ_AFX_RELAY` variable. The workflow goes back to fetching AFX directly.
