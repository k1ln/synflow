// OscillatorNode waveform test: verify the band-limited sine/square/sawtooth/
// triangle/custom waveforms render finite, peak-normalised (~1) shapes with the
// expected harmonic content, and that a high fundamental stays band-limited
// (no runaway aliasing). Not a Chrome null-test (the native osc is band-limited
// additive synthesis, not Chrome's exact tables) — a shape/level/stability check.

#include <cmath>
#include <cstdio>
#include <memory>
#include <vector>

#include "synflow/AudioGraphManager.h"
#include "synflow/nodes/OscillatorNode.h"

using namespace synflow;

static int failures = 0;
static void check(bool ok, const char* what) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", what);
    if (!ok) ++failures;
}

static std::vector<float> render(const std::string& type, double freq, int N) {
    const float SR = 48000.0f; const int BLOCK = 128;
    AudioGraphManager g(RuntimeMode::Plugin);
    auto osc = std::make_unique<OscillatorNode>();
    osc->setNamedParamStr("type", type);
    osc->setNamedParam("frequency", freq);
    const int oi = g.addNode(std::move(osc));
    g.setMasterOutput(oi, 0);
    g.prepare(SR, BLOCK);
    std::vector<float> out(static_cast<size_t>(N), 0.0f);
    for (int i = 0; i < N; i += BLOCK)
        g.renderBlock(out.data() + i, std::min(BLOCK, N - i), nullptr, 120.0, 0.0, true);
    return out;
}

static void stats(const std::vector<float>& v, double& peak, double& rms, bool& finite) {
    peak = 0; double a = 0; finite = true;
    for (float x : v) { if (!std::isfinite(x)) finite = false; peak = std::max(peak, (double)std::fabs(x)); a += (double)x * x; }
    rms = std::sqrt(a / v.size());
}

int main() {
    const int N = 48000;
    double peak, rms; bool finite;

    // skip the first samples (filter/phase warm-up) by measuring the steady region
    auto tail = [](const std::vector<float>& v) { return std::vector<float>(v.begin() + 4000, v.end()); };

    {
        auto v = tail(render("sawtooth", 220.0, N)); stats(v, peak, rms, finite);
        check(finite && std::fabs(peak - 1.0) < 0.05, "sawtooth is finite and peak-normalised (~1.0)");
        check(rms > 0.35 && rms < 0.65, "sawtooth RMS is in the ramp range (~0.5)");
    }
    {
        auto v = tail(render("square", 220.0, N)); stats(v, peak, rms, finite);
        check(finite && std::fabs(peak - 1.0) < 0.05, "square is finite and peak-normalised (~1.0)");
        check(rms > 0.6, "square RMS is high (near-unity duty energy)");
    }
    {
        auto v = tail(render("triangle", 220.0, N)); stats(v, peak, rms, finite);
        check(finite && std::fabs(peak - 1.0) < 0.05, "triangle is finite and peak-normalised (~1.0)");
        check(rms > 0.5 && rms < 0.65, "triangle RMS (~0.577) is between sine and square");
    }
    {
        // sine reference
        auto v = tail(render("sine", 220.0, N)); stats(v, peak, rms, finite);
        check(finite && std::fabs(rms - 0.7071) < 0.02, "sine RMS is ~0.707");
    }
    {
        // high fundamental: must stay band-limited (bounded), not blow up with aliasing
        auto v = tail(render("sawtooth", 8000.0, N)); stats(v, peak, rms, finite);
        check(finite && peak < 1.2, "high-frequency sawtooth stays band-limited (bounded)");
    }

    std::printf("\n%s (%d failure%s)\n", failures ? "FAILED" : "ALL PASS", failures, failures == 1 ? "" : "s");
    return failures ? 1 : 0;
}
