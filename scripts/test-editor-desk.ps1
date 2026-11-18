# Tests for the standards editor (scripts/editor-desk.ps1): the rubric both the desk and
# the weekly review use, the parser that reads the editor's answer as untrusted, and the
# rule that turns grades into drop, revise or pass. No network.
#
#   powershell -ExecutionPolicy Bypass -File scripts/test-editor-desk.ps1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'editor-desk.ps1')

$script:failures = 0
$script:checks = 0
function Assert-Editor([string]$Name, [bool]$Condition) {
  $script:checks++
  if ($Condition) { Write-Host "  PASS $Name" }
  else { $script:failures++; Write-Host "  FAIL $Name" -ForegroundColor Red }
}
function New-Grades([int]$Context = 4, [int]$Headline = 4, [int]$Why = 4, [int]$Clarity = 4, [int]$Country = 4, [int]$Standards = 4) {
  return [ordered]@{ context = $Context; headline = $Headline; why = $Why; clarity = $Clarity; country = $Country; standards = $Standards }
}

# --- the rubric ------------------------------------------------------------------------
$weekly = Get-EditorRubric
$desk = Get-EditorRubric -WithPacket
foreach ($c in $script:EDITOR_CRITERIA) { Assert-Editor "rubric grades $c" ($weekly -match "(?m)^- ${c}:" -and $desk -match "(?m)^- ${c}:") }
Assert-Editor 'the weekly rubric asks for no fixes' ($weekly -notmatch '"fixes"')
Assert-Editor 'the desk rubric asks for fixes' ($desk -match '"fixes"')
Assert-Editor 'fixes may only use packet facts' ($desk -match 'never ask the writer to supply it')
Assert-Editor 'soft news is named in the standards grade' ($desk -match 'courtesy' -and $desk -match 'anniversary')
Assert-Editor 'the African lens is in the rubric' ($desk -match 'African lens')
Assert-Editor 'the rubric is ASCII' (-not ($desk -match '[^\x09\x0A\x0D\x20-\x7E]'))

# --- reading the editor's answer --------------------------------------------------------
$good = ConvertFrom-EditorVerdict '{"context":2,"headline":4,"why":1,"clarity":3,"country":5,"standards":3,"problems":["The why line repeats the story."],"fixes":["Say Natembeya is governor of Trans Nzoia, as the packet does.","Use the 6 billion shilling cost from paragraph 2 of the packet in the why line."]}'
Assert-Editor 'a clean verdict is valid' $good.Valid
Assert-Editor 'grades are read' ($good.Grades['why'] -eq 1 -and $good.Grades['country'] -eq 5)
Assert-Editor 'fixes are read' (@($good.Fixes).Count -eq 2)
Assert-Editor 'problems are read' (@($good.Problems).Count -eq 1)
$wrapped = ConvertFrom-EditorVerdict ("Here is my review:`n" + '```json' + "`n" + '{"context":3,"headline":3,"why":3,"clarity":3,"country":3,"standards":3,"problems":[],"fixes":[]}' + "`n" + '```')
Assert-Editor 'a verdict wrapped in prose and fences is read' $wrapped.Valid
Assert-Editor 'a whole number written as 4.0 is read' (ConvertFrom-EditorVerdict '{"context":4.0,"headline":4,"why":4,"clarity":4,"country":4,"standards":4}').Valid
Assert-Editor 'a half grade is refused' (-not (ConvertFrom-EditorVerdict '{"context":3.5,"headline":4,"why":4,"clarity":4,"country":4,"standards":4}').Valid)
Assert-Editor 'a grade of 0 is refused' (-not (ConvertFrom-EditorVerdict '{"context":0,"headline":4,"why":4,"clarity":4,"country":4,"standards":4}').Valid)
Assert-Editor 'a grade of 6 is refused' (-not (ConvertFrom-EditorVerdict '{"context":6,"headline":4,"why":4,"clarity":4,"country":4,"standards":4}').Valid)
Assert-Editor 'a missing grade is refused' (-not (ConvertFrom-EditorVerdict '{"context":4,"headline":4,"why":4,"clarity":4,"country":4}').Valid)
Assert-Editor 'a word grade is refused' (-not (ConvertFrom-EditorVerdict '{"context":"good","headline":4,"why":4,"clarity":4,"country":4,"standards":4}').Valid)
Assert-Editor 'no JSON is refused' (-not (ConvertFrom-EditorVerdict 'The story is fine.').Valid)
Assert-Editor 'broken JSON is refused' (-not (ConvertFrom-EditorVerdict '{"context":4,').Valid)
$long = 'x' * 900
$many = ConvertFrom-EditorVerdict ('{"context":2,"headline":2,"why":2,"clarity":2,"country":4,"standards":4,"problems":["a b c d e f","' + $long + '","p3 p3 p3","p4 p4 p4"],"fixes":["fix one, cut it","fix two, cut it","fix three, cut it","fix four, cut it","fix five, cut it","ok"]}')
Assert-Editor 'at most four fixes are used' (@($many.Fixes).Count -eq 4)
Assert-Editor 'at most three problems are used' (@($many.Problems).Count -eq 3)
Assert-Editor 'a long note is cut to 320 characters' (@($many.Problems | Where-Object { $_.Length -gt 320 }).Count -eq 0)
Assert-Editor 'a fix too short to act on is dropped' (@($many.Fixes) -notcontains 'ok')
$multi = ConvertFrom-EditorVerdict ('{"context":2,"headline":4,"why":4,"clarity":4,"country":4,"standards":4,"fixes":["line one' + '\n' + 'line two"]}')
Assert-Editor 'a fix is one line' (@($multi.Fixes)[0] -eq 'line one line two')

# --- the decision ------------------------------------------------------------------------
Assert-Editor 'all 4s pass' ((Get-EditorDecision (New-Grades) $true) -eq 'pass')
Assert-Editor 'all 3s pass' ((Get-EditorDecision (New-Grades 3 3 3 3 3 3) $true) -eq 'pass')
Assert-Editor 'a weak why line is revised' ((Get-EditorDecision (New-Grades -Why 2) $true) -eq 'revise')
Assert-Editor 'missing context is revised' ((Get-EditorDecision (New-Grades -Context 1) $true) -eq 'revise')
Assert-Editor 'a wrong headline is revised' ((Get-EditorDecision (New-Grades -Headline 2) $true) -eq 'revise')
Assert-Editor 'padding is revised' ((Get-EditorDecision (New-Grades -Clarity 2) $true) -eq 'revise')
Assert-Editor 'soft news is dropped when the country has other copy' ((Get-EditorDecision (New-Grades -Standards 2) $true) -eq 'drop')
Assert-Editor 'foreign news is dropped when the country has other copy' ((Get-EditorDecision (New-Grades -Country 1) $true) -eq 'drop')
Assert-Editor 'a country''s only story is never dropped' ((Get-EditorDecision (New-Grades -Standards 1) $false) -eq 'pass')
Assert-Editor 'a country''s only story is still revised' ((Get-EditorDecision (New-Grades -Standards 1 -Why 1) $false) -eq 'revise')
Assert-Editor 'drop wins over revise' ((Get-EditorDecision (New-Grades -Standards 2 -Why 1) $true) -eq 'drop')
Assert-Editor 'the mean is the average of six' ([Math]::Abs((Get-EditorMean (New-Grades 1 2 3 4 5 3)) - 3.0) -lt 0.001)

# --- the repair note -----------------------------------------------------------------------
$draft = [pscustomobject]@{ item = 2; headline = 'Natembeya aide fights for life after attack'; dek = 'd'; paragraphs = @('p1','p2','p3'); why = 'w' }
$note = Get-EditorRepairNote $good $draft
Assert-Editor 'the note names the weak grades' ($note -match 'Weak: context, why')
Assert-Editor 'the note carries the fixes' ($note -match 'governor of Trans Nzoia' -and $note -match '6 billion shilling')
Assert-Editor 'a weak why line gets the why rule' ($note -match 'WHO is affected, HOW')
Assert-Editor 'weak context gets the first-mention rule' ($note -match 'On first mention')
Assert-Editor 'the note forbids invented facts' ($note -match 'Use ONLY facts in the packet' -and $note -match 'do not invent it')
Assert-Editor 'the note carries the previous draft' ($note -match 'Previous draft:' -and $note -match '"item":2')
$noFix = ConvertFrom-EditorVerdict '{"context":4,"headline":2,"why":4,"clarity":4,"country":4,"standards":4,"problems":["The headline is an opinion title."],"fixes":[]}'
$note2 = Get-EditorRepairNote $noFix $draft
Assert-Editor 'with no fixes, the problems are the instructions' ($note2 -match 'opinion title')
Assert-Editor 'a weak headline gets the headline rule' ($note2 -match 'actor, active verb')
Assert-Editor 'a strong why line gets no why rule' ($note2 -notmatch 'WHO is affected')

# --- what the editor reads -----------------------------------------------------------------
$prompt = Get-EditorPrompt $draft 'Kenya' ('z' * 7000) 6000
Assert-Editor 'the packet is capped' ($prompt.Length -lt 6700 -and $prompt -match '\[\.\.\.\]')
Assert-Editor 'the story is filed under its country' ($prompt -match 'Filed under: Kenya')
Assert-Editor 'the packet is marked untrusted' ($prompt -match 'untrusted reporting data')

Write-Host ''
if ($script:failures) { Write-Host "[editor-test] FAILED - $($script:failures) of $($script:checks) checks" -ForegroundColor Red; exit 1 }
Write-Host "[editor-test] OK - $($script:checks) checks" -ForegroundColor Green
exit 0
