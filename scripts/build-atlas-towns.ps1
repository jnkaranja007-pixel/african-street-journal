#Requires -Version 5.1
<#
.SYNOPSIS
  Builds data/country-towns.json: the towns the Atlas adds when the reader zooms in.
.DESCRIPTION
  Each country's places (Natural Earth, in data/app-data.js) stop at 28, the most a
  whole-country map can label. Zoomed in to a region, the map had room and nothing to
  put in it: around Mount Kenya at 4x it named six towns. These are the next ones -
  Natural Earth's remaining populated places and GeoNames' towns of 15,000 or more - for
  the zoomed map only; the places list, and everything else that reads it, is unchanged.

  A town is left out when it has the name of a place already listed, or lies within
  -MinKm of one (or of a bigger town already taken): GeoNames lists a city's districts
  and satellite towns, which would stack labels round every capital. Largest first, at
  most -Max a country. GeoNames sections of a city (PPLX) and historical places (PPLH)
  are skipped, as in build-city-populations.ps1. Towns outside the outline are dropped
  in the app (insideCountry), like the places.

  scripts/split-app-data.ps1 attaches each country's towns to its chunk, like rail and
  roads. Run this, then that.
.NOTES
  Natural Earth 10m populated places (public domain); GeoNames cities15000 (CC BY 4.0,
  credited on the About page and the Places layer). Run by hand; the sources change
  slowly.
#>
param(
  [string]$CacheDir = (Join-Path ([IO.Path]::GetTempPath()) 'asj-city-cache'),
  [int]$Max = 120,
  [double]$MinKm = 8,
  [switch]$Refresh
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outPath = Join-Path $root 'data\country-towns.json'
$inv = [Globalization.CultureInfo]::InvariantCulture
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$CODES = @('dz','ao','bj','bw','bf','bi','cm','cv','cf','td','km','cg','cd','ci','dj','eg','gq','er','sz','et',
           'ga','gm','gh','gn','gw','ke','ls','lr','ly','mg','mw','ml','mr','mu','ma','mz','na','ne','ng','rw',
           'st','sn','sc','sl','so','za','ss','sd','tz','tg','tn','ug','zm','zw','eh')
# The sources' old names, as build-city-populations.ps1 corrects them.
$NAME_NOW = @{ 'Nazret' = 'Adama'; 'Ruhengeri' = 'Musanze'; 'Baydhabo' = 'Baidoa'; 'Moutsamoudou' = 'Mutsamudu';
               'Ali Sabih' = 'Ali Sabieh'; 'Tadjoura' = 'Tadjourah'; 'Mekele' = 'Mekelle' }
# Western Sahara's outline ends at 27 40'N; Natural Earth files the towns south of it
# under Morocco (set-country-places.ps1 moved them the same way).
$EH_NORTH = 27.6667

function Get-NameKey([string]$Text) {
  $plain = $Text.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $plain.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) { [void]$sb.Append($ch) }
  }
  return (($sb.ToString().ToLowerInvariant() -replace '\s+city$', '') -replace '[^a-z]+', '')
}
function Get-Km([double]$lat1, [double]$lon1, [double]$lat2, [double]$lon2) {
  $kx = 111.32 * [Math]::Cos(($lat1 + $lat2) / 2 * [Math]::PI / 180)
  return [Math]::Sqrt([Math]::Pow(($lon1 - $lon2) * $kx, 2) + [Math]::Pow(($lat1 - $lat2) * 111.32, 2))
}
function New-Town([string]$Name, [double]$Lon, [double]$Lat, [double]$Pop, [string]$Src) {
  $now = if ($NAME_NOW.ContainsKey($Name)) { $NAME_NOW[$Name] } else { $Name }
  return [pscustomobject]@{ name = $now; lon = $Lon; lat = $Lat; pop = $Pop; src = $Src }
}

# --- The places each chunk already has --------------------------------------------
function Get-ChunkPlaces([string]$Cc) {
  $prefix = 'window.UNITED_AFRICA_DATA.countryGis["' + $Cc + '"] = '
  foreach ($line in [IO.File]::ReadLines((Join-Path $root "data\countries\$Cc.js"), [Text.Encoding]::UTF8)) {
    if ($line.StartsWith($prefix)) {
      $gis = $line.Substring($prefix.Length).TrimEnd().TrimEnd(';') | ConvertFrom-Json
      return @($gis.places | Where-Object { $_.name })
    }
  }
  return @()
}

# --- Natural Earth 10m populated places -------------------------------------------
$nePath = Join-Path $CacheDir 'ne_10m_populated_places_simple.geojson'
if ($Refresh -or -not (Test-Path $nePath)) {
  Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson' -OutFile $nePath -UseBasicParsing -TimeoutSec 180
}
$candidates = @{}
foreach ($cc in $CODES) { $candidates[$cc] = New-Object System.Collections.Generic.List[object] }
$ne = [IO.File]::ReadAllText($nePath, [Text.Encoding]::UTF8) | ConvertFrom-Json
foreach ($f in $ne.features) {
  $pr = $f.properties
  $cc = ([string]$pr.iso_a2).ToLowerInvariant()
  if ($pr.adm0name -eq 'Somaliland') { $cc = 'so' }
  $lon = [double]$f.geometry.coordinates[0]; $lat = [double]$f.geometry.coordinates[1]
  if ($cc -eq 'ma' -and $lat -lt $EH_NORTH) { $cc = 'eh' }
  if (-not $candidates.ContainsKey($cc) -or -not $pr.name) { continue }
  $candidates[$cc].Add((New-Town ([string]$pr.name) $lon $lat ([double]$pr.pop_max) 'ne'))
}

# --- GeoNames cities of 15,000+ ----------------------------------------------------
$zip = Join-Path $CacheDir 'cities15000.zip'
$txt = Join-Path $CacheDir 'cities15000.txt'
if ($Refresh -or -not (Test-Path $txt)) {
  Invoke-WebRequest -Uri 'https://download.geonames.org/export/dump/cities15000.zip' -OutFile $zip -UseBasicParsing -TimeoutSec 180
  Expand-Archive -Path $zip -DestinationPath $CacheDir -Force
}
foreach ($line in [IO.File]::ReadLines($txt, [Text.Encoding]::UTF8)) {
  $c = $line.Split("`t")
  if ($c.Count -lt 15) { continue }
  $cc = $c[8].ToLowerInvariant()
  if (-not $candidates.ContainsKey($cc)) { continue }
  if ($c[7] -eq 'PPLX' -or $c[7] -eq 'PPLH') { continue }
  $pop = 0L
  if (-not [long]::TryParse($c[14], [ref]$pop) -or $pop -le 0) { continue }
  $candidates[$cc].Add((New-Town $c[1] ([double]::Parse($c[5], $inv)) ([double]::Parse($c[4], $inv)) ([double]$pop) 'gn'))
}

# --- Pick each country's towns -----------------------------------------------------
function ConvertTo-JsonText([string]$S) { return '"' + $S.Replace('\', '\\').Replace('"', '\"') + '"' }
$entries = New-Object System.Collections.Generic.List[string]
$report = New-Object System.Collections.Generic.List[string]
foreach ($cc in $CODES) {
  $taken = New-Object System.Collections.Generic.List[object]
  $names = @{}
  foreach ($p in (Get-ChunkPlaces $cc)) {
    $taken.Add([pscustomobject]@{ lon = [double]$p.lon; lat = [double]$p.lat; pop = [double]$p.pop; key = (Get-NameKey ([string]$p.name)) })
    $names[(Get-NameKey ([string]$p.name))] = $true
  }
  $picked = New-Object System.Collections.Generic.List[object]
  # Largest first; Natural Earth before GeoNames at equal size.
  foreach ($t in ($candidates[$cc] | Sort-Object -Property @{ Expression = { $_.pop }; Descending = $true }, @{ Expression = { $_.src }; Descending = $true }, name)) {
    if ($picked.Count -ge $Max) { break }
    $key = Get-NameKey $t.name
    if (-not $key -or $names.ContainsKey($key)) { continue }
    # A housing estate is a suburb ("Imara Daima Estate" in Nairobi, "Medina Estates").
    if ($t.name -match '\bEstates?$') { continue }
    # Too close to one already taken; or a quarter of it a little further out ("Ebute
    # Ikorodu" beside Ikorodu); or the same entry twice - GeoNames has "Upper Gilgil" 33 km
    # from Gilgil with Gilgil's population to the person.
    $near = $false
    foreach ($o in $taken) {
      $km = Get-Km $t.lat $t.lon $o.lat $o.lon
      $nested = [Math]::Min($o.key.Length, $key.Length) -ge 4 -and ($key.Contains($o.key) -or $o.key.Contains($key))
      if ($km -lt $MinKm -or ($nested -and ($km -lt 25 -or ($km -lt 60 -and $o.pop -eq $t.pop)))) { $near = $true; break }
    }
    if ($near) { continue }
    $names[$key] = $true
    $t | Add-Member -NotePropertyName key -NotePropertyValue $key
    $taken.Add($t)
    $picked.Add($t)
  }
  $items = @($picked | ForEach-Object {
    '{"name":' + (ConvertTo-JsonText $_.name) + ',"lon":' + [Math]::Round($_.lon, 3).ToString($inv) + ',"lat":' + [Math]::Round($_.lat, 3).ToString($inv) +
      ',"pop":' + [long]$_.pop + ',"src":"' + $_.src + '"}'
  })
  $entries.Add('"' + $cc + '":{"places":[' + ($items -join ',') + ']}')
  $report.Add("$cc $($picked.Count)")
}
$json = '{"source":"Natural Earth 10m populated places (public domain) and GeoNames cities15000 (geonames.org, CC BY 4.0); built by scripts/build-atlas-towns.ps1","countries":{' + ($entries -join ',') + '}}'
[IO.File]::WriteAllText($outPath, $json, (New-Object Text.UTF8Encoding($false)))
Write-Host ("[towns] {0} KB: {1}" -f [Math]::Round((Get-Item $outPath).Length / 1KB), ($report -join ', '))
