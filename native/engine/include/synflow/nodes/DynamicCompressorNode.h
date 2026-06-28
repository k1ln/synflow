#pragma once

#include <cmath>
#include <string>

#include "../Node.h"

namespace synflow {

// Bucket B — DynamicCompressorFlowNode. Feed-forward compressor with soft knee,
// dB-domain static curve, and attack/release-smoothed gain reduction. Web Audio
// defaults (threshold -24, knee 30, ratio 12, attack 0.003, release 0.25); the
// flow overrides via node.data. Exact Web-Audio-compressor parity (its specific
// lookahead/curve) is a refinement — TODO; this is a standard, well-behaved comp.
class DynamicCompressorNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void prepare(float sampleRate, int maxBlock) override {
        INode::prepare(sampleRate, maxBlock);
        sr_ = sampleRate;
        grDb_ = 0.0f;
        updateCoeffs();
    }

    void setNamedParam(const std::string& name, double value) override {
        if (name == "threshold") threshold_ = static_cast<float>(value);
        else if (name == "knee") knee_ = static_cast<float>(value);
        else if (name == "ratio") ratio_ = static_cast<float>(value);
        else if (name == "attack") { attack_ = static_cast<float>(value); updateCoeffs(); }
        else if (name == "release") { release_ = static_cast<float>(value); updateCoeffs(); }
    }

    void process(const ProcessContext& ctx) override {
        for (int i = 0; i < ctx.frames; ++i) {
            const float x = in[0][static_cast<size_t>(i)];
            const float levelDb = 20.0f * std::log10(std::fabs(x) + 1e-9f);

            // target gain reduction (<= 0 dB) via soft-knee static curve
            float targetGr = 0.0f;
            const float over = levelDb - threshold_;
            if (2.0f * over > knee_) {
                targetGr = over * (1.0f / ratio_ - 1.0f);
            } else if (2.0f * std::fabs(over) <= knee_) {
                const float t = over + knee_ * 0.5f;
                targetGr = (1.0f / ratio_ - 1.0f) * t * t / (2.0f * knee_);
            }

            // attack when reduction increases (gr more negative), release otherwise
            const float coeff = (targetGr < grDb_) ? aAttack_ : aRelease_;
            grDb_ = coeff * grDb_ + (1.0f - coeff) * targetGr;

            const float gain = std::pow(10.0f, grDb_ / 20.0f);
            out[0][static_cast<size_t>(i)] = x * gain;
        }
    }

private:
    void updateCoeffs() {
        aAttack_ = std::exp(-1.0f / (std::fmax(1e-4f, attack_) * sr_));
        aRelease_ = std::exp(-1.0f / (std::fmax(1e-4f, release_) * sr_));
    }

    float sr_ = 48000.0f;
    float threshold_ = -24.0f, knee_ = 30.0f, ratio_ = 12.0f, attack_ = 0.003f, release_ = 0.25f;
    float aAttack_ = 0.0f, aRelease_ = 0.0f;
    float grDb_ = 0.0f; // current gain reduction in dB (<= 0)
};

} // namespace synflow
