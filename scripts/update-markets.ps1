#Requires -Version 5.1
<#
.SYNOPSIS
  Refresh per-country market data from AFX (afx.kwayisi.org) into data/markets.json.
.DESCRIPTION
  The markets block was hand-seeded and never refreshed: asOf values ranged from
  November 2025 to June 2026 and add-briefs simply carried the same object forward on
  every run. That is also how corrupted company names survived for weeks - data that is
  copied rather than regenerated never heals.

  AFX publishes a per-exchange listing table with ticker, company name, volume, price
  and absolute change. It is the same source the original seed cites, so this replaces
  a manual scrape with a repeatable one.

  Change is published as an absolute move, not a percentage, so the percentage is
  derived from the previous close (price - change). Rows with no price are listings
  that did not trade; they are skipped rather than shown as flat.
.USAGE
  powershell -ExecutionPolicy Bypass -File scripts/update-markets.ps1
  powershell -ExecutionPolicy Bypass -File scripts/update-markets.ps1 -Only ke,ng
.NOTES
  Exit 0 if any exchange returned rows, 1 if all failed - that is a network or layout
  change, not nine exchanges closing at once.
#>
param(
  [string[]]$Only,
  [int]$PerCountry = 12,
  [int]$TimeoutSec = 45,
  [int]$Retries = 3,
  [int]$DelayMs = 400
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path $PSScriptRoot -Parent
$outPath = Join-Path $root 'data\markets.json'
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

# AFX exchange slug -> the countries it serves. BRVM is the regional WAEMU exchange, so
# eight countries legitimately share one listing table.
$EXCHANGES = @(
  @{ slug='nse';  code='NSE';   name='Nairobi Securities Exchange';        countries=@('ke') },
  @{ slug='ngx';  code='NGX';   name='Nigerian Exchange Group';            countries=@('ng') },
  @{ slug='jse';  code='JSE';   name='Johannesburg Stock Exchange';        countries=@('za') },
  @{ slug='gse';  code='GSE';   name='Ghana Stock Exchange';               countries=@('gh') },
  @{ slug='use';  code='USE';   name='Uganda Securities Exchange';         countries=@('ug') },
  @{ slug='zse';  code='ZSE';   name='Zimbabwe Stock Exchange';            countries=@('zw') },
  # AFX publishes ten exchanges and this list used seven. Botswana was left on a
  # hand-seeded block from March, 166 days old by 28 August, while bse was sitting
  # there the whole time; Zambia and Malawi had no market panel at all.
  @{ slug='bse';  code='BSE';   name='Botswana Stock Exchange';            countries=@('bw') },
  @{ slug='luse'; code='LuSE';  name='Lusaka Securities Exchange';         countries=@('zm') },
  @{ slug='mse';  code='MSE';   name='Malawi Stock Exchange';              countries=@('mw') },
  @{ slug='brvm'; code='BRVM';  name='Bourse Regionale des Valeurs Mobilieres'; countries=@('ci','bj','bf','ml','ne','sn','tg','gw') }
)

function Get-Page([string]$url) {
  # Retries with backoff. Every exchange timed out at exactly 25s on the GitHub runner
  # on 27 August while the same URLs answered instantly from a home connection. That is
  # the signature of a host that drops datacenter traffic rather than refusing it, but
  # it is also what a slow first byte looks like, so give it real attempts before
  # concluding the source is unreachable.
  $lastErr = $null
  for ($attempt = 1; $attempt -le $Retries; $attempt++) {
    try {
      $req = [Net.HttpWebRequest]::Create($url)
      $req.UserAgent = $UA
      $req.Timeout = $TimeoutSec * 1000
      $req.ReadWriteTimeout = $TimeoutSec * 1000
      $req.AllowAutoRedirect = $true
      $req.KeepAlive = $false
      $resp = $req.GetResponse()
      try {
        $sr = New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)
        return $sr.ReadToEnd()
      } finally { $resp.Close() }
    } catch {
      $lastErr = $_
      if ($attempt -lt $Retries) { Start-Sleep -Seconds (5 * $attempt) }
    }
  }
  throw $lastErr
}

function Get-Listings([string]$html) {
  # The listing table is the widest one on the page; gainers/losers tables are small.
  $tables = [regex]::Matches($html, '(?is)<table.*?</table>')
  if (-not $tables.Count) { return @() }
  $main = ($tables | Sort-Object { $_.Value.Length } -Descending)[0].Value
  $rows = New-Object System.Collections.Generic.List[object]
  # Ticker cell, name cell, volume, price, change. Volume and change can be empty for a
  # listing that did not trade.
  $rx = '(?is)<tr>\s*<td><a[^>]*>([A-Z0-9\.\-]{1,14})</a>\s*<td><a[^>]*>([^<]*)</a>\s*<td[^>]*>([^<]*)<td[^>]*>([^<]*)<td[^>]*>([^<]*)'
  foreach ($m in [regex]::Matches($main, $rx)) {
    $ticker = $m.Groups[1].Value.Trim()
    $name   = [Net.WebUtility]::HtmlDecode($m.Groups[2].Value).Trim()
    $priceS = ($m.Groups[4].Value -replace '[^\d\.\-]', '')
    $chgS   = ($m.Groups[5].Value -replace '[^\d\.\-]', '')
    if (-not $ticker -or -not $priceS) { continue }
    $price = 0.0; $chg = 0.0
    if (-not [double]::TryParse($priceS, [ref]$price)) { continue }
    if ($price -le 0) { continue }
    [void][double]::TryParse($chgS, [ref]$chg)
    # AFX publishes an absolute move; the panel wants a percentage.
    $prev = $price - $chg
    $pct = if ($prev -gt 0) { [Math]::Round(($chg / $prev) * 100, 2) } else { 0.0 }
    $rows.Add([pscustomobject]@{ t = $ticker; name = $name; price = $price; change = $pct })
  }
  return $rows
}

$today = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
$result = [ordered]@{}
$okExchanges = 0
$failed = New-Object System.Collections.Generic.List[string]

foreach ($ex in $EXCHANGES) {
  $wanted = @($ex.countries)
  if ($Only) {
    $want = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $wanted = @($wanted | Where-Object { $want -contains $_ })
    if (-not $wanted.Count) { continue }
  }
  $url = "https://afx.kwayisi.org/$($ex.slug)/"
  try {
    $html = Get-Page $url
    $rows = @(Get-Listings $html)
  } catch {
    Write-Host ("  {0,-6} FETCH FAILED: {1}" -f $ex.slug, $_.Exception.Message.Split("`n")[0]) -ForegroundColor Red
    $failed.Add($ex.slug); Start-Sleep -Milliseconds $DelayMs; continue
  }
  if (-not $rows.Count) {
    Write-Host ("  {0,-6} no rows parsed - layout may have changed" -f $ex.slug) -ForegroundColor DarkYellow
    $failed.Add($ex.slug); Start-Sleep -Milliseconds $DelayMs; continue
  }
  $okExchanges++
  # Largest movers first, so a small panel shows the day's actual action.
  $top = @($rows | Sort-Object { [Math]::Abs($_.change) } -Descending | Select-Object -First $PerCountry)
  foreach ($c in $wanted) {
    $result[[string]$c] = @{
      exchange  = $ex.code
      name      = $ex.name
      sourceUrl = $url
      asOf      = $today
      companies = @($top | ForEach-Object { @{ t = $_.t; name = $_.name; cap = $_.price; change = $_.change } })
    }
  }
  Write-Host ("  {0,-6} {1,3} listings -> {2}" -f $ex.slug, $rows.Count, ($wanted -join ',')) -ForegroundColor Green
  Start-Sleep -Milliseconds $DelayMs
}

if ($okExchanges -eq 0) {
  Write-Host '[markets] every exchange failed - network or layout change, not a market holiday' -ForegroundColor Red
  exit 1
}

[IO.File]::WriteAllText($outPath, ($result | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
Write-Host ''
Write-Host "[markets] $okExchanges exchange(s) -> $($result.Count) countries, asOf $today -> data/markets.json" -ForegroundColor Green
if ($failed.Count) { Write-Host "[markets] failed: $($failed -join ', ')" -ForegroundColor DarkYellow }
exit 0
