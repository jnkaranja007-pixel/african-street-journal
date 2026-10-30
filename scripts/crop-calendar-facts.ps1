#Requires -Version 5.1
<#
.SYNOPSIS
  Which crops a country's Season Calendar shows, and their FAO months. Dot-sourced by
  build-country-facts.ps1 (full rebuild) and build-crop-calendar.ps1 (which updates
  data/facts/<cc>.js in place after a calendar refresh), so both apply one rule.
.DESCRIPTION
  The calendar showed a country's top farm exports only, so Kenya's read tea, cut
  flowers and coffee - none of them in FAO's calendar for Kenya, so all three on
  "typical months" - and never maize or beans, which most Kenyan farmers grow. It now
  shows the two food crops FAO lists in the most zones, then the exports.
#>
$script:CALENDAR_FOOD_CROPS = @('Maize', 'Rice', 'Sorghum', 'Millet', 'Cassava', 'Wheat', 'Teff', 'Yams',
  'Sweet potatoes', 'Potatoes', 'Pulses', 'Barley', 'Banana', 'Groundnuts')

function Get-CropCalendarFacts($CalCountry, [string[]]$ExportLabels) {
  if (-not $CalCountry) { return [pscustomobject]@{ CropCal = $null; Staples = @() } }
  # Most land first (FAOSTAT area harvested, "_areaHa" from build-crop-calendar.ps1),
  # else most calendar zones; the list order breaks ties (Sort-Object is not stable on
  # 5.1). Only a crop with FAO calendar months can be shown.
  $areaHa = $CalCountry._areaHa
  $ranked = New-Object System.Collections.Generic.List[object]
  for ($i = 0; $i -lt $script:CALENDAR_FOOD_CROPS.Count; $i++) {
    $label = $script:CALENDAR_FOOD_CROPS[$i]
    $c = $CalCountry.$label
    if (-not $c) { continue }
    $ha = if ($areaHa) { [double]$areaHa.$label } else { 0 }
    $ranked.Add([pscustomobject]@{ Label = $label; Area = $ha; Zones = [int]$c.zones; Order = $i })
  }
  $staples = @($ranked | Sort-Object -Property @{ Expression = 'Area'; Descending = $true }, @{ Expression = 'Zones'; Descending = $true }, @{ Expression = 'Order'; Descending = $false } |
    Select-Object -First 2 | ForEach-Object { $_.Label })
  $months = [ordered]@{}
  foreach ($label in (@($staples) + @($ExportLabels))) {
    if (-not $label -or $months.Contains($label)) { continue }
    $c = $CalCountry.$label
    if ($c) { $months[$label] = [ordered]@{ s = @($c.s | ForEach-Object { [int]$_ }); h = @($c.h | ForEach-Object { [int]$_ }); zones = [int]$c.zones } }
  }
  return [pscustomobject]@{ CropCal = $(if ($months.Count) { $months } else { $null }); Staples = $staples }
}
