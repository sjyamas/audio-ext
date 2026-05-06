# Regenerate placeholder icons. Run from the repo root with:
#   powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot "..\icons"
New-Item -ItemType Directory -Force -Path $out | Out-Null

foreach ($size in 16, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(255, 28, 100, 200))

  # Simple "speaker" glyph: a filled rectangle on the left + a triangle wedge on the right.
  $pad = [int]($size * 0.18)
  $bodyW = [int]($size * 0.30)
  $bodyH = [int]($size * 0.45)
  $bodyX = $pad
  $bodyY = [int](($size - $bodyH) / 2)
  $brush = [System.Drawing.Brushes]::White
  $g.FillRectangle($brush, $bodyX, $bodyY, $bodyW, $bodyH)

  $tri = New-Object 'System.Drawing.Point[]' 3
  $tri[0] = New-Object System.Drawing.Point ($bodyX + $bodyW), ($bodyY + [int]($bodyH * 0.15))
  $tri[1] = New-Object System.Drawing.Point ($bodyX + $bodyW + [int]($size * 0.22)), ($bodyY - [int]($bodyH * 0.15))
  $tri[2] = New-Object System.Drawing.Point ($bodyX + $bodyW + [int]($size * 0.22)), ($bodyY + $bodyH + [int]($bodyH * 0.15))
  $g.FillPolygon($brush, $tri)

  $bmp.Save((Join-Path $out "icon$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

Write-Host "Wrote icons to $out"
