#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || realpath "$(dirname "$0")/../../..")"
OUTPUT="$ROOT/release"
mkdir -p "$OUTPUT"

echo "==> Building Markify .aab (Android App Bundle) for Play Store..."

cd "$ROOT"
npm run build
npx tauri android build --aab --release

cp "$ROOT/src-tauri/gen/android/app/build/outputs/bundle/release/"*.aab "$OUTPUT/" 2>/dev/null || true
echo "==> .aab placed in $OUTPUT/ (if build succeeded)"
