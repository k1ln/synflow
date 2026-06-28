// M4 event-system test: verify the native sample-stamped event queue fires
// Clock ticks at the EXACT sample (transport-locked, deterministic) and that a
// downstream wasm instrument (Karplus) is retriggered sample-accurately.

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <memory>
#include <vector>

#include "synflow/AudioGraphManager.h"
#include "synflow/nodes/ClockNode.h"
#include "synflow/nodes/WasmKarplusNode.h"

using namespace synflow;

// Test-only sink: records the absolute sample position of every gate event.
struct ProbeNode : INode {
    std::vector<long> onSamples, offSamples;
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }
    void process(const ProcessContext& ctx) override {
        if (!ctx.inEvents) return;
        for (const auto& ev : *ctx.inEvents) {
            const long s = static_cast<long>(ctx.blockStartSample) + ev.sampleOffset;
            if (ev.type == EventType::NoteOn) onSamples.push_back(s);
            else if (ev.type == EventType::NoteOff) offSamples.push_back(s);
        }
    }
};

static std::vector<uint8_t> readBin(const std::string& p) {
    std::ifstream f(p, std::ios::binary);
    return std::vector<uint8_t>((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
}

static int failures = 0;
static void check(bool ok, const char* what) {
    std::printf("  [%s] %s\n", ok ? "PASS" : "FAIL", what);
    if (!ok) ++failures;
}

int main() {
    const float SR = 48000.0f;
    const int BLOCK = 128;

    // --- Test 1: Clock ticks land at exact beat samples (120 bpm -> every 24000) ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto clk = std::make_unique<ClockNode>();
        clk->setNamedParam("bpm", 120.0);
        clk->setNamedParam("sendOff", 1.0);
        clk->setNamedParam("offDelayMs", 100.0); // OFF 4800 samples after each ON
        const int ci = g.addNode(std::move(clk));
        auto probe = std::make_unique<ProbeNode>();
        ProbeNode* pr = probe.get();
        const int pi = g.addNode(std::move(probe));
        g.connectEvent(ci, 0, pi, 0);
        g.prepare(SR, BLOCK);

        const int N = 96000; // 2 s -> beats at 0, 24000, 48000, 72000
        std::vector<float> out(BLOCK, 0.0f);
        for (int i = 0; i < N; i += BLOCK)
            g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);

        const std::vector<long> expectOn = {0, 24000, 48000, 72000};
        check(pr->onSamples == expectOn, "clock NoteOn at exact beat samples {0,24000,48000,72000}");

        bool offsOk = pr->offSamples.size() == expectOn.size();
        for (size_t k = 0; offsOk && k < expectOn.size(); ++k)
            offsOk = (pr->offSamples[k] == expectOn[k] + 4800);
        check(offsOk, "clock NoteOff 4800 samples (100 ms) after each ON, cross-block");
    }

    // --- Test 2: Clock -> Karplus retriggers sample-accurately, deterministically ---
    {
        auto wasm = readBin("../../public/karplus.wasm");
        if (wasm.empty()) wasm = readBin("public/karplus.wasm");
        check(!wasm.empty(), "karplus.wasm found");

        auto render = [&](std::vector<float>& out) {
            AudioGraphManager g(RuntimeMode::Plugin);
            auto clk = std::make_unique<ClockNode>();
            clk->setNamedParam("bpm", 120.0);
            const int ci = g.addNode(std::move(clk));
            auto kp = std::make_unique<WasmKarplusNode>(wasm);
            const int ki = g.addNode(std::move(kp));
            g.connectEvent(ci, 0, ki, 0);
            g.setMasterOutput(ki, 0);
            g.prepare(SR, BLOCK);
            const int N = 96000;
            out.assign(static_cast<size_t>(N), 0.0f);
            for (int i = 0; i < N; i += BLOCK)
                g.renderBlock(out.data() + i, BLOCK, nullptr, 120.0, 0.0, true);
        };

        std::vector<float> a, b;
        render(a);
        render(b);

        float maxabs = 0.0f;
        bool finite = true;
        for (float x : a) { maxabs = std::max(maxabs, std::fabs(x)); if (!std::isfinite(x)) finite = false; }
        check(finite && maxabs > 0.05f, "Clock->Karplus produces audible, finite output");
        check(a == b, "render is bit-for-bit deterministic across runs");

        // Energy should jump right after each beat (a fresh pluck). Compare the
        // 2000-sample window just BEFORE beat 2 (decaying) vs just AFTER (re-pluck).
        auto rms = [&](const std::vector<float>& v, int s, int n) {
            double acc = 0; for (int i = 0; i < n; ++i) { double x = v[static_cast<size_t>(s + i)]; acc += x * x; }
            return std::sqrt(acc / n);
        };
        const double before = rms(a, 24000 - 2200, 2000); // tail of beat 1
        const double after = rms(a, 24000 + 200, 2000);   // start of beat 2
        check(after > before, "re-pluck at beat boundary raises energy (sample-accurate retrigger)");
    }

    std::printf("\n%s (%d failure%s)\n", failures ? "FAILED" : "ALL PASS", failures, failures == 1 ? "" : "s");
    return failures ? 1 : 0;
}
