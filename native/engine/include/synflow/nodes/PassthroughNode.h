#pragma once

#include "../Node.h"

namespace synflow {

// Stub for flow-JSON node types not yet ported to C++ (e.g. ADSR until M4). It
// keeps the graph buildable and renderable: passes input 0 -> output 0 and
// resolves any handle to port 0. Output is NOT musically correct — it just lets
// us load real flows end-to-end while the real nodes land. Replace per type.
class PassthroughNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    int inPortForHandle(const std::string& /*handle*/) const override { return 0; }
    int outPortForHandle(const std::string& /*handle*/) const override { return 0; }

    void process(const ProcessContext& ctx) override {
        for (int i = 0; i < ctx.frames; ++i)
            out[0][static_cast<size_t>(i)] = in[0][static_cast<size_t>(i)];
    }
};

} // namespace synflow
