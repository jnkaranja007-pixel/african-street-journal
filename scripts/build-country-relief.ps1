#Requires -Version 5.1
<#
.SYNOPSIS
  Builds data/relief/<cc>.jpg - each country's real shaded relief, in the site's greens -
  and data/relief/index.json, the area each image covers.
.DESCRIPTION
  The Atlas's "Stylized relief" was invented: sine waves seeded by the country code, with
  contour lines drawn on them, so Kenya's highlands were nowhere near the real ones. This
  takes Natural Earth's 1:10m "Gray Earth with Shaded Relief" (GRAY_HR_SR: elevation
  tints plus hill shading, 1/60 degree - about 1.85 km - per pixel, public domain) and cuts
  one image per country with a margin. The raster and the Atlas share one projection
  (plain longitude/latitude), so it is a crop, not a reprojection. The Atlas clips the
  image to the country outline and draws water, places and lines on top.
.PARAMETER CacheDir
  Where GRAY_HR_SR.zip (75 MB) and the unpacked .tif (233 MB) are kept. Run by hand; the
  source has not changed since 2012.
#>
param(
  [string]$CacheDir = (Join-Path ([IO.Path]::GetTempPath()) 'asj-relief-cache'),
  [double]$MarginDeg = 0.5,
  [int]$MaxSide = 1600,
  [int]$Quality = 78
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'data\relief'
New-Item -ItemType Directory -Force -Path $CacheDir, $outDir | Out-Null
Add-Type -AssemblyName System.Drawing

$tif = Join-Path $CacheDir 'GRAY_HR_SR.tif'
if (-not (Test-Path $tif)) {
  $zip = Join-Path $CacheDir 'GRAY_HR_SR.zip'
  Invoke-WebRequest -Uri 'https://naciscdn.org/naturalearth/10m/raster/GRAY_HR_SR.zip' -OutFile $zip -UseBasicParsing -TimeoutSec 1800
  Expand-Archive -Path $zip -DestinationPath $CacheDir -Force
}

# Reads a window of the uncompressed, one-row-per-strip, 8-bit TIFF without loading the
# 233 MB file, and writes it as a green JPEG. Palette: Gray Earth is darker in lowland
# shade and lighter on high ground and lit slopes; that runs from the Atlas's deep green
# to a pale sage, the same family as the rest of the map.
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class AsjRelief {
  static uint[] offsets;
  static int width, height;
  public static void Open(string path) {
    using (var fs = File.OpenRead(path)) using (var br = new BinaryReader(fs)) {
      if (br.ReadUInt16() != 0x4949) throw new Exception("expected a little-endian TIFF");
      br.ReadUInt16();
      fs.Position = br.ReadUInt32();
      int n = br.ReadUInt16();
      uint stripOffsets = 0; int strips = 0; int compression = 1, bits = 8, rowsPerStrip = 0;
      for (int i = 0; i < n; i++) {
        int tag = br.ReadUInt16(); int type = br.ReadUInt16(); uint count = br.ReadUInt32(); uint val = br.ReadUInt32();
        if (tag == 256) width = (int)val; else if (tag == 257) height = (int)val;
        else if (tag == 258) bits = (int)val; else if (tag == 259) compression = (int)val;
        else if (tag == 278) rowsPerStrip = (int)val; else if (tag == 273) { stripOffsets = val; strips = (int)count; }
      }
      if (compression != 1 || bits != 8 || rowsPerStrip != 1) throw new Exception("expected uncompressed 8-bit, one row per strip");
      offsets = new uint[strips];
      fs.Position = stripOffsets;
      for (int i = 0; i < strips; i++) offsets[i] = br.ReadUInt32();
    }
  }
  public static int Width { get { return width; } }
  public static int Height { get { return height; } }
  // Crops columns c0..c1-1 and rows r0..r1-1, keeps every 'step'-th pixel, writes a JPEG.
  public static long Write(string tifPath, string outPath, int c0, int c1, int r0, int r1, int step, long quality) {
    int w = (c1 - c0 + step - 1) / step, h = (r1 - r0 + step - 1) / step;
    var bmp = new Bitmap(w, h, PixelFormat.Format24bppRgb);
    var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
    var row = new byte[c1 - c0];
    var line = new byte[data.Stride];
    using (var fs = File.OpenRead(tifPath)) {
      for (int y = 0; y < h; y++) {
        int r = r0 + y * step;
        fs.Position = offsets[r] + c0;
        int got = 0; while (got < row.Length) { int k = fs.Read(row, got, row.Length - got); if (k <= 0) break; got += k; }
        for (int x = 0; x < w; x++) {
          // Over Africa's land the raster runs from about 138 to 210 (p1-p99); the flat
          // 145-146 is ocean. Stretch 135-212 to the full palette, or it reads washed out.
          double g = (row[x * step] - 135) / 77.0;
          if (g < 0) g = 0; else if (g > 1) g = 1;
          // deep green (34,86,44) -> mid (78,142,76) -> sage (176,196,156); paler than that and
          // the Atlas's white place labels lose contrast on high ground.
          double rr, gg, bb;
          if (g < 0.55) { double t = g / 0.55; rr = 34 + (78 - 34) * t; gg = 86 + (142 - 86) * t; bb = 44 + (76 - 44) * t; }
          else { double t = (g - 0.55) / 0.45; rr = 78 + (176 - 78) * t; gg = 142 + (196 - 142) * t; bb = 76 + (156 - 76) * t; }
          line[x * 3] = (byte)bb; line[x * 3 + 1] = (byte)gg; line[x * 3 + 2] = (byte)rr;
        }
        Marshal.Copy(line, 0, IntPtr.Add(data.Scan0, y * data.Stride), data.Stride);
      }
    }
    bmp.UnlockBits(data);
    var codec = Array.Find(ImageCodecInfo.GetImageEncoders(), c => c.MimeType == "image/jpeg");
    var ps = new EncoderParameters(1);
    ps.Param[0] = new EncoderParameter(Encoder.Quality, quality);
    bmp.Save(outPath, codec, ps);
    bmp.Dispose();
    return new FileInfo(outPath).Length;
  }
}
'@
[AsjRelief]::Open($tif)
if ([AsjRelief]::Width -ne 21600 -or [AsjRelief]::Height -ne 10800) { throw "unexpected raster size $([AsjRelief]::Width)x$([AsjRelief]::Height)" }

$CODES = @('dz','ao','bj','bw','bf','bi','cm','cv','cf','td','km','cg','cd','ci','dj','eg','gq','er','sz','et',
           'ga','gm','gh','gn','gw','ke','ls','lr','ly','mg','mw','ml','mr','mu','ma','mz','na','ne','ng','rw',
           'st','sn','sc','sl','so','za','ss','sd','tz','tg','tn','ug','zm','zw','eh')
$inv = [Globalization.CultureInfo]::InvariantCulture
$index = [ordered]@{}
$total = 0L
foreach ($cc in $CODES) {
  $chunk = [IO.File]::ReadAllText((Join-Path $root "data\countries\$cc.js"), [Text.Encoding]::UTF8)
  $m = [regex]::Match($chunk, '"bbox":\{"minX":([-\d.]+),"minY":([-\d.]+),"maxX":([-\d.]+),"maxY":([-\d.]+)')
  if (-not $m.Success) { Write-Host "  $cc no bbox in its chunk - skipped" -ForegroundColor Yellow; continue }
  # Atlas coordinates are [lon, -lat]: minY is the northern edge.
  $west = [double]::Parse($m.Groups[1].Value, $inv) - $MarginDeg
  $north = -[double]::Parse($m.Groups[2].Value, $inv) + $MarginDeg
  $east = [double]::Parse($m.Groups[3].Value, $inv) + $MarginDeg
  $south = -[double]::Parse($m.Groups[4].Value, $inv) - $MarginDeg
  $c0 = [Math]::Max(0, [int][Math]::Floor(($west + 180) * 60)); $c1 = [Math]::Min(21600, [int][Math]::Ceiling(($east + 180) * 60))
  $r0 = [Math]::Max(0, [int][Math]::Floor((90 - $north) * 60)); $r1 = [Math]::Min(10800, [int][Math]::Ceiling((90 - $south) * 60))
  $step = [Math]::Max(1, [int][Math]::Ceiling([Math]::Max($c1 - $c0, $r1 - $r0) / [double]$MaxSide))
  $bytes = [AsjRelief]::Write($tif, (Join-Path $outDir "$cc.jpg"), $c0, $c1, $r0, $r1, $step, $Quality)
  $total += $bytes
  # The image's edges in degrees: pixel edges, not centres.
  $index[$cc] = [ordered]@{
    w = [Math]::Round(-180 + $c0 / 60.0, 4); e = [Math]::Round(-180 + $c1 / 60.0, 4)
    n = [Math]::Round(90 - $r0 / 60.0, 4); s = [Math]::Round(90 - $r1 / 60.0, 4)
  }
  Write-Host ("  {0}  {1}x{2} px (step {3})  {4} KB" -f $cc, [Math]::Ceiling(($c1 - $c0) / $step), [Math]::Ceiling(($r1 - $r0) / $step), $step, [Math]::Round($bytes / 1KB))
}
$payload = [ordered]@{ source = 'Natural Earth, Gray Earth with Shaded Relief (GRAY_HR_SR, 1:10m), public domain'; countries = $index }
[IO.File]::WriteAllText((Join-Path $outDir 'index.json'), ($payload | ConvertTo-Json -Depth 4 -Compress), (New-Object Text.UTF8Encoding($false)))
Write-Host ("[relief] {0} images, {1} KB in data/relief/" -f $index.Count, [Math]::Round($total / 1KB))
