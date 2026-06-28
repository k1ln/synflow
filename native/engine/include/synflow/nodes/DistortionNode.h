#pragma once

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <string>
#include <vector>

#include "../Node.h"
#include "../dsp/Oversampler.h"

namespace synflow {

// Bucket B — DistortionFlowNode (WaveShaperNode). Maps input through a transfer
// `curve` (node.data.curve) using Web Audio's clamped, linear-interpolated
// lookup. oversample "none", "2x" and "4x" each match Chrome sample-for-sample
// (verified in native/parity). 4x is two cascaded 2x stages, exactly as WebKit's
// WaveShaperDSPKernel::processCurve4x.
class DistortionNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void setNamedParamStr(const std::string& name, const std::string& value) override {
        if (name == "curve") parseCurve(value);
        else if (name == "oversample") oversample_ = value;
    }

    // Set the transfer curve directly (used by the parity harness).
    void setCurve(const std::vector<float>& c) { curve_ = c; }
    const std::string& oversample() const { return oversample_; }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        if (curve_.size() < 2) { // no curve -> passthrough
            for (int i = 0; i < frames; ++i) out[0][static_cast<size_t>(i)] = in[0][static_cast<size_t>(i)];
            return;
        }
        if (oversample_ == "2x") {
            ensureOversampler(frames);
            up_->process(in[0].data(), up2x_.data());            // n -> 2n
            applyCurve(up2x_.data(), up2x_.data(), frames * 2);   // curve at 2x rate
            down_->process(up2x_.data(), out[0].data());         // 2n -> n
            return;
        }
        if (oversample_ == "4x") {
            ensureOversampler(frames);
            ensureOversampler4x(frames);
            up_->process(in[0].data(), up2x_.data());            // n  -> 2n
            up2_->process(up2x_.data(), up4x_.data());           // 2n -> 4n
            applyCurve(up4x_.data(), up4x_.data(), frames * 4);  // curve at 4x rate
            down2_->process(up4x_.data(), up2x_.data());         // 4n -> 2n
            down_->process(up2x_.data(), out[0].data());         // 2n -> n
            return;
        }
        applyCurve(in[0].data(), out[0].data(), frames);
    }

private:
    // Web Audio processCurveWithData: clamp to [-1,1], map, linear-interpolate.
    void applyCurve(const float* src, float* dst, int n) const {
        const int len = static_cast<int>(curve_.size());
        for (int i = 0; i < n; ++i) {
            const float input = src[i];
            if (!std::isfinite(input)) { dst[i] = 0.0f; continue; }
            const float clamped = std::min(1.0f, std::max(-1.0f, input));
            const float v = (len - 1) * 0.5f * (clamped + 1.0f);
            if (v < 0.0f) dst[i] = curve_[0];
            else if (v >= len - 1) dst[i] = curve_[static_cast<size_t>(len - 1)];
            else {
                const float k = std::floor(v);
                const float f = v - k;
                const int ki = static_cast<int>(k);
                dst[i] = (1.0f - f) * curve_[static_cast<size_t>(ki)] + f * curve_[static_cast<size_t>(ki + 1)];
            }
        }
    }

    void ensureOversampler(int frames) {
        if (osBlock_ != frames) { // Web Audio always 128; rebuild if it changes
            up_ = std::make_unique<UpSampler>(frames);
            down_ = std::make_unique<DownSampler>(frames * 2);
            up2x_.assign(static_cast<size_t>(frames * 2), 0.0f);
            osBlock_ = frames;
        }
    }

    // Second cascade stage for 4x (2n -> 4n up, 4n -> 2n down), built lazily.
    void ensureOversampler4x(int frames) {
        if (osBlock4x_ != frames) {
            up2_ = std::make_unique<UpSampler>(frames * 2);
            down2_ = std::make_unique<DownSampler>(frames * 4);
            up4x_.assign(static_cast<size_t>(frames * 4), 0.0f);
            osBlock4x_ = frames;
        }
    }

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
    std::string oversample_ = "none";

    // 2x oversampling state (lazy, sized to the render quantum)
    std::unique_ptr<UpSampler> up_;
    std::unique_ptr<DownSampler> down_;
    std::vector<float> up2x_;
    int osBlock_ = 0;

    // 4x second-stage state (lazy)
    std::unique_ptr<UpSampler> up2_;
    std::unique_ptr<DownSampler> down2_;
    std::vector<float> up4x_;
    int osBlock4x_ = 0;
};

} // namespace synflow
