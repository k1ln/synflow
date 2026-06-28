#pragma once

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualOnOffButtonNode. A latching toggle: each incoming trigger
// (a play-panel click / event) flips state and emits a sustained NoteOn when
// turning on, NoteOff when turning off. (Plain Button is momentary; this holds.)
class OnOffButtonNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "isOn") isOn_ = (v != 0.0);
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink || !ctx.inEvents) return;
        for (const auto& ev : *ctx.inEvents) {
            if (ev.type != EventType::NoteOn) continue; // toggle on press; ignore release
            isOn_ = !isOn_;
            ctx.sink->emitEvent(ctx.nodeIndex, 0, isOn_ ? EventType::NoteOn : EventType::NoteOff, ev.value, ev.sampleOffset);
        }
    }

private:
    bool isOn_ = false;
};

} // namespace synflow
