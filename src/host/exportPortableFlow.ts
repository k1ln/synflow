import { browserFlowLoader } from './browserFlowLoader';
import { browserAssetStore } from './browserAssetStore';
import { compileWorkletToWasm } from './compileWorklet';
import { generateWorkletShim } from './workletWasmShim';

// Produce a self-contained ("portable") flow: every FlowNode sub-flow is inlined
// into data.embeddedFlow (recursively), every disk-backed SampleFlowNode has its
// audio embedded as base64 in data.arrayBuffer, and every AudioWorklet authored in
// AssemblyScript is compiled to canonical-ABI wasm embedded in data.wasmBase64 (with
// a JS shim set as processorCode so the browser runs the same module). The result
// plays in any host — Web Audio OR the native plugin — with no loader/assets/toolchain.

type Flow = { nodes: any[]; edges: any[] };

function abToBase64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

async function resolveNode(node: any, seen: Set<string>): Promise<any> {
  const out = { ...node, data: { ...(node.data || {}) } };
  // onChange is a runtime function — never serialize it.
  if (out.data.onChange) delete out.data.onChange;

  if (node.type === 'FlowNode' && out.data.selectedNode && !out.data.embeddedFlow) {
    const key = `${out.data.selectedNodeFolderPath || ''}/${out.data.selectedNode}`;
    if (!seen.has(key)) {
      const sub = await browserFlowLoader(out.data.selectedNode, out.data.selectedNodeFolderPath || '');
      if (sub) {
        out.data.embeddedFlow = await resolveFlow(sub, new Set(seen).add(key));
      }
    }
  }

  if (node.type === 'SampleFlowNode' && out.data.diskFileName && !out.data.arrayBuffer) {
    const buf = await browserAssetStore.loadAudio(out.data.diskFileName);
    if (buf) {
      out.data.arrayBuffer = abToBase64(buf);
      out.data.diskFileName = undefined;
    }
  }

  // AudioWorklet authored in AssemblyScript -> compile to canonical-ABI wasm so the
  // native plugin can host it, and run the same bytes in the browser via a JS shim.
  if (node.type === 'AudioWorkletFlowNode' && out.data.assemblyScript && !out.data.wasmBase64) {
    try {
      const { base64 } = await compileWorkletToWasm(out.data.assemblyScript);
      out.data.wasmBase64 = base64;
      out.data.processorCode = generateWorkletShim(base64); // web runs the same wasm
    } catch (e) {
      // Leave the node as-is (keeps its existing JS processorCode); surface the error.
      console.warn('[exportPortableFlow] worklet compile failed for', node.id, e);
    }
  }

  return out;
}

async function resolveFlow(flow: Flow, seen: Set<string>): Promise<Flow> {
  const nodes = [];
  for (const node of flow.nodes || []) nodes.push(await resolveNode(node, seen));
  return { nodes, edges: flow.edges || [] };
}

/** Resolve a flow into a self-contained, portable flow. */
export async function exportPortableFlow(flow: Flow): Promise<Flow> {
  return resolveFlow(flow, new Set());
}

/** Convenience: build a portable flow and trigger a browser download. */
export async function downloadPortableFlow(flow: Flow, filename = 'flow.portable.json'): Promise<void> {
  const portable = await exportPortableFlow(flow);
  const blob = new Blob([JSON.stringify(portable, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
}
