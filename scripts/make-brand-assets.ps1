# ============================================================
# scripts/make-brand-assets.ps1 — 生成 PWA 图标 + 分享图 og-image
# 产物：icons/icon-192.png、icons/icon-512.png、og-image.png（1200x630）
# 风格与 favicon.svg 一致：深绿圆角方块 + 白色 W + 金色圆点
# 用法：在项目根目录运行  iex (Get-Content -Raw scripts/make-brand-assets.ps1)
# ============================================================
Add-Type -AssemblyName System.Drawing

$root = (Get-Location).Path
$iconsDir = Join-Path $root 'icons'
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

# ---------- 圆角矩形路径 ----------
function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# ---------- 单个应用图标（圆角方块 + W + 金点） ----------
function New-AppIcon([int]$size, [string]$outPath) {
  $bmp = New-Object System.Drawing.Bitmap -ArgumentList @($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  $radius = $size * 0.22
  $path = New-RoundedRect 0 0 $size $size $radius
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush -ArgumentList @(
    (New-Object System.Drawing.RectangleF -ArgumentList @(0, 0, [float]$size, [float]$size)),
    [System.Drawing.Color]::FromArgb(255, 40, 99, 79),
    [System.Drawing.Color]::FromArgb(255, 29, 74, 58), 45.0)
  $g.FillPath($grad, $path)

  # 白色 W（与 favicon.svg 相同 Georgia serif）
  $ff = New-Object System.Drawing.FontFamily -ArgumentList @('Georgia')
  $font = New-Object System.Drawing.Font -ArgumentList @($ff, [float]($size * 0.56), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $wRect = New-Object System.Drawing.RectangleF -ArgumentList @(0, [float]($size * 0.02), [float]$size, [float]($size * 0.92))
  $g.DrawString('W', $font, [System.Drawing.Brushes]::White, $wRect, $sf)

  # 金色圆点（右上角，同 favicon 比例 47/64, 17/64, r=7/64）
  $dotR = $size * 0.11
  $gold = New-Object System.Drawing.SolidBrush -ArgumentList @([System.Drawing.Color]::FromArgb(255, 228, 180, 74))
  $g.FillEllipse($gold, [float]($size * (47.0 / 64.0) - $dotR), [float]($size * (17.0 / 64.0) - $dotR), [float]($dotR * 2), [float]($dotR * 2))

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $font.Dispose(); $sf.Dispose(); $grad.Dispose(); $path.Dispose(); $gold.Dispose(); $ff.Dispose()
  Write-Host "icon: $outPath ($size x $size)"
}

New-AppIcon 192 (Join-Path $iconsDir 'icon-192.png')
New-AppIcon 512 (Join-Path $iconsDir 'icon-512.png')

# ---------- 分享图 og-image.png 1200x630 ----------
$W = 1200.0; $H = 630.0
$bmp = New-Object System.Drawing.Bitmap -ArgumentList @([int]$W, [int]$H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$bgGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush -ArgumentList @(
  (New-Object System.Drawing.RectangleF -ArgumentList @(0, 0, $W, $H)),
  [System.Drawing.Color]::FromArgb(255, 40, 99, 79),
  [System.Drawing.Color]::FromArgb(255, 20, 52, 41), 45.0)
$g.FillRectangle($bgGrad, 0, 0, $W, $H)

# 装饰：右上/左下大圆点缀（半透明）
$deco = New-Object System.Drawing.SolidBrush -ArgumentList @([System.Drawing.Color]::FromArgb(46, 228, 180, 74))
$g.FillEllipse($deco, [float]($W - 190), -70.0, 300.0, 300.0)
$deco2 = New-Object System.Drawing.SolidBrush -ArgumentList @([System.Drawing.Color]::FromArgb(26, 255, 255, 255))
$g.FillEllipse($deco2, -120.0, [float]($H - 180), 330.0, 330.0)

# 中心 Logo：圆角方块 + W + 金点（128x128，居中偏上）
$logoSize = 128.0
$logoX = ($W - $logoSize) / 2
$logoY = 66.0
$logoPath = New-RoundedRect $logoX $logoY $logoSize $logoSize ($logoSize * 0.22)
$logoGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush -ArgumentList @(
  (New-Object System.Drawing.RectangleF -ArgumentList @($logoX, $logoY, $logoSize, $logoSize)),
  [System.Drawing.Color]::FromArgb(255, 255, 255, 255),
  [System.Drawing.Color]::FromArgb(255, 210, 226, 218), 45.0)
$g.FillPath($logoGrad, $logoPath)

$ff2 = New-Object System.Drawing.FontFamily -ArgumentList @('Georgia')
$logoFont = New-Object System.Drawing.Font -ArgumentList @($ff2, 72.0, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$sfCenter = New-Object System.Drawing.StringFormat
$sfCenter.Alignment = [System.Drawing.StringAlignment]::Center
$sfCenter.LineAlignment = [System.Drawing.StringAlignment]::Center
$logoWRect = New-Object System.Drawing.RectangleF -ArgumentList @($logoX, ($logoY + 3), $logoSize, ($logoSize * 0.92))
$deepGreen = New-Object System.Drawing.SolidBrush -ArgumentList @([System.Drawing.Color]::FromArgb(255, 40, 99, 79))
$g.DrawString('W', $logoFont, $deepGreen, $logoWRect, $sfCenter)
$gold = New-Object System.Drawing.SolidBrush -ArgumentList @([System.Drawing.Color]::FromArgb(255, 228, 180, 74))
$dotR2 = 14.0
$g.FillEllipse($gold, [float]($logoX + $logoSize * (47.0 / 64.0) - $dotR2), [float]($logoY + $logoSize * (17.0 / 64.0) - $dotR2), [float]($dotR2 * 2), [float]($dotR2 * 2))

# 标题（微软雅黑粗体）
$ff3 = New-Object System.Drawing.FontFamily -ArgumentList @('Microsoft YaHei')
$titleFont = New-Object System.Drawing.Font -ArgumentList @($ff3, 72.0, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$titleRect = New-Object System.Drawing.RectangleF -ArgumentList @(0, 240.0, $W, 100.0)
$g.DrawString('外院知识分享站', $titleFont, [System.Drawing.Brushes]::White, $titleRect, $sfCenter)

# 副标题
$subFont = New-Object System.Drawing.Font -ArgumentList @($ff3, 32.0, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$subBrush = New-Object System.Drawing.SolidBrush -ArgumentList @([System.Drawing.Color]::FromArgb(255, 207, 230, 219))
$subRect = New-Object System.Drawing.RectangleF -ArgumentList @(0, 362.0, $W, 54.0)
$g.DrawString('课程题库 · 学习工具 · 专业资料', $subFont, $subBrush, $subRect, $sfCenter)

# 底部 URL
$ff4 = New-Object System.Drawing.FontFamily -ArgumentList @('Consolas')
$urlFont = New-Object System.Drawing.Font -ArgumentList @($ff4, 24.0, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$urlBrush = New-Object System.Drawing.SolidBrush -ArgumentList @([System.Drawing.Color]::FromArgb(255, 159, 192, 170))
$urlRect = New-Object System.Drawing.RectangleF -ArgumentList @(0, 556.0, $W, 44.0)
$g.DrawString('free60127.github.io/666', $urlFont, $urlBrush, $urlRect, $sfCenter)

$ogPath = Join-Path $root 'og-image.png'
$bmp.Save($ogPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "og-image: $ogPath ($W x $H)"

$g.Dispose(); $bmp.Dispose(); $bgGrad.Dispose(); $logoGrad.Dispose(); $logoPath.Dispose()
$titleFont.Dispose(); $subFont.Dispose(); $urlFont.Dispose(); $logoFont.Dispose()
$sfCenter.Dispose(); $gold.Dispose(); $deco.Dispose(); $deco2.Dispose()
$deepGreen.Dispose(); $subBrush.Dispose(); $urlBrush.Dispose()
$ff2.Dispose(); $ff3.Dispose(); $ff4.Dispose()
