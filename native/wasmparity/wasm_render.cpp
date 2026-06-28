// M3 C++ side: host each src/wasm module via wasmtime (WasmModule) through the
// real AudioGraphManager, with the SAME deterministic params as wasm_ref.mjs.
// Writes build/cpp_<module>.f32; compare.mjs null-tests vs the V8 reference.

#include <cstdio>
#include <fstream>
#include <iterator>
#include <memory>
#include <string>
#include <vector>

#include "synflow/AudioGraphManager.h"
#include "synflow/nodes/WasmEnvGenNode.h"
#include "synflow/nodes/WasmFMNode.h"
#include "synflow/nodes/WasmFreqShifterNode.h"
#include "synflow/nodes/WasmKarplusNode.h"
#include "synflow/nodes/WasmLadderNode.h"
#include "synflow/nodes/WasmNoiseNode.h"
#include "synflow/nodes/WasmSvfDriveNode.h"

using namespace synflow;

static std::vector<uint8_t> readBin(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    return std::vector<uint8_t>((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
}
static std::vector<float> readF32(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    std::vector<float> v; float x;
    while (f.read(reinterpret_cast<char*>(&x), sizeof(float))) v.push_back(x);
    return v;
}
static void writeF32(const std::string& path, const std::vector<float>& v) {
    std::ofstream f(path, std::ios::binary);
    f.write(reinterpret_cast<const char*>(v.data()), static_cast<std::streamsize>(v.size() * sizeof(float)));
}

int main() {
    const std::string base = SYNFLOW_WASMPARITY_DIR;
    const std::string pub = base + "/../../public/";
    const float SR = 48000.0f;
    const int BLOCK = 128, N = 8192;
    const std::vector<float> input = readF32(base + "/build/input.f32");

    // Render one module's INode through the engine and write cpp_<name>.f32.
    auto run = [&](const std::string& name, std::unique_ptr<INode> node, bool isEffect) {
        AudioGraphManager g(RuntimeMode::Plugin);
        INode* raw = node.get();
        const int idx = g.addNode(std::move(node));
        g.setMasterOutput(idx, 0);
        if (isEffect) g.setInputNode(idx, 0);
        g.prepare(SR, BLOCK);

        // module-specific deterministic setup (matches wasm_ref.mjs)
        if (auto* kp = dynamic_cast<WasmKarplusNode*>(raw)) {
            kp->setNamedParam("frequency", 220.0);
            kp->setNamedParam("decay", 0.6);
            kp->setNamedParam("tone", 0.6);
            kp->pluck(1.0);
        } else if (auto* ld = dynamic_cast<WasmLadderNode*>(raw)) {
            ld->setNamedParam("cutoff", 1200.0);
            ld->setNamedParam("resonance", 0.3);
            ld->setNamedParam("drive", 1.0);
            ld->setNamedParam("poles", 4);
        } else if (auto* sv = dynamic_cast<WasmSvfDriveNode*>(raw)) {
            sv->setNamedParam("cutoff", 1000.0);
            sv->setNamedParam("resonance", 0.2);
            sv->setNamedParam("drive", 1.0);
            sv->setNamedParam("mix", 1.0);
        }
        // noise uses its default fixed seed / white / gain 1
        if (dynamic_cast<WasmEnvGenNode*>(raw)) g.queueInputEvent(idx, 0, EventType::NoteOn, 1.0, 0); // gate on
        if (dynamic_cast<WasmFMNode*>(raw)) g.queueInputEvent(idx, 0, EventType::NoteOn, 1.0, 0);

        std::vector<float> out(static_cast<size_t>(N), 0.0f);
        for (int i = 0; i < N; i += BLOCK)
            g.renderBlock(out.data() + i, BLOCK, isEffect ? input.data() + i : nullptr, 120.0, 0.0, true);
        writeF32(base + "/build/cpp_" + name + ".f32", out);
        std::printf("cpp %s: %d samples\n", name.c_str(), N);
    };

    run("karplus", std::make_unique<WasmKarplusNode>(readBin(pub + "karplus.wasm")), false);
    run("ladder", std::make_unique<WasmLadderNode>(readBin(pub + "ladder.wasm")), true);
    run("noise", std::make_unique<WasmNoiseNode>(readBin(pub + "noise-generator.wasm")), false);
    run("svf", std::make_unique<WasmSvfDriveNode>(readBin(pub + "svf-drive.wasm")), true);
    run("envgen", std::make_unique<WasmEnvGenNode>(readBin(pub + "envgen.wasm")), false);
    run("fm", std::make_unique<WasmFMNode>(readBin(pub + "fm.wasm")), false);
    {
        auto fs = std::make_unique<WasmFreqShifterNode>(readBin(pub + "freq-shifter.wasm"));
        fs->setNamedParam("shift", 7.0);
        run("freqshifter", std::move(fs), true);
    }
    return 0;
}
