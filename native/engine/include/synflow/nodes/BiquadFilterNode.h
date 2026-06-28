#pragma once

#include <cmath>
#include <string>

#include "../Node.h"

namespace synflow {

// Bucket B — BiquadFilterFlowNode. RBJ cookbook biquad, transposed direct form II.
// Matches the Web Audio filter *types*; exact Web-Audio Q-as-dB convention for
// lowpass/highpass is a parity refinement (TODO) — classic linear Q here, which
// is audibly correct. data: filterType (string), frequency, Q, gain (dB, shelves/peak).
class BiquadFilterNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void prepare(float sampleRate, int maxBlock) override {
        INode::prepare(sampleRate, maxBlock);
        sr_ = sampleRate;
        z1_ = z2_ = 0.0;
        recompute();
    }

    void setNamedParam(const std::string& name, double value) override {
        if (name == "frequency") freq_ = static_cast<float>(value);
        else if (name == "Q") q_ = static_cast<float>(value);
        else if (name == "gain" || name == "gainDb") gainDb_ = static_cast<float>(value);
        else return;
        recompute();
    }

    void setNamedParamStr(const std::string& name, const std::string& value) override {
        if (name == "filterType" || name == "type") { kind_ = parseKind(value); recompute(); }
    }

    int inPortForHandle(const std::string& handle) const override {
        if (handle == "frequency") return 0; // freq-mod folds into input for now
        return 0;
    }

    void process(const ProcessContext& ctx) override {
        for (int i = 0; i < ctx.frames; ++i) {
            const double x = in[0][static_cast<size_t>(i)];
            const double y = b0_ * x + z1_;
            z1_ = b1_ * x - a1_ * y + z2_;
            z2_ = b2_ * x - a2_ * y;
            out[0][static_cast<size_t>(i)] = static_cast<float>(y);
        }
    }

private:
    enum class Kind { Lowpass, Highpass, Bandpass, Notch, Allpass, Peaking, Lowshelf, Highshelf };

    static Kind parseKind(const std::string& s) {
        if (s == "highpass") return Kind::Highpass;
        if (s == "bandpass") return Kind::Bandpass;
        if (s == "notch") return Kind::Notch;
        if (s == "allpass") return Kind::Allpass;
        if (s == "peaking") return Kind::Peaking;
        if (s == "lowshelf") return Kind::Lowshelf;
        if (s == "highshelf") return Kind::Highshelf;
        return Kind::Lowpass;
    }

    void recompute() {
        const double f = std::fmax(10.0, std::fmin(static_cast<double>(freq_), 0.45 * sr_));
        const double w0 = 2.0 * M_PI * f / sr_;
        const double cw = std::cos(w0);
        const double sw = std::sin(w0);
        // Web Audio interprets Q in dB for lowpass/highpass (Qeff = 10^(Q/20)),
        // but as a linear quality factor for every other type. Verified against
        // Chrome via the parity harness (native/parity).
        const bool dbQ = (kind_ == Kind::Lowpass || kind_ == Kind::Highpass);
        const double Qeff = dbQ ? std::pow(10.0, static_cast<double>(q_) / 20.0)
                                : std::fmax(1e-4, static_cast<double>(q_));
        const double alpha = sw / (2.0 * Qeff);
        const double A = std::pow(10.0, static_cast<double>(gainDb_) / 40.0);
        const double sqA = std::sqrt(A);

        double b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
        switch (kind_) {
            case Kind::Lowpass:
                b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2;
                a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
            case Kind::Highpass:
                b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2;
                a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
            case Kind::Bandpass:
                b0 = alpha; b1 = 0; b2 = -alpha;
                a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
            case Kind::Notch:
                b0 = 1; b1 = -2 * cw; b2 = 1;
                a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
            case Kind::Allpass:
                b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha;
                a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
            case Kind::Peaking:
                b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
                a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
            case Kind::Lowshelf:
                b0 = A * ((A + 1) - (A - 1) * cw + 2 * sqA * alpha);
                b1 = 2 * A * ((A - 1) - (A + 1) * cw);
                b2 = A * ((A + 1) - (A - 1) * cw - 2 * sqA * alpha);
                a0 = (A + 1) + (A - 1) * cw + 2 * sqA * alpha;
                a1 = -2 * ((A - 1) + (A + 1) * cw);
                a2 = (A + 1) + (A - 1) * cw - 2 * sqA * alpha; break;
            case Kind::Highshelf:
                b0 = A * ((A + 1) + (A - 1) * cw + 2 * sqA * alpha);
                b1 = -2 * A * ((A - 1) + (A + 1) * cw);
                b2 = A * ((A + 1) + (A - 1) * cw - 2 * sqA * alpha);
                a0 = (A + 1) - (A - 1) * cw + 2 * sqA * alpha;
                a1 = 2 * ((A - 1) - (A + 1) * cw);
                a2 = (A + 1) - (A - 1) * cw - 2 * sqA * alpha; break;
        }
        b0_ = b0 / a0; b1_ = b1 / a0; b2_ = b2 / a0;
        a1_ = a1 / a0; a2_ = a2 / a0;
    }

    float sr_ = 48000.0f;
    float freq_ = 350.0f, q_ = 1.0f, gainDb_ = 0.0f;
    Kind kind_ = Kind::Lowpass;
    double b0_ = 1, b1_ = 0, b2_ = 0, a1_ = 0, a2_ = 0;
    double z1_ = 0, z2_ = 0;
};

} // namespace synflow
