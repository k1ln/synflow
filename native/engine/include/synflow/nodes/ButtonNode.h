#pragma once

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualButtonNode / VirtualOnOffButtonNode. A UI trigger: when the
// plugin (play-panel button press / editor) delivers a NoteOn/NoteOff for this
// node, it forwards it to whatever it drives (an ADSR/instrument trigger, a
// sequencer advance, …). Same forwarding shape as MidiButton, but UI-driven.
class ButtonNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink || !ctx.inEvents) return;
        for (const auto& ev : *ctx.inEvents)
            if (ev.type == EventType::NoteOn || ev.type == EventType::NoteOff)
                ctx.sink->emitEvent(ctx.nodeIndex, 0, ev.type, ev.value, ev.sampleOffset);
    }
};

} // namespace synflow
