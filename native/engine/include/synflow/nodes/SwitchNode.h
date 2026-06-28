#pragma once

#include <algorithm>
#include <cctype>
#include <string>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualSwitchNode. Round-robin router: each incoming trigger is
// forwarded to the next output port (cycling 0..outputs-1); a reset input returns
// to 0. Output handle "...-N" / "output-N" / "row-N" -> port N.
class SwitchNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    int inPortForHandle(const std::string& h) const override {
        return (h.rfind("reset", 0) == 0) ? 1 : 0; // "reset" / "reset-input" -> 1
    }
    int outPortForHandle(const std::string& h) const override { return trailingIndex(h); }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "outputs" || name == "numOutputs" || name == "squares") numOutputs_ = std::max(1, static_cast<int>(v));
        else if (name == "activeOutput") active_ = static_cast<int>(v);
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink || !ctx.inEvents) return;
        for (const auto& ev : *ctx.inEvents) {
            if (ev.type == EventType::NoteOn) {
                if (ev.port == 1) { active_ = 0; continue; } // reset
                active_ = (active_ + 1) % numOutputs_;
                ctx.sink->emitEvent(ctx.nodeIndex, active_, EventType::NoteOn, ev.value, ev.sampleOffset);
            } else if (ev.type == EventType::NoteOff && ev.port == 0) {
                ctx.sink->emitEvent(ctx.nodeIndex, active_, EventType::NoteOff, 0.0, ev.sampleOffset);
            }
        }
    }

private:
    static int trailingIndex(const std::string& h) {
        int i = static_cast<int>(h.size()) - 1, val = 0, mul = 1;
        if (i < 0 || !std::isdigit(static_cast<unsigned char>(h[static_cast<size_t>(i)]))) return 0;
        while (i >= 0 && std::isdigit(static_cast<unsigned char>(h[static_cast<size_t>(i)]))) {
            val += (h[static_cast<size_t>(i)] - '0') * mul; mul *= 10; --i;
        }
        return val;
    }

    int numOutputs_ = 2, active_ = 0;
};

} // namespace synflow
