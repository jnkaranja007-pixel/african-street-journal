#Requires -Version 5.1
<#
.SYNOPSIS
  Publication gate for data/briefs.js. The daily Action runs this BEFORE committing, so a
  malformed or catastrophically-empty run fails loudly (GitHub emails you) instead of
  pushing broken data to the live journal overnight.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/validate-briefs.ps1
  powershell -ExecutionPolicy Bypass -File scripts/validate-briefs.ps1 -MinCountries 50 -MinStoryPackages 250 -MinFreshCountries 50
  powershell -ExecutionPolicy Bypass -File scripts/validate-briefs.ps1 -RequiredFreshCountries dz,sn
.NOTES
  Exit 0 = safe to publish. Exit 1 = do not publish.
#>
param(
  [int]$MinCountries = 1,
  [int]$MinBriefs = 1,
  [int]$MinStoryPackages = 0,
  [int]$MinFreshCountries = 0,
  [int]$FreshStoriesPerCountry = 5,
  [string[]]$RequiredFreshCountries = @(),
  [int]$MinStoryWords = 70,
  [int]$MaxStoryWords = 220,
  [string]$BriefsFile = ''
)

$ErrorActionPreference = 'Stop'
$briefsPath = if ($BriefsFile) {
  [IO.Path]::GetFullPath($BriefsFile)
} else {
  [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\data\briefs.js'))
}
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
$storyPackages = 0
$freshCountries = 0
$freshByCountry = @{}
# PowerShell 7's ConvertFrom-Json turns ISO-8601 strings into [datetime]; 5.1 leaves
# them as strings. So [string]$obj.generated is "2026-08-25T14:52:36-07:00" locally but
# "08/25/2026 22:33:07" under the pwsh that GitHub Actions runs, and a ^\d{4}-\d{2}-\d{2}
# match against it silently returns empty. Every country then failed the freshness test
# against a blank date - the desk wrote stories, merged them, and was told none were
# fresh. Normalise on type, never on the culture-dependent string form.
function Get-IsoDay($value) {
  if ($null -eq $value) { return '' }
  if ($value -is [datetime]) { return $value.ToString('yyyy-MM-dd') }
  if ($value -is [DateTimeOffset]) { return $value.ToString('yyyy-MM-dd') }
  if ([string]$value -match '^(\d{4}-\d{2}-\d{2})') { return $Matches[1] }
  return ''
}
$generatedDay = Get-IsoDay $obj.generated
$badShape = New-Object System.Collections.Generic.List[string]
$badUrls = New-Object System.Collections.Generic.List[string]
$storyIds = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($c in $countries) {
  $list = @($c.Value)
  $countryStoryPackages = 0
  $freshByCountry[[string]$c.Name] = $false
  if ($list.Count -eq 0) { $badShape.Add("$($c.Name):empty"); continue }
  foreach ($b in $list) {
    $totalBriefs++
    if (-not $b.headline -or -not $b.body) { $badShape.Add("$($c.Name):missing headline/body") }
    elseif ($b.headline.Length -gt 100) { $badShape.Add("$($c.Name):headline over 100 chars") }

    $hasParagraphs = $null -ne $b.PSObject.Properties['paragraphs']
    if ($hasParagraphs) {
      $storyPackages++
      $countryStoryPackages++
      $paragraphs = @($b.paragraphs | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
      $bodyText = ($paragraphs -join ' ').Trim()
      $wordCount = if ($bodyText) { ([regex]::Matches($bodyText, "[\p{L}\p{N}]+(?:[''-][\p{L}\p{N}]+)*")).Count } else { 0 }
      if (-not $b.articleId) { $badShape.Add("$($c.Name):story missing articleId") }
      elseif (-not $storyIds.Add([string]$b.articleId)) { $badShape.Add("$($c.Name):duplicate articleId $($b.articleId)") }
      if (-not $b.dek) { $badShape.Add("$($c.Name):story missing dek") }
      elseif (([string]$b.dek).Length -gt 200) { $badShape.Add("$($c.Name):dek over 200 chars") }
      if (-not $b.why) { $badShape.Add("$($c.Name):story missing why") }
      if (-not $b.published) { $badShape.Add("$($c.Name):story missing published time") }
      if ($paragraphs.Count -lt 3 -or $paragraphs.Count -gt 6) {
        $badShape.Add("$($c.Name):story has $($paragraphs.Count) paragraphs")
      }
      if ($wordCount -lt $MinStoryWords -or $wordCount -gt $MaxStoryWords) {
        $badShape.Add("$($c.Name):story has $wordCount words")
      }
      if (@($b.sources | Where-Object { $_ -and $_.url }).Count -lt 1) {
        $badShape.Add("$($c.Name):story has no reporting source")
      }

      # Lens metadata is optional for editions published before story-v2-lenses. Once a
      # story declares it, require the complete package so personalization cannot silently
      # rank on a missing audience or display an empty impact note.
      $hasLensMetadata = $null -ne $b.PSObject.Properties['lensVersion'] -or $null -ne $b.PSObject.Properties['lenses']
      if ($hasLensMetadata) {
        if (-not $b.lenses) {
          $badShape.Add("$($c.Name):story declares lenses but has no lens package")
        } else {
          foreach ($lens in @('farmers','investors','diaspora')) {
            $lensProperty = $b.lenses.PSObject.Properties[$lens]
            if (-not $lensProperty) { $badShape.Add("$($c.Name):story missing $lens lens"); continue }
            $lensEntry = $lensProperty.Value
            $lensScore = -1.0
            if (-not [double]::TryParse([string]$lensEntry.score, [ref]$lensScore) -or
                $lensScore -lt 0 -or $lensScore -gt 100 -or [Math]::Floor($lensScore) -ne $lensScore) {
              $badShape.Add("$($c.Name):story has invalid $lens lens score")
            }
            $lensWhy = ([string]$lensEntry.why).Trim()
            $lensWhyWords = if ($lensWhy) { ([regex]::Matches($lensWhy, "[\p{L}\p{N}]+(?:[''-][\p{L}\p{N}]+)*")).Count } else { 0 }
            if ($lensWhyWords -lt 8 -or $lensWhyWords -gt 50) {
              $badShape.Add("$($c.Name):story has invalid $lens lens why")
            }
          }
        }
      }
    }
    foreach ($s in @($b.sources)) {
      if ($s -and $s.url -and $s.url -notmatch '^https?://') { $badUrls.Add("$($c.Name):$($s.url)") }
    }
  }
  $countryDate = ''
  if ($obj.dates -and $obj.dates.PSObject.Properties[$c.Name]) {
    $countryDate = Get-IsoDay $obj.dates.PSObject.Properties[$c.Name].Value
  }
  $isFresh = $generatedDay -and $countryDate -eq $generatedDay -and $countryStoryPackages -ge $FreshStoriesPerCountry
  $freshByCountry[[string]$c.Name] = [bool]$isFresh
  if ($isFresh) {
    $freshCountries++
  }
}
$requiredCodes = @(
  $RequiredFreshCountries |
    ForEach-Object { $_ -split ',' } |
    ForEach-Object { $_.Trim().ToLowerInvariant() } |
    Where-Object { $_ } |
    Select-Object -Unique
)
$missingRequired = @(
  $requiredCodes | Where-Object {
    -not $freshByCountry.ContainsKey($_) -or -not $freshByCountry[$_]
  }
)
if ($totalBriefs -lt $MinBriefs) { $problems.Add("only $totalBriefs briefs total (need >= $MinBriefs)") }
if ($storyPackages -lt $MinStoryPackages) { $problems.Add("only $storyPackages full story packages (need >= $MinStoryPackages)") }
if ($freshCountries -lt $MinFreshCountries) {
  $problems.Add("only $freshCountries countries have $FreshStoriesPerCountry fresh stories dated $generatedDay (need >= $MinFreshCountries)")
}
if ($missingRequired.Count) {
  $problems.Add("requested countries are not fresh complete desks: $($missingRequired -join ', ')")
}
if ($badShape.Count) { $problems.Add("$($badShape.Count) malformed briefs: $(($badShape | Select-Object -First 3) -join '; ')") }
if ($badUrls.Count)  { $problems.Add("$($badUrls.Count) non-http source URLs: $(($badUrls | Select-Object -First 3) -join '; ')") }

if ($problems.Count) {
  Write-Host '[validate] FAIL - not safe to publish:' -ForegroundColor Red
  $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  exit 1
}

Write-Host "[validate] OK - $totalBriefs entries ($storyPackages full stories) across $($countries.Count) countries; $freshCountries fresh desks, generated $($obj.generated)" -ForegroundColor Green
exit 0
