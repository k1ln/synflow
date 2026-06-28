// 6-operator FM (phase-modulation) voice — DX7/FM8/TX81Z family. Six sine
// operators, a selectable algorithm (carrier/modulator routing + op-6 feedback),
// per-op ratio + level, and a gated global ADSR. Rust/WASM port of
// public/FMProcessor.js.

use std::alloc::{alloc, Layout};

#[no_mangle]
pub extern "C" fn alloc_f32(count: u32) -> u32 {
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { alloc(layout) as u32 }
}

const TWO_PI: f32 = std::f32::consts::PI * 2.0;
const MOD_SCALE: f32 = 7.0;

// (carriers bitmask, [modulator bitmask per op]). Bit i = operator i.
const ALGOS: [(u8, [u8; 6]); 9] = [
    (0b000001, [0, 0, 0, 0, 0, 0]),          // 0 Sine
    (0b000001, [0b10, 0, 0, 0, 0, 0]),       // 1 2-op
    (0b000001, [0b10, 0b100, 0, 0, 0, 0]),   // 2 3-stack
    (0b000001, [0b10, 0b100, 0b1000, 0, 0, 0]), // 3 4-stack
    (0b000101, [0b10, 0, 0b1000, 0, 0, 0]),  // 4 E.Piano
    (0b010101, [0b10, 0, 0b1000, 0, 0b100000, 0]), // 5 3x2
    (0b000111, [0b1000, 0b1000, 0b1000, 0, 0, 0]), // 6 1->3
    (0b000001, [0b10, 0b100, 0b1000, 0b10000, 0b100000, 0]), // 7 6-stack FB
    (0b111111, [0, 0, 0, 0, 0, 0]),          // 8 Organ
];

const STAGE_IDLE: u32 = 0;
const STAGE_ATTACK: u32 = 1;
const STAGE_DECAY: u32 = 2;
const STAGE_SUSTAIN: u32 = 3;
const STAGE_RELEASE: u32 = 4;

#[repr(C)]
pub struct Fm {
    phase: [f32; 6],
    op_out: [f32; 6],
    prev_fb: f32,
    ratios: [f32; 6],
    levels: [f32; 6],
    feedback: f32,
    algo: u32,
    a: f32, d: f32, s: f32, r: f32,
    env: f32,
    stage: u32,
    vel: f32,
}

#[no_mangle]
pub extern "C" fn fm_new() -> *mut Fm {
    let layout = Layout::new::<Fm>();
    let p = unsafe { alloc(layout) as *mut Fm };
    unsafe {
        (*p) = Fm {
            phase: [0.0; 6], op_out: [0.0; 6], prev_fb: 0.0,
            ratios: [1.0; 6], levels: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            feedback: 0.0, algo: 1,
            a: 0.005, d: 0.3, s: 0.7, r: 0.3,
            env: 0.0, stage: STAGE_IDLE, vel: 1.0,
        };
    }
    p
}

/// `ratios_ptr`/`levels_ptr` point at 6 f32 each in wasm memory.
#[no_mangle]
pub extern "C" fn fm_set_config(
    state: *mut Fm,
    ratios_ptr: *const f32,
    levels_ptr: *const f32,
    feedback: f32,
    algorithm: u32,
    a: f32, d: f32, s: f32, r: f32,
) {
    let st = unsafe { &mut *state };
    let ratios = unsafe { std::slice::from_raw_parts(ratios_ptr, 6) };
    let levels = unsafe { std::slice::from_raw_parts(levels_ptr, 6) };
    for i in 0..6 { st.ratios[i] = ratios[i]; st.levels[i] = levels[i]; }
    st.feedback = feedback;
    st.algo = if algorithm > 8 { 8 } else { algorithm };
    st.a = a; st.d = d; st.s = s; st.r = r;
}

#[no_mangle]
pub extern "C" fn fm_gate_on(state: *mut Fm, velocity: f32) {
    let st = unsafe { &mut *state };
    st.stage = STAGE_ATTACK;
    st.vel = if velocity > 0.0 { velocity } else { 1.0 };
}

#[no_mangle]
pub extern "C" fn fm_gate_off(state: *mut Fm) {
    unsafe { (*state).stage = STAGE_RELEASE; }
}

/// `frequency` is a-rate (`freq_len` is 1 or `frames`).
#[no_mangle]
pub extern "C" fn fm_process(
    state: *mut Fm,
    freq_ptr: *const f32,
    freq_len: u32,
    frames: u32,
    sample_rate: f32,
    out_ptr: *mut f32,
) {
    let st = unsafe { &mut *state };
    let n = frames as usize;
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, n) };
    let freq = unsafe { std::slice::from_raw_parts(freq_ptr, freq_len.max(1) as usize) };
    let a_rate = freq_len > 1;

    let (carriers, mods) = ALGOS[st.algo as usize];
    let nc = (carriers.count_ones() as f32).max(1.0);
    let a_inc = if st.a > 0.0 { 1.0 / (st.a * sample_rate) } else { 1.0 };
    let d_step = (if st.d > 0.0 { 1.0 / (st.d * sample_rate) } else { 1.0 }) * (1.0 - st.s);
    let r_inc = if st.r > 0.0 { 1.0 / (st.r * sample_rate) } else { 1.0 };

    for i in 0..n {
        match st.stage {
            STAGE_ATTACK => { st.env += a_inc; if st.env >= 1.0 { st.env = 1.0; st.stage = STAGE_DECAY; } }
            STAGE_DECAY => { st.env -= d_step; if st.env <= st.s { st.env = st.s; st.stage = STAGE_SUSTAIN; } }
            STAGE_RELEASE => { st.env -= r_inc; if st.env <= 0.0 { st.env = 0.0; st.stage = STAGE_IDLE; } }
            _ => {}
        }
        if st.stage == STAGE_IDLE && st.env == 0.0 { out[i] = 0.0; continue; }

        let base = if a_rate { freq[i] } else { freq[0] };

        let mut k = 5i32;
        while k >= 0 {
            let ki = k as usize;
            let mut m = 0.0f32;
            let mask = mods[ki];
            for j in 0..6 { if (mask >> j) & 1 == 1 { m += st.op_out[j]; } }
            if ki == 5 && st.feedback > 0.0 { m += st.prev_fb * st.feedback; }
            let mut ph = st.phase[ki] + TWO_PI * (base * st.ratios[ki]) / sample_rate;
            if ph > TWO_PI { ph -= TWO_PI; } else if ph < 0.0 { ph += TWO_PI; }
            st.phase[ki] = ph;
            st.op_out[ki] = (ph + m * MOD_SCALE).sin() * st.levels[ki];
            k -= 1;
        }
        st.prev_fb = st.op_out[5];

        let mut sum = 0.0f32;
        for c in 0..6 { if (carriers >> c) & 1 == 1 { sum += st.op_out[c]; } }
        let mut o = (sum / nc) * st.env * st.vel;
        if !o.is_finite() { o = 0.0; }
        out[i] = o;
    }
}
