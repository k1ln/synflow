// Persistent flow storage via the File System Access API. On first run the user
// picks a folder; Mothscilla seeds it with the bundled flows and then loads/saves
// instruments, drums and effects from there (so edits survive + can be shared).
//
//   <folder>/flows/instruments/*.json   (instruments + drums, categorized)
//   <folder>/flows/effects/*.json
import { LIBRARY, type LibraryEntry } from './library';
import type { Flow } from './instruments';
import { readWavHeader } from '../audio/wavReader';
import { mimeOf } from '../audio/decodeAudioFile';

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

// ─── audio assets (large recordings/imports, kept on disk) ───────────────────
/** Write audio bytes to <folder>/audio/<fileName> (skips if already present). */
export async function writeAudio(root: any, fileName: string, blob: Blob): Promise<void> {
  if (!(await ensurePermission(root, 'readwrite'))) throw new Error('write permission denied for the audio folder');
  const d = await dir(root, 'audio');
  let exists = true;
  try { await d.getFileHandle(fileName); } catch { exists = false; }
  if (exists) return; // content-addressed name → identical bytes, no rewrite
  const fh = await d.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

/** Open a streaming writable for a mixdown at <folder>/bounces/<fileName>. The
 *  caller writes the WAV header + frame chunks incrementally, then closes it. */
export async function createBounceWritable(root: any, fileName: string): Promise<any> {
  if (!(await ensurePermission(root, 'readwrite'))) throw new Error('write permission denied for the bounces folder');
  const d = await dir(root, 'bounces');
  const fh = await d.getFileHandle(fileName, { create: true });
  return fh.createWritable();
}

/** Open a streaming writable at <folder>/audio/<fileName> (e.g. to write a long
 *  WAV in chunks without holding it all in memory). Caller writes then closes. */
export async function createAudioWritable(root: any, fileName: string): Promise<any> {
  if (!(await ensurePermission(root, 'readwrite'))) throw new Error('write permission denied for the audio folder');
  const d = await dir(root, 'audio');
  const fh = await d.getFileHandle(fileName, { create: true });
  return fh.createWritable();
}

/** Read audio bytes from <folder>/audio/<fileName> (null if missing). `fileName`
 *  may include subfolders (e.g. "stems/take1.wav") — the path is traversed. */
export async function readAudio(root: any, fileName: string): Promise<Blob | null> {
  try {
    const parts = `audio/${fileName}`.split('/').filter(Boolean);
    const file = parts.pop()!;
    let d = root;
    for (const p of parts) d = await d.getDirectoryHandle(p);
    const fh = await d.getFileHandle(file);
    return await fh.getFile();
  } catch { return null; }
}

const AUDIO_EXT = /\.(wav|mp3|ogg|webm|flac|m4a|aac)$/i;
export interface DiskAudioFile { path: string; name: string; mime: string; duration: number; }

/** Every audio file under <folder>/audio/ (recursively, incl. subfolders). `path`
 *  is relative to audio/. WAV durations come cheaply from the header; others are 0
 *  (resolved when added). Purely lists what's on disk — stale/deleted is the user's
 *  concern. */
export async function listAudioFiles(root: any): Promise<DiskAudioFile[]> {
  const out: DiskAudioFile[] = [];
  const walk = async (d: any, prefix: string): Promise<void> => {
    for await (const [n, h] of (d as any).entries()) {
      if (h.kind === 'directory') { await walk(h, `${prefix}${n}/`); continue; }
      if (!AUDIO_EXT.test(n)) continue;
      let duration = 0;
      try { if (/\.wav$/i.test(n)) { const m = await readWavHeader(await h.getFile()); duration = m.frames / m.sampleRate; } } catch { /* unreadable header */ }
      out.push({ path: `${prefix}${n}`, name: n.replace(/\.[^.]+$/, ''), mime: mimeOf(n), duration });
    }
  };
  try { await walk(await dir(root, 'audio'), ''); } catch { /* no audio dir */ }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── songs (the whole project) ───────────────────────────────────────────────
export const songSlug = (name: string) => (name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'song');

/** Save the whole project as a self-contained JSON under <folder>/songs/. */
export async function saveProject(root: any, project: any): Promise<string> {
  if (!(await ensurePermission(root, 'readwrite'))) throw new Error('write permission denied');
  const d = await dir(root, 'songs');
  const file = `${songSlug(project.name)}.json`;
  const fh = await d.getFileHandle(file, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(project, null, 2));
  await w.close();
  return file;
}

/** List saved songs (file name + display name). */
export async function listSongs(root: any): Promise<Array<{ file: string; name: string }>> {
  const out: Array<{ file: string; name: string }> = [];
  try {
    const d = await dir(root, 'songs');
    for await (const [fname, handle] of (d as any).entries()) {
      if (handle.kind !== 'file' || !fname.endsWith('.json')) continue;
      let name = fname.replace(/\.json$/, '');
      try { name = JSON.parse(await (await handle.getFile()).text()).name ?? name; } catch { /* keep file name */ }
      out.push({ file: fname, name });
    }
  } catch { /* none */ }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** All disk-backed audio assets used by any song in the folder, deduped by
 *  fileName — a shared audio library across every song (names/durations/peaks come
 *  from the song JSONs, so nothing is re-decoded). */
export async function listAllAssets(root: any): Promise<any[]> {
  const byFile = new Map<string, any>();
  try {
    const d = await dir(root, 'songs');
    for await (const [fname, handle] of (d as any).entries()) {
      if (handle.kind !== 'file' || !fname.endsWith('.json')) continue;
      try {
        const proj = JSON.parse(await (await handle.getFile()).text());
        for (const a of proj.assets ?? []) {
          if (a?.source?.kind === 'disk' && !byFile.has(a.source.fileName)) byFile.set(a.source.fileName, a);
        }
      } catch { /* skip unreadable song */ }
    }
  } catch { /* no songs dir */ }
  return [...byFile.values()];
}

export async function loadProject(root: any, file: string): Promise<any | null> {
  try {
    const d = await dir(root, 'songs');
    const fh = await d.getFileHandle(file);
    return JSON.parse(await (await fh.getFile()).text());
  } catch { return null; }
}
