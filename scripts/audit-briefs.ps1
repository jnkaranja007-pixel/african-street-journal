#Requires -Version 5.1
<#
.SYNOPSIS
  Score every published entry for quality. Ranks the weakest country desks for review.
.DESCRIPTION
  A cheap model writes most of the paper; this decides where that shows. Two kinds
  of finding:

    CRITICAL - publishing this would be dishonest. Fabricated or dead source URLs,
               missing sources, empty bodies. Fails the run.
    WEAK     - thin but not dishonest. Filler "why", weak evidence for a high-risk
               claim, incomplete story package, or near-duplicate assignment.

  Fabricated citations are the danger with a weak writer: a plausible URL with
  nothing behind it. -CheckLinks fetches every source and is the only check that
  catches it.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/audit-briefs.ps1
  powershell -ExecutionPolicy Bypass -File scripts/audit-briefs.ps1 -CheckLinks
  powershell -ExecutionPolicy Bypass -File scripts/audit-briefs.ps1 -CheckLinks -Worst 8
.NOTES
  Exit 0 = no critical findings. Exit 1 = do not publish.
  -Worst N prints the N weakest country codes on the last line, for a rewrite pass.
#>
param(
  [switch]$CheckLinks,
  [int]$Worst = 8
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path $PSScriptRoot -Parent
$briefsPath = Join-Path $root 'data\briefs.js'
if (-not (Test-Path $briefsPath)) { Write-Host '[audit] data/briefs.js missing' -ForegroundColor Red; exit 1 }

$raw = [IO.File]::ReadAllText($briefsPath)
$m = [regex]::Match($raw, 'byCountry:\s*(\{[\s\S]*?\}),\s*markets:')
if (-not $m.Success) { Write-Host '[audit] cannot find byCountry block' -ForegroundColor Red; exit 1 }
try { $byCountry = $m.Groups[1].Value | ConvertFrom-Json }
catch { Write-Host "[audit] byCountry is not valid JSON: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }

# Filler openers a weak model reaches for when it has nothing specific to say.
$fillerWhy = @(
  'this could affect', 'this may affect', 'this is important', 'it is important',
  'this matters', 'could have implications', 'may have implications', 'is significant'
)

$critical = New-Object System.Collections.Generic.List[string]
$scores   = @{}
$seen     = @{}
$linkCache = @{}
$totalBriefs = 0
$fullStories = 0

foreach ($prop in $byCountry.PSObject.Properties) {
  $code = $prop.Name
  $list = @($prop.Value)
  $penalty = 0
  $notes = New-Object System.Collections.Generic.List[string]

  foreach ($b in $list) {
    $totalBriefs++
    $head = [string]$b.headline
    $body = [string]$b.body
    $srcs = @($b.sources | Where-Object { $_ -and $_.url })

    if (-not $head -or -not $body) { $critical.Add("$code : brief missing headline or body"); continue }
    if ($srcs.Count -eq 0) { $critical.Add("$code : '$($head.Substring(0,[Math]::Min(50,$head.Length)))' has no source"); continue }

    foreach ($s in $srcs) {
      if ($s.url -notmatch '^https?://') { $critical.Add("$code : non-http source $($s.url)"); continue }
      if ($CheckLinks) {
        if (-not $linkCache.ContainsKey($s.url)) {
          try {
            # -UseBasicParsing is required: without it PowerShell 5.1 hands the body to
            # the Internet Explorer engine, which prompts on first use and throws in a
            # non-interactive shell. Every URL then looks dead. HEAD is rejected by many
            # news sites, so use GET with a declared agent.
            $r = Invoke-WebRequest -Uri $s.url -Method Get -TimeoutSec 20 -MaximumRedirection 5 `
                   -UserAgent 'Mozilla/5.0 (compatible; ASJ-linkcheck/1.0)' -UseBasicParsing -ErrorAction Stop
            $linkCache[$s.url] = [int]$r.StatusCode
          } catch {
            $sc = 0
            if ($_.Exception.Response) { try { $sc = [int]$_.Exception.Response.StatusCode } catch { $sc = 0 } }
            $linkCache[$s.url] = $sc
          }
        }
        $status = $linkCache[$s.url]
        # Only 404/410 prove the page is not there - that is a fabricated citation.
        # 401/403 are live pages behind a paywall or bot wall. 0 means the request never
        # completed (DNS, TLS, timeout, egress block), which is indistinguishable from a
        # fake URL, so warn rather than fail - a gate that cries wolf gets ignored.
        if ($status -eq 404 -or $status -eq 410) {
          $critical.Add("$code : FABRICATED source ($status) $($s.url)")
        } elseif ($status -eq 0) {
          $penalty += 1
          $notes.Add('unreachable source (not proof of fabrication)')
        }
      }
    }

    # --- weak signals: thin, not dishonest ---
    if ($head.Length -gt 90) { $penalty += 1; $notes.Add('headline over 90 chars') }
    $isStoryPackage = $null -ne $b.PSObject.Properties['paragraphs']
    if ($isStoryPackage) {
      $fullStories++
      $paragraphs = @($b.paragraphs | Where-Object { ([string]$_).Trim() })
      $wordCount = ([regex]::Matches(($paragraphs -join ' '), "[\p{L}\p{N}]+(?:[''-][\p{L}\p{N}]+)*")).Count
      if (-not $b.dek) { $penalty += 2; $notes.Add('story missing dek') }
      if ($paragraphs.Count -lt 3 -or $paragraphs.Count -gt 6) { $penalty += 3; $notes.Add('story outside 3-6 paragraphs') }
      if ($wordCount -lt 110 -or $wordCount -gt 280) { $penalty += 3; $notes.Add("story outside 110-280 words ($wordCount)") }
      if (-not $b.articleId -or -not $b.published) { $penalty += 2; $notes.Add('story metadata incomplete') }
      if ($null -eq $b.PSObject.Properties['editorialScore']) { $penalty += 2; $notes.Add('assignment score missing') }
      elseif ([double]$b.editorialScore -lt 6.0) { $penalty += 3; $notes.Add('assignment score below 6.0') }
      if (-not @($b.rankReasons).Count) { $penalty += 1; $notes.Add('ranking rationale missing') }
    } else {
      $sentences = ($body -split '(?<=[.!?])\s+' | Where-Object { $_.Trim() }).Count
      if ($sentences -lt 2) { $penalty += 2; $notes.Add('legacy body under 2 sentences') }
    }
    if (-not $b.why) { $penalty += 2; $notes.Add('no why line') }
    else {
      $w = ([string]$b.why).ToLower()
      foreach ($f in $fillerWhy) { if ($w.StartsWith($f)) { $penalty += 2; $notes.Add('filler why line'); break } }
    }
    $riskText = ($head + ' ' + $body + ' ' + [string]$b.topic).ToLowerInvariant()
    $highRisk = $riskText -match 'politic|election|court|arrest|detain|corrupt|kill|death|fatal|war|conflict|military|health|disease|outbreak|vaccine'
    if ($srcs.Count -eq 1) {
      if ($highRisk) { $penalty += 3; $notes.Add('high-risk story has one source') }
      else { $penalty += 1; $notes.Add('single-source story') }
    }

    # near-duplicate across the whole paper
    $key = ($head.ToLower() -replace '[^a-z0-9 ]','' -split '\s+' | Where-Object { $_.Length -gt 4 } | Sort-Object | Select-Object -First 6) -join ' '
    if ($key -and $seen.ContainsKey($key) -and $seen[$key] -ne $code) {
      $penalty += 3; $notes.Add("near-duplicate of $($seen[$key])")
    } elseif ($key) { $seen[$key] = $code }
  }

  if ($list.Count -lt 5) { $penalty += (5 - $list.Count); $notes.Add("only $($list.Count) of 5 story slots") }
  $scores[$code] = [pscustomobject]@{
    Code = $code; Briefs = $list.Count; Penalty = $penalty
    Notes = (($notes | Select-Object -Unique) -join '; ')
  }
}

Write-Host ''
Write-Host "[audit] $totalBriefs entries ($fullStories full stories) across $($scores.Count) countries" -ForegroundColor Cyan
if (-not $CheckLinks) { Write-Host '[audit] source URLs NOT verified - rerun with -CheckLinks to catch fabricated citations' -ForegroundColor DarkYellow }

$ranked = $scores.Values | Sort-Object -Property Penalty -Descending
Write-Host ''
Write-Host 'Weakest countries (highest penalty first):' -ForegroundColor Yellow
foreach ($s in ($ranked | Select-Object -First $Worst)) {
  if ($s.Penalty -eq 0) { continue }
  Write-Host ("  {0}  penalty {1,-3} {2}" -f $s.Code, $s.Penalty, $s.Notes)
}

if ($critical.Count) {
  Write-Host ''
  Write-Host "[audit] $($critical.Count) CRITICAL finding(s) - do not publish:" -ForegroundColor Red
  foreach ($c in ($critical | Select-Object -First 20)) { Write-Host "  $c" -ForegroundColor Red }
  Write-Host ''
  Write-Host ('REWRITE: ' + ((($ranked | Select-Object -First $Worst).Code) -join ',')) -ForegroundColor Yellow
  exit 1
}

Write-Host ''
Write-Host '[audit] no critical findings' -ForegroundColor Green
Write-Host ('REWRITE: ' + ((($ranked | Where-Object { $_.Penalty -gt 0 } | Select-Object -First $Worst).Code) -join ',')) -ForegroundColor Yellow
exit 0
