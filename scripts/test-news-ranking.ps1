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

$franceOnSenegalDesk = Get-CountryRelevance `
  'France: Saint-Denis mayor faces financial investigation' `
  'French prosecutors opened the inquiry on Monday' `
  @('Senegal','Senegalese','Dakar') '' $false @()
Assert-Desk 'external story is marked for corroboration on a domestic feed' `
  (-not $franceOnSenegalDesk.HardReject -and $franceOnSenegalDesk.Match -eq 'external')
Assert-Desk 'single-source external story fails the country-link gate' `
  (-not (Test-NewsCountryLink $franceOnSenegalDesk.Match 1))
Assert-Desk 'corroborated external story can serve the diaspora lens' `
  (Test-NewsCountryLink $franceOnSenegalDesk.Match 2)

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

Assert-Desk 'op-ed is rejected before scoring' `
  ((Get-NewsEditorialRejectReason 'Op-Ed | Ethiopia scholarship scheme' 'A columnist argues for expansion.') -ne '')
Assert-Desk 'roundup package is rejected before scoring' `
  ((Get-NewsEditorialRejectReason 'THE WEEKEND WRAP: politics, AI and sport' 'This edition covers three stories.') -ne '')
Assert-Desk 'political insult clickbait is rejected before scoring' `
  ((Get-NewsEditorialRejectReason 'Minister takes fresh swipe and calls rival a fool' 'Mourners laughed at the remarks.') -ne '')
Assert-Desk 'material refinery event survives editorial rejection' `
  ((Get-NewsEditorialRejectReason 'Niger approves $1.9 billion refinery' 'The project adds processing capacity.') -eq '')
Assert-Desk 'listicle is rejected before scoring' `
  ((Get-NewsEditorialRejectReason '5 neighborhoods where house rent is affordable' 'A guide to local rents.') -ne '')
Assert-Desk 'ceremonial appeal is rejected before scoring' `
  ((Get-NewsEditorialRejectReason 'Governor urges citizens to embrace peace and patience' 'The message marked a holiday.') -ne '')
Assert-Desk 'personality quote is rejected before scoring' `
  ((Get-NewsEditorialRejectReason "Gachagua to Duale: You don't own pastoralists" 'The politicians traded remarks.') -ne '')
$staleCompetitionYear = (Get-Date).Year - 3
Assert-Desk 'stale competition year is rejected before scoring' `
  ((Get-NewsEditorialRejectReason "AFCON qualifiers ${staleCompetitionYear}: Senegal learns its opponent" 'The draw was republished.') -ne '')
Assert-Desk 'crash headline is classified as news' `
  ((Get-NewsTopicHint 'Two dead, 17 injured in microbus rollover' '') -eq 'News')
Assert-Desk 'mayoral headline is classified as politics' `
  ((Get-NewsTopicHint 'ANC names Johannesburg mayoral candidate' '') -eq 'Politics')
Assert-Desk 'aluminium project is classified as business' `
  ((Get-NewsTopicHint 'Egypt secures $2 billion aluminium plant' '') -eq 'Business')
Assert-Desk 'Mawlid aliases collapse into one event family' `
  (Test-SameNewsEvent (Get-NewsSignature 'Kaolack Gamou preparations begin' @()) (Get-NewsSignature 'Kaolack Gamou preparations begin' @()) `
                      (Get-NewsSignature 'Mawlid pilgrims travel to Tivaouane' @()) (Get-NewsSignature 'Mawlid pilgrims travel to Tivaouane' @()))

$now = (Get-Date).ToUniversalTime()
$hard = New-TestItem 'Niger approves $1.9 billion refinery project' 'The investment will add fuel-processing capacity and construction jobs.' 1
$filler = New-TestItem 'Opinion: minister gives keynote address at annual conference' 'The speech reviewed government priorities for the year.' 1
$hardScore = Get-EditorialScore $hard 2 $now
$fillerScore = Get-EditorialScore $filler 1 $now
Assert-Desk 'corroborated material event outranks ceremonial opinion' ($hardScore.Score -gt ($fillerScore.Score + 8))

$actionStory = New-TestItem 'Transit agency mobilises 300 buses for pilgrims' 'The service will run more than 500 trips during the festival.' 2
$quoteStory = New-TestItem 'Official says the country must change its paradigm' 'The official spoke during the same festival.' 2
Assert-Desk 'material action outranks an unsupported quote package' `
  ((Get-EditorialScore $actionStory 2 $now).Score -gt (Get-EditorialScore $quoteStory 2 $now).Score)

$thinEvidence = New-TestItem 'Transit authority changes regional bus routes' 'Routes changed today.' 2
$fullEvidence = New-TestItem 'Transit authority changes regional rail routes' ('The authority published a detailed operating plan for commuters, stations, fares, replacement buses, accessibility, and the dates when each regional service changes. ' * 3) 2
Assert-Desk 'writeable source evidence outranks a thin equivalent' `
  ((Get-EditorialScore $fullEvidence 1 $now).Score -gt (Get-EditorialScore $thinEvidence 1 $now).Score)

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

$writeable = Select-NewsWriteableCandidates @(
  [pscustomobject]@{ title='Thin high score'; evidenceWords=12; selectionScore=20; score=20 },
  [pscustomobject]@{ title='Ready middle score'; evidenceWords=80; selectionScore=14; score=14 },
  [pscustomobject]@{ title='Ready lower score'; evidenceWords=55; selectionScore=12; score=12 }
) 2 45
Assert-Desk 'writeable candidates fill assignment slots before thin feeds' `
  ($writeable.Count -eq 2 -and $writeable[0].title -eq 'Ready middle score' -and $writeable[1].title -eq 'Ready lower score')

Write-Host ''
if ($failed) {
  Write-Host "[ranking-test] FAIL - $failed failed, $passed passed" -ForegroundColor Red
  exit 1
}
Write-Host "[ranking-test] OK - $passed checks" -ForegroundColor Green
exit 0
