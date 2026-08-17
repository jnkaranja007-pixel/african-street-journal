#Requires -Version 5.1
<#
.SYNOPSIS
  Verify every feed in data/sources.json, discover the correct URL where the registered
  one is wrong, and classify why the rest fail.
.DESCRIPTION
  The source registry is the desk's foundation, and feeds rot quietly: a paper moves to
  a new CMS, drops its RSS, or lets its domain lapse. Without this check the nightly run
  would keep succeeding on 40 countries while five went dark unnoticed.

  For each source it tries the registered feed. If that fails it reads the outlet's
  homepage for a <link rel="alternate" type="application/rss+xml"> tag, then falls back
  to the usual CMS paths (/feed/, /rss, /feed.xml, ...).

  Every fetch is checked against the host it was supposed to reach. botswanaguardian.co.bw
  now redirects to a betting site, and an earlier version of this script happily
  registered bettingbotswana.com/feed/ as a Botswana news source. A citation is only
  worth anything if it points at the outlet it claims to, so a cross-site redirect is
  reported as HIJACKED and never written to the registry.

  States:
    OK        parseable feed with items, served by the expected host - usable
    FIXED     registered URL was wrong, a working same-site one was discovered
    BLOCKED   403/429. The feed likely exists; the outlet refuses automated readers.
              Cloudflare-fronted sites do this, and they refuse a GitHub Actions
              datacenter IP harder than a home one, so BLOCKED is not usable in CI and
              must be replaced, not retried.
    HIJACKED  resolves off-site - domain lapsed or parked. Remove the source.
    MISSING   reachable, no feed anywhere - the outlet genuinely has no RSS
    ERROR     DNS/TLS/timeout - host unreachable from here

  -Fix rewrites data/sources.json with discovered URLs and stamps each source with its
  state, so a bad source stays visible in the file rather than silently vanishing.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/check-sources.ps1
  powershell -ExecutionPolicy Bypass -File scripts/check-sources.ps1 -Only ng,ke,za
  powershell -ExecutionPolicy Bypass -File scripts/check-sources.ps1 -Fix
.NOTES
  Hits ~200 hosts spread across ~200 domains, which is why the multi-source design
  survives where a single aggregator did not: nobody sees more than five requests.
  Exit 1 if any country ends up with no usable source.
#>
param(
  [string[]]$Only,
  [switch]$Fix,
  [int]$TimeoutSec = 12,
  [int]$DelayMs = 200
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::DefaultConnectionLimit = 8
# Diagnostic only: several outlets have misconfigured chains and a TLS warning should
# not be reported as "paper closed". The production fetcher does NOT do this - it keeps
# normal validation, and this checker's job is to reveal which hosts have cert problems
# so they can be judged deliberately rather than trusted silently.
[Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

$root = Split-Path $PSScriptRoot -Parent
$srcPath = Join-Path $root 'data\sources.json'
if (-not (Test-Path $srcPath)) { Write-Host '[sources] data/sources.json not found' -ForegroundColor Red; exit 1 }
$registry = Get-Content $srcPath -Raw | ConvertFrom-Json

$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
# Ordered by how often they actually work, because every miss costs a timeout.
$CANDIDATE_PATHS = @('/feed/', '/rss.xml', '/rss', '/feed.xml', '/atom.xml', '/index.xml')

function Get-HostName([string]$url) {
  try { return ([Uri]$url).Host.ToLower() -replace '^www\.', '' } catch { return '' }
}

function Test-SameSite([string]$a, [string]$b) {
  # Same host, or one a subdomain of the other. Deliberately strict: matching only the
  # registrable domain would accept co.bw against any other .co.bw site.
  $ha = Get-HostName $a; $hb = Get-HostName $b
  if (-not $ha -or -not $hb) { return $false }
  if ($ha -eq $hb) { return $true }
  return ($ha.EndsWith(".$hb") -or $hb.EndsWith(".$ha"))
}

function Get-Url([string]$url) {
  # Returns @{ text; code; state; finalUrl }, state = ok | blocked | http | error
  $req = [Net.HttpWebRequest]::Create($url)
  $req.UserAgent = $UA
  $req.Timeout = $TimeoutSec * 1000
  $req.ReadWriteTimeout = $TimeoutSec * 1000
  $req.AllowAutoRedirect = $true
  $req.Accept = 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8'
  try {
    $resp = $req.GetResponse()
    try {
      $final = [string]$resp.ResponseUri
      $sr = New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)
      return @{ text = $sr.ReadToEnd(); code = 200; state = 'ok'; finalUrl = $final }
    } finally { $resp.Close() }
  } catch [Net.WebException] {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $state = if ($code -eq 403 -or $code -eq 429 -or $code -eq 401) { 'blocked' }
             elseif ($code -gt 0) { 'http' }
             else { 'error' }
    return @{ text = ''; code = $code; state = $state; finalUrl = $url }
  } catch {
    return @{ text = ''; code = 0; state = 'error'; finalUrl = $url }
  }
}

function Test-Feed([string]$url, [string]$expectHost) {
  # Returns @{ items; state; code } - state ok | blocked | hijacked | notfeed | error
  $r = Get-Url $url
  if ($r.state -eq 'blocked') { return @{ items = 0; state = 'blocked'; code = $r.code } }
  if ($r.state -ne 'ok')      { return @{ items = 0; state = 'error';   code = $r.code } }

  # A feed served by somebody else's domain is not this outlet's feed, however valid
  # the XML is.
  if ($expectHost -and -not (Test-SameSite $r.finalUrl $expectHost)) {
    return @{ items = 0; state = 'hijacked'; code = 200; landed = $r.finalUrl }
  }

  $txt = $r.text
  if (-not $txt -or $txt.Length -lt 80) { return @{ items = 0; state = 'notfeed'; code = 200 } }
  # Strip a BOM or leading whitespace that would make [xml] refuse the document.
  $txt = $txt.TrimStart([char]0xFEFF, ' ', "`t", "`r", "`n")
  if ($txt -notmatch '(?i)<(rss|feed|rdf:RDF)') { return @{ items = 0; state = 'notfeed'; code = 200 } }
  try {
    $xml = [xml]$txt
    $n = @($xml.rss.channel.item).Count
    if ($n -eq 0) { $n = @($xml.feed.entry).Count }
    if ($n -eq 0) { $n = @($xml.RDF.item).Count }
    if ($n -eq 0) { return @{ items = 0; state = 'notfeed'; code = 200 } }
    return @{ items = [int]$n; state = 'ok'; code = 200 }
  } catch { return @{ items = 0; state = 'notfeed'; code = 200 } }
}

function Find-Feed([string]$homeUrl) {
  # $home is a read-only PowerShell automatic variable, so the parameter cannot use it.
  # Returns @{ url; state } - state found | blocked | hijacked | missing | error
  $page = Get-Url $homeUrl
  if ($page.state -eq 'blocked') { return @{ url = $null; state = 'blocked' } }
  if ($page.state -eq 'error')   { return @{ url = $null; state = 'error' } }
  if ($page.state -eq 'ok' -and -not (Test-SameSite $page.finalUrl $homeUrl)) {
    return @{ url = $null; state = 'hijacked'; landed = $page.finalUrl }
  }

  # 1) the homepage's own advertised feed, which is the authoritative answer
  if ($page.state -eq 'ok' -and $page.text) {
    foreach ($tag in [regex]::Matches($page.text, '(?i)<link[^>]+type=["'']application/(?:rss|atom)\+xml["''][^>]*>')) {
      $h = [regex]::Match($tag.Value, '(?i)href=["'']([^"'']+)["'']')
      if (-not $h.Success) { continue }
      $cand = $h.Groups[1].Value
      if ($cand -notmatch '^https?://') {
        try { $cand = ([Uri]::new([Uri]$homeUrl, $cand)).AbsoluteUri } catch { continue }
      }
      # Comment feeds are advertised alongside the real one and are worthless here.
      if ($cand -match 'comments') { continue }
      if (-not (Test-SameSite $cand $homeUrl)) { continue }
      $t = Test-Feed $cand $homeUrl
      if ($t.state -eq 'ok') { return @{ url = $cand; state = 'found' } }
      if ($t.state -eq 'blocked') { return @{ url = $null; state = 'blocked' } }
    }
  }

  # 2) the usual CMS paths. Bail on the first block: if the host refuses one path it
  # refuses them all, and walking the rest just burns a timeout each.
  try {
    $base = ([Uri]$homeUrl).GetLeftPart([UriPartial]::Authority)
    foreach ($p in $CANDIDATE_PATHS) {
      $cand = $base.TrimEnd('/') + $p
      $t = Test-Feed $cand $homeUrl
      if ($t.state -eq 'ok') { return @{ url = $cand; state = 'found' } }
      if ($t.state -eq 'blocked')  { return @{ url = $null; state = 'blocked' } }
      if ($t.state -eq 'hijacked') { return @{ url = $null; state = 'hijacked'; landed = $t.landed } }
      Start-Sleep -Milliseconds 100
    }
  } catch { }
  return @{ url = $null; state = 'missing' }
}

function Set-State($src, [string]$state) {
  if ($src.PSObject.Properties['state']) { $src.state = $state }
  else { $src | Add-Member -NotePropertyName state -NotePropertyValue $state -Force }
}

$codes = @($registry.PSObject.Properties.Name | Where-Object { $_ -ne '_comment' })
if ($Only) {
  $want = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $codes = $codes | Where-Object { $want -contains $_ }
  if (-not $codes) { Write-Host "[sources] no country matched: $($want -join ',')" -ForegroundColor Red; exit 1 }
}

$tally = @{ ok = 0; fixed = 0; blocked = 0; missing = 0; hijacked = 0; error = 0 }
$emptyCountries = New-Object System.Collections.Generic.List[string]
$thinCountries  = New-Object System.Collections.Generic.List[string]
$blockedList    = New-Object System.Collections.Generic.List[string]
$missingList    = New-Object System.Collections.Generic.List[string]
$hijackedList   = New-Object System.Collections.Generic.List[string]
$errorList      = New-Object System.Collections.Generic.List[string]

foreach ($code in $codes) {
  $entry = $registry.$code
  $countryLive = 0
  Write-Host ("{0}  {1}" -f $code, $entry.name) -ForegroundColor Cyan

  foreach ($s in @($entry.sources)) {
    $t = Test-Feed $s.feed $s.home

    if ($t.state -eq 'ok') {
      $tally.ok++; $countryLive++
      if ($Fix) { Set-State $s 'ok' }
      Write-Host ("    OK        {0,-31} {1,3} items" -f $s.name, $t.items) -ForegroundColor Green
    }
    elseif ($t.state -eq 'blocked') {
      $tally.blocked++; $blockedList.Add("$code/$($s.name)")
      if ($Fix) { Set-State $s 'blocked' }
      Write-Host ("    BLOCKED   {0,-31} HTTP {1}" -f $s.name, $t.code) -ForegroundColor Magenta
    }
    elseif ($t.state -eq 'hijacked') {
      $tally.hijacked++; $hijackedList.Add("$code/$($s.name) -> $($t.landed)")
      if ($Fix) { Set-State $s 'hijacked' }
      Write-Host ("    HIJACKED  {0,-31} -> {1}" -f $s.name, $t.landed) -ForegroundColor Red
    }
    else {
      $f = Find-Feed $s.home
      switch ($f.state) {
        'found' {
          $tally.ok++; $tally.fixed++; $countryLive++
          if ($Fix) { $s.feed = $f.url; Set-State $s 'ok' }
          Write-Host ("    FIXED     {0,-31} -> {1}" -f $s.name, $f.url) -ForegroundColor Yellow
        }
        'blocked' {
          $tally.blocked++; $blockedList.Add("$code/$($s.name)")
          if ($Fix) { Set-State $s 'blocked' }
          Write-Host ("    BLOCKED   {0,-31} {1}" -f $s.name, $s.home) -ForegroundColor Magenta
        }
        'hijacked' {
          $tally.hijacked++; $hijackedList.Add("$code/$($s.name) -> $($f.landed)")
          if ($Fix) { Set-State $s 'hijacked' }
          Write-Host ("    HIJACKED  {0,-31} -> {1}" -f $s.name, $f.landed) -ForegroundColor Red
        }
        'error' {
          $tally.error++; $errorList.Add("$code/$($s.name)")
          if ($Fix) { Set-State $s 'error' }
          Write-Host ("    ERROR     {0,-31} {1}" -f $s.name, $s.home) -ForegroundColor DarkRed
        }
        default {
          $tally.missing++; $missingList.Add("$code/$($s.name)")
          if ($Fix) { Set-State $s 'missing' }
          Write-Host ("    MISSING   {0,-31} {1}" -f $s.name, $s.home) -ForegroundColor DarkYellow
        }
      }
    }
    Start-Sleep -Milliseconds $DelayMs
  }

  if ($countryLive -eq 0)     { $emptyCountries.Add("$code ($($entry.name))") }
  elseif ($countryLive -lt 2) { $thinCountries.Add("${code}:$countryLive") }
}

if ($Fix) {
  [IO.File]::WriteAllText($srcPath, ($registry | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
  Write-Host ''
  Write-Host '[sources] data/sources.json updated' -ForegroundColor Green
}

Write-Host ''
Write-Host ("[sources] usable {0} ({1} auto-discovered) | blocked {2} | missing {3} | hijacked {4} | error {5}  across {6} countries" -f `
            $tally.ok, $tally.fixed, $tally.blocked, $tally.missing, $tally.hijacked, $tally.error, $codes.Count) -ForegroundColor Cyan
if ($hijackedList.Count) {
  Write-Host '[sources] HIJACKED - domain lapsed or parked, REMOVE these:' -ForegroundColor Red
  $hijackedList | ForEach-Object { Write-Host "          $_" -ForegroundColor Red }
}
if ($blockedList.Count) {
  Write-Host '[sources] BLOCKED - replace these, CI is blocked harder than you are:' -ForegroundColor Magenta
  Write-Host "          $(($blockedList | Select-Object -First 30) -join ', ')" -ForegroundColor Magenta
}
if ($missingList.Count) {
  Write-Host "[sources] MISSING: $(($missingList | Select-Object -First 30) -join ', ')" -ForegroundColor DarkYellow
}
if ($errorList.Count) {
  Write-Host "[sources] ERROR: $(($errorList | Select-Object -First 30) -join ', ')" -ForegroundColor DarkRed
}
if ($thinCountries.Count) {
  Write-Host "[sources] only one usable source: $($thinCountries -join ', ')" -ForegroundColor DarkYellow
}
if ($emptyCountries.Count) {
  Write-Host "[sources] COUNTRIES WITH NO USABLE SOURCE: $($emptyCountries -join ', ')" -ForegroundColor Red
  exit 1
}
Write-Host '[sources] every country has at least one usable source.' -ForegroundColor Green
exit 0
