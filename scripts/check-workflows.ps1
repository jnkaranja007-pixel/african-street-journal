#Requires -Version 5.1
<#
.SYNOPSIS
  Compiles every PowerShell block embedded in .github/workflows/*.yml.
.DESCRIPTION
  A syntax error inside a workflow's `run:` block is invisible until the step
  actually executes - which, for the nightly desk, is after ~28 minutes of paid
  API work. That is exactly how run 30972262339 was lost: a ParserError in the
  commit step discarded 55 countries of finished briefs.

  This parses each block up front so the failure lands here instead.

  It decides which blocks are PowerShell the way GitHub Actions does, rather than by
  guessing from the text. A step's explicit `shell:` wins; with none, the default is
  the job runner's - pwsh on windows-*, bash everywhere else. The old version guessed
  from a handful of bash tells (#!, export, if [, fi, done) and so flagged
  `mkdir -p /tmp/pw && cd /tmp/pw` on an ubuntu runner as a PowerShell error, which
  trains everyone to ignore this check - the one outcome a check cannot survive.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/check-workflows.ps1
.NOTES
  Exit 0 = all PowerShell blocks parse. Exit 1 = at least one is malformed.
#>
param()

$ErrorActionPreference = 'Stop'
$workflowDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.github\workflows'))
if (-not (Test-Path $workflowDir)) { Write-Host "[workflows] no workflow directory"; exit 0 }

function Get-Indent([string]$Line) { return $Line.Length - $Line.TrimStart().Length }

function Test-IsPowerShellShell([string]$Shell) {
  return ($Shell -match '^(pwsh|powershell)\b')
}

$failures = 0
$checked = 0
$skipped = 0

foreach ($file in Get-ChildItem $workflowDir -Filter '*.yml') {
  $lines = @(Get-Content $file.FullName)

  # Job-level default shell, from runs-on. A workflow can set defaults.run.shell too;
  # honour that when present.
  $jobRunner = ''
  $workflowDefaultShell = ''
  $jobDefaultShell = ''

  # Collect steps as line ranges. A step starts at "- " at the indentation of the
  # first step under a "steps:" key.
  $steps = New-Object System.Collections.Generic.List[object]
  $inSteps = $false; $stepIndent = -1; $cur = $null

  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $trim = $line.Trim()

    if ($trim -match '^runs-on:\s*(.+)$') { $jobRunner = $Matches[1].Trim().Trim('"',"'") ; $jobDefaultShell = '' }
    if ($trim -match '^shell:\s*(\S+)' -and -not $inSteps) {
      # A shell: outside a step is a defaults.run.shell.
      if ((Get-Indent $line) -le 4) { $workflowDefaultShell = $Matches[1] } else { $jobDefaultShell = $Matches[1] }
    }

    if ($trim -eq 'steps:') {
      if ($null -ne $cur) { $steps.Add($cur); $cur = $null }
      $inSteps = $true; $stepIndent = -1
      continue
    }
    if (-not $inSteps) { continue }

    if ($trim -eq '') { if ($null -ne $cur) { $cur.lines.Add('') }; continue }
    $ind = Get-Indent $line

    if ($trim.StartsWith('- ') -and ($stepIndent -lt 0 -or $ind -eq $stepIndent)) {
      if ($stepIndent -lt 0) { $stepIndent = $ind }
      if ($null -ne $cur) { $steps.Add($cur) }
      $cur = @{ start = $i + 1; lines = (New-Object System.Collections.Generic.List[string]); runner = $jobRunner;
                jobShell = $jobDefaultShell; wfShell = $workflowDefaultShell }
      $cur.lines.Add($line)
      continue
    }
    if ($stepIndent -ge 0 -and $ind -lt $stepIndent) {
      # Dedented out of the steps list: a new job or top-level key.
      if ($null -ne $cur) { $steps.Add($cur); $cur = $null }
      $inSteps = $false; $stepIndent = -1
      continue
    }
    if ($null -ne $cur) { $cur.lines.Add($line) }
  }
  if ($null -ne $cur) { $steps.Add($cur) }

  foreach ($step in $steps) {
    $body = @($step.lines)
    # The step's own shell:
    $shell = ''
    foreach ($l in $body) { if ($l.Trim() -match '^-?\s*shell:\s*(\S+)') { $shell = $Matches[1]; break } }
    if (-not $shell) { $shell = $step.jobShell }
    if (-not $shell) { $shell = $step.wfShell }
    if (-not $shell) { $shell = if ($step.runner -match 'windows') { 'pwsh' } else { 'bash' } }

    # Extract the run block (block scalar or single line).
    $runText = $null; $runLine = 0
    for ($k = 0; $k -lt $body.Count; $k++) {
      $t = $body[$k].Trim()
      if ($t -match '^-?\s*run:\s*[|>][-+]?\s*$') {
        $baseInd = -1; $acc = New-Object System.Collections.Generic.List[string]
        for ($m = $k + 1; $m -lt $body.Count; $m++) {
          $bl = $body[$m]
          if ($bl.Trim() -eq '') { $acc.Add(''); continue }
          $bi = Get-Indent $bl
          if ($baseInd -lt 0) { $baseInd = $bi }
          if ($bi -lt $baseInd) { break }
          $acc.Add($bl.Substring($baseInd))
        }
        $runText = ($acc -join "`n"); $runLine = $step.start + $k + 1
        break
      }
      if ($t -match '^-?\s*run:\s*(.+)$') { $runText = $Matches[1]; $runLine = $step.start + $k; break }
    }
    if ($null -eq $runText) { continue }

    if (-not (Test-IsPowerShellShell $shell)) { $skipped++; continue }

    $checked++
    $errors = $null
    [void][System.Management.Automation.PSParser]::Tokenize($runText, [ref]$errors)
    if ($errors.Count) {
      $failures++
      Write-Host "[workflows] FAIL $($file.Name) (run: block at line $runLine, shell $shell)" -ForegroundColor Red
      foreach ($e in ($errors | Select-Object -First 3)) {
        Write-Host "    line $($e.Token.StartLine): $($e.Message)" -ForegroundColor Red
      }
    }
  }
}

if ($failures) {
  Write-Host "[workflows] $failures malformed block(s) - fix before pushing" -ForegroundColor Red
  exit 1
}
Write-Host "[workflows] OK - $checked PowerShell block(s) parse cleanly ($skipped bash/other skipped)" -ForegroundColor Green
exit 0
