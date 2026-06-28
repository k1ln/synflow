#pragma once

#include <string>

#include "AudioGraphManager.h"

namespace synflow {

// Builds an AudioGraphManager from Synflow flow JSON (the shared web/native
// contract). Maps string node ids -> indices, instantiates a C++ INode per
// `type` via the factory, applies node.data scalar params, wires edges by
// resolving sourceHandle/targetHandle -> port indices, and designates the
// master-output node. Unknown types become PassthroughNode stubs.
struct FlowLoadResult {
    int nodeCount = 0;
    int edgeCount = 0;
    int unsupportedCount = 0; // node types that fell back to a stub
    std::string name;
};

class FlowLoader {
public:
    static FlowLoadResult loadInto(AudioGraphManager& graph, const std::string& jsonText,
                                   float sampleRate, int maxBlock);
};

} // namespace synflow
