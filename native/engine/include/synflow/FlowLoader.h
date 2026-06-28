#pragma once

#include <functional>
#include <memory>
#include <string>

#include "AudioGraphManager.h"

namespace synflow {

// Optional hook so a shell (the JUCE plugin) can supply nodes the dependency-light
// core can't build itself — juce::dsp builtins (Reverb) and wasmtime-hosted DSP
// (Karplus/Granular/...). Tried before the built-in factory; return nullptr to
// fall through. Keeps wasmtime/juce out of the engine core.
using NodeFactoryFn = std::function<std::unique_ptr<INode>(const std::string& type)>;

// Builds an AudioGraphManager from Synflow flow JSON (the shared web/native
// contract). Maps string node ids -> indices, instantiates a C++ INode per
// `type` via the factory, applies node.data scalar params, wires edges by
// resolving sourceHandle/targetHandle -> port indices, and designates the
// master-output node. Unknown types become PassthroughNode stubs.
struct FlowLoadResult {
    int nodeCount = 0;
    int edgeCount = 0;
    int unsupportedCount = 0; // node types that fell back to a stub
    bool hasInput = false;    // an isInput node was found (effect / host input)
    std::string name;
};

class FlowLoader {
public:
    static FlowLoadResult loadInto(AudioGraphManager& graph, const std::string& jsonText,
                                   float sampleRate, int maxBlock,
                                   const NodeFactoryFn& extraFactory = {});
};

} // namespace synflow
