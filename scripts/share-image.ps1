#Requires -Version 5.1
<#
.SYNOPSIS
  A story's own share image: the country's card (og/<cc>.jpg) with the headline in
  place of the country name.
.DESCRIPTION
  Every story shared to WhatsApp, X or Telegram used to show the same picture as every
  other story from its country, so a feed of ASJ links read as one post repeated. The
  headline in the image is what makes a link worth opening when the preview is all a
  reader sees.

  Drawn with System.Drawing, which Windows PowerShell 5.1 and PowerShell 7 on Windows
  both have, so the desk's runner needs nothing installed. The left of the country card
  is flat background down to the wordmark; the map starts at x=696 (Cabo Verde's
  islands at 648), so the cover stops short of it.
#>

$script:ShareImageReady = $null
function Initialize-ShareImage {
  if ($null -ne $script:ShareImageReady) { return $script:ShareImageReady }
  try {
    Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    $script:ShareImageReady = $true
  } catch {
    Write-Host "[share-image] System.Drawing unavailable, stories keep the country image: $($_.Exception.Message)"
    $script:ShareImageReady = $false
  }
  return $script:ShareImageReady
}

function Get-ShareFont([string[]]$Families, [single]$Size, [Drawing.FontStyle]$Style) {
  foreach ($name in $Families) {
    try {
      $f = New-Object Drawing.Font($name, $Size, $Style, [Drawing.GraphicsUnit]::Pixel)
      if ($f.Name -eq $name) { return $f }
      $f.Dispose()
    } catch {}
  }
  return New-Object Drawing.Font([Drawing.FontFamily]::GenericSerif, $Size, $Style, [Drawing.GraphicsUnit]::Pixel)
}

# Greedy word wrap at one font size; $null when a single word is wider than the box.
function Split-ShareLines($Graphics, $Font, [string]$Text, [single]$Width, $Format) {
  $lines = New-Object System.Collections.Generic.List[string]
  $line = ''
  foreach ($word in ($Text -split '\s+' | Where-Object { $_ })) {
    $try = if ($line) { "$line $word" } else { $word }
    if ($Graphics.MeasureString($try, $Font, 4000, $Format).Width -le $Width) { $line = $try; continue }
    if (-not $line) { return $null }
    $lines.Add($line)
    $line = $word
    if ($Graphics.MeasureString($line, $Font, 4000, $Format).Width -gt $Width) { return $null }
  }
  if ($line) { $lines.Add($line) }
  return ,$lines
}

function New-StoryShareImage([string]$BasePath, [string]$OutPath, [string]$Code, [string]$Kicker, [string]$Headline) {
  if (-not (Initialize-ShareImage)) { return $false }
  if (-not (Test-Path $BasePath) -or -not $Headline) { return $false }
  $base = $null; $bmp = $null; $g = $null
  try {
    $base = [Drawing.Image]::FromFile($BasePath)
    $bmp = New-Object Drawing.Bitmap(1200, 630)
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($base, 0, 0, 1200, 630)
    $bg = $bmp.GetPixel(20, 20)
    $coverRight = if ($Code -eq 'cv') { 642 } else { 652 }
    $brush = New-Object Drawing.SolidBrush($bg)
    $g.FillRectangle($brush, 0, 40, $coverRight, 250)
    $g.FillRectangle($brush, 0, 290, 690, 200)
    $brush.Dispose()
    $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAlias
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $fmt = [Drawing.StringFormat]::GenericTypographic

    # Kicker, spaced like the card's own "TODAY'S DESK".
    $kFont = Get-ShareFont @('Consolas', 'Courier New') 22 ([Drawing.FontStyle]::Regular)
    $kBrush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(95, 191, 106))
    # GenericTypographic measures a space as nothing, so a space advances one cell.
    $cell = $g.MeasureString('M', $kFont, 400, $fmt).Width
    $x = 80.0
    foreach ($ch in $Kicker.ToUpperInvariant().ToCharArray()) {
      $s = [string]$ch
      if ($s -ne ' ') { $g.DrawString($s, $kFont, $kBrush, $x, 72, $fmt) }
      $x += $cell + 4.6
      if ($x -gt 620) { break }
    }
    $kFont.Dispose(); $kBrush.Dispose()

    # The largest headline size that fits the box (540 x 350) in at most five lines.
    $boxW = 540.0; $boxH = 350.0
    $font = $null; $lines = $null; $lineH = 0
    foreach ($size in 66, 60, 56, 52, 48, 44, 40, 36) {
      $f = Get-ShareFont @('Georgia', 'Times New Roman') $size ([Drawing.FontStyle]::Bold)
      $l = Split-ShareLines $g $f $Headline $boxW $fmt
      $h = $size * 1.14
      if ($l -and $l.Count -le 5 -and ($l.Count * $h) -le $boxH) { $font = $f; $lines = $l; $lineH = $h; break }
      $f.Dispose()
    }
    if (-not $font) { return $false }
    $hBrush = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(244, 241, 234))
    $y = 122.0
    foreach ($ln in $lines) { $g.DrawString($ln, $font, $hBrush, 78, $y, $fmt); $y += $lineH }
    $font.Dispose(); $hBrush.Dispose()

    $codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
    $params = New-Object Drawing.Imaging.EncoderParameters(1)
    $params.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, [long]62)
    $bmp.Save($OutPath, $codec, $params)
    $params.Dispose()
    return $true
  } catch {
    Write-Host "[share-image] $Code : $($_.Exception.Message)"
    return $false
  } finally {
    if ($g) { $g.Dispose() }
    if ($bmp) { $bmp.Dispose() }
    if ($base) { $base.Dispose() }
  }
}
