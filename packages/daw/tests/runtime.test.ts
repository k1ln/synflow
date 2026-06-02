import { describe, it, expect } from 'vitest';
import { Transport } from '../src/audio/Transport';
import { Scheduler } from '../src/audio/Scheduler';
import { computePeaks } from '../src/audio/waveform';
import { encodeWav, decodeWav } from '../src/audio/wav';

class FakeClock { currentTime = 0; sampleRate = 48000; }

describe('Transport', () => {
  it('computes beat/step durations from bpm', () => {
    const t = new Transport(new FakeClock() as any);
    t.bpm = 120; // 0.5 s/beat, 16th grid => 0.125 s/step
    expect(t.secondsPerBeat).toBe(0.5);
    expect(t.secondsPerStep).toBeCloseTo(0.125, 6);
  });
});

describe('Scheduler', () => {
  it('emits the right steps within the lookahead window, wrapping at totalSteps', () => {
    const clock = new FakeClock();
    const t = new Transport(clock as any);
    t.bpm = 120; // 0.125 s/step
    const events: Array<{ step: number; time: number }> = [];
    const s = new Scheduler(clock as any, t, (step, time) => events.push({ step, time }));
    s.totalSteps = 4;
    s.lookahead = 0.3;
    s.start(); s.stop(); // seeds nextStepTime = currentTime + 0.05, no interval fires

    clock.currentTime = 0.5;
    s.tick(); // window upper bound = 0.8

    // nextStepTime started at 0.05, +0.125 each: 0.05,0.175,0.3,0.425,0.55,0.675
    expect(events.map((e) => e.step)).toEqual([0, 1, 2, 3, 0, 1]);
    expect(events[2].time).toBeCloseTo(0.3, 6);
  });
});

describe('waveform.computePeaks', () => {
  it('reduces samples to min/max buckets', () => {
    const peaks = computePeaks(new Float32Array([1, -1, 0.5, -0.5]), 2);
    expect(peaks.buckets).toBe(2);
    expect(peaks.max[0]).toBe(1); expect(peaks.min[0]).toBe(-1);
    expect(peaks.max[1]).toBe(0.5); expect(peaks.min[1]).toBe(-0.5);
  });
});

describe('wav encode/decode', () => {
  it('round-trips 16-bit PCM within quantization tolerance', () => {
    const ch = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const info = decodeWav(encodeWav([ch], 48000));
    expect(info.sampleRate).toBe(48000);
    expect(info.channels).toBe(1);
    expect(info.frames).toBe(5);
    expect(info.data[0][1]).toBeCloseTo(0.5, 2);
    expect(info.data[0][2]).toBeCloseTo(-0.5, 2);
  });
});
