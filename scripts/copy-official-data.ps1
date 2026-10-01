<#
.SYNOPSIS
  Copies the official MonoCode app data into the fork's (or dev build's) data
  directory. Opt-in: nothing runs this automatically.

.DESCRIPTION
  Source (read-only, never modified or deleted):
    %APPDATA%\com.monocode.desktop            sessions DB (monocode.db), checkpoints,
                                              provider accounts, notes, window state
    %LOCALAPPDATA%\com.monocode.desktop\EBWebView   (only with -IncludeWebView)
                                              WebView profile: UI settings in localStorage

  Target (-Target Fork, default):
    %APPDATA%\com.monocode.desktop.fork
  Target (-Target Dev), used by `npm run tauri dev`:
    %APPDATA%\com.monocode.desktop.dev

  Close every MonoCode window (official, fork and dev) before running; the
  script refuses to run while a monocode.exe process exists, because the
  SQLite database is in WAL mode and must not be copied while open.

  If the target data directory already has content the script stops. With
  -Force the existing target is first renamed to "<name>.bak-<timestamp>"
  (kept, not deleted) and the copy then goes into a fresh directory.

.PARAMETER Target
  Fork (installed fork build) or Dev (tauri dev build).

.PARAMETER IncludeWebView
  Also copy the WebView2 profile (%LOCALAPPDATA%), which carries UI settings
  such as theme, layout and recent projects stored in localStorage.

.PARAMETER Force
  Replace a non-empty target by moving it aside first (never deletes).

.EXAMPLE
  pwsh scripts/copy-official-data.ps1 -WhatIf
  pwsh scripts/copy-official-data.ps1 -IncludeWebView
#>
[CmdletBinding(SupportsShouldProcess)]
param(
  [ValidateSet('Fork', 'Dev')]
  [string] $Target = 'Fork',
  [switch] $IncludeWebView,
  [switch] $Force
)

$ErrorActionPreference = 'Stop'

$officialId = 'com.monocode.desktop'
$targetId = if ($Target -eq 'Dev') { 'com.monocode.desktop.dev' } else { 'com.monocode.desktop.fork' }

$roaming = $env:APPDATA
$local = $env:LOCALAPPDATA
if (-not $roaming -or -not $local) { throw 'APPDATA / LOCALAPPDATA are not set.' }

$sourceData = Join-Path $roaming $officialId
$targetData = Join-Path $roaming $targetId
$sourceWeb = Join-Path (Join-Path $local $officialId) 'EBWebView'
$targetWeb = Join-Path (Join-Path $local $targetId) 'EBWebView'

function Test-NonEmpty([string] $Path) {
  (Test-Path -LiteralPath $Path) -and
  [bool](Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue | Select-Object -First 1)
}

if (-not (Test-Path -LiteralPath $sourceData)) {
  throw "Official data directory not found: $sourceData"
}

$running = Get-Process -Name 'monocode' -ErrorAction SilentlyContinue
if ($running) {
  throw "MonoCode is still running (PID $($running.Id -join ', ')). Close the official, fork and dev apps first."
}

$pairs = @(, @($sourceData, $targetData))
if ($IncludeWebView) {
  if (Test-Path -LiteralPath $sourceWeb) { $pairs += , @($sourceWeb, $targetWeb) }
  else { Write-Warning "No WebView profile at $sourceWeb; skipping it." }
}

# Check everything before touching anything.
foreach ($pair in $pairs) {
  if ((Test-NonEmpty $pair[1]) -and -not $Force) {
    throw "Target is not empty: $($pair[1])`nRe-run with -Force to move it aside to a .bak folder and copy over a fresh one."
  }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($pair in $pairs) {
  $from = $pair[0]; $to = $pair[1]
  if (Test-NonEmpty $to) {
    $backup = "$to.bak-$stamp"
    if ($PSCmdlet.ShouldProcess($to, "Move aside to $backup")) {
      Move-Item -LiteralPath $to -Destination $backup
      Write-Host "Moved existing target to $backup"
    }
  }
  if ($PSCmdlet.ShouldProcess($to, "Copy contents of $from")) {
    New-Item -ItemType Directory -Force -Path $to | Out-Null
    Copy-Item -Path (Join-Path $from '*') -Destination $to -Recurse -Force
    Write-Host "Copied $from -> $to"
  }
}

Write-Host "Done. The official data was only read, never changed."
