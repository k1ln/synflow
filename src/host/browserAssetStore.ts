import type { AssetStore } from '@synflow/core';
import {
  loadRootHandle,
  verifyPermission,
  loadSampleFromDisk,
  writeAudioBlob,
} from '../util/FileSystemAudioStore';

// Browser audio asset store backed by the File System Access API.
// Preserves the sample-load / recording-save behavior the engine used to inline.
export const browserAssetStore: AssetStore = {
  async loadAudio(name: string): Promise<ArrayBuffer | null> {
    try {
      const root = await loadRootHandle();
      if (!root) return null;
      const ok = await verifyPermission(root, 'read');
      if (!ok) return null;
      return (await loadSampleFromDisk(root, name)) ?? null;
    } catch (e) {
      console.warn('[browserAssetStore] loadAudio failed for', name, e);
      return null;
    }
  },
  async saveAudio(kind, blob, filename) {
    try {
      const root = await loadRootHandle();
      if (!root) return { ok: false, error: 'no root handle' };
      return await writeAudioBlob(root, kind, blob, filename);
    } catch (e) {
      return { ok: false, error: e };
    }
  },
};
