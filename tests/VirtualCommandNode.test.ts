import { describe, it, expect } from 'vitest';
import EventBus from '../packages/core/src/EventBus';
import VirtualCommandInNode from '../packages/core/src/virtualNodes/VirtualCommandInNode';
import VirtualCommandOutNode from '../packages/core/src/virtualNodes/VirtualCommandOutNode';

const tick = () => new Promise((r) => setTimeout(r, 5)); // EventBus.emit dispatches via setTimeout(0)

describe('VirtualCommandInNode', () => {
  it('forwards command.<name> into the graph as receiveNodeOn / receiveNodeOff', async () => {
    const bus = new EventBus(); // per-instance bus (multi-instance isolation)
    const calls: Array<{ ev: string; data: any }> = [];
    const node: any = { id: 'a.CommandInFlowNode', type: 'CommandInFlowNode', data: { commandName: 'play', kind: 'trigger' } };
    new VirtualCommandInNode(bus, node, (_n, data, ev) => calls.push({ ev, data }));

    bus.emit('command.play', { value: 1, note: 'C4', velocity: 100 });
    bus.emit('command.play', { type: 'off' });
    await tick();

    expect(calls.length).toBe(2);
    expect(calls[0].ev).toBe('receiveNodeOn');
    expect(calls[0].data.value).toBe(1);
    expect(calls[0].data.note).toBe('C4');
    expect(calls[1].ev).toBe('receiveNodeOff');
  });

  it('ignores commands once the commandName changes via params', async () => {
    const bus = new EventBus();
    const calls: any[] = [];
    const node: any = { id: 'b.CommandInFlowNode', type: 'CommandInFlowNode', data: { commandName: 'old' } };
    new VirtualCommandInNode(bus, node, (_n, d) => calls.push(d));
    bus.emit('b.CommandInFlowNode.params.updateParams', { data: { commandName: 'new' } });
    await tick();
    bus.emit('command.old', { value: 1 }); // should no longer match
    bus.emit('command.new', { value: 2 });
    await tick();
    expect(calls.length).toBe(1);
    expect(calls[0].value).toBe(2);
  });
});

describe('VirtualCommandOutNode', () => {
  it('forwards graph input to commandOut.<name> for the host', async () => {
    const bus = new EventBus();
    const received: any[] = [];
    const node: any = { id: 'c.CommandOutFlowNode', type: 'CommandOutFlowNode', data: { commandName: 'level' } };
    new VirtualCommandOutNode(bus, node);
    bus.subscribe('commandOut.level', (p) => received.push(p));

    bus.emit('c.CommandOutFlowNode.input.receiveNodeOn', { value: 0.5 });
    await tick();

    expect(received.length).toBe(1);
    expect(received[0].value).toBe(0.5);
    expect(received[0].type).toBe('on');
  });
});
