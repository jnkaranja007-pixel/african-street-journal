#Requires -Version 5.1
<#
.SYNOPSIS
  Regression checks for the full on-site story publication contract.
#>

$ErrorActionPreference = 'Stop'
$validator = Join-Path $PSScriptRoot 'validate-briefs.ps1'
$writer = Join-Path $PSScriptRoot 'write-briefs.ps1'
$fixture = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'asj-story-contract-' + [guid]::NewGuid().ToString('N') + '.js')
$feedFixture = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'asj-thin-feed-' + [guid]::NewGuid().ToString('N') + '.json')
$metricsFixture = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'asj-thin-metrics-' + [guid]::NewGuid().ToString('N') + '.json')
$outFixture = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'asj-thin-output-' + [guid]::NewGuid().ToString('N') + '.json')
$utf8 = New-Object Text.UTF8Encoding($false)

function Write-Fixture([int]$ParagraphCount, [switch]$BadLens) {
  $allParagraphs = @(
    'The transport ministry opened a new freight checkpoint on Tuesday after a month-long trial. Officials said the site will inspect trucks moving between the capital and the northern farming corridor, where delays had pushed delivery times beyond two days during the busiest market weeks.',
    'The ministry said forty inspectors will work in rotating teams and publish daily queue estimates. Two trade groups that monitored the trial reported shorter waits, although both said the test covered fewer vehicles than a normal harvest-season day and should not be treated as a final measure.',
    'Drivers can continue using the older crossing while the new lane is assessed. The ministry has not announced a permanent timetable. Farmers and wholesalers will be watching whether the added capacity lowers spoilage risk and transport costs once crop volumes rise later in the season.'
  )
  $paragraphs = @($allParagraphs | Select-Object -First $ParagraphCount)
  $story = [ordered]@{
    articleId = 'fixture-story-1'
    headline = 'New freight checkpoint targets farm corridor delays'
    dek = 'A month-long trial moves into daily service with queue reporting and forty inspectors.'
    paragraphs = $paragraphs
    body = $paragraphs -join "`n`n"
    why = 'Shorter queues could reduce spoilage and transport costs for farmers and wholesalers.'
    lensVersion = 1
    lenses = @{
      farmers = @{ score = 94; why = 'Shorter freight queues could reduce spoilage and transport costs for farmers moving harvests.' }
      investors = @{ score = $(if ($BadLens) { 140 } else { 66 }); why = 'Published queue estimates give logistics operators a clearer measure of freight delays and capacity.' }
      diaspora = @{ score = 28; why = 'The checkpoint has limited direct diaspora impact unless household deliveries use this northern corridor.' }
    }
    topic = 'Business'
    published = '2026-08-20T08:00:00Z'
    editorialScore = 8.4
    selectionScore = 8.4
    confidence = 'high'
    corroboration = 2
    scoreBreakdown = @{ relevance = 3; evidence = 2 }
    rankReasons = @('explicit country match', 'corroborated by two outlets')
    sources = @(
      @{ name = 'Fixture Daily'; url = 'https://example.com/report' },
      @{ name = 'Fixture Radio'; url = 'https://example.org/update' }
    )
  }
  $payload = [ordered]@{
    generated = '2026-08-20T09:00:00Z'
    dates = @{ xx = '2026-08-20T09:00:00Z' }
    byCountry = @{ xx = @($story) }
    markets = @{}
  }
  $json = $payload | ConvertTo-Json -Depth 12
  [IO.File]::WriteAllText($fixture, "window.UNITED_AFRICA_BRIEFS = $json;", $utf8)
}

try {
  Write-Fixture 3
  & powershell -NoProfile -ExecutionPolicy Bypass -File $validator -BriefsFile $fixture -MinStoryPackages 1 *> $null
  if ($LASTEXITCODE -ne 0) { throw 'valid full story was rejected' }
  Write-Host 'PASS valid three-paragraph story is publishable'

  Write-Fixture 3 -BadLens
  & powershell -NoProfile -ExecutionPolicy Bypass -File $validator -BriefsFile $fixture -MinStoryPackages 1 *> $null
  if ($LASTEXITCODE -eq 0) { throw 'invalid lens package was accepted' }
  Write-Host 'PASS out-of-range lens score is rejected'

  Write-Fixture 2
  & powershell -NoProfile -ExecutionPolicy Bypass -File $validator -BriefsFile $fixture -MinStoryPackages 1 *> $null
  if ($LASTEXITCODE -eq 0) { throw 'invalid two-paragraph story was accepted' }
  Write-Host 'PASS undersized two-paragraph story is rejected'

  $thinFeed = [ordered]@{
    fetched = '2026-08-20T09:00:00Z'
    byCountry = @{ xx = @{ country = 'Fixtureland'; items = @(1..4 | ForEach-Object { @{ title = "Candidate $_"; url = "https://example.com/$_" } }) } }
  }
  [IO.File]::WriteAllText($feedFixture, ($thinFeed | ConvertTo-Json -Depth 8), $utf8)
  & powershell -NoProfile -ExecutionPolicy Bypass -File $writer -Only xx -InFile $feedFixture `
    -OutFile $outFixture -MetricsFile $metricsFixture -NoCache *> $null
  $thinExit = $LASTEXITCODE
  $thinMetrics = [IO.File]::ReadAllText($metricsFixture, [Text.Encoding]::UTF8) | ConvertFrom-Json
  if ($thinExit -ne 1 -or $thinMetrics.apiCalls -ne 0 -or $thinMetrics.countriesSkippedBeforeModel -ne 1) {
    throw 'thin candidate desk was not skipped before the model call'
  }
  Write-Host 'PASS four-candidate desk spends zero model calls'
} finally {
  foreach ($path in @($fixture, $feedFixture, $metricsFixture, $outFixture)) {
    if (Test-Path $path) { Remove-Item -LiteralPath $path -Force }
  }
}

Write-Host '[story-contract] OK - 4 checks'
exit 0
