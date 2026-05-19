import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualButtonNode } from '../src/virtualNodes/VirtualButtonNode';

const mockWindow = { addEventListener: vi.fn(), removeEventListener: vi.fn() };

const mkNode = (overrides: any = {}) => ({
  id: 'node-1.ButtonFlowNode',
  data: {
    id: 'node-1.ButtonFlowNode',
    label: 'Button',
    assignedKey: 'A',
    style: {},
    onChange: () => {},
    dispatchEvent: () => {},
    ...overrides,
  },
});

const mkEventManager = () => ({
  removeButtonDownCallback: vi.fn(),
  removeButtonUpCallback: vi.fn(),
  addButtonDownCallback: vi.fn(),
  addButtonUpCallback: vi.fn(),
} as any);

describe('VirtualButtonNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    (globalThis as any).window = mockWindow;
    bus = new (EventBus as any)();
  });

  afterEach(() => {
    bus.clear();
  });

  it('triggerOn emits sendNodeOn on the bus', async () => {
    const node = mkNode();
    const evMgr = mkEventManager();
    const v = new VirtualButtonNode(evMgr, bus, node as any);
    const events: string[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', () => events.push('on'));

    v.triggerOn();
    await new Promise(r => setTimeout(r, 10));
    expect(events).toContain('on');
  });

  it('triggerOff emits sendNodeOff on the bus', async () => {
    const node = mkNode();
    const evMgr = mkEventManager();
    const v = new VirtualButtonNode(evMgr, bus, node as any);
    const events: string[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOff', () => events.push('off'));

    v.triggerOff();
    await new Promise(r => setTimeout(r, 10));
    expect(events).toContain('off');
  });

  it('subscribeOnOff fires onHandler when sendNodeOn is emitted', async () => {
    const node = mkNode();
    const evMgr = mkEventManager();
    const v = new VirtualButtonNode(evMgr, bus, node as any);
    const onSpy = vi.fn();
    const offSpy = vi.fn();
    v.subscribeOnOff(onSpy, offSpy);

    v.triggerOn();
    await new Promise(r => setTimeout(r, 10));
    expect(onSpy).toHaveBeenCalledOnce();
    expect(offSpy).not.toHaveBeenCalled();
  });

  it('subscribeOnOff fires offHandler when sendNodeOff is emitted', async () => {
    const node = mkNode();
    const evMgr = mkEventManager();
    const v = new VirtualButtonNode(evMgr, bus, node as any);
    const onSpy = vi.fn();
    const offSpy = vi.fn();
    v.subscribeOnOff(onSpy, offSpy);

    v.triggerOff();
    await new Promise(r => setTimeout(r, 10));
    expect(offSpy).toHaveBeenCalledOnce();
    expect(onSpy).not.toHaveBeenCalled();
  });

  it('render registers keyboard callbacks with the event manager', () => {
    const node = mkNode({ assignedKey: 'B' });
    const evMgr = mkEventManager();
    const v = new VirtualButtonNode(evMgr, bus, node as any);
    v.render('B');
    expect(evMgr.addButtonDownCallback).toHaveBeenCalledWith('B', node.id, expect.any(Function));
    expect(evMgr.addButtonUpCallback).toHaveBeenCalledWith('B', node.id, expect.any(Function));
  });

  it('render removes old keyboard callbacks before adding new ones', () => {
    const node = mkNode({ assignedKey: 'C' });
    const evMgr = mkEventManager();
    const v = new VirtualButtonNode(evMgr, bus, node as any);
    v.render('C');
    expect(evMgr.removeButtonDownCallback).toHaveBeenCalled();
    expect(evMgr.removeButtonUpCallback).toHaveBeenCalled();
  });
});
