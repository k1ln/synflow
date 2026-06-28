#pragma once

#include <algorithm>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "../Node.h"
#include "../WasmModule.h"

namespace synflow {

// Bucket A — VirtualWavetableNode: wavetable oscillator voice, hosted via
// wasmtime, driven like public/WavetableProcessor.js. wavetable_new() once;
// wavetable_set_config(mode, unison, detune, a,d,s,r) when config changes; gated
// note (wavetable_gate_on(velocity)/off, sample-accurate); per-block
// wavetable_process with constant frequency + position/warp.
class WasmWavetableNode : public INode {
public:
    explicit WasmWavetableNode(std::vector<uint8_t> wasm) : wasmBytes_(std::move(wasm)) {}

    int numInputs() const override { return 0; }
    int numOutputs() const override { return 1; }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        sr_ = sr;
        mod_ = std::make_unique<WasmModule>(wasmBytes_.data(), wasmBytes_.size());
        f_alloc_ = mod_->func("alloc_f32");
        f_new_ = mod_->func("wavetable_new");
        f_gateOn_ = mod_->func("wavetable_gate_on");
        f_gateOff_ = mod_->func("wavetable_gate_off");
        f_setConfig_ = mod_->func("wavetable_set_config");
        f_process_ = mod_->func("wavetable_process");
        wasmtime_val_t blk = valI32(maxBlock);
        pFreq_ = mod_->callRetI32(f_alloc_, &blk, 1);
        pOut_ = mod_->callRetI32(f_alloc_, &blk, 1);
        state_ = mod_->callRetI32(f_new_, nullptr, 0);
        configDirty_ = true;
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "frequency") frequency_ = static_cast<float>(v);
        else if (name == "position") position_ = static_cast<float>(v);
        else if (name == "warp") warp_ = static_cast<float>(v);
        else if (name == "mode") { mode_ = static_cast<int>(v); configDirty_ = true; }
        else if (name == "unison") { unison_ = static_cast<int>(v); configDirty_ = true; }
        else if (name == "detune") { detune_ = static_cast<float>(v); configDirty_ = true; }
        else if (name == "attack" || name == "a") { a_ = static_cast<float>(v); configDirty_ = true; }
        else if (name == "decay" || name == "d") { d_ = static_cast<float>(v); configDirty_ = true; }
        else if (name == "sustain" || name == "s") { s_ = static_cast<float>(v); configDirty_ = true; }
        else if (name == "release" || name == "r") { r_ = static_cast<float>(v); configDirty_ = true; }
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        if (configDirty_) applyConfig();
        { uint8_t* d = mod_->memData(); std::memcpy(d + pFreq_, &frequency_, sizeof(float)); }

        int pos = 0;
        if (ctx.inEvents) {
            for (const auto& ev : *ctx.inEvents) {
                if (ev.type != EventType::NoteOn && ev.type != EventType::NoteOff) continue;
                const int off = std::min(std::max(ev.sampleOffset, 0), frames);
                renderSeg(pos, off - pos);
                pos = off;
                if (ev.type == EventType::NoteOn) {
                    wasmtime_val_t a[2] = { valI32(state_), valF32(ev.value > 0 ? static_cast<float>(ev.value) : 1.0f) };
                    mod_->call(f_gateOn_, a, 2, nullptr, 0);
                } else {
                    wasmtime_val_t s = valI32(state_);
                    mod_->call(f_gateOff_, &s, 1, nullptr, 0);
                }
            }
        }
        renderSeg(pos, frames - pos);
    }

private:
    void applyConfig() {
        wasmtime_val_t args[8] = {
            valI32(state_), valI32(mode_), valI32(unison_), valF32(detune_),
            valF32(a_), valF32(d_), valF32(s_), valF32(r_),
        };
        mod_->call(f_setConfig_, args, 8, nullptr, 0);
        configDirty_ = false;
    }

    void renderSeg(int pos, int n) {
        if (n <= 0) return;
        wasmtime_val_t args[8] = {
            valI32(state_), valI32(pFreq_), valI32(1), valF32(position_), valF32(warp_),
            valI32(n), valF32(sr_), valI32(pOut_),
        };
        mod_->call(f_process_, args, 8, nullptr, 0);
        uint8_t* d = mod_->memData();
        std::memcpy(out[0].data() + pos, d + pOut_, sizeof(float) * static_cast<size_t>(n));
    }

    std::vector<uint8_t> wasmBytes_;
    std::unique_ptr<WasmModule> mod_;
    wasmtime_func_t f_alloc_{}, f_new_{}, f_gateOn_{}, f_gateOff_{}, f_setConfig_{}, f_process_{};
    int32_t pFreq_ = 0, pOut_ = 0, state_ = 0;
    float sr_ = 48000.0f, frequency_ = 220.0f, position_ = 0.0f, warp_ = 0.0f, detune_ = 12.0f;
    float a_ = 0.01f, d_ = 0.3f, s_ = 0.8f, r_ = 0.3f;
    int mode_ = 0, unison_ = 1;
    bool configDirty_ = true;
};

} // namespace synflow
