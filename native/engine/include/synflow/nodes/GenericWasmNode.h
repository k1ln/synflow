#pragma once

#include <cstring>
#include <memory>
#include <string>
#include <utility>
#include <vector>

#include "../Node.h"
#include "../WasmModule.h"

namespace synflow {

// Generic host for a node whose DSP is entirely authored in AssemblyScript
// (native/wasm-src/*.ts, ABI v2 — see native/wasm-src/abi.ts) and compiled to
// wasm. One wasm instance per graph node, mirroring a web AudioWorklet. This
// class knows NOTHING about any specific node's math — it only drives
// init/getInputPtr/getOutputPtr/setConnected/setParam/process and forwards
// named params through a small {name -> id} table the factory supplies. That
// table is structural wiring (which knob is which id), not DSP — the actual
// audio computation lives entirely in the wasm module, same split VibePlugin
// uses (params[] metadata + all DSP in the one wasm).
class GenericWasmNode : public INode {
public:
    GenericWasmNode(std::vector<uint8_t> wasm, int numIn, int numOut,
                     std::vector<std::pair<std::string, int>> paramIds = {},
                     std::vector<std::pair<std::string, int>> inPortHandles = {})
        : wasmBytes_(std::move(wasm)), numIn_(numIn), numOut_(numOut),
          paramIds_(std::move(paramIds)), inPortHandles_(std::move(inPortHandles)) {}

    int numInputs() const override { return numIn_; }
    int numOutputs() const override { return numOut_; }

    // Named-handle -> port routing (e.g. Gain's "gain" mod input -> port 1,
    // RingMod's "b" -> port 1). Structural wiring metadata, supplied by the
    // factory alongside the wasm bytes — matches the C++ nodes' own
    // inPortForHandle overrides so an AS port has the same routing as the
    // C++ node it replaces. Unlisted handles ("main-input", "a", ...) -> 0.
    int inPortForHandle(const std::string& handle) const override {
        for (const auto& kv : inPortHandles_) if (kv.first == handle) return kv.second;
        return 0;
    }

    void prepare(float sr, int maxBlock) override {
        INode::prepare(sr, maxBlock);
        mod_ = std::make_unique<WasmModule>(wasmBytes_.data(), wasmBytes_.size());
        fInit_ = mod_->func("init");
        fSetParam_ = mod_->func("setParam");
        fSetConnected_ = mod_->func("setConnected");
        fGetIn_ = mod_->func("getInputPtr");
        fGetOut_ = mod_->func("getOutputPtr");
        fProcess_ = mod_->func("process");
        hasNoteOn_ = mod_->tryFunc("noteOn", fNoteOn_);
        hasNoteOff_ = mod_->tryFunc("noteOff", fNoteOff_);

        wasmtime_val_t a[2] = { valF32(sr), valI32(maxBlock) };
        mod_->call(fInit_, a, 2, nullptr, 0);

        inPtr_.resize(static_cast<size_t>(numIn_));
        for (int p = 0; p < numIn_; ++p) {
            wasmtime_val_t pv = valI32(p);
            inPtr_[static_cast<size_t>(p)] = mod_->callRetI32(fGetIn_, &pv, 1);
        }
        outPtr_.resize(static_cast<size_t>(numOut_));
        for (int p = 0; p < numOut_; ++p) {
            wasmtime_val_t pv = valI32(p);
            outPtr_[static_cast<size_t>(p)] = mod_->callRetI32(fGetOut_, &pv, 1);
        }
    }

    void setParam(int paramId, float value) override { setParamId(paramId, value); }

    void setNamedParam(const std::string& name, double value) override {
        for (const auto& kv : paramIds_) {
            if (kv.first == name) { setParamId(kv.second, static_cast<float>(value)); return; }
        }
    }

    void noteOn(float velocity = 1.0f) {
        if (!hasNoteOn_) return;
        wasmtime_val_t a = valF32(velocity > 0 ? velocity : 1.0f);
        mod_->call(fNoteOn_, &a, 1, nullptr, 0);
    }

    void noteOff() {
        if (!hasNoteOff_) return;
        mod_->call(fNoteOff_, nullptr, 0, nullptr, 0);
    }

    void process(const ProcessContext& ctx) override {
        const int frames = ctx.frames;
        uint8_t* d = mod_->memData();
        for (int p = 0; p < numIn_; ++p) {
            const bool connected = static_cast<int>(inConnected.size()) > p && inConnected[static_cast<size_t>(p)];
            wasmtime_val_t ca[2] = { valI32(p), valI32(connected ? 1 : 0) };
            mod_->call(fSetConnected_, ca, 2, nullptr, 0);
            if (connected) {
                std::memcpy(d + inPtr_[static_cast<size_t>(p)], in[static_cast<size_t>(p)].data(),
                            sizeof(float) * static_cast<size_t>(frames));
            }
        }
        wasmtime_val_t pa = valI32(frames);
        mod_->call(fProcess_, &pa, 1, nullptr, 0);
        d = mod_->memData(); // re-fetch: defensive against memory growth
        for (int p = 0; p < numOut_; ++p) {
            std::memcpy(out[static_cast<size_t>(p)].data(), d + outPtr_[static_cast<size_t>(p)],
                        sizeof(float) * static_cast<size_t>(frames));
        }
    }

private:
    void setParamId(int id, float v) {
        wasmtime_val_t a[2] = { valI32(id), valF32(v) };
        mod_->call(fSetParam_, a, 2, nullptr, 0);
    }

    std::vector<uint8_t> wasmBytes_;
    int numIn_ = 0, numOut_ = 0;
    std::vector<std::pair<std::string, int>> paramIds_;
    std::vector<std::pair<std::string, int>> inPortHandles_;
    std::unique_ptr<WasmModule> mod_;
    wasmtime_func_t fInit_{}, fSetParam_{}, fSetConnected_{}, fGetIn_{}, fGetOut_{}, fProcess_{}, fNoteOn_{}, fNoteOff_{};
    bool hasNoteOn_ = false, hasNoteOff_ = false;
    std::vector<int32_t> inPtr_, outPtr_;
};

} // namespace synflow
