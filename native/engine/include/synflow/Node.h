#pragma once

#include <string>
#include <vector>

#include "RuntimeMode.h"

namespace synflow {

using Buffer = std::vector<float>;

// Per-block context handed to every node. In Plugin mode bpm/ppq/isPlaying come
// from the host playhead; in Standalone the engine fills them from its own clock.
struct ProcessContext {
    float sampleRate = 48000.0f;
    int frames = 0;
    double bpm = 120.0;
    double ppqPosition = 0.0;
    bool isPlaying = false;
    RuntimeMode mode = RuntimeMode::Standalone;
};

// The native counterpart of a Virtual*Node. One C++ implementation per node
// "type" in the flow JSON. Buckets (see plan):
//   A  wasm DSP   -> WasmNode hosts src/wasm/*.wasm via wasmtime
//   B  builtins   -> pure C++ / juce::dsp (GainNode, BiquadNode, ...)
//   C  control    -> event/transport-driven, write control values
//   D  meta       -> sub-flows / unison handled by the graph manager
//
// Audio flows through per-port buffers the graph wires up: the manager sums all
// upstream outputs into a node's input ports before calling process(), matching
// Web Audio's additive connection semantics.
class INode {
public:
    std::string id;
    std::vector<Buffer> in;  // [inputPort][frames]
    std::vector<Buffer> out; // [outputPort][frames]

    virtual ~INode() = default;

    virtual int numInputs() const { return 0; }
    virtual int numOutputs() const { return 1; }

    // Allocate port buffers. Override to add internal state allocation, but call
    // the base (or replicate) so in/out are sized.
    virtual void prepare(float /*sampleRate*/, int maxBlock) {
        in.assign(static_cast<size_t>(numInputs()), Buffer(static_cast<size_t>(maxBlock), 0.0f));
        out.assign(static_cast<size_t>(numOutputs()), Buffer(static_cast<size_t>(maxBlock), 0.0f));
    }

    // Set a continuous parameter by id (ids come from the flow JSON knobs[]).
    virtual void setParam(int /*paramId*/, float /*value*/) {}

    // Apply an initial value from the flow JSON node.data by name (e.g.
    // "frequency", "gain"). Default ignores unknown names.
    virtual void setNamedParam(const std::string& /*name*/, double /*value*/) {}

    // Apply a string-valued param from node.data (e.g. "filterType":"lowpass").
    virtual void setNamedParamStr(const std::string& /*name*/, const std::string& /*value*/) {}

    // Resolve a flow-JSON handle name ("output", "main-input", "frequency",
    // "gain", …) to a port index. Defaults to port 0; nodes override for named
    // modulation/param ports.
    virtual int inPortForHandle(const std::string& /*handle*/) const { return 0; }
    virtual int outPortForHandle(const std::string& /*handle*/) const { return 0; }

    // Render exactly ctx.frames samples: read in[], write out[]. Realtime-safe:
    // no allocation, no locks, no I/O.
    virtual void process(const ProcessContext& ctx) = 0;
};

} // namespace synflow
