import React, { useEffect, useState } from 'react';
import { HardDrive, FolderOpen } from 'lucide-react';
import { estimateSpace, pickFolder, type SpaceInfo } from '../synflow/flowStore';

const gb = (n?: number) => (n == null ? '—' : `${(n / 1e9).toFixed(1)} GB`);

/** Startup prompt: pick a folder (showing available space) to store all flows. */
export function StorageSetup({ onFolder, onSkip }: {
  onFolder: (handle: FileSystemDirectoryHandle) => void;
  onSkip: () => void;
}) {
  const [space, setSpace] = useState<SpaceInfo>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { void estimateSpace().then(setSpace); }, []);

  const choose = async () => {
    setErr(''); setBusy(true);
    try {
      const h = await pickFolder();
      if (h) onFolder(h); else setBusy(false);
    } catch (e: any) {
      setBusy(false);
      if (e?.name !== 'AbortError') setErr(e?.message ?? 'Could not open the folder');
    }
  };

  return (
    <div className="syn-overlay">
      <div className="store-modal" onClick={(e) => e.stopPropagation()}>
        <div className="store-icon"><HardDrive size={26} /></div>
        <h2 className="store-title">Choose a folder for your flows</h2>
        <p className="store-text">
          Mothscilla saves every instrument, drum and effect as an editable flow file on your
          disk, so your work persists and is easy to share. Pick a folder to store them in.
        </p>
        <div className="store-space">
          <span className="store-space-label">Available space</span>
          <b className="store-space-val">{gb(space.available)}</b>
          <span className="store-space-sub">of {gb(space.quota)}</span>
        </div>
        {err && <div className="store-err">{err}</div>}
        <div className="store-actions">
          <button className="store-primary" onClick={choose} disabled={busy}>
            <FolderOpen size={15} /> {busy ? 'Opening…' : 'Choose folder'}
          </button>
          <button className="store-secondary" onClick={onSkip}>Use built-in only</button>
        </div>
      </div>
    </div>
  );
}
