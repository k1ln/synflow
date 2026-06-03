import React from 'react';
import type { Project } from '../model/project';
import { FX_LIBRARY } from '../synflow/effects';

const CATS = ['var(--cat-source)', 'var(--cat-gain)', 'var(--cat-mod)', 'var(--cat-fx)', 'var(--cat-midi)'];

export function Mixer({
  project, selId, onSelect, onVolume,
}: {
  project: Project;
  selId: string | null;
  onSelect: (trackId: string) => void;
  onVolume: (trackId: string, v: number) => void;
}) {
  const strips = [{ id: '__master', name: 'Master', volume: 0.82, fx: [] as string[] }, ...project.tracks];
  return (
    <div className="mixer">
      {strips.map((t, i) => {
        const master = t.id === '__master';
        const cat = master ? 'var(--cat-master)' : CATS[(i - 1) % CATS.length];
        const sel = t.id === selId;
        return (
          <div className={`mx-strip ${sel ? 'sel' : ''} ${master ? 'master' : ''}`} key={t.id} onClick={() => !master && onSelect(t.id)}>
            <div className="mx-name" style={{ color: cat }}>{t.name}</div>
            <div className="mx-fx">
              {(t.fx ?? []).map((fxId, k) => {
                const def = FX_LIBRARY.find((f) => f.id === fxId);
                return <div className="mx-fxslot" key={k}>{def?.name ?? fxId}</div>;
              })}
              {!master && (t.fx ?? []).length === 0 && <div className="mx-fxslot empty">no fx</div>}
            </div>
            <div className="mx-fader-wrap">
              <input
                className="mx-fader" type="range" min={0} max={1} step={0.01}
                value={(t as any).volume ?? 0.8}
                onChange={(e) => !master && onVolume(t.id, parseFloat(e.target.value))}
                style={{ accentColor: cat as string }}
              />
            </div>
            <div className="mx-db">{Math.round(((((t as any).volume ?? 0.8)) * 60) - 60)} dB</div>
          </div>
        );
      })}
    </div>
  );
}
