// Audio-rate ADSR envelope generator. Unlike the (scheduler-based) ADSR node,
// this emits an actual control *signal* — so it can drive ANY param handle,
// including worklet AudioParams (the ladder/SVF cutoff) that the scheduler can't
// reach. Output per sample = bias + amount * env, where env is a 0..1 ADSR shape
// gated by note-on/off. Connect its output to a filter's cutoff for a real
// filter envelope, or to a pitch/gain for env-controlled modulation.

use std::alloc::{alloc, Layout};

#[no_mangle]
pub extern "C" fn alloc_f32(count: u32) -> u32 {
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { alloc(layout) as u32 }
}

const STAGE_IDLE: u32 = 0;
const STAGE_ATTACK: u32 = 1;
const STAGE_DECAY: u32 = 2;
const STAGE_SUSTAIN: u32 = 3;
const STAGE_RELEASE: u32 = 4;

#[repr(C)]
pub struct Env {
    env: f32,
    stage: u32,
    rel_from: f32, // env level when release began (so release time is consistent)
}

#[no_mangle]
pub extern "C" fn env_new() -> *mut Env {
    let layout = Layout::new::<Env>();
    let p = unsafe { alloc(layout) as *mut Env };
    unsafe { (*p) = Env { env: 0.0, stage: STAGE_IDLE, rel_from: 0.0 }; }
    p
}

#[no_mangle]
pub extern "C" fn env_gate_on(state: *mut Env) {
    unsafe { (*state).stage = STAGE_ATTACK; }
}

#[no_mangle]
pub extern "C" fn env_gate_off(state: *mut Env) {
    let st = unsafe { &mut *state };
    st.rel_from = st.env;
    st.stage = STAGE_RELEASE;
}

/// a/d/s/r are seconds/level; `amount` scales the 0..1 shape, `bias` is added.
#[no_mangle]
pub extern "C" fn env_process(
    state: *mut Env,
    frames: u32,
    sample_rate: f32,
    out_ptr: *mut f32,
    a: f32, d: f32, s: f32, r: f32,
    amount: f32, bias: f32,
) {
    let st = unsafe { &mut *state };
    let n = frames as usize;
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, n) };

    let a_inc = if a > 0.0 { 1.0 / (a * sample_rate) } else { 1.0 };
    let d_step = (if d > 0.0 { 1.0 / (d * sample_rate) } else { 1.0 }) * (1.0 - s);
    // release ramps from the level at note-off to 0 over r seconds
    let r_step = if r > 0.0 { st.rel_from.max(1e-6) / (r * sample_rate) } else { 1.0 };

    for i in 0..n {
        match st.stage {
            STAGE_ATTACK => { st.env += a_inc; if st.env >= 1.0 { st.env = 1.0; st.stage = STAGE_DECAY; } }
            STAGE_DECAY => { st.env -= d_step; if st.env <= s { st.env = s; st.stage = STAGE_SUSTAIN; } }
            STAGE_RELEASE => { st.env -= r_step; if st.env <= 0.0 { st.env = 0.0; st.stage = STAGE_IDLE; } }
            _ => {}
        }
        out[i] = bias + amount * st.env;
    }
}
