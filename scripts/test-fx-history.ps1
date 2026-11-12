#Requires -Version 5.1
# Tests scripts/update-fx-history.ps1 against fixture answers (no network).
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'update-fx-history.ps1'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('asj-fx-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
$out = Join-Path $tmp 'fx-history.json'
$codes = @('AOA','BIF','BWP','CDF','CVE','DJF','DZD','EGP','ERN','ETB','EUR','GBP','GHS','GMD','GNF',
  'KES','KMF','LRD','LSL','LYD','MAD','MGA','MRU','MUR','MWK','MZN','NAD','NGN','RWF','SCR','SDG',
  'SLE','SOS','SSP','STN','SZL','TND','TZS','UGX','XAF','XOF','ZAR','ZMW','ZWG')
function Write-Answer([string]$Name, [long]$Unix, [double]$Kes, [int]$Count = 44, [string]$Result = 'success') {
  $rates = [ordered]@{ USD = 1 }
  $i = 0
  foreach ($c in $codes) { if ($i -lt $Count) { $rates[$c] = 10 + $i } ; $i++ }
  if ($rates.Contains('KES')) { $rates['KES'] = $Kes }
  $obj = [ordered]@{ result = $Result; base_code = 'USD'; time_last_update_unix = $Unix; rates = $rates }
  $f = Join-Path $tmp $Name
  [IO.File]::WriteAllText($f, ($obj | ConvertTo-Json -Depth 4))
  return $f
}
function Run($From, [int]$Keep = 800) { & $script -OutFile $out -FromFile $From -KeepDays $Keep | Out-Null }
function Read-Out { Get-Content -LiteralPath $out -Raw | ConvertFrom-Json }
$fails = 0
function Check([string]$Name, [bool]$Ok) { if ($Ok) { Write-Host "PASS $Name" } else { Write-Host "FAIL $Name"; $script:fails++ } }

$d1 = 1762905600   # 2025-11-12 00:00 UTC
Run (Write-Answer 'a.json' $d1 129.48)
$h = Read-Out
Check 'first point saved' ((@($h.days).Count -eq 1) -and ([double]$h.rates.KES[0] -eq 129.48))
Check 'every currency has a series' (@($h.rates.PSObject.Properties).Count -eq $codes.Count)
Run (Write-Answer 'b.json' ($d1 + 3600) 129.9)
$h = Read-Out
Check 'a second run the same day replaces that day' ((@($h.days).Count -eq 1) -and ([double]$h.rates.KES[0] -eq 129.9))
Run (Write-Answer 'c.json' ($d1 + 86400) 130.25)
$h = Read-Out
Check 'the next day adds a point' ((@($h.days).Count -eq 2) -and ($h.days[1] -eq '2025-11-13') -and ([double]$h.rates.KES[1] -eq 130.25))
$before = [IO.File]::ReadAllText($out)
Run (Write-Answer 'd.json' ($d1 + 2 * 86400) 999 10)
Check 'an answer missing most currencies changes nothing' ([IO.File]::ReadAllText($out) -eq $before)
Run (Write-Answer 'e.json' ($d1 + 2 * 86400) 999 44 'error')
Check 'a failed answer changes nothing' ([IO.File]::ReadAllText($out) -eq $before)
Run (Write-Answer 'f.json' ($d1 - 86400) 120)
Check 'a day older than the newest kept is skipped' ([IO.File]::ReadAllText($out) -eq $before)
Run (Join-Path $tmp 'missing.json')
Check 'an unreachable source changes nothing' ([IO.File]::ReadAllText($out) -eq $before)
Run (Write-Answer 'g.json' ($d1 + 2 * 86400) 131) 2
$h = Read-Out
Check 'history is trimmed from the front' ((@($h.days).Count -eq 2) -and ($h.days[0] -eq '2025-11-13') -and (@($h.rates.KES).Count -eq 2))
Remove-Item -Recurse -Force $tmp
if ($fails) { Write-Host "[fx-history] $fails failed"; exit 1 }
Write-Host '[fx-history] OK'
exit 0
