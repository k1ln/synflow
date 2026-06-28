#pragma once

#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket B — DelayFlowNode. Pure delay line (feedback, if any, is built in the
// graph with a gain edge, exactly like Web Audio). data: delayTime in
// milliseconds (knob 0..1000). No interpolation yet (integer-sample delay).
class DelayNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void prepare(float sampleRate, int maxBlock) override {
        INode::prepare(sampleRate, maxBlock);
        sr_ = sampleRate;
        const size_t maxSamples = static_cast<size_t>(sampleRate * 2.0) + static_cast<size_t>(maxBlock) + 1; // up to 2s
        buf_.assign(maxSamples, 0.0f);
        w_ = 0;
        updateDelay();
    }

    void setNamedParam(const std::string& name, double value) override {
        if (name == "delayTime") { delayMs_ = static_cast<float>(value); updateDelay(); }
    }

    void process(const ProcessContext& ctx) override {
        const size_t n = buf_.size();
        for (int i = 0; i < ctx.frames; ++i) {
            const float x = in[0][static_cast<size_t>(i)];
            const size_t r = (w_ + n - static_cast<size_t>(delaySamples_)) % n;
            out[0][static_cast<size_t>(i)] = buf_[r];
            buf_[w_] = x;
            w_ = (w_ + 1) % n;
        }
    }

private:
    void updateDelay() {
        const int maxD = buf_.empty() ? 0 : static_cast<int>(buf_.size()) - 1;
        delaySamples_ = std::min(maxD, static_cast<int>(std::lround(delayMs_ / 1000.0 * sr_)));
        if (delaySamples_ < 0) delaySamples_ = 0;
    }

    float sr_ = 48000.0f;
    float delayMs_ = 0.0f;
    int delaySamples_ = 0;
    std::vector<float> buf_;
    size_t w_ = 0;
};

} // namespace synflow
