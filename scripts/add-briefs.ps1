#Requires -Version 5.1
<#
.SYNOPSIS
  Merge hand-written briefs into the journal without an API run.
.DESCRIPTION
  The AI desk needs API credits. This is the manual path: write briefs into a JSON
  file (same shape the desk emits) and merge them here. Countries already in the
  state file keep their stories unless the new file overrides them.

  Writes BOTH data/briefs-state.json (the merge memory) and data/briefs.js (what
  the site loads). Editing briefs.js alone would work until the next API run, which
  rebuilds from the state file and would silently drop the hand-written countries.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/add-briefs.ps1
  powershell -ExecutionPolicy Bypass -File scripts/add-briefs.ps1 -InFile data/manual-briefs.json
.NOTES
  Run scripts/validate-briefs.ps1 afterwards; it applies the same publication gate
  the daily Action uses.
#>
param(
  [string]$InFile = 'data/manual-briefs.json',
  [int]$ArchiveDays = 30
)

$ErrorActionPreference = 'Stop'
$root      = Split-Path $PSScriptRoot -Parent
$statePath = Join-Path $root 'data\briefs-state.json'
$outPath   = Join-Path $root 'data\briefs.js'
$inPath    = if ([IO.Path]::IsPathRooted($InFile)) { $InFile } else { Join-Path $root $InFile }

if (-not (Test-Path $inPath)) { Write-Host "[add] input not found: $inPath" -ForegroundColor Red; exit 1 }
$incoming = [IO.File]::ReadAllText($inPath, [Text.Encoding]::UTF8) | ConvertFrom-Json

$generated = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
$byCountry = [ordered]@{}
$dates     = [ordered]@{}
$markets   = [ordered]@{}

# Start from existing state so nothing already published is lost.
if (Test-Path $statePath) {
  $prev = [IO.File]::ReadAllText($statePath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  if ($prev.byCountry) { foreach ($p in $prev.byCountry.PSObject.Properties) { $byCountry[$p.Name] = $p.Value } }
  if ($prev.markets)   { foreach ($p in $prev.markets.PSObject.Properties)   { $markets[$p.Name]   = $p.Value } }
  if ($prev.dates)     { foreach ($p in $prev.dates.PSObject.Properties)     { $dates[$p.Name]     = $p.Value } }
}

# A fresh market file overrides whatever state carried forward. Without this the markets
# block is only ever copied: asOf values ranged from November 2025 to June 2026, and
# corrupted company names survived for weeks because data that is copied rather than
# regenerated never heals. scripts/update-markets.ps1 writes this file.
$marketsPath = Join-Path $root 'data\markets.json'
if (Test-Path $marketsPath) {
  $liveMarkets = [IO.File]::ReadAllText($marketsPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $refreshed = 0
  foreach ($p in $liveMarkets.PSObject.Properties) { $markets[[string]$p.Name] = $p.Value; $refreshed++ }
  if ($refreshed) { Write-Host "[add] refreshed markets for $refreshed countries from data/markets.json" -ForegroundColor Green }
}


# Drop individually defective stories instead of letting them fail the whole edition.
# On 27 August the desk wrote 221 sound stories across 49 countries and published none
# of them, because two were malformed: one Liberia story ran 223 words against a 220
# cap, and one Sudan story reused an articleId. Rejecting 219 good stories over three
# surplus words is the same all-or-nothing trap that kept the site stale for four days,
# just relocated into the merge.
#
# These are exactly the conditions validate-briefs refuses to publish, so filtering
# here means the gate stays strict about what reaches the site while a single bad
# story costs one story rather than the day.
$MinStoryWords = 70
$MaxStoryWords = 220
# One definition, shared with validate-briefs. These checks used to be duplicated here
# and drifted by a single character: this copy treated the curly apostrophe as a
# word-joiner and the gate did not, so a South Sudan story measured 218 words on the
# way in and 221 at the gate. The merge kept it, the gate rejected the edition, and
# 243 sound stories went unpublished.
. (Join-Path $PSScriptRoot 'story-shape.ps1')
$seenArticleIds = New-Object 'System.Collections.Generic.HashSet[string]'
function Get-StoryDefect($Story) {
  return Get-StoryShapeIssue $Story $MinStoryWords $MaxStoryWords $seenArticleIds
}
$droppedStories = New-Object System.Collections.Generic.List[string]
$added = 0
$stories = 0
foreach ($p in $incoming.PSObject.Properties) {
  $code = $p.Name
  $list = @($p.Value | Where-Object { $_.headline -and $_.body })
  if (-not $list.Count) { Write-Host "  skip $code (no usable stories)" -ForegroundColor DarkYellow; continue }
  $kept = New-Object System.Collections.Generic.List[object]
  foreach ($b in $list) {
    foreach ($s in @($b.sources)) {
      if ($s -and $s.url -and $s.url -notmatch '^https?://') {
        Write-Host "[add] FAIL $code has a non-http source URL: $($s.url)" -ForegroundColor Red
        exit 1
      }
    }
    # A defective story costs itself, not the edition.
    $defect = Get-StoryDefect $b
    if ($defect) { $droppedStories.Add("${code}: $defect"); continue }
    $kept.Add($b)
  }
  if (-not $kept.Count) { Write-Host "  skip $code (all stories defective)" -ForegroundColor DarkYellow; continue }
  $list = $kept.ToArray()
  $byCountry[$code] = $list
  $dates[$code] = $generated
  $added++
  $stories += $list.Count
  Write-Host ("  {0}  {1} stories" -f $code, $list.Count) -ForegroundColor Green
}

if ($added -eq 0) { Write-Host '[add] nothing to merge' -ForegroundColor Red; exit 1 }

function ConvertTo-JsBlock($obj) {
  $json = $obj | ConvertTo-Json -Depth 10
  if ($obj.Count -le 1) { $json = "{`n$($json.Trim('{','}'))`n}" }
  return $json
}

# The state file keeps everything. It is the desk's memory and its record, it never
# leaves the runner, and throwing ranking detail away there would make a bad night
# impossible to explain afterwards.
$state = [ordered]@{ generated = $generated; dates = $dates; byCountry = $byCountry; markets = $markets }
[IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))

# What the reader downloads is a strict subset: no duplicated body, no ranking
# telemetry. See ConvertTo-ShippableStory in story-shape.ps1 for what goes and why.
$shipBy = ConvertTo-ShippableByCountry $byCountry
$payload = "// Auto-generated by scripts/add-briefs.ps1 - manually merged briefs.`r`n" +
           "// Generated: $generated`r`n" +
           "// body is omitted where paragraphs exist; app.js rebuilds it with a blank-line join.`r`n" +
           "window.UNITED_AFRICA_BRIEFS = { generated: '$generated', dates: $(ConvertTo-JsBlock $dates), byCountry: $(ConvertTo-CountryJsBlock $shipBy), markets: $(ConvertTo-JsBlock $markets) };`r`n"
[IO.File]::WriteAllText($outPath, $payload, (New-Object Text.UTF8Encoding($false)))

# --- archive -----------------------------------------------------------------
# A journal keeps a record. build-briefs.ps1 used to write this, and when the desk
# moved to the fetch/write pipeline nothing took the job over: the newest archived
# edition was 2026-08-05 while the live paper had been rebuilt many times since, so
# the wire's "Past editions" picker was quietly frozen and the workflow was committing
# a directory that nothing wrote to.
$day = $generated.Substring(0, 10)
$archiveDir = Join-Path $root 'data\archive'
if (-not (Test-Path $archiveDir)) { New-Item -ItemType Directory -Path $archiveDir | Out-Null }

$archPayload = "// The African Street Journal - archived edition $day (auto-generated).`r`n" +
               "window.__ASJ_ARCHIVE_DAY = { date: '$day', generated: '$generated', byCountry: $(ConvertTo-CountryJsBlock $shipBy), markets: $(ConvertTo-JsBlock $markets) };`r`n"
[IO.File]::WriteAllText((Join-Path $archiveDir "$day.js"), $archPayload, (New-Object Text.UTF8Encoding($false)))

# Keep the edition picker and repository lean. Retention is inclusive of today and
# only exact YYYY-MM-DD.js files inside data/archive are eligible for deletion.
if ($ArchiveDays -gt 0) {
  $editionDay = [DateTime]::ParseExact($day, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
  $oldestKept = $editionDay.AddDays(-($ArchiveDays - 1))
  $archiveRoot = [IO.Path]::GetFullPath($archiveDir).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  foreach ($file in @(Get-ChildItem $archiveDir -File -Filter '*.js')) {
    if ($file.BaseName -notmatch '^\d{4}-\d{2}-\d{2}$') { continue }
    $fileDay = [DateTime]::ParseExact($file.BaseName, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $fullPath = [IO.Path]::GetFullPath($file.FullName)
    if ($fileDay -lt $oldestKept -and $fullPath.StartsWith($archiveRoot, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $fullPath -Force
    }
  }
}

# Rebuild the index from what is actually on disk rather than appending, so a deleted
# edition cannot leave a dangling entry the picker would 404 on.
$editions = @(Get-ChildItem $archiveDir -Filter '*.js' |
              Where-Object { $_.BaseName -match '^\d{4}-\d{2}-\d{2}$' } |
              ForEach-Object { $_.BaseName } | Sort-Object -Descending)
$indexPayload = "window.UNITED_AFRICA_ARCHIVE_INDEX = $($editions | ConvertTo-Json -Compress);`r`n"
if ($editions.Count -eq 1) { $indexPayload = "window.UNITED_AFRICA_ARCHIVE_INDEX = [`"$($editions[0])`"];`r`n" }
[IO.File]::WriteAllText((Join-Path $archiveDir 'index.js'), $indexPayload, (New-Object Text.UTF8Encoding($false)))

Write-Host "[add] merged $stories stories across $added countries; $($byCountry.Count) countries now in data/briefs.js" -ForegroundColor Green
if ($droppedStories.Count) {
  # Named, not silent. A story dropped here is one a reader will not see, and a count
  # that creeps up is the signal the writer has started producing malformed output.
  Write-Host ("[add] dropped {0} defective story(ies): {1}" -f $droppedStories.Count, (($droppedStories | Select-Object -First 6) -join '; ')) -ForegroundColor DarkYellow
}
Write-Host "[add] archived edition $day ($($editions.Count) editions on file)" -ForegroundColor Green
