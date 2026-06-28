use std::alloc::{alloc, Layout};

#[no_mangle]
pub extern "C" fn alloc_f32(count: u32) -> u32 {
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { alloc(layout) as u32 }
}

#[repr(C)]
pub struct FreqShifterState {
    buf: *mut f32,
    buf_size: u32,
    write_idx: u32,
    read_idx: u32,
    phase: f32,
}

#[no_mangle]
pub extern "C" fn freq_shifter_new(buffer_size: u32) -> *mut FreqShifterState {
    let cap = buffer_size.max(256);
    let buf_layout = Layout::array::<f32>(cap as usize).unwrap();
    let buf = unsafe {
        let p = alloc(buf_layout) as *mut f32;
        std::ptr::write_bytes(p, 0, cap as usize);
        p
    };
    let st_layout = Layout::new::<FreqShifterState>();
    let ptr = unsafe { alloc(st_layout) as *mut FreqShifterState };
    unsafe {
        (*ptr) = FreqShifterState {
            buf,
            buf_size: cap,
            write_idx: 0,
            read_idx: 0,
            phase: 0.0,
        };
    }
    ptr
}

/// Process one channel of `frames` samples.
/// `pitch_ratio` = 2^(semitones/12).
/// State is shared across channels; call once per block with the first channel,
/// the JS side mirrors the same output to all channels.
#[no_mangle]
pub extern "C" fn freq_shifter_process(
    ptr: *mut FreqShifterState,
    in_ptr: *const f32,
    out_ptr: *mut f32,
    frames: u32,
    pitch_ratio: f32,
) {
    let st = unsafe { &mut *ptr };
    let input  = unsafe { std::slice::from_raw_parts(in_ptr,  frames as usize) };
    let output = unsafe { std::slice::from_raw_parts_mut(out_ptr, frames as usize) };
    let size = st.buf_size as usize;
    let buf = unsafe { std::slice::from_raw_parts_mut(st.buf, size) };

    let mut write_idx = st.write_idx as usize;
    let mut read_idx  = st.read_idx  as usize;
    let mut phase     = st.phase;
    let phase_delta   = pitch_ratio - 1.0;

    for i in 0..frames as usize {
        buf[write_idx] = input[i];
        write_idx = (write_idx + 1) % size;

        let read_pos = (read_idx as f32 + phase).rem_euclid(size as f32);
        let int_part = read_pos as usize;
        let frac     = read_pos - int_part as f32;
        let s0 = buf[int_part];
        let s1 = buf[(int_part + 1) % size];
        output[i] = s0 + frac * (s1 - s0);

        phase += phase_delta;
        if phase >= size as f32 { phase -= size as f32; }
        else if phase < 0.0     { phase += size as f32; }

        read_idx = (read_idx + 1) % size;
    }

    st.write_idx = write_idx as u32;
    st.read_idx  = read_idx  as u32;
    st.phase     = phase;
}
