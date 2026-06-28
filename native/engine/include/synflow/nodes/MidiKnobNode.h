#pragma once

#include <algorithm>
#include <string>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualMidiKnobNode. A host MIDI CC steers a target param: the
// plugin delivers the raw CC (0..127) as an untagged Value event; this node maps
// it linearly to [min,max] and re-emits Value(mapped) to the connected param
// handle (via the control->param steering path). Live "input steers it".
class MidiKnobNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "min") min_ = v;
        else if (name == "max") max_ = v;
        else if (name == "value") value_ = v;
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink || !ctx.inEvents) return;
        for (const auto& ev : *ctx.inEvents) {
            if (ev.type != EventType::Value) continue; // raw CC 0..127 (no param tag)
            const double cc = std::max(0.0, std::min(127.0, ev.value));
            value_ = min_ + (cc / 127.0) * (max_ - min_);
            ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::Value, value_, ev.sampleOffset);
        }
    }

private:
    double min_ = 0.0, max_ = 1.0, value_ = 0.0;
};

} // namespace synflow
