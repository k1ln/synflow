#pragma once

#include <cstdint>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "../Node.h"
#include "../WasmModule.h"

namespace synflow {

// Bucket A — VirtualNoiseNode backed by noise-generator.wasm, hosted via
// wasmtime. Pure source. Driven like public/NoiseGeneratorProcessor.js:
// noise_state_new(seed) once, per-block noise_fill(state, pOut, frames, type),
// then the worklet's gain multiply (k/a-rate) applied here. The worklet seeds
// randomly; this node takes an explicit seed so renders are reproducible (the
// parity harness uses a fixed seed on both sides).
class WasmNoiseNode : public INode {
public:
    explicit WasmNoiseNode(std::vector<uint8_t> wasm) : wasmBytes_(std::move(wasm)) {}

    int numInputs() const override { return 0; }
    int numOutputs() const override { return 1; }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        mod_ = std::make_unique<WasmModule>(wasmBytes_.data(), wasmBytes_.size());
        f_alloc_ = mod_->func("alloc_f32");
        f_new_ = mod_->func("noise_state_new");
        f_fill_ = mod_->func("noise_fill");

        wasmtime_val_t a = valI32(maxBlock);
        pOut_ = mod_->callRetI32(f_alloc_, &a, 1);
        newState();
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "gain") gain_ = static_cast<float>(v);
        else if (name == "noiseType") noiseType_ = static_cast<int>(v);
        else if (name == "seed") { seed_ = static_cast<uint64_t>(v); if (mod_) newState(); }
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        wasmtime_val_t args[4] = { valI32(state_), valI32(pOut_), valI32(frames), valI32(noiseType_) };
        mod_->call(f_fill_, args, 4, nullptr, 0);

        uint8_t* data = mod_->memData();
        const float* src = reinterpret_cast<const float*>(data + pOut_);
        for (int i = 0; i < frames; ++i) out[0][static_cast<size_t>(i)] = src[i] * gain_;
    }

private:
    void newState() {
        wasmtime_val_t s = valI64(static_cast<int64_t>(seed_));
        state_ = mod_->callRetI32(f_new_, &s, 1);
    }

    std::vector<uint8_t> wasmBytes_;
    std::unique_ptr<WasmModule> mod_;
    wasmtime_func_t f_alloc_{}, f_new_{}, f_fill_{};
    int32_t pOut_ = 0, state_ = 0;
    uint64_t seed_ = 0x2545F4914F6CDD1DULL;
    int noiseType_ = 0;
    float gain_ = 1.0f;
};

} // namespace synflow
