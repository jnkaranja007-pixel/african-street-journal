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
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/check-workflows.ps1
.NOTES
  Exit 0 = all blocks parse. Exit 1 = at least one block is malformed.
#>
param()

$ErrorActionPreference = 'Stop'
$workflowDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.github\workflows'))
if (-not (Test-Path $workflowDir)) { Write-Host "[workflows] no workflow directory"; exit 0 }

$failures = 0
$checked = 0

foreach ($file in Get-ChildItem $workflowDir -Filter '*.yml') {
  $lines = Get-Content $file.FullName
  $blocks = @(); $cur = $null; $indent = 0; $startLine = 0; $lineNo = 0

  foreach ($line in $lines) {
    $lineNo++
    if ($line -match '^\s*run:\s*\|\s*$') {
      if ($null -ne $cur) { $blocks += ,@{ body = ($cur -join "`n"); line = $startLine } }
      $cur = @(); $indent = 0; $startLine = $lineNo + 1
      continue
    }
    if ($null -ne $cur) {
      if ($line.Trim() -eq '') { $cur += ''; continue }
      $lineIndent = $line.Length - $line.TrimStart().Length
      if ($indent -eq 0) { $indent = $lineIndent }
      if ($lineIndent -ge $indent) { $cur += $line.Substring($indent) }
      else {
        $blocks += ,@{ body = ($cur -join "`n"); line = $startLine }
        $cur = $null
      }
    }
  }
  if ($null -ne $cur) { $blocks += ,@{ body = ($cur -join "`n"); line = $startLine } }

  foreach ($block in $blocks) {
    # Only check blocks that are actually PowerShell. A `run: |` under
    # `shell: bash` would false-positive here, so skip obvious shell syntax.
    if ($block.body -match '(?m)^\s*(#!/|export |if \[|fi$|done$)') { continue }
    $checked++
    $errors = $null
    [void][System.Management.Automation.PSParser]::Tokenize($block.body, [ref]$errors)
    if ($errors.Count) {
      $failures++
      Write-Host "[workflows] FAIL $($file.Name) (run: block at line $($block.line))" -ForegroundColor Red
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
Write-Host "[workflows] OK - $checked PowerShell block(s) parse cleanly" -ForegroundColor Green
exit 0
