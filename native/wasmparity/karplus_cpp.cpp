// M3 C++ side: host public/karplus.wasm via wasmtime (WasmKarplusNode) and drive
// it through the real AudioGraphManager as a source node, with the SAME
// deterministic params/pluck timing as karplus_ref.mjs. Writes
// build/cpp_karplus.f32; compare.mjs null-tests it against the V8 reference.

#include <cstdio>
#include <fstream>
#include <iterator>
#include <memory>
#include <string>
#include <vector>

#include "synflow/AudioGraphManager.h"
#include "synflow/nodes/WasmKarplusNode.h"

using namespace synflow;

static std::vector<uint8_t> readBin(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    return std::vector<uint8_t>((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
}
static void writeF32(const std::string& path, const std::vector<float>& v) {
    std::ofstream f(path, std::ios::binary);
    f.write(reinterpret_cast<const char*>(v.data()), static_cast<std::streamsize>(v.size() * sizeof(float)));
}

int main() {
    const std::string base = SYNFLOW_WASMPARITY_DIR;
    const float SR = 48000.0f;
    const int BLOCK = 128, BLOCKS = 64, N = BLOCK * BLOCKS;
    const float FREQ = 220.0f, DECAY = 0.6f, TONE = 0.6f, VEL = 1.0f;

    auto bytes = readBin(base + "/../../public/karplus.wasm");
    if (bytes.empty()) { std::printf("could not read karplus.wasm\n"); return 1; }

    AudioGraphManager g(RuntimeMode::Plugin);
    auto node = std::make_unique<WasmKarplusNode>(bytes);
    const int idx = g.addNode(std::move(node));
    g.setMasterOutput(idx, 0);
    g.prepare(SR, BLOCK);

    auto* kp = dynamic_cast<WasmKarplusNode*>(g.node(idx));
    kp->setNamedParam("frequency", FREQ);
    kp->setNamedParam("decay", DECAY);
    kp->setNamedParam("tone", TONE);
    kp->pluck(VEL); // before block 0

    std::vector<float> out(static_cast<size_t>(N), 0.0f);
    for (int i = 0; i < N; i += BLOCK)
        g.renderBlock(out.data() + i, BLOCK, nullptr, 120.0, 0.0, true);

    writeF32(base + "/build/cpp_karplus.f32", out);
    std::printf("cpp karplus: %d samples\n", N);
    return 0;
}
