#Requires -Version 5.1
<#
.SYNOPSIS
  Shared, deterministic ranking helpers for the ASJ news desk.
.DESCRIPTION
  This file has no side effects. fetch-news.ps1 dot-sources it to score and select
  candidates, while test-news-ranking.ps1 exercises the same production functions.
  Scores stay decomposed so an editor can see why an item ranked instead of trusting
  one opaque number.
#>

$script:NEWS_STOP = @{}
foreach ($word in @(
  # English
  'about','after','against','among','announced','around','because','been','before','being','between','could','during',
  'from','have','into','more','most','over','said','says','should','since','than','that','their','them','then','there',
  'these','they','this','those','through','under','until','were','what','when','where','which','while','will','with',
  'would','your','news','report','reports','article','appeared','first','outlet','source','according',
  # French
  'avec','apres','avant','contre','dans','depuis','entre','leurs','plus','pour','selon','sous','tout','tous','une',
  'des','les','aux','sur','par','que','qui','est','sont','avoir','fait','cette','comme','premier','agence','presse',
  # Portuguese and Spanish
  'para','desde','sobre','entre','como','esta','este','estos','estas','pero','porque','donde','cuando','tiene','una',
  'uno','unos','unas','los','las','del','con','por','mais','uma','dos','das','seu','sua','pelo','pela','nao','sem',
  # Feed boilerplate and low-signal desk language
  'post','entrada','publico','publicado','information','actualite','website','read','full','story','latest','today'
)) { $script:NEWS_STOP[$word] = $true }

$script:NEWS_CANON = @{
  'journaliste'='journalist'; 'journalistes'='journalist'; 'journalists'='journalist'; 'periodista'='journalist'; 'periodistas'='journalist'
  'francais'='french'; 'francaise'='french'; 'francaises'='french'; 'frances'='french'; 'franceses'='french'
  'arrestation'='detained'; 'arrestations'='detained'; 'arrested'='detained'; 'detention'='detained'; 'detained'='detained'
  'detenu'='detained'; 'detenus'='detained'; 'detenido'='detained'; 'detenidos'='detained'
  'elections'='election'; 'electoral'='election'; 'elecciones'='election'; 'eleicao'='election'; 'eleicoes'='election'
  'gouvernement'='government'; 'gobierno'='government'; 'governo'='government'; 'governments'='government'
  'presidente'='president'; 'presidents'='president'
  'dette'='debt'; 'dettes'='debt'; 'deuda'='debt'; 'divida'='debt'
  'hopital'='hospital'; 'hopitaux'='hospital'; 'hospitales'='hospital'
  'sante'='health'; 'salud'='health'; 'saude'='health'
  'justice'='court'; 'justicia'='court'; 'tribunal'='court'
  'petrole'='oil'; 'petroleo'='oil'; 'petroleos'='oil'
  'senat'='parliament'; 'senado'='parliament'
  'patrimoine'='heritage'; 'patrimonio'='heritage'
}

$script:NEWS_TOPIC_RULES = [ordered]@{
  Health      = @('health','hospital','clinic','doctor','nurse','outbreak','cholera','malaria','vaccine','disease','medicine')
  Education   = @('school','university','student','teacher','education','exam','classroom','college')
  Climate     = @('climate','flood','drought','rainfall','storm','cyclone','wildfire','heatwave','emissions')
  Agriculture = @('agriculture','farmer','harvest','crop','maize','wheat','cocoa','coffee','livestock','fertilizer','food security')
  Tech        = @('technology','digital','telecom','internet','startup','software','cyber','satellite','artificial intelligence')
  Sport       = @('football','soccer','basketball','athletics','tournament','league','cup final','olympic','sport')
  Culture     = @('culture','heritage','music','film','book','artist','museum','festival','theatre','fashion')
  Business    = @('inflation','bank','budget','tax','debt','bond','gdp','economy','currency','exchange rate','export','import','trade',
                  'investment','investor','business','market','company','industry','mine','mining','oil','gas','fuel','power','electricity',
                  'jobs','wage','unemployment','tariff','levy','price')
  Politics    = @('election','parliament','minister','president','government','court','ruling','law','bill','constitution','protest',
                  'strike','sanctions','treaty','summit','diplomat','security','attack','military','police','refugee','detained','journalist')
}

$script:NEWS_URGENT = @('killed','dead','death','fatal','crash','attack','war','coup','outbreak','cholera','flood','drought','cyclone',
                        'wildfire','famine','evacuation','emergency','collapse','capsize','hostage','refugee')
$script:NEWS_PUBLIC = @('election','budget','tax','debt','inflation','interest rate','currency','court','law','bill','parliament',
                        'strike','protest','security','hospital','health','school','university',
                        'fuel','food','power','electricity','unemployment','jobs','wage','sanctions','treaty')
$script:NEWS_ECONOMIC = @('investment','trade','export','import','mine','mining','oil','gas','agriculture','harvest','infrastructure',
                          'rail','port','telecom','bank','business','market','factory','industry')
$script:NEWS_JUNK = @('celebrity','wedding','romance','dating','gossip','horoscope','recipe','red carpet','lingerie','net worth',
                      'betting','odds','jackpot','lottery','showbiz','soap opera','reality tv','pageant','road trip experience',
                      'car review','test drive')
$script:NEWS_LOW_VALUE = @('opinion','analysis','commentary','editorial','keynote address','statement of','press release','sponsored',
                           'partner content','public seminar','public seminars','conference commences','weekly roundup')

function ConvertTo-NewsText([string]$Text) {
  if (-not $Text) { return '' }
  $decomposed = $Text.Normalize([Text.NormalizationForm]::FormD)
  $builder = New-Object Text.StringBuilder
  foreach ($ch in $decomposed.ToCharArray()) {
    $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
    if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark) { [void]$builder.Append($ch) }
  }
  $plain = $builder.ToString().Normalize([Text.NormalizationForm]::FormC).ToLowerInvariant()
  return (($plain -replace '[^\p{L}\p{N}]+', ' ') -replace '\s+', ' ').Trim()
}

function ConvertTo-NewsToken([string]$Word) {
  if ($script:NEWS_CANON.ContainsKey($Word)) { return $script:NEWS_CANON[$Word] }
  switch -Regex ($Word) {
    '^journal' { return 'journalist' }
    '^(arrest|arret|deten|inculpa)' { return 'detained' }
    '^elect' { return 'election' }
    '^invest' { return 'investment' }
    '^inflation' { return 'inflation' }
    '^agric' { return 'agriculture' }
    '^econom' { return 'economy' }
    '^entrepren' { return 'business' }
    '^govern' { return 'government' }
    '^gouvern' { return 'government' }
    '^ministr' { return 'minister' }
    '^presid' { return 'president' }
    '^parl' { return 'parliament' }
    '^senat' { return 'parliament' }
    '^protest' { return 'protest' }
    '^sanction' { return 'sanctions' }
    '^export' { return 'export' }
    '^import' { return 'import' }
    '^univers' { return 'university' }
    '^cultur' { return 'culture' }
    '^(herit|patrimo)' { return 'heritage' }
    '^secur' { return 'security' }
    '^terror' { return 'attack' }
    '^petrol' { return 'oil' }
    '^solair' { return 'solar' }
    '^(syndicat|sindicat)' { return 'strike' }
    default { return $Word }
  }
}

function ConvertTo-CanonicalNewsText([string]$Text) {
  $tokens = New-Object System.Collections.Generic.List[string]
  foreach ($word in ((ConvertTo-NewsText $Text) -split '\s+')) {
    if ($word) { $tokens.Add((ConvertTo-NewsToken $word)) }
  }
  return ($tokens.ToArray() -join ' ')
}

function New-NewsIgnoreSet([string[]]$Terms) {
  $ignore = @{}
  foreach ($term in @($Terms)) {
    foreach ($word in ((ConvertTo-NewsText $term) -split '\s+')) {
      if ($word) { $ignore[(ConvertTo-NewsToken $word)] = $true }
    }
  }
  return $ignore
}

function Get-NewsSignature([string]$Text, [string[]]$IgnoreTerms) {
  $set = @{}
  $ignore = New-NewsIgnoreSet $IgnoreTerms
  foreach ($raw in ((ConvertTo-NewsText $Text) -split '\s+')) {
    if (-not $raw) { continue }
    $word = ConvertTo-NewsToken $raw
    $isNonLatin = $word -match '[\p{IsArabic}\p{IsEthiopic}]'
    if (($isNonLatin -and $word.Length -lt 2) -or (-not $isNonLatin -and $word.Length -lt 4)) { continue }
    if ($script:NEWS_STOP.ContainsKey($word) -or $ignore.ContainsKey($word)) { continue }
    $set[$word] = $true
  }
  return $set
}

function Get-NewsSimilarity($Left, $Right) {
  if (-not $Left -or -not $Right -or $Left.Count -eq 0 -or $Right.Count -eq 0) {
    return [pscustomobject]@{ Shared = 0; Jaccard = 0.0; Containment = 0.0 }
  }
  $shared = 0
  foreach ($key in $Left.Keys) { if ($Right.ContainsKey($key)) { $shared++ } }
  $union = $Left.Count + $Right.Count - $shared
  $smaller = [Math]::Min($Left.Count, $Right.Count)
  return [pscustomobject]@{
    Shared      = $shared
    Jaccard     = if ($union -gt 0) { [double]$shared / $union } else { 0.0 }
    Containment = if ($smaller -gt 0) { [double]$shared / $smaller } else { 0.0 }
  }
}

function Test-SameNewsEvent($LeftTitle, $LeftEvent, $RightTitle, $RightEvent) {
  $title = Get-NewsSimilarity $LeftTitle $RightTitle
  if ($title.Shared -ge 3 -and $title.Containment -ge 0.30) { return $true }
  # Cross-language media-freedom coverage often shares only these canonical anchors;
  # names may be absent from one outlet's lede. In one country/day this pair is a much
  # stronger event identity than four generic political words.
  if ($LeftEvent.ContainsKey('journalist') -and $LeftEvent.ContainsKey('detained') -and
      $RightEvent.ContainsKey('journalist') -and $RightEvent.ContainsKey('detained')) { return $true }
  $event = Get-NewsSimilarity $LeftEvent $RightEvent
  if ($event.Shared -ge 5 -and $event.Containment -ge 0.18) { return $true }
  if ($event.Shared -ge 4 -and $event.Containment -ge 0.25) { return $true }
  if ($event.Shared -ge 4 -and $event.Jaccard -ge 0.16) { return $true }
  return $false
}

function Test-NewsPhrase([string]$NormalText, [string]$Phrase) {
  $needle = ConvertTo-NewsText $Phrase
  if (-not $needle) { return $false }
  $parts = @($needle -split '\s+' | Where-Object { $_ })
  $pattern = '(?<![\p{L}\p{N}])' + (($parts | ForEach-Object { [regex]::Escape($_) }) -join '\s+') + '(?![\p{L}\p{N}])'
  return [regex]::IsMatch($NormalText, $pattern)
}

function Get-NewsMatchCount([string]$NormalText, [string[]]$Phrases, [int]$Limit = 99) {
  $count = 0
  foreach ($phrase in @($Phrases)) {
    if (Test-NewsPhrase $NormalText $phrase) {
      $count++
      if ($count -ge $Limit) { break }
    }
  }
  return $count
}

function Get-NewsLongestMatchLength([string]$NormalText, [string[]]$Phrases) {
  $longest = 0
  foreach ($phrase in @($Phrases)) {
    if (Test-NewsPhrase $NormalText $phrase) {
      $length = (ConvertTo-NewsText $phrase).Length
      if ($length -gt $longest) { $longest = $length }
    }
  }
  return $longest
}

function Get-CountryRelevance([string]$Title, [string]$Summary, [string[]]$Terms, [string]$Scope, [bool]$RequireMatch = $false, [string[]]$ForeignTerms = @()) {
  $titleText = ConvertTo-NewsText $Title
  $lede = if ($Summary) { $Summary.Substring(0, [Math]::Min(140, $Summary.Length)) } else { '' }
  $ledeText = ConvertTo-NewsText $lede
  $titleHits = Get-NewsMatchCount $titleText $Terms 3
  $ledeHits = Get-NewsMatchCount $ledeText $Terms 3
  $titleTargetLength = Get-NewsLongestMatchLength $titleText $Terms
  $ledeTargetLength = Get-NewsLongestMatchLength $ledeText $Terms
  $titleForeignLength = Get-NewsLongestMatchLength $titleText $ForeignTerms
  $ledeForeignLength = Get-NewsLongestMatchLength $ledeText $ForeignTerms

  if ($titleForeignLength -gt $titleTargetLength) {
    return [pscustomobject]@{ HardReject = $true; Score = -20.0; Match = 'foreign'; Reason = 'headline names another country' }
  }
  if ($titleHits -gt 0) {
    return [pscustomobject]@{ HardReject = $false; Score = 4.0; Match = 'title'; Reason = 'country named in headline' }
  }
  if ($ledeForeignLength -gt $ledeTargetLength) {
    return [pscustomobject]@{ HardReject = $true; Score = -20.0; Match = 'foreign'; Reason = 'opening names another country' }
  }
  if ($ledeHits -gt 0) {
    return [pscustomobject]@{ HardReject = $false; Score = 2.5; Match = 'lede'; Reason = 'country named in opening' }
  }
  if ($Scope -eq 'regional' -or $RequireMatch) {
    return [pscustomobject]@{ HardReject = $true; Score = -20.0; Match = 'none'; Reason = 'no explicit country match' }
  }
  return [pscustomobject]@{ HardReject = $false; Score = 0.5; Match = 'domestic'; Reason = 'domestic outlet, implicit relevance' }
}

function Get-NewsTopicHint([string]$Title, [string]$Summary) {
  $headline = ConvertTo-CanonicalNewsText $Title
  foreach ($topic in $script:NEWS_TOPIC_RULES.Keys) {
    if ((Get-NewsMatchCount $headline $script:NEWS_TOPIC_RULES[$topic] 1) -gt 0) { return [string]$topic }
  }
  $text = ConvertTo-CanonicalNewsText $Summary
  foreach ($topic in $script:NEWS_TOPIC_RULES.Keys) {
    if ((Get-NewsMatchCount $text $script:NEWS_TOPIC_RULES[$topic] 1) -gt 0) { return [string]$topic }
  }
  return 'News'
}

function Test-SubstantiveFigure([string]$Title, [string]$Summary) {
  $text = $Title + ' ' + $(if ($Summary) { $Summary.Substring(0, [Math]::Min(320, $Summary.Length)) } else { '' })
  # Dates prove freshness, not scale. Remove common date forms before looking for a
  # figure so "20 August 2026" does not earn the same evidence point as "$500m".
  $months = 'january|february|march|april|may|june|july|august|september|october|november|december|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre'
  $text = $text -replace "(?i)\b\d{1,2}\s+(?:$months)\s+20\d{2}\b", ' '
  $text = $text -replace "(?i)\b(?:$months)\s+\d{1,2}(?:,|\s)+20\d{2}\b", ' '
  $text = $text -replace '\b20\d{2}\b', ' '
  return $text -match '\d'
}

function Get-EditorialScore($Item, [int]$OutletCount, [datetime]$Now) {
  $breakdown = [ordered]@{
    relevance      = [double]$Item.countryScore
    corroboration  = 0.0
    sourceQuality  = 0.0
    freshness      = 0.0
    publicImpact   = 0.0
    evidence       = 0.0
    penalties      = 0.0
  }
  $reasons = New-Object System.Collections.Generic.List[string]
  if ($Item.countryMatch -eq 'title') { $reasons.Add('country in headline') }
  elseif ($Item.countryMatch -eq 'lede') { $reasons.Add('country in opening') }

  $breakdown.corroboration = switch ([Math]::Min($OutletCount, 4)) {
    1 { 0.0 }
    2 { 4.0 }
    3 { 6.0 }
    default { 7.5 }
  }
  if ($OutletCount -gt 1) { $reasons.Add("$OutletCount-source corroboration") }

  $breakdown.sourceQuality = switch ([int]$Item.tier) { 1 { 3.0 } 2 { 1.75 } default { 0.5 } }
  if ([int]$Item.tier -eq 1) { $reasons.Add('tier-1 source') }

  $ageHours = $null
  if ($Item.published) {
    $ageHours = [Math]::Max(0.0, ($Now - ([datetime]$Item.published)).TotalHours)
    if ($ageHours -le 18) { $breakdown.freshness = 3.5; $reasons.Add('published within 18h') }
    elseif ($ageHours -le 36) { $breakdown.freshness = 2.5; $reasons.Add('published within 36h') }
    elseif ($ageHours -le 60) { $breakdown.freshness = 1.0 }
    elseif ($ageHours -le 96) { $breakdown.freshness = -1.0; $reasons.Add('older than 60h') }
    else { $breakdown.freshness = -4.0; $reasons.Add('older than 96h') }
  } else {
    $breakdown.freshness = -1.0
    $reasons.Add('publication time missing')
  }

  $text = ConvertTo-CanonicalNewsText ($Item.title + ' ' + $Item.summary)
  $urgent = Get-NewsMatchCount $text $script:NEWS_URGENT 2
  $public = Get-NewsMatchCount $text $script:NEWS_PUBLIC 2
  $economic = Get-NewsMatchCount $text $script:NEWS_ECONOMIC 2
  $breakdown.publicImpact = ([Math]::Min($urgent, 2) * 1.75) + ([Math]::Min($public, 2) * 1.35) + ([Math]::Min($economic, 2) * 0.85)
  if ($urgent -gt 0) { $reasons.Add('urgent public consequence') }
  elseif ($public -gt 0) { $reasons.Add('public-policy consequence') }
  elseif ($economic -gt 0) { $reasons.Add('economic consequence') }

  $summaryLength = ([string]$Item.summary).Length
  if ($summaryLength -ge 80) { $breakdown.evidence += 0.75 }
  if ($summaryLength -ge 180) { $breakdown.evidence += 0.5 }
  if (Test-SubstantiveFigure $Item.title $Item.summary) { $breakdown.evidence += 1.25; $reasons.Add('specific figure') }
  if ($summaryLength -eq 0) { $breakdown.penalties -= 2.0; $reasons.Add('headline only') }

  $junk = Get-NewsMatchCount $text $script:NEWS_JUNK 1
  $low = Get-NewsMatchCount (ConvertTo-CanonicalNewsText $Item.title) $script:NEWS_LOW_VALUE 2
  if ($junk) { $breakdown.penalties -= 6.0; $reasons.Add('low-value entertainment') }
  if ($low) { $breakdown.penalties -= ([Math]::Min($low, 2) * 2.0); $reasons.Add('opinion, speech, or desk filler') }
  if ((ConvertTo-NewsText $Item.title) -match '^(daily|weekly|(?:eritrea )?haddas|(?:eritrea )?alhaditha)\b.*\b20\d{2}$') {
    $breakdown.penalties -= 10.0
    $reasons.Add('edition label, not a story headline')
  }

  $score = 0.0
  foreach ($value in $breakdown.Values) { $score += [double]$value }
  $confidence = if ($score -ge 15) { 'high' } elseif ($score -ge 10) { 'medium' } else { 'low' }
  return [pscustomobject]@{
    Score       = [Math]::Round($score, 2)
    Breakdown   = [pscustomobject]$breakdown
    Reasons     = $reasons.ToArray()
    Topic       = Get-NewsTopicHint $Item.title $Item.summary
    Confidence  = $confidence
    AgeHours    = if ($null -eq $ageHours) { $null } else { [Math]::Round($ageHours, 1) }
  }
}

function Select-NewsCandidates([object[]]$Items, [int]$Limit, [int]$LiveSources) {
  $picked = New-Object System.Collections.Generic.List[object]
  $pickedUrls = @{}
  $usedSources = @{}
  $usedTopics = @{}

  foreach ($relax in @($false, $true)) {
    while ($picked.Count -lt $Limit) {
      $best = $null
      $bestAdjusted = [double]::NegativeInfinity
      foreach ($item in $Items) {
        if ($pickedUrls.ContainsKey([string]$item.url)) { continue }
        $sameEvent = $false
        foreach ($chosen in $picked) {
          if (Test-SameNewsEvent $item._titleSig $item._eventSig $chosen._titleSig $chosen._eventSig) {
            $sameEvent = $true
            break
          }
        }
        if ($sameEvent) { continue }

        $sourceUses = if ($usedSources.ContainsKey([string]$item.source)) { [int]$usedSources[[string]$item.source] } else { 0 }
        $topicUses = if ($usedTopics.ContainsKey([string]$item.topicHint)) { [int]$usedTopics[[string]$item.topicHint] } else { 0 }
        if (-not $relax -and $LiveSources -gt 1 -and $sourceUses -ge 2) { continue }
        if (-not $relax -and $topicUses -ge 2) { continue }

        $diversityPenalty = ($sourceUses * 1.25) + ($topicUses * 1.0)
        $adjusted = [double]$item.score - $diversityPenalty
        if ($adjusted -gt $bestAdjusted) { $best = $item; $bestAdjusted = $adjusted }
      }
      if (-not $best) { break }

      $best | Add-Member -NotePropertyName selectionScore -NotePropertyValue ([Math]::Round($bestAdjusted, 2)) -Force
      $best | Add-Member -NotePropertyName diversityPenalty -NotePropertyValue ([Math]::Round(([double]$best.score - $bestAdjusted), 2)) -Force
      $picked.Add($best)
      $pickedUrls[[string]$best.url] = $true
      $sourceKey = [string]$best.source
      $topicKey = [string]$best.topicHint
      $usedSources[$sourceKey] = if ($usedSources.ContainsKey($sourceKey)) { [int]$usedSources[$sourceKey] + 1 } else { 1 }
      $usedTopics[$topicKey] = if ($usedTopics.ContainsKey($topicKey)) { [int]$usedTopics[$topicKey] + 1 } else { 1 }
    }
    if ($picked.Count -ge $Limit) { break }
  }
  # The strict diversity pass may defer a repeated outlet until the relaxed fill pass.
  # Re-sort after every candidate has its final penalty so a deferred but stronger item
  # cannot sit below a weaker ceremonial item and accidentally become the reserve.
  return @($picked.ToArray() | Sort-Object -Property `
    @{ Expression = { [double]$_.selectionScore }; Descending = $true },
    @{ Expression = { [double]$_.score }; Descending = $true },
    @{ Expression = { [string]$_.title }; Descending = $false })
}

function Get-NewsItemId([string]$Url, [string]$Title, [string]$Summary) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Url.Trim() + "`n" + $Title.Trim() + "`n" + $Summary.Trim()))
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant().Substring(0, 20)
  } finally { $sha.Dispose() }
}
