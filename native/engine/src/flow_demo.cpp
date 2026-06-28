// M1 flow-loader proof: load a flow JSON from disk, build the graph, render.
// Usage: flow_demo <flow.json> [expectAudible]
//   - builtin-only flow (osc->gain->master) => real audio (rms > 0)
//   - a real complex flow (kick.json) => loads + renders structurally; nodes not
//     yet ported (ADSR, …) fall back to stubs, so it may be silent until M4.

#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

#include "synflow/AudioGraphManager.h"
#include "synflow/FlowLoader.h"

using namespace synflow;

static std::string readFile(const char* path) {
    std::ifstream f(path);
    std::stringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

int main(int argc, char** argv) {
    if (argc < 2) { std::printf("usage: flow_demo <flow.json> [expectAudible]\n"); return 2; }
    const bool expectAudible = argc >= 3 && std::string(argv[2]) == "expectAudible";

    const std::string json = readFile(argv[1]);
    if (json.empty()) { std::printf("could not read %s\n", argv[1]); return 2; }

    AudioGraphManager graph(RuntimeMode::Plugin);
    const int frames = 512;
    FlowLoadResult r;
    try {
        r = FlowLoader::loadInto(graph, json, 48000.0f, frames);
    } catch (const std::exception& ex) {
        std::printf("load failed: %s\n", ex.what());
        return 1;
    }

    std::vector<float> out(static_cast<size_t>(frames), 0.0f);
    graph.renderBlock(out.data(), frames, 120.0, 0.0, true);

    double sum = 0.0;
    for (float s : out) sum += static_cast<double>(s) * s;
    const float rms = static_cast<float>(std::sqrt(sum / frames));

    std::printf("flow \"%s\": %d nodes, %d edges, %d unsupported(stubbed)  ->  rms=%.4f\n",
                r.name.c_str(), r.nodeCount, r.edgeCount, r.unsupportedCount, rms);

    if (expectAudible) {
        const bool ok = rms > 0.05f;
        std::printf(ok ? "\xE2\x9C\x93 audible render from loaded JSON\n"
                       : "\xE2\x9C\x97 expected audio, got silence\n");
        return ok ? 0 : 1;
    }
    std::printf("\xE2\x9C\x93 loaded + rendered without error\n");
    return 0;
}
