#pragma once

#include <memory>
#include <string>
#include <vector>

#include "Event.h"
#include "Node.h"
#include "RuntimeMode.h"

namespace synflow {

struct Edge {
    int from;
    int fromPort;
    int to;
    int toPort;
    std::string toHandle; // event edges only: target param name for Value steering
};

// Native C++ port of the engine's graph runtime. Builds a node graph from the
// flow JSON (same JSON the TS @synflow/core produces — JSON the shared contract),
// topologically orders it, and renders block by block. Mode-aware: in Plugin
// mode the host supplies transport; in Standalone the engine supplies its own.
//
// This is deliberately framework-light right now (std C++ only) so the graph
// core compiles and is testable on its own. juce::dsp builtin nodes and the
// wasmtime WasmNode plug into the same INode interface.
class AudioGraphManager : public IEventSink {
public:
    explicit AudioGraphManager(RuntimeMode mode) : mode_(mode) {}

    // Build directly (used by tests). The JSON loader (juce::JSON) will call these.
    int addNode(std::unique_ptr<INode> node);
    void connect(int from, int fromPort, int to, int toPort);
    // Control/event connection (note on/off, values) — routed via the sample-
    // stamped event queue rather than summed as audio. `toHandle` (the target
    // param name) lets a Value event steer that param on the target.
    void connectEvent(int from, int fromPort, int to, int toPort, const std::string& toHandle = "");
    void setMasterOutput(int node, int port);
    // The node that receives external audio (effect's isInput gain, or the
    // plugin's host input). -1 = none (pure source graph).
    void setInputNode(int node, int port);

    void prepare(float sampleRate, int maxBlock);

    // Render `frames` mono samples into out. `input` (optional) is external audio
    // fed into the input node (host input / effect input); nullptr for sources.
    // Transport args are ignored in Standalone (engine clock) and supplied by the
    // host in Plugin mode.
    void renderBlock(float* out, int frames, const float* input = nullptr,
                     double bpm = 120.0, double ppqPosition = 0.0, bool isPlaying = false);

    RuntimeMode mode() const { return mode_; }
    INode* node(int i) { return nodes_.at(static_cast<size_t>(i)).get(); }
    int size() const { return static_cast<int>(nodes_.size()); }

    // IEventSink — called by nodes during process() to emit control events;
    // routed along eventEdges_ into the target nodes' inboxes (this block).
    void emitEvent(int fromNode, int fromPort, EventType type, double value, int sampleOffset) override;

    // Inject an external event (e.g. host MIDI note) for the NEXT renderBlock,
    // delivered to the target node's inbox at the given in-block sample offset.
    void queueInputEvent(int targetNode, int targetPort, EventType type, double value, int sampleOffset);

private:
    void topoSort();

    RuntimeMode mode_;
    float sampleRate_ = 48000.0f;
    int maxBlock_ = 0;
    double samplePos_ = 0.0; // Standalone transport accumulator

    std::vector<std::unique_ptr<INode>> nodes_;
    std::vector<Edge> edges_;
    std::vector<Edge> eventEdges_;
    struct PendingInput { int node; GraphEvent ev; };
    std::vector<PendingInput> pendingInput_;      // external (host) events for next block
    std::vector<std::vector<GraphEvent>> inbox_;  // per-node inbound events (this block)
    std::vector<int> order_;                     // topological order of node indices
    int masterNode_ = -1;
    int masterPort_ = 0;
    int inputNode_ = -1;
    int inputPort_ = 0;
};

} // namespace synflow
