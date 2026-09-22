import React, { useEffect, useRef, useState } from 'react';
import { Download, FileAudio, Piano, Layers, Loader } from 'lucide-react';

/** One "Export" button in the top bar with a dropdown for every export flavor:
 *  the full dialog (video / audio / portable project), a quick WAV bounce, MIDI,
 *  and stems — was four separate icons cluttering the row. */
export function ExportMenu({
  onExport, exporting, exportProgress,
  onBounce, bouncing, bounceProgress,
  onExportMidi, onExportStems,
}: {
  onExport: () => void;
  exporting: boolean;
  exportProgress: number;
  onBounce: () => void;
  bouncing: boolean;
  bounceProgress: number;
  onExportMidi: () => void;
  onExportStems: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const busy = exporting || bouncing;
  const pct = (f: number) => `${Math.round(f * 100)}%`;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [open]);

  const pick = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <div className="exportmenu" ref={wrap}>
      <button className={`icon-btn ${busy ? 'busy' : ''}`} title="Export — video, audio, MIDI, stems or the project file"
        onClick={() => setOpen((o) => !o)} disabled={busy}>
        {exporting ? <><Loader size={16} className="spin" /><span className="btn-pct">{pct(exportProgress)}</span></>
          : bouncing ? <><Loader size={16} className="spin" /><span className="btn-pct">{pct(bounceProgress)}</span></>
          : <Download size={18} />}
      </button>
      {open && (
        <div className="exportmenu-pop">
          <button className="exportmenu-item" onClick={pick(onExport)}>
            <Download size={14} /> <span>Export…<small>Video, audio or the portable project</small></span>
          </button>
          <button className="exportmenu-item" onClick={pick(onBounce)}>
            <FileAudio size={14} /> <span>Bounce to WAV<small>Offline, faster than realtime</small></span>
          </button>
          <button className="exportmenu-item" onClick={pick(onExportMidi)}>
            <Piano size={14} /> <span>Export MIDI<small>Synth tracks' notes (.mid)</small></span>
          </button>
          <button className="exportmenu-item" onClick={pick(onExportStems)}>
            <Layers size={14} /> <span>Export stems<small>One pre-master WAV per track</small></span>
          </button>
        </div>
      )}
    </div>
  );
}
