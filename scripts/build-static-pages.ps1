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
.masthead{display:flex;flex-wrap:nowrap;white-space:nowrap;align-items:baseline;gap:0 8px;font:700 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.24em;text-transform:uppercase;color:#8a847b;padding-bottom:28px;border-bottom:1px solid #2a2a2a}
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
.asj-info{position:relative;display:inline-block;font:inherit;letter-spacing:inherit;text-transform:uppercase}.asj-info>summary{list-style:none;display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:#8f8a83;padding:4px 0;white-space:nowrap;-webkit-user-select:none;user-select:none}.asj-info>summary::-webkit-details-marker{display:none}.asj-info>summary::marker{content:''}.asj-info>summary::after{content:'';width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform .18s}.asj-info[open]>summary::after{transform:translateY(1px) rotate(225deg)}.asj-info>summary:hover,.asj-info>summary:focus-visible,.asj-info[open]>summary{color:#66bb6a;outline:none}.asj-info>summary:focus-visible{outline:2px solid #66bb6a;outline-offset:3px}.asj-info-menu{position:absolute;top:calc(100% + 8px);left:0;z-index:2000;min-width:180px;max-width:calc(100vw - 24px);display:flex;flex-direction:column;background:#161616;border:1px solid #2c2c2c;border-radius:4px;box-shadow:0 12px 32px rgba(0,0,0,.55);padding:6px 0;text-align:left}.asj-info-menu a,.asj-info-menu a:visited{display:block;padding:10px 16px;color:#cfcbc6;text-decoration:none;border:0;font:700 11px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}.asj-info-menu a:hover,.asj-info-menu a:focus-visible{background:#1f241f;color:#66bb6a;outline:none}.asj-info--right{margin-left:auto;padding-left:10px}.asj-info--right .asj-info-menu{left:auto;right:0}

.masthead>a{overflow:hidden;text-overflow:ellipsis;min-width:0}.masthead>a:last-of-type{flex-shrink:1}.masthead>a:first-child{flex-shrink:2}
@media (max-width:520px){.masthead{font-size:10px;letter-spacing:.12em}}.asj-info--right .asj-info-menu{left:auto;right:0}

.page p,.page li{color:#c9c5c0;font-size:16.5px;line-height:1.65}
/* Story pages only (scoped to .story / .related / .share so country pages are unchanged). */
.skip-link{position:absolute;left:12px;top:-60px;padding:10px 14px;background:#66bb6a;color:#0c0c0c;font:700 12px/1 ui-monospace,Consolas,monospace;text-decoration:none;z-index:9}
.skip-link:focus{top:12px}
.story :focus-visible,.related :focus-visible{outline:2px solid #66bb6a;outline-offset:3px}
.story{padding:0;border-bottom:0}
.story-head{padding-bottom:22px;margin-bottom:26px;border-bottom:1px solid #232323}
.story-head h1{font-size:clamp(32px,6vw,49px);line-height:1.08;margin:14px 0}
.story-head .dek{font-size:clamp(18px,2.4vw,21px);line-height:1.45;color:#e2dfda;margin:0 0 16px}
.byline{font:12px/1.6 ui-monospace,Consolas,monospace;letter-spacing:.06em;color:#948e85;margin:0 0 16px}
.byline a{color:#66bb6a;text-decoration:none;border-bottom:1px solid #2f5c33}
.story p{font-size:17.5px;line-height:1.7;color:#d3cfc9;max-width:66ch}
.share{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.share a,.share button{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border:1px solid #2e2e2e;background:#181818;color:#e8e6e3;font:700 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;cursor:pointer}
.share a:hover,.share button:hover{border-color:#66bb6a}
.share .share-wa{background:#1d3a24;border-color:#2f6b3b;color:#dff3e1}
.share-status{font:12px ui-monospace,monospace;color:#66bb6a}
.section-label{font:700 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:#948e85;margin:30px 0 12px}
.related{margin-top:34px}
.related ul{list-style:none;margin:0;padding:0}
.related li a{display:block;padding:10px 0;border-bottom:1px solid #1f1f1f;color:#ebe8e4;text-decoration:none;font:700 17px/1.3 'Playfair Display',Georgia,serif}
.related li a:hover{color:#66bb6a}
.rel-topic{display:block;font:700 10px/1.6 ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:#66bb6a;margin-bottom:2px}

.page h2{margin-top:30px}
.page ul{padding-left:20px}
'@
# Trust-page links, appended to every generated footer.
$siteLinks = '<script src="'+$BaseUrl+'/info-panel.js?v=56" defer></script>'
$infoMenu = '<details class="asj-info asj-info--right"><summary>About</summary><div class="asj-info-menu"><a href="'+$BaseUrl+'/about/">About</a><a href="'+$BaseUrl+'/privacy/">Privacy</a><a href="'+$BaseUrl+'/contact/">Contact</a><a href="'+$BaseUrl+'/corrections/">Corrections</a><a href="'+$BaseUrl+'/feed.xml">RSS</a></div></details>'


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
<link rel="stylesheet" href="$BaseUrl/static-pages.css?v=56">
</head>
<body>
<div class="wrap">
<div class="masthead"><a href="$BaseUrl/">The African Street Journal</a>$infoMenu</div>
<div class="meta">$(Esc $meta.region)$(if($meta.capital){" &middot; Capital $(Esc $meta.capital)"})</div>
<h1>$(Esc $name)</h1>
<div class="meta">$($stories.Count) stories$(if($when){" &middot; updated $when"})</div>
<a class="open" href="$BaseUrl/#/$code">Open the interactive $(Esc $name) dossier &rarr;</a>
$($body.ToString())
<nav class="morenav">
<h2>Explore country desks</h2>
$($navLinks.ToString())
</nav>
<footer>The African Street Journal &middot; from the streets, for the streets<br>Every story carries its sources. Figures are labelled with their origin and date.$siteLinks</footer>
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
# Lead story of each country, newest first, for the "Latest across Africa" rail.
$leadPages = @($storyPages | Group-Object code | ForEach-Object { $_.Group[0] } | Sort-Object { [string](Get-IsoInstant $_.brief.published) } -Descending)
$feedItems = New-Object System.Collections.Generic.List[object]
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

  $words = (($paragraphs -join ' ') -split '\s+' | Where-Object { $_ }).Count
  $readMin = [Math]::Max(1, [int][Math]::Ceiling($words / 200))
  $encUrl = [Uri]::EscapeDataString($storyCanonical)
  $waText = [Uri]::EscapeDataString(([string]$b.headline) + ' ' + $storyCanonical)
  $xText = [Uri]::EscapeDataString([string]$b.headline)
  $moreHtml = (@($storyPages | Where-Object { $_.code -eq $sp.code -and $_.slug -ne $sp.slug } | Select-Object -First 4 | ForEach-Object {
    "<li><a href=""$BaseUrl/$($_.code)/$($_.slug)/""><span class=""rel-topic"">$(Esc $_.brief.topic)</span>$(Esc $_.brief.headline)</a></li>" }) -join '')
  $latestHtml = (@($leadPages | Where-Object { $_.code -ne $sp.code } | Select-Object -First 4 | ForEach-Object {
    "<li><a href=""$BaseUrl/$($_.code)/$($_.slug)/""><span class=""rel-topic"">$(Esc $_.country)</span>$(Esc $_.brief.headline)</a></li>" }) -join '')
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
<meta property="og:image" content="$BaseUrl/og/$($sp.code).jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="$(Esc $sp.country) - The African Street Journal">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="$(Esc $b.headline)">
<meta name="twitter:description" content="$(Esc $dek)">
<meta name="twitter:image" content="$BaseUrl/og/$($sp.code).jpg">
<script type="application/ld+json">$($ld.ToString())</script>
<link rel="stylesheet" href="$BaseUrl/static-pages.css?v=56">
</head>
<body>
<a class="skip-link" href="#main">Skip to story</a>
<div class="wrap">
  <header class="masthead"><a href="$BaseUrl/">The African Street Journal</a> <span aria-hidden="true">/</span> <a href="$BaseUrl/$($sp.code)/">$(Esc $sp.country)</a>$infoMenu</header>
  <main id="main">
  <article class="story">
  <header class="story-head">
  <div class="meta">$(Esc $b.topic)</div>
  <h1>$(Esc $b.headline)</h1>
  <p class="dek">$(Esc $dek)</p>
  <p class="byline">$(if($srcs.Count){"Source: <a href=""$(Esc $srcs[0].url)"" rel=""nofollow noopener"" target=""_blank"">$(Esc $srcs[0].name)</a> &middot; "})$(if($published){"<time datetime=""$published"">$(Esc $sp.when)</time> &middot; "})$readMin min read</p>
  <div class="share" data-url="$storyCanonical" data-title="$(Esc $b.headline)">
    <a class="share-wa" href="https://wa.me/?text=$waText" target="_blank" rel="noopener">WhatsApp</a>
    <a href="https://x.com/intent/post?text=$xText&amp;url=$encUrl" target="_blank" rel="noopener">X</a>
    <button type="button" class="share-copy">Copy link</button>
    <button type="button" class="share-native" hidden>Share&hellip;</button>
    <span class="share-status" role="status" aria-live="polite"></span>
  </div>
  </header>
$($bodyHtml.ToString())
  $(if($srcs.Count){"<h2 class=""section-label"">Sources</h2>"})
$($srcHtml.ToString())
  </article>
  <nav class="related" aria-label="More stories">
    $(if($moreHtml){"<h2 class=""section-label"">More from $(Esc $sp.country)</h2><ul>$moreHtml</ul>"})
    $(if($latestHtml){"<h2 class=""section-label"">Latest across Africa</h2><ul>$latestHtml</ul>"})
    <p><a class="open" href="$BaseUrl/$($sp.code)/">All $(Esc $sp.country) stories &rarr;</a> &nbsp; <a class="open" href="$appUrl">Open the full desk &rarr;</a></p>
  </nav>
  </main>
  <footer>The African Street Journal &middot; original reporting, every source cited$siteLinks</footer>
</div>
<script src="$BaseUrl/share.js" defer></script>
</body>
</html>
"@
  $storyDirPath = Join-Path (Join-Path $root $sp.code) $sp.slug
  if (-not (Test-Path $storyDirPath)) { New-Item -ItemType Directory -Path $storyDirPath -Force | Out-Null }
  [IO.File]::WriteAllText((Join-Path $storyDirPath 'index.html'), $storyHtml, (New-Object Text.UTF8Encoding($false)))
  $storyKept["$($sp.code)/$($sp.slug)"] = $true
  $urls.Add($storyCanonical)
  $feedItems.Add([pscustomobject]@{ title = [string]$b.headline; link = $storyCanonical; dek = $dek; published = $published; country = [string]$sp.country })
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


# --- trust pages ---------------------------------------------------------------
# About, Privacy, Contact, Corrections. Added 20 Oct 2026: a news site with none of
# these reads as anonymous, and Google News expects them.
$trustPages = [ordered]@{
  about = @{ title = 'About'; desc = 'What The African Street Journal is, how its stories are made, and who runs it.'; body = @"
<p>The African Street Journal is an independent daily digest of news from all 55 African countries, written for readers on the continent and in the diaspora.</p>
<h2>How the desk works</h2>
<p>Every morning an automated desk reads public news feeds from outlets across Africa, groups reports of the same event, and ranks them for public importance: elections, budgets, courts, health, food, power, jobs, trade and security come first. Gossip, sponsored copy, opinion columns and tabloid items are filtered out.</p>
<p>Each selected report is rewritten into a short original summary by an AI language model, working only from the facts in that report. Software then checks every story: figures must appear in the source, the story must name and link the outlet it came from, and anything that fails is dropped rather than published.</p>
<p>Stories are summaries, not original reporting from the ground. The outlet that broke the story is always credited and linked; please read and support them.</p>
<h2>Get in touch</h2>
<p>The African Street Journal is an independent desk. Questions, tips and complaints are welcome on the <a href="$BaseUrl/contact/">contact page</a>.</p>
"@ }
  privacy = @{ title = 'Privacy'; desc = 'What The African Street Journal collects about readers (very little) and why.'; body = @"
<p>This site does not use cookies, does not ask you to sign in, and does not run advertising trackers.</p>
<h2>Analytics</h2>
<p>We count page views with <a href="https://www.cloudflare.com/web-analytics/" rel="noopener">Cloudflare Web Analytics</a>. It is cookieless: it does not set cookies or use local storage to identify you, and it does not build a profile of you across sites. It records things like the page viewed, the referring site, browser type and country, in aggregate.</p>
<p>If your browser sends a Do Not Track signal, the analytics script is not loaded at all.</p>
<h2>Hosting</h2>
<p>The site is served by GitHub Pages, and its domain name is handled by Cloudflare. Like any web host, they may keep short-lived server logs (such as IP addresses) for security and reliability. Typefaces are loaded from Google Fonts, which receives your IP address when it serves them. See the <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" rel="noopener">GitHub privacy statement</a>.</p>
<h2>Offline reading</h2>
<p>The site stores a copy of its own pages in your browser so it can open quickly and work offline. That copy stays on your device and is never sent to us.</p>
<h2>Email</h2>
<p>If you email us, we use your message and address only to reply. We do not run a mailing list at the moment.</p>
<p>A contact channel for privacy questions is coming soon.</p>
"@ }
  contact = @{ title = 'Contact'; desc = 'How to reach The African Street Journal with tips, corrections or questions.'; body = @"
<p>A contact channel is coming soon. Once it is open, we welcome:</p>
<ul>
<li><b>Corrections:</b> include the story link. See the <a href="$BaseUrl/corrections/">corrections policy</a>.</li>
<li><b>Outlets and publishers:</b> if you think we have summarised or credited your reporting wrongly, or you want your feed removed, tell us and we will act promptly.</li>
<li><b>Tips and suggestions:</b> sources we should be reading, countries we cover thinly, or features you would like.</li>
</ul>
"@ }
  corrections = @{ title = 'Corrections'; desc = 'How The African Street Journal corrects mistakes.'; body = @"
<p>We aim to be accurate. When we get something wrong, we fix it.</p>
<ul>
<li>Every story links to the outlet it was based on. If our summary does not match that source, the source wins and we correct or remove our story.</li>
<li>Factual errors in a live story are corrected as soon as we confirm them, normally within one working day.</li>
<li>If a story should not have run at all (for example a misattributed report, or an item that is not news), we take it down.</li>
<li>Because stories are summaries generated with an AI model and checked automatically, mistakes are possible. Reader reports are an important part of catching them.</li>
</ul>
<p>A channel for reporting errors is coming soon.</p>
"@ }
}
foreach ($slug in $trustPages.Keys) {
  $tp = $trustPages[$slug]
  $tpUrl = "$BaseUrl/$slug/"
  $tpHtml = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>$($tp.title) | The African Street Journal</title>
<meta name="description" content="$(Esc $tp.desc)">
<link rel="canonical" href="$tpUrl">
<meta name="theme-color" content="#131313">
<link rel="alternate" type="application/rss+xml" title="The African Street Journal" href="$BaseUrl/feed.xml">
$analytics
<link rel="stylesheet" href="$BaseUrl/static-pages.css?v=56">
</head>
<body>
<div class="wrap page">
<div class="masthead"><a href="$BaseUrl/">The African Street Journal</a>$infoMenu</div>
<h1>$($tp.title)</h1>
$($tp.body)
<footer>The African Street Journal &middot; from the streets, for the streets$siteLinks</footer>
</div>
</body>
</html>
"@
  $tpDir = Join-Path $root $slug
  if (-not (Test-Path $tpDir)) { New-Item -ItemType Directory -Path $tpDir -Force | Out-Null }
  [IO.File]::WriteAllText((Join-Path $tpDir 'index.html'), $tpHtml, (New-Object Text.UTF8Encoding($false)))
  $urls.Add($tpUrl)
}

# --- RSS feed and Google News sitemap ------------------------------------------
function XmlEsc([string]$t) { if ($null -eq $t) { return '' }; return [Security.SecurityElement]::Escape($t) }
$sortedFeed = @($feedItems | Sort-Object { try { [datetime]::Parse([string]$_.published, [Globalization.CultureInfo]::InvariantCulture).ToUniversalTime() } catch { [datetime]::MinValue } } -Descending)
$rss = New-Object System.Text.StringBuilder
[void]$rss.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
[void]$rss.AppendLine('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>')
[void]$rss.AppendLine("<title>The African Street Journal</title><link>$BaseUrl/</link><description>Daily news from all 55 African countries, every source cited.</description><language>en</language>")
[void]$rss.AppendLine("<atom:link href=""$BaseUrl/feed.xml"" rel=""self"" type=""application/rss+xml""/>")
$news = New-Object System.Text.StringBuilder
[void]$news.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
[void]$news.AppendLine('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">')
$newsCut = (Get-Date).ToUniversalTime().AddDays(-2)
foreach ($fi in ($sortedFeed | Select-Object -First 100)) {
  $pd = $null
  try { $pd = [datetime]::Parse([string]$fi.published, [Globalization.CultureInfo]::InvariantCulture).ToUniversalTime() } catch { }
  [void]$rss.Append("<item><title>$(XmlEsc $fi.title)</title><link>$(XmlEsc $fi.link)</link><guid isPermaLink=""true"">$(XmlEsc $fi.link)</guid><category>$(XmlEsc $fi.country)</category><description>$(XmlEsc $fi.dek)</description>")
  if ($pd) { [void]$rss.Append("<pubDate>$($pd.ToString('r', [Globalization.CultureInfo]::InvariantCulture))</pubDate>") }
  [void]$rss.AppendLine('</item>')
  # Google News sitemaps list only articles from the last two days.
  if ($pd -and $pd -ge $newsCut) {
    [void]$news.AppendLine("  <url><loc>$(XmlEsc $fi.link)</loc><news:news><news:publication><news:name>The African Street Journal</news:name><news:language>en</news:language></news:publication><news:publication_date>$($pd.ToString('yyyy-MM-ddTHH:mm:ssZ'))</news:publication_date><news:title>$(XmlEsc $fi.title)</news:title></news:news></url>")
  }
}
[void]$rss.AppendLine('</channel></rss>')
[void]$news.AppendLine('</urlset>')
[IO.File]::WriteAllText((Join-Path $root 'feed.xml'), $rss.ToString(), (New-Object Text.UTF8Encoding($false)))
[IO.File]::WriteAllText((Join-Path $root 'news-sitemap.xml'), $news.ToString(), (New-Object Text.UTF8Encoding($false)))

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
$robots = "User-agent: *`nAllow: /`n`nSitemap: $BaseUrl/sitemap.xml`nSitemap: $BaseUrl/news-sitemap.xml`n"
[IO.File]::WriteAllText((Join-Path $root 'robots.txt'), $robots, (New-Object Text.UTF8Encoding($false)))

Write-Host "[static] built $built country pages, sitemap with $($urls.Count) URLs, robots.txt" -ForegroundColor Green
Write-Host "[static] base URL: $BaseUrl" -ForegroundColor DarkGray
