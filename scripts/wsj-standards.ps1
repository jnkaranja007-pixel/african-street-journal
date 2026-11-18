# The Wall Street Journal standard for The African Street Journal.
#
# The owner asked on 18 Nov 2026 for the paper to read like the Wall Street Journal: a
# serious paper about money, markets, business, policy and who governs. Crime, crashes
# and killings run only when they clear that paper's bar, and never as spectacle.
#
# This file holds the checks, so every stage judges a story the same way:
# - Test-WsjBar: the publication gate. The writer drops a story that fails it, and the
#   next candidate takes the slot (scripts/write-briefs.ps1). The feed stage applies the
#   same bar before a model is paid to write (Test-NewsBelowWsjBar, news-ranking.ps1).
# - Get-WsjStandardsIssues: tabloid words, graphic detail, a death toll at the head of
#   a headline, a story that dwells on casualties. Each one sends the draft back for one
#   rewrite (Get-DraftStyleIssues in the writer).
# - Get-WsjEditionMix: the shape of a whole edition (topics, harm stories, standards
#   hits) for the run metrics, the weekly editor review and its targets.
#
# Dot-source news-ranking.ps1 first: this uses its text helpers and word lists
# (ConvertTo-NewsText, ConvertTo-CanonicalNewsText, Test-NewsPhrase, Get-NewsMatchCount,
# Get-NewsMassToll, NEWS_URGENT, NEWS_ROUTINE_HARM, NEWS_HARM_EXEMPT).
# ASCII only: quote characters are built from code points (see news-ranking.ps1).

# Loaded words. They report the writer's feeling, not a fact, and the Wall Street
# Journal does not print them in its own voice. A quotation may carry them.
$script:WSJ_SENSATIONAL = @('horror','horrific','horrifying','horrendous','gruesome','grisly','brutal','brutally','brutality',
                            'slaughter','slaughtered','carnage','bloodbath','bloody','bloodshed','savage','savagely','macabre',
                            'chilling','shocking','tragic','tragically','tragedy','rampage','frenzy','mayhem','heinous','barbaric',
                            'monstrous','nightmare','terrifying','heartbreaking','heart wrenching','unspeakable','sickening',
                            'devastating','gory','bloodthirsty')
# Graphic detail: what was done to a body. The fact of a death is enough.
$script:WSJ_GRAPHIC = @('hacked to death','beheaded','beheading','decapitated','mutilated','dismembered','disembowelled',
                        'disemboweled','charred','burnt beyond recognition','burned beyond recognition','pool of blood',
                        'blood soaked','bloodied','bullet riddled','riddled with bullets','body parts','severed head',
                        'burnt alive','burned alive','set ablaze alive','stabbed repeatedly','entrails','bodies littered',
                        'bodies strewn','corpses','decomposing','decomposed','maggots','gouged','butchered','macheted')
# Sentences about deaths. A story where most sentences count the dead is a casualty
# report, whatever its headline says.
$script:WSJ_DEATH_WORDS = @('killed','kill','kills','killing','dead','died','dies','death','deaths','bodies','slain',
                            'fatalities','casualties','murdered','shot dead')
# The African lens (the list lives in news-ranking.ps1, NEWS_CONFLICT_ACTORS). From Africa, an insurgency or a civil war is not crime news: in the
# Sahel, Sudan, eastern Congo, Somalia or northern Mozambique it decides who controls
# territory, who governs, and where millions live and trade. Harm by these actors is
# conflict, judged like a war (and still written without spectacle). Bandits, robbers
# and a single killer are not on this list: that is crime.
$script:WSJ_CONFLICT_ACTORS = $script:NEWS_CONFLICT_ACTORS   # defined in news-ranking.ps1
# A toll at least this big makes a casualty story a candidate for the paper.
$script:WSJ_MASS_TOLL = 25
# Targets for an edition, checked by Get-WsjEditionMix.
$script:WSJ_TARGETS = [ordered]@{
  maxRoutineHarmShare = 0.03   # routine crime and casualty stories, after the gate
  maxSecurityShare    = 0.12   # Security topic
  minEconomyShare     = 0.30   # Business, Agriculture and Tech together
  maxStandardsShare   = 0.05   # stories still carrying a standards problem
}

function Remove-WsjQuotedSpans([string]$Text) {
  if (-not $Text) { return '' }
  $open = [string][char]0x201C; $close = [string][char]0x201D
  $gOpen = [string][char]0x00AB; $gClose = [string][char]0x00BB
  $t = [regex]::Replace($Text, '"[^"]{0,400}"', ' ')
  $t = [regex]::Replace($t, [regex]::Escape($open) + '[^' + [regex]::Escape($close) + ']{0,400}' + [regex]::Escape($close), ' ')
  $t = [regex]::Replace($t, [regex]::Escape($gOpen) + '[^' + [regex]::Escape($gClose) + ']{0,400}' + [regex]::Escape($gClose), ' ')
  return $t
}

# Every phrase from the list found in the text outside quotation marks.
function Get-WsjPhraseHits([string]$Text, [string[]]$Phrases) {
  $plain = ConvertTo-NewsText (Remove-WsjQuotedSpans $Text)
  $hits = New-Object System.Collections.Generic.List[string]
  if (-not $plain) { return @() }
  foreach ($p in @($Phrases)) { if ((Test-NewsPhrase $plain $p) -and -not $hits.Contains($p)) { $hits.Add($p) } }
  return $hits.ToArray()
}

function Get-WsjStoryParts($Brief) {
  $paragraphs = @($Brief.paragraphs | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
  return [pscustomobject]@{
    Headline   = [string]$Brief.headline
    Dek        = [string]$Brief.dek
    Paragraphs = $paragraphs
    Why        = [string]$Brief.why
    Lead       = ([string]$Brief.headline + ' ' + [string]$Brief.dek)
    All        = ((@([string]$Brief.headline, [string]$Brief.dek) + $paragraphs + @([string]$Brief.why)) -join "`n")
  }
}

# What kind of story this is about, judged from its headline and dek (a business story
# that mentions a death in its third paragraph is still a business story):
#   none              - no killing, crash or crime at its centre
#   conflict          - harm in a war, coup, epidemic or disaster
#   consequence       - harm with a policy or economic consequence (an attack that shuts
#                       a mine, a road-safety target, an inquiry)
#   routine-harm      - a crime, crash or killing and nothing more
# A harm word must be in the headline, or twice in the dek: "the late founder, who died
# in 2023" under a church succession headline is background (17 Nov 2026 edition).
function Get-WsjHarmClass([string]$Headline, [string]$Dek = '') {
  $canon = ConvertTo-CanonicalNewsText ($Headline + ' ' + $Dek)
  # Plain text: the canonical form reads "terrorism" as "attack".
  $inHeadline = Get-NewsMatchCount (ConvertTo-NewsText $Headline) $script:NEWS_ROUTINE_HARM 1
  $inDek = Get-NewsMatchCount (ConvertTo-NewsText $Dek) $script:NEWS_ROUTINE_HARM 2
  if (-not $inHeadline -and $inDek -lt 2) { return 'none' }
  if (Get-NewsMatchCount $canon $script:NEWS_URGENT 1) { return 'conflict' }
  if (Get-NewsMatchCount (ConvertTo-NewsText ($Headline + ' ' + $Dek)) $script:WSJ_CONFLICT_ACTORS 1) { return 'conflict' }
  # Plain text, not canonical: the canonical form turns "investigation" into "investment".
  if (Get-NewsMatchCount (ConvertTo-NewsText ($Headline + " " + $Dek)) $script:NEWS_HARM_EXEMPT 1) { return 'consequence' }
  return 'routine-harm'
}

function Get-WsjReach($Brief) {
  $r = 0
  if ($null -ne $Brief.reach -and [int]::TryParse([string]$Brief.reach, [ref]$r) -and $r -ge 1 -and $r -le 5) { return $r }
  return 0
}

# The publication gate. Pass = the story may run.
# A routine crime, crash or killing story runs only when the desk judged it national
# news (reach 4 or 5) AND its toll is at least WSJ_MASS_TOLL, or its reach is 5: a
# massacre that shakes a country, not a truck crash or a murder remand.
function Test-WsjBar($Brief) {
  $parts = Get-WsjStoryParts $Brief
  $class = Get-WsjHarmClass $parts.Headline $parts.Dek
  $reach = Get-WsjReach $Brief
  $toll = Get-NewsMassToll ($parts.Lead + ' ' + (@($parts.Paragraphs | Select-Object -First 1) -join ' '))
  $pass = $true
  $why = ''
  # Conflict runs when the desk judged it national news (reach 3 or more); a skirmish
  # it scored 1 or 2 is a casualty report like any other. Reach 0 = not recorded.
  if ($class -eq 'conflict' -and $reach -ge 1 -and $reach -le 2) {
    $pass = $false
    $why = "conflict report the desk judged minor (reach $reach)"
  }
  # An obituary of a public figure ("dies at 71") is not a casualty report.
  if ($class -eq 'routine-harm' -and (Test-NewsObituary $parts.Headline)) { $class = 'obituary' }
  if ($class -eq 'routine-harm') {
    # Reach 0: a story from before the desk scored reach (archive before 17 Nov 2026).
    # Then the toll alone decides: 48 civilians killed near Menaka is national news.
    # A hundred or more dead or abducted is national news at any reach (Shakahola, 191).
    $major = ($reach -ge 5) -or ($reach -ge 4 -and $toll -ge $script:WSJ_MASS_TOLL) -or ($reach -eq 0 -and $toll -ge $script:WSJ_MASS_TOLL) -or
             ($toll -ge 100)
    if (-not $major) {
      $pass = $false
      $why = "routine crime or casualty story below the Wall Street Journal bar (reach $reach, toll $toll)"
    }
  }
  return [pscustomobject]@{ Pass = $pass; Class = $class; Reach = $reach; Toll = $toll; Reason = $why }
}

# Would the Wall Street Journal ever have published this story? The audit of the
# archive (scripts/audit-wsj-archive.ps1) removes what fails. Beyond the bar: a tabloid
# or gossip subject, or graphic detail in the headline or dek. Loaded words in the body
# alone are a copy problem, not a reason to withdraw a story.
function Test-WsjArchiveKeep($Story) {
  $bar = Test-WsjBar $Story
  if (-not $bar.Pass) { return [pscustomobject]@{ Keep = $false; Reason = $bar.Reason; Class = $bar.Class } }
  $lead = [string]$Story.headline + ' ' + [string]$Story.dek
  # Tabloid and gossip words in the headline only ("artifacts dating from 50 BC" in a dek
  # is not a dating story), and never for a story about government or regulation
  # (a lottery plan reviewed by two ministries, policing betting sites).
  $head = ConvertTo-CanonicalNewsText ([string]$Story.headline)
  $policy = (Get-NewsMatchCount (ConvertTo-NewsText $lead) ($script:NEWS_HARM_EXEMPT + @('government','ministry','ministries','regulator','regulation','revenue','police','conservation','tourism')) 1)
  if (-not $policy -and ((Get-NewsMatchCount $head $script:NEWS_TABLOID 1) -or (Get-NewsMatchCount $head $script:NEWS_JUNK 1))) {
    return [pscustomobject]@{ Keep = $false; Reason = 'tabloid or gossip subject'; Class = $bar.Class }
  }
  # A graphic word in the dek counts only on a harm story: "mutilated sheep" is how a
  # wildlife story says a predator is back.
  $graphicIn = if ($bar.Class -eq 'none') { [string]$Story.headline } else { $lead }
  $graphic = @(Get-WsjPhraseHits $graphicIn $script:WSJ_GRAPHIC)
  if ($graphic.Count) {
    return [pscustomobject]@{ Keep = $false; Reason = ('graphic headline or dek: ' + ($graphic -join ', ')); Class = $bar.Class }
  }
  return [pscustomobject]@{ Keep = $true; Reason = ''; Class = $bar.Class }
}

# A headline that opens with a death toll: "17 killed in two mass shootings", "At least
# 40 dead after ...", "Crash leaves 31 dead". Allowed for a war, coup, epidemic or
# disaster (the story text says so); otherwise the headline leads with the consequence.
function Test-WsjTollHeadline([string]$Headline, [string]$StoryText) {
  $h = ConvertTo-NewsText $Headline
  if (-not $h) { return $false }
  $num = '(?:\d{1,3}(?: \d{3})+|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozens|scores|hundreds|thousands)'
  $death = '(?:killed|dead|die|died|dies|deaths|slain|massacred|drowned|drown|perish|perished|bodies)'
  $lead = '^(?:at least |more than |over |nearly |about |some |up to )?' + $num + ' (?:[a-z]+ ){0,3}?' + $death + '\b'
  $tail = '\b(?:kills|leaves|left|claims)\s+(?:at least |more than |over |nearly |about |some )?' + $num + '\b(?: [a-z]+){0,2} ?(?:dead|people|lives|killed)?'
  if (-not ([regex]::IsMatch($h, $lead) -or [regex]::IsMatch($h, $tail))) { return $false }
  return -not (Get-NewsMatchCount (ConvertTo-CanonicalNewsText $StoryText) $script:NEWS_URGENT 1)
}

# A story most of whose sentences count the dead.
function Test-WsjDwellsOnDeaths([string[]]$Paragraphs) {
  $sentences = @(($Paragraphs -join ' ') -split '(?<=[.!?])\s+' | Where-Object { $_.Trim() })
  if ($sentences.Count -lt 4) { return $false }
  $deathSentences = @($sentences | Where-Object { (Get-WsjPhraseHits $_ $script:WSJ_DEATH_WORDS).Count }).Count
  return ($deathSentences -ge 4 -and $deathSentences * 2 -ge $sentences.Count)
}

function Get-WsjStandardsIssues($Brief) {
  $parts = Get-WsjStoryParts $Brief
  $sensational = @(Get-WsjPhraseHits $parts.All $script:WSJ_SENSATIONAL)
  $graphic = @(Get-WsjPhraseHits $parts.All $script:WSJ_GRAPHIC)
  $toll = Test-WsjTollHeadline $parts.Headline $parts.All
  $dwells = Test-WsjDwellsOnDeaths $parts.Paragraphs
  $issues = New-Object System.Collections.Generic.List[string]
  if ($sensational.Count) { $issues.Add('sensational words: ' + (($sensational | ForEach-Object { '"' + $_ + '"' }) -join ', ')) }
  if ($graphic.Count) { $issues.Add('graphic detail: ' + (($graphic | ForEach-Object { '"' + $_ + '"' }) -join ', ')) }
  if ($toll) { $issues.Add('headline leads with a death toll') }
  if ($dwells) { $issues.Add('dwells on casualties') }
  return [pscustomobject]@{ Issues = $issues.ToArray(); Sensational = $sensational; Graphic = $graphic; TollHeadline = [bool]$toll; DwellsOnDeaths = [bool]$dwells }
}

# The rewrite instructions for the problems above, one line each.
function Get-WsjRepairLines($Standards) {
  $lines = New-Object System.Collections.Generic.List[string]
  if (@($Standards.Sensational).Count) {
    $lines.Add('- It uses loaded words the paper never prints in its own voice: ' + ((@($Standards.Sensational) | ForEach-Object { '"' + $_ + '"' }) -join ', ') + '. The paper writes like the Wall Street Journal: state what happened and let the facts carry the weight. Delete each word or replace it with the fact behind it (a number, a name, an action).')
  }
  if (@($Standards.Graphic).Count) {
    $lines.Add('- It describes injuries or bodies: ' + ((@($Standards.Graphic) | ForEach-Object { '"' + $_ + '"' }) -join ', ') + '. Say plainly that people were killed or died, attributed, and nothing about how a body looked or what was done to it.')
  }
  if ($Standards.TollHeadline) {
    $lines.Add('- The headline opens with a death toll. Lead with who acted and what changes because of the event (an inquiry, a closure, a policy, a cost), as the packet reports it. Give the toll once, in the dek or the first paragraph.')
  }
  if ($Standards.DwellsOnDeaths) {
    $lines.Add('- Most sentences count the dead. Give the toll once, attributed, and spend the rest of the story on what the packet says happens next: who responds, what it costs, what changes for the country.')
  }
  return $lines.ToArray()
}

# The shape of an edition. ByCountry: a dictionary or object of country code -> stories.
function Get-WsjEditionMix($ByCountry) {
  $stories = New-Object System.Collections.Generic.List[object]
  $pairs = if ($ByCountry -is [System.Collections.IDictionary]) { @($ByCountry.Keys | ForEach-Object { ,@($_, $ByCountry[$_]) }) }
           else { @($ByCountry.PSObject.Properties | ForEach-Object { ,@($_.Name, $_.Value) }) }
  foreach ($p in $pairs) { foreach ($s in @($p[1])) { if ($s -and $s.headline) { $stories.Add([pscustomobject]@{ code = [string]$p[0]; story = $s }) } } }
  $n = $stories.Count
  $topics = [ordered]@{}
  $classes = [ordered]@{ 'none' = 0; 'conflict' = 0; 'consequence' = 0; 'obituary' = 0; 'routine-harm' = 0 }
  $belowBar = New-Object System.Collections.Generic.List[string]
  $standards = New-Object System.Collections.Generic.List[string]
  foreach ($e in $stories) {
    $s = $e.story
    $t = if ($s.topic) { [string]$s.topic } else { 'News' }
    $topics[$t] = 1 + [int]$topics[$t]
    $bar = Test-WsjBar $s
    $classes[$bar.Class] = 1 + [int]$classes[$bar.Class]
    if (-not $bar.Pass) { $belowBar.Add("$($e.code): $([string]$s.headline)") }
    $st = Get-WsjStandardsIssues $s
    if ($st.Issues.Count) { $standards.Add("$($e.code): $([string]$s.headline) ($(@($st.Issues) -join '; '))") }
  }
  $share = { param($k) if ($n) { [Math]::Round([double]$k / $n, 3) } else { 0.0 } }
  $economy = [int]$topics['Business'] + [int]$topics['Agriculture'] + [int]$topics['Tech']
  $mix = [ordered]@{
    stories          = $n
    topics           = $topics
    harm             = $classes
    economyShare     = (& $share $economy)
    securityShare    = (& $share ([int]$topics['Security']))
    routineHarmShare = (& $share $classes['routine-harm'])
    belowBar         = $belowBar.ToArray()
    standardsShare   = (& $share $standards.Count)
    standardsHits    = $standards.ToArray()
  }
  $missed = New-Object System.Collections.Generic.List[string]
  if ($n) {
    if ($mix.routineHarmShare -gt $script:WSJ_TARGETS.maxRoutineHarmShare) { $missed.Add(('routine crime and casualty stories {0:P0} (target at most {1:P0})' -f $mix.routineHarmShare, $script:WSJ_TARGETS.maxRoutineHarmShare)) }
    if ($mix.securityShare -gt $script:WSJ_TARGETS.maxSecurityShare) { $missed.Add(('Security stories {0:P0} (target at most {1:P0})' -f $mix.securityShare, $script:WSJ_TARGETS.maxSecurityShare)) }
    if ($mix.economyShare -lt $script:WSJ_TARGETS.minEconomyShare) { $missed.Add(('Business, Agriculture and Tech {0:P0} (target at least {1:P0})' -f $mix.economyShare, $script:WSJ_TARGETS.minEconomyShare)) }
    if ($mix.standardsShare -gt $script:WSJ_TARGETS.maxStandardsShare) { $missed.Add(('stories with a standards problem {0:P0} (target at most {1:P0})' -f $mix.standardsShare, $script:WSJ_TARGETS.maxStandardsShare)) }
  }
  $mix['targetsMissed'] = $missed.ToArray()
  return $mix
}
