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
  # How long a story keeps a page of its own, from the date the page was published.
  # Past this it is swept and 404.html lands the reader on the country rather than a
  # dead end. 90 days, not 7: Google sends readers searching the names in a story for
  # weeks after it ran ("simon akpo", "gabon platform" in Search Console, Nov 2026).
  [int]$StoryDays = 90
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

# Get-IsoDay lives here so the page builder, the merge and the publication gate all
# read a date stamp the same way. See the note in story-shape.ps1.
. (Join-Path $PSScriptRoot 'story-shape.ps1')   # Get-IsoDay, Get-StorySlug, Import-PublishedEdition
. (Join-Path $PSScriptRoot 'share-image.ps1')   # New-StoryShareImage
. (Join-Path $PSScriptRoot 'news-ranking.ps1')  # Get-NewsDeskTerms, Get-StoryPlaceIssue
$placeRegistry = [IO.File]::ReadAllText((Join-Path $root 'data\sources.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
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

# The same two rules as app.js (shownTopic, whyRestates): "News" is the catch-all topic,
# not a section, so it is not printed; a "why" that says the headline and dek again is
# not printed either (Test-WhyRestatesDek, story-shape.ps1).
function Get-ShownTopic($Topic) {
  $t = [string]$Topic
  if ($t -and $t -ne 'News') { return $t }
  return ''
}
function Test-ShowWhy($Brief) {
  return ([bool]$Brief.why -and -not (Test-WhyRestatesDek $Brief))
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
/* readability-v1: BDA style guide - sans body, no caps tracking, calm spacing */
.page p,.page li{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:18px;line-height:1.6;letter-spacing:.01em;word-spacing:.06em;max-width:65ch}
.story-head h1{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-weight:700;font-size:clamp(28px,5.4vw,42px);line-height:1.2;letter-spacing:-.005em}
.story-head .dek{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:19px;line-height:1.5;color:#d6d2cc}
.story p{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:18px;line-height:1.65;color:#dcd8d2;letter-spacing:.01em;word-spacing:.06em;max-width:65ch;margin:0 0 1.1em}
.byline{font:15px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:0;color:#b4aea6}
.share a,.share button{min-height:44px;font:600 15px/1 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:0;text-transform:none;border-radius:8px}
.section-label{font:700 15px/1.3 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:0;text-transform:none;color:#cfcac3}
.related li a{font:600 17px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;padding:14px 0}
.rel-topic{font:500 13px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:0;text-transform:none}
.why{font-style:normal}
/* readability-v2 */
.story-head .meta,.page>.meta,.masthead,.masthead a,.asj-info,.asj-info>summary,.asj-info-menu a,.asj-info-menu a:visited,.kicker,.story-head .kicker,.topic{text-transform:none!important;letter-spacing:0!important;font-family:system-ui,-apple-system,'Segoe UI',sans-serif!important;font-size:14px!important}
.asj-info-menu a{font-size:15px!important;font-weight:500!important}
/* readability-v3: the same type system as the app, on every generated page.
   Playfair is for a page's own title - the country name, the story headline, which is
   how the same story looks in the app's reader. Headlines in a list are sans, as on the
   app's country page and Wire. Labels, sources and links are 14px sans with no caps
   tracking; v2 reached the story pages but country pages still set them in 10-11px
   monospace capitals. */
.meta,.open,.src,.read,footer,.morenav h2{font-family:system-ui,-apple-system,'Segoe UI',sans-serif!important;letter-spacing:0!important;text-transform:none!important}
.meta{font-size:14px!important;font-weight:400!important;color:#a8a39d}
.meta a{color:inherit;text-decoration:none;border-bottom:1px solid #3a3733}
.meta a:hover{color:#f3efe8;border-bottom-color:#f3efe8}
.open{font-size:15px!important;font-weight:600!important;margin:18px 0 10px!important}
.src{font-size:14px!important;font-weight:500!important;line-height:1.8!important}
.read{font-size:15px!important;font-weight:600!important}
footer{font-size:13px!important;font-weight:400!important;line-height:1.8!important;color:#8a847b}
.morenav h2{font-size:15px!important;font-weight:650!important;color:#cfcac3}
.morenav a{font:400 15px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif!important}
article h2{font:650 clamp(20px,2.6vw,24px)/1.3 system-ui,-apple-system,'Segoe UI',sans-serif!important}
.story-head h1{font:700 clamp(30px,5.6vw,46px)/1.12 'Playfair Display',Georgia,'Times New Roman',serif!important;letter-spacing:0!important}
.related li a{font:650 17px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif!important}
.hub-intro{color:#a8a39d!important}
.country-hub{list-style:none;padding:0!important;margin:24px 0 0}
.country-hub li{display:flex;flex-direction:column;gap:4px;padding:14px 0;border-bottom:1px solid #2a2a2a;max-width:none!important}
.country-hub .hub-country{font:600 14px/1.3 system-ui,-apple-system,'Segoe UI',sans-serif;color:#8f8a83;text-decoration:none}
.country-hub .hub-story{font:650 17px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;color:#e8e6e3;text-decoration:none}
.country-hub span.hub-story{font-weight:400;color:#8f8a83}
.country-hub a:hover,.country-hub a:focus-visible{color:#66bb6a}
.hub-note{margin-top:28px;color:#a8a39d!important}
.page code{font:14px/1.4 ui-monospace,Consolas,monospace;color:#e8e6e3;word-break:break-all}
'@
# Trust-page links, appended to every generated footer.
$siteLinks = '<script src="'+$BaseUrl+'/info-panel.js?v=67" defer></script>'
# The paper's social accounts (data/social-config.js): a Follow line in every footer
# once a handle is set, and sameAs on the publisher so search engines tie them to it.
$socialTelegram = ''; $socialBluesky = ''
$socialPath = Join-Path $root 'data\social-config.js'
if (Test-Path $socialPath) {
  $socialJs = [IO.File]::ReadAllText($socialPath)
  $mt = [regex]::Match($socialJs, "telegram:\s*'([A-Za-z0-9_]{5,32})'")
  $mb = [regex]::Match($socialJs, "bluesky:\s*'([A-Za-z0-9.-]{3,253})'")
  if ($mt.Success) { $socialTelegram = "https://t.me/$($mt.Groups[1].Value)" }
  if ($mb.Success) { $socialBluesky = "https://bsky.app/profile/$($mb.Groups[1].Value)" }
}
$followParts = @()
if ($socialTelegram) { $followParts += "<a href=""$socialTelegram"" rel=""me noopener"">Telegram</a>" }
if ($socialBluesky) { $followParts += "<a href=""$socialBluesky"" rel=""me noopener"">Bluesky</a>" }
if ($followParts.Count) { $siteLinks = "<span class=""follow""> &middot; Follow on $($followParts -join ' &middot; ')</span>" + $siteLinks }
$sameAs = @(@($socialTelegram, $socialBluesky) | Where-Object { $_ } | ForEach-Object { '"' + $_ + '"' }) -join ','
$sameAsLd = if ($sameAs) { ',"sameAs":[' + $sameAs + ']' } else { '' }
# Five entries: "Email us" repeated Contact (whose first line is the address), and RSS
# opened a raw XML file - it is explained on About and the text-only edition instead.
$infoMenu = '<details class="asj-info asj-info--right"><summary>About</summary><div class="asj-info-menu"><a href="'+$BaseUrl+'/countries/">Text-only edition</a><a href="'+$BaseUrl+'/topics/">Topics</a><a href="'+$BaseUrl+'/about/">About</a><a href="'+$BaseUrl+'/contact/">Contact</a><a href="'+$BaseUrl+'/corrections/">Corrections</a><a href="'+$BaseUrl+'/privacy/">Privacy</a></div></details>'


# Same analytics loader as index.html. These pages are where search traffic lands, so
# leaving them unmeasured would report the site as quieter than it is and hide which
# countries people actually arrive for. Literal here-string: nothing in it is expanded.
# The config file loads async and the loader runs when it arrives: as a plain script in
# <head> it held the first paint of every page for one round trip (~170 ms on Nov 2026
# measurements) to fetch a few bytes that nothing on the page needs to draw.
$analytics = @'
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

# --- story pages already on disk ----------------------------------------------
# A story page is kept for -StoryDays after the date the page itself carries
# (datePublished in its JSON-LD). The sweep used to go by the file's timestamp, and every
# desk run starts from a fresh checkout, so every file looked new and no page was ever
# swept - while the kept pages were orphaned: in no sitemap, linked from nowhere, and
# dropping out of Google's index. Each kept page now goes in sitemap.xml and on its
# country page's "Earlier stories" list.
$storyCutoff = (Get-Date).ToUniversalTime().AddDays(-$StoryDays)
function ConvertTo-UtcStamp([string]$Value) {
  if (-not $Value) { return $null }
  try { return [DateTimeOffset]::Parse($Value, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime } catch { return $null }
}
function Read-StoryPageHead([string]$Path) {
  # The first 16 KB hold the JSON-LD (datePublished, about 4 KB in) and the <h1> (6-7 KB;
  # a long citation list pushes it further).
  # A moved page (see Write-MovedStoryPage) carries its date in a meta tag instead.
  $fs = [IO.File]::OpenRead($Path)
  try { $buf = New-Object byte[] 16384; $n = $fs.Read($buf, 0, $buf.Length) } finally { $fs.Dispose() }
  $text = [Text.Encoding]::UTF8.GetString($buf, 0, $n)
  $d = [regex]::Match($text, '"datePublished":"([^"]+)"|<meta name="asj-published" content="([^"]+)"')
  $h = [regex]::Match($text, '<h1>([^<]*)</h1>')
  $mv = [regex]::Match($text, '<meta http-equiv="refresh" content="0; url=([^"]+)"')
  $id = [regex]::Match($text, '<meta name="asj-story" content="([0-9a-f]+)"')
  # The line above the headline: the story's topic, or its country when the topic is
  # plain "News". A link to the topic page since Nov 2026.
  $k = [regex]::Match($text, '<div class="meta">(?:<a [^>]*>)?([^<]*)(?:</a>)?</div>\s*<h1>')
  # The dek and opening paragraph, for the place check (Get-StoryPlaceIssue). The opening
  # is the first plain <p> after the headline, in pages with a share bar and older ones.
  $dk = [regex]::Match($text, '<p class="dek">([^<]*)</p>')
  $op = [regex]::Match($text, '<h1>.*?</h1>.*?<p>(.*?)</p>', 'Singleline')
  $when = $null
  if ($d.Success) { $when = ConvertTo-UtcStamp ($d.Groups[1].Value + $d.Groups[2].Value) }
  return [pscustomobject]@{ When = $when; Headline = [Net.WebUtility]::HtmlDecode($h.Groups[1].Value)
                            MovedTo = $(if ($mv.Success) { $mv.Groups[1].Value } else { '' })
                            StoryId = $(if ($id.Success) { $id.Groups[1].Value } else { '' })
                            Kicker = [Net.WebUtility]::HtmlDecode($k.Groups[1].Value)
                            Dek = [Net.WebUtility]::HtmlDecode($dk.Groups[1].Value)
                            Opening = [Net.WebUtility]::HtmlDecode(([regex]::Replace($op.Groups[1].Value, '<[^>]+>', ''))) }
}
function Get-TopicSlug([string]$Topic) { return ([regex]::Replace($Topic.ToLowerInvariant(), '[^a-z0-9]+', '-')).Trim('-') }
# The topic in that line, or nothing when it names a country. Pages from September carry
# "Business &middot; 2026-09-06" and show the catch-all "News" that later pages hide.
$countryNames = @{}
foreach ($v in $info.Values) { $countryNames[[string]$v.name] = $true }
function Get-PageTopic([string]$Kicker) {
  $t = $Kicker.Split([char]0x00B7)[0].Trim()
  if (-not $t -or $countryNames.ContainsKey($t)) { return '' }
  return [string](Get-ShownTopic $t)
}
# One story, one page. The desk rewrites a headline between editions, and the address
# is made from the headline, so each rewrite used to leave another full page behind:
# 190 stories had two to six pages on 3 Nov 2026, all in the sitemap and in the
# "Earlier stories" lists ("Burundi farmers face fertilizer shortage" and "...
# shortages"). The article id identifies the story - not the publish stamp, which 14
# of those stories changed between rewrites. Pages carry it in <meta name="asj-story">;
# pages built before that carry it only in their "Read in ASJ" link, further down.
function Get-StoryIdFromPage([string]$Path) {
  $m = [regex]::Match([IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8), 'story=id%3A([0-9a-f]+)')
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}
# The page left at an old address: a redirect to the story's current page, so links
# and search results that point at it still arrive, and no second copy is indexed.
function Write-MovedStoryPage($Page, [string]$Target) {
  $stamp = $Page.when.ToString('yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture)
  $title = if ($Page.headline) { Esc $Page.headline } else { 'Story moved' }
  $html = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>$title - The African Street Journal</title>
<link rel="canonical" href="$Target">
<meta http-equiv="refresh" content="0; url=$Target">
<meta name="asj-story" content="$($Page.storyId)">
<meta name="asj-published" content="$stamp">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
<p>This story is now at <a href="$Target">$Target</a>.</p>
</body>
</html>
"@
  [IO.File]::WriteAllText((Join-Path $Page.dir 'index.html'), $html, (New-Object Text.UTF8Encoding($false)))
  $share = Join-Path $Page.dir 'share.jpg'
  if (Test-Path $share) { Remove-Item -LiteralPath $share -Force }
}
# Newest first, at most $Max, leaving out a story told again under a near-identical
# headline (the same event in two editions: "Taita Taveta targets US$4.3M potato
# industry growth" and "... US$4.3 million ..."). Near-identical: three in four of the
# headline's words (three letters or more) shared.
function Select-DistinctStories($Items, [int]$Max) {
  $kept = New-Object System.Collections.Generic.List[object]
  $seen = New-Object System.Collections.Generic.List[object]
  foreach ($it in ($Items | ForEach-Object { $_ })) {
    $words = @{}
    foreach ($w in [regex]::Matches(([string]$it.headline).ToLowerInvariant(), '[\p{L}]{3,}')) { $words[$w.Value] = $true }
    $dup = $false
    foreach ($s in $seen) {
      $shared = 0
      foreach ($k in $words.get_Keys()) { if ($s.ContainsKey($k)) { $shared++ } }
      $union = $words.get_Count() + $s.get_Count() - $shared
      if ($union -gt 0 -and ($shared / [double]$union) -ge 0.75) { $dup = $true; break }
    }
    if ($dup) { continue }
    $seen.Add($words)
    $kept.Add($it)
    if ($kept.Count -ge $Max) { break }
  }
  return $kept.ToArray()
}

$pagesOnDisk = New-Object System.Collections.Generic.List[object]
# A kept page whose story is about another country is taken down, by the same rule the
# desk now applies before publishing (Get-StoryPlaceIssue): before 4 Nov 2026 such
# stories stayed on their country's "Earlier stories" list for 90 days (Paris v
# Barcelona on Burundi's, a Lisbon protest on Namibia's, South Sudan on Sudan's).
$withdrawn = 0
foreach ($c in $pageCodes) {
  $cDir = Join-Path $root $c
  if (-not (Test-Path $cDir)) { continue }
  $placeDesk = $null
  foreach ($sub in Get-ChildItem -Path $cDir -Directory -ErrorAction SilentlyContinue) {
    $page = Join-Path $sub.FullName 'index.html'
    if (-not (Test-Path $page)) { continue }
    $head = Read-StoryPageHead $page
    if ($head.Headline -and -not $head.MovedTo -and $placeRegistry.$c) {
      if (-not $placeDesk) { $placeDesk = Get-NewsDeskTerms $placeRegistry $c $root }
      $placeIssue = Get-StoryPlaceIssue ([pscustomobject]@{ headline = $head.Headline; dek = $head.Dek; paragraphs = @($head.Opening) }) $placeDesk
      if ($placeIssue -and -not $head.Opening) {
        # A long citation list can push the opening past the 16 KB the head read covers.
        $op = [regex]::Match([IO.File]::ReadAllText($page, [Text.Encoding]::UTF8), '<h1>.*?</h1>.*?<p>(.*?)</p>', 'Singleline')
        $opening = [Net.WebUtility]::HtmlDecode([regex]::Replace($op.Groups[1].Value, '<[^>]+>', ''))
        $placeIssue = Get-StoryPlaceIssue ([pscustomobject]@{ headline = $head.Headline; dek = $head.Dek; paragraphs = @($opening) }) $placeDesk
      }
      if ($placeIssue) {
        Write-Host "[static] withdrawn $c/$($sub.Name): $placeIssue" -ForegroundColor DarkYellow
        [IO.Directory]::Delete($sub.FullName, $true)
        $withdrawn++
        continue
      }
    }
    # A page with no readable date is kept (and listed with its file date) rather than
    # swept on a guess.
    $pagesOnDisk.Add([pscustomobject]@{ code = $c; slug = $sub.Name; dir = $sub.FullName; headline = $head.Headline
                                        when = $head.When; dated = [bool]$head.When; movedTo = $head.MovedTo
                                        storyId = $head.StoryId; key = ''; home = ''; superseded = $false
                                        topic = (Get-PageTopic $head.Kicker) })
  }
}

# Each story's page: today's edition decides for the stories in it (the address the
# payload's Share link already points at); for the rest, the one full page left, or
# the first by address while older duplicates are being folded. Ordinal, so PowerShell
# 5.1 and 7 pick the same page.
$storyHome = @{}
$homeFixed = @{}
# The address ends in the first six characters of the id, so only a page that shares
# that tail with another page or a story in today's edition can be a second copy, and
# only those few need reading in full for an id.
$tailCount = @{}
foreach ($prop in $byCountry.PSObject.Properties) {
  if (-not $pageCodes.Contains($prop.Name)) { continue }
  foreach ($b in @($prop.Value | Where-Object { Test-StoryIsRenderable $_ })) {
    $id = [string]$b.articleId
    if (-not $id) { continue }
    $k = "$($prop.Name)/$id"
    $storyHome[$k] = Get-StorySlug $b.headline $id
    $homeFixed[$k] = $true
    $t = "$($prop.Name)/" + $id.Substring(0, [Math]::Min(6, $id.Length))
    $tailCount[$t] = 1 + [int]$tailCount[$t]
  }
}
foreach ($p in $pagesOnDisk) {
  if ($p.slug -match '-([0-9a-f]{6})$') { $t = "$($p.code)/$($matches[1])"; $tailCount[$t] = 1 + [int]$tailCount[$t] }
}
foreach ($p in $pagesOnDisk) {
  if ($p.slug -notmatch '-([0-9a-f]{6})$') { continue }
  if ([int]$tailCount["$($p.code)/$($matches[1])"] -lt 2) { continue }
  if (-not $p.storyId -and -not $p.movedTo) { $p.storyId = Get-StoryIdFromPage (Join-Path $p.dir 'index.html') }
  if ($p.storyId) { $p.key = "$($p.code)/$($p.storyId)" }
}
foreach ($p in $pagesOnDisk) {
  if (-not $p.key -or $p.movedTo -or $homeFixed.ContainsKey($p.key)) { continue }
  if (-not $storyHome.ContainsKey($p.key) -or [string]::CompareOrdinal($p.slug, $storyHome[$p.key]) -lt 0) { $storyHome[$p.key] = $p.slug }
}
foreach ($p in $pagesOnDisk) {
  if ($p.key -and $storyHome.ContainsKey($p.key)) { $p.home = $storyHome[$p.key] }
  $p.superseded = [bool]($p.movedTo -or ($p.home -and $p.home -ne $p.slug))
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
    # Opened here and closed after "Read in ASJ". The opening tag was missing, so every
    # country page closed 4-5 articles it never opened, and the spacing and dividers the
    # stylesheet gives each story never applied.
    [void]$body.Append("<article>`n")
    [void]$body.Append("<div class=""kicker"">$((@((Esc (Get-ShownTopic $b.topic)), $when) | Where-Object { $_ }) -join ' &middot; ')</div>`n")
    [void]$body.Append("<h2><a href=""$storyUrl"">$(Esc $b.headline)</a></h2>`n")
    if ($b.dek) { [void]$body.Append("<p class=""dek"">$(Esc $b.dek)</p>`n") }
    $paragraphs = @($b.paragraphs | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
    if (-not $paragraphs.Count) { $paragraphs = @([string]$b.body) }
    foreach ($paragraph in $paragraphs) { [void]$body.Append("<p>$(Esc $paragraph)</p>`n") }
    if (Test-ShowWhy $b) { [void]$body.Append("<p class=""why""><b>Why it matters</b>$(Esc $b.why)</p>`n") }
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

  # The country's earlier story pages still within -StoryDays, newest first: a link to
  # each so neither a reader nor a crawler has to know its address.
  $currentSlugs = @{}
  foreach ($b in $stories) { $currentSlugs[(Get-StorySlug $b.headline $b.articleId)] = $true }
  $earlierPages = @(Select-DistinctStories @($pagesOnDisk | Where-Object { $_.code -eq $code -and $_.headline -and -not $_.superseded -and -not $currentSlugs.ContainsKey($_.slug) -and (-not $_.dated -or $_.when -ge $storyCutoff) } |
    Sort-Object -Property @{ Expression = { if ($_.when) { $_.when } else { [datetime]::MinValue } }; Descending = $true }) 20)
  $earlierHtml = ''
  if ($earlierPages.Count) {
    $items = ($earlierPages | ForEach-Object {
      $day = if ($_.when) { $_.when.ToString('d MMM yyyy', [Globalization.CultureInfo]::InvariantCulture) } else { '' }
      "<li><a href=""$BaseUrl/$code/$($_.slug)/"">$(if ($day) { '<span class="rel-topic">' + $day + '</span>' })$(Esc $_.headline)</a></li>"
    }) -join ''
    $earlierHtml = "<nav class=""related"" aria-label=""Earlier stories""><h2 class=""section-label"">Earlier stories</h2><ul>$items</ul></nav>"
  }

  $html = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="max-image-preview:large">
<title>$(Esc $titleText)</title>
<meta name="description" content="$(Esc $desc)">
<link rel="canonical" href="$canonical">
<link rel="alternate" hreflang="en" href="$canonical">
<link rel="alternate" hreflang="x-default" href="$canonical">
<link rel="alternate" type="application/rss+xml" title="$(Esc $name) - The African Street Journal" href="$BaseUrl/$code/feed.xml">
<link rel="alternate" type="application/rss+xml" title="The African Street Journal" href="$BaseUrl/feed.xml">
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
<meta property="og:image" content="$(if(Test-Path (Join-Path $root "og/$code.jpg")){"$BaseUrl/og/$code.jpg"}else{"$BaseUrl/og-image.png"})">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="$(if(Test-Path (Join-Path $root "og/$code.jpg")){"$BaseUrl/og/$code.jpg"}else{"$BaseUrl/og-image.png"})">
<script type="application/ld+json">$($ld.ToString())</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"The African Street Journal","item":"$BaseUrl/"},{"@type":"ListItem","position":2,"name":"$(JsonEsc $name)","item":"$canonical"}]}</script>
<link rel="stylesheet" href="$BaseUrl/static-pages.css?v=70">
</head>
<body>
<div class="wrap">
<div class="masthead"><a href="$BaseUrl/">The African Street Journal</a>$infoMenu</div>
<div class="meta">$(Esc $meta.region)$(if($meta.capital){" &middot; Capital $(Esc $meta.capital)"})</div>
<h1>$(Esc $name)</h1>
<div class="meta">$($stories.Count) stories$(if($when){" &middot; updated $when"})</div>
<a class="open" href="$BaseUrl/#/$code">Open the interactive $(Esc $name) dossier &rarr;</a>
<p class="meta">Follow $(Esc $name) only in a news reader app: <a href="$BaseUrl/$code/feed.xml">$BaseUrl/$code/feed.xml</a></p>
$($body.ToString())
$earlierHtml
<nav class="morenav">
<h2>Other countries</h2>
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
# Each country's lead story gets a share image of its own (share-image.ps1), drawn once
# and kept with the page. Only the leads: they are what the desk posts and what readers
# share, and at ~40 KB an image for all ~230 stories an edition would add 3 GB a year to
# the repository. The rest keep the country's card.
$leadKeys = @{}
foreach ($lp in $leadPages) { $leadKeys["$($lp.code)/$($lp.slug)"] = $true }
$diskHeadline = @{}
foreach ($p in $pagesOnDisk) { $diskHeadline["$($p.code)/$($p.slug)"] = $p.headline }
$shareDrawn = 0

# Topics with a page of their own (/topics/<topic>/, built after the trust pages):
# any with three or more stories between today's edition and the kept pages. A story's
# topic line links there.
$topicSeen = @{}
foreach ($sp in $storyPages) { $t = Get-ShownTopic $sp.brief.topic; if ($t) { $topicSeen["$(Get-TopicSlug $t)|$($sp.code)/$($sp.slug)"] = $t } }
foreach ($p in $pagesOnDisk) { if ($p.topic -and -not $p.superseded -and (-not $p.dated -or $p.when -ge $storyCutoff)) { $topicSeen["$(Get-TopicSlug $p.topic)|$($p.code)/$($p.slug)"] = $p.topic } }
$topicCount = @{}
$topicName = @{}
foreach ($k in $topicSeen.Keys) { $ts = $k.Split('|')[0]; $topicCount[$ts] = 1 + [int]$topicCount[$ts]; if (-not $topicName.ContainsKey($ts)) { $topicName[$ts] = $topicSeen[$k] } }
$topicPages = @{}
foreach ($ts in $topicCount.Keys) { if ($ts -and $topicCount[$ts] -ge 3) { $topicPages[$ts] = $topicName[$ts] } }
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
  $storyDirPath = Join-Path (Join-Path $root $sp.code) $sp.slug
  $shareFile = Join-Path $storyDirPath 'share.jpg'
  $pageKey = "$($sp.code)/$($sp.slug)"
  if ($leadKeys.ContainsKey($pageKey) -and (-not (Test-Path $shareFile) -or $diskHeadline[$pageKey] -ne [string]$b.headline)) {
    if (-not (Test-Path $storyDirPath)) { New-Item -ItemType Directory -Path $storyDirPath -Force | Out-Null }
    $kicker = [string]$sp.country
    $shareTopic = Get-ShownTopic $b.topic
    if ($shareTopic -and ("$kicker - $shareTopic").Length -le 33) { $kicker = "$kicker $([char]0x00B7) $shareTopic" }
    if (New-StoryShareImage (Join-Path $root "og\$($sp.code).jpg") $shareFile $sp.code $kicker ([string]$b.headline)) { $shareDrawn++ }
  }
  $hasShare = Test-Path $shareFile
  $ogImage = if ($hasShare) { "${storyCanonical}share.jpg" } else { "$BaseUrl/og/$($sp.code).jpg" }
  $ogAlt = if ($hasShare) { [string]$b.headline } else { "$($sp.country) - The African Street Journal" }
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
  if (Test-ShowWhy $b) { [void]$bodyHtml.Append("<p class=""why""><b>Why it matters</b>$(Esc $b.why)</p>`n") }

  # NewsArticle, not CollectionPage: this is one piece, with a date and a publisher,
  # and citation carries the outlets it was written from.
  $ld = New-Object System.Text.StringBuilder
  [void]$ld.Append('{"@context":"https://schema.org","@type":"NewsArticle"')
  [void]$ld.Append(",""headline"":""$(JsonEsc $b.headline)""")
  [void]$ld.Append(",""description"":""$(JsonEsc $dek)""")
  [void]$ld.Append(",""url"":""$storyCanonical""")
  if ($published) { [void]$ld.Append(",""datePublished"":""$published"",""dateModified"":""$published""") }
  [void]$ld.Append(",""inLanguage"":""en"",""isAccessibleForFree"":true")
  # Organization as author: the desk is the byline; no personal name is ever published.
  [void]$ld.Append(",""publisher"":{""@type"":""NewsMediaOrganization"",""name"":""The African Street Journal"",""url"":""$BaseUrl/"",""logo"":{""@type"":""ImageObject"",""url"":""$BaseUrl/icon-512.png""}$sameAsLd}")
  [void]$ld.Append(",""author"":{""@type"":""Organization"",""name"":""The African Street Journal"",""url"":""$BaseUrl/about/""}")
  [void]$ld.Append(",""image"":[""$ogImage""],""mainEntityOfPage"":""$storyCanonical""")
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
    "<li><a href=""$BaseUrl/$($_.code)/$($_.slug)/"">$(if (Get-ShownTopic $_.brief.topic) { '<span class="rel-topic">' + (Esc $_.brief.topic) + '</span>' })$(Esc $_.brief.headline)</a></li>" }) -join '')
  $latestHtml = (@($leadPages | Where-Object { $_.code -ne $sp.code } | Select-Object -First 4 | ForEach-Object {
    "<li><a href=""$BaseUrl/$($_.code)/$($_.slug)/""><span class=""rel-topic"">$(Esc $_.country)</span>$(Esc $_.brief.headline)</a></li>" }) -join '')
  # The country in the title when the headline does not name it: people search "kenya"
  # plus a name, and the title is what the result shows.
  $storyTitle = if (([string]$b.headline) -match [regex]::Escape([string]$sp.country)) { "$([string]$b.headline) | The African Street Journal" }
                else { "$([string]$b.headline) | $($sp.country) | The African Street Journal" }
  # Home > Country > story, shown in search results in place of the bare address.
  $crumbs = "{""@context"":""https://schema.org"",""@type"":""BreadcrumbList"",""itemListElement"":[" +
    "{""@type"":""ListItem"",""position"":1,""name"":""The African Street Journal"",""item"":""$BaseUrl/""}," +
    "{""@type"":""ListItem"",""position"":2,""name"":""$(JsonEsc $sp.country)"",""item"":""$BaseUrl/$($sp.code)/""}," +
    "{""@type"":""ListItem"",""position"":3,""name"":""$(JsonEsc $b.headline)"",""item"":""$storyCanonical""}]}"
  $storyHtml = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="max-image-preview:large">
<title>$(Esc $storyTitle)</title>
<meta name="description" content="$(Esc $dek)">
<link rel="canonical" href="$storyCanonical">
$(if ($b.articleId) { '<meta name="asj-story" content="' + (Esc ([string]$b.articleId)) + '">' })
<link rel="alternate" hreflang="en" href="$storyCanonical">
<link rel="alternate" hreflang="x-default" href="$storyCanonical">
<link rel="alternate" type="application/rss+xml" title="$(Esc $sp.country) - The African Street Journal" href="$BaseUrl/$($sp.code)/feed.xml">
<link rel="alternate" type="application/rss+xml" title="The African Street Journal" href="$BaseUrl/feed.xml">
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
<meta property="og:image" content="$ogImage">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="$(Esc $ogAlt)">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="$(Esc $b.headline)">
<meta name="twitter:description" content="$(Esc $dek)">
<meta name="twitter:image" content="$ogImage">
<script type="application/ld+json">$($ld.ToString())</script>
<script type="application/ld+json">$crumbs</script>
<link rel="stylesheet" href="$BaseUrl/static-pages.css?v=70">
</head>
<body>
<a class="skip-link" href="#main">Skip to story</a>
<div class="wrap">
  <header class="masthead"><a href="$BaseUrl/">The African Street Journal</a> <span aria-hidden="true">/</span> <a href="$BaseUrl/$($sp.code)/">$(Esc $sp.country)</a>$infoMenu</header>
  <main id="main">
  <article class="story">
  <header class="story-head">
  <div class="meta">$(if ((Get-ShownTopic $b.topic) -and $topicPages.ContainsKey((Get-TopicSlug $b.topic))) { "<a href=""$BaseUrl/topics/$(Get-TopicSlug $b.topic)/"">$(Esc $b.topic)</a>" } else { Esc $(if (Get-ShownTopic $b.topic) { $b.topic } else { $sp.country }) })</div>
  <h1>$(Esc $b.headline)</h1>
  <p class="dek">$(Esc $dek)</p>
  <p class="byline">$(if($srcs.Count){"Source: <a href=""$(Esc $srcs[0].url)"" rel=""nofollow noopener"" target=""_blank"">$(Esc $srcs[0].name)</a> &middot; "})$(if($published){"<time datetime=""$published"">$(Esc $sp.when)</time> &middot; "})$readMin min read</p>
  <div class="share" data-url="$storyCanonical" data-title="$(Esc $b.headline)">
    <a class="share-wa" href="https://wa.me/?text=$waText" target="_blank" rel="noopener">WhatsApp</a>
    <a href="https://x.com/intent/post?text=$xText&amp;url=$encUrl" target="_blank" rel="noopener">X</a>
    <a href="https://t.me/share/url?url=$encUrl&amp;text=$([Uri]::EscapeDataString([string]$b.headline))" target="_blank" rel="noopener">Telegram</a>
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
    <p><a class="open" href="$BaseUrl/$($sp.code)/">All $(Esc $sp.country) stories &rarr;</a> &nbsp; <a class="open" href="$appUrl">Open today's edition &rarr;</a></p>
  </nav>
  </main>
  <footer>The African Street Journal &middot; original reporting, every source cited$siteLinks</footer>
</div>
<script src="$BaseUrl/share.js" defer></script>
</body>
</html>
"@
  if (-not (Test-Path $storyDirPath)) { New-Item -ItemType Directory -Path $storyDirPath -Force | Out-Null }
  [IO.File]::WriteAllText((Join-Path $storyDirPath 'index.html'), $storyHtml, (New-Object Text.UTF8Encoding($false)))
  $storyKept["$($sp.code)/$($sp.slug)"] = $true
  $urls.Add($storyCanonical)
  $imgFile = if ($hasShare) { $shareFile } else { Join-Path $root "og\$($sp.code).jpg" }
  $imgBytes = if (Test-Path $imgFile) { (Get-Item -LiteralPath $imgFile).Length } else { 0 }
  $feedItems.Add([pscustomobject]@{ title = [string]$b.headline; link = $storyCanonical; dek = $dek; published = $published; country = [string]$sp.country; code = [string]$sp.code
                                    image = $ogImage; imageBytes = $imgBytes; shareImage = $(if ($hasShare) { $ogImage } else { '' }) })
  $storyBuilt++
}

# Sweep story pages past the retention window. Anything in this edition was just
# rewritten above and is in $storyKept, so only genuinely expired pages go.
# By the date each page carries (Read-StoryPageHead), not the file's timestamp. What stays
# goes in the sitemap, dated by when it was published.
$swept = 0
$moved = 0
$earlierUrls = New-Object System.Collections.Generic.List[object]
foreach ($p in $pagesOnDisk) {
  if ($storyKept.ContainsKey("$($p.code)/$($p.slug)")) { continue }
  if ($StoryDays -gt 0 -and $p.dated -and $p.when -lt $storyCutoff) {
    if (Test-Path $p.dir) { [IO.Directory]::Delete($p.dir, $true); $swept++ }
    continue
  }
  # An older address of a story whose page is elsewhere: a redirect, not in the sitemap.
  if ($p.superseded) {
    $target = "$BaseUrl/$($p.code)/$($p.home)/"
    if ($p.home -and $p.movedTo -ne $target) { Write-MovedStoryPage $p $target; $moved++ }
    continue
  }
  $lastmod = if ($p.dated) { $p.when.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) } else { '' }
  $earlierUrls.Add([pscustomobject]@{ url = "$BaseUrl/$($p.code)/$($p.slug)/"; lastmod = $lastmod
                                      image = $(if (Test-Path (Join-Path $p.dir 'share.jpg')) { "$BaseUrl/$($p.code)/$($p.slug)/share.jpg" } else { '' }) })
}
Write-Host "[static] $storyBuilt story pages ($shareDrawn share images drawn), $($earlierUrls.Count) earlier pages kept, $swept swept past $StoryDays days, $moved older addresses redirected, $withdrawn withdrawn as off-country" -ForegroundColor DarkGray

# The same earlier stories for the app's country view (data/earlier/<cc>.json, a few KB,
# loaded when a country opens): headline, page and day of the 30 newest that are not in
# today's edition. The archive files hold full editions at ~600 KB each - too much to
# fetch for a list of headlines.
$earlierDir = Join-Path $root 'data\earlier'
New-Item -ItemType Directory -Force -Path $earlierDir | Out-Null
foreach ($c in $pageCodes) {
  $list = @(Select-DistinctStories @($pagesOnDisk | Where-Object { $_.code -eq $c -and $_.headline -and -not $_.superseded -and -not $storyKept.ContainsKey("$($_.code)/$($_.slug)") -and (-not $_.dated -or $_.when -ge $storyCutoff) } |
    Sort-Object -Property @{ Expression = { if ($_.when) { $_.when } else { [datetime]::MinValue } }; Descending = $true }) 30 |
    ForEach-Object { [ordered]@{ h = $_.headline; u = "/$($_.code)/$($_.slug)/"; d = $(if ($_.when) { $_.when.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) } else { '' }) } })
  $json = ConvertTo-Json -InputObject @($list) -Depth 3 -Compress
  [IO.File]::WriteAllText((Join-Path $earlierDir "$c.json"), $json, (New-Object Text.UTF8Encoding($false)))
}


# --- trust pages ---------------------------------------------------------------
# About, Privacy, Contact, Corrections. Added 20 Oct 2026: a news site with none of
# these reads as anonymous, and Google News expects them.
$trustPages = [ordered]@{
  about = @{ title = 'About'; desc = 'Why The African Street Journal exists, how its stories are made, and how to reach us.'; body = @"
<p>The African Street Journal exists so that people across Africa and in the diaspora can keep up with current events in all 55 countries: in plain language, on any phone and on any connection.</p>
<p>Most of the continent's news is spread across hundreds of outlets, and much of it is hard to find from outside the country it happened in. We use AI language models to read that reporting every day, pick out what matters most and summarise it, so that our people stay informed and knowledgeable about their continent. The journalists who did the reporting are always credited and linked.</p>
<h2>How the desk works</h2>
<p>Every morning an automated desk reads public news feeds from outlets across Africa, groups reports of the same event, and ranks them for public importance: elections, budgets, courts, health, food, power, jobs, trade and security come first. Gossip, sponsored copy, opinion columns and tabloid items are filtered out.</p>
<p>Each selected report is rewritten into a short original summary by an AI language model, working only from the facts in that report. Software then checks every story: figures must appear in the source, the story must name and link the outlet it came from, and anything that fails is dropped rather than published.</p>
<p>Stories are summaries, not original reporting from the ground. The outlet that broke the story is always credited and linked; please read and support them.</p>
<h2 id="low-data">Reading on a small data bundle</h2>
<p>The <a href="$BaseUrl/countries/">text-only edition</a> lists the latest lead story from every country as plain text, with no maps or pictures. Story pages are mostly text too.</p>
<p>If you use a news reader app such as Feedly, Inoreader or NetNewsWire, add <code>$BaseUrl/feed.xml</code> to it. The latest headlines then arrive in the app as they are published, using very little data. This kind of feed is called RSS. To follow one country only, add its feed instead: Kenya's is <code>$BaseUrl/ke/feed.xml</code>, and every country page links its own.</p>
<h2>Get in touch</h2>
<p>Email <a href="mailto:hello@africanstreetjournal.com">hello@africanstreetjournal.com</a> with questions, tips or complaints; the <a href="$BaseUrl/contact/">contact page</a> says what helps us act quickly. To report a mistake in a story, see <a href="$BaseUrl/corrections/">corrections</a>.</p>
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
<p>For privacy questions, email <a href="mailto:hello@africanstreetjournal.com">hello@africanstreetjournal.com</a>.</p>
"@ }
  contact = @{ title = 'Contact'; desc = 'How to reach The African Street Journal with tips, corrections or questions.'; body = @"
<p class="contact-email">Email us at <a href="mailto:hello@africanstreetjournal.com">hello@africanstreetjournal.com</a></p>
<p>We read every message. Good reasons to write:</p>
<ul>
<li><b>Corrections:</b> include the story link. See the <a href="$BaseUrl/corrections/">corrections policy</a>.</li>
<li><b>Outlets and publishers:</b> if you think we have summarised or credited your reporting wrongly, or you want your feed removed, tell us and we will act promptly.</li>
<li><b>Partnerships:</b> newsrooms, data providers and organisations who want to work with us.</li>
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
<p>To report an error, email <a href="mailto:hello@africanstreetjournal.com?subject=Correction">hello@africanstreetjournal.com</a> with the story link and what is wrong.</p>
<p>For the figures on country pages, see <a href="$BaseUrl/methods/">how we check our figures</a>.</p>
"@ }
  # Linked from every country page's figures (23 Oct 2026): where each number comes
  # from, and the second-source checks behind it.
  methods = @{ title = 'How we check our figures'; desc = 'Where the figures on The African Street Journal country pages come from, and how each is checked against a second source.'; body = @"
<p>Every figure on a country page comes from a named public source, shown with its year. Where a second, independent source exists, we check one against the other, and we fix, hide or label anything that does not agree.</p>
<h2>What we show and where it comes from</h2>
<ul>
<li><b>Economy and farming figures:</b> the World Bank's World Development Indicators. We show the latest year reported, never present a figure more than seven years old as current, and give the median of the African countries that report the same figure.</li>
<li><b>Main farm exports:</b> FAOSTAT trade data from the UN Food and Agriculture Organization, as the average export value of the last three years it reports. Goods a country imports more of than it exports are left out, so re-exports do not count as farm produce.</li>
<li><b>Planting and harvest months:</b> the FAO Crop Calendar where it covers the crop for that country; otherwise typical months for the crop, labelled as typical.</li>
<li><b>Food prices:</b> World Food Programme market monitoring. We use a national average, or a market in the capital or a large town. A refugee-camp market is used only when WFP monitors nothing else, and the page says so.</li>
<li><b>Largest cities:</b> the middle value of three sources: Natural Earth, GeoNames and Wikidata. A city needs at least two of them. Sources draw city limits differently, so treat populations as approximate.</li>
<li><b>Ports and airports:</b> the NGA World Port Index, and OurAirports for airports with scheduled flights.</li>
<li><b>Railways:</b> the OpenStreetMap route length of lines not marked disused, shown beside the CIA World Factbook's total for the whole network. Where track is mapped but no trains run (Libya, Chad, Niger), we say so.</li>
<li><b>Maps and landmarks:</b> Natural Earth outlines, following African Union membership: Somaliland is shown as part of Somalia, and Western Sahara as its own territory. Landmark positions are checked against Wikidata and OpenStreetMap. The extra towns shown when a map is zoomed in come from Natural Earth and <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0).</li>
</ul>
<h2>How the checks keep running</h2>
<p>Most sources refresh automatically every month. A monthly audit repeats the cross-checks (railway lengths against the Factbook, city figures against each other, landmark positions) and flags anything that has drifted, and a daily check flags any source that has stopped updating.</p>
<h2>Report an error</h2>
<p>If a figure looks wrong, email <a href="mailto:hello@africanstreetjournal.com?subject=Data%20correction">hello@africanstreetjournal.com</a> with the country and the figure. We check it against its source and correct it.</p>
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
<meta name="robots" content="max-image-preview:large">
<title>$($tp.title) | The African Street Journal</title>
<meta name="description" content="$(Esc $tp.desc)">
<link rel="canonical" href="$tpUrl">
<meta name="theme-color" content="#131313">
<link rel="alternate" type="application/rss+xml" title="The African Street Journal" href="$BaseUrl/feed.xml">
$analytics
<link rel="stylesheet" href="$BaseUrl/static-pages.css?v=70">
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

# --- topic pages ----------------------------------------------------------------
# /topics/<topic>/: the newest 60 stories on one subject across every country, from
# today's edition and the kept pages. Readers search by subject as often as by country
# ("africa agriculture news"), and a country page cannot answer that.
$topicEntries = New-Object System.Collections.Generic.List[object]
foreach ($sp in $storyPages) {
  $t = Get-ShownTopic $sp.brief.topic
  if (-not $t -or -not $storyKept.ContainsKey("$($sp.code)/$($sp.slug)")) { continue }
  $topicEntries.Add([pscustomobject]@{ ts = (Get-TopicSlug $t); code = $sp.code; slug = $sp.slug; headline = [string]$sp.brief.headline
                                       when = (ConvertTo-UtcStamp (Get-IsoInstant $sp.brief.published)); country = $sp.country })
}
foreach ($p in $pagesOnDisk) {
  if (-not $p.topic -or -not $p.headline -or $p.superseded -or $storyKept.ContainsKey("$($p.code)/$($p.slug)")) { continue }
  if ($p.dated -and $p.when -lt $storyCutoff) { continue }
  $topicEntries.Add([pscustomobject]@{ ts = (Get-TopicSlug $p.topic); code = $p.code; slug = $p.slug; headline = $p.headline; when = $p.when; country = $info[$p.code].name })
}
$topicsRoot = Join-Path $root 'topics'
New-Item -ItemType Directory -Force -Path $topicsRoot | Out-Null
foreach ($old in Get-ChildItem -Path $topicsRoot -Directory) { if (-not $topicPages.ContainsKey($old.Name)) { [IO.Directory]::Delete($old.FullName, $true) } }
$topicOrder = @($topicPages.Keys | Sort-Object { $topicPages[$_] })
$topicIndex = New-Object System.Text.StringBuilder
foreach ($ts in $topicOrder) {
  $tName = $topicPages[$ts]
  $tUrl = "$BaseUrl/topics/$ts/"
  $tList = @(Select-DistinctStories @($topicEntries | Where-Object { $_.ts -eq $ts } |
    Sort-Object -Property @{ Expression = { if ($_.when) { $_.when } else { [datetime]::MinValue } }; Descending = $true }) 60)
  if (-not $tList.Count) { continue }
  $tItems = ($tList | ForEach-Object {
    $day = if ($_.when) { $_.when.ToString('d MMM yyyy', [Globalization.CultureInfo]::InvariantCulture) } else { '' }
    "<li><a href=""$BaseUrl/$($_.code)/$($_.slug)/""><span class=""rel-topic"">$(Esc $_.country)$(if ($day) { ' &middot; ' + $day })</span>$(Esc $_.headline)</a></li>"
  }) -join ''
  $tOthers = ($topicOrder | Where-Object { $_ -ne $ts } | ForEach-Object { "<li><a href=""$BaseUrl/topics/$_/"">$(Esc $topicPages[$_])</a></li>" }) -join ''
  $tDesc = "The latest $tName stories from across Africa, every one written from named, linked sources. Updated with each edition of The African Street Journal."
  $tLd = "{""@context"":""https://schema.org"",""@type"":""CollectionPage"",""name"":""$(JsonEsc $tName) - The African Street Journal"",""url"":""$tUrl"",""description"":""$(JsonEsc $tDesc)""}"
  $tHtml = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="max-image-preview:large">
<title>$(Esc $tName) news from across Africa | The African Street Journal</title>
<meta name="description" content="$(Esc $tDesc)">
<link rel="canonical" href="$tUrl">
<meta name="theme-color" content="#131313">
<link rel="alternate" type="application/rss+xml" title="The African Street Journal" href="$BaseUrl/feed.xml">
<meta property="og:site_name" content="The African Street Journal">
<meta property="og:type" content="website">
<meta property="og:title" content="$(Esc $tName) news from across Africa">
<meta property="og:description" content="$(Esc $tDesc)">
<meta property="og:url" content="$tUrl">
<meta property="og:image" content="$BaseUrl/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">$tLd</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"The African Street Journal","item":"$BaseUrl/"},{"@type":"ListItem","position":2,"name":"Topics","item":"$BaseUrl/topics/"},{"@type":"ListItem","position":3,"name":"$(JsonEsc $tName)","item":"$tUrl"}]}</script>
$analytics
<link rel="stylesheet" href="$BaseUrl/static-pages.css?v=70">
</head>
<body>
<div class="wrap page">
<div class="masthead"><a href="$BaseUrl/">The African Street Journal</a> <span aria-hidden="true">/</span> <a href="$BaseUrl/topics/">Topics</a>$infoMenu</div>
<h1>$(Esc $tName)</h1>
<p class="meta">The newest $($tList.Count) $(Esc $tName) stories across Africa, newest first.</p>
<nav class="related" aria-label="$(Esc $tName) stories"><ul>$tItems</ul></nav>
<nav class="related" aria-label="Other topics"><h2 class="section-label">Other topics</h2><ul>$tOthers</ul></nav>
<footer>The African Street Journal &middot; original reporting, every source cited$siteLinks</footer>
</div>
</body>
</html>
"@
  $tDir = Join-Path $topicsRoot $ts
  New-Item -ItemType Directory -Force -Path $tDir | Out-Null
  [IO.File]::WriteAllText((Join-Path $tDir 'index.html'), $tHtml, (New-Object Text.UTF8Encoding($false)))
  $urls.Add($tUrl)
  [void]$topicIndex.Append("<li><a href=""$tUrl""><span class=""rel-topic"">$($tList.Count) stories</span>$(Esc $tName)</a></li>")
}
$tiUrl = "$BaseUrl/topics/"
$tiHtml = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="max-image-preview:large">
<title>Topics | The African Street Journal</title>
<meta name="description" content="African news by subject: politics, business, health, agriculture, climate and more, from 55 countries.">
<link rel="canonical" href="$tiUrl">
<meta name="theme-color" content="#131313">
$analytics
<link rel="stylesheet" href="$BaseUrl/static-pages.css?v=70">
</head>
<body>
<div class="wrap page">
<div class="masthead"><a href="$BaseUrl/">The African Street Journal</a>$infoMenu</div>
<h1>Topics</h1>
<p class="meta">Every story the desk has published in the last $StoryDays days, by subject.</p>
<nav class="related" aria-label="Topics"><ul>$($topicIndex.ToString())</ul></nav>
<footer>The African Street Journal &middot; original reporting, every source cited$siteLinks</footer>
</div>
</body>
</html>
"@
[IO.File]::WriteAllText((Join-Path $topicsRoot 'index.html'), $tiHtml, (New-Object Text.UTF8Encoding($false)))
$urls.Add($tiUrl)
Write-Host "[static] $($topicOrder.Count) topic pages" -ForegroundColor DarkGray

# --- digest: the edition as posts to paste -----------------------------------------
# /digest/ (noindex, not in the sitemap). WhatsApp and Facebook are where most readers
# in Africa are, and neither lets a site post for itself, so the desk writes the posts
# and the owner pastes them: the day's five best stories (one per country, by the
# desk's selection score) for WhatsApp, Facebook and X, then each country's top three
# for its own groups. "Send" opens WhatsApp or Telegram with the text filled in.
$digestPicks = New-Object System.Collections.Generic.List[object]
foreach ($sp in $storyPages) {
  if (-not $storyKept.ContainsKey("$($sp.code)/$($sp.slug)")) { continue }
  $score = 0.0
  if ($null -ne $sp.brief.selectionScore) { [void][double]::TryParse([string]$sp.brief.selectionScore, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$score) }
  $digestPicks.Add([pscustomobject]@{ code = $sp.code; country = [string]$sp.country; headline = [string]$sp.brief.headline
                                      url = "$BaseUrl/$($sp.code)/$($sp.slug)/"; score = $score
                                      when = (ConvertTo-UtcStamp (Get-IsoInstant $sp.brief.published)) })
}
$digestDay = (Get-Date).ToUniversalTime().ToString('d MMM yyyy', [Globalization.CultureInfo]::InvariantCulture)
$fresh = (Get-Date).ToUniversalTime().AddHours(-30)
$top = New-Object System.Collections.Generic.List[object]
$topSeen = @{}
foreach ($d in ($digestPicks | Where-Object { $_.when -and $_.when -ge $fresh } | Sort-Object -Property @{ Expression = { $_.score }; Descending = $true }, @{ Expression = { $_.url } })) {
  if ($topSeen.ContainsKey($d.code)) { continue }
  $topSeen[$d.code] = $true
  $top.Add($d)
  if ($top.Count -ge 5) { break }
}
function New-DigestBlock([string]$Id, [string]$Label, [string]$Text, [string]$FirstUrl) {
  $wa = 'https://wa.me/?text=' + [Uri]::EscapeDataString($Text)
  $tg = 'https://t.me/share/url?url=' + [Uri]::EscapeDataString($FirstUrl) + '&text=' + [Uri]::EscapeDataString($Text)
  return "<section class=""dg""><h2 class=""section-label"">$(Esc $Label)</h2><textarea id=""$Id"" readonly rows=""9"">$(Esc $Text)</textarea>" +
    "<p class=""dg-actions""><button type=""button"" data-copy=""$Id"">Copy</button><a href=""$(Esc $wa)"" target=""_blank"" rel=""noopener"">Send to WhatsApp</a><a href=""$(Esc $tg)"" target=""_blank"" rel=""noopener"">Send to Telegram</a></p></section>"
}
$digestBody = New-Object System.Text.StringBuilder
if ($top.Count) {
  $waLines = @("*The African Street Journal* - $digestDay", '')
  foreach ($d in $top) { $waLines += "*$($d.country)*: $($d.headline)"; $waLines += $d.url; $waLines += '' }
  $waLines += "All 55 countries, every story sourced: $BaseUrl/"
  [void]$digestBody.Append((New-DigestBlock 'dg-wa' 'WhatsApp - groups, Status, Channel' ($waLines -join "`n") $top[0].url))
  $fbLines = @("Today on The African Street Journal ($digestDay):", '')
  foreach ($d in $top) { $fbLines += "$($d.country) - $($d.headline)"; $fbLines += $d.url; $fbLines += '' }
  $fbLines += "Every country, every source: $BaseUrl/"
  [void]$digestBody.Append((New-DigestBlock 'dg-fb' 'Facebook page or group' ($fbLines -join "`n") $top[0].url))
  $xText = "$($top[0].country): $($top[0].headline) $($top[0].url)"
  [void]$digestBody.Append("<section class=""dg""><h2 class=""section-label"">X - the lead story</h2><textarea id=""dg-x"" readonly rows=""3"">$(Esc $xText)</textarea><p class=""dg-actions""><button type=""button"" data-copy=""dg-x"">Copy</button><a href=""https://x.com/intent/post?text=$([Uri]::EscapeDataString($xText))"" target=""_blank"" rel=""noopener"">Post on X</a></p></section>")
}
[void]$digestBody.Append('<h2 class="section-label">By country - for country groups</h2>')
foreach ($c in ($pageCodes | Sort-Object { $info[$_].name })) {
  $cTop = @($digestPicks | Where-Object { $_.code -eq $c } | Select-Object -First 3)
  if (-not $cTop.Count) { continue }
  $cLines = @("*$($info[$c].name) - The African Street Journal*", '')
  foreach ($d in $cTop) { $cLines += $d.headline; $cLines += $d.url; $cLines += '' }
  $cLines += "More $($info[$c].name) news: $BaseUrl/$c/"
  [void]$digestBody.Append("<details><summary>$(Esc $info[$c].name)</summary>$(New-DigestBlock "dg-$c" "$($info[$c].name) - top $($cTop.Count)" ($cLines -join "`n") $cTop[0].url)</details>")
}
$digestHtml = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Today's posts | The African Street Journal</title>
<meta name="theme-color" content="#131313">
<link rel="stylesheet" href="$BaseUrl/static-pages.css?v=70">
<style>.dg{margin:0 0 26px}.dg textarea{width:100%;box-sizing:border-box;background:#1b1b1b;color:#ece8e1;border:1px solid #333;border-radius:6px;padding:12px;font:15px/1.5 system-ui,sans-serif;resize:vertical}
.dg-actions{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 0}.dg-actions a,.dg-actions button{font:600 15px system-ui,sans-serif;padding:9px 14px;border-radius:6px;border:1px solid #3a3a3a;background:#222;color:#f3efe8;text-decoration:none;cursor:pointer}
.dg-actions a:hover,.dg-actions button:hover{border-color:#5fbf6a}details{border-top:1px solid #262626;padding:10px 0}summary{cursor:pointer;font:600 16px system-ui,sans-serif}</style>
</head>
<body>
<div class="wrap page">
<div class="masthead"><a href="$BaseUrl/">The African Street Journal</a></div>
<h1>Today's posts</h1>
<p class="meta">Written by the desk with this edition ($digestDay). Copy one, or send it straight to WhatsApp or Telegram and pick the group, Status or channel. Not listed in search.</p>
$($digestBody.ToString())
</div>
<script>
document.addEventListener('click', function (e) {
  var b = e.target.closest('button[data-copy]'); if (!b) return;
  var t = document.getElementById(b.getAttribute('data-copy')); if (!t) return;
  var done = function () { var o = b.textContent; b.textContent = 'Copied'; setTimeout(function () { b.textContent = o; }, 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t.value).then(done, function () { t.select(); document.execCommand('copy'); done(); }); }
  else { t.select(); document.execCommand('copy'); done(); }
});
</script>
</body>
</html>
"@
$digestDir = Join-Path $root 'digest'
New-Item -ItemType Directory -Force -Path $digestDir | Out-Null
[IO.File]::WriteAllText((Join-Path $digestDir 'index.html'), $digestHtml, (New-Object Text.UTF8Encoding($false)))
Write-Host "[static] digest: $($top.Count) lead stories, posts for $(@($digestPicks | Select-Object -ExpandProperty code -Unique).Count) countries" -ForegroundColor DarkGray

# --- countries hub: the text-only edition ------------------------------------------
# The homepage is a canvas map: crawlers find no country links there, and on a small
# data bundle it is the heaviest page on the site. This plain-HTML page lists every
# country with its lead story (linked straight to the story page) and is the menu's
# "Text-only edition".
$hubList = New-Object System.Text.StringBuilder
foreach ($c in ($pageCodes | Sort-Object { $info[$_].name })) {
  $hubLead = ''
  $cs = @($byCountry.$c | Where-Object { Test-StoryIsRenderable $_ })
  $hubStory = '<span class="hub-story">No recent story</span>'
  if ($cs.Count) {
    $hubLead = [string]$cs[0].headline
    $hubHref = "$BaseUrl/$c/"
    $hubSlug = Get-StorySlug $cs[0].headline $cs[0].articleId
    if ($storyKept.ContainsKey("$c/$hubSlug")) { $hubHref = "$BaseUrl/$c/$hubSlug/" }
    $hubStory = "<a class=""hub-story"" href=""$hubHref"">$(Esc $hubLead)</a>"
  }
  [void]$hubList.Append("<li><a class=""hub-country"" href=""$BaseUrl/$c/"">$(Esc $info[$c].name)</a>$hubStory</li>`n")
}
$hubHtml = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="max-image-preview:large">
<title>News from all 55 African countries | The African Street Journal</title>
<meta name="description" content="Today's source-cited news from every African country, from Algeria to Zimbabwe. One page per country, updated daily.">
<link rel="canonical" href="$BaseUrl/countries/">
<link rel="alternate" hreflang="en" href="$BaseUrl/countries/">
<link rel="alternate" type="application/rss+xml" title="The African Street Journal" href="$BaseUrl/feed.xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The African Street Journal">
<meta property="og:title" content="News from all 55 African countries">
<meta property="og:url" content="$BaseUrl/countries/">
<meta property="og:image" content="$BaseUrl/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="$BaseUrl/static-pages.css?v=70">
$analytics
</head>
<body>
<div class="wrap page">
<div class="masthead"><a href="$BaseUrl/">The African Street Journal</a>$infoMenu</div>
<main id="main">
<h1>Text-only edition</h1>
<p class="hub-intro">The latest lead story from each of the 55 African countries, as plain text with no maps or pictures, for slow connections and small data bundles. Tap a headline to read it, or a country for all of its stories.</p>
<ul class="country-hub">
$($hubList.ToString())</ul>
<p class="hub-note">Use a news reader app? Add <code>$BaseUrl/feed.xml</code> to get the latest headlines as they are published, or one country's feed (Kenya: <code>$BaseUrl/ke/feed.xml</code>) for that country alone. <a href="$BaseUrl/about/#low-data">How this works</a></p>
</main>
<footer>The African Street Journal &middot; from the streets, for the streets$siteLinks</footer>
</div>
</body>
</html>
"@
$hubDir = Join-Path $root 'countries'
if (-not (Test-Path $hubDir)) { New-Item -ItemType Directory -Path $hubDir -Force | Out-Null }
[IO.File]::WriteAllText((Join-Path $hubDir 'index.html'), $hubHtml, (New-Object Text.UTF8Encoding($false)))
$urls.Add("$BaseUrl/countries/")

# --- RSS feed and Google News sitemap ------------------------------------------
function XmlEsc([string]$t) { if ($null -eq $t) { return '' }; return [Security.SecurityElement]::Escape($t) }
$sortedFeed = @($feedItems | Sort-Object { try { [datetime]::Parse([string]$_.published, [Globalization.CultureInfo]::InvariantCulture).ToUniversalTime() } catch { [datetime]::MinValue } } -Descending)
# One RSS document, newest first, at most 100 items: the site feed, and one per country
# (/ke/feed.xml) so a reader or an aggregator can follow just Kenya. Items are taken
# untyped and enumerated through the pipeline (see Test-NewsClusterNamesCountry: a
# Generic.List bound to [object[]] throws on PowerShell 7.4).
function New-RssFeed([string]$Title, [string]$Link, [string]$Self, [string]$Description, $Items) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
  # Feed readers ignore this; a browser that opens the feed shows a readable page
  # (feed.xsl) instead of one run-on block of titles, links and dates.
  [void]$sb.AppendLine('<?xml-stylesheet type="text/xsl" href="/feed.xsl"?>')
  # media:content and enclosure carry each story's image, so readers and aggregators
  # (Feedly, Inoreader, Flipboard, Telegram RSS bots) show a picture, not a bare line.
  [void]$sb.AppendLine('<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><channel>')
  [void]$sb.AppendLine("<title>$(XmlEsc $Title)</title><link>$(XmlEsc $Link)</link><description>$(XmlEsc $Description)</description><language>en</language>")
  [void]$sb.AppendLine("<atom:link href=""$(XmlEsc $Self)"" rel=""self"" type=""application/rss+xml""/>")
  foreach ($fi in @($Items | ForEach-Object { $_ } | Select-Object -First 100)) {
    $pd = $null
    try { $pd = [datetime]::Parse([string]$fi.published, [Globalization.CultureInfo]::InvariantCulture).ToUniversalTime() } catch { }
    [void]$sb.Append("<item><title>$(XmlEsc $fi.title)</title><link>$(XmlEsc $fi.link)</link><guid isPermaLink=""true"">$(XmlEsc $fi.link)</guid><category>$(XmlEsc $fi.country)</category><description>$(XmlEsc $fi.dek)</description>")
    if ($pd) { [void]$sb.Append("<pubDate>$($pd.ToString('r', [Globalization.CultureInfo]::InvariantCulture))</pubDate>") }
    if ($fi.image) {
      [void]$sb.Append("<enclosure url=""$(XmlEsc $fi.image)"" length=""$([long]$fi.imageBytes)"" type=""image/jpeg""/><media:content url=""$(XmlEsc $fi.image)"" medium=""image"" type=""image/jpeg"" width=""1200"" height=""630""/>")
    }
    [void]$sb.AppendLine('</item>')
  }
  [void]$sb.AppendLine('</channel></rss>')
  return $sb.ToString()
}
$news = New-Object System.Text.StringBuilder
[void]$news.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
[void]$news.AppendLine('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">')
$newsCut = (Get-Date).ToUniversalTime().AddDays(-2)
$newsCount = 0
foreach ($fi in $sortedFeed) {
  $newsCount++
  $pd = $null
  try { $pd = [datetime]::Parse([string]$fi.published, [Globalization.CultureInfo]::InvariantCulture).ToUniversalTime() } catch { }
  # Google News sitemaps list only articles from the last two days.
  if ($pd -and $pd -ge $newsCut -and $newsCount -le 1000) {
    [void]$news.AppendLine("  <url><loc>$(XmlEsc $fi.link)</loc><news:news><news:publication><news:name>The African Street Journal</news:name><news:language>en</news:language></news:publication><news:publication_date>$($pd.ToString('yyyy-MM-ddTHH:mm:ssZ'))</news:publication_date><news:title>$(XmlEsc $fi.title)</news:title></news:news></url>")
  }
}
[void]$news.AppendLine('</urlset>')
$siteFeed = New-RssFeed 'The African Street Journal' "$BaseUrl/" "$BaseUrl/feed.xml" 'Daily news from all 55 African countries, every source cited.' $sortedFeed
[IO.File]::WriteAllText((Join-Path $root 'feed.xml'), $siteFeed, (New-Object Text.UTF8Encoding($false)))
[IO.File]::WriteAllText((Join-Path $root 'news-sitemap.xml'), $news.ToString(), (New-Object Text.UTF8Encoding($false)))
# Every country with a page gets a feed, so the link its page advertises always resolves.
$countryFeeds = 0
foreach ($c in $pageCodes) {
  $cName = [string]$info[$c].name
  $cItems = @($sortedFeed | Where-Object { $_.code -eq $c })
  $cFeed = New-RssFeed "$cName - The African Street Journal" "$BaseUrl/$c/" "$BaseUrl/$c/feed.xml" "Daily news from $cName, every source cited." $cItems
  [IO.File]::WriteAllText((Join-Path (Join-Path $root $c) 'feed.xml'), $cFeed, (New-Object Text.UTF8Encoding($false)))
  $countryFeeds++
}
Write-Host "[static] feed.xml and $countryFeeds country feeds"

# --- sitemap ----------------------------------------------------------------
$today = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
$sm = New-Object System.Text.StringBuilder
[void]$sm.AppendLine('<?xml version="1.0" encoding="UTF-8"?>')
[void]$sm.AppendLine('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">')
# A story's own share image is listed with its page, so Google Images and Discover can
# find it. The country cards are shared by every story and are left out.
$pageImage = @{}
foreach ($fi in $feedItems) { if ($fi.shareImage) { $pageImage[$fi.link] = $fi.shareImage } }
foreach ($u in $urls) {
  $im = if ($pageImage.ContainsKey($u)) { "<image:image><image:loc>$($pageImage[$u])</image:loc></image:image>" } else { '' }
  [void]$sm.AppendLine("  <url><loc>$u</loc><lastmod>$today</lastmod><changefreq>daily</changefreq>$im</url>")
}
# Earlier story pages (kept for -StoryDays): they do not change once published.
foreach ($e in $earlierUrls) {
  $lm = if ($e.lastmod) { "<lastmod>$($e.lastmod)</lastmod>" } else { '' }
  $im = if ($e.image) { "<image:image><image:loc>$($e.image)</image:loc></image:image>" } else { '' }
  [void]$sm.AppendLine("  <url><loc>$($e.url)</loc>$lm$im</url>")
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

Write-Host "[static] built $built country pages, sitemap with $($urls.Count + $earlierUrls.Count) URLs, robots.txt" -ForegroundColor Green
Write-Host "[static] base URL: $BaseUrl" -ForegroundColor DarkGray
