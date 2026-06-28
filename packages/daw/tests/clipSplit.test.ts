import { describe, it, expect } from 'vitest';
import { splitClipAt, type SplittableClip } from '../src/audio/clipSplit';
import { fadeGainAt, DECLICK_SEC } from '../src/audio/clipFade';

const SPS = 0.1; // seconds per step
const base: SplittableClip = { id: 'a', start: 0, offset: 0.5, duration: 3, fadeIn: 0.1, fadeOut: 0.2 };
const split = (atSteps: number, c = base) => splitClipAt(c, atSteps, SPS, () => 'b');

describe('splitClipAt geometry', () => {
  it('refuses a cut within ~20ms of either edge', () => {
    expect(split(0.1)).toBeNull();              // 0.01s in
    expect(split(base.duration / SPS - 0.1)).toBeNull(); // 0.01s from the end
  });

  it('overlaps the halves by one declick and carries the source position across', () => {
    const r = split(10)!;                        // 1.0s into the clip
    expect(r).not.toBeNull();
    const [a, b] = r;
    const d = DECLICK_SEC;
    // First half ends at the cut, fades out by the declick, keeps its real fade-in.
    expect(a.duration).toBeCloseTo(1.0, 6);
    expect(a.offset).toBeCloseTo(0.5, 6);
    expect(a.fadeIn).toBeCloseTo(0.1, 6);
    expect(a.fadeOut).toBeCloseTo(d, 6);
    // Second half starts a declick early in BOTH timeline and source, so the overlap
    // replays the identical samples; it keeps the clip's real fade-out.
    expect(b.id).toBe('b');
    expect(b.start).toBeCloseTo(10 - d / SPS, 6);
    expect(b.offset).toBeCloseTo(0.5 + 1.0 - d, 6);
    expect(b.duration).toBeCloseTo(3 - 1.0 + d, 6);
    expect(b.fadeIn).toBeCloseTo(d, 6);
    expect(b.fadeOut).toBeCloseTo(0.2, 6);
    // The two halves still cover exactly the original span (no gap, no extra length).
    expect(a.start).toBeCloseTo(0, 6);
    expect((b.start * SPS) + b.duration).toBeCloseTo(base.start * SPS + base.duration, 6);
  });
});

describe('declick crossfade reconstructs the signal at the cut', () => {
  it('first.fadeOut + second.fadeIn sum to unity across the overlap (no dip, no click)', () => {
    const [a, b] = split(10)!;     // cut 1.0s in, halves long enough that outer fades don't reach the join
    const d = DECLICK_SEC;
    const cut = a.duration;        // overlap is timeline seconds [cut - d, cut] relative to the first half's start
    let maxErr = 0;
    for (let k = 0; k <= 32; k++) {
      const t = cut - d + (d * k) / 32;                 // a point inside the overlap
      const gainA = fadeGainAt(1, t, a.duration, a.fadeIn, a.fadeOut);          // local time in A == t
      const gainB = fadeGainAt(1, t - (cut - d), b.duration, b.fadeIn, b.fadeOut); // local time in B
      maxErr = Math.max(maxErr, Math.abs(gainA + gainB - 1));
    }
    expect(maxErr).toBeLessThan(1e-9);
  });
});

describe('declick floors every edge so isolated clips do not pop', () => {
  it('a plain clip with no fades still ramps from zero at both edges', () => {
    const dur = 2;
    expect(fadeGainAt(1, 0, dur, 0, 0)).toBe(0);                 // starts at silence
    expect(fadeGainAt(1, dur, dur, 0, 0)).toBe(0);              // ends at silence
    expect(fadeGainAt(1, DECLICK_SEC, dur, 0, 0)).toBeCloseTo(1, 6);   // full gain once the ramp is done
    expect(fadeGainAt(1, dur / 2, dur, 0, 0)).toBeCloseTo(1, 6);       // unity in the middle
  });
});
