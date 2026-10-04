$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    $env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-msvc'
    if ([string]::IsNullOrWhiteSpace($env:TAURI_SIGNING_PRIVATE_KEY)) {
        $keyPath = Join-Path $env:USERPROFILE '.tauri/monocode-fork.key'
        if (!(Test-Path -LiteralPath $keyPath)) {
            throw 'Updater signing key missing. Set TAURI_SIGNING_PRIVATE_KEY or see docs/fork.md.'
        }
        $env:TAURI_SIGNING_PRIVATE_KEY = $keyPath
    }
    pnpm exec tauri build --ci --bundles nsis --config src-tauri/tauri.fork.conf.json
    if ($LASTEXITCODE -ne 0) { throw "Windows build failed ($LASTEXITCODE)" }
} finally {
    Pop-Location
}
