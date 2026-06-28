import { describe, it, expect } from 'vitest';
import { activeClipAt, type Clip } from '../src/model/project';

// The phase formula used by the live scheduler and both bounce renderers: the
// pattern restarts at the active clip's start (clip-anchored), so a multi-bar
// pattern always plays from step 0 at the clip — regardless of which bar it sits on.
const phaseStep = (s: number, clipStartSlots: number, barSteps: number, len: number) =>
  (((s - clipStartSlots * barSteps) % len) + len) % len;

const clip = (start: number, length: number, loop = false): Clip => ({ id: `c${start}`, start, length, loop });

describe('activeClipAt', () => {
  it('a fixed clip covers [start, start+length)', () => {
    const clips = [clip(3, 2)];
    expect(activeClipAt(clips, 2, 16)).toBeNull();
    expect(activeClipAt(clips, 3, 16)?.start).toBe(3);
    expect(activeClipAt(clips, 4, 16)?.start).toBe(3);
    expect(activeClipAt(clips, 5, 16)).toBeNull();
  });

  it('a loop clip fills until the next clip starts (or the song end)', () => {
    const clips = [clip(2, 1, true), clip(6, 1)];
    expect(activeClipAt(clips, 1, 16)).toBeNull();
    expect(activeClipAt(clips, 2, 16)?.start).toBe(2); // loop clip…
    expect(activeClipAt(clips, 5, 16)?.start).toBe(2); // …fills up to the next clip
    expect(activeClipAt(clips, 6, 16)?.start).toBe(6); // next clip takes over
    expect(activeClipAt(clips, 7, 16)).toBeNull();     // fixed clip ends after its length
  });
});

describe('clip-anchored pattern phase (restart at the clip)', () => {
  const barSteps = 16, len = 32; // a 2-bar pattern

  it('starts at step 0 at the clip, on an EVEN bar', () => {
    const startSlot = 2;
    expect(phaseStep(startSlot * barSteps, startSlot, barSteps, len)).toBe(0);       // first step of the clip
    expect(phaseStep(startSlot * barSteps + 16, startSlot, barSteps, len)).toBe(16); // its 2nd bar
  });

  it('ALSO starts at step 0 at the clip on an ODD bar (the whole point)', () => {
    const startSlot = 3; // odd — free-running would have started at step 16 (mid-pattern)
    expect(phaseStep(startSlot * barSteps, startSlot, barSteps, len)).toBe(0);
    expect(phaseStep(startSlot * barSteps + 16, startSlot, barSteps, len)).toBe(16);
    // sanity: this is exactly what the OLD free-running model got wrong
    expect((startSlot * barSteps) % len).toBe(16);
  });

  it('walks the full pattern across the clip and wraps for a looped clip', () => {
    const startSlot = 5;
    const steps = Array.from({ length: len + 4 }, (_, k) => phaseStep(startSlot * barSteps + k, startSlot, barSteps, len));
    expect(steps.slice(0, len)).toEqual(Array.from({ length: len }, (_, k) => k)); // 0..31 in order
    expect(steps[len]).toBe(0); // wraps back to the start of the pattern
    expect(steps[len + 1]).toBe(1);
  });
});
