#pragma once

#include <string>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualConstantNode. Emits its constant `value` as a Value event:
// once at startup (so a steered param takes the value immediately) and again on
// every incoming trigger. Routed to a target param handle, it steers that param
// (e.g. Constant -> oscillator.frequency, Constant -> filter.cutoff).
class ConstantNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "value") value_ = v;
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink) return;
        if (!emittedInitial_) { emittedInitial_ = true; ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::Value, value_, 0); }
        if (ctx.inEvents)
            for (const auto& ev : *ctx.inEvents)
                if (ev.type == EventType::NoteOn)
                    ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::Value, value_, ev.sampleOffset);
    }

private:
    double value_ = 0.0;
    bool emittedInitial_ = false;
};

} // namespace synflow
