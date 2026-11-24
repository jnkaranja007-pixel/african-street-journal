#Requires -Version 5.1
<#
.SYNOPSIS
  Translate the edition's stories into another language (French, Portuguese, Swahili,
  Arabic...) with Google AI Studio's free tier.
.DESCRIPTION
  The English stories are short and already checked by the desk, so this translates
  them; it writes nothing new. Each language is described by data/i18n/<lang>.json: its
  translation brief ("desk"), and optionally "scope" (only these countries' stories) and
  "script" (a character class most of the text must be written in, e.g. Arabic letters).
  A story is translated once: data/briefs-<lang>.json keeps each translation with a
  fingerprint of the English it came from, and only new or changed stories are sent.

  The model is Gemini (GEMINI_API_KEY, the free tier, about 15 requests a minute). Stories
  go six to a request. A translation is kept only if it passes these checks:
    - every number in the English (figures, dates, years, percentages) is in the
      translation, allowing for other separators (1,234.5 becomes 1 234,5) and Eastern
      Arabic digits;
    - it has the same number of paragraphs and no field is empty;
    - it is not still English (a few common English words give it away), and, where the
      language has its own script, most letters are in that script.
  A story that fails is left for the next run, never published half-translated.

  Off the critical path on purpose: the free tier sheds load first ("high demand", HTTP
  503, seen on 19 Nov 2026), so this retries with backoff, stops at -Minutes, keeps what
  it finished, and always exits 0. The English edition never waits for it.
.PARAMETER Max
  Translate at most this many stories this run (newest and highest ranked first).
.PARAMETER Lang
  The language code; data/i18n/<Lang>.json must exist. Default fr.
.PARAMETER OutFile
  Where translations are kept. Default data/briefs-<Lang>.json.
#>
param(
  [string]$Lang = 'fr',
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
if (-not $OutFile) { $OutFile = Join-Path $root "data\briefs-$Lang.json" }
if (-not $Model) { $Model = if ($env:ASJ_TRANSLATE_MODEL) { $env:ASJ_TRANSLATE_MODEL.Trim() } else { 'gemini-3.5-flash-lite' } }
$url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
$tag = "[$Lang]"

# The language's brief lives with its words in data/i18n (UTF-8; this script stays ASCII).
$i18nPath = Join-Path $root "data\i18n\$Lang.json"
if (-not (Test-Path $i18nPath)) { Write-Host "$tag no $i18nPath; nothing to do."; exit 0 }
$i18n = [IO.File]::ReadAllText($i18nPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
if (-not $i18n.desk) { Write-Host "$tag $i18nPath has no translation brief (desk); nothing to do."; exit 0 }
$LANGNAME = [string]$i18n.englishName
$SCRIPT_CLASS = [string]$i18n.script
$SYSTEM = ([string]$i18n.desk) + "`n`n" + 'Answer with JSON only: {"stories":[{"id":"...","headline":"...","dek":"...","why":"...","paragraphs":["...", "..."]}]}'
# A language for one country's readers translates only that country's stories.
if (-not $Only -and $i18n.scope) { $Only = (@($i18n.scope) -join ',') }

function Get-Fingerprint($b) {
  $text = ([string]$b.headline) + "`n" + ([string]$b.dek) + "`n" + ([string]$b.why) + "`n" + ((@($b.paragraphs) | ForEach-Object { [string]$_ }) -join "`n")
  $sha = [Security.Cryptography.SHA1]::Create()
  return (($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)) | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 16)
}

# Digit runs with their separators removed: "1,234.5" and "1 234,5" are both 12345.
# Eastern Arabic digits count as their Western twins.
function Get-Numbers([string]$s) {
  $set = New-Object System.Collections.Generic.HashSet[string]
  foreach ($m in [regex]::Matches($s, '\d+(?:[.,\u00a0\u202f \u066b\u066c]\d+)*')) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $m.Value.ToCharArray()) {
      $n = [int]$ch
      if ($n -ge 0x30 -and $n -le 0x39) { [void]$sb.Append($ch) }
      elseif ($n -ge 0x660 -and $n -le 0x669) { [void]$sb.Append([char]($n - 0x630)) }
      elseif ($n -ge 0x6F0 -and $n -le 0x6F9) { [void]$sb.Append([char]($n - 0x6C0)) }
    }
    if ($sb.Length -ge 1) { [void]$set.Add($sb.ToString()) }
  }
  return ,$set
}

function Test-NumberCrossed([string]$n, $other) {
  if ($other.Contains($n) -or $other.Contains($n + '000') -or $other.Contains($n + '000000')) { return $true }
  if ($n.Length -gt 3 -and $n.EndsWith('000') -and $other.Contains($n.Substring(0, $n.Length - 3))) { return $true }
  if ($n.Length -gt 6 -and $n.EndsWith('000000') -and $other.Contains($n.Substring(0, $n.Length - 6))) { return $true }
  if ($n -eq '00') { return $true }
  if ($n.Length -le 2 -and [int]$n -le 12) { return $true }
  return $false
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
  $enNums = Get-Numbers $enText
  $frNums = Get-Numbers $frText
  # Every number must cross over, and no new one may appear. Allowed, all seen in the
  # first runs (20 Nov 2026), when the number check rejected 91 of 724 stories:
  #  - three more zeros: "Sh5 trillion" can only be "5 000 milliards" in French;
  #  - three or six fewer: "50,000" is "50 alf" (50 thousand) in Arabic, and
  #    "250,000,000" can be "milioni 250" in Swahili;
  #  - "11:00" is "11 h" in French, so a lone 00 may go;
  #  - counts up to 12 may be written as words, either way ("three" / "3").
  $missing = @($enNums | Where-Object { -not (Test-NumberCrossed $_ $frNums) })
  if ($missing.Count) { return "numbers missing: $($missing -join ', ')" }
  $added = @($frNums | Where-Object { -not (Test-NumberCrossed $_ $enNums) })
  if ($added.Count) { return "numbers not in the English: $($added -join ', ')" }
  $english = [regex]::Matches(" $frText ", '(?i)\s(the|and|with|which|said|after|from|would|will)\s').Count
  if ($english -ge 3) { return 'still reads as English' }
  if ($SCRIPT_CLASS) {
    # Names and abbreviations stay in Latin letters; the rest must be in the script.
    $own = [regex]::Matches($frText, $SCRIPT_CLASS).Count
    $latin = [regex]::Matches($frText, '[A-Za-z]').Count
    if ($own -lt 2 * $latin) { return "not mostly in its own script ($own vs $latin Latin)" }
  }
  return $null
}

function Invoke-Translate($items, [string]$key) {
  $payload = @($items | ForEach-Object { [ordered]@{ id = $_.id; headline = $_.b.headline; dek = $_.b.dek; why = $_.b.why; paragraphs = @($_.b.paragraphs) } })
  $user = "Translate these " + $payload.Count + " briefs into $LANGNAME.`n" + (ConvertTo-Json -InputObject @{ stories = $payload } -Depth 6 -Compress)
  # A JSON schema, as the desk sends Gemini (json_object alone is refused with HTTP 400).
  $item = [ordered]@{
    type = 'object'; additionalProperties = $false
    properties = [ordered]@{ id = @{ type = 'string' }; headline = @{ type = 'string' }; dek = @{ type = 'string' }; why = @{ type = 'string' }; paragraphs = @{ type = 'array'; items = @{ type = 'string' } } }
    required = @('id', 'headline', 'dek', 'why', 'paragraphs')
  }
  $body = [ordered]@{
    model = $Model; temperature = 0.2
    response_format = [ordered]@{ type = 'json_schema'; json_schema = [ordered]@{ name = "asj_$($Lang)_desk"; strict = $true
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
        Write-Host "$tag HTTP $code on try $try; waiting ${wait}s"
        Start-Sleep -Seconds $wait; $wait = [Math]::Min(120, $wait * 2); continue
      }
      $detail = [string]$_.ErrorDetails.Message
      if ($detail.Length -gt 400) { $detail = $detail.Substring(0, 400) }
      Write-Host "$tag request failed: HTTP $code $($_.Exception.Message) $detail"
      return $null
    }
  }
  return $null
}

try {
  $key = ([string]$env:GEMINI_API_KEY).Trim()
  if (-not $key -and -not $DryRun) { Write-Host "$tag GEMINI_API_KEY not set; no translations."; exit 0 }

  $state = [IO.File]::ReadAllText($StateFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $store = [ordered]@{}
  if (Test-Path $OutFile) {
    try { $old = [IO.File]::ReadAllText($OutFile, [Text.Encoding]::UTF8) | ConvertFrom-Json; foreach ($p in $old.stories.PSObject.Properties) { $store[$p.Name] = $p.Value } } catch { Write-Host "$tag could not read $OutFile; starting fresh" }
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
  Write-Host "$tag $($todo.Count) to translate, $($store.Count) already done, model $Model"
  if ($DryRun) { exit 0 }

  $clock = [Diagnostics.Stopwatch]::StartNew()
  $ok = 0; $rejected = 0; $calls = 0; $failsInRow = 0
  for ($i = 0; $i -lt $todo.Count; $i += $Batch) {
    if ($clock.Elapsed.TotalMinutes -ge $Minutes) { Write-Host "$tag time budget reached; the rest waits for the next run"; break }
    $chunk = @($todo[$i..([Math]::Min($todo.Count, $i + $Batch) - 1)])
    $calls++
    $got = Invoke-Translate $chunk $key
    if (-not $got) {
      # Each failed request has already waited out five retries (about four minutes). Two in a
      # row means the model is down or overloaded (24 Nov 2026: HTTP 503 all day), so stop
      # here and leave the time to the other languages instead of burning the whole budget.
      $failsInRow++
      if ($failsInRow -ge 2) { Write-Host "$tag two requests in a row failed; stopping this language for this run"; break }
      continue
    }
    $failsInRow = 0
    foreach ($c in $chunk) {
      $fr = @($got | Where-Object { [string]$_.id -eq $c.id }) | Select-Object -First 1
      if (-not $fr) { $rejected++; Write-Host "$tag $($c.code)/$($c.id): missing from the answer"; continue }
      $why = Test-Translation $c.b $fr
      if ($why) { $rejected++; Write-Host "$tag $($c.code)/$($c.id): rejected ($why)"; continue }
      $store[$c.id] = [ordered]@{ fp = $c.fp; code = $c.code; headline = ([string]$fr.headline).Trim(); dek = ([string]$fr.dek).Trim(); why = ([string]$fr.why).Trim()
                                   paragraphs = @($fr.paragraphs | Where-Object { [string]$_ } | ForEach-Object { ([string]$_).Trim() }); model = $Model
                                   translated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ', $inv) }
      $ok++
    }
    Start-Sleep -Milliseconds 4500   # free tier: about 15 requests a minute
  }
  $out = [ordered]@{ generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ', $inv); model = $Model; stories = $store }
  [IO.File]::WriteAllText($OutFile, ($out | ConvertTo-Json -Depth 8 -Compress), (New-Object Text.UTF8Encoding($false)))
  Write-Host ("$tag translated {0}, rejected {1}, {2} requests, {3:N1} min; {4} stories in $LANGNAME" -f $ok, $rejected, $calls, $clock.Elapsed.TotalMinutes, $store.Count)
} catch {
  Write-Host "$tag failed - $($_.Exception.Message)"
}
exit 0
