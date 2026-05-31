import { describe, it, expect } from 'vitest';
import { VirtualMidiNode } from '../src/virtualNodes/VirtualMidiNode';

describe('VirtualMidiNode', () => {
  it('stores id and sourceId', () => {
    const n = new VirtualMidiNode('midi-1', 'src-1');
    expect(n.id).toBe('midi-1');
    expect(n.sourceId).toBe('src-1');
  });

  it('initialises lastFrequency to 0', () => {
    const n = new VirtualMidiNode('midi-2', 'src-2');
    expect(n.lastFrequency).toBe(0);
  });

  it('initialises lastNote to empty string', () => {
    const n = new VirtualMidiNode('midi-3', 'src-3');
    expect(n.lastNote).toBe('');
  });

  it('dispose does not throw', () => {
    const n = new VirtualMidiNode('midi-4', 'src-4');
    expect(() => n.dispose()).not.toThrow();
  });
});
