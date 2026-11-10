#Requires -Version 5.1
<#
.SYNOPSIS
  End-to-end test of the writer's repair loop against a local stand-in model.
.DESCRIPTION
  write-briefs.ps1 is run for real, as a child process, with ASJ_OPENROUTER_URL pointed
  at an HttpListener in this process that answers with scripted drafts. Seven assignments,
  one per path through the loop:
    0  clean draft                         -> published as written, one call
    1  stock phrases + hedged why          -> one style rewrite fixes it
    2  countryLink "none" (Lisbon protest) -> dropped, no rewrite
    3  stock phrase the model keeps        -> one rewrite, then kept with notes
    4  hedged investor reason, score 70    -> published, investor score capped to 20
    5  style rewrite invents a figure      -> the first, fact-checked draft is published
    6  draft invents a month (Portuguese   -> date repair; the rewrite gives the source's
       source, 4 Nov 2026 Ebola case)         own date and is published
  No network, no key: everything stays on 127.0.0.1.
.USAGE
  pwsh -File scripts/test-desk-harness.ps1
#>

$ErrorActionPreference = 'Stop'
$writer = Join-Path $PSScriptRoot 'write-briefs.ps1'
$tmp = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'asj-harness-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
$passed = 0
function Assert-Harness([string]$Name, [bool]$Condition, [string]$Detail = '') {
  if (-not $Condition) {
    if ($script:logPath -and (Test-Path $script:logPath)) { Get-Content $script:logPath | Select-Object -Last 40 | ForEach-Object { Write-Host "    | $_" } }
    throw "FAIL $Name $Detail"
  }
  $script:passed++
  Write-Host "  PASS $Name"
}

# --- the assignments ------------------------------------------------------------------
function New-Item5([string]$Id, [string]$Title, [string]$Evidence) {
  return [ordered]@{
    itemId = $Id; title = $Title; source = 'Fixture Times'; url = "https://example.com/$Id"
    published = '2026-10-22T06:00:00Z'; articleEvidence = $Evidence
    editorialScore = 8.5; selectionScore = 8.5; confidence = 'high'; rankReasons = @('fixture')
  }
}
$items = @(
  (New-Item5 'port' 'Port opens new berth' 'The Fixtureland Ports Authority opened a new container berth at Port Nova on Monday. The berth adds capacity for 400,000 containers a year, the authority said. Shipping lines will start using it next month. The project cost 120 million dollars and was financed by a state bank. Truck drivers said queues at the gate were already shorter.'),
  (New-Item5 'fert' 'Ministry signs fertiliser deal' 'The agriculture ministry of Fixtureland signed a contract with a supplier for 50,000 tonnes of fertiliser on Tuesday. Deliveries start in March. The ministry said the price is 30 percent lower than last season. Farmers will buy it through cooperatives in every district, and the ministry will publish prices weekly.'),
  (New-Item5 'lisbon' 'Police clear Lisbon housing camp' 'Portuguese police cleared a protest camp in Lisbon on Wednesday and arrested 55 people. Protesters had camped in Rossio square for a week against rising rents. Police said the gathering was no longer legal. Organisers said they would return. The protests began in Porto earlier this month and spread to the capital.'),
  (New-Item5 'budget' 'Council adopts city budget' 'The Port Nova city council adopted its budget for next year on Thursday after a four-hour session. The budget totals 80 million dollars, with 25 million for roads and 15 million for water. The opposition voted against it. The mayor said road works start in January and that tenders open next week.'),
  (New-Item5 'tele' 'Telecom company expands network' 'Fixtel, the largest telecom company in Fixtureland, switched on 300 new mobile masts in rural districts on Friday. The company said 2 million people now have a signal for the first time. Fixtel did not say what the masts cost. The regulator said it would inspect coverage in December.'),
  (New-Item5 'amb' 'Hospital receives ambulances' 'The Port Nova general hospital received 12 new ambulances from the health ministry on Saturday. The hospital director said the vehicles will serve 6 rural clinics. Two of the ambulances carry intensive care equipment. The ministry said drivers have been trained and the vehicles enter service on Monday.'),
  (New-Item5 'cholera' 'Colera ja matou 5.103 pessoas na Fixtureland' 'O Instituto Nacional de Saude Publica da Fixtureland confirmou ate a data 5.103 mortos e 10.467 infectados com colera, segundo o boletim de terca-feira, 3 de Novembro de 2026. Nas ultimas 24 horas morreram 45 pessoas e houve 53 novos casos. Estao internados 980 doentes em oito provincias. O surto ja ultrapassa o de 2014, que fez 11.325 mortos.')
)
# Published on 3 Nov, like the Folha 8 report: the stamp grounds the 11 in "March 11".
$items[6].published = '2026-11-03T18:36:30Z'
$feed = [ordered]@{ fetched = '2026-10-22T06:30:00Z'; byCountry = [ordered]@{ xx = [ordered]@{ country = 'Fixtureland'; items = $items } } }
$feedPath = Join-Path $tmp 'feed.json'
[IO.File]::WriteAllText($feedPath, ($feed | ConvertTo-Json -Depth 10), $utf8)

# --- the stand-in model -----------------------------------------------------------------
# Drafts are keyed by assignment title and by whether the prompt is a repair. Each first
# draft passes every fact check (figures all come from its packet), so only the paths
# under test differ.
$responder = {
  param($PromptText)
  $lens = [ordered]@{
    farmers = [ordered]@{ why = 'The report establishes no direct effect on farming or rural livelihoods in Fixtureland.'; score = 5 }
    investors = [ordered]@{ why = 'The report names a public body and a state bank acting on port capacity for shipping companies.'; score = 70 }
    diaspora = [ordered]@{ why = 'The report establishes no direct effect on diaspora travel, families or cross-border money.'; score = 10 }
  }
  $title = ''
  if ($PromptText -match '\[(\d+)\] ASSIGNED - ([^\r\n]+)') { $item = [int]$Matches[1]; $title = $Matches[2].Trim() } else { $item = 0 }
  $styleRepair = $PromptText -match 'REPAIR: Your previous draft'
  $anyRepair = $PromptText -match 'REPAIR:'
  $link = 'in-country'
  $headline = ''; $dek = ''; $paragraphs = @(); $why = ''
  switch ($title) {
    'Port opens new berth' {
      $headline = 'Port Nova opens berth for 400,000 containers a year'
      $dek = 'Shipping lines start using the new berth next month, after a project the authority says cost 120 million dollars.'
      $paragraphs = @(
        'The Fixtureland Ports Authority said on Monday it had opened a container berth at Port Nova, adding room for 400,000 containers a year.',
        'A state bank financed the 120 million dollar project, and shipping lines will begin using the berth next month, according to the authority.',
        'Truck drivers waiting at the port gate said queues had already become shorter since the berth opened. The authority did not say whether further expansion is planned at the site.')
      $why = 'Shipping lines and truck drivers at Port Nova gain berth space and shorter queues at the gate.'
    }
    'Ministry signs fertiliser deal' {
      $headline = 'Ministry buys 50,000 tonnes of fertiliser at lower price'
      $dek = 'Deliveries start in March through district cooperatives, and the ministry will publish prices every week.'
      $p3 = 'Cooperatives in every district will sell the fertiliser to farmers, and the ministry will publish prices weekly so buyers can compare them.'
      $why = 'Farmers buying through district cooperatives will pay 30 percent less for fertiliser arriving in March.'
      if (-not $styleRepair) {
        $p3 = 'This move underscores a broader strategy and is crucial for food security across the country, as farmers prepare for the planting season ahead.'
        $why = 'Farmers may benefit from cheaper fertiliser next season if deliveries arrive on time.'
      }
      $paragraphs = @(
        'The agriculture ministry of Fixtureland signed a contract on Tuesday with a supplier for 50,000 tonnes of fertiliser, with deliveries due to start in March.',
        'The price is 30 percent below last season''s, the ministry said, a saving it attributed to the size of the order placed with the supplier.',
        $p3)
    }
    'Police clear Lisbon housing camp' {
      $link = 'none'
      $headline = 'Police clear Lisbon housing protest camp and arrest 55'
      $dek = 'Protesters had camped in Rossio square for a week against rising rents, and organisers say they will return soon.'
      $paragraphs = @(
        'Portuguese police cleared a protest camp in Lisbon on Wednesday and arrested 55 people who had camped in Rossio square for a week against rising rents.',
        'Police said the gathering was no longer legal. Organisers said they would return to the square, and the protests that began in Porto have spread to the capital.',
        'The camp was the largest of several set up this month by groups protesting against housing costs in Portuguese cities, according to the organisers.')
      $why = 'Protesters in Lisbon were arrested and their camp removed after a week in Rossio square.'
    }
    'Council adopts city budget' {
      $headline = 'Port Nova council adopts 80 million dollar budget'
      $dek = 'Roads get 25 million dollars and water 15 million, and the mayor says road works start in January.'
      $paragraphs = @(
        'After a four-hour session on Thursday, the Port Nova city council approved its budget for next year, with total spending of 80 million dollars.',
        'Roads get 25 million dollars of that and water 15 million. Opposition councillors voted against the budget, the council said after the session ended.',
        'Councillors called the vote a pivotal moment for the city. The mayor said road works paid for by the budget will start in January.')
      $why = 'Port Nova residents will see road works from January funded by the new 80 million dollar budget.'
    }
    'Telecom company expands network' {
      $headline = 'Fixtel switches on 300 rural masts, reaching 2 million people'
      $dek = 'The regulator says it will inspect the new coverage in December, while the company has not disclosed the cost.'
      $paragraphs = @(
        'Fixtel switched on 300 new mobile masts across rural districts of Fixtureland on Friday, the company said. It is the largest telecom company in the country.',
        'The company said 2 million people now have a mobile signal for the first time. Fixtel did not say how much the new masts cost to build.',
        'The telecoms regulator said it would inspect the coverage in December to check that the rural districts named by the company are served.')
      $why = 'About 2 million people in rural districts have a mobile signal for the first time.'
      $lens.investors = [ordered]@{ why = 'Investors could see higher returns if the company keeps growing its rural network.'; score = 70 }
    }
    'Hospital receives ambulances' {
      $headline = 'Port Nova hospital receives 12 ambulances for rural clinics'
      $dek = 'The vehicles enter service on Monday with trained drivers, and two carry intensive care equipment.'
      $p1 = 'The Port Nova general hospital received 12 much-needed ambulances from the health ministry on Saturday, the hospital director said.'
      if ($anyRepair) { $p1 = 'The Port Nova general hospital received 12 ambulances from the health ministry on Saturday, which will serve 9,999 patients, the director said.' }
      $paragraphs = @(
        $p1,
        'The vehicles will serve 6 rural clinics, the director said, and the ministry said two of them carry intensive care equipment.',
        'The ministry said the drivers have been trained and that the vehicles will enter service on Monday at the rural clinics they are assigned to, which until now have shared a single vehicle between them.')
      $why = 'Patients at 6 rural clinics get ambulance cover, two with intensive care equipment.'
    }
    'Colera ja matou 5.103 pessoas na Fixtureland' {
      $headline = 'Cholera has killed 5,103 people in Fixtureland, institute says'
      $dek = 'Another 45 people died and 53 new cases were recorded in a day, with 980 patients in hospital across eight provinces.'
      # The month passes the number check: 11 and 2026 are in the publication stamp.
      $p1 = 'The National Institute of Public Health has confirmed 5,103 deaths and 10,467 infections from cholera in Fixtureland as of March 11, 2026.'
      if ($anyRepair) { $p1 = 'The National Institute of Public Health has confirmed 5,103 deaths and 10,467 infections from cholera in Fixtureland, according to its bulletin of Tuesday, November 3.' }
      $paragraphs = @(
        $p1,
        'In the last 24 hours, 45 people died and 53 new cases were recorded. The institute said 980 patients are in hospital in eight provinces.',
        'The outbreak has already passed the one in 2014, which killed 11,325 people. The institute did not say when it expects the number of new cases to fall.')
      $why = 'Families in eight provinces face an outbreak that has now killed more people than the one in 2014.'
    }
  }
  $words = ([regex]::Matches(($paragraphs -join ' '), '[\p{L}\p{N}]+')).Count
  $story = [ordered]@{ item = $item; countryLink = $link; topic = 'Business'; headline = $headline; dek = $dek; paragraphs = $paragraphs; wordCount = $words; why = $why; lenses = $lens }
  # Reach: the outbreak matters most, the council budget least; the rest send none, as a
  # cached story from before reach existed would, and count as 3.
  if ($title -like 'Colera*') { $story['reach'] = 5 } elseif ($title -eq 'Council adopts city budget') { $story['reach'] = 1 }
  return ([ordered]@{ stories = @($story) } | ConvertTo-Json -Depth 8 -Compress)
}

$listener = New-Object System.Net.HttpListener
$port = 0
for ($try = 0; $try -lt 10 -and -not $listener.IsListening; $try++) {
  $port = Get-Random -Minimum 20000 -Maximum 45000
  $listener.Prefixes.Clear()
  $listener.Prefixes.Add("http://127.0.0.1:$port/")
  try { $listener.Start() } catch { $listener = New-Object System.Net.HttpListener }
}
if (-not $listener.IsListening) { throw 'could not start the stand-in model listener' }
$log = [hashtable]::Synchronized(@{ prompts = (New-Object System.Collections.ArrayList); requests = (New-Object System.Collections.ArrayList) })
$server = [PowerShell]::Create()
[void]$server.AddScript({
  param($Listener, $Log, $ResponderText)
  $respond = [scriptblock]::Create($ResponderText)
  while ($Listener.IsListening) {
    try { $ctx = $Listener.GetContext() } catch { break }
    try {
      $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
      $raw = $reader.ReadToEnd()
      # As OpenRouter does: every message's content must be a string. The 23 Oct 2026 desk
      # run died on "messages.0.content: Invalid input" - the style check's result had
      # overwritten $STYLE (PowerShell names ignore case) - and a stand-in that accepted
      # anything let it through.
      $req = $raw | ConvertFrom-Json
      $badContent = @($req.messages | Where-Object { $_.content -isnot [string] }).Count
      if ($badContent) {
        [void]$Log.prompts.Add('INVALID-CONTENT')
        $ctx.Response.StatusCode = 400
        $err = [Text.Encoding]::UTF8.GetBytes('{"error":{"message":"messages.0.content: Invalid input","code":400}}')
        $ctx.Response.OutputStream.Write($err, 0, $err.Length)
        continue
      }
      $prompt = [string]$req.messages[1].content
      [void]$Log.prompts.Add($prompt)
      # What each call asked for, so the test can tell which route a rewrite took. The
      # rewrite model (Claude on OpenRouter) takes no temperature and no length limits.
      [void]$Log.requests.Add([pscustomobject]@{
        model = [string]$req.model
        temperature = [bool]$req.PSObject.Properties['temperature']
        limits = ($raw -match '"(?:minLength|maxLength|minItems|maxItems|minimum|maximum|const)"')
        style = ($prompt -match 'REPAIR: Your previous draft')
        repair = ($prompt -match 'REPAIR:')
        dateRepair = ($prompt -match 'REPAIR: The previous draft named dates')
        reasoningOff = ([bool]$req.PSObject.Properties['reasoning'] -and $req.reasoning.enabled -eq $false)
        maxTokens = [int]$req.max_tokens
      })
      # As OpenRouter answers a model that cannot take the call (404, not transient).
      if ([string]$req.model -eq 'stand-in/refuser') {
        $ctx.Response.StatusCode = 404
        $err = [Text.Encoding]::UTF8.GetBytes('{"error":{"message":"No endpoints found that support the requested parameters","code":404}}')
        $ctx.Response.OutputStream.Write($err, 0, $err.Length)
        continue
      }
      # As Claude Haiku 5.5 answered every rewrite on 10 Nov 2026: HTTP 200, the whole
      # allowance spent thinking, and no content.
      if ([string]$req.model -eq 'stand-in/silent') {
        $silent = [Text.Encoding]::UTF8.GetBytes('{"model":"stand-in","choices":[{"finish_reason":"length","message":{"role":"assistant","content":"","reasoning":"Thinking it over."}}],"usage":{"prompt_tokens":100,"completion_tokens":1400,"total_tokens":1500,"cost":0}}')
        $ctx.Response.ContentType = 'application/json'
        $ctx.Response.OutputStream.Write($silent, 0, $silent.Length)
        continue
      }
      $content = & $respond $prompt
      $body = [ordered]@{ model = 'stand-in'; choices = @(@{ message = @{ role = 'assistant'; content = $content } }); usage = @{ prompt_tokens = 100; completion_tokens = 100; total_tokens = 200; cost = 0 } } | ConvertTo-Json -Depth 8 -Compress
      $bytes = [Text.Encoding]::UTF8.GetBytes($body)
      $ctx.Response.ContentType = 'application/json'
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      $ctx.Response.StatusCode = 500
    } finally { $ctx.Response.Close() }
  }
}).AddArgument($listener).AddArgument($log).AddArgument($responder.ToString())
$serverHandle = $server.BeginInvoke()

$outPath = Join-Path $tmp 'out.json'
$metricsPath = Join-Path $tmp 'metrics.json'
$logPath = Join-Path $tmp 'writer.log'
$refuseOutPath = Join-Path $tmp 'out-refused.json'
$refuseMetricsPath = Join-Path $tmp 'metrics-refused.json'
$refuseLogPath = Join-Path $tmp 'writer-refused.log'
$silentOutPath = Join-Path $tmp 'out-silent.json'
$silentMetricsPath = Join-Path $tmp 'metrics-silent.json'
$silentLogPath = Join-Path $tmp 'writer-silent.log'
$saved = @{}
foreach ($k in 'ASJ_OPENROUTER_URL','OPENROUTER_API_KEY','GEMINI_API_KEY','ASJ_PROVIDER','ASJ_MODEL','ASJ_FALLBACK_MODELS','ASJ_REWRITE_MODEL') { $saved[$k] = [Environment]::GetEnvironmentVariable($k) }
try {
  $env:ASJ_OPENROUTER_URL = "http://127.0.0.1:$port/"
  $env:OPENROUTER_API_KEY = 'stand-in-key'
  $env:GEMINI_API_KEY = $null
  $env:ASJ_PROVIDER = $null
  $env:ASJ_MODEL = 'stand-in/model'
  $env:ASJ_FALLBACK_MODELS = 'stand-in/fallback'
  $env:ASJ_REWRITE_MODEL = 'stand-in/rewriter'
  # The same engine as this test: pwsh in CI and on the desk.
  $exe = (Get-Process -Id $PID).Path
  # Six slots, so the seventh assignment is the reserve the desk reaches for.
  & $exe -NoProfile -ExecutionPolicy Bypass -File $writer -Only xx -InFile $feedPath -OutFile $outPath `
    -MetricsFile $metricsPath -NoCache -JsonMode -DelayMs 0 -MaxBriefs 6 *> $logPath
  $writerExit = $LASTEXITCODE
  $mainRequests = @($log.requests)
  # The same desk with a rewrite model that refuses every call: its rewrites must go
  # back to the writer's model, not be lost.
  $env:ASJ_REWRITE_MODEL = 'stand-in/refuser'
  & $exe -NoProfile -ExecutionPolicy Bypass -File $writer -Only xx -InFile $feedPath -OutFile $refuseOutPath `
    -MetricsFile $refuseMetricsPath -NoCache -JsonMode -DelayMs 0 -MaxBriefs 6 *> $refuseLogPath
  $refuseExit = $LASTEXITCODE
  $refuseRequests = @($log.requests)[$mainRequests.Count..($log.requests.Count - 1)]
  # And with a rewrite model that answers every call with nothing.
  $beforeSilent = $log.requests.Count
  $env:ASJ_REWRITE_MODEL = 'stand-in/silent'
  & $exe -NoProfile -ExecutionPolicy Bypass -File $writer -Only xx -InFile $feedPath -OutFile $silentOutPath `
    -MetricsFile $silentMetricsPath -NoCache -JsonMode -DelayMs 0 -MaxBriefs 6 *> $silentLogPath
  $silentExit = $LASTEXITCODE
  $silentRequests = @($log.requests)[$beforeSilent..($log.requests.Count - 1)]
} finally {
  foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
  $listener.Stop()
  $listener.Close()
  try { [void]$server.EndInvoke($serverHandle) } catch { }
  $server.Dispose()
}

try {
  Write-Host '[harness] writer against the stand-in model' -ForegroundColor Cyan
  if ($writerExit -ne 0) { Get-Content $logPath | Select-Object -Last 30 | ForEach-Object { Write-Host "    $_" } }
  Assert-Harness 'writer exits cleanly' ($writerExit -eq 0) "exit $writerExit"
  Assert-Harness 'every request sends text messages (the system prompt survives a style check)' (@($log.prompts | Where-Object { $_ -eq 'INVALID-CONTENT' }).Count -eq 0)
  $out = [IO.File]::ReadAllText($outPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $stories = @($out.xx)
  $metrics = [IO.File]::ReadAllText($metricsPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $byId = @{}
  foreach ($s in $stories) { $byId[[string]$s.articleId] = $s }
  $text = { param($s) ((@([string]$s.headline, [string]$s.dek) + @($s.paragraphs) + @([string]$s.why)) -join ' ') }

  Assert-Harness 'six stories published from seven assignments' ($stories.Count -eq 6) "got $($stories.Count)"
  Assert-Harness 'the off-country story is dropped' (-not $byId.ContainsKey('lisbon') -and $metrics.offCountryDropped -eq 1)
  $order = @($stories | ForEach-Object { [string]$_.articleId })
  $scores = @($stories | ForEach-Object { [double]$_.selectionScore })
  $sortedDown = $true
  for ($k = 1; $k -lt $scores.Count; $k++) { if ($scores[$k] -gt $scores[$k - 1]) { $sortedDown = $false } }
  Assert-Harness 'reach orders the country: the outbreak leads, the council budget comes last, missing reach counts as 3' `
    ($order[0] -eq 'cholera' -and $order[-1] -eq 'budget' -and $sortedDown -and [int]$byId['cholera'].reach -eq 5 -and [int]$byId['port'].reach -eq 3 -and [double]$byId['budget'].selectionScore -lt [double]$byId['port'].selectionScore) `
    ("order {0}; scores {1}" -f ($order -join ','), ($scores -join ','))
  Assert-Harness 'a clean draft costs one call and is published as written' ($byId.ContainsKey('port') -and (& $text $byId['port']) -match '400,000 containers')
  $fert = $byId['fert']
  Assert-Harness 'a style rewrite removes the stock phrases' ($fert -and (& $text $fert) -notmatch 'crucial|underscores|broader strategy')
  Assert-Harness 'the rewritten why line no longer hedges' ($fert -and [string]$fert.why -notmatch '\b(may|might|could)\b')
  $rewritePrompt = @($log.prompts | Where-Object { $_ -match 'REPAIR: Your previous draft' -and $_ -match 'Ministry signs fertiliser deal' }) | Select-Object -First 1
  Assert-Harness 'the rewrite request names the phrases and carries the previous draft' ($rewritePrompt -and $rewritePrompt -match 'crucial' -and $rewritePrompt -match 'Previous draft:' -and $rewritePrompt -match '"item":1')
  Assert-Harness 'a stubborn stock phrase is kept after one rewrite, not dropped' ($byId.ContainsKey('budget') -and (& $text $byId['budget']) -match 'pivotal')
  Assert-Harness 'a hedged investor reason is capped at 20' ($byId['tele'] -and [int]$byId['tele'].lenses.investors.score -le 20) "score $($byId['tele'].lenses.investors.score)"
  Assert-Harness 'a direct investor reason keeps its score' ([int]$byId['port'].lenses.investors.score -eq 70)
  $amb = $byId['amb']
  Assert-Harness 'when the rewrite invents a figure, the fact-checked draft is published' ($amb -and (& $text $amb) -notmatch '9,999' -and (& $text $amb) -match '12 much-needed ambulances')
  $cholera = $byId['cholera']
  Assert-Harness 'a month the source never gives is sent back, and the repaired story is published' ($cholera -and (& $text $cholera) -notmatch 'March' -and (& $text $cholera) -match 'November 3')
  $datePrompt = @($log.prompts | Where-Object { $_ -match 'REPAIR: The previous draft named dates' -and $_ -match 'Colera ja matou' }) | Select-Object -First 1
  Assert-Harness 'the date repair names the unsupported date' ($datePrompt -and $datePrompt -match 'March 11, 2026')
  Assert-Harness 'call budget: one per story plus one rewrite or repair each' ($metrics.apiCalls -eq 12) "apiCalls $($metrics.apiCalls)"
  Assert-Harness 'metrics count the paths' ($metrics.styleRewrites -eq 3 -and $metrics.styleFixedByRewrite -eq 1 -and $metrics.styleKeptWithNotes -eq 2 -and $metrics.lensScoresCappedAsSpeculative -ge 1) ("rewrites {0} fixed {1} kept {2} capped {3}" -f $metrics.styleRewrites, $metrics.styleFixedByRewrite, $metrics.styleKeptWithNotes, $metrics.lensScoresCappedAsSpeculative)
  # The scripted drafts paraphrase and date their facts, so a check that misfired on them
  # would cost every story on the desk a rewrite.
  Assert-Harness 'paraphrased, dated drafts are not sent back for copying or relative time' ($metrics.draftsCopyingSource -eq 0 -and $metrics.draftsWithRelativeTime -eq 0) ("copying {0} relative {1}" -f $metrics.draftsCopyingSource, $metrics.draftsWithRelativeTime)

  Write-Host '[harness] style rewrites go to the rewrite model' -ForegroundColor Cyan
  $styleCalls = @($mainRequests | Where-Object { $_.style })
  $firstDrafts = @($mainRequests | Where-Object { -not $_.repair })
  $dateCalls = @($mainRequests | Where-Object { $_.dateRepair })
  Assert-Harness 'every style rewrite is sent to the rewrite model' ($styleCalls.Count -eq 3 -and @($styleCalls | Where-Object { $_.model -ne 'stand-in/rewriter' }).Count -eq 0) (($styleCalls | ForEach-Object { $_.model }) -join ', ')
  Assert-Harness 'a rewrite sends no temperature and no schema limits' (@($styleCalls | Where-Object { $_.temperature -or $_.limits }).Count -eq 0)
  # Haiku 5.5 thinks by default and the thinking is billed against max_tokens: on
  # 10 Nov 2026 that left every one of 193 rewrites empty.
  Assert-Harness 'a rewrite turns the model''s reasoning off and leaves room for the story' (@($styleCalls | Where-Object { -not $_.reasoningOff -or $_.maxTokens -lt 2400 }).Count -eq 0) (($styleCalls | ForEach-Object { "{0}/{1}" -f $_.reasoningOff, $_.maxTokens }) -join ', ')
  Assert-Harness 'first drafts send no reasoning setting' (@($firstDrafts | Where-Object { $_.reasoningOff }).Count -eq 0)
  Assert-Harness 'first drafts stay on the writer model, with temperature and limits' ($firstDrafts.Count -eq 7 -and @($firstDrafts | Where-Object { $_.model -ne 'stand-in/model' -or -not $_.temperature -or -not $_.limits }).Count -eq 0) (($firstDrafts | ForEach-Object { $_.model }) -join ', ')
  Assert-Harness 'a date repair of a first draft stays on the writer model' ($dateCalls.Count -ge 1 -and @($dateCalls | Where-Object { $_.model -ne 'stand-in/model' }).Count -eq 0)
  # Four: three style rewrites, and the fact repair of the one that invented a figure,
  # which the rewrite model is also asked to fix.
  Assert-Harness 'metrics name the rewrite model and count its calls' ($metrics.rewriteModel -eq 'stand-in/rewriter' -and $metrics.rewriteCalls -eq 4 -and @($mainRequests | Where-Object { $_.model -eq 'stand-in/rewriter' }).Count -eq 4 -and $metrics.rewriteRouteErrors -eq 0) ("model {0} calls {1} errors {2}" -f $metrics.rewriteModel, $metrics.rewriteCalls, $metrics.rewriteRouteErrors)

  Write-Host '[harness] a rewrite model that refuses the call' -ForegroundColor Cyan
  $script:logPath = $refuseLogPath
  if ($refuseExit -ne 0) { Get-Content $refuseLogPath | Select-Object -Last 30 | ForEach-Object { Write-Host "    $_" } }
  Assert-Harness 'writer exits cleanly' ($refuseExit -eq 0) "exit $refuseExit"
  $refused = @(([IO.File]::ReadAllText($refuseOutPath, [Text.Encoding]::UTF8) | ConvertFrom-Json).xx)
  $refusedMetrics = [IO.File]::ReadAllText($refuseMetricsPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $refusedCalls = @($refuseRequests | Where-Object { $_.model -eq 'stand-in/refuser' })
  Assert-Harness 'the refusing model is asked once, then left for the run' ($refusedCalls.Count -eq 1 -and $refusedMetrics.rewriteRouteErrors -eq 1 -and $refusedMetrics.rewriteCalls -eq 0) ("asked {0} errors {1} calls {2}" -f $refusedCalls.Count, $refusedMetrics.rewriteRouteErrors, $refusedMetrics.rewriteCalls)
  Assert-Harness 'its rewrites go to the writer model, with the writer settings' (@($refuseRequests | Where-Object { $_.style -and $_.model -eq 'stand-in/model' -and $_.temperature }).Count -eq 3)
  Assert-Harness 'the same six stories are published' ($refused.Count -eq 6 -and $refusedMetrics.styleRewrites -eq 3 -and $refusedMetrics.apiCalls -eq $metrics.apiCalls) ("stories {0} rewrites {1} calls {2}" -f $refused.Count, $refusedMetrics.styleRewrites, $refusedMetrics.apiCalls)

  Write-Host '[harness] a rewrite model that answers with nothing' -ForegroundColor Cyan
  $script:logPath = $silentLogPath
  if ($silentExit -ne 0) { Get-Content $silentLogPath | Select-Object -Last 30 | ForEach-Object { Write-Host "    $_" } }
  Assert-Harness 'writer exits cleanly' ($silentExit -eq 0) "exit $silentExit"
  $quiet = @(([IO.File]::ReadAllText($silentOutPath, [Text.Encoding]::UTF8) | ConvertFrom-Json).xx)
  $quietMetrics = [IO.File]::ReadAllText($silentMetricsPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  $quietCalls = @($silentRequests | Where-Object { $_.model -eq 'stand-in/silent' })
  Assert-Harness 'the silent model is asked three times, then left for the run' ($quietCalls.Count -eq 3 -and $quietMetrics.rewriteEmptyAnswers -eq 3 -and $quietMetrics.rewriteCalls -eq 0) ("asked {0} empty {1} calls {2}" -f $quietCalls.Count, $quietMetrics.rewriteEmptyAnswers, $quietMetrics.rewriteCalls)
  Assert-Harness 'an empty answer is not asked for twice' (@($silentRequests | Where-Object { $_.style -and $_.model -eq 'stand-in/model' }).Count -eq 3)
  Assert-Harness 'the log says the answer was empty, and why' ((Get-Content $silentLogPath -Raw) -match 'answered with no content \(finish_reason=length, 1400 completion tokens')
  Assert-Harness 'the same six stories are published, rewrites and all' ($quiet.Count -eq 6 -and $quietMetrics.styleRewrites -eq 3 -and $quietMetrics.styleFixedByRewrite -eq $metrics.styleFixedByRewrite -and $quietMetrics.apiCalls -eq $metrics.apiCalls) ("stories {0} rewrites {1} fixed {2} calls {3}" -f $quiet.Count, $quietMetrics.styleRewrites, $quietMetrics.styleFixedByRewrite, $quietMetrics.apiCalls)
  Write-Host "[harness] OK - $passed checks"
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
exit 0
