// M2 — DSP-correctness test for the C++ builtins, driven through real flow JSON.
//   lowpass.json: feed a sine above vs below cutoff -> highs attenuated, lows pass.
//   delay.json:   feed an impulse -> a 0.4 wet copy appears at the delay time.
// Usage: builtin_test <lowpass.json> <delay.json>

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

// Render a flow, feeding `input` block-by-block, returning the full output.
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
    for (int i = a; i < b; ++i) s += static_cast<double>(v[static_cast<size_t>(i)]) * v[static_cast<size_t>(i)];
    return static_cast<float>(std::sqrt(s / (b - a)));
}

int main(int argc, char** argv) {
    if (argc < 3) { std::printf("usage: builtin_test <lowpass.json> <delay.json>\n"); return 2; }
    const int sr = 48000, N = 4096, block = 128;

    auto sine = [&](double f) {
        std::vector<float> v(static_cast<size_t>(N));
        for (int i = 0; i < N; ++i) v[static_cast<size_t>(i)] = static_cast<float>(std::sin(2.0 * M_PI * f * i / sr));
        return v;
    };

    // --- lowpass @1200Hz, Q1 ---
    const std::string lp = readFile(argv[1]);
    const auto outHi = renderFlow(lp, sine(6000), block); // ~2.3 oct above cutoff
    const auto outLo = renderFlow(lp, sine(300), block);  // below cutoff
    const float rHi = rms(outHi, N / 2, N); // settled half
    const float rLo = rms(outLo, N / 2, N);
    std::printf("lowpass:  300Hz rms=%.3f   6000Hz rms=%.3f   (%.0fx attenuation)\n",
                rLo, rHi, rLo / (rHi + 1e-9f));
    const bool lpOk = rLo > 0.5f && rHi < 0.2f;

    // --- delay 250ms, 0.4 wet ---
    const std::string dl = readFile(argv[2]);
    const int M = 14000;
    std::vector<float> imp(static_cast<size_t>(M), 0.0f);
    imp[0] = 1.0f;
    const auto outD = renderFlow(dl, imp, block);
    const int dpos = static_cast<int>(0.250 * sr); // 12000
    const float dry = outD[0];
    const float wet = outD[static_cast<size_t>(dpos)];
    std::printf("delay:    dry[0]=%.3f   wet[%d]=%.3f   (expect ~1.0 / ~0.4)\n", dry, dpos, wet);
    const bool dlOk = dry > 0.9f && std::fabs(wet - 0.4f) < 0.05f;

    const bool ok = lpOk && dlOk;
    std::printf(ok ? "\n\xE2\x9C\x93 builtins OK (biquad lowpass + delay, via flow JSON)\n"
                   : "\n\xE2\x9C\x97 builtin check failed\n");
    return ok ? 0 : 1;
}
