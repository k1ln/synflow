#pragma once

#include "synflow/FlowLoader.h" // NodeFactoryFn

// Shell node factory: builds the nodes the dependency-light engine core can't —
// wasmtime-hosted DSP (Karplus/Ladder/Noise from the embedded public/*.wasm) and
// juce::dsp builtins (Reverb). Injected into FlowLoader so wasmtime/juce stay out
// of the engine core; only the plugin shell links them.
namespace synflowplugin {
synflow::NodeFactoryFn makeShellFactory();
}
