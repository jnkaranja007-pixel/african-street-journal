#Requires -Version 5.1
<#
.SYNOPSIS
  Turn data/feed-items.json into house-style briefs using a cheap OpenRouter model.
.DESCRIPTION
  Step 2 of the daily desk. Reads the RSS items fetched by scripts/fetch-news.ps1 and
  rewrites them into the journal's voice, then writes data/manual-briefs.json so the
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
  Exit 0 if any country produced briefs. Exit 1 if none did, which the workflow treats
  as a failed desk run rather than quietly publishing yesterday's paper again.
#>
param(
  [string]$Model      = 'google/gemma-4-31b-it',
  [string[]]$Only,
  [string]$InFile     = 'data/feed-items.json',
  [string]$OutFile    = 'data/manual-briefs.json',
  [int]$MaxBriefs     = 5,
  # One well-sourced brief beats a blank country page. Six countries have only a single
  # working feed, and a floor of 2 would keep them permanently empty.
  [int]$MinBriefs     = 1,
  [int]$Retries       = 2,
  [int]$DelayMs       = 300,
  [double]$Temperature = 0.3,
  [switch]$JsonMode,
  [switch]$Merge
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root    = Split-Path $PSScriptRoot -Parent
$inPath  = if ([IO.Path]::IsPathRooted($InFile))  { $InFile }  else { Join-Path $root $InFile }
$outPath = if ([IO.Path]::IsPathRooted($OutFile)) { $OutFile } else { Join-Path $root $OutFile }

$apiKey = $env:OPENROUTER_API_KEY
if (-not $apiKey) {
  Write-Host '[write] OPENROUTER_API_KEY is not set.' -ForegroundColor Red
  Write-Host '        Local:  $env:OPENROUTER_API_KEY = "sk-or-v1-..."' -ForegroundColor DarkGray
  Write-Host '        CI:     gh secret set OPENROUTER_API_KEY' -ForegroundColor DarkGray
  exit 1
}
if (-not (Test-Path $inPath)) {
  Write-Host "[write] $InFile not found - run scripts/fetch-news.ps1 first." -ForegroundColor Red
  exit 1
}

$feed = [IO.File]::ReadAllText($inPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
if (-not $feed.byCountry) { Write-Host '[write] feed has no byCountry block' -ForegroundColor Red; exit 1 }

$VALID_TOPICS = @('Politics','Business','Sport','Tech','Climate','Agriculture','Culture','Health','Education','News')

$codes = @($feed.byCountry.PSObject.Properties.Name)
if ($Only) {
  # Via `powershell -File`, "-Only ng,ke" arrives as a single string. Split before matching.
  $want  = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $codes = $codes | Where-Object { $want -contains $_ }
  if (-not $codes) { Write-Host "[write] no country matched: $($want -join ',')" -ForegroundColor Red; exit 1 }
}

# --- house style -------------------------------------------------------------
# Kept in one string so the weekly quality pass can tune voice in a single place.
$STYLE = @'
You are the overnight wire editor for The African Street Journal. You rewrite news
items into short, factual briefs in the style of the Wall Street Journal and Yahoo
Finance: plain, specific, numbers first, no hype.

Rules:
- Headline: actor + active verb + the key figure. "Kenya holds base rate at 12.5% as
  shilling steadies", never "Interest rate news". Maximum 90 characters.
- Body: 2 to 4 sentences. The most important fact AND its number in the first
  sentence. Attribution in the second. Never bury the figure.
- Figures carry units and direction, and a comparison where the item gives one.
- "why": required on every brief. One concrete sentence on what this changes for money,
  food, safety, business or movement, naming who is affected and how. It must add
  information the headline does not already carry.
    good: "Parents already on grants must now supply their own paper and cleaning
           materials for classrooms."
    bad:  "The appointment changes the leadership of the company." (restates)
    bad:  "This could affect the economy." (says nothing)
  If the only "why" you can write is a restatement, that item is not worth a brief.
  Drop it and use a different item. Never return an empty "why".
- Neutral. Report what happened and attribute claims. No opinion, no loaded
  adjectives, no speculation, no calls to action.
- Cover what the items warrant across politics, economy, health, climate,
  agriculture, sport and culture. Do not file five versions of one story.
- Skip celebrity gossip, net worth, betting and adult content. Skip any item that is
  not actually about this country.
- Items arrive in whatever language the outlet publishes in: English, French,
  Portuguese or Arabic. ALWAYS write the brief in English, translating the facts
  faithfully. Never skip an item because it is not in English - four of Sudan's five
  stories were dropped that way. Keep place and person names in the form English
  readers will recognise.

Hard limit: use ONLY facts present in the item you are given. You have no other
knowledge of these events. If an item is only a headline, write only what the
headline supports. Never add a figure, name, quote or date that is not in the item.
If you cannot write a brief from an item without inventing something, omit it.
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
  if ($parsed.briefs) { return @($parsed.briefs) }
  foreach ($p in $parsed.PSObject.Properties) {
    if ($p.Value -is [array] -and @($p.Value).Count) { return @($p.Value) }
  }
  # A single brief returned unwrapped.
  if ($parsed.headline -and $parsed.body) { return @($parsed) }
  return $null
}

function Invoke-OpenRouter([string]$prompt) {
  $msg = @{ role = 'user'; content = $prompt }
  $body = [ordered]@{
    model       = $Model
    messages    = @($msg)
    temperature = $Temperature
    max_tokens  = 2000
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
  return [string]$obj.choices[0].message.content
}

$result  = [ordered]@{}
$stories = 0
$skipped = New-Object System.Collections.Generic.List[string]

foreach ($code in $codes) {
  $entry = $feed.byCountry.$code
  $items = @($entry.items)
  if ($items.Count -eq 0) { $skipped.Add("$code (no items)"); continue }

  $name = [string]$entry.country
  # Ask for one brief per available item, capped. The old formula halved the item
  # count, so a five-item country was only ever asked for two briefs and filed one -
  # which read as the model refusing Arabic when it was really this arithmetic.
  # The prompt already tells it fewer good briefs beat padded ones, so the ceiling
  # can be generous.
  $n    = [Math]::Min($MaxBriefs, [Math]::Max(1, $items.Count))

  $lines = New-Object System.Text.StringBuilder
  for ($i = 0; $i -lt $items.Count; $i++) {
    $it = $items[$i]
    [void]$lines.AppendLine("[$i] $($it.title)")
    [void]$lines.AppendLine("    outlet: $($it.source)")
    if ($it.published) { [void]$lines.AppendLine("    published: $($it.published)") }
    # The lede is the only place a real figure comes from. Without it the model can
    # honour the no-invention rule only by writing an empty brief.
    if ($it.summary) { [void]$lines.AppendLine("    lede: $($it.summary)") }
    # Corroboration tells the model which stories the country's press treated as the
    # day's real news, so the lead brief is not whichever item happened to be first.
    if ($it.corroboration -gt 1) {
      $names = @(@($it.alsoSources) | ForEach-Object { [string]$_.name } | Where-Object { $_ })
      $also = if ($names.Count) { " (also in $($names -join ', '))" } else { '' }
      [void]$lines.AppendLine("    corroborated by $($it.corroboration) outlets$also")
    }
    [void]$lines.AppendLine('')
  }

  $prompt = @"
$STYLE

Country: $name

Today's items. The number in brackets is the item index.

$($lines.ToString())
Write up to $n briefs from the items above, best story first. Items marked as
corroborated by several outlets are the day's significant news and should lead.

Return ONLY a JSON object, no prose before or after, in exactly this shape:

{"briefs":[{"item":0,"topic":"Business","headline":"...","body":"...","why":"..."}]}

- "item" is the index of the item the brief is based on. It must be one of the
  indexes listed above.
- "topic" must be exactly one of: $($VALID_TOPICS -join ', ').
- Do not include any URL. Sources are attached automatically from the item.
- Fewer good briefs beats more padded ones. Omit any item you cannot write cleanly.
"@

  $briefs = $null
  $lastErr = ''
  for ($attempt = 1; $attempt -le ($Retries + 1); $attempt++) {
    try {
      $raw = Invoke-OpenRouter $prompt
      $blk = Get-JsonBlock $raw
      if (-not $blk) { $lastErr = 'no JSON object in response'; continue }
      $parsed = $blk | ConvertFrom-Json
      $briefs = Get-BriefArray $parsed
      if (-not $briefs) { $lastErr = 'no brief array in response'; $briefs = $null; continue }
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

  if (-not $briefs) {
    Write-Host ("  {0}  {1,-30} SKIPPED: {2}" -f $code, $name, $lastErr) -ForegroundColor Red
    $skipped.Add("$code ($lastErr)")
    Start-Sleep -Milliseconds $DelayMs
    continue
  }

  # --- everything below treats model output as untrusted ---------------------
  $clean = New-Object System.Collections.Generic.List[object]
  $usedItems = @{}
  foreach ($b in $briefs) {
    if (-not $b.headline -or -not $b.body) { continue }

    # The index must exist. This is the anti-fabrication gate: no valid index means
    # no source, and a brief with no source is not published.
    $idx = -1
    if ($null -ne $b.item -and [int]::TryParse([string]$b.item, [ref]$idx)) { } else { continue }
    if ($idx -lt 0 -or $idx -ge $items.Count) { continue }
    if ($usedItems.ContainsKey($idx)) { continue }   # one brief per story
    $usedItems[$idx] = $true

    $src = $items[$idx]
    if (-not $src.url -or $src.url -notmatch '^https?://') { continue }

    $topic = [string]$b.topic
    if ($VALID_TOPICS -notcontains $topic) { $topic = 'News' }

    $headline = ([string]$b.headline).Trim()
    if ($headline.Length -gt 155) { $headline = $headline.Substring(0, 152).TrimEnd() + '...' }

    $why = ([string]$b.why).Trim()

    # Cite every outlet that carried the story, not just the one whose text was used.
    $srcList = New-Object System.Collections.Generic.List[object]
    $srcList.Add(@{ name = [string]$src.source; url = [string]$src.url })
    foreach ($o in @($src.alsoSources)) {
      if ($o -and ([string]$o.url) -match '^https?://') {
        $srcList.Add(@{ name = [string]$o.name; url = [string]$o.url })
      }
    }

    $clean.Add([ordered]@{
      headline = $headline
      body     = ([string]$b.body).Trim()
      why      = $why
      topic    = $topic
      sources  = $srcList.ToArray()
    })
  }

  # Say how many the model returned versus how many survived validation. Sudan filed
  # one brief while the model was returning five, and there was no way to see that the
  # loss was here rather than in the model without adding prints by hand.
  if ($clean.Count -lt @($briefs).Count) {
    Write-Host ("      {0}: model returned {1}, kept {2} (items available {3})" -f `
                $code, @($briefs).Count, $clean.Count, $items.Count) -ForegroundColor DarkGray
  }
  if ($clean.Count -lt $MinBriefs) {
    Write-Host ("  {0}  {1,-30} SKIPPED: only {2} usable brief(s)" -f $code, $name, $clean.Count) -ForegroundColor DarkYellow
    $skipped.Add("$code (only $($clean.Count) usable)")
    Start-Sleep -Milliseconds $DelayMs
    continue
  }

  # .ToArray(), not @($clean). Assigning @(<List[object]>) into an ordered dictionary
  # throws "Argument types do not match" in PS 5.1 - the binder mis-resolves the
  # Item[int] / Item[object] overload pair. An Object[] binds cleanly.
  $result[[string]$code] = $clean.ToArray()
  $stories += $clean.Count
  Write-Host ("  {0}  {1,-30} {2} briefs" -f $code, $name, $clean.Count) -ForegroundColor Green
  Start-Sleep -Milliseconds $DelayMs
}

if ($result.Count -eq 0) {
  Write-Host "[write] FAIL: no country produced usable briefs across $($codes.Count) attempted." -ForegroundColor Red
  Write-Host '        Check the model slug, the key, and the first SKIPPED reason above.' -ForegroundColor DarkGray
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
Write-Host "[write] $stories briefs across $($result.Count) countries -> $OutFile" -ForegroundColor Green
Write-Host "[write] model: $Model" -ForegroundColor DarkGray
if ($skipped.Count) {
  Write-Host "[write] $($skipped.Count) country(ies) skipped: $(($skipped | Select-Object -First 6) -join ', ')" -ForegroundColor DarkYellow
}
exit 0
