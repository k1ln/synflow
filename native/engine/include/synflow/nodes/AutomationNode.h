#pragma once

#include <algorithm>
#include <string>
#include <vector>

#include "../Node.h"

namespace synflow {

// Bucket C — VirtualAutomationNode. On a trigger it ramps a target param through
// a point curve over lengthSec, emitting Value events (block-rate) via the
// control->param steering path. Points are [{x,y}] (x = 0..1 time, y = 0..1),
// flattened by the loader to [x0,y0,x1,y1,...]. value = max - y*(max-min); min/max
// are treated as ABSOLUTE param values (vs the web's base*percent — the author
// sets them to the param's real range).
class AutomationNode : public INode {
public:
    int numInputs() const override { return 0; }
    int numOutputs() const override { return 0; }

    void prepare(float sr, int maxBlock) override { INode::prepare(sr, maxBlock); sr_ = sr; }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "lengthSec") lengthSec_ = v;
        else if (name == "min") min_ = v;
        else if (name == "max") max_ = v;
    }
    void setArrayParam(const std::string& name, const std::vector<double>& v) override {
        if (name == "points") points_ = v; // [x0,y0,x1,y1,...]
    }

    void process(const ProcessContext& ctx) override {
        if (!ctx.sink) return;
        if (ctx.inEvents)
            for (const auto& ev : *ctx.inEvents)
                if (ev.type == EventType::NoteOn) { rampStart_ = ctx.blockStartSample + ev.sampleOffset; ramping_ = true; }
        if (!ramping_ || points_.size() < 2) return;

        double t = lengthSec_ > 0 ? (ctx.blockStartSample - rampStart_) / (sr_ * lengthSec_) : 1.0;
        if (t < 0) t = 0;
        if (t >= 1.0) { t = 1.0; ramping_ = false; }
        const double y = interpY(t);
        ctx.sink->emitEvent(ctx.nodeIndex, 0, EventType::Value, max_ - y * (max_ - min_), 0);
    }

private:
    double interpY(double t) const {
        const int n = static_cast<int>(points_.size()) / 2;
        if (n == 0) return 0;
        if (t <= points_[0]) return points_[1];
        if (t >= points_[static_cast<size_t>((n - 1) * 2)]) return points_[static_cast<size_t>((n - 1) * 2 + 1)];
        for (int i = 0; i < n - 1; ++i) {
            const double x0 = points_[static_cast<size_t>(i * 2)], x1 = points_[static_cast<size_t>((i + 1) * 2)];
            if (t >= x0 && t <= x1) {
                const double y0 = points_[static_cast<size_t>(i * 2 + 1)], y1 = points_[static_cast<size_t>((i + 1) * 2 + 1)];
                const double f = (x1 - x0) != 0 ? (t - x0) / (x1 - x0) : 0;
                return y0 + f * (y1 - y0);
            }
        }
        return points_[static_cast<size_t>((n - 1) * 2 + 1)];
    }

    float sr_ = 48000.0f;
    double lengthSec_ = 1.0, min_ = 0.0, max_ = 1.0, rampStart_ = 0.0;
    std::vector<double> points_;
    bool ramping_ = false;
};

} // namespace synflow
