#Requires -Version 5.1
<#
.SYNOPSIS
  Deterministic regression tests for the ASJ assignment desk.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/test-news-ranking.ps1
#>

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'news-ranking.ps1')

$passed = 0
$failed = 0
function Assert-Desk([string]$Name, [bool]$Condition) {
  if ($Condition) { $script:passed++; Write-Host "  PASS $Name" -ForegroundColor Green }
  else { $script:failed++; Write-Host "  FAIL $Name" -ForegroundColor Red }
}

function New-TestItem(
  [string]$Title,
  [string]$Summary,
  [int]$Tier = 2,
  [double]$CountryScore = 4.0,
  [string]$CountryMatch = 'title',
  [int]$AgeHours = 6,
  [string]$Source = 'Test Desk'
) {
  return [pscustomobject]@{
    title = $Title
    summary = $Summary
    tier = $Tier
    countryScore = $CountryScore
    countryMatch = $CountryMatch
    published = (Get-Date).ToUniversalTime().AddHours(-$AgeHours)
    source = $Source
    url = 'https://example.com/' + [Uri]::EscapeDataString($Title.Substring(0, [Math]::Min(20, $Title.Length)))
  }
}

Write-Host '[ranking-test] country relevance' -ForegroundColor Cyan
$nigerBad = Get-CountryRelevance `
  'Inflation concerns as Nigeria election starts' `
  'Campaigning in Nigeria begins' `
  @('Niger','Niamey','Nigerien') 'regional' $true @('Nigeria')
Assert-Desk 'Niger does not match Nigeria' $nigerBad.HardReject

$nigerGood = Get-CountryRelevance `
  'Niger approves a new refinery' `
  'Niamey approved the project on Thursday' `
  @('Niger','Niamey','Nigerien') 'regional' $true @('Nigeria')
Assert-Desk 'explicit Niger story is admitted' (-not $nigerGood.HardReject)

$cameroonOnNigeriaDesk = Get-CountryRelevance `
  'Cameroon president returns home' `
  'The leader returned after a long absence' `
  @('Nigeria','Nigerian','Abuja','Lagos') '' $false @('Cameroon')
Assert-Desk 'domestic feed cannot import a named foreign-country story' $cameroonOnNigeriaDesk.HardReject

$equatorial = Get-CountryRelevance `
  'Equatorial Guinea opens new hospital' `
  'Malabo commissioned the facility' `
  @('Equatorial Guinea','Malabo','Equatoguinean') 'regional' $true @('Guinea')
Assert-Desk 'longest country phrase wins overlapping names' (-not $equatorial.HardReject)

Write-Host '[ranking-test] event identity' -ForegroundColor Cyan
$ignore = @('Togo','Togolese','Lome')
$leftTitle = Get-NewsSignature 'Arrestation de deux journalistes francais au Togo' $ignore
$leftEvent = Get-NewsSignature 'Deux journalistes francais sont arretes et detenus pendant leur tournage' $ignore
$rightTitle = Get-NewsSignature 'Togo charges two French journalists over incorrect documents' $ignore
$rightEvent = Get-NewsSignature 'Rights groups seek the release of the detained journalists' $ignore
Assert-Desk 'cross-language journalist detention is one event' `
  (Test-SameNewsEvent $leftTitle $leftEvent $rightTitle $rightEvent)

$debtTitle = Get-NewsSignature 'Togo domestic debt reaches 2.2 trillion CFA francs' $ignore
$debtEvent = Get-NewsSignature 'Private companies wait for government arrears to be paid' $ignore
Assert-Desk 'unrelated debt and detention stories remain separate' `
  (-not (Test-SameNewsEvent $leftTitle $leftEvent $debtTitle $debtEvent))

Write-Host '[ranking-test] evidence and impact' -ForegroundColor Cyan
Assert-Desk 'calendar date is not a substantive figure' `
  (-not (Test-SubstantiveFigure 'Conference opens' 'Asmara, 20 August 2026 - delegates met today.'))
Assert-Desk 'currency amount is a substantive figure' `
  (Test-SubstantiveFigure 'Bank raises $500 million' 'The deal closed on 20 August 2026.')

$now = (Get-Date).ToUniversalTime()
$hard = New-TestItem 'Niger approves $1.9 billion refinery project' 'The investment will add fuel-processing capacity and construction jobs.' 1
$filler = New-TestItem 'Opinion: minister gives keynote address at annual conference' 'The speech reviewed government priorities for the year.' 1
$hardScore = Get-EditorialScore $hard 2 $now
$fillerScore = Get-EditorialScore $filler 1 $now
Assert-Desk 'corroborated material event outranks ceremonial opinion' ($hardScore.Score -gt ($fillerScore.Score + 8))

$edition = New-TestItem 'Eritrea Haddas 20 August 2026' 'Eritrea Haddas 20 August 2026' 1
$editionScore = Get-EditorialScore $edition 1 $now
Assert-Desk 'edition label falls below assignment floor' ($editionScore.Score -lt 6)

Write-Host '[ranking-test] final assignment order' -ForegroundColor Cyan
function New-SelectionItem([string]$Title, [double]$Score, [string]$Source, [string]$Topic) {
  $signature = Get-NewsSignature $Title @()
  return [pscustomobject]@{
    title = $Title
    url = 'https://example.com/' + [Uri]::EscapeDataString($Title)
    score = $Score
    source = $Source
    topicHint = $Topic
    _titleSig = $signature
    _eventSig = $signature
  }
}
$selection = Select-NewsCandidates @(
  (New-SelectionItem 'Alpha cabinet budget approved' 15 'Outlet A' 'Politics'),
  (New-SelectionItem 'Beta factory financing closes' 14 'Outlet A' 'Business'),
  (New-SelectionItem 'Gamma clinic vaccination opens' 10 'Outlet B' 'Health'),
  (New-SelectionItem 'Delta university intake expands' 13 'Outlet A' 'Education')
) 4 2
Assert-Desk 'relaxed-pass candidate is re-sorted by final selection score' `
  ($selection[2].title -eq 'Delta university intake expands' -and $selection[3].title -eq 'Gamma clinic vaccination opens')

Write-Host ''
if ($failed) {
  Write-Host "[ranking-test] FAIL - $failed failed, $passed passed" -ForegroundColor Red
  exit 1
}
Write-Host "[ranking-test] OK - $passed checks" -ForegroundColor Green
exit 0
