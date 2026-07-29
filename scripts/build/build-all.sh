#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || realpath "$(dirname "$0")/../..")"

echo "============================================"
echo " Markify - Build all targets"
echo "============================================"
echo ""

OS="$(uname -s)"

case "$OS" in
  Linux)
    echo "[1/3] Building .deb..."
    "$ROOT/scripts/build/linux/build-deb.sh"
    echo ""

    echo "[2/3] Building .rpm..."
    "$ROOT/scripts/build/linux/build-rpm.sh"
    echo ""

    echo "[3/3] Building Android .apk..."
    "$ROOT/scripts/build/android/build-apk.sh"
    echo ""
    ;;
  Darwin)
    echo "macOS not yet supported as a build target."
    exit 1
    ;;
  CYGWIN*|MINGW*|MSYS*)
    echo "[1/2] Building .exe (NSIS)..."
    "$ROOT/scripts/build/windows/build-exe.sh"
    echo ""

    echo "[2/2] Building .msi..."
    "$ROOT/scripts/build/windows/build-msi.sh"
    echo ""
    ;;
  *)
    echo "Unknown OS: $OS"
    exit 1
    ;;
esac

echo "============================================"
echo " Done! Artifacts in $ROOT/release/"
echo "============================================"
