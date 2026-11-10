# On-time desk trigger

GitHub starts the desk's scheduled run (01:40 UTC) five to seven hours late, so the
"morning" edition reaches Nairobi around midday. This Cloudflare Worker starts the
desk on the minute instead, at 01:40 UTC (04:40 in Nairobi) with a retry at 02:40 UTC.
It is free on Cloudflare's Workers free plan. GitHub's own schedule stays on as a
backup; whichever run comes first writes the edition and the rest stop in seconds.

You do this once, in a browser. About ten minutes. Never paste the token anywhere
except the Cloudflare secret box in step 3, and never into a chat.

## 1. Make the GitHub token

1. Open https://github.com/settings/personal-access-tokens/new (Fine-grained tokens).
2. Token name: `ASJ desk trigger`. Expiration: 1 year (put a reminder in your calendar).
3. Repository access: **Only select repositories** -> `african-street-journal`.
4. Permissions -> Repository permissions -> **Actions: Read and write**. Leave
   everything else as "No access".
5. Generate, and copy the token. It is shown once.

## 2. Create the Worker

1. Open https://dash.cloudflare.com -> Workers & Pages -> Create -> Create Worker.
2. Name it `asj-desk-trigger` and deploy the starter.
3. Edit code: replace everything with the contents of `worker.js` in this folder,
   then Deploy.

## 3. Add the token as a secret

Worker -> Settings -> Variables and Secrets -> Add:
- Type: **Secret**
- Name: `GITHUB_TOKEN`
- Value: the token from step 1

Save and deploy.

## 4. Add the schedule

Worker -> Settings -> Trigger events (Cron Triggers) -> Add, twice:
- `40 1 * * *`
- `40 2 * * *`

## Check it worked

The next morning, open https://github.com/jnkaranja007-pixel/african-street-journal/actions/workflows/update-news.yml.
The run should say **workflow_dispatch** and start at 01:40 UTC, not hours later. Its
summary page shows "Written at ... in Nairobi". If nothing ran, the Worker's Logs tab
says why (a wrong or expired token shows as "GitHub answered 401").

When the token expires, make a new one (step 1) and replace the secret (step 3).
