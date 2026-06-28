#pragma once

#include <algorithm>
#include <deque>
#include <string>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualADSRNode. In the web the ADSR schedules linear ramps on a
// target AudioParam (handleEdgeADSR): on note-on setValueAtTime(start) ->
// linearRamp(maxAbs, +attack) -> linearRamp(sustainAbs, +attack+sustainTime);
// on note-off linearRamp(minAbs, +release). Natively we generate that exact
// piecewise-linear shape as an a-rate envelope SIGNAL (out[0]), sample-accurate
// from the gate events. Values are normalized to a base of 1 (the canonical
// amplitude-envelope case base=1, min=0%, max=100%); a target scales by its base.
//
//   minAbs = minPercent/100,  maxAbs = maxPercent/100
//   sustainAbs = minAbs + (maxAbs-minAbs)*sustainLevel
class ADSRNode : public INode {
public:
    int numInputs() const override { return 0; }   // gate arrives as events
    int numOutputs() const override { return 1; }   // envelope signal

    void setNamedParam(const std::string& name, double v) override {
        if (name == "attackTime") attack_ = v;
        else if (name == "sustainTime") decay_ = v;       // web "sustainTime" == decay duration
        else if (name == "sustainLevel") sustainLevel_ = v;
        else if (name == "releaseTime") release_ = v;
        else if (name == "minPercent") minPercent_ = v;
        else if (name == "maxPercent") maxPercent_ = v;
    }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        sr_ = sr;
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        const std::vector<GraphEvent>* ev = ctx.inEvents;
        size_t ei = 0;
        for (int i = 0; i < frames; ++i) {
            // Apply every gate event landing exactly at this sample.
            while (ev && ei < ev->size() && (*ev)[ei].sampleOffset <= i) {
                const GraphEvent& e = (*ev)[ei++];
                if (e.type == EventType::NoteOn) gateOn();
                else if (e.type == EventType::NoteOff) gateOff();
            }
            advance();
            out[0][static_cast<size_t>(i)] = static_cast<float>(value_);
        }
    }

private:
    struct Seg { double target; long samples; };

    double minAbs() const { return minPercent_ / 100.0; }
    double maxAbs() const { return maxPercent_ / 100.0; }
    double sustainAbs() const { return minAbs() + (maxAbs() - minAbs()) * sustainLevel_; }

    void gateOn() {
        queue_.clear();
        value_ = std::max(value_, minAbs());            // startVal = max(current, minAbs)
        queue_.push_back({maxAbs(), lround(attack_ * sr_)});      // attack
        queue_.push_back({sustainAbs(), lround(decay_ * sr_)});   // decay to sustain (then hold)
        startNextSeg();
    }

    void gateOff() {
        queue_.clear();
        queue_.push_back({minAbs(), lround(release_ * sr_)});     // release
        startNextSeg();
    }

    void startNextSeg() {
        while (!queue_.empty()) {
            Seg s = queue_.front();
            queue_.pop_front();
            segTarget_ = s.target;
            if (s.samples <= 0) { value_ = s.target; continue; } // instant -> chain to next
            segStep_ = (s.target - value_) / static_cast<double>(s.samples);
            segLeft_ = s.samples;
            return;
        }
        segLeft_ = 0; // queue empty -> hold at value_
    }

    void advance() {
        if (segLeft_ > 0) {
            value_ += segStep_;
            if (--segLeft_ == 0) { value_ = segTarget_; startNextSeg(); }
        }
    }

    static long lround(double x) { return static_cast<long>(x + (x >= 0 ? 0.5 : -0.5)); }

    float sr_ = 48000.0f;
    double attack_ = 0.1, decay_ = 0.5, sustainLevel_ = 0.7, release_ = 0.3;
    double minPercent_ = 0.0, maxPercent_ = 100.0;
    double value_ = 0.0, segTarget_ = 0.0, segStep_ = 0.0;
    long segLeft_ = 0;
    std::deque<Seg> queue_;
};

} // namespace synflow
