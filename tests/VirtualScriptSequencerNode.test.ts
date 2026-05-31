import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualScriptSequencerNode } from '../src/virtualNodes/VirtualScriptSequencerNode';

const makeNode = (script = '', overrides: any = {}) => ({
  id: 'seq-1',
  data: { script, activeLine: 0, vars: {}, tickIntervalMs: 500, inputCount: 0, ...overrides },
});

const tick = (bus: EventBus, nodeId: string) =>
  bus.emit(`${nodeId}.clock.receiveNodeOn`, { intervalMs: 500 });

describe('VirtualScriptSequencerNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('send action emits value on the target handle', async () => {
    const node = makeNode('send out 42');
    new VirtualScriptSequencerNode(undefined as any, bus, node as any);
    const out: any[] = [];
    bus.subscribe(node.id + '.out.sendNodeOn', (d: any) => out.push(d));

    tick(bus, node.id);
    await new Promise(r => setTimeout(r, 30));

    expect(out.length).toBeGreaterThan(0);
    expect(out[0].value).toBe(42);
  });

  it('on action emits sendNodeOn gate', async () => {
    const node = makeNode('on gate');
    new VirtualScriptSequencerNode(undefined as any, bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.gate.sendNodeOn', (d: any) => events.push(d));

    tick(bus, node.id);
    await new Promise(r => setTimeout(r, 30));

    expect(events.length).toBeGreaterThan(0);
  });

  it('off action emits sendNodeOff gate', async () => {
    const node = makeNode('off gate');
    new VirtualScriptSequencerNode(undefined as any, bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.gate.sendNodeOff', (d: any) => events.push(d));

    tick(bus, node.id);
    await new Promise(r => setTimeout(r, 30));

    expect(events.length).toBeGreaterThan(0);
  });

  it('advances line cursor on each tick (tracked via node.data.activeLine)', async () => {
    const script = 'send a 1\nsend b 2\nsend c 3';
    const node = makeNode(script);
    new VirtualScriptSequencerNode(undefined as any, bus, node as any);

    tick(bus, node.id); // executes line 0, cursor → 1
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.activeLine).toBe(1);

    tick(bus, node.id); // executes line 1, cursor → 2
    await new Promise(r => setTimeout(r, 20));
    expect(node.data.activeLine).toBe(2);
  });

  it('wraps cursor back to line 0 after last line', async () => {
    const script = 'send a 1\nsend b 2';
    const node = makeNode(script);
    new VirtualScriptSequencerNode(undefined as any, bus, node as any);

    tick(bus, node.id); // line 0 → cursor 1
    tick(bus, node.id); // line 1 → cursor 0
    await new Promise(r => setTimeout(r, 30));

    expect(node.data.activeLine).toBe(0);
  });

  it('reset event resets cursor to line 0', async () => {
    const script = 'send a 1\nsend b 2\nsend c 3';
    const node = makeNode(script);
    new VirtualScriptSequencerNode(undefined as any, bus, node as any);

    tick(bus, node.id);
    tick(bus, node.id);
    await new Promise(r => setTimeout(r, 20));

    bus.emit(node.id + '.reset.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect(node.data.activeLine).toBe(0);
  });

  it('comment lines are skipped (no output)', async () => {
    const node = makeNode('// this is a comment\nsend out 7');
    new VirtualScriptSequencerNode(undefined as any, bus, node as any);
    const out: any[] = [];
    bus.subscribe(node.id + '.out.sendNodeOn', (d: any) => out.push(d));

    tick(bus, node.id); // comment line — no output
    await new Promise(r => setTimeout(r, 20));
    expect(out.length).toBe(0);

    tick(bus, node.id); // send line
    await new Promise(r => setTimeout(r, 20));
    expect(out.length).toBeGreaterThan(0);
  });

  it('params update changes script', async () => {
    const node = makeNode('send a 1');
    new VirtualScriptSequencerNode(undefined as any, bus, node as any);

    bus.emit(node.id + '.params.updateParams', { data: { script: 'send b 99' } });
    await new Promise(r => setTimeout(r, 10));

    const out: any[] = [];
    bus.subscribe(node.id + '.b.sendNodeOn', (d: any) => out.push(d));

    tick(bus, node.id);
    await new Promise(r => setTimeout(r, 30));

    expect(out.length).toBeGreaterThan(0);
    expect(out[0].value).toBe(99);
  });

  it('pulse action emits ON then OFF after delay', async () => {
    const node = makeNode('pulse gate 50ms');
    new VirtualScriptSequencerNode(undefined as any, bus, node as any);
    const onEvents: any[] = [];
    const offEvents: any[] = [];
    bus.subscribe(node.id + '.gate.sendNodeOn', (d: any) => onEvents.push(d));
    bus.subscribe(node.id + '.gate.sendNodeOff', (d: any) => offEvents.push(d));

    tick(bus, node.id);
    await new Promise(r => setTimeout(r, 200));

    expect(onEvents.length).toBeGreaterThan(0);
    expect(offEvents.length).toBeGreaterThan(0);
  });

  it('multiple actions on one line via semicolons', async () => {
    const node = makeNode('send x 1; send y 2');
    new VirtualScriptSequencerNode(undefined as any, bus, node as any);
    const x: any[] = [];
    const y: any[] = [];
    bus.subscribe(node.id + '.x.sendNodeOn', (d: any) => x.push(d));
    bus.subscribe(node.id + '.y.sendNodeOn', (d: any) => y.push(d));

    tick(bus, node.id);
    await new Promise(r => setTimeout(r, 30));

    expect(x.length).toBeGreaterThan(0);
    expect(y.length).toBeGreaterThan(0);
  });
}, 10000);
