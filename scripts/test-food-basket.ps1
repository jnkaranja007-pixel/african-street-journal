#Requires -Version 5.1
<#
.SYNOPSIS
  Deterministic tests for the WFP market and food picks (scripts/food-basket.ps1).
  The cases are the bad picks of the 22 Oct 2026 build: Kenya at IFO (Dadaab), Algeria
  at Awserd, Uganda at a refugee settlement, Mali at livestock, Benin at four beans.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/test-food-basket.ps1
#>

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'food-basket.ps1')

$passed = 0
$failed = 0
function Assert-Food([string]$Name, [bool]$Condition) {
  if ($Condition) { $script:passed++; Write-Host "  PASS $Name" -ForegroundColor Green }
  else { $script:failed++; Write-Host "  FAIL $Name" -ForegroundColor Red }
}

$staleCut = '2026-04-22'
$yearCut = '2025-10-22'

# One market's prices: each food priced monthly for Months months up to Sep 2026.
function New-Prices([string]$Market, [string[]]$Foods, [int]$Months = 12, [string]$Last = '2026-09-15') {
  $end = [datetime]::ParseExact($Last, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
  foreach ($food in $Foods) {
    for ($m = 0; $m -lt $Months; $m++) {
      [pscustomobject]@{ date = $end.AddMonths(-$m).ToString('yyyy-MM-dd'); market = $Market; commodity = $food; unit = 'KG'; currency = 'XXX'; price = 100 + $m; usd = 1; }
    }
  }
}
function City([string]$Name, [double]$Pop, [bool]$Capital = $false) { [pscustomobject]@{ name = $Name; pop = $Pop; capital = $Capital } }
function Foods($Basket) { @($Basket.items | ForEach-Object { $_.commodity }) }

Write-Host '[food-test] markets' -ForegroundColor Cyan
$keCities = @((City 'Nairobi' 4000000 $true), (City 'Mombasa' 1200000), (City 'Garissa' 160000))
$keRows = @(New-Prices 'IFO (Daadab)' @('Maize flour', 'Rice', 'Sugar', 'Bananas', 'Beans') 12) +
          @(New-Prices 'IFO (Daadab)' @('Maize flour') 12 '2026-09-01') +
          @(New-Prices 'Kibera (Nairobi)' @('Maize flour', 'Beans (rosecoco)', 'Sugar') 13) +
          @(New-Prices 'Garissa' @('Maize', 'Rice') 12)
$ke = Select-FoodBasket $keRows $keCities $staleCut $yearCut
Assert-Food 'Kenya: capital market beats the camp with more records' ($ke.market -eq 'Kibera (Nairobi)')
Assert-Food 'Kenya: not flagged as a camp' (-not $ke.camp)

$dzRows = @(New-Prices 'Awserd' @('Bananas', 'Yogurt', 'Milk', 'Cheese') 12) + @(New-Prices 'Smara' @('Wheat flour', 'Rice', 'Oil (vegetable)', 'Sugar', 'Salt') 6)
$dz = Select-FoodBasket $dzRows @((City 'Algiers' 2700000 $true), (City 'Tindouf' 50000)) $staleCut $yearCut
Assert-Food 'Algeria: only camps, so a camp with staples, flagged' ($dz.market -eq 'Smara' -and $dz.camp)
Assert-Food 'Algeria: staples, not yogurt and cheese' ((Foods $dz) -notcontains 'Yogurt' -and (Foods $dz) -contains 'Wheat flour')

# The real Algeria file (22 Oct 2026): five Sahrawi camps, spelt as WFP spells them
# ("Laayoun", no final e), and Tindouf, the Algerian town beside them. The camp list had
# "laayoune", so Laayoun passed as a town and won.
$dz2Rows = @(New-Prices 'Laayoun' @('Rice', 'Oil', 'Wheat flour', 'Lentils (black)') 12) +
           @(New-Prices 'Awserd' @('Rice', 'Oil', 'Wheat flour', 'Sugar') 12) +
           @(New-Prices 'Tindouf' @('Rice', 'Oil', 'Wheat flour') 12)
$dz2 = Select-FoodBasket $dz2Rows @((City 'Algiers' 2700000 $true), (City 'Oran' 850000)) $staleCut $yearCut
Assert-Food 'Algeria: WFP spelling Laayoun is a camp; Tindouf, the town, wins' ($dz2.market -eq 'Tindouf' -and -not $dz2.camp)

$ugRows = @(New-Prices 'Oruchinga (refugee settlement)' @('Salt', 'Maize flour', 'Beans') 12) + @(New-Prices 'Mbarara' @('Maize flour', 'Beans', 'Cassava flour') 8)
$ug = Select-FoodBasket $ugRows @((City 'Kampala' 1600000 $true), (City 'Mbarara' 195000)) $staleCut $yearCut
Assert-Food 'Uganda: a town, not the settlement' ($ug.market -eq 'Mbarara')

$egRows = @(New-Prices 'Cairo (national average)' @('Rice', 'Bread', 'Oil (sunflower)') 12) + @(New-Prices 'Alexandria' @('Rice', 'Bread', 'Sugar', 'Oil') 12) + @(New-Prices 'Alexandria' @('Lentils') 12)
$eg = Select-FoodBasket $egRows @((City 'Cairo' 9000000 $true), (City 'Alexandria' 5000000)) $staleCut $yearCut
Assert-Food 'Egypt: national average first' ($eg.market -eq 'Cairo (national average)')

$gwRows = @(New-Prices 'Gabu' @('Rice', 'Oil (palm)', 'Sugar') 12) + @(New-Prices 'Bissau-Bairro Militar' @('Rice', 'Sugar') 6)
$gw = Select-FoodBasket $gwRows @((City 'Bissau' 400000 $true), (City 'Gabu' 15000)) $staleCut $yearCut
Assert-Food 'Guinea-Bissau: a named district of the capital matches' ($gw.market -eq 'Bissau-Bairro Militar')

$tgRows = @(New-Prices 'NOTSE' @('Sorghum (red)', 'Maize') 12)
$tg = Select-FoodBasket $tgRows @((City 'Lome' 800000 $true)) $staleCut $yearCut
Assert-Food 'Togo: an all-caps market name is shown in title case' ($tg.market -eq 'Notse')

$snRows = @(New-Prices 'Dakar' @('Rice') 12 '2026-01-15') + @(New-Prices 'Thies' @('Rice', 'Millet') 12)
$sn = Select-FoodBasket $snRows @((City 'Dakar' 2500000 $true), (City 'Thies' 300000)) $staleCut $yearCut
Assert-Food 'Senegal: a capital market with nothing in six months is passed over' ($sn.market -eq 'Thies')

$cvRows = @(New-Prices 'Praia' @('Rice') 12 '2025-12-15')
Assert-Food 'Cabo Verde: nothing current gives no basket' ($null -eq (Select-FoodBasket $cvRows @((City 'Praia' 150000 $true)) $staleCut $yearCut))

$djRows = @(New-Prices 'Ali Sabieh' @('Leeks', 'Lemons', 'Carrots', 'Beetroots', 'Onions') 12) + @(New-Prices 'Tadjourah' @('Rice', 'Sugar', 'Leeks') 6)
$dj = Select-FoodBasket $djRows @((City 'Djibouti' 600000 $true)) $staleCut $yearCut
Assert-Food 'Djibouti: a market with staples beats one with only vegetables' ($dj.market -eq 'Tadjourah')

Write-Host '[food-test] foods' -ForegroundColor Cyan
$mlRows = @(New-Prices 'Bamako' @('Livestock (sheep, medium-sized male)', 'Livestock (goat, medium-sized male)', 'Meat (beef)', 'Fish (smoked)', 'Millet', 'Rice (local)', 'Sorghum (food aid)'))
$ml = Foods (Select-FoodBasket $mlRows @((City 'Bamako' 2500000 $true)) $staleCut $yearCut)
Assert-Food 'Mali: no livestock or food-aid rations' (@($ml | Where-Object { $_ -match 'Livestock|food aid' }).Count -eq 0)
Assert-Food 'Mali: staples listed first' ($ml[0] -eq 'Millet' -or $ml[0] -eq 'Rice (local)')
Assert-Food 'Mali: fills to four with other foods' ($ml.Count -eq 4)

$bjRows = @(New-Prices 'Cotonou' @('Beans (white)', 'Beans (red)', 'Beans (black)', 'Maize (white)', 'Rice (imported)', 'Gari', 'Oil (palm)'))
$bj = Foods (Select-FoodBasket $bjRows @((City 'Cotonou' 700000), (City 'Porto-Novo' 260000 $true)) $staleCut $yearCut)
Assert-Food 'Benin: one kind of beans, not three' (@($bj | Where-Object { $_ -like 'Beans*' }).Count -eq 1)
Assert-Food 'Benin: four staples' ($bj.Count -eq 4)

$keItems = (Select-FoodBasket $keRows $keCities $staleCut $yearCut).items
$maize = @($keItems | Where-Object { $_.commodity -eq 'Maize flour' })[0]
Assert-Food 'Price a year before is found at the same market' ($maize.price -eq 100 -and $maize.yearAgo -eq 112)

Write-Host ''
Write-Host "[food-test] passed=$passed failed=$failed"
if ($failed) { exit 1 }
