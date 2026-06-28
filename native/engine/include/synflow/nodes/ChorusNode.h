#pragma once

#include <cmath>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket B — ChorusFlowNode. An LFO-modulated, linearly-interpolated delay mixed
// with the dry signal. data: rate (Hz), depth (ms of modulation), mix (0..1).
class ChorusNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void prepare(float sampleRate, int maxBlock) override {
        INode::prepare(sampleRate, maxBlock);
        sr_ = sampleRate;
        buf_.assign(static_cast<size_t>(sampleRate * 0.1) + static_cast<size_t>(maxBlock) + 2, 0.0f); // up to 100ms
        w_ = 0;
        phase_ = 0.0;
    }

    void setNamedParam(const std::string& name, double value) override {
        if (name == "rate") rate_ = static_cast<float>(value);
        else if (name == "depth") depthMs_ = static_cast<float>(value);
        else if (name == "mix") mix_ = static_cast<float>(value);
    }

    void process(const ProcessContext& ctx) override {
        const size_t n = buf_.size();
        const double inc = 2.0 * M_PI * rate_ / sr_;
        for (int i = 0; i < ctx.frames; ++i) {
            const float x = in[0][static_cast<size_t>(i)];
            const float lfo = static_cast<float>(std::sin(phase_));
            const float delayMs = baseMs_ + depthMs_ * lfo; // modulated delay
            const float delaySamp = delayMs * 0.001f * sr_;

            // linear-interpolated read `delaySamp` samples behind the write head
            const float rPos = static_cast<float>(w_) - delaySamp + static_cast<float>(n);
            const size_t r0 = static_cast<size_t>(rPos) % n;
            const size_t r1 = (r0 + 1) % n;
            const float frac = rPos - std::floor(rPos);
            const float wet = buf_[r0] * (1.0f - frac) + buf_[r1] * frac;

            buf_[w_] = x;
            w_ = (w_ + 1) % n;

            out[0][static_cast<size_t>(i)] = x * (1.0f - mix_) + wet * mix_;
            phase_ += inc;
            if (phase_ >= 2.0 * M_PI) phase_ -= 2.0 * M_PI;
        }
    }

private:
    float sr_ = 48000.0f;
    float rate_ = 1.5f, depthMs_ = 2.0f, mix_ = 0.5f;
    float baseMs_ = 12.0f; // center delay the LFO modulates around
    std::vector<float> buf_;
    size_t w_ = 0;
    double phase_ = 0.0;
};

} // namespace synflow
