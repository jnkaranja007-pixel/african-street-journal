#Requires -Version 5.1
<#
.SYNOPSIS
  African Street Journal - AI Desk. For each country, Claude SEARCHES THE WEB for the
  most important current news and writes the top stories, ranked by usefulness + popularity,
  with real source citations. Writes data/briefs.js. No RSS aggregator needed.
.DESCRIPTION
  Requires env var ANTHROPIC_API_KEY. Runs daily in GitHub Actions.
  Default model is Claude Sonnet 5: the quality tier for this job - it follows the house
  style spec far more faithfully than Haiku and judges source quality better, which is the
  whole product here. Pass -Model claude-haiku-4-5 to cut cost at the price of writing
  quality, or -Model claude-opus-4-8 for maximum capability at ~2.5x Sonnet's token rate.
  Web search is billed separately at $10 per 1,000 searches, regardless of model.
.USAGE
  $env:ANTHROPIC_API_KEY='sk-ant-...'; powershell -File scripts/build-briefs.ps1
  powershell -File scripts/build-briefs.ps1 -Only ng,ke,za     # limit (for testing)
#>
param(
  [string[]]$Only,
  [int]$PerCountry = 8,
  [string]$Model = 'claude-sonnet-5'
)

$ErrorActionPreference = 'Stop'
$apiKey = $env:ANTHROPIC_API_KEY
if (-not $apiKey) { Write-Host '[briefs] ERROR: set ANTHROPIC_API_KEY' -ForegroundColor Red; exit 1 }
$outPath = Join-Path $PSScriptRoot '..\data\briefs.js'

# ISO-2 -> country name (the app's 55 countries)
$COUNTRIES = [ordered]@{
  dz='Algeria'; ao='Angola'; bj='Benin'; bw='Botswana'; bf='Burkina Faso'; bi='Burundi';
  cm='Cameroon'; cv='Cape Verde'; cf='Central African Republic'; td='Chad'; km='Comoros';
  cg='Republic of the Congo'; cd='Democratic Republic of the Congo'; ci="Cote d'Ivoire";
  dj='Djibouti'; eg='Egypt'; gq='Equatorial Guinea'; er='Eritrea'; sz='Eswatini'; et='Ethiopia';
  ga='Gabon'; gm='Gambia'; gh='Ghana'; gn='Guinea'; gw='Guinea-Bissau'; ke='Kenya'; ls='Lesotho';
  lr='Liberia'; ly='Libya'; mg='Madagascar'; mw='Malawi'; ml='Mali'; mr='Mauritania'; mu='Mauritius';
  ma='Morocco'; mz='Mozambique'; na='Namibia'; ne='Niger'; ng='Nigeria'; rw='Rwanda';
  st='Sao Tome and Principe'; sn='Senegal'; sc='Seychelles'; sl='Sierra Leone'; so='Somalia';
  za='South Africa'; ss='South Sudan'; sd='Sudan'; tz='Tanzania'; tg='Togo'; tn='Tunisia';
  ug='Uganda'; zm='Zambia'; zw='Zimbabwe'; eh='Western Sahara'
}

$SYSTEM = @'
You are a neutral newswire editor for a pan-African news service. For one country, use web
search to find the most important, useful, and widely-followed news happening right now, then
write the top stories as concise, strictly factual, non-biased briefs.

Rules:
- Use web search to ground every brief in real, current reporting. Never invent facts, figures,
  names, quotes, dates, or events. Only write what the search results support.
- RANK the briefs by usefulness and popularity: lead with the stories that matter most to people
  in that country and are most widely followed; put softer items last.
- Neutral tone. Report what happened and attribute claims ("according to ..."). No opinion, no
  loaded adjectives, no speculation, no sensationalism. Cover politics, economy, business, health,
  climate, tech, sport, and culture as the news warrants - not just one topic.
- WRITE IN THE HOUSE STYLE OF A MAJOR FINANCIAL DAILY (Wall Street Journal / Yahoo Finance
  register), while staying strictly neutral:
  * Headlines: specific actor + active verb + the key figure when one exists
    ("Kenya holds base rate at 12.5% as shilling steadies", never "Interest rate news" or
    a vague label). No colons-as-drama, no questions, no all-caps words.
  * Ledes: the single most important fact AND its number in the first sentence; context and
    attribution in the second. Never bury the figure.
  * Numbers carry units, direction, and comparison where the source reports one (percent,
    year-on-year, versus the prior reading). Give the USD equivalent for large local-currency
    figures when the source supports the conversion.
  * Active voice, short plain verbs, no bureaucratic phrasing, no "recently", no exclamation.
- Skip celebrity gossip, "net worth", betting/odds, and adult content entirely.
- Each brief: headline (<= 90 chars), body (2-4 sentences in the style above), why (one crisp
  takeaway sentence in desk-note register: what this changes for money, food, safety, business,
  or movement - concrete, never moralizing), topic (one of: Politics, Business, Sport, Tech,
  Climate, Agriculture, Culture, Health, Education, News), and 1-3 sources (the outlet name +
  the real article URL from your search results).
- ALSO build a "markets" object only when an active domestic or regional exchange can be verified
  from the exchange, regulator, or another primary source. Include the exchange short code (e.g.
  NGX, JSE, NSE), its name, sourceUrl, asOf date, and up to 10 companies as {t: ticker, name:
  company name, cap: approximate market cap in USD billions (a positive number, used for tile size),
  change: most recent verified session percent move as a number (negative if down)}. Never invent a
  price move. If a current move cannot be verified, omit that company. If the country has no verified
  exchange, set markets to null.
- Output ONLY a JSON object (no prose, no markdown fences) with exactly these keys:
  briefs (array of {headline, body, why, topic, sources:[{name,url}]}, ordered best-first) and
  markets (object {exchange, name, sourceUrl, asOf, companies:[{t,name,cap,change}]} or null).
'@

function Get-Briefs($country) {
  $userMsg = "Country: $country.`nSearch the web for the most important current news in $country, then write the top $PerCountry stories as neutral briefs ranked by usefulness and popularity, AND a markets object of the top listed companies on its stock exchange and how they are trading. Output only the JSON object."
  $messages = @(@{ role = 'user'; content = $userMsg })
  for ($turn = 0; $turn -lt 4; $turn++) {
    $body = @{
      model = $Model
      max_tokens = 4000
      system = @(@{ type = 'text'; text = $SYSTEM; cache_control = @{ type = 'ephemeral' } })
      tools = @(@{ type = 'web_search_20250305'; name = 'web_search'; max_uses = 6 })
      messages = $messages
    }
    $tmp = New-TemporaryFile
    ($body | ConvertTo-Json -Depth 14) | Set-Content -Path $tmp -Encoding UTF8
    try {
      $resp = curl.exe -s --max-time 150 https://api.anthropic.com/v1/messages `
        -H "x-api-key: $apiKey" -H 'anthropic-version: 2023-06-01' -H 'content-type: application/json' `
        --data-binary "@$tmp"
    } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
    if (-not $resp) { return $null }
    $parsed = $resp | ConvertFrom-Json
    if ($parsed.error) { Write-Host "    API error: $($parsed.error.message)" -ForegroundColor Red; return $null }
    if ($parsed.stop_reason -eq 'pause_turn') {
      # server tool loop paused - resend to continue
      $messages = @(@{ role = 'user'; content = $userMsg }, @{ role = 'assistant'; content = $parsed.content })
      continue
    }
    $text = (@($parsed.content) | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text }) -join "`n"
    if (-not $text) { return $null }
    # extract the JSON object
    $s = $text.IndexOf('{'); $e = $text.LastIndexOf('}')
    if ($s -lt 0 -or $e -le $s) { return $null }
    try { return ($text.Substring($s, $e - $s + 1) | ConvertFrom-Json) } catch { return $null }
  }
  return $null
}

Write-Host "[briefs] AI Desk via web search (model: $Model)" -ForegroundColor Cyan
$codes = @($COUNTRIES.Keys)
if ($Only) { $codes = $codes | Where-Object { $Only -contains $_ } }

$result = [ordered]@{}
$markets = [ordered]@{}
$total = 0
foreach ($code in $codes) {
  Write-Host "  $code  $($COUNTRIES[$code])" -ForegroundColor Yellow
  $data = $null
  try { $data = Get-Briefs $COUNTRIES[$code] } catch { Write-Host "    $($_.Exception.Message)" -ForegroundColor Red }
  if ($data) {
    $clean = @($data.briefs | Where-Object { $_.headline -and $_.body } | Select-Object -First $PerCountry)
    if ($clean.Count) { $result[$code] = $clean; $total += $clean.Count }
    if ($data.markets -and $data.markets.companies) { $markets[$code] = $data.markets }
  }
  Start-Sleep -Milliseconds 400
}

$generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

# Merge with the previous run so a flaky country NEVER loses coverage: any country that
# failed this run keeps its last successful briefs, stamped with their original date
# (data/briefs-state.json is the pure-JSON state file the merge reads and rewrites).
$statePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\data\briefs-state.json'))
$briefDates = [ordered]@{}
foreach ($code in @($result.Keys)) { $briefDates[$code] = $generated }
$prev = $null
if (Test-Path $statePath) { try { $prev = Get-Content $statePath -Raw | ConvertFrom-Json } catch { $prev = $null } }
if ($prev -and $prev.byCountry) {
  foreach ($p in $prev.byCountry.PSObject.Properties) {
    if (-not $result.Contains($p.Name)) {
      $result[$p.Name] = $p.Value
      $carried = if ($prev.dates -and $prev.dates.PSObject.Properties[$p.Name]) { $prev.dates.($p.Name) } else { $prev.generated }
      $briefDates[$p.Name] = $carried
      Write-Host "  carried $($p.Name) briefs from $carried (no fresh stories this run)" -ForegroundColor DarkYellow
    }
  }
  if ($prev.markets) {
    foreach ($m in $prev.markets.PSObject.Properties) {
      if (-not $markets.Contains($m.Name)) { $markets[$m.Name] = $m.Value }
    }
  }
}

$jsonOut = ($result | ConvertTo-Json -Depth 8)
if ($result.Count -le 1) { $jsonOut = "{`n$($jsonOut.Trim('{','}'))`n}" }
$mktOut = ($markets | ConvertTo-Json -Depth 8)
if ($markets.Count -le 1) { $mktOut = "{`n$($mktOut.Trim('{','}'))`n}" }
$datesOut = ($briefDates | ConvertTo-Json -Depth 3)
if ($briefDates.Count -le 1) { $datesOut = "{`n$($datesOut.Trim('{','}'))`n}" }
$payload = "// Auto-generated by scripts/build-briefs.ps1 - AI Desk + market heat, web-searched.`r`n" +
           "// Generated: $generated`r`n" +
           "window.UNITED_AFRICA_BRIEFS = { generated: '$generated', dates: $datesOut, byCountry: $jsonOut, markets: $mktOut };`r`n"
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($outPath), $payload, (New-Object System.Text.UTF8Encoding($false)))
$state = [ordered]@{ generated = $generated; dates = $briefDates; byCountry = $result; markets = $markets }
[System.IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "[briefs] wrote $total fresh briefs; $($result.Count) countries total in data/briefs.js" -ForegroundColor Green

# Archive: a journal keeps a record. Save today's edition and refresh the edition index
# (data/archive/index.js drives the "Past editions" picker on the continental wire).
$day = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
$archiveDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\data\archive'))
if (-not (Test-Path $archiveDir)) { New-Item -ItemType Directory -Path $archiveDir | Out-Null }
$archPayload = "// The African Street Journal - archived edition $day (auto-generated).`r`n" +
               "window.__ASJ_ARCHIVE_DAY = { date: '$day', generated: '$generated', byCountry: $jsonOut, markets: $mktOut };`r`n"
[System.IO.File]::WriteAllText((Join-Path $archiveDir "$day.js"), $archPayload, (New-Object System.Text.UTF8Encoding($false)))
$dates = @(Get-ChildItem $archiveDir -Filter '*.js' | Where-Object { $_.BaseName -match '^\d{4}-\d{2}-\d{2}$' } |
           ForEach-Object { $_.BaseName } | Sort-Object -Descending)
$idxJson = '[' + (($dates | ForEach-Object { '"' + $_ + '"' }) -join ',') + ']'
[System.IO.File]::WriteAllText((Join-Path $archiveDir 'index.js'), "window.UNITED_AFRICA_ARCHIVE_INDEX = $idxJson;`r`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Host "[briefs] archived edition $day ($($dates.Count) editions in index)" -ForegroundColor Green
