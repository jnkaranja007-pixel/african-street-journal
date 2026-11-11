#Requires -Version 7
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

  Rules: never invent a number. A row whose level does not parse is dropped. If fewer
  than 8 indices come back fresh, the old file is kept and the script exits 1 so the
  workflow reports it.
#>
param([int]$TimeoutSec = 25, [int]$MinRows = 8)
$ErrorActionPreference = 'Stop'
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
      return (Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -UserAgent 'Mozilla/5.0 (compatible; ASJ-indices/1.0; +https://africanstreetjournal.com)').Content
    } catch { Write-Host "[indices] $Url attempt $i failed: $($_.Exception.Message.Split("`n")[0])"; if ($i -lt $Tries) { Start-Sleep -Seconds (3 * $i) } }
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

# 1. african-markets.com: every index in one table.
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
      $rows[$m.code] = [ordered]@{ code=$m.code; label=$label; name=$m.name; level=$level; changePct=$pct; date=$d.ToString('yyyy-MM-dd'); countries=$m.countries; source='african-markets.com' }
    }
  }
  Write-Host "[indices] african-markets.com: $($rows.Count) indices"
}

# 2. afx.kwayisi.org for the exchanges still missing. Two straight failures means the
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
