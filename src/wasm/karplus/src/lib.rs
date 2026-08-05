// Karplus–Strong plucked string. A noise burst excites a feedback delay line
// (length = sampleRate / frequency) whose loop has a one-pole low-pass (tone)
// and sub-unity feedback (decay). Rust/WASM port of public/KarplusProcessor.js.
//
// Extra character controls, all applied OUTSIDE the resonant feedback loop
// (so they can't destabilize the string):
//  - attack:  fades the injected excitation in over a few ms instead of
//             slamming it in on sample 0 — the raw burst is what made short
//             (high-pitched) plucks sound like a harsh, clicky snap.
//  - scatter: a 2-stage Schroeder allpass diffuser on the output tap, mixed
//             in wet/dry. Fixed, always-stable allpass coefficients; only the
//             mix amount is user-controlled. Gives the pluck a sense of a
//             small resonant enclosure (guitar body / room) scattering its
//             transient instead of a bare dry string.
//  - muffle:  a one-pole lowpass on the output tap (separate from the
//             in-loop `tone` filter) for hand/palm-mute style damping/warmth.

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

/// One-multiply Schroeder allpass diffuser (H(z) = (-g + z^-D) / (1 - g z^-D)).
/// `g` is a fixed, always-stable coefficient — only used as a fixed-length
/// scattering delay, never modulated, so it can't ring or blow up.
struct Allpass {
    buf: *mut f32,
    len: u32,
    w: u32,
}
impl Allpass {
    fn new(len: u32) -> Self {
        let layout = Layout::array::<f32>(len.max(1) as usize).unwrap();
        let buf = unsafe {
            let p = alloc(layout) as *mut f32;
            std::ptr::write_bytes(p, 0, len.max(1) as usize);
            p
        };
        Allpass { buf, len: len.max(1), w: 0 }
    }
    #[inline]
    fn process(&mut self, x: f32, g: f32) -> f32 {
        let buf = unsafe { std::slice::from_raw_parts_mut(self.buf, self.len as usize) };
        let idx = self.w as usize;
        let vd = buf[idx];
        let v = x + g * vd;
        buf[idx] = v;
        self.w += 1;
        if self.w >= self.len { self.w = 0; }
        -g * v + vd
    }
}

const AP_GAIN: f32 = 0.55;

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
    // attack envelope (ramps the excitation in on pluck)
    att_env: f32,
    att_step: f32,
    // scatter: small body/room diffuser on the output tap
    ap1: Allpass,
    ap2: Allpass,
    // muffle: post one-pole lowpass on the output tap
    muf_lp: f32,
}

#[no_mangle]
pub extern "C" fn karplus_new(sample_rate: f32) -> *mut Karplus {
    let max_len = (sample_rate / 10.0).ceil() as u32 + 4; // lowest pitch ≈ 10 Hz
    let buf_layout = Layout::array::<f32>(max_len as usize).unwrap();
    let buf = unsafe {
        let p = alloc(buf_layout) as *mut f32;
        std::ptr::write_bytes(p, 0, max_len as usize);
        p
    };
    // Mutually-prime-ish, short (few-ms) delay lengths so the diffuser reads
    // as a small resonant cavity rather than a discrete echo.
    let ap1_len = ((sample_rate * 0.0045).round() as u32).max(1);
    let ap2_len = ((sample_rate * 0.0117).round() as u32).max(1);
    let st_layout = Layout::new::<Karplus>();
    let ptr = unsafe { alloc(st_layout) as *mut Karplus };
    unsafe {
        (*ptr) = Karplus {
            buf, buf_len: max_len, w: 0, lp: 0.0, excite_rem: 0, excite_vel: 0.0,
            pending: 0.0, seed: 0x2545F4914F6CDD1D,
            att_env: 1.0, att_step: 1.0,
            ap1: Allpass::new(ap1_len), ap2: Allpass::new(ap2_len),
            muf_lp: 0.0,
        };
    }
    ptr
}

#[no_mangle]
pub extern "C" fn karplus_pluck(state: *mut Karplus, velocity: f32) {
    unsafe { (*state).pending = if velocity > 0.0 { velocity } else { 1.0 }; }
}

/// `frequency` is a-rate (`freq_len` is 1 or `frames`). `decay`/`tone`/`attack`/
/// `scatter`/`muffle` are k-rate.
#[no_mangle]
pub extern "C" fn karplus_process(
    state: *mut Karplus,
    freq_ptr: *const f32,
    freq_len: u32,
    decay: f32,
    tone: f32,
    attack: f32,
    scatter: f32,
    muffle: f32,
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
    let bright = 0.02 + 0.97 * tone; // wider brightness range (darker..brighter)
    let att = attack.clamp(0.0, 1.0);
    let scat = scatter.clamp(0.0, 1.0);
    let muf_a = 1.0 - 0.995 * muffle.clamp(0.0, 1.0); // 1=bypass .. 0.005=very dark
    let mut rng = Lcg(st.seed);

    for i in 0..n {
        let fraw = if a_rate { freq[i] } else { freq[0] };
        let f = if fraw < 10.0 { 10.0 } else if fraw > 12000.0 { 12000.0 } else { fraw };
        let mut l = sample_rate / f;
        if l > (max_len - 2) as f32 { l = (max_len - 2) as f32; }
        if l < 2.0 { l = 2.0; }

        if st.pending > 0.0 {
            st.excite_rem = l.round() as u32;
            st.excite_vel = st.pending;
            st.pending = 0.0;
            st.att_env = 0.0;
            // 1..40 ms fade-in, independent of pitch: a hard 0 keeps the
            // original instant-burst snap, higher values soften the pluck.
            let attack_ms = 1.0 + att * 39.0;
            let attack_samples = ((attack_ms * 0.001 * sample_rate).round() as u32).max(1);
            st.att_step = 1.0 / attack_samples as f32;
        }

        // fractional read at (w - L)
        let li = l.floor() as i64;
        let frac = l - li as f32;
        let mut i0 = st.w as i64 - li; while i0 < 0 { i0 += max_len as i64; }
        let i0 = i0 as usize;
        let i1 = if i0 == 0 { max_len - 1 } else { i0 - 1 };
        let s = buf[i0] + frac * (buf[i1] - buf[i0]);

        st.lp += bright * (s - st.lp);

        let mut ex = 0.0f32;
        if st.excite_rem > 0 {
            if st.att_env < 1.0 { st.att_env = (st.att_env + st.att_step).min(1.0); }
            ex += rng.next_f32() * st.excite_vel * st.att_env;
            st.excite_rem -= 1;
        }
        if let Some(inp) = in_s { ex += inp[i]; }

        let mut val = ex + fb_gain * st.lp;
        if !val.is_finite() { val = 0.0; st.lp = 0.0; }
        let wi = st.w as usize;
        buf[wi] = val;
        st.w += 1; if st.w >= st.buf_len { st.w = 0; }

        // Post-tap coloring only — never fed back into the resonant loop.
        let diffused = st.ap2.process(st.ap1.process(s, AP_GAIN), AP_GAIN);
        let scattered = s + scat * 0.6 * (diffused - s);
        st.muf_lp += muf_a * (scattered - st.muf_lp);
        let mut o = st.muf_lp;
        if !o.is_finite() { o = 0.0; st.muf_lp = 0.0; }
        out[i] = o;
    }
    st.seed = rng.0;
}
