import React from 'react';
import type { Option } from './OptionSelect';

/**
 * Tiny inline glyphs for node option pickers. `currentColor` so they inherit the
 * button's text color (dim when idle, ink-dark when the segment is lit).
 */

const Svg: React.FC<{ children: React.ReactNode; vb?: string }> = ({ children, vb = '0 0 22 14' }) => (
  <svg viewBox={vb} fill="none" stroke="currentColor" strokeWidth={1.6}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

// ── Oscillator waveforms ────────────────────────────────────────────────────
export const WaveSine = () => <Svg><path d="M1 7 Q5.5 0 10 7 T19 7" /></Svg>;
export const WaveSquare = () => <Svg><path d="M1 11 V4 H8 V11 H15 V4 H21" /></Svg>;
export const WaveSaw = () => <Svg><path d="M1 11 L7 3 L7 11 L13 3 L13 11 L19 3" /></Svg>;
export const WaveTriangle = () => <Svg><path d="M1 11 L5 3 L9 11 L13 3 L17 11 L21 3" /></Svg>;

export const WAVEFORM_OPTIONS: Option[] = [
  { value: 'sine', symbol: <WaveSine />, title: 'Sine' },
  { value: 'square', symbol: <WaveSquare />, title: 'Square' },
  { value: 'sawtooth', symbol: <WaveSaw />, title: 'Sawtooth' },
  { value: 'triangle', symbol: <WaveTriangle />, title: 'Triangle' },
];
/** Waveforms plus the PeriodicWave "custom" choice. */
export const WAVEFORM_OPTIONS_CUSTOM: Option[] = [
  ...WAVEFORM_OPTIONS,
  { value: 'custom', label: 'cu', title: 'Custom / PeriodicWave' },
];

// ── Biquad / generic filter responses ───────────────────────────────────────
const FILTER_GLYPHS: Record<string, React.ReactNode> = {
  lowpass: <path d="M1 4 H11 C15 4 15 12 21 12" />,
  highpass: <path d="M1 12 C7 12 7 4 11 4 H21" />,
  bandpass: <path d="M1 12 C6 12 7 4 11 4 C15 4 16 12 21 12" />,
  notch: <path d="M1 4 H8 C10 4 10 12 11 12 C12 12 12 4 14 4 H21" />,
  lowshelf: <path d="M1 5 H8 C10 5 10 9 12 9 H21" />,
  highshelf: <path d="M1 9 H10 C12 9 12 5 14 5 H21" />,
  peaking: <path d="M1 8 H8 C9.5 8 9.5 3 11 3 C12.5 3 12.5 8 14 8 H21" />,
  allpass: <path d="M1 7 H21" />,
};

/** Short, readable abbreviation per filter type (shown under the glyph). */
export const FILTER_LABELS: Record<string, string> = {
  lowpass: 'LP', highpass: 'HP', bandpass: 'BP', notch: 'NT',
  lowshelf: 'LS', highshelf: 'HS', peaking: 'PK', allpass: 'AP',
};

export function filterSymbol(type: string): React.ReactNode {
  const g = FILTER_GLYPHS[type];
  return g ? <Svg>{g}</Svg> : undefined;
}

/** Build option list for a subset of biquad filter types (preserves order). */
export function filterOptions(types: string[]): Option[] {
  return types.map((t) => ({ value: t, symbol: filterSymbol(t), label: FILTER_LABELS[t], title: t }));
}

export const BIQUAD_FILTER_OPTIONS: Option[] = filterOptions([
  'lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass',
]);

// ── Noise types: each gets its spectral color + a glyph ─────────────────────
// Colors are intrinsic to the option (not currentColor) so they stay tinted
// whether the segment is lit or not.
export const NOISE_COLORS: Record<string, string> = {
  white: '#e5e7eb', pink: '#f9a8d4', brown: '#b07d4f', blue: '#60a5fa',
  violet: '#c084fc', gray: '#9ca3af', velvet: '#9f1239', green: '#4ade80',
  infrared: '#dc2626', binary: '#38bdf8', crackle: '#fb923c',
};

const NoiseSvg: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg viewBox="0 0 22 14" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);

// Generic "noisy" zig-zag, tinted per spectral color.
const NOISE_JAGGED = 'M1 7 L3 4 L4 10 L6 5 L7 9 L9 3 L10 11 L12 6 L13 9 L15 4 L16 10 L18 5 L19 9 L21 6';

function noiseGlyph(kind: string): React.ReactNode {
  const c = NOISE_COLORS[kind] || '#cbd5e1';
  if (kind === 'velvet') // sparse impulses
    return <NoiseSvg><path d="M4 11 V5 M11 11 V3 M17 11 V7" stroke={c} strokeWidth={1.8} /></NoiseSvg>;
  if (kind === 'binary') // digital pulse train
    return <NoiseSvg><path d="M1 11 V4 H5 V11 H9 V4 H13 V11 H17 V4 H21" stroke={c} strokeWidth={1.5} /></NoiseSvg>;
  if (kind === 'crackle') // scattered impulses
    return <NoiseSvg>{[[4, 5], [8, 9], [12, 4], [15, 10], [19, 6]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.3} fill={c} />)}</NoiseSvg>;
  return <NoiseSvg><path d={NOISE_JAGGED} stroke={c} strokeWidth={1.4} /></NoiseSvg>;
}

export const NOISE_TYPE_KEYS = ['white', 'pink', 'brown', 'blue', 'violet', 'gray', 'velvet', 'green', 'infrared', 'binary', 'crackle'];
export const NOISE_OPTIONS: Option[] = NOISE_TYPE_KEYS.map((k) => ({ value: k, symbol: noiseGlyph(k), label: k, title: k }));
