import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualOnOffButtonNode } from '../src/virtualNodes/VirtualOnOffButtonNode';

const mockAudioContext = () => ({
  createGain: () => ({
    gain: { value: 1 },
    connect: () => {},
    disconnect: () => {},
  }),
} as any);

const makeNode = (isOn = true, overrides: any = {}) => ({
  id: 'onoff-1',
  data: { isOn, ...overrides },
});

describe('VirtualOnOffButtonNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('forwards receiveNodeOn when gate is open (isOn=true)', async () => {
    const node = makeNode(true);
    new VirtualOnOffButtonNode(mockAudioContext(), bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', (d: any) => events.push(d));

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 1 });
    await new Promise(r => setTimeout(r, 20));

    expect(events.length).toBe(1);
  });

  it('blocks receiveNodeOn when gate is closed (isOn=false)', async () => {
    const node = makeNode(false);
    new VirtualOnOffButtonNode(mockAudioContext(), bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', (d: any) => events.push(d));

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 1 });
    await new Promise(r => setTimeout(r, 20));

    expect(events.length).toBe(0);
  });

  it('forwards receiveNodeOff when gate is open', async () => {
    const node = makeNode(true);
    new VirtualOnOffButtonNode(mockAudioContext(), bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOff', (d: any) => events.push(d));

    bus.emit(node.id + '.main-input.receiveNodeOff', { value: 0 });
    await new Promise(r => setTimeout(r, 20));

    expect(events.length).toBe(1);
  });

  it('toggle-input flips gate state', async () => {
    const node = makeNode(true);
    new VirtualOnOffButtonNode(mockAudioContext(), bus, node as any);

    bus.emit(node.id + '.toggle-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect((node.data as any).isOn).toBe(false);
  });

  it('toggle-input twice returns to original state', async () => {
    const node = makeNode(true);
    new VirtualOnOffButtonNode(mockAudioContext(), bus, node as any);

    bus.emit(node.id + '.toggle-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 10));
    bus.emit(node.id + '.toggle-input.receiveNodeOn', {});
    await new Promise(r => setTimeout(r, 20));

    expect((node.data as any).isOn).toBe(true);
  });

  it('params update changes isOn', async () => {
    const node = makeNode(true);
    new VirtualOnOffButtonNode(mockAudioContext(), bus, node as any);

    bus.emit(node.id + '.params.updateParams', { data: { isOn: false } });
    await new Promise(r => setTimeout(r, 20));

    expect((node.data as any).isOn).toBe(false);
  });

  it('manual triggerOn forwards event when gate is open', async () => {
    const node = makeNode(true);
    new VirtualOnOffButtonNode(mockAudioContext(), bus, node as any);
    const events: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', (d: any) => events.push(d));

    bus.emit(node.id + '.manual.triggerOn', { value: 42 });
    await new Promise(r => setTimeout(r, 20));

    expect(events.length).toBe(1);
    expect(events[0].manual).toBe(true);
  });
});
