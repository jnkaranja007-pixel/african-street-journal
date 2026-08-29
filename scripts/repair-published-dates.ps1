#Requires -Version 5.1
<#
.SYNOPSIS
  Rewrite culture-rendered publication timestamps in data/briefs-state.json back to
  ISO-8601, then re-emit the published payload.
.DESCRIPTION
  The 28 August edition shipped 574 of 582 'published' stamps as "08/28/2026 17:36:34".
  The writer read feed-items.json with ConvertFrom-Json, which hands back a [datetime]
  under pwsh, and cast it straight to string - so the runner's culture ended up in the
  field the site sorts and displays by. new Date() cannot parse it, so every freshness
  check in the browser was reading an invalid date and quietly returning false.

  write-briefs.ps1 now normalises through Get-IsoInstant, which fixes tomorrow. This
  fixes today, in place, without a model run: the strings are unambiguous US format and
  parse cleanly with the invariant culture.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/repair-published-dates.ps1
  powershell -ExecutionPolicy Bypass -File scripts/repair-published-dates.ps1 -WhatIf
#>
param([switch]$WhatIf)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'story-shape.ps1')

$statePath = Join-Path $root 'data\briefs-state.json'
if (-not (Test-Path $statePath)) { Write-Host '[repair] no data/briefs-state.json' -ForegroundColor Red; exit 1 }

$text = [IO.File]::ReadAllText($statePath, [Text.Encoding]::UTF8)

# Operate on the JSON text, not a parsed object graph. Round-tripping through
# ConvertFrom-Json/ConvertTo-Json in this shell is what introduced the problem; doing it
# again to fix it would risk reformatting every other value in the file as a side effect.
$pattern = '"published":\s*"(\d{1,2}/\d{1,2}/\d{4}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?)?)"'
$fixed = 0
$unparseable = New-Object System.Collections.Generic.List[string]

$out = [regex]::Replace($text, $pattern, {
  param($m)
  $iso = Get-IsoInstant $m.Groups[1].Value
  if (-not $iso) { $unparseable.Add($m.Groups[1].Value); return $m.Value }
  $script:fixed++
  '"published": "' + $iso + '"'
})

Write-Host "[repair] $fixed timestamps rewritten to ISO-8601"
if ($unparseable.Count) {
  Write-Host "[repair] $($unparseable.Count) could not be parsed and were left alone:" -ForegroundColor Yellow
  $unparseable | Select-Object -Unique -First 5 | ForEach-Object { Write-Host "  $_" }
}
if ($fixed -eq 0) { Write-Host '[repair] nothing to do'; exit 0 }

if ($WhatIf) { Write-Host '[repair] -WhatIf: no files written'; exit 0 }

[IO.File]::WriteAllText($statePath, $out, (New-Object Text.UTF8Encoding($false)))
Write-Host '[repair] data/briefs-state.json updated - re-emitting the payload'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'rebuild-briefs-payload.ps1')
exit $LASTEXITCODE
