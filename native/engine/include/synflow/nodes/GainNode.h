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
        for (int i = 0; i < ctx.frames; ++i)
            out[0][static_cast<size_t>(i)] = in[0][static_cast<size_t>(i)] * gain_;
    }

private:
    float gain_ = 1.0f;
};

} // namespace synflow
