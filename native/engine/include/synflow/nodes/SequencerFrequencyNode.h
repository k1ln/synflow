#pragma once

#include <algorithm>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualSequencerFrequencyNode (single-row). Driven by an incoming
// clock: each trigger advances the step and emits the step's frequency as a Value
// on port 0 (-> oscillator.frequency, via the control->param steering path) plus a
// NoteOn gate on port 1 (-> the instrument trigger). Per-step on/off pattern.
class SequencerFrequencyNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    int outPortForHandle(const std::string& h) const override {
        return (h.rfind("freq", 0) == 0 || h == "frequency") ? 0 : 1; // freq -> 0, gate -> 1
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "squares" || name == "steps") { total_ = std::max(1, static_cast<int>(v)); ensure(); }
        else if (name == "activeIndex") active_ = static_cast<int>(v);
    }
    void setArrayParam(const std::string& name, const std::vector<double>& v) override {
        if (name == "frequencies" || name == "notes") { freqs_ = v; ensure(); }
    }
    void setRowPattern(const std::vector<bool>& pat) { pattern_ = pat; ensure(); }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink || !ctx.inEvents) return;
        for (const auto& ev : *ctx.inEvents) {
            if (ev.type != EventType::NoteOn) continue;
            active_ = (active_ + 1) % total_;
            ensure();
            if (!pattern_[static_cast<size_t>(active_)]) continue; // rest
            const double f = freqs_[static_cast<size_t>(active_)];
            ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::Value, f, ev.sampleOffset);   // frequency
            ctx.sink->emitEvent(ctx.nodeIndex, 1, EventType::NoteOn, 1.0, ev.sampleOffset); // gate
        }
    }

private:
    void ensure() {
        if (static_cast<int>(freqs_.size()) != total_) freqs_.resize(static_cast<size_t>(total_), 220.0);
        if (static_cast<int>(pattern_.size()) != total_) pattern_.resize(static_cast<size_t>(total_), true);
        if (active_ >= total_) active_ = total_ - 1;
    }

    int total_ = 8, active_ = 0;
    std::vector<double> freqs_;
    std::vector<bool> pattern_;
};

} // namespace synflow
