#Requires -Version 5.1
<#
.SYNOPSIS
  Run the current ASJ gather, write, publication, audit and static-page pipeline.
.USAGE
  $env:OPENROUTER_API_KEY = 'sk-or-v1-...'
  powershell -ExecutionPolicy Bypass -File scripts/go-live.ps1 -Only ng,ke,za -NoCommit
  powershell -ExecutionPolicy Bypass -File scripts/go-live.ps1
.NOTES
  A limited run must publish one complete fresh country desk. A full run must publish
  five fresh stories for at least 50 countries before anything can be committed.
#>
param(
  [string]$Key,
  [string[]]$Only,
  [string]$Model = 'google/gemini-2.5-flash',
  [switch]$NoCommit
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  if ($Key) { $env:OPENROUTER_API_KEY = $Key }
  if (-not $env:OPENROUTER_API_KEY) {
    Write-Host '[desk] OPENROUTER_API_KEY is not set.' -ForegroundColor Red
    Write-Host "Set `$env:OPENROUTER_API_KEY, then run this command again." -ForegroundColor Yellow
    exit 1
  }

  $scope = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
  $scopeArg = $scope -join ','

  Write-Host '[1/5] Gather and rank six candidates per country' -ForegroundColor Cyan
  if ($scope.Count) { & "$PSScriptRoot\fetch-news.ps1" -Only $scopeArg }
  else { & "$PSScriptRoot\fetch-news.ps1" }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host '[2/5] Write five original on-site stories per complete desk' -ForegroundColor Cyan
  if ($scope.Count) {
    & "$PSScriptRoot\write-briefs.ps1" -Only $scopeArg -Model $Model -JsonMode -OutFile data/auto-briefs.json
  } else {
    & "$PSScriptRoot\write-briefs.ps1" -Model $Model -JsonMode -OutFile data/auto-briefs.json
  }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host '[3/5] Merge and enforce the publication gate' -ForegroundColor Cyan
  & "$PSScriptRoot\add-briefs.ps1" -InFile data/auto-briefs.json
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if ($scope.Count) {
    & "$PSScriptRoot\validate-briefs.ps1" -MinCountries 50 -MinStoryPackages (5 * $scope.Count) -MinFreshCountries $scope.Count -RequiredFreshCountries $scopeArg
  } else {
    & "$PSScriptRoot\validate-briefs.ps1" -MinCountries 55 -MinStoryPackages 250 -MinFreshCountries 50
  }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host '[4/5] Verify citations and rebuild crawlable editions' -ForegroundColor Cyan
  & "$PSScriptRoot\audit-briefs.ps1" -CheckLinks -Worst 8
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & "$PSScriptRoot\build-static-pages.ps1"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  Write-Host '[5/5] Commit the verified edition' -ForegroundColor Cyan
  if ($NoCommit) {
    Write-Host '[desk] -NoCommit set; verified changes remain in the working tree.' -ForegroundColor DarkGray
  } else {
    git add data/briefs.js data/briefs-state.json data/archive sitemap.xml robots.txt
    Get-ChildItem -Directory | Where-Object { $_.Name -match '^[a-z]{2}$' } | ForEach-Object { git add "$($_.Name)/index.html" }
    git diff --staged --quiet
    if ($LASTEXITCODE -ne 0) {
      $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm UTC')
      git commit -m "content(asj-desk): publish stories ($stamp)"
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } else {
      Write-Host '[desk] No story changes to commit.' -ForegroundColor DarkGray
    }
  }

  $raw = [IO.File]::ReadAllText((Join-Path $root 'data\briefs.js'))
  $countries = ([regex]::Matches($raw, '(?m)^\s{2}"[a-z]{2}":\s*\[')).Count
  $stories = ([regex]::Matches($raw, '"headline":')).Count
  Write-Host "[desk] Verified edition: $stories stories across $countries countries." -ForegroundColor Green
}
finally {
  Pop-Location
}
