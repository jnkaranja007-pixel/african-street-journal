#Requires -Version 5.1
<#
.SYNOPSIS
  Audits every published story against the Wall Street Journal bar and, with -Apply,
  withdraws the ones that fail.
.DESCRIPTION
  The owner asked on 18 Nov 2026 for every story in the archive that the Wall Street
  Journal would never have published to be deleted, judged through an African lens.
  The rule is Test-WsjArchiveKeep in scripts/wsj-standards.ps1: the same bar the desk
  now applies before publishing (routine crime, crashes and killings run only as
  national events; war, insurgency, coups, epidemics and disasters do), plus tabloid
  subjects and graphic headlines.

  It reads:
  - every archived edition (data/archive/<day>.js), the ones the "Past editions"
    picker loads;
  - today's edition (data/briefs-state.json);
  - every story page on disk (/<cc>/<slug>/index.html), including pages older than
    the archive (before 21 Oct 2026), judged from the page itself.

  With -Apply it removes each failing story from those files (byte-for-byte edits:
  the rest of each file is untouched), deletes its page, takes it off the
  data/earlier/<cc>.json lists, rebuilds data/briefs.js and data/briefs-full.js from
  the state file, and adds it to data/wsj-withdrawn.json. build-static-pages.ps1
  reads that list on every run, so a withdrawn page is never built again. The sitemap,
  topic pages and "Earlier stories" links catch up at the next build; until then a
  removed address lands on 404.html, which sends the reader to the country.

  Always writes the report to wsj-archive-audit.md.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/audit-wsj-archive.ps1           (report only)
  powershell -ExecutionPolicy Bypass -File scripts/audit-wsj-archive.ps1 -Apply
#>
param(
  [switch]$Apply,
  [string]$ReportFile = 'wsj-archive-audit.md'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'news-ranking.ps1')
. (Join-Path $PSScriptRoot 'wsj-standards.ps1')
$utf8 = New-Object Text.UTF8Encoding($false)
# Every phrase check builds a regex; keep them all cached across thousands of stories.
[regex]::CacheSize = 4096

# Read-StoryPageHead, taken from the page builder so both read a page the same way.
$builderSource = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'build-static-pages.ps1'), [Text.Encoding]::UTF8)
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseInput($builderSource, [ref]$tokens, [ref]$errors)
foreach ($fn in @('ConvertTo-UtcStamp', 'Read-StoryPageHead')) {
  $def = $ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $fn }, $true) | Select-Object -First 1
  if (-not $def) { throw "build-static-pages.ps1 is missing $fn" }
  Invoke-Expression $def.Extent.Text
}

# The span of the JSON object that starts at $Start ("{"), honouring strings.
# Jumps between the characters that matter (IndexOfAny) rather than walking every one:
# the archive is 14 MB, and a character loop in PowerShell took over ten minutes.
$script:JsonOutside = [char[]]@([char]34, [char]123, [char]125)   # " { }
$script:JsonInside = [char[]]@([char]34, [char]92)                # " \
function Get-ObjectEnd([string]$Text, [int]$Start) {
  $depth = 0; $inString = $false; $k = $Start
  while ($k -lt $Text.Length) {
    if ($inString) {
      $j = $Text.IndexOfAny($script:JsonInside, $k)
      if ($j -lt 0) { return -1 }
      if ($Text[$j] -eq [char]92) { $k = $j + 2; continue }
      $inString = $false; $k = $j + 1; continue
    }
    $j = $Text.IndexOfAny($script:JsonOutside, $k)
    if ($j -lt 0) { return -1 }
    $ch = $Text[$j]
    if ($ch -eq [char]34) { $inString = $true }
    elseif ($ch -eq [char]123) { $depth++ }
    else { $depth--; if ($depth -eq 0) { return $j } }
    $k = $j + 1
  }
  return -1
}

# Removes every story object whose articleId is in $Ids, with its separating comma.
# Story objects open with "articleId" in both the archive and the state file, compact
# or indented; the pattern allows either.
function Remove-StoryObjects([string]$Text, $Ids) {
  $removed = 0
  $rx = [regex]'\{\s*"articleId"\s*:\s*"(?<id>[0-9a-f]+)"'
  $pos = 0
  $sb = New-Object Text.StringBuilder
  while ($true) {
    $m = $rx.Match($Text, $pos)
    if (-not $m.Success) { [void]$sb.Append($Text.Substring($pos)); break }
    $id = $m.Groups['id'].Value
    $end = Get-ObjectEnd $Text $m.Index
    if ($end -lt 0) { throw "unbalanced story object at $($m.Index)" }
    if (-not $Ids.ContainsKey($id)) {
      [void]$sb.Append($Text.Substring($pos, $end + 1 - $pos))
      $pos = $end + 1
      continue
    }
    # Drop the object and one comma: the one after it, or else the one before it.
    $before = $Text.Substring($pos, $m.Index - $pos)
    $after = $end + 1
    $ws = [regex]::Match($Text.Substring($after), '^\s*,')
    if ($ws.Success) {
      [void]$sb.Append($before)
      $pos = $after + $ws.Length
      # Keep the indentation that led into the removed object for the next one.
    } else {
      $trimmed = [regex]::Replace($before, ',\s*$', '')
      [void]$sb.Append($trimmed)
      $pos = $after
    }
    $removed++
  }
  return [pscustomobject]@{ Text = $sb.ToString(); Removed = $removed }
}

# The byCountry block of an archive file, parsed, for judging only.
function Read-ArchiveStories([string]$Text) {
  $a = $Text.IndexOf('byCountry: ')
  $b = $Text.LastIndexOf(', markets: ')
  if ($a -lt 0) { return $null }
  $start = $Text.IndexOf('{', $a)
  $end = Get-ObjectEnd $Text $start
  if ($end -lt 0) { return $null }
  return ($Text.Substring($start, $end - $start + 1) | ConvertFrom-Json)
}

$verdicts = @{}           # articleId -> verdict record
$appearances = @{}        # articleId -> list of places it was found
function Add-Verdict([string]$Id, [string]$Code, $Story, [string]$Where) {
  if (-not $Id) { return }
  if (-not $script:verdicts.ContainsKey($Id)) {
    $v = Test-WsjArchiveKeep $Story
    $script:verdicts[$Id] = [pscustomobject]@{ id = $Id; code = $Code; headline = [string]$Story.headline; keep = $v.Keep; reason = $v.Reason; class = $v.Class; reach = (Get-WsjReach $Story); first = $Where }
    $script:appearances[$Id] = New-Object System.Collections.Generic.List[string]
  }
  $script:appearances[$Id].Add($Where)
}

# 1. Archived editions.
$archiveDir = Join-Path $root 'data\archive'
$archiveFiles = @(Get-ChildItem -Path $archiveDir -Filter '20*.js' | Sort-Object Name)
$archiveText = @{}
foreach ($f in $archiveFiles) {
  $text = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
  $archiveText[$f.FullName] = $text
  $by = Read-ArchiveStories $text
  if (-not $by) { Write-Host "[audit] $($f.Name): no byCountry block; skipped" -ForegroundColor DarkYellow; continue }
  foreach ($c in $by.PSObject.Properties) { foreach ($s in @($c.Value)) { Add-Verdict ([string]$s.articleId) $c.Name $s $f.BaseName } }
}
# 2. Today's edition.
$statePath = Join-Path $root 'data\briefs-state.json'
$stateText = [IO.File]::ReadAllText($statePath, [Text.Encoding]::UTF8)
$state = $stateText | ConvertFrom-Json
foreach ($c in $state.byCountry.PSObject.Properties) { foreach ($s in @($c.Value)) { Add-Verdict ([string]$s.articleId) $c.Name $s 'today' } }
# 3. Story pages on disk. A page whose story is in the archive takes that verdict; an
#    older page is judged from its own headline, dek and opening (no reach recorded).
$codes = @(Get-ChildItem -Path (Join-Path $root 'data\earlier') -Filter '*.json' | ForEach-Object { $_.BaseName })
$pages = New-Object System.Collections.Generic.List[object]
foreach ($c in $codes) {
  $cDir = Join-Path $root $c
  if (-not (Test-Path $cDir)) { continue }
  foreach ($sub in Get-ChildItem -Path $cDir -Directory) {
    $page = Join-Path $sub.FullName 'index.html'
    if (-not (Test-Path $page)) { continue }
    $head = Read-StoryPageHead $page
    if (-not $head.Headline -or $head.MovedTo) { continue }
    $id = if ($head.StoryId) { $head.StoryId } else { "page:$c/$($sub.Name)" }
    if (-not $verdicts.ContainsKey($id)) {
      Add-Verdict $id $c ([pscustomobject]@{ headline = $head.Headline; dek = $head.Dek; paragraphs = @($head.Opening) }) "page $c/$($sub.Name)"
    }
    $pages.Add([pscustomobject]@{ code = $c; slug = $sub.Name; dir = $sub.FullName; id = $id })
  }
}

$all = @($verdicts.Values)
$out = @($all | Where-Object { -not $_.keep } | Sort-Object code, headline)
$outIds = @{}
foreach ($v in $out) { $outIds[$v.id] = $true }
$outPages = @($pages | Where-Object { $outIds.ContainsKey($_.id) })
Write-Host "[audit] $($all.Count) distinct stories read; $($out.Count) fail the Wall Street Journal bar; $($outPages.Count) of $($pages.Count) story pages belong to them"

# The report.
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# Archive audit: the Wall Street Journal bar, through an African lens')
$lines.Add('')
$lines.Add("Run $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm')) UTC by scripts/audit-wsj-archive.ps1. Rule: Test-WsjArchiveKeep in scripts/wsj-standards.ps1.")
$lines.Add('')
$lines.Add("- Stories read: $($all.Count) (27 archived editions, today's edition, and story pages older than the archive)")
$lines.Add("- Withdrawn: $($out.Count) ($([Math]::Round(100.0 * $out.Count / [Math]::Max(1, $all.Count), 1))%)$(if (-not $Apply) { ' - report only, nothing changed' })")
$lines.Add("- Kept as conflict (war, insurgency, coup, epidemic, disaster): $(@($all | Where-Object { $_.keep -and $_.class -eq 'conflict' }).Count)")
$lines.Add("- Kept as harm with a policy or economic consequence: $(@($all | Where-Object { $_.keep -and $_.class -eq 'consequence' }).Count)")
$lines.Add("- Kept crime or casualty stories judged national events (reach 5, or reach 4 with a toll of 25 or more): $(@($all | Where-Object { $_.keep -and $_.class -eq 'routine-harm' }).Count)")
$lines.Add('')
$byReason = $out | Group-Object { ($_.reason -split ' \(')[0] } | Sort-Object Count -Descending
$lines.Add('| Reason | Stories |')
$lines.Add('|---|---|')
foreach ($g in $byReason) { $lines.Add("| $($g.Name) | $($g.Count) |") }
$lines.Add('')
$lines.Add('## Withdrawn stories')
$lines.Add('')
foreach ($v in $out) { $lines.Add("- **$($v.code.ToUpperInvariant())** $($v.headline) - $($v.reason)") }
$kept = @($all | Where-Object { $_.keep -and $_.class -ne 'none' } | Sort-Object class, code)
if ($kept.Count) {
  $lines.Add('')
  $lines.Add('## Kept although they involve deaths or violence')
  $lines.Add('')
  foreach ($v in $kept) { $lines.Add("- **$($v.code.ToUpperInvariant())** $($v.headline) - $($v.class)$(if ($v.reach) { ", reach $($v.reach)" })") }
}
[IO.File]::WriteAllText((Join-Path $root $ReportFile), (($lines.ToArray() -join "`n") + "`n"), $utf8)
Write-Host "[audit] report: $ReportFile"
if (-not $Apply) { exit 0 }

# --- apply -----------------------------------------------------------------------
$storyIds = @{}
foreach ($v in $out) { if ($v.id -notmatch '^page:') { $storyIds[$v.id] = $true } }
$fromArchive = 0
foreach ($path in @($archiveText.Keys)) {
  $r = Remove-StoryObjects $archiveText[$path] $storyIds
  if ($r.Removed) {
    [IO.File]::WriteAllText($path, $r.Text, $utf8)
    $fromArchive += $r.Removed
    $null = (Read-ArchiveStories $r.Text)   # still parses
  }
}
$rs = Remove-StoryObjects $stateText $storyIds
if ($rs.Removed) {
  $null = ($rs.Text | ConvertFrom-Json)    # still valid JSON before it is written
  [IO.File]::WriteAllText($statePath, $rs.Text, $utf8)
}
$pagesDeleted = 0
foreach ($p in $outPages) { [IO.Directory]::Delete($p.dir, $true); $pagesDeleted++ }
$outUrls = @{}
foreach ($p in $outPages) { $outUrls["/$($p.code)/$($p.slug)/"] = $true }
$listsEdited = 0
foreach ($c in $codes) {
  $lp = Join-Path $root "data\earlier\$c.json"
  $items = @([IO.File]::ReadAllText($lp, [Text.Encoding]::UTF8) | ConvertFrom-Json)
  $keepItems = @($items | Where-Object { -not $outUrls.ContainsKey([string]$_.u) })
  if ($keepItems.Count -ne $items.Count) {
    $json = if ($keepItems.Count) { ConvertTo-Json -InputObject $keepItems -Compress -Depth 3 } else { '[]' }
    [IO.File]::WriteAllText($lp, $json, $utf8)
    $listsEdited++
  }
}
# The permanent record the page builder honours.
$wdPath = Join-Path $root 'data\wsj-withdrawn.json'
$record = [ordered]@{}
if (Test-Path $wdPath) {
  $prev = [IO.File]::ReadAllText($wdPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($p in $prev.withdrawn.PSObject.Properties) { $record[$p.Name] = $p.Value }
}
$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
foreach ($v in $out) {
  $slugs = @($outPages | Where-Object { $_.id -eq $v.id } | ForEach-Object { "$($_.code)/$($_.slug)" })
  $record[$v.id] = [ordered]@{ code = $v.code; headline = $v.headline; reason = $v.reason; pages = $slugs; withdrawn = $stamp }
}
$doc = [ordered]@{ note = 'Stories withdrawn as below the Wall Street Journal bar (scripts/audit-wsj-archive.ps1). build-static-pages.ps1 never builds these pages again.'; withdrawn = $record }
[IO.File]::WriteAllText($wdPath, ($doc | ConvertTo-Json -Depth 5), $utf8)

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'rebuild-briefs-payload.ps1')
if ($LASTEXITCODE) { throw 'rebuild-briefs-payload.ps1 failed' }
Write-Host "[audit] applied: $fromArchive archived entries, $($rs.Removed) from today's edition, $pagesDeleted pages, $listsEdited earlier-story lists; recorded in data/wsj-withdrawn.json" -ForegroundColor Green
exit 0
