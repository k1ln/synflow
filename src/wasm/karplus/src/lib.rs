// Karplus–Strong plucked string. A noise burst excites a feedback delay line
// (length = sampleRate / frequency) whose loop has a one-pole low-pass (tone)
// and sub-unity feedback (decay). Rust/WASM port of public/KarplusProcessor.js.

use std::alloc::{alloc, Layout};

#[no_mangle]
pub extern "C" fn alloc_f32(count: u32) -> u32 {
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { alloc(layout) as u32 }
}

struct Lcg(u64);
impl Lcg {
    fn next_f32(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let bits = 0x3F800000u32 | ((self.0 >> 41) as u32 & 0x7FFFFF);
        f32::from_bits(bits) * 2.0 - 3.0 // [1,2) → [-1,1)
    }
}

#[repr(C)]
pub struct Karplus {
    buf: *mut f32,
    buf_len: u32,
    w: u32,
    lp: f32,
    excite_rem: u32,
    excite_vel: f32,
    pending: f32, // >0 => a pluck (velocity) is pending; 0 => none
    seed: u64,
}

#[no_mangle]
pub extern "C" fn karplus_new(sample_rate: f32) -> *mut Karplus {
    let max_len = (sample_rate / 20.0).ceil() as u32 + 4; // lowest pitch ≈ 20 Hz
    let buf_layout = Layout::array::<f32>(max_len as usize).unwrap();
    let buf = unsafe {
        let p = alloc(buf_layout) as *mut f32;
        std::ptr::write_bytes(p, 0, max_len as usize);
        p
    };
    let st_layout = Layout::new::<Karplus>();
    let ptr = unsafe { alloc(st_layout) as *mut Karplus };
    unsafe {
        (*ptr) = Karplus { buf, buf_len: max_len, w: 0, lp: 0.0, excite_rem: 0, excite_vel: 0.0, pending: 0.0, seed: 0x2545F4914F6CDD1D };
    }
    ptr
}

#[no_mangle]
pub extern "C" fn karplus_pluck(state: *mut Karplus, velocity: f32) {
    unsafe { (*state).pending = if velocity > 0.0 { velocity } else { 1.0 }; }
}

/// `frequency` is a-rate (`freq_len` is 1 or `frames`). `decay`/`tone` are k-rate.
/// `in_ptr`/`has_in` is an optional external exciter.
#[no_mangle]
pub extern "C" fn karplus_process(
    state: *mut Karplus,
    freq_ptr: *const f32,
    freq_len: u32,
    decay: f32,
    tone: f32,
    in_ptr: *const f32,
    has_in: u32,
    frames: u32,
    sample_rate: f32,
    out_ptr: *mut f32,
) {
    let st = unsafe { &mut *state };
    let n = frames as usize;
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, n) };
    let freq = unsafe { std::slice::from_raw_parts(freq_ptr, freq_len.max(1) as usize) };
    let a_rate = freq_len > 1;
    let max_len = st.buf_len as usize;
    let buf = unsafe { std::slice::from_raw_parts_mut(st.buf, max_len) };
    let in_s = if has_in != 0 { Some(unsafe { std::slice::from_raw_parts(in_ptr, n) }) } else { None };

    let fb_gain = 0.90 + 0.0995 * decay;
    let bright = 0.05 + 0.93 * tone;
    let mut rng = Lcg(st.seed);

    for i in 0..n {
        let fraw = if a_rate { freq[i] } else { freq[0] };
        let f = if fraw < 20.0 { 20.0 } else if fraw > 8000.0 { 8000.0 } else { fraw };
        let mut l = sample_rate / f;
        if l > (max_len - 2) as f32 { l = (max_len - 2) as f32; }
        if l < 2.0 { l = 2.0; }

        if st.pending > 0.0 { st.excite_rem = l.round() as u32; st.excite_vel = st.pending; st.pending = 0.0; }

        // fractional read at (w - L)
        let li = l.floor() as i64;
        let frac = l - li as f32;
        let mut i0 = st.w as i64 - li; while i0 < 0 { i0 += max_len as i64; }
        let i0 = i0 as usize;
        let i1 = if i0 == 0 { max_len - 1 } else { i0 - 1 };
        let s = buf[i0] + frac * (buf[i1] - buf[i0]);

        st.lp += bright * (s - st.lp);

        let mut ex = 0.0f32;
        if st.excite_rem > 0 { ex += rng.next_f32() * st.excite_vel; st.excite_rem -= 1; }
        if let Some(inp) = in_s { ex += inp[i]; }

        let mut val = ex + fb_gain * st.lp;
        if !val.is_finite() { val = 0.0; st.lp = 0.0; }
        let wi = st.w as usize;
        buf[wi] = val;
        st.w += 1; if st.w >= st.buf_len { st.w = 0; }

        out[i] = s;
    }
    st.seed = rng.0;
}
