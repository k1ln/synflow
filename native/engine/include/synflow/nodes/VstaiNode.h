#pragma once

#include <cstdint>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "../Node.h"
#include "../WasmModule.h"

namespace synflow {

// Hosts a VibePlugin ".vstai" module (an "AI VST": DSP written by Claude, compiled
// to WASM) as a first-class Synflow node, so a generated effect/synth can live in a
// flow and render into the DAW through the same native engine. VibePlugin and
// Synflow both run their DSP under wasmtime, so we just instantiate the module and
// drive it with VibePlugin's ABI (WasmAbi.h in that repo) — no VST3 hosting, no
// recompilation (the .vstai carries the compiled `wasmBase64`).
//
//   ABI (host <-> module):
//     memory
//     init(sampleRate: f32, maxFrames: i32, numChannels: i32)
//     process(numFrames: i32)
//     getInputPtr()/getOutputPtr()/getParamsPtr() -> usize   // PLANAR f32 buffers
//     getNumParams() -> i32
//     noteOn(noteId: i32, freq: f32, vel: f32) / noteOff(noteId: i32)  // synths only
//   Planar layout: channel c, frame f -> base + (c * kMaxFrames + f) * 4 bytes.
//   Params: the host writes one f32 per param into the params region each block.
//
// Synflow's engine is mono, so we feed in[0] to both wasm input channels and take
// output channel 0. Instrument .vstai are driven by the flow's host-MIDI path
// (data.isTrigger + data.isPitch): the frequency arrives as setNamedParam("frequency")
// and NoteOn/NoteOff arrive as events. Monophonic (Synflow's plugin MIDI routing
// sets one pitch at a time); polyphony would need per-note pitch in the event stream.
class VstaiNode : public INode {
public:
    int numInputs() const override { return 1; }
    int numOutputs() const override { return 1; }

    void setNamedParamStr(const std::string& name, const std::string& v) override {
        // The .vstai's compiled module bytes ride in node.data.wasmBase64 (same
        // channel a user AudioWorklet uses). Other string fields (html/assembly/name)
        // are ignored natively — the plugin surfaces Synflow knobs, not the AI GUI.
        if (name == "wasmBase64" || name == "vstaiWasm" || name == "wasm")
            wasmBytes_ = decodeBase64(v);
    }

    void setNamedParam(const std::string& name, double v) override {
        // Pitch for instrument modules comes in as "frequency" (Hz) via the flow's
        // pitch routing; it's NOT a module param, it's passed to noteOn().
        if (name == "frequency") { lastFreq_ = static_cast<float>(v); return; }
        const int id = trailingInt(name); // "param0" -> 0, "param12" -> 12
        if (id >= 0 && id < kMaxParams) { params_[static_cast<size_t>(id)] = static_cast<float>(v); paramSet_[static_cast<size_t>(id)] = true; }
    }

    void setParam(int id, float v) override {
        if (id >= 0 && id < kMaxParams) { params_[static_cast<size_t>(id)] = v; paramSet_[static_cast<size_t>(id)] = true; }
    }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        sr_ = sr;
        if (wasmBytes_.empty()) return;
        try {
            mod_ = std::make_unique<WasmModule>(wasmBytes_.data(), wasmBytes_.size());
            f_process_ = mod_->func("process");
            f_inPtr_ = mod_->func("getInputPtr");
            f_outPtr_ = mod_->func("getOutputPtr");
            f_paramsPtr_ = mod_->func("getParamsPtr");
            f_numParams_ = mod_->func("getNumParams");
            hasNoteOn_ = mod_->tryFunc("noteOn", f_noteOn_);
            hasNoteOff_ = mod_->tryFunc("noteOff", f_noteOff_);

            wasmtime_val_t ia[3] = { valF32(sr_), valI32(kMaxFrames), valI32(kChannels) };
            mod_->call(mod_->func("init"), ia, 3, nullptr, 0);

            inPtr_ = mod_->callRetI32(f_inPtr_, nullptr, 0);
            outPtr_ = mod_->callRetI32(f_outPtr_, nullptr, 0);
            paramsPtr_ = mod_->callRetI32(f_paramsPtr_, nullptr, 0);
            int32_t np = mod_->callRetI32(f_numParams_, nullptr, 0);
            paramCount_ = np < 0 ? 0 : (np > kMaxParams ? kMaxParams : np);
            // For any param the flow didn't set, inherit the module's own default
            // (whatever init() left in the params region) so a bare flow still sounds.
            if (paramCount_ > 0) {
                const float* md = reinterpret_cast<const float*>(mod_->memData() + paramsPtr_);
                for (int i = 0; i < paramCount_; ++i)
                    if (!paramSet_[static_cast<size_t>(i)]) params_[static_cast<size_t>(i)] = md[i];
            }
            ready_ = true;
        } catch (...) {
            mod_.reset();
            ready_ = false; // bad/foreign module -> passthrough, never crash the graph
        }
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        if (!ready_ || frames > kMaxFrames) { // no module / oversized block: pass audio through
            std::memcpy(out[0].data(), in[0].data(), sizeof(float) * static_cast<size_t>(frames));
            return;
        }

        // Note gate (instrument modules). Value events also carry live pitch (Hz), so
        // a note played this block uses the pitch set for it. Monophonic: one voice id.
        if (ctx.inEvents)
            for (const auto& ev : *ctx.inEvents) {
                if (ev.type == EventType::Value) {
                    if (ev.param.empty() || ev.param == "frequency") lastFreq_ = static_cast<float>(ev.value);
                    else { const int id = trailingInt(ev.param); if (id >= 0 && id < kMaxParams) params_[static_cast<size_t>(id)] = static_cast<float>(ev.value); }
                } else if (ev.type == EventType::NoteOn && hasNoteOn_) {
                    voiceId_ = ++noteCounter_;
                    wasmtime_val_t a[3] = { valI32(voiceId_), valF32(lastFreq_), valF32(static_cast<float>(ev.value)) };
                    mod_->call(f_noteOn_, a, 3, nullptr, 0);
                } else if (ev.type == EventType::NoteOff && hasNoteOff_) {
                    wasmtime_val_t a = valI32(voiceId_);
                    mod_->call(f_noteOff_, &a, 1, nullptr, 0);
                }
            }

        uint8_t* data = mod_->memData();
        // Params: write the live mirror into the module's params region.
        if (paramCount_ > 0)
            std::memcpy(data + paramsPtr_, params_, sizeof(float) * static_cast<size_t>(paramCount_));
        // Input: mono -> both planar channels (stereo effects get signal on L and R).
        const size_t nbytes = sizeof(float) * static_cast<size_t>(frames);
        std::memcpy(data + inPtr_, in[0].data(), nbytes);
        std::memcpy(data + inPtr_ + kMaxFrames * sizeof(float), in[0].data(), nbytes);

        wasmtime_val_t arg = valI32(frames);
        mod_->call(f_process_, &arg, 1, nullptr, 0);

        data = mod_->memData(); // re-fetch: process may have grown memory
        // Output: take planar channel 0 (mono engine; keeps unity level for mono and
        // stereo modules alike, vs. a downmix that would halve a mono module).
        std::memcpy(out[0].data(), data + outPtr_, nbytes);
    }

private:
    static constexpr int kMaxFrames = 8192;  // VibePlugin's fixed planar stride/capacity
    static constexpr int kChannels = 2;      // VibePlugin modules are stereo (kMaxChannels)
    static constexpr int kMaxParams = 64;    // VibePlugin's params region capacity

    // last run of digits in a name -> integer id ("param3" -> 3); -1 if none
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
            if (d < 0) continue; // skip '=', whitespace
            val = (val << 6) | d; bits += 6;
            if (bits >= 0) { out.push_back(static_cast<uint8_t>((val >> bits) & 0xFF)); bits -= 8; }
        }
        return out;
    }

    std::vector<uint8_t> wasmBytes_;
    std::unique_ptr<WasmModule> mod_;
    wasmtime_func_t f_process_{}, f_inPtr_{}, f_outPtr_{}, f_paramsPtr_{}, f_numParams_{}, f_noteOn_{}, f_noteOff_{};
    bool hasNoteOn_ = false, hasNoteOff_ = false, ready_ = false;
    int32_t inPtr_ = 0, outPtr_ = 0, paramsPtr_ = 0;
    int paramCount_ = 0;
    int32_t voiceId_ = 0, noteCounter_ = 0;
    float sr_ = 48000.0f, lastFreq_ = 440.0f;
    float params_[kMaxParams] = { 0 };
    bool paramSet_[kMaxParams] = { false }; // did the flow set this param? (else use module default)
};

} // namespace synflow
