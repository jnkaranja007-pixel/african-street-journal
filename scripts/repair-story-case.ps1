#Requires -Version 5.1
<#
.SYNOPSIS
  Re-cases published headlines and deks that the model returned in lower case.
.DESCRIPTION
  The writer now repairs these before publishing (Repair-StoryCase in story-shape.ps1);
  this fixes the stories already out, in data/briefs-state.json, data/briefs.js,
  data/briefs-full.js and the archive files. It changes only lines that start in lower
  case, using the story's own paragraphs and the place-name list. No model call.

  Only those string values are rewritten, in place: re-serialising the files from
  Windows PowerShell reformatted every line (32,000 lines of diff for 25 headlines),
  because pwsh, which writes them on the desk, formats JSON differently. Story URLs do
  not change (slugs are lower case already); the static story pages pick the new
  headlines up on the desk's next build.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'story-shape.ps1')
$statePath = Join-Path $root 'data\briefs-state.json'
$state = [IO.File]::ReadAllText($statePath, [Text.Encoding]::UTF8) | ConvertFrom-Json
$map = @{}
foreach ($p in $state.byCountry.PSObject.Properties) {
  foreach ($story in @($p.Value)) {
    $before = @{ headline = [string]$story.headline; dek = [string]$story.dek }
    if (Repair-StoryCase $story '' $root) {
      foreach ($f in 'headline', 'dek') {
        if ($before[$f] -cne [string]$story.$f) { $map[$before[$f]] = [string]$story.$f; Write-Host ("  {0} {1}: {2}" -f $p.Name, $f, $story.$f) }
      }
    }
  }
}
if (-not $map.Count) { Write-Host '[case] nothing to repair'; exit 0 }

$files = @($statePath, (Join-Path $root 'data\briefs.js'), (Join-Path $root 'data\briefs-full.js')) +
         @(Get-ChildItem (Join-Path $root 'data\archive') -Filter '*.js' | ForEach-Object { $_.FullName })
$pattern = '("(?:headline|dek)"\s*:\s*")((?:[^"\\]|\\.)*)(")'
$script:hits = 0
$evaluator = [System.Text.RegularExpressions.MatchEvaluator]{
  param($m)
  $value = [regex]::Unescape($m.Groups[2].Value)
  if (-not $map.ContainsKey($value)) { return $m.Value }
  $script:hits++
  return $m.Groups[1].Value + $map[$value].Replace('\', '\\').Replace('"', '\"') + $m.Groups[3].Value
}
foreach ($file in $files) {
  if (-not (Test-Path $file)) { continue }
  $text = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8)
  $script:hits = 0
  $out = [regex]::Replace($text, $pattern, $evaluator)
  if ($script:hits) {
    [IO.File]::WriteAllText($file, $out, (New-Object Text.UTF8Encoding($false)))
    Write-Host ("[case] {0}: {1} value(s)" -f (Split-Path $file -Leaf), $script:hits)
  }
}
Write-Host "[case] repaired $($map.Count) line(s)"
