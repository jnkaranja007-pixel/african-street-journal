#Requires -Version 5.1
<#
.SYNOPSIS
  Post a short Telegram note when an African currency moves sharply against the dollar.
.DESCRIPTION
  Reads data/fx-history.json (one reference rate a day, saved by update-fx-history.ps1)
  and compares the newest day with the one before it. A currency that moved by at least
  -Threshold percent is named in one message to the paper's Telegram channel:

    Naira weakened 2.4% against the US dollar: $1 bought 1,385 NGN on 19 Nov, up from
    1,352 on 18 Nov.

  Only free-floating currencies are watched. The CFA francs, the Comorian and Cape Verdean
  escudo/franc, Sao Tome's dobra and the rand-linked loti, Namibian dollar and lilangeni
  are pegged, so their moves are the euro's or the rand's and would repeat the same news
  five times; Djibouti's and Eritrea's are pegged to the dollar.

  Numbers come only from the history file. Two points more than four days apart are not
  compared (the move would not be a day's), and a move of more than -Sanity percent is
  logged and not posted: in a day that is far likelier a bad reading than news, and a
  wrong figure on the channel cannot be taken back.

  Each day's alert is sent once: data/social-posted.json (the same log post-social.ps1
  keeps in the Actions cache) records "fx:<day>". Never throws, always exits 0.
#>
param(
  [double]$Threshold = 2.0,
  [double]$Sanity = 30.0,
  [string]$HistoryFile = '',   # tests: read this file instead of data\fx-history.json
  [switch]$DryRun
)

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$inv = [Globalization.CultureInfo]::InvariantCulture

# Free-floating currencies, with the name a reader uses and the country for the link.
$watch = [ordered]@{
  AOA = @('Angolan kwanza', 'ao'); BIF = @('Burundian franc', 'bi'); BWP = @('Botswana pula', 'bw')
  CDF = @('Congolese franc', 'cd'); DZD = @('Algerian dinar', 'dz'); EGP = @('Egyptian pound', 'eg')
  ETB = @('Ethiopian birr', 'et'); GHS = @('Ghanaian cedi', 'gh'); GMD = @('Gambian dalasi', 'gm')
  GNF = @('Guinean franc', 'gn'); KES = @('Kenyan shilling', 'ke'); LRD = @('Liberian dollar', 'lr')
  LYD = @('Libyan dinar', 'ly'); MAD = @('Moroccan dirham', 'ma'); MGA = @('Malagasy ariary', 'mg')
  MRU = @('Mauritanian ouguiya', 'mr'); MUR = @('Mauritian rupee', 'mu'); MWK = @('Malawian kwacha', 'mw')
  MZN = @('Mozambican metical', 'mz'); NGN = @('Nigerian naira', 'ng'); RWF = @('Rwandan franc', 'rw')
  SCR = @('Seychellois rupee', 'sc'); SDG = @('Sudanese pound', 'sd'); SLE = @('Sierra Leonean leone', 'sl')
  SOS = @('Somali shilling', 'so'); SSP = @('South Sudanese pound', 'ss'); TND = @('Tunisian dinar', 'tn')
  TZS = @('Tanzanian shilling', 'tz'); UGX = @('Ugandan shilling', 'ug'); ZAR = @('South African rand', 'za')
  ZMW = @('Zambian kwacha', 'zm'); ZWG = @('Zimbabwe gold', 'zw')
}

function Format-Rate([double]$v) {
  if ($v -ge 100) { return $v.ToString('#,0', $inv) }
  if ($v -ge 10) { return $v.ToString('#,0.00', $inv) }
  return $v.ToString('0.00##', $inv)
}
function Format-Day([string]$iso) { return [datetime]::ParseExact($iso, 'yyyy-MM-dd', $inv).ToString('d MMM', $inv) }

try {
  $histPath = if ($HistoryFile) { $HistoryFile } else { Join-Path $root 'data\fx-history.json' }
  $hist = [IO.File]::ReadAllText($histPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $days = @($hist.days | ForEach-Object { [string]$_ })
  if ($days.Count -lt 2) { Write-Host 'FX alerts: fewer than two days of history.'; exit 0 }
  $iNew = $days.Count - 1; $iOld = $days.Count - 2
  $dNew = [datetime]::ParseExact($days[$iNew], 'yyyy-MM-dd', $inv)
  $dOld = [datetime]::ParseExact($days[$iOld], 'yyyy-MM-dd', $inv)
  if (($dNew - $dOld).TotalDays -gt 4) { Write-Host "FX alerts: $($days[$iOld]) to $($days[$iNew]) is not a day's move; nothing compared."; exit 0 }

  $moves = New-Object System.Collections.Generic.List[object]
  foreach ($code in $watch.Keys) {
    $series = $hist.rates.$code
    if (-not $series) { continue }
    $series = @($series)
    if ($series.Count -ne $days.Count) { continue }
    if ($null -eq $series[$iNew] -or $null -eq $series[$iOld]) { continue }
    $new = [double]$series[$iNew]; $old = [double]$series[$iOld]
    if ($new -le 0 -or $old -le 0) { continue }
    # Rates are units per dollar, so a higher rate is a weaker currency. The change in the
    # currency's own value is old/new - 1.
    $pct = ($old / $new - 1) * 100
    if ([Math]::Abs($pct) -lt $Threshold) { continue }
    if ([Math]::Abs($pct) -gt $Sanity) { Write-Host ("FX alerts: {0} moved {1:N1}% in a day ({2} to {3}); not posted, check the source." -f $code, $pct, $old, $new); continue }
    # The reference feed is noisy for thinly traded currencies: the Seychelles rupee read
    # 13.92, 13.94, 14.62, 14.00, 14.76 over five days in Nov 2026, a swing of 4-5% most
    # days that is the feed, not the market. A move is news only when (a) the currency's
    # usual daily change is under half the threshold and (b) the new rate is also that far
    # from the median of the days before, so one odd reading yesterday cannot make one today.
    $prior = @(); $changes = @()
    for ($i = [Math]::Max(0, $iOld - 6); $i -le $iOld; $i++) {
      if ($null -ne $series[$i] -and [double]$series[$i] -gt 0) { $prior += [double]$series[$i] }
      if ($i -gt 0 -and $null -ne $series[$i] -and $null -ne $series[$i - 1] -and [double]$series[$i - 1] -gt 0) {
        $changes += [Math]::Abs(([double]$series[$i - 1] / [double]$series[$i] - 1) * 100)
      }
    }
    if ($changes.Count -lt 3) { Write-Host "FX alerts: $code has too little history to judge a move."; continue }
    $median = { param($a) $s = @($a | Sort-Object); if ($s.Count % 2) { $s[[int][Math]::Floor($s.Count / 2)] } else { ($s[$s.Count / 2 - 1] + $s[$s.Count / 2]) / 2.0 } }
    $usual = & $median $changes
    if ($usual -ge $Threshold / 2.0) { Write-Host ("FX alerts: {0} moved {1:N1}% but its feed usually moves {2:N1}% a day; not posted." -f $code, $pct, $usual); continue }
    $base = & $median $prior
    if ([Math]::Abs(($base / $new - 1) * 100) -lt $Threshold) { Write-Host ("FX alerts: {0} moved {1:N1}% from yesterday but is within {2}% of its recent median; not posted." -f $code, $pct, $Threshold); continue }
    $moves.Add([pscustomobject]@{ code = $code; name = $watch[$code][0]; cc = $watch[$code][1]; old = $old; new = $new; pct = $pct })
  }
  if (-not $moves.Count) { Write-Host "FX alerts: no currency moved $Threshold% or more between $($days[$iOld]) and $($days[$iNew])."; exit 0 }

  $key = "fx:$($days[$iNew])"
  $postedPath = Join-Path $root 'data\social-posted.json'
  $posted = New-Object System.Collections.Generic.List[string]
  if (Test-Path $postedPath) { try { foreach ($id in ([IO.File]::ReadAllText($postedPath, [Text.Encoding]::UTF8) | ConvertFrom-Json)) { $posted.Add([string]$id) } } catch {} }
  if ($posted.Contains($key)) { Write-Host "FX alerts: $key already posted."; exit 0 }

  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add('<b>Currency moves</b>')
  $lines.Add('')
  foreach ($m in ($moves | Sort-Object -Property @{ Expression = { [Math]::Abs($_.pct) }; Descending = $true } | Select-Object -First 6)) {
    $verb = if ($m.pct -lt 0) { 'weakened' } else { 'strengthened' }
    $dir = if ($m.new -gt $m.old) { 'up' } else { 'down' }
    $lines.Add(('<a href="https://africanstreetjournal.com/{0}/">{1}</a> {2} {3:N1}% against the US dollar: $1 bought {4} {5} on {6}, {7} from {8} on {9}.' -f
      $m.cc, $m.name, $verb, [Math]::Abs($m.pct), (Format-Rate $m.new), $m.code, (Format-Day $days[$iNew]), $dir, (Format-Rate $m.old), (Format-Day $days[$iOld])))
  }
  $lines.Add('')
  $lines.Add('Reference rates, recorded daily: <a href="https://africanstreetjournal.com/markets/">africanstreetjournal.com/markets</a>')
  $text = $lines -join "`n"

  if ($DryRun) { Write-Host "--- FX alert (dry run) ---`n$text"; exit 0 }
  $tgToken = [string]$env:TELEGRAM_BOT_TOKEN; $tgChat = [string]$env:TELEGRAM_CHAT_ID
  if (-not ($tgToken -and $tgChat)) { Write-Host 'FX alerts: no Telegram secrets; nothing sent.'; exit 0 }
  $body = [ordered]@{ chat_id = $tgChat; text = $text; parse_mode = 'HTML'; link_preview_options = @{ is_disabled = $true } } | ConvertTo-Json -Compress
  $r = Invoke-RestMethod -Uri "https://api.telegram.org/bot$tgToken/sendMessage" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 30
  if ($r.ok) {
    Write-Host "FX alerts: sent ($($moves.Count) currencies)."
    $posted.Add($key)
    [IO.File]::WriteAllText($postedPath, (ConvertTo-Json -InputObject @($posted | Select-Object -Last 2000) -Compress), (New-Object Text.UTF8Encoding($false)))
  } else { Write-Host 'FX alerts: Telegram refused the message.' }
} catch {
  Write-Host "FX alerts: failed - $($_.Exception.Message)"
}
exit 0
