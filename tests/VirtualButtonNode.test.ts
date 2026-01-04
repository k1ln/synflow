import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualButtonNode } from '../src/virtualNodes/VirtualButtonNode';

describe('VirtualButtonNode retrigger', () => {
  let bus: EventBus;
  const mkNode = (overrides: any = {}) => ({
    id: 'node-1.ButtonFlowNode',
    data: {
      id: 'node-1.ButtonFlowNode',
      label: 'Button',
      assignedKey: null,
      enableRetriggering: true,
      isRetriggering: true,
      retriggerFrequency: 20, // 20 Hz → 50ms period
      retriggerLength: 0.01,  // 10ms pulse
      style: {},
      onChange: () => {},
      dispatchEvent: () => {},
      ...overrides,
    },
  });

  beforeEach(() => {
    vi.useFakeTimers();
    bus = EventBus.getInstance();
    bus.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    bus.clear();
  });

  it('emits periodic sendNodeOn/off when retrigger enabled', () => {
    const node = mkNode();
    const evMgr = {
      removeButtonDownCallback: () => {},
      removeButtonUpCallback: () => {},
      addButtonDownCallback: () => {},
      addButtonUpCallback: () => {},
    } as any;
    const onSpy = vi.fn();
    const offSpy = vi.fn();
    const v = new VirtualButtonNode(evMgr as any, bus, node as any);
    v.render();
    v.subscribeOnOff(() => onSpy(), () => offSpy());

    // Immediately fires one pulse on start
    vi.advanceTimersByTime(1);
    // Advance 200ms → expect about 4 periods at 50ms
    vi.advanceTimersByTime(200);
    expect(onSpy.mock.calls.length).toBeGreaterThan(0);
    expect(offSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('fires single pulse on retrigger-input.receiveNodeOn', () => {
    const node = mkNode({ isRetriggering: false });
    const evMgr = {
      removeButtonDownCallback: () => {},
      removeButtonUpCallback: () => {},
      addButtonDownCallback: () => {},
      addButtonUpCallback: () => {},
    } as any;
    const onSpy = vi.fn();
    const offSpy = vi.fn();
    const v = new VirtualButtonNode(evMgr as any, bus, node as any);
    v.render();
    v.subscribeOnOff(() => onSpy(), () => offSpy());
    bus.emit(node.id + '.retrigger-input.receiveNodeOn', { nodeid: node.id });
    vi.advanceTimersByTime(20);
    expect(onSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20);
    expect(offSpy.mock.calls.length).toBeGreaterThan(0);
  });
});
