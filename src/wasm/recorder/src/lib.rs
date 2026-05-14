use std::alloc::{alloc, Layout};

#[no_mangle]
pub extern "C" fn alloc_f32(count: u32) -> u32 {
    let layout = Layout::array::<f32>(count as usize).unwrap();
    unsafe { alloc(layout) as u32 }
}

// Maximum internal buffer: 4 seconds at 48 kHz = 192 000 samples.
// JS can set flush_every up to this limit.
const MAX_BUF: usize = 192_000;

#[repr(C)]
pub struct RecorderState {
    buf: *mut f32,
    buf_cap: u32,
    samples: u32,
    flush_every: u32,
}

#[no_mangle]
pub extern "C" fn recorder_new(flush_every: u32) -> *mut RecorderState {
    let cap = MAX_BUF as u32;
    let buf_layout = Layout::array::<f32>(cap as usize).unwrap();
    let buf = unsafe { alloc(buf_layout) as *mut f32 };

    let st_layout = Layout::new::<RecorderState>();
    let ptr = unsafe { alloc(st_layout) as *mut RecorderState };
    unsafe {
        (*ptr) = RecorderState {
            buf,
            buf_cap: cap,
            samples: 0,
            flush_every: flush_every.max(256).min(cap),
        };
    }
    ptr
}

#[no_mangle]
pub extern "C" fn recorder_set_flush(ptr: *mut RecorderState, flush_every: u32) {
    let st = unsafe { &mut *ptr };
    st.flush_every = flush_every.max(256).min(st.buf_cap);
}

/// Push `frames` samples from `input_ptr` into the internal buffer.
/// Returns the number of accumulated samples if a flush is due (>= flush_every), else 0.
#[no_mangle]
pub extern "C" fn recorder_push(
    ptr: *mut RecorderState,
    input_ptr: *const f32,
    frames: u32,
) -> u32 {
    let st = unsafe { &mut *ptr };
    let src = unsafe { std::slice::from_raw_parts(input_ptr, frames as usize) };

    let to_copy = frames.min(st.buf_cap - st.samples) as usize;
    unsafe {
        let dst = st.buf.add(st.samples as usize);
        std::ptr::copy_nonoverlapping(src.as_ptr(), dst, to_copy);
    }
    st.samples += to_copy as u32;

    if st.samples >= st.flush_every {
        st.samples
    } else {
        0
    }
}

/// Copy accumulated samples to `out_ptr`, reset the buffer, return sample count.
#[no_mangle]
pub extern "C" fn recorder_flush(ptr: *mut RecorderState, out_ptr: *mut f32) -> u32 {
    let st = unsafe { &mut *ptr };
    let count = st.samples as usize;
    if count == 0 {
        return 0;
    }
    unsafe {
        std::ptr::copy_nonoverlapping(st.buf, out_ptr, count);
    }
    st.samples = 0;
    count as u32
}

/// Discard accumulated samples without flushing.
#[no_mangle]
pub extern "C" fn recorder_reset(ptr: *mut RecorderState) {
    let st = unsafe { &mut *ptr };
    st.samples = 0;
}
