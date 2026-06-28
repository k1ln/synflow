#pragma once

#include <juce_dsp/juce_dsp.h>

#include <cmath>
#include <cstring>
#include <random>
#include <string>

#include "synflow/Node.h"

namespace synflowplugin {

// Bucket B (juce::dsp) — VirtualReverbNode (ConvolverNode). The web fills a
// ConvolverNode with a PROCEDURAL impulse: ir[n] = (rand*2-1) * (1 - n/length)^decay,
// length = seconds*sr. Because the IR is random there's no bit-parity (the web
// tail differs every render too) — we match the character: same decay formula,
// FFT-partitioned convolution via juce::dsp::Convolution. Mono (engine is mono).
// Lives plugin-side: it needs juce, which the engine core never links.
class ReverbNode : public synflow::INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "seconds") seconds_ = clampd(v, 0.05, 12.0);
        else if (name == "decay") decay_ = clampd(v, 0.1, 12.0);
        else return;
        if (prepared_) buildIR();
    }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        sr_ = sr;
        juce::dsp::ProcessSpec spec{ static_cast<double>(sr), static_cast<juce::uint32>(maxBlock), 1 };
        conv_.prepare(spec);
        prepared_ = true;
        buildIR();
    }

    void process(const synflow::ProcessContext& ctx) override {
        const int frames = ctx.frames;
        float* out0 = out[0].data();
        std::memcpy(out0, in[0].data(), sizeof(float) * static_cast<size_t>(frames));
        float* chans[1] = { out0 };
        juce::dsp::AudioBlock<float> block(chans, 1, static_cast<size_t>(frames));
        juce::dsp::ProcessContextReplacing<float> pc(block);
        conv_.process(pc);
    }

private:
    static double clampd(double v, double lo, double hi) { return v < lo ? lo : (v > hi ? hi : v); }

    void buildIR() {
        const int length = std::max(1, static_cast<int>(std::lround(seconds_ * sr_)));
        juce::AudioBuffer<float> ir(1, length);
        float* d = ir.getWritePointer(0);
        std::mt19937 rng(0x5eed5eedu); // fixed seed: reproducible (web uses Math.random)
        std::uniform_real_distribution<float> dist(-1.0f, 1.0f);
        for (int n = 0; n < length; ++n) {
            const double env = std::pow(1.0 - static_cast<double>(n) / length, decay_);
            d[n] = static_cast<float>(dist(rng) * env);
        }
        conv_.loadImpulseResponse(std::move(ir), sr_,
                                  juce::dsp::Convolution::Stereo::no,
                                  juce::dsp::Convolution::Trim::no,
                                  juce::dsp::Convolution::Normalise::yes);
    }

    juce::dsp::Convolution conv_;
    double seconds_ = 2.5, decay_ = 2.5;
    float sr_ = 48000.0f;
    bool prepared_ = false;
};

} // namespace synflowplugin
