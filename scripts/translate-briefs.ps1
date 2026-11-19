#Requires -Version 5.1
<#
.SYNOPSIS
  Translate the edition's stories into French with Google AI Studio's free tier.
.DESCRIPTION
  About 21 African countries use French officially, and in the Maghreb it is the main
  language of business news. The English stories are short and already checked by the
  desk, so this translates them; it writes nothing new. A story is translated once:
  data/briefs-fr.json keeps each translation with a fingerprint of the English it came
  from, and only new or changed stories are sent.

  The model is Gemini (GEMINI_API_KEY, the free tier, about 15 requests a minute). Stories
  go six to a request. A translation is kept only if it passes these checks:
    - every number in the English (figures, dates, years, percentages) is in the French,
      allowing for French separators (1,234.5 becomes 1 234,5);
    - it has the same number of paragraphs and no field is empty;
    - it is not still English (a few common English words give it away).
  A story that fails is left for the next run, never published half-translated.

  Off the critical path on purpose: the free tier sheds load first ("high demand", HTTP
  503, seen on 19 Nov 2026), so this retries with backoff, stops at -Minutes, keeps what
  it finished, and always exits 0. The English edition never waits for it.
.PARAMETER Max
  Translate at most this many stories this run (newest and highest ranked first).
.PARAMETER OutFile
  Where translations are kept. Default data/briefs-fr.json.
#>
param(
  [int]$Max = 400,
  [int]$Batch = 6,
  [int]$Minutes = 40,
  [string]$Model = '',
  [string]$StateFile = '',
  [string]$OutFile = '',
  [string]$Only = '',
  [switch]$DryRun
)

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$inv = [Globalization.CultureInfo]::InvariantCulture
if (-not $StateFile) { $StateFile = Join-Path $root 'data\briefs-state.json' }
if (-not $OutFile) { $OutFile = Join-Path $root 'data\briefs-fr.json' }
if (-not $Model) { $Model = if ($env:ASJ_TRANSLATE_MODEL) { $env:ASJ_TRANSLATE_MODEL.Trim() } else { 'gemini-3.5-flash-lite' } }
$url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

$SYSTEM = @'
You are the French-language desk of The African Street Journal, translating its English news briefs for French-speaking readers in Africa. Write the French a senior editor at Jeune Afrique or Le Monde Afrique would publish: clear, neutral, idiomatic, never word-for-word.

Rules:
- Translate; add nothing, drop nothing, change no fact.
- Keep every number exactly, with the same digits, in French form: 1,234.5 becomes 1 234,5; 12.5% becomes 12,5 %; "$250 million" becomes "250 millions de dollars"; "November 18" becomes "18 novembre". Keep currency names as the English gives them (FCFA, naira, Sh, rand). Keep the digits of large amounts as given: "$5 trillion" becomes "5 000 milliards de dollars" only if you must; prefer the English digits.
- People, parties, companies and places keep their own names. Use the usual French names for countries and cities (Ivory Coast becomes Cote d'Ivoire with a circumflex on the o, South Africa becomes Afrique du Sud, Cape Town becomes Le Cap).
- Expand an abbreviation the English explains, the way French press does (FMI, BCEAO, UA, CEDEAO for IMF, BCEAO, AU, ECOWAS).
- Headlines in sentence case, as French papers write them, no final full stop.
- Same number of paragraphs, in the same order.

Answer with JSON only: {"stories":[{"id":"...","headline":"...","dek":"...","why":"...","paragraphs":["...", "..."]}]}
'@

function Get-Fingerprint($b) {
  $text = ([string]$b.headline) + "`n" + ([string]$b.dek) + "`n" + ([string]$b.why) + "`n" + ((@($b.paragraphs) | ForEach-Object { [string]$_ }) -join "`n")
  $sha = [Security.Cryptography.SHA1]::Create()
  return (($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)) | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 16)
}

# Digit runs with their separators removed: "1,234.5" and "1 234,5" are both 12345.
function Get-Numbers([string]$s) {
  $set = New-Object System.Collections.Generic.HashSet[string]
  foreach ($m in [regex]::Matches($s, '\d+(?:[.,\u00a0\u202f ]\d+)*')) {
    $d = $m.Value -replace '[^\d]', ''
    if ($d.Length -ge 1) { [void]$set.Add($d) }
  }
  return ,$set
}

function Test-Translation($en, $fr) {
  foreach ($f in 'headline', 'dek', 'why') {
    if ([string]$en.$f -and -not ([string]$fr.$f).Trim()) { return "empty $f" }
  }
  $enParas = @($en.paragraphs | Where-Object { [string]$_ })
  $frParas = @($fr.paragraphs | Where-Object { [string]$_ })
  if ($enParas.Count -ne $frParas.Count) { return "paragraphs $($enParas.Count) -> $($frParas.Count)" }
  $enText = ([string]$en.headline) + ' ' + ([string]$en.dek) + ' ' + ([string]$en.why) + ' ' + ($enParas -join ' ')
  $frText = ([string]$fr.headline) + ' ' + ([string]$fr.dek) + ' ' + ([string]$fr.why) + ' ' + ($frParas -join ' ')
  $frNums = Get-Numbers $frText
  # "Sh5 trillion" can only become "5 000 milliards" in French, so a number with three
  # more zeros counts.
  $missing = @((Get-Numbers $enText) | Where-Object { -not $frNums.Contains($_) -and -not $frNums.Contains($_ + '000') })
  if ($missing.Count) { return "numbers missing: $($missing -join ', ')" }
  $english = [regex]::Matches(" $frText ", '(?i)\s(the|and|with|which|said|after|from|would|will)\s').Count
  if ($english -ge 3) { return 'still reads as English' }
  return $null
}

function Invoke-Translate($items, [string]$key) {
  $payload = @($items | ForEach-Object { [ordered]@{ id = $_.id; headline = $_.b.headline; dek = $_.b.dek; why = $_.b.why; paragraphs = @($_.b.paragraphs) } })
  $user = "Translate these " + $payload.Count + " briefs into French.`n" + (ConvertTo-Json -InputObject @{ stories = $payload } -Depth 6 -Compress)
  # A JSON schema, as the desk sends Gemini (json_object alone is refused with HTTP 400).
  $item = [ordered]@{
    type = 'object'; additionalProperties = $false
    properties = [ordered]@{ id = @{ type = 'string' }; headline = @{ type = 'string' }; dek = @{ type = 'string' }; why = @{ type = 'string' }; paragraphs = @{ type = 'array'; items = @{ type = 'string' } } }
    required = @('id', 'headline', 'dek', 'why', 'paragraphs')
  }
  $body = [ordered]@{
    model = $Model; temperature = 0.2
    response_format = [ordered]@{ type = 'json_schema'; json_schema = [ordered]@{ name = 'asj_french_desk'; strict = $true
      schema = [ordered]@{ type = 'object'; additionalProperties = $false; properties = @{ stories = @{ type = 'array'; items = $item } }; required = @('stories') } } }
    messages = @(@{ role = 'system'; content = $SYSTEM }, @{ role = 'user'; content = $user })
  } | ConvertTo-Json -Depth 12 -Compress
  $headers = @{ Authorization = "Bearer $key"; 'x-goog-api-key' = $key }
  $wait = 8
  for ($try = 1; $try -le 5; $try++) {
    try {
      # Invoke-WebRequest and an explicit UTF-8 decode: Windows PowerShell's
      # Invoke-RestMethod guesses the charset and mangles accents.
      $resp = Invoke-WebRequest -Uri $url -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120 -UseBasicParsing
      $raw = if ($resp.RawContentStream) { [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray()) } else { [string]$resp.Content }
      $r = $raw | ConvertFrom-Json
      $text = [string]$r.choices[0].message.content
      $text = $text -replace '^\s*```(?:json)?\s*', '' -replace '\s*```\s*$', ''
      return ($text | ConvertFrom-Json).stories
    } catch {
      $code = 0; try { $code = [int]$_.Exception.Response.StatusCode } catch {}
      if ($code -in 429, 500, 502, 503, 504 -or $code -eq 0) {
        Write-Host "[fr] HTTP $code on try $try; waiting ${wait}s"
        Start-Sleep -Seconds $wait; $wait = [Math]::Min(120, $wait * 2); continue
      }
      $detail = [string]$_.ErrorDetails.Message
      if ($detail.Length -gt 400) { $detail = $detail.Substring(0, 400) }
      Write-Host "[fr] request failed: HTTP $code $($_.Exception.Message) $detail"
      return $null
    }
  }
  return $null
}

try {
  $key = ([string]$env:GEMINI_API_KEY).Trim()
  if (-not $key -and -not $DryRun) { Write-Host '[fr] GEMINI_API_KEY not set; no translations.'; exit 0 }

  $state = [IO.File]::ReadAllText($StateFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $store = [ordered]@{}
  if (Test-Path $OutFile) {
    try { $old = [IO.File]::ReadAllText($OutFile, [Text.Encoding]::UTF8) | ConvertFrom-Json; foreach ($p in $old.stories.PSObject.Properties) { $store[$p.Name] = $p.Value } } catch { Write-Host "[fr] could not read $OutFile; starting fresh" }
  }

  # What is live now, best first; anything no longer in the edition is dropped from the store.
  $live = @{}; $todo = New-Object System.Collections.Generic.List[object]
  $onlyCodes = @($Only -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  foreach ($prop in $state.byCountry.PSObject.Properties) {
    if ($onlyCodes.Count -and $onlyCodes -notcontains $prop.Name) { continue }
    foreach ($b in @($prop.Value)) {
      $id = [string]$b.articleId
      if (-not $id -or -not $b.headline -or -not @($b.paragraphs).Count) { continue }
      $fp = Get-Fingerprint $b
      $live[$id] = $true
      if ($store.Contains($id) -and [string]$store[$id].fp -eq $fp) { continue }
      $score = 0.0; [void][double]::TryParse([string]$b.selectionScore, [Globalization.NumberStyles]::Float, $inv, [ref]$score)
      $todo.Add([pscustomobject]@{ id = $id; code = $prop.Name; fp = $fp; b = $b; score = $score; pub = [string]$b.published })
    }
  }
  foreach ($k in @($store.Keys)) { if (-not $live.ContainsKey($k)) { $store.Remove($k) } }
  $todo = @($todo | Sort-Object -Property @{ Expression = { $_.pub }; Descending = $true }, @{ Expression = { $_.score }; Descending = $true } | Select-Object -First $Max)
  Write-Host "[fr] $($todo.Count) to translate, $($store.Count) already done, model $Model"
  if ($DryRun) { exit 0 }

  $clock = [Diagnostics.Stopwatch]::StartNew()
  $ok = 0; $rejected = 0; $calls = 0
  for ($i = 0; $i -lt $todo.Count; $i += $Batch) {
    if ($clock.Elapsed.TotalMinutes -ge $Minutes) { Write-Host "[fr] time budget reached; the rest waits for the next run"; break }
    $chunk = @($todo[$i..([Math]::Min($todo.Count, $i + $Batch) - 1)])
    $calls++
    $got = Invoke-Translate $chunk $key
    if (-not $got) { continue }
    foreach ($c in $chunk) {
      $fr = @($got | Where-Object { [string]$_.id -eq $c.id }) | Select-Object -First 1
      if (-not $fr) { $rejected++; Write-Host "[fr] $($c.code)/$($c.id): missing from the answer"; continue }
      $why = Test-Translation $c.b $fr
      if ($why) { $rejected++; Write-Host "[fr] $($c.code)/$($c.id): rejected ($why)"; continue }
      $store[$c.id] = [ordered]@{ fp = $c.fp; code = $c.code; headline = ([string]$fr.headline).Trim(); dek = ([string]$fr.dek).Trim(); why = ([string]$fr.why).Trim()
                                   paragraphs = @($fr.paragraphs | Where-Object { [string]$_ } | ForEach-Object { ([string]$_).Trim() }); model = $Model
                                   translated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ', $inv) }
      $ok++
    }
    Start-Sleep -Milliseconds 4500   # free tier: about 15 requests a minute
  }
  $out = [ordered]@{ generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ', $inv); model = $Model; stories = $store }
  [IO.File]::WriteAllText($OutFile, ($out | ConvertTo-Json -Depth 8 -Compress), (New-Object Text.UTF8Encoding($false)))
  Write-Host ("[fr] translated {0}, rejected {1}, {2} requests, {3:N1} min; {4} stories in French" -f $ok, $rejected, $calls, $clock.Elapsed.TotalMinutes, $store.Count)
} catch {
  Write-Host "[fr] failed - $($_.Exception.Message)"
}
exit 0
