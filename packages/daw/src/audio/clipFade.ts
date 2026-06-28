// Per-clip gain fades (fade in / fade out) — used to crossfade overlapping audio
// clips. Shared by realtime playback (AudioClipPlayer, ClipStreamer) and the
// offline renders (bounce, bounceStream) so what you hear matches what you export.

/** Linear fade envelope value at `local` seconds into a clip of length `dur`. */
export function fadeGainAt(gain: number, local: number, dur: number, fadeIn = 0, fadeOut = 0): number {
  let v = gain;
  if (fadeIn > 0 && local < fadeIn) v = gain * Math.max(0, local / fadeIn);
  if (fadeOut > 0 && local > dur - fadeOut) v = Math.min(v, gain * Math.max(0, (dur - local) / fadeOut));
  return Math.max(0, v);
}

/** Schedule a whole clip's gain on `param`: constant `gain`, with optional linear
 *  fade in/out. `t0` is the clock time the clip's first sample sounds. */
export function scheduleFade(param: AudioParam, gain: number, t0: number, dur: number, fadeIn = 0, fadeOut = 0): void {
  const fi = Math.max(0, Math.min(fadeIn, dur));
  const fo = Math.max(0, Math.min(fadeOut, dur - fi));
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
  const fi = Math.max(0, Math.min(fadeIn, dur));
  const fo = Math.max(0, Math.min(fadeOut, dur - fi));
  param.setValueAtTime(fadeGainAt(gain, segStart, dur, fi, fo), Math.max(0, localTime(segStart)));
  if (fi > 0 && fi > segStart && fi < segEnd) param.linearRampToValueAtTime(gain, localTime(fi));         // fade-in completes
  if (fo > 0 && dur - fo > segStart && dur - fo < segEnd) param.linearRampToValueAtTime(gain, localTime(dur - fo)); // fade-out begins
  param.linearRampToValueAtTime(fadeGainAt(gain, segEnd, dur, fi, fo), localTime(segEnd));
}
