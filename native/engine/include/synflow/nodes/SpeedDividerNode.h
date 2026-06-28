#pragma once

#include <algorithm>
#include <string>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualSpeedDividerNode (divider path). Passes one output trigger
// for every `divider` incoming triggers (a clock divider): divider 2 = half time,
// etc. NoteOff is forwarded for the ticks that fired, keeping note pairs intact.
class SpeedDividerNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "divider") divider_ = std::max(1, std::min(10, static_cast<int>(v)));
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink || !ctx.inEvents) return;
        for (const auto& ev : *ctx.inEvents) {
            if (ev.type == EventType::NoteOn) {
                if (++count_ >= divider_) {
                    count_ = 0;
                    emitting_ = true;
                    ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOn, ev.value, ev.sampleOffset);
                }
            } else if (ev.type == EventType::NoteOff && emitting_) {
                emitting_ = false;
                ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOff, 0.0, ev.sampleOffset);
            }
        }
    }

private:
    int divider_ = 1, count_ = 0;
    bool emitting_ = false;
};

} // namespace synflow
