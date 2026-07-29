#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || realpath "$(dirname "$0")/../../..")"
OUTPUT="$ROOT/release"
mkdir -p "$OUTPUT"

echo "==> Building Markify .apk for Android..."

cd "$ROOT"
npm run build
npx tauri android build --apk

cp "$ROOT/src-tauri/gen/android/app/build/outputs/apk/"*/*.apk "$OUTPUT/" 2>/dev/null || true
echo "==> .apk placed in $OUTPUT/ (if build succeeded)"
