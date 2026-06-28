#pragma once

#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket B — oscillator. param 0 / "frequency" = frequency; input 0 = audio-rate
// frequency modulation. Supports sine/square/sawtooth/triangle plus custom
// (pulse-width or arbitrary wavetable). Standard waveforms are band-limited by
// additive synthesis to the partials below Nyquist and peak-normalised, mirroring
// Web Audio's band-limited oscillator (not bit-exact to Chrome's exact tables, but
// anti-aliased and shape/level-matched). The table is rebuilt only when the partial
// count or waveform changes.
class OscillatorNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void setParam(int paramId, float value) override { if (paramId == 0) freq_ = value; }

    void setNamedParam(const std::string& name, double value) override {
        if (name == "frequency") freq_ = static_cast<float>(value);
        else if (name == "detune") detune_ = value;
        else if (name == "pulseWidth") { pulseWidth_ = value; dirty_ = true; }
        else if (name == "periodicWaveHarmonics") { harmonics_ = std::max(1, static_cast<int>(value)); dirty_ = true; }
    }
    void setNamedParamStr(const std::string& name, const std::string& v) override {
        if (name == "type") { type_ = v; dirty_ = true; }
        else if (name == "customMode") { customMode_ = v; dirty_ = true; }
    }
    void setArrayParam(const std::string& name, const std::vector<double>& v) override {
        if (name == "wavetable") { wavetable_ = v; dirty_ = true; }
    }

    int inPortForHandle(const std::string& /*handle*/) const override { return 0; }

    void prepare(float sr, int maxBlock) override { INode::prepare(sr, maxBlock); sr_ = sr; dirty_ = true; }

    void process(const ProcessContext& ctx) override {
        const double base = freq_ * std::pow(2.0, detune_ / 1200.0);
        if (type_ == "sine") { // pure sine: skip the table
            const double twoPi = 2.0 * M_PI;
            for (int i = 0; i < ctx.frames; ++i) {
                const double f = base + in[0][static_cast<size_t>(i)];
                out[0][static_cast<size_t>(i)] = static_cast<float>(std::sin(phase_ * twoPi));
                phase_ += f / sr_;
                phase_ -= std::floor(phase_);
            }
            return;
        }
        // band-limit to the partials below Nyquist for the (modulated) frequency
        const int partials = std::max(1, static_cast<int>((sr_ * 0.5) / std::max(1.0, std::fabs(base))));
        if (dirty_ || partials != builtPartials_) rebuild(partials);

        const double N = static_cast<double>(table_.size());
        for (int i = 0; i < ctx.frames; ++i) {
            const double f = base + in[0][static_cast<size_t>(i)];
            const double x = phase_ * N;
            const size_t i0 = static_cast<size_t>(x) % table_.size();
            const size_t i1 = (i0 + 1) % table_.size();
            const double frac = x - std::floor(x);
            out[0][static_cast<size_t>(i)] = static_cast<float>(table_[i0] + (table_[i1] - table_[i0]) * frac);
            phase_ += f / sr_;
            phase_ -= std::floor(phase_);
        }
    }

private:
    void rebuild(int partials) {
        const size_t SIZE = 2048;
        std::vector<double> t(SIZE, 0.0);

        if (type_ == "custom" && customMode_ == "wavetable" && wavetable_.size() >= 2) {
            // resample the provided single-cycle wavetable to SIZE (linear)
            const double M = static_cast<double>(wavetable_.size());
            for (size_t i = 0; i < SIZE; ++i) {
                const double x = (i / static_cast<double>(SIZE)) * M;
                const size_t a = static_cast<size_t>(x) % wavetable_.size();
                const size_t b = (a + 1) % wavetable_.size();
                t[i] = wavetable_[a] + (wavetable_[b] - wavetable_[a]) * (x - std::floor(x));
            }
        } else {
            // additive Fourier series, band-limited to `partials`
            auto add = [&](int k, double amp) {
                if (k < 1 || amp == 0.0) return;
                for (size_t i = 0; i < SIZE; ++i)
                    t[i] += amp * std::sin(2.0 * M_PI * k * (i / static_cast<double>(SIZE)));
            };
            if (type_ == "sawtooth") {
                for (int k = 1; k <= partials; ++k) add(k, 1.0 / k);
            } else if (type_ == "square") {
                for (int k = 1; k <= partials; k += 2) add(k, 1.0 / k);
            } else if (type_ == "triangle") {
                int sign = 1;
                for (int k = 1; k <= partials; k += 2) { add(k, sign * 1.0 / (k * k)); sign = -sign; }
            } else { // custom pulse (buildPulsePeriodicWave coefficients), default
                const int H = std::min(partials, harmonics_);
                for (int k = 1; k <= H; ++k)
                    add(k, (2.0 / (k * M_PI)) * std::sin(k * M_PI * pulseWidth_));
            }
        }

        // peak-normalise to 1 (Web Audio normalises PeriodicWave/oscillator output)
        double peak = 0.0;
        for (double v : t) peak = std::max(peak, std::fabs(v));
        if (peak > 1e-9) for (double& v : t) v /= peak;

        table_.assign(t.begin(), t.end());
        builtPartials_ = partials;
        dirty_ = false;
    }

    float sr_ = 48000.0f;
    float freq_ = 220.0f;
    double detune_ = 0.0;
    double phase_ = 0.0;            // normalised [0,1)
    std::string type_ = "sine";
    std::string customMode_;
    double pulseWidth_ = 0.5;
    int harmonics_ = 128;
    std::vector<double> wavetable_;
    std::vector<float> table_;
    int builtPartials_ = -1;
    bool dirty_ = true;
};

} // namespace synflow
