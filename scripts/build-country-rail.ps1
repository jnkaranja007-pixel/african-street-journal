#Requires -Version 5.1
<#
.SYNOPSIS
  Builds data/country-rail.json - every country's active railways from OpenStreetMap -
  and re-splits the country chunks so the Atlas draws them.
.DESCRIPTION
  The Atlas had no rail at all. What looked like a line across Kenya was a hand-placed
  "Great Rift Valley"; the Nairobi-Mombasa Standard Gauge Railway was absent.

  OpenStreetMap is the only open source that is current (the SGR, Addis-Djibouti, the
  Lagos-Ibadan line) and consistent across all 55 countries. Taken: ways tagged
  railway=rail with no service=* tag (that excludes sidings, yards and spurs). Each way
  is simplified to about $Step degrees for drawing; lengths are measured on the full
  geometry, before simplifying.
.PARAMETER CacheDir
  Raw Overpass responses, one <cc>.json per country. Reused when present, so a rebuild
  does not have to ask Overpass 55 questions again.
.NOTES
  Overpass is a shared public service: one query at a time, with pauses and retries.
  Data (c) OpenStreetMap contributors, ODbL.
#>
param(
  [string]$CacheDir = (Join-Path ([IO.Path]::GetTempPath()) 'asj-rail-cache'),
  [double]$Step = 0.02,
  [switch]$Refresh,
  [string]$Only = ''          # comma-separated codes, for testing; the published file needs all 55
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outPath = Join-Path $root 'data\country-rail.json'
$inv = [Globalization.CultureInfo]::InvariantCulture
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

$CODES = @('dz','ao','bj','bw','bf','bi','cm','cv','cf','td','km','cg','cd','ci','dj','eg','gq','er','sz','et',
           'ga','gm','gh','gn','gw','ke','ls','lr','ly','mg','mw','ml','mr','mu','ma','mz','na','ne','ng','rw',
           'st','sn','sc','sl','so','za','ss','sd','tz','tg','tn','ug','zm','zw','eh')

function Get-RailJson([string]$cc) {
  $cache = Join-Path $CacheDir "$cc.json"
  if (-not $Refresh -and (Test-Path $cache) -and (Get-Item $cache).Length -gt 50) {
    $text = [IO.File]::ReadAllText($cache, [Text.Encoding]::UTF8)
    # A response saved from Windows PowerShell's .Content was decoded as Latin-1 (Overpass
    # sends no charset), so Arabic names arrive as Latin-1 mojibake. Undo that: re-encode the
    # characters as Latin-1 bytes and read them as the UTF-8 they always were.
    $mojibake = '[' + [char]0xC3 + [char]0xD8 + [char]0xD9 + '][' + [char]0x80 + '-' + [char]0xBF + ']'
    if ($text -match $mojibake) {
      $fixed = [Text.Encoding]::UTF8.GetString([Text.Encoding]::GetEncoding(28591).GetBytes($text))
      if ($fixed.IndexOf([char]0xFFFD) -lt 0) { $text = $fixed }
    }
    return $text
  }
  $iso = $cc.ToUpperInvariant()
  $q = "[out:json][timeout:180];area[`"ISO3166-1`"=`"$iso`"][admin_level=2]->.a;way[`"railway`"=`"rail`"][!`"service`"](area.a);out tags geom;"
  # overpass-api.de and kumi returned 502/504 for much of Oct 2026; mail.ru answered.
  foreach ($endpoint in @('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter')) {
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      try {
        # -OutFile keeps the raw bytes; .Content would be decoded as Latin-1.
        Invoke-WebRequest -Uri $endpoint -Method Post -Body @{ data = $q } -UseBasicParsing -TimeoutSec 240 `
          -UserAgent 'AfricanStreetJournal-build/1.0 (africanstreetjournal.com)' -OutFile $cache
        Start-Sleep -Seconds 5
        return [IO.File]::ReadAllText($cache, [Text.Encoding]::UTF8)
      } catch {
        Write-Host "  $cc $endpoint attempt $attempt failed: $($_.Exception.Message)" -ForegroundColor Yellow
        Start-Sleep -Seconds (15 * $attempt)
      }
    }
  }
  return $null
}

# Route length, not track length. OpenStreetMap maps each track of a double-track line
# as its own way, so summing ways counted Algeria's network as 6,606 km (CIA World
# Factbook: 4,020) and Morocco's as 3,314 (2,067). A RouteMeter walks each way in
# ~300 m steps and counts only the steps that do not fall within one cell (about 330 m)
# of a line already counted by another way.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
public class AsjRouteMeter {
  const double Cell = 0.003;
  readonly HashSet<long> covered = new HashSet<long>();
  static long Key(long y, long x) { return y * 4000003L + x; }
  static double Km(double la1, double lo1, double la2, double lo2) {
    double r = Math.PI / 180, dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
    double a = Math.Sin(dLa / 2) * Math.Sin(dLa / 2) + Math.Cos(la1 * r) * Math.Cos(la2 * r) * Math.Sin(dLo / 2) * Math.Sin(dLo / 2);
    return 6371.0 * 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
  }
  bool Near(double la, double lo) {
    long y = (long)Math.Floor(la / Cell), x = (long)Math.Floor(lo / Cell);
    for (long dy = -1; dy <= 1; dy++) for (long dx = -1; dx <= 1; dx++) if (covered.Contains(Key(y + dy, x + dx))) return true;
    return false;
  }
  // Returns the length of this way that is new route; then marks the way as covered.
  public double AddWay(double[] lat, double[] lon) {
    double km = 0; var mine = new List<long>();
    for (int i = 1; i < lat.Length; i++) {
      double seg = Km(lat[i - 1], lon[i - 1], lat[i], lon[i]);
      int n = Math.Max(1, (int)Math.Ceiling(Math.Max(Math.Abs(lat[i] - lat[i - 1]), Math.Abs(lon[i] - lon[i - 1])) / Cell));
      int fresh = 0;
      for (int k = 0; k < n; k++) {
        double t = (k + 0.5) / n, la = lat[i - 1] + (lat[i] - lat[i - 1]) * t, lo = lon[i - 1] + (lon[i] - lon[i - 1]) * t;
        if (!Near(la, lo)) fresh++;
        mine.Add(Key((long)Math.Floor(la / Cell), (long)Math.Floor(lo / Cell)));
      }
      km += seg * fresh / n;
    }
    foreach (long c in mine) covered.Add(c);
    return km;
  }
}
'@

$previous = $null
if (Test-Path $outPath) { try { $previous = [IO.File]::ReadAllText($outPath, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch { } }

$sb = New-Object System.Text.StringBuilder
[void]$sb.Append('{"generated":"' + (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') + '","source":"OpenStreetMap contributors, ODbL","countries":{')
$firstCountry = $true
$todo = if ($Only) { @($Only -split ',' | ForEach-Object { $_.Trim().ToLowerInvariant() }) } else { $CODES }
foreach ($cc in $todo) {
  $raw = Get-RailJson $cc
  $countryJson = $null
  if (-not $raw) {
    Write-Host "  $cc no response; keeping previous" -ForegroundColor Yellow
    if ($previous -and $previous.countries.$cc) { $countryJson = ($previous.countries.$cc | ConvertTo-Json -Depth 8 -Compress) }
  } else {
    $osm = $raw | ConvertFrom-Json
    $groups = [ordered]@{}
    $total = 0.0; $sgr = 0.0
    $ways = New-Object System.Collections.Generic.List[object]
    $routeAll = New-Object AsjRouteMeter
    $routeSg = New-Object AsjRouteMeter
    $lineMeters = @{}
    foreach ($w in @($osm.elements | Where-Object { $_.type -eq 'way' -and $_.geometry })) {
      $pts = @($w.geometry)
      $lats = [double[]]@($pts | ForEach-Object { [double]$_.lat })
      $lons = [double[]]@($pts | ForEach-Object { [double]$_.lon })
      $gauge = 0; [void][int]::TryParse(([string]$w.tags.gauge -split ';')[0], [ref]$gauge)
      # English, then French (the working language of most francophone networks), then
      # whatever the line is locally called.
      $name = ([string]$w.tags.'name:en').Trim()
      if (-not $name) { $name = ([string]$w.tags.'name:fr').Trim() }
      if (-not $name) { $name = ([string]$w.tags.name).Trim() }
      if (-not $name) { $name = '' }
      # Route km for the country, for its standard-gauge lines, and for this named line.
      $total += $routeAll.AddWay($lats, $lons)
      if ($gauge -eq 1435) { $sgr += $routeSg.AddWay($lats, $lons) }
      $lineKey = $name + '|' + $gauge
      if (-not $lineMeters.ContainsKey($lineKey)) { $lineMeters[$lineKey] = New-Object AsjRouteMeter }
      $km = $lineMeters[$lineKey].AddWay($lats, $lons)
      $ways.Add(@{ pts = $pts; km = $km; gauge = $gauge; name = $name })
    }
    # Coarser drawing for big networks, so no country chunk carries much over ~5,000
    # rail points: South Africa's 21,700 km at 0.02 degrees made its chunk 577 KB.
    $countryStep = [Math]::Max($Step, $total / 555000.0)
    # OSM splits a line into many short ways (at every bridge, station and switch), and
    # each way keeps both endpoints however coarse the step - South Africa still came out
    # at 509 KB. A way shorter than ~60% of one drawing step is under a pixel or two on
    # the country map: it counts toward the totals but is not drawn. Big networks also
    # drop to two decimals (about 1 km).
    $drawMinKm = $countryStep * 111.0 * 0.6
    $decimals = if ($countryStep -ge 0.03) { 2 } else { 3 }
    foreach ($way in $ways) {
      $pts = $way.pts; $km = $way.km; $gauge = $way.gauge; $name = $way.name
      $key = $name + '|' + $gauge
      if (-not $groups.Contains($key)) { $groups[$key] = @{ name = $name; gauge = $gauge; km = 0.0; parts = New-Object System.Collections.Generic.List[string] } }
      $g = $groups[$key]; $g.km += $km
      if ($km -lt $drawMinKm) { continue }
      # Simplify for drawing: keep a point once it is $countryStep from the last kept one.
      $kept = New-Object System.Collections.Generic.List[string]
      $lastLat = [double]::NaN; $lastLon = [double]::NaN
      for ($i = 0; $i -lt $pts.Count; $i++) {
        $lat = [double]$pts[$i].lat; $lon = [double]$pts[$i].lon
        $isEnd = ($i -eq $pts.Count - 1)
        if ($i -eq 0 -or $isEnd -or [Math]::Abs($lat - $lastLat) -ge $countryStep -or [Math]::Abs($lon - $lastLon) -ge $countryStep) {
          $kept.Add('[' + [Math]::Round($lon, $decimals).ToString($inv) + ',' + [Math]::Round($lat, $decimals).ToString($inv) + ']')
          $lastLat = $lat; $lastLon = $lon
        }
      }
      if ($kept.Count -ge 2) { $g.parts.Add('[' + ($kept -join ',') + ']') }
    }
    $lines = @($groups.Values | Sort-Object { $_.km } -Descending)
    $lineJson = @($lines | ForEach-Object {
      '{"name":' + (ConvertTo-Json ([string]$_.name)) + ',"gauge":' + $_.gauge + ',"km":' + [Math]::Round($_.km).ToString($inv) + ',"parts":[' + ($_.parts -join ',') + ']}'
    })
    $countryJson = '{"km":' + [Math]::Round($total).ToString($inv) + ',"sgrKm":' + [Math]::Round($sgr).ToString($inv) + ',"lines":[' + ($lineJson -join ',') + ']}'
    $named = @($lines | Where-Object { $_.name } | Select-Object -First 3 | ForEach-Object { "$($_.name) ($([Math]::Round($_.km)) km)" }) -join '; '
    Write-Host ("  {0}  {1,6} km  standard gauge {2,5} km  {3}" -f $cc, [Math]::Round($total), [Math]::Round($sgr), $named)
  }
  if ($countryJson) {
    if (-not $firstCountry) { [void]$sb.Append(',') }
    [void]$sb.Append('"' + $cc + '":' + $countryJson)
    $firstCountry = $false
  }
}
[void]$sb.Append('}}')
[IO.File]::WriteAllText($outPath, $sb.ToString(), (New-Object Text.UTF8Encoding($false)))
Write-Host "[rail] wrote $outPath ($([Math]::Round((Get-Item $outPath).Length / 1KB)) KB)"

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'split-app-data.ps1')
exit $LASTEXITCODE
