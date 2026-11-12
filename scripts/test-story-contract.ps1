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
foreach ($functionName in @('Convert-NumberScanText','ConvertTo-NumberKey','Get-NumberReadings','Get-RelativeTimeWords','Get-CopiedRuns','Get-SubstantialCopies','Get-NumberKeys','Get-UngroundedNumbers','Get-UngroundedMonths','Get-ItemEvidenceText','Get-ItemUngroundedMonths','Get-LensGroundingIssues','Get-LensRelevanceBand','Get-LensBandWhy','Limit-DeskSentence','Test-DeskSentenceEndsBadly','ConvertTo-NumeralStyle','Test-SpeculativeText','Resolve-LensScore','Get-StockPhraseRules','Get-StockPhraseHits','Get-RepeatedSentences','Get-DraftStyleIssues','Get-StyleRepairNote','Get-DeskLanguageHits','Remove-DeskLanguage','Get-OverdueFutureDates')) {
  $definition = $writerAst.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $functionName
  }, $true) | Select-Object -First 1
  if (-not $definition) { throw "writer is missing $functionName" }
  $groundingDefinitions.Add($definition.Extent.Text)
}
Invoke-Expression ($groundingDefinitions.ToArray() -join "`n")
# The writer dot-sources story-shape.ps1 (Test-WhyRestatesDek, used by Get-DraftStyleIssues).
. (Join-Path $PSScriptRoot 'story-shape.ps1')
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

  # 4 Nov 2026: "as of March 11, 2026" from a Portuguese report that gave no date. 11 and
  # 2026 came from the report's own publication stamp, so the number check passed it.
  # The stamp is a real [datetime], as pwsh reads it out of feed-items.json.
  $ebola = [pscustomobject]@{
    source = 'Folha 8'; title = 'Mais de 5.100 mortos e 10.500 infectados com Ebola na RDCongo'
    articleEvidence = 'O Instituto Nacional de Saude Publica confirmou ate a data 5.103 mortos e 10.467 infectados com Ebola na RDCongo. Nas ultimas 24 horas morreram 45 pessoas. O surto da Africa Ocidental de 2014-2016 fez 28.616 casos e 11.325 mortos.'
    published = New-Object DateTime(2026, 11, 3, 18, 36, 30, [DateTimeKind]::Utc)
  }
  $ebolaDraft = 'The institute confirmed 5,103 deaths and 10,467 infections from Ebola as of March 11, 2026.'
  $missing = @(Get-UngroundedNumbers $ebolaDraft (Get-ItemEvidenceText $ebola))
  if ($missing.Count) { throw "the Ebola draft's figures should pass the number check, as on the desk: $($missing -join ', ')" }
  $missing = @(Get-ItemUngroundedMonths $ebolaDraft $ebola)
  if ($missing.Count -ne 1 -or $missing[0] -ne 'March 11, 2026') { throw "a month the source never gives was not caught: $($missing -join ', ')" }
  if ((Get-ItemEvidenceText $ebola -NoStamps) -match '2026 18:36' -or (Get-ItemEvidenceText $ebola) -notmatch '2026 18:36') { throw '-NoStamps should drop the stamp and only -NoStamps' }
  Write-Host 'PASS a month the source never gives is caught though its numbers pass (Ebola, 4 Nov 2026)'

  # 5 Nov 2026: figures written against a currency letter were never read, and a decimal
  # point that moved kept the same digits.
  $missing = @(Get-UngroundedNumbers 'Zambia plans to borrow K640 billion next year.' 'The budget plans borrowing of K64 billion next year.')
  if ($missing.Count -ne 1 -or $missing[0] -notmatch '640') { throw "K640 billion against K64 billion passed: $($missing -join ', ')" }
  if (@(Get-UngroundedNumbers 'Zambia plans to borrow K64 billion.' 'The budget plans borrowing of K64 billion.').Count) { throw 'a currency-glued figure the source gives was rejected' }
  $missing = @(Get-UngroundedNumbers 'The state raised N45bn.' 'The state raised N4.5bn from the bond.')
  if ($missing.Count -ne 1) { throw "N45bn against N4.5bn passed: $($missing -join ', ')" }
  $missing = @(Get-UngroundedNumbers 'Inflation rose 25% in October.' 'L''inflation a progresse de 2,5 % en octobre.')
  if ($missing.Count -ne 1) { throw "25% against 2,5 % passed: $($missing -join ', ')" }
  if (@(Get-UngroundedNumbers 'Inflation rose 2.5% in October.' 'L''inflation a progresse de 2,5 % en octobre.').Count) { throw '2.5% from 2,5 % was rejected' }
  $missing = @(Get-UngroundedNumbers 'The fund reaches 1.5 million farmers.' 'The fund reaches 15 million farmers.')
  if ($missing.Count -ne 1) { throw "1.5 million against 15 million passed: $($missing -join ', ')" }
  if (@(Get-UngroundedNumbers 'Prices rose 12 percent.' 'Prices rose 12% in a year.').Count) { throw '12 percent from 12% was rejected' }
  if (@(Get-UngroundedNumbers 'About 4.5 billion dinars were spent.' 'Pres de 4,5 milliards de dinars ont ete depenses.').Count) { throw '4.5 billion from 4,5 milliards was rejected' }
  Write-Host 'PASS currency-glued figures and moved decimal points are caught; faithful conversions pass'

  $missing = @(Get-UngroundedMonths 'The bulletin came out on Monday, November 3.' 'O boletim saiu a 3 de Novembro de 2026.' $null)
  if ($missing.Count) { throw "a month the source names in Portuguese was rejected: $($missing -join ', ')" }
  $missing = @(Get-ItemUngroundedMonths 'The institute gave the figures as of November 3, 2026.' $ebola)
  if ($missing.Count) { throw "the publication month was rejected: $($missing -join ', ')" }
  $missing = @(Get-UngroundedMonths 'The vote is due in March and the count by December.' ("Le scrutin aura lieu en mars et le d" + [char]0x00E9 + 'pouillement avant d' + [char]0x00E9 + 'cembre.') $null)
  if ($missing.Count) { throw "French month names (accented) were rejected: $($missing -join ', ')" }
  $missing = @(Get-UngroundedMonths 'Work started in August and ends on November 3.' 'Las obras empezaron en agosto. Fin previsto: 03/11/2026.' $null)
  if ($missing.Count) { throw "a Spanish month or a numeric date was rejected: $($missing -join ', ')" }
  Write-Host 'PASS a month named in the evidence (any of four languages), in a numeric date or as the publication month is grounded'

  $missing = @(Get-UngroundedMonths 'Prices have risen since May.' 'Prices may rise again, traders said.' $null)
  if ($missing.Count -ne 1 -or $missing[0] -ne 'May') { throw 'the verb "may" grounded the month May' }
  $missing = @(Get-UngroundedMonths 'The plant reopened in August.' 'The plant closed two years ago.' $null)
  if ($missing.Count -ne 1) { throw 'the word "ago" grounded August' }
  $missing = @(Get-UngroundedMonths 'The count closed on Nov. 3.' 'The count closed on Tuesday.' $null)
  if ($missing.Count -ne 1 -or $missing[0] -ne 'Nov. 3') { throw "an abbreviated month was not checked: $($missing -join ', ')" }
  $missing = @(Get-UngroundedMonths 'Thousands joined the Women''s March, and May Ndlovu spoke. Prices may fall.' 'Milhares juntaram-se ao protesto.' $null)
  if ($missing.Count) { throw "a word or a name was read as a month: $($missing -join ', ')" }
  Write-Host 'PASS "may", "ago" and names are not months; an abbreviated month is checked'

  $lensFixture = [pscustomobject]@{ lenses = [pscustomobject]@{
    farmers = [pscustomobject]@{ score = 12; why = 'The report establishes no direct effect on farmers or agricultural markets.' }
    investors = [pscustomobject]@{ score = 70; why = 'The report names a direct change to company licensing and capital requirements.' }
    diaspora = [pscustomobject]@{ score = 10; why = 'The report establishes no direct effect on diaspora travel, families or money.' }
  } }
  $lensIssues = @(Get-LensGroundingIssues $lensFixture)
  if ($lensIssues.Count) { throw "grounded lens package was rejected: $($lensIssues -join '; ')" }
  Write-Host 'PASS structurally complete lens package is accepted'

  # The band is a ceiling. The only floor left is a farming story for farmers.
  $band = Get-LensRelevanceBand 'farmers' 'Business' 'Italian firms will modernize agricultural machinery and farming methods.'
  if ($band.Mode -ne 'direct' -or $band.Min -ne 0 -or $band.Max -ne 100) { throw 'farm-related business story should allow the full farmer range with no floor' }
  $band = Get-LensRelevanceBand 'farmers' 'Agriculture' 'The ministry distributed maize seed to 4,000 farmers.'
  if ($band.Mode -ne 'direct' -or $band.Min -ne 61) { throw 'an Agriculture story lost its farmer floor' }
  Write-Host 'PASS farming text opens the farmer range; only Agriculture stories keep a floor'

  $band = Get-LensRelevanceBand 'investors' 'Sport' 'Tournament regulations set the squad size while a player retains market value.'
  if ($band.Mode -ne 'none' -or $band.Max -ne 20) { throw 'sports story escaped the low investor band' }
  Write-Host 'PASS sports story stays in low investor band'

  $band = Get-LensRelevanceBand 'diaspora' 'Sport' 'The national football team begins its tournament on Saturday.'
  if ($band.Mode -ne 'identity' -or $band.Min -ne 21 -or $band.Max -ne 40) { throw 'sports story missed the diaspora reader-interest band (21-40)' }
  Write-Host 'PASS national sports story enters diaspora identity band'

  $band = Get-LensRelevanceBand 'diaspora' 'Business' 'Ferry passengers traveling abroad must report to the port early.'
  if ($band.Mode -ne 'direct' -or $band.Min -ne 0 -or $band.Max -ne 100) { throw 'ferry travel missed direct diaspora band' }
  Write-Host 'PASS ferry travel enters direct diaspora band'

  # Lens scores: the model's score stands; a hedged reason is scored as no direct link.
  $entry = { param($s, $w) [pscustomobject]@{ score = $s; why = $w } }
  $r = Resolve-LensScore 'investors' 'Politics' 'Parliament debated a trade union law on Tuesday.' (& $entry 10 'Parliament debated a law on trade unions with no company or market named.') 15 'fallback why line for this story here'
  if ($r.Score -ne 10) { throw "a trade mention lifted the investor score to $($r.Score) (the old floor was 65)" }
  Write-Host 'PASS a keyword mention no longer lifts the investor score'
  $r = Resolve-LensScore 'investors' 'Politics' 'Police arrested 55 protesters over housing costs and rental reforms backed by property companies.' (& $entry 65 'Investors may be concerned about social unrest and potential government policy changes in housing.') 15 'fallback why line for this story here'
  if ($r.Score -gt 20 -or -not $r.Capped -or $r.Why -notmatch 'no direct effect') { throw "speculative investor reason kept score $($r.Score)" }
  Write-Host 'PASS a may/could investor reason is scored as no direct link'
  $r = Resolve-LensScore 'investors' 'Business' 'Standard Chartered Bank confirmed its chief executive after central bank approval.' (& $entry 85 'The bank named a chief executive after central bank approval, setting its leadership for clients and markets.') 55 'fallback why line for this story here'
  if ($r.Score -ne 85 -or $r.Capped) { throw "a direct, unhedged investor reason was changed to $($r.Score)" }
  Write-Host 'PASS a direct investor reason keeps its score'
  $r = Resolve-LensScore 'investors' 'Business' 'The central bank cut its policy rate in May.' (& $entry 70 'The central bank cut its policy rate in May, lowering borrowing costs for firms.') 55 'fallback why line for this story here'
  if ($r.Score -ne 70 -or $r.Capped) { throw 'the month May was read as a hedge' }
  Write-Host 'PASS the month May is not a hedge'
  $r = Resolve-LensScore 'diaspora' 'Politics' 'The president named a new cabinet on Monday.' (& $entry 60 'Diaspora readers could follow the new cabinet, which might change consular policy abroad.') 25 'fallback why line for this story here'
  if ($r.Score -lt 21 -or $r.Score -gt 40 -or $r.Why -notmatch 'may interest diaspora readers') { throw "hedged diaspora politics reason scored $($r.Score)" }
  Write-Host 'PASS hedged diaspora politics falls to reader interest (21-40)'
  $r = Resolve-LensScore 'farmers' 'Agriculture' 'Farmers received maize seed and fertiliser.' (& $entry 80 'Farmers could plant earlier with the seed and fertiliser handed out on Monday.') 70 'fallback why line for this story here'
  if ($r.Score -lt 61 -or $r.Capped) { throw 'an Agriculture story lost its farmer score to a hedge' }
  Write-Host 'PASS a farming story keeps its farmer score'

  # House style.
  $hits = @(Get-StockPhraseHits 'The deal marks a significant step and is crucial for exporters.' 'The ministry signed the deal with exporters on Monday.')
  if ($hits.Count -lt 2) { throw "expected at least two stock phrases, got: $($hits -join ', ')" }
  $hits = @(Get-StockPhraseHits 'Officials called the vote crucial for the budget.' "Les responsables ont jug\u00e9 le vote crucial pour le budget.")
  if ($hits.Count) { throw 'a phrase the source itself used was flagged' }
  $hits = @(Get-StockPhraseHits 'Minister Tavares highlighted the importance of coordination.' 'Tavares spoke on Monday.')
  if ($hits.Count) { throw 'an attributed "highlighted the importance" was flagged' }
  $hits = @(Get-StockPhraseHits 'The visit underscores the growing ties between the two states.' 'The president visited on Monday.')
  if ($hits.Count -ne 1) { throw 'commentary "the visit underscores" was not flagged' }
  Write-Host 'PASS stock phrases are flagged unless the source used them or a person said them'
  $rep = @(Get-RepeatedSentences @('The assembly limited deputies to two oral questions each month to clear a backlog of unanswered questions.', 'The rule aims to clear the backlog of unanswered oral questions, limiting deputies to two questions each month.', 'Written questions remain unlimited.'))
  if ($rep.Count -ne 1) { throw 'a restated fact was not detected' }
  $rep = @(Get-RepeatedSentences @('The ministry opened a freight checkpoint in Kisumu on Tuesday.', 'Inspectors will publish daily queue estimates for drivers.', 'Two trade groups reported shorter waits during the trial.'))
  if ($rep.Count) { throw 'distinct sentences were reported as repeats' }
  Write-Host 'PASS a restated fact is detected and distinct sentences are not'
  $draft = [pscustomobject]@{ item = 0; headline = 'Algeria limits oral questions'; dek = 'Deputies may ask two oral questions a month under the new rule.'; paragraphs = @('The assembly set a limit of two oral questions a month.', 'Written questions remain unlimited, the assembly said.', 'This move underscores a broader strategy for parliamentary oversight.'); why = 'Citizens may see faster government answers on local issues.' }
  $style = Get-DraftStyleIssues $draft 'The assembly limits deputies to two oral questions a month. Written questions remain unlimited.'
  if (-not $style.SpeculativeWhy -or @($style.Phrases).Count -lt 2) { throw "style issues missed: $(@($style.Issues) -join '; ')" }
  $note = Get-StyleRepairNote $style $draft
  if ($note -notmatch 'Previous draft:' -or $note -notmatch 'broader strategy' -or $note -notmatch '"item":0') { throw 'the repair note lacks the phrases or the previous draft' }
  Write-Host 'PASS style issues produce a repair note carrying the phrases and the previous draft'
  # 10 Nov 2026: a why line that has to guess is not shown at all (the site and the static
  # pages both call this). "May" the month is not a guess.
  if (-not (Test-WhyGuesses 'Farmers could pay more for seed next season.')) { throw 'a guessing why line was not caught' }
  if (Test-WhyGuesses 'The new tariff takes effect in May for every household.') { throw 'the month May was read as a guess' }
  if (Test-WhyGuesses 'The ministry says traders will pay 5% less at the border.') { throw 'a stated effect was read as a guess' }
  Write-Host 'PASS a why line that guesses is caught, and the month of May is not'
  # 28 Oct 2026: a quarter of the "why" lines said the dek again in other words.
  $echo = [pscustomobject]@{ item = 0; headline = 'Benin launches sixth phase of commune development fund'; dek = 'The FADeC VI program will support investments in all 77 communes, with a resilience component for 27 northern communes.'; paragraphs = @('Benin launched the sixth phase of its commune fund on Monday.', 'All 77 communes will receive investment money.', 'Twenty-seven northern communes get an extra resilience component.'); why = 'Benin''s FADeC VI program will support investments in all 77 communes, with a specific resilience component for 27 northern communes.' }
  $style = Get-DraftStyleIssues $echo 'Benin launched FADeC VI for 77 communes.'
  if (-not $style.RestatedWhy) { throw "a why line that restates the dek was not flagged: $(@($style.Issues) -join '; ')" }
  if ((Get-StyleRepairNote $style $echo) -notmatch 'says the headline, dek or opening paragraph again') { throw 'the repair note does not ask for a new why line' }
  $echo.why = 'Northern communes hit by flooding and attacks get money set aside to rebuild roads and markets.'
  if ((Get-DraftStyleIssues $echo 'Benin launched FADeC VI for 77 communes.').RestatedWhy) { throw 'a why line that adds a consequence was flagged' }
  Write-Host 'PASS a why line that restates the dek is sent back; one that adds a consequence is not'
  # 10 Nov 2026: the opening paragraph counts as already told.
  $crash = [pscustomobject]@{ item = 0; headline = 'Two buses collide, killing six in Burkina Faso'; dek = 'The crash happened on the road to Bobo-Dioulasso.'; paragraphs = @('Six people died and others were injured when two buses collided on the national road.', 'The transport ministry opened an inquiry.'); why = 'Six people died and others were injured in a road accident involving two buses in Burkina Faso.' }
  if (-not (Test-WhyRestatesDek $crash)) { throw 'a why line that repeats the opening paragraph was not caught' }
  $crash.why = 'The national road is the main freight route to Bobo-Dioulasso and stays closed while the inquiry runs.'
  if (Test-WhyRestatesDek $crash) { throw 'a why line with new facts was read as a repeat of the opening paragraph' }
  Write-Host 'PASS a why line that repeats the opening paragraph is caught; one with new facts is not'

  $times = @(Get-RelativeTimeWords 'The ministry said on Tuesday that talks resume next week. Yesterday the union walked out.')
  if (($times -join '|') -ne 'next week|Yesterday') { throw "relative time words missed: $($times -join '|')" }
  if (@(Get-RelativeTimeWords 'The minister told USA Today that "the vote is today" in Lagos.').Count) { throw 'a name or a quotation was read as relative time' }
  $timed = [pscustomobject]@{ item = 0; headline = 'Ghana opens Tema berth'; dek = 'The port authority opened the berth to container ships.'; paragraphs = @('The Ghana Ports and Harbours Authority opened the berth today.', 'It handles 400 ships a year.', 'Officials will review traffic in March.'); why = 'Importers in Tema get shorter queues for container ships.' }
  $style = Get-DraftStyleIssues $timed 'The authority opened the berth on Tuesday. It handles 400 ships a year.'
  if (@($style.RelativeTime).Count -ne 1 -or (Get-StyleRepairNote $style $timed) -notmatch 'weekday or date the packet itself states') { throw 'a story counting from today was not sent back' }
  Write-Host 'PASS days counted from today are sent back; names and quotations are not'

  $source = 'The Central Bank of Kenya held its benchmark lending rate at 9.5 percent on Tuesday, citing easing inflation and a stable shilling against the dollar.'
  $runs = @(Get-CopiedRuns @('The Central Bank of Kenya held its benchmark lending rate at 9.5 percent on Tuesday, the bank said.') $source)
  if ($runs.Count -ne 1 -or $runs[0] -notmatch '^The Central Bank of Kenya held its benchmark lending rate at 9\.5 percent on Tuesday$') { throw "a copied run was not found whole: $($runs -join ' | ')" }
  if (@(Get-CopiedRuns @('Kenya''s central bank kept its main rate at 9.5 percent on Tuesday as inflation eased.') $source).Count) { throw 'a paraphrase was reported as copied' }
  if (@(Get-CopiedRuns @('The governor said "the Central Bank of Kenya held its benchmark lending rate at 9.5 percent" on Tuesday.') $source).Count) { throw 'a quotation was reported as copied' }
  Write-Host 'PASS a copied run of twelve words is found whole; paraphrase and quotation are not'

  # 11 Nov 2026: a list of border posts the fact check makes the writer keep was sent back
  # as "copying" and no rewrite could pass. Names and lists do not count; copied prose does.
  $posts = 'Officers seized 2.8 tonnes of illegal medicines at Martin''s Drift Border Gate, Palapye, the Mamuno Border Gate, Kasane, Kazungula and Pandamatenga last month, the ministry said.'
  $listStory = @('Botswana seized 2.8 tonnes of unregistered medicine in October.', 'The goods were stopped at Martin''s Drift Border Gate, Palapye, the Mamuno Border Gate, Kasane, Kazungula and Pandamatenga.', 'The ministry said the medicine was worth more than P500,000 and will be destroyed.')
  if (@(Get-CopiedRuns $listStory $posts).Count -lt 1) { throw 'the test list was not even a 12-word match' }
  if (@(Get-SubstantialCopies $listStory $posts).Count) { throw 'a list of names kept exactly was sent back as copying' }
  $prose = 'Farmers in the region have been forced to sell their maize at a loss because traders arrived late and storage facilities remained closed for most of the harvest season, leaving many households without income.'
  $copyStory = @('Kenyan farmers are losing money on this year''s crop.', 'Farmers in the region have been forced to sell their maize at a loss because traders arrived late and storage facilities remained closed for most of the harvest season.', 'The county plans new stores next year.')
  if (@(Get-SubstantialCopies $copyStory $prose).Count -ne 1) { throw 'a long copied passage of ordinary prose was not sent back' }
  $copyStyle = Get-DraftStyleIssues ([pscustomobject]@{ item = 0; headline = 'Kenyan farmers sell maize at a loss'; dek = 'Late traders and closed stores cut prices this harvest.'; paragraphs = $copyStory; why = 'Households that rely on the maize harvest lose their main income for the season.' }) $prose
  if (@($copyStyle.Copied).Count -ne 1 -or (Get-StyleRepairNote $copyStyle ([pscustomobject]@{ item = 0 })) -notmatch 'Rebuild those sentences, do not swap words') { throw 'copied prose did not get the restructure note' }
  Write-Host 'PASS names and lists kept exactly are not copying; a long copied passage is sent back to be rebuilt'


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

# House style: numerals from 10 up, set only after grounding has passed. Each case is
# one the desk actually wrote, or one a careless converter would get wrong.
foreach ($case in @(
  @('The province accounts for two thousand four hundred seventy-two suspected cases.', 'The province accounts for 2,472 suspected cases.'),
  @('A court convicted him of one hundred ninety-one murders', 'A court convicted him of 191 murders'),
  @('adopted unanimously by the seventy-one members', 'adopted unanimously by the 71 members'),
  @('Twenty-eight high-risk counties received supplies.', '28 high-risk counties received supplies.'),
  @('one hundred and twenty days', '120 days'),
  @('a ten-year plan worth twenty million dollars', 'a 10-year plan worth 20 million dollars'),
  @('teams ranked ninth through twenty-fourth', 'teams ranked ninth through twenty-fourth'),
  @('seven ministers and one deputy', 'seven ministers and one deputy'),
  @('hundreds of people and a hundred cars', 'hundreds of people and a hundred cars'),
  @('in nineteen ninety-four', 'in nineteen ninety-four'),
  @('someone often went to the tent', 'someone often went to the tent'),
  @('The figure rose to 2,472 from 1,900.', 'The figure rose to 2,472 from 1,900.'))) {
  $got = ConvertTo-NumeralStyle $case[0]
  if ($got -ne $case[1]) { throw "numeral style: '$($case[0])' became '$got', expected '$($case[1])'" }
}
Write-Host 'PASS numbers from ten up are set as numerals; ordinals, years and small numbers are not'

# The desk's working words never reach the reader. Each case ran on 12 Nov 2026.
$noEvidence = 'Dealers in Lagos quoted the dollar at higher rates on Thursday.'
if (-not @(Get-DeskLanguageHits 'Importers face a widening gap, as the packet reports.' $noEvidence).Count) { throw 'the packet was not flagged' }
if (@(Get-DeskLanguageHits 'Repairs could take a small packet of months.' $noEvidence).Count) { throw 'an ordinary packet was flagged' }
if (@(Get-DeskLanguageHits 'The packet of measures takes effect in March.' 'The government adopted a packet of measures.').Count) { throw 'a packet the source itself reports was flagged' }
foreach ($case in @(
  @('Importers and businesses paying in dollars face a widening gap between official and street rates, as the packet reports.', 'Importers and businesses paying in dollars face a widening gap between official and street rates.'),
  @('Ginning starts after the first step. The packet does not give a start date. Farmers were told to wait.', 'Ginning starts after the first step. Farmers were told to wait.'),
  @('Yields fell after irregular rainfall damage, which the packet links to government delays.', 'Yields fell after irregular rainfall damage, which the report links to government delays.'),
  @('The packet says success will depend on funding.', 'The report says success will depend on funding.'),
  @('Repairs could take a small packet of months.', 'Repairs could take a small packet of months.'))) {
  $got = Remove-DeskLanguage $case[0] $noEvidence
  if ($got -cne $case[1]) { throw "desk language: '$($case[0])' became '$got'" }
}
if ((Remove-DeskLanguage 'The packet does not say which projects are funded.' $noEvidence -ReplaceOnly) -cne 'The report does not say which projects are funded.') { throw 'ReplaceOnly dropped a sentence' }
if ((Remove-DeskLanguage 'The packet of measures takes effect in March.' 'The government adopted a packet of measures.') -cne 'The packet of measures takes effect in March.') { throw 'a packet the source reports was rewritten' }
$leak = [pscustomobject]@{ headline = 'Naira slides against dollar as Thursday trading opens'; dek = 'Official and street rates diverge as importers buy dollars.'; why = 'Importers paying in dollars face a wider gap of 68 naira, as the packet reports.'; paragraphs = @('The naira opened lower in Lagos on Thursday.', 'Dealers quoted higher rates.', 'Analysts cited importer demand.') }
if ((Get-DraftStyleIssues $leak $noEvidence).Issues -notmatch 'desk language') { throw 'a draft that says "the packet" passed the style check' }
Write-Host 'PASS the desk''s working words are flagged in a draft and taken out of finished copy'

# A date the story says something will happen on, already past on the edition day.
$edition = New-Object datetime(2026, 11, 12)
$late = @(Get-OverdueFutureDates 'Egyptian lawmakers will summon Transport Minister Kamel El-Wazir for an emergency session on Tuesday, November 11, following a deadly train collision on Sunday, November 8.' $edition)
if ($late.Count -ne 1 -or $late[0] -notmatch 'November 11') { throw "overdue date not found: $($late -join '; ')" }
foreach ($fine in @(
  'Parliament will vote on the budget on 14 November.',
  'The crash on November 8 killed seven people, and the minister was summoned.',
  'The minister said "we will meet on November 10" before the talks collapsed.',
  'Voters will choose a president on 3 January 2027.',
  'The court is due to rule on November 12.',
  'The plan may cost more, officials said on November 9.')) {
  if (@(Get-OverdueFutureDates $fine $edition).Count) { throw "date wrongly read as overdue: '$fine'" }
}
if (@(Get-OverdueFutureDates 'The team is set to play on 28 December.' (New-Object datetime(2027, 1, 2))).Count -ne 1) { throw 'a date in the year just ended was not read as past' }
Write-Host 'PASS a future tense on a date that has passed is caught; coming dates, past tenses and quotations are not'

# A why line a reader cannot check. The first three were published on 12 Nov 2026.
foreach ($generic in @(
  'The skills revolution aims to equip young South Africans with the capabilities needed for existing and emerging economic opportunities.',
  'Residents facing the shifting quarantine stance are left with unresolved questions about police accountability.',
  'The ruling highlights the role of the courts in holding officials to account.')) {
  if (-not (Test-WhyGeneric $generic)) { throw "generic why line passed: '$generic'" }
}
foreach ($solid in @(
  'About 5 million people aged 15 to 34 are out of work, and the official rate rose in the same quarter.',
  'Traders crossing at the border post now pay the levy in cash before their trucks are cleared, starting on Monday.',
  'Importers and businesses paying in dollars face a widening gap between official and street rates.')) {
  if (Test-WhyGeneric $solid) { throw "a why line that carries the stake was called generic: '$solid'" }
}
Write-Host 'PASS a generic why line is sent back; one with a figure, a day or a plain effect is not'

Write-Host '[story-contract] OK - 38 checks'
exit 0
