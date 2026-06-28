// Smoke test for the native engine core: build osc(220) -> gain(0.5) -> master,
// render a block in both runtime modes, and print. Proves INode + params + graph
// routing + topo order + RuntimeMode plumbing compile and run with no host yet.

#include <cmath>
#include <cstdio>
#include <memory>

#include "synflow/AudioGraphManager.h"
#include "synflow/nodes/GainNode.h"
#include "synflow/nodes/OscillatorNode.h"

using namespace synflow;

static float renderRms(RuntimeMode mode, float gain) {
    AudioGraphManager g(mode);
    const int osc = g.addNode(std::make_unique<OscillatorNode>());
    const int amp = g.addNode(std::make_unique<GainNode>());
    g.node(osc)->setParam(0, 220.0f); // frequency
    g.node(amp)->setParam(0, gain);   // gain
    g.connect(osc, 0, amp, 0);
    g.setMasterOutput(amp, 0);

    const int frames = 256;
    g.prepare(48000.0f, frames);

    std::vector<float> out(static_cast<size_t>(frames), 0.0f);
    g.renderBlock(out.data(), frames, /*input*/ nullptr, /*bpm*/ 120.0, /*ppq*/ 0.0, /*playing*/ true);

    double sum = 0.0;
    for (float s : out) sum += static_cast<double>(s) * s;
    const float rms = static_cast<float>(std::sqrt(sum / frames));
    std::printf("mode=%-10s gain=%.2f  out[0..3]=% .4f % .4f % .4f % .4f  rms=%.4f\n",
                toString(mode), gain, out[0], out[1], out[2], out[3], rms);
    return rms;
}

int main() {
    std::printf("synflow native engine — smoke test\n");
    const float rmsPlugin = renderRms(RuntimeMode::Plugin, 0.5f);
    const float rmsStandalone = renderRms(RuntimeMode::Standalone, 0.5f);
    const float rmsUnity = renderRms(RuntimeMode::Plugin, 1.0f);

    // Invariants (robust to the short non-integer-cycle buffer):
    //  - both runtime modes render identically,
    //  - gain is linear: unity output == 2x the half-gain output,
    //  - signal is actually present.
    const bool ok = rmsPlugin == rmsStandalone
                 && std::fabs(rmsUnity - 2.0f * rmsPlugin) < 1e-4f
                 && rmsPlugin > 0.3f;
    std::printf(ok ? "\n\xE2\x9C\x93 graph render OK (gain + routing + both modes)\n"
                   : "\n\xE2\x9C\x97 unexpected output\n");
    return ok ? 0 : 1;
}
