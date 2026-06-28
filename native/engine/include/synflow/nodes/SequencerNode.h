#pragma once

#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualSequencerNode. Driven by incoming trigger events (a Clock on
// the advance/main-input). On each trigger it advances the step (active =
// (active+1) % steps, matching the web's increment-first behavior) and, for every
// enabled row at the new step, emits a NoteOn on that row's output port plus a
// NoteOff `pulseLengths[step]` ms later. Sample-accurate and deterministic.
// Pure event node (no audio); output port index == row index.
class SequencerNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "squares" || name == "steps") { total_ = std::max(1, static_cast<int>(v)); ensureSize(); }
        else if (name == "rows") { rows_ = std::max(1, static_cast<int>(v)); ensureSize(); }
        else if (name == "defaultPulseMs") defaultPulse_ = v;
        else if (name == "activeIndex") active_ = static_cast<int>(v);
    }

    // Configure a row's on/off pattern (length is padded/truncated to `total_`).
    void setRowPattern(int row, const std::vector<bool>& pat) {
        ensureSize();
        if (row < 0 || row >= rows_) return;
        for (int s = 0; s < total_; ++s) patterns_[static_cast<size_t>(row)][static_cast<size_t>(s)] = (s < static_cast<int>(pat.size())) ? pat[static_cast<size_t>(s)] : true;
    }
    void setPulseMs(int step, double ms) { ensureSize(); if (step >= 0 && step < total_) pulse_[static_cast<size_t>(step)] = ms; }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink) return;
        ensureSize();
        const int frames = ctx.frames;
        const double start = ctx.blockStartSample;
        const double end = start + frames;
        const double sr = static_cast<double>(ctx.sampleRate);

        // Emit any scheduled NoteOffs falling in this block.
        for (auto it = pendingOff_.begin(); it != pendingOff_.end();) {
            if (it->absSample >= start && it->absSample < end) {
                ctx.sink->emitEvent(ctx.nodeIndex, it->port, EventType::NoteOff, 0.0, static_cast<int>(std::lround(it->absSample - start)));
                it = pendingOff_.erase(it);
            } else {
                ++it;
            }
        }

        // Each inbound trigger advances the sequence at that exact sample offset.
        if (ctx.inEvents) {
            for (const auto& ev : *ctx.inEvents) {
                if (ev.type != EventType::NoteOn) continue;
                active_ = (active_ + 1) % total_;
                const double pulseSamples = (pulse_[static_cast<size_t>(active_)] * 0.001) * sr;
                for (int row = 0; row < rows_; ++row) {
                    if (!patterns_[static_cast<size_t>(row)][static_cast<size_t>(active_)]) continue;
                    ctx.sink->emitEvent(ctx.nodeIndex, row, EventType::NoteOn, 1.0, ev.sampleOffset);
                    const double offAbs = start + ev.sampleOffset + pulseSamples;
                    const int offOffset = static_cast<int>(std::lround(offAbs - start));
                    if (offOffset < frames)
                        ctx.sink->emitEvent(ctx.nodeIndex, row, EventType::NoteOff, 0.0, std::max(0, offOffset));
                    else
                        pendingOff_.push_back({offAbs, row});
                }
            }
        }
    }

private:
    struct PendingOff { double absSample; int port; };

    void ensureSize() {
        if (static_cast<int>(patterns_.size()) != rows_) patterns_.resize(static_cast<size_t>(rows_));
        for (auto& r : patterns_) if (static_cast<int>(r.size()) != total_) r.resize(static_cast<size_t>(total_), true);
        if (static_cast<int>(pulse_.size()) != total_) pulse_.resize(static_cast<size_t>(total_), defaultPulse_);
        if (active_ >= total_) active_ = total_ - 1;
    }

    int total_ = 8, rows_ = 1, active_ = 0;
    double defaultPulse_ = 10.0;
    std::vector<std::vector<bool>> patterns_;
    std::vector<double> pulse_;
    std::vector<PendingOff> pendingOff_;
};

} // namespace synflow
