import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventManager from '../src/sys/EventManager';

// EventManager uses window.addEventListener/removeEventListener — stub it for Node
const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

const kbEvent = (key: string, repeat = false) =>
  ({ key, repeat } as KeyboardEvent);

describe('EventManager', () => {
  let mgr: EventManager;

  beforeEach(() => {
    (globalThis as any).window = mockWindow;
    EventManager.resetInstance();
    mgr = new EventManager();
  });

  afterEach(() => {
    if (mgr) mgr.destroy();
    EventManager.resetInstance();
  });

  it('addButtonDownCallback fires when matching key is pressed', () => {
    const cb = vi.fn();
    mgr.addButtonDownCallback('A', 'node-1', cb);
    mgr.handleKeyDown(kbEvent('a'));
    expect(cb).toHaveBeenCalledOnce();
  });

  it('is case-insensitive for key matching', () => {
    const cb = vi.fn();
    mgr.addButtonDownCallback('SPACE', 'n1', cb);
    mgr.handleKeyDown(kbEvent('space'));
    expect(cb).toHaveBeenCalledOnce();
  });

  it('does not fire for unregistered keys', () => {
    const cb = vi.fn();
    mgr.addButtonDownCallback('A', 'n1', cb);
    mgr.handleKeyDown(kbEvent('b'));
    expect(cb).not.toHaveBeenCalled();
  });

  it('ignores repeated keydown events', () => {
    const cb = vi.fn();
    mgr.addButtonDownCallback('A', 'n1', cb);
    mgr.handleKeyDown(kbEvent('a', true /* repeat */));
    expect(cb).not.toHaveBeenCalled();
  });

  it('addButtonUpCallback fires on keyup', () => {
    const cb = vi.fn();
    mgr.addButtonUpCallback('B', 'n1', cb);
    mgr.handleKeyUp(kbEvent('b'));
    expect(cb).toHaveBeenCalledOnce();
  });

  it('removeButtonDownCallback stops future keydown events', () => {
    const cb = vi.fn();
    mgr.addButtonDownCallback('C', 'n1', cb);
    mgr.removeButtonDownCallback('C', 'n1');
    mgr.handleKeyDown(kbEvent('c'));
    expect(cb).not.toHaveBeenCalled();
  });

  it('removeButtonUpCallback stops future keyup events', () => {
    const cb = vi.fn();
    mgr.addButtonUpCallback('D', 'n1', cb);
    mgr.removeButtonUpCallback('D', 'n1');
    mgr.handleKeyUp(kbEvent('d'));
    expect(cb).not.toHaveBeenCalled();
  });

  it('fires handleDelete on DELETE keydown', () => {
    const del = vi.fn();
    mgr.setHandleDelete(del);
    mgr.handleKeyDown(kbEvent('Delete'));
    expect(del).toHaveBeenCalledOnce();
  });

  it('clearButtonCallbacks removes all registered callbacks', () => {
    const cb = vi.fn();
    mgr.addButtonDownCallback('E', 'n1', cb);
    mgr.addButtonUpCallback('E', 'n1', cb);
    mgr.clearButtonCallbacks();
    mgr.handleKeyDown(kbEvent('e'));
    mgr.handleKeyUp(kbEvent('e'));
    expect(cb).not.toHaveBeenCalled();
  });

  it('getInstance returns the same singleton', () => {
    const a = EventManager.getInstance();
    const b = EventManager.getInstance();
    expect(a).toBe(b);
  });

  it('resetInstance causes getInstance to create a new instance', () => {
    const a = EventManager.getInstance();
    EventManager.resetInstance();
    const b = EventManager.getInstance();
    expect(a).not.toBe(b);
  });

  it('multiple callbacks per key all fire', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    mgr.addButtonDownCallback('F', 'n1', cb1);
    mgr.addButtonDownCallback('F', 'n2', cb2);
    mgr.handleKeyDown(kbEvent('f'));
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });
});
