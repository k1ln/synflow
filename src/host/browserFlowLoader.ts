import type { FlowLoader } from '@synflow/core';
import { loadRootHandle, loadFlowFromDisk, makeFlowDbKey } from '../util/FileSystemAudioStore';
import { SimpleIndexedDB } from '../util/SimpleIndexedDB';

// Browser sub-flow loader: disk (File System Access API) first, IndexedDB fallback.
// Preserves the behavior that used to live in AudioGraphManager.loadFlowByName.
let db: SimpleIndexedDB | null = null;

const basename = (id: string) => (id || '').split('/').pop() || id;

export const browserFlowLoader: FlowLoader = async (name, folderPath = '') => {
  try {
    const handle = await loadRootHandle();
    if (handle) {
      const diskFlow = await loadFlowFromDisk(handle, name, folderPath);
      if (diskFlow) return { nodes: diskFlow.nodes || [], edges: diskFlow.edges || [] };
    }
  } catch (e) {
    console.warn('[browserFlowLoader] disk load failed for', name, e);
  }
  try {
    if (!db) db = new SimpleIndexedDB('FlowSynthDB', 'flows');
    const dbKey = makeFlowDbKey(name, folderPath);
    const result = await db.get(dbKey);
    if (result && result[0]) {
      return {
        nodes: result[0].nodes || result[0].value?.nodes || [],
        edges: result[0].edges || result[0].value?.edges || [],
      };
    }
    // Folder-less reference: a FlowNode saved as just "keyboard" / "kick" (as in
    // the bundled Hard-Synth patch) while the flow actually lives under a folder
    // like flows/examples/. Match any folder by name. Disk is mirrored into the
    // DB by syncDiskToDb, so this one scan covers both stores.
    const all = await db.get('*');
    const hit = all.find((r) => r.id === name || basename(r.id) === name);
    if (hit) {
      return {
        nodes: hit.nodes || hit.value?.nodes || [],
        edges: hit.edges || hit.value?.edges || [],
      };
    }
  } catch (e) {
    console.warn('[browserFlowLoader] DB load failed for', name, e);
  }
  return null;
};
