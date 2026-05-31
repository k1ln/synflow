import { describe, it, expect, vi, beforeEach } from 'vitest';

// compileWasmModule uses a module-level Map cache; reimport each test suite run
// by resetting modules so the cache starts empty.
vi.mock('../src/sys/wasmUtils', async (importOriginal) => {
  // We want the real implementation but with fetch / WebAssembly mocked globally.
  return importOriginal();
});

const fakeModule = {} as WebAssembly.Module;

const mockFetchOk = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      // compileWasmModule uses WebAssembly.compileStreaming which receives the Response
    } as Response)
  );

const mockCompileStreaming = (result: WebAssembly.Module) =>
  vi.stubGlobal('WebAssembly', {
    compileStreaming: vi.fn().mockResolvedValue(result),
  });

describe('wasmUtils.compileWasmModule', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    // Reset the module-level cache by re-importing a fresh copy
    vi.resetModules();
  });

  it('fetches and compiles a WASM module', async () => {
    mockFetchOk();
    mockCompileStreaming(fakeModule);
    const { compileWasmModule } = await import('../src/sys/wasmUtils');
    const result = await compileWasmModule('/test.wasm');
    expect(result).toBe(fakeModule);
    expect((globalThis as any).fetch).toHaveBeenCalledWith('/test.wasm');
  });

  it('returns the cached module on a second call without re-fetching', async () => {
    mockFetchOk();
    mockCompileStreaming(fakeModule);
    const { compileWasmModule } = await import('../src/sys/wasmUtils');
    await compileWasmModule('/cached.wasm');
    await compileWasmModule('/cached.wasm');
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('throws when fetch returns a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response)
    );
    mockCompileStreaming(fakeModule);
    const { compileWasmModule } = await import('../src/sys/wasmUtils');
    await expect(compileWasmModule('/missing.wasm')).rejects.toThrow('404');
  });

  it('caches different URLs independently', async () => {
    mockFetchOk();
    mockCompileStreaming(fakeModule);
    const { compileWasmModule } = await import('../src/sys/wasmUtils');
    await compileWasmModule('/a.wasm');
    await compileWasmModule('/b.wasm');
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(2);
  });
});
