# Package the extension as a Firefox-ready zip.
# Run from the repo root with:
#   powershell -ExecutionPolicy Bypass -File tools/pack-firefox.ps1
#
# Output:
#   dist/audio-tweaks-firefox-<version>.zip
#
# What this does:
# 1. Reads manifest.json to grab the version.
# 2. Stages the runtime files in a temp dir (manifest at the root, no
#    nested folder -- that's what AMO and `web-ext` expect).
# 3. Injects browser_specific_settings.gecko.id into the staged manifest so
#    Firefox has a stable add-on id. The source manifest.json is left alone
#    so Chrome/Edge builds keep working.
# 4. Zips the staging dir into dist/.
#
# To override the gecko id, pass -GeckoId "you@example.com".

[CmdletBinding()]
param(
  [string]$GeckoId = "audio-tweaks@local"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$manifestPath = Join-Path $repoRoot "manifest.json"
if (-not (Test-Path $manifestPath)) {
  throw "manifest.json not found at $manifestPath"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
if (-not $version) { throw "manifest.json has no version field" }

# Files and folders to include. Everything else (docs, tools, test-pages,
# CLAUDE.md, README.md, .claude, dist, etc.) is left out.
$includeItems = @(
  "manifest.json",
  "background.js",
  "content.js",
  "injected.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "icons"
)

foreach ($item in $includeItems) {
  $p = Join-Path $repoRoot $item
  if (-not (Test-Path $p)) {
    throw "Required file/folder missing: $item"
  }
}

$distDir = Join-Path $repoRoot "dist"
New-Item -ItemType Directory -Force -Path $distDir | Out-Null

$stageDir = Join-Path ([System.IO.Path]::GetTempPath()) ("audio-tweaks-ff-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

try {
  foreach ($item in $includeItems) {
    $src = Join-Path $repoRoot $item
    $dst = Join-Path $stageDir $item
    if ((Get-Item $src).PSIsContainer) {
      Copy-Item $src $dst -Recurse -Force
    } else {
      Copy-Item $src $dst -Force
    }
  }

  # Patch the staged manifest with Firefox's gecko id. We leave the source
  # manifest alone so Chromium builds aren't affected.
  $stagedManifestPath = Join-Path $stageDir "manifest.json"
  $stagedManifest = Get-Content $stagedManifestPath -Raw | ConvertFrom-Json

  $bss = [pscustomobject]@{
    gecko = [pscustomobject]@{
      id                 = $GeckoId
      strict_min_version = "121.0"
    }
  }

  if ($stagedManifest.PSObject.Properties.Name -contains "browser_specific_settings") {
    $stagedManifest.browser_specific_settings = $bss
  } else {
    $stagedManifest | Add-Member -MemberType NoteProperty -Name "browser_specific_settings" -Value $bss
  }

  # ConvertTo-Json escapes <, >, &, ' as \u003c etc. by default. The
  # `<all_urls>` permission must stay literal or Firefox won't honor it.
  $json = $stagedManifest | ConvertTo-Json -Depth 20
  $json = $json `
    -replace '\\u003c', '<' `
    -replace '\\u003e', '>' `
    -replace '\\u0026', '&' `
    -replace "\\u0027", "'"

  # Write WITHOUT a BOM. Firefox rejects BOM-prefixed manifests as "corrupt".
  # Set-Content -Encoding UTF8 on Windows PowerShell 5.1 adds a BOM, so we
  # use the .NET API with an explicit no-BOM UTF8Encoding instead.
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($stagedManifestPath, $json, $utf8NoBom)

  $zipName = "audio-tweaks-firefox-$version.zip"
  $zipPath = Join-Path $distDir $zipName
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

  # Use ZipFile (not Compress-Archive) so entry paths use forward slashes.
  # Compress-Archive on Windows writes backslashes, which violate the ZIP
  # spec and trip up Firefox / AMO validation.
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stageDir,
    $zipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )

  Write-Host "Wrote $zipPath"
}
finally {
  if (Test-Path $stageDir) {
    Remove-Item $stageDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
