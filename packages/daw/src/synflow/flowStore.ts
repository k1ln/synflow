// Persistent flow storage via the File System Access API. On first run the user
// picks a folder; Mothscilla seeds it with the bundled flows and then loads/saves
// instruments, drums and effects from there (so edits survive + can be shared).
//
//   <folder>/flows/instruments/*.json   (instruments + drums, categorized)
//   <folder>/flows/effects/*.json
import { LIBRARY, type LibraryEntry } from './library';
import type { Flow } from './instruments';

export const fsSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// ─── persist the chosen directory handle in IndexedDB ────────────────────────
const DB = 'mothscilla', STORE = 'handles', KEY = 'flowsDir';
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((res) => { const q = db.transaction(STORE, 'readonly').objectStore(STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); });
}
async function idbSet(key: string, val: any): Promise<void> {
  const db = await idb();
  return new Promise((res, rej) => { const q = db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key); q.onsuccess = () => res(); q.onerror = () => rej(q.error); });
}

export interface SpaceInfo { quota?: number; usage?: number; available?: number }
export async function estimateSpace(): Promise<SpaceInfo> {
  try {
    const e = await navigator.storage?.estimate?.();
    const available = e?.quota != null && e?.usage != null ? e.quota - e.usage : undefined;
    return { quota: e?.quota, usage: e?.usage, available };
  } catch { return {}; }
}

async function ensurePermission(handle: any, mode: 'read' | 'readwrite' = 'readwrite'): Promise<boolean> {
  if (!handle?.queryPermission) return true;
  if ((await handle.queryPermission({ mode })) === 'granted') return true;
  return (await handle.requestPermission({ mode })) === 'granted';
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!fsSupported) return null;
  const root = await (window as any).showDirectoryPicker({ id: 'mothscilla-flows', mode: 'readwrite' });
  await idbSet(KEY, root);
  return root;
}

/** Restore the previously chosen folder (re-prompting for permission if needed). */
export async function restoreFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await idbGet<any>(KEY);
    if (!handle) return null;
    if (!(await ensurePermission(handle))) return null;
    return handle;
  } catch { return null; }
}

const sub = (group: 'instrument' | 'effect') => (group === 'effect' ? 'effects' : 'instruments');
async function dir(root: any, ...parts: string[]) { let d = root; for (const p of parts) d = await d.getDirectoryHandle(p, { create: true }); return d; }

export interface FlowFileMeta { group: 'instrument' | 'effect'; id: string; name: string; category: string; kind?: string; flow: Flow }

export async function writeFlow(root: any, e: FlowFileMeta): Promise<void> {
  if (!(await ensurePermission(root, 'readwrite'))) throw new Error('write permission denied for the flow folder');
  const d = await dir(root, 'flows', sub(e.group));
  const fh = await d.getFileHandle(`${e.id}.json`, { create: true });
  const w = await fh.createWritable();
  const file = { name: e.name, daw: { id: e.id, category: e.category, kind: e.kind }, nodes: e.flow.nodes, edges: e.flow.edges };
  await w.write(JSON.stringify(file, null, 2));
  await w.close();
}

/** Write any bundled flows that aren't already on disk (non-destructive). */
export async function seedLibrary(root: any): Promise<number> {
  let written = 0;
  for (const e of LIBRARY) {
    const d = await dir(root, 'flows', sub(e.group));
    let exists = true;
    try { await d.getFileHandle(`${e.id}.json`); } catch { exists = false; }
    if (!exists) { await writeFlow(root, { group: e.group, id: e.id, name: e.name, category: e.category, kind: e.kind, flow: e.flow }); written++; }
  }
  return written;
}

/** Read the whole on-disk library into catalog entries. */
export async function readAllFlows(root: any): Promise<LibraryEntry[]> {
  const out: LibraryEntry[] = [];
  for (const group of ['instrument', 'effect'] as const) {
    try {
      const d = await dir(root, 'flows', sub(group));
      for await (const [name, handle] of (d as any).entries()) {
        if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
        const data = JSON.parse(await (await handle.getFile()).text());
        out.push({
          id: data.daw?.id ?? name.replace(/\.json$/, ''),
          name: data.name ?? name,
          category: data.daw?.category ?? (group === 'effect' ? 'Effects' : 'Instruments'),
          kind: data.daw?.kind, group, flow: { nodes: data.nodes, edges: data.edges },
        });
      }
    } catch { /* folder not created yet */ }
  }
  return out.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}
