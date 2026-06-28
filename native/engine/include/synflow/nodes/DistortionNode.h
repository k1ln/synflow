#pragma once

#include <cstdlib>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket B — DistortionFlowNode (WaveShaperNode). Maps input through a transfer
// `curve` (a comma-separated float table in node.data.curve) using Web Audio's
// linear-interpolated lookup: index = (N-1)/2 * (x+1), clamped. Oversampling
// (node.data.oversample) is an anti-aliasing refinement — TODO, not yet applied.
class DistortionNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void setNamedParamStr(const std::string& name, const std::string& value) override {
        if (name == "curve") parseCurve(value);
        // "oversample" stored for later; no-op for now.
    }

    void process(const ProcessContext& ctx) override {
        const int n = static_cast<int>(curve_.size());
        if (n < 2) { // no curve -> passthrough
            for (int i = 0; i < ctx.frames; ++i) out[0][static_cast<size_t>(i)] = in[0][static_cast<size_t>(i)];
            return;
        }
        for (int i = 0; i < ctx.frames; ++i) {
            const float x = in[0][static_cast<size_t>(i)];
            float idx = (n - 1) * 0.5f * (x + 1.0f); // Web Audio mapping
            if (idx <= 0.0f) { out[0][static_cast<size_t>(i)] = curve_[0]; continue; }
            if (idx >= n - 1) { out[0][static_cast<size_t>(i)] = curve_[static_cast<size_t>(n - 1)]; continue; }
            const int i0 = static_cast<int>(idx);
            const float frac = idx - i0;
            out[0][static_cast<size_t>(i)] = curve_[static_cast<size_t>(i0)] * (1.0f - frac)
                                           + curve_[static_cast<size_t>(i0 + 1)] * frac;
        }
    }

private:
    void parseCurve(const std::string& s) {
        curve_.clear();
        size_t start = 0;
        while (start <= s.size()) {
            size_t comma = s.find(',', start);
            const std::string tok = s.substr(start, comma == std::string::npos ? std::string::npos : comma - start);
            if (!tok.empty()) curve_.push_back(std::strtof(tok.c_str(), nullptr));
            if (comma == std::string::npos) break;
            start = comma + 1;
        }
    }

    std::vector<float> curve_;
};

} // namespace synflow
