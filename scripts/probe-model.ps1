# Asks one model for one tiny story, several ways, and prints the SHAPE of what came
# back: status, finish reason, which fields the message carries, how long each is,
# what it cost. No story is written and nothing is published.
#
# Why this exists: on 10 Nov 2026 the style-rewrite model answered 193 calls with
# HTTP 200 and no JSON in any of them, and the desk log could not say why. A model
# swap should be tried here first, for a fraction of a cent, not on the edition.
#
#   ./scripts/probe-model.ps1 -Model anthropic/claude-haiku-5.5
param(
  [string]$Model = 'anthropic/claude-haiku-5.5',
  [string]$ApiUrl = 'https://openrouter.ai/api/v1/chat/completions'
)
$ErrorActionPreference = 'Stop'
if ($env:ASJ_OPENROUTER_URL) { $ApiUrl = $env:ASJ_OPENROUTER_URL }
$apiKey = $env:OPENROUTER_API_KEY
if (-not $apiKey) { Write-Host 'OPENROUTER_API_KEY is not set' -ForegroundColor Red; exit 1 }

$system = 'You are a news desk editor. Return only the JSON object asked for. No preamble, no markdown fences.'
$user = @'
Rewrite this draft in plain newspaper English. Keep every fact. Return JSON:
{"stories":[{"item":0,"countryLink":"in-country","topic":"Economy","headline":"...","dek":"...","paragraphs":["...","...","..."],"wordCount":120,"why":"...","lenses":{"investors":{"why":"...","score":10},"farmers":{"why":"...","score":10},"diaspora":{"why":"...","score":10}}}]}

DRAFT
Headline: Kenya sugar output rises 12 percent
Dek: Mills in western Kenya crushed more cane in October, the sugar board said.
Paragraph 1: Kenya's sugar mills produced 68,000 tonnes in October, the Kenya Sugar Board said on Monday in Nairobi.
Paragraph 2: That is 12 percent more than in September. The board credited better cane supply after the rains.
Paragraph 3: Retail prices in Kisumu held at 150 shillings a kilogram, the board said.
'@

$lens = [ordered]@{
  type = 'object'
  properties = [ordered]@{ why = @{ type = 'string' }; score = @{ type = 'integer' } }
  required = @('why','score')
  additionalProperties = $false
}
$story = [ordered]@{
  type = 'object'
  properties = [ordered]@{
    item = @{ type = 'integer' }
    countryLink = @{ type = 'string'; enum = @('in-country','involves-country','none') }
    topic = @{ type = 'string'; enum = @('Economy','Politics','Agriculture','Health') }
    headline = @{ type = 'string' }
    dek = @{ type = 'string' }
    paragraphs = @{ type = 'array'; items = @{ type = 'string' } }
    wordCount = @{ type = 'integer' }
    why = @{ type = 'string' }
    lenses = [ordered]@{
      type = 'object'
      properties = [ordered]@{ investors = $lens; farmers = $lens; diaspora = $lens }
      required = @('investors','farmers','diaspora')
      additionalProperties = $false
    }
  }
  required = @('item','countryLink','topic','headline','dek','paragraphs','wordCount','why','lenses')
  additionalProperties = $false
}
$format = [ordered]@{
  type = 'json_schema'
  json_schema = [ordered]@{
    name = 'asj_country_desk'
    strict = $true
    schema = [ordered]@{
      type = 'object'
      properties = [ordered]@{ stories = @{ type = 'array'; items = $story } }
      required = @('stories')
      additionalProperties = $false
    }
  }
}

function New-Body([int]$MaxTokens, [bool]$Schema, [bool]$Require, $Reasoning) {
  $b = [ordered]@{
    model = $Model
    messages = @(@{ role = 'system'; content = $system }, @{ role = 'user'; content = $user })
    max_tokens = $MaxTokens
    usage = @{ include = $true }
  }
  if ($Schema) { $b['response_format'] = $format }
  if ($Require) { $b['provider'] = @{ require_parameters = $true; allow_fallbacks = $true } }
  if ($null -ne $Reasoning) { $b['reasoning'] = $Reasoning }
  return $b
}

function Show-Text([string]$Label, $Value) {
  if ($null -eq $Value) { Write-Host ("    {0}: (absent)" -f $Label); return }
  $s = if ($Value -is [string]) { $Value } else { ($Value | ConvertTo-Json -Depth 8 -Compress) }
  $kind = if ($Value -is [string]) { 'string' } else { $Value.GetType().Name }
  $head = ($s -replace '\s+', ' ')
  if ($head.Length -gt 220) { $head = $head.Substring(0, 220) + ' ...' }
  Write-Host ("    {0}: {1}, {2} chars: {3}" -f $Label, $kind, $s.Length, $head)
}

$variants = @(
  @{ name = 'A. as the desk sends it (1400 tokens, schema, require_parameters)'; body = (New-Body 1400 $true $true $null) },
  @{ name = 'B. same, 6000 tokens'; body = (New-Body 6000 $true $true $null) },
  @{ name = 'C. schema, no require_parameters, 6000 tokens'; body = (New-Body 6000 $true $false $null) },
  @{ name = 'D. no schema at all, 1400 tokens'; body = (New-Body 1400 $false $false $null) },
  @{ name = 'E. schema, reasoning disabled, 1400 tokens'; body = (New-Body 1400 $true $false @{ enabled = $false }) },
  @{ name = 'F. schema, reasoning effort low, 6000 tokens'; body = (New-Body 6000 $true $false @{ effort = 'low' }) }
)

Write-Host ("model: {0}" -f $Model)
foreach ($v in $variants) {
  Write-Host ''
  Write-Host ("== {0}" -f $v.name)
  $json = $v.body | ConvertTo-Json -Depth 20 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $headers = @{
    'Authorization' = "Bearer $apiKey"
    'Content-Type' = 'application/json'
    'HTTP-Referer' = 'https://africanstreetjournal.com'
    'X-Title' = 'The African Street Journal'
  }
  $text = ''
  try {
    $resp = Invoke-WebRequest -Uri $ApiUrl -Method Post -Headers $headers -Body $bytes -TimeoutSec 120 -UseBasicParsing -ErrorAction Stop
    $text = [Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
    Write-Host ("    HTTP {0}, body {1} chars" -f [int]$resp.StatusCode, $text.Length)
  } catch {
    $status = 0; $detail = ''
    $r0 = $_.Exception.Response
    if ($r0) { try { $status = [int]$r0.StatusCode } catch { $status = 0 } }
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail = [string]$_.ErrorDetails.Message }
    if (-not $detail -and $r0 -and $r0.Content) { try { $detail = [string]$r0.Content.ReadAsStringAsync().GetAwaiter().GetResult() } catch { } }
    if (-not $detail) { $detail = $_.Exception.Message }
    $detail = ($detail -replace '\s+', ' ')
    if ($detail.Length -gt 500) { $detail = $detail.Substring(0, 500) }
    Write-Host ("    HTTP {0}: {1}" -f $status, $detail)
    continue
  }
  $obj = $null
  try { $obj = $text | ConvertFrom-Json } catch { Write-Host ("    body is not JSON: {0}" -f $text.Substring(0, [Math]::Min(300, $text.Length))); continue }
  Write-Host ("    top-level fields: {0}" -f (@($obj.PSObject.Properties.Name) -join ', '))
  if ($obj.error) { Show-Text 'error' $obj.error }
  Write-Host ("    served: model={0} provider={1}" -f $obj.model, $obj.provider)
  $choices = @($obj.choices)
  Write-Host ("    choices: {0}" -f $choices.Count)
  if ($choices.Count) {
    $c = $choices[0]
    Write-Host ("    choice fields: {0}" -f (@($c.PSObject.Properties.Name) -join ', '))
    Write-Host ("    finish_reason={0} native_finish_reason={1}" -f $c.finish_reason, $c.native_finish_reason)
    if ($c.error) { Show-Text 'choice.error' $c.error }
    if ($c.message) {
      Write-Host ("    message fields: {0}" -f (@($c.message.PSObject.Properties.Name) -join ', '))
      Show-Text 'content' $c.message.content
      Show-Text 'reasoning' $c.message.reasoning
      Show-Text 'refusal' $c.message.refusal
      Show-Text 'tool_calls' $c.message.tool_calls
    }
  }
  if ($obj.usage) { Show-Text 'usage' $obj.usage }
}
exit 0
