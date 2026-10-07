$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    $env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-msvc'
    # İmece updater signing is disabled until an independent key/feed exists.
    # Never load the previous product's private key for ordinary packaging.
    pnpm exec tauri build --ci --bundles nsis --config src-tauri/tauri.fork.conf.json
    if ($LASTEXITCODE -ne 0) { throw "Windows build failed ($LASTEXITCODE)" }
} finally {
    Pop-Location
}
