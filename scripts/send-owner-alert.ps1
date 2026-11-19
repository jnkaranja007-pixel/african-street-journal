#Requires -Version 5.1
<#
.SYNOPSIS
  Send one private Telegram message to the paper's owner (desk failures, low credit).
.DESCRIPTION
  GitHub issues already record every alarm and email the owner, but email is easy to miss
  and a stalled desk costs a day per missed run. This also pings the owner's phone through
  the paper's bot (@ASJDeskBot), in a private chat, never on the public channel.

  Needs TELEGRAM_BOT_TOKEN (already set for the channel) and TELEGRAM_ALERT_CHAT_ID: the
  owner's numeric Telegram user id. The owner sends /start to the bot once (a bot cannot
  message someone who has not), then sets the secret:
    gh secret set TELEGRAM_ALERT_CHAT_ID
  Without either secret this does nothing. Never throws, always exits 0.
#>
param([Parameter(Mandatory = $true)][string]$Text)
try {
  $token = [string]$env:TELEGRAM_BOT_TOKEN; $chat = [string]$env:TELEGRAM_ALERT_CHAT_ID
  if (-not ($token -and $chat)) { Write-Host 'Owner alert: TELEGRAM_ALERT_CHAT_ID not set; skipped.'; exit 0 }
  $body = [ordered]@{ chat_id = $chat; text = $Text; link_preview_options = @{ is_disabled = $true } } | ConvertTo-Json -Compress
  $r = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/sendMessage" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 30
  Write-Host $(if ($r.ok) { 'Owner alert: sent.' } else { 'Owner alert: Telegram refused it.' })
} catch { Write-Host "Owner alert: failed - $($_.Exception.Message)" }
exit 0
