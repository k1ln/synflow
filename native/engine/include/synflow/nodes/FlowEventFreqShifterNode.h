#pragma once

#include <cmath>
#include <string>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualFlowEventFreqShifterNode. NOT audio: it transposes the FREQUENCY
// VALUE carried by control events by `shift` semitones (ratio 2^(shift/12)) and
// re-emits them. trigger-input (port 0) carries the note/frequency; shift-input
// (port 1) sets the semitone amount live. Output "flow-output" -> port 0.
class FlowEventFreqShifterNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    int inPortForHandle(const std::string& h) const override {
        return h.rfind("shift", 0) == 0 ? 1 : 0; // shift-input -> 1; trigger-input -> 0
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "shift") shift_ = v;
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink || !ctx.inEvents) return;
        const double ratio = std::pow(2.0, shift_ / 12.0);
        for (const auto& ev : *ctx.inEvents) {
            if (ev.port == 1) { shift_ = ev.value; continue; } // live shift amount
            const double shifted = ev.value * std::pow(2.0, shift_ / 12.0);
            (void)ratio;
            if (ev.type == EventType::NoteOff) {
                ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::Value, shifted, ev.sampleOffset);
                ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOff, shifted, ev.sampleOffset);
            } else if (ev.type == EventType::NoteOn) {
                ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::Value, shifted, ev.sampleOffset);
                ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOn, shifted, ev.sampleOffset);
            } else {
                ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::Value, shifted, ev.sampleOffset);
            }
        }
    }

private:
    double shift_ = 0.0; // semitones
};

} // namespace synflow
