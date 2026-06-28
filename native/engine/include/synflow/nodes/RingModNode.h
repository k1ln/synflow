#pragma once

#include "../Node.h"

namespace synflow {

// Bucket B — VirtualRingModNode. Four-quadrant ring modulator: out = a * b, two
// audio inputs ([0]=a, [1]=b). An unconnected side is treated as 1 (multiply-by-1),
// so an unconnected modulator passes the carrier through unchanged.
class RingModNode : public INode {
public:
    int numInputs() const override { return 2; }
    int numOutputs() const override { return 1; }

    void process(const ProcessContext& ctx) override {
        const bool hasA = inConnected.size() > 0 && inConnected[0];
        const bool hasB = inConnected.size() > 1 && inConnected[1];
        const float* a = in[0].data();
        const float* b = in[1].data();
        for (int i = 0; i < ctx.frames; ++i) {
            const float av = hasA ? a[static_cast<size_t>(i)] : 1.0f;
            const float bv = hasB ? b[static_cast<size_t>(i)] : 1.0f;
            out[0][static_cast<size_t>(i)] = av * bv;
        }
    }
};

} // namespace synflow
