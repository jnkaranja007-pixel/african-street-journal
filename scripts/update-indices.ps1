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

# Adds one fresh row unless a source earlier in the order already supplied it, the level
# is not a positive number, or the row already published is from a later session.
function Add-IndexRow([string]$Code, [double]$Level, $Pct, [string]$Date, [string]$Source) {
  if ($rows.Contains($Code) -or $Level -le 0 -or $Date -notmatch '^\d{4}-\d{2}-\d{2}$') { return }
  $entry = $MAP.Values | Where-Object { $_.code -eq $Code } | Select-Object -First 1
  if (-not $entry) { return }
  $label = $entry.name
  if ($prev -and $prev.indices.$Code) {
    $kept = $prev.indices.$Code
    $keptDate = $kept.date; if ($keptDate -is [datetime]) { $keptDate = $keptDate.ToString('yyyy-MM-dd') }
    if ([string]$keptDate -gt $Date) { Write-Host "[indices] $Source $Code $Date is older than the published $keptDate; skipped"; return }
    if ($kept.label) { $label = [string]$kept.label }
  }
  if ($null -ne $Pct) { $Pct = [Math]::Round([double]$Pct, 2) }
  $rows[$Code] = [ordered]@{ code=$Code; label=$label; name=$entry.name; level=$Level; changePct=$Pct; date=$Date; countries=$entry.countries; source=$Source }
  Write-Host "[indices] $Source -> $Code $Level ($Pct%) $Date"
}
function Get-UnixDay($Seconds) { [DateTimeOffset]::FromUnixTimeSeconds([long]$Seconds).UtcDateTime.ToString('yyyy-MM-dd') }

# 1a. TradingView's scanner: one JSON object per index. "time" is the opening time of the
#     latest session (07:00-09:00 UTC for these exchanges), so its UTC date is the session.
$TV = [ordered]@{ 'JSE:J203'='JSE'; 'NSENG:ASI'='NGX'; 'EGX:EGX30'='EGX'; 'CSEMA:MASI'='CSE'; 'BVMT:PX1'='BVMT' }
foreach ($sym in $TV.Keys) {
  $json = Get-Page ('https://scanner.tradingview.com/symbol?symbol=' + [uri]::EscapeDataString($sym) + '&fields=close,change,time') 2
  if (-not $json) { continue }
  try { $q = $json | ConvertFrom-Json } catch { Write-Host "[indices] tradingview ${sym}: not JSON"; continue }
  if ($null -eq $q.close -or $null -eq $q.time) { Write-Host "[indices] tradingview ${sym}: no close or time"; continue }
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
      $m = $MAP[$key]
      if ($rows.Contains($m.code)) { continue }
      $rows[$m.code] = [ordered]@{ code=$m.code; label=$label; name=$m.name; level=$level; changePct=$pct; date=$d.ToString('yyyy-MM-dd'); countries=$m.countries; source='african-markets.com' }
    }
  }
  Write-Host "[indices] african-markets.com: $($rows.Count) indices"
}

# 3. The exchanges' own sites, for the ones still missing.
# 3a. Nairobi: "Statistics as of 17-Nov-2026 ... NSE ALL SHARE INDEX 240.90 -0.66" (the
#     change is in points; the percentage is worked out from the previous close).
if (-not $rows.Contains('NSE')) {
  $page = Get-Page 'https://www.nse.co.ke/dataservices/market-statistics/' 2
  if ($page) {
    # Tags become spaces, not nothing: the level and change sit in adjacent cells, and
    # "240.90" + "0.66" must not run together.
    $text = [Net.WebUtility]::HtmlDecode((($page -replace '(?s)<script.*?</script>', ' ') -replace '<[^>]+>', ' ')) -replace '\s+', ' '
    $asOf = [regex]::Match($text, 'Statistics as of (\d{1,2}-[A-Za-z]{3}-\d{4})')
    $hit = [regex]::Match($text, 'NSE ALL SHARE INDEX (?<lvl>[\d,]+\.\d+) (?<chg>[+-]?[\d,]+\.\d+)')
    if ($asOf.Success -and $hit.Success) {
      $level = [double]::Parse(($hit.Groups['lvl'].Value -replace ',', ''), $Inv)
      $chg = [double]::Parse(($hit.Groups['chg'].Value -replace ',', ''), $Inv)
      $pct = if ($level - $chg -gt 0) { $chg / ($level - $chg) * 100 } else { $null }
      $d = [datetime]::ParseExact($asOf.Groups[1].Value, 'd-MMM-yyyy', $Inv).ToString('yyyy-MM-dd')
      Add-IndexRow 'NSE' $level $pct $d 'nse.co.ke'
    } else { Write-Host '[indices] nse.co.ke: no dated NSE All Share line' }
  }
}
# 3b. Dar es Salaam: the DSEI tile on the home page (level, and a % whose direction is the
#     tile's text-up/text-down class). The page carries no session date of its own, so the
#     row is taken only when the newest "Daily Market Report" is today's (East Africa
#     time); otherwise the number could be filed under the wrong day.
if (-not $rows.Contains('DSE')) {
  $page = Get-Page 'https://www.dse.co.tz/' 2
  if ($page) {
    $tile = [regex]::Match($page, '(?s)DSEI</span><span[^>]*text-(?<dir>up|down)[^>]*>(?:(?!</span>).)*?(?<pct>\d+(?:\.\d+)?)<!-- -->%</span></div><span[^>]*>(?<lvl>[\d,]+\.\d+)</span>')
    $reports = @([regex]::Matches($page, 'Daily Market Report (\d{4}-\d{2}-\d{2})') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Descending)
    $eatToday = [DateTime]::UtcNow.AddHours(3).ToString('yyyy-MM-dd')
    if (-not $tile.Success) { Write-Host '[indices] dse.co.tz: no DSEI tile' }
    elseif (-not $reports.Count -or $reports[0] -ne $eatToday) { Write-Host "[indices] dse.co.tz: newest daily report is $(if ($reports.Count) { $reports[0] } else { 'missing' }), not $eatToday; skipped" }
    else {
      $pct = [double]::Parse($tile.Groups['pct'].Value, $Inv); if ($tile.Groups['dir'].Value -eq 'down') { $pct = -$pct }
      Add-IndexRow 'DSE' ([double]::Parse(($tile.Groups['lvl'].Value -replace ',', ''), $Inv)) $pct $reports[0] 'dse.co.tz'
    }
  }
}
# 3c. Kigali: the home page embeds the index series as {"closing_date":..,"RSI":..,"ALSI":..};
#     ALSI is the RSE All Share Index.
if (-not $rows.Contains('RSE')) {
  $page = Get-Page 'https://www.rse.rw/' 2
  if ($page) {
    $pts = @([regex]::Matches($page, '\{"closing_date":"(?<d>\d{4}-\d{2}-\d{2})","RSI":"[\d.]+","ALSI":"(?<v>[\d.]+)"\}') | ForEach-Object { [pscustomobject]@{ d = $_.Groups['d'].Value; v = [double]::Parse($_.Groups['v'].Value, $Inv) } } | Sort-Object d)
    if ($pts.Count -ge 2) {
      $last = $pts[-1]; $before = $pts[-2]
      $pct = if ($before.v -gt 0) { ($last.v - $before.v) / $before.v * 100 } else { $null }
      Add-IndexRow 'RSE' $last.v $pct $last.d 'rse.rw'
    } else { Write-Host '[indices] rse.rw: no index series in the page' }
  }
}

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
  # Keep the label the site already shows for this exchange ("NGX ASI", not afx's "ASI").
  $label = $hit.Groups['abbr'].Value
  if ($prev -and $prev.indices.($m.code) -and $prev.indices.($m.code).label) { $label = [string]$prev.indices.($m.code).label }
  $rows[$m.code] = [ordered]@{ code=$m.code; label=$label; name=$m.name; level=$level; changePct=$pct; date=$stamp.Groups['d'].Value; countries=$m.countries; source='afx.kwayisi.org' }
  Write-Host "[indices] afx $slug -> $($m.code) $level ($pct%) $($stamp.Groups['d'].Value)"
}

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
