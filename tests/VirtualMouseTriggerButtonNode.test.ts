import { describe, it, expect, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualMouseTriggerButtonNode } from '../src/virtualNodes/VirtualMouseTriggerButtonNode';

const makeNode = (overrides: any = {}) => ({
  id: 'mouse-btn-1',
  data: { id: 'mouse-btn-1', label: 'Click me', ...overrides },
});

describe('VirtualMouseTriggerButtonNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('constructs without throwing', () => {
    expect(() => new VirtualMouseTriggerButtonNode(bus, makeNode() as any)).not.toThrow();
  });

  it('render() does not throw', () => {
    const n = new VirtualMouseTriggerButtonNode(bus, makeNode() as any);
    expect(() => n.render()).not.toThrow();
  });

  it('has no audioNode (pure event node)', () => {
    const n = new VirtualMouseTriggerButtonNode(bus, makeNode() as any);
    expect(n.audioNode).toBeUndefined();
  });

  it('node id is stored correctly', () => {
    const node = makeNode();
    const n = new VirtualMouseTriggerButtonNode(bus, node as any);
    expect(n.node.id).toBe('mouse-btn-1');
  });
});
