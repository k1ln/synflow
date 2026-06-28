#pragma once

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "../Node.h"
#include "../WasmModule.h"

namespace synflow {

// Bucket A — VirtualSvfDriveNode: zero-delay-feedback (TPT) state-variable filter
// with drive. Effect, hosted via wasmtime, driven exactly like
// public/SvfDriveProcessor.js: svf_new(), svf_set_mode/slope via control, per
// block svf_process(in, hasIn, cut, cutLen, resonance, drive, mix, n, sr, out).
class WasmSvfDriveNode : public INode {
public:
    explicit WasmSvfDriveNode(std::vector<uint8_t> wasm) : wasmBytes_(std::move(wasm)) {}

    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        sr_ = sr;
        mod_ = std::make_unique<WasmModule>(wasmBytes_.data(), wasmBytes_.size());
        f_alloc_ = mod_->func("alloc_f32");
        f_new_ = mod_->func("svf_new");
        f_process_ = mod_->func("svf_process");
        f_setMode_ = mod_->func("svf_set_mode");
        f_setSlope_ = mod_->func("svf_set_slope");
        wasmtime_val_t a = valI32(maxBlock);
        pIn_ = mod_->callRetI32(f_alloc_, &a, 1);
        pCut_ = mod_->callRetI32(f_alloc_, &a, 1);
        pOut_ = mod_->callRetI32(f_alloc_, &a, 1);
        state_ = mod_->callRetI32(f_new_, nullptr, 0);
        applyMode();
        applySlope();
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "cutoff") cutoff_ = static_cast<float>(v);
        else if (name == "resonance") resonance_ = static_cast<float>(v);
        else if (name == "drive") drive_ = static_cast<float>(v);
        else if (name == "mix") mix_ = static_cast<float>(v);
        else if (name == "mode") { mode_ = static_cast<int>(v); if (mod_) applyMode(); }
        else if (name == "slope") { slope_ = (static_cast<int>(v) == 2) ? 2 : 1; if (mod_) applySlope(); }
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        uint8_t* data = mod_->memData();
        std::memcpy(data + pIn_, in[0].data(), sizeof(float) * static_cast<size_t>(frames));
        std::memcpy(data + pCut_, &cutoff_, sizeof(float)); // constant -> cut_len 1
        wasmtime_val_t args[11] = {
            valI32(state_), valI32(pIn_), valI32(1),
            valI32(pCut_), valI32(1),
            valF32(resonance_), valF32(drive_), valF32(mix_),
            valI32(frames), valF32(sr_), valI32(pOut_),
        };
        mod_->call(f_process_, args, 11, nullptr, 0);
        data = mod_->memData();
        std::memcpy(out[0].data(), data + pOut_, sizeof(float) * static_cast<size_t>(frames));
    }

private:
    void applyMode() { wasmtime_val_t a[2] = {valI32(state_), valI32(mode_)}; mod_->call(f_setMode_, a, 2, nullptr, 0); }
    void applySlope() { wasmtime_val_t a[2] = {valI32(state_), valI32(slope_)}; mod_->call(f_setSlope_, a, 2, nullptr, 0); }

    std::vector<uint8_t> wasmBytes_;
    std::unique_ptr<WasmModule> mod_;
    wasmtime_func_t f_alloc_{}, f_new_{}, f_process_{}, f_setMode_{}, f_setSlope_{};
    int32_t pIn_ = 0, pCut_ = 0, pOut_ = 0, state_ = 0;
    float sr_ = 48000.0f, cutoff_ = 1000.0f, resonance_ = 0.2f, drive_ = 1.0f, mix_ = 1.0f;
    int mode_ = 0, slope_ = 1;
};

} // namespace synflow
