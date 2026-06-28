#pragma once

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "../Node.h"
#include "../WasmModule.h"

namespace synflow {

// Bucket A — VirtualKarplusNode backed by the SAME karplus.wasm the browser
// loads (src/wasm/karplus -> public/karplus.wasm), hosted via wasmtime. Drives
// it exactly like public/KarplusProcessor.js: karplus_new(sr) once, then per
// block write `frequency` (constant -> freq_len 1, matching the worklet's
// length-1 a-rate array) and call karplus_process; a note-on -> karplus_pluck.
// Output is bit-identical to the web worklet (null-tested in native/wasmparity).
//
// Pure source for now (no exciter input); the worklet's optional audio exciter
// is a later refinement (would set numInputs()=1 and pass has_in=1).
class WasmKarplusNode : public INode {
public:
    explicit WasmKarplusNode(std::vector<uint8_t> wasm) : wasmBytes_(std::move(wasm)) {}

    int numInputs() const override { return 0; }
    int numOutputs() const override { return 1; }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        sr_ = sr;
        mod_ = std::make_unique<WasmModule>(wasmBytes_.data(), wasmBytes_.size());
        f_alloc_ = mod_->func("alloc_f32");
        f_new_ = mod_->func("karplus_new");
        f_pluck_ = mod_->func("karplus_pluck");
        f_process_ = mod_->func("karplus_process");

        wasmtime_val_t a = valI32(maxBlock);
        pFreq_ = mod_->callRetI32(f_alloc_, &a, 1);
        pIn_ = mod_->callRetI32(f_alloc_, &a, 1);
        pOut_ = mod_->callRetI32(f_alloc_, &a, 1);
        wasmtime_val_t srv = valF32(sr);
        state_ = mod_->callRetI32(f_new_, &srv, 1);
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "frequency") frequency_ = static_cast<float>(v);
        else if (name == "decay") decay_ = static_cast<float>(v);
        else if (name == "tone") tone_ = static_cast<float>(v);
    }

    // note-on: schedule a pluck consumed at the start of the next block
    // (mirrors the worklet's port-message -> karplus_pluck before process()).
    void pluck(float velocity) { pendingPluck_ = true; pluckVel_ = velocity > 0 ? velocity : 1.0f; }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        if (pendingPluck_) {
            wasmtime_val_t pa[2] = { valI32(state_), valF32(pluckVel_) };
            mod_->call(f_pluck_, pa, 2, nullptr, 0);
            pendingPluck_ = false;
        }
        uint8_t* data = mod_->memData();
        std::memcpy(data + pFreq_, &frequency_, sizeof(float)); // constant -> freq_len 1

        wasmtime_val_t args[10] = {
            valI32(state_), valI32(pFreq_), valI32(1),
            valF32(decay_), valF32(tone_),
            valI32(pIn_), valI32(0),            // has_in = 0 (pure source)
            valI32(frames), valF32(sr_),
            valI32(pOut_),
        };
        mod_->call(f_process_, args, 10, nullptr, 0);

        data = mod_->memData(); // re-fetch in case memory grew
        std::memcpy(out[0].data(), data + pOut_, sizeof(float) * static_cast<size_t>(frames));
    }

private:
    std::vector<uint8_t> wasmBytes_;
    std::unique_ptr<WasmModule> mod_;
    wasmtime_func_t f_alloc_{}, f_new_{}, f_pluck_{}, f_process_{};
    int32_t pFreq_ = 0, pIn_ = 0, pOut_ = 0, state_ = 0;
    float sr_ = 48000.0f, frequency_ = 220.0f, decay_ = 0.6f, tone_ = 0.6f;
    bool pendingPluck_ = false;
    float pluckVel_ = 1.0f;
};

} // namespace synflow
