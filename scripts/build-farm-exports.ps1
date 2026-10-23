#Requires -Version 5.1
<#
.SYNOPSIS
  Builds data/farm-exports.json: each country's main farm exports from FAOSTAT.
  build-country-facts.ps1 reads it for "Main farm exports" and the season calendar.
.DESCRIPTION
  The list in app.js was written by hand (Fish for Uganda, Coffee for Tanzania's top
  three). This takes FAOSTAT "Trade: crops and livestock products", export value, as the
  average of the last three years it reports, and keeps for each country:
    - items mapped to one label (cocoa beans, paste and butter are all "Cocoa");
    - only items the country exports more of than it imports, so re-exports drop out
      (Kenya's palm oil, Djibouti's sugar and rice);
    - at least $2 million a year, at least a tenth of the country's top item, at most 3.
  Processed goods are not farm exports and are not mapped: flour, bran, beer, spirits,
  cigarettes, "food preparations", refined sugar made from imported cane. Fish is not in
  this FAOSTAT domain.
.PARAMETER CacheDir
  Where the FAOSTAT zip (about 12 MB) is kept. Reused unless -Refresh.
.NOTES
  FAOSTAT updates trade once a year; run this by hand after its release, not in CI.
  FAO, FAOSTAT, CC BY 4.0.
#>
param(
  [string]$CacheDir = (Join-Path ([IO.Path]::GetTempPath()) 'asj-faostat-cache'),
  [switch]$Refresh
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outPath = Join-Path $root 'data\farm-exports.json'
$inv = [Globalization.CultureInfo]::InvariantCulture
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

$zip = Join-Path $CacheDir 'Trade_CropsLivestock_E_Africa.zip'
$csv = Join-Path $CacheDir 'Trade_CropsLivestock_E_Africa_NOFLAG.csv'
if ($Refresh -or -not (Test-Path $csv)) {
  Invoke-WebRequest -Uri 'https://bulks-faostat.fao.org/production/Trade_CropsLivestock_E_Africa.zip' -OutFile $zip -UseBasicParsing -TimeoutSec 600
  Expand-Archive -Path $zip -DestinationPath $CacheDir -Force
}

# FAOSTAT area names; Western Sahara is not reported. "Sudan (former)" is pre-2011.
$AREAS = @{ 'Algeria'='dz'; 'Angola'='ao'; 'Benin'='bj'; 'Botswana'='bw'; 'Burkina Faso'='bf'; 'Burundi'='bi'; 'Cabo Verde'='cv'; 'Cameroon'='cm';
  'Central African Republic'='cf'; 'Chad'='td'; 'Comoros'='km'; 'Congo'='cg'; ('C' + [char]0xF4 + "te d'Ivoire")='ci'; 'Democratic Republic of the Congo'='cd';
  'Djibouti'='dj'; 'Egypt'='eg'; 'Equatorial Guinea'='gq'; 'Eritrea'='er'; 'Eswatini'='sz'; 'Ethiopia'='et'; 'Gabon'='ga'; 'Gambia'='gm'; 'Ghana'='gh';
  'Guinea'='gn'; 'Guinea-Bissau'='gw'; 'Kenya'='ke'; 'Lesotho'='ls'; 'Liberia'='lr'; 'Libya'='ly'; 'Madagascar'='mg'; 'Malawi'='mw'; 'Mali'='ml';
  'Mauritania'='mr'; 'Mauritius'='mu'; 'Morocco'='ma'; 'Mozambique'='mz'; 'Namibia'='na'; 'Niger'='ne'; 'Nigeria'='ng'; 'Rwanda'='rw';
  'Sao Tome and Principe'='st'; 'Senegal'='sn'; 'Seychelles'='sc'; 'Sierra Leone'='sl'; 'Somalia'='so'; 'South Africa'='za'; 'South Sudan'='ss';
  'Sudan'='sd'; 'Togo'='tg'; 'Tunisia'='tn'; 'Uganda'='ug'; 'United Republic of Tanzania'='tz'; 'Zambia'='zm'; 'Zimbabwe'='zw' }

# FAOSTAT item -> label. First match wins; an item not listed is not counted.
$LABELS = @(
  @('^Cocoa', 'Cocoa'), @('^Coffee', 'Coffee'), @('^Tea leaves|^Tea\b', 'Tea'), @('Cashew', 'Cashew'), @('^Sesame', 'Sesame'),
  @('^Groundnut|^Cake of groundnuts|^Peanut', 'Groundnuts'), @('^Cotton', 'Cotton'), @('^Unmanufactured tobacco', 'Tobacco'),
  @('^Raw cane or beet sugar|^Sugar cane', 'Sugar'), @('^Dates', 'Dates'), @('^Olive oil|^Olives', 'Olive oil'),
  @('^Oranges|^Tangerines|^Lemons|^Grapefruit|^Other citrus|^Orange juice', 'Citrus'), @('^Grapes', 'Grapes'), @('^Wine', 'Wine'),
  @('^Tomatoes', 'Tomatoes'), @('^Raspberries|^Blueberries|^Cranberries|^Strawberries|^Other berries', 'Berries'), @('^Avocados', 'Avocados'),
  @('^Bananas', 'Banana'), @('^Pineapples|^Juice of pineapples', 'Pineapple'), @('^Potatoes', 'Potatoes'), @('^Onions', 'Onion'),
  @('^Vanilla', 'Vanilla'), @('^Cloves', 'Cloves'), @('^Palm oil|^Oil of palm kernel|^Palm kernels', 'Palm oil'), @('^Natural rubber', 'Rubber'),
  @('^Karite|^Shea', 'Shea'), @('^Soya beans|^Cake of soya', 'Soya'), @('^Maize \(corn\)', 'Maize'), @('^Rice', 'Rice'),
  @('^Cattle$|^Meat of cattle|^Bovine', 'Cattle'), @('^Sheep$|^Goats$|^Meat of sheep|^Meat of goat', 'Sheep and goats'), @('^Camels$', 'Camels'),
  @('^Shorn wool|^Wool', 'Wool'), @('^Fine animal hair', 'Mohair'),
  @('^Beans, dry|^Lentils|^Pigeon peas|^Chick peas|^Cow peas|^Broad beans|^Other pulses|^Peas, dry|^Bambara', 'Pulses'),
  @('^Watermelons|^Cantaloupes', 'Melons'), @('^Melonseed', 'Melon seeds'), @('^Natural gums', 'Gum arabic'),
  @('^Sorghum', 'Sorghum'), @('^Millet', 'Millet'), @('^Ginger', 'Ginger'),
  @('^Coconuts|^Coconut oil|^Copra', 'Coconut'), @('^Essential oils', 'Essential oils'), @('^Apples', 'Apples'), @('^Pears', 'Pears')
)
# Cut flowers sit in FAOSTAT's "crude organic material n.e.c." (HS 06). Only Kenya's and
# Ethiopia's flower industries are that size; elsewhere the item is something else.
$FLOWERS = @('ke', 'et')
# FAOSTAT's figures for Djibouti are goods passing through its port.
$NOTES = @{
  dj = 'FAOSTAT''s figures for Djibouti are goods passing through its port, not its own farm produce.'
  eh = 'FAOSTAT does not report Western Sahara.'
}

$header = $null
$years = @()
$data = @{}
foreach ($r in (Import-Csv $csv -Encoding UTF8)) {
  if (-not $header) {
    $header = $r.PSObject.Properties.Name
    $years = @($header | Where-Object { $_ -match '^Y\d{4}$' } | Sort-Object | Select-Object -Last 3)
  }
  if (-not $AREAS.ContainsKey($r.Area)) { continue }
  $el = $r.'Element Code'
  if ($el -ne '5922' -and $el -ne '5622') { continue }   # export value, import value (1000 USD)
  if ([int]$r.'Item Code' -ge 1700) { continue }          # aggregates ("Total merchandise", "Fruit")
  $cc = $AREAS[$r.Area]
  $label = $null
  if ($r.Item -like 'Crude organic material*' -and $FLOWERS -contains $cc) { $label = 'Cut flowers' }
  else { foreach ($m in $LABELS) { if ($r.Item -match $m[0]) { $label = $m[1]; break } } }
  if (-not $label) { continue }
  $vals = @($years | ForEach-Object { $v = $r.$_; if ($v -ne '' -and $null -ne $v) { [double]::Parse($v, $inv) } })
  if (-not $vals.Count) { continue }
  $usd = ($vals | Measure-Object -Average).Average * 1000
  $key = $cc + '|' + $label
  if (-not $data.ContainsKey($key)) { $data[$key] = @{ cc = $cc; label = $label; exp = 0.0; imp = 0.0 } }
  if ($el -eq '5922') { $data[$key].exp += $usd } else { $data[$key].imp += $usd }
}

$CODES = @('dz','ao','bj','bw','bf','bi','cm','cv','cf','td','km','cg','cd','ci','dj','eg','gq','er','sz','et',
           'ga','gm','gh','gn','gw','ke','ls','lr','ly','mg','mw','ml','mr','mu','ma','mz','na','ne','ng','rw',
           'st','sn','sc','sl','so','za','ss','sd','tz','tg','tn','ug','zm','zw','eh')
$period = ($years[0] -replace 'Y', '') + '-' + ($years[-1] -replace 'Y', '')
$countries = [ordered]@{}
foreach ($cc in $CODES) {
  $rows = @($data.Values | Where-Object { $_.cc -eq $cc -and $_.exp -gt $_.imp -and $_.exp -ge 2e6 } |
    Sort-Object @{ Expression = { $_.exp }; Descending = $true }, @{ Expression = { $_.label } })
  $items = @()
  if ($rows.Count -and -not $NOTES.ContainsKey($cc)) {
    $top = $rows[0].exp
    $items = @($rows | Where-Object { $_.exp -ge $top * 0.1 } | Select-Object -First 3 | ForEach-Object {
      [ordered]@{ label = $_.label; usd = [long][Math]::Round($_.exp) } })
  }
  $note = if ($NOTES.ContainsKey($cc)) { $NOTES[$cc] } elseif (-not $items.Count) { 'FAOSTAT records under $2 million a year of farm exports.' } else { $null }
  $countries[$cc] = [ordered]@{ items = $items; note = $note }
  Write-Host ('  {0}  {1}' -f $cc, $(if ($items.Count) { ($items | ForEach-Object { $_.label + ' $' + [Math]::Round($_.usd / 1e6) + 'M' }) -join ', ' } else { '(' + $note + ')' }))
}
$payload = [ordered]@{
  generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
  source = 'FAOSTAT, Trade: crops and livestock products (export value)'
  period = $period
  countries = $countries
}
[IO.File]::WriteAllText($outPath, ($payload | ConvertTo-Json -Depth 6 -Compress), (New-Object Text.UTF8Encoding($false)))
Write-Host "[farm] wrote $outPath ($period)"
