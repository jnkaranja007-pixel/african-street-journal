#Requires -Version 5.1
<#
.SYNOPSIS
  Write a review sheet for a language still in review: each English story beside its
  machine translation, for a native speaker to judge before the language goes live.
.DESCRIPTION
  Amharic, Hausa, Somali and isiZulu are languages Gemini writes less well than French or
  Swahili, and the number check cannot catch a wrong meaning. So a language whose
  data/i18n file says "status": "review" gets no public pages (build-lang-pages.ps1
  stops), only this sheet: the language-review workflow translates about ten of its
  country's newest stories and this lays them out side by side. The owner sends it to a
  native speaker; if they pass it, the language gets its menu words and goes live.
.PARAMETER InFile
  The translations (translate-briefs.ps1 -OutFile). Default data/briefs-<Lang>.json.
#>
param(
  [Parameter(Mandatory = $true)][string]$Lang,
  [string]$InFile = '',
  [string]$OutFile = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$utf8 = New-Object Text.UTF8Encoding($false)
function Read-Json([string]$Path) { return ([IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) | ConvertFrom-Json) }
function Esc([string]$s) { return [Net.WebUtility]::HtmlEncode($s) }
if (-not $InFile) { $InFile = Join-Path $root "data\briefs-$Lang.json" }
if (-not $OutFile) { $OutFile = Join-Path $root "review-$Lang.html" }

$i18n = Read-Json (Join-Path $root "data\i18n\$Lang.json")
$store = Read-Json $InFile
$state = Read-Json (Join-Path $root 'data\briefs-state.json')
$english = @{}
foreach ($prop in $state.byCountry.PSObject.Properties) { foreach ($b in @($prop.Value)) { if ($b.articleId) { $english[[string]$b.articleId] = @{ code = $prop.Name; b = $b } } } }

$name = [string]$i18n.englishName
$own = [string]$i18n.name
$dir = if ($i18n.dir) { [string]$i18n.dir } else { 'ltr' }
$cards = New-Object System.Collections.Generic.List[string]
$n = 0
foreach ($p in $store.stories.PSObject.Properties) {
  $en = $english[$p.Name]
  if (-not $en) { continue }
  $n++
  $b = $en.b; $t = $p.Value
  $rows = New-Object System.Collections.Generic.List[string]
  $rows.Add("<div class=""pair head""><div class=""en"" lang=""en"">$(Esc $b.headline)</div><div class=""tr"" lang=""$Lang"" dir=""$dir"">$(Esc $t.headline)</div></div>")
  $rows.Add("<div class=""pair dek""><div class=""en"" lang=""en"">$(Esc $b.dek)</div><div class=""tr"" lang=""$Lang"" dir=""$dir"">$(Esc $t.dek)</div></div>")
  $enP = @($b.paragraphs | Where-Object { [string]$_ })
  $trP = @($t.paragraphs)
  for ($i = 0; $i -lt $enP.Count; $i++) {
    $tp = if ($i -lt $trP.Count) { [string]$trP[$i] } else { '' }
    $rows.Add("<div class=""pair""><div class=""en"" lang=""en"">$(Esc $enP[$i])</div><div class=""tr"" lang=""$Lang"" dir=""$dir"">$(Esc $tp)</div></div>")
  }
  $rows.Add("<div class=""pair why""><div class=""en"" lang=""en""><b>Why it matters:</b> $(Esc $b.why)</div><div class=""tr"" lang=""$Lang"" dir=""$dir"">$(Esc $t.why)</div></div>")
  $cards.Add("<section class=""story""><h2>Story $n &middot; $(Esc ([string]$en.code).ToUpperInvariant())</h2>$($rows -join '')<p class=""verdict"">Verdict: Good &#9744; &nbsp; Small fixes &#9744; &nbsp; Wrong meaning &#9744; &nbsp; Notes: ______________</p></section>")
}

$html = @"
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>$name review sheet</title>
<style>
:root{--bg:#f5f2eb;--ink:#1d1b18;--dim:#6b665e;--rule:#ddd6c8;--card:#fffdf8;--green:#2e7d32}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#131313;--ink:#e8e6e3;--dim:#9a958e;--rule:#2c2c2c;--card:#1a1a1a;--green:#66bb6a}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,'Segoe UI','Noto Sans Ethiopic','Nyala',sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 60px}
h1{font-size:26px;margin:0 0 8px}
.intro{color:var(--dim);max-width:70ch}
.story{background:var(--card);border:1px solid var(--rule);border-radius:10px;padding:16px;margin:22px 0}
.story h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--green);margin:0 0 10px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:8px 0;border-top:1px solid var(--rule)}
.pair:first-of-type{border-top:0}
.head div{font-weight:700;font-size:18px}
.dek div{color:var(--dim)}
.en{color:var(--dim)}
.verdict{margin:12px 0 0;font-size:14px}
@media (max-width:700px){.pair{grid-template-columns:1fr;gap:6px}.tr{padding-bottom:4px}}
</style>
</head>
<body>
<main>
<h1>$name ($(Esc $own)) translation check</h1>
<p class="intro">The African Street Journal is thinking of publishing its news in $name. Below are $n real stories: the English on the left (on a phone, first) and the machine translation beside it. Please read the translation as a reader would and tell us, for each story: is it <b>good</b>, does it need <b>small fixes</b>, or does it get the <b>meaning wrong</b>? Note any word that sounds machine-made, any name spelled wrongly, and anything a reader would find odd or offensive. Nothing here is published.</p>
$($cards -join "`n")
</main>
</body>
</html>
"@
[IO.File]::WriteAllText($OutFile, $html, $utf8)
Write-Host "[$Lang] review sheet: $n stories -> $OutFile"
exit 0
