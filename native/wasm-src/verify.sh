#!/usr/bin/env bash
# Build + run verify.cpp: the AS/wasm Gain+RingMod nodes vs the C++ nodes they
# replace. Mirrors native/wasmparity/run.sh's direct-clang++ pattern (no CMake).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

WT="../third_party/wasmtime"
if [ ! -f "$WT/include/wasmtime.h" ]; then
  echo "wasmtime C API missing — run ../third_party/fetch-wasmtime.sh" >&2
  exit 1
fi
mkdir -p build

echo "== compile wasm (asc) =="
node build.mjs

echo "== compile C++ (engine headers + wasmtime C API) =="
clang++ -std=c++17 -O2 \
  -I../engine/include -I"$WT/include" \
  verify.cpp \
  -L"$WT/lib" -lwasmtime -Wl,-rpath,"$(cd "$WT/lib" && pwd)" \
  -o build/verify

echo "== run =="
(cd build && ./verify)
