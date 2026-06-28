// M0 — native renderer: runs the SAME dsp.wasm through wasmtime (the engine the
// JUCE plugin embeds) on the canonical ABI, and writes build/out_native.f32.
// Reads the shared build/input.f32 so the input is byte-identical to the V8 side.

use std::fs;
use std::path::PathBuf;
use wasmtime::*;

const SR: f32 = 48000.0;
const BLOCK: usize = 100; // must match render-wasm.mjs
const DRIVE: f32 = 3.0;

fn build_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("build")
}

fn read_f32(path: &std::path::Path) -> Vec<f32> {
    let bytes = fs::read(path).expect("read f32 file");
    bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

fn main() -> Result<()> {
    let dir = build_dir();
    let wasm = fs::read(dir.join("dsp.wasm"))?;
    let input = read_f32(&dir.join("input.f32"));
    let n = input.len();

    let engine = Engine::default();
    let module = Module::new(&engine, &wasm)?;
    let mut store = Store::new(&engine, ());

    // The only import is env.abort (never hit on the happy path). Provide a stub
    // so instantiation succeeds; it must never be called during processing.
    let mut linker = Linker::new(&engine);
    linker.func_wrap(
        "env",
        "abort",
        |_: i32, _: i32, _: i32, _: i32| {
            eprintln!("⚠ wasm abort() fired — PoC output is invalid");
        },
    )?;

    let instance = linker.instantiate(&mut store, &module)?;
    let memory = instance.get_memory(&mut store, "memory").expect("memory export");
    let alloc_f32 = instance.get_typed_func::<i32, i32>(&mut store, "alloc_f32")?;
    let init = instance.get_typed_func::<(f32, i32), i32>(&mut store, "init")?;
    let set_param = instance.get_typed_func::<(i32, i32, f32), ()>(&mut store, "set_param")?;
    let process = instance.get_typed_func::<(i32, i32, i32, i32, i32), ()>(&mut store, "process")?;

    let in_ptr = alloc_f32.call(&mut store, BLOCK as i32)? as usize;
    let out_ptr = alloc_f32.call(&mut store, BLOCK as i32)? as usize;
    let state = init.call(&mut store, (SR, BLOCK as i32))?;
    set_param.call(&mut store, (state, 0, DRIVE))?;

    let mut out = vec![0f32; n];
    let mut i = 0usize;
    while i < n {
        let frames = BLOCK.min(n - i);
        // write input chunk into linear memory
        {
            let data = memory.data_mut(&mut store);
            for k in 0..frames {
                let v = input[i + k].to_le_bytes();
                data[in_ptr + k * 4..in_ptr + k * 4 + 4].copy_from_slice(&v);
            }
        }
        process.call(&mut store, (state, in_ptr as i32, out_ptr as i32, frames as i32, 1))?;
        // read output chunk back
        {
            let data = memory.data(&store);
            for k in 0..frames {
                let o = out_ptr + k * 4;
                out[i + k] = f32::from_le_bytes([data[o], data[o + 1], data[o + 2], data[o + 3]]);
            }
        }
        i += frames;
    }

    let mut bytes = Vec::with_capacity(n * 4);
    for s in &out {
        bytes.extend_from_slice(&s.to_le_bytes());
    }
    fs::write(dir.join("out_native.f32"), &bytes)?;
    println!("wrote out_native.f32 ({} samples, block={}, drive={})", n, BLOCK, DRIVE);
    Ok(())
}
