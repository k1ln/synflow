import { describe, it, expect } from 'vitest';
import detectPitch, { frequencyToNote, frequencyRatio } from '../src/util/pitchDetection';

// Synthesize a pure sine wave AudioBuffer mock
const makeSineBuffer = (
  freq: number,
  sampleRate = 44100,
  durationSamples = 8192
): AudioBuffer => {
  const data = new Float32Array(durationSamples);
  for (let i = 0; i < durationSamples; i++) {
    data[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return {
    sampleRate,
    length: durationSamples,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
};

// Tolerance: within 2% of target frequency
const withinTolerance = (detected: number | null, target: number, pct = 2) => {
  if (detected === null) return false;
  return Math.abs(detected - target) / target < pct / 100;
};

// ─── detectPitch ────────────────────────────────────────────────────────────

describe('detectPitch', () => {
  it('detects 440 Hz (A4) from a pure sine wave', () => {
    const buf = makeSineBuffer(440);
    const freq = detectPitch(buf);
    expect(freq).not.toBeNull();
    expect(withinTolerance(freq, 440)).toBe(true);
  });

  it('detects 220 Hz (A3)', () => {
    const buf = makeSineBuffer(220);
    const freq = detectPitch(buf);
    expect(freq).not.toBeNull();
    expect(withinTolerance(freq, 220)).toBe(true);
  });

  it('detects 261.63 Hz (C4, middle C)', () => {
    const buf = makeSineBuffer(261.63);
    const freq = detectPitch(buf);
    expect(freq).not.toBeNull();
    expect(withinTolerance(freq, 261.63, 3)).toBe(true);
  });

  it('returns null for a silent buffer', () => {
    const silent = new Float32Array(8192); // all zeros
    const buf = {
      sampleRate: 44100,
      length: 8192,
      numberOfChannels: 1,
      getChannelData: () => silent,
    } as unknown as AudioBuffer;
    const freq = detectPitch(buf);
    expect(freq).toBeNull();
  });

  it('handles short segments (< 256 samples) via FFT path', () => {
    const buf = makeSineBuffer(440, 44100, 128);
    // Should not throw; may or may not detect depending on segment length
    expect(() => detectPitch(buf)).not.toThrow();
  });

  it('handles medium segments (256-1024 samples)', () => {
    const buf = makeSineBuffer(440, 44100, 512);
    expect(() => detectPitch(buf)).not.toThrow();
    const freq = detectPitch(buf);
    if (freq !== null) {
      expect(withinTolerance(freq, 440, 5)).toBe(true);
    }
  });

  it('respects start/end time bounds', () => {
    // Full buffer is 440 Hz; time bounds cover the full signal
    const buf = makeSineBuffer(440, 44100, 8192);
    const freq = detectPitch(buf, 0, 8192 / 44100);
    expect(freq).not.toBeNull();
    expect(withinTolerance(freq, 440)).toBe(true);
  });

  it('detects 880 Hz (A5)', () => {
    const buf = makeSineBuffer(880);
    const freq = detectPitch(buf);
    expect(freq).not.toBeNull();
    expect(withinTolerance(freq, 880, 3)).toBe(true);
  });

  it('returns a number rounded to one decimal place', () => {
    const buf = makeSineBuffer(440);
    const freq = detectPitch(buf);
    if (freq !== null) {
      expect(freq).toBe(Math.round(freq * 10) / 10);
    }
  });
});

// ─── frequencyToNote ────────────────────────────────────────────────────────

describe('frequencyToNote', () => {
  it('converts 440 Hz to A4', () => {
    const note = frequencyToNote(440);
    expect(note).toContain('A4');
  });

  it('converts 261.63 Hz to C4 (middle C)', () => {
    const note = frequencyToNote(261.63);
    expect(note).toContain('C4');
  });

  it('converts 220 Hz to A3', () => {
    const note = frequencyToNote(220);
    expect(note).toContain('A3');
  });

  it('includes cent deviation in the string', () => {
    const note = frequencyToNote(440);
    expect(note).toMatch(/[+-]\d+¢/);
  });

  it('shows +0¢ for exact A4 = 440 Hz', () => {
    const note = frequencyToNote(440);
    expect(note).toContain('+0¢');
  });

  it('shows sharp notes correctly', () => {
    const note = frequencyToNote(466.16); // A#4 / Bb4
    expect(note).toMatch(/A#4|Bb4/);
  });
});

// ─── frequencyRatio ─────────────────────────────────────────────────────────

describe('frequencyRatio', () => {
  it('returns 1 when source and target are the same', () => {
    expect(frequencyRatio(440, 440)).toBe(1);
  });

  it('returns 2 for an octave up', () => {
    expect(frequencyRatio(440, 880)).toBe(2);
  });

  it('returns 0.5 for an octave down', () => {
    expect(frequencyRatio(440, 220)).toBe(0.5);
  });

  it('returns the correct ratio for arbitrary frequencies', () => {
    const ratio = frequencyRatio(200, 300);
    expect(ratio).toBeCloseTo(1.5, 5);
  });
});
