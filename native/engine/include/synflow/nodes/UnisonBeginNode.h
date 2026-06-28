#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket D — VirtualUnisonBeginNode. The graph region between UnisonBegin and
// UnisonEnd is cloned into N detuned voices (the FlowLoader replicates the region
// nodes/edges; UnisonEnd sums them). At run time this node receives the note on
// unison-input — a Value(frequency) followed by a NoteOn gate — and fans it out to
// the N voice clones: each voice gets its own slightly detuned frequency so the
// stack sounds "fat". Voice v's edges are wired to output port v (freq) and port
// N+v (raw detune cents, for a detune-output pin). Detune spread is linear in Hz
// (detuneFreqDeviation cents at A440, scaling with the note). Per-voice spread
// factors are fixed (seeded jitter) so the detuning is stable across notes.
class UnisonBeginNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    int inPortForHandle(const std::string&) const override { return 0; } // unison-input
    int outPortForHandle(const std::string& h) const override {
        if (h.rfind("uf", 0) == 0) return std::atoi(h.c_str() + 2);            // freq voice port
        if (h.rfind("ud", 0) == 0) return voices_ + std::atoi(h.c_str() + 2);  // detune voice port
        return 0;
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "numberOfVoices") { voices_ = std::max(1, static_cast<int>(v)); dirty_ = true; }
        else if (name == "detuneFreqDeviation") dev_ = v;
        else if (name == "gainDeviation") gainDev_ = v;
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink || !ctx.inEvents) return;
        if (dirty_) buildFactors();
        for (const auto& ev : *ctx.inEvents) {
            if (ev.type == EventType::Value) { lastFreq_ = ev.value; continue; }
            if (ev.type == EventType::NoteOn) {
                const double f = lastFreq_;
                const double spread = (f > 0) ? dev_ * (f / 440.0) : 0.0; // ± cents
                for (int v = 0; v < voices_; ++v) {
                    const double cents = spread * factors_[static_cast<size_t>(v)];
                    const double vf = (f > 0) ? f * std::pow(2.0, cents / 1200.0) : f;
                    const double vel = ev.value * (1.0 + (rng01(v) * 2 - 1) * gainDev_);
                    ctx.sink->emitEvent(ctx.nodeIndex, v, EventType::Value, vf, ev.sampleOffset);          // -> voice freq
                    ctx.sink->emitEvent(ctx.nodeIndex, v, EventType::NoteOn, vel, ev.sampleOffset);         // -> voice gate
                    ctx.sink->emitEvent(ctx.nodeIndex, voices_ + v, EventType::Value, cents, ev.sampleOffset); // -> detune-output
                }
            } else { // NoteOff
                for (int v = 0; v < voices_; ++v)
                    ctx.sink->emitEvent(ctx.nodeIndex, v, EventType::NoteOff, 0.0, ev.sampleOffset);
            }
        }
    }

private:
    void buildFactors() {
        factors_.assign(static_cast<size_t>(voices_), 0.0);
        if (voices_ == 1) { factors_[0] = 0.0; }
        else {
            const double spacing = 2.0 / (voices_ - 1);
            const double jitter = spacing * 0.25;
            for (int i = 0; i < voices_; ++i) {
                const double base = (i / static_cast<double>(voices_ - 1)) * 2.0 - 1.0;
                double f = base + (rng01(i + 100) * 2 - 1) * jitter;
                factors_[static_cast<size_t>(i)] = std::max(-1.0, std::min(1.0, f));
            }
        }
        dirty_ = false;
    }
    // deterministic per-index [0,1) (so the fat unison doesn't warble per note)
    static double rng01(int i) {
        uint32_t x = static_cast<uint32_t>(i) * 0x9e3779b9u + 0x12345678u;
        x ^= x << 13; x ^= x >> 17; x ^= x << 5;
        return (x & 0xFFFFFF) / static_cast<double>(0x1000000);
    }

    int voices_ = 1;
    double dev_ = 0.0, gainDev_ = 0.0, lastFreq_ = 0.0;
    std::vector<double> factors_;
    bool dirty_ = true;
};

} // namespace synflow
