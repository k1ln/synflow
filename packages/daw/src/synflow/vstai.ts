// VibeSynth (VibePlugin) gallery client + ".vstai" → Synflow-flow builders for the
// DAW. A .vstai is an "AI VST": DSP written by Claude, compiled to WASM; the DAW
// hosts it via @synflow/core's VirtualVstaiNode (web) / VstaiNode (native), so no
// VST3 hosting is needed — the compiled bytes embed straight into the flow JSON.
import type { Flow } from './instruments';

const GALLERY_BASE = 'https://k1ln.github.io/VibePlugin/gallery';

export type GalleryItem = {
  id: string;
  slug: string;
  name: string;
  isInstrument: boolean;
  explanation?: string;
  params?: number;
};

/** Fetch the public gallery catalogue (CORS: allow-*). */
export async function fetchGalleryIndex(): Promise<GalleryItem[]> {
  const res = await fetch(`${GALLERY_BASE}/data/index.json`);
  if (!res.ok) throw new Error(`Gallery unreachable (HTTP ${res.status}).`);
  return (await res.json()) as GalleryItem[];
}

/** Download one .vstai document (parsed JSON with wasmBase64/params/…). Files are
 *  published under the item's `id`; the catalogue's `slug` usually matches but can
 *  diverge (e.g. "VibeSynth" → slug "vibesynth" yet file "vibe-synth.vstai"), so try
 *  the slug then fall back to the id — either resolves the same document. */
export async function downloadVstai(slug: string, id?: string): Promise<any> {
  const names = [slug, id].filter((n, i, a): n is string => !!n && a.indexOf(n) === i);
  let status = 0;
  for (const name of names) {
    const res = await fetch(`${GALLERY_BASE}/data/${encodeURIComponent(name)}.vstai`);
    if (res.ok) return await res.json();
    status = res.status;
  }
  throw new Error(`Download failed (HTTP ${status || 404}).`);
}

/** Rendered-GUI thumbnail for a gallery item. */
export function galleryShotUrl(id: string): string {
  return `${GALLERY_BASE}/shots/${id}.jpg`;
}

/** The AiVstFlowNode data block shared by instrument + effect flows. */
function vstaiNodeData(doc: any, name: string): Record<string, any> {
  const params: any[] = Array.isArray(doc.params) ? doc.params : [];
  const data: Record<string, any> = {
    label: name,
    vstaiName: name,
    wasmBase64: String(doc.wasmBase64),
    html: typeof doc.html === 'string' ? doc.html : undefined,   // the plugin's own GUI
    isInstrument: !!doc.isInstrument,
    knobs: params.map((p) => ({
      param: `param${p.index}`,
      label: String(p.name ?? `Param ${p.index}`),
      min: Number(p.min ?? 0),
      max: Number(p.max ?? 1),
      default: Number(p.default ?? 0),
    })),
  };
  for (const p of params) data[`param${p.index}`] = Number(p.value ?? p.default ?? 0);
  return data;
}

/** Build a playable DAW flow from a downloaded .vstai document.
 *  Instruments: trigger node → master (host-MIDI drives noteOn/noteOff + pitch).
 *  Effects: a single in/out node the FX chain wires host audio through. */
export function makeVstaiFlow(doc: any, name: string): Flow {
  if (!doc?.wasmBase64) throw new Error('not a .vstai (no wasmBase64)');
  const data = vstaiNodeData(doc, name);
  if (doc.isInstrument) {
    Object.assign(data, { isTrigger: true, frequency: 220 });
    return {
      nodes: [
        { id: 'vstai', type: 'AiVstFlowNode', data },
        { id: 'master', type: 'MasterOutFlowNode', data: {} },
      ],
      edges: [{ id: 'e-vstai-master', source: 'vstai', target: 'master', sourceHandle: 'output', targetHandle: 'destination-input' }],
    };
  }
  Object.assign(data, { isInput: true, isOutput: true });
  return { nodes: [{ id: 'vstai', type: 'AiVstFlowNode', data }], edges: [] };
}


/** Is this flow a hosted .vstai plugin (its own GUI, not editable in Synflow)? */
export function isVstaiFlow(flow?: { nodes?: any[] } | null): boolean {
  return !!flow?.nodes?.some((n) => n?.type === 'AiVstFlowNode');
}

/** The plugin's own GUI HTML (undefined when the .vstai shipped without one). */
export function vstaiHtmlOf(flow?: { nodes?: any[] } | null): string | undefined {
  const n = flow?.nodes?.find((x) => x?.type === 'AiVstFlowNode');
  return typeof n?.data?.html === 'string' && n.data.html.trim() ? n.data.html : undefined;
}
