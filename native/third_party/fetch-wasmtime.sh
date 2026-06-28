#!/usr/bin/env bash
# Fetch the wasmtime C API (the engine the native build embeds to host the
# Rust/WASM DSP modules from src/wasm/*). Version is pinned to match the M0 PoC
# (native/poc/native-render uses the wasmtime crate v27), so wasmtime==V8 parity
# proven there carries over. The binaries are gitignored; run this once per
# machine. Picks the right release asset for the host OS/arch.
set -euo pipefail

VERSION="v27.0.0"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$DIR/wasmtime"

EXT="tar.xz"
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  ASSET="wasmtime-${VERSION}-aarch64-macos-c-api" ;;
  Darwin-x86_64) ASSET="wasmtime-${VERSION}-x86_64-macos-c-api" ;;
  Linux-x86_64)  ASSET="wasmtime-${VERSION}-x86_64-linux-c-api" ;;
  Linux-aarch64) ASSET="wasmtime-${VERSION}-aarch64-linux-c-api" ;;
  MINGW*-x86_64|MSYS*-x86_64|CYGWIN*-x86_64) ASSET="wasmtime-${VERSION}-x86_64-windows-c-api"; EXT="zip" ;;
  *) echo "unsupported host: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

URL="https://github.com/bytecodealliance/wasmtime/releases/download/${VERSION}/${ASSET}.${EXT}"
echo "fetching $URL"
tmp="$(mktemp -d)"
curl -fsSL -o "$tmp/capi.${EXT}" "$URL"
if [ "$EXT" = "zip" ]; then unzip -q "$tmp/capi.${EXT}" -d "$tmp"; else tar -xf "$tmp/capi.${EXT}" -C "$tmp"; fi
rm -rf "$DEST"
mv "$tmp/$ASSET" "$DEST"
rm -rf "$tmp"
echo "wasmtime C API ${VERSION} -> $DEST"
ls "$DEST/include/wasmtime.h" "$DEST/lib/"
