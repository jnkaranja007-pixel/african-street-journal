#Requires -Version 5.1
<#
.SYNOPSIS
  Picks the WFP market and the foods shown under "Food prices" for one country.
  Dot-sourced by build-country-facts.ps1 and tested by test-food-basket.ps1.
.NOTES
  "The market with the most records" picked refugee camps (IFO in Dadaab for Kenya,
  Oruchinga for Uganda, Awserd for Algeria) and baskets of salt, leeks or livestock.
  Now: a national average first, then the capital, then the largest cities, then any
  town, and a camp only when WFP monitors nothing else. Staple foods come first.
#>

# Camps and settlements. The Sahrawi refugee camps near Tindouf (Algeria) carry the
# names of Western Sahara towns, so those names count as camps too, in WFP's spellings
# ("Laayoun", no final e - which is how it slipped through as a town).
$FOOD_CAMP_PATTERN = '(?i)\b(camps?|refugees?|settlements?|idps?|dadaab|daadab|ifo|dagahaley|hagadera|kakuma|kalobeyei|awserd|ausserd|smara|boujdour|dakhla|laayoune?|aaiun|rabouni)\b'
# Foods most households buy every week, matched on the start of WFP's commodity name.
$FOOD_STAPLE_PATTERN = '(?i)^(maize|rice|sorghum|millet|wheat|teff|bread|beans|cowpeas|lentils|cassava|gari|yam|plantains|oil|sugar)\b'
# Live animals are sold by the head, and food-aid rations are not a shop price.
$FOOD_SKIP_PATTERN = '(?i)^livestock\b|food aid'

# A tie-break key both PowerShells sort the same way. Windows PowerShell ignores an
# apostrophe when comparing names and pwsh does not, so "M'Vengue" and "Makokou" (Gabon's
# airports) came out in a different order on the desktop than on the runner.
function Get-SortKey([string]$Text) {
  return (Get-FoodNameKey $Text) -replace ' ', ''
}

function Get-FoodNameKey([string]$Text) {
  $plain = $Text.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $plain.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) { [void]$sb.Append($ch) }
  }
  return (($sb.ToString().ToLowerInvariant() -replace '[^a-z]+', ' ').Trim())
}

# True when a WFP market name is that city: "Bissau-Bairro Militar" and "Kibera
# (Nairobi)" match; "Nairobi Road" in another town would too, which is acceptable.
function Test-FoodMarketInCity([string]$Market, [string]$City) {
  $cityKey = Get-FoodNameKey $City
  if (-not $cityKey) { return $false }
  $parts = @(Get-FoodNameKey ($Market -replace '\(.*$', ''))
  if ($Market -match '\(([^)]*)\)') { $parts += Get-FoodNameKey $Matches[1] }
  foreach ($part in $parts) {
    if ($part -eq $cityKey -or $part.StartsWith($cityKey + ' ')) { return $true }
  }
  return $false
}

function Get-FoodDisplayName([string]$Market) {
  if ($Market -cmatch '[a-z]') { return $Market }
  return (Get-Culture).TextInfo.ToTitleCase($Market.ToLowerInvariant())
}

<#
  Rows: objects with date (yyyy-MM-dd), market, commodity, unit, currency, price, usd -
        retail food prices only, newest 14 months is enough.
  Cities: objects with name, pop, capital (GeoNames, largest first is not required).
  Returns an ordered hashtable { market; camp; items } or $null when no market has a
  price newer than StaleCut.
#>
function Select-FoodBasket([object[]]$Rows, [object[]]$Cities, [string]$StaleCut, [string]$YearCut, [int]$Count = 4) {
  $recent = @($Rows | Where-Object { $_.date -ge $YearCut -and $_.commodity -notmatch $FOOD_SKIP_PATTERN })
  if (-not $recent.Count) { return $null }

  # The country's own currency is the one most of its rows are priced in. Somalia's file
  # mixes Somali shillings with Somaliland shillings (SLS, no dollar rate); a market in
  # the minority currency is used only when nothing else qualifies.
  $mainCurrency = (@($recent | Group-Object currency | Sort-Object Count -Descending) | Select-Object -First 1).Name
  $markets = @($recent | Group-Object market | ForEach-Object {
    $staples = @($_.Group | Where-Object { $_.commodity -match $FOOD_STAPLE_PATTERN } | Select-Object -ExpandProperty commodity -Unique)
    $foods = @($_.Group | Select-Object -ExpandProperty commodity -Unique)
    $own = @($_.Group | Where-Object { $_.currency -eq $mainCurrency }).Count
    [pscustomobject]@{
      name = $_.Name; records = $_.Count; staples = $staples.Count; foods = $foods.Count
      ownCurrency = ($own * 2 -gt $_.Count)
      current = [bool](@($_.Group | Where-Object { $_.date -ge $StaleCut }).Count)
      camp = ($_.Name -match $FOOD_CAMP_PATTERN)
    }
  } | Where-Object { $_.current })
  if (-not $markets.Count) { return $null }

  # Candidate order. Within each step the market with the most staples, then the most
  # records, wins. A market with no staple at all is used only when every one lacks them.
  $towns = @($markets | Where-Object { -not $_.camp })
  $ordered = New-Object System.Collections.Generic.List[object]
  $add = {
    param($list)
    foreach ($m in @($list | Sort-Object @{ Expression = 'staples'; Descending = $true }, @{ Expression = 'records'; Descending = $true }, @{ Expression = { Get-SortKey $_.name } })) {
      if (-not $ordered.Contains($m)) { $ordered.Add($m) }
    }
  }
  & $add @($towns | Where-Object { $_.name -match '(?i)national average' })
  $citiesByPop = @($Cities | Where-Object { $_ -and $_.name } | Sort-Object @{ Expression = { [bool]$_.capital }; Descending = $true }, @{ Expression = { [double]$_.pop }; Descending = $true })
  foreach ($city in $citiesByPop) {
    & $add @($towns | Where-Object { Test-FoodMarketInCity $_.name $city.name })
  }
  & $add $towns
  & $add @($markets | Where-Object { $_.camp })

  # First a market in the country's currency with staples and at least two foods
  # (Madagascar's pick had cassava alone); then relax one rule at a time.
  $pick = @($ordered | Where-Object { $_.staples -gt 0 -and $_.foods -ge 2 -and $_.ownCurrency } | Select-Object -First 1)
  if (-not $pick.Count) { $pick = @($ordered | Where-Object { $_.staples -gt 0 -and $_.foods -ge 2 } | Select-Object -First 1) }
  if (-not $pick.Count) { $pick = @($ordered | Where-Object { $_.staples -gt 0 } | Select-Object -First 1) }
  if (-not $pick.Count) { $pick = @($ordered | Select-Object -First 1) }
  $market = $pick[0]

  # Foods: staples first, then the rest, each by how often WFP priced it in the last
  # year; one per kind (first word), so a basket is not four kinds of beans.
  # Ties broken by name: Windows PowerShell and pwsh order equal counts differently, so
  # without it the same file gave a different basket on the desktop than on the runner.
  $groups = @($recent | Where-Object { $_.market -eq $market.name } | Group-Object commodity, unit |
    Sort-Object @{ Expression = 'Count'; Descending = $true }, @{ Expression = { Get-SortKey $_.Name }; Descending = $false })
  $chosen = New-Object System.Collections.Generic.List[object]
  $kinds = @{}
  foreach ($pass in @($true, $false)) {
    foreach ($g in $groups) {
      if ($chosen.Count -ge $Count) { break }
      $first = $g.Group[0]
      if (($first.commodity -match $FOOD_STAPLE_PATTERN) -ne $pass) { continue }
      $kind = (Get-FoodNameKey $first.commodity).Split(' ')[0]
      if ($kinds.ContainsKey($kind)) { continue }
      $kinds[$kind] = $true
      $chosen.Add($g)
    }
  }

  $atMarket = @($Rows | Where-Object { $_.market -eq $market.name })
  $items = New-Object System.Collections.Generic.List[object]
  foreach ($g in $chosen) {
    $last = @($g.Group | Sort-Object date)[-1]
    $target = ([datetime]::ParseExact($last.date, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)).AddYears(-1).ToString('yyyy-MM')
    $before = @($atMarket | Where-Object { $_.commodity -eq $last.commodity -and $_.unit -eq $last.unit -and $_.date.StartsWith($target) } | Select-Object -First 1)
    $yearAgo = $null
    if ($before.Count) { $yearAgo = [Math]::Round($before[0].price, 2) }
    $items.Add([ordered]@{
      commodity = $last.commodity; unit = $last.unit; currency = $last.currency
      price = [Math]::Round($last.price, 2); usd = [Math]::Round($last.usd, 2); date = $last.date.Substring(0, 7)
      yearAgo = $yearAgo
    })
  }
  return [ordered]@{ market = (Get-FoodDisplayName $market.name); camp = [bool]$market.camp; items = $items.ToArray() }
}
