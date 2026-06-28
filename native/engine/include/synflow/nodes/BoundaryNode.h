#pragma once

#include <cstring>

#include "../Node.h"

namespace synflow {

// Bucket D — sub-flow boundary marker (VirtualInputNode / VirtualOutputNode). When a
// FlowNode's embeddedFlow is flattened into the parent graph, these mark where the
// outer graph hands signal in (InputNode, by data.index) and takes it out
// (OutputNode). They are transparent: audio passes in[0] -> out[0] AND any control
// events pass through unchanged. The loader rewrites the FlowNode's external input-X
// / output-X edges onto the matching boundary node, and classifies each boundary edge
// as event-or-audio by tracing what actually feeds the boundary (see FlowLoader).
class BoundaryNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }
    int inPortForHandle(const std::string&) const override { return 0; }
    int outPortForHandle(const std::string&) const override { return 0; }

    void process(const ProcessContext& ctx) override {
        std::memcpy(out[0].data(), in[0].data(), sizeof(float) * static_cast<size_t>(ctx.frames));
        if (ctx.sink && ctx.inEvents)
            for (const auto& ev : *ctx.inEvents)
                ctx.sink->emitEvent(ctx.nodeIndex, 0, ev.type, ev.value, ev.sampleOffset);
    }
};

} // namespace synflow
