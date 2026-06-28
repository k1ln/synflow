import { describe, it, expect } from 'vitest';
import { VoicePool, type Voice } from '../src/audio/VoicePool';

function fakeVoice(log: string[], name: string): Voice {
  return {
    noteOn: ({ frequency }) => log.push(`${name}:on:${frequency}`),
    noteOff: () => log.push(`${name}:off`),
  };
}

describe('VoicePool', () => {
  it('allocates distinct voices for overlapping notes and frees them on note-off', () => {
    const log: string[] = [];
    const pool = new VoicePool([fakeVoice(log, 'v0'), fakeVoice(log, 'v1')]);
    pool.noteOn(1, 100);
    pool.noteOn(2, 200);
    expect(pool.activeCount).toBe(2);
    expect(log).toContain('v0:on:100');
    expect(log).toContain('v1:on:200');
    pool.noteOff(1);
    expect(pool.activeCount).toBe(1);
  });

  it('steals the oldest voice when the pool is exhausted', () => {
    const log: string[] = [];
    const pool = new VoicePool([fakeVoice(log, 'v0')]);
    pool.noteOn(1, 100);
    pool.noteOn(2, 200); // must steal v0
    expect(log.filter((l) => l === 'v0:off').length).toBe(1);
    expect(pool.activeCount).toBe(1);
  });

  it('allOff releases everything', () => {
    const log: string[] = [];
    const pool = new VoicePool([fakeVoice(log, 'v0'), fakeVoice(log, 'v1')]);
    pool.noteOn(1, 100); pool.noteOn(2, 200);
    pool.allOff();
    expect(pool.activeCount).toBe(0);
  });
});
