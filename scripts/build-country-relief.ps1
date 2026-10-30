#Requires -Version 5.1
<#
.SYNOPSIS
  Builds data/relief/<cc>.jpg - each country's real shaded relief, in the site's greens -
  and data/relief/index.json, the area each image covers.
.DESCRIPTION
  The Atlas's "Stylized relief" was invented: sine waves seeded by the country code. The
  first real relief was a crop of Natural Earth's GRAY_HR_SR, which is 1/60 degree (about
  1.85 km) a pixel everywhere: Algeria got 1,300 pixels across, Rwanda 183 and Sao Tome
  121, stretched seven to ten times on a phone. This shades each country from elevation
  instead, at a resolution chosen for that country, so every image is about MaxSide
  pixels on its long side.

  Elevation: Mapzen's Terrain Tiles on AWS (s3://elevation-tiles-prod, terrarium PNG:
  metres = R*256 + G + B/256 - 32768). Over Africa they are SRTM, GMTED2010 and ETOPO1,
  all public domain. For each country the script picks the coarsest zoom whose pixels are
  no larger than the output's, downloads those tiles once into CacheDir, mosaics them,
  resamples Web Mercator to the Atlas's plain longitude/latitude grid (3x3 samples a
  pixel, so a downsample does not alias), shades it (Horn gradient, light from the
  north-west with two softer fills) and tints it by height.

  Shading depends on pixel size - a 1.6 km pixel averages a valley away that a 250 m
  pixel keeps - so the vertical exaggeration grows with the pixel size and a big country
  does not come out flatter than a small one.
.PARAMETER CacheDir
  Where the tiles are kept (about 4,000 files, 300-400 MB for all 55). Run by hand; the
  sources do not change.
#>
param(
  [string]$CacheDir = (Join-Path ([IO.Path]::GetTempPath()) 'asj-terrain-cache'),
  [double]$MarginDeg = 0.5,
  [int]$MaxSide = 1400,
  [int]$Quality = 76,
  # The tone curve: palette position = base + tint x height + gain x (shade - flat).
  # Tuned so the mean, median and 95th percentile match the Natural Earth images within
  # a few levels (Kenya 108/101/166 against 110/105/166) at nine times the detail.
  [double]$ToneBase = 0.25, [double]$ToneTint = 0.52, [double]$ToneShadow = 2.7, [double]$ToneLight = 3.6,
  [string[]]$Only = @()
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'data\relief'
New-Item -ItemType Directory -Force -Path $CacheDir, $outDir | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Add-Type -ReferencedAssemblies System.Drawing, System.Net.Http -TypeDefinition @'
using System;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class AsjDem {
  // Downloads the tiles not already cached, a few at a time. Returns how many failed.
  public static int Fetch(string[] urls, string[] paths, int parallel) {
    var client = new HttpClient();
    client.Timeout = TimeSpan.FromSeconds(120);
    var gate = new SemaphoreSlim(parallel);
    int failed = 0;
    var tasks = new List<Task>();
    for (int i = 0; i < urls.Length; i++) {
      if (File.Exists(paths[i]) && new FileInfo(paths[i]).Length > 0) continue;
      string u = urls[i], p = paths[i];
      tasks.Add(Task.Run(async () => {
        await gate.WaitAsync();
        try {
          for (int attempt = 0; attempt < 4; attempt++) {
            try {
              byte[] bytes = await client.GetByteArrayAsync(u);
              Directory.CreateDirectory(Path.GetDirectoryName(p));
              File.WriteAllBytes(p + ".part", bytes);
              if (File.Exists(p)) File.Delete(p);
              File.Move(p + ".part", p);
              return;
            } catch { Thread.Sleep(1500 * (attempt + 1)); }
          }
          Interlocked.Increment(ref failed);
        } finally { gate.Release(); }
      }));
    }
    Task.WaitAll(tasks.ToArray());
    return failed;
  }

  static float At(float[] dem, int w, int h, int x, int y) {
    if (x < 0) x = 0; else if (x >= w) x = w - 1;
    if (y < 0) y = 0; else if (y >= h) y = h - 1;
    return dem[y * w + x];
  }
  static double Bilinear(float[] dem, int w, int h, double x, double y) {
    int x0 = (int)Math.Floor(x), y0 = (int)Math.Floor(y);
    double fx = x - x0, fy = y - y0;
    double a = At(dem, w, h, x0, y0), b = At(dem, w, h, x0 + 1, y0);
    double c = At(dem, w, h, x0, y0 + 1), d = At(dem, w, h, x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  static double Shade(double dzdx, double dzdy, double azimuthDeg, double altitudeDeg) {
    double zenith = (90 - altitudeDeg) * Math.PI / 180;
    double az = ((360 - azimuthDeg + 90) % 360) * Math.PI / 180;
    double slope = Math.Atan(Math.Sqrt(dzdx * dzdx + dzdy * dzdy));
    double aspect = Math.Atan2(dzdy, -dzdx);
    double v = Math.Cos(zenith) * Math.Cos(slope) + Math.Sin(zenith) * Math.Sin(slope) * Math.Cos(az - aspect);
    return v < 0 ? 0 : v;
  }

  public static long Build(string tileDir, int z, int tx0, int ty0, int nx, int ny,
                           double west, double north, double degPerPx, int W, int H,
                           double exaggeration, string outPath, long quality,
                           double toneBase, double toneTint, double toneShadow, double toneLight) {
    int MW = nx * 256, MH = ny * 256;
    var dem = new float[MW * MH];
    var buf = new byte[256 * 256 * 4];
    for (int j = 0; j < ny; j++) for (int i = 0; i < nx; i++) {
      string p = Path.Combine(tileDir, z.ToString(), (tx0 + i).ToString(), (ty0 + j).ToString() + ".png");
      using (var fs = File.OpenRead(p))
      using (var img = Image.FromStream(fs, false, false))
      using (var bmp = new Bitmap(img)) {
        var d = bmp.LockBits(new Rectangle(0, 0, 256, 256), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        Marshal.Copy(d.Scan0, buf, 0, d.Stride * 256);
        int stride = d.Stride;
        bmp.UnlockBits(d);
        for (int y = 0; y < 256; y++) for (int x = 0; x < 256; x++) {
          int o = y * stride + x * 4;
          double e = buf[o + 2] * 256.0 + buf[o + 1] + buf[o] / 256.0 - 32768;
          // The tiles carry the seabed. Shaded, it drew blurred hills round the Comoros;
          // here the sea is flat, so the coast is the edge. (Lake Assal and the Qattara
          // Depression lose their floors below sea level, not their rims.)
          if (e < 0) e = 0;
          dem[(j * 256 + y) * MW + i * 256 + x] = (float)e;
        }
      }
    }

    // Web Mercator mosaic -> plain lon/lat grid, 3x3 samples a pixel.
    double world = 256.0 * Math.Pow(2, z);
    var grid = new float[W * H];
    for (int y = 0; y < H; y++) {
      for (int x = 0; x < W; x++) {
        double sum = 0;
        for (int sy = 0; sy < 3; sy++) {
          double lat = north - (y + (sy + 0.5) / 3.0) * degPerPx;
          if (lat > 85) lat = 85; else if (lat < -85) lat = -85;
          double r = lat * Math.PI / 180;
          double py = (1 - Math.Log(Math.Tan(r) + 1 / Math.Cos(r)) / Math.PI) / 2 * world - ty0 * 256 - 0.5;
          for (int sx = 0; sx < 3; sx++) {
            double lon = west + (x + (sx + 0.5) / 3.0) * degPerPx;
            double px = (lon + 180) / 360 * world - tx0 * 256 - 0.5;
            sum += Bilinear(dem, MW, MH, px, py);
          }
        }
        grid[y * W + x] = (float)(sum / 9);
      }
    }

    var bmpOut = new Bitmap(W, H, PixelFormat.Format24bppRgb);
    var data = bmpOut.LockBits(new Rectangle(0, 0, W, H), ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);
    var line = new byte[data.Stride];
    double cellY = degPerPx * 110574.0;
    double flat = Math.Sin(45 * Math.PI / 180);
    for (int y = 0; y < H; y++) {
      double lat = north - (y + 0.5) * degPerPx;
      double cellX = degPerPx * 111320.0 * Math.Cos(lat * Math.PI / 180);
      for (int x = 0; x < W; x++) {
        double a = At(grid, W, H, x - 1, y - 1), b = At(grid, W, H, x, y - 1), c = At(grid, W, H, x + 1, y - 1);
        double d = At(grid, W, H, x - 1, y), f = At(grid, W, H, x + 1, y);
        double g = At(grid, W, H, x - 1, y + 1), h = At(grid, W, H, x, y + 1), k = At(grid, W, H, x + 1, y + 1);
        double dzdx = ((c + 2 * f + k) - (a + 2 * d + g)) / (8 * cellX) * exaggeration;
        double dzdy = ((g + 2 * h + k) - (a + 2 * b + c)) / (8 * cellY) * exaggeration;
        double hs = 0.6 * Shade(dzdx, dzdy, 315, 45) + 0.2 * Shade(dzdx, dzdy, 270, 45) + 0.2 * Shade(dzdx, dzdy, 0, 45);
        double e = grid[y * W + x];
        double tint = e <= 0 ? 0 : Math.Pow(Math.Min(1, e / 3000.0), 0.6);
        // Flat lowland sits in the deep greens, high ground and lit slopes go toward sage,
        // shadowed slopes darker - the same palette the Natural Earth crop used. Lit
        // slopes get their own gain: with one gain for both, the highlights sat 20-30
        // levels below Natural Earth's and the relief read flat and dark.
        double lit = hs - flat;
        double v = toneBase + toneTint * tint + (lit > 0 ? toneLight : toneShadow) * lit;
        if (v < 0) v = 0; else if (v > 1) v = 1;
        double rr, gg, bb;
        if (v < 0.55) { double t = v / 0.55; rr = 34 + (78 - 34) * t; gg = 86 + (142 - 86) * t; bb = 44 + (76 - 44) * t; }
        else { double t = (v - 0.55) / 0.45; rr = 78 + (176 - 78) * t; gg = 142 + (196 - 142) * t; bb = 76 + (156 - 76) * t; }
        line[x * 3] = (byte)bb; line[x * 3 + 1] = (byte)gg; line[x * 3 + 2] = (byte)rr;
      }
      Marshal.Copy(line, 0, IntPtr.Add(data.Scan0, y * data.Stride), data.Stride);
    }
    bmpOut.UnlockBits(data);
    var codec = Array.Find(ImageCodecInfo.GetImageEncoders(), cc => cc.MimeType == "image/jpeg");
    var ps = new EncoderParameters(1);
    ps.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
    bmpOut.Save(outPath, codec, ps);
    bmpOut.Dispose();
    return new FileInfo(outPath).Length;
  }
}
'@

function Get-TileX([double]$Lon, [int]$Z) { [int][Math]::Floor(($Lon + 180) / 360 * [Math]::Pow(2, $Z)) }
function Get-TileY([double]$Lat, [int]$Z) {
  # 85.0, not 85: [Math]::Min(85, -0.55) takes the integer overload and returns -1, which cut Rwanda's northern tile row off.
  $Lat = [Math]::Max(-85.0, [Math]::Min(85.0, $Lat))
  $r = $Lat * [Math]::PI / 180
  [int][Math]::Floor((1 - [Math]::Log([Math]::Tan($r) + 1 / [Math]::Cos($r)) / [Math]::PI) / 2 * [Math]::Pow(2, $Z))
}

$CODES = @('dz','ao','bj','bw','bf','bi','cm','cv','cf','td','km','cg','cd','ci','dj','eg','gq','er','sz','et',
           'ga','gm','gh','gn','gw','ke','ls','lr','ly','mg','mw','ml','mr','mu','ma','mz','na','ne','ng','rw',
           'st','sn','sc','sl','so','za','ss','sd','tz','tg','tn','ug','zm','zw','eh')
# -File passes "-Only rw,ke" as one string.
$Only = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($Only.Count) { $CODES = @($CODES | Where-Object { $Only -contains $_ }) }
$inv = [Globalization.CultureInfo]::InvariantCulture
$indexPath = Join-Path $outDir 'index.json'
$index = [ordered]@{}
if ($Only.Count -and (Test-Path $indexPath)) {
  $old = [IO.File]::ReadAllText($indexPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($p in $old.countries.PSObject.Properties) { $index[$p.Name] = $p.Value }
}

# Plan every country first, so all the downloads run in one parallel batch.
$plans = New-Object System.Collections.Generic.List[object]
foreach ($cc in $CODES) {
  $chunk = [IO.File]::ReadAllText((Join-Path $root "data\countries\$cc.js"), [Text.Encoding]::UTF8)
  $m = [regex]::Match($chunk, '"bbox":\{"minX":([-\d.]+),"minY":([-\d.]+),"maxX":([-\d.]+),"maxY":([-\d.]+)')
  if (-not $m.Success) { Write-Host "  $cc no bbox in its chunk - skipped" -ForegroundColor Yellow; continue }
  # Atlas coordinates are [lon, -lat]: minY is the northern edge.
  $west = [double]::Parse($m.Groups[1].Value, $inv) - $MarginDeg
  $north = -[double]::Parse($m.Groups[2].Value, $inv) + $MarginDeg
  $east = [double]::Parse($m.Groups[3].Value, $inv) + $MarginDeg
  $south = -[double]::Parse($m.Groups[4].Value, $inv) - $MarginDeg
  $deg = [Math]::Max($east - $west, $north - $south) / $MaxSide
  $W = [int][Math]::Ceiling(($east - $west) / $deg); $H = [int][Math]::Ceiling(($north - $south) / $deg)
  $east = $west + $W * $deg; $south = $north - $H * $deg
  # The coarsest zoom whose pixels (at the equator, smaller elsewhere) are no larger than ours.
  $z = 0; while ((360 / (256 * [Math]::Pow(2, $z))) -gt $deg -and $z -lt 12) { $z++ }
  $tx0 = Get-TileX $west $z; $tx1 = Get-TileX ($east - 1e-9) $z
  $ty0 = Get-TileY $north $z; $ty1 = Get-TileY ($south + 1e-9) $z
  $plans.Add([pscustomobject]@{ cc = $cc; west = $west; north = $north; east = $east; south = $south; deg = $deg; W = $W; H = $H
                                z = $z; tx0 = $tx0; ty0 = $ty0; nx = $tx1 - $tx0 + 1; ny = $ty1 - $ty0 + 1 })
}

$urls = New-Object System.Collections.Generic.List[string]
$paths = New-Object System.Collections.Generic.List[string]
$seen = @{}
foreach ($p in $plans) {
  for ($i = 0; $i -lt $p.nx; $i++) { for ($j = 0; $j -lt $p.ny; $j++) {
    $key = "$($p.z)/$($p.tx0 + $i)/$($p.ty0 + $j)"
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = $true
    $urls.Add("https://s3.amazonaws.com/elevation-tiles-prod/terrarium/$key.png")
    $paths.Add((Join-Path $CacheDir ($key.Replace('/', '\') + '.png')))
  } }
}
Write-Host ("[relief] {0} tiles for {1} countries; fetching the ones not cached" -f $urls.Count, $plans.Count)
$failed = [AsjDem]::Fetch($urls.ToArray(), $paths.ToArray(), 12)
if ($failed) { throw "$failed tile(s) failed to download; run again to retry" }

$total = 0L
foreach ($p in $plans) {
  # Metres a pixel at the country's middle latitude, and the exaggeration for it: about
  # 3.5x at Rwanda's 240 m, 7x at Kenya's 850 m, 10x at Congo-Kinshasa's 1.6 km.
  $midLat = ($p.north + $p.south) / 2
  $metres = $p.deg * 111320 * [Math]::Cos($midLat * [Math]::PI / 180)
  $ex = [Math]::Max(2.0, [Math]::Min(12.0, [Math]::Pow($metres / 25, 0.55)))
  $out = Join-Path $outDir "$($p.cc).jpg"
  $bytes = [AsjDem]::Build($CacheDir, $p.z, $p.tx0, $p.ty0, $p.nx, $p.ny, $p.west, $p.north, $p.deg, $p.W, $p.H, $ex, $out, $Quality, $ToneBase, $ToneTint, $ToneShadow, $ToneLight)
  $total += $bytes
  $index[$p.cc] = [ordered]@{
    w = [Math]::Round($p.west, 4); e = [Math]::Round($p.east, 4)
    n = [Math]::Round($p.north, 4); s = [Math]::Round($p.south, 4)
  }
  Write-Host ("  {0}  {1}x{2} px  z{3}  {4:N0} m/px  x{5:N1}  {6} KB" -f $p.cc, $p.W, $p.H, $p.z, $metres, $ex, [Math]::Round($bytes / 1KB))
}
$payload = [ordered]@{
  source = 'Elevation: Mapzen Terrain Tiles on AWS (SRTM, GMTED2010, ETOPO1; public domain), hill-shaded for the Atlas'
  countries = $index
}
[IO.File]::WriteAllText($indexPath, ($payload | ConvertTo-Json -Depth 4 -Compress), (New-Object Text.UTF8Encoding($false)))
Write-Host ("[relief] {0} images, {1} KB written" -f $plans.Count, [Math]::Round($total / 1KB))
