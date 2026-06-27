import { test, expect } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualSampleNode } from '../src/virtualNodes/VirtualSampleNode';

// Minimal stubs
const makeNode = (overrides: any = {}) => ({
  id: 'vsample1',
  type: 'VirtualSampleNode',
  data: { squares: 4, activeIndex: 0, pattern: [true, true, true, true], ...overrides }
});

test('VirtualSampleNode emits on then off pulse', async () => {
  const eventBus = EventBus.getInstance();
  const node = makeNode();
  const v = new VirtualSampleNode(undefined as any, eventBus, node as any);
  const events: string[] = [];
  eventBus.subscribe(node.id + '.main-input.sendNodeOn', () => events.push('on'));
  eventBus.subscribe(node.id + '.main-input.sendNodeOff', () => events.push('off'));
  v.advance();
  await new Promise(r => setTimeout(r, 30));
  expect(events[0]).toBe('on');
  expect(events[1]).toBe('off');
});
