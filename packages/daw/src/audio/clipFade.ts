// Per-clip gain fades (fade in / fade out) — used to crossfade overlapping audio
// clips. Shared by realtime playback (AudioClipPlayer, ClipStreamer) and the
// offline renders (bounce, bounceStream) so what you hear matches what you export.

// Minimum ramp applied at every clip edge (a "declick"): a hard cut through a
// non-zero waveform pops, so we never let an edge go fully square. A split makes
// its two halves overlap by exactly this much (see splitAudioClip) so the forced
// ramps crossfade the identical source back to unity — no dip at the join, while
// a half later moved/deleted keeps a clean, click-free edge.
export const DECLICK_SEC = 0.004;

/** fadeIn/fadeOut clamped to the clip and floored at the declick minimum. */
function edges(dur: number, fadeIn: number, fadeOut: number): [number, number] {
  const d = Math.min(DECLICK_SEC, dur / 2);
  const fi = Math.max(0, Math.min(Math.max(fadeIn, d), dur));
  const fo = Math.max(0, Math.min(Math.max(fadeOut, d), dur - fi));
  return [fi, fo];
}

/** Linear fade envelope value at `local` seconds into a clip of length `dur`. */
export function fadeGainAt(gain: number, local: number, dur: number, fadeIn = 0, fadeOut = 0): number {
  const [fi, fo] = edges(dur, fadeIn, fadeOut);
  let v = gain;
  if (fi > 0 && local < fi) v = gain * Math.max(0, local / fi);
  if (fo > 0 && local > dur - fo) v = Math.min(v, gain * Math.max(0, (dur - local) / fo));
  return Math.max(0, v);
}

/** Schedule a whole clip's gain on `param`: constant `gain`, with optional linear
 *  fade in/out. `t0` is the clock time the clip's first sample sounds. */
export function scheduleFade(param: AudioParam, gain: number, t0: number, dur: number, fadeIn = 0, fadeOut = 0): void {
  const [fi, fo] = edges(dur, fadeIn, fadeOut);
  if (fi > 0) { param.setValueAtTime(0, t0); param.linearRampToValueAtTime(gain, t0 + fi); }
  else param.setValueAtTime(gain, t0);
  if (fo > 0) { param.setValueAtTime(gain, t0 + dur - fo); param.linearRampToValueAtTime(0, t0 + dur); }
}

/** Schedule the fade envelope for just the part of a clip that falls in a render
 *  window (used by the segmented streaming bounce). `localTime(abs)` maps an
 *  absolute clip-timeline second to this window's param/clock time. The clip spans
 *  absolute [0, dur]; the window covers absolute [segStart, segEnd]. */
export function scheduleFadeWindow(
  param: AudioParam,
  gain: number, dur: number, fadeIn: number, fadeOut: number,
  segStart: number, segEnd: number,
  localTime: (abs: number) => number,
): void {
  const [fi, fo] = edges(dur, fadeIn, fadeOut);
  param.setValueAtTime(fadeGainAt(gain, segStart, dur, fi, fo), Math.max(0, localTime(segStart)));
  if (fi > 0 && fi > segStart && fi < segEnd) param.linearRampToValueAtTime(gain, localTime(fi));         // fade-in completes
  if (fo > 0 && dur - fo > segStart && dur - fo < segEnd) param.linearRampToValueAtTime(gain, localTime(dur - fo)); // fade-out begins
  param.linearRampToValueAtTime(fadeGainAt(gain, segEnd, dur, fi, fo), localTime(segEnd));
}
