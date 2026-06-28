#pragma once

#include <cstring>

#include "../Node.h"

namespace synflow {

// Bucket A — VirtualMicNode. Outputs the host audio input. The FlowLoader marks a
// MicFlowNode as the graph input node, so the host's mic/track input (fed to
// renderBlock) lands in in[0] and passes straight through to out[0].
class MicNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }
    void process(const ProcessContext& ctx) override {
        std::memcpy(out[0].data(), in[0].data(), sizeof(float) * static_cast<size_t>(ctx.frames));
    }
};

// Bucket C — pass-through event utility (VirtualLogNode / a no-transform Event):
// forwards every incoming event to its output unchanged. (The web Event/Function
// user-JS transform isn't evaluated natively — identity passthrough instead.)
class EventForwardNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }
    void process(const ProcessContext& ctx) override {
        if (!ctx.sink || !ctx.inEvents) return;
        for (const auto& ev : *ctx.inEvents)
            ctx.sink->emitEvent(ctx.nodeIndex, 0, ev.type, ev.value, ev.sampleOffset);
    }
};

} // namespace synflow
