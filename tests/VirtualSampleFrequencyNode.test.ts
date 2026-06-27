import { test, expect } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualSampleFrequencyNode } from '../src/virtualNodes/VirtualSampleFrequencyNode';

const makeNode = (overrides: any = {}) => ({
  id: 'vsampleFreq1',
  type: 'VirtualSampleFrequencyNode',
  data: { squares: 4, activeIndex: 0, pattern: [true, true, true, true], defaultPulseMs: 10, ...overrides }
});

test('VirtualSampleFrequencyNode emits on then off pulse for active step', async () => {
  const eventBus = EventBus.getInstance();
  const node = makeNode();
  const v = new VirtualSampleFrequencyNode(undefined as any, eventBus, node as any);
  const events: string[] = [];
  eventBus.subscribe(node.id + '.main-input.sendNodeOn', () => events.push('on'));
  eventBus.subscribe(node.id + '.main-input.sendNodeOff', () => events.push('off'));
  v.advance();
  await new Promise(r => setTimeout(r, 30));
  expect(events[0]).toBe('on');
  expect(events[1]).toBe('off');
});
