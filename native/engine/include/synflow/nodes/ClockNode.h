#pragma once

#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualClockNode. The web clock free-runs on its own BPM via
// setTimeout/setInterval (wall-clock, drifty). Natively it free-runs on the
// SAMPLE clock: a NoteOn fires every samplesPerBeat = sr*60/bpm, at the exact
// sample offset within the block — deterministic and transport-locked. Optional
// NoteOff fires offDelayMs later (cross-block safe). Pure event node: no audio.
class ClockNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "bpm") bpm_ = (v > 0 ? v : 120.0);
        else if (name == "offDelayMs") offDelayMs_ = v;
        else if (name == "sendOff") sendOff_ = (v != 0.0);
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink) return;
        const int frames = ctx.frames;
        const double spb = static_cast<double>(ctx.sampleRate) * 60.0 / bpm_;
        const double start = elapsed_;
        const double end = start + frames;

        // Emit any pending OFFs (from earlier ON ticks) that fall in this block.
        for (auto it = pendingOff_.begin(); it != pendingOff_.end();) {
            if (*it >= start && *it < end) {
                ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOff, 0.0, static_cast<int>(std::lround(*it - start)));
                it = pendingOff_.erase(it);
            } else {
                ++it;
            }
        }

        // Beat ticks: every integer k with k*spb in [start, end).
        long k = static_cast<long>(std::ceil(start / spb - 1e-9));
        for (; static_cast<double>(k) * spb < end - 1e-9; ++k) {
            const double tickAbs = static_cast<double>(k) * spb;
            int offset = static_cast<int>(std::lround(tickAbs - start));
            if (offset < 0) offset = 0;
            if (offset >= frames) continue;
            ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOn, bpm_, offset);
            if (sendOff_) {
                const double offAbs = tickAbs + offDelayMs_ * 0.001 * static_cast<double>(ctx.sampleRate);
                const int offOffset = static_cast<int>(std::lround(offAbs - start));
                if (offOffset < frames)
                    ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOff, 0.0, std::max(0, offOffset));
                else
                    pendingOff_.push_back(offAbs); // lands in a later block
            }
        }
        elapsed_ += frames;
    }

private:
    double bpm_ = 120.0;
    double offDelayMs_ = 50.0;
    bool sendOff_ = false;
    double elapsed_ = 0.0; // samples since transport start
    std::vector<double> pendingOff_;
};

} // namespace synflow
