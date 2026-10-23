#Requires -Version 5.1
<#
.SYNOPSIS
  Checks that the site's data is fresh (-Mode Daily) and still agrees with a second,
  independent source (-Mode Monthly). Writes a Markdown report and exits 1 on any
  problem; .github/workflows/data-health.yml turns that into a GitHub issue.
.DESCRIPTION
  Until 23 Oct 2026 every stale source was found by a person noticing: the desk silently
  stopping when OpenRouter credit ran out, exchange listings frozen for weeks when AFX
  blocked GitHub's runners. And the second-source checks done by hand that day (railway
  lengths against the CIA World Factbook, landmark positions against Wikidata, city
  figures against each other) decay unless they are repeated.

  Daily (repository files only, no network):
    - the news desk published in the last 36 hours, with 100+ stories;
    - exchange listings are no more than 7 days old;
    - country facts, railways: rebuilt in the last 45 days;
    - food prices: at least 30 countries have a current WFP basket;
    - farm exports and the crop calendar: rebuilt in the last 400 days.
  Monthly (network: raw.githubusercontent.com, query.wikidata.org):
    - each country's railway total against the Factbook, and RAIL_FACTBOOK in app.js
      against the Factbook's current figure;
    - landmark points against Wikidata coordinates;
    - city lists: capital present, top cities backed by two or more sources.
.PARAMETER Report
  Where to write the Markdown report. Also appended to $env:GITHUB_STEP_SUMMARY in CI.
#>
param(
  [ValidateSet('Daily', 'Monthly')][string]$Mode = 'Daily',
  [string]$Report = (Join-Path ([IO.Path]::GetTempPath()) 'asj-data-health.md'),
  [datetime]$Now = (Get-Date).ToUniversalTime()
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$inv = [Globalization.CultureInfo]::InvariantCulture
$problems = New-Object System.Collections.Generic.List[string]
$notes = New-Object System.Collections.Generic.List[string]

# A date from JSON, whichever way it arrives: pwsh's ConvertFrom-Json turns ISO strings
# into [datetime]; Windows PowerShell leaves them as strings.
function Get-Utc($Value) {
  if ($null -eq $Value) { return $null }
  if ($Value -is [datetime]) { return $Value.ToUniversalTime() }
  $s = [string]$Value
  $d = [datetime]::MinValue
  if ([datetime]::TryParse($s, $inv, [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$d)) { return $d }
  return $null
}
function Read-Json([string]$Path) { return [IO.File]::ReadAllText((Join-Path $root $Path), [Text.Encoding]::UTF8) | ConvertFrom-Json }
function Read-JsAssigned([string]$Path, [string]$Global) {
  $text = [IO.File]::ReadAllText((Join-Path $root $Path), [Text.Encoding]::UTF8)
  $m = [regex]::Match($text, [regex]::Escape($Global) + '\s*=\s*(\{.*\});', 'Singleline')
  if (-not $m.Success) { return $null }
  return $m.Groups[1].Value | ConvertFrom-Json
}
function Test-Age([string]$What, $When, [int]$MaxDays) {
  $d = Get-Utc $When
  if (-not $d) { $problems.Add("$What has no readable date."); return }
  $days = [Math]::Floor(($Now - $d).TotalDays)
  if ($days -gt $MaxDays) { $problems.Add("$What is $days days old (limit $MaxDays). Last: $($d.ToString('yyyy-MM-dd'))") }
  else { $notes.Add("$What is $days day(s) old.") }
}

if ($Mode -eq 'Daily') {
  # News desk: the edition stamp is on the second line of data/briefs.js.
  $briefsText = [IO.File]::ReadAllText((Join-Path $root 'data\briefs.js'), [Text.Encoding]::UTF8)
  $gm = [regex]::Match($briefsText, "generated:\s*'([^']+)'")
  $stamp = if ($gm.Success) { Get-Utc $gm.Groups[1].Value } else { $null }
  if (-not $stamp) { $problems.Add('The news edition (data/briefs.js) has no readable generated stamp.') }
  else {
    $hours = [Math]::Floor(($Now - $stamp).TotalHours)
    if ($hours -gt 36) { $problems.Add("The news desk last published $hours hours ago ($($stamp.ToString('yyyy-MM-dd HH:mm')) UTC). Check update-news.yml runs and the OpenRouter credit.") }
    else { $notes.Add("News edition is $hours hour(s) old.") }
  }
  $stories = @([regex]::Matches($briefsText, '"headline"\s*:')).Count
  if (-not $stories) { $stories = @([regex]::Matches($briefsText, 'headline:')).Count }
  if ($stories -lt 100) { $problems.Add("The edition has only $stories stories (expected 100+).") } else { $notes.Add("$stories stories in the edition.") }

  # Exchange listings: every market carries its own asOf.
  $markets = Read-Json 'data\markets.json'
  $newest = $null
  foreach ($p in $markets.PSObject.Properties) {
    $d = Get-Utc $p.Value.asOf
    if ($d -and (-not $newest -or $d -gt $newest)) { $newest = $d }
  }
  Test-Age 'Exchange listings (data/markets.json, newest market)' $newest 7

  $facts = Read-JsAssigned 'data\country-facts.js' 'window.ASJ_COUNTRY_FACTS'
  Test-Age 'Country facts (data/country-facts.js)' $facts.generated 45
  $rail = Read-Json 'data\country-rail.json'
  Test-Age 'Railways (data/country-rail.json)' $rail.generated 45
  Test-Age 'Farm exports (data/farm-exports.json)' (Read-Json 'data\farm-exports.json').generated 400
  Test-Age 'Crop calendar (data/crop-calendar.json)' (Read-Json 'data\crop-calendar.json').generated 400

  # Food prices live in the per-country facts files.
  $withFood = 0
  foreach ($f in Get-ChildItem (Join-Path $root 'data\facts') -Filter '*.js') {
    if ([IO.File]::ReadAllText($f.FullName) -match '"food":\{"market"') { $withFood++ }
  }
  if ($withFood -lt 30) { $problems.Add("Only $withFood countries have current WFP food prices (expected 30+).") } else { $notes.Add("$withFood countries have current food prices.") }
}

if ($Mode -eq 'Monthly') {
  $app = [IO.File]::ReadAllText((Join-Path $root 'app.js'), [Text.Encoding]::UTF8)

  # --- Railways against the CIA World Factbook --------------------------------------
  $GEC = @{ dz='ag'; ao='ao'; bj='bn'; bw='bc'; bf='uv'; bi='by'; cm='cm'; cv='cv'; cf='ct'; td='cd'; km='cn'; cg='cf'; cd='cg';
            ci='iv'; dj='dj'; eg='eg'; gq='ek'; er='er'; sz='wz'; et='et'; ga='gb'; gm='ga'; gh='gh'; gn='gv'; gw='pu'; ke='ke';
            ls='lt'; lr='li'; ly='ly'; mg='ma'; mw='mi'; ml='ml'; mr='mr'; mu='mp'; ma='mo'; mz='mz'; na='wa'; ne='ng'; ng='ni';
            rw='rw'; st='tp'; sn='sg'; sc='se'; sl='sl'; so='so'; za='sf'; ss='od'; sd='su'; tz='tz'; tg='to'; tn='ts'; ug='ug';
            zm='za'; zw='zi'; eh='wi' }
  $shown = @{}
  $fbBlock = [regex]::Match($app, 'const RAIL_FACTBOOK = \{(.*?)\};', 'Singleline').Groups[1].Value
  foreach ($m in [regex]::Matches($fbBlock, '(\w\w): \[(\d+), (\d{4})\]')) { $shown[$m.Groups[1].Value] = @([int]$m.Groups[2].Value, [int]$m.Groups[3].Value) }
  $notInService = @([regex]::Matches([regex]::Match($app, 'const RAIL_NOT_IN_SERVICE = \{(.*?)\};', 'Singleline').Groups[1].Value, '(\w\w):') | ForEach-Object { $_.Groups[1].Value })
  # Lines already explained on the page (RAIL_NOTES: Sierra Leone's private freight line).
  $explained = @([regex]::Matches([regex]::Match($app, 'const RAIL_NOTES = \{(.*?)\};', 'Singleline').Groups[1].Value, '(\w\w):') | ForEach-Object { $_.Groups[1].Value })
  $rail = Read-Json 'data\country-rail.json'
  $railRows = New-Object System.Collections.Generic.List[string]
  foreach ($cc in $GEC.Keys | Sort-Object) {
    $fbKm = $null; $fbYear = $null
    try {
      $j = Invoke-RestMethod -Uri ("https://raw.githubusercontent.com/factbook/factbook.json/master/africa/" + $GEC[$cc] + ".json") -TimeoutSec 60
      $t = [string]$j.Transportation.Railways.total.text
      if ($t -match '^([\d,]+)\s*km(?:\s*\((\d{4})\))?') { $fbKm = [int]($Matches[1] -replace ',', ''); $fbYear = $Matches[2] }
    } catch { $notes.Add("Factbook fetch failed for $cc - skipped."); continue }
    $osm = [int]$rail.countries.$cc.km
    if ($fbKm -and $shown.ContainsKey($cc) -and $shown[$cc][0] -ne $fbKm) {
      $problems.Add("RAIL_FACTBOOK in app.js shows $($shown[$cc][0]) km for $cc; the Factbook now says $fbKm km ($fbYear). Update the constant.")
    }
    if ($fbKm -and -not $shown.ContainsKey($cc)) { $problems.Add("The Factbook now gives $cc a railway total ($fbKm km, $fbYear); RAIL_FACTBOOK has none.") }
    if ($notInService -contains $cc) { continue }
    if ($fbKm) {
      $ratio = $osm / $fbKm
      if ($ratio -gt 1.6) { $problems.Add("$cc railway: OpenStreetMap route length $osm km is $([Math]::Round($ratio, 2))x the Factbook's $fbKm km. Check for double counting or new lines.") }
      $railRows.Add("| $cc | $osm | $fbKm ($fbYear) | $([Math]::Round($ratio, 2)) |")
    } elseif ($osm -ge 5 -and $explained -notcontains $cc) {
      $problems.Add("$cc railway: OpenStreetMap shows $osm km in use but the Factbook lists no railway. Check whether trains run (RAIL_NOT_IN_SERVICE).")
    }
  }

  # --- Landmarks against Wikidata -----------------------------------------------------
  # Point features only (peaks, falls, parks): a lake or river label is placed inside the
  # country's share of the water, not at the feature's centre.
  $block = [regex]::Match($app, 'const LANDMARK_POINTS = \[(.*?)\n\];', 'Singleline').Groups[1].Value
  $ALIAS = @{ 'Mount Soira' = 'Emba Soira'; 'Lake Nokoue' = ('Lake Nokou' + [char]0xE9); 'Tai National Park' = ('Ta' + [char]0xEF + ' National Park');
              'Pico Basile' = ('Pico Basil' + [char]0xE9); 'Pico Cao Grande' = ('Pico C' + [char]0xE3 + 'o Grande');
              'Tsingy de Bemaraha' = 'Tsingy de Bemaraha National Park'; 'Sibebe Rock' = 'Sibebe' }
  $AREA_LANDMARKS = @('Fouta Djallon', 'Saguia el-Hamra', 'Okavango Delta', 'Sossusvlei', 'Tsingy de Bemaraha',
                      'Nyungwe Forest', 'Sapo National Park', 'Tai National Park', 'Cacheu Mangroves', 'Sindou Peaks')
  $points = @([regex]::Matches($block, "\{ name: '([^']+)', kind: '(\w+)', at: \{([^}]*)\} \}") | ForEach-Object {
    $pts = @([regex]::Matches($_.Groups[3].Value, '(\w\w): \[([-\d.]+), ([-\d.]+)\]'))
    if ($_.Groups[2].Value -ne 'water' -and $pts.Count -eq 1) {
      [pscustomobject]@{ name = $_.Groups[1].Value; cc = $pts[0].Groups[1].Value; lon = [double]::Parse($pts[0].Groups[2].Value, $inv); lat = [double]::Parse($pts[0].Groups[3].Value, $inv) }
    }
  })
  $labels = @($points | ForEach-Object { $l = if ($ALIAS.ContainsKey($_.name)) { $ALIAS[$_.name] } else { $_.name }; '"' + $l + '"@en' })
  $q = 'SELECT ?name ?lat ?lon WHERE { VALUES ?name { ' + ($labels -join ' ') + ' } ?item rdfs:label ?name ; p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] . FILTER(?lat > -36 && ?lat < 38 && ?lon > -26 && ?lon < 64) }'
  try {
    $wd = (Invoke-RestMethod -Uri 'https://query.wikidata.org/sparql' -Method Post -Body @{ query = $q } -Headers @{ Accept = 'application/sparql-results+json' } -UserAgent 'AfricanStreetJournal-audit/1.0 (africanstreetjournal.com)' -TimeoutSec 120).results.bindings
    foreach ($pt in $points) {
      $label = if ($ALIAS.ContainsKey($pt.name)) { $ALIAS[$pt.name] } else { $pt.name }
      $best = $null
      foreach ($r in @($wd | Where-Object { $_.name.value -eq $label })) {
        $la = [double]::Parse([string]$r.lat.value, $inv); $lo = [double]::Parse([string]$r.lon.value, $inv)
        $kx = 111.32 * [Math]::Cos(($la + $pt.lat) / 2 * [Math]::PI / 180)
        $km = [Math]::Sqrt([Math]::Pow(($lo - $pt.lon) * $kx, 2) + [Math]::Pow(($la - $pt.lat) * 111.32, 2))
        if ($null -eq $best -or $km -lt $best) { $best = $km }
      }
      # A region's Wikidata point is its middle (or, for Saguia el-Hamra, the wadi's
      # mouth); the label sits anywhere inside it. Peaks, falls and parks must be close.
      $limit = if ($AREA_LANDMARKS -contains $pt.name) { 120 } else { 25 }
      if ($null -eq $best) { $notes.Add("Landmark '$($pt.name)' has no Wikidata coordinates to compare.") }
      elseif ($best -gt $limit) { $problems.Add("Landmark '$($pt.name)' ($($pt.cc)) is $([Math]::Round($best)) km from its Wikidata position (limit $limit km).") }
    }
  } catch { $notes.Add('Wikidata query failed - landmark check skipped this month.') }

  # --- City lists -----------------------------------------------------------------------
  $cities = Read-Json 'data\city-populations.json'
  foreach ($p in $cities.countries.PSObject.Properties) {
    $list = @($p.Value)
    if (-not @($list | Where-Object { $_.capital }).Count) { $problems.Add("City list for $($p.Name) has no capital.") }
    $weak = @($list | Select-Object -First 4 | Where-Object { [int]$_.sources -lt 2 })
    if ($weak.Count -gt 2) { $problems.Add("City list for $($p.Name): $($weak.Count) of the top four rest on one source.") }
  }
  Test-Age 'City populations (data/city-populations.json)' $cities.generated 200
}

# --- report ------------------------------------------------------------------------------
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("## Data health ($Mode, $($Now.ToString('yyyy-MM-dd')))")
[void]$sb.AppendLine('')
if ($problems.Count) {
  [void]$sb.AppendLine("**$($problems.Count) problem(s):**")
  foreach ($p in $problems) { [void]$sb.AppendLine("- $p") }
} else {
  [void]$sb.AppendLine('All checks pass.')
}
if ($Mode -eq 'Monthly' -and $railRows.Count) {
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('| Country | OSM route km | Factbook km | Ratio |')
  [void]$sb.AppendLine('|---|---|---|---|')
  foreach ($r in $railRows) { [void]$sb.AppendLine($r) }
}
if ($notes.Count) {
  [void]$sb.AppendLine('')
  [void]$sb.AppendLine('<details><summary>Checked</summary>')
  [void]$sb.AppendLine('')
  foreach ($n in $notes) { [void]$sb.AppendLine("- $n") }
  [void]$sb.AppendLine('</details>')
}
$text = $sb.ToString()
[IO.File]::WriteAllText($Report, $text, (New-Object Text.UTF8Encoding($false)))
if ($env:GITHUB_STEP_SUMMARY) { [IO.File]::AppendAllText($env:GITHUB_STEP_SUMMARY, $text) }
Write-Host $text
if ($problems.Count) { exit 1 }
exit 0
