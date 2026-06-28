#pragma once

#include "../Node.h"

namespace synflow {

// Bucket B — gain. param 0 = gain. input 0 -> output 0 scaled.
class GainNode : public INode {
public:
    // port 0 = main audio input, port 1 = gain modulation (read in a later pass).
    int numInputs() const override { return 2; }
    int numOutputs() const override { return 1; }

    void setParam(int paramId, float value) override {
        if (paramId == 0) gain_ = value;
    }

    void setNamedParam(const std::string& name, double value) override {
        if (name == "gain") gain_ = static_cast<float>(value);
    }

    int inPortForHandle(const std::string& handle) const override {
        return handle == "gain" ? 1 : 0; // "main-input" / default -> 0
    }

    void process(const ProcessContext& ctx) override {
        // When port 1 is fed (e.g. an ADSR envelope or Automation on the "gain"
        // handle), it drives the gain a-rate: effective gain = base * control.
        // The web's ADSR ramps gain.value to base*percent; our control signal is
        // that normalized percent, so base*control reproduces it. Unconnected ->
        // plain scalar gain (port-1 buffer would be zero, which we must ignore).
        const bool modulated = inConnected.size() > 1 && inConnected[1];
        for (int i = 0; i < ctx.frames; ++i) {
            const float g = modulated ? gain_ * in[1][static_cast<size_t>(i)] : gain_;
            out[0][static_cast<size_t>(i)] = in[0][static_cast<size_t>(i)] * g;
        }
    }

private:
    float gain_ = 1.0f;
};

} // namespace synflow
