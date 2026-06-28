// Moog-style transistor-ladder low-pass (Stilson/Smith "improved Moog", Paul
// Kellett refinement) with tanh input drive, 2x oversampling and a band-limited
// soft-clip on the feedback stage. Self-oscillates near max resonance; saturates
// under drive. Rust/WASM port of public/LadderProcessor.js for performance.

use std::alloc::{alloc, Layout};

#[no_mangle]
pub extern "C" fn alloc_f32(count: u32) -> u32 {
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { alloc(layout) as u32 }
}

#[repr(C)]
pub struct Ladder {
    y1: f32, y2: f32, y3: f32, y4: f32,
    oldx: f32, oldy1: f32, oldy2: f32, oldy3: f32,
    prev_in: f32,
    poles: u32, // 4 => 24 dB, 2 => 12 dB
}

impl Ladder {
    fn reset(&mut self) {
        self.y1 = 0.0; self.y2 = 0.0; self.y3 = 0.0; self.y4 = 0.0;
        self.oldx = 0.0; self.oldy1 = 0.0; self.oldy2 = 0.0; self.oldy3 = 0.0;
        self.prev_in = 0.0;
    }
}

#[no_mangle]
pub extern "C" fn ladder_new() -> *mut Ladder {
    let layout = Layout::new::<Ladder>();
    let p = unsafe { alloc(layout) as *mut Ladder };
    unsafe {
        (*p) = Ladder {
            y1: 0.0, y2: 0.0, y3: 0.0, y4: 0.0,
            oldx: 0.0, oldy1: 0.0, oldy2: 0.0, oldy3: 0.0,
            prev_in: 0.0, poles: 4,
        };
    }
    p
}

#[no_mangle]
pub extern "C" fn ladder_set_poles(state: *mut Ladder, poles: u32) {
    unsafe { (*state).poles = if poles == 2 { 2 } else { 4 }; }
}

/// Process one channel of `frames` samples (mono; JS mirrors to all channels).
/// `cutoff` is a-rate (`cutoff_len` is 1 or `frames`); `resonance`/`drive` are k-rate.
#[no_mangle]
pub extern "C" fn ladder_process(
    state: *mut Ladder,
    in_ptr: *const f32,
    has_in: u32,
    cutoff_ptr: *const f32,
    cutoff_len: u32,
    resonance: f32,
    drive: f32,
    frames: u32,
    sample_rate: f32,
    out_ptr: *mut f32,
) {
    let st = unsafe { &mut *state };
    let n = frames as usize;
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, n) };

    if has_in == 0 {
        for s in out.iter_mut() { *s = 0.0; }
        st.reset();
        return;
    }

    let inp = unsafe { std::slice::from_raw_parts(in_ptr, n) };
    let cut = unsafe { std::slice::from_raw_parts(cutoff_ptr, cutoff_len.max(1) as usize) };
    let a_rate = cutoff_len > 1;

    const OS: usize = 2;
    let sr = sample_rate * OS as f32;
    let fc_max = sr * 0.45;
    let mut td = drive.tanh();
    if td.abs() < 1e-9 { td = 1.0; }

    for i in 0..n {
        let cutoff = if a_rate { cut[i] } else { cut[0] };
        let fc = if cutoff < 20.0 { 20.0 } else if cutoff > fc_max { fc_max } else { cutoff };
        let f = 2.0 * fc / sr;
        let p = f * (1.8 - 0.8 * f);
        let k = 2.0 * p - 1.0;
        let t = (1.0 - p) * 1.386249;
        let t2 = 12.0 + t * t;
        let r = resonance * (t2 + 6.0 * t) / (t2 - 6.0 * t);

        let driven = (drive * inp[i]).tanh() / td;

        let mut acc = 0.0f32;
        for os_i in 0..OS {
            let frac = (os_i + 1) as f32 / OS as f32;
            let xs = st.prev_in + (driven - st.prev_in) * frac;
            let x = xs - r * st.y4;
            st.y1 = x * p + st.oldx * p - k * st.y1;
            st.y2 = st.y1 * p + st.oldy1 * p - k * st.y2;
            st.y3 = st.y2 * p + st.oldy2 * p - k * st.y3;
            st.y4 = st.y3 * p + st.oldy3 * p - k * st.y4;
            st.y4 -= (st.y4 * st.y4 * st.y4) / 6.0;
            st.oldx = x; st.oldy1 = st.y1; st.oldy2 = st.y2; st.oldy3 = st.y3;
            acc += if st.poles == 2 { st.y2 } else { st.y4 };
        }
        st.prev_in = driven;
        let mut o = acc / OS as f32;
        if !o.is_finite() { o = 0.0; st.reset(); }
        out[i] = o;
    }
}
