#Requires -Version 5.1
<#
.SYNOPSIS
  The single definition of a well-formed story package. Dot-sourced by both
  add-briefs.ps1 (which drops defective stories) and validate-briefs.ps1 (which
  refuses to publish them).
.DESCRIPTION
  These checks lived in both scripts and drifted, which made the drop-guard useless:
  on 27 August a South Sudan story was kept by the merge at 218 words and rejected by
  the gate at 221, so the edition failed with 243 sound stories in hand.

  The cause was a one-character difference in a regex. The merge treated U+2019, the
  curly apostrophe, as a word-joining character and the gate did not, so "Kenya's"
  counted as one word in one place and two in the other. The counts were never going
  to agree, and a guard that measures differently from the gate it protects only looks
  like protection.

  Anything that decides whether a story is publishable belongs in this file. Two
  implementations of the same rule will always drift; the only question is when.
#>

# Word-joining characters: straight apostrophe, curly apostrophe, hyphen. Both counters
# must treat these identically or the totals diverge on ordinary English possessives.
$script:STORY_WORD_PATTERN = "[\p{L}\p{N}]+(?:['" + [char]0x2019 + "-][\p{L}\p{N}]+)*"

function Get-StoryBodyText($Story) {
  # Count the paragraphs, not the body field. They should be identical, but the
  # paragraphs array is what the reader sees and what the contract is written against.
  $paragraphs = @($Story.paragraphs | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
  if ($paragraphs.Count) { return ($paragraphs -join ' ').Trim() }
  return ([string]$Story.body).Trim()
}

function Get-StoryWordCount([string]$Text) {
  if (-not $Text) { return 0 }
  return ([regex]::Matches($Text, $script:STORY_WORD_PATTERN)).Count
}

function Get-StoryShapeIssue($Story, [int]$MinWords, [int]$MaxWords, $SeenArticleIds) {
  # Returns a description of the first problem, or $null when the story is publishable.
  # Only full story packages are checked; anything without paragraphs is a different
  # shape and is covered by the caller's own emptiness checks.
  if (-not $Story.paragraphs) { return $null }

  $id = [string]$Story.articleId
  if (-not $id) { return 'missing articleId' }
  if ($SeenArticleIds -and -not $SeenArticleIds.Add($id)) { return "duplicate articleId $id" }

  $paragraphs = @($Story.paragraphs | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
  if ($paragraphs.Count -lt 3 -or $paragraphs.Count -gt 6) { return "$($paragraphs.Count) paragraphs, need 3-6" }

  $wc = Get-StoryWordCount (Get-StoryBodyText $Story)
  if ($wc -lt $MinWords -or $wc -gt $MaxWords) { return "$wc words, need $MinWords-$MaxWords" }

  if (-not $Story.dek) { return 'missing dek' }
  if (([string]$Story.dek).Length -gt 200) { return 'dek over 200 chars' }
  if (-not $Story.why) { return 'missing why' }
  if (-not $Story.published) { return 'missing published time' }
  if (([string]$Story.headline).Length -gt 100) { return 'headline over 100 chars' }
  $srcs = @($Story.sources | Where-Object { $_ -and $_.url })
  if (-not $srcs.Count) { return 'no reporting source' }
  return $null
}

function Get-IsoDay($value) {
  # Every script in the desk compares "which day is this" against a stamp read out of
  # JSON, and ConvertFrom-Json does not agree with itself across shells: PowerShell 7
  # turns an ISO-8601 string into a [datetime], PowerShell 5.1 leaves it a string.
  # [string] on the PS7 form is culture-dependent - the Windows runner rendered
  # '08/28/2026', which is not a valid schema.org Date and reads as ambiguous DD/MM to
  # most of the continent. Normalise on the TYPE, never on the string form, and keep
  # one copy so the gate, the merge and the page builder cannot disagree about a day.
  if ($null -eq $value) { return '' }
  if ($value -is [datetime])       { return $value.ToString('yyyy-MM-dd') }
  if ($value -is [DateTimeOffset]) { return $value.ToString('yyyy-MM-dd') }
  if ([string]$value -match '^(\d{4}-\d{2}-\d{2})') { return $Matches[1] }
  return ''
}

# Fields the desk keeps for its own record but the site never reads. They are written
# to data/briefs-state.json, which stays on the server, and stripped from the payload
# the reader downloads. Confirmed against app.js: zero references to any of them.
$script:STORY_DESK_ONLY_FIELDS = @(
  'scoreBreakdown',   # why the ranker chose this story - useful in an audit, not to a reader
  'rankReasons',
  'sourceTitle',      # the original outlet headline; the site shows our own
  'countryMatch',
  'lensVersion',
  'corroboration'
)

function ConvertTo-ShippableStory($Story) {
  # The reader's copy of a story. Two things come out of it.
  #
  # 'body' is exactly paragraphs joined by a blank line - verified identical on all 249
  # stories in the 28 August edition - so shipping both sends the same prose twice and
  # made up 31 percent of the file. app.js rebuilds it on load.
  #
  # The desk-only fields above are ranking telemetry. A reader on a phone in Lagos
  # should not be paying to download the scoring breakdown of a story they may not open.
  #
  # A story with no paragraphs keeps its body, because then body is the only prose there
  # is. Three stories in the current edition are in that shape.
  $out = [ordered]@{}
  $hasParagraphs = $null -ne $Story.PSObject.Properties['paragraphs'] -and @($Story.paragraphs).Count -gt 0
  foreach ($f in $Story.PSObject.Properties) {
    if ($STORY_DESK_ONLY_FIELDS -contains $f.Name) { continue }
    if ($f.Name -eq 'body' -and $hasParagraphs) { continue }
    $out[$f.Name] = $f.Value
  }
  return $out
}

function ConvertTo-ShippableByCountry($ByCountry) {
  # Accepts either the [ordered] map the merge builds or the PSCustomObject that comes
  # back from ConvertFrom-Json, so the payload can be re-emitted from the state file
  # without a model run.
  $codes = if ($ByCountry -is [System.Collections.IDictionary]) { @($ByCountry.Keys) }
           else { @($ByCountry.PSObject.Properties.Name) }
  $slim = [ordered]@{}
  foreach ($code in $codes) {
    $stories = if ($ByCountry -is [System.Collections.IDictionary]) { $ByCountry[$code] } else { $ByCountry.$code }
    $list = New-Object System.Collections.Generic.List[object]
    foreach ($s in @($stories)) { $list.Add((ConvertTo-ShippableStory $s)) }
    # .ToArray() rather than @($list): the PowerShell 5.1 binder mis-resolves
    # Item[int] against Item[object] when an [ordered] dictionary is handed a
    # wrapped list, and silently stores something the JSON writer cannot walk.
    $slim[$code] = $list.ToArray()
  }
  return $slim
}

function ConvertTo-CountryJsBlock($ByCountry) {
  # One line per country: '"ke": [ ...compact json... ]'.
  #
  # Pretty-printing the whole map cost 15.6 KB gzipped - 7.5 percent of the payload
  # every reader downloads - to indent a machine-generated file 16,000 lines long that
  # nobody reads. Compressing it whole would save that but turn the daily commit into a
  # single changed line, so a bad night becomes invisible in review.
  #
  # A line per country keeps both: the diff names exactly which countries moved, and
  # the indentation is gone.
  $codes = if ($ByCountry -is [System.Collections.IDictionary]) { @($ByCountry.Keys) }
           else { @($ByCountry.PSObject.Properties.Name) }
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("{`n")
  $i = 0
  foreach ($code in $codes) {
    $stories = if ($ByCountry -is [System.Collections.IDictionary]) { $ByCountry[$code] } else { $ByCountry.$code }
    # ConvertTo-Json unrolls a single-element array into a bare object, which would make
    # a one-story country the only one the app cannot iterate. Force the array shape.
    # -InputObject with an explicit [object[]] cast, never a pipeline. Piping ,@(...)
    # hands ConvertTo-Json the array's PSObject wrapper and emits {"value":[...],"Count":n},
    # which parses fine and then renders nothing, because the app iterates the array it
    # was promised. Casting keeps the array shape for a one-story country too.
    $json = ConvertTo-Json -InputObject ([object[]]@($stories)) -Depth 10 -Compress
    [void]$sb.Append('"').Append($code).Append('": ').Append($json)
    $i++
    if ($i -lt $codes.Count) { [void]$sb.Append(',') }
    [void]$sb.Append("`n")
  }
  [void]$sb.Append('}')
  return $sb.ToString()
}

function Test-StoryIsRenderable($Story) {
  # "Has this story got a headline and some prose." Use this instead of testing the
  # 'body' field directly: the published payload carries paragraphs only, so a literal
  # -and $_.body test silently matches nothing and the caller reports an empty desk
  # rather than an error.
  if (-not $Story) { return $false }
  if (-not ([string]$Story.headline).Trim()) { return $false }
  return [bool](Get-StoryBodyText $Story)
}

function Get-IsoInstant($value) {
  # Get-IsoDay's whole-timestamp sibling, for a field the site sorts and displays by
  # rather than merely compares.
  #
  # Every date the desk handles crosses at least one JSON boundary, and PowerShell 7's
  # ConvertFrom-Json turns an ISO string into a [datetime] on the way through. Casting
  # that back with [string] renders it in the runner's culture: the 28 August edition
  # shipped 574 of 582 published stamps as "08/28/2026 17:36:34". JavaScript's Date()
  # cannot parse that, so every freshness check in the app silently read NaN and the
  # paper could not tell a story filed this morning from one filed last week.
  #
  # Anything writing a timestamp into JSON should go through here.
  if ($null -eq $value) { return '' }
  if ($value -is [datetime])       { return $value.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
  if ($value -is [DateTimeOffset]) { return $value.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ') }
  $s = [string]$value
  if (-not $s.Trim()) { return '' }
  if ($s -match '^\d{4}-\d{2}-\d{2}') { return $s }
  # A culture-rendered stamp that already escaped. Parse it back rather than shipping it.
  $parsed = [datetime]::MinValue
  if ([datetime]::TryParse($s, [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeUniversal,
        [ref]$parsed)) {
    return $parsed.ToString('yyyy-MM-ddTHH:mm:ssZ')
  }
  return ''
}
