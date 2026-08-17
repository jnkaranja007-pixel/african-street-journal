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
  powershell -ExecutionPolicy Bypass -File scripts/fetch-news.ps1 -Days 2 -PerCountry 12
.NOTES
  Exit 0 if any country returned items, 1 if every feed failed, which means something
  systemic rather than a quiet news day. Run scripts/check-sources.ps1 first if the
  registry has not been verified lately; this script skips sources the checker marked
  blocked or missing.
#>
param(
  [string[]]$Only,
  [int]$Days = 2,
  [int]$PerCountry = 10,
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
$registry = Get-Content $srcPath -Raw | ConvertFrom-Json

$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

# Words that carry no topical signal, so clustering is not fooled by shared grammar.
$STOP = @{}
foreach ($w in @('about','after','against','among','announced','around','because','been','before','being','between',
                 'could','during','from','have','into','more','most','over','said','says','should','since','than',
                 'that','their','them','then','there','these','they','this','those','through','under','until','were',
                 'what','when','where','which','while','will','with','would','your','news','report','reports','new')) {
  $STOP[$w] = $true
}

# Topical weighting. The desk is a business and current-affairs paper, so a story about
# the charcoal price outranks a comedy festival even when both are fresh and tier 1.
# Matched against the lowercased headline as substrings, so stems catch their variants.
$HARD_NEWS = @('inflation','price','prices','rate','rates','bank','budget','tax','levy','tariff','debt','bond',
               'gdp','growth','economy','economic','currency','exchange','shilling','naira','rand','cedi','birr',
               'kwacha','dinar','dirham','franc','export','import','trade','investment','investor','imf','world bank',
               'harvest','crop','maize','wheat','cocoa','coffee','drought','flood','famine','fuel','diesel','petrol',
               'power','electricity','mine','mining','oil','gas','election','parliament','minister','president',
               'court','ruling','strike','protest','security','attack','health','hospital','outbreak','cholera',
               'school','university','unemployment','jobs','wage','census','refugee','summit','treaty','sanctions')
$SOFT_NEWS = @('comedy','festival','celebrity','wedding','romance','dating','gossip','horoscope','recipe','fashion',
               'red carpet','sex ','lingerie','net worth','betting','odds','jackpot','lottery','showbiz','soap opera',
               'reality tv','pageant','miss ','bouquet','valentine','lifestyle','review: ','opinion: ','my take')

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
  # Several outlets publish UTF-8 bytes their own CMS already decoded as Windows-1252
  # once, so a curly quote arrives as three Latin-1 characters. Round-tripping back
  # through 1252 recovers the original. Only kept when it actually reduces the damage,
  # since CP1252 cannot represent every character and would otherwise insert filler.
  if (-not $s) { return $s }
  if ($s -notmatch $MOJI_PATTERN) { return $s }
  try {
    $bytes = [Text.Encoding]::GetEncoding(1252).GetBytes($s)
    $fixed = [Text.Encoding]::UTF8.GetString($bytes)
    if ($fixed.Contains($REPL_CHAR)) { return $s }
    $before = ([regex]::Matches($s,     $MOJI_PATTERN)).Count
    $after  = ([regex]::Matches($fixed, $MOJI_PATTERN)).Count
    if ($after -lt $before) { return $fixed }
  } catch { }
  return $s
}

function Clear-Html([string]$s) {
  if (-not $s) { return '' }
  $s = $s -replace '(?s)<script.*?</script>', ' ' -replace '(?s)<style.*?</style>', ' '
  $s = $s -replace '<[^>]+>', ' '
  $s = $s -replace '&nbsp;', ' ' -replace '&amp;', '&' -replace '&quot;', '"' -replace '&#8217;', "'" -replace '&#039;', "'" -replace '&lt;', '<' -replace '&gt;', '>'
  $s = Repair-Mojibake $s
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
    if ($link -notmatch '^https?://') { continue }

    $summary = Clear-Html (Get-NodeText $n.description)
    if (-not $summary) { $summary = Clear-Html (Get-NodeText $n.summary) }
    if (-not $summary) { $summary = Clear-Html (Get-NodeText $n.encoded) }
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

function Get-Signature([string]$title) {
  # Significant words only, deduped. Clustering compares these sets, so two outlets
  # writing different headlines about one event still land together.
  $words = ($title.ToLower() -replace '[^a-z0-9 ]', ' ') -split '\s+'
  $set = @{}
  foreach ($w in $words) {
    if ($w.Length -le 3) { continue }
    if ($STOP.ContainsKey($w)) { continue }
    $set[$w] = $true
  }
  return $set
}

function Get-Overlap($a, $b) {
  # Jaccard similarity of two word sets.
  if ($a.Count -eq 0 -or $b.Count -eq 0) { return 0.0 }
  $shared = 0
  foreach ($k in $a.Keys) { if ($b.ContainsKey($k)) { $shared++ } }
  $union = $a.Count + $b.Count - $shared
  if ($union -le 0) { return 0.0 }
  return [double]$shared / [double]$union
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

  $pool = New-Object System.Collections.Generic.List[object]
  $liveSources = 0
  foreach ($s in $usable) {
    try {
      $items = Read-Feed $s.feed
      if ($items.Count) { $liveSources++ }
      foreach ($it in $items) {
        if ($it.published -and $it.published -lt $cutoff) { continue }
        $pool.Add([pscustomobject]@{
          title     = $it.title
          url       = $it.url
          summary   = $it.summary
          published = $it.published
          source    = $s.name
          tier      = [int]$s.tier
        })
      }
    } catch {
      $deadFeeds.Add("$code/$($s.name)")
    }
    Start-Sleep -Milliseconds $DelayMs
  }

  if (-not $pool.Count) {
    Write-Host ("  {0}  {1,-26} nothing in the last $Days days" -f $code, $name) -ForegroundColor DarkYellow
    continue
  }

  # --- cluster the same story across outlets --------------------------------
  $clusters = New-Object System.Collections.Generic.List[object]
  foreach ($item in $pool) {
    $sig = Get-Signature $item.title
    if ($sig.Count -lt 2) { continue }
    $placed = $false
    foreach ($c in $clusters) {
      if ((Get-Overlap $sig $c.sig) -ge 0.4) {
        $c.members.Add($item)
        $placed = $true
        break
      }
    }
    if (-not $placed) {
      $m = New-Object System.Collections.Generic.List[object]
      $m.Add($item)
      $clusters.Add([pscustomobject]@{ sig = $sig; members = $m })
    }
  }

  # --- score ----------------------------------------------------------------
  $scored = New-Object System.Collections.Generic.List[object]
  foreach ($c in $clusters) {
    $outlets = @($c.members | ForEach-Object { $_.source } | Sort-Object -Unique)
    # Best representative: highest tier, then the fullest lede, since that is what
    # gives the writer a figure to lead with.
    $best = @($c.members | Sort-Object -Property @{ Expression = { $_.tier } },
                                                 @{ Expression = { $_.summary.Length }; Descending = $true })[0]

    $score = 0.0
    # Corroboration dominates. Two outlets on a story is a strong signal; the cap stops
    # a wire pickup echoed by every paper from crowding out everything else.
    $score += [Math]::Min($outlets.Count - 1, 3) * 3.0
    $score += switch ($best.tier) { 1 { 2.0 } 2 { 1.0 } default { 0.0 } }
    if ($best.summary) { $score += 1.5 }
    if ($best.summary.Length -gt 180) { $score += 0.5 }
    if ($best.published) {
      $ageH = ($now - $best.published).TotalHours
      if ($ageH -le 24) { $score += 2.0 } elseif ($ageH -le 48) { $score += 1.0 }
    }

    # Subject matter. Without this every tier-1 item ties on score and the quota fills
    # with whatever that outlet happened to publish, comedy listings included.
    $hl = $best.title.ToLower()
    $hard = 0; $soft = 0
    foreach ($k in $HARD_NEWS) { if ($hl.Contains($k)) { $hard++; if ($hard -ge 3) { break } } }
    foreach ($k in $SOFT_NEWS) { if ($hl.Contains($k)) { $soft++; break } }
    $score += [Math]::Min($hard, 3) * 1.2
    if ($soft) { $score -= 3.0 }

    $scored.Add([pscustomobject]@{
      title         = $best.title
      url           = $best.url
      summary       = $best.summary
      source        = $best.source
      corroboration = $outlets.Count
      alsoIn        = @($outlets | Where-Object { $_ -ne $best.source } | Select-Object -First 3)
      published     = if ($best.published) { $best.published.ToString('yyyy-MM-ddTHH:mm:ssZ') } else { '' }
      score         = [Math]::Round($score, 2)
    })
  }

  # Diversity-capped selection. Straight score ordering let one tier-1 outlet take every
  # slot - Kenya published ten Business Daily items while three other papers sat unused -
  # because tier is a per-source constant, so all its stories tie above everyone else's.
  # Cap each outlet, then top up from the leftovers if the quota is short.
  $ordered = @($scored | Sort-Object -Property score -Descending)
  $cap = [Math]::Max(2, [int][Math]::Ceiling($PerCountry / [Math]::Max(1, $liveSources)))
  $picked = New-Object System.Collections.Generic.List[object]
  $usedBy = @{}
  foreach ($s in $ordered) {
    if ($picked.Count -ge $PerCountry) { break }
    $n = 0
    if ($usedBy.ContainsKey($s.source)) { $n = $usedBy[$s.source] }
    if ($n -ge $cap) { continue }
    $picked.Add($s)
    $usedBy[$s.source] = $n + 1
  }
  # Top up to the quota, but keep a ceiling: an unlimited top-up handed Zimbabwe eight
  # of ten slots to one paper once the other two ran dry. Publishing eight good stories
  # from three outlets beats ten from one.
  if ($picked.Count -lt $PerCountry) {
    foreach ($s in $ordered) {
      if ($picked.Count -ge $PerCountry) { break }
      if ($picked -contains $s) { continue }
      $n = 0
      if ($usedBy.ContainsKey($s.source)) { $n = $usedBy[$s.source] }
      if ($n -ge ($cap * 2)) { continue }
      $picked.Add($s)
      $usedBy[$s.source] = $n + 1
    }
  }
  $ranked = $picked.ToArray()
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
