use std::alloc::{alloc, Layout};

#[no_mangle]
pub extern "C" fn alloc_f32(count: u32) -> u32 {
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { alloc(layout) as u32 }
}

// ── LCG PRNG (no_std compatible, no external deps) ───────────────────────────

struct Lcg(u64);

impl Lcg {
    fn next_f32(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let bits = 0x3F800000u32 | ((self.0 >> 41) as u32 & 0x7FFFFF);
        f32::from_bits(bits) * 2.0 - 3.0 // maps [1,2) → [-1,1)
    }
    // returns u32 bits for threshold comparisons
    fn next_u32(&mut self) -> u32 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.0 >> 32) as u32
    }
}

// ── Noise state (one instance per channel, held in JS) ───────────────────────

#[repr(C)]
pub struct NoiseState {
    // pink noise (Paul Kellett's Voss-McCartney 7-stage)
    pink: [f32; 7],
    // brown / infrared integration
    brown: f32,
    infrared: f32,
    // gray noise (1-pole LP)
    gray_last: f32,
    // green noise (bandpass via two LP stages)
    green_lp1: f32,
    green_lp2: f32,
    // crackle decay state
    crackle_val: f32,
    // prev white samples for blue/violet differentiation
    prev1: f32,
    prev2: f32,
    // LCG seed
    seed: u64,
}

#[no_mangle]
pub extern "C" fn noise_state_new(seed: u64) -> *mut NoiseState {
    let layout = Layout::new::<NoiseState>();
    let ptr = unsafe { alloc(layout) as *mut NoiseState };
    unsafe {
        (*ptr) = NoiseState {
            pink: [0.0; 7],
            brown: 0.0,
            infrared: 0.0,
            gray_last: 0.0,
            green_lp1: 0.0,
            green_lp2: 0.0,
            crackle_val: 0.0,
            prev1: 0.0,
            prev2: 0.0,
            seed: if seed == 0 { 0xDEADBEEFCAFEu64 } else { seed },
        };
    }
    ptr
}

// noise_type: 0=white 1=pink 2=brown 3=blue 4=violet 5=gray
//             6=velvet 7=green 8=infrared 9=binary 10=crackle
#[no_mangle]
pub extern "C" fn noise_fill(
    state_ptr: *mut NoiseState,
    out_ptr: *mut f32,
    frames: u32,
    noise_type: u32,
) {
    let st = unsafe { &mut *state_ptr };
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, frames as usize) };
    let mut rng = Lcg(st.seed);

    match noise_type {
        // white
        0 => {
            for s in out.iter_mut() {
                *s = rng.next_f32() * 0.35;
            }
        }
        // pink (Paul Kellett's Voss-McCartney 7-stage)
        1 => {
            let p = &mut st.pink;
            for s in out.iter_mut() {
                let r = rng.next_f32();
                p[0] = 0.99886 * p[0] + r * 0.0555179;
                let r = rng.next_f32();
                p[1] = 0.99332 * p[1] + r * 0.0750759;
                let r = rng.next_f32();
                p[2] = 0.96900 * p[2] + r * 0.1538520;
                let r = rng.next_f32();
                p[3] = 0.86650 * p[3] + r * 0.3104856;
                let r = rng.next_f32();
                p[4] = 0.55000 * p[4] + r * 0.5329522;
                let r = rng.next_f32();
                p[5] = -0.7616 * p[5] - r * 0.0168980;
                let white = rng.next_f32();
                let sum = p[0]+p[1]+p[2]+p[3]+p[4]+p[5]+p[6] + white * 0.5362;
                p[6] = rng.next_f32() * 0.115926;
                *s = sum * 0.11 * 0.35;
            }
        }
        // brown (red) — random walk / integration of white
        2 => {
            let mut b = st.brown;
            for s in out.iter_mut() {
                b += rng.next_f32() * 0.02;
                b = b.clamp(-1.0, 1.0);
                *s = b * 0.35;
            }
            st.brown = b;
        }
        // blue — first-order differentiation of white
        3 => {
            let mut p1 = st.prev1;
            for s in out.iter_mut() {
                let w = rng.next_f32();
                *s = (w - p1) * 0.35;
                p1 = w;
            }
            st.prev1 = p1;
        }
        // violet — second-order differentiation of white
        4 => {
            let mut p1 = st.prev1;
            let mut p2 = st.prev2;
            for s in out.iter_mut() {
                let w = rng.next_f32();
                *s = (w - 2.0 * p1 + p2) * 0.35;
                p2 = p1;
                p1 = w;
            }
            st.prev1 = p1;
            st.prev2 = p2;
        }
        // gray — psychoacoustic equal-loudness (1-pole approximation)
        5 => {
            let mut last = st.gray_last;
            for s in out.iter_mut() {
                let w = rng.next_f32();
                last = 0.97 * last + 0.03 * w;
                *s = last * 0.35;
            }
            st.gray_last = last;
        }
        // velvet — sparse random impulses (~1/20 density), useful for reverb
        6 => {
            for s in out.iter_mut() {
                let u = rng.next_u32();
                // ~1/20 chance of an impulse, sign from top bit
                if u & 0x1F == 0 {
                    *s = if u & 0x20 == 0 { 0.7 } else { -0.7 };
                } else {
                    *s = 0.0;
                }
            }
        }
        // green — bandpass (mid-range) via LP - LP²
        7 => {
            let mut lp1 = st.green_lp1;
            let mut lp2 = st.green_lp2;
            for s in out.iter_mut() {
                let w = rng.next_f32();
                lp1 = 0.9 * lp1 + 0.1 * w;   // LP at ~1.7 kHz @ 48k
                lp2 = 0.97 * lp2 + 0.03 * w;  // LP at ~250 Hz @ 48k
                *s = (lp1 - lp2) * 2.5 * 0.35; // bandpass = difference
            }
            st.green_lp1 = lp1;
            st.green_lp2 = lp2;
        }
        // infrared — double-integrated brown, very deep sub-bass rumble
        8 => {
            let mut b = st.brown;
            let mut ir = st.infrared;
            for s in out.iter_mut() {
                b += rng.next_f32() * 0.02;
                b = b.clamp(-1.0, 1.0);
                ir += b * 0.02;
                ir = ir.clamp(-1.0, 1.0);
                *s = ir * 0.35;
            }
            st.brown = b;
            st.infrared = ir;
        }
        // binary — 1-bit noise, each sample is exactly +1 or -1
        9 => {
            for s in out.iter_mut() {
                let u = rng.next_u32();
                *s = if u & 1 == 0 { 0.35 } else { -0.35 };
            }
        }
        // crackle — sparse vinyl-like clicks with exponential decay between them
        10 => {
            let mut val = st.crackle_val;
            for s in out.iter_mut() {
                let u = rng.next_u32();
                // ~1/800 chance of a new click
                if u % 800 == 0 {
                    val = if u & 0x40 == 0 { 0.9 } else { -0.9 };
                } else {
                    val *= 0.98; // decay
                }
                *s = val * 0.35;
            }
            st.crackle_val = val;
        }
        _ => {
            for s in out.iter_mut() { *s = 0.0; }
        }
    }

    st.seed = rng.0;
}
