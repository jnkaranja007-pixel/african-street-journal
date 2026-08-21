#Requires -Version 5.1
<#
.SYNOPSIS
  Regression checks for selected-article evidence extraction.
#>

$ErrorActionPreference = 'Stop'
$fetcher = Join-Path $PSScriptRoot 'fetch-news.ps1'
$source = [IO.File]::ReadAllText($fetcher, [Text.Encoding]::UTF8)
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'fetcher could not be parsed for article evidence tests' }

$definitions = New-Object System.Collections.Generic.List[string]
foreach ($functionName in @(
  'Repair-Mojibake',
  'Clear-Html',
  'Get-TextWordCount',
  'Limit-EvidenceText',
  'Find-JsonArticleBody',
  'Convert-ArticleHtmlToEvidence'
)) {
  $definition = $ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $functionName
  }, $true) | Select-Object -First 1
  if (-not $definition) { throw "fetcher is missing $functionName" }
  $definitions.Add($definition.Extent.Text)
}

# The fixtures are ASCII, so disable mojibake repair while exercising the production
# HTML selection and cleanup functions verbatim.
$MOJI_PATTERN = '(?!)'
$REPL_CHAR = [string][char]0xFFFD
Invoke-Expression ($definitions.ToArray() -join "`n")

$articleHtml = @'
<html><body><article>
  <p>The transport ministry moved the freight opening to Friday after completing its safety review.</p>
  <p>Registered drivers must report at the northern checkpoint before loading goods for the capital market.</p>
  <p>READ ALSO: A separate election report with 999 unsupported claims.</p>
  <p>This unrelated story must never enter the selected article evidence.</p>
</article></body></html>
'@
$evidence = Convert-ArticleHtmlToEvidence $articleHtml 1200
if ($evidence -notmatch 'transport ministry' -or $evidence -notmatch 'Registered drivers') {
  throw 'article paragraphs were not extracted'
}
Write-Host 'PASS article paragraphs are extracted'

if ($evidence -match '999|unrelated story|READ ALSO') {
  throw 'related-story content crossed the article boundary'
}
Write-Host 'PASS extraction stops before related-story content'

$body = ((1..30 | ForEach-Object { 'Structured evidence carries only source facts.' }) -join ' ')
$json = @{ '@type' = 'NewsArticle'; articleBody = $body } | ConvertTo-Json -Compress
$jsonHtml = "<html><script type=`"application/ld+json`">$json</script><article><p>Fallback text should not win.</p></article></html>"
$structured = Convert-ArticleHtmlToEvidence $jsonHtml 900
if ($structured -notmatch '^Structured evidence' -or $structured -match 'Fallback text') {
  throw 'structured articleBody was not preferred'
}
if ($structured.Length -gt 900) { throw 'structured evidence exceeded its character cap' }
Write-Host 'PASS structured articleBody is preferred and capped'

Write-Host '[article-evidence] OK - 3 checks'
exit 0
