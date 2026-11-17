#Requires -Version 5.1
<#
.SYNOPSIS
  Refresh headline stock-exchange indices into data/indices.js.
.DESCRIPTION
  afx.kwayisi.org (company listings) drops GitHub runner traffic, so company tables go
  stale for weeks. african-markets.com answers runners (probed 21 Oct 2026) and its
  exchange pages carry one table with every tracked African index, its level, its day
  move and the session date. That is a small, honest, daily signal: one number per
  exchange with the date it is from.

  From 1 Nov 2026 african-markets.com redirected every page to a maintenance notice and
  this script kept the old file for ten days while the workflow showed green. So:
    - a page with no tables is reported as the source being down, not as a layout change;
    - exchanges it did not supply are filled from afx.kwayisi.org's exchange pages (one
      sentence per page: "the benchmark ... Index (ASI) pared 451.92 (-0.18%) points to
      close at 251,861.24"), through the ASJ_AFX_RELAY Worker when that is set;
    - an exchange neither source supplied keeps its previous row and date, which the
      site labels stale after 7 days;
    - each row names its own source.

  17 Nov 2026: afx refuses Cloudflare as well as GitHub, and african-markets.com was still
  down, so only the owner's PC could refresh anything. The owner asked for layers that do
  not need the PC. Each exchange now takes the first source that answers, in this order:
    1. quote feeds: TradingView's scanner (JSE, NGX, EGX, Casablanca, Tunis), then Yahoo
       Finance for the JSE; both answer data-centre traffic and return JSON with a date;
    2. african-markets.com (when it is back);
    3. the exchanges' own sites, where the index and its date are in the page: Nairobi
       (market statistics, "as of" date), Dar es Salaam (DSEI tile, dated daily report),
       Kigali (the page's dated index series);
    4. afx.kwayisi.org, which answers only from the owner's PC.
  A source never replaces a row with an older session than the one already published.

  Also 17 Nov 2026, for when an exchange redesigns its site: every source passes the same
  checks (Add-IndexRow: no future dates, no older sessions, no move of more than 20% from
  the published level), and a site whose parser stops matching is flagged as a workflow
  warning and then read twice more: by meaning (the index's name, the number after it
  nearest the published level, the date printed nearest that number), then by an AI
  reader (OpenRouter, OPENROUTER_API_KEY) that must quote the level and date exactly as
  they appear in the page. A repaired row leaves the day's move blank.

  Rules: never invent a number. A row whose level does not parse is dropped. If fewer
  than 4 indices come back fresh, the old file is kept and the script exits 1 so the
  workflow reports it.
#>
param([int]$TimeoutSec = 25, [int]$MinRows = 4)
$ErrorActionPreference = 'Stop'
# Runs under pwsh 7 on GitHub and under Windows PowerShell 5.1 from the owner's PC
# (scripts/refresh-markets-desktop.ps1), because AFX answers a desktop but not runners.
# 5.1 needs TLS 1.2 switched on and -UseBasicParsing; both are harmless under pwsh.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$root = Split-Path $PSScriptRoot -Parent
$outPath = Join-Path $root 'data/indices.js'
$src = 'https://www.african-markets.com/en/stock-markets/jse'
$AfxBase = if ($env:ASJ_AFX_RELAY) { $env:ASJ_AFX_RELAY.TrimEnd('/') } else { 'https://afx.kwayisi.org' }

# Index label prefix -> exchange code, display name, countries served.
$MAP = [ordered]@{
  'BRVM'     = @{ code='BRVM'; name='BRVM Composite';        countries=@('ci','bj','bf','ml','ne','sn','tg','gw') }
  'BSE'      = @{ code='BSE';  name='BSE Domestic Company Index'; countries=@('bw') }
  'DSE'      = @{ code='DSE';  name='DSE All Share';         countries=@('tz') }
  'EGX'      = @{ code='EGX';  name='EGX 30';                countries=@('eg') }
  'GSE'      = @{ code='GSE';  name='GSE Composite';         countries=@('gh') }
  'JSE'      = @{ code='JSE';  name='JSE All Share';         countries=@('za') }
  'LuSE'     = @{ code='LuSE'; name='LuSE All Share';        countries=@('zm') }
  'MASI'     = @{ code='CSE';  name='Casablanca MASI';       countries=@('ma') }
  'MSE'      = @{ code='MSE';  name='MSE All Share';         countries=@('mw') }
  'NGX'      = @{ code='NGX';  name='NGX All Share';         countries=@('ng') }
  'NSE'      = @{ code='NSE';  name='NSE All Share';         countries=@('ke') }
  'NSX'      = @{ code='NSX';  name='NSX Overall';           countries=@('na') }
  'RSE'      = @{ code='RSE';  name='RSE All Share';         countries=@('rw') }
  'SEM'      = @{ code='SEM';  name='SEMDEX';                countries=@('mu') }
  'TUNINDEX' = @{ code='BVMT'; name='TUNINDEX';              countries=@('tn') }
  'USE'      = @{ code='USE';  name='USE All Share';         countries=@('ug') }
  'ZSE'      = @{ code='ZSE';  name='ZSE All Share';         countries=@('zw') }
}
# afx.kwayisi.org exchange page slug -> the MAP entry it fills.
$AFX = [ordered]@{ ngx='NGX'; nse='NSE'; jse='JSE'; gse='GSE'; use='USE'; zse='ZSE'; bse='BSE'; luse='LuSE'; mse='MSE'; brvm='BRVM' }

function Strip([string]$h) { ([Net.WebUtility]::HtmlDecode(($h -replace '<[^>]+>', ''))).Trim() }
function Get-Page([string]$Url, [int]$Tries) {
  for ($i = 1; $i -le $Tries; $i++) {
    try {
      return (Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec -UserAgent 'Mozilla/5.0 (compatible; ASJ-indices/1.0; +https://africanstreetjournal.com)').Content
    } catch { Write-Host "[indices] $Url attempt $i failed: $($_.Exception.Message.Split("`n")[0])"; if ($i -lt $Tries) { Start-Sleep -Seconds (3 * $i) } }
  }
  # nse.co.ke sends a malformed header line ("CR must be followed by LF") that .NET
  # refuses; curl reads it. curl.exe ships with Windows 10+ and every runner image.
  $curl = Get-Command curl -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($curl) {
    $out = & $curl.Source -sL --max-time $TimeoutSec -A 'Mozilla/5.0 (compatible; ASJ-indices/1.0; +https://africanstreetjournal.com)' $Url 2>$null
    if ($LASTEXITCODE -eq 0 -and $out) { Write-Host "[indices] $Url read with curl"; return ($out -join "`n") }
  }
  return $null
}

$prev = $null
if (Test-Path $outPath) {
  $old = [regex]::Match([IO.File]::ReadAllText($outPath), 'window\.ASJ_INDICES = (\{.*\});', 'Singleline')
  if ($old.Success) { $prev = $old.Groups[1].Value | ConvertFrom-Json }
}
$today = [DateTime]::UtcNow.Date
$rows = [ordered]@{}
$Inv = [Globalization.CultureInfo]::InvariantCulture

# Test hook: ASJ_INDICES_SKIP=structured,generic makes the site layer fall through to the
# AI reader, so the repair path can be proven on a day when the parsers still work.
$Skip = @(if ($env:ASJ_INDICES_SKIP) { $env:ASJ_INDICES_SKIP -split ',' | ForEach-Object { $_.Trim() } })

function Get-PublishedRow([string]$Code) {
  if (-not $prev -or -not $prev.indices.$Code) { return $null }
  $kept = $prev.indices.$Code
  $d = $kept.date; if ($d -is [datetime]) { $d = $d.ToString('yyyy-MM-dd') }
  return @{ level = [double]$kept.level; date = [string]$d; label = [string]$kept.label }
}

# Every source goes through here, so a broken parser cannot publish nonsense. A row is
# refused when an earlier source already supplied it, the level is not positive, the date
# is malformed or in the future, the published row is from a later session, or the level
# moved more than 20% from the published one (40% after a gap of over two weeks): no
# African benchmark moves that far in a session, but a misread number easily does.
function Add-IndexRow([string]$Code, [double]$Level, $Pct, [string]$Date, [string]$Source, [string]$Label = '') {
  if ($rows.Contains($Code) -or $Level -le 0 -or $Date -notmatch '^\d{4}-\d{2}-\d{2}$') { return }
  if ($Date -gt $today.AddDays(1).ToString('yyyy-MM-dd')) { Write-Host "::warning::[indices] $Source $Code date $Date is in the future; refused"; return }
  $entry = $MAP.Values | Where-Object { $_.code -eq $Code } | Select-Object -First 1
  if (-not $entry) { return }
  $useLabel = if ($Label) { $Label } else { $entry.name }
  $kept = Get-PublishedRow $Code
  if ($kept) {
    if ($kept.date -gt $Date) { Write-Host "[indices] $Source $Code $Date is older than the published $($kept.date); skipped"; return }
    if ($kept.level -gt 0) {
      $gap = ([datetime]::ParseExact($Date, 'yyyy-MM-dd', $Inv) - [datetime]::ParseExact($kept.date, 'yyyy-MM-dd', $Inv)).TotalDays
      $limit = if ($gap -le 14) { 0.2 } else { 0.4 }
      if ([Math]::Abs($Level / $kept.level - 1) -gt $limit) { Write-Host "::warning::[indices] $Source $Code $Level is more than $([int]($limit * 100))% from the published $($kept.level); refused as a likely misread"; return }
    }
    if ($kept.label) { $useLabel = $kept.label }
  }
  if ($null -ne $Pct) { $Pct = [Math]::Round([double]$Pct, 2) }
  $rows[$Code] = [ordered]@{ code=$Code; label=$useLabel; name=$entry.name; level=$Level; changePct=$Pct; date=$Date; countries=$entry.countries; source=$Source }
  Write-Host "[indices] $Source -> $Code $Level ($Pct%) $Date"
}

# Dates as pages write them: 2026-11-17, 17-Nov-2026, 17 November 2026, Nov 17, 2026.
# Slash dates (11/12/2026) are left out on purpose: day-first or month-first is a guess.
# Find-Dates returns each one that is not in the future, with where it sits in the text.
$MonthRx = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?'
function Find-Dates([string]$Text) {
  $limit = $today.AddDays(1)
  $found = @()
  $rx = "\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}(?:st|nd|rd|th)?[\s-]+$MonthRx,?[\s-]+\d{4}\b|\b$MonthRx\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b"
  foreach ($m in [regex]::Matches($Text, $rx, 'IgnoreCase')) {
    $norm = $m.Value -replace '(\d)(st|nd|rd|th)\b', '$1' -replace '[,.]', '' -replace '-', ' ' -replace '\bSept\b', 'Sep' -replace '\s+', ' '
    $d = [datetime]::MinValue
    if ($m.Value -match '^\d{4}-\d{2}-\d{2}$') { $ok = [datetime]::TryParseExact($m.Value, 'yyyy-MM-dd', $Inv, 'None', [ref]$d) }
    else { $ok = [datetime]::TryParseExact($norm, [string[]]@('d MMM yyyy', 'd MMMM yyyy', 'MMM d yyyy', 'MMMM d yyyy'), $Inv, 'AllowWhiteSpaces', [ref]$d) }
    if ($ok -and $d -le $limit -and $d.Year -ge 2020) { $found += @{ d = $d.ToString('yyyy-MM-dd'); at = $m.Index } }
  }
  return ,$found
}
function Find-NewestDate([string]$Text) {
  $all = Find-Dates $Text
  if (-not $all.Count) { return $null }
  return ($all | ForEach-Object { $_.d } | Sort-Object -Descending | Select-Object -First 1)
}

# Visible text of a page: scripts and styles dropped, tags become spaces so adjacent cells
# ("240.90" and "-0.66") do not run together.
function Get-PageText([string]$Html) {
  [Net.WebUtility]::HtmlDecode((($Html -replace '(?s)<script.*?</script>|<style.*?</style>', ' ') -replace '<[^>]+>', ' ')) -replace '\s+', ' '
}

# Reading by meaning, for when a site is redesigned: find the index's name anywhere in the
# visible text, take the numbers just after each mention, and keep the one nearest the
# published level (within 20%). The date is the one printed nearest that number, within
# 600 characters either side; with no date near it the page is not used.
function Find-ByMeaning([string]$Text, [string]$LabelRx, [double]$Near) {
  if ($Near -le 0) { return $null }
  $best = $null
  foreach ($m in [regex]::Matches($Text, $LabelRx, 'IgnoreCase')) {
    $win = $Text.Substring($m.Index, [Math]::Min(250, $Text.Length - $m.Index))
    foreach ($n in [regex]::Matches($win, '(?<![\d.,])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])|(?<![\d.,])\d+\.\d+(?![\d.])')) {
      $v = [double]::Parse(($n.Value -replace ',', ''), $Inv)
      $dist = [Math]::Abs($v / $Near - 1)
      if ($dist -le 0.2 -and (-not $best -or $dist -lt $best.dist)) { $best = @{ v = $v; dist = $dist; at = $m.Index + $n.Index } }
    }
  }
  if (-not $best) { return $null }
  $from = [Math]::Max(0, $best.at - 600)
  $dates = Find-Dates ($Text.Substring($from, [Math]::Min(1200, $Text.Length - $from)))
  if (-not $dates.Count) { return $null }
  $pos = $best.at - $from
  $d = ($dates | Sort-Object { [Math]::Abs($_.at - $pos) } | Select-Object -First 1).d
  return @{ level = $best.v; pct = $null; date = $d }
}

# The AI reader, the last repair step. It is handed the page we fetched and asked to point
# at the number, never to supply one: both strings it returns must appear verbatim in the
# page text, and the level must pass the same 20% check as every other source.
$AiModel = if ($env:ASJ_INDICES_MODEL) { $env:ASJ_INDICES_MODEL } else { 'google/gemini-2.5-flash-lite' }
function Read-WithAi([string]$Name, [string]$Site, [string]$Text, [string]$LabelRx, [double]$Near) {
  if (-not $env:OPENROUTER_API_KEY -or $Near -le 0) { return $null }
  $parts = @(); $spans = @([regex]::Matches($Text, $LabelRx, 'IgnoreCase') | Select-Object -First 4)
  foreach ($m in $spans) { $from = [Math]::Max(0, $m.Index - 1500); $parts += $Text.Substring($from, [Math]::Min(3000, $Text.Length - $from)) }
  $excerpt = if ($parts.Count) { ($parts -join "`n...`n") } else { $Text }
  if ($excerpt.Length -gt 9000) { $excerpt = $excerpt.Substring(0, 9000) }
  $ask = "Below is text from the web page of $Site. Find the most recent closing level of the $Name and the trading date that level is for. Copy both exactly as they are written in the text; do not calculate, round or reformat. Reply with JSON only, in this shape: {`"level`": `"...`", `"date`": `"...`"}. If the text does not show both, reply {`"level`": null, `"date`": null}.`n`nPAGE TEXT:`n$excerpt"
  $body = @{ model = $AiModel; temperature = 0; max_tokens = 120; messages = @(@{ role = 'user'; content = $ask }) } | ConvertTo-Json -Depth 5
  try {
    $resp = Invoke-RestMethod -Method Post -Uri 'https://openrouter.ai/api/v1/chat/completions' -TimeoutSec 60 -ContentType 'application/json; charset=utf-8' `
      -Headers @{ Authorization = "Bearer $env:OPENROUTER_API_KEY"; 'HTTP-Referer' = 'https://africanstreetjournal.com'; 'X-Title' = 'ASJ indices' } -Body ([Text.Encoding]::UTF8.GetBytes($body))
    $said = [regex]::Match([string]$resp.choices[0].message.content, '(?s)\{.*\}').Value | ConvertFrom-Json
  } catch { Write-Host "[indices] AI reader for ${Site}: $($_.Exception.Message.Split("`n")[0])"; return $null }
  $lvlText = [string]$said.level; $dateText = [string]$said.date
  if (-not $lvlText -or -not $dateText) { Write-Host "[indices] AI reader for ${Site}: the page does not show both a level and a date"; return $null }
  if (-not $Text.Contains($lvlText) -or -not $Text.Contains($dateText)) { Write-Host "[indices] AI reader for ${Site}: '$lvlText' / '$dateText' is not in the page; refused"; return $null }
  $v = 0.0
  if (-not [double]::TryParse(($lvlText -replace '[^\d.]', ''), [Globalization.NumberStyles]::Float, $Inv, [ref]$v)) { return $null }
  $d = Find-NewestDate $dateText
  if (-not $d) { Write-Host "[indices] AI reader for ${Site}: could not read the date '$dateText'"; return $null }
  return @{ level = $v; pct = $null; date = $d }
}
# A POST for APIs that answer nothing else (bse.co.bw), with the same curl fallback.
function Post-Page([string]$Url, [string]$Body = '') {
  try {
    return (Invoke-WebRequest -UseBasicParsing -Method Post -Uri $Url -Body $Body -ContentType 'application/json' -TimeoutSec $TimeoutSec -UserAgent 'Mozilla/5.0 (compatible; ASJ-indices/1.0; +https://africanstreetjournal.com)').Content
  } catch { Write-Host "[indices] POST $Url failed: $($_.Exception.Message.Split("`n")[0])" }
  $curl = Get-Command curl -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($curl) {
    $out = & $curl.Source -sL -X POST -H 'Content-type: application/json' --max-time $TimeoutSec -A 'Mozilla/5.0 (compatible; ASJ-indices/1.0; +https://africanstreetjournal.com)' $Url 2>$null
    if ($LASTEXITCODE -eq 0 -and $out) { Write-Host "[indices] POST $Url read with curl"; return ($out -join "`n") }
  }
  return $null
}
# A date from JSON as yyyy-MM-dd: pwsh's ConvertFrom-Json may already have made it a
# [datetime]; otherwise "2026-11-16", "2026-11-16T00:00:00" or "2026/11/16". Else $null.
function Get-AnyDay($Value) {
  if ($Value -is [datetime]) { return $Value.ToString('yyyy-MM-dd') }
  $s = [string]$Value
  if ($s -match '^(\d{4})[-/](\d{2})[-/](\d{2})') { return "$($Matches[1])-$($Matches[2])-$($Matches[3])" }
  return $null
}
function Get-UnixDay($Seconds) { [DateTimeOffset]::FromUnixTimeSeconds([long]$Seconds).UtcDateTime.ToString('yyyy-MM-dd') }

# 1a. TradingView's scanner: one JSON object per index. "time" is the opening time of the
#     latest session (07:00-09:00 UTC for these exchanges), so its UTC date is the session.
$TV = [ordered]@{ 'JSE:J203'='JSE'; 'NSENG:ASI'='NGX'; 'EGX:EGX30'='EGX'; 'CSEMA:MASI'='CSE'; 'BVMT:PX1'='BVMT' }
foreach ($sym in $TV.Keys) {
  $json = Get-Page ('https://scanner.tradingview.com/symbol?symbol=' + [uri]::EscapeDataString($sym) + '&fields=close,change,time') 2
  if (-not $json) { continue }
  try { $q = ($json | ConvertFrom-Json) } catch { Write-Host "::warning::[indices] tradingview ${sym}: answered, but not with JSON (has the feed changed?)"; continue }
  if ($null -eq $q.close -or $null -eq $q.time) { Write-Host "::warning::[indices] tradingview ${sym}: JSON without close or time (has the feed changed?)"; continue }
  Add-IndexRow $TV[$sym] ([double]$q.close) $q.change (Get-UnixDay $q.time) 'tradingview.com'
}

# 1b. Yahoo Finance chart API, a second feed for the JSE.
if (-not $rows.Contains('JSE')) {
  $json = Get-Page 'https://query1.finance.yahoo.com/v8/finance/chart/%5EJ203.JO?range=5d&interval=1d' 2
  if ($json) {
    try {
      $meta = ($json | ConvertFrom-Json).chart.result[0].meta
      if ($meta.regularMarketPrice -and $meta.regularMarketTime) {
        Add-IndexRow 'JSE' ([double]$meta.regularMarketPrice) $meta.regularMarketChangePercent (Get-UnixDay $meta.regularMarketTime) 'finance.yahoo.com'
      }
    } catch { Write-Host '[indices] yahoo: unexpected response' }
  }
}

# 2. african-markets.com: every index in one table.
$html = Get-Page $src 3
if (-not $html) { Write-Host '[indices] african-markets.com unreachable' }
elseif ($html -notmatch '<table') { Write-Host '[indices] african-markets.com answered with no tables: the site is down or redirecting (it showed a maintenance page from 1 Nov 2026)' }
else {
  foreach ($t in [regex]::Matches($html, '<table.*?</table>', 'Singleline')) {
    foreach ($r in [regex]::Matches($t.Value, '<tr.*?</tr>', 'Singleline')) {
      $cells = @([regex]::Matches($r.Value, '<td.*?</td>', 'Singleline') | ForEach-Object { Strip $_.Value })
      if ($cells.Count -lt 5) { continue }
      $label = $cells[1]; $lvl = $cells[2] -replace ',', ''; $chg = $cells[3]; $dm = $cells[4]
      $key = ($MAP.Keys | Where-Object { $label.StartsWith($_) } | Select-Object -First 1)
      if (-not $key) { continue }
      $level = 0.0
      if (-not [double]::TryParse($lvl, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$level) -or $level -le 0) { continue }
      if ($dm -notmatch '^(\d{1,2})/(\d{1,2})$') { continue }
      $d = [DateTime]::new($today.Year, [int]$Matches[2], [int]$Matches[1])
      if ($d -gt $today.AddDays(2)) { $d = $d.AddYears(-1) }
      $pct = $null
      if ($chg -match '^([+-]?\d+(\.\d+)?)%$') { $pct = [double]$Matches[1] }
      Add-IndexRow $MAP[$key].code $level $pct $d.ToString('yyyy-MM-dd') 'african-markets.com' $label
    }
  }
  Write-Host "[indices] african-markets.com: $($rows.Count) indices"
}

# 3. The exchanges' own sites, for the ones still missing. Each has a parser written for
#    its current layout. A parser returns a row, 'skip' (the layout matched but there is
#    nothing fresh to take), or $null (the layout no longer matches). On $null the run is
#    flagged so the parser gets fixed, and the page is read twice more before giving up:
#    by meaning (Find-ByMeaning), then by the AI reader. Both repairs leave the day's move
#    blank rather than work one out, and sameDay sites (no session date of their own)
#    accept a repaired row only for today's date in East Africa.
$EatToday = [DateTime]::UtcNow.AddHours(3).ToString('yyyy-MM-dd')
$SITES = @(
  # Nairobi: "Statistics as of 17-Nov-2026 ... NSE ALL SHARE INDEX 240.90 -0.66" (the
  # change is in points; the percentage is worked out from the previous close).
  @{ code = 'NSE'; site = 'nse.co.ke'; url = 'https://www.nse.co.ke/dataservices/market-statistics/'
     name = 'NSE All Share Index (NASI)'; labelRx = 'NSE ALL SHARE|\bNASI\b'; sameDay = $false
     parse = {
       param($page)
       $text = Get-PageText $page
       $asOf = [regex]::Match($text, 'Statistics as of (\d{1,2}-[A-Za-z]{3}-\d{4})')
       $hit = [regex]::Match($text, 'NSE ALL SHARE INDEX (?<lvl>[\d,]+\.\d+) (?<chg>[+-]?[\d,]+\.\d+)')
       if (-not $asOf.Success -or -not $hit.Success) { return $null }
       $level = [double]::Parse(($hit.Groups['lvl'].Value -replace ',', ''), $Inv)
       $chg = [double]::Parse(($hit.Groups['chg'].Value -replace ',', ''), $Inv)
       $pct = if ($level - $chg -gt 0) { $chg / ($level - $chg) * 100 } else { $null }
       return @{ level = $level; pct = $pct; date = [datetime]::ParseExact($asOf.Groups[1].Value, 'd-MMM-yyyy', $Inv).ToString('yyyy-MM-dd') }
     } }
  # Dar es Salaam: the DSEI tile on the home page (level, and a % whose direction is the
  # tile's text-up/text-down class). The page carries no session date of its own, so the
  # row is taken only when the newest "Daily Market Report" is today's (East Africa time);
  # otherwise the number could be filed under the wrong day.
  @{ code = 'DSE'; site = 'dse.co.tz'; url = 'https://www.dse.co.tz/'
     name = 'DSE All Share Index (DSEI)'; labelRx = '\bDSEI\b|All Share Index'; sameDay = $true
     parse = {
       param($page)
       $tile = [regex]::Match($page, '(?s)DSEI</span><span[^>]*text-(?<dir>up|down)[^>]*>(?:(?!</span>).)*?(?<pct>\d+(?:\.\d+)?)<!-- -->%</span></div><span[^>]*>(?<lvl>[\d,]+\.\d+)</span>')
       $reports = @([regex]::Matches($page, 'Daily Market Report (\d{4}-\d{2}-\d{2})') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Descending)
       if (-not $tile.Success -or -not $reports.Count) { return $null }
       if ($reports[0] -ne $EatToday) { Write-Host "[indices] dse.co.tz: newest daily report is $($reports[0]), not $EatToday; skipped"; return 'skip' }
       $pct = [double]::Parse($tile.Groups['pct'].Value, $Inv); if ($tile.Groups['dir'].Value -eq 'down') { $pct = -$pct }
       return @{ level = [double]::Parse(($tile.Groups['lvl'].Value -replace ',', ''), $Inv); pct = $pct; date = $reports[0] }
     } }
  # Kigali: the home page embeds the index series as {"closing_date":..,"RSI":..,"ALSI":..};
  # ALSI is the RSE All Share Index.
  @{ code = 'RSE'; site = 'rse.rw'; url = 'https://www.rse.rw/'
     name = 'RSE All Share Index (ALSI)'; labelRx = '\bALSI\b|All Share'; sameDay = $false
     parse = {
       param($page)
       $pts = @([regex]::Matches($page, '\{"closing_date":"(?<d>\d{4}-\d{2}-\d{2})","RSI":"[\d.]+","ALSI":"(?<v>[\d.]+)"\}') | ForEach-Object { [pscustomobject]@{ d = $_.Groups['d'].Value; v = [double]::Parse($_.Groups['v'].Value, $Inv) } } | Sort-Object d)
       if ($pts.Count -lt 2) { return $null }
       $last = $pts[-1]; $before = $pts[-2]
       return @{ level = $last.v; pct = $(if ($before.v -gt 0) { ($last.v - $before.v) / $before.v * 100 } else { $null }); date = $last.d }
     } }
  # Accra: the home page's "Index Performance" table, "PREVIOUS (16/11/2026) 13,892.29 ...
  # CURRENT (17/11/2026) 13,887.10" (GSE-CI first, then GSE-FSI). Dates are day/month,
  # and CURRENT must be later than PREVIOUS or the row is not used.
  @{ code = 'GSE'; site = 'gse.com.gh'; url = 'https://gse.com.gh/'
     name = 'GSE Composite Index (GSE-CI)'; labelRx = 'GSE[- ]CI|Composite Index'; sameDay = $false
     parse = {
       param($page)
       $hit = [regex]::Match((Get-PageText $page), 'PREVIOUS \((?<pd>\d{2}/\d{2}/\d{4})\) (?<p>[\d,]+\.\d+) .{0,60}?CURRENT \((?<d>\d{2}/\d{2}/\d{4})\) (?<c>[\d,]+\.\d+)')
       if (-not $hit.Success) { return $null }
       $pd = [datetime]::ParseExact($hit.Groups['pd'].Value, 'dd/MM/yyyy', $Inv); $d = [datetime]::ParseExact($hit.Groups['d'].Value, 'dd/MM/yyyy', $Inv)
       if ($d -le $pd) { return $null }
       $p = [double]::Parse(($hit.Groups['p'].Value -replace ',', ''), $Inv); $c = [double]::Parse(($hit.Groups['c'].Value -replace ',', ''), $Inv)
       return @{ level = $c; pct = $(if ($p -gt 0) { ($c - $p) / $p * 100 } else { $null }); date = $d.ToString('yyyy-MM-dd') }
     } }
  # Harare: zse.co.zw is a Next.js app that loads its indices from this JSON API (found in
  # the site's script bundle, 17 Nov 2026). If the API moves, look for "fetch/indices" in
  # the bundles under https://www.zse.co.zw/_next/static/chunks/.
  @{ code = 'ZSE'; site = 'zse.co.zw'; url = 'https://ds88jcmqc11je.cloudfront.net/api/fetch/indices?exchange=ZSE'
     name = 'ZSE All Share Index'; labelRx = 'ALL SHARE'; sameDay = $false
     parse = {
       param($page)
       try { $j = ($page | ConvertFrom-Json) } catch { return $null }
       $r = @($j.data | Where-Object { $_.index -eq 'ALL SHARE' }) | Select-Object -First 1
       if (-not $r -or -not $r.close -or @($r.latestDate).Count -ne 3) { return $null }
       $ld = @($r.latestDate)
       return @{ level = [Math]::Round([double]$r.close, 2); pct = $r.percentageChange; date = ('{0:D4}-{1:D2}-{2:D2}' -f [int]$ld[0], [int]$ld[1], [int]$ld[2]) }
     } }
  # Windhoek: nsx.com.na embeds Iress market-data widgets; the one whose data is security
  # N098 (NSX Overall) carries a dated close series in its __NEXT_DATA__ block.
  @{ code = 'NSX'; site = 'nsx.com.na'; url = 'https://nsx.com.na/'
     name = 'NSX Overall Index'; labelRx = 'N098|Overall'; sameDay = $false
     fetch = {
       $front = Get-Page 'https://nsx.com.na/' 2
       if (-not $front) { return $null }
       foreach ($m in [regex]::Matches($front, 'https://df\.marketdata\.feeds\.iress\.com/feed/\d+/\?token=[^"''\s<>]+')) {
         $feed = Get-Page ($m.Value -replace '&amp;', '&') 1
         if ($feed -and $feed -match '"SecurityCode":"N098"') { return $feed }
       }
       return $front
     }
     parse = {
       param($page)
       $m = [regex]::Match($page, '(?s)<script id="__NEXT_DATA__"[^>]*>(.*?)</script>')
       if (-not $m.Success) { return $null }
       try { $data = ($m.Groups[1].Value | ConvertFrom-Json) } catch { return $null }
       $pts = @($data.props.pageProps.data.Snapshot | Where-Object { $_.SecurityCode -eq 'N098' -and $_.ClosePrice -gt 0 } |
         ForEach-Object { [pscustomobject]@{ d = (Get-AnyDay $_.TimeSeriesDate); v = [double]$_.ClosePrice } } | Where-Object { $_.d } | Sort-Object d)
       if ($pts.Count -lt 2) { return $null }
       $last = $pts[-1]; $before = $pts[-2]
       return @{ level = [Math]::Round($last.v, 2); pct = $(if ($before.v -gt 0) { ($last.v - $before.v) / $before.v * 100 } else { $null }); date = $last.d }
     } }
  # Gaborone: bse.co.bw draws its index chart from this API (POST, no body), one dated
  # series per index; DCI is the Domestic Company Index.
  @{ code = 'BSE'; site = 'bse.co.bw'; url = 'https://apis.bse.co.bw/api/v1/index-chart'
     name = 'BSE Domestic Company Index (DCI)'; labelRx = '\bDCI\b'; sameDay = $false
     fetch = { Post-Page 'https://apis.bse.co.bw/api/v1/index-chart' }
     parse = {
       param($page)
       try { $j = ($page | ConvertFrom-Json) } catch { return $null }
       $dci = @($j.message[0].indices.data | Where-Object { $_.indexname -eq 'DCI' }) | Select-Object -First 1
       if (-not $dci) { return $null }
       $pts = @($dci.history | Where-Object { $_.price -gt 0 } | ForEach-Object { [pscustomobject]@{ d = (Get-AnyDay $_.date); v = [double]$_.price } } | Where-Object { $_.d } | Sort-Object d)
       if ($pts.Count -lt 2) { return $null }
       $last = $pts[-1]; $before = $pts[-2]
       return @{ level = [Math]::Round($last.v, 2); pct = $(if ($before.v -gt 0) { ($last.v - $before.v) / $before.v * 100 } else { $null }); date = $last.d }
     } }
  # Abidjan (BRVM, eight WAEMU countries): brvm.org/fr/indices, in French: "Derniere mise a
  # jour : Mardi, 17 novembre, 2026 - 19:30 ... BRVM - COMPOSITE 512,85 502,68 -1,98"
  # (previous close, close, % move; decimal commas). Accented letters are matched with .{1,2}
  # so a page decoded as Latin-1 still matches.
  @{ code = 'BRVM'; site = 'brvm.org'; url = 'https://www.brvm.org/fr/indices'
     name = 'BRVM Composite Index'; labelRx = 'BRVM[ -]+C(OMPOSITE)?\b'; sameDay = $false
     parse = {
       param($page)
       $text = Get-PageText $page
       $u = [regex]::Match($text, 'mise .{1,2} jour : [A-Za-z]+,? (?<d>\d{1,2}) (?<m>[^\s,]+),? (?<y>\d{4})')
       $hit = [regex]::Match($text, 'BRVM - COMPOSITE (?<p>\d[\d ]*,\d+) (?<c>\d[\d ]*,\d+) (?<pct>-?\d+,\d+)')
       if (-not $u.Success -or -not $hit.Success) { return $null }
       $mon = 0; $fr = @('^jan', '^f', '^mar', '^avr', '^mai', '^juin', '^juil', '^ao', '^sep', '^oct', '^nov', '^d')
       for ($i = 0; $i -lt 12; $i++) { if ($u.Groups['m'].Value -match $fr[$i]) { $mon = $i + 1; break } }
       if (-not $mon) { return $null }
       $num = { param($s) [double]::Parse(($s -replace ' ', '' -replace ',', '.'), $Inv) }
       return @{ level = (& $num $hit.Groups['c'].Value); pct = (& $num $hit.Groups['pct'].Value); date = ('{0:D4}-{1:D2}-{2:D2}' -f [int]$u.Groups['y'].Value, $mon, [int]$u.Groups['d'].Value) }
     } }
)
function Invoke-SiteLayer($List) {
foreach ($site in $List) {
  if ($rows.Contains($site.code)) { continue }
  $page = if ($site.fetch) { & $site.fetch } else { Get-Page $site.url 2 }
  if (-not $page) { continue }
  $got = if ($Skip -contains 'structured') { $null } else { & $site.parse $page }
  if ($got -is [string]) { continue }
  if ($got) { Add-IndexRow $site.code $got.level $got.pct $got.date $site.site; continue }
  Write-Host "::warning::[indices] $($site.site) no longer matches its parser (redesigned?); the parser in scripts/update-indices.ps1 needs updating. Trying to read the page by meaning."
  $kept = Get-PublishedRow $site.code
  $near = if ($kept) { $kept.level } else { 0.0 }
  if ($near -le 0) { Write-Host "[indices] $($site.site): no published level to check a repaired reading against; skipped"; continue }
  $text = Get-PageText $page
  $how = 'read by meaning'
  $fix = if ($Skip -contains 'generic') { $null } else { Find-ByMeaning $text $site.labelRx $near }
  if (-not $fix) { $how = 'read by AI'; $fix = Read-WithAi $site.name $site.site $text $site.labelRx $near }
  if (-not $fix) { Write-Host "[indices] $($site.site): could not read $($site.code) from the page; the published row stays"; continue }
  if ($site.sameDay -and $fix.date -ne $EatToday) { Write-Host "[indices] $($site.site) ($how): date $($fix.date) is not today ($EatToday); skipped"; continue }
  Add-IndexRow $site.code $fix.level $fix.pct $fix.date "$($site.site) ($how)"
}
}
Invoke-SiteLayer $SITES

# 4. afx.kwayisi.org for the exchanges still missing. Two straight failures means the
#    host is dropping this runner; stop asking.
$fails = 0
foreach ($slug in $AFX.Keys) {
  $m = ($MAP.Values | Where-Object { $_.code -eq $AFX[$slug] } | Select-Object -First 1)
  if (-not $m -or $rows.Contains($m.code)) { continue }
  if ($fails -ge 2) { Write-Host "[indices] afx $slug skipped: host not answering"; continue }
  $page = Get-Page "$AfxBase/$slug/" 1
  if (-not $page) { $fails++; continue }
  $fails = 0
  $text = Strip $page
  $hit = [regex]::Match($text, 'the benchmark (?<name>[^()]{3,80}?) \((?<abbr>[^)]{2,20})\) [a-z ]{2,30}? (?<pts>[\d,]+(?:\.\d+)?) \((?<pct>[+-]?\d+(?:\.\d+)?)%\) points to close at (?<lvl>[\d,]+(?:\.\d+)?)')
  $stamp = [regex]::Match($page, '<time id=u datetime=(?<d>\d{4}-\d{2}-\d{2})')
  if (-not $hit.Success -or -not $stamp.Success) { Write-Host "[indices] afx ${slug}: no index sentence or date on the page"; continue }
  $level = 0.0
  if (-not [double]::TryParse(($hit.Groups['lvl'].Value -replace ',', ''), [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$level) -or $level -le 0) { continue }
  $pct = [double]::Parse($hit.Groups['pct'].Value, [Globalization.CultureInfo]::InvariantCulture)
  # Add-IndexRow keeps the label the site already shows ("NGX ASI", not afx's "ASI").
  Add-IndexRow $m.code $level $pct $stamp.Groups['d'].Value 'afx.kwayisi.org' $hit.Groups['abbr'].Value
}

# 5. Exchange sites that print a dated level but not the day's move. They come after afx,
#    which gives the move, so the PC run keeps it; from GitHub they are the only source.
#    Malawi: "Indices Stats as at 17 November 2026 17:00 hrs Index Open Close ... MASI
#    480,359.72 480,177.54" (open, then close). Mauritius: the home page's SEMDEX chart
#    is fed by a JSON series of [epoch ms, level] points for the current session.
$LATE_SITES = @(
  @{ code = 'MSE'; site = 'mse.co.mw'; url = 'https://www.mse.co.mw/'
     name = 'Malawi All Share Index (MASI)'; labelRx = '\bMASI\b|All Share'; sameDay = $false
     parse = {
       param($page)
       $hit = [regex]::Match((Get-PageText $page), 'Stats as at (?<d>\d{1,2} [A-Za-z]+ \d{4}).{0,160}?\bMASI (?<open>[\d,]+\.\d+) (?<close>[\d,]+\.\d+)')
       if (-not $hit.Success) { return $null }
       $d = Find-NewestDate $hit.Groups['d'].Value
       if (-not $d) { return $null }
       return @{ level = [double]::Parse(($hit.Groups['close'].Value -replace ',', ''), $Inv); pct = $null; date = $d }
     } }
  @{ code = 'SEM'; site = 'stockexchangeofmauritius.com'; url = 'https://www.stockexchangeofmauritius.com/graph-semdex-home'
     name = 'SEMDEX'; labelRx = '\bSEMDEX\b'; sameDay = $false
     parse = {
       param($page)
       $pts = @([regex]::Matches($page, '\[(?<t>\d{13}),(?<v>\d+(?:\.\d+)?)\]'))
       if (-not $pts.Count) { return $null }
       $last = $pts[-1]
       $days = @($pts | ForEach-Object { Get-UnixDay ([long]$_.Groups['t'].Value / 1000) } | Sort-Object -Unique)
       # One session per series; a series spanning days is not the layout this expects.
       if ($days.Count -ne 1) { return $null }
       return @{ level = [Math]::Round([double]::Parse($last.Groups['v'].Value, $Inv), 2); pct = $null; date = $days[0] }
     } }
)
Invoke-SiteLayer $LATE_SITES

$fresh = $rows.Count
if ($fresh -lt $MinRows) { Write-Host "[indices] only $fresh indices came back fresh; keeping previous file"; exit 1 }

# 3. Exchanges neither source supplied keep their previous row and date.
if ($prev) {
  foreach ($p in $prev.indices.PSObject.Properties) {
    if ($rows.Contains($p.Name)) { continue }
    $o = $p.Value
    # pwsh's ConvertFrom-Json may hand the date back as [datetime]; take either.
    $d = $o.date; if ($d -is [datetime]) { $d = $d.ToString('yyyy-MM-dd') }
    $rows[$p.Name] = [ordered]@{ code=$o.code; label=$o.label; name=$o.name; level=$o.level; changePct=$o.changePct; date=[string]$d; countries=@($o.countries); source=$(if ($o.source) { $o.source } else { $prev.source }) }
  }
}

$sources = @($rows.Values | ForEach-Object { $_.source } | Sort-Object -Unique)
$payload = [ordered]@{ fetchedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'); source = ($sources -join ', '); sourceUrl = $src; indices = $rows }
$json = $payload | ConvertTo-Json -Depth 6 -Compress
$js = "// generated by scripts/update-indices.ps1 - do not edit`nwindow.ASJ_INDICES = $json;`n"
[IO.File]::WriteAllText($outPath, $js, [Text.UTF8Encoding]::new($false))
Write-Host "[indices] wrote $($rows.Count) indices ($fresh fresh)"
