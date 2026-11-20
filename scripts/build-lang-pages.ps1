#Requires -Version 5.1
<#
.SYNOPSIS
  Build the static pages of a translated edition (French, Portuguese, Swahili, Arabic):
  /<lang>/, /<lang>/<cc>/, /<lang>/<cc>/<slug>/ and /<lang>/sitemap.xml.
.DESCRIPTION
  Reads the translations (data/briefs-<lang>.json, written by translate-briefs.ps1), the
  English edition they came from (data/briefs-state.json) and the edition's words and
  country names (data/i18n/<lang>.json, UTF-8; this script stays ASCII).

  A story page keeps the English page's address under the language folder:
  /sn/<slug>/ in English is /fr/sn/<slug>/ in French. Each French page names its English
  original (hreflang, a link, and translationOfWork in its structured data).

  Pages already on disk stay until they are -StoryDays old, like the English ones; the
  translation store only holds the live edition, so data/pages-<lang>.json keeps the list
  of every page the edition has published, for the country pages and the sitemap.
#>
param(
  [string]$Lang = 'fr',
  [string]$BaseUrl = 'https://africanstreetjournal.com',
  [int]$StoryDays = 90
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'story-shape.ps1')   # Get-StorySlug, Get-IsoInstant
$inv = [Globalization.CultureInfo]::InvariantCulture
$utf8 = New-Object Text.UTF8Encoding($false)
function Read-Json([string]$Path) { return ([IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) | ConvertFrom-Json) }
function Esc([string]$s) { return [Net.WebUtility]::HtmlEncode($s) }
function U([string]$s) { return [Uri]::EscapeDataString($s) }
function Write-Page([string]$Path, [string]$Html) {
  New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent) | Out-Null
  [IO.File]::WriteAllText($Path, $Html, $utf8)
}

$i18n = Read-Json (Join-Path $root "data\i18n\$Lang.json")
if ([string]$i18n.status -eq 'review') {
  # A language still being checked by a native speaker (scripts/build-review-sheet.ps1)
  # gets no public pages.
  Write-Host "[$Lang] in review; no pages built"
  exit 0
}
$T = $i18n.ui
$seg = [string]$i18n.path
$langRoot = Join-Path $root $seg
$storePath = Join-Path $root "data\briefs-$Lang.json"
$indexPath = Join-Path $root "data\pages-$Lang.json"
if (-not (Test-Path $storePath)) { Write-Host "[$Lang] no translations yet ($storePath)"; exit 0 }
$store = Read-Json $storePath
$state = Read-Json (Join-Path $root 'data\briefs-state.json')

function Get-CountryName([string]$code) { $n = [string]$i18n.countries.$code; if ($n) { return $n }; return $code.ToUpperInvariant() }
function Get-Topic([string]$t) { $n = [string]$i18n.topics.$t; if ($n) { return $n }; return $t }
function Format-Day([string]$iso) {
  try { $d = [DateTimeOffset]::Parse($iso, $inv).UtcDateTime } catch { return '' }
  $fmt = if ($i18n.dateFormat) { [string]$i18n.dateFormat } else { '{d} {m} {y}' }
  return $fmt.Replace('{d}', [string]$d.Day).Replace('{m}', [string]$i18n.months[$d.Month - 1]).Replace('{y}', [string]$d.Year)
}
function Fill([string]$s, [string]$country) { return $s.Replace('{country}', $country) }

# Follow links, from the same file the English footers read.
$social = [IO.File]::ReadAllText((Join-Path $root 'data\social-config.js'))
function Get-Social([string]$k) { $m = [regex]::Match($social, "$k\s*:\s*'([^']*)'"); if ($m.Success) { return $m.Groups[1].Value }; return '' }
$follow = New-Object System.Collections.Generic.List[string]
if (Get-Social 'whatsapp') { $follow.Add("<a href=""https://whatsapp.com/channel/$(Get-Social 'whatsapp')"" rel=""me noopener"">WhatsApp</a>") }
if (Get-Social 'telegram') { $follow.Add("<a href=""https://t.me/$(Get-Social 'telegram')"" rel=""me noopener"">Telegram</a>") }
if (Get-Social 'x') { $follow.Add("<a href=""https://x.com/$(Get-Social 'x')"" rel=""me noopener"">X</a>") }
if (Get-Social 'instagram') { $follow.Add("<a href=""https://www.instagram.com/$(Get-Social 'instagram')/"" rel=""me noopener"">Instagram</a>") }
if (Get-Social 'youtube') { $follow.Add("<a href=""https://www.youtube.com/@$(Get-Social 'youtube')"" rel=""me noopener"">YouTube</a>") }
$followHtml = ''
if ($follow.Count) { $followHtml = '<span class="follow"> &middot; ' + (Esc $T.follow) + ' ' + ($follow -join ' &middot; ') + '</span>' }
$footer = '<footer>The African Street Journal &middot; ' + (Esc $T.footer) + $followHtml + '<script src="' + $BaseUrl + '/info-panel.js?v=146" defer></script></footer>'

# Right-to-left editions (Arabic): the shared stylesheet is written for left-to-right, so
# mirror its few one-sided margins, open the menu the other way, and drop letter-spacing,
# which breaks the joins between Arabic letters.
$rtlCss = ''
$arrow = '&rarr;'
if ([string]$i18n.dir -eq 'rtl') {
  $arrow = '&larr;'
  $rtlCss = '<style>html[dir=rtl] *{letter-spacing:0!important;word-spacing:normal!important}' +
    'html[dir=rtl] body,html[dir=rtl] h1,html[dir=rtl] h2,html[dir=rtl] p,html[dir=rtl] li,html[dir=rtl] .dek,html[dir=rtl] .rel-topic,html[dir=rtl] footer,html[dir=rtl] .src,html[dir=rtl] .meta{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,"Noto Sans Arabic","Noto Naskh Arabic",sans-serif;text-transform:none}' +
    'html[dir=rtl] p,html[dir=rtl] li{line-height:1.8}' +
    'html[dir=rtl] .why b{margin-right:0;margin-left:8px}html[dir=rtl] .src a{margin-right:0;margin-left:14px}' +
    'html[dir=rtl] ul{padding-left:0;padding-right:20px}html[dir=rtl] .related ul{padding-right:0}' +
    'html[dir=rtl] .asj-info--right .asj-info-menu{right:auto;left:0}html[dir=rtl] .brand-lockup{direction:ltr;unicode-bidi:isolate}' +
    'html[dir=rtl] .asj-info-menu{text-align:right!important}html[dir=rtl] .asj-info .asj-info-menu>.asj-report::before{left:-200%;right:0}' +
    'html[dir=rtl] .asj-info .asj-info-menu>a{text-align:right!important}html[dir=rtl] .asj-info .asj-info-menu .asj-follow span{margin-right:0;margin-left:auto}' +
    'html[dir=rtl] .asj-info .asj-info-menu>.asj-follow,html[dir=rtl] .asj-info .asj-info-menu>.asj-langs{padding:8px 10px 0 2px!important}</style>'
}
# A script the shared fonts lack (Amharic's Ge'ez): name the system fonts that have it.
if ($i18n.font) {
  $rtlCss += '<style>body,h1,h2,p,li,.dek,.meta,.rel-topic,.why,footer,.asj-fb button,.asj-fb textarea{font-family:' + [string]$i18n.font + '!important;letter-spacing:0!important;text-transform:none!important}</style>'
}

# A language for one region's readers (Hausa, Somali...) covers only its "scope"
# countries: their country pages, and only those in the country list.
$scope = @($i18n.scope | Where-Object { $_ })

# Under each story, readers say how the translation reads. The box is plain HTML;
# info-panel.js turns the choice and the note into an email to the desk.
function Get-FeedbackBox([string]$url, [string]$enUrl, [string]$headline) {
  if (-not $T.fbSend) { return '' }
  $opts = @(@('Good', $T.fbGood), @('Small fixes', $T.fbFix), @('Wrong meaning', $T.fbWrong) | ForEach-Object { "<button type=""button"" data-v=""$($_[0])"" aria-pressed=""false"">$(Esc $_[1])</button>" }) -join ''
  return "<section class=""asj-fb"" data-lang=""$Lang"" data-langname=""$(Esc $i18n.englishName)"" data-url=""$url"" data-en=""$enUrl"" data-thanks=""$(Esc $T.fbThanks)"" aria-label=""$(Esc $T.fbTitle)""><h2 class=""section-label"">$(Esc $T.fbTitle)</h2><div class=""asj-fb-opts"" role=""group"">$opts</div><label for=""asj-fb-note"">$(Esc $T.fbNote)</label><textarea id=""asj-fb-note"" rows=""3""></textarea><button type=""button"" class=""asj-fb-send"" disabled>$(Esc $T.fbSend)</button><p class=""asj-fb-status"" role=""status"" aria-live=""polite""></p></section>"
}

$headCommon = @"
<meta name="theme-color" content="#131313">
<script>(function(){var t;try{t=localStorage.getItem('asj:theme')}catch(e){}if(t!=='light'&&t!=='dark')t='light';document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name="theme-color"]');if(m&&t==='light')m.setAttribute('content','#f5f2eb')})()</script>
<script>
function asjAnalytics(){var c=window.ASJ_ANALYTICS;if(!c)return;
if(navigator.doNotTrack==='1'||window.doNotTrack==='1')return;var s;
try{var q=location.search;if(/[?&]notrack=1(&|$)/.test(q))localStorage.setItem('asj-notrack','1');else if(/[?&]notrack=0(&|$)/.test(q))localStorage.removeItem('asj-notrack');if(localStorage.getItem('asj-notrack')==='1')return;}catch(e){}
if(c.goatcounter){s=document.createElement('script');s.async=true;s.src='https://gc.zgo.at/count.js';
s.setAttribute('data-goatcounter','https://'+c.goatcounter+'.goatcounter.com/count');document.head.appendChild(s);}
if(c.cloudflare){s=document.createElement('script');s.defer=true;s.src='https://static.cloudflareinsights.com/beacon.min.js';
s.setAttribute('data-cf-beacon',JSON.stringify({token:c.cloudflare}));document.head.appendChild(s);}}
</script>
<script src="/data/analytics-config.js" async onload="asjAnalytics()" onerror="window.ASJ_ANALYTICS=null"></script>
<script>(function(){var c=navigator.connection;if(c&&(c.saveData||/^(slow-2g|2g|3g)$/.test(String(c.effectiveType||''))))return;var h=document.head,p=document.createElement('link');p.rel='preconnect';p.href='https://fonts.gstatic.com';p.crossOrigin='';h.appendChild(p);var l=document.createElement('link');l.rel='stylesheet';l.media='print';l.onload=function(){this.media='all';this.onload=null};l.href='https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400;1,700&display=swap';h.appendChild(l)})()</script>
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400;1,700&display=swap"></noscript>
<link rel="stylesheet" href="$BaseUrl/static-pages.css?v=74">
$rtlCss
<link rel="icon" href="$BaseUrl/favicon.ico" sizes="32x32"><link rel="icon" href="$BaseUrl/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="$BaseUrl/apple-touch-icon.png">
"@

function Get-Masthead([string]$crumbHtml, [string]$englishUrl) {
  $menu = "<a href=""$BaseUrl/$seg/"">$(Esc $T.edition)</a><a href=""$BaseUrl/$seg/#all-countries"">$(Esc $T.menuCountries)</a><a href=""$englishUrl"" hreflang=""en"" lang=""en"">$(Esc $T.menuEnglish)</a><a href=""$BaseUrl/markets/"">$(Esc $T.menuMarkets)</a><a href=""$BaseUrl/about/"">$(Esc $T.menuAbout)</a><a href=""$BaseUrl/contact/"">$(Esc $T.menuContact)</a><a href=""$BaseUrl/corrections/"">$(Esc $T.menuCorrections)</a><a href=""$BaseUrl/privacy/"">$(Esc $T.menuPrivacy)</a>"
  return "<header class=""masthead""><a class=""brand-lockup"" href=""$BaseUrl/$seg/""><em>The</em> African Street <b>Journal</b></a>$crumbHtml<details class=""asj-info asj-info--right""><summary>$(Esc $T.menu)</summary><div class=""asj-info-menu"">$menu</div></details></header>"
}

# --- the edition's stories: translations joined to their English originals ----------
$english = @{}
foreach ($prop in $state.byCountry.PSObject.Properties) { foreach ($b in @($prop.Value)) { if ($b.articleId) { $english[[string]$b.articleId] = @{ code = $prop.Name; b = $b } } } }

$pages = [ordered]@{}   # "cc/slug" -> record
if (Test-Path $indexPath) { try { foreach ($r in @((Read-Json $indexPath).pages)) { $pages["$($r.code)/$($r.slug)"] = $r } } catch {} }

$fresh = New-Object System.Collections.Generic.List[object]
foreach ($p in $store.stories.PSObject.Properties) {
  $en = $english[$p.Name]
  if (-not $en) { continue }
  $b = $en.b; $fr = $p.Value; $code = $en.code
  if (-not (Test-StoryIsRenderable $b)) { continue }
  $slug = Get-StorySlug ([string]$b.headline) ([string]$b.articleId)
  # Only stories whose English page exists: the French page names it as its original.
  if (-not (Test-Path (Join-Path (Join-Path (Join-Path $root $code) $slug) 'index.html'))) { continue }
  $pub = Get-IsoInstant $b.published
  if (-not $pub) { continue }
  $rec = [pscustomobject]@{ code = $code; slug = $slug; id = $p.Name; headline = [string]$fr.headline; dek = [string]$fr.dek; topic = [string]$b.topic
                            published = [string]$pub; frontRank = $b.frontRank; score = $b.selectionScore }
  $fresh.Add([pscustomobject]@{ rec = $rec; b = $b; fr = $fr })
  $pages["$code/$slug"] = $rec
}

# Drop pages past their time, from the list and the disk.
$cut = (Get-Date).ToUniversalTime().AddDays(-$StoryDays)
foreach ($k in @($pages.Keys)) {
  $when = $null; try { $when = [DateTimeOffset]::Parse([string]$pages[$k].published, $inv).UtcDateTime } catch {}
  if (-not $when -or $when -lt $cut) {
    $kp = $k -split '/'
    $dir = Join-Path (Join-Path $langRoot $kp[0]) $kp[1]
    if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
    $pages.Remove($k)
  }
}
$all = @($pages.Values | Sort-Object -Property @{ Expression = { $_.published }; Descending = $true })
$byCountry = @{}
foreach ($r in $all) { if (-not $byCountry.ContainsKey($r.code)) { $byCountry[$r.code] = New-Object System.Collections.Generic.List[object] }; $byCountry[$r.code].Add($r) }

function Get-RelatedList($items, [switch]$CountryLabel) {
  $li = foreach ($r in $items) {
    $label = if ($CountryLabel) { Get-CountryName $r.code } else { Get-Topic $r.topic }
    "<li><a href=""$BaseUrl/$seg/$($r.code)/$($r.slug)/""><span class=""rel-topic"">$(Esc $label)</span>$(Esc $r.headline)</a></li>"
  }
  return "<ul>$($li -join '')</ul>"
}

# --- story pages ---------------------------------------------------------------------
foreach ($f in $fresh) {
  $r = $f.rec; $b = $f.b; $fr = $f.fr
  $country = Get-CountryName $r.code
  $url = "$BaseUrl/$seg/$($r.code)/$($r.slug)/"
  $enUrl = "$BaseUrl/$($r.code)/$($r.slug)/"
  $paras = @($fr.paragraphs | ForEach-Object { "<p>$(Esc ([string]$_))</p>" }) -join "`n"
  $srcs = @($b.sources | Where-Object { $_.url -and $_.name })
  # <bdi>: an English outlet name inside Arabic text keeps its place in the line.
  $srcLinks = @($srcs | ForEach-Object { "<bdi><a href=""$(Esc $_.url)"" rel=""nofollow noopener"" target=""_blank"">$(Esc $_.name)</a></bdi>" })
  $byline = if ($srcLinks.Count -gt 1) { "$(Esc $T.sources) $(($srcLinks[0..($srcLinks.Count - 2)]) -join ', ') $(Esc $T.and) $($srcLinks[-1])" } elseif ($srcLinks.Count) { "$(Esc $T.source) $($srcLinks[0])" } else { '' }
  $words = (($fr.paragraphs -join ' ') -split '\s+').Count
  $mins = [Math]::Max(1, [int][Math]::Round($words / 200.0))
  $day = Format-Day $r.published
  $image = if (Test-Path (Join-Path $root "og\$($r.code).jpg")) { "$BaseUrl/og/$($r.code).jpg" } else { "$BaseUrl/og-image.png" }
  $more = @($byCountry[$r.code] | Where-Object { $_.slug -ne $r.slug } | Select-Object -First 3)
  $latest = @($all | Where-Object { $_.code -ne $r.code } | Select-Object -First 4)
  $ld = [ordered]@{
    '@context' = 'https://schema.org'; '@type' = 'NewsArticle'; headline = $r.headline; description = $r.dek; inLanguage = $Lang
    datePublished = $r.published; url = $url; mainEntityOfPage = $url; image = @($image)
    translationOfWork = @{ '@type' = 'NewsArticle'; '@id' = $enUrl; url = $enUrl; inLanguage = 'en' }
    publisher = [ordered]@{ '@type' = 'NewsMediaOrganization'; name = 'The African Street Journal'; url = "$BaseUrl/"; logo = @{ '@type' = 'ImageObject'; url = "$BaseUrl/icon-512.png" } }
    isAccessibleForFree = $true
  }
  $ldJson = ($ld | ConvertTo-Json -Depth 6 -Compress).Replace('</', '<\/')
  $title = "$($r.headline) | $country | $($T.titleSuffix)"
  $waText = U "$($r.headline) $url"
  $html = @"
<!doctype html>
<html lang="$Lang" dir="$($i18n.dir)">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="max-image-preview:large">
<title>$(Esc $title)</title>
<meta name="description" content="$(Esc $r.dek)">
<link rel="canonical" href="$url">
<meta name="asj-story" content="$($r.id)">
<meta name="asj-published" content="$($r.published)">
<link rel="alternate" hreflang="en" href="$enUrl">
<link rel="alternate" hreflang="$Lang" href="$url">
<link rel="alternate" hreflang="x-default" href="$enUrl">
$headCommon
<meta property="og:site_name" content="The African Street Journal">
<meta property="og:type" content="article">
<meta property="og:locale" content="$($i18n.ogLocale)">
<meta property="og:title" content="$(Esc $r.headline)">
<meta property="og:description" content="$(Esc $r.dek)">
<meta property="og:url" content="$url">
<meta property="og:image" content="$image">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="$(Esc $r.headline)">
<meta name="twitter:description" content="$(Esc $r.dek)">
<meta name="twitter:image" content="$image">
<script type="application/ld+json">$ldJson</script>
</head>
<body>
<a class="skip-link" href="#main">$(Esc $T.skip)</a>
<div class="wrap">
  $(Get-Masthead " <span aria-hidden=""true"">/</span> <a href=""$BaseUrl/$seg/$($r.code)/"">$(Esc $country)</a>" $enUrl)
  <main id="main">
  <article class="story">
  <header class="story-head">
  <div class="meta">$(Esc $country) &middot; $(Esc (Get-Topic $r.topic))</div>
  <h1>$(Esc $r.headline)</h1>
  <p class="dek">$(Esc $r.dek)</p>
  <p class="byline">$byline &middot; <time datetime="$($r.published)">$(Esc $day)</time> &middot; <bdi>$(if ($T.readFormat) { Esc ([string]$T.readFormat).Replace('{n}', [string]$mins) } else { "$mins $(Esc $T.readMin)" })</bdi></p>
  </header>
$paras
<p class="why"><b>$(Esc $T.why)</b>$(Esc ([string]$fr.why))</p>
<p class="meta"><a href="$enUrl" hreflang="en" lang="en">$(Esc $T.readEnglish) $arrow</a> $(Esc $T.note)</p>
$(Get-FeedbackBox $url $enUrl ([string]$b.headline))
  <div class="share-after">
  <p class="share-label">$(Esc $T.share)</p>
  <div class="share" data-url="$url" data-title="$(Esc $r.headline)">
    <a class="share-wa" href="https://wa.me/?text=$waText" target="_blank" rel="noopener">WhatsApp</a>
    <a href="https://x.com/intent/post?text=$(U $r.headline)&amp;url=$(U $url)&amp;via=thestreetafrica" target="_blank" rel="noopener">X</a>
    <a href="https://t.me/share/url?url=$(U $url)&amp;text=$(U $r.headline)" target="_blank" rel="noopener">Telegram</a>
    <button type="button" class="share-copy">$(Esc $T.copy)</button>
    <button type="button" class="share-native" hidden>$(Esc $T.shareNative)</button>
    <span class="share-status" role="status" aria-live="polite"></span>
  </div>
  </div>
  $(if ($srcLinks.Count) { "<h2 class=""section-label"">$(Esc $T.sourcesTitle)</h2>`n<div class=""src"">$($srcLinks -join '')</div>" })
  </article>
  <nav class="related" aria-label="$(Esc (Fill $T.moreFrom $country))">
    $(if ($more.Count) { "<h2 class=""section-label"">$(Esc (Fill $T.moreFrom $country))</h2>$(Get-RelatedList $more)" })
    $(if ($latest.Count) { "<h2 class=""section-label"">$(Esc $T.latest)</h2>$(Get-RelatedList $latest -CountryLabel)" })
    <p><a class="open" href="$BaseUrl/$seg/$($r.code)/">$(Esc (Fill $T.allCountry $country)) $arrow</a></p>
  </nav>
  </main>
  $footer
</div>
<script>window.ASJ_STORY_KIT=true</script>
<script src="$BaseUrl/share.js" defer></script>
</body>
</html>
"@
  Write-Page (Join-Path (Join-Path (Join-Path $langRoot $r.code) $r.slug) 'index.html') $html
}

# --- country pages -------------------------------------------------------------------
function Get-ListPage([string]$title, [string]$dek, [string]$url, [string]$enUrl, [string]$crumb, [string]$bodyHtml) {
  return @"
<!doctype html>
<html lang="$Lang" dir="$($i18n.dir)">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>$(Esc $title) | $(Esc $T.titleSuffix)</title>
<meta name="description" content="$(Esc $dek)">
<link rel="canonical" href="$url">
<link rel="alternate" hreflang="en" href="$enUrl">
<link rel="alternate" hreflang="$Lang" href="$url">
<link rel="alternate" hreflang="x-default" href="$enUrl">
$headCommon
<meta property="og:site_name" content="The African Street Journal">
<meta property="og:type" content="website">
<meta property="og:locale" content="$($i18n.ogLocale)">
<meta property="og:title" content="$(Esc $title)">
<meta property="og:description" content="$(Esc $dek)">
<meta property="og:url" content="$url">
<meta property="og:image" content="$BaseUrl/og-image.png">
</head>
<body>
<div class="wrap">
  $(Get-Masthead $crumb $enUrl)
  <main id="main">
  <h1>$(Esc $title)</h1>
  <p class="dek">$(Esc $dek)</p>
$bodyHtml
  </main>
  $footer
</div>
</body>
</html>
"@
}
function Get-StoryList($items, [switch]$CountryLabel) {
  $li = foreach ($r in $items) {
    $label = if ($CountryLabel) { Get-CountryName $r.code } else { Get-Topic $r.topic }
    "<li><a href=""$BaseUrl/$seg/$($r.code)/$($r.slug)/""><span class=""rel-topic"">$(Esc $label) &middot; $(Esc (Format-Day $r.published))</span>$(Esc $r.headline)</a></li>"
  }
  return "<nav class=""related""><ul>$($li -join '')</ul></nav>"
}

$codes = @($state.byCountry.PSObject.Properties.Name | Where-Object { -not $scope.Count -or $scope -contains $_ } | Sort-Object { Get-CountryName $_ })
foreach ($code in $codes) {
  $country = Get-CountryName $code
  $items = if ($byCountry.ContainsKey($code)) { @($byCountry[$code] | Select-Object -First 60) } else { @() }
  $body = if ($items.Count) { Get-StoryList $items } else { "<p>$(Esc $T.countryEmpty)</p>" }
  Write-Page (Join-Path (Join-Path $langRoot $code) 'index.html') (Get-ListPage (Fill $T.countryTitle $country) (Fill $T.countryDek $country) "$BaseUrl/$seg/$code/" "$BaseUrl/$code/" " <span aria-hidden=""true"">/</span> <a href=""$BaseUrl/$seg/$code/"">$(Esc $country)</a>" $body)
}

# --- the edition's front page --------------------------------------------------------
# Today's front-page stories first (the English desk's own order), then the newest.
$newest = if ($all.Count) { $all[0].published.Substring(0, 10) } else { '' }
$lead = @($all | Where-Object { $_.frontRank -and $_.published.StartsWith($newest) } | Sort-Object { [int]$_.frontRank })
$rest = @($all | Where-Object { $lead -notcontains $_ } | Select-Object -First ([Math]::Max(0, 60 - $lead.Count)))
$countryLinks = @($codes | ForEach-Object { "<li><a href=""$BaseUrl/$seg/$_/"">$(Esc (Get-CountryName $_))</a></li>" }) -join ''
$homeBody = "<h2 class=""section-label"">$(Esc $T.homeLatest)</h2>$(Get-StoryList (@($lead) + @($rest)) -CountryLabel)<h2 class=""section-label"" id=""all-countries"">$(Esc $T.homeCountries)</h2><nav class=""related""><ul class=""cols"">$countryLinks</ul></nav>"
Write-Page (Join-Path $langRoot 'index.html') (Get-ListPage $T.homeTitle $T.homeDek "$BaseUrl/$seg/" "$BaseUrl/" '' $homeBody)

# --- sitemap with hreflang pairs, and the page list --------------------------------
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
[void]$sb.AppendLine('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">')
function Add-Url([string]$loc, [string]$en, [string]$mod) {
  [void]$sb.AppendLine("  <url><loc>$loc</loc>$(if ($mod) { "<lastmod>$mod</lastmod>" })<xhtml:link rel=""alternate"" hreflang=""$Lang"" href=""$loc""/><xhtml:link rel=""alternate"" hreflang=""en"" href=""$en""/></url>")
}
Add-Url "$BaseUrl/$seg/" "$BaseUrl/" ''
foreach ($code in $codes) { Add-Url "$BaseUrl/$seg/$code/" "$BaseUrl/$code/" '' }
foreach ($r in $all) { Add-Url "$BaseUrl/$seg/$($r.code)/$($r.slug)/" "$BaseUrl/$($r.code)/$($r.slug)/" ($r.published.Substring(0, 10)) }
[void]$sb.AppendLine('</urlset>')
Write-Page (Join-Path $langRoot 'sitemap.xml') $sb.ToString()

[IO.File]::WriteAllText($indexPath, (ConvertTo-Json -InputObject ([ordered]@{ generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ', $inv); pages = @($all) }) -Depth 4 -Compress), $utf8)
Write-Host "[$Lang] $($fresh.Count) story pages written, $($all.Count) in the edition, $($codes.Count) country pages"
exit 0
