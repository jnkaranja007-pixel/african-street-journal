#Requires -Version 5.1
<#
.SYNOPSIS
  Builds data/country-facts.js: the same sourced facts for every one of the 55 countries.
.DESCRIPTION
  The Signals and Atlas panels used to be a template filled in 55 times. Sector words
  were mapped to fixed phrases ("Fintech - Urban adoption - Regulation - Mobile rails"),
  every city carried made-up attributes (only the capital was ever a "market", Mombasa
  had no port), and when a country had no port on file the code invented one: Sao Tome
  got "Sao Tome Inland Freight Desk", a dry port, on an island.

  This replaces all of that with public datasets, applied identically to every country:
    - World Bank World Development Indicators: the latest reported value since 2015 for
      each indicator, with its year. Missing stays missing and is shown as such.
    - NGA World Port Index (Pub. 150): seaports, with harbour size. Offshore oil
      terminals, buoys and moorings are left out - they are not ports a reader can use.
    - OurAirports: airports with scheduled passenger service.
  Western Sahara is not a World Bank member and has no WDI data; it is reported as such
  rather than borrowed from Morocco.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/build-country-facts.ps1
.NOTES
  Network: api.worldbank.org, msi.nga.mil, davidmegginson.github.io. No keys.
  A source that fails to download keeps the previous file's values for that source.
#>
param(
  [int]$FromYear = 2015,
  [int]$MaxPorts = 8,
  [int]$MaxAirports = 10,
  [switch]$SkipFoodPrices      # WFP files total ~280 MB; skip for a quick rebuild
)

# Each country's main international airports, by IATA code, most important first. Used
# only to ORDER what OurAirports lists - it adds nothing OurAirports does not have.
# OurAirports carries no traffic figures, and sorting by size then name put Bram
# Fischer ahead of O.R. Tambo and dropped Lagos, Casablanca and Durban from the top 8.
# Sudan leads with Port Sudan: Khartoum's airport has been out of service since 2023.
# Each country's main seaport, matched on the start of the World Port Index name, used
# only to ORDER the ports WPI lists. Within one harbour-size class WPI ties were broken
# alphabetically, so the map led with Cabinda (not Luanda), Takoradi (not Tema), Beira
# (not Maputo), Luderitz (not Walvis Bay), Boma (not Matadi) and Cape Town (not Durban).
$MAIN_PORTS = @{
  dz='Alger'; ao='Luanda'; bj='Cotonou'; cm='Douala'; cv='Porto Da Praia'; km='Moroni'; cg='Pointe Noire';
  cd='Matadi'; ci='Abidjan'; dj='Djibouti'; eg='Al Iskandariyh'; gq='Malabo'; er='Mitsiwa'; ga='Port Owendo';
  gm='Banjul'; gh='Tema'; gn='Conakry'; gw='Bissau'; ke='Mombasa'; lr='Monrovia'; ly='Mina Tarabulus';
  mg='Toamasina'; mr='Nouakchott'; mu='Port Louis'; ma='Casablanca'; mz='Maputo'; na='Walvis Bay'; ng='Lagos';
  st='Sao Tome'; sn='Dakar'; sc='Victoria'; sl='Freetown'; so='Muqdisho'; za='Durban'; sd='Port Sudan';
  tz='Dar Es Salaam'; tg='Lome'; tn='Rades'; eh='Laayoune'
}

$GATEWAYS = @{
  dz='ALG'; ao='NBJ,LAD'; bj='COO'; bw='GBE'; bf='OUA'; bi='BJM'; cm='DLA,NSI'; cv='RAI,SID'; cf='BGF';
  td='NDJ'; km='HAH'; cg='BZV,PNR'; cd='FIH,FBM'; ci='ABJ'; dj='JIB'; eg='CAI,HRG,SSH'; gq='SSG'; er='ASM';
  sz='SHO'; et='ADD'; ga='LBV'; gm='BJL'; gh='ACC'; gn='CKY'; gw='OXB'; ke='NBO,MBA'; ls='MSU'; lr='ROB';
  ly='MJI,BEN'; mg='TNR'; mw='LLW,BLZ'; ml='BKO'; mr='NKC'; mu='MRU'; ma='CMN,RAK,RBA'; mz='MPM'; na='WDH';
  ne='NIM'; ng='LOS,ABV'; rw='KGL'; st='TMS'; sn='DSS'; sc='SEZ'; sl='FNA'; so='MGQ,HGA'; za='JNB,CPT,DUR';
  ss='JUB'; sd='PZU,KRT'; tz='DAR,JRO,ZNZ'; tg='LFW'; tn='TUN'; ug='EBB'; zm='LUN'; zw='HRE'; eh='EUN'
}
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'food-basket.ps1')
$outPath = Join-Path $root 'data\country-facts.js'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('asj-facts-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

# ISO2 code -> every name the sources use for it. The first is the display name.
$COUNTRIES = [ordered]@{
  dz=@('Algeria'); ao=@('Angola'); bj=@('Benin'); bw=@('Botswana'); bf=@('Burkina Faso');
  bi=@('Burundi'); cm=@('Cameroon'); cv=@('Cabo Verde','Cape Verde'); cf=@('Central African Republic');
  td=@('Chad'); km=@('Comoros'); cg=@('Congo','Republic of the Congo','Congo (Brazzaville)');
  cd=@('Democratic Republic of the Congo','Congo, Democratic Republic of the','Congo (Kinshasa)');
  ci=@("Cote d'Ivoire","Ivory Coast"); dj=@('Djibouti'); eg=@('Egypt'); gq=@('Equatorial Guinea');
  er=@('Eritrea'); sz=@('Eswatini','Swaziland'); et=@('Ethiopia'); ga=@('Gabon'); gm=@('Gambia','The Gambia');
  gh=@('Ghana'); gn=@('Guinea'); gw=@('Guinea-Bissau'); ke=@('Kenya'); ls=@('Lesotho'); lr=@('Liberia');
  ly=@('Libya'); mg=@('Madagascar'); mw=@('Malawi'); ml=@('Mali'); mr=@('Mauritania'); mu=@('Mauritius');
  ma=@('Morocco'); mz=@('Mozambique'); na=@('Namibia'); ne=@('Niger'); ng=@('Nigeria'); rw=@('Rwanda');
  st=@('Sao Tome and Principe'); sn=@('Senegal'); sc=@('Seychelles');
  sl=@('Sierra Leone'); so=@('Somalia'); za=@('South Africa'); ss=@('South Sudan'); sd=@('Sudan');
  tz=@('Tanzania','United Republic of Tanzania'); tg=@('Togo'); tn=@('Tunisia'); ug=@('Uganda');
  zm=@('Zambia'); zw=@('Zimbabwe'); eh=@('Western Sahara')
}

# What each panel shows, in display order. Codes are WDI series ids.
$INDICATORS = [ordered]@{
  growth        = 'NY.GDP.MKTP.KD.ZG'   # GDP growth, annual %
  inflation     = 'FP.CPI.TOTL.ZG'      # Inflation, consumer prices, annual %
  fdi           = 'BX.KLT.DINV.CD.WD'   # FDI, net inflows, current US$
  exports       = 'NE.EXP.GNFS.ZS'      # Exports of goods and services, % of GDP
  unemployment  = 'SL.UEM.TOTL.ZS'      # Unemployment, % of labour force (ILO modelled)
  extDebt       = 'DT.DOD.DECT.GN.ZS'   # External debt stocks, % of GNI
  agShare       = 'NV.AGR.TOTL.ZS'      # Agriculture, forestry, fishing value added, % of GDP
  agJobs        = 'SL.AGR.EMPL.ZS'      # Employment in agriculture, % of employment (ILO modelled)
  agLand        = 'AG.LND.AGRI.ZS'      # Agricultural land, % of land area
  cerealYield   = 'AG.YLD.CREL.KG'      # Cereal yield, kg per hectare
  undernourished= 'SN.ITK.DEFC.ZS'      # Prevalence of undernourishment, % of population
  remitUsd      = 'BX.TRF.PWKR.CD.DT'   # Personal remittances, received, current US$
  remitGdp      = 'BX.TRF.PWKR.DT.GD.ZS'# Personal remittances, received, % of GDP
  remitCost     = 'SI.RMT.COST.IB.ZS'   # Average cost of sending remittances to the country, %
  internet      = 'IT.NET.USER.ZS'      # Individuals using the Internet, % of population
  electricity   = 'EG.ELC.ACCS.ZS'      # Access to electricity, % of population
}

$previous = $null
if (Test-Path $outPath) {
  $prevText = [IO.File]::ReadAllText($outPath, [Text.Encoding]::UTF8)
  $pm = [regex]::Match($prevText, 'window\.ASJ_COUNTRY_FACTS\s*=\s*(\{.*\});', 'Singleline')
  if ($pm.Success) { try { $previous = $pm.Groups[1].Value | ConvertFrom-Json } catch { $previous = $null } }
}

function Get-Download([string]$Url, [string]$Path) {
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try { Invoke-WebRequest -Uri $Url -OutFile $Path -UseBasicParsing -TimeoutSec 120; return $true }
    catch { Write-Host "  download attempt $attempt failed: $($_.Exception.Message)" -ForegroundColor Yellow; Start-Sleep -Seconds (2 * $attempt) }
  }
  return $false
}

$facts = [ordered]@{}
foreach ($cc in $COUNTRIES.Keys) { $facts[$cc] = [ordered]@{ name = $COUNTRIES[$cc][0]; wb = [ordered]@{}; ports = @(); airports = @(); cities = @() } }

# --- World Bank ----------------------------------------------------------------
$wbCodes = @($COUNTRIES.Keys | Where-Object { $_ -ne 'eh' })
$wbOk = $true
foreach ($key in $INDICATORS.Keys) {
  $series = $INDICATORS[$key]
  Write-Host "[facts] World Bank $series ($key)"
  # country/all, filtered here. A semicolon list of 54 codes is answered with 403.
  $url = "https://api.worldbank.org/v2/country/all/indicator/$series" + "?format=json&per_page=20000&date=$FromYear" + ":2030"
  $rows = $null
  for ($attempt = 1; $attempt -le 3 -and -not $rows; $attempt++) {
    try {
      $resp = Invoke-RestMethod -Uri $url -TimeoutSec 90
      if ($resp -and $resp.Count -ge 2) { $rows = @($resp[1]) }
    } catch { Write-Host "  attempt $attempt failed: $($_.Exception.Message)" -ForegroundColor Yellow; Start-Sleep -Seconds (2 * $attempt) }
  }
  if (-not $rows) { $wbOk = $false; Write-Host "  no response for $series" -ForegroundColor Red; continue }
  $latest = @{}
  foreach ($r in $rows) {
    if ($null -eq $r.value) { continue }
    $cc = ([string]$r.country.id).ToLowerInvariant()
    # The API answers with ISO3 in countryiso3code and ISO2 in country.id.
    if (-not $facts.Contains($cc)) { continue }
    $year = [int]$r.date
    if (-not $latest.ContainsKey($cc) -or $year -gt $latest[$cc].y) { $latest[$cc] = @{ v = [double]$r.value; y = $year } }
  }
  foreach ($cc in $wbCodes) {
    if ($latest.ContainsKey($cc)) {
      $v = $latest[$cc].v
      $rounded = if ([Math]::Abs($v) -ge 1000) { [Math]::Round($v) } else { [Math]::Round($v, 1) }
      $facts[$cc].wb[$key] = [ordered]@{ v = $rounded; y = $latest[$cc].y }
    } else {
      $facts[$cc].wb[$key] = $null
    }
  }
}

# --- Seaports: World Port Index -------------------------------------------------
$wpiPath = Join-Path $tmp 'wpi.csv'
$portsOk = Get-Download 'https://msi.nga.mil/api/publications/download?key=16920959/SFH00000/UpdatedPub150.csv&type=view' $wpiPath
if ($portsOk) {
  $wpi = Import-Csv $wpiPath -Encoding UTF8
  $sizeRank = @{ 'Large' = 4; 'Medium' = 3; 'Small' = 2; 'Very Small' = 1 }
  $nameToCode = @{}
  foreach ($cc in $COUNTRIES.Keys) { foreach ($n in $COUNTRIES[$cc]) { $nameToCode[$n.ToLowerInvariant()] = $cc } }
  $byCountry = @{}
  foreach ($p in $wpi) {
    $cc = $nameToCode[([string]$p.'Country Code').Trim().ToLowerInvariant()]
    if (-not $cc) { continue }
    $name = ([string]$p.'Main Port Name').Trim()
    # Oil terminals, offshore moorings and buoys are not ports a reader or trader uses.
    if ($name -match '(?i)\b(terminal|offshore|fpso|fso|sbm|spm|buoy|mooring|platform|field)\b') { continue }
    $lat = 0.0; $lon = 0.0
    if (-not [double]::TryParse([string]$p.Latitude, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$lat)) { continue }
    if (-not [double]::TryParse([string]$p.Longitude, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$lon)) { continue }
    $size = ([string]$p.'Harbor Size').Trim()
    if (-not $byCountry.ContainsKey($cc)) { $byCountry[$cc] = New-Object System.Collections.Generic.List[object] }
    $byCountry[$cc].Add([ordered]@{ name = $name; size = $size; lat = [Math]::Round($lat, 3); lon = [Math]::Round($lon, 3); rank = [int]$sizeRank[$size] })
  }
  foreach ($cc in $COUNTRIES.Keys) {
    $main = [string]$MAIN_PORTS[$cc]
    $list = @()
    if ($byCountry.ContainsKey($cc)) {
      $list = @($byCountry[$cc] | Sort-Object `
        @{ e = { if ($main -and $_.name.StartsWith($main, [StringComparison]::OrdinalIgnoreCase)) { 0 } else { 1 } } }, `
        @{ e = { $_.rank }; Descending = $true }, @{ e = { Get-SortKey $_.name } } | Select-Object -First $MaxPorts)
      if ($main -and -not ($list | Where-Object { $_.name.StartsWith($main, [StringComparison]::OrdinalIgnoreCase) })) {
        Write-Host "  $cc main port '$main' not in the World Port Index list" -ForegroundColor Yellow
      }
    }
    $facts[$cc].ports = @($list | ForEach-Object { [ordered]@{ name = $_.name; size = $_.size; lat = $_.lat; lon = $_.lon } })
  }
} elseif ($previous) {
  Write-Host '[facts] World Port Index unavailable; keeping previous ports' -ForegroundColor Yellow
  foreach ($cc in $COUNTRIES.Keys) { if ($previous.countries.$cc) { $facts[$cc].ports = @($previous.countries.$cc.ports) } }
}

# --- Airports: OurAirports -------------------------------------------------------
$apPath = Join-Path $tmp 'airports.csv'
$airportsOk = Get-Download 'https://davidmegginson.github.io/ourairports-data/airports.csv' $apPath
if ($airportsOk) {
  $ap = Import-Csv $apPath -Encoding UTF8
  $typeRank = @{ 'large_airport' = 2; 'medium_airport' = 1 }
  $byCountry = @{}
  foreach ($a in $ap) {
    if ($a.scheduled_service -ne 'yes') { continue }
    # Safari lodge strips carry scheduled hops but are not a country's air links.
    if ($a.name -match '(?i)\b(airstrip|lodge|camp)\b') { continue }
    if (-not $typeRank.ContainsKey($a.type)) { continue }
    $cc = ([string]$a.iso_country).ToLowerInvariant()
    if (-not $facts.Contains($cc)) { continue }
    if (-not $byCountry.ContainsKey($cc)) { $byCountry[$cc] = New-Object System.Collections.Generic.List[object] }
    $byCountry[$cc].Add([ordered]@{
      name = ([string]$a.name).Trim(); iata = ([string]$a.iata_code).Trim(); city = ([string]$a.municipality).Trim()
      type = if ($a.type -eq 'large_airport') { 'Large' } else { 'Medium' }
      lat = [Math]::Round([double]::Parse($a.latitude_deg, [Globalization.CultureInfo]::InvariantCulture), 3)
      lon = [Math]::Round([double]::Parse($a.longitude_deg, [Globalization.CultureInfo]::InvariantCulture), 3)
      rank = $typeRank[$a.type]
    })
  }
  foreach ($cc in $COUNTRIES.Keys) {
    $gw = @(([string]$GATEWAYS[$cc]) -split ',' | Where-Object { $_ })
    $list = @()
    if ($byCountry.ContainsKey($cc)) {
      $list = @($byCountry[$cc] | Sort-Object `
        @{ e = { $i = [array]::IndexOf($gw, $_.iata); if ($i -lt 0) { 99 } else { $i } } }, `
        @{ e = { $_.rank }; Descending = $true }, @{ e = { Get-SortKey $_.name } } | Select-Object -First $MaxAirports)
    }
    $missing = @($gw | Where-Object { $code = $_; -not ($list | Where-Object { $_.iata -eq $code }) })
    if ($missing.Count) { Write-Host "  $cc gateway not in OurAirports scheduled list: $($missing -join ', ')" -ForegroundColor Yellow }
    $facts[$cc].airports = @($list | ForEach-Object { [ordered]@{ name = $_.name; iata = $_.iata; city = $_.city; type = $_.type; gateway = ($gw -contains $_.iata); lat = $_.lat; lon = $_.lon } })
  }
} elseif ($previous) {
  Write-Host '[facts] OurAirports unavailable; keeping previous airports' -ForegroundColor Yellow
  foreach ($cc in $COUNTRIES.Keys) { if ($previous.countries.$cc) { $facts[$cc].airports = @($previous.countries.$cc.airports) } }
}

# --- Largest cities: GeoNames (every city of 15,000+) ----------------------------
# Natural Earth, which draws the Atlas, carries one or two places for the small island
# states; GeoNames covers every country the same way.
$zipPath = Join-Path $tmp 'cities15000.zip'
$citiesOk = Get-Download 'https://download.geonames.org/export/dump/cities15000.zip' $zipPath
if ($citiesOk) {
  Expand-Archive -Path $zipPath -DestinationPath $tmp -Force
  $byCountry = @{}
  foreach ($line in [IO.File]::ReadLines((Join-Path $tmp 'cities15000.txt'), [Text.Encoding]::UTF8)) {
    $c = $line.Split("`t")
    if ($c.Count -lt 15) { continue }
    $cc = $c[8].ToLowerInvariant()
    if (-not $facts.Contains($cc)) { continue }
    # Sections of a city (PPLX) would list one place twice.
    if ($c[7] -eq 'PPLX' -or $c[7] -eq 'PPLH') { continue }
    $pop = 0L
    if (-not [long]::TryParse($c[14], [ref]$pop) -or $pop -le 0) { continue }
    if (-not $byCountry.ContainsKey($cc)) { $byCountry[$cc] = New-Object System.Collections.Generic.List[object] }
    $byCountry[$cc].Add([ordered]@{
      name = $c[1]; pop = $pop; capital = ($c[7] -eq 'PPLC')
      lat = [Math]::Round([double]::Parse($c[4], [Globalization.CultureInfo]::InvariantCulture), 3)
      lon = [Math]::Round([double]::Parse($c[5], [Globalization.CultureInfo]::InvariantCulture), 3)
    })
  }
  foreach ($cc in $COUNTRIES.Keys) {
    # GeoNames lists the communes and suburbs of a metro as cities of their own (Abobo in
    # Abidjan, Viana in Luanda, Camayenne in Conakry). Keep a city only if it is more
    # than 20 km from every larger one already kept.
    $kept = New-Object System.Collections.Generic.List[object]
    if ($byCountry.ContainsKey($cc)) {
      foreach ($city in @($byCountry[$cc] | Sort-Object @{ e = { $_.pop }; Descending = $true })) {
        $near = $false
        foreach ($k in $kept) {
          $kx = 111.32 * [Math]::Cos($city.lat * [Math]::PI / 180)
          if ([Math]::Sqrt([Math]::Pow(($city.lon - $k.lon) * $kx, 2) + [Math]::Pow(($city.lat - $k.lat) * 111.32, 2)) -lt 20) { $near = $true; break }
        }
        if (-not $near) { $kept.Add($city) }
        if ($kept.Count -ge 6) { break }
      }
    }
    $facts[$cc].cities = $kept.ToArray()
  }
} elseif ($previous) {
  Write-Host '[facts] GeoNames unavailable; keeping previous cities' -ForegroundColor Yellow
  foreach ($cc in $COUNTRIES.Keys) { if ($previous.countries.$cc) { $facts[$cc].cities = @($previous.countries.$cc.cities) } }
}
# Cross-checked populations (scripts/build-city-populations.ps1: the median of Natural
# Earth, GeoNames and Wikidata) replace GeoNames' own where present. GeoNames alone gave
# Kakamega, a town of about 100,000, its county's 1.87 million.
$cityPopPath = Join-Path $root 'data\city-populations.json'
$citySource = 'GeoNames (cities of 15,000+)'
if (Test-Path $cityPopPath) {
  $cityPop = [IO.File]::ReadAllText($cityPopPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($cc in $COUNTRIES.Keys) {
    $list = @($cityPop.countries.$cc | Where-Object { $_ -and $_.name })
    if ($list.Count) { $facts[$cc].cities = @($list | ForEach-Object { [ordered]@{ name = $_.name; pop = [long]$_.pop; capital = [bool]$_.capital; lat = $_.lat; lon = $_.lon; sources = $_.sources } }) }
  }
  $citySource = 'Median of Natural Earth, GeoNames and Wikidata (' + $cityPop.generated + ')'
}

# --- Food prices: WFP market monitoring, via HDX ----------------------------------
# WFP publishes retail prices for about 45 African countries. For each: one market (a
# national average, else the capital, else the largest town, a camp only as a last
# resort) and four foods, staples first - see scripts/food-basket.ps1 - with the
# latest price and the price a year before at the same market. Fuel, wages and soap are
# monitored too and left out. A country whose latest record is more than six months old
# gets no prices, and the page says WFP has no current prices for it.
$WFP_SLUGS = [ordered]@{
  dz='algeria'; ao='angola'; bj='benin'; bf='burkina-faso'; bi='burundi'; cm='cameroon'; cv='cabo-verde';
  cf='central-african-republic'; td='chad'; cg='congo'; cd='democratic-republic-of-the-congo'; ci='cote-d-ivoire';
  dj='djibouti'; eg='egypt'; er='eritrea'; sz='eswatini'; et='ethiopia'; ga='gabon'; gm='gambia'; gh='ghana';
  gn='guinea'; gw='guinea-bissau'; ke='kenya'; ls='lesotho'; lr='liberia'; ly='libya'; mg='madagascar';
  mw='malawi'; ml='mali'; mr='mauritania'; mz='mozambique'; na='namibia'; ne='niger'; ng='nigeria'; rw='rwanda';
  sn='senegal'; sl='sierra-leone'; so='somalia'; za='south-africa'; ss='south-sudan'; sd='sudan';
  tz='united-republic-of-tanzania'; tg='togo'; ug='uganda'; zm='zambia'; zw='zimbabwe'
}
if (-not $SkipFoodPrices) {
  Add-Type -AssemblyName Microsoft.VisualBasic
  $foodCats = @('cereals and tubers', 'pulses and nuts', 'oil and fats', 'vegetables and fruits', 'meat, fish and eggs', 'milk and dairy', 'miscellaneous food')
  $staleCut = (Get-Date).ToUniversalTime().AddMonths(-6).ToString('yyyy-MM-dd')
  $yearCut = (Get-Date).ToUniversalTime().AddMonths(-12).ToString('yyyy-MM-dd')
  foreach ($cc in $COUNTRIES.Keys) { $facts[$cc].food = $null }
  foreach ($cc in $WFP_SLUGS.Keys) {
    $csvPath = Join-Path $tmp "wfp-$cc.csv"
    $url = $null
    try {
      $pkg = Invoke-RestMethod -Uri ('https://data.humdata.org/api/3/action/package_show?id=wfp-food-prices-for-' + $WFP_SLUGS[$cc]) -TimeoutSec 90
      $url = @($pkg.result.resources | Where-Object { $_.url -match 'wfp_food_prices_[a-z]{3}\.csv$' } | Select-Object -First 1).url
    } catch { Write-Host "  $cc WFP lookup failed: $($_.Exception.Message)" -ForegroundColor Yellow }
    if (-not $url -or -not (Get-Download $url $csvPath)) {
      if ($previous -and $previous.countries.$cc.food) { $facts[$cc].food = $previous.countries.$cc.food }
      continue
    }
    $rows = New-Object System.Collections.Generic.List[object]
    $latest = ''
    $p = New-Object Microsoft.VisualBasic.FileIO.TextFieldParser($csvPath, [Text.Encoding]::UTF8)
    $p.TextFieldType = 'Delimited'; $p.SetDelimiters(','); $p.HasFieldsEnclosedInQuotes = $true
    $header = $p.ReadFields()
    $ix = @{}; for ($i = 0; $i -lt $header.Count; $i++) { $ix[$header[$i]] = $i }
    while (-not $p.EndOfData) {
      $f = $p.ReadFields()
      if ($f[0].StartsWith('#')) { continue }
      $date = $f[$ix['date']]
      if ($date -gt $latest) { $latest = $date }
      if ($date -lt (Get-Date).ToUniversalTime().AddMonths(-14).ToString('yyyy-MM-dd')) { continue }
      if ($f[$ix['pricetype']] -ne 'Retail') { continue }
      if ($foodCats -notcontains $f[$ix['category']]) { continue }
      $price = 0.0
      if (-not [double]::TryParse($f[$ix['price']], [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$price)) { continue }
      $usd = 0.0; [void][double]::TryParse($f[$ix['usdprice']], [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$usd)
      $rows.Add([pscustomobject]@{ date = $date; market = $f[$ix['market']]; commodity = $f[$ix['commodity']]; unit = $f[$ix['unit']]; currency = $f[$ix['currency']]; price = $price; usd = $usd })
    }
    $p.Close()
    if ($latest -lt $staleCut) { Write-Host "  $cc WFP latest $latest - not current"; continue }
    $basket = Select-FoodBasket $rows.ToArray() @($facts[$cc].cities) $staleCut $yearCut
    if (-not $basket) { continue }
    $market = $basket.market
    $items = $basket.items
    $facts[$cc].food = [ordered]@{ market = $market; camp = $basket.camp; date = $latest.Substring(0, 7); items = @($items) }
    Write-Host ("  {0} WFP {1} at {2}: {3}" -f $cc, $latest.Substring(0, 7), $market, ((@($items) | ForEach-Object { $_.commodity }) -join ', '))
  }
} elseif ($previous) {
  foreach ($cc in $COUNTRIES.Keys) { $facts[$cc].food = $previous.countries.$cc.food }
}

Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue

if (-not $wbOk -and $previous) {
  Write-Host '[facts] some World Bank series failed; keeping previous values for those' -ForegroundColor Yellow
  foreach ($cc in $wbCodes) {
    foreach ($key in $INDICATORS.Keys) {
      if (-not $facts[$cc].wb.Contains($key) -and $previous.countries.$cc.wb.$key) { $facts[$cc].wb[$key] = $previous.countries.$cc.wb.$key }
    }
  }
}

$payload = [ordered]@{
  generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  sources = [ordered]@{
    wb = 'World Bank, World Development Indicators'
    ports = 'NGA World Port Index (Pub. 150)'
    airports = 'OurAirports (scheduled service)'
    cities = $citySource
  }
  indicators = $INDICATORS
  countries = $facts
}
$json = $payload | ConvertTo-Json -Depth 8 -Compress
$header = "// Generated by scripts/build-country-facts.ps1 - do not edit by hand.`n// Same sources, same rules, every country. Missing values are null and shown as missing.`n"
[IO.File]::WriteAllText($outPath, $header + 'window.ASJ_COUNTRY_FACTS = ' + $json + ";`n", (New-Object Text.UTF8Encoding($false)))

# Coverage report: equality is the point, so say where it is not reachable.
$keys = @($INDICATORS.Keys)
foreach ($cc in $COUNTRIES.Keys) {
  $f = $facts[$cc]
  $have = @($keys | Where-Object { $f.wb[$_] }).Count
  Write-Host ("  {0}  wb {1,2}/{2}  ports {3}  airports {4}  cities {5}" -f $cc, $have, $keys.Count, @($f.ports).Count, @($f.airports).Count, @($f.cities).Count)
}
Write-Host "[facts] wrote $outPath ($([Math]::Round((Get-Item $outPath).Length / 1KB)) KB)"
exit 0
