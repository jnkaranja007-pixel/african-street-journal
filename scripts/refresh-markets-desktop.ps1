#Requires -Version 5.1
<#
.SYNOPSIS
  Refreshes exchange listings (data/markets.json) from the owner's PC and pushes them.
.DESCRIPTION
  AFX (afx.kwayisi.org), the only source for company listings on Africa's exchanges,
  does not answer GitHub's runners - every request times out - but answers a desktop.
  So the daily CI job keeps refreshing index levels, and this script, run by a
  Windows scheduled task on the owner's PC, refreshes the listings.

  It works in a dedicated git worktree, never the checkout you edit in: each run resets
  that worktree to origin/main, runs scripts/update-markets.ps1, and pushes only
  data/markets.json. It refuses to run from a normal checkout, because of that reset.
.SETUP
  git worktree add --detach "..\asj-markets-refresh" origin/main      (once, from the repo)
  schtasks /Create /TN "ASJ markets refresh" /SC DAILY /ST 18:30 /F ^
    /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"<worktree>\scripts\refresh-markets-desktop.ps1\""
.NOTES
  Log: %LOCALAPPDATA%\ASJ\markets-refresh.log. Exit 0 = pushed or nothing to push.
#>
param()
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$logDir = Join-Path $env:LOCALAPPDATA 'ASJ'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'markets-refresh.log'
function Log([string]$m) { $line = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $m; Add-Content -Path $log -Value $line; Write-Host $line }

# A worktree has a .git FILE; the main checkout has a .git folder.
if (Test-Path (Join-Path $root '.git') -PathType Container) {
  Log "refusing to run in $root - this resets its folder; run it from the dedicated worktree"
  exit 1
}
Set-Location $root
[Environment]::CurrentDirectory = $root

git fetch -q origin main
if ($LASTEXITCODE -ne 0) { Log 'git fetch failed'; exit 1 }
git reset -q --hard origin/main
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\update-markets.ps1') *>> $log
if ($LASTEXITCODE -ne 0) { Log "update-markets.ps1 failed (exit $LASTEXITCODE)"; exit 1 }

git add data/markets.json
git diff --staged --quiet
if ($LASTEXITCODE -eq 0) { Log 'listings unchanged'; exit 0 }
git -c user.name='asj-markets-desktop' -c user.email='github-actions[bot]@users.noreply.github.com' `
  commit -q -m ("chore(markets): refresh exchange listings from desktop (" + (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd') + ")")
for ($attempt = 1; $attempt -le 3; $attempt++) {
  git push -q origin HEAD:main
  if ($LASTEXITCODE -eq 0) { Log 'pushed refreshed listings'; exit 0 }
  Log "push rejected (attempt $attempt); rebasing onto origin/main"
  git fetch -q origin main
  git rebase -q origin/main
  if ($LASTEXITCODE -ne 0) { git rebase --abort; Log 'rebase failed'; exit 1 }
}
Log 'push failed after 3 attempts'
exit 1
