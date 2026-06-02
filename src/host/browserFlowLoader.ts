import type { FlowLoader } from '@synflow/core';
import { loadRootHandle, loadFlowFromDisk, makeFlowDbKey } from '../util/FileSystemAudioStore';
import { SimpleIndexedDB } from '../util/SimpleIndexedDB';

// Browser sub-flow loader: disk (File System Access API) first, IndexedDB fallback.
// Preserves the behavior that used to live in AudioGraphManager.loadFlowByName.
let db: SimpleIndexedDB | null = null;

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
  } catch (e) {
    console.warn('[browserFlowLoader] DB load failed for', name, e);
  }
  return null;
};
