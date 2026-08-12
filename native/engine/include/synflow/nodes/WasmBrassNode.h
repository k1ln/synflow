#pragma once

#include <algorithm>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "../Node.h"
#include "../WasmModule.h"

namespace synflow {

// Bucket A — VirtualBrassNode: STK-derived lip-reed brass waveguide, hosted via
// wasmtime, driven like public/BrassProcessor.js. brass_new(sr) once; per-block
// brass_process with a constant frequency + the continuous knobs (tension,
// slide, attack, release, vibratoRate, vibratoGain); note gate via events
// (brass_note_on(velocity)/brass_note_off), sample-accurate via segment
// splitting (same pattern as WasmFMNode).
class WasmBrassNode : public INode {
public:
    explicit WasmBrassNode(std::vector<uint8_t> wasm) : wasmBytes_(std::move(wasm)) {}

    int numInputs() const override { return 0; }
    int numOutputs() const override { return 1; }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        sr_ = sr;
        mod_ = std::make_unique<WasmModule>(wasmBytes_.data(), wasmBytes_.size());
        f_alloc_ = mod_->func("alloc_f32");
        f_new_ = mod_->func("brass_new");
        f_noteOn_ = mod_->func("brass_note_on");
        f_noteOff_ = mod_->func("brass_note_off");
        f_process_ = mod_->func("brass_process");
        wasmtime_val_t blk = valI32(maxBlock);
        pFreq_ = mod_->callRetI32(f_alloc_, &blk, 1);
        pOut_ = mod_->callRetI32(f_alloc_, &blk, 1);
        wasmtime_val_t srv = valF32(sr);
        state_ = mod_->callRetI32(f_new_, &srv, 1);
    }

    void setNamedParam(const std::string& name, double v) override {
        if (name == "frequency") frequency_ = static_cast<float>(v);
        else if (name == "tension") tension_ = static_cast<float>(v);
        else if (name == "slide") slide_ = static_cast<float>(v);
        else if (name == "attack") attack_ = static_cast<float>(v);
        else if (name == "release") release_ = static_cast<float>(v);
        else if (name == "vibratoRate") vibratoRate_ = static_cast<float>(v);
        else if (name == "vibratoGain") vibratoGain_ = static_cast<float>(v);
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        { uint8_t* d = mod_->memData(); std::memcpy(d + pFreq_, &frequency_, sizeof(float)); } // constant -> freq_len 1

        int pos = 0;
        if (ctx.inEvents) {
            for (const auto& ev : *ctx.inEvents) {
                if (ev.type != EventType::NoteOn && ev.type != EventType::NoteOff) continue;
                const int off = std::min(std::max(ev.sampleOffset, 0), frames);
                renderSeg(pos, off - pos);
                pos = off;
                if (ev.type == EventType::NoteOn) {
                    wasmtime_val_t a[2] = { valI32(state_), valF32(ev.value > 0 ? static_cast<float>(ev.value) : 1.0f) };
                    mod_->call(f_noteOn_, a, 2, nullptr, 0);
                } else {
                    wasmtime_val_t s = valI32(state_);
                    mod_->call(f_noteOff_, &s, 1, nullptr, 0);
                }
            }
        }
        renderSeg(pos, frames - pos);
    }

private:
    void renderSeg(int pos, int n) {
        if (n <= 0) return;
        wasmtime_val_t args[12] = {
            valI32(state_), valI32(pFreq_), valI32(1),
            valF32(tension_), valF32(slide_), valF32(attack_), valF32(release_),
            valF32(vibratoRate_), valF32(vibratoGain_),
            valI32(n), valF32(sr_),
            valI32(pOut_),
        };
        mod_->call(f_process_, args, 12, nullptr, 0);
        uint8_t* d = mod_->memData();
        std::memcpy(out[0].data() + pos, d + pOut_, sizeof(float) * static_cast<size_t>(n));
    }

    std::vector<uint8_t> wasmBytes_;
    std::unique_ptr<WasmModule> mod_;
    wasmtime_func_t f_alloc_{}, f_new_{}, f_noteOn_{}, f_noteOff_{}, f_process_{};
    int32_t pFreq_ = 0, pOut_ = 0, state_ = 0;
    float sr_ = 48000.0f, frequency_ = 220.0f;
    float tension_ = 0.5f, slide_ = 0.5f, attack_ = 0.05f, release_ = 0.1f;
    float vibratoRate_ = 0.5f, vibratoGain_ = 0.0f;
};

} // namespace synflow
