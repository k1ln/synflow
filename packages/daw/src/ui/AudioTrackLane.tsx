import React, { useEffect, useRef, useState } from 'react';
import { Scissors, Trash2, Play, Square, Maximize2 } from 'lucide-react';
import { songLengthSteps, type Project, type Track, type AudioClip } from '../model/project';
import { Waveform } from './Waveform';
import { slicePeaks } from '../audio/waveform';

const LANE_H = 88;

/** Horizontal timeline lane for an audio track: waveform clips you can drag to
 *  move, edge-drag to trim, split at the playhead, and delete. */
export function AudioTrackLane({
  track, project, currentStep, recording, previewKey, onPlay,
  onMove, onTrim, onSplit, onRemove, onGain, onNormalize, onFade,
}: {
  track: Track;
  project: Project;
  currentStep: number;
  recording: boolean;
  previewKey: string | null;
  onPlay: (clip: AudioClip) => void;
  onMove: (clipId: string, start: number) => void;
  onTrim: (clipId: string, offset: number, duration: number) => void;
  onSplit: (clipId: string, atSteps: number) => void;
  onRemove: (clipId: string) => void;
  onGain: (clipId: string, gain: number) => void;
  onNormalize: (clipId: string) => void;
  onFade: (clipId: string, fadeIn: number, fadeOut: number) => void;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
  const [laneW, setLaneW] = useState(800);
  useEffect(() => {
    const el = laneRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setLaneW(el.clientWidth));
    ro.observe(el); setLaneW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const totalSteps = songLengthSteps(project); // grows to fit long clips so they aren't drawn off-lane
  const secPerStep = 60 / project.bpm / project.stepsPerBeat;
  const stepsOfSec = (s: number) => s / secPerStep;
  const assetOf = (id: string) => project.assets.find((a) => a.id === id);

  const drag = useRef<null | { mode: 'move' | 'left' | 'right'; clip: AudioClip; startX: number }>(null);
  const onDragMove = (e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dSteps = ((e.clientX - d.startX) / laneW) * totalSteps;
    const dSec = dSteps * secPerStep;
    const c = d.clip; const asset = assetOf(c.assetId); const max = asset?.duration ?? c.offset + c.duration;
    if (d.mode === 'move') onMove(c.id, Math.max(0, c.start + dSteps));
    else if (d.mode === 'left') {
      const offset = Math.max(0, Math.min(c.offset + c.duration - 0.02, c.offset + dSec));
      const delta = offset - c.offset;
      onTrim(c.id, offset, c.duration - delta);
      onMove(c.id, c.start + stepsOfSec(delta));
    } else {
      const duration = Math.max(0.02, Math.min(max - c.offset, c.duration + dSec));
      onTrim(c.id, c.offset, duration);
    }
  };
  const onDragEnd = () => { window.removeEventListener('pointermove', onDragMove); window.removeEventListener('pointerup', onDragEnd); drag.current = null; };
  const begin = (e: React.PointerEvent, mode: 'move' | 'left' | 'right', clip: AudioClip) => {
    e.stopPropagation(); if (e.button !== 0) return;
    drag.current = { mode, clip, startX: e.clientX };
    window.addEventListener('pointermove', onDragMove); window.addEventListener('pointerup', onDragEnd);
  };

  const splitAt = (c: AudioClip) => {
    const widthSteps = stepsOfSec(c.duration);
    const inside = currentStep > c.start && currentStep < c.start + widthSteps;
    onSplit(c.id, inside ? currentStep : c.start + widthSteps / 2);
  };

  return (
    <div className="atl">
      <div className="atl-lane" ref={laneRef} style={{ height: LANE_H }}>
        {(track.audioClips ?? []).map((c) => {
          const asset = assetOf(c.assetId);
          const leftPx = (c.start / totalSteps) * laneW;
          const widthPx = Math.max(8, (stepsOfSec(c.duration) / totalSteps) * laneW);
          return (
            <div key={c.id} className="atl-clip" style={{ left: leftPx, width: widthPx, height: LANE_H - 8 }} onPointerDown={(e) => begin(e, 'move', c)}>
              <Waveform peaks={asset?.peaks ? slicePeaks(asset.peaks, asset.duration, c.offset, c.duration) : null} width={Math.round(widthPx)} height={LANE_H - 8} color="#7cc4ff" background="transparent" />
              {!!c.fadeIn && <div className="atl-fade in" style={{ width: Math.min(widthPx, (c.fadeIn / c.duration) * widthPx) }} />}
              {!!c.fadeOut && <div className="atl-fade out" style={{ width: Math.min(widthPx, (c.fadeOut / c.duration) * widthPx) }} />}
              <span className="atl-clip-name">{asset?.name ?? 'missing audio'}</span>
              <div className="atl-clip-tools" onPointerDown={(e) => e.stopPropagation()}>
                <button title={previewKey === c.id ? 'Stop' : 'Play'} onClick={() => onPlay(c)}>{previewKey === c.id ? <Square size={11} /> : <Play size={11} />}</button>
                <button title="Split" onClick={() => splitAt(c)}><Scissors size={11} /></button>
                <button title="Normalize to peak" onClick={() => onNormalize(c.id)}><Maximize2 size={11} /></button>
                <button title="Remove" onClick={() => onRemove(c.id)}><Trash2 size={11} /></button>
                <input className="atl-gain" type="range" min={0} max={1.5} step={0.01} value={c.gain} title="Clip gain" onChange={(e) => onGain(c.id, parseFloat(e.target.value))} />
                <label className="atl-fadein" title="Fade in (seconds)">⟋<input type="number" min={0} max={c.duration} step={0.05} value={+(c.fadeIn ?? 0).toFixed(2)} onChange={(e) => onFade(c.id, Math.max(0, parseFloat(e.target.value) || 0), c.fadeOut ?? 0)} /></label>
                <label className="atl-fadeout" title="Fade out (seconds)">⟍<input type="number" min={0} max={c.duration} step={0.05} value={+(c.fadeOut ?? 0).toFixed(2)} onChange={(e) => onFade(c.id, c.fadeIn ?? 0, Math.max(0, parseFloat(e.target.value) || 0))} /></label>
              </div>
              <span className="atl-handle left" onPointerDown={(e) => begin(e, 'left', c)} />
              <span className="atl-handle right" onPointerDown={(e) => begin(e, 'right', c)} />
            </div>
          );
        })}
        {currentStep >= 0 && <div className="atl-ph" style={{ left: (currentStep / totalSteps) * laneW }} />}
        {recording && <div className="atl-recording">● recording…</div>}
        {(track.audioClips ?? []).length === 0 && !recording && <div className="atl-empty">Import audio or record from mic — clips appear on the song timeline.</div>}
      </div>
    </div>
  );
}
