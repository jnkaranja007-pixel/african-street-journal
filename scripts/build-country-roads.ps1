#Requires -Version 5.1
<#
.SYNOPSIS
  Builds data/country-roads.json - each country's main roads from Natural Earth - and
  re-splits the country chunks so the Atlas draws them.
.DESCRIPTION
  The Atlas had railways but no roads, although roads carry most of the continent's
  freight and people. Natural Earth's 1:10m roads (ne_10m_roads, public domain) are drawn
  for this scale: the trunk and main regional roads (scalerank 3-6), the network a reader
  would plan a trip on. Minor roads, tracks and ferries are left out. A line is kept for
  every country whose outline box it crosses; the Atlas clips it to the country outline.
.PARAMETER CacheDir
  Where ne_10m_roads.geojson (50 MB) is kept. Run by hand; the source changes rarely.
#>
param(
  [string]$CacheDir = (Join-Path ([IO.Path]::GetTempPath()) 'asj-roads-cache'),
  [double]$Step = 0.02
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outPath = Join-Path $root 'data\country-roads.json'
$inv = [Globalization.CultureInfo]::InvariantCulture
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
$src = Join-Path $CacheDir 'ne_10m_roads.geojson'
if (-not (Test-Path $src)) {
  Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson' -OutFile $src -UseBasicParsing -TimeoutSec 1800
}

# The file is a single 50 MB line. Split it at each feature and decode only the African
# ones, rather than handing Windows PowerShell's ConvertFrom-Json the whole thing.
Add-Type -AssemblyName System.Web.Extensions
$text = [IO.File]::ReadAllText($src, [Text.Encoding]::UTF8)
$marker = '{"type":"Feature",'
$json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$json.MaxJsonLength = [int]::MaxValue
$roads = New-Object System.Collections.Generic.List[object]
$pos = $text.IndexOf($marker)
while ($pos -ge 0) {
  $next = $text.IndexOf($marker, $pos + 10)
  $end = if ($next -ge 0) { $next } else { $text.Length }
  # Each feature is followed by "," - or, the last one, by the collection's closing "]}".
  $chunk = $text.Substring($pos, $end - $pos).TrimEnd()
  if ($chunk.EndsWith(',')) { $chunk = $chunk.Substring(0, $chunk.Length - 1) }
  elseif ($chunk.EndsWith(']}')) { $chunk = $chunk.Substring(0, $chunk.Length - 2).TrimEnd() }
  $pos = $next
  if ($chunk.IndexOf('"continent":"Africa"') -lt 0) { continue }
  # In Africa Natural Earth types most roads "Road" or "Unknown" (6,761 features, 208
  # "Major Highway"); importance is in scalerank, lower is more important. 3-4 are the
  # trunk network, 5-6 the main regional roads; 7-10 are left out at this scale.
  $rank = [int][regex]::Match($chunk, '"scalerank":(\d+)').Groups[1].Value
  if ($rank -gt 6 -or $chunk -match '"type":"(Ferry|Track)') { continue }
  $obj = $null
  try { $obj = $json.DeserializeObject($chunk) } catch { Write-Host "  unreadable feature skipped" -ForegroundColor Yellow; continue }
  $type = if ($rank -le 4) { 'Major Highway' } else { 'Secondary' }
  $g = $obj['geometry']
  # A list, not "$lines = if (...) { @(, $coords) }": PowerShell unrolls an if-expression's
  # output, and every coordinate pair became a "road" of its own near 0,0.
  $lines = New-Object System.Collections.Generic.List[object]
  if ($g['type'] -eq 'LineString') { $lines.Add($g['coordinates']) }
  elseif ($g['type'] -eq 'MultiLineString') { foreach ($part in $g['coordinates']) { $lines.Add($part) } }
  foreach ($ln in $lines) {
    $pts = @($ln | ForEach-Object { , @([double]$_[0], [double]$_[1]) })
    if ($pts.Count -lt 2) { continue }
    $xs = $pts | ForEach-Object { $_[0] }; $ys = $pts | ForEach-Object { $_[1] }
    $roads.Add([pscustomobject]@{ major = ($type -eq 'Major Highway'); pts = $pts
      minX = ($xs | Measure-Object -Minimum).Minimum; maxX = ($xs | Measure-Object -Maximum).Maximum
      minY = ($ys | Measure-Object -Minimum).Minimum; maxY = ($ys | Measure-Object -Maximum).Maximum })
  }
}
$text = $null
Write-Host "[roads] $($roads.Count) African highway lines"

$CODES = @('dz','ao','bj','bw','bf','bi','cm','cv','cf','td','km','cg','cd','ci','dj','eg','gq','er','sz','et',
           'ga','gm','gh','gn','gw','ke','ls','lr','ly','mg','mw','ml','mr','mu','ma','mz','na','ne','ng','rw',
           'st','sn','sc','sl','so','za','ss','sd','tz','tg','tn','ug','zm','zw','eh')
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append('{"generated":"' + (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd') + '","source":"Natural Earth, ne_10m_roads (public domain)","countries":{')
$first = $true
foreach ($cc in $CODES) {
  $chunkText = [IO.File]::ReadAllText((Join-Path $root "data\countries\$cc.js"), [Text.Encoding]::UTF8)
  $m = [regex]::Match($chunkText, '"bbox":\{"minX":([-\d.]+),"minY":([-\d.]+),"maxX":([-\d.]+),"maxY":([-\d.]+)')
  if (-not $m.Success) { continue }
  # Atlas boxes are [lon, -lat].
  $w = [double]::Parse($m.Groups[1].Value, $inv); $e = [double]::Parse($m.Groups[3].Value, $inv)
  $n = -[double]::Parse($m.Groups[2].Value, $inv); $s = -[double]::Parse($m.Groups[4].Value, $inv)
  $parts = @{ major = New-Object System.Collections.Generic.List[string]; secondary = New-Object System.Collections.Generic.List[string] }
  # Coarser for big countries, as for railways: South Africa's chunk grew 78 KB at 0.02
  # degrees. About 350 steps across the country is finer than the map can show.
  $countryStep = [Math]::Max($Step, [Math]::Max($e - $w, $n - $s) / 350.0)
  $decimals = if ($countryStep -ge 0.03) { 2 } else { 3 }
  # Only the part of a road inside the country's box (plus a little): the Atlas clips to
  # the outline anyway, and a trans-continental highway was being shipped whole.
  $bw = $w - 0.2; $be = $e + 0.2; $bs = $s - 0.2; $bn = $n + 0.2
  foreach ($r in $roads) {
    if ($r.maxX -lt $bw -or $r.minX -gt $be -or $r.maxY -lt $bs -or $r.minY -gt $bn) { continue }
    $runs = New-Object System.Collections.Generic.List[object]
    $run = $null
    foreach ($p in $r.pts) {
      $inside = $p[0] -ge $bw -and $p[0] -le $be -and $p[1] -ge $bs -and $p[1] -le $bn
      if ($inside) { if (-not $run) { $run = New-Object System.Collections.Generic.List[object]; $runs.Add($run) }; $run.Add($p) }
      else { if ($run) { $run.Add($p) }; $run = $null }
    }
    foreach ($seg in $runs) {
      # Simplify for drawing: keep a point once it is a step from the last kept one.
      $kept = New-Object System.Collections.Generic.List[string]
      $lx = [double]::NaN; $ly = [double]::NaN
      for ($i = 0; $i -lt $seg.Count; $i++) {
        $p = $seg[$i]
        if ($i -eq 0 -or $i -eq $seg.Count - 1 -or [Math]::Abs($p[0] - $lx) -ge $countryStep -or [Math]::Abs($p[1] - $ly) -ge $countryStep) {
          $kept.Add('[' + [Math]::Round($p[0], $decimals).ToString($inv) + ',' + [Math]::Round($p[1], $decimals).ToString($inv) + ']'); $lx = $p[0]; $ly = $p[1]
        }
      }
      if ($kept.Count -ge 2) { $parts[$(if ($r.major) { 'major' } else { 'secondary' })].Add('[' + ($kept -join ',') + ']') }
    }
  }
  if (-not $first) { [void]$sb.Append(',') }
  [void]$sb.Append('"' + $cc + '":{"major":[' + ($parts.major -join ',') + '],"secondary":[' + ($parts.secondary -join ',') + ']}')
  $first = $false
  Write-Host ("  {0}  {1} major, {2} secondary" -f $cc, $parts.major.Count, $parts.secondary.Count)
}
[void]$sb.Append('}}')
[IO.File]::WriteAllText($outPath, $sb.ToString(), (New-Object Text.UTF8Encoding($false)))
Write-Host "[roads] wrote $outPath ($([Math]::Round((Get-Item $outPath).Length / 1KB)) KB)"

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'split-app-data.ps1')
exit $LASTEXITCODE
