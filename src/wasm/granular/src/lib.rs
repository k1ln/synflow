// Granular "cloud" effect: records the audio input into a ring buffer and
// sprays overlapping Hann-windowed grains from a position in its history.
// Rust/WASM port of public/GranularProcessor.js.

use std::alloc::{alloc, Layout};

#[no_mangle]
pub extern "C" fn alloc_f32(count: u32) -> u32 {
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { alloc(layout) as u32 }
}

const MAX_GRAINS: usize = 64;
const PI: f32 = std::f32::consts::PI;

struct Lcg(u64);
impl Lcg {
    fn next_bi(&mut self) -> f32 {
        // uniform in [-1, 1)
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let bits = 0x3F800000u32 | ((self.0 >> 41) as u32 & 0x7FFFFF);
        f32::from_bits(bits) * 2.0 - 3.0
    }
}

#[repr(C)]
pub struct Granular {
    buf: *mut f32,
    bl: u32,
    w: u32,
    filled: u32,
    freeze: u32,
    active: [u8; MAX_GRAINS],
    pos: [f32; MAX_GRAINS],
    age: [f32; MAX_GRAINS],
    len: [f32; MAX_GRAINS],
    rate: [f32; MAX_GRAINS],
    gl: [f32; MAX_GRAINS],
    gr: [f32; MAX_GRAINS],
    timer: f32,
    seed: u64,
}

#[no_mangle]
pub extern "C" fn granular_new(sample_rate: f32) -> *mut Granular {
    let bl = (sample_rate * 2.0).floor() as u32; // 2 s history
    let buf_layout = Layout::array::<f32>(bl as usize).unwrap();
    let buf = unsafe {
        let p = alloc(buf_layout) as *mut f32;
        std::ptr::write_bytes(p, 0, bl as usize);
        p
    };
    let st_layout = Layout::new::<Granular>();
    let ptr = unsafe { alloc(st_layout) as *mut Granular };
    unsafe {
        (*ptr) = Granular {
            buf, bl, w: 0, filled: 0, freeze: 0,
            active: [0; MAX_GRAINS], pos: [0.0; MAX_GRAINS], age: [0.0; MAX_GRAINS],
            len: [0.0; MAX_GRAINS], rate: [0.0; MAX_GRAINS], gl: [0.0; MAX_GRAINS], gr: [0.0; MAX_GRAINS],
            timer: 0.0, seed: 0x243F6A8885A308D3,
        };
    }
    ptr
}

#[no_mangle]
pub extern "C" fn granular_set_freeze(state: *mut Granular, freeze: u32) {
    unsafe { (*state).freeze = if freeze != 0 { 1 } else { 0 }; }
}

impl Granular {
    fn spawn(&mut self, rng: &mut Lcg, size: f32, position: f32, spray: f32, pitch: f32, sample_rate: f32) {
        let mut idx = usize::MAX;
        for i in 0..MAX_GRAINS { if self.active[i] == 0 { idx = i; break; } }
        if idx == usize::MAX { return; }
        let bl = self.bl as f32;
        let len_s = (size / 1000.0 * sample_rate).max(8.0);
        let max_delay = bl - len_s - 4.0;
        let mut delay = position * max_delay + rng.next_bi() * spray * max_delay * 0.5;
        if delay < 0.0 { delay = 0.0; } else if delay > max_delay { delay = max_delay; }
        let mut start = self.w as f32 - delay;
        while start < 0.0 { start += bl; }
        self.active[idx] = 1; self.pos[idx] = start; self.age[idx] = 0.0; self.len[idx] = len_s;
        let detune = 1.0 + rng.next_bi() * spray * 0.06;
        self.rate[idx] = pitch * detune;
        let pan = rng.next_bi() * spray;
        let a = (pan + 1.0) * 0.25 * PI;
        self.gl[idx] = a.cos(); self.gr[idx] = a.sin();
    }
}

/// k-rate params: density, size(ms), position, spray, pitch, mix.
#[no_mangle]
pub extern "C" fn granular_process(
    state: *mut Granular,
    in_ptr: *const f32,
    has_in: u32,
    out_l_ptr: *mut f32,
    out_r_ptr: *mut f32,
    frames: u32,
    density: f32,
    size: f32,
    position: f32,
    spray: f32,
    pitch: f32,
    mix: f32,
    sample_rate: f32,
) {
    let st = unsafe { &mut *state };
    let n = frames as usize;
    let out_l = unsafe { std::slice::from_raw_parts_mut(out_l_ptr, n) };
    let out_r = unsafe { std::slice::from_raw_parts_mut(out_r_ptr, n) };
    let bl = st.bl as usize;
    let buf = unsafe { std::slice::from_raw_parts_mut(st.buf, bl) };
    let in_s = if has_in != 0 { Some(unsafe { std::slice::from_raw_parts(in_ptr, n) }) } else { None };

    let spawn_interval = sample_rate / density.max(1.0);
    let overlap = ((density * size) / 1000.0).sqrt().max(1.0);
    let mut rng = Lcg(st.seed);

    for i in 0..n {
        let dry = in_s.map(|s| s[i]).unwrap_or(0.0);
        if st.freeze == 0 {
            let wi = st.w as usize;
            buf[wi] = dry;
            st.w += 1; if st.w >= st.bl { st.w = 0; }
            if st.filled < st.bl { st.filled += 1; }
        }

        st.timer -= 1.0;
        if st.timer <= 0.0 {
            st.spawn(&mut rng, size, position, spray, pitch, sample_rate);
            st.timer += spawn_interval;
            if st.timer < 1.0 { st.timer = 1.0; }
        }

        let mut l = 0.0f32; let mut r = 0.0f32;
        for g in 0..MAX_GRAINS {
            if st.active[g] == 0 { continue; }
            let len = st.len[g];
            let age = st.age[g];
            let win = 0.5 - 0.5 * (2.0 * PI * age / len).cos();
            let p = st.pos[g];
            let i0 = p as usize;
            let i1 = if i0 + 1 >= bl { 0 } else { i0 + 1 };
            let fr = p - i0 as f32;
            let s = (buf[i0] + (buf[i1] - buf[i0]) * fr) * win;
            l += s * st.gl[g]; r += s * st.gr[g];
            let mut np = p + st.rate[g];
            if np >= bl as f32 { np -= bl as f32; } else if np < 0.0 { np += bl as f32; }
            st.pos[g] = np;
            let na = age + 1.0; st.age[g] = na;
            if na >= len { st.active[g] = 0; }
        }
        l /= overlap; r /= overlap;

        let mut o_l = mix * l + (1.0 - mix) * dry;
        let mut o_r = mix * r + (1.0 - mix) * dry;
        if !o_l.is_finite() { o_l = 0.0; }
        if !o_r.is_finite() { o_r = 0.0; }
        out_l[i] = o_l; out_r[i] = o_r;
    }
    st.seed = rng.0;
}
