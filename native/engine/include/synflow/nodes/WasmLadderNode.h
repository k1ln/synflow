#pragma once

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "../Node.h"
#include "../WasmModule.h"

namespace synflow {

// Bucket A — VirtualLadderFilterNode backed by the same ladder.wasm the browser
// loads, hosted via wasmtime. An EFFECT (audio in -> out), driven exactly like
// public/LadderProcessor.js: ladder_new() once, ladder_set_poles via control,
// per-block ladder_process with the audio input + constant cutoff (freq_len 1).
// Exercises the engine's external-audio input path (renderBlock input -> in[0]).
class WasmLadderNode : public INode {
public:
    explicit WasmLadderNode(std::vector<uint8_t> wasm) : wasmBytes_(std::move(wasm)) {}

    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        sr_ = sr;
        mod_ = std::make_unique<WasmModule>(wasmBytes_.data(), wasmBytes_.size());
        f_alloc_ = mod_->func("alloc_f32");
        f_new_ = mod_->func("ladder_new");
        f_process_ = mod_->func("ladder_process");
        f_setPoles_ = mod_->func("ladder_set_poles");

        wasmtime_val_t a = valI32(maxBlock);
        pIn_ = mod_->callRetI32(f_alloc_, &a, 1);
        pCut_ = mod_->callRetI32(f_alloc_, &a, 1);
        pOut_ = mod_->callRetI32(f_alloc_, &a, 1);
        state_ = mod_->callRetI32(f_new_, nullptr, 0);
        applyPoles();
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "cutoff") cutoff_ = static_cast<float>(v);
        else if (name == "resonance") resonance_ = static_cast<float>(v);
        else if (name == "drive") drive_ = static_cast<float>(v);
        else if (name == "poles") { poles_ = (static_cast<int>(v) == 2) ? 2 : 4; if (mod_) applyPoles(); }
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        uint8_t* data = mod_->memData();
        std::memcpy(data + pIn_, in[0].data(), sizeof(float) * static_cast<size_t>(frames));
        std::memcpy(data + pCut_, &cutoff_, sizeof(float)); // constant -> cut_len 1

        wasmtime_val_t args[10] = {
            valI32(state_),
            valI32(pIn_), valI32(1),            // has_in = 1
            valI32(pCut_), valI32(1),           // cut_len 1
            valF32(resonance_), valF32(drive_),
            valI32(frames), valF32(sr_),
            valI32(pOut_),
        };
        mod_->call(f_process_, args, 10, nullptr, 0);

        data = mod_->memData();
        std::memcpy(out[0].data(), data + pOut_, sizeof(float) * static_cast<size_t>(frames));
    }

private:
    void applyPoles() {
        wasmtime_val_t pa[2] = { valI32(state_), valI32(poles_) };
        mod_->call(f_setPoles_, pa, 2, nullptr, 0);
    }

    std::vector<uint8_t> wasmBytes_;
    std::unique_ptr<WasmModule> mod_;
    wasmtime_func_t f_alloc_{}, f_new_{}, f_process_{}, f_setPoles_{};
    int32_t pIn_ = 0, pCut_ = 0, pOut_ = 0, state_ = 0;
    float sr_ = 48000.0f, cutoff_ = 1200.0f, resonance_ = 0.3f, drive_ = 1.0f;
    int poles_ = 4;
};

} // namespace synflow
