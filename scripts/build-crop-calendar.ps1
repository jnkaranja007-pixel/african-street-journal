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
# FAO crop name -> the label used for farm exports. Green beans are a vegetable, not the
# dry pulses countries export, so they are not mapped ("Corn, sweet" is: see Maize below).
$CROPS = @(
  @('^Rice$', 'Rice'), @('^Sesame$', 'Sesame'), @('^Peanut$', 'Groundnuts'), @('^(Upland cotton|Cotton|Cotonnier)$', 'Cotton'),
  @('^(Cowpea|Pigeon pea|Bean|Chick-pea|Lentil|Pea, dry|Mung bean|Green gram|Bean, broad)$', 'Pulses'),
  @('^Soybean$', 'Soya'), @('^(Onion|Shallot)$', 'Onion'), @('^(Watermelon|Melon)$', 'Melons'), @('^Sugarcane$', 'Sugar'),
  @('^Potato$', 'Potatoes'), @('^Tomato$', 'Tomatoes'), @('^Coffee$', 'Coffee'), @('^(Cashew|Cashewnut)$', 'Cashew'),
  @('^Avocado$', 'Avocados'), @('^Banana$', 'Banana'), @('^(Citrus|Mandarin|Orange|Lemon|Lime|Grapefruit)$', 'Citrus'),
  @('^(Tobbaco|Tabac|Tobacco)$', 'Tobacco'), @('^Cocoa$', 'Cocoa'), @('^(Oil palm|Palm trees)$', 'Palm oil'),
  @('^Date Palm$', 'Dates'), @('^Strawberry$', 'Berries'), @('^Sorghum$', 'Sorghum'),
  @('^(Pearl millet|Millet, foxtail|Finger Millet|Mil africain|Fonio milet)$', 'Millet'), @('^Pineapple$', 'Pineapple'),
  @('^Vitellaria$', 'Shea'),
  # Food crops, so the farmers' calendar shows what most farmers grow, not only exports.
  # FAO's African calendars have no "Maize": grain maize is filed as "Corn, sweet" (17
  # Kenyan zones; in Kenya's upper highlands it is sown in March-April and harvested in
  # September-January, a grain cycle - sweet corn takes three months) or "Corn".
  @('^(Maize|Corn|Corn, sweet)$', 'Maize'), @('^Cassava$', 'Cassava'),
  @('^(Wheat|Wheat, bread|Wheat, durum)$', 'Wheat'), @('^Barley$', 'Barley'), @('^Teff$', 'Teff'),
  @('^Yams?$', 'Yams'), @('^Sweet potato$', 'Sweet potatoes')
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
  # Months per zone, then the months most zones share. Taking every zone's window made
  # the calendar say nothing: Kenya's rice, over 4 zones, was "planted" and "harvested"
  # in all 12 months; its sorghum over 14 zones in 11.
  $byLabel = [ordered]@{}
  foreach ($rec in $records) {
    $label = $null
    foreach ($m in $CROPS) { if ([string]$rec.crop.name -match $m[0]) { $label = $m[1]; break } }
    if (-not $label) { continue }
    if (-not $byLabel.Contains($label)) { $byLabel[$label] = @{} }
    $zone = [string]$rec.aez.id
    if (-not $byLabel[$label].ContainsKey($zone)) { $byLabel[$label][$zone] = @{ s = @{}; h = @{} } }
    $entry = $byLabel[$label][$zone]
    foreach ($sess in @($rec.sessions)) {
      if ($sess.all_year -eq 'yes') { 1..12 | ForEach-Object { $entry.s[$_] = $true; $entry.h[$_] = $true }; continue }
      foreach ($mo in (Get-MonthSpan ([int]$sess.early_sowing.month) ([int]$sess.later_sowing.month))) { $entry.s[$mo] = $true }
      foreach ($mo in (Get-MonthSpan ([int]$sess.early_harvest.month) ([int]$sess.late_harvest.month))) { $entry.h[$mo] = $true }
    }
  }
  if (-not $byLabel.Count) { continue }
  $out = [ordered]@{}
  foreach ($label in $byLabel.Keys) {
    $zones = @($byLabel[$label].Values)
    $picked = @{}
    foreach ($kind in 's', 'h') {
      # Zones with a window of this kind; at least half of them must share a month for
      # it to show. If no month reaches that, the month(s) most zones share.
      $counts = @{}
      $withWindow = @($zones | Where-Object { $_[$kind].get_Count() -gt 0 })
      foreach ($z in $withWindow) { foreach ($mo in $z[$kind].get_Keys()) { $counts[[int]$mo] = 1 + [int]$counts[[int]$mo] } }
      if (-not $counts.get_Count()) { $picked[$kind] = @(); continue }
      $need = [Math]::Ceiling($withWindow.Count / 2.0)
      $top = ($counts.Values | Measure-Object -Maximum).Maximum
      $bar = [Math]::Min($need, $top)
      $picked[$kind] = @($counts.get_Keys() | Where-Object { $counts[$_] -ge $bar } | Sort-Object)
    }
    # Some entries carry no dates at all (Ghana's cashew); leave those to typical months.
    if (-not $picked.s.Count -and -not $picked.h.Count) { continue }
    $out[$label] = [ordered]@{ s = @($picked.s | ForEach-Object { [int]$_ }); h = @($picked.h | ForEach-Object { [int]$_ }); zones = $zones.Count }
  }
  $countries[$cc] = $out
  $covered++
  Write-Host ("  {0}  {1}" -f $cc, ($out.Keys -join ', '))
}
# Which food crops a country grows most, by land: FAOSTAT's area harvested (element
# 5312), the last three years averaged. FAO's calendar zone count is no measure of it -
# Zimbabwe's calendar has groundnuts in 7 zones and maize in 5.
$faoDir = Join-Path ([IO.Path]::GetTempPath()) 'asj-faostat-cache'
New-Item -ItemType Directory -Force -Path $faoDir | Out-Null
$prodZip = Join-Path $faoDir 'Production_Crops_Livestock_E_Africa.zip'
$prodCsv = Join-Path $faoDir 'Production_Crops_Livestock_E_Africa_NOFLAG.csv'
if ($Refresh -or -not (Test-Path $prodCsv)) {
  Invoke-WebRequest -Uri 'https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_Africa.zip' -OutFile $prodZip -UseBasicParsing -TimeoutSec 600
  Expand-Archive -Path $prodZip -DestinationPath $faoDir -Force
}
$FAO_AREAS = @{ 'Algeria'='dz'; 'Angola'='ao'; 'Benin'='bj'; 'Botswana'='bw'; 'Burkina Faso'='bf'; 'Burundi'='bi'; 'Cabo Verde'='cv'; 'Cameroon'='cm';
  'Central African Republic'='cf'; 'Chad'='td'; 'Comoros'='km'; 'Congo'='cg'; ('C' + [char]0xF4 + "te d'Ivoire")='ci'; 'Democratic Republic of the Congo'='cd';
  'Djibouti'='dj'; 'Egypt'='eg'; 'Equatorial Guinea'='gq'; 'Eritrea'='er'; 'Eswatini'='sz'; 'Ethiopia'='et'; 'Gabon'='ga'; 'Gambia'='gm'; 'Ghana'='gh';
  'Guinea'='gn'; 'Guinea-Bissau'='gw'; 'Kenya'='ke'; 'Lesotho'='ls'; 'Liberia'='lr'; 'Libya'='ly'; 'Madagascar'='mg'; 'Malawi'='mw'; 'Mali'='ml';
  'Mauritania'='mr'; 'Mauritius'='mu'; 'Morocco'='ma'; 'Mozambique'='mz'; 'Namibia'='na'; 'Niger'='ne'; 'Nigeria'='ng'; 'Rwanda'='rw';
  'Sao Tome and Principe'='st'; 'Senegal'='sn'; 'Seychelles'='sc'; 'Sierra Leone'='sl'; 'Somalia'='so'; 'South Africa'='za'; 'South Sudan'='ss';
  'Sudan'='sd'; 'Togo'='tg'; 'Tunisia'='tn'; 'Uganda'='ug'; 'United Republic of Tanzania'='tz'; 'Zambia'='zm'; 'Zimbabwe'='zw' }
$FOOD_ITEMS = @(
  @('^Maize \(corn\)$', 'Maize'), @('^Rice$', 'Rice'), @('^Sorghum$', 'Sorghum'), @('^Millet$', 'Millet'), @('^Cassava, fresh$', 'Cassava'),
  @('^Wheat$', 'Wheat'), @('^Yams$', 'Yams'), @('^Sweet potatoes$', 'Sweet potatoes'), @('^Potatoes$', 'Potatoes'), @('^Barley$', 'Barley'),
  @('^(Beans|Cow peas|Pigeon peas|Chick peas|Lentils|Peas|Bambara beans|Broad beans and horse beans), dry$', 'Pulses'),
  @('^(Bananas|Plantains and cooking bananas)$', 'Banana'), @('^Groundnuts, excluding shelled$', 'Groundnuts')
)
$inv = [Globalization.CultureInfo]::InvariantCulture
$areaYears = $null
$area = @{}
foreach ($r in (Import-Csv $prodCsv -Encoding UTF8)) {
  if (-not $areaYears) { $areaYears = @($r.PSObject.Properties.Name | Where-Object { $_ -match '^Y\d{4}$' } | Sort-Object | Select-Object -Last 3) }
  if ($r.'Element Code' -ne '5312' -or -not $FAO_AREAS.ContainsKey($r.Area)) { continue }
  $label = $null
  foreach ($m in $FOOD_ITEMS) { if ($r.Item -match $m[0]) { $label = $m[1]; break } }
  if (-not $label) { continue }
  $vals = @($areaYears | ForEach-Object { $v = $r.$_; if ($v -ne '' -and $null -ne $v) { [double]::Parse($v, $inv) } })
  if (-not $vals.Count) { continue }
  $cc = $FAO_AREAS[$r.Area]
  if (-not $area.ContainsKey($cc)) { $area[$cc] = @{} }
  $area[$cc][$label] = [double]$area[$cc][$label] + ($vals | Measure-Object -Average).Average
}
foreach ($cc in @($countries.Keys)) {
  if (-not $area.ContainsKey($cc)) { continue }
  $ha = [ordered]@{}
  foreach ($k in @($area[$cc].get_Keys() | Sort-Object)) { $ha[$k] = [long][Math]::Round($area[$cc][$k]) }
  $countries[$cc]['_areaHa'] = $ha
}
$areaPeriod = if ($areaYears) { ($areaYears[0] -replace 'Y', '') + '-' + ($areaYears[-1] -replace 'Y', '') } else { '' }
Write-Host "[cropcal] FAOSTAT area harvested for $($area.get_Count()) countries ($areaPeriod)"

$payload = [ordered]@{
  generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
  source = 'FAO Crop Calendar (cropcalendar.apps.fao.org); food crops ranked by FAOSTAT area harvested, ' + $areaPeriod + ' average'
  countries = $countries
}
[IO.File]::WriteAllText($outPath, ($payload | ConvertTo-Json -Depth 6 -Compress), (New-Object Text.UTF8Encoding($false)))
Write-Host "[cropcal] wrote $outPath ($covered countries)"

# Apply it to the published facts without a full build-country-facts.ps1 run, which
# re-downloads the World Bank, port and food-price data. Each data/facts/<cc>.js ends
# with its "cropCal" (and "staples") keys; only those are replaced, so nothing else in
# the file is reformatted.
. (Join-Path $PSScriptRoot 'crop-calendar-facts.ps1')
$farmPath = Join-Path $root 'data\farm-exports.json'
$farm = if (Test-Path $farmPath) { [IO.File]::ReadAllText($farmPath, [Text.Encoding]::UTF8) | ConvertFrom-Json } else { $null }
$calAll = [IO.File]::ReadAllText($outPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
$updated = 0
foreach ($cc in $CODES) {
  $path = Join-Path $root "data\facts\$cc.js"
  if (-not (Test-Path $path)) { continue }
  $text = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
  $exports = @()
  if ($farm -and $farm.countries.$cc) { $exports = @($farm.countries.$cc.items | Where-Object { $_ -and $_.label } | ForEach-Object { [string]$_.label }) }
  $f = Get-CropCalendarFacts $calAll.countries.$cc $exports
  $calJson = if ($f.CropCal) { $f.CropCal | ConvertTo-Json -Depth 4 -Compress } else { 'null' }
  $script:tail = '"cropCal":' + $calJson + ',"staples":' + (ConvertTo-Json -InputObject @($f.Staples) -Compress) + '}'
  $evaluator = [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $script:tail + $m.Groups[1].Value }
  $new = [regex]::Replace($text, '"cropCal":.*\}(\s*\)\);\s*)$', $evaluator, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($new -eq $text) { if ($text -notmatch '"cropCal"') { Write-Host "  $cc facts file has no cropCal key - skipped" -ForegroundColor Yellow }; continue }
  [IO.File]::WriteAllText($path, $new, (New-Object Text.UTF8Encoding($false)))
  $updated++
  Write-Host ("  {0}  calendar: {1}" -f $cc, (@($f.CropCal.Keys) -join ', '))
}
Write-Host "[cropcal] updated $updated data/facts files"
