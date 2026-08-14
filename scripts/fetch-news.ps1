#Requires -Version 5.1
<#
.SYNOPSIS
  Pull current news items per country from Google News RSS. No API key, no quota.
.DESCRIPTION
  Step 1 of the daily desk. Fetches a feed per country, dedupes, ranks and writes
  data/feed-items.json for the writing step.

  The point is not just that RSS is free. It is that the article URLs come from the
  feed, so the writer is never asked to produce one. Asking a model to search and
  cite is what produced two fabricated citations in the 5 August run. Here the model
  only rewrites text around a link it was handed, which removes that failure mode
  structurally rather than catching it afterwards.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/fetch-news.ps1
  powershell -ExecutionPolicy Bypass -File scripts/fetch-news.ps1 -Only ng,ke,za
  powershell -ExecutionPolicy Bypass -File scripts/fetch-news.ps1 -Window 2d -PerCountry 12
.NOTES
  Exit 0 if any country returned items. Exit 1 if every feed failed, which means
  something systemic (network, blocked, format change) rather than a quiet news day.
#>
param(
  [string[]]$Only,
  [string]$Window = '1d',
  [int]$PerCountry = 10,
  [int]$DelayMs = 400
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path $PSScriptRoot -Parent
$outPath = Join-Path $root 'data\feed-items.json'

# ISO-2 -> search name. Names are what Google News matches on, so a few differ from
# the display name used on the site (Congo especially, to keep the two apart).
$COUNTRIES = [ordered]@{
  dz='Algeria'; ao='Angola'; bj='Benin'; bw='Botswana'; bf='Burkina Faso'; bi='Burundi'
  cm='Cameroon'; cv='Cape Verde'; cf='Central African Republic'; td='Chad'; km='Comoros'
  cg='Republic of Congo Brazzaville'; cd='Democratic Republic of Congo'; ci='Ivory Coast'
  dj='Djibouti'; eg='Egypt'; gq='Equatorial Guinea'; er='Eritrea'; sz='Eswatini'; et='Ethiopia'
  ga='Gabon'; gm='Gambia'; gh='Ghana'; gn='Guinea'; gw='Guinea-Bissau'; ke='Kenya'; ls='Lesotho'
  lr='Liberia'; ly='Libya'; mg='Madagascar'; mw='Malawi'; ml='Mali'; mr='Mauritania'; mu='Mauritius'
  ma='Morocco'; mz='Mozambique'; na='Namibia'; ne='Niger'; ng='Nigeria'; rw='Rwanda'
  st='Sao Tome and Principe'; sn='Senegal'; sc='Seychelles'; sl='Sierra Leone'; so='Somalia'
  za='South Africa'; ss='South Sudan'; sd='Sudan'; tz='Tanzania'; tg='Togo'; tn='Tunisia'
  ug='Uganda'; zm='Zambia'; zw='Zimbabwe'; eh='Western Sahara'
}

# Aggregators and low-signal sources: the story is real but the page is a list, not an article.
$skipSources = @('MSN', 'Yahoo', 'Google News', 'Newsbreak', 'NewsNow')

# Country names that are also common English words or people's names poison the feed.
# A bare "Chad" query returns fire chiefs named Chad; "Niger" returns Nigeria. Pin these
# to the capital or demonym so the feed is about the country.
$queryOverride = @{
  td = 'Chad (Ndjamena OR Chadian OR "Republic of Chad")'
  ne = 'Niger (Niamey OR Nigerien) -Nigeria'
  gn = 'Guinea (Conakry OR Guinean) -"Equatorial Guinea" -"Guinea-Bissau" -"Papua New Guinea"'
  gw = '"Guinea-Bissau" OR Bissau'
  gq = '"Equatorial Guinea" OR Malabo'
  ga = 'Gabon (Libreville OR Gabonese)'
  ml = 'Mali (Bamako OR Malian) -Somaliland'
  tg = 'Togo (Lome OR Togolese)'
  km = 'Comoros OR Moroni'
  st = '"Sao Tome" OR "Sao Tome and Principe"'
  cv = '"Cape Verde" OR "Cabo Verde" OR Praia'
  sc = 'Seychelles OR Victoria Seychelles'
  gm = 'Gambia (Banjul OR Gambian)'
  ls = 'Lesotho OR Maseru'
  sz = 'Eswatini OR Swaziland OR Mbabane'
  dj = 'Djibouti'
  er = 'Eritrea OR Asmara'
  cf = '"Central African Republic" OR Bangui'
  ss = '"South Sudan" OR Juba'
  eh = '"Western Sahara" OR Sahrawi OR Polisario'
}

$codes = @($COUNTRIES.Keys)
if ($Only) {
  # Invoked via `powershell -File`, "-Only ng,ke" arrives as one string rather than an
  # array, so split on commas before matching. Accepts either form.
  $want = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $codes = $codes | Where-Object { $want -contains $_ }
  if (-not $codes) { Write-Host "[fetch] no country matched: $($want -join ',')" -ForegroundColor Red; exit 1 }
}

$result   = [ordered]@{}
$totalItems = 0
$failed   = 0

foreach ($code in $codes) {
  $name  = $COUNTRIES[$code]
  $term  = if ($queryOverride.ContainsKey($code)) { $queryOverride[$code] } else { $name }
  $query = [Uri]::EscapeDataString("$term when:$Window")
  $url   = "https://news.google.com/rss/search?q=$query&hl=en-US&gl=US&ceid=US:en"

  try {
    # WebClient with an explicit UTF-8 encoding. Invoke-WebRequest decodes by the
    # response charset header, which Google News does not set reliably, so curly
    # quotes and accented names come back as mojibake (Bodele, nation's).
    $wc = New-Object System.Net.WebClient
    $wc.Encoding = [System.Text.Encoding]::UTF8
    $wc.Headers.Add('User-Agent', 'Mozilla/5.0 (compatible; ASJ-desk/1.0)')
    $content = $wc.DownloadString($url)
    $wc.Dispose()
    [xml]$xml = $content
  } catch {
    Write-Host ("  {0}  FEED FAILED: {1}" -f $code, $_.Exception.Message.Split("`n")[0]) -ForegroundColor Red
    $failed++
    Start-Sleep -Milliseconds $DelayMs
    continue
  }

  $items = @()
  $seenTitles = @{}
  foreach ($it in @($xml.rss.channel.item)) {
    $title = [string]$it.title
    $link  = [string]$it.link
    if (-not $title -or -not $link) { continue }

    # Google appends " - Publisher" to the title; split it off for a clean headline.
    $src = [string]$it.source.'#text'
    if (-not $src -and $title -match '\s-\s([^-]+)$') { $src = $Matches[1].Trim() }
    $cleanTitle = [regex]::Replace($title, '\s-\s[^-]+$', '').Trim()
    if (-not $cleanTitle) { $cleanTitle = $title }

    if ($skipSources | Where-Object { $src -like "*$_*" }) { continue }

    # Near-duplicate: same story syndicated across outlets.
    $key = (($cleanTitle.ToLower() -replace '[^a-z0-9 ]','' -split '\s+' |
             Where-Object { $_.Length -gt 4 } | Sort-Object | Select-Object -First 5) -join ' ')
    if ($key -and $seenTitles.ContainsKey($key)) { continue }
    if ($key) { $seenTitles[$key] = $true }

    $pub = $null
    try { $pub = [datetime]::Parse([string]$it.pubDate) } catch { $pub = $null }

    $items += [pscustomobject]@{
      title     = $cleanTitle
      url       = $link
      source    = if ($src) { $src } else { 'Google News' }
      published = if ($pub) { $pub.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') } else { '' }
    }
  }

  # Newest first, capped. Recency is the only ranking signal the feed reliably gives.
  $items = @($items | Sort-Object -Property published -Descending | Select-Object -First $PerCountry)

  if ($items.Count) {
    $result[$code] = @{ country = $name; items = $items }
    $totalItems += $items.Count
    Write-Host ("  {0}  {1,-32} {2} items" -f $code, $name, $items.Count) -ForegroundColor Green
  } else {
    Write-Host ("  {0}  {1,-32} no items in window" -f $code, $name) -ForegroundColor DarkYellow
  }

  Start-Sleep -Milliseconds $DelayMs
}

if ($result.Count -eq 0) {
  Write-Host "[fetch] every feed returned nothing across $($codes.Count) countries - systemic failure, not a quiet news day" -ForegroundColor Red
  exit 1
}

$payload = [ordered]@{
  fetched = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  window  = $Window
  byCountry = $result
}
[IO.File]::WriteAllText($outPath, ($payload | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))

Write-Host ''
Write-Host "[fetch] $totalItems items across $($result.Count) countries -> data/feed-items.json" -ForegroundColor Green
if ($failed) { Write-Host "[fetch] $failed feed(s) failed" -ForegroundColor DarkYellow }
exit 0
