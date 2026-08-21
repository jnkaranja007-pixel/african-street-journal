#Requires -Version 5.1
<#
.SYNOPSIS
  Pull today's news per country from the registered outlets in data/sources.json,
  cluster the same story across outlets, and rank what matters. No API key, no quota.
.DESCRIPTION
  Step 1 of the daily desk. Reads every usable feed for a country, merges the items,
  groups reports of the same story together, scores them, and writes the top few to
  data/feed-items.json for the writing step.

  The article URLs come from the feed, so the writer is never asked to produce one.
  Asking a model to search and cite is what produced two fabricated citations in the
  5 August run. Here the model only rewrites text around a link it was handed, which
  removes that failure mode structurally rather than catching it afterwards.

  Source history, so nobody re-litigates it:
    - Google News RSS was dropped. Google stopped redirecting its article links; they
      now serve a JavaScript interstitial with the real publisher URL nowhere in the
      HTML, decodable only via a private endpoint. Useless as citations. It also gives
      headlines with no article text, which starved the writer into empty briefs like
      "Kenya held its interest rate this week."
    - AllAfrica was dropped as the backbone. It refuses connections after roughly 25
      requests and stays refusing for a long while. A source that bans you for reading
      25 pages cannot serve 55 countries nightly.
    - Hence per-country outlets: ~4 each, spread over ~200 domains, so no single host
      sees more than a handful of requests.

  Ranking uses corroboration first, which is the thing a single aggregator could never
  provide: if three independent outlets carry a story, it is the day's real news. A
  lone item from one paper is more likely filler.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/fetch-news.ps1
  powershell -ExecutionPolicy Bypass -File scripts/fetch-news.ps1 -Only ng,ke,za
  powershell -ExecutionPolicy Bypass -File scripts/fetch-news.ps1 -Days 2 -PerCountry 6
.NOTES
  Exit 0 if any country returned items, 1 if every feed failed, which means something
  systemic rather than a quiet news day. Run scripts/check-sources.ps1 first if the
  registry has not been verified lately; this script skips sources the checker marked
  blocked or missing.
#>
param(
  [string[]]$Only,
  [int]$Days = 2,
  # Six ranked candidates for five briefs. Relevance and event uniqueness are hard
  # gates before selection, so the writer gets a tight desk rather than a noisy inbox.
  [int]$PerCountry = 6,
  [double]$MinCandidateScore = 6.0,
  [int]$DelayMs = 150,
  [int]$TimeoutSec = 20
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::DefaultConnectionLimit = 8
# Note: certificate validation is deliberately NOT disabled here. scripts/check-sources.ps1
# relaxes it for diagnosis only; the production fetcher must refuse a bad chain.

$root = Split-Path $PSScriptRoot -Parent
$srcPath = Join-Path $root 'data\sources.json'
$outPath = Join-Path $root 'data\feed-items.json'
if (-not (Test-Path $srcPath)) { Write-Host '[fetch] data/sources.json not found' -ForegroundColor Red; exit 1 }
$registry = [IO.File]::ReadAllText($srcPath, [Text.Encoding]::UTF8) | ConvertFrom-Json

$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
. (Join-Path $PSScriptRoot 'news-ranking.ps1')

function Get-NodeText($node) {
  # PowerShell surfaces an XML element as a string when it is simple and as an object
  # when it carries attributes or CDATA, so every shape has to be handled. Falling
  # through to [string]$node yields the literal "System.Xml.XmlElement", which is how
  # Bulawayo24's CDATA-wrapped headlines first reached the ranking table.
  if ($null -eq $node) { return '' }
  if ($node -is [string]) { return $node }
  if ($node -is [array]) {
    foreach ($n in $node) { $t = Get-NodeText $n; if ($t) { return $t } }
    return ''
  }
  if ($node.'#cdata-section') { return [string]$node.'#cdata-section' }
  if ($node.'#text') { return [string]$node.'#text' }
  if ($node -is [Xml.XmlElement]) {
    if ($node.InnerText) { return [string]$node.InnerText }
    return ''
  }
  return [string]$node
}

# Mojibake markers, built from code points so this file stays pure ASCII. Writing them
# as literals breaks the script outright: PowerShell 5.1 reads a UTF-8-without-BOM file
# as ANSI, and the high bytes then fail to parse.
$MOJI_PATTERN = ([string][char]0x00C3) + '|' + ([string][char]0x00E2) + ([string][char]0x20AC) + '|' + ([string][char]0x00C2)
$REPL_CHAR    = [string][char]0xFFFD

function Repair-Mojibake([string]$s) {
  # Several outlets publish UTF-8 bytes their own CMS already decoded as Windows-1252,
  # so a curly quote or an accent arrives as a run of Latin-1 characters. Round-tripping
  # back through 1252 recovers the original.
  #
  # It has to LOOP: some feeds have been through the mangle more than once. Journal du
  # Cameroun served "Yaounde" with four layers of it, and a single pass turned
  # 12 corrupt characters into 6 rather than fixing the word. Four passes recover it.
  #
  # Each pass must strictly reduce the damage, and any pass that produces the Unicode
  # replacement character is discarded - that is the signal the text was never
  # double-encoded and we are now destroying legitimate characters.
  if (-not $s) { return $s }
  for ($pass = 0; $pass -lt 6; $pass++) {
    # -cnotmatch, not -notmatch: PowerShell's -match is case-insensitive and U+00C2 is the
    # uppercase pair of U+00E2, so a plain -match flags legitimate French "cable" and
    # Portuguese "nao" as corruption. Case-sensitivity is the whole signal here.
    if ($s -cnotmatch $MOJI_PATTERN) { break }
    try {
      $fixed = [Text.Encoding]::UTF8.GetString([Text.Encoding]::GetEncoding(1252).GetBytes($s))
    } catch { break }
    if ($fixed.Contains($REPL_CHAR)) { break }
    $before = ([regex]::Matches($s,     $MOJI_PATTERN)).Count
    $after  = ([regex]::Matches($fixed, $MOJI_PATTERN)).Count
    if ($after -ge $before) { break }
    $s = $fixed
  }
  return $s
}

function Clear-Html([string]$s) {
  if (-not $s) { return '' }
  $s = $s -replace '(?s)<script.*?</script>', ' ' -replace '(?s)<style.*?</style>', ' '
  $s = $s -replace '<[^>]+>', ' '
  $s = [Net.WebUtility]::HtmlDecode($s)
  $s = Repair-Mojibake $s
  # RSS plugins append the outlet name after the actual lede. Besides wasting prompt
  # tokens, "appeared first on Premium Times Nigeria" made a Cameroon story pass the
  # Nigeria relevance gate. Strip these generated trailers before any ranking signal.
  $s = $s -replace '(?is)\s+the post\s+.*$', ' '
  $s = $s -replace '(?is)\s+l.article\s+.*$', ' '
  $s = $s -replace '(?is)\s+la entrada\s+.*$', ' '
  $s = $s -replace '(?is)\s+o post\s+.*$', ' '
  $s = $s -replace '(?is)\s+read more:\s*https?://\S+.*$', ' '
  return ($s -replace '\s+', ' ').Trim()
}

function Get-Url([string]$url) {
  $req = [Net.HttpWebRequest]::Create($url)
  $req.UserAgent = $UA
  $req.Timeout = $TimeoutSec * 1000
  $req.ReadWriteTimeout = $TimeoutSec * 1000
  $req.AllowAutoRedirect = $true
  $req.Accept = 'application/rss+xml, application/atom+xml, application/xml, text/xml'
  $resp = $req.GetResponse()
  try {
    $sr = New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)
    return $sr.ReadToEnd()
  } finally { $resp.Close() }
}

function Read-Feed([string]$url) {
  # Returns a list of raw items normalised across RSS 2.0, RDF and Atom.
  $txt = Get-Url $url
  $txt = $txt.TrimStart([char]0xFEFF, ' ', "`t", "`r", "`n")
  $xml = [xml]$txt
  $out = New-Object System.Collections.Generic.List[object]

  $nodes = @($xml.rss.channel.item)
  if (-not $nodes -or $nodes.Count -eq 0 -or -not $nodes[0]) { $nodes = @($xml.RDF.item) }
  $isAtom = $false
  if (-not $nodes -or $nodes.Count -eq 0 -or -not $nodes[0]) { $nodes = @($xml.feed.entry); $isAtom = $true }
  if (-not $nodes -or -not $nodes[0]) { return $out }

  foreach ($n in $nodes) {
    if (-not $n) { continue }
    $title = Clear-Html (Get-NodeText $n.title)
    if (-not $title) { continue }

    $link = ''
    if ($isAtom) {
      # Atom puts the URL in an href attribute, and often lists several rel types.
      foreach ($l in @($n.link)) {
        if ($l -is [string]) { $link = $l; break }
        $rel = [string]$l.rel
        if (-not $rel -or $rel -eq 'alternate') { $link = [string]$l.href; break }
      }
    } else {
      $link = Get-NodeText $n.link
      if (-not $link) { $link = Get-NodeText $n.guid }
    }
    $link = $link.Trim()

    # Some feeds put markup inside <link>. Politico SL serves
    # "https://politicosl.com/<a href="/articles/...">view</a>", and serves it already
    # percent-encoded (%3Ca%20href%3D%22), so there is no literal angle bracket to
    # catch. Decode first, then recover the href. Left alone this surfaces in the audit
    # as a fabricated 404, blaming the model for the publisher's malformed XML.
    if ($link -match '(?i)%3C') {
      try { $link = [Uri]::UnescapeDataString($link) } catch { }
    }
    if ($link -match '<') {
      $anchor = [regex]::Match($link, '(?i)<a[^>]+href\s*=\s*["'']?([^"''>\s]+)')
      $base   = $link.Substring(0, $link.IndexOf('<')).Trim()
      if ($anchor.Success) {
        $href = $anchor.Groups[1].Value
        if ($href -match '^https?://') { $link = $href }
        elseif ($base) { try { $link = ([Uri]::new([Uri]$base, $href)).AbsoluteUri } catch { $link = $base } }
        else { $link = '' }
      } else { $link = $base }
    }

    # A URL carrying markup, quotes or whitespace is not a citation anyone can follow.
    if ($link -notmatch '^https?://') { continue }
    if ($link -match '[<>"\s]') { continue }

    # Many publishers expose both a short teaser and richer content:encoded text.
    # Choose the strongest evidence already inside the feed instead of fetching every
    # article page, then cap it so six-candidate prompts stay predictable and cheap.
    $summary = @(
      (Clear-Html (Get-NodeText $n.description)),
      (Clear-Html (Get-NodeText $n.summary)),
      (Clear-Html (Get-NodeText $n.encoded))
    ) | Where-Object { $_ } | Sort-Object -Property Length -Descending | Select-Object -First 1
    $summary = [string]$summary
    if ($summary.Length -gt 600) { $summary = $summary.Substring(0, 600) }

    $when = Get-NodeText $n.pubDate
    if (-not $when) { $when = Get-NodeText $n.published }
    if (-not $when) { $when = Get-NodeText $n.updated }
    if (-not $when) { $when = Get-NodeText $n.date }
    $pub = $null
    try { if ($when) { $pub = ([datetime]::Parse($when)).ToUniversalTime() } } catch { $pub = $null }

    $out.Add([pscustomobject]@{ title = $title; url = $link; summary = $summary; published = $pub })
  }
  return $out
}

$codes = @($registry.PSObject.Properties.Name | Where-Object { $_ -ne '_comment' })
if ($Only) {
  # Via `powershell -File`, "-Only ng,ke" arrives as one string, so split on commas.
  $want = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $codes = $codes | Where-Object { $want -contains $_ }
  if (-not $codes) { Write-Host "[fetch] no country matched: $($want -join ',')" -ForegroundColor Red; exit 1 }
}

$cutoff = (Get-Date).ToUniversalTime().AddDays(-$Days)
$now    = (Get-Date).ToUniversalTime()
$result = [ordered]@{}
$totalItems = 0
$deadFeeds  = New-Object System.Collections.Generic.List[string]

foreach ($code in $codes) {
  $entry = $registry.$code
  $name  = $entry.name

  # Skip what the checker already proved unreadable, so a nightly run is not spending
  # twenty seconds per country re-confirming that Cloudflare still says no.
  $usable = @($entry.sources | Where-Object { -not $_.state -or $_.state -eq 'ok' })
  if (-not $usable.Count) {
    Write-Host ("  {0}  {1,-26} no usable sources registered" -f $code, $name) -ForegroundColor Red
    continue
  }

  # Explicit country terms serve two jobs: regional-feed admission and a relevance
  # component in the editorial meter. Matching uses Unicode word boundaries, so Niger
  # no longer matches the first five letters of Nigeria.
  $matchTerms = @($name)
  if ($entry.match) { $matchTerms = @($entry.match) }
  $foreignTerms = @($registry.PSObject.Properties |
                    Where-Object { $_.Name -ne '_comment' -and $_.Name -ne $code } |
                    ForEach-Object { [string]$_.Value.name } | Where-Object { $_ })

  $pool = New-Object System.Collections.Generic.List[object]
  $liveSources = 0
  foreach ($s in $usable) {
    try {
      $items = Read-Feed $s.feed
      # liveSources is counted after filtering: a regional feed that named no story
      # here is not a source for this country, and the diversity cap divides by it.
      $kept = 0
      foreach ($it in $items) {
        # Regional sources and outlets explicitly tagged requireMatch must name the
        # country in the headline or opening. Domestic outlets may use local shorthand,
        # but implicit relevance receives only a small score and cannot dominate.
        $requireMatch = ($s.scope -eq 'regional' -or [bool]$s.requireMatch)
        $relevance = Get-CountryRelevance $it.title $it.summary $matchTerms ([string]$s.scope) $requireMatch $foreignTerms
        if ($relevance.HardReject) { continue }
        $kept++
        $pool.Add([pscustomobject]@{
          title     = $it.title
          url       = $it.url
          summary   = $it.summary
          published = $it.published
          source    = $s.name
          tier      = [int]$s.tier
          scope     = [string]$s.scope
          countryMatch = [string]$relevance.Match
          countryScore = [double]$relevance.Score
        })
      }
      if ($kept) { $liveSources++ }
    } catch {
      $deadFeeds.Add("$code/$($s.name)")
    }
    Start-Sleep -Milliseconds $DelayMs
  }

  if (-not $pool.Count) {
    Write-Host ("  {0}  {1,-26} every feed returned empty" -f $code, $name) -ForegroundColor DarkYellow
    continue
  }

  # --- freshness window, widened for quiet countries -------------------------
  # Lesotho has one working feed and filed nothing inside two days, so its page went
  # blank. A country with a thin press should run slightly older news rather than
  # nothing; recency is still scored below, so fresh items keep winning where they exist.
  $fresh = @($pool | Where-Object { -not $_.published -or $_.published -ge $cutoff })
  if ($fresh.Count -lt 3) {
    $wide = $now.AddDays(-($Days * 4))
    $widened = @($pool | Where-Object { -not $_.published -or $_.published -ge $wide })
    if ($widened.Count -gt $fresh.Count) {
      Write-Host ("      {0}: only {1} item(s) in {2}d, widening to {3}d" -f $code, $fresh.Count, $Days, ($Days * 4)) -ForegroundColor DarkGray
      $fresh = $widened
    }
  }
  if (-not $fresh.Count) {
    Write-Host ("  {0}  {1,-26} nothing published recently" -f $code, $name) -ForegroundColor DarkYellow
    continue
  }

  # --- cluster the same event across languages and outlets ------------------
  $clusters = New-Object System.Collections.Generic.List[object]
  foreach ($item in $fresh) {
    $eventText = $item.title + ' ' + $(if ($item.summary) { $item.summary.Substring(0, [Math]::Min(420, $item.summary.Length)) } else { '' })
    $item | Add-Member -NotePropertyName _titleSig -NotePropertyValue (Get-NewsSignature $item.title $matchTerms) -Force
    $item | Add-Member -NotePropertyName _eventSig -NotePropertyValue (Get-NewsSignature $eventText $matchTerms) -Force

    $placed = $false
    foreach ($cluster in $clusters) {
      foreach ($member in $cluster.members) {
        if (Test-SameNewsEvent $item._titleSig $item._eventSig $member._titleSig $member._eventSig) {
          $cluster.members.Add($item)
          $placed = $true
          break
        }
      }
      if ($placed) { break }
    }
    if (-not $placed) {
      $members = New-Object System.Collections.Generic.List[object]
      $members.Add($item)
      $clusters.Add([pscustomobject]@{ members = $members })
    }
  }

  # --- score with a visible editorial meter ---------------------------------
  $scored = New-Object System.Collections.Generic.List[object]
  foreach ($cluster in $clusters) {
    $outlets = @($cluster.members | ForEach-Object { $_.source } | Sort-Object -Unique)
    $choices = foreach ($member in $cluster.members) {
      [pscustomobject]@{ Item = $member; Meter = Get-EditorialScore $member $outlets.Count $now }
    }
    # The representative is the member with the strongest complete evidence, not
    # automatically the longest lede or the first feed fetched.
    $choice = @($choices | Sort-Object -Property @{ Expression = { $_.Meter.Score }; Descending = $true },
                                                    @{ Expression = { $_.Item.published }; Descending = $true })[0]
    $best = $choice.Item
    $meter = $choice.Meter

    $others = New-Object System.Collections.Generic.List[object]
    $seenOutlet = @{}
    $seenOutlet[$best.source] = $true
    foreach ($member in @($cluster.members | Sort-Object -Property @{ Expression = { $_.tier } })) {
      if ($seenOutlet.ContainsKey($member.source)) { continue }
      if ($member.url -notmatch '^https?://') { continue }
      $seenOutlet[$member.source] = $true
      $others.Add([pscustomobject]@{
        name      = $member.source
        url       = $member.url
        title     = $member.title
        summary   = $member.summary
        published = if ($member.published) { $member.published.ToString('yyyy-MM-ddTHH:mm:ssZ') } else { '' }
      })
      if ($others.Count -ge 2) { break }
    }

    $eventKey = @($best._eventSig.Keys | Sort-Object | Select-Object -First 6) -join '-'
    $scored.Add([pscustomobject]@{
      title          = $best.title
      url            = $best.url
      summary        = $best.summary
      source         = $best.source
      sourceTier     = [int]$best.tier
      corroboration  = $outlets.Count
      alsoSources    = $others.ToArray()
      published      = if ($best.published) { $best.published.ToString('yyyy-MM-ddTHH:mm:ssZ') } else { '' }
      score          = [double]$meter.Score
      scoreBreakdown = $meter.Breakdown
      rankReasons    = $meter.Reasons
      topicHint      = [string]$meter.Topic
      confidence     = [string]$meter.Confidence
      ageHours       = $meter.AgeHours
      countryMatch   = [string]$best.countryMatch
      eventKey       = $eventKey
      itemId         = Get-NewsItemId $best.url $best.title $best.summary
      _titleSig      = $best._titleSig
      _eventSig      = $best._eventSig
    })
  }

  # Selection applies outlet and topic diversity after base scoring and never admits
  # two candidates judged to be the same event. A relaxed pass fills thin countries
  # without relaxing event uniqueness.
  $eligible = @($scored.ToArray() | Where-Object { $_.score -ge $MinCandidateScore })
  $selected = @(Select-NewsCandidates $eligible $PerCountry $liveSources)
  $ranked = @($selected | ForEach-Object {
    [pscustomobject][ordered]@{
      title             = $_.title
      url               = $_.url
      summary           = $_.summary
      source            = $_.source
      sourceTier        = $_.sourceTier
      corroboration     = $_.corroboration
      alsoSources       = $_.alsoSources
      published         = $_.published
      editorialScore    = $_.score
      selectionScore    = $_.selectionScore
      diversityPenalty  = $_.diversityPenalty
      scoreBreakdown    = $_.scoreBreakdown
      rankReasons       = $_.rankReasons
      topicHint         = $_.topicHint
      confidence        = $_.confidence
      ageHours          = $_.ageHours
      countryMatch      = $_.countryMatch
      eventKey          = $_.eventKey
      itemId            = $_.itemId
    }
  })

  # When a country comes out thin, say where the items went. Sudan filed one story from
  # three healthy feeds and there was no way to tell whether the feeds, the freshness
  # window, the clustering or the selection ate them without adding prints by hand.
  if ($ranked.Count -lt 3) {
    Write-Host ("      {0}: pool={1} fresh={2} clusters={3} eligible={4} selected={5}" -f `
                $code, $pool.Count, $fresh.Count, $clusters.Count, $eligible.Count, $ranked.Count) -ForegroundColor DarkGray
  }
  if (-not $ranked.Count) {
    Write-Host ("  {0}  {1,-26} nothing usable after clustering" -f $code, $name) -ForegroundColor DarkYellow
    continue
  }

  $corrob = @($ranked | Where-Object { $_.corroboration -gt 1 }).Count
  $result[[string]$code] = @{ country = $name; items = $ranked }
  $totalItems += $ranked.Count
  Write-Host ("  {0}  {1,-26} {2,2} stories from {3} source(s), {4} corroborated" -f `
              $code, $name, $ranked.Count, $liveSources, $corrob) -ForegroundColor Green
}

if ($result.Count -eq 0) {
  Write-Host "[fetch] every feed returned nothing across $($codes.Count) countries - systemic failure, not a quiet news day" -ForegroundColor Red
  exit 1
}

$payload = [ordered]@{
  fetched   = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  days      = $Days
  byCountry = $result
}
[IO.File]::WriteAllText($outPath, ($payload | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))

Write-Host ''
Write-Host "[fetch] $totalItems stories across $($result.Count) countries -> data/feed-items.json" -ForegroundColor Green
if ($deadFeeds.Count) {
  Write-Host "[fetch] $($deadFeeds.Count) feed(s) failed this run: $(($deadFeeds | Select-Object -First 10) -join ', ')" -ForegroundColor DarkYellow
  Write-Host '[fetch] run scripts/check-sources.ps1 -Fix if that list keeps growing.' -ForegroundColor DarkGray
}
exit 0
