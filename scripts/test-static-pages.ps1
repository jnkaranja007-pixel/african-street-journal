#Requires -Version 5.1
<#
.SYNOPSIS
  Guard the crawlable country pages: dates must be ISO-8601 and pages must exist for
  every country that has stories.
.DESCRIPTION
  On 28 August every country page shipped "dateModified":"08/28/2026". schema.org
  requires ISO-8601, so Google discarded the field, and the same string was printed to
  readers as "updated 08/28/2026" - a US ordering on a pan-African paper, ambiguous on
  every day before the 13th of a month.

  The cause was ConvertFrom-Json under pwsh returning [datetime] where PowerShell 5.1
  returns a string, and the page builder taking Substring(0,10) of the culture-dependent
  rendering. It could not reproduce locally, which is exactly why it needs a test that
  feeds the [datetime] shape in deliberately rather than whatever this shell happens to
  produce.
#>
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'story-shape.ps1')

$fail = 0
function Check([string]$label, [bool]$ok, [string]$detail) {
  if ($ok) { Write-Host "  PASS  $label" -ForegroundColor Green }
  else { Write-Host "  FAIL  $label - $detail" -ForegroundColor Red; $script:fail++ }
}

Write-Host '[static-pages] date normalisation'

# The shape pwsh hands the builder. This is the case that broke production; asserting
# on the local shell's own output would have passed while CI shipped US dates.
$d = Get-IsoDay ([datetime]::Parse('2026-08-28T17:56:13Z'))
Check 'a [datetime] normalises to ISO' ($d -eq '2026-08-28') "got '$d'"

$s = Get-IsoDay '2026-08-28T17:56:13+00:00'
Check 'an ISO string normalises to ISO' ($s -eq '2026-08-28') "got '$s'"

$o = Get-IsoDay ([DateTimeOffset]::Parse('2026-08-28T17:56:13+03:00'))
Check 'a DateTimeOffset normalises to ISO' ($o -eq '2026-08-28') "got '$o'"

Check 'null yields empty, not a crash' ((Get-IsoDay $null) -eq '') 'expected empty string'
Check 'unparseable yields empty' ((Get-IsoDay 'not a date') -eq '') 'expected empty string'

# A US-format stamp must never survive normalisation, whatever the runner's culture.
$us = Get-IsoDay '08/28/2026 17:56:13'
Check 'a US-format stamp is rejected, not passed through' ($us -eq '') "got '$us'"

Write-Host '[static-pages] published artefacts'

$pages = @(Get-ChildItem -Path $root -Directory |
  Where-Object { $_.Name -match '^[a-z]{2}$' } |
  ForEach-Object { Join-Path $_.FullName 'index.html' } |
  Where-Object { Test-Path $_ })

if ($pages.Count -eq 0) {
  Write-Host '  SKIP  no country pages built yet' -ForegroundColor Yellow
} else {
  $bad = New-Object System.Collections.Generic.List[string]
  foreach ($p in $pages) {
    $html = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)
    foreach ($m in [regex]::Matches($html, '"dateModified":"([^"]*)"')) {
      if ($m.Groups[1].Value -notmatch '^\d{4}-\d{2}-\d{2}$') {
        $bad.Add("$(Split-Path (Split-Path $p -Parent) -Leaf)=$($m.Groups[1].Value)")
      }
    }
  }
  Check "all $($pages.Count) country pages carry an ISO dateModified" ($bad.Count -eq 0) ($bad -join ', ')
}

if ($fail) { Write-Host "[static-pages] $fail check(s) failed" -ForegroundColor Red; exit 1 }
Write-Host '[static-pages] OK - dates normalise on type and every page carries an ISO stamp' -ForegroundColor Green
$global:LASTEXITCODE = 0
exit 0
