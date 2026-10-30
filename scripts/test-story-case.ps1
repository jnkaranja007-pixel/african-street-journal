#Requires -Version 5.1
<#
.SYNOPSIS
  Tests Repair-LineCase / Repair-StoryCase (scripts/story-shape.ps1) on the headlines and
  deks the model returned in lower case on 28 Oct 2026, against the story text it wrote.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/test-story-case.ps1
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'story-shape.ps1')
$root = Split-Path $PSScriptRoot -Parent
$passed = 0; $failed = 0
function Assert-Case([string]$Line, [string]$Reference, [string]$Expected, [switch]$Places) {
  $refText = $Reference
  if ($Places) { $refText += "`n" + (Get-PlaceNameReference $root) }
  $got = Repair-LineCase $Line $refText
  if ($got -ceq $Expected) { $script:passed++; Write-Host "  PASS $Expected" -ForegroundColor Green }
  else { $script:failed++; Write-Host "  FAIL $Line`n       got:      $got`n       expected: $Expected" -ForegroundColor Red }
}

Write-Host '[case-test] names come back from the story' -ForegroundColor Cyan
Assert-Case 'book captures botswana''s dance heritage' 'Thalefang Charles has released a book that preserves Botswana''s cultural memory.' 'Book captures Botswana''s dance heritage'
Assert-Case 'ivory coast removes vat on animal feed' 'Ivory Coast will remove value-added tax (VAT) on animal feed from 2027.' 'Ivory Coast removes VAT on animal feed'
Assert-Case 'drone strike kills 102 civilians in nyala market' 'At least 102 civilians died in a strike on Tanqong Market in Nyala, South Darfur. The market is west of Nyala.' 'Drone strike kills 102 civilians in Nyala market'
Assert-Case 'delayed rains kill over 420 sheep in north darfur' 'More than 420 sheep died in North Darfur after the rains came late, herders in north Kutum said.' 'Delayed rains kill over 420 sheep in North Darfur'
Assert-Case 'irene said filed a formal request for a briefing' 'MP Irene Said filed a formal request for a briefing. She said the funds were unclear.' 'Irene Said filed a formal request for a briefing'
Assert-Case 'a block at wuling m/a basic school has cracked' 'The block at Wuling M/A Basic School has cracked. The school has 400 pupils.' 'A block at Wuling M/A Basic School has cracked'
Assert-Case 'dilapidated classroom forces wuling pupils outside' 'The block at Wuling M/A Basic School has cracked. The school has 400 pupils.' 'Dilapidated classroom forces Wuling pupils outside'

Write-Host '[case-test] common words stay common' -ForegroundColor Cyan
Assert-Case 'former minister criticizes CAR flood response' 'Former Minister Jean Dupont said the response was slow. The minister spoke in Bangui.' 'Former minister criticizes CAR flood response'
Assert-Case 'student launches Algeria''s first traffic congestion index' 'A student developed the Algerian Urban Congestion Index, which maps traffic congestion.' 'Student launches Algeria''s first traffic congestion index'
Assert-Case 'sudanese teachers warn of collapse' 'The Sudanese Teachers'' Committee warned of collapse. Many teachers have not been paid.' 'Sudanese teachers warn of collapse'
Assert-Case 'the university has set up a commission' 'The University of Labe has set up a commission. The university will house students.' 'The university has set up a commission'

Write-Host '[case-test] place names and the rule for lines already cased' -ForegroundColor Cyan
Assert-Case 'eight million children out of school in sudan' 'Teachers say Sudanese schools are closing.' 'Eight million children out of school in Sudan' -Places
Assert-Case 'Kenya opens new market in Nairobi' 'The Kenyatta Market reopened.' 'Kenya opens new market in Nairobi'
Assert-Case 'two trains collide in Spain' 'Two trains collided in Spain on Monday.' 'Two trains collide in Spain'

Write-Host '[case-test] a story object' -ForegroundColor Cyan
$story = [pscustomobject]@{ headline = 'bangui floods destroy homes'; dek = 'heavy rain in bangui destroyed 300 homes.'; paragraphs = @('Floods in Bangui destroyed 300 homes on Sunday.'); why = '' }
$n = Repair-StoryCase $story '' $root
if ($n -eq 2 -and $story.headline -ceq 'Bangui floods destroy homes' -and $story.dek -ceq 'Heavy rain in Bangui destroyed 300 homes.') { $passed++; Write-Host '  PASS headline and dek both repaired' -ForegroundColor Green }
else { $failed++; Write-Host "  FAIL story: $n | $($story.headline) | $($story.dek)" -ForegroundColor Red }

Write-Host '[case-test] prose that lost its capitals' -ForegroundColor Cyan
# 30 Oct 2026, Cabo Verde: the whole story came back in lower case.
$recipe = [pscustomobject]@{ paragraphs = @('cape verdeans can bake bolo de milho using a recipe published on october 30, 2026. the recipe requires one can of milk and one can of sugar.', 'drained corn is blended with milk, sugar, cornmeal, oil, and eggs until finely ground. the batter is baked in a medium oven.', 'two tablespoons of grated coconut can be added.') }
$normal = [pscustomobject]@{ paragraphs = @('Kenya has confirmed nine cases of Ebola since October 9. The government has trained nearly 5,000 health workers.', 'Officials said 98 people remain in quarantine. They are due for release next week.', 'The UN has provided funds to support the response. eBay was not involved.') }
$monthOnly = [pscustomobject]@{ paragraphs = @('The hearing was moved to november 12 after a request from the defence.', 'The court agreed.', 'Lawyers said they would appeal.') }
foreach ($case in @(@($recipe, $true, 'a story in lower case is caught'), @($normal, $false, 'normal prose, one brand that starts in lower case, passes'), @($monthOnly, $true, 'a month in lower case before a day is caught'))) {
  if ((Test-LowerCaseProse $case[0]) -eq $case[1]) { $passed++; Write-Host "  PASS $($case[2])" -ForegroundColor Green }
  else { $failed++; Write-Host "  FAIL $($case[2])" -ForegroundColor Red }
}

Write-Host ''
Write-Host "[case-test] passed=$passed failed=$failed"
if ($failed) { exit 1 }
