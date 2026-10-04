param(
    [string]$Version,
    [switch]$Plan,
    [switch]$InstallOnly,
    [switch]$Release,
    [switch]$ForceBuild,
    [switch]$Status,
    [string]$SnapshotRequest,
    [string[]]$Platforms = @('windows', 'mac')
)
$ErrorActionPreference = 'Stop'
$arguments = @('-B', (Join-Path $PSScriptRoot 'local_update.py'), '--platforms', ($Platforms -join ','))
if ($Version) { $arguments += @('--version', $Version) }
if ($Plan) { $arguments += '--plan' }
if ($InstallOnly) { $arguments += '--install-only' }
if ($Release) { $arguments += '--release' }
if ($ForceBuild) { $arguments += '--force-build' }
if ($Status) { $arguments += '--status' }
if ($SnapshotRequest) { $arguments += @('--snapshot-request', $SnapshotRequest) }
& python @arguments
if ($LASTEXITCODE -ne 0) { throw "Local update failed ($LASTEXITCODE). See the printed log path." }
