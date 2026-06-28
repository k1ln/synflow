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
#include "synflow/nodes/ArpeggiatorNode.h"
#include "synflow/nodes/AutomationNode.h"
#include "synflow/nodes/BlockingSwitchNode.h"
#include "synflow/nodes/ClockNode.h"
#include "synflow/nodes/FlowEventFreqShifterNode.h"
#include "synflow/nodes/FunctionNode.h"
#include "synflow/nodes/MidiFileNode.h"
#include "synflow/nodes/ScriptSequencerNode.h"
#include "synflow/Json.h"
#include "synflow/nodes/ConstantNode.h"
#include "synflow/nodes/GainNode.h"
#include "synflow/nodes/MidiButtonNode.h"
#include "synflow/nodes/MidiKnobNode.h"
#include "synflow/nodes/OnOffButtonNode.h"
#include "synflow/nodes/OscillatorNode.h"
#include "synflow/nodes/SequencerFrequencyNode.h"
#include "synflow/nodes/SequencerNode.h"
#include "synflow/nodes/SpeedDividerNode.h"
#include "synflow/nodes/SwitchNode.h"
#include "synflow/nodes/UnisonBeginNode.h"
#include "synflow/nodes/WasmKarplusNode.h"

#include <sstream>

using namespace synflow;

// Test-only sink: records the absolute sample position of every gate event.
struct ProbeNode : INode {
    std::vector<long> onSamples, offSamples;
    std::vector<double> values;
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }
    void process(const ProcessContext& ctx) override {
        if (!ctx.inEvents) return;
        for (const auto& ev : *ctx.inEvents) {
            const long s = static_cast<long>(ctx.blockStartSample) + ev.sampleOffset;
            if (ev.type == EventType::NoteOn) onSamples.push_back(s);
            else if (ev.type == EventType::NoteOff) offSamples.push_back(s);
            else if (ev.type == EventType::Value) values.push_back(ev.value);
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

    // --- Test 9: a host MIDI CC (via MidiKnob) STEERS the oscillator frequency ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto knob = std::make_unique<MidiKnobNode>();
        knob->setNamedParam("min", 100.0);
        knob->setNamedParam("max", 1000.0);
        const int ki = g.addNode(std::move(knob));
        auto osc = std::make_unique<OscillatorNode>();
        osc->setNamedParam("frequency", 220.0);
        const int oi = g.addNode(std::move(osc));
        g.connectEvent(ki, 0, oi, 0, "frequency"); // MidiKnob -> osc.frequency
        g.setMasterOutput(oi, 0);
        g.prepare(SR, BLOCK);

        const int N = 48000;
        std::vector<float> out(static_cast<size_t>(N), 0.0f);
        g.queueInputEvent(ki, 0, EventType::Value, 127.0, 0); // CC=127 -> max -> 1000 Hz
        for (int i = 0; i < N; i += BLOCK) g.renderBlock(out.data() + i, BLOCK, nullptr, 120.0, 0.0, true);

        int crossings = 0;
        for (int i = 1; i < N; ++i) if (out[static_cast<size_t>(i - 1)] <= 0 && out[static_cast<size_t>(i)] > 0) ++crossings;
        check(crossings > 980 && crossings < 1020, "MIDI CC (MidiKnob) steers osc to 1000 Hz (CC 127 -> max)");
    }

    // --- Test 10: a MidiButton forwards a mapped host note as a trigger ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto btn = std::make_unique<MidiButtonNode>();
        const int bi = g.addNode(std::move(btn));
        auto probe = std::make_unique<ProbeNode>();
        ProbeNode* pr = probe.get();
        const int pi = g.addNode(std::move(probe));
        g.connectEvent(bi, 0, pi, 0);
        g.prepare(SR, BLOCK);
        std::vector<float> out(BLOCK, 0.0f);
        g.queueInputEvent(bi, 0, EventType::NoteOn, 1.0, 10); // mapped host note
        g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        check(pr->onSamples.size() == 1 && pr->onSamples[0] == 10, "MidiButton forwards a host note as a trigger");
    }

    // --- Test 11: Switch round-robins clock ticks across its outputs ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto clk = std::make_unique<ClockNode>(); clk->setNamedParam("bpm", 120.0);
        const int ci = g.addNode(std::move(clk));
        auto sw = std::make_unique<SwitchNode>(); sw->setNamedParam("outputs", 2);
        const int wi = g.addNode(std::move(sw));
        auto p0 = std::make_unique<ProbeNode>(); ProbeNode* pr0 = p0.get(); const int i0 = g.addNode(std::move(p0));
        auto p1 = std::make_unique<ProbeNode>(); ProbeNode* pr1 = p1.get(); const int i1 = g.addNode(std::move(p1));
        g.connectEvent(ci, 0, wi, 0);
        g.connectEvent(wi, 0, i0, 0); // switch output 0 -> probe0
        g.connectEvent(wi, 1, i1, 0); // switch output 1 -> probe1
        g.prepare(SR, BLOCK);
        std::vector<float> out(BLOCK, 0.0f);
        for (int i = 0; i < 96000; i += BLOCK) g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        // ticks 0,24000,48000,72000 -> active 1,0,1,0 -> port1:{0,48000} port0:{24000,72000}
        check(pr1->onSamples == std::vector<long>{0, 48000} && pr0->onSamples == std::vector<long>{24000, 72000},
              "Switch round-robins ticks across outputs");
    }

    // --- Test 12: SequencerFrequency emits per-step frequency + gate ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto clk = std::make_unique<ClockNode>(); clk->setNamedParam("bpm", 120.0);
        const int ci = g.addNode(std::move(clk));
        auto seq = std::make_unique<SequencerFrequencyNode>();
        seq->setNamedParam("squares", 4);
        seq->setArrayParam("frequencies", {110.0, 220.0, 440.0, 880.0});
        const int si = g.addNode(std::move(seq));
        auto fp = std::make_unique<ProbeNode>(); ProbeNode* freqP = fp.get(); const int fi = g.addNode(std::move(fp));
        auto gp = std::make_unique<ProbeNode>(); ProbeNode* gateP = gp.get(); const int gi = g.addNode(std::move(gp));
        g.connectEvent(ci, 0, si, 0);
        g.connectEvent(si, 0, fi, 0); // freq output (port 0) -> freq probe
        g.connectEvent(si, 1, gi, 0); // gate output (port 1) -> gate probe
        g.prepare(SR, BLOCK);
        std::vector<float> out(BLOCK, 0.0f);
        for (int i = 0; i < 96000; i += BLOCK) g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        // 4 ticks advance steps 1,2,3,0 -> freqs 220,440,880,110
        check(freqP->values == std::vector<double>{220.0, 440.0, 880.0, 110.0} && gateP->onSamples.size() == 4,
              "SequencerFrequency steps frequencies + fires gate each step");
    }

    // --- Test 13: OnOffButton latches (toggles on each trigger) ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto clk = std::make_unique<ClockNode>(); clk->setNamedParam("bpm", 120.0);
        const int ci = g.addNode(std::move(clk));
        auto btn = std::make_unique<OnOffButtonNode>();
        const int bi = g.addNode(std::move(btn));
        auto probe = std::make_unique<ProbeNode>(); ProbeNode* pr = probe.get();
        const int pi = g.addNode(std::move(probe));
        g.connectEvent(ci, 0, bi, 0);
        g.connectEvent(bi, 0, pi, 0);
        g.prepare(SR, BLOCK);
        std::vector<float> out(BLOCK, 0.0f);
        for (int i = 0; i < 96000; i += BLOCK) g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        // ticks 0,24000,48000,72000 -> on,off,on,off
        check(pr->onSamples == std::vector<long>{0, 48000} && pr->offSamples == std::vector<long>{24000, 72000},
              "OnOffButton latches on/off across triggers");
    }

    // --- Test 14: Automation ramps a steered param through a point curve on trigger ---
    {
        // 0.5 s ramp, value = max - y*(max-min), points: (0,0)->(1,1) i.e. y rises 0->1
        // so value falls max(1000)->min(100) over the ramp. Probe the emitted Values.
        AudioGraphManager g(RuntimeMode::Plugin);
        auto gate = std::make_unique<GateNode>(); gate->onAt = 0; gate->offAt = -1;
        const int gi = g.addNode(std::move(gate));
        auto autom = std::make_unique<AutomationNode>();
        autom->setNamedParam("lengthSec", 0.5);
        autom->setNamedParam("min", 100.0);
        autom->setNamedParam("max", 1000.0);
        autom->setArrayParam("points", {0.0, 0.0, 1.0, 1.0}); // linear y 0->1
        const int ai = g.addNode(std::move(autom));
        auto probe = std::make_unique<ProbeNode>(); ProbeNode* pr = probe.get();
        const int pi = g.addNode(std::move(probe));
        g.connectEvent(gi, 0, ai, 0);
        g.connectEvent(ai, 0, pi, 0, "frequency");
        g.prepare(SR, BLOCK);
        const int N = 48000; // 1 s -> ramp completes at 0.5 s
        std::vector<float> out(BLOCK, 0.0f);
        for (int i = 0; i < N; i += BLOCK) g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        bool ok = !pr->values.empty();
        if (ok) ok = std::fabs(pr->values.front() - 1000.0) < 1.0;   // t=0 -> y=0 -> max
        // last emitted value while ramping should be near min (100)
        if (ok) ok = std::fabs(pr->values.back() - 100.0) < 30.0;
        // monotonic decrease
        for (size_t k = 1; ok && k < pr->values.size(); ++k) ok = pr->values[k] <= pr->values[k - 1] + 1e-6;
        check(ok, "Automation ramps steered param max->min through linear point curve on trigger");
    }

    // --- Test 15: Arpeggiator lays an up-run across the beat (sample-accurate) ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto clk = std::make_unique<ClockNode>(); clk->setNamedParam("bpm", 120.0);
        const int ci = g.addNode(std::move(clk));
        auto arp = std::make_unique<ArpeggiatorNode>();
        arp->setNamedParamStr("mode", "up");
        arp->setNamedParam("noteCount", 4);
        arp->setNamedParam("baseFrequency", 440.0);
        arp->setNamedParam("octaveSpread", 1.0);
        const int ai = g.addNode(std::move(arp));
        auto probe = std::make_unique<ProbeNode>(); ProbeNode* pr = probe.get();
        const int pi = g.addNode(std::move(probe));
        g.connectEvent(ci, 0, ai, 0);             // clock -> arp clock-input
        g.connectEvent(ai, 0, pi, 0, "frequency"); // arp -> probe (Value freq + NoteOn gate)
        g.prepare(SR, BLOCK);
        const int N = 23040; // stop before the 2nd beat (24000): one full 4-note run
        std::vector<float> out(BLOCK, 0.0f);
        for (int i = 0; i < N; i += BLOCK) g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        // beat at 0 -> notes at 0,6000,12000,18000
        check(pr->onSamples == std::vector<long>{0, 6000, 12000, 18000},
              "Arpeggiator subdivides the beat into 4 sample-accurate steps");
        bool freqOk = pr->values.size() == 4
            && std::fabs(pr->values[0] - 440.0) < 0.5    // root
            && std::fabs(pr->values[3] - 880.0) < 0.5;   // +1 octave (octaveSpread 1)
        check(freqOk, "Arpeggiator emits the ascending arpeggio frequencies (440..880)");
    }

    // --- Test 16: BlockingSwitch allocates voices and blocks when full ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto bs = std::make_unique<BlockingSwitchNode>(); bs->setNamedParam("numOutputs", 2);
        const int bi = g.addNode(std::move(bs));
        auto p0 = std::make_unique<ProbeNode>(); ProbeNode* pr0 = p0.get(); const int i0 = g.addNode(std::move(p0));
        auto p1 = std::make_unique<ProbeNode>(); ProbeNode* pr1 = p1.get(); const int i1 = g.addNode(std::move(p1));
        g.connectEvent(bi, 0, i0, 0); // output 0 -> probe0
        g.connectEvent(bi, 1, i1, 0); // output 1 -> probe1
        g.prepare(SR, BLOCK);
        std::vector<float> out(BLOCK, 0.0f);
        // 3 distinct notes on (440,550,660) - 3rd blocked (only 2 outs); then note 440 off.
        g.queueInputEvent(bi, 0, EventType::NoteOn, 440.0, 0);
        g.queueInputEvent(bi, 0, EventType::NoteOn, 550.0, 10);
        g.queueInputEvent(bi, 0, EventType::NoteOn, 660.0, 20); // blocked
        g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        // 440 -> out0, 550 -> out1, 660 blocked
        bool alloc = pr0->onSamples.size() == 1 && pr1->onSamples.size() == 1;
        check(alloc, "BlockingSwitch assigns 2 voices to 2 outputs, blocks the 3rd");
        // Now release 440 (out0 frees), then a new note 770 should take out0.
        g.queueInputEvent(bi, 0, EventType::NoteOff, 440.0, 0);
        g.queueInputEvent(bi, 0, EventType::NoteOn, 770.0, 30);
        g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        check(pr0->offSamples.size() == 1 && pr0->onSamples.size() == 2,
              "BlockingSwitch frees a voice on note-off and reuses the same output");
    }

    // --- Test 17: MidiFile plays its notes on clock ticks (sample-accurate) ---
    {
        // ticksPerBeat 480, two notes: A4(69) @tick0 dur240, C5(72) @tick480 dur240.
        // At 120 bpm -> samplesPerTick=50; clock ticks at 0 and 24000 advance 480 ticks each.
        const char* mj =
            "{\"ticksPerBeat\":480,\"totalTicks\":960,\"tempoChanges\":[],"
            "\"tracks\":[{\"notes\":["
            "{\"note\":69,\"velocity\":100,\"startTick\":0,\"durationTicks\":240,\"channel\":0},"
            "{\"note\":72,\"velocity\":100,\"startTick\":480,\"durationTicks\":240,\"channel\":0}"
            "]}]}";
        AudioGraphManager g(RuntimeMode::Plugin);
        auto clk = std::make_unique<ClockNode>(); clk->setNamedParam("bpm", 120.0);
        const int ci = g.addNode(std::move(clk));
        auto mf = std::make_unique<MidiFileNode>();
        mf->setNamedParam("loop", 0.0);
        mf->setJsonParam("midiFile", JsonParser::parse(mj));
        const int mi = g.addNode(std::move(mf));
        auto probe = std::make_unique<ProbeNode>(); ProbeNode* pr = probe.get();
        const int pi = g.addNode(std::move(probe));
        g.connectEvent(ci, 0, mi, 0);              // clock -> midifile
        g.connectEvent(mi, 0, pi, 0, "frequency");  // main-output -> probe
        g.prepare(SR, BLOCK);
        const int N = 48000; // two beats
        std::vector<float> out(BLOCK, 0.0f);
        for (int i = 0; i < N; i += BLOCK) g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        // note-on A4 @0, C5 @24000 ; note-offs @12000 (240*50) and @36000
        bool onsOk = pr->onSamples == std::vector<long>{0, 24000};
        check(onsOk, "MidiFile fires note-ons at the right sample per clock tick");
        bool offsOk = pr->offSamples == std::vector<long>{12000, 36000};
        check(offsOk, "MidiFile schedules note-offs at startTick+durationTicks");
        bool freqOk = pr->values.size() >= 2
            && std::fabs(pr->values[0] - 440.0) < 0.5
            && std::fabs(pr->values[1] - 523.25) < 0.5; // C5
        check(freqOk, "MidiFile emits the note frequencies (A4=440, C5=523.25)");
    }

    // --- Test 18: ScriptSequencer steps a script, evaluates exprs + vars ---
    {
        // line 0: send out-0 220        -> Value 220 on port 0
        // line 1: send out-0 @A4        -> Value 440 (note A4) on port 0
        // line 2: set $i 3 ; send out-1 $i*100  -> Value 300 on port 1
        // line 3: on out-0 1 ; loop     -> NoteOn on port 0, jump to line 0
        const char* script = "send out-0 220\nsend out-0 @A4\nset $i 3 ; send out-1 $i*100\non out-0 1 ; loop";
        AudioGraphManager g(RuntimeMode::Plugin);
        auto clk = std::make_unique<ClockNode>(); clk->setNamedParam("bpm", 120.0);
        const int ci = g.addNode(std::move(clk));
        auto ss = std::make_unique<ScriptSequencerNode>();
        ss->setNamedParamStr("script", script);
        const int si = g.addNode(std::move(ss));
        auto p0 = std::make_unique<ProbeNode>(); ProbeNode* pr0 = p0.get(); const int i0 = g.addNode(std::move(p0));
        auto p1 = std::make_unique<ProbeNode>(); ProbeNode* pr1 = p1.get(); const int i1 = g.addNode(std::move(p1));
        g.connectEvent(ci, 0, si, 0);              // clock -> script clock
        g.connectEvent(si, 0, i0, 0, "frequency");  // out-0 -> probe0
        g.connectEvent(si, 1, i1, 0, "frequency");  // out-1 -> probe1
        g.prepare(SR, BLOCK);
        // 4 clock ticks (0,24000,48000,72000) -> run lines 0..3
        std::vector<float> out(BLOCK, 0.0f);
        for (int i = 0; i < 96000; i += BLOCK) g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        bool v0 = pr0->values.size() >= 2 && std::fabs(pr0->values[0] - 220.0) < 0.5 && std::fabs(pr0->values[1] - 440.0) < 0.5;
        check(v0, "ScriptSequencer: 'send' literal + '@A4' note expression (220, 440)");
        bool v1 = !pr1->values.empty() && std::fabs(pr1->values[0] - 300.0) < 0.5;
        check(v1, "ScriptSequencer: 'set $i 3' + '$i*100' arithmetic on a var (300)");
        check(!pr0->onSamples.empty() && pr0->onSamples[0] == 72000,
              "ScriptSequencer: 'on' gate fires on the right step (line 3 @ tick 72000)");
    }

    // --- Test 19: ScriptSequencer 'array' spreads values across the beat ---
    {
        const char* script = "array out-0 [100,200,300,400]";
        AudioGraphManager g(RuntimeMode::Plugin);
        auto clk = std::make_unique<ClockNode>(); clk->setNamedParam("bpm", 120.0);
        const int ci = g.addNode(std::move(clk));
        auto ss = std::make_unique<ScriptSequencerNode>(); ss->setNamedParamStr("script", script);
        const int si = g.addNode(std::move(ss));
        auto probe = std::make_unique<ProbeNode>(); ProbeNode* pr = probe.get();
        const int pi = g.addNode(std::move(probe));
        g.connectEvent(ci, 0, si, 0);
        g.connectEvent(si, 0, pi, 0, "frequency");
        g.prepare(SR, BLOCK);
        std::vector<float> out(BLOCK, 0.0f);
        for (int i = 0; i < 23040; i += BLOCK) g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        // first tick @0: 4 values across the beat (24000) -> at 0,6000,12000,18000
        bool ok = pr->values == std::vector<double>{100, 200, 300, 400};
        check(ok, "ScriptSequencer: 'array' emits all values spread across the beat");
    }

    // --- Test 20: Function evaluates a return-expression of its inputs ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto fn = std::make_unique<FunctionNode>();
        fn->setNamedParam("numInputs", 1);
        fn->setNamedParamStr("functionCode", "function process(main, input1){ return main * 2 + input1 }");
        const int fi = g.addNode(std::move(fn));
        auto probe = std::make_unique<ProbeNode>(); ProbeNode* pr = probe.get();
        const int pi = g.addNode(std::move(probe));
        g.connectEvent(fi, 0, pi, 0, "frequency");
        g.prepare(SR, BLOCK);
        std::vector<float> out(BLOCK, 0.0f);
        g.queueInputEvent(fi, 1, EventType::Value, 5.0, 0);   // input1 = 5
        g.queueInputEvent(fi, 0, EventType::Value, 100.0, 1); // main = 100 -> 100*2+5 = 205
        g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        check(!pr->values.empty() && std::fabs(pr->values.back() - 205.0) < 1e-6,
              "Function: process() returns main*2 + input1 (205)");
    }
    // --- Test 21: Function supports Math + ternary; bad code falls back to identity ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto fn = std::make_unique<FunctionNode>();
        fn->setNamedParamStr("functionCode", "return main > 0 ? Math.sqrt(main) : 0");
        const int fi = g.addNode(std::move(fn));
        auto probe = std::make_unique<ProbeNode>(); ProbeNode* pr = probe.get();
        const int pi = g.addNode(std::move(probe));
        g.connectEvent(fi, 0, pi, 0, "frequency");
        g.prepare(SR, BLOCK);
        std::vector<float> out(BLOCK, 0.0f);
        g.queueInputEvent(fi, 0, EventType::Value, 16.0, 0); // 16>0 -> sqrt(16)=4
        g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        check(!pr->values.empty() && std::fabs(pr->values.back() - 4.0) < 1e-6,
              "Function: ternary + Math.sqrt (sqrt(16)=4)");

        AudioGraphManager g2(RuntimeMode::Plugin);
        auto fn2 = std::make_unique<FunctionNode>();
        fn2->setNamedParamStr("functionCode", "for(let i=0;i<3;i++){} return main"); // statements -> identity
        const int fi2 = g2.addNode(std::move(fn2));
        auto p2 = std::make_unique<ProbeNode>(); ProbeNode* pr2 = p2.get();
        const int pi2 = g2.addNode(std::move(p2));
        g2.connectEvent(fi2, 0, pi2, 0, "frequency");
        g2.prepare(SR, BLOCK);
        g2.queueInputEvent(fi2, 0, EventType::Value, 42.0, 0);
        g2.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        check(!pr2->values.empty() && std::fabs(pr2->values.back() - 42.0) < 1e-6,
              "Function: unparseable JS body falls back to identity passthrough (42)");

        // comparison operators (== contains '=') must still parse as an expression
        AudioGraphManager g3(RuntimeMode::Plugin);
        auto fn3 = std::make_unique<FunctionNode>();
        fn3->setNamedParamStr("functionCode", "return main == 7 ? 1 : 0");
        const int fi3 = g3.addNode(std::move(fn3));
        auto p3 = std::make_unique<ProbeNode>(); ProbeNode* pr3 = p3.get();
        const int pi3 = g3.addNode(std::move(p3));
        g3.connectEvent(fi3, 0, pi3, 0, "frequency");
        g3.prepare(SR, BLOCK);
        g3.queueInputEvent(fi3, 0, EventType::Value, 7.0, 0);
        g3.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        check(!pr3->values.empty() && std::fabs(pr3->values.back() - 1.0) < 1e-6,
              "Function: comparison operators (main == 7) evaluate, not rejected");
    }

    // --- Test 22: sub-flow (FlowNode) — events traverse the Input/Output boundary ---
    {
        // outer: Clock -> FlowNode.input-0 ; FlowNode.output-0 -> ADSR -> MasterOut
        // inner: InputNode(0) -> OutputNode(0)   (pure passthrough boundary)
        // If boundary event-transparency works, the clock gate reaches the ADSR and
        // the master output is audible; if events were misrouted as audio, it's silent.
        const char* flow =
            "{\"nodes\":["
            "{\"id\":\"clk\",\"type\":\"ClockFlowNode\",\"data\":{\"bpm\":120}},"
            "{\"id\":\"fn\",\"type\":\"FlowNode\",\"data\":{\"embeddedFlow\":{"
                "\"nodes\":[{\"id\":\"in\",\"type\":\"InputNode\",\"data\":{\"index\":0}},"
                          "{\"id\":\"out\",\"type\":\"OutputNode\",\"data\":{\"index\":0}}],"
                "\"edges\":[{\"source\":\"in\",\"target\":\"out\",\"targetHandle\":\"input\"}]}}},"
            "{\"id\":\"adsr\",\"type\":\"ADSRFlowNode\",\"data\":{\"attackTime\":0.05,\"sustainTime\":0.1,\"sustainLevel\":0.8,\"releaseTime\":0.1}},"
            "{\"id\":\"m\",\"type\":\"MasterOutFlowNode\",\"data\":{}}"
            "],\"edges\":["
            "{\"source\":\"clk\",\"target\":\"fn\",\"targetHandle\":\"input-0\"},"
            "{\"source\":\"fn\",\"sourceHandle\":\"output-0\",\"target\":\"adsr\",\"targetHandle\":\"main-input\"},"
            "{\"source\":\"adsr\",\"target\":\"m\",\"targetHandle\":\"main-input\"}]}";
        AudioGraphManager g(RuntimeMode::Plugin);
        FlowLoadResult res = FlowLoader::loadInto(g, flow, SR, BLOCK);
        check(res.unsupportedCount == 0, "sub-flow: FlowNode + Input/Output boundary nodes all supported");
        const int N = 24000;
        std::vector<float> out(static_cast<size_t>(N), 0.0f);
        for (int i = 0; i < N; i += BLOCK) g.renderBlock(out.data() + i, std::min(BLOCK, N - i), nullptr, 120.0, 0.0, true);
        check(rms(out, 2000, 6000) > 0.05, "sub-flow: clock event traverses Input->Output to trigger the ADSR (audible)");
    }

    // --- Test 23: sub-flow — audio inside the sub-flow reaches the outer master ---
    {
        // inner: Oscillator(440) -> OutputNode(0) ; outer: FlowNode.output-0 -> MasterOut
        const char* flow =
            "{\"nodes\":["
            "{\"id\":\"fn\",\"type\":\"FlowNode\",\"data\":{\"embeddedFlow\":{"
                "\"nodes\":[{\"id\":\"osc\",\"type\":\"OscillatorFlowNode\",\"data\":{\"frequency\":440,\"type\":\"sine\"}},"
                          "{\"id\":\"out\",\"type\":\"OutputNode\",\"data\":{\"index\":0}}],"
                "\"edges\":[{\"source\":\"osc\",\"target\":\"out\",\"targetHandle\":\"input\"}]}}},"
            "{\"id\":\"m\",\"type\":\"MasterOutFlowNode\",\"data\":{}}"
            "],\"edges\":["
            "{\"source\":\"fn\",\"sourceHandle\":\"output-0\",\"target\":\"m\",\"targetHandle\":\"main-input\"}]}";
        AudioGraphManager g(RuntimeMode::Plugin);
        FlowLoadResult res = FlowLoader::loadInto(g, flow, SR, BLOCK);
        check(res.unsupportedCount == 0, "audio sub-flow: every node supported");
        const int N = 24000;
        std::vector<float> out(static_cast<size_t>(N), 0.0f);
        for (int i = 0; i < N; i += BLOCK) g.renderBlock(out.data() + i, std::min(BLOCK, N - i), nullptr, 120.0, 0.0, true);
        int crossings = 0;
        for (int i = 1; i < N; ++i) if (out[static_cast<size_t>(i - 1)] <= 0 && out[static_cast<size_t>(i)] > 0) ++crossings;
        // ~440 Hz over 0.5 s -> ~220 zero crossings; just confirm the sub-flow osc reaches master
        check(rms(out, 1000, 4000) > 0.1 && crossings > 200 && crossings < 240,
              "audio sub-flow: inner oscillator (440 Hz) reaches the outer master output");
    }

    // --- Test 24: FlowEventFreqShifter transposes event frequencies by semitones ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto sh = std::make_unique<FlowEventFreqShifterNode>(); sh->setNamedParam("shift", 12.0); // +1 octave
        const int si = g.addNode(std::move(sh));
        auto probe = std::make_unique<ProbeNode>(); ProbeNode* pr = probe.get();
        const int pi = g.addNode(std::move(probe));
        g.connectEvent(si, 0, pi, 0, "frequency");
        g.prepare(SR, BLOCK);
        std::vector<float> out(BLOCK, 0.0f);
        g.queueInputEvent(si, 0, EventType::NoteOn, 440.0, 0); // 440 +12st -> 880
        g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        check(!pr->values.empty() && std::fabs(pr->values.back() - 880.0) < 0.5 && !pr->onSamples.empty(),
              "FlowEventFreqShifter transposes 440 Hz up an octave (880) + forwards the gate");
    }

    // --- Test 25: UnisonBegin fans a note out to N detuned voice frequencies ---
    {
        AudioGraphManager g(RuntimeMode::Plugin);
        auto ub = std::make_unique<UnisonBeginNode>();
        ub->setNamedParam("numberOfVoices", 3);
        ub->setNamedParam("detuneFreqDeviation", 20.0); // ±20 cents at A440
        const int bi = g.addNode(std::move(ub));
        auto p0 = std::make_unique<ProbeNode>(); ProbeNode* pr0 = p0.get(); const int i0 = g.addNode(std::move(p0));
        auto p1 = std::make_unique<ProbeNode>(); ProbeNode* pr1 = p1.get(); const int i1 = g.addNode(std::move(p1));
        auto p2 = std::make_unique<ProbeNode>(); ProbeNode* pr2 = p2.get(); const int i2 = g.addNode(std::move(p2));
        g.connectEvent(bi, 0, i0, 0, "frequency");
        g.connectEvent(bi, 1, i1, 0, "frequency");
        g.connectEvent(bi, 2, i2, 0, "frequency");
        g.prepare(SR, BLOCK);
        std::vector<float> out(BLOCK, 0.0f);
        g.queueInputEvent(bi, 0, EventType::Value, 440.0, 0);  // note frequency
        g.queueInputEvent(bi, 0, EventType::NoteOn, 1.0, 0);   // gate
        g.renderBlock(out.data(), BLOCK, nullptr, 120.0, 0.0, true);
        bool got = !pr0->values.empty() && !pr1->values.empty() && !pr2->values.empty();
        double f0 = got ? pr0->values[0] : 0, f1 = got ? pr1->values[0] : 0, f2 = got ? pr2->values[0] : 0;
        check(got && f0 < f1 && f1 < f2 && f0 > 432 && f2 < 448,
              "Unison spreads 3 voices into ascending detuned frequencies around 440");
        check(std::fabs(f1 - 440.0) < 3.5, "Unison middle voice stays near the centre pitch (440)");
    }

    // --- Test 26: full unison flow renders N voice clones summed at UnisonEnd ---
    {
        const char* flow =
            "{\"nodes\":["
            "{\"id\":\"ub\",\"type\":\"UnisonBeginFlowNode\",\"data\":{\"numberOfVoices\":3,\"detuneFreqDeviation\":15}},"
            "{\"id\":\"osc\",\"type\":\"OscillatorFlowNode\",\"data\":{\"frequency\":440,\"type\":\"sawtooth\"}},"
            "{\"id\":\"ue\",\"type\":\"UnisonEndFlowNode\",\"data\":{}},"
            "{\"id\":\"m\",\"type\":\"MasterOutFlowNode\",\"data\":{}}"
            "],\"edges\":["
            "{\"source\":\"ub\",\"sourceHandle\":\"unison-output\",\"target\":\"osc\",\"targetHandle\":\"frequency\"},"
            "{\"source\":\"osc\",\"target\":\"ue\",\"targetHandle\":\"main-input\"},"
            "{\"source\":\"ue\",\"target\":\"m\",\"targetHandle\":\"main-input\"}]}";
        AudioGraphManager g(RuntimeMode::Plugin);
        FlowLoadResult res = FlowLoader::loadInto(g, flow, SR, BLOCK);
        check(res.unsupportedCount == 0, "unison flow: every node supported (Begin/End/voice clones)");
        // region {osc} cloned x3 -> 3 osc clones + Begin + End + Master = 6 nodes
        check(res.nodeCount == 6, "unison flow: region replicated into 3 voice clones (6 nodes total)");
        // drive a note into UnisonBegin (its flat id is unchanged at top level)
        int biIdx = res.nodeIndexById.count("ub") ? res.nodeIndexById["ub"] : -1;
        check(biIdx >= 0, "unison flow: UnisonBegin present");
        g.queueInputEvent(biIdx, 0, EventType::Value, 440.0, 0);
        g.queueInputEvent(biIdx, 0, EventType::NoteOn, 1.0, 0);
        const int N = 24000;
        std::vector<float> out(static_cast<size_t>(N), 0.0f);
        for (int i = 0; i < N; i += BLOCK) {
            if (i > 0) { g.queueInputEvent(biIdx, 0, EventType::Value, 440.0, 0); g.queueInputEvent(biIdx, 0, EventType::NoteOn, 1.0, 0); }
            g.renderBlock(out.data() + i, std::min(BLOCK, N - i), nullptr, 120.0, 0.0, true);
        }
        bool finite = true; for (float x : out) if (!std::isfinite(x)) finite = false;
        check(finite && rms(out, 8000, 8000) > 0.1, "unison flow: 3 detuned voices sum to an audible output at master");
    }

    std::printf("\n%s (%d failure%s)\n", failures ? "FAILED" : "ALL PASS", failures, failures == 1 ? "" : "s");
    return failures ? 1 : 0;
}
