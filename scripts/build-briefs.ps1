#Requires -Version 5.1
<#
.SYNOPSIS
  African Street Journal - AI Desk. For each country, Claude SEARCHES THE WEB for the
  most important current news and writes the top stories, ranked by usefulness + popularity,
  with real source citations. Writes data/briefs.js. No RSS aggregator needed.
.DESCRIPTION
  Requires env var ANTHROPIC_API_KEY. Runs daily in GitHub Actions.
  Default model is the cheap/fast tier (Haiku 4.5); pass -Model claude-sonnet-4-6 for
  higher writing/search quality. Web search adds a small per-search fee on top of tokens.
.USAGE
  $env:ANTHROPIC_API_KEY='sk-ant-...'; powershell -File scripts/build-briefs.ps1
  powershell -File scripts/build-briefs.ps1 -Only ng,ke,za     # limit (for testing)
#>
param(
  [string[]]$Only,
  [int]$PerCountry = 8,
  [string]$Model = 'claude-haiku-4-5'
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
- Skip celebrity gossip, "net worth", betting/odds, and adult content entirely.
- Each brief: headline (<= 90 chars), body (2-4 plain sentences), why (one practical sentence
  explaining what the story could affect for citizens, businesses, diaspora, safety, food, money,
  or movement), topic (one of: Politics, Business, Sport, Tech, Climate, Agriculture, Culture,
  Health, Education, News), and 1-3 sources (the outlet name + the real article URL from your
  search results).
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
$jsonOut = ($result | ConvertTo-Json -Depth 8)
if ($result.Count -le 1) { $jsonOut = "{`n$($jsonOut.Trim('{','}'))`n}" }
$mktOut = ($markets | ConvertTo-Json -Depth 8)
if ($markets.Count -le 1) { $mktOut = "{`n$($mktOut.Trim('{','}'))`n}" }
$payload = "// Auto-generated by scripts/build-briefs.ps1 - AI Desk + market heat, web-searched.`r`n" +
           "// Generated: $generated`r`n" +
           "window.UNITED_AFRICA_BRIEFS = { generated: '$generated', byCountry: $jsonOut, markets: $mktOut };`r`n"
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($outPath), $payload, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "[briefs] wrote $total briefs across $($result.Count) countries to data/briefs.js" -ForegroundColor Green
