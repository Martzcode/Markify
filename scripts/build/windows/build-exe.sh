#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || realpath "$(dirname "$0")/../../..")"
OUTPUT="$ROOT/release"
mkdir -p "$OUTPUT"

echo "==> Building Markify .exe (NSIS installer) for Windows..."
echo "    Note: This must be run on Windows, or with MinGW cross-compilation configured."

cd "$ROOT"
npm run build
npx tauri build --bundles nsis

cp "$ROOT/src-tauri/target/release/bundle/nsis/"*.exe "$OUTPUT/" 2>/dev/null || \
cp "$ROOT/src-tauri/target/release/bundle/nsis/"*.exe "$OUTPUT/" 2>/dev/null || true
echo "==> .exe installer placed in $OUTPUT/ (if build succeeded)"
