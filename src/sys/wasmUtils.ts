const cache = new Map<string, WebAssembly.Module>();

export async function compileWasmModule(url: string): Promise<WebAssembly.Module> {
  if (cache.has(url)) return cache.get(url)!;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch WASM: ${url} (${resp.status})`);
  const module = await WebAssembly.compileStreaming(resp);
  cache.set(url, module);
  return module;
}
