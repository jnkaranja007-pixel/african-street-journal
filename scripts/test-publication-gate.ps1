#Requires -Version 5.1
param()

$ErrorActionPreference = 'Stop'
$fixturePath = Join-Path ([IO.Path]::GetTempPath()) "asj-publication-gate-$([guid]::NewGuid().ToString('N')).js"

try {
  $stories = @(
    1..5 | ForEach-Object {
      [ordered]@{
        articleId = "dz-test-$_"
        headline = "Publication gate test $_"
        dek = 'A deterministic test story for the publication gate.'
        body = 'One two three.'
        why = 'Confirms that targeted publication validates the requested country.'
        published = '2026-08-25T05:00:00Z'
        paragraphs = @('One.', 'Two.', 'Three.')
        sources = @([ordered]@{ name = 'Test source'; url = 'https://example.com/report' })
      }
    }
  )
  $fixture = [ordered]@{
    generated = '2026-08-25T05:00:00Z'
    byCountry = [ordered]@{ dz = $stories }
    markets = [ordered]@{}
    dates = [ordered]@{ dz = '2026-08-25' }
  }
  $payload = "window.UNITED_AFRICA_BRIEFS = $($fixture | ConvertTo-Json -Depth 10);"
  [IO.File]::WriteAllText($fixturePath, $payload, [Text.UTF8Encoding]::new($false))

  & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\validate-briefs.ps1" `
    -BriefsFile $fixturePath -MinStoryWords 1 -MinStoryPackages 5 -MinFreshCountries 1 `
    -RequiredFreshCountries dz
  if ($LASTEXITCODE -ne 0) { throw 'Expected requested fresh country dz to pass.' }

  & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\validate-briefs.ps1" `
    -BriefsFile $fixturePath -MinStoryWords 1 -MinStoryPackages 5 -MinFreshCountries 1 `
    -RequiredFreshCountries ke
  if ($LASTEXITCODE -eq 0) { throw 'Expected missing requested country ke to fail.' }

  Write-Host '[publication-gate] OK - exact requested-country validation passes and fails correctly' -ForegroundColor Green
}
finally {
  Remove-Item -LiteralPath $fixturePath -Force -ErrorAction SilentlyContinue
}
