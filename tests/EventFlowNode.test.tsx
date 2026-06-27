import { describe, it, expect } from 'vitest';
import '../src/sys/exposeFlowSynth';

describe('External flowSynth API', () => {
  it('exposes emit and listEvents on window.flowSynth', () => {
    // @ts-ignore
    const fs = (globalThis as any).window ? (window as any).flowSynth : (globalThis as any).flowSynth;
    expect(fs).toBeDefined();
    expect(typeof fs.emit).toBe('function');
    expect(typeof fs.listEvents).toBe('function');
  });
});
