#Requires -Version 5.1
<#
.SYNOPSIS
  Tests for the Wall Street Journal bar and standards checks (scripts/wsj-standards.ps1)
  and the feed-stage bar (Test-NewsBelowWsjBar, scripts/news-ranking.ps1).
.DESCRIPTION
  The fixtures are real headlines from the 17 Nov 2026 edition, which the owner judged
  too full of death and killing, plus the African cases the bar must keep: insurgency,
  war, an attack that stops a mine, a road-safety policy.
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'news-ranking.ps1')
. (Join-Path $PSScriptRoot 'wsj-standards.ps1')

$passed = 0
$failed = 0
function Assert-Wsj([string]$Name, [bool]$Condition) {
  if ($Condition) { $script:passed++; Write-Host "  PASS $Name" }
  else { $script:failed++; Write-Host "  FAIL $Name" -ForegroundColor Red }
}
function New-Story([string]$Headline, [string]$Dek, [int]$Reach = 3, [string[]]$Paragraphs = @(), [string]$Topic = 'News') {
  if (-not $Paragraphs.Count) { $Paragraphs = @("$Dek The ministry gave no further details.", 'Officials said a statement would follow.', 'The matter continues.') }
  return [pscustomobject]@{ headline = $Headline; dek = $Dek; paragraphs = $Paragraphs; why = 'Residents face higher costs from next month.'; reach = $Reach; topic = $Topic }
}

Write-Host '[wsj] the publication bar'
$cases = @(
  @{ n = 'a truck crash that kills one passenger is cut'; s = (New-Story 'Truck crash in Windhoek kills passenger after brake failure' 'Police said the driver survived the crash on the B1.' 2); pass = $false }
  @{ n = 'a murder remand is cut'; s = (New-Story 'Former Chiredzi councillor remanded over murder' 'The magistrate set the next hearing for December.' 2); pass = $false }
  @{ n = 'a child drowning is cut'; s = (New-Story 'Pupil, 14, drowns in Mbabane River after leaving school to swim' 'Police said the boy left school early with friends.' 2); pass = $false }
  @{ n = 'a mass shooting the desk scored 3 is cut'; s = (New-Story '17 killed in two South African mass shootings' 'Police said gunmen opened fire in Cape Town and Durban.' 3); pass = $false }
  @{ n = 'a mass-casualty event the desk scored 5 runs'; s = (New-Story 'Stadium collapse in Kinshasa kills 120' 'The government declared three days of mourning and closed all stadiums.' 5); pass = $true }
  @{ n = 'a toll of 75 the desk scored 4 runs'; s = (New-Story 'Militia truck crash in Kabanga leaves 75 dead' 'Officials and security sources put the toll at 75.' 4); pass = $true }
  @{ n = 'a toll of 6 the desk scored 4 is cut'; s = (New-Story 'Bus crash kills 6 on Nairobi highway' 'Police said the driver lost control.' 4); pass = $false }
  @{ n = 'a church succession with a founder who died in 2023 is not a death story'; s = (New-Story 'Fountain of Life Church removes Jimmy Odukoya as senior pastor' 'Trustees say they are enforcing the succession plan left by the late founder, who died in 2023.' 3); pass = $true }
  @{ n = 'African lens: a jihadist attack the desk scored 4 runs'; s = (New-Story 'Jihadists kill 12 soldiers in attack on Djibo base' 'The junta suspended two commanders and sent reinforcements north.' 4 -Topic 'Security'); pass = $true }
  @{ n = 'African lens: an insurgent skirmish the desk scored 2 is cut'; s = (New-Story 'Rebels attack village near Beni, killing 3' 'Local officials said the attackers fled into the forest.' 2 -Topic 'Security'); pass = $false }
  @{ n = 'a war story runs'; s = (New-Story 'Ethiopia and Eritrea trade drone strikes near Badme' 'Both armies reported artillery fire as the border war widened.' 4 -Topic 'Security'); pass = $true }
  @{ n = 'an attack that stops a mine is business news'; s = (New-Story 'Gunmen attack Kibali gold mine convoy' 'The mining company suspended shipments after the attack.' 3 -Topic 'Business'); pass = $true }
  @{ n = 'a road-safety target is policy'; s = (New-Story 'Eswatini sets 2030 goal to halve road deaths' 'The transport ministry published the target with new speed rules.' 3); pass = $true }
  @{ n = 'a central bank decision is never touched'; s = (New-Story 'Bank of Ghana holds policy rate at 27 percent' 'The committee said inflation slowed for a fifth month.' 4 -Topic 'Business'); pass = $true }
)
# From the archive audit (18 Nov 2026): what an African reader of the Journal still needs.
$cases += @(
  @{ n = 'African lens: a law that reinstates the death penalty is policy'; s = (New-Story 'Burkina Faso reinstates death penalty' 'The junta-appointed assembly voted for capital punishment for treason.' 0); pass = $true }
  @{ n = 'an archived massacre with no reach recorded runs on its toll'; s = (New-Story 'Attackers kill 48 civilians near Menaka' 'Local officials said the attack hit three villages.' 0); pass = $true }
  @{ n = 'an archived murder with no reach recorded is cut'; s = (New-Story 'Pharmacist murdered in Constantine' 'Police opened an investigation.' 0); pass = $false }
  @{ n = 'an obituary of a public figure runs'; s = (New-Story 'Kofi Wayo, Ghanaian politician and businessman, dies at 71' 'He founded a party and ran for president.' 0); pass = $true }
  @{ n = 'African lens: protesters injured is politics'; s = (New-Story 'Kolwezi protests leave two injured' 'Residents protested power cuts at the mine town.' 0); pass = $true }
  @{ n = 'a terrorism designation is policy, not an attack'; s = (New-Story 'Egypt permanently lists Muslim Brotherhood as terrorist entity' 'The court order bars the group from all activity.' 0); pass = $true }
  @{ n = 'a mass terrorism trial is security policy'; s = (New-Story 'Nigeria convicts 653 terrorism suspects' 'The trials ran at Kainji military base.' 0); pass = $true }
  @{ n = 'an obituary "dies aged 72" runs'; s = (New-Story 'Former Attorney General Paul Kihara dies aged 72' 'He served under two presidents.' 0); pass = $true }
  @{ n = 'a dengue toll is health news'; s = (New-Story 'Chad health ministry reports 14 dengue deaths' 'Cases rose in N''Djamena this month.' 0); pass = $true }
  @{ n = 'African lens: South Sudan communal fighting is conflict'; s = (New-Story 'Nine killed in Bor County communal fighting' 'Local officials blamed a cattle dispute.' 0); pass = $true }
  @{ n = 'African lens: a mass abduction in Borno runs'; s = (New-Story 'Borno community urges Tinubu to rescue 78 abducted children' 'The children were taken from a school in Gwoza.' 0); pass = $true }
  @{ n = 'political violence against a candidate runs'; s = (New-Story 'Sokoto ultimatum issued over attack on ADC candidate' 'The party gave police seven days to make arrests.' 0); pass = $true }
  @{ n = 'a man who dies after a family attack is still crime'; s = (New-Story 'Man dies after sister pours hot water on him' 'Police arrested the sister.' 0); pass = $false }
  @{ n = 'a stabbing in Roche-Bois is still crime'; s = (New-Story 'Man stabbed in Roche-Bois' 'Police are looking for two suspects.' 0); pass = $false }
)
foreach ($c in $cases) { Assert-Wsj $c.n ((Test-WsjBar $c.s).Pass -eq $c.pass) }
Assert-Wsj 'an age is not a death toll' ((Get-NewsMassToll 'The 86-year-old woman died of stab wounds') -eq 0)
$museum = [pscustomobject]@{ headline = 'Equatorial Guinea plans museums for archaeological finds'; dek = 'Sites will house artifacts dating from 50 BC.'; paragraphs = @('x'); reach = 0 }
Assert-Wsj '"artifacts dating from" is not a dating story' ((Test-WsjArchiveKeep $museum).Keep)
$lottery = [pscustomobject]@{ headline = 'Finance and tourism ministries review national lottery plan'; dek = 'A feasibility report was examined.'; paragraphs = @('x'); reach = 0 }
Assert-Wsj 'a government lottery plan is policy' ((Test-WsjArchiveKeep $lottery).Keep)
$tape = [pscustomobject]@{ headline = 'Court detains four teens over sex tape leak'; dek = 'The video spread on WhatsApp.'; paragraphs = @('x'); reach = 0 }
Assert-Wsj 'a sex-tape story is withdrawn' (-not (Test-WsjArchiveKeep $tape).Keep)
Assert-Wsj 'a 31-dead truck crash is routine harm, kept off the top stories' ((Get-WsjHarmClass 'Imbonerakure truck crash in Kabanga leaves 31 dead, sources say' 'The ruling party youth wing members were travelling at night.') -eq 'routine-harm')
Assert-Wsj 'spelled-out hundreds are a mass toll' ((Get-NewsMassToll 'Cult leader convicted of one hundred ninety-one murders') -ge 100)
$hyena = [pscustomobject]@{ headline = 'Spotted hyena returns to Egypt''s Red Sea Governorate'; dek = 'Villagers found mutilated sheep, signaling the return of a predator.'; paragraphs = @('x'); reach = 0 }
Assert-Wsj 'a graphic word in a wildlife dek is not a graphic story' ((Test-WsjArchiveKeep $hyena).Keep)
$chilima = [pscustomobject]@{ headline = 'Malawi plane crash evidence vanishes'; dek = 'Forensic samples from the 2024 crash that killed the vice president are missing.'; paragraphs = @('x'); reach = 0 }
Assert-Wsj 'African lens: a state cover-up of a vice president''s crash runs' ((Test-WsjArchiveKeep $chilima).Keep)
$herders = [pscustomobject]@{ headline = 'Fulani leaders demand probe into pastoralist attacks'; dek = 'Hundreds killed and cattle lost in five states.'; paragraphs = @('x'); reach = 0 }
Assert-Wsj 'African lens: the farmer-herder conflict runs' ((Test-WsjArchiveKeep $herders).Keep)

Write-Host '[wsj] standards on the copy'
$tab = Get-WsjStandardsIssues (New-Story 'Horrific attack leaves village in mourning' 'Residents described a brutal raid.' 3 @('Gunmen hacked to death four farmers and their bodies were charred.', 'Police said they were searching for the attackers.', 'The governor visited the village on Sunday.'))
Assert-Wsj 'tabloid words are caught' (@($tab.Sensational) -contains 'horrific' -and @($tab.Sensational) -contains 'brutal')
Assert-Wsj 'graphic detail is caught' (@($tab.Graphic) -contains 'hacked to death' -and @($tab.Graphic) -contains 'charred')
$quoted = Get-WsjStandardsIssues (New-Story 'Minister condemns attack on traders' 'The minister called the raid "barbaric" and ordered patrols.' 3)
Assert-Wsj 'a loaded word inside a quotation is the speaker''s, not the paper''s' (-not @($quoted.Sensational).Count)
Assert-Wsj 'a toll at the head of a crime headline is caught' (Test-WsjTollHeadline '17 killed in two South African mass shootings' 'Police said gunmen opened fire.')
Assert-Wsj 'and "crash leaves 31 dead" too' (Test-WsjTollHeadline 'Truck crash in Kabanga leaves 31 dead' 'Officials gave the toll.')
Assert-Wsj 'a toll headline in a war is allowed' (-not (Test-WsjTollHeadline '40 killed as war reaches El Fasher' 'The war between the army and the RSF entered its third year.'))
Assert-Wsj 'a number that is not a toll is not a toll headline' (-not (Test-WsjTollHeadline 'Kenya Airways adds 3 routes to West Africa' 'The airline said flights start in March.'))
$dwell = @('Twelve people were killed on Monday.', 'Four more died in hospital.', 'The dead included two children.', 'Police said the deaths would be investigated.', 'Bodies were taken to the mortuary.')
Assert-Wsj 'a story that only counts the dead is caught' (Test-WsjDwellsOnDeaths $dwell)
Assert-Wsj 'a story that gives the toll once is not' (-not (Test-WsjDwellsOnDeaths @('Twelve people were killed on Monday.', 'The government ordered an inquiry into the bridge.', 'The ministry closed the crossing to trucks.', 'Traders said goods now take a day longer to reach the market.')))
$lines = @(Get-WsjRepairLines $tab)
Assert-Wsj 'each problem gets a rewrite instruction' ($lines.Count -ge 2 -and ($lines -join ' ') -match 'Wall Street Journal')
$clean = Get-WsjStandardsIssues (New-Story 'Nigeria raises petrol price by 12 percent' 'The regulator said subsidies end in January.' 4)
Assert-Wsj 'a clean business story has no standards problem' (-not @($clean.Issues).Count)

Write-Host '[wsj] the toll reader'
Assert-Wsj 'reads "leaves 31 dead"' ((Get-NewsMassToll 'Truck crash leaves 31 dead') -eq 31)
Assert-Wsj 'reads "kills at least 1,200"' ((Get-NewsMassToll 'Flood kills at least 1,200 in Derna') -eq 1200)
Assert-Wsj 'a year is not a toll' ((Get-NewsMassToll 'Founder who died in 2023') -eq 0)

Write-Host '[wsj] the feed-stage bar'
$item = { param($t, $s) [pscustomobject]@{ title = $t; summary = $s; rankReasons = @((Get-EditorialScore ([pscustomobject]@{ title = $t; summary = $s; tier = 1; countryMatch = 'title'; published = (Get-Date).ToUniversalTime().AddHours(-3) }) 1 (Get-Date).ToUniversalTime()).Reasons) } }
Assert-Wsj 'a routine crash is not assigned' (Test-NewsBelowWsjBar (& $item 'Truck crash in Windhoek kills passenger' 'Police said the passenger died at the scene after the brakes failed.'))
Assert-Wsj 'a mass-casualty report reaches the writer' (-not (Test-NewsBelowWsjBar (& $item 'Boat capsizes on Lake Kivu, 80 dead' 'Officials said 80 people died when the overloaded boat capsized at night.')))
Assert-Wsj 'African lens: a jihadist attack reaches the writer' (-not (Test-NewsBelowWsjBar (& $item 'Jihadists kill 9 in attack on Niger town' 'The army said jihadists attacked the town at dawn.')))
Assert-Wsj 'a background death in a church story is not a casualty report' (-not (Test-NewsBelowWsjBar (& $item 'Church removes senior pastor' 'Trustees cited the succession plan of the founder, who died in 2023.')))

Write-Host '[wsj] the edition mix'
$edition = [ordered]@{
  na = @((New-Story 'Truck crash in Windhoek kills passenger' 'Police said the brakes failed.' 2), (New-Story 'Namibia raises fuel levy' 'The ministry said roads get the money.' 4 -Topic 'Business'))
  gh = @((New-Story 'Bank of Ghana holds rate' 'Inflation slowed again.' 4 -Topic 'Business'), (New-Story 'Cocoa farmers get higher price' 'The board raised the farm-gate price.' 4 -Topic 'Agriculture'))
}
$mix = Get-WsjEditionMix $edition
Assert-Wsj 'the mix counts every story' ($mix.stories -eq 4)
Assert-Wsj 'the mix lists the story below the bar' (@($mix.belowBar).Count -eq 1 -and $mix.belowBar[0] -match 'Windhoek')
Assert-Wsj 'the mix reports the economy share' ($mix.economyShare -eq 0.75)
Assert-Wsj 'a routine-harm share over target is a missed target' (@($mix.targetsMissed) -match 'routine crime').Count

Write-Host ''
if ($failed) { Write-Host "[wsj-test] FAIL - $failed failed, $passed passed" -ForegroundColor Red; exit 1 }
Write-Host "[wsj-test] OK - $passed checks" -ForegroundColor Green
exit 0
