import { describe, it, expect, vi, beforeEach } from 'vitest';

// No File System Access in the test env — force the loader down the IndexedDB path.
vi.mock('../src/util/FileSystemAudioStore', async () => {
  const actual = await vi.importActual<typeof import('../src/util/FileSystemAudioStore')>(
    '../src/util/FileSystemAudioStore'
  );
  return { ...actual, loadRootHandle: async () => null, loadFlowFromDisk: async () => null };
});

// In-memory stand-in for the flows object store.
const store = new Map<string, any>();
vi.mock('../src/util/SimpleIndexedDB', () => ({
  SimpleIndexedDB: class {
    async get(key: string) {
      if (key === '*') return [...store.values()];
      return store.has(key) ? [store.get(key)] : [];
    }
  },
}));

async function loader() {
  const mod = await import('../src/host/browserFlowLoader');
  return mod.browserFlowLoader;
}

describe('browserFlowLoader', () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
  });

  it('resolves an exact folder/name key', async () => {
    store.set('examples/keyboard', { id: 'examples/keyboard', nodes: [{ id: 'a' }], edges: [] });
    const flow = await (await loader())('keyboard', 'examples');
    expect(flow?.nodes).toEqual([{ id: 'a' }]);
  });

  it('resolves a folder-less reference by matching the key basename', async () => {
    // Hard-Synth references its sub-flows as just "keyboard" / "kick", but the
    // bundled copies are seeded under the "examples" folder.
    store.set('examples/keyboard', { id: 'examples/keyboard', nodes: [{ id: 'kb' }], edges: [] });
    store.set('examples/kick', { id: 'examples/kick', nodes: [{ id: 'kk' }], edges: [] });

    const load = await loader();
    expect((await load('keyboard', ''))?.nodes).toEqual([{ id: 'kb' }]);
    expect((await load('kick', ''))?.nodes).toEqual([{ id: 'kk' }]);
  });

  it('returns null when nothing matches by key or basename', async () => {
    store.set('examples/keyboard', { id: 'examples/keyboard', nodes: [], edges: [] });
    expect(await (await loader())('does-not-exist', '')).toBeNull();
  });
});
