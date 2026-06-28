// M2 — behavioral checks for the Distortion, Compressor, Chorus builtins,
// driven through the real effect flow JSONs.
//   distortion: a >1.0 input is clamped by the saturating curve (~0.96 peak).
//   compressor: a loud input is gain-reduced; a quiet input passes ~unity.
//   chorus:     output is non-silent, finite, and modulated (differs from dry).
// Usage: effects_test <distortion.json> <compressor.json> <chorus.json>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "synflow/AudioGraphManager.h"
#include "synflow/FlowLoader.h"

using namespace synflow;

static std::string readFile(const char* path) {
    std::ifstream f(path);
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

static std::vector<float> renderFlow(const std::string& json, const std::vector<float>& input, int block) {
    AudioGraphManager g(RuntimeMode::Plugin);
    FlowLoader::loadInto(g, json, 48000.0f, block);
    const int n = static_cast<int>(input.size());
    std::vector<float> out(static_cast<size_t>(n), 0.0f);
    for (int i = 0; i < n; i += block) {
        const int f = std::min(block, n - i);
        g.renderBlock(out.data() + i, f, input.data() + i, 120.0, 0.0, true);
    }
    return out;
}

static float rms(const std::vector<float>& v, int a, int b) {
    double s = 0.0;
    for (int i = a; i < b; ++i) s += double(v[size_t(i)]) * v[size_t(i)];
    return float(std::sqrt(s / (b - a)));
}
static float peak(const std::vector<float>& v) {
    float m = 0.0f;
    for (float x : v) m = std::max(m, std::fabs(x));
    return m;
}
static bool allFinite(const std::vector<float>& v) {
    for (float x : v) if (!std::isfinite(x)) return false;
    return true;
}

int main(int argc, char** argv) {
    if (argc < 4) { std::printf("usage: effects_test <distortion> <compressor> <chorus>\n"); return 2; }
    const int sr = 48000, N = 8192, block = 128;
    auto sine = [&](double f, float amp) {
        std::vector<float> v(static_cast<size_t>(N), 0.0f);
        for (int i = 0; i < N; ++i) v[size_t(i)] = amp * float(std::sin(2.0 * M_PI * f * i / sr));
        return v;
    };

    // distortion: drive(x8) pushes a 2.0 input to ~16 -> waveshaper saturates to
    // the curve endpoint (0.964); out gain 0.6 -> peak ~0.578. Confirms the full
    // drive -> shaper -> level chain saturates rather than passing 16.0 through.
    const auto outDist = renderFlow(readFile(argv[1]), sine(220, 2.0f), block);
    const float distPeak = peak(outDist);
    std::printf("distortion: input 2.0 -> drive x8 -> saturated, out peak %.3f (expect ~0.58 = 0.964 x 0.6)\n", distPeak);
    const bool distOk = allFinite(outDist) && distPeak > 0.5f && distPeak < 0.62f;

    // compressor: loud (0 dBFS) reduced; quiet (-40 dB) passes ~unity
    const std::string comp = readFile(argv[2]);
    const auto outLoud = renderFlow(comp, sine(220, 1.0f), block);
    const auto outQuiet = renderFlow(comp, sine(220, 0.01f), block);
    const float loudOut = rms(outLoud, N / 2, N);
    const float quietOut = rms(outQuiet, N / 2, N);
    std::printf("compressor: loud in rms 0.707 -> out %.3f (reduced);  quiet in 0.0071 -> out %.4f (~unity)\n",
                loudOut, quietOut);
    const bool compOk = allFinite(outLoud) && loudOut < 0.6f && quietOut > 0.006f && quietOut < 0.009f;

    // chorus: non-silent, finite, and modulated (differs from the dry input)
    const auto inCh = sine(220, 0.7f);
    const auto outCh = renderFlow(readFile(argv[3]), inCh, block);
    double diff = 0.0;
    for (int i = N / 2; i < N; ++i) diff += std::fabs(double(outCh[size_t(i)] - inCh[size_t(i)]));
    std::printf("chorus: out rms %.3f, mean|out-dry| %.4f (expect modulated, >0)\n",
                rms(outCh, N / 2, N), diff / (N / 2));
    const bool chOk = allFinite(outCh) && rms(outCh, N / 2, N) > 0.1f && (diff / (N / 2)) > 1e-3;

    const bool ok = distOk && compOk && chOk;
    if (ok) {
        std::printf("\n\xE2\x9C\x93 effects OK (distortion + compressor + chorus, via flow JSON)\n");
    } else {
        std::printf("\n\xE2\x9C\x97 effect check failed%s%s%s\n",
                    distOk ? "" : " [distortion]", compOk ? "" : " [compressor]", chOk ? "" : " [chorus]");
    }
    return ok ? 0 : 1;
}
