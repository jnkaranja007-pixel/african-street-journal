#Requires -Version 5.1
<#
.SYNOPSIS
  Brings one country's Atlas places (Natural Earth populated places) in line with the
  outlines set by set-country-outline.ps1, then re-splits the country chunks.
.DESCRIPTION
  The outlines of so, eh and ma were corrected, but the place lists still followed
  Natural Earth's units, so the Atlas lost towns:
    so  Natural Earth files Hargeisa, Burao, Berbera, Borama, Erigavo and Las Anod
        under "Somaliland", a unit ASJ does not list. They were in no country.
        Fix: -Code so -NaturalEarth <ne_10m_populated_places_simple.geojson> -Admin Somaliland
        (Hargeisa is Natural Earth's "Admin-0 capital" of that unit; it is not a
        capital here.)
    eh  Natural Earth files Laayoune, Smara and Dakhla under Morocco. The Atlas drops
        them from Morocco (outside its outline), and Western Sahara had only Bir Lehlou.
        Fix: -Code eh -From ma -MaxLat 27.6667 (the same 27 40'N line as the outline).
  Moved entries are copied byte for byte; added ones use the same fields and order as
  the rest. Each list stays capital first, then by population.
.USAGE
  powershell -File scripts/set-country-places.ps1 -Code so -NaturalEarth ne_10m_populated_places_simple.geojson -Admin Somaliland
  powershell -File scripts/set-country-places.ps1 -Code eh -From ma -MaxLat 27.6667
#>
param(
  [Parameter(Mandatory)][string]$Code,
  [string]$NaturalEarth = '',     # Natural Earth populated places (simple) GeoJSON
  [string]$Admin = '',            # its adm0name to add to $Code
  [string]$From = '',             # move places from this country ...
  [double]$MaxLat = [double]::NaN # ... that lie south of this latitude
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$appData = Join-Path (Join-Path $root 'data') 'app-data.js'
$inv = [Globalization.CultureInfo]::InvariantCulture

$text = [IO.File]::ReadAllText($appData, [Text.Encoding]::UTF8)
$gisStart = $text.IndexOf('window.UNITED_AFRICA_DATA.countryGis =')
if ($gisStart -lt 0) { throw 'countryGis block not found' }

# The places array of one country: "<cc>":{"rivers":[...],"lakes":[...],"places":[{...},...]
function Get-PlacesSpan([string]$Text, [string]$Cc) {
  $entry = $Text.IndexOf('"' + $Cc + '":{"rivers":', $gisStart)
  if ($entry -lt 0) { throw "countryGis entry for '$Cc' not found" }
  $open = $Text.IndexOf('"places":[', $entry)
  if ($open -lt 0) { throw "places for '$Cc' not found" }
  $open += '"places":'.Length
  # Place objects hold no nested objects, so the first "}]" after the last one closes it.
  $close = $Text.IndexOf('}]', $open)
  if ($Text.Substring($open, 2) -eq '[]') { $close = $open - 1 }
  return @{ start = $open; end = $close + 2 }
}
function Split-Places([string]$Array) { @([regex]::Matches($Array, '\{[^{}]*\}') | ForEach-Object { $_.Value }) }
function Join-Places([string[]]$Items) {
  $sorted = @($Items | Sort-Object @{ Expression = { $_ -match '"capital":true' }; Descending = $true }, @{ Expression = { [double]([regex]::Match($_, '"pop":([0-9.]+)').Groups[1].Value) }; Descending = $true })
  return '[' + ($sorted -join ',') + ']'
}
function Set-Places([string]$Cc, [string[]]$Items) {
  $span = Get-PlacesSpan $script:text $Cc
  $script:text = $script:text.Substring(0, $span.start) + (Join-Places $Items) + $script:text.Substring($span.end)
}
function Get-Places([string]$Cc) {
  $span = Get-PlacesSpan $script:text $Cc
  return @(Split-Places $script:text.Substring($span.start, $span.end - $span.start))
}
function Get-PlaceName([string]$Item) { [regex]::Match($Item, '"name":"([^"]*)"').Groups[1].Value }

$target = @(Get-Places $Code)
$names = @{}; foreach ($p in $target) { $names[(Get-PlaceName $p)] = $true }
$added = New-Object System.Collections.Generic.List[string]

if ($From) {
  if ([double]::IsNaN($MaxLat)) { throw '-From needs -MaxLat' }
  $keep = New-Object System.Collections.Generic.List[string]
  foreach ($p in (Get-Places $From)) {
    $lat = [double]::Parse([regex]::Match($p, '"lat":(-?[0-9.]+)').Groups[1].Value, $inv)
    if ($lat -lt $MaxLat -and -not $names.ContainsKey((Get-PlaceName $p))) { $added.Add($p) } else { $keep.Add($p) }
  }
  Set-Places $From $keep.ToArray()
}

if ($NaturalEarth) {
  if (-not $Admin) { throw '-NaturalEarth needs -Admin' }
  $ne = [IO.File]::ReadAllText((Resolve-Path $NaturalEarth), [Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($f in @($ne.features | Where-Object { $_.properties.adm0name -eq $Admin })) {
    $pr = $f.properties
    if ($names.ContainsKey($pr.name)) { continue }
    $lon = [Math]::Round([double]$f.geometry.coordinates[0], 3).ToString($inv)
    $lat = [Math]::Round([double]$f.geometry.coordinates[1], 3).ToString($inv)
    $pop = [long]$pr.pop_max
    $name = ($pr.name -replace '"', '')
    $added.Add('{"name":"' + $name + '","lon":' + $lon + ',"lat":' + $lat + ',"pop":' + $pop + ',"rank":' + [int]$pr.scalerank + ',"capital":false,"is_market":false,"market_type":"local","infrastructure":[]}')
  }
}

if (-not $added.Count) { Write-Host "[places] $Code - nothing to add"; exit 0 }
Set-Places $Code (@($target) + $added.ToArray())
[IO.File]::WriteAllText($appData, $text, (New-Object Text.UTF8Encoding($false)))
Write-Host ("[places] {0}: +{1} ({2})" -f $Code, $added.Count, ((@($added) | ForEach-Object { Get-PlaceName $_ }) -join ', '))

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'split-app-data.ps1')
exit $LASTEXITCODE
