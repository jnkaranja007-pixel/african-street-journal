#Requires -Version 5.1
<#
.SYNOPSIS
  Check the live site the way a reader and a search engine meet it.
.DESCRIPTION
  Every other check runs on a checkout: the pages as built, before Pages serves them.
  This one fetches https://africanstreetjournal.com itself - the core files, every
  country and topic page, a sample of story pages and their share images, the
  feeds, the app's earlier-story lists, the 404 page, and the http and www redirects -
  so a broken deploy, an expired certificate or a page that builds but does not serve
  is found within a week, not when a reader says so.

  Each failed URL is tried once more before it counts. Exit 1 when anything fails;
  -Report writes the findings as Markdown for the issue the workflow opens.
.PARAMETER Sample
  How many story pages to fetch from the sitemap (random each run).
#>
param(
  [string]$BaseUrl = 'https://africanstreetjournal.com',
  [int]$Sample = 80,
  [string]$Report = ''
)

$ErrorActionPreference = 'Continue'
$BaseUrl = $BaseUrl.TrimEnd('/')
$problems = New-Object System.Collections.Generic.List[string]
$checked = 0

function Get-Page([string]$Url, [switch]$Head) {
  for ($try = 1; $try -le 2; $try++) {
    try {
      $req = @{ Uri = $Url; UseBasicParsing = $true; TimeoutSec = 30; ErrorAction = 'Stop' }
      if ($Head) { $req['Method'] = 'Head' }
      $r = Invoke-WebRequest @req
      $body = if ($Head) { '' } else { [string]$r.Content }
      return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $body; Type = [string]$r.Headers['Content-Type'] }
    } catch {
      # A 4xx/5xx throws; its status is on the exception's response. A 5xx gets one retry.
      $resp = $_.Exception.Response
      if ($resp) {
        $code = [int]$resp.StatusCode
        if ($code -ne 0 -and ($code -lt 500 -or $try -eq 2)) { return [pscustomobject]@{ Status = $code; Body = ''; Type = '' } }
      }
      if ($try -eq 2) { return [pscustomobject]@{ Status = 0; Body = ''; Type = ''; Error = $_.Exception.Message } }
      Start-Sleep -Seconds 5
    }
  }
}
function Expect-Ok([string]$Url, [string]$Label, [switch]$Head) {
  $script:checked++
  $p = Get-Page $Url -Head:$Head
  if ($p.Status -ne 200) { $script:problems.Add("$Label - HTTP $($p.Status): $Url$(if ($p.Error) { " ($($p.Error))" })"); return $null }
  return $p
}

Write-Host "[live] $BaseUrl"

# Core files: the app shell, its data, the feeds and sitemaps, the menu pages.
foreach ($path in '/', '/app.js', '/styles.css', '/data/briefs.js', '/data/app-core.js', '/manifest.json', '/sw.js',
                  '/sitemap.xml', '/news-sitemap.xml', '/feed.xml', '/robots.txt', '/countries/', '/topics/', '/digest/', '/about/', '/static-pages.css') {
  [void](Expect-Ok "$BaseUrl$path" 'core file')
}

# Sitemap: parses, and its pages split into countries, topics and stories.
$sm = Get-Page "$BaseUrl/sitemap.xml"
$locs = @()
try { $locs = @(([xml]$sm.Body).urlset.url | ForEach-Object { [string]$_.loc }) } catch { $problems.Add('sitemap.xml does not parse') }
if ($locs.Count -lt 500) { $problems.Add("sitemap.xml lists only $($locs.Count) pages") }
$countryUrls = @($locs | Where-Object { $_ -match '/[a-z]{2}/$' })
$topicUrls = @($locs | Where-Object { $_ -match '/topics/[a-z0-9-]+/$' })
$storyUrls = @($locs | Where-Object { $_ -match '/[a-z]{2}/[^/]+/$' })
if ($countryUrls.Count -lt 50) { $problems.Add("sitemap.xml lists only $($countryUrls.Count) country pages") }

foreach ($u in $countryUrls) {
  $p = Expect-Ok $u 'country page'
  if ($p -and $p.Body -notmatch '<h1>') { $problems.Add("country page has no headline: $u") }
}
foreach ($u in $topicUrls) {
  $p = Expect-Ok $u 'topic page'
  if ($p -and $p.Body -notmatch 'class="related"') { $problems.Add("topic page lists no stories: $u") }
}

# A random sample of story pages: served, with a headline, the right canonical, and a
# share image that loads.
$images = New-Object System.Collections.Generic.List[string]
foreach ($u in @($storyUrls | Get-Random -Count ([Math]::Min($Sample, $storyUrls.Count)))) {
  $p = Expect-Ok $u 'story page'
  if (-not $p) { continue }
  if ($p.Body -notmatch '<h1>[^<]+</h1>') { $problems.Add("story page has no headline: $u") }
  $canon = [regex]::Match($p.Body, '<link rel="canonical" href="([^"]+)"').Groups[1].Value
  if ($canon -ne $u) { $problems.Add("story page canonical is '$canon': $u") }
  $img = [regex]::Match($p.Body, '<meta property="og:image" content="([^"]+)"').Groups[1].Value
  if ($img -and $images.Count -lt 25 -and -not $images.Contains($img)) { $images.Add($img) }
}
foreach ($img in $images) {
  $p = Expect-Ok $img 'share image' -Head
  if ($p -and $p.Type -and $p.Type -notmatch '^image/') { $problems.Add("share image served as '$($p.Type)': $img") }
}

# Feed: parses, and its newest links resolve.
$feed = Get-Page "$BaseUrl/feed.xml"
try {
  $items = @(([xml]$feed.Body).rss.channel.item)
  if ($items.Count -lt 20) { $problems.Add("feed.xml carries only $($items.Count) stories") }
  foreach ($it in ($items | Select-Object -First 5)) { [void](Expect-Ok ([string]$it.link) 'feed story') }
} catch { $problems.Add('feed.xml does not parse') }

# The app's earlier-story lists, for a handful of countries.
foreach ($u in @($countryUrls | Get-Random -Count ([Math]::Min(6, $countryUrls.Count)))) {
  $cc = [regex]::Match($u, '/([a-z]{2})/$').Groups[1].Value
  $p = Expect-Ok "$BaseUrl/data/earlier/$cc.json" 'earlier-story list'
  if (-not $p) { continue }
  try {
    $list = @($p.Body | ConvertFrom-Json)
    foreach ($e in ($list | Select-Object -First 2)) { [void](Expect-Ok ("$BaseUrl" + [string]$e.u) 'earlier story') }
  } catch { $problems.Add("earlier-story list does not parse: $cc") }
}

# A missing page is a 404 that still looks like the paper, and http and www both land
# on the https apex.
$checked++
$nf = Get-Page "$BaseUrl/zz/no-such-story-$([guid]::NewGuid().ToString('N').Substring(0, 8))/"
if ($nf.Status -ne 404) { $problems.Add("a missing page answered HTTP $($nf.Status), not 404") }
# HttpClient, not Invoke-WebRequest: with redirects off, Windows PowerShell 5.1 throws
# without the response, so the 301 and its Location are lost.
Add-Type -AssemblyName System.Net.Http
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $false
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)
$apex = ([Uri]$BaseUrl).Host
foreach ($from in "http://$apex/", "https://www.$apex/") {
  $checked++
  $status = 0; $loc = ''
  try {
    $resp = $client.GetAsync($from).GetAwaiter().GetResult()
    $status = [int]$resp.StatusCode
    if ($resp.Headers.Location) { $loc = [string]$resp.Headers.Location }
  } catch { $loc = $_.Exception.Message }
  if ($status -lt 300 -or $status -ge 400 -or $loc -notmatch "^https://$([regex]::Escape($apex))/") { $problems.Add("$from does not redirect to https://$apex/ (HTTP $status $loc)") }
}
$client.Dispose()

Write-Host "[live] $checked checks, $($problems.Count) problem(s)"
foreach ($p in $problems) { Write-Host "  FAIL  $p" -ForegroundColor Red }
if ($Report) {
  $md = New-Object System.Text.StringBuilder
  [void]$md.AppendLine("The weekly check of $BaseUrl found $($problems.Count) problem(s) in $checked checks ($((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm')) UTC).")
  [void]$md.AppendLine('')
  foreach ($p in $problems) { [void]$md.AppendLine("- $p") }
  [IO.File]::WriteAllText($Report, $md.ToString(), (New-Object Text.UTF8Encoding($false)))
}
if ($problems.Count) { exit 1 }
Write-Host '[live] OK' -ForegroundColor Green
exit 0
