#pragma once

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "../Node.h"
#include "../WasmModule.h"

namespace synflow {

// Bucket A — VirtualAudioWorkletOscillatorNode (hard-sync oscillator), hosted via
// wasmtime, driven like public/HardSyncOscillatorProcessor.js. process_block is
// stateless: phase/lastSync are passed in by value and written back to pState.
// Optional fm input (port 0) + hard-sync input (port 1). type: 0 sine, 1 square,
// 2 saw, 3 triangle, 4 custom.
class WasmHardSyncNode : public INode {
public:
    explicit WasmHardSyncNode(std::vector<uint8_t> wasm) : wasmBytes_(std::move(wasm)) {}

    int numInputs() const override { return 2; }   // [0]=fm, [1]=sync
    int numOutputs() const override { return 1; }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        sr_ = sr;
        mod_ = std::make_unique<WasmModule>(wasmBytes_.data(), wasmBytes_.size());
        f_alloc_ = mod_->func("alloc_f32");
        f_process_ = mod_->func("process_block");
        wasmtime_val_t blk = valI32(maxBlock);
        pFreq_ = mod_->callRetI32(f_alloc_, &blk, 1);
        pDetune_ = mod_->callRetI32(f_alloc_, &blk, 1);
        pSync_ = mod_->callRetI32(f_alloc_, &blk, 1);
        pFm_ = mod_->callRetI32(f_alloc_, &blk, 1);
        wasmtime_val_t ct = valI32(1024);
        pCustom_ = mod_->callRetI32(f_alloc_, &ct, 1);
        pOut_ = mod_->callRetI32(f_alloc_, &blk, 1);
        wasmtime_val_t two = valI32(2);
        pState_ = mod_->callRetI32(f_alloc_, &two, 1);
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "frequency") frequency_ = static_cast<float>(v);
        else if (name == "detune") detune_ = static_cast<float>(v);
        else if (name == "type") typeIdx_ = static_cast<int>(v);
    }
    void setNamedParamStr(const std::string& name, const std::string& v) override {
        if (name == "type") typeIdx_ = v == "square" ? 1 : v == "sawtooth" ? 2 : v == "triangle" ? 3 : v == "custom" ? 4 : 0;
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        uint8_t* data = mod_->memData();
        std::memcpy(data + pFreq_, &frequency_, sizeof(float));
        std::memcpy(data + pDetune_, &detune_, sizeof(float));
        const int hasFm = (inConnected.size() > 0 && inConnected[0]) ? 1 : 0;
        const int hasSync = (inConnected.size() > 1 && inConnected[1]) ? 1 : 0;
        if (hasFm) std::memcpy(data + pFm_, in[0].data(), sizeof(float) * static_cast<size_t>(frames));
        if (hasSync) std::memcpy(data + pSync_, in[1].data(), sizeof(float) * static_cast<size_t>(frames));

        wasmtime_val_t args[16] = {
            valF32(phase_), valF32(lastSync_), valF32(sr_),
            valI32(pFreq_), valI32(1), valI32(pDetune_), valI32(1),
            valI32(pSync_), valI32(hasSync), valI32(pFm_), valI32(hasFm),
            valI32(frames), valI32(typeIdx_), valI32(pCustom_), valI32(pOut_), valI32(pState_),
        };
        mod_->call(f_process_, args, 16, nullptr, 0);
        data = mod_->memData();
        std::memcpy(&phase_, data + pState_, sizeof(float));
        std::memcpy(&lastSync_, data + pState_ + sizeof(float), sizeof(float));
        std::memcpy(out[0].data(), data + pOut_, sizeof(float) * static_cast<size_t>(frames));
    }

private:
    std::vector<uint8_t> wasmBytes_;
    std::unique_ptr<WasmModule> mod_;
    wasmtime_func_t f_alloc_{}, f_process_{};
    int32_t pFreq_ = 0, pDetune_ = 0, pSync_ = 0, pFm_ = 0, pCustom_ = 0, pOut_ = 0, pState_ = 0;
    float sr_ = 48000.0f, frequency_ = 440.0f, detune_ = 0.0f, phase_ = 0.0f, lastSync_ = 0.0f;
    int typeIdx_ = 0;
};

} // namespace synflow
