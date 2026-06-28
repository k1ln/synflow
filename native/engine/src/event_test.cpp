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
#include "synflow/FlowLoader.h"
#include "synflow/nodes/ADSRNode.h"
#include "synflow/nodes/ClockNode.h"
#include "synflow/nodes/ConstantNode.h"
#include "synflow/nodes/GainNode.h"
#include "synflow/nodes/OscillatorNode.h"
#include "synflow/nodes/SequencerNode.h"
#include "synflow/nodes/SpeedDividerNode.h"
#include "synflow/nodes/WasmKarplusNode.h"

#include <sstream>

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

// Test-only event source: emits one NoteOn at `onAt` and one NoteOff at `offAt`.
struct GateNode : INode {
    long onAt = -1, offAt = -1;
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }
    void process(const ProcessContext& ctx) override {
        if (!ctx.sink) return;
        const long start = static_cast<long>(ctx.blockStartSample), end = start + ctx.frames;
        if (onAt >= start && onAt < end) ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOn, 1.0, static_cast<int>(onAt - start));
        if (offAt >= start && offAt < end) ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::NoteOff, 0.0, static_cast<int>(offAt - start));
    }
};

static std::vector<uint8_t> readBin(const std::string& p) {
    std::ifstream f(p, std::ios::binary);
    return std::vector<uint8_t>((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
}

static double rms(const std::vector<float>& v, int s, int n) {
    double acc = 0; for (int i = 0; i < n; ++i) { double x = v[static_cast<size_t>(s + i)]; acc += x * x; }
    return std::sqrt(acc / n);
}

static std::string readText(const std::string& p) {
    std::ifstream f(p);
    std::stringstream ss; ss << f.rdbuf();
    return ss.str();
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
        const double before = rms(a, 24000 - 2200, 2000); // tail of beat 1
        const double after = rms(a, 24000 + 200, 2000);   // start of beat 2
        check(after > before, "re-pluck at beat boundary raises energy (sample-accurate retrigger)");
    }

    // --- Test 3: Clock -> Sequencer -> Probe steps the pattern, gaps are silent ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto clk = std::make_unique<ClockNode>();
        clk->setNamedParam("bpm", 120.0);
        const int ci = g.addNode(std::move(clk));
        auto seq = std::make_unique<SequencerNode>();
        seq->setNamedParam("squares", 4);
        seq->setRowPattern(0, {true, false, true, true}); // step 1 is a rest
        SequencerNode* sp = seq.get();
        (void)sp;
        const int si = g.addNode(std::move(seq));
        auto probe = std::make_unique<ProbeNode>();
        ProbeNode* pr = probe.get();
        const int pi = g.addNode(std::move(probe));
        g.connectEvent(ci, 0, si, 0); // clock advances sequencer
        g.connectEvent(si, 0, pi, 0); // sequencer row 0 -> probe
        g.prepare(SR, BLOCK);

        const int N = 96000; // ticks at 0,24000,48000,72000 -> advance to steps 1,2,3,0
        std::vector<float> out(BLOCK, 0.0f);
        for (int i = 0; i < N; i += BLOCK)
            g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);

        // step 1 (rest) at tick 0 -> no fire; steps 2,3,0 fire at 24000/48000/72000
        const std::vector<long> expectOn = {24000, 48000, 72000};
        check(pr->onSamples == expectOn, "sequencer fires enabled steps, skips the rest (sample-accurate)");
        bool offsOk = pr->offSamples.size() == 3;
        for (size_t k = 0; offsOk && k < 3; ++k) offsOk = (pr->offSamples[k] == expectOn[k] + 480); // 10ms pulse
        check(offsOk, "sequencer NoteOff one pulse (10 ms = 480 samples) after each step");
    }

    // --- Test 4: ADSR envelope has the exact piecewise-linear shape ---
    {
        // attack 0.1s (4800), decay 0.2s (9600), sustain 0.5, release 0.1s (4800)
        AudioGraphManager g(RuntimeMode::Plugin);
        auto gate = std::make_unique<GateNode>();
        gate->onAt = 0; gate->offAt = 24000;
        const int gi = g.addNode(std::move(gate));
        auto adsr = std::make_unique<ADSRNode>();
        adsr->setNamedParam("attackTime", 0.1);
        adsr->setNamedParam("sustainTime", 0.2); // decay duration
        adsr->setNamedParam("sustainLevel", 0.5);
        adsr->setNamedParam("releaseTime", 0.1);
        const int ai = g.addNode(std::move(adsr));
        g.connectEvent(gi, 0, ai, 0);
        g.setMasterOutput(ai, 0); // master output == the envelope signal
        g.prepare(SR, BLOCK);

        const int N = 36000;
        std::vector<float> env(static_cast<size_t>(N), 0.0f);
        for (int i = 0; i < N; i += BLOCK)
            g.renderBlock(env.data() + i, std::min(BLOCK, N - i), nullptr, 120.0, 0.0, true);

        auto near = [](float a, float b) { return std::fabs(a - b) < 0.01f; };
        float peak = 0; for (int i = 4000; i < 5200; ++i) peak = std::max(peak, env[static_cast<size_t>(i)]);
        check(near(peak, 1.0f), "attack ramps to max (1.0)");
        check(near(env[2400], 0.5f), "attack is linear (half-max at half-attack)");
        check(near(env[14400], 0.5f), "decay lands on sustain level (0.5)");
        check(near(env[20000], 0.5f), "sustain holds (0.5) until note-off");
        check(near(env[26400], 0.25f), "release is linear (quarter-value at half-release of 0.5->0)");
        check(near(env[28800], 0.0f) && near(env[30000], 0.0f), "release ramps to min (0.0)");
    }

    // --- Test 5: full synth voice (saw-lead shape): Osc -> Gain[gain=ADSR] -> out ---
    {
        const int N = 36000;
        const long ON = 0, OFF = 24000;

        // Build once; optionally bypass osc or adsr so we can verify voice == osc*env.
        auto renderVoice = [&](bool withOsc, bool withAdsr, std::vector<float>& out) {
            AudioGraphManager g(RuntimeMode::Plugin);
            auto gate = std::make_unique<GateNode>(); gate->onAt = ON; gate->offAt = OFF;
            const int gi = g.addNode(std::move(gate));
            auto osc = std::make_unique<OscillatorNode>(); osc->setNamedParam("frequency", 220.0);
            const int oi = g.addNode(std::move(osc));
            auto adsr = std::make_unique<ADSRNode>();
            adsr->setNamedParam("attackTime", 0.1); adsr->setNamedParam("sustainTime", 0.2);
            adsr->setNamedParam("sustainLevel", 0.5); adsr->setNamedParam("releaseTime", 0.1);
            const int ai = g.addNode(std::move(adsr));
            auto gain = std::make_unique<GainNode>();
            const int gni = g.addNode(std::move(gain));

            g.connectEvent(gi, 0, ai, 0);           // note gate -> ADSR
            if (withOsc) g.connect(oi, 0, gni, 0);   // osc audio -> gain main
            if (withAdsr) g.connect(ai, 0, gni, 1);  // ADSR envelope -> gain.gain
            g.setMasterOutput(gni, 0);
            g.prepare(SR, BLOCK);
            out.assign(static_cast<size_t>(N), 0.0f);
            for (int i = 0; i < N; i += BLOCK) g.renderBlock(out.data() + i, std::min(BLOCK, N - i), nullptr, 120.0, 0.0, true);
        };

        std::vector<float> voice, oscOnly, envOnly;
        renderVoice(true, true, voice);   // osc * env
        renderVoice(true, false, oscOnly); // gain port1 unconnected -> scalar 1.0 -> raw osc
        // env alone: gain with no osc (port0 zero) won't give env; render ADSR as master instead.
        {
            AudioGraphManager g(RuntimeMode::Plugin);
            auto gate = std::make_unique<GateNode>(); gate->onAt = ON; gate->offAt = OFF;
            const int gi = g.addNode(std::move(gate));
            auto adsr = std::make_unique<ADSRNode>();
            adsr->setNamedParam("attackTime", 0.1); adsr->setNamedParam("sustainTime", 0.2);
            adsr->setNamedParam("sustainLevel", 0.5); adsr->setNamedParam("releaseTime", 0.1);
            const int ai = g.addNode(std::move(adsr));
            g.connectEvent(gi, 0, ai, 0);
            g.setMasterOutput(ai, 0);
            g.prepare(SR, BLOCK);
            envOnly.assign(static_cast<size_t>(N), 0.0f);
            for (int i = 0; i < N; i += BLOCK) g.renderBlock(envOnly.data() + i, std::min(BLOCK, N - i), nullptr, 120.0, 0.0, true);
        }

        float maxErr = 0;
        for (int i = 0; i < N; ++i) maxErr = std::max(maxErr, std::fabs(voice[static_cast<size_t>(i)] - oscOnly[static_cast<size_t>(i)] * envOnly[static_cast<size_t>(i)]));
        check(maxErr < 1e-6f, "voice == oscillator * ADSR envelope (sample-exact)");

        const double sus = rms(voice, 20000, 2000);
        const double tail = rms(voice, 34000, 1000); // well after release
        check(sus > 0.05 && tail < 1e-4, "voice sustains while gated, silent after release");
    }

    // --- Test 6: load the real saw-lead.json via FlowLoader, trigger a note ---
    {
        std::string json = readText("../../packages/daw/flows/instruments/saw-lead.json");
        if (json.empty()) json = readText("packages/daw/flows/instruments/saw-lead.json");
        check(!json.empty(), "saw-lead.json found");

        AudioGraphManager g(RuntimeMode::Plugin);
        FlowLoadResult res = FlowLoader::loadInto(g, json, SR, BLOCK);
        check(res.unsupportedCount == 0, "saw-lead.json: every node type is supported (no stubs)");

        // The instrument's note input is its ADSR (isTrigger). Inject a host note.
        int adsrIdx = -1;
        for (int i = 0; i < g.size(); ++i) if (dynamic_cast<ADSRNode*>(g.node(i))) adsrIdx = i;
        check(adsrIdx >= 0, "saw-lead exposes an ADSR note trigger");

        auto gate = std::make_unique<GateNode>(); gate->onAt = 0; gate->offAt = 24000;
        const int gi = g.addNode(std::move(gate));
        g.connectEvent(gi, 0, adsrIdx, 0);
        g.prepare(SR, BLOCK); // re-prepare with the injected gate + event edge

        const int N = 36000;
        std::vector<float> out(static_cast<size_t>(N), 0.0f);
        for (int i = 0; i < N; i += BLOCK) g.renderBlock(out.data() + i, std::min(BLOCK, N - i), nullptr, 120.0, 0.0, true);

        float maxabs = 0; bool finite = true;
        for (float x : out) { maxabs = std::max(maxabs, std::fabs(x)); if (!std::isfinite(x)) finite = false; }
        check(finite && maxabs > 0.05f, "saw-lead renders audible, finite enveloped output");
        check(rms(out, 10000, 2000) > 0.02, "voice sounds while the note is held");
        check(rms(out, 34000, 1500) < 1e-3, "voice is silent after the release tail");
    }

    // --- Test 7: a Constant STEERS an oscillator's frequency (control->param) ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto cst = std::make_unique<ConstantNode>();
        cst->setNamedParam("value", 440.0);
        const int ci = g.addNode(std::move(cst));
        auto osc = std::make_unique<OscillatorNode>();
        osc->setNamedParam("frequency", 220.0); // default; should be overridden to 440
        const int oi = g.addNode(std::move(osc));
        g.connectEvent(ci, 0, oi, 0, "frequency"); // Constant Value -> osc.frequency
        g.setMasterOutput(oi, 0);
        g.prepare(SR, BLOCK);

        const int N = 48000; // 1 s
        std::vector<float> out(static_cast<size_t>(N), 0.0f);
        for (int i = 0; i < N; i += BLOCK) g.renderBlock(out.data() + i, BLOCK, nullptr, 120.0, 0.0, true);

        int crossings = 0; // positive-going zero crossings ~= frequency over 1 s
        for (int i = 1; i < N; ++i) if (out[static_cast<size_t>(i - 1)] <= 0 && out[static_cast<size_t>(i)] > 0) ++crossings;
        check(crossings > 430 && crossings < 450, "Constant steers osc to 440 Hz (not the 220 default)");
    }

    // --- Test 8: SpeedDivider halves a clock (every 2nd tick passes) ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto clk = std::make_unique<ClockNode>();
        clk->setNamedParam("bpm", 120.0);
        const int ci = g.addNode(std::move(clk));
        auto div = std::make_unique<SpeedDividerNode>();
        div->setNamedParam("divider", 2);
        const int di = g.addNode(std::move(div));
        auto probe = std::make_unique<ProbeNode>();
        ProbeNode* pr = probe.get();
        const int pi = g.addNode(std::move(probe));
        g.connectEvent(ci, 0, di, 0);
        g.connectEvent(di, 0, pi, 0);
        g.prepare(SR, BLOCK);

        const int N = 96000; // clock ticks at 0,24000,48000,72000 -> divider 2 -> 24000,72000
        std::vector<float> out(BLOCK, 0.0f);
        for (int i = 0; i < N; i += BLOCK) g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        const std::vector<long> expect = {24000, 72000};
        check(pr->onSamples == expect, "SpeedDivider(2) passes every 2nd clock tick {24000,72000}");
    }

    std::printf("\n%s (%d failure%s)\n", failures ? "FAILED" : "ALL PASS", failures, failures == 1 ? "" : "s");
    return failures ? 1 : 0;
}
