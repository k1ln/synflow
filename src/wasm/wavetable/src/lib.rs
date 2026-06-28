// Wavetable oscillator with a phase-distortion (Casio-CZ) mode, unison and a
// gated amp envelope. A bank of single-cycle frames is generated additively
// here (no proprietary data). Rust/WASM port of public/WavetableProcessor.js.

use std::alloc::{alloc, Layout};

#[no_mangle]
pub extern "C" fn alloc_f32(count: u32) -> u32 {
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { alloc(layout) as u32 }
}

const NUM_FRAMES: usize = 8;
const TABLE: usize = 2048;
const MAX_UNISON: usize = 7;

struct Lcg(u64);
impl Lcg {
    fn next01(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let bits = 0x3F800000u32 | ((self.0 >> 41) as u32 & 0x7FFFFF);
        f32::from_bits(bits) - 1.0 // [1,2) → [0,1)
    }
}

const STAGE_IDLE: u32 = 0;
const STAGE_ATTACK: u32 = 1;
const STAGE_DECAY: u32 = 2;
const STAGE_SUSTAIN: u32 = 3;
const STAGE_RELEASE: u32 = 4;

#[repr(C)]
pub struct Wt {
    table: *mut f32, // NUM_FRAMES * TABLE
    mode: u32,       // 0 = wavetable, 1 = phase distortion
    unison: u32,
    detune: f32,     // cents
    phase: [f32; MAX_UNISON],
    a: f32, d: f32, s: f32, r: f32,
    env: f32,
    stage: u32,
    vel: f32,
}

// Harmonic amplitude for frame `f`, harmonic `h` (1..=40). Matches the JS specs.
fn frame_spec(f: usize, h: u32) -> f32 {
    let hf = h as f32;
    match f {
        0 => if h == 1 { 1.0 } else { 0.0 },
        1 => if h == 1 { 1.0 } else if h == 3 { 0.15 } else { 0.0 },
        2 => if h % 2 == 1 { (1.0 / (hf * hf)) * (if ((h - 1) / 2) % 2 == 0 { 1.0 } else { -1.0 }) } else { 0.0 },
        3 => if h <= 12 { 1.0 / hf } else { 0.0 },
        4 => if h <= 32 { 1.0 / hf } else { 0.0 },
        5 => if h % 2 == 1 && h <= 24 { 1.0 / hf } else { 0.0 },
        6 => if h % 2 == 1 && h <= 16 { (1.0 / hf) * (1.0 + 0.5 * hf.cos()) } else { 0.0 },
        7 => if h <= 28 { (1.0 / hf) * (0.4 + 0.9 * (-(((hf - 8.0) / 6.0).powi(2))).exp()) } else { 0.0 },
        _ => 0.0,
    }
}

fn build_table(buf: &mut [f32]) {
    for f in 0..NUM_FRAMES {
        let off = f * TABLE;
        let mut peak = 1e-9f32;
        for i in 0..TABLE {
            let x = i as f32 / TABLE as f32;
            let mut s = 0.0f32;
            for h in 1..=40u32 {
                let a = frame_spec(f, h);
                if a != 0.0 { s += a * (2.0 * std::f32::consts::PI * h as f32 * x).sin(); }
            }
            buf[off + i] = s;
            let m = s.abs();
            if m > peak { peak = m; }
        }
        let g = 1.0 / peak;
        for i in 0..TABLE { buf[off + i] *= g; }
    }
}

fn warp_phase(p: f32, warp: f32) -> f32 {
    if warp <= 0.0001 { return p; }
    let m = 0.5 + 0.49 * warp;
    if p < m { (0.5 / m) * p } else { 0.5 + 0.5 * (p - m) / (1.0 - m) }
}

#[no_mangle]
pub extern "C" fn wavetable_new() -> *mut Wt {
    let buf_layout = Layout::array::<f32>(NUM_FRAMES * TABLE).unwrap();
    let table = unsafe { alloc(buf_layout) as *mut f32 };
    let tbl = unsafe { std::slice::from_raw_parts_mut(table, NUM_FRAMES * TABLE) };
    build_table(tbl);

    let mut rng = Lcg(0x9E3779B97F4A7C15);
    let mut phase = [0.0f32; MAX_UNISON];
    for v in 0..MAX_UNISON { phase[v] = rng.next01(); }

    let st_layout = Layout::new::<Wt>();
    let p = unsafe { alloc(st_layout) as *mut Wt };
    unsafe {
        (*p) = Wt { table, mode: 0, unison: 1, detune: 12.0, phase, a: 0.01, d: 0.3, s: 0.8, r: 0.3, env: 0.0, stage: STAGE_IDLE, vel: 1.0 };
    }
    p
}

#[no_mangle]
pub extern "C" fn wavetable_set_config(state: *mut Wt, mode: u32, unison: u32, detune: f32, a: f32, d: f32, s: f32, r: f32) {
    let st = unsafe { &mut *state };
    st.mode = mode;
    st.unison = unison.clamp(1, MAX_UNISON as u32);
    st.detune = detune;
    st.a = a; st.d = d; st.s = s; st.r = r;
}

#[no_mangle]
pub extern "C" fn wavetable_gate_on(state: *mut Wt, velocity: f32) {
    let st = unsafe { &mut *state };
    st.stage = STAGE_ATTACK;
    st.vel = if velocity > 0.0 { velocity } else { 1.0 };
}

#[no_mangle]
pub extern "C" fn wavetable_gate_off(state: *mut Wt) {
    unsafe { (*state).stage = STAGE_RELEASE; }
}

fn read_wt(tbl: &[f32], p: f32, pos: f32) -> f32 {
    let fpos = pos * (NUM_FRAMES - 1) as f32;
    let mut f0 = fpos as usize;
    if f0 > NUM_FRAMES - 1 { f0 = NUM_FRAMES - 1; }
    let f1 = if f0 < NUM_FRAMES - 1 { f0 + 1 } else { f0 };
    let fr = fpos - f0 as f32;
    let x = p * TABLE as f32;
    let mut i0 = x as usize;
    if i0 >= TABLE { i0 -= TABLE; }
    let i1 = if i0 + 1 >= TABLE { 0 } else { i0 + 1 };
    let xr = x - (x as usize) as f32;
    let a0 = tbl[f0 * TABLE + i0]; let a1 = tbl[f0 * TABLE + i1];
    let b0 = tbl[f1 * TABLE + i0]; let b1 = tbl[f1 * TABLE + i1];
    let sa = a0 + (a1 - a0) * xr;
    let sb = b0 + (b1 - b0) * xr;
    sa + (sb - sa) * fr
}

/// `frequency` is a-rate (`freq_len` is 1 or `frames`). `position`/`warp` k-rate.
#[no_mangle]
pub extern "C" fn wavetable_process(
    state: *mut Wt,
    freq_ptr: *const f32,
    freq_len: u32,
    position: f32,
    warp: f32,
    frames: u32,
    sample_rate: f32,
    out_ptr: *mut f32,
) {
    let st = unsafe { &mut *state };
    let n = frames as usize;
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, n) };
    let freq = unsafe { std::slice::from_raw_parts(freq_ptr, freq_len.max(1) as usize) };
    let a_rate = freq_len > 1;
    let tbl = unsafe { std::slice::from_raw_parts(st.table, NUM_FRAMES * TABLE) };

    let u = st.unison as usize;
    let norm = 1.0 / (u as f32).sqrt();
    let a_inc = if st.a > 0.0 { 1.0 / (st.a * sample_rate) } else { 1.0 };
    let d_step = (if st.d > 0.0 { 1.0 / (st.d * sample_rate) } else { 1.0 }) * (1.0 - st.s);
    let r_inc = if st.r > 0.0 { 1.0 / (st.r * sample_rate) } else { 1.0 };

    let mut ratio = [1.0f32; MAX_UNISON];
    for v in 0..u {
        let spread = if u > 1 { (v as f32 - (u as f32 - 1.0) / 2.0) / ((u as f32 - 1.0) / 2.0) } else { 0.0 };
        ratio[v] = 2.0f32.powf((spread * st.detune) / 1200.0);
    }

    for i in 0..n {
        match st.stage {
            STAGE_ATTACK => { st.env += a_inc; if st.env >= 1.0 { st.env = 1.0; st.stage = STAGE_DECAY; } }
            STAGE_DECAY => { st.env -= d_step; if st.env <= st.s { st.env = st.s; st.stage = STAGE_SUSTAIN; } }
            STAGE_RELEASE => { st.env -= r_inc; if st.env <= 0.0 { st.env = 0.0; st.stage = STAGE_IDLE; } }
            _ => {}
        }
        if st.stage == STAGE_IDLE && st.env == 0.0 { out[i] = 0.0; continue; }

        let base = if a_rate { freq[i] } else { freq[0] };

        let mut acc = 0.0f32;
        for v in 0..u {
            let ph = st.phase[v];
            let pw = warp_phase(ph, warp);
            acc += if st.mode == 1 { (2.0 * std::f32::consts::PI * pw).sin() } else { read_wt(tbl, pw, position) };
            let mut np = ph + (base * ratio[v]) / sample_rate;
            np -= np.floor();
            st.phase[v] = np;
        }
        let mut s = acc * norm * st.env * st.vel;
        if !s.is_finite() { s = 0.0; }
        out[i] = s;
    }
}
