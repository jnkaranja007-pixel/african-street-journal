#Requires -Version 5.1
<#
.SYNOPSIS
  Turn ranked assignments into original, on-site ASJ stories using OpenRouter.
.DESCRIPTION
  Step 2 of the daily desk. Reads the ranked assignments from scripts/fetch-news.ps1
  and writes grounded stories in the journal's voice, then writes JSON so the
  existing publish path (add-briefs -> validate -> audit -> static pages) picks it up
  unchanged.

  The model is never asked for a URL. It receives numbered items and returns an index;
  this script attaches the real URL and outlet name from the feed. A model cannot
  fabricate a citation it was never asked to write. That is the structural fix for the
  two invented URLs the 5 August search-based run produced.

  Everything the model returns is treated as untrusted: index must exist, topic must be
  on the allowed list, headline is length-capped, and a brief with no surviving source
  is dropped. A country that cannot produce clean output is skipped rather than
  published dirty.
.USAGE
  $env:OPENROUTER_API_KEY = 'sk-or-v1-...'
  powershell -ExecutionPolicy Bypass -File scripts/write-briefs.ps1
  powershell -ExecutionPolicy Bypass -File scripts/write-briefs.ps1 -Only ng,ke -Model google/gemma-4-31b-it
.NOTES
  Exit 0 if any country produced a complete five-story desk. Exit 1 if none did, which the workflow treats
  as a failed desk run rather than quietly publishing yesterday's paper again.
#>
param(
  [string]$Model      = 'google/gemma-4-31b-it',
  [string[]]$Only,
  [string]$InFile     = 'data/feed-items.json',
  [string]$OutFile    = 'data/manual-briefs.json',
  [int]$MaxBriefs     = 5,
  # Five stories make a country desk worth returning to. Thin countries keep their last
  # complete edition and use the regional wire instead of publishing a partial desk.
  [int]$MinBriefs     = 5,
  [int]$Retries       = 2,
  [int]$DelayMs       = 300,
  [double]$Temperature = 0.3,
  [int]$MinStoryWords = 70,
  [int]$MaxStoryWords = 220,
  [string]$PromptVersion = 'story-v3-concise-lenses',
  [string]$CacheFile = 'data/story-cache.json',
  [string]$MetricsFile = 'data/desk-run-metrics.json',
  [switch]$NoCache,
  [switch]$JsonMode,
  [switch]$Merge
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root    = Split-Path $PSScriptRoot -Parent
$inPath  = if ([IO.Path]::IsPathRooted($InFile))  { $InFile }  else { Join-Path $root $InFile }
$outPath = if ([IO.Path]::IsPathRooted($OutFile)) { $OutFile } else { Join-Path $root $OutFile }
$cachePath = if ([IO.Path]::IsPathRooted($CacheFile)) { $CacheFile } else { Join-Path $root $CacheFile }
$metricsPath = if ([IO.Path]::IsPathRooted($MetricsFile)) { $MetricsFile } else { Join-Path $root $MetricsFile }

$apiKey = $env:OPENROUTER_API_KEY
if (-not (Test-Path $inPath)) {
  Write-Host "[write] $InFile not found - run scripts/fetch-news.ps1 first." -ForegroundColor Red
  exit 1
}

$feed = [IO.File]::ReadAllText($inPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
if (-not $feed.byCountry) { Write-Host '[write] feed has no byCountry block' -ForegroundColor Red; exit 1 }

$VALID_TOPICS = @('Politics','Business','Sport','Tech','Climate','Agriculture','Culture','Health','Education','News')
$STORY_LENSES = @('farmers','investors','diaspora')
$LENS_FALLBACK_SCORES = @{
  farmers = @{ Politics=48; Business=62; Sport=24; Tech=52; Climate=88; Agriculture=96; Culture=30; Health=58; Education=54; News=44 }
  investors = @{ Politics=72; Business=96; Sport=35; Tech=88; Climate=62; Agriculture=68; Culture=38; Health=54; Education=58; News=48 }
  diaspora = @{ Politics=78; Business=72; Sport=68; Tech=58; Climate=52; Agriculture=48; Culture=88; Health=66; Education=74; News=56 }
}

function Get-LensFallbackScore([string]$Lens, [string]$Topic) {
  $byLens = $LENS_FALLBACK_SCORES[$Lens]
  if ($byLens -and $byLens.ContainsKey($Topic)) { return [int]$byLens[$Topic] }
  return 50
}

$codes = @($feed.byCountry.PSObject.Properties.Name)
if ($Only) {
  # Via `powershell -File`, "-Only ng,ke" arrives as a single string. Split before matching.
  $want  = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $codes = $codes | Where-Object { $want -contains $_ }
  if (-not $codes) { Write-Host "[write] no country matched: $($want -join ',')" -ForegroundColor Red; exit 1 }
}

# --- house style -------------------------------------------------------------
# The assignment meter decides what deserves coverage. The model's only editorial job
# is to turn each assigned evidence packet into an original, readable ASJ story.
$STYLE = @'
You are the overnight desk writer for The African Street Journal. Write original,
on-site news stories from the supplied evidence. Be plain, specific and useful. Never
sound like a press release, and never send the reader away to understand the event.

Rules:
- Headline: actor + active verb + material result. Maximum 90 characters.
- Dek: one specific sentence that advances the headline, maximum 180 characters.
- Paragraphs: exactly 3 short paragraphs, 70 to 220 words total; aim for 90 to 160.
  Lead with what changed, then attribution, scale, affected people and useful context
  present in the evidence. Count the story words before returning the JSON.
- "why": one concrete sentence naming who is affected and how. No generic importance.
- Lenses: score the story's direct relevance from 0 to 100 for farmers, investors and
  diaspora readers. A score measures audience fit, not truth, certainty or overall importance.
  Give each lens one grounded "why" sentence using only the supplied evidence. Farmers covers
  production, food markets, rural livelihoods, land, water and inputs. Investors covers firms,
  rates, currency, trade, regulation, infrastructure and capital. Diaspora covers remittances,
  travel, visas, family safety, education, culture and cross-border money.
- Attribute disputed claims. Carry units, direction and comparisons exactly as supplied.
- Paraphrase. Do not copy a source sentence or use a quotation longer than 12 words.
- Neutral. Report what happened and attribute claims. No opinion, no loaded
  adjectives, no speculation, no calls to action.
- Do not pad thin evidence. Omit an assignment rather than repeat a fact or invent
  context. The reserve item may replace one assignment that cannot support a story.
- Items arrive in whatever language the outlet publishes in: English, French,
  Portuguese, Spanish, Arabic or another local language. Write in English and translate
  faithfully. Keep place and person names in the form English readers recognise.

Hard limit: use ONLY facts present in that assignment's evidence packet. Never add a
figure, name, quote, date, cause, reaction or historical claim from outside it. Do not
mix facts between assignments. If the evidence cannot support 70 useful words, omit it.
'@

function Get-JsonBlock([string]$text) {
  # Small models wrap JSON in prose or ```json fences, and sometimes return a bare
  # array instead of the requested object. Take whichever structure starts first.
  if (-not $text) { return $null }
  $t = $text -replace '(?s)^\s*```(?:json)?\s*', '' -replace '(?s)\s*```\s*$', ''
  $ob = $t.IndexOf('{'); $oa = $t.IndexOf('[')
  $useArray = ($oa -ge 0 -and ($ob -lt 0 -or $oa -lt $ob))
  if ($useArray) {
    $end = $t.LastIndexOf(']')
    if ($end -gt $oa) { return $t.Substring($oa, $end - $oa + 1) }
  }
  if ($ob -lt 0) { return $null }
  $end = $t.LastIndexOf('}')
  if ($end -le $ob) { return $null }
  return $t.Substring($ob, $end - $ob + 1)
}

function Get-BriefArray($parsed) {
  # Accept the requested {"briefs":[...]}, a bare [...], or any other single-key
  # wrapper the model invents. Botswana was dropped entirely because one response
  # used a different key - a country should not be lost to a naming whim.
  if ($null -eq $parsed) { return $null }
  if ($parsed -is [array]) { return @($parsed) }
  if ($parsed.stories) { return @($parsed.stories) }
  if ($parsed.briefs) { return @($parsed.briefs) }
  foreach ($p in $parsed.PSObject.Properties) {
    if ($p.Value -is [array] -and @($p.Value).Count) { return @($p.Value) }
  }
  # A single brief returned unwrapped.
  if ($parsed.headline -and $parsed.body) { return @($parsed) }
  return $null
}

function Get-TextHash([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Text)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Get-WordCount([string]$Text) {
  if (-not $Text) { return 0 }
  return @(($Text -replace '\s+', ' ').Trim() -split ' ' | Where-Object { $_ }).Count
}

function Get-NumberKeys([string]$Text) {
  $keys = @{}
  if (-not $Text) { return $keys }
  foreach ($match in [regex]::Matches($Text, '(?<![\p{L}\p{N}])\$?\d[\d.,]*(?:\s*(?:%|percent|pour cent|million|millions|billion|billions|milliard|milliards|trillion|trillions|thousand|bn|mn|mw|mwc|gw|km|kg|tonnes?))?', 'IgnoreCase')) {
    $key = ($match.Value.ToLowerInvariant() -replace '[^a-z0-9%]', '')
    $key = $key -replace 'milliards?$', 'billion' -replace 'millions$', 'million' -replace 'billions$', 'billion' -replace 'trillions$', 'trillion' -replace 'pourcent$', 'percent'
    if ($key) { $keys[$key] = $true }
  }
  return $keys
}

function Get-UngroundedNumbers([string]$StoryText, [string]$EvidenceText) {
  $evidence = Get-NumberKeys $EvidenceText
  $missing = New-Object System.Collections.Generic.List[string]
  foreach ($match in [regex]::Matches($StoryText, '(?<![\p{L}\p{N}])\$?\d[\d.,]*(?:\s*(?:%|percent|pour cent|million|millions|billion|billions|milliard|milliards|trillion|trillions|thousand|bn|mn|mw|mwc|gw|km|kg|tonnes?))?', 'IgnoreCase')) {
    $key = ($match.Value.ToLowerInvariant() -replace '[^a-z0-9%]', '')
    $key = $key -replace 'milliards?$', 'billion' -replace 'millions$', 'million' -replace 'billions$', 'billion' -replace 'trillions$', 'trillion' -replace 'pourcent$', 'percent'
    if ($key -and -not $evidence.ContainsKey($key)) { $missing.Add($match.Value) }
  }
  return @($missing | Select-Object -Unique)
}

$storyCache = @{}
if (-not $NoCache -and (Test-Path $cachePath)) {
  try {
    $cacheObj = [IO.File]::ReadAllText($cachePath, [Text.Encoding]::UTF8) | ConvertFrom-Json
    if ($cacheObj.entries) {
      foreach ($property in $cacheObj.entries.PSObject.Properties) { $storyCache[$property.Name] = $property.Value }
    }
  } catch {
    Write-Host '[write] story cache is unreadable; continuing without it' -ForegroundColor DarkYellow
    $storyCache = @{}
  }
}

function Invoke-OpenRouter([string]$prompt) {
  if (-not $apiKey) {
    throw 'OPENROUTER_API_KEY is not set (local: $env:OPENROUTER_API_KEY; CI: gh secret set OPENROUTER_API_KEY)'
  }
  $body = [ordered]@{
    model       = $Model
    messages    = @(
      @{ role = 'system'; content = $STYLE },
      @{ role = 'user'; content = $prompt }
    )
    temperature = $Temperature
    max_tokens  = 2600
  }
  # response_format is not honoured by every provider behind a given model slug, and a
  # rejected request costs the whole country. Off by default; the prompt plus
  # Get-JsonBlock handles fenced or chatty output anyway.
  if ($JsonMode) { $body['response_format'] = @{ type = 'json_object' } }

  $json  = $body | ConvertTo-Json -Depth 8 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $headers = @{
    'Authorization' = "Bearer $apiKey"
    'Content-Type'  = 'application/json'
    'HTTP-Referer'  = 'https://jnkaranja007-pixel.github.io/african-street-journal'
    'X-Title'       = 'The African Street Journal'
  }

  # Invoke-WebRequest with manual UTF-8 decoding. Invoke-RestMethod in PS 5.1 decodes
  # by the response charset header and mangles accented names into mojibake.
  try {
    $resp = Invoke-WebRequest -Uri 'https://openrouter.ai/api/v1/chat/completions' `
              -Method Post -Headers $headers -Body $bytes -TimeoutSec 120 `
              -UseBasicParsing -ErrorAction Stop
  } catch [Net.WebException] {
    # Without this the caller sees only "The remote server returned an error: (400)"
    # and loses OpenRouter's actual explanation - wrong model slug, no credit, bad
    # parameter - which is the only thing that makes the failure diagnosable.
    $status = 0; $detail = ''
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      try {
        $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream(), [Text.Encoding]::UTF8)
        $detail = $sr.ReadToEnd()
      } catch { }
    }
    if ($detail.Length -gt 300) { $detail = $detail.Substring(0, 300) }
    throw "HTTP $status $detail"
  }
  $text = [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
  $obj  = $text | ConvertFrom-Json
  if ($obj.error) { throw "API error: $($obj.error.message)" }
  return [pscustomobject]@{
    Content          = [string]$obj.choices[0].message.content
    PromptTokens     = if ($obj.usage.prompt_tokens) { [int]$obj.usage.prompt_tokens } else { 0 }
    CompletionTokens = if ($obj.usage.completion_tokens) { [int]$obj.usage.completion_tokens } else { 0 }
    TotalTokens      = if ($obj.usage.total_tokens) { [int]$obj.usage.total_tokens } else { 0 }
    Cost             = if ($obj.usage.cost) { [double]$obj.usage.cost } else { 0.0 }
  }
}

$result  = [ordered]@{}
$stories = 0
$skipped = New-Object System.Collections.Generic.List[string]
$usagePrompt = 0
$usageCompletion = 0
$usageTotal = 0
$usageCost = 0.0
$apiCalls = 0
$cacheHits = 0
$insufficientCandidates = 0
$countriesEligibleForWriting = 0

foreach ($code in $codes) {
  $entry = $feed.byCountry.$code
  $items = @($entry.items)
  if ($items.Count -eq 0) { $skipped.Add("$code (no items)"); continue }
  if ($items.Count -lt $MinBriefs) {
    $insufficientCandidates++
    $skipped.Add("$code (only $($items.Count) ranked candidates)")
    Write-Host ("  {0}  {1,-30} SKIPPED BEFORE MODEL: {2} candidates, need {3}" -f `
                $code, [string]$entry.country, $items.Count, $MinBriefs) -ForegroundColor DarkYellow
    continue
  }
  $countriesEligibleForWriting++

  $name = [string]$entry.country
  # The meter has already done the assigning. The first five are assignments; a sixth
  # is reserve evidence if one assignment is too thin to support an on-site story.
  $n    = [Math]::Min($MaxBriefs, [Math]::Max(1, $items.Count))

  $lines = New-Object System.Text.StringBuilder
  for ($i = 0; $i -lt $items.Count; $i++) {
    $it = $items[$i]
    $slot = if ($i -lt $n) { 'ASSIGNED' } else { 'RESERVE' }
    [void]$lines.AppendLine("[$i] $slot - $($it.title)")
    [void]$lines.AppendLine("    outlet: $($it.source)")
    if ($it.published) { [void]$lines.AppendLine("    published: $($it.published)") }
    if ($it.editorialScore) {
      [void]$lines.AppendLine("    desk meter: $($it.editorialScore)/$($it.confidence); topic hint: $($it.topicHint)")
    }
    if ($it.rankReasons) { [void]$lines.AppendLine("    assignment reasons: $(@($it.rankReasons) -join '; ')") }
    # The lede is the only place a real figure comes from. Without it the model can
    # honour the no-invention rule only by writing an empty story.
    if ($it.summary) { [void]$lines.AppendLine("    primary evidence: $($it.summary)") }
    # Corroboration tells the model which stories the country's press treated as the
    # day's real news, so the lead brief is not whichever item happened to be first.
    if ($it.corroboration -gt 1) {
      $names = @(@($it.alsoSources) | ForEach-Object { [string]$_.name } | Where-Object { $_ })
      $also = if ($names.Count) { " (also in $($names -join ', '))" } else { '' }
      [void]$lines.AppendLine("    corroborated by $($it.corroboration) outlets$also")
    }
    foreach ($other in @($it.alsoSources)) {
      if ($other.title) { [void]$lines.AppendLine("    additional source title: $($other.title)") }
      if ($other.summary) { [void]$lines.AppendLine("    additional evidence: $($other.summary)") }
    }
    [void]$lines.AppendLine('')
  }

  $prompt = @"
Country: $name

Today's ranked assignments. The number in brackets is the item index.

$($lines.ToString())
Write one story for each ASSIGNED item. Use the RESERVE only to replace an assigned
item whose evidence cannot support $MinStoryWords useful words. Return at most $n
stories, ordered by their original desk rank.

Return ONLY a JSON object, no prose before or after, in exactly this shape:

{"stories":[{"item":0,"topic":"Business","headline":"...","dek":"...","paragraphs":["...","...","..."],"why":"...","lenses":{"farmers":{"score":60,"why":"..."},"investors":{"score":90,"why":"..."},"diaspora":{"score":45,"why":"..."}}}]}

- "item" is the index of the item the brief is based on. It must be one of the
  indexes listed above.
- "topic" must be exactly one of: $($VALID_TOPICS -join ', ').
- Every story must include all three lens objects. Each score must be a whole number
  from 0 to 100, and each lens "why" must be one specific evidence-grounded sentence.
- Do not include any URL. Sources are attached automatically from the item.
- Do not combine two item indexes into one story.
"@

  $briefs = $null
  $lastErr = ''
  $itemKeys = @($items | ForEach-Object {
    if ($_.itemId) { [string]$_.itemId } else { Get-TextHash (([string]$_.url) + "`n" + ([string]$_.title) + "`n" + ([string]$_.summary)) }
  })
  $cacheKey = Get-TextHash (($PromptVersion, $Model, (Get-TextHash $STYLE), $code, $MaxBriefs, $MinBriefs, `
                            $MinStoryWords, $MaxStoryWords, ($itemKeys -join ',')) -join "`n")
  $fromCache = $false
  if (-not $NoCache -and $storyCache.ContainsKey($cacheKey)) {
    $briefs = @($storyCache[$cacheKey].stories)
    $fromCache = ($briefs.Count -gt 0)
    if ($fromCache) { $cacheHits++; Write-Host ("      {0}: story cache hit" -f $code) -ForegroundColor DarkGray }
  }

  if (-not $fromCache) {
    for ($attempt = 1; $attempt -le ($Retries + 1); $attempt++) {
      try {
        $response = Invoke-OpenRouter $prompt
        $apiCalls++
        $usagePrompt += $response.PromptTokens
        $usageCompletion += $response.CompletionTokens
        $usageTotal += $response.TotalTokens
        $usageCost += $response.Cost
        $blk = Get-JsonBlock $response.Content
        if (-not $blk) { $lastErr = 'no JSON object in response'; continue }
        $parsed = $blk | ConvertFrom-Json
        $briefs = Get-BriefArray $parsed
        if (-not $briefs) { $lastErr = 'no story array in response'; $briefs = $null; continue }
        break
      } catch {
        $lastErr = $_.Exception.Message.Split("`n")[0]
        # A rate limit needs real time, not a 500ms nudge. Cheap and free-tier models
        # throttle hard partway through a 55-country run, and retrying immediately just
        # burns the remaining attempts and drops the country.
        if ($lastErr -match '429|rate.?limit') { Start-Sleep -Seconds (20 * $attempt) }
        else { Start-Sleep -Milliseconds (500 * $attempt) }
      }
    }
  }

  if (-not $briefs) {
    Write-Host ("  {0}  {1,-30} SKIPPED: {2}" -f $code, $name, $lastErr) -ForegroundColor Red
    $skipped.Add("$code ($lastErr)")
    Start-Sleep -Milliseconds $DelayMs
    continue
  }

  # --- everything below treats model output as untrusted ---------------------
  $clean = New-Object System.Collections.Generic.List[object]
  $usedItems = @{}
  $rejectReasons = New-Object System.Collections.Generic.List[string]
  foreach ($b in $briefs) {
    if (-not $b.headline -or -not $b.dek -or -not $b.why) { $rejectReasons.Add('missing headline/dek/why'); continue }

    # The index must exist. This is the anti-fabrication gate: no valid index means
    # no source, and a story with no source is not published.
    $idx = -1
    if ($null -ne $b.item -and [int]::TryParse([string]$b.item, [ref]$idx)) { } else { $rejectReasons.Add('invalid item index'); continue }
    if ($idx -lt 0 -or $idx -ge $items.Count) { $rejectReasons.Add('item index out of range'); continue }
    if ($usedItems.ContainsKey($idx)) { $rejectReasons.Add('duplicate item index'); continue }
    $usedItems[$idx] = $true

    $src = $items[$idx]
    if (-not $src.url -or $src.url -notmatch '^https?://') { $rejectReasons.Add('missing source URL'); continue }

    $topic = [string]$b.topic
    if ($VALID_TOPICS -notcontains $topic) { $topic = 'News' }

    $headline = ([string]$b.headline).Trim()
    if ($headline.Length -gt 100) { $rejectReasons.Add('headline over 100 chars'); continue }
    if ($headline.Length -gt 90) { $headline = $headline.Substring(0, 87).TrimEnd() + '...' }
    $dek = ([string]$b.dek).Trim()
    if (-not $dek -or $dek.Length -gt 180) { $rejectReasons.Add('invalid dek'); continue }
    $why = ([string]$b.why).Trim()
    $whyWords = Get-WordCount $why
    if ($whyWords -lt 8 -or $whyWords -gt 50) { $rejectReasons.Add('why line outside 8-50 words'); continue }

    # Lens metadata changes discovery and the displayed relevance note, never the facts.
    # Normalize a malformed or missing model field to a deterministic topic score and the
    # canonical grounded why line so one bad sub-object cannot drop an otherwise valid story.
    $lensData = [ordered]@{}
    foreach ($lens in $STORY_LENSES) {
      $lensEntry = $null
      if ($b.lenses) {
        $lensProperty = $b.lenses.PSObject.Properties[$lens]
        if ($lensProperty) { $lensEntry = $lensProperty.Value }
      }
      $lensScore = Get-LensFallbackScore $lens $topic
      $parsedScore = 0.0
      if ($lensEntry -and [double]::TryParse([string]$lensEntry.score, [ref]$parsedScore)) {
        $lensScore = [int][Math]::Round([Math]::Max(0.0, [Math]::Min(100.0, $parsedScore)))
      }
      $lensWhy = if ($lensEntry) { ([string]$lensEntry.why).Trim() } else { '' }
      $lensWhyWords = Get-WordCount $lensWhy
      if ($lensWhyWords -lt 8 -or $lensWhyWords -gt 50) { $lensWhy = $why }
      $lensData[$lens] = [ordered]@{ score = $lensScore; why = $lensWhy }
    }

    $paragraphs = New-Object System.Collections.Generic.List[string]
    $rawParagraphs = if ($b.paragraphs -is [string]) {
      @(([string]$b.paragraphs) -split '(?:\r?\n)+')
    } else {
      @($b.paragraphs)
    }
    foreach ($paragraph in $rawParagraphs) {
      $text = ([string]$paragraph).Trim()
      if ($text) { $paragraphs.Add($text) }
    }
    if (-not $paragraphs.Count -and $b.body) {
      foreach ($paragraph in @(([string]$b.body) -split '(?:\r?\n){2,}')) {
        $text = $paragraph.Trim()
        if ($text) { $paragraphs.Add($text) }
      }
    }
    # Some providers serialize the requested paragraph array as one long string. Split
    # that prose at sentence boundaries rather than rejecting grounded copy for shape alone.
    if ($paragraphs.Count -lt 3 -or $paragraphs.Count -gt 6) {
      $paragraphText = ($paragraphs.ToArray() -join ' ').Trim()
      $sentences = @([regex]::Matches($paragraphText, '[^.!?]+(?:[.!?]+|$)') |
        ForEach-Object { $_.Value.Trim() } | Where-Object { $_ })
      if ($sentences.Count -ge 3) {
        $paragraphs.Clear()
        $baseSize = [int][Math]::Floor($sentences.Count / 3)
        $extra = $sentences.Count % 3
        $cursor = 0
        for ($group = 0; $group -lt 3; $group++) {
          $groupSize = $baseSize
          if ($group -lt $extra) { $groupSize++ }
          $part = ($sentences[$cursor..($cursor + $groupSize - 1)] -join ' ').Trim()
          if ($part) { $paragraphs.Add($part) }
          $cursor += $groupSize
        }
      }
    }
    if ($paragraphs.Count -lt 3 -or $paragraphs.Count -gt 6) {
      $rejectReasons.Add("story has $($paragraphs.Count) paragraphs, need 3-6")
      continue
    }
    $body = $paragraphs.ToArray() -join "`n`n"
    $wordCount = Get-WordCount $body
    if ($wordCount -lt $MinStoryWords -or $wordCount -gt $MaxStoryWords) {
      $rejectReasons.Add("story has $wordCount words, need $MinStoryWords-$MaxStoryWords")
      continue
    }

    $evidence = ([string]$src.title) + "`n" + ([string]$src.summary) + "`n" + ([string]$src.published)
    foreach ($other in @($src.alsoSources)) {
      $evidence += "`n" + ([string]$other.title) + "`n" + ([string]$other.summary) + "`n" + ([string]$other.published)
    }
    $lensWhyText = @($lensData.Values | ForEach-Object { [string]$_.why }) -join "`n"
    $ungrounded = @(Get-UngroundedNumbers ($headline + "`n" + $dek + "`n" + $body + "`n" + $why + "`n" + $lensWhyText) $evidence)
    if ($ungrounded.Count) {
      $rejectReasons.Add('unsupported number: ' + (($ungrounded | Select-Object -First 2) -join ', '))
      continue
    }

    # Cite every outlet that carried the story, not just the one whose text was used.
    $srcList = New-Object System.Collections.Generic.List[object]
    $srcList.Add(@{ name = [string]$src.source; url = [string]$src.url; published = [string]$src.published })
    foreach ($o in @($src.alsoSources)) {
      if ($o -and ([string]$o.url) -match '^https?://') {
        $srcList.Add(@{ name = [string]$o.name; url = [string]$o.url; published = [string]$o.published })
      }
    }

    $clean.Add([ordered]@{
      articleId       = if ($src.itemId) { [string]$src.itemId } else { Get-TextHash ([string]$src.url) }
      headline        = $headline
      dek             = $dek
      paragraphs      = $paragraphs.ToArray()
      body            = $body
      why             = $why
      lensVersion     = 1
      lenses          = $lensData
      topic           = $topic
      published       = [string]$src.published
      sourceTitle     = [string]$src.title
      editorialScore  = if ($src.editorialScore) { [double]$src.editorialScore } else { 0.0 }
      selectionScore  = if ($src.selectionScore) { [double]$src.selectionScore } else { 0.0 }
      confidence      = [string]$src.confidence
      corroboration   = if ($src.corroboration) { [int]$src.corroboration } else { 1 }
      scoreBreakdown  = $src.scoreBreakdown
      rankReasons     = @($src.rankReasons)
      countryMatch    = [string]$src.countryMatch
      wordCount       = $wordCount
      readMinutes     = [Math]::Max(1, [int][Math]::Ceiling($wordCount / 220.0))
      sources         = $srcList.ToArray()
    })
  }

  # Say how many the model returned versus how many survived validation. Sudan filed
  # one brief while the model was returning five, and there was no way to see that the
  # loss was here rather than in the model without adding prints by hand.
  if ($clean.Count -lt @($briefs).Count) {
    Write-Host ("      {0}: model returned {1}, kept {2} (items available {3})" -f `
                $code, @($briefs).Count, $clean.Count, $items.Count) -ForegroundColor DarkGray
    if ($rejectReasons.Count) { Write-Host ("      rejected: {0}" -f (($rejectReasons | Select-Object -Unique -First 4) -join '; ')) -ForegroundColor DarkGray }
  }
  if ($clean.Count -lt $MinBriefs) {
    Write-Host ("  {0}  {1,-30} SKIPPED: only {2} usable story/stories" -f $code, $name, $clean.Count) -ForegroundColor DarkYellow
    $skipped.Add("$code (only $($clean.Count) usable)")
    Start-Sleep -Milliseconds $DelayMs
    continue
  }

  if (-not $NoCache -and -not $fromCache) {
    $storyCache[$cacheKey] = [ordered]@{
      generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
      model = $Model
      promptVersion = $PromptVersion
      stories = @($briefs)
    }
  }

  # .ToArray(), not @($clean). Assigning @(<List[object]>) into an ordered dictionary
  # throws "Argument types do not match" in PS 5.1 - the binder mis-resolves the
  # Item[int] / Item[object] overload pair. An Object[] binds cleanly.
  $result[[string]$code] = $clean.ToArray()
  $stories += $clean.Count
  Write-Host ("  {0}  {1,-30} {2} on-site stories" -f $code, $name, $clean.Count) -ForegroundColor Green
  Start-Sleep -Milliseconds $DelayMs
}

if (-not $NoCache -and $storyCache.Count) {
  $cacheEntries = [ordered]@{}
  foreach ($key in @($storyCache.Keys | Sort-Object)) { $cacheEntries[[string]$key] = $storyCache[$key] }
  $cachePayload = [ordered]@{ version = $PromptVersion; entries = $cacheEntries }
  [IO.File]::WriteAllText($cachePath, ($cachePayload | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
}

$metrics = [ordered]@{
  generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  model = $Model
  promptVersion = $PromptVersion
  countriesAttempted = $codes.Count
  countriesEligibleForWriting = $countriesEligibleForWriting
  countriesSkippedBeforeModel = $insufficientCandidates
  countriesWritten = $result.Count
  storiesWritten = $stories
  apiCalls = $apiCalls
  cacheHits = $cacheHits
  promptTokens = $usagePrompt
  completionTokens = $usageCompletion
  totalTokens = $usageTotal
  reportedCostUsd = [Math]::Round($usageCost, 6)
}
[IO.File]::WriteAllText($metricsPath, ($metrics | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding($false)))

if ($result.Count -eq 0) {
  Write-Host "[write] FAIL: no country produced usable stories across $($codes.Count) attempted." -ForegroundColor Red
  if ($countriesEligibleForWriting -eq 0) {
    Write-Host '        No model call was made because no country met the candidate floor.' -ForegroundColor DarkGray
  } else {
    Write-Host '        Check the model slug, the key, and the first SKIPPED reason above.' -ForegroundColor DarkGray
  }
  exit 1
}

# -Merge keeps countries already in the output file that this run did not cover, so a
# partial run tops up the paper instead of shrinking it.
if ($Merge -and (Test-Path $outPath)) {
  $prev = [IO.File]::ReadAllText($outPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $merged = [ordered]@{}
  foreach ($p in $prev.PSObject.Properties) { $merged[[string]$p.Name] = $p.Value }
  foreach ($k in @($result.Keys)) { $merged[[string]$k] = $result[[string]$k] }
  $result = $merged
}

[IO.File]::WriteAllText($outPath, ($result | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))

Write-Host ''
Write-Host "[write] $stories on-site stories across $($result.Count) countries -> $OutFile" -ForegroundColor Green
Write-Host "[write] model: $Model" -ForegroundColor DarkGray
Write-Host ("[write] usage: {0} input + {1} output = {2} tokens; {3} API calls; {4} cache hits; reported cost `${5}" -f `
           $usagePrompt, $usageCompletion, $usageTotal, $apiCalls, $cacheHits, ([Math]::Round($usageCost, 4))) -ForegroundColor DarkGray
if ($skipped.Count) {
  Write-Host "[write] $($skipped.Count) country(ies) skipped: $(($skipped | Select-Object -First 6) -join ', ')" -ForegroundColor DarkYellow
}
exit 0
