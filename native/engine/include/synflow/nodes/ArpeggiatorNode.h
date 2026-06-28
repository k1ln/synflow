#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualArpeggiatorNode. On each clock pulse it lays a whole arpeggio
// run across the beat: the note sequence (up/down/ping-pong/converge/…/chord) is
// subdivided over the beat interval and each note is scheduled at its exact sample.
// The web spreads notes with setTimeout (wall-clock); natively they go into a
// sample-stamped pending queue, drained per block -> transport-locked + reproducible.
//
// Ports (event):  clock-input -> 0 (advance), freq-input -> 1 (set base freq),
//                 reset-input -> 2 (reset).  Output "main-output" -> 0 emits, per
//                 note, a Value(frequency) for control->param steering AND a NoteOn
//                 gate at the same offset (mirrors SequencerFrequency, single port).
//
// Random modes use a seeded xorshift (the web's Math.random can't be matched and
// determinism is the native contract).
class ArpeggiatorNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    int inPortForHandle(const std::string& h) const override {
        if (h.rfind("freq", 0) == 0) return 1;
        if (h.rfind("reset", 0) == 0) return 2;
        return 0; // clock-input / default
    }
    int outPortForHandle(const std::string&) const override { return 0; }

    void prepare(float sr, int maxBlock) override { INode::prepare(sr, maxBlock); sr_ = sr; }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "noteCount") noteCount_ = std::max(1, std::min(24, static_cast<int>(v)));
        else if (name == "baseFrequency") { if (v > 0) baseFreq_ = v; }
        else if (name == "octaveSpread") octaveSpread_ = std::max(0.25, std::min(4.0, v));
        else if (name == "currentStep") currentStep_ = static_cast<int>(v);
        else if (name == "swing") swing_ = std::max(0.0, std::min(1.0, v));
    }
    void setNamedParamStr(const std::string& name, const std::string& v) override {
        if (name == "mode") { mode_ = v; direction_ = 1; }
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink) return;
        const double blockStart = ctx.blockStartSample;
        const double blockEnd = blockStart + ctx.frames;

        if (ctx.inEvents) {
            for (const auto& ev : *ctx.inEvents) {
                if (ev.port == 1) {                       // freq-input: set base frequency
                    if (ev.value > 0) baseFreq_ = ev.value;
                } else if (ev.port == 2) {                // reset-input
                    if (ev.type == EventType::NoteOn) reset();
                } else if (ev.type == EventType::NoteOn) { // clock-input: lay a run
                    scheduleRun(static_cast<double>(blockStart) + ev.sampleOffset,
                                ev.value > 0 ? ev.value : ctx.bpm);
                }
            }
        }

        // Drain scheduled notes that fall in this block.
        for (auto it = pending_.begin(); it != pending_.end();) {
            if (it->absSample >= blockStart && it->absSample < blockEnd) {
                const int off = static_cast<int>(std::lround(it->absSample - blockStart));
                ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::Value, it->freq, off);
                ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOn, 1.0, off);
                it = pending_.erase(it);
            } else {
                ++it;
            }
        }
    }

private:
    struct Note { double absSample; double freq; };

    void reset() { currentStep_ = 0; direction_ = 1; stepCounter_ = 0; shuffleBag_.clear(); }

    void scheduleRun(double clockSample, double bpm) {
        if (bpm <= 0) bpm = 120.0;
        double intervalSamples = (60.0 / bpm) * sr_;
        if (swing_ > 0 && (stepCounter_ % 2) == 1) intervalSamples *= (1.0 + swing_ * 0.5);
        stepCounter_++;

        if (mode_.rfind("chord", 0) == 0) {
            const std::vector<double> chord = chordFrequencies();
            if (mode_ == "chord") {
                for (double f : chord) pending_.push_back({clockSample, f}); // all at once
            } else {
                const double step = intervalSamples / std::max<size_t>(1, chord.size());
                for (size_t i = 0; i < chord.size(); ++i)
                    pending_.push_back({clockSample + static_cast<double>(i) * step, chord[i]});
            }
            return;
        }

        const std::vector<double> freqs = arpeggioNotes();
        const std::vector<int> seq = sequence();
        if (seq.empty()) return;
        const double step = intervalSamples / std::max(1, noteCount_);
        for (size_t i = 0; i < seq.size(); ++i) {
            const int idx = std::max(0, std::min(noteCount_ - 1, seq[i]));
            pending_.push_back({clockSample + static_cast<double>(i) * step, freqs[static_cast<size_t>(idx)]});
        }
        currentStep_ = seq.back();
    }

    std::vector<double> chordFrequencies() {
        std::vector<int> iv;
        if (mode_ == "chord") return {baseFreq_};
        else if (mode_ == "chord-major-up") iv = {0, 4, 7};
        else if (mode_ == "chord-major-down") iv = {7, 4, 0};
        else if (mode_ == "chord-minor-up") iv = {0, 3, 7};
        else if (mode_ == "chord-minor-down") iv = {7, 3, 0};
        else iv = {0};
        std::vector<double> out;
        out.reserve(iv.size());
        for (int s : iv) out.push_back(baseFreq_ * std::pow(2.0, s / 12.0));
        return out;
    }

    std::vector<double> arpeggioNotes() const {
        std::vector<double> notes;
        notes.reserve(static_cast<size_t>(noteCount_));
        const double semitoneStep = (12.0 * octaveSpread_) / std::max(1, noteCount_ - 1);
        for (int i = 0; i < noteCount_; ++i)
            notes.push_back(baseFreq_ * std::pow(2.0, (i * semitoneStep) / 12.0));
        return notes;
    }

    std::vector<int> sequence() {
        std::vector<int> s;
        const int maxIndex = noteCount_ - 1;
        if (mode_ == "up") {
            for (int i = 0; i < noteCount_; ++i) s.push_back(i);
        } else if (mode_ == "down") {
            for (int i = maxIndex; i >= 0; --i) s.push_back(i);
        } else if (mode_ == "up-down") {
            for (int i = 0; i < noteCount_; ++i) s.push_back(i);
            for (int i = maxIndex - 1; i > 0; --i) s.push_back(i);
        } else if (mode_ == "up-down-incl") {
            for (int i = 0; i < noteCount_; ++i) s.push_back(i);
            for (int i = maxIndex; i >= 0; --i) s.push_back(i);
        } else if (mode_ == "down-up") {
            for (int i = maxIndex; i >= 0; --i) s.push_back(i);
            for (int i = 1; i < maxIndex; ++i) s.push_back(i);
        } else if (mode_ == "down-up-incl") {
            for (int i = maxIndex; i >= 0; --i) s.push_back(i);
            for (int i = 0; i < noteCount_; ++i) s.push_back(i);
        } else if (mode_ == "random") {
            for (int i = 0; i < noteCount_; ++i) s.push_back(static_cast<int>(rnd() * noteCount_));
        } else if (mode_ == "random-walk") {
            int cur = currentStep_;
            for (int i = 0; i < noteCount_; ++i) {
                s.push_back(cur);
                cur += (rnd() > 0.5 ? 1 : -1);
                cur = std::max(0, std::min(maxIndex, cur));
            }
        } else if (mode_ == "converge") {
            int low = 0, high = maxIndex;
            while (low <= high) { s.push_back(low); if (low != high) s.push_back(high); low++; high--; }
        } else if (mode_ == "diverge") {
            const int mid = maxIndex / 2;
            std::vector<bool> seen(static_cast<size_t>(noteCount_), false);
            int count = 0, offset = 0;
            while (count < noteCount_) {
                const int low = mid - offset;
                const int high = mid + offset + (maxIndex % 2 == 0 ? 1 : 0);
                if (low >= 0 && !seen[static_cast<size_t>(low)]) { s.push_back(low); seen[static_cast<size_t>(low)] = true; ++count; }
                if (high <= maxIndex && high != low && !seen[static_cast<size_t>(high)]) { s.push_back(high); seen[static_cast<size_t>(high)] = true; ++count; }
                ++offset;
                if (offset > noteCount_ + 1) break; // safety
            }
        } else if (mode_ == "shuffle") {
            if (shuffleBag_.empty()) {
                for (int i = 0; i < noteCount_; ++i) shuffleBag_.push_back(i);
                for (int i = static_cast<int>(shuffleBag_.size()) - 1; i > 0; --i)
                    std::swap(shuffleBag_[static_cast<size_t>(i)], shuffleBag_[static_cast<size_t>(rnd() * (i + 1))]);
            }
            s = shuffleBag_;
        } else {
            for (int i = 0; i < noteCount_; ++i) s.push_back(i); // default up
        }
        return s;
    }

    // deterministic [0,1) PRNG (xorshift32)
    double rnd() {
        rng_ ^= rng_ << 13; rng_ ^= rng_ >> 17; rng_ ^= rng_ << 5;
        return (rng_ & 0xFFFFFF) / static_cast<double>(0x1000000);
    }

    float sr_ = 48000.0f;
    int noteCount_ = 4;
    std::string mode_ = "up";
    double baseFreq_ = 440.0;
    double octaveSpread_ = 1.0;
    int currentStep_ = 0;
    int direction_ = 1;
    double swing_ = 0.0;
    int stepCounter_ = 0;
    std::vector<int> shuffleBag_;
    std::vector<Note> pending_;
    uint32_t rng_ = 0x9e3779b9u;
};

} // namespace synflow
