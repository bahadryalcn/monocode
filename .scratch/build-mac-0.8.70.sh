#!/bin/sh
set -eu
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"
export CARGO_TARGET_DIR="$HOME/projects/monocode/target"
cd "$HOME/projects/monocode-build-0.8.70"
npx tauri build --ci --target aarch64-apple-darwin --bundles app --config src-tauri/tauri.fork.macos.conf.json > build-mac-final.log 2>&1
