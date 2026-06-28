#pragma once

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "../Node.h"
#include "../WasmModule.h"

namespace synflow {

// Bucket A — VirtualGranularNode: granular processor. Effect (audio in -> grains),
// hosted via wasmtime, driven like public/GranularProcessor.js: granular_new(sr),
// granular_set_freeze, per-block granular_process(in, hasIn, L, R, n, density,
// size, position, spray, pitch, mix, sr). Engine is mono -> uses the L channel.
class WasmGranularNode : public INode {
public:
    explicit WasmGranularNode(std::vector<uint8_t> wasm) : wasmBytes_(std::move(wasm)) {}

    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        sr_ = sr;
        mod_ = std::make_unique<WasmModule>(wasmBytes_.data(), wasmBytes_.size());
        f_alloc_ = mod_->func("alloc_f32");
        f_new_ = mod_->func("granular_new");
        f_setFreeze_ = mod_->func("granular_set_freeze");
        f_process_ = mod_->func("granular_process");
        wasmtime_val_t a = valI32(maxBlock);
        pIn_ = mod_->callRetI32(f_alloc_, &a, 1);
        pL_ = mod_->callRetI32(f_alloc_, &a, 1);
        pR_ = mod_->callRetI32(f_alloc_, &a, 1);
        wasmtime_val_t sr_v = valF32(sr);
        state_ = mod_->callRetI32(f_new_, &sr_v, 1);
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "density") density_ = static_cast<float>(v);
        else if (name == "size") size_ = static_cast<float>(v);
        else if (name == "position") position_ = static_cast<float>(v);
        else if (name == "spray") spray_ = static_cast<float>(v);
        else if (name == "pitch") pitch_ = static_cast<float>(v);
        else if (name == "mix") mix_ = static_cast<float>(v);
        else if (name == "freeze") { freeze_ = (v != 0.0); if (mod_) applyFreeze(); }
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        uint8_t* data = mod_->memData();
        std::memcpy(data + pIn_, in[0].data(), sizeof(float) * static_cast<size_t>(frames));
        wasmtime_val_t args[13] = {
            valI32(state_), valI32(pIn_), valI32(1), valI32(pL_), valI32(pR_), valI32(frames),
            valF32(density_), valF32(size_), valF32(position_), valF32(spray_), valF32(pitch_), valF32(mix_),
            valF32(sr_),
        };
        mod_->call(f_process_, args, 13, nullptr, 0);
        data = mod_->memData();
        std::memcpy(out[0].data(), data + pL_, sizeof(float) * static_cast<size_t>(frames)); // mono = L
    }

private:
    void applyFreeze() { wasmtime_val_t a[2] = {valI32(state_), valI32(freeze_ ? 1 : 0)}; mod_->call(f_setFreeze_, a, 2, nullptr, 0); }

    std::vector<uint8_t> wasmBytes_;
    std::unique_ptr<WasmModule> mod_;
    wasmtime_func_t f_alloc_{}, f_new_{}, f_setFreeze_{}, f_process_{};
    int32_t pIn_ = 0, pL_ = 0, pR_ = 0, state_ = 0;
    float sr_ = 48000.0f, density_ = 20.0f, size_ = 0.1f, position_ = 0.5f, spray_ = 0.1f, pitch_ = 1.0f, mix_ = 1.0f;
    bool freeze_ = false;
};

} // namespace synflow
