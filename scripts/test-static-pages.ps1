#Requires -Version 5.1
<#
.SYNOPSIS
  Guard the crawlable country pages: dates must be ISO-8601 and pages must exist for
  every country that has stories.
.DESCRIPTION
  On 28 August every country page shipped "dateModified":"08/28/2026". schema.org
  requires ISO-8601, so Google discarded the field, and the same string was printed to
  readers as "updated 08/28/2026" - a US ordering on a pan-African paper, ambiguous on
  every day before the 13th of a month.

  The cause was ConvertFrom-Json under pwsh returning [datetime] where PowerShell 5.1
  returns a string, and the page builder taking Substring(0,10) of the culture-dependent
  rendering. It could not reproduce locally, which is exactly why it needs a test that
  feeds the [datetime] shape in deliberately rather than whatever this shell happens to
  produce.
.PARAMETER UnitOnly
  Run the normalisation tests and skip the checks on built pages. The desk's pre-flight
  step uses this: before a run, the pages on disk are the previous edition's, already
  checked when they were built, and a new page check would fail every run until the
  pages were next rebuilt - which that failing run would never get to do. The check
  after the build step runs everything.
#>
param([switch]$UnitOnly)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'story-shape.ps1')

$fail = 0
function Check([string]$label, [bool]$ok, [string]$detail) {
  if ($ok) { Write-Host "  PASS  $label" -ForegroundColor Green }
  else { Write-Host "  FAIL  $label - $detail" -ForegroundColor Red; $script:fail++ }
}

Write-Host '[static-pages] date normalisation'

# The shape pwsh hands the builder. This is the case that broke production; asserting
# on the local shell's own output would have passed while CI shipped US dates.
$d = Get-IsoDay ([datetime]::Parse('2026-08-28T17:56:13Z'))
Check 'a [datetime] normalises to ISO' ($d -eq '2026-08-28') "got '$d'"

$s = Get-IsoDay '2026-08-28T17:56:13+00:00'
Check 'an ISO string normalises to ISO' ($s -eq '2026-08-28') "got '$s'"

$o = Get-IsoDay ([DateTimeOffset]::Parse('2026-08-28T17:56:13+03:00'))
Check 'a DateTimeOffset normalises to ISO' ($o -eq '2026-08-28') "got '$o'"

Check 'null yields empty, not a crash' ((Get-IsoDay $null) -eq '') 'expected empty string'
Check 'unparseable yields empty' ((Get-IsoDay 'not a date') -eq '') 'expected empty string'

# A US-format stamp must never survive normalisation, whatever the runner's culture.
$us = Get-IsoDay '08/28/2026 17:56:13'
Check 'a US-format stamp is rejected, not passed through' ($us -eq '') "got '$us'"

Write-Host '[static-pages] published artefacts'

$pages = @(Get-ChildItem -Path $root -Directory |
  Where-Object { $_.Name -match '^[a-z]{2}$' } |
  ForEach-Object { Join-Path $_.FullName 'index.html' } |
  Where-Object { Test-Path $_ })

if ($UnitOnly) {
  Write-Host '  SKIP  built pages (-UnitOnly: checked after the build step)' -ForegroundColor Yellow
} elseif ($pages.Count -eq 0) {
  Write-Host '  SKIP  no country pages built yet' -ForegroundColor Yellow
} else {
  $bad = New-Object System.Collections.Generic.List[string]
  foreach ($p in $pages) {
    $html = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)
    foreach ($m in [regex]::Matches($html, '"dateModified":"([^"]*)"')) {
      if ($m.Groups[1].Value -notmatch '^\d{4}-\d{2}-\d{2}$') {
        $bad.Add("$(Split-Path (Split-Path $p -Parent) -Leaf)=$($m.Groups[1].Value)")
      }
    }
  }
  Check "all $($pages.Count) country pages carry an ISO dateModified" ($bad.Count -eq 0) ($bad -join ', ')

  # Every story block opens the article it closes. The opening tag went missing once and
  # nothing noticed: browsers tolerate a stray </article>, so the pages rendered - just
  # without the spacing and dividers each story is meant to have.
  $unbalanced = New-Object System.Collections.Generic.List[string]
  foreach ($p in $pages) {
    $html = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)
    $open = [regex]::Matches($html, '<article[\s>]').Count
    $close = [regex]::Matches($html, '</article>').Count
    if ($open -ne $close) { $unbalanced.Add("$(Split-Path (Split-Path $p -Parent) -Leaf)=$open/$close") }
  }
  Check "all $($pages.Count) country pages open every article they close" ($unbalanced.Count -eq 0) (($unbalanced | Select-Object -First 5) -join ', ')

  # Each country page advertises /<cc>/feed.xml. The feed must exist, parse as RSS, and
  # carry only that country's stories (every item's link is under /<cc>/).
  $badFeeds = New-Object System.Collections.Generic.List[string]
  foreach ($p in $pages) {
    $cc = Split-Path (Split-Path $p -Parent) -Leaf
    $feedPath = Join-Path (Split-Path $p -Parent) 'feed.xml'
    if (-not (Test-Path $feedPath)) { $badFeeds.Add("$cc=missing"); continue }
    try {
      $xml = [xml][IO.File]::ReadAllText($feedPath, [Text.Encoding]::UTF8)
      $links = @($xml.rss.channel.item | ForEach-Object { [string]$_.link })
      $foreign = @($links | Where-Object { $_ -notmatch "/$cc/[^/]+/$" })
      if ($foreign.Count) { $badFeeds.Add("$cc=$($foreign.Count) foreign item(s)") }
    } catch { $badFeeds.Add("$cc=not XML") }
  }
  Check "all $($pages.Count) country feeds parse and carry only their own stories" ($badFeeds.Count -eq 0) (($badFeeds | Select-Object -First 5) -join ', ')

  # Every story page kept on disk is in sitemap.xml (kept pages were orphaned until
  # Nov 2026), and every "Earlier stories" link on a country page resolves.
  $sitemapPath = Join-Path $root 'sitemap.xml'
  $inSitemap = @{}
  if (Test-Path $sitemapPath) {
    foreach ($m in [regex]::Matches([IO.File]::ReadAllText($sitemapPath, [Text.Encoding]::UTF8), '<loc>https?://[^/<]+/([a-z]{2})/([^/<]+)/</loc>')) { $inSitemap[$m.Groups[1].Value + '/' + $m.Groups[2].Value] = $true }
  }
  # One full page per story: an older address of a story (its headline was rewritten in
  # a later edition) is a redirect to the story's page, and is not in the sitemap.
  $storyDirs = New-Object System.Collections.Generic.List[string]
  $byTail = @{}
  $twice = New-Object System.Collections.Generic.List[string]
  $badMoves = New-Object System.Collections.Generic.List[string]
  foreach ($cd in Get-ChildItem -Path $root -Directory | Where-Object { $_.Name -match '^[a-z]{2}$' }) {
    foreach ($sd in Get-ChildItem -Path $cd.FullName -Directory) {
      $f = Join-Path $sd.FullName 'index.html'
      if (-not (Test-Path $f)) { continue }
      $fs = [IO.File]::OpenRead($f)
      try { $buf = New-Object byte[] 8192; $n = $fs.Read($buf, 0, $buf.Length) } finally { $fs.Dispose() }
      $text = [Text.Encoding]::UTF8.GetString($buf, 0, $n)
      $mv = [regex]::Match($text, '<meta http-equiv="refresh" content="0; url=https?://[^/"]+/([a-z]{2})/([^/"]+)/"')
      if ($mv.Success) {
        if (-not (Test-Path (Join-Path (Join-Path $root $mv.Groups[1].Value) (Join-Path $mv.Groups[2].Value 'index.html')))) { $badMoves.Add("$($cd.Name)/$($sd.Name)") }
        continue
      }
      $storyDirs.Add("$($cd.Name)/$($sd.Name)")
      if ($sd.Name -match '-([0-9a-f]{6})$') {
        $t = "$($cd.Name)/$($matches[1])"
        if (-not $byTail.ContainsKey($t)) { $byTail[$t] = New-Object System.Collections.Generic.List[string] }
        $byTail[$t].Add($f)
      }
    }
  }
  # Pages sharing an address tail are read in full for the article id ("Read in ASJ").
  foreach ($t in @($byTail.Keys)) {
    if ($byTail[$t].Count -lt 2) { continue }
    $ids = @{}
    foreach ($f in $byTail[$t]) {
      $m = [regex]::Match([IO.File]::ReadAllText($f, [Text.Encoding]::UTF8), 'story=id%3A([0-9a-f]+)')
      if (-not $m.Success) { continue }
      $page = "$t/" + (Split-Path (Split-Path $f -Parent) -Leaf)
      if ($ids.ContainsKey($m.Groups[1].Value)) { $twice.Add("$page = $($ids[$m.Groups[1].Value])") } else { $ids[$m.Groups[1].Value] = $page }
    }
  }
  $missing = @($storyDirs | Where-Object { -not $inSitemap.ContainsKey($_) })
  Check "all $($storyDirs.Count) story pages on disk are in the sitemap" ($missing.Count -eq 0) (($missing | Select-Object -First 5) -join ', ')
  Check 'no story has two full pages' ($twice.Count -eq 0) "$($twice.Count): $(($twice | Select-Object -First 3) -join '; ')"
  Check 'every moved story address lands on a page' ($badMoves.Count -eq 0) (($badMoves | Select-Object -First 5) -join ', ')
  $deadEarlier = New-Object System.Collections.Generic.List[string]
  foreach ($p in $pages) {
    $html = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)
    $block = [regex]::Match($html, '(?s)aria-label="Earlier stories">(.*?)</nav>').Groups[1].Value
    foreach ($m in [regex]::Matches($block, 'href="https?://[^/"]+/([a-z]{2})/([^/"]+)/"')) {
      if (-not (Test-Path (Join-Path (Join-Path $root $m.Groups[1].Value) (Join-Path $m.Groups[2].Value 'index.html')))) { $deadEarlier.Add($m.Groups[1].Value + '/' + $m.Groups[2].Value) }
    }
  }
  Check 'every "Earlier stories" link resolves' ($deadEarlier.Count -eq 0) (($deadEarlier | Select-Object -First 5) -join ', ')

  # The app's lists (data/earlier/<cc>.json): one per country page, valid JSON, every
  # link a story page that exists.
  $badLists = New-Object System.Collections.Generic.List[string]
  foreach ($p in $pages) {
    $cc = Split-Path (Split-Path $p -Parent) -Leaf
    $listPath = Join-Path $root "data\earlier\$cc.json"
    if (-not (Test-Path $listPath)) { $badLists.Add("$cc=missing"); continue }
    try {
      foreach ($e in @([IO.File]::ReadAllText($listPath, [Text.Encoding]::UTF8) | ConvertFrom-Json | ForEach-Object { $_ })) {
        if ([string]$e.u -notmatch '^/([a-z]{2})/([a-z0-9-]+)/$' -or -not (Test-Path (Join-Path $root ($matches[1] + '\' + $matches[2] + '\index.html')))) { $badLists.Add("$cc=$($e.u)") }
      }
    } catch { $badLists.Add("$cc=not JSON") }
  }
  Check "all $($pages.Count) earlier-story lists parse and link to pages that exist" ($badLists.Count -eq 0) (($badLists | Select-Object -First 5) -join ', ')
}

if ($fail) { Write-Host "[static-pages] $fail check(s) failed" -ForegroundColor Red; exit 1 }
Write-Host '[static-pages] OK - dates normalise on type and every page carries an ISO stamp' -ForegroundColor Green
$global:LASTEXITCODE = 0
exit 0
