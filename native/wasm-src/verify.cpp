// Parity check: the new AssemblyScript/wasm Gain + RingMod nodes (hosted via
// GenericWasmNode) vs the existing hand-written C++ GainNode/RingModNode they
// are meant to replace. Renders identical input through both and reports the
// worst-case sample difference — expect bit-exact (both do the exact same
// float32 multiply per sample).
//
// Build/run: see verify.sh (links native/third_party/wasmtime, no CMake needed).

#include <cmath>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include "synflow/nodes/GainNode.h"
#include "synflow/nodes/GenericWasmNode.h"
#include "synflow/nodes/RingModNode.h"

using namespace synflow;

static std::vector<uint8_t> readFile(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    if (!f) throw std::runtime_error("cannot open " + path);
    return std::vector<uint8_t>((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
}

static ProcessContext ctxFor(int frames) {
    ProcessContext ctx;
    ctx.frames = frames;
    ctx.sampleRate = 48000.0f;
    return ctx;
}

// Render `total` frames through `node` in `block`-sized chunks, filling in[]
// from `inputs` (one vector per port, or empty = leave zeroed/unconnected).
static std::vector<float> render(INode& node, int total, int block,
                                  const std::vector<std::vector<float>>& inputs,
                                  const std::vector<bool>& connected) {
    node.inConnected = connected;
    std::vector<float> result(static_cast<size_t>(total), 0.0f);
    for (int pos = 0; pos < total; pos += block) {
        const int n = std::min(block, total - pos);
        for (size_t p = 0; p < inputs.size() && p < node.in.size(); ++p) {
            if (inputs[p].empty()) continue;
            for (int i = 0; i < n; ++i) node.in[p][static_cast<size_t>(i)] = inputs[p][static_cast<size_t>(pos + i)];
        }
        auto ctx = ctxFor(n);
        node.process(ctx);
        for (int i = 0; i < n; ++i) result[static_cast<size_t>(pos + i)] = node.out[0][static_cast<size_t>(i)];
    }
    return result;
}

static float maxAbsDiff(const std::vector<float>& a, const std::vector<float>& b) {
    float m = 0.0f;
    for (size_t i = 0; i < a.size(); ++i) m = std::max(m, std::fabs(a[i] - b[i]));
    return m;
}

static std::vector<float> sine(int n, double freq, double sr, float amp) {
    std::vector<float> v(static_cast<size_t>(n));
    for (int i = 0; i < n; ++i) v[static_cast<size_t>(i)] = amp * static_cast<float>(std::sin(2.0 * M_PI * freq * i / sr));
    return v;
}

int main() {
    const int SR = 48000, N = 8192, BLOCK = 128;
    bool allOk = true;

    // ---- Gain: unmodulated (port 1 unconnected) ----
    {
        GainNode cpp;
        cpp.prepare(SR, BLOCK);
        cpp.setNamedParam("gain", 0.7);

        GenericWasmNode wasm(readFile("../../plugin/resources/gain.wasm"), 2, 1, {{"gain", 0}}, {{"gain", 1}});
        wasm.prepare(SR, BLOCK);
        wasm.setNamedParam("gain", 0.7);

        auto in = sine(N, 220.0, SR, 0.8f);
        auto outCpp = render(cpp, N, BLOCK, {in, {}}, {true, false});
        auto outWasm = render(wasm, N, BLOCK, {in, {}}, {true, false});
        const float diff = maxAbsDiff(outCpp, outWasm);
        std::printf("gain (unmodulated): max abs diff = %.9f %s\n", diff, diff < 1e-6f ? "PASS" : "FAIL");
        allOk &= diff < 1e-6f;
    }

    // ---- Gain: modulated (port 1 = envelope-like control) ----
    {
        GainNode cpp;
        cpp.prepare(SR, BLOCK);
        cpp.setNamedParam("gain", 0.9);

        GenericWasmNode wasm(readFile("../../plugin/resources/gain.wasm"), 2, 1, {{"gain", 0}}, {{"gain", 1}});
        wasm.prepare(SR, BLOCK);
        wasm.setNamedParam("gain", 0.9);

        auto in = sine(N, 440.0, SR, 1.0f);
        auto ctrl = sine(N, 3.0, SR, 0.5f); // slow "envelope"
        for (auto& v : ctrl) v = 0.5f + v;  // keep positive-ish
        auto outCpp = render(cpp, N, BLOCK, {in, ctrl}, {true, true});
        auto outWasm = render(wasm, N, BLOCK, {in, ctrl}, {true, true});
        const float diff = maxAbsDiff(outCpp, outWasm);
        std::printf("gain (modulated):   max abs diff = %.9f %s\n", diff, diff < 1e-6f ? "PASS" : "FAIL");
        allOk &= diff < 1e-6f;
    }

    // ---- RingMod: both connected ----
    {
        RingModNode cpp;
        cpp.prepare(SR, BLOCK);
        GenericWasmNode wasm(readFile("../../plugin/resources/ringmod.wasm"), 2, 1, {}, {{"a", 0}, {"b", 1}});
        wasm.prepare(SR, BLOCK);

        auto a = sine(N, 220.0, SR, 0.8f);
        auto b = sine(N, 30.0, SR, 1.0f);
        auto outCpp = render(cpp, N, BLOCK, {a, b}, {true, true});
        auto outWasm = render(wasm, N, BLOCK, {a, b}, {true, true});
        const float diff = maxAbsDiff(outCpp, outWasm);
        std::printf("ringmod (a*b):      max abs diff = %.9f %s\n", diff, diff < 1e-6f ? "PASS" : "FAIL");
        allOk &= diff < 1e-6f;
    }

    // ---- RingMod: b unconnected (passthrough) ----
    {
        RingModNode cpp;
        cpp.prepare(SR, BLOCK);
        GenericWasmNode wasm(readFile("../../plugin/resources/ringmod.wasm"), 2, 1, {}, {{"a", 0}, {"b", 1}});
        wasm.prepare(SR, BLOCK);

        auto a = sine(N, 220.0, SR, 0.8f);
        auto outCpp = render(cpp, N, BLOCK, {a, {}}, {true, false});
        auto outWasm = render(wasm, N, BLOCK, {a, {}}, {true, false});
        const float diff = maxAbsDiff(outCpp, outWasm);
        std::printf("ringmod (b=1):      max abs diff = %.9f %s\n", diff, diff < 1e-6f ? "PASS" : "FAIL");
        allOk &= diff < 1e-6f;
    }

    // ---- handle -> port routing parity (regression check for the migration) ----
    {
        GainNode gainCpp;
        GenericWasmNode gainWasm(readFile("../../plugin/resources/gain.wasm"), 2, 1, {{"gain", 0}}, {{"gain", 1}});
        RingModNode ringCpp;
        GenericWasmNode ringWasm(readFile("../../plugin/resources/ringmod.wasm"), 2, 1, {}, {{"a", 0}, {"b", 1}});
        const bool ok = gainCpp.inPortForHandle("main-input") == gainWasm.inPortForHandle("main-input") &&
                         gainCpp.inPortForHandle("gain") == gainWasm.inPortForHandle("gain") &&
                         gainCpp.inPortForHandle("gain") == 1 &&
                         ringCpp.inPortForHandle("a") == ringWasm.inPortForHandle("a") && ringCpp.inPortForHandle("a") == 0 &&
                         ringCpp.inPortForHandle("b") == ringWasm.inPortForHandle("b") && ringCpp.inPortForHandle("b") == 1;
        std::printf("handle routing:     %s\n", ok ? "PASS" : "FAIL");
        allOk &= ok;
    }

    std::printf(allOk ? "\nALL PASS\n" : "\nFAIL\n");
    return allOk ? 0 : 1;
}
