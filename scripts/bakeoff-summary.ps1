#Requires -Version 5.1
<#
.SYNOPSIS
  Builds the model bake-off table from the per-model folders the bake-off workflow saves.
.DESCRIPTION
  Each folder (bake-<model>) holds run.json, metrics.json (the desk's own counts), and
  review.md when an editor model graded a sample. One row per model: how many stories
  survived the fact checks, how many first drafts broke the house style, how many still
  broke it after the model's own rewrite, what the published copy still carries, the
  editor grades, and the cost.

    ./scripts/bakeoff-summary.ps1 -Dir bakes -OutFile bakeoff.md
#>
param(
  [string]$Dir = 'bakes',
  [string]$Judge = '',
  [string]$OutFile = 'bakeoff.md'
)
$ErrorActionPreference = 'Stop'

function Read-JsonFile([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  return ([IO.File]::ReadAllText((Resolve-Path $Path), [Text.Encoding]::UTF8) | ConvertFrom-Json)
}
function Format-Share($Part, $Whole) {
  if (-not $Whole) { return '-' }
  return ('{0:0}%' -f (100.0 * [double]$Part / [double]$Whole))
}

$CRITERIA = @('context','headline','why','clarity','country','standards')
$rows = New-Object System.Collections.Generic.List[object]
foreach ($folder in @(Get-ChildItem -Path $Dir -Directory -ErrorAction SilentlyContinue | Sort-Object Name)) {
  $run = Read-JsonFile (Join-Path $folder.FullName 'run.json')
  $m = Read-JsonFile (Join-Path $folder.FullName 'metrics.json')
  $model = if ($run -and $run.model) { [string]$run.model } else { $folder.Name -replace '^bake-', '' }
  $grades = [ordered]@{}
  $reviewPath = Join-Path $folder.FullName 'review.md'
  if (Test-Path $reviewPath) {
    foreach ($line in [IO.File]::ReadAllLines($reviewPath, [Text.Encoding]::UTF8)) {
      $g = [regex]::Match($line, '^\|\s*([a-z]+)\s*\|\s*([0-9]+(?:\.[0-9]+)?)\s*\|')
      if ($g.Success -and $CRITERIA -contains $g.Groups[1].Value) {
        $grades[$g.Groups[1].Value] = [double]::Parse($g.Groups[2].Value, [Globalization.CultureInfo]::InvariantCulture)
      }
    }
  }
  $rows.Add([pscustomobject]@{ Model = $model; Run = $run; Metrics = $m; Grades = $grades })
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('## Model bake-off')
$lines.Add('')
if (-not $rows.Count) {
  $lines.Add('No model produced a folder: every write job failed before saving anything.')
} else {
  $first = @($rows | Where-Object { $_.Run } | Select-Object -First 1)
  if ($first.Count) {
    $lines.Add("Same evidence for every model (desk run $($first[0].Run.evidenceRun)), countries $($first[0].Run.countries). Each model rewrote its own drafts; no other model helped.")
    $lines.Add('')
  }
  $lines.Add('| Model | Stories | Drafts sent back | Still flawed | Copying source | Why line weak | Standards problems | Cost | Cost per story | Minutes |')
  $lines.Add('|---|---|---|---|---|---|---|---|---|---|')
  foreach ($r in $rows) {
    $m = $r.Metrics
    if (-not $m) {
      $why = if ($r.Run) { "exit $($r.Run.exitCode), no metrics" } else { 'no output' }
      $lines.Add("| $($r.Model) | failed ($why) | | | | | | | | |")
      continue
    }
    $n = [int]$m.storiesWritten
    $weakWhy = [int]$m.keptWhyRestating + [int]$m.keptWhyGuessing + [int]$m.keptWhyGeneric
    $std = if ($m.editionMix -and $null -ne $m.editionMix.standardsShare) { '{0:0}%' -f (100.0 * [double]$m.editionMix.standardsShare) } else { '-' }
    $cost = [double]$m.reportedCostUsd
    $per = if ($n) { '$' + ('{0:0.0000}' -f ($cost / $n)) } else { '-' }
    $mins = if ($r.Run) { '{0:0.0}' -f ([double]$r.Run.seconds / 60.0) } else { '-' }
    $lines.Add(('| {0} | {1} | {2} ({3}) | {4} ({5}) | {6} | {7} | {8} | ${9:0.0000} | {10} | {11} |' -f `
      $r.Model, $n, [int]$m.styleRewrites, (Format-Share $m.styleRewrites $n), [int]$m.styleKeptWithNotes, (Format-Share $m.styleKeptWithNotes $n),
      [int]$m.keptStillCopying, $weakWhy, $std, $cost, $per, $mins))
  }
  $graded = @($rows | Where-Object { $_.Grades.Count })
  if ($graded.Count) {
    $lines.Add('')
    $judgeName = if ($Judge) { $Judge } else { 'the editor model' }
    $lines.Add("Editor grades from $judgeName on the same draw of up to 30 stories per model, 1 to 5. A judge can favour its own writing, so read these beside the desk's counts above.")
    $lines.Add('')
    $lines.Add('| Model | ' + ($CRITERIA -join ' | ') + ' | Mean |')
    $lines.Add('|---|' + (($CRITERIA | ForEach-Object { '---' }) -join '|') + '|---|')
    foreach ($r in $graded) {
      $vals = @($CRITERIA | ForEach-Object { if ($r.Grades.Contains($_)) { $r.Grades[$_] } else { $null } })
      $present = @($vals | Where-Object { $null -ne $_ })
      $mean = if ($present.Count) { ($present | Measure-Object -Average).Average } else { 0 }
      $cells = @($vals | ForEach-Object { if ($null -ne $_) { '{0:0.00}' -f $_ } else { '-' } })
      $lines.Add('| ' + $r.Model + ' | ' + ($cells -join ' | ') + (' | {0:0.00} |' -f $mean))
    }
  }
  $lines.Add('')
  $lines.Add('Drafts sent back: first drafts that broke the house style. Still flawed: stories published with a style fault after the rewrite. Lower is better for both, and for cost.')
}
$report = ($lines.ToArray() -join "`n")
[IO.File]::WriteAllText($OutFile, $report + "`n", (New-Object Text.UTF8Encoding($false)))
Write-Host $report
exit 0
