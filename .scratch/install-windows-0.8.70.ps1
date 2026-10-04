$ErrorActionPreference = 'Stop'
$update = Join-Path $env:LOCALAPPDATA 'MonoCodeUpdate'
$log = Join-Path $update 'install-0.8.70.log'
$app = Join-Path $env:LOCALAPPDATA 'MonoCode/monocode.exe'
$node = Join-Path $env:USERPROFILE '.monocode-host/runtime/0.8.70-win32-x64-manual/node.exe'
$db = Join-Path $env:APPDATA 'com.monocode.desktop.fork/monocode.db'
function Write-UpdateLog($message) { "$(Get-Date -Format o) $message" | Out-File $log -Append -Encoding utf8 }
Write-UpdateLog 'scheduled; waiting for current turns to finish'
Start-Sleep -Seconds 30
try {
  while ($true) {
    $busy = 1
    try { $busy = [int](& $node (Join-Path $update 'inflight-count.mjs') $db 2>$null | Select-Object -First 1) } catch { $busy = 1 }
    if ($busy -eq 0) { break }
    Start-Sleep -Seconds 5
  }
  Write-UpdateLog 'all turns idle; closing app'
  $processes = Get-Process monocode -ErrorAction SilentlyContinue
  foreach ($process in $processes) { [void]$process.CloseMainWindow() }
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Process monocode -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1 }
  if (Get-Process monocode -ErrorAction SilentlyContinue) {
    # Close-to-tray may retain an idle process after the close handler flushes state.
    $busy = [int](& $node (Join-Path $update 'inflight-count.mjs') $db 2>$null | Select-Object -First 1)
    if ($busy -ne 0) { throw 'A new turn started; installer was not run' }
    Write-UpdateLog 'idle process remained after graceful close; stopping for update'
    Get-Process monocode -ErrorAction SilentlyContinue | Where-Object Path -EQ $app | Stop-Process -Force
  }
  $installer = Start-Process -FilePath (Join-Path $update 'MonoCode_0.8.70_x64-setup.exe') -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
  if ($installer.ExitCode -ne 0) { throw "Installer failed: $($installer.ExitCode)" }
  $version = (Get-Item $app).VersionInfo.ProductVersion
  if ($version -notlike '0.8.70*') { throw "Unexpected installed version: $version" }
  Write-UpdateLog "installed and verified $version"
  Start-Process -FilePath $app
  Write-UpdateLog 'app restarted'
} catch { Write-UpdateLog "ERROR $_"; exit 1 }
