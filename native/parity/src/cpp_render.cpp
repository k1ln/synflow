// C++ side of the parity harness: render each test node (one-node graph) on the
// SAME build/input.f32 and write build/cpp_<name>.f32. Compared against the
// Chrome Web Audio reference by compare.mjs.

#include <cstdio>
#include <fstream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#include "synflow/AudioGraphManager.h"
#include "synflow/Json.h"
#include "synflow/nodes/BiquadFilterNode.h"
#include "synflow/nodes/DelayNode.h"
#include "synflow/nodes/DynamicCompressorNode.h"
#include "synflow/nodes/GainNode.h"

using namespace synflow;

static std::string readFile(const std::string& path) {
    std::ifstream f(path);
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}
static std::vector<float> readF32(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    std::vector<float> v;
    float x;
    while (f.read(reinterpret_cast<char*>(&x), sizeof(float))) v.push_back(x);
    return v;
}
static void writeF32(const std::string& path, const std::vector<float>& v) {
    std::ofstream f(path, std::ios::binary);
    f.write(reinterpret_cast<const char*>(v.data()), static_cast<std::streamsize>(v.size() * sizeof(float)));
}

static std::unique_ptr<INode> buildNode(const JsonValue& t) {
    const std::string node = t.find("node")->asString();
    auto num = [&](const char* k, double d) { const JsonValue* v = t.find(k); return v ? v->asNumber(d) : d; };

    if (node == "gain") {
        auto n = std::make_unique<GainNode>();
        n->setNamedParam("gain", num("gain", 1.0));
        return n;
    }
    if (node == "biquad") {
        auto n = std::make_unique<BiquadFilterNode>();
        if (const JsonValue* ft = t.find("filterType")) n->setNamedParamStr("filterType", ft->asString());
        n->setNamedParam("frequency", num("frequency", 350.0));
        n->setNamedParam("Q", num("Q", 1.0));
        if (t.find("gain")) n->setNamedParam("gain", num("gain", 0.0));
        return n;
    }
    if (node == "delay") {
        auto n = std::make_unique<DelayNode>();
        n->setNamedParam("delayTime", num("delayTime", 0.0));
        return n;
    }
    if (node == "compressor") {
        auto n = std::make_unique<DynamicCompressorNode>();
        for (const char* k : {"threshold", "knee", "ratio", "attack", "release"})
            if (t.find(k)) n->setNamedParam(k, num(k, 0.0));
        return n;
    }
    return nullptr;
}

int main() {
    const std::string base = std::string(SYNFLOW_PARITY_DIR);
    const std::vector<float> input = readF32(base + "/build/input.f32");
    const JsonValue tests = JsonParser::parse(readFile(base + "/tests.json"));
    const int block = 128, n = static_cast<int>(input.size());

    for (const JsonValue& t : tests.arr) {
        const std::string name = t.find("name")->asString();
        AudioGraphManager g(RuntimeMode::Plugin);
        auto node = buildNode(t);
        if (!node) { std::printf("skip %s (unknown node)\n", name.c_str()); continue; }
        const int idx = g.addNode(std::move(node));
        g.setInputNode(idx, 0);
        g.setMasterOutput(idx, 0);
        g.prepare(48000.0f, block);

        std::vector<float> out(static_cast<size_t>(n), 0.0f);
        for (int i = 0; i < n; i += block) {
            const int f = std::min(block, n - i);
            g.renderBlock(out.data() + i, f, input.data() + i, 120.0, 0.0, true);
        }
        writeF32(base + "/build/cpp_" + name + ".f32", out);
        std::printf("cpp %s: %d samples\n", name.c_str(), n);
    }
    return 0;
}
