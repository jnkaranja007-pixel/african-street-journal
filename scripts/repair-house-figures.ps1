#Requires -Version 5.1
<#
.SYNOPSIS
  Rewrites Portuguese and Spanish "mil" figures in stories already published.
.DESCRIPTION
  On 18 Nov 2026 "Angola has 370 mil people living with HIV" and "DP World plans to
  raise Mozambique cargo capacity to 650 mil TEU" ran as written: "mil" is a thousand,
  and an English reader took both for millions. The writer now converts such figures
  before publishing (ConvertTo-HouseFigures, story-shape.ps1); this fixes the stories
  already out, in data/briefs-state.json, data/briefs.js, data/briefs-full.js and the
  archive files. It touches only stories filed under a Portuguese- or Spanish-speaking
  country, and only text that holds "<number> mil". No model call.

  Like repair-story-case.ps1, it rewrites the affected string values in place rather
  than re-serialising the files, so the diff is the corrected lines and nothing else.
  The static pages pick the corrected copy up on the desk's next build.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'story-shape.ps1')
$statePath = Join-Path $root 'data\briefs-state.json'
$state = [IO.File]::ReadAllText($statePath, [Text.Encoding]::UTF8) | ConvertFrom-Json

$map = @{}
function Add-MilFixes($Node, [string]$Code) {
  if ($null -eq $Node) { return }
  if ($Node -is [string]) {
    if ($Node -match '\d\s+mil\b') {
      $fixed = ConvertTo-HouseFigures $Node $Code
      # Only the mil rule: other house-style changes wait for the stories' next writing.
      if ($fixed -cne $Node) {
        $milOnly = $Node
        foreach ($m in [regex]::Matches($Node, '(?<![\d.,])\d{1,3}(?:[.,]\d{1,3})?\s+mil(?:\s+milh\p{L}{1,3})?\b')) {
          $milOnly = $milOnly.Replace($m.Value, (ConvertTo-HouseFigures $m.Value $Code))
        }
        if ($milOnly -cne $Node) { $map[$Node] = $milOnly }
      }
    }
    return
  }
  if ($Node -is [System.Collections.IEnumerable] -and -not ($Node -is [System.Collections.IDictionary])) {
    foreach ($v in $Node) { Add-MilFixes $v $Code }
    return
  }
  if ($Node -is [pscustomobject]) {
    foreach ($p in $Node.PSObject.Properties) { Add-MilFixes $p.Value $Code }
  }
}
foreach ($p in $state.byCountry.PSObject.Properties) {
  if ($script:MIL_THOUSAND_CODES -notcontains [string]$p.Name) { continue }
  foreach ($story in @($p.Value)) { Add-MilFixes $story ([string]$p.Name) }
}
if (-not $map.Count) { Write-Host '[mil] nothing to repair'; exit 0 }
foreach ($k in $map.Keys) { Write-Host ("  {0}`n    -> {1}" -f $k, $map[$k]) }

$files = @($statePath, (Join-Path $root 'data\briefs.js'), (Join-Path $root 'data\briefs-full.js')) +
         @(Get-ChildItem (Join-Path $root 'data\archive') -Filter '*.js' | ForEach-Object { $_.FullName })
$pattern = '"((?:[^"\\]|\\.)*)"'
$script:hits = 0
$evaluator = [System.Text.RegularExpressions.MatchEvaluator]{
  param($m)
  $value = [regex]::Unescape($m.Groups[1].Value)
  if (-not $map.ContainsKey($value)) { return $m.Value }
  $script:hits++
  # JSON escapes: a story body holds its paragraph breaks as \n.
  return '"' + $map[$value].Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n').Replace("`t", '\t') + '"'
}
foreach ($file in $files) {
  if (-not (Test-Path $file)) { continue }
  $text = [IO.File]::ReadAllText($file, [Text.Encoding]::UTF8)
  if ($text -notmatch '\d\s+mil\b') { continue }
  $script:hits = 0
  $out = [regex]::Replace($text, $pattern, $evaluator)
  if ($script:hits) {
    [IO.File]::WriteAllText($file, $out, (New-Object Text.UTF8Encoding($false)))
    Write-Host ("[mil] {0}: {1} value(s)" -f (Split-Path $file -Leaf), $script:hits)
  }
}
Write-Host "[mil] repaired $($map.Count) line(s)"
exit 0
