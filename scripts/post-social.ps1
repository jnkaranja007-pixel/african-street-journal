#Requires -Version 5.1
<#
.SYNOPSIS
  Post the edition's newest stories to the paper's Telegram channel and Bluesky account.
.DESCRIPTION
  The paper published 230 stories a day and told nobody: a reader had to already know
  the address. This sends each edition's strongest new stories - one per country, best
  first by the desk's own selection score - to wherever readers already are.

  Telegram: one message per edition, the stories as a short list of links.
  Bluesky: one post per story (the first -BlueskyMax), each with a link card carrying
  the story's share image.

  Each service is optional and switches on when its secrets exist:
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID       (e.g. @africanstreetjournal)
    BLUESKY_HANDLE, BLUESKY_APP_PASSWORD       (an app password, not the account's)
  With neither set, nothing is sent.

  A story is posted once. data/social-posted.json lists the article ids already sent
  (the workflow keeps it in the Actions cache, not in the repository); a headline
  rewritten in a later edition keeps its id, so it is not sent again. Only stories
  published in the last -Hours count, so a lost cache cannot replay the archive.

  Best-effort, like the IndexNow ping: it never throws and always exits 0, because a
  social post must never fail the desk.

  Links are posted bare, without utm_ tags: Cloudflare Web Analytics does not record
  query strings, so the tags would measure nothing, and every reader who forwards a
  tagged link spreads it. Telegram's own post views, Bluesky's engagement counts and
  the Referer column in Cloudflare (bsky.app, t.me) are the measures that exist.
.PARAMETER DryRun
  Print what would be sent; send nothing and record nothing.
#>
param(
  [int]$Max = 5,
  [int]$BlueskyMax = 3,
  [int]$Hours = 24,
  [string]$BaseUrl = 'https://africanstreetjournal.com',
  [switch]$DryRun
)

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'story-shape.ps1')   # Get-IsoInstant, Get-StorySlug, Test-StoryIsRenderable

function Send-Json([string]$Uri, $Body, [hashtable]$Headers = @{}) {
  $json = $Body | ConvertTo-Json -Depth 10 -Compress
  return Invoke-RestMethod -Uri $Uri -Method Post -Headers $Headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 30
}
function HtmlEsc([string]$s) { return $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;') }
function Limit([string]$s, [int]$n) { if ($s.Length -le $n) { return $s }; return $s.Substring(0, $n - 3).TrimEnd() + '...' }

try {
  $tgToken = [string]$env:TELEGRAM_BOT_TOKEN
  $tgChat = [string]$env:TELEGRAM_CHAT_ID
  $bsHandle = [string]$env:BLUESKY_HANDLE
  $bsPass = [string]$env:BLUESKY_APP_PASSWORD
  $useTelegram = [bool]($tgToken -and $tgChat)
  $useBluesky = [bool]($bsHandle -and $bsPass)
  if (-not $DryRun -and -not $useTelegram -and -not $useBluesky) {
    Write-Host 'Social: no Telegram or Bluesky secrets set; nothing to post.'
    exit 0
  }

  # Country names, as the page builder reads them.
  $info = @{}
  $appJs = [IO.File]::ReadAllText((Join-Path $root 'app.js'))
  foreach ($m in [regex]::Matches($appJs, "(?m)^\s{2}([a-z]{2}):\s*\{\s*name:\s*(['""])(.*?)\2,")) { $info[$m.Groups[1].Value] = $m.Groups[3].Value }

  $postedPath = Join-Path $root 'data\social-posted.json'
  $posted = New-Object System.Collections.Generic.List[string]
  if (Test-Path $postedPath) {
    try { foreach ($id in ([IO.File]::ReadAllText($postedPath, [Text.Encoding]::UTF8) | ConvertFrom-Json)) { $posted.Add([string]$id) } } catch {}
  }

  $state = [IO.File]::ReadAllText((Join-Path $root 'data\briefs-state.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
  $cutoff = (Get-Date).ToUniversalTime().AddHours(-$Hours)
  $candidates = New-Object System.Collections.Generic.List[object]
  foreach ($prop in $state.byCountry.PSObject.Properties) {
    $code = $prop.Name
    foreach ($b in @($prop.Value | Where-Object { Test-StoryIsRenderable $_ })) {
      $id = [string]$b.articleId
      if (-not $id -or $posted.Contains($id)) { continue }
      $pub = Get-IsoInstant $b.published
      if (-not $pub) { continue }
      try { $when = [DateTimeOffset]::Parse($pub, [Globalization.CultureInfo]::InvariantCulture).UtcDateTime } catch { continue }
      if ($when -lt $cutoff) { continue }
      $slug = Get-StorySlug $b.headline $id
      $dir = Join-Path (Join-Path $root $code) $slug
      if (-not (Test-Path (Join-Path $dir 'index.html'))) { continue }
      $score = 0.0
      if ($null -ne $b.selectionScore) { [void][double]::TryParse([string]$b.selectionScore, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$score) }
      $image = Join-Path $dir 'share.jpg'
      if (-not (Test-Path $image)) { $image = Join-Path $root "og\$code.jpg" }
      $candidates.Add([pscustomobject]@{ id = $id; code = $code; country = $(if ($info[$code]) { $info[$code] } else { $code.ToUpperInvariant() })
                                         headline = [string]$b.headline; dek = [string]$b.dek; url = "$BaseUrl/$code/$slug/"; image = $image; score = $score })
    }
  }
  # Best first, one per country.
  $picked = New-Object System.Collections.Generic.List[object]
  $seenCountry = @{}
  foreach ($c in ($candidates | Sort-Object -Property @{ Expression = { $_.score }; Descending = $true }, @{ Expression = { $_.id } })) {
    if ($seenCountry.ContainsKey($c.code)) { continue }
    $seenCountry[$c.code] = $true
    $picked.Add($c)
    if ($picked.Count -ge $Max) { break }
  }
  if (-not $picked.Count) { Write-Host 'Social: no new stories to post.'; exit 0 }
  Write-Host "Social: $($picked.Count) stories - $(($picked | ForEach-Object { "$($_.code): $($_.headline)" }) -join ' | ')"

  $sent = New-Object System.Collections.Generic.List[string]

  # --- Telegram ---------------------------------------------------------------
  $tgLines = New-Object System.Collections.Generic.List[string]
  $tgLines.Add('<b>The African Street Journal</b>')
  $tgLines.Add('')
  foreach ($p in $picked) { $tgLines.Add("<b>$(HtmlEsc $p.country)</b>: <a href=""$($p.url)"">$(HtmlEsc $p.headline)</a>") }
  $tgLines.Add('')
  $tgLines.Add("Every country, every source: <a href=""$BaseUrl/"">africanstreetjournal.com</a>")
  $tgText = $tgLines -join "`n"
  if ($DryRun) {
    Write-Host "--- Telegram (dry run) ---`n$tgText"
  } elseif ($useTelegram) {
    # Telegram fetches the preview the moment the message is sent, and the pages were
    # pushed seconds ago: wait (up to five minutes) for Pages to serve the first one.
    for ($i = 0; $i -lt 15; $i++) {
      try { $live = (Invoke-WebRequest -Uri $picked[0].url -Method Head -UseBasicParsing -TimeoutSec 20).StatusCode } catch { $live = 0 }
      if ($live -eq 200) { break }
      Start-Sleep -Seconds 20
    }
    try {
      $r = Send-Json "https://api.telegram.org/bot$tgToken/sendMessage" ([ordered]@{
        chat_id = $tgChat; text = $tgText; parse_mode = 'HTML'
        link_preview_options = [ordered]@{ url = $picked[0].url; prefer_large_media = $true }
      })
      if ($r.ok) { Write-Host 'Social: Telegram sent.'; foreach ($p in $picked) { $sent.Add($p.id) } } else { Write-Host 'Social: Telegram refused the message.' }
    } catch { Write-Host "Social: Telegram failed - $($_.Exception.Message)" }
  }

  # --- Bluesky ----------------------------------------------------------------
  $bsPicks = @($picked | Select-Object -First $BlueskyMax)
  if ($DryRun) {
    foreach ($p in $bsPicks) { Write-Host "--- Bluesky (dry run) ---`n$(Limit "$($p.country): $($p.headline)" 300)`n[card] $($p.url) | image $([IO.Path]::GetFileName($p.image))" }
  } elseif ($useBluesky) {
    try {
      $session = Send-Json 'https://bsky.social/xrpc/com.atproto.server.createSession' ([ordered]@{ identifier = $bsHandle; password = $bsPass })
      $auth = @{ Authorization = "Bearer $($session.accessJwt)" }
      foreach ($p in $bsPicks) {
        try {
          $thumb = $null
          if (Test-Path $p.image) {
            $up = Invoke-RestMethod -Uri 'https://bsky.social/xrpc/com.atproto.repo.uploadBlob' -Method Post -Headers $auth -ContentType 'image/jpeg' -InFile $p.image -TimeoutSec 30
            $thumb = $up.blob
          }
          $external = [ordered]@{ uri = $p.url; title = $p.headline; description = (Limit $p.dek 280) }
          if ($thumb) { $external['thumb'] = $thumb }
          $record = [ordered]@{
            '$type' = 'app.bsky.feed.post'
            text = (Limit $(if ($p.headline -match [regex]::Escape($p.country)) { $p.headline } else { "$($p.country): $($p.headline)" }) 300)
            createdAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ', [Globalization.CultureInfo]::InvariantCulture)
            langs = @('en')
            embed = [ordered]@{ '$type' = 'app.bsky.embed.external'; external = $external }
          }
          [void](Send-Json 'https://bsky.social/xrpc/com.atproto.repo.createRecord' ([ordered]@{ repo = $session.did; collection = 'app.bsky.feed.post'; record = $record }) $auth)
          Write-Host "Social: Bluesky posted $($p.code)."
          if (-not $sent.Contains($p.id)) { $sent.Add($p.id) }
        } catch { Write-Host "Social: Bluesky post for $($p.code) failed - $($_.Exception.Message)" }
      }
    } catch { Write-Host "Social: Bluesky sign-in failed - $($_.Exception.Message)" }
  }

  # Record what went out. Stories picked but sent nowhere stay eligible for the next run.
  if (-not $DryRun -and $sent.Count) {
    foreach ($id in $sent) { if (-not $posted.Contains($id)) { $posted.Add($id) } }
    $keep = @($posted | Select-Object -Last 2000)
    [IO.File]::WriteAllText($postedPath, (ConvertTo-Json -InputObject $keep -Compress), (New-Object Text.UTF8Encoding($false)))
  }
} catch {
  Write-Host "Social: failed - $($_.Exception.Message)"
}
exit 0
