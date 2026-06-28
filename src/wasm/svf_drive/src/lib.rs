// Zero-delay-feedback (TPT) state-variable filter with pre-filter drive and a
// saturating resonance nonlinearity (Zavalishin / Cytomic topology). Multimode
// (LP/HP/BP/Notch), 12 or 24 dB/oct, 2x oversampled. Rust/WASM port of
// public/SvfDriveProcessor.js.

use std::alloc::{alloc, Layout};

#[no_mangle]
pub extern "C" fn alloc_f32(count: u32) -> u32 {
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { alloc(layout) as u32 }
}

#[repr(C)]
pub struct Svf {
    s1: [f32; 2], // ic1eq per stage
    s2: [f32; 2], // ic2eq per stage
    prev_in: f32,
    mode: u32,  // 0=LP 1=HP 2=BP 3=Notch
    slope: u32, // 1 => 12 dB (one stage), 2 => 24 dB (two cascaded stages)
}

#[no_mangle]
pub extern "C" fn svf_new() -> *mut Svf {
    let layout = Layout::new::<Svf>();
    let p = unsafe { alloc(layout) as *mut Svf };
    unsafe { (*p) = Svf { s1: [0.0; 2], s2: [0.0; 2], prev_in: 0.0, mode: 0, slope: 1 }; }
    p
}

#[no_mangle]
pub extern "C" fn svf_set_mode(state: *mut Svf, mode: u32) {
    unsafe { (*state).mode = if mode > 3 { 3 } else { mode }; }
}

#[no_mangle]
pub extern "C" fn svf_set_slope(state: *mut Svf, slope: u32) {
    unsafe { (*state).slope = if slope == 2 { 2 } else { 1 }; }
}

impl Svf {
    #[inline]
    fn stage(&mut self, idx: usize, x: f32, g: f32, k: f32) -> f32 {
        let a1 = 1.0 / (1.0 + g * (g + k));
        let a2 = g * a1;
        let a3 = g * a2;
        let ic1 = self.s1[idx];
        let ic2 = self.s2[idx];
        let v3 = x - ic2;
        let v1 = a1 * ic1 + a2 * v3;
        let v2 = ic2 + a2 * ic1 + a3 * v3;
        self.s1[idx] = 2.0 * v1.tanh() - ic1; // nonlinearity → analog-ish "growl"
        self.s2[idx] = 2.0 * v2 - ic2;
        match self.mode {
            1 => x - k * v1 - v2, // highpass
            2 => v1,              // bandpass
            3 => x - k * v1,      // notch
            _ => v2,              // lowpass
        }
    }
}

/// `cutoff` is a-rate (`cutoff_len` is 1 or `frames`); `resonance`/`drive`/`mix` k-rate.
#[no_mangle]
pub extern "C" fn svf_process(
    state: *mut Svf,
    in_ptr: *const f32,
    has_in: u32,
    cutoff_ptr: *const f32,
    cutoff_len: u32,
    resonance: f32,
    drive: f32,
    mix: f32,
    frames: u32,
    sample_rate: f32,
    out_ptr: *mut f32,
) {
    let st = unsafe { &mut *state };
    let n = frames as usize;
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, n) };

    if has_in == 0 {
        for s in out.iter_mut() { *s = 0.0; }
        return;
    }

    let inp = unsafe { std::slice::from_raw_parts(in_ptr, n) };
    let cut = unsafe { std::slice::from_raw_parts(cutoff_ptr, cutoff_len.max(1) as usize) };
    let a_rate = cutoff_len > 1;

    const OS: usize = 2;
    let osf = OS as f32;
    let k = 2.0 - 1.98 * resonance; // 0..0.99 → damping 2..~0.04 (self-osc)
    let mut tanh_drive = drive.tanh();
    if tanh_drive == 0.0 { tanh_drive = 1.0; }
    let fc_max = (sample_rate * osf) * 0.45;

    for i in 0..n {
        let cutoff = if a_rate { cut[i] } else { cut[0] };
        let fc = if cutoff < 20.0 { 20.0 } else if cutoff > fc_max { fc_max } else { cutoff };
        let g = (std::f32::consts::PI * fc / (sample_rate * osf)).tan();
        let driven = (drive * inp[i]).tanh() / tanh_drive;

        let mut acc = 0.0f32;
        for os_i in 0..OS {
            let frac = (os_i + 1) as f32 / osf;
            let xs = st.prev_in + (driven - st.prev_in) * frac;
            let mut y = st.stage(0, xs, g, k);
            if st.slope == 2 { y = st.stage(1, y, g, k); }
            acc += y;
        }
        st.prev_in = driven;
        let wet = acc / osf;

        let mut o = mix * wet + (1.0 - mix) * inp[i];
        if !o.is_finite() {
            o = 0.0;
            st.s1 = [0.0; 2]; st.s2 = [0.0; 2]; st.prev_in = 0.0;
        }
        out[i] = o;
    }
}
