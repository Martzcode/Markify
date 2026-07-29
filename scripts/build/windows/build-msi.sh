#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || realpath "$(dirname "$0")/../../..")"
OUTPUT="$ROOT/release"
mkdir -p "$OUTPUT"

echo "==> Building Markify .msi (WiX) for Windows..."
echo "    Note: This must be run on Windows with WiX Toolset installed."

cd "$ROOT"
npm run build
npx tauri build --bundles msi

cp "$ROOT/src-tauri/target/release/bundle/msi/"*.msi "$OUTPUT/" 2>/dev/null || true
echo "==> .msi package placed in $OUTPUT/ (if build succeeded)"
