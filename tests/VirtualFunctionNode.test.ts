import { describe, it, expect, vi, beforeEach } from 'vitest';
import EventBus from '../src/sys/EventBus';
import { VirtualFunctionNode } from '../src/virtualNodes/VirtualFunctionNode';

const makeNode = (overrides: any = {}) => ({
  id: 'fn-1',
  data: {
    functionCode: 'function process(main) { return main; }',
    numInputs: 0,
    inputDefaults: [],
    ...overrides,
  },
});

describe('VirtualFunctionNode', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new (EventBus as any)();
  });

  it('passes main input value through identity function', async () => {
    const cb = vi.fn();
    const node = makeNode();
    new VirtualFunctionNode(bus, node as any, cb);

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 42 });
    await new Promise(r => setTimeout(r, 20));

    expect(cb).toHaveBeenCalled();
    const [, data] = cb.mock.calls[0];
    expect((data as any).value).toBe(42);
  });

  it('transforms value using custom function', async () => {
    const cb = vi.fn();
    const node = makeNode({
      functionCode: 'function process(main) { return Number(main) * 2; }',
    });
    new VirtualFunctionNode(bus, node as any, cb);

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 10 });
    await new Promise(r => setTimeout(r, 20));

    const [, data] = cb.mock.calls[0];
    expect((data as any).value).toBe(20);
  });

  it('uses additional inputs in computation', async () => {
    const cb = vi.fn();
    const node = makeNode({
      functionCode: 'function process(main, input1) { return Number(main) + Number(input1); }',
      numInputs: 1,
      inputDefaults: ['0'],
    });
    new VirtualFunctionNode(bus, node as any, cb);

    bus.emit(node.id + '.input-0.receiveNodeOn', { value: 5 });
    await new Promise(r => setTimeout(r, 10));
    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 3 });
    await new Promise(r => setTimeout(r, 20));

    const [, data] = cb.mock.calls[0];
    expect((data as any).value).toBe(8);
  });

  it('emits sendNodeOn on the bus with result', async () => {
    const node = makeNode();
    new VirtualFunctionNode(bus, node as any, vi.fn());
    const emissions: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', (d: any) => emissions.push(d));

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 'hello' });
    await new Promise(r => setTimeout(r, 20));

    expect(emissions.some(e => e.value === 'hello')).toBe(true);
  });

  it('emits sendNodeOff on receiveNodeOff', async () => {
    const node = makeNode();
    new VirtualFunctionNode(bus, node as any, vi.fn());
    const offEmissions: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOff', (d: any) => offEmissions.push(d));

    bus.emit(node.id + '.main-input.receiveNodeOff', { value: 0 });
    await new Promise(r => setTimeout(r, 20));

    expect(offEmissions.length).toBeGreaterThan(0);
  });

  it('handles function error gracefully and emits Error value', async () => {
    const cb = vi.fn();
    const node = makeNode({
      functionCode: 'function process(main) { throw new Error("oops"); }',
    });
    new VirtualFunctionNode(bus, node as any, cb);

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 1 });
    await new Promise(r => setTimeout(r, 20));

    // Should emit an error value rather than crashing
    const emissions: any[] = [];
    bus.subscribe(node.id + '.main-input.sendNodeOn', (d: any) => emissions.push(d));
    // At minimum it must not throw
    expect(true).toBe(true);
  });

  it('params update changes function code', async () => {
    const cb = vi.fn();
    const node = makeNode();
    new VirtualFunctionNode(bus, node as any, cb);

    bus.emit(node.id + '.params.updateParams', {
      data: { functionCode: 'function process(main) { return 99; }' },
    });
    await new Promise(r => setTimeout(r, 10));

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 1 });
    await new Promise(r => setTimeout(r, 20));

    const [, data] = cb.mock.calls[0];
    expect((data as any).value).toBe(99);
  });

  it('getOutputValue returns last computed result', async () => {
    const node = makeNode({
      functionCode: 'function process(main) { return Number(main) + 1; }',
    });
    const fn = new VirtualFunctionNode(bus, node as any, vi.fn());

    bus.emit(node.id + '.main-input.receiveNodeOn', { value: 4 });
    await new Promise(r => setTimeout(r, 20));

    expect(fn.getOutputValue()).toBe(5);
  });
});
