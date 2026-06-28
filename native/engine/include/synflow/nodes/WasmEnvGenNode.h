#pragma once

#include <algorithm>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "../Node.h"
#include "../WasmModule.h"

namespace synflow {

// Bucket A — VirtualEnvGenNode: an audio-rate ADSR envelope *signal* generator
// (bias + amount*ADSR), hosted via wasmtime. Gated by note events (env_gate_on/
// off, sample-accurate via segment splitting like Karplus), per-block env_process
// emits the envelope. Output drives any param input (e.g. a wasm filter cutoff).
class WasmEnvGenNode : public INode {
public:
    explicit WasmEnvGenNode(std::vector<uint8_t> wasm) : wasmBytes_(std::move(wasm)) {}

    int numInputs() const override { return 0; }   // gate via events
    int numOutputs() const override { return 1; }   // envelope signal

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        sr_ = sr;
        mod_ = std::make_unique<WasmModule>(wasmBytes_.data(), wasmBytes_.size());
        f_alloc_ = mod_->func("alloc_f32");
        f_new_ = mod_->func("env_new");
        f_gateOn_ = mod_->func("env_gate_on");
        f_gateOff_ = mod_->func("env_gate_off");
        f_process_ = mod_->func("env_process");
        wasmtime_val_t a = valI32(maxBlock);
        pOut_ = mod_->callRetI32(f_alloc_, &a, 1);
        state_ = mod_->callRetI32(f_new_, nullptr, 0);
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "attack") attack_ = static_cast<float>(v);
        else if (name == "decay") decay_ = static_cast<float>(v);
        else if (name == "sustain") sustain_ = static_cast<float>(v);
        else if (name == "release") release_ = static_cast<float>(v);
        else if (name == "amount") amount_ = static_cast<float>(v);
        else if (name == "bias") bias_ = static_cast<float>(v);
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        int pos = 0;
        if (ctx.inEvents) {
            for (const auto& ev : *ctx.inEvents) {
                if (ev.type != EventType::NoteOn && ev.type != EventType::NoteOff) continue;
                const int off = std::min(std::max(ev.sampleOffset, 0), frames);
                renderSeg(pos, off - pos);
                pos = off;
                wasmtime_val_t s = valI32(state_);
                mod_->call(ev.type == EventType::NoteOn ? f_gateOn_ : f_gateOff_, &s, 1, nullptr, 0);
            }
        }
        renderSeg(pos, frames - pos);
    }

private:
    void renderSeg(int pos, int n) {
        if (n <= 0) return;
        wasmtime_val_t args[10] = {
            valI32(state_), valI32(n), valF32(sr_), valI32(pOut_),
            valF32(attack_), valF32(decay_), valF32(sustain_), valF32(release_),
            valF32(amount_), valF32(bias_),
        };
        mod_->call(f_process_, args, 10, nullptr, 0);
        uint8_t* d = mod_->memData();
        std::memcpy(out[0].data() + pos, d + pOut_, sizeof(float) * static_cast<size_t>(n));
    }

    std::vector<uint8_t> wasmBytes_;
    std::unique_ptr<WasmModule> mod_;
    wasmtime_func_t f_alloc_{}, f_new_{}, f_gateOn_{}, f_gateOff_{}, f_process_{};
    int32_t pOut_ = 0, state_ = 0;
    float sr_ = 48000.0f, attack_ = 0.01f, decay_ = 0.2f, sustain_ = 0.5f, release_ = 0.3f, amount_ = 1.0f, bias_ = 0.0f;
};

} // namespace synflow
