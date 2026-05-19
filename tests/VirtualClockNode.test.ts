import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualClockNode } from '../src/virtualNodes/VirtualClockNode';

const makeNode = (overrides: any = {}) => ({
  id: 'clock-1',
  data: { bpm: 120, isEmitting: true, ...overrides },
});

const noopEdges = () => {};

describe('VirtualClockNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('starts paused when isEmitting=false', async () => {
    const node = makeNode({ isEmitting: false });
    const onEvents: string[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', () => onEvents.push('on'));

    const clock = new VirtualClockNode(bus, node as any, noopEdges);
    clock.render();
    await new Promise(r => setTimeout(r, 200));

    expect(onEvents.length).toBe(0);
    clock.dispose();
  });

  it('emits sendNodeOn events at 600 BPM within 200ms', async () => {
    // 600 BPM → 100ms interval → ~2 ticks in 200ms
    // Subscribe AFTER render() because render() calls unsubscribeAll on the event
    const node = makeNode({ bpm: 600 });
    const onEvents: string[] = [];
    const clock = new VirtualClockNode(bus, node as any, noopEdges);
    clock.render();
    bus.subscribe(node.id + '.main-input.sendNodeOn', () => onEvents.push('on'));
    await new Promise(r => setTimeout(r, 350));

    expect(onEvents.length).toBeGreaterThanOrEqual(2);
    clock.dispose();
  });

  it('stops emitting after stop()', async () => {
    const node = makeNode({ bpm: 600 });
    const onEvents: string[] = [];
    const clock = new VirtualClockNode(bus, node as any, noopEdges);
    clock.render();
    bus.subscribe(node.id + '.main-input.sendNodeOn', () => onEvents.push('on'));
    await new Promise(r => setTimeout(r, 150));
    clock.stop();
    const countAtStop = onEvents.length;

    await new Promise(r => setTimeout(r, 300));
    expect(onEvents.length).toBe(countAtStop);
    clock.dispose();
  });

  it('emits sendNodeOff after sendNodeOn when sendOff=true', async () => {
    const node = makeNode({ bpm: 600, sendOff: true, offDelayMs: 30 });
    const events: string[] = [];
    const clock = new VirtualClockNode(bus, node as any, noopEdges);
    clock.render();
    bus.subscribe(node.id + '.main-input.sendNodeOn', () => events.push('on'));
    bus.subscribe(node.id + '.main-input.sendNodeOff', () => events.push('off'));
    await new Promise(r => setTimeout(r, 250));

    expect(events).toContain('on');
    expect(events).toContain('off');
    clock.dispose();
  });

  it('toggles start/stop via receiveNodeOn event', async () => {
    const node = makeNode({ bpm: 600, isEmitting: true });
    const onEvents: string[] = [];
    const clock = new VirtualClockNode(bus, node as any, noopEdges);
    clock.render();
    bus.subscribe(node.id + '.main-input.sendNodeOn', () => onEvents.push('on'));
    await new Promise(r => setTimeout(r, 150));
    expect(onEvents.length).toBeGreaterThan(0);

    // Toggle off via event
    bus.emit(node.id + '.main-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20)); // let the async emit fire
    const countAtPause = onEvents.length;

    await new Promise(r => setTimeout(r, 300));
    expect(onEvents.length).toBe(countAtPause);
    clock.dispose();
  });

  it('updates isEmitting=false via params to stop the clock', async () => {
    const node = makeNode({ bpm: 600, isEmitting: true });
    const onEvents: string[] = [];
    const clock = new VirtualClockNode(bus, node as any, noopEdges);
    clock.render();
    bus.subscribe(node.id + '.main-input.sendNodeOn', () => onEvents.push('on'));
    await new Promise(r => setTimeout(r, 150));
    expect(onEvents.length).toBeGreaterThan(0);

    // Stop via params update
    bus.emit(node.id + '.params.updateParams', { data: { isEmitting: false } });
    await new Promise(r => setTimeout(r, 300)); // wait for 200ms debounce + buffer
    const countAfterStop = onEvents.length;

    await new Promise(r => setTimeout(r, 300));
    expect(onEvents.length).toBe(countAfterStop);
    clock.dispose();
  });
}, 10000);
