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

# Load only the production grounding helpers without executing the writer. This keeps
# regressions tied to the exact functions used in the publication path.
$writerSource = [IO.File]::ReadAllText($writer, [Text.Encoding]::UTF8)
$parseTokens = $null
$parseErrors = $null
$writerAst = [Management.Automation.Language.Parser]::ParseInput($writerSource, [ref]$parseTokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'writer could not be parsed for grounding tests' }
$groundingDefinitions = New-Object System.Collections.Generic.List[string]
foreach ($functionName in @('Convert-NumberScanText','Get-NumberKeys','Get-UngroundedNumbers','Get-LensGroundingIssues','Get-LensRelevanceBand','Get-LensBandWhy','Limit-DeskSentence','Test-DeskSentenceEndsBadly')) {
  $definition = $writerAst.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $functionName
  }, $true) | Select-Object -First 1
  if (-not $definition) { throw "writer is missing $functionName" }
  $groundingDefinitions.Add($definition.Extent.Text)
}
Invoke-Expression ($groundingDefinitions.ToArray() -join "`n")
$STORY_LENSES = @('farmers','investors','diaspora')

function Write-Fixture([int]$ParagraphCount, [switch]$BadLens, [switch]$ShortStory) {
  $allParagraphs = @(
    'The transport ministry opened a new freight checkpoint on Tuesday after a month-long trial. Officials said the site will inspect trucks moving between the capital and the northern farming corridor, where delays had pushed delivery times beyond two days during the busiest market weeks.',
    'The ministry said forty inspectors will work in rotating teams and publish daily queue estimates. Two trade groups that monitored the trial reported shorter waits, although both said the test covered fewer vehicles than a normal harvest-season day and should not be treated as a final measure.',
    'Drivers can continue using the older crossing while the new lane is assessed. The ministry has not announced a permanent timetable. Farmers and wholesalers will be watching whether the added capacity lowers spoilage risk and transport costs once crop volumes rise later in the season.'
  )
  $paragraphs = if ($ShortStory) {
    @('Officials opened the checkpoint.', 'Truck inspections started on Tuesday.', 'Daily queue estimates will be published.')
  } else {
    @($allParagraphs | Select-Object -First $ParagraphCount)
  }
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

  Write-Fixture 3 -ShortStory
  & powershell -NoProfile -ExecutionPolicy Bypass -File $validator -BriefsFile $fixture -MinStoryPackages 1 *> $null
  if ($LASTEXITCODE -eq 0) { throw 'invalid short story was accepted' }
  Write-Host 'PASS story below the concise floor is rejected'

  $missing = @(Get-UngroundedNumbers 'The gates open at 6:00.' 'Ouverture des portes a 6h00.')
  if ($missing.Count) { throw 'equivalent clock formatting was rejected' }
  Write-Host 'PASS equivalent clock formatting is grounded'

  $missing = @(Get-UngroundedNumbers 'The project serves 27 districts.' 'The project serves several districts.')
  if ($missing.Count -ne 1 -or $missing[0] -ne '27') { throw 'invented figure was not rejected' }
  Write-Host 'PASS invented figure is rejected'

  $missing = @(Get-UngroundedNumbers 'The plan is worth 1 trillion dinars.' 'Le plan vaut 1000 milliards de dinars.')
  if ($missing.Count -ne 1 -or $missing[0] -notmatch '1\s*trillion') { throw 'magnitude conversion was accepted' }
  Write-Host 'PASS magnitude conversion is rejected'

  $missing = @(Get-UngroundedNumbers 'The plan is worth 1000 billion dinars.' 'Le plan vaut 1000 milliards de dinars.')
  if ($missing.Count) { throw 'faithful magnitude translation was rejected' }
  Write-Host 'PASS faithful magnitude translation is grounded'

  $missing = @(Get-UngroundedNumbers 'Africa 24 reported the decision.' 'Africa 24')
  if ($missing.Count) { throw 'numbered outlet attribution was rejected' }
  Write-Host 'PASS numbered outlet attribution is grounded'

  $arabicAnd = [string][char]0x0648
  $missing = @(Get-UngroundedNumbers 'The league moved the start to September 12.' ("The league moved to 11 and $arabicAnd" + '12 September.'))
  if ($missing.Count) { throw 'Arabic conjunction-attached figure was rejected' }
  Write-Host 'PASS Arabic conjunction-attached figure is grounded'

  $arabicTwelve = ([string][char]0x0661) + ([string][char]0x0662)
  $missing = @(Get-UngroundedNumbers 'The league moved the start to September 12.' ("The league moved to $arabicAnd$arabicTwelve September."))
  if ($missing.Count) { throw 'Arabic-Indic figure was rejected' }
  Write-Host 'PASS Arabic-Indic figure is grounded'

  $lensFixture = [pscustomobject]@{ lenses = [pscustomobject]@{
    farmers = [pscustomobject]@{ score = 12; why = 'The report establishes no direct effect on farmers or agricultural markets.' }
    investors = [pscustomobject]@{ score = 70; why = 'The report names a direct change to company licensing and capital requirements.' }
    diaspora = [pscustomobject]@{ score = 10; why = 'The report establishes no direct effect on diaspora travel, families or money.' }
  } }
  $lensIssues = @(Get-LensGroundingIssues $lensFixture)
  if ($lensIssues.Count) { throw "grounded lens package was rejected: $($lensIssues -join '; ')" }
  Write-Host 'PASS structurally complete lens package is accepted'

  $band = Get-LensRelevanceBand 'farmers' 'Business' 'Italian firms will modernize agricultural machinery and farming methods.'
  if ($band.Mode -ne 'direct' -or $band.Min -ne 75) { throw 'agriculture did not enter the strong farmer band' }
  Write-Host 'PASS agricultural story enters strong farmer band'

  $band = Get-LensRelevanceBand 'investors' 'Sport' 'Tournament regulations set the squad size while a player retains market value.'
  if ($band.Mode -ne 'none' -or $band.Max -ne 20) { throw 'sports story escaped the low investor band' }
  Write-Host 'PASS sports story stays in low investor band'

  $band = Get-LensRelevanceBand 'diaspora' 'Sport' 'The national football team begins its tournament on Saturday.'
  if ($band.Mode -ne 'identity' -or $band.Min -ne 30 -or $band.Max -ne 60) { throw 'sports story missed diaspora identity band' }
  Write-Host 'PASS national sports story enters diaspora identity band'

  $band = Get-LensRelevanceBand 'diaspora' 'Business' 'Ferry passengers traveling abroad must report to the port early.'
  if ($band.Mode -ne 'direct' -or $band.Min -ne 75) { throw 'ferry travel missed direct diaspora band' }
  Write-Host 'PASS ferry travel enters direct diaspora band'


  $longDek = ('The transport authority changed the passenger reporting window after publishing a detailed operational notice for every ticket holder. ' * 2).Trim()
  $limitedDek = Limit-DeskSentence $longDek 180
  if ($limitedDek.Length -gt 180 -or -not $limitedDek.EndsWith('.') -or $limitedDek -match ' tick\.$') {
    throw 'long dek was not trimmed cleanly at a word boundary'
  }
  # The old assertion only checked length and a trailing full stop, so it passed while
  # the desk shipped "...to the Independent Electoral and Boundaries Commission for." -
  # correctly punctuated and still a broken sentence. A dek must not end on a word a
  # sentence cannot end on.
  $danglingDek = 'The National Police Service will submit names of individuals with a history of promoting political violence to the Independent Electoral and Boundaries Commission for action ahead of 2027.'
  $trimmedDangling = Limit-DeskSentence $danglingDek 180
  $lastWord = ($trimmedDangling.TrimEnd([char[]]' .').Split(' ')[-1]).ToLowerInvariant()
  $dangleCheck = @('for','to','of','in','on','at','by','with','from','and','or','the','a','an','that','as','into','over','under','after','before','during','which','while','when','who','but','if','than','then','about','against','between','through')
  if ($dangleCheck -contains $lastWord) {
    throw "dek ends on a dangling word: '$lastWord' in '$trimmedDangling'"
  }
  # A dek that already contains a sentence end inside the budget should stop there
  # rather than being cut mid-clause further along.
  $twoSentence = 'Kenya holds its base rate at 12.5 percent. The shilling steadied against the dollar after three weeks of decline and traders now expect a calm quarter ahead of the vote.'
  $trimmedTwo = Limit-DeskSentence $twoSentence 120
  $twoLast = ($trimmedTwo.TrimEnd([char[]]' .').Split(' ')[-1]).ToLowerInvariant()
  if ($dangleCheck -contains $twoLast) {
    throw "multi-sentence dek ended on a dangling word: '$trimmedTwo'"
  }
  Write-Host 'PASS long dek is trimmed at a sentence boundary'
  Write-Host 'PASS dek never ends on a dangling word'

  $thinFeed = [ordered]@{
    fetched = '2026-08-20T09:00:00Z'
    byCountry = @{ xx = @{ country = 'Fixtureland'; items = @(1..5 | ForEach-Object { @{ title = "Candidate $_"; summary = 'Too thin.'; url = "https://example.com/$_" } }) } }
  }
  [IO.File]::WriteAllText($feedFixture, ($thinFeed | ConvertTo-Json -Depth 8), $utf8)
  & powershell -NoProfile -ExecutionPolicy Bypass -File $writer -Only xx -InFile $feedFixture `
    -OutFile $outFixture -MetricsFile $metricsFixture -NoCache *> $null
  $thinExit = $LASTEXITCODE
  $thinMetrics = [IO.File]::ReadAllText($metricsFixture, [Text.Encoding]::UTF8) | ConvertFrom-Json
  if ($thinExit -ne 1 -or $thinMetrics.apiCalls -ne 0 -or $thinMetrics.countriesSkippedBeforeModel -ne 1) {
    throw 'thin candidate desk was not skipped before the model call'
  }
  Write-Host 'PASS five thin-evidence candidates spend zero model calls'
} finally {
  foreach ($path in @($fixture, $feedFixture, $metricsFixture, $outFixture)) {
    if (Test-Path $path) { Remove-Item -LiteralPath $path -Force }
  }
}


# The dek trimmer and the draft contract each carry their own copy of the dangling-word
# list, because a script-scope variable disappears when either function is imported on
# its own and the walk-back then no-ops while printing PASS. Duplication is the right
# call there; drifting duplication is not, so assert they still agree.
$writerText = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'write-briefs.ps1'), [Text.Encoding]::UTF8)
$lists = [regex]::Matches($writerText, "(?s)\`$dangling = @\((.*?)\)\r?\n")
if ($lists.Count -ne 2) { throw "expected two dangling-word lists in the writer, found $($lists.Count)" }
$normalise = { param($s) ($s -replace '\s+', '') }
if ((& $normalise $lists[0].Groups[1].Value) -ne (& $normalise $lists[1].Groups[1].Value)) {
  throw 'the two dangling-word lists have drifted apart'
}
Write-Host 'PASS both dangling-word lists still agree'

# A fragment ending on a function word must be caught by the contract, not punctuated
# and published. This check knows prepositions, articles and conjunctions - it cannot
# tell that "...six historic Comorian." is also a fragment, because that needs to know
# "Comorian" is an adjective here. The prompt target and the 170-character schema cap
# are what keep the writer from composing into that shape in the first place.
foreach ($bad in @(
  'Police arrested four suspects in a raid on a warehouse owned by',
  'The bank raised its policy rate, citing inflation and',
  'The ministry issued the inscription certificate for')) {
  if (-not (Test-DeskSentenceEndsBadly $bad)) { throw "fragment not detected: '$bad'" }
}
foreach ($good in @(
  'The central bank raised its policy rate to 8.75 percent as inflation reached 14.5 percent.',
  'Nchimbi resigned as vice president and was expelled from the ruling party.',
  'Eight civilians were killed in a drone strike in North Kordofan')) {
  if (Test-DeskSentenceEndsBadly $good) { throw "complete sentence wrongly flagged: '$good'" }
}
Write-Host 'PASS dek fragments are detected and complete sentences are not'

Write-Host '[story-contract] OK - 20 checks'
exit 0
