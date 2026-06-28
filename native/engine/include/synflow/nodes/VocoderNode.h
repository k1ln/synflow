#pragma once

#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket B — VirtualVocoderNode. Classic filter-bank vocoder: a carrier (synth) and
// a modulator (voice) are each split into N log-spaced bandpass bands; each
// modulator band's amplitude envelope (attack/release smoothed) drives the gain of
// the matching carrier band; the bands sum to the output. Two audio inputs:
// carrier -> port 0 (also "main-input"), modulator -> port 1.
//
// The web extracts envelopes by polling AnalyserNodes on a wall-clock setInterval
// (~120 Hz, non-deterministic). Natively the envelope follower runs per sample
// (deterministic, transport-independent) — same character, not bit-exact to the web.
class VocoderNode : public INode {
public:
    int numInputs() const override { return 2; }
    int numOutputs() const override { return 1; }

    int inPortForHandle(const std::string& h) const override {
        return h.rfind("mod", 0) == 0 ? 1 : 0; // modulator -> 1; carrier/main-input -> 0
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "bandCount") { bandCount_ = std::max(4, std::min(32, static_cast<int>(std::lround(v)))); dirty_ = true; }
        else if (name == "lowFreq") { lowFreq_ = v; dirty_ = true; }
        else if (name == "highFreq") { highFreq_ = v; dirty_ = true; }
        else if (name == "attackTime") attackMs_ = std::max(0.5, std::min(100.0, v));
        else if (name == "releaseTime") releaseMs_ = std::max(1.0, std::min(200.0, v));
        else if (name == "qFactor") { qFactor_ = std::max(1.0, std::min(20.0, v)); dirty_ = true; }
        else if (name == "carrierGain") carrierGain_ = std::max(0.0, std::min(2.0, v));
        else if (name == "modulatorGain") modulatorGain_ = std::max(0.0, std::min(2.0, v));
        else if (name == "outputGain") outputGain_ = std::max(0.0, std::min(2.0, v));
    }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        sr_ = sr;
        build();
    }

    void process(const ProcessContext& ctx) override {
        if (dirty_) build();
        const int frames = ctx.frames;
        const float* car = in[0].data();
        const float* mod = in[1].data();
        float* o = out[0].data();

        // per-sample attack/release coefficients (one-pole)
        const double atkCoef = std::exp(-1.0 / (std::max(0.0005, attackMs_ * 0.001) * sr_));
        const double relCoef = std::exp(-1.0 / (std::max(0.0005, releaseMs_ * 0.001) * sr_));
        const double ampCoef = std::exp(-1.0 / (0.005 * sr_)); // 5 ms amplitude estimator

        for (int i = 0; i < frames; ++i) {
            const double cin = car[i] * carrierGain_;
            const double min_ = mod[i] * modulatorGain_;
            double acc = 0.0;
            for (auto& b : bands_) {
                const double cb = b.carrier.process(cin);
                const double mb = b.modulator.process(min_);
                // rectified amplitude estimate of the modulator band -> boosted target
                b.amp = b.amp * ampCoef + std::fabs(mb) * (1 - ampCoef);
                const double target = std::min(1.0, b.amp * 25.0); // 25x: voice through BPF is quiet
                const double coef = target > b.env ? atkCoef : relCoef;
                b.env = target + (b.env - target) * coef;
                acc += cb * b.env;
            }
            o[i] = static_cast<float>(acc * outputGain_);
        }
    }

private:
    // RBJ band-pass biquad (constant 0 dB peak gain) — matches Web Audio 'bandpass'.
    struct Biquad {
        double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
        double z1 = 0, z2 = 0; // transposed direct form II state
        void set(double freq, double q, double sr) {
            const double w0 = 2.0 * M_PI * freq / sr;
            const double alpha = std::sin(w0) / (2.0 * q);
            const double a0 = 1.0 + alpha;
            b0 = alpha / a0; b1 = 0.0; b2 = -alpha / a0;
            a1 = (-2.0 * std::cos(w0)) / a0; a2 = (1.0 - alpha) / a0;
        }
        double process(double x) {
            const double y = b0 * x + z1;
            z1 = b1 * x - a1 * y + z2;
            z2 = b2 * x - a2 * y;
            return y;
        }
    };
    struct Band { Biquad carrier, modulator; double env = 0, amp = 0; };

    void build() {
        bands_.assign(static_cast<size_t>(bandCount_), Band{});
        const double logLow = std::log10(std::max(1.0, lowFreq_));
        const double logHigh = std::log10(std::max(lowFreq_ + 1.0, highFreq_));
        const double logStep = (logHigh - logLow) / bandCount_;
        for (int i = 0; i < bandCount_; ++i) {
            const double f = std::pow(10.0, logLow + (i + 0.5) * logStep);
            bands_[static_cast<size_t>(i)].carrier.set(f, qFactor_, sr_);
            bands_[static_cast<size_t>(i)].modulator.set(f, qFactor_, sr_);
        }
        dirty_ = false;
    }

    float sr_ = 48000.0f;
    int bandCount_ = 16;
    double lowFreq_ = 100.0, highFreq_ = 8000.0;
    double attackMs_ = 5.0, releaseMs_ = 20.0, qFactor_ = 8.0;
    double carrierGain_ = 1.0, modulatorGain_ = 1.0, outputGain_ = 1.0;
    bool dirty_ = true;
    std::vector<Band> bands_;
};

} // namespace synflow
