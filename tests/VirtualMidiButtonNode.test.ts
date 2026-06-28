import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualMidiButtonNode } from '../src/virtualNodes/VirtualMidiButtonNode';

// Stub EventManager — only key binding calls matter; MIDI setup is async/browser-only
const mkEvtMgr = () => ({
  addButtonDownCallback: vi.fn(),
  addButtonUpCallback: vi.fn(),
  removeButtonDownCallback: vi.fn(),
  removeButtonUpCallback: vi.fn(),
} as any);

// Stub MidiManager to prevent real WebMIDI access
vi.mock('../src/components/MidiManager', () => ({
  default: {
    getInstance: () => ({
      ensureAccess: async () => {},
      onMessage: () => () => {},
      cancelButtonLearn: () => {},
    }),
  },
}));

const makeNode = (overrides: any = {}) => ({
  id: 'midibtn-1',
  data: { assignedKey: 'A', ...overrides },
});

describe('VirtualMidiButtonNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('render registers keyboard callbacks with event manager', () => {
    const node = makeNode({ assignedKey: 'B' });
    const em = mkEvtMgr();
    const v = new VirtualMidiButtonNode(em, bus, node as any);
    v.render();
    expect(em.addButtonDownCallback).toHaveBeenCalledWith('B', node.id, expect.any(Function));
    expect(em.addButtonUpCallback).toHaveBeenCalledWith('B', node.id, expect.any(Function));
  });

  it('render removes old key binding before registering new', () => {
    const node = makeNode({ assignedKey: 'C' });
    const em = mkEvtMgr();
    const v = new VirtualMidiButtonNode(em, bus, node as any);
    v.render();
    expect(em.removeButtonDownCallback).toHaveBeenCalled();
    expect(em.removeButtonUpCallback).toHaveBeenCalled();
  });

  it('subscribeOnOff fires onHandler when sendNodeOn emitted', async () => {
    const node = makeNode();
    const em = mkEvtMgr();
    const v = new VirtualMidiButtonNode(em, bus, node as any);
    v.render();
    const onSpy = vi.fn();
    const offSpy = vi.fn();
    v.subscribeOnOff(onSpy, offSpy);

    bus.emit(node.id + '.main-input.sendNodeOn', { nodeid: node.id });
    await new Promise(r => setTimeout(r, 20));

    expect(onSpy).toHaveBeenCalledOnce();
    expect(offSpy).not.toHaveBeenCalled();
  });

  it('subscribeOnOff fires offHandler when sendNodeOff emitted', async () => {
    const node = makeNode();
    const em = mkEvtMgr();
    const v = new VirtualMidiButtonNode(em, bus, node as any);
    v.render();
    const onSpy = vi.fn();
    const offSpy = vi.fn();
    v.subscribeOnOff(onSpy, offSpy);

    bus.emit(node.id + '.main-input.sendNodeOff', { nodeid: node.id });
    await new Promise(r => setTimeout(r, 20));

    expect(offSpy).toHaveBeenCalledOnce();
    expect(onSpy).not.toHaveBeenCalled();
  });

  it('params update changes assignedKey on node data', async () => {
    const node = makeNode({ assignedKey: 'D' });
    const em = mkEvtMgr();
    const v = new VirtualMidiButtonNode(em, bus, node as any);
    v.render();

    bus.emit(node.id + '.params.updateParams', { data: { assignedKey: 'E' } });
    await new Promise(r => setTimeout(r, 20));

    expect((node.data as any).assignedKey).toBe('E');
  });
});
