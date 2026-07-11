#Requires -Version 5.1
<#
.SYNOPSIS
  Refreshes the World Bank economy layer (GDP, growth, 2011+ GDP series) for all 55
  countries, patches it into data/app-data.js, then re-runs split-app-data.ps1 so
  data/app-core.js picks it up. No API key needed — the World Bank API is open.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/build-economy.ps1
.NOTES
  Run yearly (new WB actuals land each spring), or wire into GitHub Actions on a
  monthly cron. Countries the API has no data for keep their previous values.
#>
param()
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ISO2 = @('dz','ao','bj','bw','bf','bi','cm','cv','cf','td','km','cg','cd','ci','dj','eg','gq','er','sz','et',
         'ga','gm','gh','gn','gw','ke','ls','lr','ly','mg','mw','ml','mr','mu','ma','mz','na','ne','ng','rw',
         'st','sn','sc','sl','so','za','ss','sd','tz','tg','tn','ug','zm','zw')  # eh (W. Sahara) has no WB data

function Get-Indicator($iso, $indicator, $range) {
  $url = "https://api.worldbank.org/v2/country/$iso/indicator/$indicator" + "?format=json&per_page=40&date=$range"
  try {
    $resp = Invoke-RestMethod -Uri $url -TimeoutSec 30
    if ($resp -and $resp.Count -ge 2 -and $resp[1]) { return @($resp[1]) }
  } catch { Write-Host "    $iso $indicator failed: $($_.Exception.Message)" -ForegroundColor Yellow }
  return @()
}

$economy = [ordered]@{}
foreach ($iso in $ISO2) {
  Write-Host "  $iso" -ForegroundColor Yellow
  $gdpRows = Get-Indicator $iso 'NY.GDP.MKTP.CD' '2011:2026'
  $series = @($gdpRows | Where-Object { $_.value -ne $null } |
    ForEach-Object { [pscustomobject]@{ year = [int]$_.date; value = [math]::Round([double]$_.value / 1e9, 3) } } |
    Sort-Object year)
  if (-not $series.Count) { Write-Host "    no GDP data; keeping previous entry" -ForegroundColor DarkYellow; continue }
  $latest = $series[-1]
  $growthRows = Get-Indicator $iso 'NY.GDP.MKTP.KD.ZG' '2019:2026'
  $g = $growthRows | Where-Object { $_.value -ne $null } | Sort-Object { [int]$_.date } | Select-Object -Last 1
  $entry = [ordered]@{ gdp = $latest.value; gdpYear = $latest.year }
  if ($g) { $entry.gdp_growth = [math]::Round([double]$g.value, 1); $entry.growthYear = [int]$g.date }
  $entry.gdpSeries = $series
  $economy[$iso] = $entry
  Start-Sleep -Milliseconds 150
}

if ($economy.Count -lt 40) { Write-Host "[economy] only $($economy.Count) countries fetched - aborting patch (API trouble?)" -ForegroundColor Red; exit 1 }

$json = $economy | ConvertTo-Json -Depth 6 -Compress
$appData = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\data\app-data.js'))
$s = [IO.File]::ReadAllText($appData)
$marker = 'window.UNITED_AFRICA_DATA.worldBankEconomy'
$idx = $s.IndexOf($marker)
if ($idx -lt 0) { Write-Host '[economy] marker not found in app-data.js' -ForegroundColor Red; exit 1 }
$patched = $s.Substring(0, $idx) + "$marker = $json;`n"
[IO.File]::WriteAllText($appData, $patched, (New-Object Text.UTF8Encoding($false)))
Write-Host "[economy] patched worldBankEconomy for $($economy.Count) countries into data/app-data.js" -ForegroundColor Green

& (Join-Path $PSScriptRoot 'split-app-data.ps1')
Write-Host '[economy] app-core.js regenerated' -ForegroundColor Green
