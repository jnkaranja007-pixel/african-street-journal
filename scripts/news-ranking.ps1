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
  'gamou'='mawlid'; 'maouloud'='mawlid'; 'mouloud'='mawlid'
}

$script:NEWS_TOPIC_RULES = [ordered]@{
  Health      = @('health','hospital','clinic','doctor','nurse','outbreak','cholera','malaria','vaccine','disease','medicine')
  Education   = @('school','university','student','teacher','education','exam','classroom','college')
  Climate     = @('climate','flood','drought','rainfall','storm','cyclone','wildfire','heatwave','emissions')
  Agriculture = @('agriculture','farmer','harvest','crop','maize','wheat','cocoa','coffee','livestock','fertilizer','food security')
  News        = @('crash','collision','rollover','killed','dead','injured','fire','explosion','missing','rescue')
  Tech        = @('technology','digital','telecom','internet','startup','software','cyber','satellite','artificial intelligence')
  Sport       = @('football','soccer','basketball','athletics','tournament','league','cup final','olympic','sport')
  Culture     = @('culture','heritage','music','film','book','artist','museum','festival','theatre','fashion','mawlid','eid',
                  'pilgrim','pilgrims','pilgrimage','religious','faith')
  Business    = @('inflation','bank','budget','tax','debt','bond','gdp','economy','currency','exchange rate','export','import','trade',
                  'investment','investor','business','market','company','industry','mine','mining','oil','gas','fuel','power','electricity',
                  'jobs','wage','unemployment','tariff','levy','price','factory','manufacturing','aluminium','aluminum','refinery',
                  'transport','bus','buses','rail','railway','port','shipping','airline')
  Politics    = @('election','parliament','minister','president','government','court','ruling','law','bill','constitution','protest',
                  'strike','sanctions','treaty','summit','diplomat','security','attack','military','police','crime','fraud','corruption',
                  'charges','mayor','mayoral','municipal','candidate','refugee','detained','journalist')
}

$script:NEWS_URGENT = @('killed','dead','death','fatal','crash','attack','war','coup','outbreak','cholera','flood','drought','cyclone',
                        'wildfire','famine','evacuation','emergency','collapse','capsize','hostage','refugee')
$script:NEWS_PUBLIC = @('election','budget','tax','debt','inflation','interest rate','currency','court','law','bill','parliament',
                        'strike','protest','security','hospital','health','school','university',
                        'fuel','food','power','electricity','unemployment','jobs','wage','sanctions','treaty')
$script:NEWS_ECONOMIC = @('investment','trade','export','import','mine','mining','oil','gas','agriculture','harvest','infrastructure',
                          'rail','port','telecom','bank','business','market','factory','industry')
$script:NEWS_JUNK = @('celebrity','wedding','romance','dating','gossip','horoscope','recipe','red carpet','lingerie','net worth',
                      'betting','odds','jackpot','lottery','loto','lotto','draws numbers','showbiz','soap opera','reality tv','pageant','road trip experience',
                      'car review','test drive')
# Lurid or tabloid subjects. Added 20 Oct 2026 after 'Businessman dies after penis
# enlargement procedure' ran as Nigeria Business. Kept narrow on purpose: words that
# also name policy news (prostitution law, witchcraft killings) are not here.
$script:NEWS_TABLOID = @('penis','manhood','enlargement procedure','enlargement surgery','erectile','sex tape','sex toy','nude','nudes',
                         'naked','leaked video','viral video','side chick','sugar mummy','sugar mommy','sugar daddy','love potion',
                         'threesome','bbl','butt lift','breast enlargement','bedroom secrets','sleeps with','caught in bed')
$script:NEWS_CLICKBAIT = '\b(?:you won ?t believe|shocking|bizarre|strange|weird|jaw dropping|goes viral|trending video|watch video|see photos|hilarious)\b'
$script:NEWS_LOW_VALUE = @('opinion','analysis','commentary','editorial','keynote address','statement of','press release','sponsored',
                           'partner content','public seminar','public seminars','conference commences','weekly roundup','op ed',
                           'weekend wrap','daily roundup')
$script:NEWS_HARD_LOW_VALUE = @('opinion','commentary','editorial','op ed','weekend wrap','weekly roundup','daily roundup',
                                'press release','sponsored','partner content')
$script:NEWS_ACTION = @('approves','approved','adopts','adopted','passes','passed','signs','signed','opens','opened','closes','closed',
                        'raises','raised','cuts','cut','lowers','lowered','secures','secured','invests','invested','allocates','allocated',
                        'deploys','deployed','mobilises','mobilise','mobilizes','mobilize','launches','launched','expands','expanded',
                        'suspends','suspended','arrests','arrested','charges','charged','wins','won','begins','began','ends','ended')
$script:NEWS_SPEECH = @('says','said','urges','urged','calls','called','warns','warned','claims','claimed','remarks','speech')
$script:NEWS_EXTERNAL_COUNTRIES = @(
  'france','french','francais','francaise','spain','spanish','espagne','italy','italian','italie',
  'germany','german','allemagne','united kingdom','britain','british','royaume uni','united states',
  'etats unis','american','americain','americaine','canada','canadian','australia','australian',
  'australie','china','chinese','chine','india','indian','inde','japan','japanese','japon','russia',
  'russian','russie','ukraine','ukrainian','iran','iranian','israel','israeli','turkey','turkish',
  'turquie','saudi arabia','arabie saoudite','qatar','uae','emirats arabes unis',
  # Added 23 Oct 2026: the 22 Oct edition carried Paris v Barcelona on the Burundi desk,
  # Lisbon on the Namibia and Sao Tome desks and Yemen on Namibia's. Big foreign cities
  # and countries make a story "external": it then needs a second outlet before the desk
  # spends a model call on it (Test-NewsCountryLink). A headline that also names the
  # desk's own country is unaffected - that check comes first.
  'portugal','portuguese','lisbon','lisbonne','lisboa','paris','barcelona','madrid','london','londres',
  'berlin','brussels','bruxelles','belgium','belgian','belgique','netherlands','dutch','washington',
  'beijing','pekin','moscow','moscou','yemen','yemeni','brazil','brazilian','bresil','gaza','lebanon',
  'liban','syria','syrie','pakistan','afghanistan','iraq','irak','mexico','argentina',
  # Added 30 Oct 2026: European club football names no country, so a Ghanaian outlet's
  # "Carrick keeps Fernandes as Manchester United captain" passed as Ghana news. A story
  # that also names Ghana ("Ghana's Kudus scores for West Ham") matches on the country
  # first and is unaffected.
  'premier league','champions league','europa league','la liga','serie a','bundesliga','ligue 1',
  'manchester united','manchester city','man united','man city','liverpool','chelsea','arsenal',
  'tottenham','newcastle united','aston villa','west ham','real madrid','atletico madrid',
  'bayern munich','borussia dortmund','juventus','inter milan','ac milan','paris saint-germain','psg'
)

function Get-NewsWordCount([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return 0 }
  return @([regex]::Matches($Text.Trim(), '\S+')).Count
}

# Outlets file commentary under a section of its own, and the path is a far more
# reliable tell than any amount of reading the prose: /opinion/, /columnists/,
# /analysis/. Five stories in the 6 September edition came from one of these and were
# rendered as neutral news - a Daily Maverick column arguing the SACP "must prioritise
# electability" was filed with the same voice as a cholera briefing, with nothing to
# tell a reader it was one person's argument. This paper's whole claim is sourced fact,
# so a column has to be declined rather than laundered.
$script:NEWS_OPINION_PATHS = '/opinion|/opinions|/columnist|/column/|/editorial|/commentary|/analysis/|/blog/|/blogs/|/perspective|/viewpoint|/op-ed'

# $Url is optional so every existing caller and test keeps working unchanged.
function Get-NewsEditorialRejectReason([string]$Title, [string]$Summary, [string]$Url = '') {
  if ($Url -and $Url -match $script:NEWS_OPINION_PATHS) { return 'filed under opinion or analysis' }
  $headline = ConvertTo-CanonicalNewsText $Title
  $text = ConvertTo-CanonicalNewsText ($Title + ' ' + $Summary)
  if ((Get-NewsMatchCount $text $script:NEWS_JUNK 1) -gt 0) { return 'junk or gossip' }
  if ((Get-NewsMatchCount $text $script:NEWS_TABLOID 1) -gt 0) { return 'tabloid or lurid subject' }
  if ($headline -match $script:NEWS_CLICKBAIT) { return 'clickbait headline rather than a newsworthy event' }
  if ((Get-NewsMatchCount $headline $script:NEWS_HARD_LOW_VALUE 1) -gt 0) { return 'opinion, roundup, or sponsored copy' }
  $headlineYears = @([regex]::Matches($headline, '\b20\d{2}\b') | ForEach-Object { [int]$_.Value })
  if ($headlineYears.Count -and
      ($headline -match '\b(?:afcon|can|championship|cup|eliminatoires|games|qualifiers?|tournament)\b') -and
      (($headlineYears | Measure-Object -Maximum).Maximum -le ((Get-Date).Year - 2))) {
    return 'stale competition year in headline'
  }
  if ($headline -match '^(?:a )?call to\b|\bwhat\b.+\bcan (?:still )?teach us\b') { return 'call-to-action or retrospective column' }
  if ($headline -match '\b(?:swipe|swipes|insult|insults|mocks|fool)\b|\bmourners? laughing\b|\bopened (?:his|her|their) file\b') {
    return 'personality-driven political clickbait'
  }
  if ($headline -match '^(?:les )?piques?\b|\bpiques? de\b' -or
      $Title -match '(?i)^[^:]{2,50}\s+to\s+[^:]{2,50}:\s*\W*(?:you|your)\b') {
    return 'personality-driven political clickbait'
  }
  if ($headline -match '^\d+\s+(?:neighborhoods|neighbourhoods|places|things|ways|reasons|tips|best|top)\b') {
    return 'listicle rather than a reported event'
  }
  if ($headline -match '\b(?:urges?|calls on|appeals to)\b.+\b(?:peace|patience|unity|tolerance)\b|\bpromises? to make\b.+\bproud\b') {
    return 'ceremonial appeal or promise'
  }
  if ($headline -match '\bworkshop\b.*\bstrengthens?\b|\bunveils?\b.*\bwelcome cent(?:er|re)\b') {
    return 'institutional promotion without a material event'
  }
  return ''
}

function ConvertTo-NewsText([string]$Text) {
  if (-not $Text) { return '' }
  # Accents off (\p{Mn}, the non-spacing marks FormD splits out). One regex, not a loop
  # over characters: this runs on every feed item and every story.
  $plain = [regex]::Replace($Text.Normalize([Text.NormalizationForm]::FormD), '\p{Mn}+', '').Normalize([Text.NormalizationForm]::FormC).ToLowerInvariant()
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
  # get_Count() and get_Keys(), not .Count and .Keys: these tables are keyed by headline
  # words, and on a PowerShell hashtable a key named "count" answers .Count. A headline
  # with "vote count" in it crashed the desk on 25 and 27 Oct 2026 ("Multiple ambiguous
  # overloads found for Min") and no edition was published.
  if ($null -eq $Left -or $null -eq $Right) { return [pscustomobject]@{ Shared = 0; Jaccard = 0.0; Containment = 0.0 } }
  $leftCount = [int]$Left.get_Count(); $rightCount = [int]$Right.get_Count()
  if ($leftCount -eq 0 -or $rightCount -eq 0) {
    return [pscustomobject]@{ Shared = 0; Jaccard = 0.0; Containment = 0.0 }
  }
  $shared = 0
  foreach ($key in @($Left.get_Keys())) { if ($Right.ContainsKey($key)) { $shared++ } }
  $union = $leftCount + $rightCount - $shared
  $smaller = [Math]::Min($leftCount, $rightCount)
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
  if ($LeftEvent.ContainsKey('mawlid') -and $RightEvent.ContainsKey('mawlid')) { return $true }
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

function Get-CountryRelevance([string]$Title, [string]$Summary, [string[]]$Terms, [string]$Scope, [bool]$RequireMatch = $false, [string[]]$ForeignTerms = @(), [string[]]$ForeignPlaces = @()) {
  $titleText = ConvertTo-NewsText $Title
  $lede = if ($Summary) { $Summary.Substring(0, [Math]::Min(140, $Summary.Length)) } else { '' }
  $ledeText = ConvertTo-NewsText $lede
  # Overlapping names go to the longer one ("Equatorial Guinea" is not Guinea, "Niger
  # State" is not Niger); names side by side both count. The old rule compared the
  # longest match on each side, so "Kenya and Tanzania sign deal" was foreign news on
  # the Kenya desk because "tanzania" is longer than "kenya".
  $titlePlaces = Get-NewsPlaceHits $titleText $Terms $ForeignTerms
  $ledePlaces = Get-NewsPlaceHits $ledeText $Terms $ForeignTerms
  # Other African capitals count as abroad too ($ForeignPlaces, Get-ForeignCapitalTerms):
  # on 30 Oct 2026 a Somali radio station's report of a journalists' meeting in Addis
  # Ababa ran on the Somalia desk with no Somali angle. Like the list above, this only
  # decides stories that name neither the desk's country nor its places.
  # Through the cached matcher: a phrase-by-phrase scan of these ~200 names cost about a
  # third of a second per feed item under Windows PowerShell.
  $externalTerms = @($script:NEWS_EXTERNAL_COUNTRIES) + @($ForeignPlaces)
  $titleExternalHits = (Get-NewsPlaceHits $titleText @() $externalTerms).Foreign
  $ledeExternalHits = (Get-NewsPlaceHits $ledeText @() $externalTerms).Foreign

  if ($titlePlaces.Foreign -and -not $titlePlaces.Own) {
    return [pscustomobject]@{ HardReject = $true; Score = -20.0; Match = 'foreign'; Reason = 'headline names another country' }
  }
  if ($titlePlaces.Own) {
    return [pscustomobject]@{ HardReject = $false; Score = 4.0; Match = 'title'; Reason = 'country named in headline' }
  }
  if ($ledePlaces.Foreign -and -not $ledePlaces.Own) {
    return [pscustomobject]@{ HardReject = $true; Score = -20.0; Match = 'foreign'; Reason = 'opening names another country' }
  }
  if ($ledePlaces.Own) {
    return [pscustomobject]@{ HardReject = $false; Score = 2.5; Match = 'lede'; Reason = 'country named in opening' }
  }
  if ($titleExternalHits -gt 0 -or $ledeExternalHits -gt 0) {
    if ($Scope -eq 'regional' -or $RequireMatch) {
      return [pscustomobject]@{ HardReject = $true; Score = -20.0; Match = 'external'; Reason = 'foreign story without explicit country link' }
    }
    return [pscustomobject]@{ HardReject = $false; Score = -1.0; Match = 'external'; Reason = 'foreign location needs local corroboration' }
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
    materiality    = 0.0
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

  $summaryWords = Get-NewsWordCount ([string]$Item.summary)
  if ($summaryWords -ge 45) { $breakdown.evidence += 0.75 }
  if ($summaryWords -ge 90) { $breakdown.evidence += 0.5 }
  if (Test-SubstantiveFigure $Item.title $Item.summary) { $breakdown.evidence += 1.25; $reasons.Add('specific figure') }
  if ($summaryWords -eq 0) { $breakdown.penalties -= 2.0; $reasons.Add('headline only') }
  elseif ($summaryWords -lt 25) { $breakdown.penalties -= 1.5; $reasons.Add('thin source evidence') }
  elseif ($summaryWords -lt 45) { $breakdown.penalties -= 0.75; $reasons.Add('limited source evidence') }

  $headlineText = ConvertTo-CanonicalNewsText $Item.title
  $headlineActions = Get-NewsMatchCount $headlineText $script:NEWS_ACTION 2
  if ($headlineActions) {
    $breakdown.materiality = [Math]::Min($headlineActions, 2) * 1.25
    $reasons.Add('material action in headline')
  }
  # Quote marks built from code points, never as literals. This file is UTF-8 without a
  # BOM and PowerShell 5.1 reads that as ANSI, so a literal curly quote or guillemet in
  # a character class arrives mangled - and the repository's ASCII guard fails the build
  # before it ever runs. Same reason the mojibake markers in fetch-news are constructed.
  $quoteChars = '"' + ([string][char]0x201C) + ([string][char]0x201D) + ([string][char]0x00AB) + ([string][char]0x00BB)
  $quotePattern = '[' + [regex]::Escape($quoteChars) + ']'
  $speechOnly = (Get-NewsMatchCount $headlineText $script:NEWS_SPEECH 1) -gt 0 -or
    (([string]$Item.title -match $quotePattern) -and -not $headlineActions)
  if ($speechOnly -and -not $headlineActions) {
    $breakdown.penalties -= 2.5
    $reasons.Add('speech or quote without a material action')
  }

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

# A story set abroad needs a second outlet AND has to name the country somewhere in what
# the outlets filed. Two outlets were not enough on their own: on 28 Oct 2026 Cabo Verde's
# lead was "Two trains collide in Spain", carried by two Cabo Verdean sites with no word
# about Cabo Verde or its people in either. $NamesCountry is the caller's check of every
# member's headline and full summary; it defaults to true so older callers keep working.
# The capitals of every African country except $Code, from app.js COUNTRY_INFO, for
# Get-CountryRelevance's -ForeignPlaces. Left out: names that are something else in
# local news - Victoria (the lake), Praia (Portuguese for beach), Juba on the Somalia
# desk (the Juba river and Jubaland), Laayoune on the Morocco desk.
$script:CAPITAL_SKIP = @('victoria', 'praia')
$script:CAPITAL_SKIP_FOR = @{ so = @('juba'); ma = @('laayoune') }
function Get-ForeignCapitalTerms([string]$Root, [string]$Code) {
  if (-not $script:AFRICAN_CAPITALS) {
    $map = @{}
    $appPath = Join-Path $Root 'app.js'
    if (Test-Path $appPath) {
      $app = [IO.File]::ReadAllText($appPath, [Text.Encoding]::UTF8)
      foreach ($m in [regex]::Matches($app, "(\w\w): \{ name: (?:'[^']*'|""[^""]*""),\s*region: '[^']*',\s*capital: (?:'([^']+)'|""([^""]+)"")")) {
        $map[$m.Groups[1].Value] = if ($m.Groups[2].Success) { $m.Groups[2].Value } else { $m.Groups[3].Value }
      }
    }
    $script:AFRICAN_CAPITALS = $map
  }
  $skip = @($script:CAPITAL_SKIP) + @($script:CAPITAL_SKIP_FOR[$Code])
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($cc in $script:AFRICAN_CAPITALS.get_Keys()) {
    if ($cc -eq $Code) { continue }
    $capital = [string]$script:AFRICAN_CAPITALS[$cc]
    if (-not $capital -or $skip -contains $capital.ToLowerInvariant()) { continue }
    $out.Add($capital)
  }
  return $out.ToArray()
}

# Other names for each country, as the paper's French-, Portuguese- and Spanish-language
# outlets and its own English copy write them. data/sources.json has one English name per
# country (and match terms for some), so on 4 Nov 2026 Folha 8's Ebola count "NA
# RDCONGO" ran as Angola's news and a Sidwaya editorial on Algerian troops for Niger as
# Burkina Faso's: neither "RDCongo" nor "Algerie" was a foreign name to the desk. A list
# is the desk's own terms on its own desk and foreign on every other. Left out because
# they are ordinary words elsewhere: Maurice (a first name), Gana (Spanish "wins"), Somali
# (Ethiopia's Somali region), Central African (CEMAC, the region), CAR.
$script:NEWS_COUNTRY_ALIASES = @{
  dz = @('Algerian','Algerie','Algerien','Algerienne','Argelia')
  ao = @('Angolan','Angolais','Angolaise','Angolano','Angolana')
  bj = @('Beninese','Beninois','Beninoise')
  bw = @('Motswana','Batswana')
  bf = @('Burkina','Burkinabe')
  bi = @('Burundian','Burundais','Burundaise')
  cm = @('Cameroonian','Cameroun','Camerounais','Camerounaise','Camaroes','Camerun')
  cv = @('Cabo Verde','Cape Verdean','Cap Vert','Cabo Verdiano','Caboverdiano','Cabo Verdiana')
  cf = @('Centrafrique','Republique centrafricaine','Centrafricain','Centrafricaine')
  td = @('Chadian','Tchad','Tchadien','Tchadienne','Chade')
  km = @('Comorian','Comoran','Comores','Comorien','Comorienne')
  cg = @('Congo','Congolese','Congolais','Congolaise','Congo Brazzaville','Republique du Congo','Republica do Congo','Brazzaville')
  cd = @('Congo','Congolese','Congolais','Congolaise','DRC','Democratic Republic of Congo','Democratic Republic of the Congo',
         'RDC','RD Congo','RDCongo','Republique democratique du Congo','Republica Democratica do Congo','Congo Kinshasa')
  ci = @('Cote d Ivoire','Ivorian','Ivoirien','Ivoirienne','Costa do Marfim','Costa de Marfil')
  dj = @('Djiboutien','Djiboutienne')
  eg = @('Egyptian','Egypte','Egyptien','Egyptienne','Egito','Egipto')
  gq = @('Equatorial Guinean','Equatoguinean','Equato Guinean','Guinee equatoriale','Guinea Ecuatorial','Guine Equatorial','Ecuatoguineano')
  er = @('Eritrean','Erythree','Erythreen','Erythreenne','Eritreia')
  sz = @('Swaziland','Swazi')
  et = @('Ethiopian','Ethiopie','Ethiopien','Ethiopienne','Etiopia')
  ga = @('Gabonese','Gabonais','Gabonaise')
  gm = @('Gambian','Gambie','Gambien','Gambienne')
  gh = @('Ghanaian','Ghaneen','Ghaneenne')
  gn = @('Guinean','Guinee','Guineen','Guineenne','Guinee Conakry','Guine Conakry','Guine Conacri')
  # "Guinean" is both Guineas' word in English copy ("Guinean wrestler Ndoc" is from Bissau).
  gw = @('Guinea Bissau','Guinee Bissau','Guine Bissau','Bissau Guinean','Bissau Guineen','Guineense','Guine','Guinean')
  ke = @('Kenyan','Kenyane','Quenia')
  ls = @('Basotho','Mosotho')
  lr = @('Liberian','Liberien','Liberienne')
  ly = @('Libyan','Libye','Libyen','Libyenne','Libia')
  mg = @('Malagasy','Malgache')
  mw = @('Malawian')
  ml = @('Malian','Malien','Malienne')
  mr = @('Mauritanian','Mauritanie','Mauritanien','Mauritanienne')
  mu = @('Mauritian','Ile Maurice','Mauricien','Mauricienne')
  ma = @('Moroccan','Maroc','Marocain','Marocaine','Marrocos','Marruecos')
  mz = @('Mozambican','Mocambique','Mocambicano','Mocambicana','Mozambicain')
  na = @('Namibian','Namibie','Namibien','Namibienne')
  ne = @('Nigerien','Nigerienne')
  # Places in Nigeria named after its neighbours: without these, "Niger State governor"
  # and "Benin City" read as Niger and Benin news on the Nigeria desk.
  ng = @('Nigerian','Nigeriane','Niger State','Niger Delta','Benin City')
  rw = @('Rwandan','Rwandais','Rwandaise','Ruanda')
  st = @('Sao Tome','Sao Tome and Principe','Sao Tome e Principe','Santomean','Santomense')
  sn = @('Senegalese','Senegalais','Senegalaise')
  sc = @('Seychellois','Seychelloise')
  sl = @('Sierra Leonean','Serra Leoa','Sierra Leonais','Sierra Leonaise')
  so = @('Somalie','Somalien','Somalienne','Somaliland')
  za = @('South African','Afrique du Sud','Sud africain','Sud africaine','Africa do Sul','Sudafrica','East London')
  ss = @('South Sudanese','Soudan du Sud','Sud Soudan','Sudao do Sul')
  sd = @('Sudanese','Soudan','Soudanais','Soudanaise','Sudao')
  tz = @('Tanzanian','Tanzanie','Tanzanien','Tanzanienne')
  tg = @('Togolese','Togolais','Togolaise')
  tn = @('Tunisian','Tunisie','Tunisien','Tunisienne')
  ug = @('Ugandan','Ouganda','Ougandais','Ougandaise')
  zm = @('Zambian','Zambie','Zambien','Zambienne')
  zw = @('Zimbabwean','Zimbabween')
  eh = @('Sahara Occidental','Sahara Occidentale','Sahrawi','Saharawi')
}
# Morocco's press writes about the Sahara every day; Western Sahara's names stay off the
# Morocco desk's foreign list, as the English name always has (sources.json lists it
# only as the desk's own country).
$script:NEWS_ALIAS_SKIP_FOR = @{ ma = @('eh') }
# Home on the desk, but too broad to make a story foreign anywhere else.
$script:NEWS_COUNTRY_OWN_ONLY = @{ so = @('Somali','Somalis'); cf = @('Central African') }
# Places and things named after a country that are not that country: they take their
# words before a country name can, and count for no desk. Indian hemp is what Senegal's
# police seize ("Louga police seize 7 kg of cannabis" read as Indian news).
$script:NEWS_PLACE_NEUTRAL = @(
  'Gulf of Guinea','Golfe de Guinee','Golfo da Guine','Golfo de Guinea','Lake Chad','Lac Tchad','Lake Chad Basin',
  'River Niger','Niger River','Fleuve Niger','Congo River','Fleuve Congo','Congo Basin','Bassin du Congo',
  'Senegal River','Fleuve Senegal','Gambia River','Lake Malawi','Lac Malawi','Papua New Guinea',
  'Indian Ocean','Ocean Indien','Oceano Indico','Indian hemp','Chanvre indien'
)
# Competitions that share their name with African ones (the CAF Champions League, Benin's
# Celtiis Ligue 1, Ghana's Premier League): they make a feed item external at ranking,
# but they do not make a written story foreign.
$script:NEWS_SHARED_COMPETITIONS = @('premier league','champions league','ligue 1')
# Town names that are ordinary words or names in English copy.
$script:NEWS_TOWN_SKIP = @('george','nigel','brits','orkney','lira','same','victoria','praia')

# One desk's names: its own (registry name, match terms, the aliases above and its
# capital) and everyone else's. Returns Name, Own, Foreign (other countries' names, for
# Get-CountryRelevance), Places (other African capitals, Get-ForeignCapitalTerms) and
# Towns (the country's towns of 100,000 or more from its map chunk, for
# Get-StoryPlaceIssue only: "US Navy destroyer arrives in Mombasa" is Kenyan news).
function Get-NewsDeskTerms($Registry, [string]$Code, [string]$Root) {
  $entry = $Registry.$Code
  $name = [string]$entry.name
  $own = New-Object System.Collections.Generic.List[string]
  foreach ($t in @($name) + @($entry.match) + @($script:NEWS_COUNTRY_ALIASES[$Code]) + @($script:NEWS_COUNTRY_OWN_ONLY[$Code])) {
    if ($t -and -not $own.Contains([string]$t)) { $own.Add([string]$t) }
  }
  $places = @(Get-ForeignCapitalTerms $Root $Code)
  $capital = [string]$script:AFRICAN_CAPITALS[$Code]
  if ($capital -and $script:CAPITAL_SKIP -notcontains $capital.ToLowerInvariant() -and -not $own.Contains($capital)) { $own.Add($capital) }
  $ownKeys = @{}
  foreach ($t in $own) { $ownKeys[(ConvertTo-NewsText $t)] = $true }
  $foreign = New-Object System.Collections.Generic.List[string]
  foreach ($p in $Registry.PSObject.Properties) {
    if ($p.Name -eq '_comment' -or $p.Name -eq $Code -or @($script:NEWS_ALIAS_SKIP_FOR[$Code]) -contains $p.Name) { continue }
    foreach ($t in @($p.Value.name) + @($script:NEWS_COUNTRY_ALIASES[$p.Name])) {
      if (-not $t) { continue }
      $k = ConvertTo-NewsText ([string]$t)
      if ($k -and -not $ownKeys.ContainsKey($k)) { $foreign.Add([string]$t) }
    }
  }
  $named = @{}
  foreach ($t in @($foreign) + @($places) + @($script:NEWS_EXTERNAL_COUNTRIES)) { $named[(ConvertTo-NewsText $t)] = $true }
  $towns = New-Object System.Collections.Generic.List[string]
  $chunk = Join-Path $Root "data\countries\$Code.js"
  if (Test-Path $chunk) {
    $js = [IO.File]::ReadAllText($chunk, [Text.Encoding]::UTF8)
    foreach ($m in [regex]::Matches($js, '\{"name":"([^"]+)","lon":[-\d.]+,"lat":[-\d.]+,"pop":(\d+)')) {
      if ([long]$m.Groups[2].Value -lt 100000) { continue }
      $k = ConvertTo-NewsText $m.Groups[1].Value
      if ($k.Length -lt 4 -or $named.ContainsKey($k) -or $ownKeys.ContainsKey($k) -or $script:NEWS_TOWN_SKIP -contains $k) { continue }
      $ownKeys[$k] = $true
      $towns.Add($m.Groups[1].Value)
    }
  }
  return [pscustomobject]@{ Name = $name; Own = $own.ToArray(); Foreign = $foreign.ToArray(); Places = $places; Towns = $towns.ToArray()
                            StoryOwn = @($own) + @($towns)
                            StoryForeign = @($foreign) + @($places) + @($script:NEWS_EXTERNAL_COUNTRIES | Where-Object { $script:NEWS_SHARED_COMPETITIONS -notcontains $_ }) }
}

# The country names in normalised text, each word claimed once, longest name first:
# "south sudan" takes its words before "sudan" can, "dr congo" before "congo", "gulf of
# guinea" before "guinea". Own beats foreign for a name on both lists. One regex per
# list pair, cached: the desk calls this for every feed item.
$script:NEWS_PLACE_REGEX = @{}
function Get-NewsPlaceHits([string]$NormalText, [string[]]$Own, [string[]]$Foreign) {
  $key = (@($Own) -join '|') + '#' + (@($Foreign) -join '|')
  $matcher = $script:NEWS_PLACE_REGEX[$key]
  if (-not $matcher) {
    $side = @{}
    foreach ($t in $script:NEWS_PLACE_NEUTRAL) { $side[(ConvertTo-NewsText $t)] = 'neutral' }
    foreach ($t in @($Foreign)) { $k = ConvertTo-NewsText $t; if ($k -and -not $side.ContainsKey($k)) { $side[$k] = 'foreign' } }
    foreach ($t in @($Own)) { $k = ConvertTo-NewsText $t; if ($k) { $side[$k] = 'own' } }
    $alternatives = @($side.Keys | Sort-Object -Property Length -Descending | ForEach-Object { [regex]::Escape($_) })
    $matcher = [pscustomobject]@{ Side = $side
                                  Regex = New-Object regex ('(?<![\p{L}\p{N}])(?:' + ($alternatives -join '|') + ')(?![\p{L}\p{N}])') }
    $script:NEWS_PLACE_REGEX[$key] = $matcher
  }
  $ownHits = 0
  $foreignNames = New-Object System.Collections.Generic.List[string]
  if ($NormalText) {
    foreach ($m in $matcher.Regex.Matches($NormalText)) {
      $s = $matcher.Side[$m.Value]
      if ($s -eq 'own') { $ownHits++ } elseif ($s -eq 'foreign') { $foreignNames.Add($m.Value) }
    }
  }
  return [pscustomobject]@{ Own = $ownHits; Foreign = $foreignNames.Count; ForeignNames = $foreignNames.ToArray() }
}

# A written story is the desk's when its headline, dek or opening paragraph names the
# country (or its people or places). One that names none of them while its headline or
# dek names another country, an African capital or a city abroad belongs to that place.
# The writer's own countryLink answer missed both 4 Nov 2026 stories above: the Ebola
# story never mentions Angola, and the Algeria one names Burkina Faso only in passing in
# its second paragraph. Returns the reason, or '' when the story is the desk's.
function Get-StoryPlaceIssue($Story, $Desk) {
  $head = Get-NewsPlaceHits (ConvertTo-NewsText (([string]$Story.headline) + ' ' + ([string]$Story.dek))) $Desk.StoryOwn $Desk.StoryForeign
  if ($head.Own -or -not $head.Foreign) { return '' }
  $opening = [string](@($Story.paragraphs | Where-Object { ([string]$_).Trim() }) | Select-Object -First 1)
  if ((Get-NewsPlaceHits (ConvertTo-NewsText $opening) $Desk.StoryOwn $Desk.StoryForeign).Own) { return '' }
  return ('names ' + ((@($head.ForeignNames) | Select-Object -Unique) -join ', ') + ' but never ' + $Desk.Name)
}

function Test-NewsCountryLink([string]$CountryMatch, [int]$OutletCount, [bool]$NamesCountry = $true) {
  if ($CountryMatch -ne 'external') { return $true }
  return ($OutletCount -ge 2 -and $NamesCountry)
}

# Whether any member of a cluster names the country (its name, people or places from the
# registry's match list) in its headline or anywhere in its summary.
# $Members is untyped and enumerated through the pipeline on purpose: the desk passes a
# cluster's Generic.List[object], and on PowerShell 7.4 both @($list) and binding it to an
# [object[]] parameter throw "Argument types do not match". That killed the 29 Oct 2026
# desk runs at this call and no edition was published.
function Test-NewsClusterNamesCountry($Members, [string[]]$Terms) {
  foreach ($member in ($Members | ForEach-Object { $_ })) {
    $text = ConvertTo-NewsText (([string]$member.title) + ' ' + ([string]$member.summary))
    if ((Get-NewsMatchCount $text $Terms 1) -gt 0) { return $true }
  }
  return $false
}

function Select-NewsWriteableCandidates([object[]]$Items, [int]$Limit, [int]$MinEvidenceWords = 45) {
  return @($Items | Sort-Object -Property `
    @{ Expression = { if ([int]$_.evidenceWords -ge $MinEvidenceWords) { 1 } else { 0 } }; Descending = $true },
    @{ Expression = { [double]$_.selectionScore }; Descending = $true },
    @{ Expression = { [double]$_.score }; Descending = $true },
    @{ Expression = { [string]$_.title }; Descending = $false } | Select-Object -First $Limit)
}

function Get-NewsItemId([string]$Url, [string]$Title, [string]$Summary) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Url.Trim() + "`n" + $Title.Trim() + "`n" + $Summary.Trim()))
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant().Substring(0, 20)
  } finally { $sha.Dispose() }
}
