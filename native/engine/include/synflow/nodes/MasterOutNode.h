#pragma once

#include "../Node.h"

namespace synflow {

// Bucket B — final output bus. One input, passes through to its output; the
// graph manager reads this node's output 0 as the engine output.
class MasterOutNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    int inPortForHandle(const std::string& /*handle*/) const override { return 0; }

    void process(const ProcessContext& ctx) override {
        for (int i = 0; i < ctx.frames; ++i)
            out[0][static_cast<size_t>(i)] = in[0][static_cast<size_t>(i)];
    }
};

} // namespace synflow
