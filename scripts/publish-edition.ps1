#Requires -Version 5.1
<#
.SYNOPSIS
  Commit and push the finished edition, regenerating on top of main if main moved.
.DESCRIPTION
  The desk runs for 30-40 minutes, and main can move while it works. The old commit
  step answered a rejected push with `git pull --rebase`, which cannot succeed here:
  almost everything the desk commits is GENERATED - 55 country pages, ~235 story
  pages, the sitemaps, the feed, static-pages.css - and if a developer pushed a
  template or stylesheet change meanwhile, both sides regenerated the same files and
  every one of them conflicts.

  That is how run 39579298899 was lost on 21 October 2026. Writing, merging,
  validation, the link audit and the page rebuild all passed; the push was rejected
  because site work had landed during the run; the rebase hit conflicts in 50-odd
  generated files; and 41 minutes of paid model output went with the runner.

  Generated files should never be merged. They should be made again from the merged
  source. So on a rejected push this takes the new main as it is, re-merges this run's
  stories onto it, regenerates every derived file with main's own templates, re-runs
  the publication gate, and pushes that - which is exactly what this run would have
  produced had it started a minute later. No model call and no link audit is
  repeated: data/auto-briefs.json is already the audited set (the audit step rewrites
  it to drop anything it rejected), and it is gitignored, so a hard reset leaves it
  alone.
.PARAMETER MinFreshCountries
  The gate thresholds, passed through to validate-briefs.ps1 so a targeted run keeps
  its own. Typed parameters rather than one array of arguments on purpose: an array
  handed through `powershell -File` arrives as a single string, so the gate received
  "-MinCountries" with no value and failed a perfectly sound edition.
.NOTES
  Exit 0 = published, or nothing to publish. Exit 1 = could not publish.
#>
param(
  [int]$MinCountries = 55,
  [int]$MinStoryPackages = 150,
  [int]$MinFreshCountries = 10,
  [int]$FreshStoriesPerCountry = 1,
  [string]$RequiredFreshCountries = '',
  [int]$Attempts = 3
)

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# Everything the desk publishes, in one place. Country directories are staged with
# --all so new story pages AND the seven-day sweep's deletions are both recorded.
$script:EDITION_PATHS = @(
  'data/briefs.js','data/briefs-full.js','data/briefs-state.json','data/archive',
  'sitemap.xml','news-sitemap.xml','feed.xml','robots.txt','static-pages.css','404.html',
  'about','privacy','contact','corrections','countries'
)

function Add-EditionFiles {
  # Only paths that exist. `git add a b missing` is not "add a and b": git refuses the
  # whole command on one unmatched pathspec and stages NOTHING, which the next line
  # reads as "no story changes" and exits 0. A page retired from the generator would
  # have silently stopped every future edition from publishing.
  $present = @($script:EDITION_PATHS | Where-Object { Test-Path $_ })
  $absent  = @($script:EDITION_PATHS | Where-Object { -not (Test-Path $_) })
  if ($absent.Count) { Write-Host "[publish] not present this run, skipped: $($absent -join ', ')" }
  if ($present.Count) { git add --all -- @present }
  Get-ChildItem -Directory | Where-Object { $_.Name -match '^[a-z]{2}$' } |
    ForEach-Object { git add --all -- "$($_.Name)" }
}

function Invoke-Step([string]$Label, [scriptblock]$Body) {
  & $Body
  if ($LASTEXITCODE -ne 0) { Write-Host "[publish] $Label failed (exit $LASTEXITCODE)"; return $false }
  return $true
}

# Rebuild every derived file on top of whatever main now is. Same scripts, same order,
# same gate as the workflow's own steps.
function Update-OnNewMain {
  if (-not (Test-Path 'data/auto-briefs.json')) {
    Write-Host '[publish] data/auto-briefs.json is missing - nothing to re-merge.'
    return $false
  }
  if (-not (Invoke-Step 'merge' { & powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/add-briefs.ps1 -InFile data/auto-briefs.json })) { return $false }
  $gate = @('-MinCountries', $MinCountries, '-MinStoryPackages', $MinStoryPackages,
            '-MinFreshCountries', $MinFreshCountries, '-FreshStoriesPerCountry', $FreshStoriesPerCountry)
  if ($RequiredFreshCountries) { $gate += @('-RequiredFreshCountries', $RequiredFreshCountries) }
  if (-not (Invoke-Step 'gate'  { & powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/validate-briefs.ps1 @gate })) { return $false }
  if (-not (Invoke-Step 'pages' { & powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/build-static-pages.ps1 })) { return $false }
  if (-not (Invoke-Step 'page checks' { & powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/test-static-pages.ps1 })) { return $false }
  return $true
}

function New-EditionCommit {
  Add-EditionFiles
  git diff --staged --quiet
  if ($LASTEXITCODE -eq 0) { return 'empty' }
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm UTC')
  git commit -q -m "chore(asj-desk): refresh stories ($stamp)"
  if ($LASTEXITCODE -ne 0) { return 'failed' }
  return 'committed'
}

git config user.name  'asj-news-bot'
git config user.email 'github-actions[bot]@users.noreply.github.com'

$state = New-EditionCommit
if ($state -eq 'empty')  { Write-Host '[publish] No story changes this run.'; exit 0 }
if ($state -eq 'failed') { Write-Host '[publish] Commit failed.'; exit 1 }

for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
  git push -q
  if ($LASTEXITCODE -eq 0) { Write-Host '[publish] Pushed refreshed stories.'; exit 0 }

  Write-Host "[publish] Push rejected (attempt $attempt): main moved during the run. Rebuilding the edition on top of it."
  git fetch -q origin main
  if ($LASTEXITCODE -ne 0) { Write-Host '[publish] Could not fetch main.'; exit 1 }
  # Drop our commit and every generated file with it. auto-briefs.json is gitignored,
  # so the run's stories survive this.
  git reset -q --hard origin/main
  if (-not (Update-OnNewMain)) { Write-Host '[publish] Could not rebuild the edition on the new main.'; exit 1 }

  $state = New-EditionCommit
  if ($state -eq 'empty')  { Write-Host '[publish] Main already carries this edition - nothing left to push.'; exit 0 }
  if ($state -eq 'failed') { Write-Host '[publish] Commit failed after rebuilding.'; exit 1 }
}

Write-Host "[publish] Push failed after $Attempts attempts."
exit 1
