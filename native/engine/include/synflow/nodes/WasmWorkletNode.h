#pragma once

#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "../Node.h"
#include "../WasmModule.h"

namespace synflow {

// Bucket A — VirtualAudioWorkletNode, native. The web runs the user's worklet as
// live JS in the AudioWorklet scope; natively the script is precompiled to WASM
// ahead of time and the bytes travel WITH the flow (base64 in node.data.wasmBase64,
// like an embedded sample). We host that module via the SAME wasmtime path as the
// built-in DSP — so a user effect/synth renders identically in the browser and the
// plugin. The module follows the canonical M0 ABI:
//
//   init(sampleRate: f32, maxBlock: i32) -> state: i32      (optional; else state 0)
//   alloc_f32(count: i32) -> ptr: i32                        (required)
//   process(state, inPtr, outPtr, frames, channels)          (required)
//   set_param(state, id: i32, value: f32)                    (optional)
//   note_on(state, freq: f32, velocity: f32) / note_off(state)  (optional, for synths)
//
// Params steer in by integer id: a Value event / knob on handle "param-<id>" (any
// trailing integer) calls set_param(id). With no module loaded it passes audio
// through unchanged so the graph still renders.
class WasmWorkletNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void setNamedParamStr(const std::string& name, const std::string& v) override {
        if (name == "wasmBase64" || name == "wasm" || name == "processorWasm")
            wasmBytes_ = decodeBase64(v);
    }
    void setNamedParam(const std::string& name, double v) override {
        const int id = trailingInt(name);
        if (id < 0) return;
        if (mod_ && hasSetParam_) callSetParam(id, static_cast<float>(v));
        else queued_.push_back({id, static_cast<float>(v)});
    }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        sr_ = sr; maxBlock_ = maxBlock;
        if (wasmBytes_.empty()) return;
        try {
            mod_ = std::make_unique<WasmModule>(wasmBytes_.data(), wasmBytes_.size());
            f_alloc_ = mod_->func("alloc_f32");
            f_process_ = mod_->func("process");
            hasSetParam_ = mod_->tryFunc("set_param", f_setParam_);
            hasNoteOn_ = mod_->tryFunc("note_on", f_noteOn_);
            hasNoteOff_ = mod_->tryFunc("note_off", f_noteOff_);
            wasmtime_func_t f_init;
            if (mod_->tryFunc("init", f_init)) {
                wasmtime_val_t ia[2] = { valF32(sr_), valI32(maxBlock_) };
                state_ = mod_->callRetI32(f_init, ia, 2);
            }
            wasmtime_val_t ca = valI32(maxBlock_);
            pIn_ = mod_->callRetI32(f_alloc_, &ca, 1);
            pOut_ = mod_->callRetI32(f_alloc_, &ca, 1);
            for (const auto& q : queued_) callSetParam(q.id, q.value); // apply pre-prepare params
            queued_.clear();
            ready_ = true;
        } catch (...) {
            mod_.reset(); ready_ = false; // bad module -> passthrough, don't crash the graph
        }
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        if (!ready_) { // no/failed module: transparent passthrough
            std::memcpy(out[0].data(), in[0].data(), sizeof(float) * static_cast<size_t>(frames));
            return;
        }
        // optional note gate for synth-style worklets
        if (ctx.inEvents)
            for (const auto& ev : *ctx.inEvents) {
                if (ev.type == EventType::Value) { lastFreq_ = static_cast<float>(ev.value); if (!ev.param.empty()) { const int id = trailingInt(ev.param); if (id >= 0 && hasSetParam_) callSetParam(id, static_cast<float>(ev.value)); } }
                else if (ev.type == EventType::NoteOn && hasNoteOn_) { wasmtime_val_t a[3] = { valI32(state_), valF32(lastFreq_), valF32(static_cast<float>(ev.value)) }; mod_->call(f_noteOn_, a, 3, nullptr, 0); }
                else if (ev.type == EventType::NoteOff && hasNoteOff_) { wasmtime_val_t a = valI32(state_); mod_->call(f_noteOff_, &a, 1, nullptr, 0); }
            }

        uint8_t* data = mod_->memData();
        std::memcpy(data + pIn_, in[0].data(), sizeof(float) * static_cast<size_t>(frames));
        wasmtime_val_t args[5] = { valI32(state_), valI32(pIn_), valI32(pOut_), valI32(frames), valI32(1) };
        mod_->call(f_process_, args, 5, nullptr, 0);
        data = mod_->memData(); // re-fetch: process may have grown memory
        std::memcpy(out[0].data(), data + pOut_, sizeof(float) * static_cast<size_t>(frames));
    }

private:
    struct Param { int id; float value; };

    void callSetParam(int id, float v) {
        wasmtime_val_t a[3] = { valI32(state_), valI32(id), valF32(v) };
        mod_->call(f_setParam_, a, 3, nullptr, 0);
    }

    // last run of digits in the handle -> integer id ("param-3" -> 3, "7" -> 7); -1 if none
    static int trailingInt(const std::string& s) {
        int i = static_cast<int>(s.size()) - 1;
        while (i >= 0 && (s[static_cast<size_t>(i)] < '0' || s[static_cast<size_t>(i)] > '9')) --i;
        if (i < 0) return -1;
        int end = i;
        while (i >= 0 && s[static_cast<size_t>(i)] >= '0' && s[static_cast<size_t>(i)] <= '9') --i;
        return std::atoi(s.substr(static_cast<size_t>(i + 1), static_cast<size_t>(end - i)).c_str());
    }

    static std::vector<uint8_t> decodeBase64(const std::string& in) {
        static const auto dec = [](char c) -> int {
            if (c >= 'A' && c <= 'Z') return c - 'A';
            if (c >= 'a' && c <= 'z') return c - 'a' + 26;
            if (c >= '0' && c <= '9') return c - '0' + 52;
            if (c == '+') return 62; if (c == '/') return 63; return -1;
        };
        std::vector<uint8_t> out;
        int val = 0, bits = -8;
        for (char c : in) {
            const int d = dec(c);
            if (d < 0) continue; // skip '=', newlines, etc.
            val = (val << 6) | d; bits += 6;
            if (bits >= 0) { out.push_back(static_cast<uint8_t>((val >> bits) & 0xFF)); bits -= 8; }
        }
        return out;
    }

    std::vector<uint8_t> wasmBytes_;
    std::unique_ptr<WasmModule> mod_;
    wasmtime_func_t f_alloc_{}, f_process_{}, f_setParam_{}, f_noteOn_{}, f_noteOff_{};
    bool hasSetParam_ = false, hasNoteOn_ = false, hasNoteOff_ = false, ready_ = false;
    int32_t pIn_ = 0, pOut_ = 0, state_ = 0;
    float sr_ = 48000.0f, lastFreq_ = 440.0f;
    int maxBlock_ = 128;
    std::vector<Param> queued_;
};

} // namespace synflow
