#!/usr/bin/env bash
# M3 wasm parity: host each src/wasm module via the wasmtime C API in the real
# C++ engine and null-test it against V8 running the SAME .wasm. Bit-exact
# expected (wasmtime==V8 for these no-import DSP modules — proven in M0).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

WT="../third_party/wasmtime"
if [ ! -f "$WT/include/wasmtime.h" ]; then
  echo "wasmtime C API missing — run ../third_party/fetch-wasmtime.sh" >&2
  exit 1
fi
mkdir -p build

echo "== compile C++ (engine + wasmtime C API) =="
clang++ -std=c++17 -O2 \
  -I../engine/include -I"$WT/include" \
  -DSYNFLOW_WASMPARITY_DIR="\"$(pwd)\"" \
  karplus_cpp.cpp ../engine/src/AudioGraphManager.cpp \
  -L"$WT/lib" -lwasmtime -Wl,-rpath,"$(cd "$WT/lib" && pwd)" \
  -o build/karplus_cpp

echo "== V8 reference ==" && node karplus_ref.mjs
echo "== C++ (wasmtime) ==" && ./build/karplus_cpp
echo "== null-test ==" && node compare.mjs
