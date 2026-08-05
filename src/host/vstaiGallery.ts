// Client for the public VibePlugin gallery (GitHub Pages) — a catalogue of AI-generated
// ".vstai" plugins the AiVstFlowNode can browse and download. Two transports:
//   • Native plugin webview: the JUCE resource-provider origin can't reliably do
//     cross-origin fetches, so we call C++ native functions (galleryIndex/galleryLoad,
//     see PluginEditor.cpp) via JUCE's __juce__invoke bridge.
//   • Standalone web app: plain fetch() (the gallery sends `access-control-allow-origin: *`).
import { isPluginWebview } from './dawEditorBridge';

const GALLERY_BASE = 'https://k1ln.github.io/VibePlugin/gallery';

export type GalleryItem = {
  id: string;
  slug: string;
  name: string;
  isInstrument: boolean;
  explanation?: string;
  params?: number;
};

// ── JUCE native-function bridge (request/response over the injected backend) ──────
// JUCE natively injects window.__JUCE__.backend with emitEvent + addEventListener and
// dispatches a `__juce__complete` event when a registered native function completes.
let _pending: Map<number, (v: any) => void> | null = null;
let _nextId = 0;

function callNativeFunction(name: string, ...params: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const backend = (window as any).__JUCE__?.backend;
    if (!backend?.emitEvent || !backend?.addEventListener) { reject(new Error('native bridge unavailable')); return; }
    if (!_pending) {
      _pending = new Map();
      backend.addEventListener('__juce__complete', ({ promiseId, result }: any) => {
        const r = _pending!.get(promiseId);
        if (r) { r(result); _pending!.delete(promiseId); }
      });
    }
    const resultId = _nextId++;
    _pending.set(resultId, resolve);
    backend.emitEvent('__juce__invoke', { name, params, resultId });
  });
}

// ── Public API ───────────────────────────────────────────────────────────────────

/** Fetch the gallery catalogue (native fn in the plugin, direct fetch on the web). */
export async function fetchGalleryIndex(): Promise<GalleryItem[]> {
  if (isPluginWebview()) {
    const r = await callNativeFunction('galleryIndex');
    if (!r?.ok) throw new Error(r?.message || 'Could not reach the gallery.');
    return (Array.isArray(r.items) ? r.items : []) as GalleryItem[];
  }
  const res = await fetch(`${GALLERY_BASE}/data/index.json`);
  if (!res.ok) throw new Error(`Gallery unreachable (HTTP ${res.status}).`);
  return (await res.json()) as GalleryItem[];
}

/** Download one .vstai document by slug and return it parsed. */
export async function downloadVstai(slug: string): Promise<any> {
  if (isPluginWebview()) {
    const r = await callNativeFunction('galleryLoad', slug);
    if (!r?.ok) throw new Error(r?.message || 'Download failed.');
    return JSON.parse(r.json);
  }
  const res = await fetch(`${GALLERY_BASE}/data/${encodeURIComponent(slug)}.vstai`);
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
  return await res.json();
}

/** Rendered-GUI thumbnail URL for a gallery item (best-effort; may be blocked in the webview). */
export function galleryShotUrl(id: string): string {
  return `${GALLERY_BASE}/shots/${id}.jpg`;
}
