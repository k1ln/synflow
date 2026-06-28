#pragma once

#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>

#include <wasmtime.h>

// Thin RAII wrapper over the wasmtime C API for hosting ONE wasm instance — the
// native counterpart of a web AudioWorklet hosting a WebAssembly.Instance. The
// wasm bytecode is exactly what the browser loads (src/wasm/* -> public/*.wasm),
// and these DSP modules have no host imports, so wasmtime renders bit-identically
// to V8 (proven in M0). Each node owns its own instance, mirroring the web (one
// worklet == one instance).
namespace synflow {

inline wasmtime_val_t valI32(int32_t v) { wasmtime_val_t x; x.kind = WASMTIME_I32; x.of.i32 = v; return x; }
inline wasmtime_val_t valI64(int64_t v) { wasmtime_val_t x; x.kind = WASMTIME_I64; x.of.i64 = v; return x; }
inline wasmtime_val_t valF32(float v)   { wasmtime_val_t x; x.kind = WASMTIME_F32; x.of.f32 = v; return x; }

class WasmModule {
public:
    WasmModule(const uint8_t* wasm, size_t len) {
        engine_ = wasm_engine_new();
        store_ = wasmtime_store_new(engine_, nullptr, nullptr);
        ctx_ = wasmtime_store_context(store_);

        wasmtime_error_t* err = wasmtime_module_new(engine_, wasm, len, &module_);
        if (err) fail("module_new", err, nullptr);

        wasm_trap_t* trap = nullptr;
        err = wasmtime_instance_new(ctx_, module_, nullptr, 0, &instance_, &trap);
        if (err || trap) fail("instantiate", err, trap);

        wasmtime_extern_t item;
        if (!wasmtime_instance_export_get(ctx_, &instance_, "memory", 6, &item) || item.kind != WASMTIME_EXTERN_MEMORY)
            throw std::runtime_error("wasm: no memory export");
        mem_ = item.of.memory;
    }

    ~WasmModule() {
        if (module_) wasmtime_module_delete(module_);
        if (store_) wasmtime_store_delete(store_);
        if (engine_) wasm_engine_delete(engine_);
    }

    WasmModule(const WasmModule&) = delete;
    WasmModule& operator=(const WasmModule&) = delete;

    wasmtime_func_t func(const char* name) {
        wasmtime_extern_t item;
        if (!wasmtime_instance_export_get(ctx_, &instance_, name, std::strlen(name), &item) ||
            item.kind != WASMTIME_EXTERN_FUNC)
            throw std::runtime_error(std::string("wasm: missing func ") + name);
        return item.of.func;
    }

    void call(wasmtime_func_t f, const wasmtime_val_t* args, size_t na,
              wasmtime_val_t* res, size_t nres) {
        wasm_trap_t* trap = nullptr;
        wasmtime_error_t* err = wasmtime_func_call(ctx_, &f, args, na, res, nres, &trap);
        if (err || trap) fail("call", err, trap);
    }

    int32_t callRetI32(wasmtime_func_t f, const wasmtime_val_t* args, size_t na) {
        wasmtime_val_t r; call(f, args, na, &r, 1); return r.of.i32;
    }

    // Linear-memory base. NOTE: re-fetch after any call that may grow memory.
    uint8_t* memData() { return wasmtime_memory_data(ctx_, &mem_); }
    size_t memSize() { return wasmtime_memory_data_size(ctx_, &mem_); }

private:
    [[noreturn]] void fail(const char* what, wasmtime_error_t* err, wasm_trap_t* trap) {
        std::string msg = std::string("wasm ") + what + " failed";
        if (err) { wasm_byte_vec_t m; wasmtime_error_message(err, &m); msg += ": " + std::string(m.data, m.size); wasm_byte_vec_delete(&m); wasmtime_error_delete(err); }
        if (trap) { wasm_byte_vec_t m; wasm_trap_message(trap, &m); msg += " (trap: " + std::string(m.data, m.size) + ")"; wasm_byte_vec_delete(&m); wasm_trap_delete(trap); }
        throw std::runtime_error(msg);
    }

    wasm_engine_t* engine_ = nullptr;
    wasmtime_store_t* store_ = nullptr;
    wasmtime_context_t* ctx_ = nullptr;
    wasmtime_module_t* module_ = nullptr;
    wasmtime_instance_t instance_{};
    wasmtime_memory_t mem_{};
};

} // namespace synflow
