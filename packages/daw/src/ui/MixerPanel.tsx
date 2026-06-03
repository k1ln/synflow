import React from 'react';
import type { Project } from '../model/project';
import { FX_LIBRARY } from '../synflow/effects';

export function MixerPanel({
  project, onVolume, onAddFx, onRemoveFx,
}: {
  project: Project;
  onVolume: (channelId: string, v: number) => void;
  onAddFx: (channelId: string, fxId: string) => void;
  onRemoveFx: (channelId: string, index: number) => void;
}) {
  return (
    <div className="mixer">
      <div className="mixer-title">Mixer &amp; FX <span className="mx-sub">(effects are @synflow/core flows)</span></div>
      {project.channels.map((ch) => (
        <div className="mx-strip" key={ch.id}>
          <span className="mx-name">{ch.name}</span>
          <input
            className="mx-vol" type="range" min={0} max={1} step={0.01}
            value={ch.volume ?? 0.8}
            onChange={(e) => onVolume(ch.id, parseFloat(e.target.value))}
            title="volume"
          />
          <div className="mx-fx">
            {(ch.fx ?? []).map((fxId, i) => {
              const def = FX_LIBRARY.find((f) => f.id === fxId);
              return (
                <button key={i} className="fx-chip" onClick={() => onRemoveFx(ch.id, i)} title="remove">
                  {def?.name ?? fxId} ✕
                </button>
              );
            })}
            <select className="fx-add" value="" onChange={(e) => { if (e.target.value) onAddFx(ch.id, e.target.value); }}>
              <option value="">+ FX</option>
              {FX_LIBRARY.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}
