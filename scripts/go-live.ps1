#Requires -Version 5.1
<#
.SYNOPSIS
  One command to fill the journal: runs the AI desk, validates the output, commits it,
  and prints exactly what is left to do. Safe to re-run.
.USAGE
  # 1. Taste test first (3 countries, a few cents) - check the writing before spending on 55:
  powershell -ExecutionPolicy Bypass -File scripts/go-live.ps1 -Key 'sk-ant-...' -Only ng,ke,za

  # 2. Happy with the style? Fill the whole continent:
  powershell -ExecutionPolicy Bypass -File scripts/go-live.ps1 -Key 'sk-ant-...'

  # Better than -Key (keeps the key out of your shell history):
  $env:ANTHROPIC_API_KEY = 'sk-ant-...'
  powershell -ExecutionPolicy Bypass -File scripts/go-live.ps1
.NOTES
  Nothing is committed unless the publication gate passes.
#>
param(
  [string]$Key,
  [string[]]$Only,
  [string]$Model = 'claude-haiku-4-5',
  [switch]$NoCommit
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  if ($Key) { $env:ANTHROPIC_API_KEY = $Key }
  if (-not $env:ANTHROPIC_API_KEY) {
    Write-Host ''
    Write-Host 'No API key.' -ForegroundColor Red
    Write-Host 'Get one at https://console.anthropic.com/settings/keys then re-run:' -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/go-live.ps1 -Key 'sk-ant-...'" -ForegroundColor Yellow
    exit 1
  }

  Write-Host ''
  Write-Host '=== 1/3  AI desk: searching the web and writing briefs ===' -ForegroundColor Cyan
  if ($Only) {
    Write-Host "     (taste test: $($Only -join ', '))" -ForegroundColor DarkGray
    & "$PSScriptRoot\build-briefs.ps1" -Only $Only -Model $Model
  } else {
    Write-Host '     (all 55 countries - roughly 10-25 minutes)' -ForegroundColor DarkGray
    & "$PSScriptRoot\build-briefs.ps1" -Model $Model
  }

  Write-Host ''
  Write-Host '=== 2/3  Publication gate ===' -ForegroundColor Cyan
  & "$PSScriptRoot\validate-briefs.ps1"
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Gate rejected this run - nothing committed. The previous good data is untouched.' -ForegroundColor Red
    exit 1
  }

  Write-Host ''
  Write-Host '=== 3/3  Commit ===' -ForegroundColor Cyan
  if ($NoCommit) {
    Write-Host '     -NoCommit set; leaving changes in the working tree.' -ForegroundColor DarkGray
  } else {
    git add data/briefs.js data/briefs-state.json data/archive 2>&1 | Out-Null
    git diff --staged --quiet
    if ($LASTEXITCODE -ne 0) {
      $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm UTC')
      git commit -m "content(ai-desk): fill briefs ($stamp)" | Out-Null
      Write-Host "     committed." -ForegroundColor Green
    } else {
      Write-Host '     no changes to commit.' -ForegroundColor DarkGray
    }
  }

  # Read back what actually landed, so the summary reflects the file rather than assumptions.
  $raw = [IO.File]::ReadAllText((Join-Path $root 'data\briefs.js'))
  $countries = ([regex]::Matches($raw, '(?m)^\s{2}"[a-z]{2}":\s*\[')).Count
  $stories = ([regex]::Matches($raw, '"headline":')).Count

  Write-Host ''
  Write-Host '--------------------------------------------------' -ForegroundColor DarkGray
  Write-Host " Journal filled: $stories stories across $countries countries" -ForegroundColor Green
  Write-Host '--------------------------------------------------' -ForegroundColor DarkGray
  Write-Host ''
  Write-Host ' Read it now:   powershell -File serve.ps1   then open http://localhost:5733' -ForegroundColor White
  Write-Host ' Check it:      http://localhost:5733/?selftest=1' -ForegroundColor White
  Write-Host ''
  if ($Only) {
    Write-Host ' This was a taste test. Read a few briefs; if the writing works, run the full desk:' -ForegroundColor Yellow
    Write-Host '   powershell -ExecutionPolicy Bypass -File scripts/go-live.ps1' -ForegroundColor Yellow
  } else {
    Write-Host ' Left to do (needs your GitHub account - see GO-LIVE.md):' -ForegroundColor Yellow
    Write-Host '   1. create an empty repo at https://github.com/new' -ForegroundColor Yellow
    Write-Host '   2. git remote add origin <url>  &&  git push -u origin main' -ForegroundColor Yellow
    Write-Host '   3. add the ANTHROPIC_API_KEY secret so it refreshes itself daily' -ForegroundColor Yellow
  }
  Write-Host ''
}
finally { Pop-Location }
