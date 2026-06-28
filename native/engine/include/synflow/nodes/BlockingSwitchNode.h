#pragma once

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualBlockingSwitchNode. A blocking voice allocator: each NoteOn is
// assigned to the first free output and held there until its matching NoteOff (keyed
// by the event value — i.e. the note's frequency); the NoteOff is routed to the same
// output and frees it. When all outputs are occupied, further NoteOns are blocked.
// Drives N parallel voice chains from one note stream (a poly front-end).
//
// Ports:  input -> 0, reset-input -> 1.  Outputs "out-0..out-(N-1)" -> ports 0..N-1.
// The web also keys on a MIDI note number when present; the native event model
// carries only `value`, so voices are keyed on the rounded value.
class BlockingSwitchNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    int inPortForHandle(const std::string& h) const override {
        return h.rfind("reset", 0) == 0 ? 1 : 0; // reset-input -> 1, input -> 0
    }
    int outPortForHandle(const std::string& h) const override {
        // "out-2" / "output-2" / trailing integer -> that port; default 0.
        for (size_t i = 0; i < h.size(); ++i)
            if (std::isdigit(static_cast<unsigned char>(h[i]))) return std::atoi(h.c_str() + i);
        return 0;
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "numOutputs" || name == "outputs") numOutputs_ = std::max(1, static_cast<int>(v));
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink || !ctx.inEvents) return;
        for (const auto& ev : *ctx.inEvents) {
            if (ev.port == 1) {                  // reset: release every held voice
                if (ev.type == EventType::NoteOn) releaseAll(ctx);
                continue;
            }
            if (ev.type == EventType::NoteOn) {
                const double key = quantize(ev.value);
                if (find(key) >= 0) continue;        // already sounding -> ignore
                const int out = firstFree();
                if (out < 0) continue;               // all voices busy -> block
                voices_.push_back({key, out});
                ctx.sink->emitEvent(ctx.nodeIndex, out, EventType::NoteOn, ev.value, ev.sampleOffset);
            } else if (ev.type == EventType::NoteOff) {
                const double key = quantize(ev.value);
                const int vi = find(key);
                if (vi < 0) continue;
                ctx.sink->emitEvent(ctx.nodeIndex, voices_[static_cast<size_t>(vi)].output,
                                    EventType::NoteOff, ev.value, ev.sampleOffset);
                voices_.erase(voices_.begin() + vi);
            }
        }
    }

private:
    struct Voice { double key; int output; };

    static double quantize(double v) { return std::round(v * 1e6) / 1e6; }
    int find(double key) const {
        for (size_t i = 0; i < voices_.size(); ++i) if (voices_[i].key == key) return static_cast<int>(i);
        return -1;
    }
    int firstFree() const {
        for (int o = 0; o < numOutputs_; ++o) {
            bool used = false;
            for (const auto& v : voices_) if (v.output == o) { used = true; break; }
            if (!used) return o;
        }
        return -1;
    }
    void releaseAll(const ProcessContext& ctx) {
        for (const auto& v : voices_)
            ctx.sink->emitEvent(ctx.nodeIndex, v.output, EventType::NoteOff, v.key, 0);
        voices_.clear();
    }

    int numOutputs_ = 2;
    std::vector<Voice> voices_;
};

} // namespace synflow
