// Brass — a lip-reed brass instrument waveguide, ported from STK's `Brass`
// class (Perry R. Cook / Gary P. Scavone, CCRMA — see Brass.h/Brass.cpp at
// https://ccrma.stanford.edu/software/stk/classstk_1_1Brass.html). Rust/WASM
// port, same shape as the other src/wasm/* modules (public/BrassProcessor.js
// hosts it as an AudioWorklet).
//
// Signal path (STK's Brass::tick, reproduced exactly):
//   breathPressure = maxPressure * adsr.tick()          -- breath envelope
//   breathPressure += vibratoGain * vibrato.tick()       -- vibrato on the breath
//   mouthPressure   = 0.3 * breathPressure
//   borePressure    = 0.85 * delayLine.lastOut()         -- reflected wave
//   deltaPressure   = lipFilter.tick(mouthPressure - borePressure)  -- lip mechanics
//   deltaPressure  *= deltaPressure; clamp to 1           -- pressure -> area (nonlinear reed)
//   frame = deltaPressure*mouthPressure + (1-deltaPressure)*borePressure  -- scattering junction
//   out   = delayLine.tick(dcBlock.tick(frame))           -- bore round-trip + DC block
//
// `lipFilter` is a 2-pole resonator (STK BiQuad::setResonance, radius 0.997)
// tuned near the played frequency (times a `tension` multiplier); `delayLine`
// is an allpass-interpolated fractional delay (STK DelayA) whose length sets
// the fundamental (round-trip bore length, `(sr/f)*2 + 3`, scaled by `slide`);
// `dcBlock` is STK's PoleZero DC blocker (b0=1, b1=-1, a1=-0.99).
//
// Continuous knobs reparametrize STK's MIDI control-change formulas (kept
// identical, just fed from a 0..1 knob instead of a 0..127 CC value):
//   tension (CC2 Lip Tension): lipFreq = freq * 4^(2*tension - 1)   (0.5 = neutral)
//   slide   (CC4 Slide Length): delay = slideTarget * (0.5 + slide) (0.5 = neutral)
//   vibratoRate (CC11): 0..1 -> 0..12 Hz
//   vibratoGain (CC1):  0..1 -> 0..0.4
// `attack`/`release` reparametrize STK's startBlowing/stopBlowing (STK ties
// these to note velocity; here they're explicit knobs, same ADSR math).

use std::alloc::{alloc, Layout};
use std::f32::consts::PI;

#[no_mangle]
pub extern "C" fn alloc_f32(count: u32) -> u32 {
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { alloc(layout) as u32 }
}

const LIP_RADIUS: f32 = 0.997; // STK: lipFilter_.setResonance(freq, 0.997)
// STK's Brass drives the lip filter unnormalized (setResonance's 3rd arg,
// `normalize`, defaults to false) with a fixed setGain(0.03). That pairing is
// numerically fine for STK's original 22050 Hz demos, but at the sample rates
// this host actually runs (44.1/48 kHz) the unnormalized 2-pole resonator's
// own DC gain for a typical brass fundamental is 3-4 orders of magnitude (its
// poles sit only a few degrees of arc from z=1 at low freq/sr ratios) — the
// lip filter saturates on the very first cycle and never leaves the
// deltaPressure=1 branch, so the model can't self-oscillate; it just spits one
// transient thump and decays. `normalize=true` is STK's own built-in fix for
// exactly this (adds zeros at z=±1, pinning peak gain to ~1 at every
// frequency) — turning it on and re-deriving the gain (512, found by sweeping
// for the smallest value that self-sustains cleanly at both ends of the
// playable range) restores genuine closed-loop self-oscillation.
const LIP_GAIN: f32 = 512.0;
const DC_POLE: f32 = 0.99;     // STK: dcBlock_.setBlockZero() default pole
const SUSTAIN_LEVEL: f32 = 1.0; // STK: adsr_.setAllTimes(..., sLevel=1.0, ...)
const FREQ_MIN: f32 = 20.0;
const FREQ_MAX: f32 = 2000.0;
const BUFFER_LOWEST_FREQ: f32 = 8.0; // STK: Brass(lowestFrequency = 8.0) default

const ADSR_IDLE: u32 = 0;
const ADSR_ATTACK: u32 = 1;
const ADSR_DECAY: u32 = 2;
const ADSR_SUSTAIN: u32 = 3;
const ADSR_RELEASE: u32 = 4;

#[repr(C)]
pub struct Brass {
    // Bore delay line (STK DelayA — allpass-interpolated fractional delay).
    buf: *mut f32,
    buf_len: u32,
    in_point: u32,
    out_point: u32,
    alpha: f32,
    coeff: f32,
    ap_input: f32,
    delay_last: f32,

    // Lip filter (STK BiQuad::setResonance, normalize=true — 2 poles + 2 zeros).
    lip_x1: f32,
    lip_x2: f32,
    lip_y1: f32,
    lip_y2: f32,

    // DC blocker (STK PoleZero::setBlockZero).
    dc_x1: f32,
    dc_y1: f32,

    // Breath envelope (STK ADSR; decay is a no-op here since sustain = 1.0).
    adsr_value: f32,
    adsr_target: f32,
    attack_rate: f32,
    release_rate: f32,
    adsr_state: u32,

    // Vibrato (STK SineWave, direct sin() instead of a wavetable).
    vib_phase: f32,

    max_pressure: f32, // breath amplitude, latched at note-on (STK maxPressure_)

    pending_on: bool,
    pending_on_vel: f32,
    pending_off: bool,
}

impl Brass {
    /// STK DelayA::setDelay — recomputes the allpass fractional-delay
    /// interpolation coefficients for a new (possibly fractional) length.
    fn set_delay(&mut self, delay: f32) {
        let length = self.buf_len;
        let mut out_pointer = self.in_point as f32 - delay + 1.0;
        while out_pointer < 0.0 {
            out_pointer += length as f32;
        }
        let mut out_point = out_pointer as u32;
        if out_point >= length {
            out_point = 0;
        }
        let mut alpha = 1.0 + out_point as f32 - out_pointer;
        if alpha < 0.5 {
            out_point += 1;
            if out_point >= length {
                out_point -= length;
            }
            alpha += 1.0;
        }
        self.out_point = out_point;
        self.alpha = alpha;
        self.coeff = (1.0 - alpha) / (1.0 + alpha);
    }

    /// STK DelayA::tick — write `input`, return the allpass-interpolated
    /// output from `delay` samples ago.
    fn delay_tick(&mut self, buf: &mut [f32], input: f32) -> f32 {
        buf[self.in_point as usize] = input;
        self.in_point += 1;
        if self.in_point == self.buf_len {
            self.in_point = 0;
        }
        let next = -self.coeff * self.delay_last + self.ap_input + self.coeff * buf[self.out_point as usize];
        self.delay_last = next;
        self.ap_input = buf[self.out_point as usize];
        self.out_point += 1;
        if self.out_point == self.buf_len {
            self.out_point = 0;
        }
        next
    }

    /// STK ADSR::tick, specialized for sustainLevel = 1.0 / decayRate = 0.
    fn adsr_tick(&mut self) -> f32 {
        match self.adsr_state {
            ADSR_ATTACK => {
                self.adsr_value += self.attack_rate;
                if self.adsr_value >= self.adsr_target {
                    self.adsr_value = self.adsr_target;
                    self.adsr_target = SUSTAIN_LEVEL;
                    self.adsr_state = ADSR_DECAY;
                }
            }
            ADSR_DECAY => {
                // decayRate_ = (1 - sustainLevel_) / (...) = 0 when sustainLevel = 1.0,
                // so this always resolves to SUSTAIN on the next tick (matches STK).
                if self.adsr_value >= SUSTAIN_LEVEL {
                    self.adsr_value = SUSTAIN_LEVEL;
                    self.adsr_state = ADSR_SUSTAIN;
                }
            }
            ADSR_RELEASE => {
                self.adsr_value -= self.release_rate;
                if self.adsr_value <= 0.0 {
                    self.adsr_value = 0.0;
                    self.adsr_state = ADSR_IDLE;
                }
            }
            _ => {}
        }
        self.adsr_value
    }
}

#[no_mangle]
pub extern "C" fn brass_new(sample_rate: f32) -> *mut Brass {
    let max_len = (sample_rate / BUFFER_LOWEST_FREQ).ceil() as u32 + 8;
    let buf_layout = Layout::array::<f32>(max_len as usize).unwrap();
    let buf = unsafe {
        let p = alloc(buf_layout) as *mut f32;
        std::ptr::write_bytes(p, 0, max_len as usize);
        p
    };
    let st_layout = Layout::new::<Brass>();
    let ptr = unsafe { alloc(st_layout) as *mut Brass };
    unsafe {
        (*ptr) = Brass {
            buf, buf_len: max_len, in_point: 0, out_point: 0,
            alpha: 1.0, coeff: 0.0, ap_input: 0.0, delay_last: 0.0,
            lip_x1: 0.0, lip_x2: 0.0, lip_y1: 0.0, lip_y2: 0.0,
            dc_x1: 0.0, dc_y1: 0.0,
            adsr_value: 0.0, adsr_target: 0.0, attack_rate: 0.01, release_rate: 0.01,
            adsr_state: ADSR_IDLE,
            vib_phase: 0.0,
            max_pressure: 0.0,
            pending_on: false, pending_on_vel: 1.0, pending_off: false,
        };
        // Seed the delay line for a mid-range starting pitch so the first
        // block (before any note-on) reads a sane length.
        let slide_target = (sample_rate / 220.0) * 2.0 + 3.0;
        (*ptr).set_delay(slide_target.min(max_len as f32 - 2.0));
    }
    ptr
}

#[no_mangle]
pub extern "C" fn brass_note_on(state: *mut Brass, velocity: f32) {
    let st = unsafe { &mut *state };
    st.pending_on = true;
    st.pending_on_vel = if velocity > 0.0 { velocity } else { 1.0 };
}

#[no_mangle]
pub extern "C" fn brass_note_off(state: *mut Brass) {
    unsafe { (*state).pending_off = true; }
}

/// `frequency` is a-rate (`freq_len` is 1 or `frames`). `tension`/`slide`/
/// `attack`/`release`/`vibrato_rate`/`vibrato_gain` are k-rate knobs (0..1).
#[no_mangle]
pub extern "C" fn brass_process(
    state: *mut Brass,
    freq_ptr: *const f32,
    freq_len: u32,
    tension: f32,
    slide: f32,
    attack: f32,
    release: f32,
    vibrato_rate: f32,
    vibrato_gain: f32,
    frames: u32,
    sample_rate: f32,
    out_ptr: *mut f32,
) {
    let st = unsafe { &mut *state };
    let n = frames as usize;
    let out = unsafe { std::slice::from_raw_parts_mut(out_ptr, n) };
    let freq = unsafe { std::slice::from_raw_parts(freq_ptr, freq_len.max(1) as usize) };
    let a_rate = freq_len > 1;
    let buf_len = st.buf_len as usize;
    let buf = unsafe { std::slice::from_raw_parts_mut(st.buf, buf_len) };

    let tension_mult = 4.0f32.powf(2.0 * tension.clamp(0.0, 1.0) - 1.0); // CC2 formula
    let slide_scale = 0.5 + slide.clamp(0.0, 1.0);                       // CC4 formula
    let attack_time = 0.001 + attack.clamp(0.0, 1.0).powi(2) * 0.999;
    let release_time = 0.005 + release.clamp(0.0, 1.0).powi(2) * 1.995;
    st.attack_rate = 1.0 / (attack_time * sample_rate);
    // STK setReleaseTime: releaseRate = sustainLevel / (releaseTime * sr).
    st.release_rate = SUSTAIN_LEVEL / (release_time * sample_rate);
    let vib_hz = vibrato_rate.clamp(0.0, 1.0) * 12.0;   // CC11 formula
    let vib_gain = vibrato_gain.clamp(0.0, 1.0) * 0.4;  // CC1 formula
    let vib_inc = vib_hz / sample_rate;

    let max_delay = (buf_len as f32) - 2.0;

    for i in 0..n {
        if st.pending_on {
            st.pending_on = false;
            st.max_pressure = st.pending_on_vel;
            if st.adsr_target <= 0.0 { st.adsr_target = 1.0; }
            st.adsr_state = ADSR_ATTACK;
        }
        if st.pending_off {
            st.pending_off = false;
            st.adsr_target = 0.0;
            st.adsr_state = ADSR_RELEASE;
        }

        let fraw = if a_rate { freq[i] } else { freq[0] };
        let f = fraw.clamp(FREQ_MIN, FREQ_MAX);

        // Lip filter: 2-pole-2-zero resonator retuned every sample (STK setLip()).
        let lip_freq = (f * tension_mult).clamp(20.0, sample_rate * 0.499);
        let w = 2.0 * PI * lip_freq / sample_rate;
        let a1 = -2.0 * LIP_RADIUS * w.cos();
        let a2 = LIP_RADIUS * LIP_RADIUS;
        let b0 = 0.5 - 0.5 * a2; // normalize=true: zeros at z=+-1 pin peak gain to ~1
        let b2 = -b0;

        // Bore delay length (STK setFrequency's "fudge correction" + slide).
        let slide_target = (sample_rate / f) * 2.0 + 3.0;
        let want_delay = (slide_target * slide_scale).clamp(0.5, max_delay);
        st.set_delay(want_delay);

        let env = st.adsr_tick();
        let mut breath = st.max_pressure * env;
        let vib = (2.0 * PI * st.vib_phase).sin();
        st.vib_phase += vib_inc;
        if st.vib_phase >= 1.0 { st.vib_phase -= 1.0; }
        breath += vib_gain * vib;

        let mouth = 0.3 * breath;
        let bore = 0.85 * st.delay_last;
        let mut delta = mouth - bore;

        // Lip filter tick (BiQuad, b1=0 -> y = b0*x0 + b2*x[n-2] - a1*y1 - a2*y2).
        let x0 = LIP_GAIN * delta;
        let y = b0 * x0 + b2 * st.lip_x2 - a1 * st.lip_y1 - a2 * st.lip_y2;
        st.lip_x2 = st.lip_x1;
        st.lip_x1 = x0;
        st.lip_y2 = st.lip_y1;
        st.lip_y1 = y;
        delta = y;

        delta *= delta; // force -> area (nonlinear reed mapping)
        if delta > 1.0 { delta = 1.0; }

        let frame = delta * mouth + (1.0 - delta) * bore;

        // DC blocker (PoleZero: b0=1, b1=-1, a1=-0.99).
        let dcy = frame - st.dc_x1 + DC_POLE * st.dc_y1;
        st.dc_x1 = frame;
        st.dc_y1 = dcy;

        let mut o = st.delay_tick(buf, dcy);
        if !o.is_finite() {
            o = 0.0;
            st.delay_last = 0.0;
            st.lip_x1 = 0.0;
            st.lip_x2 = 0.0;
            st.lip_y1 = 0.0;
            st.lip_y2 = 0.0;
            st.dc_y1 = 0.0;
        }
        out[i] = o;
    }
}
