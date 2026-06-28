import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// MidiManager is a singleton; re-import between tests is not trivial, so we reset
// its internal state by accessing the private fields directly.

import MidiManager, { MidiCCListener, MidiNoteListener, MidiAnyListener } from '../src/components/MidiManager';

// Helper to simulate a MIDI message event
const midiEvt = (bytes: number[]): any => ({
  data: new Uint8Array(bytes),
});

// Reach into the singleton's private handleMessage
const fireMessage = (bytes: number[]) => {
  (MidiManager.getInstance() as any).handleMessage(midiEvt(bytes));
};

describe('MidiManager.handleMessage', () => {
  let mgr: MidiManager;

  beforeEach(() => {
    mgr = MidiManager.getInstance();
    // Reset listener sets and dedup state between tests
    (mgr as any).ccListeners = new Set();
    (mgr as any).noteListeners = new Set();
    (mgr as any).anyListeners = new Set();
    (mgr as any).lastSig = null;
    (mgr as any).lastSigTime = 0;
    (mgr as any).lastEvents = [];
    (mgr as any).buttonLearnQueue = [];
  });

  it('dispatches noteOn to noteListeners (0x90, velocity > 0)', () => {
    const cb = vi.fn();
    mgr.onNote(cb as MidiNoteListener);
    fireMessage([0x90, 60, 100]); // ch 1, note 60, vel 100
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0]).toMatchObject({ note: 60, velocity: 100, on: true, channel: 0 });
  });

  it('dispatches noteOff when note-on has velocity 0', () => {
    const cb = vi.fn();
    mgr.onNote(cb as MidiNoteListener);
    fireMessage([0x90, 60, 0]); // velocity 0 = note-off
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].on).toBe(false);
  });

  it('dispatches noteOff from 0x80 status', () => {
    const cb = vi.fn();
    mgr.onNote(cb as MidiNoteListener);
    fireMessage([0x80, 60, 0]); // explicit note-off
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].on).toBe(false);
  });

  it('dispatches CC to ccListeners (0xB0)', () => {
    const cb = vi.fn();
    mgr.onCC(cb as MidiCCListener);
    fireMessage([0xB0, 7, 100]); // ch 1, CC 7 (volume), value 100
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0]).toMatchObject({ controller: 7, value: 100, channel: 0 });
  });

  it('dispatches all messages to anyListeners', () => {
    const cb = vi.fn();
    mgr.onMessage(cb as MidiAnyListener);
    fireMessage([0xB0, 7, 64]);
    fireMessage([0x90, 60, 80]);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('deduplicates identical messages within the dedup window', () => {
    const cb = vi.fn();
    mgr.onNote(cb as MidiNoteListener);
    (mgr as any).dedupeWindowMs = 50;
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    fireMessage([0x90, 60, 100]);
    fireMessage([0x90, 60, 100]); // same within window → suppressed
    expect(cb).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  it('does not suppress messages outside the dedup window', () => {
    const cb = vi.fn();
    mgr.onNote(cb as MidiNoteListener);
    (mgr as any).dedupeWindowMs = 2;
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1005); // 5ms gap > 2ms window
    fireMessage([0x90, 60, 100]);
    fireMessage([0x90, 60, 100]);
    expect(cb).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('records events in getLog()', () => {
    fireMessage([0x90, 60, 100]);
    const log = mgr.getLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0].type).toBe('noteOn');
  });

  it('buttonLearn resolves on the next qualifying MIDI note', () => {
    const learnCb = vi.fn();
    mgr.startButtonLearn('btn-1', learnCb);
    fireMessage([0x90, 48, 80]); // note-on triggers learn
    expect(learnCb).toHaveBeenCalledOnce();
    expect(learnCb.mock.calls[0][0]).toMatchObject({ type: 'note', number: 48 });
  });

  it('buttonLearn resolves on CC message', () => {
    const learnCb = vi.fn();
    mgr.startButtonLearn('btn-2', learnCb);
    fireMessage([0xB0, 10, 64]); // CC 10
    expect(learnCb).toHaveBeenCalledOnce();
    expect(learnCb.mock.calls[0][0]).toMatchObject({ type: 'cc', number: 10 });
  });

  it('cancelButtonLearn prevents the callback from firing', () => {
    const learnCb = vi.fn();
    mgr.startButtonLearn('btn-3', learnCb);
    mgr.cancelButtonLearn('btn-3');
    fireMessage([0x90, 60, 100]);
    expect(learnCb).not.toHaveBeenCalled();
  });

  it('onCC returns an unsubscribe function', () => {
    const cb = vi.fn();
    const unsub = mgr.onCC(cb as MidiCCListener);
    unsub();
    fireMessage([0xB0, 7, 64]);
    expect(cb).not.toHaveBeenCalled();
  });

  it('onNote returns an unsubscribe function', () => {
    const cb = vi.fn();
    const unsub = mgr.onNote(cb as MidiNoteListener);
    unsub();
    fireMessage([0x90, 60, 100]);
    expect(cb).not.toHaveBeenCalled();
  });
});
