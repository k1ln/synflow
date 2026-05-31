import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    // Create a fresh instance per test (bypass singleton)
    bus = new (EventBus as any)();
  });

  it('delivers emitted events to subscribers asynchronously', async () => {
    const cb = vi.fn();
    bus.subscribe('test.event', cb);
    bus.emit('test.event', { value: 42 });
    expect(cb).not.toHaveBeenCalled(); // async — not called yet
    await new Promise(r => setTimeout(r, 10));
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0]).toMatchObject({ value: 42, eventName: 'test.event' });
  });

  it('attaches eventName to emitted data', async () => {
    const cb = vi.fn();
    bus.subscribe('foo.bar', cb);
    bus.emit('foo.bar', { x: 1 });
    await new Promise(r => setTimeout(r, 10));
    expect(cb.mock.calls[0][0].eventName).toBe('foo.bar');
  });

  it('wraps non-object data with eventName', async () => {
    const cb = vi.fn();
    bus.subscribe('plain.event', cb);
    bus.emit('plain.event'); // no data arg
    await new Promise(r => setTimeout(r, 10));
    expect(cb.mock.calls[0][0]).toMatchObject({ eventName: 'plain.event' });
  });

  it('delivers to multiple subscribers', async () => {
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe('multi', a);
    bus.subscribe('multi', b);
    bus.emit('multi', {});
    await new Promise(r => setTimeout(r, 10));
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('stops delivering after unsubscribe', async () => {
    const cb = vi.fn();
    bus.subscribe('once', cb);
    bus.unsubscribe('once', cb);
    bus.emit('once', {});
    await new Promise(r => setTimeout(r, 10));
    expect(cb).not.toHaveBeenCalled();
  });

  it('unsubscribeAll removes all callbacks for an event', async () => {
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe('ev', a);
    bus.subscribe('ev', b);
    bus.unsubscribeAll('ev');
    bus.emit('ev', {});
    await new Promise(r => setTimeout(r, 10));
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('unsubscribeAllByNodeId removes events starting with nodeId (non-GUI)', async () => {
    const cb = vi.fn();
    bus.subscribe('node-1.something', cb);
    bus.unsubscribeAllByNodeId('node-1');
    bus.emit('node-1.something', {});
    await new Promise(r => setTimeout(r, 10));
    expect(cb).not.toHaveBeenCalled();
  });

  it('listEvents returns subscribed event names', () => {
    bus.subscribe('alpha', () => {});
    bus.subscribe('beta', () => {});
    const events = bus.listEvents();
    expect(events).toContain('alpha');
    expect(events).toContain('beta');
  });

  it('listEventCounts reflects subscriber counts', () => {
    bus.subscribe('counted', () => {});
    bus.subscribe('counted', () => {});
    const counts = bus.listEventCounts();
    expect(counts['counted']).toBe(2);
  });

  it('clear with no args removes non-FlowNode events', async () => {
    const cb = vi.fn();
    bus.subscribe('some.event', cb);
    bus.clear();
    bus.emit('some.event', {});
    await new Promise(r => setTimeout(r, 10));
    expect(cb).not.toHaveBeenCalled();
  });

  it('clear with event name removes only that event', async () => {
    const cbA = vi.fn();
    const cbB = vi.fn();
    bus.subscribe('a', cbA);
    bus.subscribe('b', cbB);
    bus.clear('a');
    bus.emit('a', {});
    bus.emit('b', {});
    await new Promise(r => setTimeout(r, 10));
    expect(cbA).not.toHaveBeenCalled();
    expect(cbB).toHaveBeenCalledOnce();
  });
});
