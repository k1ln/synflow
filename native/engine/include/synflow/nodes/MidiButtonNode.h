#pragma once

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualMidiButtonNode. A mapped host MIDI note becomes a trigger:
// the plugin delivers the matching note as NoteOn/NoteOff; this node forwards it
// to whatever it drives (an ADSR/instrument trigger). Live "input steers it".
class MidiButtonNode : public INode {
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
