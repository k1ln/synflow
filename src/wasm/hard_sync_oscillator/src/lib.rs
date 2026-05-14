use std::alloc::{alloc, Layout};
use std::f32::consts::TAU;

// ── Memory helpers ────────────────────────────────────────────────────────────

/// Allocate `count` f32 values and return the byte offset into WASM memory.
/// JS uses this to get pointers it can write into via Float32Array views.
#[no_mangle]
pub extern "C" fn alloc_f32(count: u32) -> u32 {
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { alloc(layout) as u32 }
}

// ── Oscillator waveforms ──────────────────────────────────────────────────────

#[inline(always)]
fn sine(phase: f32) -> f32 {
    (phase * TAU).sin()
}

#[inline(always)]
fn square(phase: f32) -> f32 {
    if phase < 0.5 { 1.0 } else { -1.0 }
}

#[inline(always)]
fn sawtooth(phase: f32) -> f32 {
    2.0 * (phase - (phase + 0.5).floor())
}

#[inline(always)]
fn triangle(phase: f32) -> f32 {
    let p = phase - 0.25;
    1.0 - 4.0 * (p.round() - p).abs()
}

// ── Core block processor ──────────────────────────────────────────────────────

/// Process one 128-sample audio block.
///
/// All pointer arguments are byte offsets into WASM linear memory.
/// `freq_ptr` / `detune_ptr` may be 1 or 128 elements (k-rate vs a-rate).
/// `sync_ptr` / `fm_ptr` are ignored when `has_sync` / `has_fm` == 0.
/// `custom_ptr` points to a 1024-element wavetable.
/// `state_out_ptr` must point to a 2-element f32 array; on return it holds
/// [new_phase, new_last_sync].
///
/// osc_type: 0=sine 1=square 2=sawtooth 3=triangle 4=custom
#[no_mangle]
pub unsafe extern "C" fn process_block(
    phase: f32,
    last_sync: f32,
    sample_rate: f32,
    freq_ptr: u32,
    freq_len: u32,
    detune_ptr: u32,
    detune_len: u32,
    sync_ptr: u32,
    has_sync: u32,
    fm_ptr: u32,
    has_fm: u32,
    block_size: u32,
    osc_type: u32,
    custom_ptr: u32,
    out_ptr: u32,
    state_out_ptr: u32,
) {
    let freq = std::slice::from_raw_parts(freq_ptr as *const f32, freq_len as usize);
    let detune = std::slice::from_raw_parts(detune_ptr as *const f32, detune_len as usize);
    let sync = if has_sync != 0 {
        Some(std::slice::from_raw_parts(sync_ptr as *const f32, block_size as usize))
    } else {
        None
    };
    let fm = if has_fm != 0 {
        Some(std::slice::from_raw_parts(fm_ptr as *const f32, block_size as usize))
    } else {
        None
    };
    let out = std::slice::from_raw_parts_mut(out_ptr as *mut f32, block_size as usize);
    let state_out = std::slice::from_raw_parts_mut(state_out_ptr as *mut f32, 2);

    let inv_sr = 1.0 / sample_rate;
    let mut phase = phase;
    let mut last_sync = last_sync;

    // Pre-fetch custom table pointer once to avoid repeated casting
    let custom_table = if osc_type == 4 {
        Some(std::slice::from_raw_parts(custom_ptr as *const f32, 1024))
    } else {
        None
    };

    for i in 0..block_size as usize {
        let current_sync = sync.map_or(0.0, |s| s[i]);

        let current_freq = if freq.len() > 1 { freq[i] } else { freq[0] };
        let current_detune = if detune.len() > 1 { detune[i] } else { detune[0] };

        // Apply detune (cents → frequency multiplier)
        let base_freq = current_freq * libm_powf(2.0, current_detune / 1200.0);
        let fm_value = fm.map_or(0.0, |f| f[i]);
        let final_freq = base_freq + fm_value;
        let phase_inc = final_freq * inv_sr;

        // Hard sync: detect rising edge, subsample-accurate phase reset
        if sync.is_some() && current_sync > 0.0 && last_sync <= 0.0 {
            let range = current_sync - last_sync;
            let fraction = if range != 0.0 { -last_sync / range } else { 0.0 };
            phase = phase_inc * (1.0 - fraction);
        } else {
            phase += phase_inc;
        }

        // Wrap phase to [0, 1)
        if phase >= 1.0 { phase -= 1.0; }
        if phase < 0.0 { phase += 1.0; }

        last_sync = current_sync;

        out[i] = match osc_type {
            1 => square(phase),
            2 => sawtooth(phase),
            3 => triangle(phase),
            4 => {
                if let Some(table) = custom_table {
                    let idx = ((phase * 1024.0) as usize) % 1024;
                    table[idx]
                } else {
                    0.0
                }
            }
            _ => sine(phase),
        };
    }

    state_out[0] = phase;
    state_out[1] = last_sync;
}

// ── libm shim for 2^x ────────────────────────────────────────────────────────
// std::f32::powf calls into the platform libm which isn't available on
// wasm32-unknown-unknown; we provide a fast integer + fractional split.

#[inline(always)]
fn libm_powf(base: f32, exp: f32) -> f32 {
    // Fast 2^x using the identity 2^x = e^(x * ln2)
    // For the detune range (±1200 cents → ±1 octave) this is accurate enough.
    fast_exp2(exp * base.log2())
}

#[inline(always)]
fn fast_exp2(x: f32) -> f32 {
    // Split into integer and fractional parts
    let xi = x.floor() as i32;
    let xf = x - xi as f32;
    // Minimax polynomial for 2^xf on [0, 1)
    let p = 1.0
        + xf * (0.693_147_18
            + xf * (0.240_226_5
                + xf * (0.055_504_11
                    + xf * (0.009_618_13
                        + xf * 0.001_333_32))));
    // Reconstruct: multiply by 2^xi via bit manipulation
    let bits = ((xi + 127) as u32) << 23;
    p * f32::from_bits(bits)
}
