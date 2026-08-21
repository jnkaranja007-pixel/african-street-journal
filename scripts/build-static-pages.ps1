#Requires -Version 5.1
<#
.SYNOPSIS
  Generate a crawlable HTML page per country, plus sitemap.xml and robots.txt.
.DESCRIPTION
  The app routes on hash fragments (#/ke). Search engines discard everything after
  the '#', so the entire journal is one URL to a crawler, and that URL is a near-empty
  shell because all content renders client-side from JS. Every country is invisible.

  This writes a real page per country at /<iso>/ containing the actual brief text as
  HTML, with its own title, description and canonical link. Crawlers get text; readers
  get a link through to the interactive dossier. The app itself is untouched.

  Re-run after every desk run so the static pages track the briefs.
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
  [string]$BaseUrl = 'https://africanstreetjournal.com'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
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
$raw = [IO.File]::ReadAllText((Join-Path $root 'data\briefs.js'))
$m = [regex]::Match($raw, 'byCountry:\s*(\{[\s\S]*?\}),\s*markets:')
if (-not $m.Success) { Write-Host '[static] cannot read byCountry' -ForegroundColor Red; exit 1 }
$byCountry = $m.Groups[1].Value | ConvertFrom-Json
$dm = [regex]::Match($raw, 'dates:\s*(\{[\s\S]*?\}),\s*byCountry:')
$dates = if ($dm.Success) { $dm.Groups[1].Value | ConvertFrom-Json } else { $null }

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
h1{font:700 clamp(34px,7vw,56px)/1 Georgia,'Times New Roman',serif;margin:34px 0 10px;letter-spacing:-.02em}
.meta{font:700 11px/1.7 ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:#8a847b;margin-bottom:8px}
.open{display:inline-block;margin:18px 0 6px;font:700 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;border-bottom:1px solid #4caf50;padding-bottom:5px}
article{padding:26px 0;border-bottom:1px solid #232323}
h2{font:600 clamp(20px,3.2vw,26px)/1.25 Georgia,'Times New Roman',serif;margin:0 0 12px;color:#f2f0ed}
.kicker{font:700 10px/1 ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:#66bb6a;margin-bottom:9px}
p{margin:0 0 12px;color:#c9c5c0}
.why{color:#8a847b;font-size:14.5px}
.why b{color:#e8e6e3;font-weight:600;margin-right:8px}
.src{font:700 10px/1.9 ui-monospace,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase}
.src a{margin-right:14px;text-decoration:none;border-bottom:1px solid #2f5c33}
footer{margin-top:44px;font:700 10px/1.9 ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:#66615b}
.morenav{margin-top:34px;padding-top:20px;border-top:1px solid #232323}
.morenav h2{font:700 10px/1 ui-monospace,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:#8a847b;margin:0 0 12px}
.morenav a{display:inline-block;margin:0 14px 7px 0;font:400 13px/1.5 Georgia,'Times New Roman',serif;color:#9a958e;text-decoration:none;border-bottom:1px solid transparent}
.morenav a:hover{color:#66bb6a;border-bottom-color:#2f5c33}
'@

$built = 0
$urls = New-Object System.Collections.Generic.List[string]
$urls.Add($BaseUrl + '/')

# Which countries will actually get a page. Needed up front so every page can link to
# every other one: without this the pages are orphaned, reachable only through
# sitemap.xml. Internal links are how a crawler understands the set is one publication
# rather than 55 unrelated documents, and these pages are the only version of the
# journal a search engine can read at all.
$pageCodes = New-Object System.Collections.Generic.List[string]
foreach ($prop in $byCountry.PSObject.Properties) {
  if (-not @($prop.Value | Where-Object { $_.headline -and $_.body }).Count) { continue }
  if (-not $info[$prop.Name]) { continue }
  $pageCodes.Add($prop.Name)
}
$navLinks = New-Object System.Text.StringBuilder
foreach ($c in ($pageCodes | Sort-Object { $info[$_].name })) {
  [void]$navLinks.Append("<a href=""$BaseUrl/$c/"">$(Esc $info[$c].name)</a>")
}

foreach ($prop in $byCountry.PSObject.Properties) {
  $code = $prop.Name
  $briefs = @($prop.Value | Where-Object { $_.headline -and $_.body })
  if (-not $briefs.Count) { continue }
  $meta = $info[$code]
  if (-not $meta) { continue }

  $name = $meta.name
  $when = if ($dates -and $dates.PSObject.Properties[$code]) { ([string]$dates.$code).Substring(0,10) } else { '' }
  $lead = ([string]$briefs[0].headline)
  $desc = "$name news: $lead. Sourced daily briefs, market data and country profile from The African Street Journal."
  if ($desc.Length -gt 300) { $desc = $desc.Substring(0,297) + '...' }

  $body = New-Object System.Text.StringBuilder
  foreach ($b in $briefs) {
    [void]$body.Append("<article>`n")
    [void]$body.Append("<div class=""kicker"">$(Esc $b.topic)$(if($when){" &middot; $when"})</div>`n")
    [void]$body.Append("<h2>$(Esc $b.headline)</h2>`n")
    [void]$body.Append("<p>$(Esc $b.body)</p>`n")
    if ($b.why) { [void]$body.Append("<p class=""why""><b>Why it matters</b>$(Esc $b.why)</p>`n") }
    $srcs = @($b.sources | Where-Object { $_ -and $_.url -and $_.url -match '^https?://' })
    if ($srcs.Count) {
      [void]$body.Append('<div class="src">')
      foreach ($s in $srcs) { [void]$body.Append("<a href=""$(Esc $s.url)"" rel=""nofollow noopener"" target=""_blank"">$(Esc $s.name)</a>") }
      [void]$body.Append("</div>`n")
    }
    [void]$body.Append("</article>`n")
  }

  $canonical = "$BaseUrl/$code/"
  # Google shows roughly 60 characters of a title. "Central African Republic news and
  # country file | The African Street Journal" is 75, so the masthead - the part that
  # builds recognition in a results page - was the half being cut. Long names drop the
  # "and country file" clause and keep the brand.
  $titleText = if ($name.Length -gt 10) { "$name news | The African Street Journal" }
               else { "$name news and country file | The African Street Journal" }

  # Structured data. Deliberately a CollectionPage listing headlines rather than a set of
  # NewsArticle objects: we did not write those articles, and marking them up as ours
  # would be a false authorship claim to every crawler that reads it.
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
  foreach ($b in $briefs) {
    if ($li -gt 0) { [void]$ld.Append(',') }
    $li++
    [void]$ld.Append("{""@type"":""ListItem"",""position"":$li,""name"":""$(JsonEsc $b.headline)""}")
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
<meta property="og:site_name" content="The African Street Journal">
<meta property="og:title" content="$(Esc $name) news and country file">
<meta property="og:description" content="$(Esc $desc)">
<meta property="og:type" content="article">
<meta property="og:url" content="$canonical">
<meta property="og:image" content="$BaseUrl/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="$BaseUrl/og-image.png">
<script type="application/ld+json">$($ld.ToString())</script>
<style>$css</style>
</head>
<body>
<div class="wrap">
<div class="masthead"><a href="$BaseUrl/">The African Street Journal</a></div>
<div class="meta">$(Esc $meta.region)$(if($meta.capital){" &middot; Capital $(Esc $meta.capital)"})</div>
<h1>$(Esc $name)</h1>
<div class="meta">$($briefs.Count) briefs$(if($when){" &middot; updated $when"})</div>
<a class="open" href="$BaseUrl/#/$code">Open the interactive $(Esc $name) dossier &rarr;</a>
$($body.ToString())
<nav class="morenav">
<h2>The rest of the continent</h2>
$($navLinks.ToString())
</nav>
<footer>The African Street Journal &middot; from the streets, for the streets<br>Every brief carries its sources. Figures are labelled with their origin and date.</footer>
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

# --- sitemap ----------------------------------------------------------------
$today = (Get-Date).ToString('yyyy-MM-dd')
$sm = New-Object System.Text.StringBuilder
[void]$sm.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
[void]$sm.AppendLine('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
foreach ($u in $urls) {
  [void]$sm.AppendLine("  <url><loc>$u</loc><lastmod>$today</lastmod><changefreq>daily</changefreq></url>")
}
[void]$sm.AppendLine('</urlset>')
[IO.File]::WriteAllText((Join-Path $root 'sitemap.xml'), $sm.ToString(), (New-Object Text.UTF8Encoding($false)))

# --- robots -----------------------------------------------------------------
$robots = "User-agent: *`nAllow: /`n`nSitemap: $BaseUrl/sitemap.xml`n"
[IO.File]::WriteAllText((Join-Path $root 'robots.txt'), $robots, (New-Object Text.UTF8Encoding($false)))

Write-Host "[static] built $built country pages, sitemap with $($urls.Count) URLs, robots.txt" -ForegroundColor Green
Write-Host "[static] base URL: $BaseUrl" -ForegroundColor DarkGray
