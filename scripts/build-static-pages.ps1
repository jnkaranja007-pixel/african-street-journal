#Requires -Version 5.1
<#
.SYNOPSIS
  Generate a crawlable HTML page per country, plus sitemap.xml and robots.txt.
.DESCRIPTION
  The app routes on hash fragments (#/ke). Search engines discard everything after
  the '#', so the entire journal is one URL to a crawler, and that URL is a near-empty
  shell because all content renders client-side from JS. Every country is invisible.

  This writes a real page per country at /<iso>/ containing the actual story text as
  HTML, with its own title, description and canonical link. Crawlers get text; readers
  get a link through to the interactive dossier. The app itself is untouched.

  Re-run after every desk run so the static pages track the stories.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/build-static-pages.ps1
  powershell -ExecutionPolicy Bypass -File scripts/build-static-pages.ps1 -BaseUrl https://africanstreetjournal.com
.NOTES
  -BaseUrl must be the live origin with no trailing slash. It is the one thing to
  change on the day a custom domain goes live.
#>
param(
  # The live origin, no trailing slash. Every canonical, og:url and sitemap entry is
  # built from this, so it is the one value to change if the domain ever moves again.
  [string]$BaseUrl = 'https://africanstreetjournal.com',
  # How long a shared story keeps a page of its own. Past this it is swept and
  # 404.html lands the reader on the country rather than a dead end.
  [int]$StoryDays = 7
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

# Get-IsoDay lives here so the page builder, the merge and the publication gate all
# read a date stamp the same way. See the note in story-shape.ps1.
. (Join-Path $PSScriptRoot 'story-shape.ps1')   # Get-IsoDay, Get-StorySlug, Import-PublishedEdition
$BaseUrl = $BaseUrl.TrimEnd('/')

# --- country metadata out of app.js -----------------------------------------
$appJs = [IO.File]::ReadAllText((Join-Path $root 'app.js'))
$info = @{}
# Accept either quote style. Entries whose name or capital contains an apostrophe are
# written with double quotes in app.js ("Cote d'Ivoire", "N'Djamena"), and a
# single-quote-only pattern skipped them silently - Ivory Coast and Chad had briefs but
# no crawlable page at all, which is invisible unless you count pages against briefs.
$q = "(?m)^\s{2}([a-z]{2}):\s*\{\s*name:\s*(['""])(.*?)\2,\s*region:\s*(['""])(.*?)\4,\s*capital:\s*(['""])(.*?)\6"
foreach ($m in [regex]::Matches($appJs, $q)) {
  $info[$m.Groups[1].Value] = @{
    name = $m.Groups[3].Value; region = $m.Groups[5].Value; capital = $m.Groups[7].Value
  }
}
if ($info.Count -lt 55) { Write-Host "[static] only parsed $($info.Count) countries from app.js (expected 55)" -ForegroundColor Red; exit 1 }

# --- briefs -----------------------------------------------------------------
# The edition ships in two halves. These pages carry the story text, so they need both.
$edition = Import-PublishedEdition $root
if (-not $edition) { Write-Host '[static] cannot read the published edition' -ForegroundColor Red; exit 1 }
$byCountry = $edition.byCountry
$dates = $edition.dates

function Esc($s) {
  if ($null -eq $s) { return '' }
  ([string]$s).Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;').Replace('"','&quot;')
}

function JsonEsc($s) {
  # For values going inside the JSON-LD block. '<' is escaped as \u003c so a headline
  # containing markup cannot close the script element early.
  if ($null -eq $s) { return '' }
  ([string]$s).Replace('\','\\').Replace('"','\"').Replace("`r",' ').Replace("`n",' ').Replace('<','\u003c')
}

$css = @'
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#131313;color:#e8e6e3;font:16px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif;padding:0 20px}
.wrap{max-width:760px;margin:0 auto;padding:48px 0 80px}
a{color:#66bb6a}
.masthead{font:700 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.24em;text-transform:uppercase;color:#8a847b;padding-bottom:28px;border-bottom:1px solid #2a2a2a}
.masthead a{color:#8a847b;text-decoration:none}
h1{font:700 clamp(34px,7vw,56px)/1 'Playfair Display',Georgia,'Times New Roman',serif;margin:34px 0 10px;letter-spacing:0}
.meta{font:700 11px/1.7 ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:#8a847b;margin-bottom:8px}
.open{display:inline-block;margin:18px 0 6px;font:700 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;border-bottom:1px solid #4caf50;padding-bottom:5px}
article{padding:26px 0;border-bottom:1px solid #232323}
h2{font:700 clamp(22px,3.2vw,28px)/1.2 'Playfair Display',Georgia,'Times New Roman',serif;margin:0 0 10px;color:#f2f0ed}
h2 a{color:inherit;text-decoration:none}
h2 a:hover,h2 a:focus-visible{color:#66bb6a;outline:none}
.kicker{font:700 10px/1 ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:#66bb6a;margin-bottom:9px}
.dek{font-size:17px;line-height:1.45;color:#e8e6e3;margin-bottom:18px}
p{margin:0 0 12px;color:#c9c5c0}
.why{color:#8a847b;font-size:14.5px}
.why b{color:#e8e6e3;font-weight:600;margin-right:8px}
.src{font:700 10px/1.9 ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase}
.src a{margin-right:14px;text-decoration:none;border-bottom:1px solid #2f5c33}
.read{display:inline-block;margin-top:8px;font:700 10px/1 ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;text-decoration:none;border-bottom:1px solid #4caf50;padding-bottom:5px}
footer{margin-top:44px;font:700 10px/1.9 ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:#66615b}
.morenav{margin-top:34px;padding-top:20px;border-top:1px solid #232323}
.morenav h2{font:700 10px/1 ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:#8a847b;margin:0 0 12px}
.morenav a{display:inline-block;margin:0 14px 7px 0;font:400 13px/1.5 'Playfair Display',Georgia,'Times New Roman',serif;color:#9a958e;text-decoration:none;border-bottom:1px solid transparent}
.morenav a:hover{color:#66bb6a;border-bottom-color:#2f5c33}
'@

# Same analytics loader as index.html. These pages are where search traffic lands, so
# leaving them unmeasured would report the site as quieter than it is and hide which
# countries people actually arrive for. Literal here-string: nothing in it is expanded.
$analytics = @'
<script src="/data/analytics-config.js" onerror="window.ASJ_ANALYTICS=null"></script>
<script>
(function(){var c=window.ASJ_ANALYTICS;if(!c)return;
if(navigator.doNotTrack==='1'||window.doNotTrack==='1')return;var s;
if(c.goatcounter){s=document.createElement('script');s.async=true;s.src='https://gc.zgo.at/count.js';
s.setAttribute('data-goatcounter','https://'+c.goatcounter+'.goatcounter.com/count');document.head.appendChild(s);}
if(c.cloudflare){s=document.createElement('script');s.defer=true;s.src='https://static.cloudflareinsights.com/beacon.min.js';
s.setAttribute('data-cf-beacon',JSON.stringify({token:c.cloudflare}));document.head.appendChild(s);}}());
</script>
'@

$built = 0
$storyPages = New-Object System.Collections.Generic.List[object]
$urls = New-Object System.Collections.Generic.List[string]
$urls.Add($BaseUrl + '/')

# Which countries will actually get a page. Needed up front so every page can link to
# every other one: without this the pages are orphaned, reachable only through
# sitemap.xml. Internal links are how a crawler understands the set is one publication
# rather than 55 unrelated documents, and these pages are the only version of the
# journal a search engine can read at all.
$pageCodes = New-Object System.Collections.Generic.List[string]
foreach ($prop in $byCountry.PSObject.Properties) {
  if (-not @($prop.Value | Where-Object { Test-StoryIsRenderable $_ }).Count) { continue }
  if (-not $info[$prop.Name]) { continue }
  $pageCodes.Add($prop.Name)
}
$navLinks = New-Object System.Text.StringBuilder
foreach ($c in ($pageCodes | Sort-Object { $info[$_].name })) {
  [void]$navLinks.Append("<a href=""$BaseUrl/$c/"">$(Esc $info[$c].name)</a>")
}

foreach ($prop in $byCountry.PSObject.Properties) {
  $code = $prop.Name
  $stories = @($prop.Value | Where-Object { Test-StoryIsRenderable $_ })
  if (-not $stories.Count) { continue }
  $meta = $info[$code]
  if (-not $meta) { continue }

  $name = $meta.name
  $when = if ($dates -and $dates.PSObject.Properties[$code]) { Get-IsoDay $dates.$code } else { '' }
  $lead = ([string]$stories[0].headline)
  $desc = "$name news: $lead. Original source-cited stories and country signals from The African Street Journal."
  if ($desc.Length -gt 300) { $desc = $desc.Substring(0,297) + '...' }

  $body = New-Object System.Text.StringBuilder
  $storyIndex = 0
  foreach ($b in $stories) {
    $storyKey = if ($b.articleId) { 'id:' + [string]$b.articleId } else { "slot:$code`:$storyIndex" }
    # A page of its own, so a shared story shows its own headline. Every story link on
    # the site used to be /?story=<id>, which serves the app shell: one title, one
    # description, one image, for 235 stories a day.
    $storySlug = Get-StorySlug $b.headline $b.articleId
    $storyUrl = "$BaseUrl/$code/$storySlug/"
    [void]$storyPages.Add([pscustomobject]@{ code = $code; slug = $storySlug; brief = $b; when = $when; country = $name; key = $storyKey })
    [void]$body.Append("<div class=""kicker"">$(Esc $b.topic)$(if($when){" &middot; $when"})</div>`n")
    [void]$body.Append("<h2><a href=""$storyUrl"">$(Esc $b.headline)</a></h2>`n")
    if ($b.dek) { [void]$body.Append("<p class=""dek"">$(Esc $b.dek)</p>`n") }
    $paragraphs = @($b.paragraphs | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
    if (-not $paragraphs.Count) { $paragraphs = @([string]$b.body) }
    foreach ($paragraph in $paragraphs) { [void]$body.Append("<p>$(Esc $paragraph)</p>`n") }
    if ($b.why) { [void]$body.Append("<p class=""why""><b>Why it matters</b>$(Esc $b.why)</p>`n") }
    $srcs = @($b.sources | Where-Object { $_ -and $_.url -and $_.url -match '^https?://' })
    if ($srcs.Count) {
      [void]$body.Append('<div class="src">')
      foreach ($s in $srcs) { [void]$body.Append("<a href=""$(Esc $s.url)"" rel=""nofollow noopener"" target=""_blank"">$(Esc $s.name)</a>") }
      [void]$body.Append("</div>`n")
    }
    [void]$body.Append("<a class=""read"" href=""$storyUrl"">Read in ASJ &rarr;</a>`n")
    [void]$body.Append("</article>`n")
    $storyIndex++
  }

  $canonical = "$BaseUrl/$code/"
  # Google shows roughly 60 characters of a title. "Central African Republic news and
  # country file | The African Street Journal" is 75, so the masthead - the part that
  # builds recognition in a results page - was the half being cut. Long names drop the
  # "and country file" clause and keep the brand.
  $titleText = if ($name.Length -gt 10) { "$name news | The African Street Journal" }
               else { "$name news and country file | The African Street Journal" }

  # Structured data describes the country edition and links each original ASJ article.
  $ld = New-Object System.Text.StringBuilder
  [void]$ld.Append('{"@context":"https://schema.org","@type":"CollectionPage",')
  [void]$ld.Append("""name"":""$(JsonEsc ("$name news and country file"))"",")
  [void]$ld.Append("""url"":""$canonical"",")
  [void]$ld.Append("""description"":""$(JsonEsc $desc)"",")
  if ($when) { [void]$ld.Append("""dateModified"":""$when"",") }
  [void]$ld.Append("""about"":{""@type"":""Country"",""name"":""$(JsonEsc $name)""},")
  [void]$ld.Append('"isPartOf":{"@type":"Periodical","name":"The African Street Journal","url":"' + $BaseUrl + '/"},')
  [void]$ld.Append('"mainEntity":{"@type":"ItemList","itemListElement":[')
  $li = 0
  foreach ($b in $stories) {
    if ($li -gt 0) { [void]$ld.Append(',') }
    $storyKey = if ($b.articleId) { 'id:' + [string]$b.articleId } else { "slot:$code`:$li" }
    $storyUrl = "$BaseUrl/$code/$(Get-StorySlug $b.headline $b.articleId)/"
    $li++
    [void]$ld.Append("{""@type"":""ListItem"",""position"":$li,""name"":""$(JsonEsc $b.headline)"",""url"":""$storyUrl""}")
  }
  [void]$ld.Append(']}}')

  $html = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>$(Esc $titleText)</title>
<meta name="description" content="$(Esc $desc)">
<link rel="canonical" href="$canonical">
<meta name="theme-color" content="#131313">
$analytics
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<!-- Non-blocking: a stylesheet link here stops first paint until a third-party round
     trip finishes. display=swap is already in the URL, so text renders in Georgia and
     reflows when Playfair arrives. -->
<link rel="stylesheet" media="print" onload="this.media='all';this.onload=null" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400;1,700&display=swap">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400;1,700&display=swap"></noscript>
<meta property="og:site_name" content="The African Street Journal">
<meta property="og:title" content="$(Esc $name) news and country file">
<meta property="og:description" content="$(Esc $desc)">
<meta property="og:type" content="website">
<meta property="og:url" content="$canonical">
<meta property="og:image" content="$BaseUrl/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="$BaseUrl/og-image.png">
<script type="application/ld+json">$($ld.ToString())</script>
<link rel="stylesheet" href="$BaseUrl/static-pages.css">
</head>
<body>
<div class="wrap">
<div class="masthead"><a href="$BaseUrl/">The African Street Journal</a></div>
<div class="meta">$(Esc $meta.region)$(if($meta.capital){" &middot; Capital $(Esc $meta.capital)"})</div>
<h1>$(Esc $name)</h1>
<div class="meta">$($stories.Count) stories$(if($when){" &middot; updated $when"})</div>
<a class="open" href="$BaseUrl/#/$code">Open the interactive $(Esc $name) dossier &rarr;</a>
$($body.ToString())
<nav class="morenav">
<h2>Explore country desks</h2>
$($navLinks.ToString())
</nav>
<footer>The African Street Journal &middot; from the streets, for the streets<br>Every story carries its sources. Figures are labelled with their origin and date.</footer>
</div>
</body>
</html>
"@

  $dir = Join-Path $root $code
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  [IO.File]::WriteAllText((Join-Path $dir 'index.html'), $html, (New-Object Text.UTF8Encoding($false)))
  $urls.Add($canonical)
  $built++
}

# --- a page per story -------------------------------------------------------
# Every story link on the site used to point at /?story=<id>, which serves the app
# shell. That is one title, one description and one image for 235 stories a day: a
# story shared to a chat app showed the masthead and the generic blurb rather than its
# own headline, and a search engine saw one URL where there were 235 pieces.
#
# Retention is deliberate. A page per story per day kept forever is roughly 86,000
# files a year in a git repository, which is not a thing a static host should carry.
# Pages older than -StoryDays are swept, and 404.html turns an expired story URL into
# its country page rather than a dead end.
$storyKept = @{}
$storyBuilt = 0
foreach ($sp in $storyPages) {
  $b = $sp.brief
  $paragraphs = @($b.paragraphs | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
  if (-not $paragraphs.Count -and $b.body) { $paragraphs = @([string]$b.body) }
  if (-not $paragraphs.Count) { continue }
  $dek = if ($b.dek) { [string]$b.dek } else { $paragraphs[0] }
  if ($dek.Length -gt 300) { $dek = $dek.Substring(0, 297) + '...' }
  $storyCanonical = "$BaseUrl/$($sp.code)/$($sp.slug)/"
  $published = Get-IsoInstant $b.published
  if (-not $published) { $published = $sp.when }
  $appUrl = "$BaseUrl/?story=$([Uri]::EscapeDataString($sp.key))"

  $srcs = @($b.sources | Where-Object { $_ -and $_.url -and $_.url -match '^https?://' })
  $srcHtml = New-Object System.Text.StringBuilder
  if ($srcs.Count) {
    [void]$srcHtml.Append('<div class="src">')
    foreach ($s in $srcs) { [void]$srcHtml.Append("<a href=""$(Esc $s.url)"" rel=""nofollow noopener"" target=""_blank"">$(Esc $s.name)</a>") }
    [void]$srcHtml.Append('</div>')
  }
  $bodyHtml = New-Object System.Text.StringBuilder
  foreach ($p in $paragraphs) { [void]$bodyHtml.Append("<p>$(Esc $p)</p>`n") }
  if ($b.why) { [void]$bodyHtml.Append("<p class=""why""><b>Why it matters</b>$(Esc $b.why)</p>`n") }

  # NewsArticle, not CollectionPage: this is one piece, with a date and a publisher,
  # and citation carries the outlets it was written from.
  $ld = New-Object System.Text.StringBuilder
  [void]$ld.Append('{"@context":"https://schema.org","@type":"NewsArticle"')
  [void]$ld.Append(",""headline"":""$(JsonEsc $b.headline)""")
  [void]$ld.Append(",""description"":""$(JsonEsc $dek)""")
  [void]$ld.Append(",""url"":""$storyCanonical""")
  if ($published) { [void]$ld.Append(",""datePublished"":""$published"",""dateModified"":""$published""") }
  [void]$ld.Append(",""inLanguage"":""en"",""isAccessibleForFree"":true")
  [void]$ld.Append(",""publisher"":{""@type"":""NewsMediaOrganization"",""name"":""The African Street Journal"",""url"":""$BaseUrl/""}")
  [void]$ld.Append(",""contentLocation"":{""@type"":""Country"",""name"":""$(JsonEsc $sp.country)""}")
  if ($srcs.Count) {
    [void]$ld.Append(',"citation":[')
    for ($ci = 0; $ci -lt $srcs.Count; $ci++) {
      if ($ci -gt 0) { [void]$ld.Append(',') }
      [void]$ld.Append("{""@type"":""CreativeWork"",""name"":""$(JsonEsc $srcs[$ci].name)"",""url"":""$(JsonEsc $srcs[$ci].url)""}")
    }
    [void]$ld.Append(']')
  }
  [void]$ld.Append('}')

  $storyTitle = "$([string]$b.headline) | The African Street Journal"
  $storyHtml = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>$(Esc $storyTitle)</title>
<meta name="description" content="$(Esc $dek)">
<link rel="canonical" href="$storyCanonical">
<meta name="theme-color" content="#131313">
$analytics
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" media="print" onload="this.media='all';this.onload=null" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400;1,700&display=swap">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400;1,700&display=swap"></noscript>
<meta property="og:site_name" content="The African Street Journal">
<meta property="og:type" content="article">
<meta property="og:title" content="$(Esc $b.headline)">
<meta property="og:description" content="$(Esc $dek)">
<meta property="og:url" content="$storyCanonical">
<meta property="og:image" content="$BaseUrl/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="$(Esc $b.headline)">
<meta name="twitter:description" content="$(Esc $dek)">
<meta name="twitter:image" content="$BaseUrl/og-image.png">
<script type="application/ld+json">$($ld.ToString())</script>
<link rel="stylesheet" href="$BaseUrl/static-pages.css">
</head>
<body>
<div class="wrap">
  <div class="masthead"><a href="$BaseUrl/">The African Street Journal</a> &middot; <a href="$BaseUrl/$($sp.code)/">$(Esc $sp.country)</a></div>
  <div class="meta">$(Esc $b.topic)$(if($sp.when){" &middot; $($sp.when)"})</div>
  <h1>$(Esc $b.headline)</h1>
  <p class="dek">$(Esc $dek)</p>
$($bodyHtml.ToString())
$($srcHtml.ToString())
  <a class="open" href="$appUrl">Read in the ASJ desk &rarr;</a>
  <div class="morenav"><h2>More from $(Esc $sp.country)</h2><a href="$BaseUrl/$($sp.code)/">All $(Esc $sp.country) stories</a></div>
  <footer>The African Street Journal &middot; original reporting, every source cited</footer>
</div>
</body>
</html>
"@
  $storyDirPath = Join-Path (Join-Path $root $sp.code) $sp.slug
  if (-not (Test-Path $storyDirPath)) { New-Item -ItemType Directory -Path $storyDirPath -Force | Out-Null }
  [IO.File]::WriteAllText((Join-Path $storyDirPath 'index.html'), $storyHtml, (New-Object Text.UTF8Encoding($false)))
  $storyKept["$($sp.code)/$($sp.slug)"] = $true
  $urls.Add($storyCanonical)
  $storyBuilt++
}

# Sweep story pages past the retention window. Anything in this edition was just
# rewritten above and is in $storyKept, so only genuinely expired pages go.
$swept = 0
if ($StoryDays -gt 0) {
  $cutoff = (Get-Date).ToUniversalTime().AddDays(-$StoryDays)
  foreach ($cc in $pageCodes) {
    $ccDir = Join-Path $root $cc
    if (-not (Test-Path $ccDir)) { continue }
    foreach ($sub in Get-ChildItem -Path $ccDir -Directory -ErrorAction SilentlyContinue) {
      if ($storyKept.ContainsKey("$cc/$($sub.Name)")) { continue }
      $page = Join-Path $sub.FullName 'index.html'
      if (-not (Test-Path $page)) { continue }
      if ((Get-Item $page).LastWriteTimeUtc -lt $cutoff) {
        [IO.Directory]::Delete($sub.FullName, $true)
        $swept++
      }
    }
  }
}
Write-Host "[static] $storyBuilt story pages, $swept swept past $StoryDays days" -ForegroundColor DarkGray

# --- sitemap ----------------------------------------------------------------
$today = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
$sm = New-Object System.Text.StringBuilder
[void]$sm.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
[void]$sm.AppendLine('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
foreach ($u in $urls) {
  [void]$sm.AppendLine("  <url><loc>$u</loc><lastmod>$today</lastmod><changefreq>daily</changefreq></url>")
}
[void]$sm.AppendLine('</urlset>')
[IO.File]::WriteAllText((Join-Path $root 'sitemap.xml'), $sm.ToString(), (New-Object Text.UTF8Encoding($false)))

# --- shared stylesheet -------------------------------------------------------
# Inlined into every page this was ~4 KB x 290 pages of identical bytes, none of it
# cacheable across the set. One file is one request that every other page then gets
# from cache.
[IO.File]::WriteAllText((Join-Path $root 'static-pages.css'), $css, (New-Object Text.UTF8Encoding($false)))

# --- robots -----------------------------------------------------------------
$robots = "User-agent: *`nAllow: /`n`nSitemap: $BaseUrl/sitemap.xml`n"
[IO.File]::WriteAllText((Join-Path $root 'robots.txt'), $robots, (New-Object Text.UTF8Encoding($false)))

Write-Host "[static] built $built country pages, sitemap with $($urls.Count) URLs, robots.txt" -ForegroundColor Green
Write-Host "[static] base URL: $BaseUrl" -ForegroundColor DarkGray
