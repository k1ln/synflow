#pragma once

#include <cmath>

#include "../Node.h"

namespace synflow {

// Bucket B — a sine oscillator (native C++; juce::dsp::Oscillator in the real
// build). param 0 = frequency. Optional input 0 = audio-rate frequency mod.
class OscillatorNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void setParam(int paramId, float value) override {
        if (paramId == 0) freq_ = value;
    }

    void setNamedParam(const std::string& name, double value) override {
        if (name == "frequency") freq_ = static_cast<float>(value);
    }

    // "frequency" handle is audio-rate pitch modulation summed into input 0.
    int inPortForHandle(const std::string& /*handle*/) const override { return 0; }

    void process(const ProcessContext& ctx) override {
        const double twoPi = 2.0 * 3.14159265358979323846;
        for (int i = 0; i < ctx.frames; ++i) {
            const float fmod = in[0][static_cast<size_t>(i)]; // 0 if nothing connected
            const double inc = twoPi * (freq_ + fmod) / ctx.sampleRate;
            out[0][static_cast<size_t>(i)] = static_cast<float>(std::sin(phase_));
            phase_ += inc;
            if (phase_ >= twoPi) phase_ -= twoPi;
        }
    }

private:
    float freq_ = 220.0f;
    double phase_ = 0.0;
};

} // namespace synflow
