#Requires -Version 5.1
<#
.SYNOPSIS
  Builds a shaded-relief image for every country's Atlas from Natural Earth, writes
  data/relief/<cc>.png and data/country-relief.json, and re-splits the country chunks.
.DESCRIPTION
  The Atlas used to paint "stylized relief": sine-wave noise seeded by the country code,
  labelled decorative because it was. This replaces it with real terrain.

  Source: Natural Earth 1:10m "Gray Earth with Shaded Relief, Hypsography and Flat Water"
  (GRAY_HR_SR), public domain, 21600 x 10800 pixels of one arc-minute (~1.85 km) on the
  same plain longitude/latitude grid the site's maps use, so nothing is reprojected.
  Download it once (75 MB zip, 233 MB TIFF; not committed):
    https://naturalearth.s3.amazonaws.com/10m_raster/GRAY_HR_SR.zip
    (or https://naciscdn.org/naturalearth/10m/raster/GRAY_HR_SR.zip)

  For each country: crop its detail outline's bounding box plus a small margin, shrink by
  a whole factor to at most -MaxSide pixels on the long side (bounds stay exact), blank
  every pixel outside the outline (transparent, so it compresses to almost nothing and
  neighbours never show), map the gray to -Levels greens, and write a palette PNG. The
  browser draws it under the verified layers only when the Atlas tab opens.

  The pixel work is compiled C# (Add-Type), like split-app-data.ps1, and uses only .NET's
  DeflateStream: it runs on Windows PowerShell 5.1 and pwsh 7, on Windows or Linux.
.USAGE
  powershell -File scripts/build-country-relief.ps1 -Tif C:\data\GRAY_HR_SR.tif
  pwsh -File scripts/build-country-relief.ps1 -Tif ./GRAY_HR_SR.tif -Only ke,ls
#>
param(
  [Parameter(Mandatory)][string]$Tif,
  [int]$MaxSide = 640,
  [int]$Levels = 32,
  # The gray range of African land in GRAY_HR_SR: sea is ~145, lowland ~160-180, high
  # ground and sunlit slopes up to ~230. Values outside clamp to the darkest/lightest green.
  [int]$Low = 150,
  [int]$High = 232,
  [string]$Only = '',
  [switch]$NoSplit
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $root 'data'
$outDir = Join-Path $dataDir 'relief'
$inv = [Globalization.CultureInfo]::InvariantCulture

$refs = @()
if ($PSVersionTable.PSEdition -eq 'Core') { $refs = @('System.IO.Compression', 'System.Collections') }
$src = @'
using System;
using System.IO;
using System.IO.Compression;
using System.Collections.Generic;

public static class AsjRelief {
  // Rows r0..r1-1, columns c0..c1-1 of an uncompressed 8-bit TIFF, given each row's offset.
  public static byte[] Crop(string path, long[] rowOffsets, int c0, int c1, int r0, int r1) {
    int w = c1 - c0, h = r1 - r0;
    byte[] outp = new byte[w * h];
    using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 16)) {
      for (int r = 0; r < h; r++) {
        fs.Seek(rowOffsets[r0 + r] + c0, SeekOrigin.Begin);
        int got = 0;
        while (got < w) { int n = fs.Read(outp, r * w + got, w - got); if (n <= 0) throw new IOException("short read"); got += n; }
      }
    }
    return outp;
  }

  // Box average over k x k blocks. w and h are whole multiples of k.
  public static byte[] Shrink(byte[] src, int w, int h, int k) {
    if (k <= 1) return src;
    int ow = w / k, oh = h / k;
    byte[] o = new byte[ow * oh];
    for (int y = 0; y < oh; y++)
      for (int x = 0; x < ow; x++) {
        int sum = 0;
        for (int dy = 0; dy < k; dy++) { int row = (y * k + dy) * w + x * k; for (int dx = 0; dx < k; dx++) sum += src[row + dx]; }
        o[y * ow + x] = (byte)(sum / (k * k));
      }
    return o;
  }

  // Even-odd fill of the rings (pixel coordinates, x0,y0,x1,y1,...) at each pixel centre,
  // then grown by one pixel so the browser's own clip never shows a gap at the coast.
  public static bool[] Mask(List<double[]> rings, int w, int h) {
    bool[] m = new bool[w * h];
    List<double> xs = new List<double>();
    for (int y = 0; y < h; y++) {
      double cy = y + 0.5;
      xs.Clear();
      foreach (double[] ring in rings) {
        int n = ring.Length / 2;
        for (int i = 0; i < n; i++) {
          double x0 = ring[2 * i], y0 = ring[2 * i + 1];
          int j = (i + 1) % n;
          double x1 = ring[2 * j], y1 = ring[2 * j + 1];
          if ((y0 <= cy && y1 > cy) || (y1 <= cy && y0 > cy)) xs.Add(x0 + (cy - y0) / (y1 - y0) * (x1 - x0));
        }
      }
      xs.Sort();
      for (int p = 0; p + 1 < xs.Count; p += 2) {
        int a = (int)Math.Ceiling(xs[p] - 0.5), b = (int)Math.Floor(xs[p + 1] - 0.5);
        if (a < 0) a = 0; if (b > w - 1) b = w - 1;
        for (int x = a; x <= b; x++) m[y * w + x] = true;
      }
    }
    bool[] g = new bool[w * h];
    for (int y = 0; y < h; y++)
      for (int x = 0; x < w; x++) {
        if (!m[y * w + x]) {
          bool near = false;
          for (int dy = -1; dy <= 1 && !near; dy++) for (int dx = -1; dx <= 1 && !near; dx++) {
            int yy = y + dy, xx = x + dx;
            if (yy >= 0 && yy < h && xx >= 0 && xx < w && m[yy * w + xx]) near = true;
          }
          g[y * w + x] = near;
        } else g[y * w + x] = true;
      }
    return g;
  }

  static uint[] crcTable;
  static uint Crc(byte[] buf, int off, int len, uint crc) {
    if (crcTable == null) {
      crcTable = new uint[256];
      for (uint n = 0; n < 256; n++) { uint c = n; for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1; crcTable[n] = c; }
    }
    for (int i = 0; i < len; i++) crc = crcTable[(crc ^ buf[off + i]) & 0xFF] ^ (crc >> 8);
    return crc;
  }
  static void Chunk(Stream s, string type, byte[] data) {
    byte[] len = BitConverter.GetBytes(data.Length); if (BitConverter.IsLittleEndian) Array.Reverse(len);
    s.Write(len, 0, 4);
    byte[] t = System.Text.Encoding.ASCII.GetBytes(type);
    s.Write(t, 0, 4); s.Write(data, 0, data.Length);
    uint crc = Crc(t, 0, 4, 0xFFFFFFFFu); crc = Crc(data, 0, data.Length, crc) ^ 0xFFFFFFFFu;
    byte[] c = BitConverter.GetBytes(crc); if (BitConverter.IsLittleEndian) Array.Reverse(c);
    s.Write(c, 0, 4);
  }

  // Palette PNG: index 0 is transparent (outside the country), 1..levels are greens.
  public static byte[] Png(byte[] gray, bool[] mask, int w, int h, int levels, int lo, int hi, byte[] palette) {
    byte[] idx = new byte[w * h];
    for (int i = 0; i < idx.Length; i++) {
      if (!mask[i]) { idx[i] = 0; continue; }
      int q = (gray[i] - lo) * levels / Math.Max(1, hi - lo);
      if (q < 0) q = 0; if (q > levels - 1) q = levels - 1;
      idx[i] = (byte)(q + 1);
    }
    // Per row, the filter (None, Sub or Up) with the smallest sum of signed residuals.
    byte[] raw = new byte[h * (w + 1)];
    byte[] cand = new byte[w];
    for (int y = 0; y < h; y++) {
      int best = 0; long bestScore = long.MaxValue;
      for (int f = 0; f <= 2; f++) {
        long score = 0;
        for (int x = 0; x < w; x++) {
          int v = idx[y * w + x];
          int pred = f == 1 ? (x > 0 ? idx[y * w + x - 1] : 0) : f == 2 ? (y > 0 ? idx[(y - 1) * w + x] : 0) : 0;
          int r = (v - pred) & 0xFF; score += r < 128 ? r : 256 - r;
        }
        if (score < bestScore) { bestScore = score; best = f; }
      }
      raw[y * (w + 1)] = (byte)best;
      for (int x = 0; x < w; x++) {
        int v = idx[y * w + x];
        int pred = best == 1 ? (x > 0 ? idx[y * w + x - 1] : 0) : best == 2 ? (y > 0 ? idx[(y - 1) * w + x] : 0) : 0;
        raw[y * (w + 1) + 1 + x] = (byte)((v - pred) & 0xFF);
      }
    }
    byte[] deflated;
    using (MemoryStream ms = new MemoryStream()) {
      using (DeflateStream ds = new DeflateStream(ms, CompressionLevel.Optimal, true)) ds.Write(raw, 0, raw.Length);
      deflated = ms.ToArray();
    }
    uint a = 1, b = 0;
    for (int i = 0; i < raw.Length; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
    byte[] z = new byte[deflated.Length + 6];
    z[0] = 0x78; z[1] = 0xDA;
    Buffer.BlockCopy(deflated, 0, z, 2, deflated.Length);
    uint adler = (b << 16) | a;
    z[z.Length - 4] = (byte)(adler >> 24); z[z.Length - 3] = (byte)(adler >> 16); z[z.Length - 2] = (byte)(adler >> 8); z[z.Length - 1] = (byte)adler;

    using (MemoryStream png = new MemoryStream()) {
      png.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }, 0, 8);
      byte[] ihdr = new byte[13];
      byte[] bw = BitConverter.GetBytes(w), bh = BitConverter.GetBytes(h);
      if (BitConverter.IsLittleEndian) { Array.Reverse(bw); Array.Reverse(bh); }
      Buffer.BlockCopy(bw, 0, ihdr, 0, 4); Buffer.BlockCopy(bh, 0, ihdr, 4, 4);
      ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
      Chunk(png, "IHDR", ihdr);
      Chunk(png, "PLTE", palette);
      Chunk(png, "tRNS", new byte[] { 0 });
      Chunk(png, "IDAT", z);
      Chunk(png, "IEND", new byte[0]);
      return png.ToArray();
    }
  }
}
'@
if (-not ('AsjRelief' -as [type])) {
  if ($refs.Count) { Add-Type -TypeDefinition $src -ReferencedAssemblies $refs } else { Add-Type -TypeDefinition $src }
}

# --- the raster -------------------------------------------------------------------
$tifPath = (Resolve-Path $Tif).Path
$fs = [IO.File]::OpenRead($tifPath)
$br = New-Object IO.BinaryReader($fs)
try {
  $order = [Text.Encoding]::ASCII.GetString($br.ReadBytes(2))
  if ($order -ne 'II') { throw "only little-endian TIFFs are supported (got $order)" }
  [void]$br.ReadUInt16()
  $fs.Position = $br.ReadUInt32()
  $count = $br.ReadUInt16()
  $tags = @{}
  for ($i = 0; $i -lt $count; $i++) {
    $tag = $br.ReadUInt16(); $type = $br.ReadUInt16(); $n = $br.ReadUInt32(); $raw = $br.ReadBytes(4)
    $val = if ($type -eq 3) { [BitConverter]::ToUInt16($raw, 0) } else { [BitConverter]::ToUInt32($raw, 0) }
    $tags[[int]$tag] = @{ type = $type; count = $n; value = $val }
  }
  $W = [int]$tags[256].value; $H = [int]$tags[257].value
  if ([int]$tags[258].value -ne 8 -or [int]$tags[259].value -ne 1 -or ($tags.ContainsKey(277) -and [int]$tags[277].value -ne 1)) {
    throw 'expected an uncompressed 8-bit single-band TIFF (Natural Earth GRAY_HR_SR)'
  }
  $rps = if ($tags.ContainsKey(278)) { [int]$tags[278].value } else { $H }
  $so = $tags[273]
  $strips = New-Object 'long[]' ([int]$so.count)
  if ($so.count -eq 1) { $strips[0] = [long]$so.value } else {
    $fs.Position = $so.value
    for ($i = 0; $i -lt $so.count; $i++) { $strips[$i] = if ($so.type -eq 3) { [long]$br.ReadUInt16() } else { [long]$br.ReadUInt32() } }
  }
} finally { $br.Close(); $fs.Close() }
$rowOffsets = New-Object 'long[]' $H
for ($r = 0; $r -lt $H; $r++) { $rowOffsets[$r] = $strips[[int][Math]::Floor($r / $rps)] + ($r % $rps) * [long]$W }

# Pixel grid: from the world file when there is one, else the global grid it describes.
$dx = 360.0 / $W; $dy = 180.0 / $H; $west0 = -180.0; $north0 = 90.0
$tfw = [IO.Path]::ChangeExtension($tifPath, '.tfw')
if (Test-Path $tfw) {
  $t = @([IO.File]::ReadAllLines($tfw) | ForEach-Object { [double]::Parse($_.Trim(), $inv) })
  $dx = $t[0]; $dy = -$t[3]; $west0 = $t[4] - $dx / 2; $north0 = $t[5] + $dy / 2
}
Write-Host ("[relief] {0}x{1} px, {2:0.#####} deg/px, origin {3:0.###},{4:0.###}" -f $W, $H, $dx, $west0, $north0) -ForegroundColor DarkGray

# --- greens -----------------------------------------------------------------------
# Darkest to lightest, through the Atlas's base green (#439447): lowland a little darker
# than the flat fill, high ground and sunlit slopes lighter. Index 0 is the transparent
# outside.
$palette = New-Object 'byte[]' (3 * ($Levels + 1))
for ($i = 0; $i -lt $Levels; $i++) {
  $t = $i / [double]($Levels - 1)
  $palette[3 * ($i + 1)]     = [byte][Math]::Round(34 + $t * (128 - 34))
  $palette[3 * ($i + 1) + 1] = [byte][Math]::Round(86 + $t * (194 - 86))
  $palette[3 * ($i + 1) + 2] = [byte][Math]::Round(42 + $t * (120 - 42))
}

# --- the outlines -----------------------------------------------------------------
$appData = [IO.File]::ReadAllText((Join-Path $dataDir 'app-data.js'), [Text.Encoding]::UTF8)
$detailAt = $appData.IndexOf('window.UNITED_AFRICA_DATA.countryDetail =')
if ($detailAt -lt 0) { throw 'countryDetail block not found in data/app-data.js' }
$want = @($Only -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$entries = [regex]::Matches($appData.Substring($detailAt), '"([a-z]{2})":\{"d":"([^"]*)","bbox":\{"minX":(-?[\d.]+),"minY":(-?[\d.]+),"maxX":(-?[\d.]+),"maxY":(-?[\d.]+)')
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$manifestPath = Join-Path $dataDir 'country-relief.json'
$countries = [ordered]@{}
if ($want.Count -and (Test-Path $manifestPath)) {
  $prev = [IO.File]::ReadAllText($manifestPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($p in $prev.countries.PSObject.Properties) { $countries[$p.Name] = $p.Value }
}
$totalKb = 0
foreach ($m in $entries) {
  $cc = $m.Groups[1].Value
  if ($want.Count -and $want -notcontains $cc) { continue }
  $minX = [double]::Parse($m.Groups[3].Value, $inv); $minY = [double]::Parse($m.Groups[4].Value, $inv)
  $maxX = [double]::Parse($m.Groups[5].Value, $inv); $maxY = [double]::Parse($m.Groups[6].Value, $inv)
  $margin = [Math]::Max(0.05, 0.03 * [Math]::Max($maxX - $minX, $maxY - $minY))
  $west = $minX - $margin; $east = $maxX + $margin; $north = -$minY + $margin; $south = -$maxY - $margin
  $c0 = [Math]::Max(0, [int][Math]::Floor(($west - $west0) / $dx))
  $c1 = [Math]::Min($W, [int][Math]::Ceiling(($east - $west0) / $dx))
  $r0 = [Math]::Max(0, [int][Math]::Floor(($north0 - $north) / $dy))
  $r1 = [Math]::Min($H, [int][Math]::Ceiling(($north0 - $south) / $dy))
  $k = [Math]::Max(1, [int][Math]::Ceiling([Math]::Max($c1 - $c0, $r1 - $r0) / [double]$MaxSide))
  # Whole blocks only, so the image edges sit exactly on raster pixel edges.
  $c1 = [Math]::Min($W, $c0 + [int][Math]::Ceiling(($c1 - $c0) / [double]$k) * $k)
  $r1 = [Math]::Min($H, $r0 + [int][Math]::Ceiling(($r1 - $r0) / [double]$k) * $k)
  $cw = [int][Math]::Floor(($c1 - $c0) / $k) * $k; $rh = [int][Math]::Floor(($r1 - $r0) / $k) * $k
  $c1 = $c0 + $cw; $r1 = $r0 + $rh
  $ow = $cw / $k; $oh = $rh / $k
  $bWest = $west0 + $c0 * $dx; $bNorth = $north0 - $r0 * $dy
  $bEast = $west0 + $c1 * $dx; $bSouth = $north0 - $r1 * $dy

  $gray = [AsjRelief]::Shrink([AsjRelief]::Crop($tifPath, $rowOffsets, $c0, $c1, $r0, $r1), $cw, $rh, $k)

  # Outline rings in output pixels. The detail path stores (longitude, -latitude).
  $rings = New-Object 'System.Collections.Generic.List[double[]]'
  $pxPerLon = 1.0 / ($dx * $k); $pxPerLat = 1.0 / ($dy * $k)
  foreach ($part in ($m.Groups[2].Value -split 'M' | Where-Object { $_.Trim() })) {
    $nums = @([regex]::Matches($part, '-?\d+(?:\.\d+)?') | ForEach-Object { [double]::Parse($_.Value, $inv) })
    if ($nums.Count -lt 6) { continue }
    $ring = New-Object 'double[]' $nums.Count
    for ($i = 0; $i -lt $nums.Count; $i += 2) {
      $ring[$i] = ($nums[$i] - $bWest) * $pxPerLon
      $ring[$i + 1] = ($bNorth + $nums[$i + 1]) * $pxPerLat
    }
    $rings.Add($ring)
  }
  $mask = [AsjRelief]::Mask($rings, $ow, $oh)
  $png = [AsjRelief]::Png($gray, $mask, $ow, $oh, $Levels, $Low, $High, $palette)
  [IO.File]::WriteAllBytes((Join-Path $outDir "$cc.png"), $png)
  $kb = [Math]::Round($png.Length / 1024.0, 1); $totalKb += $kb
  $countries[$cc] = [ordered]@{
    w = $ow; h = $oh
    west = [Math]::Round($bWest, 5); north = [Math]::Round($bNorth, 5)
    east = [Math]::Round($bEast, 5); south = [Math]::Round($bSouth, 5)
    kb = $kb
  }
  Write-Host ("  {0}  {1,4}x{2,-4} (1/{3})  {4,6} KB" -f $cc, $ow, $oh, $k, $kb)
}

$sorted = [ordered]@{}
foreach ($key in @($countries.Keys | Sort-Object)) { $sorted[$key] = $countries[$key] }
$manifest = [ordered]@{
  generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  source = 'Natural Earth 1:10m Gray Earth with Shaded Relief (GRAY_HR_SR), public domain'
  levels = $Levels
  countries = $sorted
}
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 5 -Compress), (New-Object Text.UTF8Encoding($false)))
Write-Host ("[relief] {0} image(s) in the manifest, {1:0} KB written this run -> data/relief/, data/country-relief.json" -f $sorted.Count, $totalKb) -ForegroundColor Green

if (-not $NoSplit) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'split-app-data.ps1')
  exit $LASTEXITCODE
}
