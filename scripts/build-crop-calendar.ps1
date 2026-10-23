#Requires -Version 5.1
<#
.SYNOPSIS
  Builds data/crop-calendar.json: planting and harvest months per country and crop from
  the FAO Crop Calendar. build-country-facts.ps1 attaches the crops each country exports.
.DESCRIPTION
  The season calendar used one set of months for the whole continent (sesame planted in
  June-July everywhere). FAO's Crop Calendar gives sowing and harvest windows per
  agro-ecological zone for 40 African countries. For each crop this keeps the months in
  any zone's window (a window wraps past December), and the number of zones. A crop FAO
  does not list for a country keeps the typical months in app.js, labelled as typical.
.PARAMETER CacheDir
  One FAO response per country. Reused unless -Refresh (the service is slow, ~15 s each).
.NOTES
  https://cropcalendar.apps.fao.org - FAO, CC BY-NC-SA 3.0 IGO. Run by hand; FAO revises
  these rarely (most entries are dated 2021).
#>
param(
  [string]$CacheDir = (Join-Path ([IO.Path]::GetTempPath()) 'asj-cropcal-cache'),
  [switch]$Refresh
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outPath = Join-Path $root 'data\crop-calendar.json'
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

$CODES = @('dz','ao','bj','bw','bf','bi','cm','cv','cf','td','km','cg','cd','ci','dj','eg','gq','er','sz','et',
           'ga','gm','gh','gn','gw','ke','ls','lr','ly','mg','mw','ml','mr','mu','ma','mz','na','ne','ng','rw',
           'st','sn','sc','sl','so','za','ss','sd','tz','tg','tn','ug','zm','zw','eh')
# FAO crop name -> the label used for farm exports. Green beans and sweet corn are
# vegetables, not the dry pulses and grain countries export, so they are not mapped.
$CROPS = @(
  @('^Rice$', 'Rice'), @('^Sesame$', 'Sesame'), @('^Peanut$', 'Groundnuts'), @('^(Upland cotton|Cotton|Cotonnier)$', 'Cotton'),
  @('^(Cowpea|Pigeon pea|Bean|Chick-pea|Lentil|Pea, dry|Mung bean|Green gram|Bean, broad)$', 'Pulses'),
  @('^Soybean$', 'Soya'), @('^(Onion|Shallot)$', 'Onion'), @('^(Watermelon|Melon)$', 'Melons'), @('^Sugarcane$', 'Sugar'),
  @('^Potato$', 'Potatoes'), @('^Tomato$', 'Tomatoes'), @('^Coffee$', 'Coffee'), @('^(Cashew|Cashewnut)$', 'Cashew'),
  @('^Avocado$', 'Avocados'), @('^Banana$', 'Banana'), @('^(Citrus|Mandarin|Orange|Lemon|Lime|Grapefruit)$', 'Citrus'),
  @('^(Tobbaco|Tabac|Tobacco)$', 'Tobacco'), @('^Cocoa$', 'Cocoa'), @('^(Oil palm|Palm trees)$', 'Palm oil'),
  @('^Date Palm$', 'Dates'), @('^Strawberry$', 'Berries'), @('^Sorghum$', 'Sorghum'),
  @('^(Pearl millet|Millet, foxtail|Finger Millet|Mil africain|Fonio milet)$', 'Millet'), @('^Pineapple$', 'Pineapple'),
  @('^Vitellaria$', 'Shea')
)

# Months from one month to another, wrapping past December: (11, 2) is 11, 12, 1, 2.
function Get-MonthSpan([int]$From, [int]$To) {
  if ($From -lt 1 -or $From -gt 12 -or $To -lt 1 -or $To -gt 12) { return @() }
  $out = @(); $m = $From
  for ($i = 0; $i -lt 12; $i++) { $out += $m; if ($m -eq $To) { break }; $m = ($m % 12) + 1 }
  return $out
}

# Only the countries FAO lists are asked for; the rest would each wait on a timeout.
$listPath = Join-Path $CacheDir 'countries.json'
if ($Refresh -or -not (Test-Path $listPath)) {
  Invoke-WebRequest -Uri 'https://api-cropcalendar.apps.fao.org/api/v1/countries?language=en' -OutFile $listPath -UseBasicParsing -TimeoutSec 120
}
# Windows PowerShell's ConvertFrom-Json passes a JSON array down the pipe as one object;
# ForEach-Object unrolls it on both PowerShells.
$faoCodes = @(([IO.File]::ReadAllText($listPath, [Text.Encoding]::UTF8) | ConvertFrom-Json) | ForEach-Object { $_ } | ForEach-Object { [string]$_.id })

$countries = [ordered]@{}
$covered = 0
foreach ($cc in $CODES) {
  $iso = $cc.ToUpperInvariant()
  if ($faoCodes -notcontains $iso) { continue }
  $cache = Join-Path $CacheDir "$iso.json"
  if ($Refresh -or -not (Test-Path $cache) -or (Get-Item $cache).Length -lt 100) {
    try {
      Invoke-WebRequest -Uri "https://api-cropcalendar.apps.fao.org/api/v1/countries/$iso/cropCalendar?language=en" -OutFile $cache -UseBasicParsing -TimeoutSec 180
    } catch { Write-Host "  $cc FAO request failed: $($_.Exception.Message)" -ForegroundColor Yellow }
  }
  if (-not (Test-Path $cache) -or (Get-Item $cache).Length -lt 100) { continue }
  $records = @(([IO.File]::ReadAllText($cache, [Text.Encoding]::UTF8) | ConvertFrom-Json) | ForEach-Object { $_ })
  if (-not $records.Count -or -not $records[0].crop) { continue }
  $byLabel = [ordered]@{}
  foreach ($rec in $records) {
    $label = $null
    foreach ($m in $CROPS) { if ([string]$rec.crop.name -match $m[0]) { $label = $m[1]; break } }
    if (-not $label) { continue }
    if (-not $byLabel.Contains($label)) { $byLabel[$label] = @{ s = @{}; h = @{}; zones = @{} } }
    $entry = $byLabel[$label]
    $entry.zones[[string]$rec.aez.id] = $true
    foreach ($sess in @($rec.sessions)) {
      if ($sess.all_year -eq 'yes') { 1..12 | ForEach-Object { $entry.s[$_] = $true; $entry.h[$_] = $true }; continue }
      foreach ($mo in (Get-MonthSpan ([int]$sess.early_sowing.month) ([int]$sess.later_sowing.month))) { $entry.s[$mo] = $true }
      foreach ($mo in (Get-MonthSpan ([int]$sess.early_harvest.month) ([int]$sess.late_harvest.month))) { $entry.h[$mo] = $true }
    }
  }
  if (-not $byLabel.Count) { continue }
  $out = [ordered]@{}
  foreach ($label in $byLabel.Keys) {
    $e = $byLabel[$label]
    # Some entries carry no dates at all (Ghana's cashew); leave those to typical months.
    if (-not $e.s.Count -and -not $e.h.Count) { continue }
    $out[$label] = [ordered]@{ s = @($e.s.Keys | Sort-Object); h = @($e.h.Keys | Sort-Object); zones = $e.zones.Count }
  }
  $countries[$cc] = $out
  $covered++
  Write-Host ("  {0}  {1}" -f $cc, ($out.Keys -join ', '))
}
$payload = [ordered]@{
  generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
  source = 'FAO Crop Calendar (cropcalendar.apps.fao.org)'
  countries = $countries
}
[IO.File]::WriteAllText($outPath, ($payload | ConvertTo-Json -Depth 6 -Compress), (New-Object Text.UTF8Encoding($false)))
Write-Host "[cropcal] wrote $outPath ($covered countries)"
