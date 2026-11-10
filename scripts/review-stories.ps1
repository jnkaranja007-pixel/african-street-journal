#Requires -Version 5.1
<#
.SYNOPSIS
  The weekly editor's review: a model reads a sample of published stories the way a
  reader would and grades each against the house rules.
.DESCRIPTION
  Every other check on the desk is mechanical: figures against the packet, word
  overlap, banned phrases. None of them can tell that "Messi wins second Golden Boot"
  ran as a Benin story with a why line about a Benin player's goal, or that "Matlala
  testifies at Madlanga Commission" never says who Matlala is. A reader notices at once.
  This asks a model to read like that reader, on a sample of the current edition, and
  writes a short report: average grades, and the stories that failed, with their
  problems in a sentence each.

  Grades (1-5): context (a reader elsewhere in Africa knows who and what is meant),
  headline (says what the story reports, about this country), why (adds something the
  story does not already say), clarity (plain and readable), country (the story is
  about or directly involves the country it is filed under).
.PARAMETER DryRun
  No model calls: every story gets grades from a fixed pattern, to test the report.
#>
param(
  [int]$Count = 20,
  [string]$Model = $(if ($env:ASJ_REVIEW_MODEL) { $env:ASJ_REVIEW_MODEL } else { 'anthropic/claude-haiku-5.5' }),
  [string]$StateFile = 'data/briefs-state.json',
  [string]$OutFile = 'story-review.md',
  [int]$Seed = 0,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$statePath = if ([IO.Path]::IsPathRooted($StateFile)) { $StateFile } else { Join-Path $root $StateFile }
$state = [IO.File]::ReadAllText($statePath, [Text.Encoding]::UTF8) | ConvertFrom-Json

$all = New-Object System.Collections.Generic.List[object]
foreach ($c in $state.byCountry.PSObject.Properties) {
  foreach ($s in @($c.Value)) {
    if ($s -and $s.headline -and @($s.paragraphs).Count) { $all.Add([pscustomobject]@{ code = [string]$c.Name; story = $s }) }
  }
}
if (-not $all.Count) { throw "no stories in $StateFile" }

# The same sample for the same week, so a rerun grades the same stories.
if (-not $Seed) {
  $nowUtc = (Get-Date).ToUniversalTime()
  $week = [Globalization.CultureInfo]::InvariantCulture.Calendar.GetWeekOfYear($nowUtc, [Globalization.CalendarWeekRule]::FirstFourDayWeek, [DayOfWeek]::Monday)
  $Seed = $nowUtc.Year * 100 + $week
}
$rng = New-Object System.Random $Seed
$pool = New-Object System.Collections.Generic.List[object]
foreach ($a in $all) { $pool.Add($a) }
$sample = New-Object System.Collections.Generic.List[object]
while ($sample.Count -lt $Count -and $pool.Count) {
  $pick = $rng.Next(0, $pool.Count)
  $sample.Add($pool[$pick])
  $pool.RemoveAt($pick)
}

$RUBRIC = @'
You are the standards editor of The African Street Journal, a news site read across
Africa and by the diaspora. Each story was written by the overnight desk from one
outlet's report. Read it as a reader in another African country would, and grade it.
Do not check facts against the world: judge only what is on the page.

Grade each from 1 (fails) to 5 (good):
- context: a reader outside the country can tell who each named person, party, body,
  inquiry or case is. 1 when the story leans on names it never explains.
- headline: the headline says what the story reports, and the story is about the
  country it is filed under. 1 when the headline is about someone or something else.
- why: the "Why it matters" line tells the reader something the story does not already
  say (who pays or gains, a figure, what happens next). 1 when it repeats the story,
  is generic ("affects the economy"), or is about a different event.
- clarity: plain, specific and readable. 1 for padding, jargon or press-release voice.
- country: the event happens in the country, or the country's people, government or
  companies are directly involved. 1 when it is foreign news with a thin local link.

"problems": up to three short sentences naming what a reader would trip on, most
serious first. Empty when there is nothing.

Return ONLY a JSON object:
{"context":<1-5>,"headline":<1-5>,"why":<1-5>,"clarity":<1-5>,"country":<1-5>,"problems":["..."]}
'@
$CRITERIA = @('context','headline','why','clarity','country')

function Get-Review($Entry) {
  $s = $Entry.story
  $country = [string]$Entry.code
  $outlets = (@($s.sources) | ForEach-Object { [string]$_.name } | Where-Object { $_ }) -join ', '
  $story = @(
    "Filed under: $country (ISO code)",
    "Outlet headline: $([string]$s.sourceTitle)",
    "Outlets: $outlets",
    '',
    "Headline: $([string]$s.headline)",
    "Dek: $([string]$s.dek)",
    '',
    (@($s.paragraphs) -join "`n`n"),
    '',
    "Why it matters: $([string]$s.why)"
  ) -join "`n"
  if ($DryRun) {
    $n = ([string]$s.headline).Length
    return [pscustomobject]@{ context = 1 + ($n % 5); headline = 5; why = 1 + (($n + 2) % 5); clarity = 4; country = 5; problems = @("dry run problem for $($s.articleId)") }
  }
  $body = [ordered]@{
    model = $Model
    messages = @(
      @{ role = 'system'; content = $RUBRIC },
      @{ role = 'user'; content = $story }
    )
    temperature = 0
    max_tokens = 700
    # Haiku 5.5 counts its thinking against max_tokens and returned nothing on the desk
    # (10 Nov 2026) until reasoning was turned off.
    reasoning = @{ enabled = $false }
    response_format = @{ type = 'json_object' }
  }
  $headers = @{ Authorization = "Bearer $env:OPENROUTER_API_KEY"; 'HTTP-Referer' = 'https://africanstreetjournal.com'; 'X-Title' = 'ASJ editor review' }
  $json = $body | ConvertTo-Json -Depth 6
  $resp = Invoke-RestMethod -Uri 'https://openrouter.ai/api/v1/chat/completions' -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 90
  $text = [string]$resp.choices[0].message.content
  $m = [regex]::Match($text, '\{[\s\S]*\}')
  if (-not $m.Success) { throw "no JSON in the answer: $($text.Substring(0, [Math]::Min(200, $text.Length)))" }
  return ($m.Value | ConvertFrom-Json)
}

if (-not $DryRun -and -not $env:OPENROUTER_API_KEY) { throw 'OPENROUTER_API_KEY is not set' }
$graded = New-Object System.Collections.Generic.List[object]
$failedCalls = 0
foreach ($entry in $sample) {
  try {
    $r = Get-Review $entry
    $grades = [ordered]@{}
    foreach ($c in $CRITERIA) {
      $v = 0
      if ([int]::TryParse([string]$r.$c, [ref]$v) -and $v -ge 1 -and $v -le 5) { $grades[$c] = $v } else { $grades[$c] = $null }
    }
    $graded.Add([pscustomobject]@{ entry = $entry; grades = $grades; problems = @($r.problems | ForEach-Object { [string]$_ } | Where-Object { $_ } | Select-Object -First 3) })
    Write-Host ("  {0} {1}: {2}" -f $entry.code, $entry.story.headline, (($CRITERIA | ForEach-Object { "$_ $($grades[$_])" }) -join ', '))
  } catch {
    $failedCalls++
    Write-Host "  $($entry.code) $($entry.story.headline): review failed - $($_.Exception.Message)" -ForegroundColor DarkYellow
  }
}
if (-not $graded.Count) { throw "every review call failed ($failedCalls)" }

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('## Weekly editor review')
$lines.Add('')
# pwsh's ConvertFrom-Json turns the stamp into a [datetime], and [string] of that is
# the runner's culture ("11/10/2026"), not ISO.
$gen = $state.generated
$editionDay = if ($gen -is [datetime]) { $gen.ToUniversalTime().ToString('yyyy-MM-dd') } else { ([string]$gen).Substring(0, [Math]::Min(10, ([string]$gen).Length)) }
$lines.Add("$($graded.Count) stories from the edition of $editionDay, read by $Model as a reader elsewhere in Africa would. 5 is good, 1 fails.")
$lines.Add('')
$lines.Add('| Grade | Average | Stories at 1-2 |')
$lines.Add('|---|---|---|')
foreach ($c in $CRITERIA) {
  $vals = @($graded | ForEach-Object { $_.grades[$c] } | Where-Object { $null -ne $_ })
  if (-not $vals.Count) { continue }
  $avg = ($vals | Measure-Object -Average).Average
  $low = @($vals | Where-Object { $_ -le 2 }).Count
  $lines.Add(('| {0} | {1:N1} | {2} of {3} |' -f $c, $avg, $low, $vals.Count))
}
$weak = @($graded | Where-Object { $g = $_.grades; @($CRITERIA | Where-Object { $null -ne $g[$_] -and $g[$_] -le 2 }).Count } |
  Sort-Object @{ Expression = { $g = $_.grades; ($CRITERIA | ForEach-Object { if ($null -ne $g[$_]) { $g[$_] } else { 5 } } | Measure-Object -Sum).Sum } })
$lines.Add('')
if ($weak.Count) {
  $lines.Add('### Stories that failed a grade')
  $lines.Add('')
  foreach ($w in ($weak | Select-Object -First 10)) {
    $s = $w.entry.story
    $g = $w.grades
    $low = ($CRITERIA | Where-Object { $null -ne $g[$_] -and $g[$_] -le 2 }) -join ', '
    $url = 'https://africanstreetjournal.com/?story=id%3A' + [Uri]::EscapeDataString([string]$s.articleId)
    $lines.Add("- **$($w.entry.code.ToUpperInvariant())** [$([string]$s.headline)]($url) - low on $low")
    foreach ($p in $w.problems) { $lines.Add("  - $p") }
  }
} else {
  $lines.Add('No story in the sample failed a grade.')
}
if ($failedCalls) { $lines.Add(''); $lines.Add("$failedCalls review call(s) failed and are not counted.") }
$report = $lines.ToArray() -join "`n"
$outPath = if ([IO.Path]::IsPathRooted($OutFile)) { $OutFile } else { Join-Path $root $OutFile }
[IO.File]::WriteAllText($outPath, $report + "`n", (New-Object Text.UTF8Encoding($false)))
Write-Host ''
Write-Host $report
