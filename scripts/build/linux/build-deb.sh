#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || realpath "$(dirname "$0")/../../..")"
OUTPUT="$ROOT/release"
mkdir -p "$OUTPUT"

echo "==> Building Markify .deb for Debian/Ubuntu..."

cd "$ROOT"
npm run build
npx tauri build --bundles deb

cp "$ROOT/src-tauri/target/release/bundle/deb/"*.deb "$OUTPUT/"
echo "==> .deb package placed in $OUTPUT/"
