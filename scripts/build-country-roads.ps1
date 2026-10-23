#Requires -Version 5.1
<#
.SYNOPSIS
  Builds data/roads/<cc>.json - every country's main roads from Natural Earth - plus
  data/country-roads.json (lengths only), and re-splits the country chunks.
.DESCRIPTION
  Source: Natural Earth 1:10m roads (ne_10m_roads), public domain. Download once (50 MB;
  not committed):
    https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson
  Natural Earth ranks roads by scalerank: 3-4 is the trunk network, 5-6 the secondary
  roads, 7+ minor roads and tracks (left out - at country-map scale they are noise). The
  African features carry no names or country codes, so each segment is given to the
  country whose outline holds its midpoint: roads split cleanly at borders, Somaliland's
  are Somalia's and Western Sahara's are not Morocco's, as with every other layer.
  Points are thinned to about one per -Step degrees for drawing; lengths are measured on
  the full geometry first.

  The file is a single 50 MB line of flat properties, so features are matched with one
  pattern rather than a full JSON parse (ConvertFrom-Json on 50 MB is minutes and GBs).

  The lines go in one file per country, fetched only when that country's Atlas is drawn:
  in the country chunk they cost 7-19 KB (gzipped) on every country open, Atlas or not.
  Only the lengths travel in the chunk, so the page knows whether there is a file to get.
.USAGE
  powershell -File scripts/build-country-roads.ps1 -GeoJson C:\data\ne_10m_roads.geojson
#>
param(
  [Parameter(Mandatory)][string]$GeoJson,
  [int]$MaxScaleRank = 6,
  [double]$Step = 0.02,
  [switch]$NoSplit
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $root 'data'
$inv = [Globalization.CultureInfo]::InvariantCulture

$src = @'
using System;
using System.Collections.Generic;

public static class AsjRoads {
  static List<string> codes = new List<string>();
  static List<double[]> boxes = new List<double[]>();
  static List<List<double[]>> rings = new List<List<double[]>>();

  // Rings in (longitude, latitude) pairs.
  public static void AddCountry(string code, List<double[]> countryRings) {
    double x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    foreach (double[] r in countryRings)
      for (int i = 0; i < r.Length; i += 2) {
        if (r[i] < x0) x0 = r[i]; if (r[i] > x1) x1 = r[i];
        if (r[i + 1] < y0) y0 = r[i + 1]; if (r[i + 1] > y1) y1 = r[i + 1];
      }
    codes.Add(code); boxes.Add(new double[] { x0, y0, x1, y1 }); rings.Add(countryRings);
  }

  static bool Inside(List<double[]> rs, double x, double y) {
    bool inside = false;
    foreach (double[] r in rs) {
      int n = r.Length / 2;
      for (int i = 0, j = n - 1; i < n; j = i++) {
        double xi = r[2 * i], yi = r[2 * i + 1], xj = r[2 * j], yj = r[2 * j + 1];
        if (((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
    }
    return inside;
  }

  public static int Locate(double x, double y) {
    for (int c = 0; c < codes.Count; c++) {
      double[] b = boxes[c];
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (Inside(rings[c], x, y)) return c;
    }
    return -1;
  }
  public static string Code(int c) { return codes[c]; }

  public static double Km(double lon0, double lat0, double lon1, double lat1) {
    double k = Math.PI / 180, dLat = (lat1 - lat0) * k, dLon = (lon1 - lon0) * k;
    double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) + Math.Cos(lat0 * k) * Math.Cos(lat1 * k) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
    return 6371.0 * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
  }
}
'@
if (-not ('AsjRoads' -as [type])) { Add-Type -TypeDefinition $src }

# --- outlines: the same detail shapes every other Atlas layer is clipped to --------
$appData = [IO.File]::ReadAllText((Join-Path $dataDir 'app-data.js'), [Text.Encoding]::UTF8)
$detailAt = $appData.IndexOf('window.UNITED_AFRICA_DATA.countryDetail =')
if ($detailAt -lt 0) { throw 'countryDetail block not found in data/app-data.js' }
$countryCodes = New-Object System.Collections.Generic.List[string]
foreach ($m in [regex]::Matches($appData.Substring($detailAt), '"([a-z]{2})":\{"d":"([^"]*)"')) {
  $rs = New-Object 'System.Collections.Generic.List[double[]]'
  foreach ($part in ($m.Groups[2].Value -split 'M' | Where-Object { $_.Trim() })) {
    $nums = @([regex]::Matches($part, '-?\d+(?:\.\d+)?') | ForEach-Object { [double]::Parse($_.Value, $inv) })
    if ($nums.Count -lt 6) { continue }
    $ring = New-Object 'double[]' $nums.Count
    for ($i = 0; $i -lt $nums.Count; $i += 2) { $ring[$i] = $nums[$i]; $ring[$i + 1] = -$nums[$i + 1] }
    $rs.Add($ring)
  }
  [AsjRoads]::AddCountry($m.Groups[1].Value, $rs)
  $countryCodes.Add($m.Groups[1].Value)
}
Write-Host "[roads] $($countryCodes.Count) country outlines" -ForegroundColor DarkGray

# --- features -------------------------------------------------------------------------
$text = [IO.File]::ReadAllText((Resolve-Path $GeoJson).Path, [Text.Encoding]::UTF8)
# Each feature may carry a "bbox":[...] between its properties and its geometry.
$featureRx = New-Object Text.RegularExpressions.Regex('\{"type":"Feature","properties":\{(?<p>[^{}]*)\},(?:"bbox":\[[^\]]*\],)?"geometry":\{"type":"LineString","coordinates":\[(?<c>[^{}]*?)\]\s*\}\s*\}')
$pointRx = New-Object Text.RegularExpressions.Regex('\[\s*(-?[\d.eE+-]+)\s*,\s*(-?[\d.eE+-]+)')
$byCountry = @{}
foreach ($code in $countryCodes) { $byCountry[$code] = New-Object System.Collections.Generic.List[object] }
$kept = 0
foreach ($f in $featureRx.Matches($text)) {
  $p = $f.Groups['p'].Value
  if ($p -notmatch '"continent":"Africa"') { continue }
  $rank = 99
  if ($p -match '"scalerank":(\d+)') { $rank = [int]$Matches[1] }
  if ($rank -gt $MaxScaleRank) { continue }
  $major = $rank -le 4 -or $p -match '"type":"Major Highway"'
  $cls = 2
  if ($major) { $cls = 1 }
  $pts = @($pointRx.Matches($f.Groups['c'].Value) | ForEach-Object { ,@([double]::Parse($_.Groups[1].Value, $inv), [double]::Parse($_.Groups[2].Value, $inv)) })
  if ($pts.Count -lt 2) { continue }
  $kept++
  # Runs of consecutive segments whose midpoints fall in the same country.
  $runCountry = -2; $run = $null; $runKm = 0.0
  for ($i = 0; $i -lt $pts.Count - 1; $i++) {
    $a = $pts[$i]; $b = $pts[$i + 1]
    $c = [AsjRoads]::Locate(($a[0] + $b[0]) / 2, ($a[1] + $b[1]) / 2)
    if ($c -ne $runCountry) {
      if ($run -and $runCountry -ge 0 -and $run.Count -ge 2) { $byCountry[[AsjRoads]::Code($runCountry)].Add(@{ c = $cls; km = $runKm; pts = $run }) }
      $runCountry = $c; $run = New-Object System.Collections.Generic.List[object]; $run.Add($a); $runKm = 0.0
    }
    $run.Add($b)
    $runKm += [AsjRoads]::Km($a[0], $a[1], $b[0], $b[1])
  }
  if ($run -and $runCountry -ge 0 -and $run.Count -ge 2) { $byCountry[[AsjRoads]::Code($runCountry)].Add(@{ c = $cls; km = $runKm; pts = $run }) }
}
$text = $null
Write-Host "[roads] $kept African road features at scalerank <= $MaxScaleRank" -ForegroundColor DarkGray

# --- output: thinned points, three decimals (~100 m), main roads first ------------
$roadsDir = Join-Path $dataDir 'roads'
if (-not (Test-Path $roadsDir)) { New-Item -ItemType Directory -Path $roadsDir | Out-Null }
$utf8 = New-Object Text.UTF8Encoding($false)
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append('{"generated":"' + (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') + '","source":"Natural Earth 1:10m roads, public domain","countries":{')
$firstCountry = $true
$filesKb = 0
foreach ($code in @($countryCodes | Sort-Object)) {
  $runs = @($byCountry[$code] | Sort-Object { $_.c })
  $mainKm = 0.0; $allKm = 0.0
  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($r in $runs) {
    $allKm += $r.km
    if ($r.c -eq 1) { $mainKm += $r.km }
    $thin = New-Object System.Collections.Generic.List[string]
    $last = $null
    for ($i = 0; $i -lt $r.pts.Count; $i++) {
      $pt = $r.pts[$i]
      $isEnd = ($i -eq 0 -or $i -eq $r.pts.Count - 1)
      if (-not $isEnd -and $last -and [Math]::Abs($pt[0] - $last[0]) -lt $Step -and [Math]::Abs($pt[1] - $last[1]) -lt $Step) { continue }
      $thin.Add('[' + $pt[0].ToString('0.###', $inv) + ',' + $pt[1].ToString('0.###', $inv) + ']')
      $last = $pt
    }
    if ($thin.Count -lt 2) { continue }
    $lines.Add('{"c":' + $r.c + ',"p":[' + ($thin -join ',') + ']}')
  }
  $countryFile = Join-Path $roadsDir "$code.json"
  if ($lines.Count) {
    [IO.File]::WriteAllText($countryFile, '{"km":' + [Math]::Round($allKm) + ',"mainKm":' + [Math]::Round($mainKm) + ',"lines":[' + ($lines -join ',') + ']}', $utf8)
    $filesKb += (Get-Item $countryFile).Length / 1KB
  } elseif (Test-Path $countryFile) { Remove-Item -LiteralPath $countryFile }
  if (-not $firstCountry) { [void]$sb.Append(',') }
  $firstCountry = $false
  [void]$sb.Append('"' + $code + '":{"km":' + [Math]::Round($allKm) + ',"mainKm":' + [Math]::Round($mainKm) + '}')
  Write-Host ("  {0}  {1,6} km of road ({2,6} km main), {3} lines" -f $code, [Math]::Round($allKm), [Math]::Round($mainKm), $lines.Count)
}
[void]$sb.Append('}}')
$outPath = Join-Path $dataDir 'country-roads.json'
[IO.File]::WriteAllText($outPath, $sb.ToString(), $utf8)
Write-Host ("[roads] wrote data/roads/*.json ({0:0} KB) and data/country-roads.json" -f $filesKb) -ForegroundColor Green

if (-not $NoSplit) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'split-app-data.ps1')
  exit $LASTEXITCODE
}
