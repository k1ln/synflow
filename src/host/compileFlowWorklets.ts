// (Re)compile the AssemblyScript AudioWorklet nodes in a flow whose canonical-ABI
// WASM is missing or stale, in place on each node's `data`. Compilation runs in the
// browser / plugin webview via the bundled `assemblyscript/asc` (see compileWorklet.ts)
// — NO Node.js is involved. The native plugin editor calls this before shipping the
// flow to the C++ engine, so editing a worklet's source and saving recompiles it and
// the engine picks up the fresh bytes (node.data.wasmBase64, read by WasmWorkletNode).
//
// Staleness: compiling stamps `data._wasmSrc` with the exact source the wasm was built
// from; a node is dirty when its current `data.assemblyScript` differs (the worklet
// node UI mutates data.assemblyScript on every keystroke) or no wasm exists yet.
export async function compileDirtyWorklets(nodes: any[] | null | undefined): Promise<number> {
  if (!Array.isArray(nodes)) return 0;
  const dirty = nodes.filter((n) => {
    const src = n?.data?.assemblyScript;
    return n?.type === 'AudioWorkletFlowNode'
      && typeof src === 'string' && src.trim().length > 0
      && (!n.data.wasmBase64 || n.data._wasmSrc !== src);
  });
  if (!dirty.length) return 0;

  // Lazy-load the (large) asc compiler + shim generator only when there's work.
  const [{ compileWorkletToWasm }, { generateWorkletShim }] = await Promise.all([
    import('./compileWorklet'),
    import('./workletWasmShim'),
  ]);

  let compiled = 0;
  for (const n of dirty) {
    const src = n.data.assemblyScript as string;
    try {
      const { base64 } = await compileWorkletToWasm(src);
      n.data.wasmBase64 = base64;
      n.data.processorCode = generateWorkletShim(base64); // web worklet runs the same bytes
      n.data._wasmSrc = src;                              // mark wasm current for this source
      compiled++;
    } catch (e) {
      console.warn('[compileDirtyWorklets] compile failed for node', n?.id, e);
    }
  }
  return compiled;
}
