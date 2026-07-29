#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || realpath "$(dirname "$0")/../../..")"
OUTPUT="$ROOT/release"
mkdir -p "$OUTPUT"

echo "==> Building Markify .rpm for Fedora/RHEL..."

cd "$ROOT"
npm run build
npx tauri build --bundles rpm

cp "$ROOT/src-tauri/target/release/bundle/rpm/"*.rpm "$OUTPUT/"
echo "==> .rpm package placed in $OUTPUT/"
