# Pings IndexNow (Bing, Yandex, Seznam, Naver...) with the homepage, feed and every
# story published in the last 48 hours, so new pages are crawled within hours rather
# than whenever the engines next visit. Best-effort: it never throws or exits non-zero,
# because a search ping must never fail the desk.
param([int]$Hours = 48)
$ErrorActionPreference = 'Continue'
try {
  $keyFile = Get-ChildItem -File -Filter '*.txt' | Where-Object { $_.BaseName -match '^[0-9a-f]{32}$' } | Select-Object -First 1
  if (-not $keyFile) { Write-Host 'IndexNow: no key file at site root; skipping.'; exit 0 }
  $key = $keyFile.BaseName
  $site = 'https://africanstreetjournal.com'
  $urls = New-Object System.Collections.Generic.List[string]
  $urls.Add("$site/")
  $cutoff = (Get-Date).ToUniversalTime().AddHours(-$Hours)
  if (Test-Path news-sitemap.xml) {
    [xml]$x = Get-Content news-sitemap.xml -Raw -Encoding utf8
    foreach ($u in $x.urlset.url) {
      $d = $u.news.publication_date
      $when = [DateTime]::MinValue
      if ($d -and [DateTime]::TryParse([string]$d, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal, [ref]$when) -and $when -lt $cutoff) { continue }
      if ($urls.Count -ge 10000) { break }
      $urls.Add([string]$u.loc)
    }
  }
  $body = @{ host = 'africanstreetjournal.com'; key = $key; keyLocation = "$site/$key.txt"; urlList = @($urls | Select-Object -Unique) } | ConvertTo-Json -Depth 4
  Write-Host "IndexNow: submitting $($urls.Count) URLs"
  $resp = Invoke-WebRequest -Uri 'https://api.indexnow.org/indexnow' -Method Post -ContentType 'application/json; charset=utf-8' -Body $body -TimeoutSec 30 -UseBasicParsing -SkipHttpErrorCheck
  Write-Host "IndexNow: HTTP $($resp.StatusCode)"
} catch {
  Write-Host "IndexNow: request failed - $($_.Exception.Message)"
}
exit 0
