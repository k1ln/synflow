#!/usr/bin/env bash
# Build BOTH Synflow plugin flavours from the one codebase:
#   • "Synflow"     — instrument (DAW instrument slot / FL channel rack), MIDI->audio
#   • "Synflow FX"  — effect (mixer insert), audio->audio
# DAWs categorise instruments vs effects by the plugin's declared type, so a single
# binary can only ever be one; we ship two. Each flavour builds every format for the
# host OS (macOS: AU VST3 Standalone [+CLAP]; Linux: VST3 Standalone [+CLAP]).
#
# Usage:  ./build-all.sh [--install] [--clap] [--no-editor] [--native-arch]
#   --install      copy the VST3/AU/CLAP into the user plug-in folders after building
#   --clap         also build the .clap (fetches clap-juce-extensions)
#   --no-editor    skip embedding the edit-mode webview + in-plugin AS compiler (faster)
#   --native-arch  macOS: build only the host arch instead of a universal binary
# Signing: ad-hoc by default (loads locally); set SYNFLOW_SIGN_IDENTITY to a
#   "Developer ID Application: …" to sign for distribution.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # native/plugin
ROOT="$(cd "$HERE/../.." && pwd)"
WT="$HERE/../third_party/wasmtime"
WT_VERSION="v27.0.0"

INSTALL=0; CLAP=0; EDITOR=1; UNIVERSAL=1
for a in "$@"; do case "$a" in
  --install)     INSTALL=1 ;;
  --clap)        CLAP=1 ;;
  --no-editor)   EDITOR=0 ;;
  --native-arch) UNIVERSAL=0 ;;
  *) echo "unknown flag: $a" >&2; exit 2 ;;
esac; done

OS="$(uname -s)"

# --- 1. wasmtime C API (universal on macOS so the plugin loads native + Rosetta) ----
ensure_wasmtime() {
  [ -f "$WT/include/wasmtime.h" ] || bash "$HERE/../third_party/fetch-wasmtime.sh"
  if [ "$OS" = "Darwin" ] && [ "$UNIVERSAL" = 1 ]; then
    if ! { lipo -archs "$WT/lib/libwasmtime.a" 2>/dev/null | grep -q arm64 && \
           lipo -archs "$WT/lib/libwasmtime.a" 2>/dev/null | grep -q x86_64; }; then
      echo "== building universal libwasmtime.a (arm64 + x86_64) =="
      local tmp; tmp="$(mktemp -d)"
      for arch in aarch64 x86_64; do
        local A="wasmtime-$WT_VERSION-$arch-macos-c-api"
        curl -fsSL -o "$tmp/$A.tar.xz" \
          "https://github.com/bytecodealliance/wasmtime/releases/download/$WT_VERSION/$A.tar.xz"
        tar -xf "$tmp/$A.tar.xz" -C "$tmp"
      done
      lipo -create "$tmp/wasmtime-$WT_VERSION-aarch64-macos-c-api/lib/libwasmtime.a" \
                   "$tmp/wasmtime-$WT_VERSION-x86_64-macos-c-api/lib/libwasmtime.a" \
                   -output "$WT/lib/libwasmtime.a"
      rm -rf "$tmp"
    fi
  fi
}

# --- 2. edit-mode editor bundle (shared by both flavours) ---------------------------
ensure_editor() {
  [ "$EDITOR" = 1 ] || { echo "== skipping editor bundle (--no-editor) =="; return; }
  if command -v npm >/dev/null 2>&1; then
    [ -d "$ROOT/node_modules" ] || (cd "$ROOT" && npm ci)
    (cd "$ROOT" && npm run build:plugin-ui)
  else
    echo "== npm not found; edit mode will be disabled in this build ==" >&2
  fi
}

# --- 3. configure + build one flavour ----------------------------------------------
build_flavour() {
  local instrument="$1" dir="$2"
  local args=(-S "$HERE" -B "$dir" -DCMAKE_BUILD_TYPE=Release -DSYNFLOW_INSTRUMENT="$instrument")
  [ "$CLAP" = 1 ] && args+=(-DSYNFLOW_CLAP=ON)
  [ "$OS" = "Darwin" ] && [ "$UNIVERSAL" = 1 ] && args+=("-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64")
  cmake "${args[@]}"
  cmake --build "$dir" --config Release -j
}

# --- 4. sign + install bundles ------------------------------------------------------
sign_bundle() {
  local b="$1"
  if [ "$OS" = "Darwin" ]; then
    if [ -n "${SYNFLOW_SIGN_IDENTITY:-}" ]; then
      codesign --force --deep --options runtime --timestamp --sign "$SYNFLOW_SIGN_IDENTITY" "$b"
    else
      codesign --force --deep -s - "$b"   # ad-hoc: loads on this machine
    fi
  fi
}

install_bundle() {
  [ "$INSTALL" = 1 ] || return 0
  local b="$1" ext="${b##*.}" dest=""
  if [ "$OS" = "Darwin" ]; then
    case "$ext" in
      vst3)      dest="$HOME/Library/Audio/Plug-Ins/VST3" ;;
      component) dest="$HOME/Library/Audio/Plug-Ins/Components" ;;
      clap)      dest="$HOME/Library/Audio/Plug-Ins/CLAP" ;;
      *) return 0 ;;
    esac
  else
    case "$ext" in
      vst3) dest="$HOME/.vst3" ;;
      clap) dest="$HOME/.clap" ;;
      *) return 0 ;;
    esac
  fi
  mkdir -p "$dest"
  rm -rf "$dest/$(basename "$b")"
  cp -R "$b" "$dest/"
  echo "   installed -> $dest/$(basename "$b")"
}

process_artifacts() {
  local dir="$1"
  # bundles are directories on every platform (.vst3/.component/.clap)
  while IFS= read -r b; do
    [ -e "$b" ] || continue
    sign_bundle "$b"
    install_bundle "$b"
    echo "   $b"
  done < <(find "$dir/Synflow_artefacts/Release" -maxdepth 2 -type d \
             \( -name '*.vst3' -o -name '*.component' -o -name '*.clap' \) 2>/dev/null)
}

# --- run ----------------------------------------------------------------------------
ensure_wasmtime
ensure_editor

echo "== building INSTRUMENT flavour (Synflow) =="
build_flavour ON  "$HERE/build-instrument"
echo "== building EFFECT flavour (Synflow FX) =="
build_flavour OFF "$HERE/build-effect"

echo; echo "== artifacts =="
echo "instrument:"; process_artifacts "$HERE/build-instrument"
echo "effect:";     process_artifacts "$HERE/build-effect"

echo
echo "Done. 'Synflow' = instrument (channel rack / instrument slot),"
echo "      'Synflow FX' = effect (mixer insert)."
[ "$INSTALL" = 1 ] && echo "Both installed — rescan plugins in your DAW (enable 'verify' if it caches)."
[ "$INSTALL" = 0 ] && echo "Re-run with --install to copy them into the user plug-in folders."
