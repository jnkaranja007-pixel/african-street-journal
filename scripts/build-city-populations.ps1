#Requires -Version 5.1
<#
.SYNOPSIS
  Builds data/city-populations.json: each country's largest cities, with a population
  checked across three sources. build-country-facts.ps1 reads it for "Largest cities".
.DESCRIPTION
  One source alone was wrong too often. Natural Earth had Juba (South Sudan's capital
  and largest city) at 112,000, Moshi at 721,000 and Benoni at 2.99 million; GeoNames
  counts communes and county-sized areas as cities. Each city here carries the figure
  from Natural Earth (the Atlas's places), GeoNames (cities of 15,000+) and Wikidata
  (latest dated population), matched by name within 20 km, and the median of those it
  has. A city whose sources disagree by more than 2.5 times is printed for review.
.PARAMETER CacheDir
  GeoNames zip and one Wikidata response per country. Reused unless -Refresh.
.NOTES
  Populations change slowly; run this by hand a few times a year, not in CI.
  Natural Earth (public domain), GeoNames (CC BY 4.0), Wikidata (CC0).
#>
param(
  [string]$CacheDir = (Join-Path ([IO.Path]::GetTempPath()) 'asj-city-cache'),
  [switch]$Refresh,
  [int]$Keep = 10
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outPath = Join-Path $root 'data\city-populations.json'
$inv = [Globalization.CultureInfo]::InvariantCulture
New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

$CODES = @('dz','ao','bj','bw','bf','bi','cm','cv','cf','td','km','cg','cd','ci','dj','eg','gq','er','sz','et',
           'ga','gm','gh','gn','gw','ke','ls','lr','ly','mg','mw','ml','mr','mu','ma','mz','na','ne','ng','rw',
           'st','sn','sc','sl','so','za','ss','sd','tz','tg','tn','ug','zm','zw','eh')
# Names the sources still use for towns that were renamed, or English spellings, where
# Wikidata did not supply the current one.
$NAME_NOW = @{ 'Nazret' = 'Adama'; 'Ruhengeri' = 'Musanze'; 'Baydhabo' = 'Baidoa'; 'Moutsamoudou' = 'Mutsamudu';
               'Ali Sabih' = 'Ali Sabieh'; 'Tadjoura' = 'Tadjourah'; 'Mekele' = 'Mekelle' }
# Wikidata files some cities under another state: Hargeisa under Somaliland, Laayoune
# under Morocco. Those are asked too; only cities near this country's own are used.
$WD_EXTRA = @{ so = @('wd:Q34754'); eh = @('"MA"') }

function Get-NameKey([string]$Text) {
  $plain = $Text.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $plain.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) { [void]$sb.Append($ch) }
  }
  # "Djibouti City" and "Djibouti", "N'Djamena" and "Ndjamena" are one key.
  return (($sb.ToString().ToLowerInvariant() -replace '\s+city$', '') -replace '[^a-z]+', '')
}

# Exact names only: "Kisumu County" (1.2 million) is not Kisumu, nor "Dar es Salaam
# Region" the city.
function Test-SameName([object[]]$Names, [string]$B) {
  $b = Get-NameKey $B
  if (-not $b) { return $false }
  foreach ($a in $Names) { if ($a -and (Get-NameKey $a) -eq $b) { return $true } }
  return $false
}

function Get-Km([double]$lat1, [double]$lon1, [double]$lat2, [double]$lon2) {
  $kx = 111.32 * [Math]::Cos(($lat1 + $lat2) / 2 * [Math]::PI / 180)
  return [Math]::Sqrt([Math]::Pow(($lon1 - $lon2) * $kx, 2) + [Math]::Pow(($lat1 - $lat2) * 111.32, 2))
}

# --- Natural Earth: the places in each country's chunk ------------------------------
function Get-NaturalEarth([string]$cc) {
  $path = Join-Path $root "data\countries\$cc.js"
  $prefix = 'window.UNITED_AFRICA_DATA.countryGis["' + $cc + '"] = '
  foreach ($line in [IO.File]::ReadLines($path, [Text.Encoding]::UTF8)) {
    if ($line.StartsWith($prefix)) {
      $gis = $line.Substring($prefix.Length).TrimEnd().TrimEnd(';') | ConvertFrom-Json
      return @($gis.places | Where-Object { $_.name -and [double]$_.pop -gt 0 })
    }
  }
  return @()
}

# --- GeoNames: every city of 15,000+ ------------------------------------------------
$zip = Join-Path $CacheDir 'cities15000.zip'
$txt = Join-Path $CacheDir 'cities15000.txt'
if ($Refresh -or -not (Test-Path $txt)) {
  Invoke-WebRequest -Uri 'https://download.geonames.org/export/dump/cities15000.zip' -OutFile $zip -UseBasicParsing -TimeoutSec 180
  Expand-Archive -Path $zip -DestinationPath $CacheDir -Force
}
$geo = @{}
foreach ($line in [IO.File]::ReadLines($txt, [Text.Encoding]::UTF8)) {
  $c = $line.Split("`t")
  if ($c.Count -lt 15) { continue }
  $cc = $c[8].ToLowerInvariant()
  if ($CODES -notcontains $cc) { continue }
  # Sections of a city (PPLX) and historical places (PPLH) would list one place twice.
  if ($c[7] -eq 'PPLX' -or $c[7] -eq 'PPLH') { continue }
  $pop = 0L
  if (-not [long]::TryParse($c[14], [ref]$pop) -or $pop -le 0) { continue }
  if (-not $geo.ContainsKey($cc)) { $geo[$cc] = New-Object System.Collections.Generic.List[object] }
  $geo[$cc].Add([pscustomobject]@{
    name = $c[1]; pop = [double]$pop; capital = ($c[7] -eq 'PPLC')
    lat = [double]::Parse($c[4], $inv); lon = [double]::Parse($c[5], $inv)
  })
}

# --- Wikidata: places with a population and coordinates, per country -----------------
function Get-Wikidata([string]$cc) {
  $cache = Join-Path $CacheDir "wd-$cc.json"
  if ($Refresh -or -not (Test-Path $cache) -or (Get-Item $cache).Length -lt 100) {
    $countries = @('"' + $cc.ToUpperInvariant() + '"') + @($WD_EXTRA[$cc] | Where-Object { $_ })
    $values = ($countries | ForEach-Object { if ($_ -like 'wd:*') { $_ } else { $null } }) -join ' '
    $codes = ($countries | Where-Object { $_ -notlike 'wd:*' }) -join ' '
    $q = 'SELECT ?item ?en ?fr ?pop ?date ?lat ?lon WHERE { ' +
         '{ VALUES ?code { ' + $codes + ' } ?country wdt:P297 ?code . }' +
         $(if ($values) { ' UNION { VALUES ?country { ' + $values + ' } }' } else { '' }) +
         ' ?item wdt:P17 ?country ; p:P625 ?cs ; p:P1082 ?st . ?cs psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] .' +
         ' ?st ps:P1082 ?pop . FILTER(?pop >= 15000) OPTIONAL { ?st pq:P585 ?date }' +
         ' FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }' +
         ' OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") } OPTIONAL { ?item rdfs:label ?fr FILTER(lang(?fr) = "fr") } }'
    for ($attempt = 1; $attempt -le 3; $attempt++) {
      try {
        Invoke-WebRequest -Uri 'https://query.wikidata.org/sparql' -Method Post -Body @{ query = $q } -UseBasicParsing -TimeoutSec 120 `
          -Headers @{ Accept = 'application/sparql-results+json' } -UserAgent 'AfricanStreetJournal-build/1.0 (africanstreetjournal.com)' -OutFile $cache
        Start-Sleep -Seconds 2
        break
      } catch {
        Write-Host "  $cc Wikidata attempt $attempt failed: $($_.Exception.Message)" -ForegroundColor Yellow
        Start-Sleep -Seconds (10 * $attempt)
      }
    }
  }
  if (-not (Test-Path $cache)) { return @() }
  $rows = ([IO.File]::ReadAllText($cache, [Text.Encoding]::UTF8) | ConvertFrom-Json).results.bindings
  # One figure per item: the latest dated one (undated figures count as oldest).
  $byItem = @{}
  foreach ($r in $rows) {
    $id = [string]$r.item.value
    $date = if ($r.date) { [string]$r.date.value } else { '0000' }
    $prev = $byItem[$id]
    if ($prev -and $prev.date -ge $date) { continue }
    $byItem[$id] = [pscustomobject]@{
      en = [string]$r.en.value; fr = [string]$r.fr.value; pop = [double]::Parse([string]$r.pop.value, $inv)
      date = $date; lat = [double]::Parse([string]$r.lat.value, $inv); lon = [double]::Parse([string]$r.lon.value, $inv)
    }
  }
  return @($byItem.Values)
}

function Get-Median([double[]]$Values) {
  $v = @($Values | Sort-Object)
  if ($v.Count -eq 0) { return $null }
  return $v[[int][Math]::Floor(($v.Count - 1) / 2)]
}

$sb = New-Object System.Text.StringBuilder
[void]$sb.Append('{"generated":"' + (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd') + '","sources":"Natural Earth; GeoNames (CC BY 4.0); Wikidata (CC0)","rule":"median of the sources that list the city","countries":{')
$first = $true
$review = New-Object System.Collections.Generic.List[string]
foreach ($cc in $CODES) {
  $ne = Get-NaturalEarth $cc
  $gn = @(if ($geo.ContainsKey($cc)) { $geo[$cc] | Sort-Object pop -Descending })
  $wd = Get-Wikidata $cc

  # Candidates: every Natural Earth place and the 25 largest GeoNames cities, merged
  # when they are the same name within 20 km or any two points within 3 km.
  $cands = New-Object System.Collections.Generic.List[object]
  $newCand = { param($name, $lat, $lon, $nePop, $gnPop, $capital)
    [pscustomobject]@{ name = $name; names = (New-Object System.Collections.Generic.List[string]); lat = $lat; lon = $lon; ne = $nePop; gn = $gnPop; wd = $null; capital = $capital } }
  foreach ($p in $ne) { $c = & $newCand $p.name ([double]$p.lat) ([double]$p.lon) ([double]$p.pop) $null ([bool]$p.capital); $c.names.Add($p.name); $cands.Add($c) }
  foreach ($g in @($gn | Select-Object -First 25)) {
    $match = $null
    foreach ($c in $cands) {
      $d = Get-Km $c.lat $c.lon $g.lat $g.lon
      if (($d -lt 20 -and (Test-SameName $c.names $g.name)) -or $d -lt 3) { $match = $c; break }
    }
    if ($match) {
      if ($null -eq $match.gn -or $g.pop -gt $match.gn) { $match.gn = $g.pop }
      if ($g.capital) { $match.capital = $true }
      $match.names.Add($g.name)
    } else { $c = & $newCand $g.name $g.lat $g.lon $null $g.pop $g.capital; $c.names.Add($g.name); $cands.Add($c) }
  }
  # GeoNames figure for a Natural Earth place outside the 25 largest.
  foreach ($c in @($cands | Where-Object { $null -eq $_.gn })) {
    $g = @($gn | Where-Object { (Get-Km $c.lat $c.lon $_.lat $_.lon) -lt 20 -and (Test-SameName $c.names $_.name) } | Select-Object -First 1)
    if ($g.Count) { $c.gn = $g[0].pop; $c.names.Add($g[0].name) }
  }
  # Wikidata: an item whose English name is the city's, within 20 km; the closest when
  # several match. Not the French name: French labels a county or governorate by the
  # bare name ("Kakamega" is Kakamega County, 1.87 million; "Sfax" the governorate).
  # A merged GeoNames name can be one district of the city (Dixinn, 187,000, in
  # Conakry): an item matched only by such a name must be at least half the city's size.
  foreach ($c in $cands) {
    $near = @($wd | Where-Object { (Get-Km $c.lat $c.lon $_.lat $_.lon) -lt 20 } | Sort-Object { Get-Km $c.lat $c.lon $_.lat $_.lon })
    $label = { param($item) if ($item.en) { $item.en } else { $item.fr } }
    $hits = @($near | Where-Object { Test-SameName @($c.names[0]) (& $label $_) })
    if (-not $hits.Count) {
      $size = [Math]::Max([double]$c.ne, [double]$c.gn)
      $hits = @($near | Where-Object { (Test-SameName $c.names (& $label $_)) -and $_.pop -ge $size / 2 })
    }
    if ($hits.Count) {
      $c.wd = $hits[0].pop
      # Wikidata's English name is the current one: Port Said, not Natural Earth's
      # "Bur Said"; Dolisie, not "Loubomo"; Adama, not "Nazret".
      if ($hits[0].en) { $c.name = $hits[0].en }
    }
  }

  $rows = foreach ($c in $cands) {
    $vals = @(@($c.ne, $c.gn, $c.wd) | Where-Object { $null -ne $_ -and $_ -gt 0 })
    if (-not $vals.Count) { continue }
    $pop = Get-Median ([double[]]$vals)
    $spread = ($vals | Measure-Object -Maximum).Maximum / [Math]::Max(1, ($vals | Measure-Object -Minimum).Minimum)
    [pscustomobject]@{ name = $c.name; lat = $c.lat; lon = $c.lon; pop = $pop; capital = $c.capital; n = $vals.Count; ne = $c.ne; gn = $c.gn; wd = $c.wd; spread = $spread }
  }
  # Largest first; a place within 20 km of a larger one kept is part of it. A figure
  # from one source alone is how Natural Earth put Iran's Arak (423,000) in the Algerian
  # Sahara and GeoNames listed Mwala, a Kenyan constituency, as a city: a city needs two
  # sources, except to bring a country with few cities (Eswatini, the islands) up to four.
  $kept = New-Object System.Collections.Generic.List[object]
  $sorted = @($rows | Where-Object { $_.pop -ge 1000 } | Sort-Object @{ Expression = 'pop'; Descending = $true }, @{ Expression = 'name'; Descending = $false })
  foreach ($pass in @(2, 1)) {
    foreach ($r in $sorted) {
      if ($kept.Count -ge $Keep -or ($pass -eq 1 -and $kept.Count -ge 4)) { break }
      if ($r.n -lt $pass -or ($pass -eq 1 -and $r.n -ge 2) -or $kept.Contains($r)) { continue }
      if (@($kept | Where-Object { (Get-Km $_.lat $_.lon $r.lat $r.lon) -lt 20 }).Count) { continue }
      $kept.Add($r)
    }
  }
  # The capital stays in the list however small (Gitega, Dodoma, Laayoune), and Banjul,
  # 12 km from Serekunda, is not folded into it.
  $cap = @($rows | Where-Object { $_.capital } | Sort-Object pop -Descending | Select-Object -First 1)
  if ($cap.Count -and -not $kept.Contains($cap[0])) { $kept.Add($cap[0]) }
  $kept = [System.Collections.Generic.List[object]]@($kept | Sort-Object @{ Expression = 'pop'; Descending = $true }, @{ Expression = 'name'; Descending = $false })

  $fmt = { param($v) if ($null -eq $v) { '-' } else { [Math]::Round($v / 1000).ToString($inv) + 'k' } }
  foreach ($k in @($kept | Select-Object -First 6)) {
    if ($k.spread -gt 2.5) { $review.Add(('{0} {1}: ne {2} gn {3} wd {4} -> {5}' -f $cc, $k.name, (& $fmt $k.ne), (& $fmt $k.gn), (& $fmt $k.wd), (& $fmt $k.pop))) }
  }
  $json = @($kept | ForEach-Object {
    $shown = if ($NAME_NOW.ContainsKey([string]$_.name)) { $NAME_NOW[[string]$_.name] } else { [string]$_.name }
    '{"name":' + (ConvertTo-Json $shown) + ',"pop":' + [Math]::Round($_.pop).ToString($inv) +
    ',"capital":' + ([string]$_.capital).ToLowerInvariant() + ',"lat":' + [Math]::Round($_.lat, 3).ToString($inv) + ',"lon":' + [Math]::Round($_.lon, 3).ToString($inv) +
    ',"sources":' + $_.n + '}'
  }) -join ','
  if (-not $first) { [void]$sb.Append(',') }
  [void]$sb.Append('"' + $cc + '":[' + $json + ']')
  $first = $false
  $three = @($kept | Where-Object { $_.n -eq 3 }).Count
  Write-Host ("  {0}  {1,2} cities, {2,2} with all three sources: {3}" -f $cc, $kept.Count, $three, (@($kept | Select-Object -First 4 | ForEach-Object { $_.name + ' ' + (& $fmt $_.pop) }) -join ', '))
}
[void]$sb.Append('}}')
[IO.File]::WriteAllText($outPath, $sb.ToString(), (New-Object Text.UTF8Encoding($false)))
Write-Host "[cities] wrote $outPath"
if ($review.Count) {
  Write-Host "[cities] sources more than 2.5x apart (check by hand):" -ForegroundColor Yellow
  $review | ForEach-Object { Write-Host "  $_" }
}
