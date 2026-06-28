#pragma once

#include <cmath>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "../Node.h"
#include "../WasmModule.h"

namespace synflow {

// Bucket A — VirtualAudioSignalFreqShifterNode: pitch/frequency shifter. Effect,
// hosted via wasmtime, driven like public/AudioSignalFreqShifterProcessor.js:
// freq_shifter_new(2048) once, per block write input + freq_shifter_process(in,
// out, frames, pitchRatio) where pitchRatio = 2^(shift_semitones/12).
class WasmFreqShifterNode : public INode {
public:
    explicit WasmFreqShifterNode(std::vector<uint8_t> wasm) : wasmBytes_(std::move(wasm)) {}

    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        (void)sr;
        mod_ = std::make_unique<WasmModule>(wasmBytes_.data(), wasmBytes_.size());
        f_alloc_ = mod_->func("alloc_f32");
        f_new_ = mod_->func("freq_shifter_new");
        f_process_ = mod_->func("freq_shifter_process");
        wasmtime_val_t a = valI32(maxBlock);
        pIn_ = mod_->callRetI32(f_alloc_, &a, 1);
        pOut_ = mod_->callRetI32(f_alloc_, &a, 1);
        wasmtime_val_t buf = valI32(2048); // BUFFER_SIZE
        state_ = mod_->callRetI32(f_new_, &buf, 1);
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "shift") pitchRatio_ = std::pow(2.0f, static_cast<float>(v) / 12.0f);
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        uint8_t* data = mod_->memData();
        std::memcpy(data + pIn_, in[0].data(), sizeof(float) * static_cast<size_t>(frames));
        wasmtime_val_t args[5] = { valI32(state_), valI32(pIn_), valI32(pOut_), valI32(frames), valF32(pitchRatio_) };
        mod_->call(f_process_, args, 5, nullptr, 0);
        data = mod_->memData();
        std::memcpy(out[0].data(), data + pOut_, sizeof(float) * static_cast<size_t>(frames));
    }

private:
    std::vector<uint8_t> wasmBytes_;
    std::unique_ptr<WasmModule> mod_;
    wasmtime_func_t f_alloc_{}, f_new_{}, f_process_{};
    int32_t pIn_ = 0, pOut_ = 0, state_ = 0;
    float pitchRatio_ = 1.0f;
};

} // namespace synflow
