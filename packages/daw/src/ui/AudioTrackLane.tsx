import React, { useEffect, useRef, useState } from 'react';
import { Scissors, Trash2, Play, Square, Maximize2, Copy, Volume2 } from 'lucide-react';
import { songLengthSteps, type Project, type Track, type AudioClip } from '../model/project';
import { Waveform } from './Waveform';
import { slicePeaks } from '../audio/waveform';

const LANE_H = 132;        // 50% taller than before (was 88) so clips read like a real DAW
const CLIP_PAD = 8;        // clip height = LANE_H - CLIP_PAD
const MAX_ZOOM = 60;       // 1 = whole song fits the lane; zoom in for sample-accurate edits

/** Horizontal timeline lane for an audio track: waveform clips you can drag to
 *  move, edge-drag to trim, drag the top corners to fade, split at the playhead,
 *  and delete. Mouse-wheel zooms (anchored at the cursor; Shift-wheel scrolls) and
 *  right-click opens a context menu of every clip action. */
export function AudioTrackLane({
  track, project, currentStep, recording, previewKey, onPlay,
  onMove, onTrim, onSet, onSplit, onRemove, onDuplicate, onGain, onNormalize, onFade,
}: {
  track: Track;
  project: Project;
  currentStep: number;
  recording: boolean;
  previewKey: string | null;
  onPlay: (clip: AudioClip) => void;
  onMove: (clipId: string, start: number) => void;
  onTrim: (clipId: string, offset: number, duration: number) => void;
  onSet: (clipId: string, patch: Partial<AudioClip>) => void;
  onSplit: (clipId: string, atSteps: number) => void;
  onRemove: (clipId: string) => void;
  onDuplicate: (clipId: string) => void;
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

  // Horizontal zoom: 1 = the whole song fits the lane; higher = scroll a wider strip.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const laneWRef = useRef(laneW); laneWRef.current = laneW;

  const totalSteps = songLengthSteps(project); // grows to fit long clips so they aren't drawn off-lane
  const secPerStep = 60 / project.bpm / project.stepsPerBeat;
  const stepsOfSec = (s: number) => s / secPerStep;
  const assetOf = (id: string) => project.assets.find((a) => a.id === id);
  const contentW = laneW * zoom;               // full timeline width; the lane scrolls this
  const clipH = LANE_H - CLIP_PAD;

  // Mouse wheel over the lane zooms, anchored at the cursor; Shift-/horizontal-wheel
  // scrolls. (Non-passive so we can preventDefault.)
  useEffect(() => {
    const el = laneRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {   // scroll horizontally
        el.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        e.preventDefault(); return;
      }
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const anchorX = e.clientX - rect.left;     // px from the lane's left edge
      const cur = zoomRef.current;
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : 1);   // normalise line-mode wheels
      const factor = Math.min(1.5, Math.max(1 / 1.5, Math.exp(-px * 0.0008)));
      const next = Math.max(1, Math.min(MAX_ZOOM, cur * factor));
      if (next === cur) return;
      const w = laneWRef.current;
      const frac = (anchorX + el.scrollLeft) / Math.max(1, w * cur); // timeline fraction under cursor
      setZoom(next);
      const newScroll = frac * (w * next) - anchorX;         // keep that fraction under the cursor
      requestAnimationFrame(() => { el.scrollLeft = Math.max(0, newScroll); });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const drag = useRef<null | { mode: 'move' | 'left' | 'right' | 'fadeIn' | 'fadeOut'; clip: AudioClip; startX: number; orig: number }>(null);
  const onDragMove = (e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    const c = d.clip;
    if (d.mode === 'fadeIn' || d.mode === 'fadeOut') {
      const dSec = ((e.clientX - d.startX) / contentW) * totalSteps * secPerStep;
      const v = Math.max(0, Math.min(c.duration, d.mode === 'fadeIn' ? d.orig + dSec : d.orig - dSec));
      onFade(c.id, d.mode === 'fadeIn' ? v : (c.fadeIn ?? 0), d.mode === 'fadeOut' ? v : (c.fadeOut ?? 0));
      return;
    }
    const dSteps = ((e.clientX - d.startX) / contentW) * totalSteps;
    const dSec = dSteps * secPerStep;
    const asset = assetOf(c.assetId); const max = asset?.duration ?? c.offset + c.duration;
    if (d.mode === 'move') onMove(c.id, Math.max(0, c.start + dSteps));
    else if (d.mode === 'left') {
      const offset = Math.max(0, Math.min(c.offset + c.duration - 0.02, c.offset + dSec));
      const delta = offset - c.offset;
      // one atomic patch: trim + re-anchor together (single undo step, no interim state)
      onSet(c.id, { offset, duration: c.duration - delta, start: Math.max(0, c.start + stepsOfSec(delta)) });
    } else {
      const duration = Math.max(0.02, Math.min(max - c.offset, c.duration + dSec));
      onTrim(c.id, c.offset, duration);
    }
  };
  const onDragEnd = () => { window.removeEventListener('pointermove', onDragMove); window.removeEventListener('pointerup', onDragEnd); window.removeEventListener('pointercancel', onDragEnd); drag.current = null; };
  const begin = (e: React.PointerEvent, mode: 'move' | 'left' | 'right', clip: AudioClip) => {
    e.stopPropagation(); if (e.button !== 0) return;
    drag.current = { mode, clip, startX: e.clientX, orig: 0 };
    window.addEventListener('pointermove', onDragMove); window.addEventListener('pointerup', onDragEnd); window.addEventListener('pointercancel', onDragEnd);
  };
  // Drag a top-corner handle to set fade-in / fade-out length (overlap two clips for a crossfade).
  const beginFade = (e: React.PointerEvent, side: 'in' | 'out', clip: AudioClip) => {
    e.stopPropagation(); if (e.button !== 0) return;
    drag.current = { mode: side === 'in' ? 'fadeIn' : 'fadeOut', clip, startX: e.clientX, orig: (side === 'in' ? clip.fadeIn : clip.fadeOut) ?? 0 };
    window.addEventListener('pointermove', onDragMove); window.addEventListener('pointerup', onDragEnd); window.addEventListener('pointercancel', onDragEnd);
  };

  // Split at the playhead — only when it's actually over the clip (no blind
  // midpoint cut; matches the song arrangement view).
  const playheadInside = (c: AudioClip) => currentStep > c.start + 0.05 && currentStep < c.start + stepsOfSec(c.duration) - 0.05;
  const splitAt = (c: AudioClip) => { if (playheadInside(c)) onSplit(c.id, currentStep); };

  // ── Right-click context menu: every action for one clip ──────────────────────
  const [menu, setMenu] = useState<{ x: number; y: number; clip: AudioClip } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('pointerdown', close); window.addEventListener('resize', close);
    window.addEventListener('wheel', close, { passive: true }); window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('resize', close); window.removeEventListener('wheel', close); window.removeEventListener('keydown', onKey); };
  }, [menu]);
  const run = (fn: () => void) => { fn(); setMenu(null); };

  return (
    <div className="atl">
      <div className="atl-lane" ref={laneRef} style={{ height: LANE_H }}>
        <div className="atl-content" style={{ width: contentW, height: '100%' }}>
        {(track.audioClips ?? []).map((c) => {
          const asset = assetOf(c.assetId);
          const leftPx = (c.start / totalSteps) * contentW;
          const widthPx = Math.max(8, (stepsOfSec(c.duration) / totalSteps) * contentW);
          const fadeInPct = Math.min(100, ((c.fadeIn ?? 0) / Math.max(0.01, c.duration)) * 100);
          const fadeOutPct = Math.min(100, ((c.fadeOut ?? 0) / Math.max(0.01, c.duration)) * 100);
          return (
            <div key={c.id} className="atl-clip" style={{ left: leftPx, width: widthPx, height: clipH }}
              onPointerDown={(e) => begin(e, 'move', c)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, clip: c }); }}>
              <Waveform peaks={asset?.peaks ? slicePeaks(asset.peaks, asset.duration, c.offset, c.duration) : null} width={Math.round(widthPx)} height={clipH} color="#8fb4d9" background="transparent" />
              {!!c.fadeIn && <div className="atl-fade in" style={{ width: (fadeInPct / 100) * widthPx }} />}
              {!!c.fadeOut && <div className="atl-fade out" style={{ width: (fadeOutPct / 100) * widthPx }} />}
              <span className="atl-clip-name">{asset?.name ?? 'missing audio'}</span>
              <div className="atl-clip-tools" onPointerDown={(e) => e.stopPropagation()}>
                <button title={previewKey === c.id ? 'Stop' : 'Play'} onClick={() => onPlay(c)}>{previewKey === c.id ? <Square size={11} /> : <Play size={11} />}</button>
                <button title={playheadInside(c) ? 'Split at playhead' : 'Move the playhead over this clip to split'} disabled={!playheadInside(c)} onClick={() => splitAt(c)}><Scissors size={11} /></button>
                <button title="Normalize to peak" onClick={() => onNormalize(c.id)}><Maximize2 size={11} /></button>
                <button title="Remove" onClick={() => onRemove(c.id)}><Trash2 size={11} /></button>
                <label className="atl-gain" title={`Clip gain ${Math.round(c.gain * 100)}%`}><Volume2 size={11} /><input type="range" min={0} max={1.5} step={0.01} value={c.gain} onChange={(e) => onGain(c.id, parseFloat(e.target.value))} /></label>
              </div>
              {/* draggable fade corners (Ableton/Logic-style) — hidden until hover */}
              <span className="atl-fadeh in" title="Drag to fade in (overlap clips for a crossfade)" style={{ left: `${fadeInPct}%` }} onPointerDown={(e) => beginFade(e, 'in', c)} />
              <span className="atl-fadeh out" title="Drag to fade out" style={{ right: `${fadeOutPct}%` }} onPointerDown={(e) => beginFade(e, 'out', c)} />
              <span className="atl-handle left" onPointerDown={(e) => begin(e, 'left', c)} />
              <span className="atl-handle right" onPointerDown={(e) => begin(e, 'right', c)} />
            </div>
          );
        })}
        {currentStep >= 0 && <div className="atl-ph" style={{ left: (currentStep / totalSteps) * contentW }} />}
        </div>
        {recording && <div className="atl-recording">● recording…</div>}
        {(track.audioClips ?? []).length === 0 && !recording && <div className="atl-empty">Import audio or record from mic — clips appear on the song timeline. Scroll-wheel zooms.</div>}
      </div>
      {menu && (
        <div className="atl-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
          <button onClick={() => run(() => onPlay(menu.clip))}>{previewKey === menu.clip.id ? <Square size={12} /> : <Play size={12} />} {previewKey === menu.clip.id ? 'Stop' : 'Play'}</button>
          <button disabled={!playheadInside(menu.clip)} onClick={() => run(() => onSplit(menu.clip.id, currentStep))}><Scissors size={12} /> Split at playhead</button>
          <button onClick={() => run(() => onDuplicate(menu.clip.id))}><Copy size={12} /> Duplicate</button>
          <div className="atl-menu-sep" />
          <button onClick={() => run(() => onNormalize(menu.clip.id))}><Maximize2 size={12} /> Normalize to peak</button>
          <button onClick={() => run(() => onGain(menu.clip.id, 1))}><Volume2 size={12} /> Reset gain (0 dB)</button>
          <button disabled={!menu.clip.fadeIn && !menu.clip.fadeOut} onClick={() => run(() => onFade(menu.clip.id, 0, 0))}>Clear fades</button>
          {!!menu.clip.pitch && <button onClick={() => run(() => onSet(menu.clip.id, { pitch: undefined }))}>Reset pitch</button>}
          <div className="atl-menu-sep" />
          <button className="danger" onClick={() => run(() => onRemove(menu.clip.id))}><Trash2 size={12} /> Remove clip</button>
        </div>
      )}
    </div>
  );
}
