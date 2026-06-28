#pragma once

#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket B — VirtualIIRFilterNode (Web Audio IIRFilterNode). A general IIR filter
// from feedforward (b) + feedback (a) coefficient arrays, direct-form I,
// normalized by a[0]. Coefficients arrive via node.data.feedforward/feedback
// (numeric arrays).
class IIRFilterNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void setArrayParam(const std::string& name, const std::vector<double>& v) override {
        if (name == "feedforward") { b_ = v; resizeHist(); }
        else if (name == "feedback") { a_ = v; resizeHist(); }
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        const int nb = static_cast<int>(b_.size());
        const int na = static_cast<int>(a_.size());
        if (nb == 0) { for (int i = 0; i < frames; ++i) out[0][static_cast<size_t>(i)] = in[0][static_cast<size_t>(i)]; return; }
        const double a0 = na > 0 ? a_[0] : 1.0;
        for (int i = 0; i < frames; ++i) {
            const double x = in[0][static_cast<size_t>(i)];
            double acc = b_[0] * x;
            for (int k = 1; k < nb; ++k) acc += b_[static_cast<size_t>(k)] * xh_[static_cast<size_t>(k - 1)];
            for (int k = 1; k < na; ++k) acc -= a_[static_cast<size_t>(k)] * yh_[static_cast<size_t>(k - 1)];
            const double y = acc / a0;
            for (int k = nb - 2; k >= 1; --k) xh_[static_cast<size_t>(k)] = xh_[static_cast<size_t>(k - 1)];
            if (nb > 1) xh_[0] = x;
            for (int k = na - 2; k >= 1; --k) yh_[static_cast<size_t>(k)] = yh_[static_cast<size_t>(k - 1)];
            if (na > 1) yh_[0] = y;
            out[0][static_cast<size_t>(i)] = static_cast<float>(y);
        }
    }

private:
    void resizeHist() {
        xh_.assign(b_.size() > 0 ? b_.size() - 1 : 0, 0.0);
        yh_.assign(a_.size() > 0 ? a_.size() - 1 : 0, 0.0);
    }
    std::vector<double> b_, a_, xh_, yh_;
};

} // namespace synflow
