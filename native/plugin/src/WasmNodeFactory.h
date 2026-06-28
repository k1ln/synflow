#pragma once

#include "synflow/FlowLoader.h" // NodeFactoryFn

// Builds wasmtime-hosted DSP nodes (Karplus/Ladder/Noise) from the wasm modules
// embedded as BinaryData, the SAME public/*.wasm the browser runs. Injected into
// FlowLoader so the dependency-light engine core never links wasmtime — only the
// plugin shell does.
namespace synflowplugin {
synflow::NodeFactoryFn makeWasmFactory();
}
