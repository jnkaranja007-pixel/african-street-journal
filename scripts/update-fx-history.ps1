#Requires -Version 5.1
<#
.SYNOPSIS
  Adds today's US dollar reference rate for every African currency to
  data/fx-history.json, so the site can say "$1 buys 129 KES today, 128 a month ago".

.DESCRIPTION
  The site has always shown today's rate only (ExchangeRate-API's open endpoint, read in
  the reader's browser). That endpoint keeps no history, so from 12 Nov 2026 the desk
  saves one point a day. History builds up from that day; nothing earlier is invented or
  borrowed from another source, whose rates would not join this one's cleanly.

  The file is columnar to stay small: one list of days, and for each currency one list of
  rates in the same order (null where the source gave none that day). A day is the
  source's own update day (UTC), so two desk runs on the same day write one point, the
  later one winning. At most -KeepDays days are kept.

  Never fails the desk: a source that cannot be reached, or an answer that does not look
  right, leaves the file as it was and exits 0.
#>
param(
  [string]$OutFile = '',
  [int]$KeepDays = 800,
  [string]$Url = 'https://open.er-api.com/v6/latest/USD',
  [string]$FromFile = ''   # tests: read this JSON instead of calling the source
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $OutFile) { $OutFile = Join-Path (Join-Path $root 'data') 'fx-history.json' }

# Every currency a country page shows (app.js COUNTRY_CURRENCY), plus the two most
# readers compare with. Sorted, so the file's order never depends on the source's.
$codes = @('AOA','BIF','BWP','CDF','CVE','DJF','DZD','EGP','ERN','ETB','EUR','GBP','GHS','GMD','GNF',
  'KES','KMF','LRD','LSL','LYD','MAD','MGA','MRU','MUR','MWK','MZN','NAD','NGN','RWF','SCR','SDG',
  'SLE','SOS','SSP','STN','SZL','TND','TZS','UGX','XAF','XOF','ZAR','ZMW','ZWG')

function Round-Rate([double]$v) {
  if ($v -le 0 -or [double]::IsNaN($v) -or [double]::IsInfinity($v)) { return $null }
  # Six significant figures: 129.482, 0.861234, 26.7699.
  $digits = [Math]::Max(0, 5 - [int][Math]::Floor([Math]::Log10($v)))
  return [Math]::Round($v, [Math]::Min(8, $digits))
}

try {
  if ($FromFile) { $answer = Get-Content -LiteralPath $FromFile -Raw | ConvertFrom-Json }
  else { $answer = Invoke-RestMethod -Uri $Url -TimeoutSec 30 -Headers @{ 'User-Agent' = 'asj-desk (+https://africanstreetjournal.com)' } }
} catch {
  Write-Host "[fx] source unreachable, history left as it was: $($_.Exception.Message)"
  exit 0
}

if (-not $answer -or [string]$answer.result -ne 'success' -or -not $answer.rates -or [string]$answer.base_code -ne 'USD') {
  Write-Host '[fx] the source did not answer with US dollar rates; history left as it was.'
  exit 0
}
$unix = 0
try { $unix = [long]$answer.time_last_update_unix } catch { $unix = 0 }
$day = if ($unix -gt 0) { [DateTimeOffset]::FromUnixTimeSeconds($unix).UtcDateTime.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) }
       else { (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) }

$today = [ordered]@{}
$found = 0
foreach ($c in $codes) {
  $p = $answer.rates.PSObject.Properties[$c]
  $v = if ($p) { Round-Rate ([double]$p.Value) } else { $null }
  $today[$c] = $v
  if ($null -ne $v) { $found++ }
}
# An answer with most currencies missing is a broken answer, not a quiet day.
if ($found -lt [Math]::Floor($codes.Count * 0.8)) {
  Write-Host "[fx] only $found of $($codes.Count) currencies in the answer; history left as it was."
  exit 0
}

# Read what is there. A file that does not parse is kept aside, never overwritten blind.
$days = New-Object System.Collections.Generic.List[string]
$series = @{}
if (Test-Path -LiteralPath $OutFile) {
  try {
    $old = Get-Content -LiteralPath $OutFile -Raw -Encoding utf8 | ConvertFrom-Json
    foreach ($d in @($old.days)) { $days.Add([string]$d) }
    foreach ($p in $old.rates.PSObject.Properties) {
      $list = New-Object System.Collections.Generic.List[object]
      foreach ($x in @($p.Value)) { if ($null -eq $x) { $list.Add($null) } else { $list.Add([double]$x) } }
      while ($list.Count -lt $days.Count) { $list.Add($null) }
      $series[$p.Name] = $list
    }
  } catch {
    Write-Host "[fx] $OutFile does not parse; left untouched: $($_.Exception.Message)"
    exit 0
  }
}

$at = $days.IndexOf($day)
if ($at -lt 0) {
  # Days stay in order; a day older than the newest one kept (a stale source) is skipped.
  if ($days.Count -and [string]::CompareOrdinal($day, $days[$days.Count - 1]) -lt 0) {
    Write-Host "[fx] the source's day ($day) is older than the newest kept ($($days[$days.Count - 1])); nothing added."
    exit 0
  }
  $days.Add($day)
  foreach ($k in @($series.Keys)) { $series[$k].Add($null) }
  $at = $days.Count - 1
}
foreach ($c in $codes) {
  if (-not $series.ContainsKey($c)) {
    $list = New-Object System.Collections.Generic.List[object]
    for ($i = 0; $i -lt $days.Count; $i++) { $list.Add($null) }
    $series[$c] = $list
  }
  $series[$c][$at] = $today[$c]
}

# Trim from the front.
$drop = [Math]::Max(0, $days.Count - $KeepDays)
if ($drop -gt 0) {
  $days.RemoveRange(0, $drop)
  foreach ($k in @($series.Keys)) { $series[$k].RemoveRange(0, $drop) }
}

# Write by hand: one currency to a line, so a day's commit is a readable diff.
$inv = [Globalization.CultureInfo]::InvariantCulture
$fmt = { param($x) if ($null -eq $x) { 'null' } else { ([double]$x).ToString('R', $inv) } }
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append('{"base":"USD","source":"ExchangeRate-API (open.er-api.com), saved daily by the desk","updated":"')
[void]$sb.Append((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ', $inv))
[void]$sb.Append('",' + "`n" + '"days":[' + ((@($days) | ForEach-Object { '"' + $_ + '"' }) -join ',') + '],' + "`n" + '"rates":{' + "`n")
$keys = @($series.Keys | Sort-Object)
for ($i = 0; $i -lt $keys.Count; $i++) {
  $vals = @($series[$keys[$i]] | ForEach-Object { & $fmt $_ }) -join ','
  [void]$sb.Append('"' + $keys[$i] + '":[' + $vals + ']' + $(if ($i -lt $keys.Count - 1) { ',' } else { '' }) + "`n")
}
[void]$sb.Append('}}' + "`n")
$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
[IO.File]::WriteAllText($OutFile, $sb.ToString(), (New-Object Text.UTF8Encoding($false)))
Write-Host "[fx] $day saved: $found currencies; history holds $($days.Count) day(s), $($days[0]) to $($days[$days.Count - 1])."
exit 0
