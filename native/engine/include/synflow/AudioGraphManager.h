#pragma once

#include <memory>
#include <string>
#include <vector>

#include "Node.h"
#include "RuntimeMode.h"

namespace synflow {

struct Edge {
    int from;
    int fromPort;
    int to;
    int toPort;
};

// Native C++ port of the engine's graph runtime. Builds a node graph from the
// flow JSON (same JSON the TS @synflow/core produces — JSON the shared contract),
// topologically orders it, and renders block by block. Mode-aware: in Plugin
// mode the host supplies transport; in Standalone the engine supplies its own.
//
// This is deliberately framework-light right now (std C++ only) so the graph
// core compiles and is testable on its own. juce::dsp builtin nodes and the
// wasmtime WasmNode plug into the same INode interface.
class AudioGraphManager {
public:
    explicit AudioGraphManager(RuntimeMode mode) : mode_(mode) {}

    // Build directly (used by tests). The JSON loader (juce::JSON) will call these.
    int addNode(std::unique_ptr<INode> node);
    void connect(int from, int fromPort, int to, int toPort);
    void setMasterOutput(int node, int port);

    void prepare(float sampleRate, int maxBlock);

    // Render `frames` mono samples into out. Transport args are ignored in
    // Standalone (engine clock used) and supplied by the host in Plugin mode.
    void renderBlock(float* out, int frames, double bpm = 120.0,
                     double ppqPosition = 0.0, bool isPlaying = false);

    RuntimeMode mode() const { return mode_; }
    INode* node(int i) { return nodes_.at(static_cast<size_t>(i)).get(); }
    int size() const { return static_cast<int>(nodes_.size()); }

private:
    void topoSort();

    RuntimeMode mode_;
    float sampleRate_ = 48000.0f;
    int maxBlock_ = 0;
    double samplePos_ = 0.0; // Standalone transport accumulator

    std::vector<std::unique_ptr<INode>> nodes_;
    std::vector<Edge> edges_;
    std::vector<int> order_; // topological order of node indices
    int masterNode_ = -1;
    int masterPort_ = 0;
};

} // namespace synflow
