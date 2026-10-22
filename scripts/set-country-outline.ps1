#Requires -Version 5.1
<#
.SYNOPSIS
  Replaces one country's detail outline (the shape the country page and Atlas draw)
  from a GeoJSON file, then re-splits the country chunks.
.DESCRIPTION
  Three outlines were wrong, and every port, airport and landmark check after them
  inherited the error:
    so  Somalia was Natural Earth's, which cuts Somaliland out as its own unit, so
        Berbera, Hargeisa and Burao fell 400 km outside the country they are in.
        ASJ follows the African Union and the UN: Somaliland is part of Somalia.
        Source: geoBoundaries SOM ADM0 (UNDP / OCHA Somalia).
    eh  Western Sahara was a partial shape that left out Laayoune, Smara and Dakhla:
        ASJ lists Western Sahara as its own country, as the African Union does.
        Natural Earth draws only the strip east of the Moroccan berm. Source: geoBoundaries
        MAR ADM0 (which draws Morocco and Western Sahara as one) south of 27 40'N.
    ma  Morocco's outline included all of Western Sahara, so the two overlapped.
        Source: the same geoBoundaries MAR shape, north of 27 40'N.
  The output keeps the existing encoding: SVG path in (longitude, -latitude), three
  decimals, plus a bbox in the same space.
.USAGE
  powershell -File scripts/set-country-outline.ps1 -Code so -GeoJson geoBoundaries-SOM-ADM0_simplified.geojson
  powershell -File scripts/set-country-outline.ps1 -Code eh -GeoJson geoBoundaries-MAR-ADM0_simplified.geojson -ClipMaxLat 27.6667
  powershell -File scripts/set-country-outline.ps1 -Code ma -GeoJson geoBoundaries-MAR-ADM0_simplified.geojson -ClipMinLat 27.6667
#>
param(
  [Parameter(Mandatory)][string]$Code,
  [Parameter(Mandatory)][string]$GeoJson,
  [string]$Match = '',            # ADMIN/NAME of the feature to take, when the file holds many
  [double]$MinStep = 0.01,        # drop vertices closer than this (degrees) to the last kept one
  # Keep only the part of the shape north of this latitude. Both Natural Earth and
  # geoBoundaries draw Morocco to 20.8N, over all of Western Sahara; Morocco proper lies
  # north of the 27 40'N line that is Western Sahara's northern border.
  [double]$ClipMinLat = [double]::NaN,
  # Keep only the part south of this latitude. Western Sahara is the same source cut the
  # other way: Natural Earth's own "Western Sahara" is only the strip east of the
  # Moroccan berm, which left Laayoune, Smara and Dakhla in no country at all.
  [double]$ClipMaxLat = [double]::NaN
)

# Sutherland-Hodgman against one horizontal edge: keep lat >= $Lat, adding the crossing
# point wherever an edge passes the line.
function Split-RingAtLatitude([object[]]$Ring, [double]$Lat, [switch]$South) {
  $out = New-Object System.Collections.Generic.List[object]
  for ($i = 0; $i -lt $Ring.Count; $i++) {
    $a = $Ring[$i]; $b = $Ring[($i + 1) % $Ring.Count]
    if ($South) { $aIn = [double]$a[1] -le $Lat; $bIn = [double]$b[1] -le $Lat }
    else { $aIn = [double]$a[1] -ge $Lat; $bIn = [double]$b[1] -ge $Lat }
    if ($aIn) { $out.Add(@([double]$a[0], [double]$a[1])) }
    if ($aIn -ne $bIn) {
      $t = ($Lat - [double]$a[1]) / ([double]$b[1] - [double]$a[1])
      $out.Add(@(([double]$a[0] + $t * ([double]$b[0] - [double]$a[0])), $Lat))
    }
  }
  return ,$out.ToArray()
}
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$appData = Join-Path $root 'data\app-data.js'
$inv = [Globalization.CultureInfo]::InvariantCulture

$gj = [IO.File]::ReadAllText((Resolve-Path $GeoJson), [Text.Encoding]::UTF8) | ConvertFrom-Json
# Assigned inside the branches, never as `$x = if (...) { @(...) }`: an if-expression
# unrolls its output, so a one-feature collection or a one-ring polygon came back as
# its contents and the outline was written with no vertices.
$features = @()
if ($gj.features) { $features = @($gj.features) } else { $features = @($gj) }
if ($Match) {
  $features = @($features | Where-Object { $_.properties.ADMIN -eq $Match -or $_.properties.NAME -eq $Match -or $_.properties.shapeName -eq $Match })
}
if ($features.Length -eq 0) { throw "no feature matched '$Match'" }

$sb = New-Object System.Text.StringBuilder
$minX = [double]::MaxValue; $minY = [double]::MaxValue; $maxX = [double]::MinValue; $maxY = [double]::MinValue
foreach ($f in $features) {
  $g = $f.geometry
  $polys = @()
  if ($g.type -eq 'Polygon') { $polys = @(,$g.coordinates) }
  elseif ($g.type -eq 'MultiPolygon') { $polys = @($g.coordinates) }
  else { throw "unsupported geometry $($g.type)" }
  foreach ($poly in $polys) {
    # Outer ring only: the detail map fills one shape per landmass.
    $ring = @($poly[0])
    if (-not [double]::IsNaN($ClipMinLat)) { $ring = Split-RingAtLatitude $ring $ClipMinLat }
    if (-not [double]::IsNaN($ClipMaxLat)) { $ring = Split-RingAtLatitude $ring $ClipMaxLat -South }
    $kept = New-Object System.Collections.Generic.List[object]
    foreach ($pt in $ring) {
      $x = [double]$pt[0]; $y = -[double]$pt[1]
      if ($kept.Count) {
        $last = $kept[$kept.Count - 1]
        if ([Math]::Abs($x - $last[0]) -lt $MinStep -and [Math]::Abs($y - $last[1]) -lt $MinStep) { continue }
      }
      $kept.Add(@($x, $y))
    }
    if ($kept.Count -lt 3) { continue }
    for ($i = 0; $i -lt $kept.Count; $i++) {
      $x = $kept[$i][0]; $y = $kept[$i][1]
      [void]$sb.Append($(if ($i -eq 0) { 'M' } else { ' L' })).Append($x.ToString('0.###', $inv)).Append(' ').Append($y.ToString('0.###', $inv))
      if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    }
    [void]$sb.Append(' Z ')
  }
}
$d = $sb.ToString().Trim()
if (([regex]::Matches($d, 'L')).Count -lt 20) { throw "outline for '$Code' has too few vertices - refusing to write it" }
$bbox = '{"minX":' + [Math]::Round($minX, 3).ToString($inv) + ',"minY":' + [Math]::Round($minY, 3).ToString($inv) +
        ',"maxX":' + [Math]::Round($maxX, 3).ToString($inv) + ',"maxY":' + [Math]::Round($maxY, 3).ToString($inv) +
        ',"width":' + [Math]::Round($maxX - $minX, 3).ToString($inv) + ',"height":' + [Math]::Round($maxY - $minY, 3).ToString($inv) + '}'
$entry = '"' + $Code + '":{"d":"' + $d + '","bbox":' + $bbox + '}'

$text = [IO.File]::ReadAllText($appData, [Text.Encoding]::UTF8)
$marker = 'window.UNITED_AFRICA_DATA.countryDetail ='
$start = $text.IndexOf($marker)
if ($start -lt 0) { throw 'countryDetail block not found' }
# The entry is "<code>":{"d":"...","bbox":{...}} inside the countryDetail object.
$pattern = '"' + [regex]::Escape($Code) + '":\{"d":"[^"]*","bbox":\{[^}]*\}\}'
$rx = New-Object System.Text.RegularExpressions.Regex($pattern)
$m = $rx.Match($text, $start)
if (-not $m.Success) { throw "countryDetail entry for '$Code' not found in the expected shape" }
$text = $text.Substring(0, $m.Index) + $entry + $text.Substring($m.Index + $m.Length)
[IO.File]::WriteAllText($appData, $text, (New-Object Text.UTF8Encoding($false)))
Write-Host ("[outline] {0}: {1} vertices, bbox lon {2:0.##}..{3:0.##} lat {4:0.##}..{5:0.##}" -f $Code, ([regex]::Matches($d, '[ML]')).Count, $minX, $maxX, -$maxY, -$minY)

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'split-app-data.ps1')
exit $LASTEXITCODE
