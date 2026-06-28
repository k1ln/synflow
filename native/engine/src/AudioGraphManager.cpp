#include "synflow/AudioGraphManager.h"

#include <algorithm>
#include <cstring>

namespace synflow {

int AudioGraphManager::addNode(std::unique_ptr<INode> node) {
    nodes_.push_back(std::move(node));
    return static_cast<int>(nodes_.size()) - 1;
}

void AudioGraphManager::connect(int from, int fromPort, int to, int toPort) {
    edges_.push_back({from, fromPort, to, toPort});
}

void AudioGraphManager::setMasterOutput(int node, int port) {
    masterNode_ = node;
    masterPort_ = port;
}

void AudioGraphManager::prepare(float sampleRate, int maxBlock) {
    sampleRate_ = sampleRate;
    maxBlock_ = maxBlock;
    samplePos_ = 0.0;
    for (auto& n : nodes_) n->prepare(sampleRate, maxBlock);
    topoSort();
}

// Kahn's algorithm over the edge list. Cycles (feedback) are appended in input
// order so the graph still renders (one block of delay), mirroring how a DAW
// tolerates feedback rather than refusing to run.
void AudioGraphManager::topoSort() {
    const int n = static_cast<int>(nodes_.size());
    std::vector<int> indeg(n, 0);
    for (const auto& e : edges_)
        if (e.from != e.to) indeg[e.to]++;

    std::vector<int> queue;
    for (int i = 0; i < n; ++i)
        if (indeg[i] == 0) queue.push_back(i);

    order_.clear();
    order_.reserve(n);
    while (!queue.empty()) {
        const int v = queue.front();
        queue.erase(queue.begin());
        order_.push_back(v);
        for (const auto& e : edges_) {
            if (e.from == v && e.from != e.to) {
                if (--indeg[e.to] == 0) queue.push_back(e.to);
            }
        }
    }
    // Any node left out of a cycle: append so it still runs.
    for (int i = 0; i < n; ++i)
        if (std::find(order_.begin(), order_.end(), i) == order_.end())
            order_.push_back(i);
}

void AudioGraphManager::renderBlock(float* out, int frames, double bpm,
                                    double ppqPosition, bool isPlaying) {
    ProcessContext ctx;
    ctx.sampleRate = sampleRate_;
    ctx.frames = frames;
    ctx.mode = mode_;

    if (mode_ == RuntimeMode::Plugin) {
        // Transport comes from the host playhead.
        ctx.bpm = bpm;
        ctx.ppqPosition = ppqPosition;
        ctx.isPlaying = isPlaying;
    } else {
        // Standalone: engine owns the clock, derived from samples rendered.
        ctx.bpm = bpm; // a real build pulls this from the engine transport
        ctx.isPlaying = true;
        ctx.ppqPosition = (samplePos_ / sampleRate_) * (bpm / 60.0);
    }

    // 1. Clear every node's input ports.
    for (auto& node : nodes_)
        for (auto& port : node->in)
            std::fill(port.begin(), port.begin() + frames, 0.0f);

    // 2. Process in topo order, summing upstream outputs into inputs first.
    for (int idx : order_) {
        for (const auto& e : edges_) {
            if (e.to != idx) continue;
            const Buffer& src = nodes_[static_cast<size_t>(e.from)]->out[static_cast<size_t>(e.fromPort)];
            Buffer& dst = nodes_[static_cast<size_t>(idx)]->in[static_cast<size_t>(e.toPort)];
            for (int i = 0; i < frames; ++i) dst[static_cast<size_t>(i)] += src[static_cast<size_t>(i)];
        }
        nodes_[static_cast<size_t>(idx)]->process(ctx);
    }

    // 3. Copy the master node's output to the engine output.
    if (masterNode_ >= 0) {
        const Buffer& m = nodes_[static_cast<size_t>(masterNode_)]->out[static_cast<size_t>(masterPort_)];
        std::memcpy(out, m.data(), static_cast<size_t>(frames) * sizeof(float));
    } else {
        std::memset(out, 0, static_cast<size_t>(frames) * sizeof(float));
    }

    samplePos_ += frames;
}

} // namespace synflow
