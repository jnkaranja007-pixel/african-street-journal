#Requires -Version 5.1
<#
.SYNOPSIS
  Refreshes exchange listings (data/markets.json) and index levels (data/indices.js)
  from the owner's PC and pushes them.
.DESCRIPTION
  AFX (afx.kwayisi.org), the only working source for African exchanges since
  african-markets.com went into maintenance on 1 Nov 2026, does not answer GitHub's
  runners or Cloudflare Workers - every request times out - but answers a desktop.
  So this script, run by a Windows scheduled task on the owner's PC, refreshes both.

  It works in a dedicated git worktree, never the checkout you edit in: each run resets
  that worktree to origin/main, runs scripts/update-markets.ps1 and
  scripts/update-indices.ps1, and pushes only data/markets.json and data/indices.js.
  It refuses to run from a normal checkout, because of that reset.
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
# Out-File -Encoding utf8: Windows PowerShell's *>> writes UTF-16, which interleaves with
# Add-Content's text and makes the log unreadable.
# Company listings (data/markets.json) and, since 17 Nov 2026, the headline index levels
# (data/indices.js). Neither source answers GitHub's runners, and a Cloudflare Worker relay
# got 522s too, so this PC is the source for both. Each script runs on its own: one
# failing does not stop the other from being published.
$failed = @()
foreach ($s in @('update-markets.ps1', 'update-indices.ps1')) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts\$s") 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
  if ($LASTEXITCODE -ne 0) { Log "$s failed (exit $LASTEXITCODE)"; $failed += $s }
}

git add data/markets.json data/indices.js
git diff --staged --quiet
if ($LASTEXITCODE -eq 0) { Log 'markets unchanged'; if ($failed.Count -eq 2) { exit 1 }; exit 0 }
git -c user.name='asj-markets-desktop' -c user.email='github-actions[bot]@users.noreply.github.com' `
  commit -q -m ("chore(markets): refresh exchange listings and indices from desktop (" + (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd') + ")")
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
