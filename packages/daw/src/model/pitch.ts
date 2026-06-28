export const A4 = 440;

/** MIDI note number → frequency (Hz). */
export function midiToFreq(midi: number): number {
  return A4 * Math.pow(2, (midi - 69) / 12);
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI note number → name, e.g. 60 → "C4". */
export function midiName(midi: number): string {
  return NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

// ── Scales (for the piano-roll key highlight + snap) ─────────────────────────
export type ScaleType =
  | 'major' | 'minor' | 'dorian' | 'mixolydian' | 'phrygian' | 'lydian'
  | 'harmonicMinor' | 'pentaMajor' | 'pentaMinor' | 'blues';

/** Semitone offsets from the root for each scale. */
export const SCALES: Record<ScaleType, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  pentaMajor: [0, 2, 4, 7, 9],
  pentaMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

export const SCALE_LABELS: Record<ScaleType, string> = {
  major: 'Major', minor: 'Minor', dorian: 'Dorian', mixolydian: 'Mixolydian', phrygian: 'Phrygian',
  lydian: 'Lydian', harmonicMinor: 'Harmonic min', pentaMajor: 'Penta major', pentaMinor: 'Penta minor', blues: 'Blues',
};

export const ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Is `midi` in the scale rooted at pitch-class `root` (0=C…11=B)? */
export function inScale(midi: number, root: number, scale: ScaleType): boolean {
  const pc = (((midi - root) % 12) + 12) % 12;
  return SCALES[scale].includes(pc);
}

/** Nearest in-scale MIDI note to `midi` (searches outward; ties resolve upward). */
export function snapToScale(midi: number, root: number, scale: ScaleType): number {
  if (inScale(midi, root, scale)) return midi;
  for (let d = 1; d <= 6; d++) {
    if (inScale(midi + d, root, scale)) return midi + d;
    if (inScale(midi - d, root, scale)) return midi - d;
  }
  return midi;
}
