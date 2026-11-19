#Requires -Version 5.1
<#
.SYNOPSIS
  Email the edition's lead stories to the paper's mailing list (Buttondown).
.DESCRIPTION
  One email a day: the strongest new story from each of up to -Max countries, best first
  by the desk's own selection score, the same choice post-social.ps1 makes for Telegram.
  Buttondown holds the list, the unsubscribe link and the sending; this only writes the
  email and asks Buttondown to send it.

  Switches on when BUTTONDOWN_API_KEY is set (Buttondown > Settings > API). Without it
  this logs one line and sends nothing. The sign-up form on the site appears separately,
  once data/newsletter-config.js names the Buttondown endpoint.

  Sent once a day: data/social-posted.json (the log post-social.ps1 keeps in the Actions
  cache) records "mail:<UTC day>". Never throws, always exits 0.
.PARAMETER DryRun
  Print the email; send nothing and record nothing.
#>
param(
  [int]$Max = 6,
  [int]$Hours = 24,
  [string]$BaseUrl = 'https://africanstreetjournal.com',
  [switch]$DryRun
)

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'story-shape.ps1')   # Get-IsoInstant, Get-StorySlug, Test-StoryIsRenderable
$inv = [Globalization.CultureInfo]::InvariantCulture

function ConvertTo-MdText([string]$s) { return ($s -replace '([\[\]\*_`])', '\$1').Trim() }

try {
  $key = [string]$env:BUTTONDOWN_API_KEY
  if (-not $DryRun -and -not $key) { Write-Host 'Newsletter: BUTTONDOWN_API_KEY not set; nothing sent.'; exit 0 }

  $day = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd', $inv)
  $mark = "mail:$day"
  $postedPath = Join-Path $root 'data\social-posted.json'
  $posted = New-Object System.Collections.Generic.List[string]
  if (Test-Path $postedPath) { try { foreach ($id in ([IO.File]::ReadAllText($postedPath, [Text.Encoding]::UTF8) | ConvertFrom-Json)) { $posted.Add([string]$id) } } catch {} }
  if (-not $DryRun -and $posted.Contains($mark)) { Write-Host "Newsletter: today's email already went out."; exit 0 }

  $info = @{}
  $appJs = [IO.File]::ReadAllText((Join-Path $root 'app.js'))
  foreach ($m in [regex]::Matches($appJs, "(?m)^\s{2}([a-z]{2}):\s*\{\s*name:\s*(['""])(.*?)\2,")) { $info[$m.Groups[1].Value] = $m.Groups[3].Value }

  $state = [IO.File]::ReadAllText((Join-Path $root 'data\briefs-state.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
  $cutoff = (Get-Date).ToUniversalTime().AddHours(-$Hours)
  $candidates = New-Object System.Collections.Generic.List[object]
  foreach ($prop in $state.byCountry.PSObject.Properties) {
    $code = $prop.Name
    foreach ($b in @($prop.Value | Where-Object { Test-StoryIsRenderable $_ })) {
      $pub = Get-IsoInstant $b.published
      if (-not $pub) { continue }
      try { $when = [DateTimeOffset]::Parse($pub, $inv).UtcDateTime } catch { continue }
      if ($when -lt $cutoff) { continue }
      $slug = Get-StorySlug $b.headline ([string]$b.articleId)
      if (-not (Test-Path (Join-Path (Join-Path (Join-Path $root $code) $slug) 'index.html'))) { continue }
      $score = 0.0
      if ($null -ne $b.selectionScore) { [void][double]::TryParse([string]$b.selectionScore, [Globalization.NumberStyles]::Float, $inv, [ref]$score) }
      $candidates.Add([pscustomobject]@{ code = $code; country = $(if ($info[$code]) { $info[$code] } else { $code.ToUpperInvariant() })
                                         headline = [string]$b.headline; dek = [string]$b.dek; url = "$BaseUrl/$code/$slug/"; score = $score; id = [string]$b.articleId })
    }
  }
  $picked = New-Object System.Collections.Generic.List[object]
  $seen = @{}
  foreach ($c in ($candidates | Sort-Object -Property @{ Expression = { $_.score }; Descending = $true }, @{ Expression = { $_.id } })) {
    if ($seen.ContainsKey($c.code)) { continue }
    $seen[$c.code] = $true; $picked.Add($c)
    if ($picked.Count -ge $Max) { break }
  }
  if (-not $picked.Count) { Write-Host 'Newsletter: no new stories in the last day; nothing sent.'; exit 0 }

  $dateLine = (Get-Date).ToUniversalTime().ToString('d MMMM yyyy', $inv)
  $subject = "$($picked[0].country): $($picked[0].headline)"
  if ($subject.Length -gt 110) { $subject = $subject.Substring(0, 107).TrimEnd() + '...' }
  $md = New-Object System.Text.StringBuilder
  [void]$md.AppendLine("The lead stories from The African Street Journal, $dateLine.")
  [void]$md.AppendLine('')
  foreach ($p in $picked) {
    [void]$md.AppendLine("**$(ConvertTo-MdText $p.country)**  ")
    [void]$md.AppendLine("[$(ConvertTo-MdText $p.headline)]($($p.url))  ")
    if ($p.dek) { [void]$md.AppendLine((ConvertTo-MdText $p.dek)) }
    [void]$md.AppendLine('')
  }
  [void]$md.AppendLine("All 55 countries, every source named and linked: [africanstreetjournal.com]($BaseUrl/)")
  $body = $md.ToString()

  if ($DryRun) { Write-Host "--- Newsletter (dry run) ---`nSubject: $subject`n`n$body"; exit 0 }

  # Buttondown creates API emails as drafts unless asked to send; the first send from a
  # new key also needs the X-Buttondown-Live-Dangerously confirmation header.
  $json = [ordered]@{ subject = $subject; body = $body; status = 'about_to_send' } | ConvertTo-Json -Compress
  $headers = @{ Authorization = "Token $key"; 'X-Buttondown-Live-Dangerously' = 'true' }
  $r = Invoke-RestMethod -Uri 'https://api.buttondown.com/v1/emails' -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 30
  Write-Host "Newsletter: sent ($($picked.Count) stories, id $($r.id))."
  $posted.Add($mark)
  [IO.File]::WriteAllText($postedPath, (ConvertTo-Json -InputObject @($posted | Select-Object -Last 2000) -Compress), (New-Object Text.UTF8Encoding($false)))
} catch {
  Write-Host "Newsletter: failed - $($_.Exception.Message)"
}
exit 0
