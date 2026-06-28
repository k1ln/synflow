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

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  ASSET="wasmtime-${VERSION}-aarch64-macos-c-api" ;;
  Darwin-x86_64) ASSET="wasmtime-${VERSION}-x86_64-macos-c-api" ;;
  Linux-x86_64)  ASSET="wasmtime-${VERSION}-x86_64-linux-c-api" ;;
  Linux-aarch64) ASSET="wasmtime-${VERSION}-aarch64-linux-c-api" ;;
  *) echo "unsupported host: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

URL="https://github.com/bytecodealliance/wasmtime/releases/download/${VERSION}/${ASSET}.tar.xz"
echo "fetching $URL"
tmp="$(mktemp -d)"
curl -fsSL -o "$tmp/capi.tar.xz" "$URL"
tar -xf "$tmp/capi.tar.xz" -C "$tmp"
rm -rf "$DEST"
mv "$tmp/$ASSET" "$DEST"
rm -rf "$tmp"
echo "wasmtime C API ${VERSION} -> $DEST"
ls "$DEST/include/wasmtime.h" "$DEST/lib/"
