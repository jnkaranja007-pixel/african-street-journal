#Requires -Version 5.1
<#
.SYNOPSIS
  Publication gate for data/briefs.js. The daily Action runs this BEFORE committing, so a
  malformed or catastrophically-empty run fails loudly (GitHub emails you) instead of
  pushing broken data to the live journal overnight.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/validate-briefs.ps1
  powershell -ExecutionPolicy Bypass -File scripts/validate-briefs.ps1 -MinCountries 30
.NOTES
  Exit 0 = safe to publish. Exit 1 = do not publish.
#>
param(
  [int]$MinCountries = 1,
  [int]$MinBriefs = 1
)

$ErrorActionPreference = 'Stop'
$briefsPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\data\briefs.js'))
$problems = New-Object System.Collections.Generic.List[string]

if (-not (Test-Path $briefsPath)) { Write-Host '[validate] FAIL: data/briefs.js missing' -ForegroundColor Red; exit 1 }

$raw = [IO.File]::ReadAllText($briefsPath)
$m = [regex]::Match($raw, 'window\.UNITED_AFRICA_BRIEFS\s*=\s*(\{[\s\S]*\});\s*$')
if (-not $m.Success) { Write-Host '[validate] FAIL: assignment pattern not found (file truncated or corrupt?)' -ForegroundColor Red; exit 1 }

# The payload is JS object-literal with bare keys; normalise the known keys to strict JSON.
$js = $m.Groups[1].Value
$js = $js -replace "generated:\s*'([^']*)'", '"generated": "$1"'
foreach ($key in 'byCountry', 'markets', 'dates') { $js = $js -replace "(?m)(^|\{|,)\s*$key\s*:", "`$1`"$key`":" }

try { $obj = $js | ConvertFrom-Json } catch {
  Write-Host "[validate] FAIL: payload is not valid JSON - $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

if (-not $obj.generated) { $problems.Add('no generated timestamp') }
$countries = @()
if ($obj.byCountry) { $countries = @($obj.byCountry.PSObject.Properties) }
if ($countries.Count -lt $MinCountries) { $problems.Add("only $($countries.Count) countries (need >= $MinCountries)") }

$totalBriefs = 0
$badShape = New-Object System.Collections.Generic.List[string]
$badUrls = New-Object System.Collections.Generic.List[string]
foreach ($c in $countries) {
  $list = @($c.Value)
  if ($list.Count -eq 0) { $badShape.Add("$($c.Name):empty"); continue }
  foreach ($b in $list) {
    $totalBriefs++
    if (-not $b.headline -or -not $b.body) { $badShape.Add("$($c.Name):missing headline/body") }
    elseif ($b.headline.Length -gt 160) { $badShape.Add("$($c.Name):headline too long") }
    foreach ($s in @($b.sources)) {
      if ($s -and $s.url -and $s.url -notmatch '^https?://') { $badUrls.Add("$($c.Name):$($s.url)") }
    }
  }
}
if ($totalBriefs -lt $MinBriefs) { $problems.Add("only $totalBriefs briefs total (need >= $MinBriefs)") }
if ($badShape.Count) { $problems.Add("$($badShape.Count) malformed briefs: $(($badShape | Select-Object -First 3) -join '; ')") }
if ($badUrls.Count)  { $problems.Add("$($badUrls.Count) non-http source URLs: $(($badUrls | Select-Object -First 3) -join '; ')") }

if ($problems.Count) {
  Write-Host '[validate] FAIL - not safe to publish:' -ForegroundColor Red
  $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}

Write-Host "[validate] OK - $totalBriefs briefs across $($countries.Count) countries, generated $($obj.generated)" -ForegroundColor Green
exit 0
