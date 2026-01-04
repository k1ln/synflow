/* FileSystemAudioStore: manages user-selected audio root directory using File System Access API.
   We keep a minimal IndexedDB store ONLY for persisting the directory handle (structured clone),
   not for audio content. Audio files live directly in the chosen folder in two subdirectories:
   recording/ and sampling/. Fallbacks: if API unavailable or permission denied, callers can
   degrade to download or in-memory listing.
*/
// Ambient declarations (TS lib may not include these in current config)
declare global {
  interface Window { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>; }
}

export type AudioKind = 'recording' | 'sampling';

interface StoredHandle { id: string; handle: FileSystemDirectoryHandle; }

const DB_NAME = 'FlowSynthFS';
const STORE_NAME = 'handles';
const ROOT_KEY = 'audioRoot';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRootHandle(handle: FileSystemDirectoryHandle) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ id: ROOT_KEY, handle } as StoredHandle);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearRootHandle() {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(ROOT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[FS Audio] Failed to clear root handle', e);
  }
}

export async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(ROOT_KEY);
      req.onsuccess = () => resolve(req.result ? (req.result as StoredHandle).handle : null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

export async function verifyPermission(handle: any, mode: 'read' | 'readwrite' = 'read') {
  if (!handle || !handle.queryPermission) return true;
  const opts = { mode } as any;
  let perm = await handle.queryPermission(opts);
  if (perm === 'granted') return true;
  if (handle.requestPermission) {
    perm = await handle.requestPermission(opts);
    return perm === 'granted';
  }
  return false;
}

export async function selectAndPrepareRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null;
  try {
    const root = await window.showDirectoryPicker();
    const ok = await verifyPermission(root, 'readwrite');
    if (!ok) return null;
    // Ensure subdirectories
    await root.getDirectoryHandle('recording', { create: true });
    await root.getDirectoryHandle('sampling', { create: true });
    await root.getDirectoryHandle('flows', { create: true });
    await root.getDirectoryHandle('scripts', { create: true });
    await saveRootHandle(root);
    return root;
  } catch (e) {
    console.warn('[FS Audio] directory selection failed', e);
    return null;
  }
}

export async function ensureSubdirs(root: FileSystemDirectoryHandle) {
  await root.getDirectoryHandle('recording', { create: true });
  await root.getDirectoryHandle('sampling', { create: true });
  await root.getDirectoryHandle('flows', { create: true });
  await root.getDirectoryHandle('scripts', { create: true });
}

async function getSubDir(root: FileSystemDirectoryHandle, kind: AudioKind) {
  return root.getDirectoryHandle(kind, { create: true });
}

export async function writeAudioBlob(root: FileSystemDirectoryHandle, kind: AudioKind, blob: Blob, filename: string): Promise<{ ok: boolean; error?: any; }> {
  try {
    const dir = await getSubDir(root, kind);
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { ok: true };
  } catch (e) {
    console.warn('[FS Audio] write failed', e);
    return { ok: false, error: e };
  }
}

export interface ListedAudioFile { name: string; kind: AudioKind; size?: number; handle: FileSystemFileHandle; url?: string; }

export async function listAudio(root: FileSystemDirectoryHandle, kind: AudioKind): Promise<ListedAudioFile[]> {
  const out: ListedAudioFile[] = [];
  try {
    const dir = await getSubDir(root, kind);
    // @ts-ignore for-await iteration possible in modern browsers
    for await (const entry of (dir as any).values()) {
      if (entry.kind === 'file') {
        const file = await (entry as FileSystemFileHandle).getFile();
        out.push({ name: file.name, kind, size: file.size, handle: entry as FileSystemFileHandle });
      }
    }
  } catch (e) { console.warn('[FS Audio] list failed', e); }
  return out;
}

export async function getFileObjectURL(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return URL.createObjectURL(file);
}

// Migration: write existing IndexedDB recordings (data URL) into FS
export async function migrateIndexedDbRecordings(
  root: FileSystemDirectoryHandle,
  idbDbName = 'FlowSynthDB',
  storeName = 'recordings'
) {
  try {
    const req = indexedDB.open(idbDbName);
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    // Check if the store exists before attempting transaction
    if (!db.objectStoreNames.contains(storeName)) {
      db.close();
      return; // No recordings store to migrate
    }

    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const getAllReq = store.getAll();
    const records: any[] = await new Promise((resolve, reject) => {
      getAllReq.onsuccess = () => resolve(getAllReq.result || []);
      getAllReq.onerror = () => reject(getAllReq.error);
    });
    for (const r of records) {
      if (r?.base64 && typeof r.base64 === 'string') {
        // Data URL -> blob
        const comma = r.base64.indexOf(',');
        const b64 = comma >= 0 ? r.base64.slice(comma + 1) : r.base64;
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const blob = new Blob([arr.buffer], { type: 'audio/wav' });
        await writeAudioBlob(
          root,
          'recording',
          blob,
          r.name || `legacy-${Date.now()}.wav`
        );
      }
    }
    db.close();
  } catch (e) {
    console.warn('[FS Audio] migration failed', e);
  }
}

export async function hasFsApi(): Promise<boolean> { return !!window.showDirectoryPicker; }

// List all subdirectories in the root
export async function listAllSubdirectories(root: FileSystemDirectoryHandle): Promise<string[]> {
  const subdirs: string[] = [];
  try {
    // @ts-ignore for-await iteration
    for await (const entry of (root as any).values()) {
      if (entry.kind === 'directory') {
        subdirs.push(entry.name);
      }
    }
  } catch (e) {
    console.warn('[FS Audio] list subdirectories failed', e);
  }
  return subdirs;
}

// ============== Audio Worklet Script Storage ==============

async function ensureScriptsDir(root: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  return root.getDirectoryHandle('scripts', { create: true });
}

const SCRIPT_SANITIZE_REGEX = /[<>:"/\\|?*]+/g;

function sanitizeScriptName(name: string): string {
  const trimmed = name.trim() || 'unnamed';
  return trimmed.replace(SCRIPT_SANITIZE_REGEX, '_');
}

export async function saveWorkletScriptToDisk(root: FileSystemDirectoryHandle, scriptName: string, code: string): Promise<{ ok: boolean; error?: any }> {
  try {
    const dir = await ensureScriptsDir(root);
    const safeName = sanitizeScriptName(scriptName);
    const filename = safeName.endsWith('.json') ? safeName : `${safeName}.json`;
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    const payload = {
      name: scriptName,
      code: code ?? '',
      saved_at: new Date().toISOString(),
    };
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    return { ok: true };
  } catch (e) {
    console.warn('[FS Script] save failed', e);
    return { ok: false, error: e };
  }
}

export async function listWorkletScriptsFromDisk(root: FileSystemDirectoryHandle): Promise<{ name: string; code: string }[]> {
  const scripts: { name: string; code: string }[] = [];
  try {
    const dir = await ensureScriptsDir(root);
    // @ts-ignore for-await iteration on directory handle
    for await (const entry of (dir as any).values()) {
      if (entry.kind === 'file') {
        try {
          const file = await (entry as FileSystemFileHandle).getFile();
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (ext === 'json') {
            const text = await file.text();
            try {
              const payload = JSON.parse(text);
              if (payload && typeof payload.name === 'string' && typeof payload.code === 'string') {
                scripts.push({ name: payload.name, code: payload.code });
              } else {
                scripts.push({ name: sanitizeScriptName(file.name.replace(/\.json$/i, '')), code: String(payload?.code ?? '') });
              }
            } catch (jsonErr) {
              console.warn('[FS Script] parse failed', file.name, jsonErr);
            }
          } else {
            const rawName = file.name.replace(/\.[^/.]+$/, '');
            const code = await file.text();
            scripts.push({ name: rawName, code });
          }
        } catch (fileErr) {
          console.warn('[FS Script] read failed', entry.name, fileErr);
        }
      }
    }
  } catch (e) {
    console.warn('[FS Script] list failed', e);
  }
  return scripts;
}

export async function deleteWorkletScriptFromDisk(root: FileSystemDirectoryHandle, scriptName: string): Promise<{ ok: boolean; error?: any }> {
  try {
    const dir = await ensureScriptsDir(root);
    const safeName = sanitizeScriptName(scriptName);
    const candidates: string[] = [];
    if (safeName.endsWith('.json')) {
      candidates.push(safeName);
    } else {
      candidates.push(`${safeName}.json`, safeName);
    }
    for (const candidate of candidates) {
      try {
        await (dir as any).removeEntry(candidate);
        return { ok: true };
      } catch (err: any) {
        if (!err || err.name !== 'NotFoundError') throw err;
      }
    }
    return { ok: false, error: new Error('not_found') };
  } catch (e) {
    console.warn('[FS Script] delete failed', scriptName, e);
    return { ok: false, error: e };
  }
}

// List all audio files in a specific subdirectory by name
export async function listAudioInSubdirectory(root: FileSystemDirectoryHandle, subdirName: string): Promise<ListedAudioFile[]> {
  const out: ListedAudioFile[] = [];
  try {
    // Attempt to open directory; if missing, recreate standard audio folders silently for known names
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await root.getDirectoryHandle(subdirName);
    } catch (e: any) {
      if (e && e.name === 'NotFoundError') {
        // If the user deleted the folder manually, we can optionally recreate it for known audio kinds
        if (['recording','sampling','flows'].includes(subdirName)) {
          try {
            dir = await root.getDirectoryHandle(subdirName, { create: true });
          } catch (createErr) {
            console.warn('[FS Audio] recreate failed for subdir', subdirName, createErr);
            return out; // return empty list gracefully
          }
        } else {
          return out; // unknown folder removed => treat as empty
        }
      } else {
        throw e; // rethrow non-NotFound errors to outer catch
      }
    }
    // @ts-ignore for-await iteration
    for await (const entry of (dir as any).values()) {
      if (entry.kind === 'file') {
        const file = await (entry as FileSystemFileHandle).getFile();
        // Only include audio files
        if (file.name.match(/\.(wav|mp3|ogg|flac|m4a|aac)$/i)) {
          out.push({ name: file.name, kind: subdirName as AudioKind, size: file.size, handle: entry as FileSystemFileHandle });
        }
      }
    }
  } catch (e) {
    console.warn('[FS Audio] list subdirectory failed', subdirName, e);
  }
  return out;
}

// ============== Flow Data Storage to Disk ==============

export interface FlowData {
  name: string;
  nodes: any[];
  edges: any[];
  updated_at?: string;
  folder_path?: string; // relative folder path inside flows directory ("" for root)
}

// Ensure flows subdirectory exists (optionally nested folder path)
async function ensureFlowsDir(root: FileSystemDirectoryHandle, folderPath: string = ''): Promise<FileSystemDirectoryHandle> {
  let flowsDir = await root.getDirectoryHandle('flows', { create: true });
  if(folderPath){
    const segments = folderPath.split('/').filter(Boolean);
    for(const seg of segments){
      flowsDir = await flowsDir.getDirectoryHandle(seg, { create: true });
    }
  }
  return flowsDir;
}

// Save a flow to disk as JSON
export async function saveFlowToDisk(root: FileSystemDirectoryHandle, flowData: FlowData): Promise<{ ok: boolean; error?: any }> {
  try {
    const flowsDir = await ensureFlowsDir(root, flowData.folder_path || '');
    // Sanitize filename: replace invalid characters
    const safeName = flowData.name.replace(/[<>:"/\\|?*]/g, '_');
    const filename = `${safeName}.json`;
    
    const fileHandle = await flowsDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    
    const content = JSON.stringify({
      name: flowData.name,
      nodes: flowData.nodes,
      edges: flowData.edges,
      folder_path: flowData.folder_path || '',
      updated_at: flowData.updated_at || new Date().toISOString(),
    }, null, 2);
    
    await writable.write(content);
    await writable.close();
    
    return { ok: true };
  } catch (e) {
    console.warn('[FS Flow] save failed', e);
    return { ok: false, error: e };
  }
}

// Load a flow from disk
export async function loadFlowFromDisk(root: FileSystemDirectoryHandle, flowName: string, folderPath: string = ''): Promise<FlowData | null> {
  try {
    const flowsDir = await ensureFlowsDir(root, folderPath);
    const safeName = flowName.replace(/[<>:"/\\|?*]/g, '_');
    const filename = `${safeName}.json`;
    
    const fileHandle = await flowsDir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    
    return data as FlowData;
  } catch (e) {
    console.warn('[FS Flow] load failed', flowName, e);
    return null;
  }
}

// Recursively list all flows, capturing folder_path
export async function listFlowsOnDisk(root: FileSystemDirectoryHandle): Promise<FlowData[]> {
  const out: FlowData[] = [];
  const traverse = async (dir: FileSystemDirectoryHandle, prefix: string) => {
    // @ts-ignore for-await
    for await (const entry of (dir as any).values()) {
      if(entry.kind === 'file' && entry.name.endsWith('.json')){
        try {
          const file = await (entry as FileSystemFileHandle).getFile();
          const text = await file.text();
          const data = JSON.parse(text);
          if(typeof data.folder_path !== 'string') data.folder_path = prefix;
          out.push(data as FlowData);
        } catch(e){ console.warn('[FS Flow] read failed', entry.name, e); }
      } else if(entry.kind === 'directory') {
        const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        await traverse(entry as FileSystemDirectoryHandle, childPrefix);
      }
    }
  };
  try {
    const flowsRoot = await ensureFlowsDir(root);
    await traverse(flowsRoot, '');
  } catch(e){ console.warn('[FS Flow] recursive list failed', e); }
  return out;
}

// Delete a flow from disk
export async function deleteFlowFromDisk(root: FileSystemDirectoryHandle, flowName: string, folderPath: string = ''): Promise<{ ok: boolean; error?: any }> {
  try {
    const flowsDir = await ensureFlowsDir(root, folderPath);
    const safeName = flowName.replace(/[<>:"/\\|?*]/g, '_');
    const filename = `${safeName}.json`;
    
    await (flowsDir as any).removeEntry(filename);
    return { ok: true };
  } catch (e) {
    console.warn('[FS Flow] delete failed', flowName, e);
    return { ok: false, error: e };
  }
}

// Sync all flows from IndexedDB to disk
export async function syncFlowsToDisk(root: FileSystemDirectoryHandle, db: any): Promise<{ synced: number; failed: string[] }> {
  let synced = 0;
  const failed: string[] = [];
  
  try {
    const allFlows = await db.get('*');
    
    for (const flow of allFlows) {
      const flowData: FlowData = {
        name: flow.id,
        nodes: flow.nodes || flow.value?.nodes || [],
        edges: flow.edges || flow.value?.edges || [],
        folder_path: flow.folder_path || '',
        updated_at: flow.updated_at || new Date().toISOString(),
      };
      
  const result = await saveFlowToDisk(root, flowData);
      if (result.ok) {
        synced++;
      } else {
        failed.push(flow.id);
      }
    }
  } catch (e) {
    console.error('[FS Flow] sync failed', e);
  }
  
  return { synced, failed };
}

/**
 * Sync flows from disk to IndexedDB (disk is leader).
 * This reads all flows from disk and updates IndexedDB.
 * Disk is the source of truth; DB is updated to match disk.
 */
export async function syncDiskToDb(
  root: FileSystemDirectoryHandle,
  db: any
): Promise<{ synced: number; failed: string[] }> {
  let synced = 0;
  const failed: string[] = [];

  try {
    const diskFlows = await listFlowsOnDisk(root);

    for (const flow of diskFlows) {
      try {
        const payload = {
          nodes: flow.nodes || [],
          edges: flow.edges || [],
          folder_path: flow.folder_path || '',
          updated_at: flow.updated_at || new Date().toISOString(),
        };
        await db.put(flow.name, payload);
        synced++;
      } catch (e) {
        console.warn('[FS Flow] syncDiskToDb failed for', flow.name, e);
        failed.push(flow.name);
      }
    }
  } catch (e) {
    console.error('[FS Flow] syncDiskToDb list failed', e);
  }

  return { synced, failed };
}

// ============== Sample File Storage ==============

/**
 * Save a sample file to the sampling/ directory on disk.
 * Returns a unique filename that can be stored in the node data.
 */
export async function saveSampleToDisk(
  root: FileSystemDirectoryHandle,
  arrayBuffer: ArrayBuffer,
  originalName: string
): Promise<{ ok: boolean; filename?: string; error?: any }> {
  try {
    const dir = await getSubDir(root, 'sampling');
    // Create unique filename with timestamp
    const ext = originalName.split('.').pop() || 'bin';
    const baseName = originalName
      .replace(/\.[^/.]+$/, '')
      .replace(/[<>:"/\\|?*]+/g, '_');
    const timestamp = Date.now();
    const filename = `${baseName}_${timestamp}.${ext}`;

    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(arrayBuffer);
    await writable.close();

    return { ok: true, filename };
  } catch (e) {
    console.warn('[FS Sampling] save failed', e);
    return { ok: false, error: e };
  }
}

/**
 * Load a sample file from the sampling/ directory by filename.
 * Returns ArrayBuffer or null if not found.
 */
export async function loadSampleFromDisk(
  root: FileSystemDirectoryHandle,
  filename: string
): Promise<ArrayBuffer | null> {
  try {
    const dir = await getSubDir(root, 'sampling');
    const fileHandle = await dir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return await file.arrayBuffer();
  } catch (e) {
    console.warn('[FS Sampling] load failed', filename, e);
    return null;
  }
}

/**
 * Delete a sample file from the sampling/ directory.
 */
export async function deleteSampleFromDisk(
  root: FileSystemDirectoryHandle,
  filename: string
): Promise<{ ok: boolean; error?: any }> {
  try {
    const dir = await getSubDir(root, 'sampling');
    await dir.removeEntry(filename);
    return { ok: true };
  } catch (e) {
    console.warn('[FS Sampling] delete failed', filename, e);
    return { ok: false, error: e };
  }
}
