import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock essentia.js so the fallback path is always exercised in Node
vi.mock('essentia.js', () => ({
  Essentia: vi.fn(() => null),
  EssentiaWASM: null,
}));

import { detectOnsets } from '../src/util/onsetDetection';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeSilentBuffer = (
  durationSec: number,
  sampleRate = 44100,
  channels = 1
): AudioBuffer => {
  const length = Math.floor(durationSec * sampleRate);
  const channelArrays = Array.from({ length: channels }, () => new Float32Array(length));
  return {
    sampleRate,
    length,
    numberOfChannels: channels,
    duration: durationSec,
    getChannelData: (ch: number) => channelArrays[ch],
  } as unknown as AudioBuffer;
};

// Produce a buffer with loud bursts at given times, separated by low-level noise.
// Low-level noise ensures the silent regions have local energy minima (valleys)
// that the fallback valley detector can find between the loud events.
const makeBurstBuffer = (
  durationSec: number,
  burstTimes: number[],
  sampleRate = 44100
): AudioBuffer => {
  const length = Math.floor(durationSec * sampleRate);
  const data = new Float32Array(length);
  // Fill with low background noise so quiet regions have varying energy (creates local minima)
  let seed = 1;
  const lcg = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
  for (let i = 0; i < length; i++) data[i] = (lcg() - 0.5) * 0.05;
  // Overlay loud bursts
  for (const burstTime of burstTimes) {
    const center = Math.floor(burstTime * sampleRate);
    const half = Math.floor(0.04 * sampleRate); // 40ms burst — wide enough to create clear energy rise/fall
    for (let i = Math.max(0, center - half); i < Math.min(length, center + half); i++) {
      data[i] = 0.9;
    }
  }
  return {
    sampleRate,
    length,
    numberOfChannels: 1,
    duration: durationSec,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('detectOnsets (fallback path — Essentia mocked out)', () => {
  it('always includes rangeStart and rangeEnd in the output', async () => {
    const buf = makeSilentBuffer(1.0);
    const cuts = await detectOnsets(buf, 0, 1.0);
    expect(cuts[0]).toBe(0);
    expect(cuts[cuts.length - 1]).toBe(1.0);
  });

  it('returns at least [start, end] for a silent buffer', async () => {
    const buf = makeSilentBuffer(1.0);
    const cuts = await detectOnsets(buf, 0, 1.0);
    expect(cuts.length).toBeGreaterThanOrEqual(2);
  });

  it('cut points are sorted in ascending order', async () => {
    const buf = makeBurstBuffer(2.0, [0.5, 1.0, 1.5]);
    const cuts = await detectOnsets(buf, 0, 2.0);
    for (let i = 1; i < cuts.length; i++) {
      expect(cuts[i]).toBeGreaterThan(cuts[i - 1]);
    }
  });

  it('all cut points fall within [rangeStart, rangeEnd]', async () => {
    const buf = makeBurstBuffer(2.0, [0.5, 1.0, 1.5]);
    const cuts = await detectOnsets(buf, 0.2, 1.8);
    for (const t of cuts) {
      expect(t).toBeGreaterThanOrEqual(0.2);
      expect(t).toBeLessThanOrEqual(1.8);
    }
  });

  it('has no duplicate cut points', async () => {
    const buf = makeBurstBuffer(2.0, [0.5, 1.0]);
    const cuts = await detectOnsets(buf, 0, 2.0);
    const unique = new Set(cuts);
    expect(unique.size).toBe(cuts.length);
  });

  it('detects at least one onset in a buffer with a loud burst', async () => {
    const buf = makeBurstBuffer(1.0, [0.5]);
    const cuts = await detectOnsets(buf, 0, 1.0);
    // With a burst at 0.5s, the fallback should find > 2 cut points
    expect(cuts.length).toBeGreaterThan(2);
  });

  it('respects a sub-range [0.3, 0.7] of the buffer', async () => {
    const buf = makeBurstBuffer(2.0, [0.5]);
    const cuts = await detectOnsets(buf, 0.3, 0.7);
    expect(cuts[0]).toBe(0.3);
    expect(cuts[cuts.length - 1]).toBe(0.7);
  });

  it('handles a stereo buffer without throwing', async () => {
    const buf = makeSilentBuffer(1.0, 44100, 2);
    await expect(detectOnsets(buf, 0, 1.0)).resolves.toBeDefined();
  });
});
