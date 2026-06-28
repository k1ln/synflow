// Splitting an audio clip in two. The cut would pop if either half were later
// isolated (a hard edge through a non-zero waveform), so we overlap the halves by
// one declick (see clipFade): the first half fades out over its last `d` seconds
// while the second fades in over its first `d` seconds, reading the *same* source
// samples at the same time — linear ramps of identical signal sum back to unity,
// so there's no dip at the join and no click if a half is moved or deleted.

import { DECLICK_SEC } from './clipFade';

export interface SplittableClip {
  id: string;
  start: number;     // timeline position, fractional steps
  offset: number;    // trim start within the asset (s)
  duration: number;  // length played from the asset (s)
  fadeIn?: number;
  fadeOut?: number;
}

/** Split `c` at `atSteps` into [firstHalf, secondHalf], or null when the cut is
 *  within ~20 ms of an edge (not worth making). `newId` mints the second clip's id. */
export function splitClipAt<T extends SplittableClip>(c: T, atSteps: number, secPerStep: number, newId: () => string): [T, T] | null {
  const into = (atSteps - c.start) * secPerStep;            // seconds into the clip
  if (into <= 0.02 || into >= c.duration - 0.02) return null;
  const d = Math.min(DECLICK_SEC, into, c.duration - into); // overlap can't exceed either half
  return [
    { ...c, duration: into, fadeOut: d },                   // outer fade-out (if any) moves to the 2nd half
    { ...c, id: newId(), start: Math.max(0, atSteps - d / secPerStep), offset: c.offset + into - d, duration: c.duration - into + d, fadeIn: d },
  ];
}
