import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Film, Diamond, Palette, BarChart3, RotateCcw, Crop as CropIcon, LayoutGrid } from 'lucide-react';
import { VIDEO_BLENDS, TITLE_APPEARS, CANVAS_SIZE_PRESETS, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT, type ClipColor, type ClipCrop, type ClipTransform, type Easing, type Keyframe, type Project, type TitleAppear, type VideoBlend, type VideoClip } from '../model/project';
import { evalTransform, drawVideoLayer, drawTitle, upsertKeyframe } from '../audio/videoTransform';
import { TITLE_FONTS } from '../fonts';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

/** Largest crop, centered, matching `targetAR` — used by the layout presets so a
 *  clip cropped for a half/quarter of the screen fills that slot with no black
 *  bars and no distortion (crop first, at the source's own aspect ratio; the
 *  contain-fit in `drawVideoLayer` never stretches non-uniformly on its own). */
function centeredCropForAspect(vw: number, vh: number, targetAR: number): ClipCrop {
  const srcAR = vw / vh;
  const w = srcAR > targetAR ? targetAR / srcAR : 1;
  const h = srcAR > targetAR ? 1 : srcAR / targetAR;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** Quick "place on screen" slots for multi-cam / split-screen layouts: crop each
 *  clip to the slot's shape and position+scale it into that slot, so several
 *  clips on stacked video tracks can sit side by side instead of stacking full-
 *  frame on top of each other. wFrac/hFrac/cx/cy are fractions of the screen. */
interface LayoutSlot { wFrac: number; hFrac: number; cx: number; cy: number; label: string }
const LAYOUT_SLOTS = {
  full:   { wFrac: 1,   hFrac: 1,   cx: 0.5,  cy: 0.5,  label: 'Full screen' },
  left:   { wFrac: 0.5, hFrac: 1,   cx: 0.25, cy: 0.5,  label: 'Left half' },
  right:  { wFrac: 0.5, hFrac: 1,   cx: 0.75, cy: 0.5,  label: 'Right half' },
  top:    { wFrac: 1,   hFrac: 0.5, cx: 0.5,  cy: 0.25, label: 'Top half' },
  bottom: { wFrac: 1,   hFrac: 0.5, cx: 0.5,  cy: 0.75, label: 'Bottom half' },
  tl:     { wFrac: 0.5, hFrac: 0.5, cx: 0.25, cy: 0.25, label: 'Top-left quarter' },
  tr:     { wFrac: 0.5, hFrac: 0.5, cx: 0.75, cy: 0.25, label: 'Top-right quarter' },
  bl:     { wFrac: 0.5, hFrac: 0.5, cx: 0.25, cy: 0.75, label: 'Bottom-left quarter' },
  br:     { wFrac: 0.5, hFrac: 0.5, cx: 0.75, cy: 0.75, label: 'Bottom-right quarter' },
} satisfies Record<string, LayoutSlot>;
type LayoutSlotKey = keyof typeof LAYOUT_SLOTS;
const LAYOUT_GRID: LayoutSlotKey[] = ['tl', 'top', 'tr', 'left', 'full', 'right', 'bl', 'bottom', 'br'];

/** Drag-to-crop overlay: draws the source `<video>`'s current frame at its native
 *  aspect ratio and lets you drag the rect / its corner handles. Coordinates are
 *  fractions (0..1) of the source frame, matching `ClipCrop` and `drawVideoLayer`.
 *  The visible box keeps the SOURCE's own aspect ratio (via container-query
 *  contain-fit, same trick as `.pgm-screen`) regardless of the target screen
 *  size's shape — otherwise a 9:16 screen would squash the crop preview into a
 *  tall box and the video would visibly stretch while you're trying to crop it. */
function CropEditor({ el, crop, onChange }: { el: HTMLVideoElement | undefined; crop: ClipCrop | undefined; onChange: (c: ClipCrop) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ mode: CropHandle; startX: number; startY: number; r0: ClipCrop } | null>(null);
  const rect = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const srcW = el?.videoWidth || 16, srcH = el?.videoHeight || 9;

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = cvRef.current, ctx = cv?.getContext('2d');
      if (!cv || !ctx || !el || !el.videoWidth) return;
      if (cv.width !== el.videoWidth || cv.height !== el.videoHeight) { cv.width = el.videoWidth; cv.height = el.videoHeight; }
      try { ctx.drawImage(el, 0, 0, cv.width, cv.height); } catch { /* frame not ready */ }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [el]);

  const onHandleDown = (mode: CropHandle) => (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, r0: rect };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current, box = boxRef.current; if (!d || !box) return;
    const b = box.getBoundingClientRect();
    const dx = (e.clientX - d.startX) / b.width, dy = (e.clientY - d.startY) / b.height;
    let { x, y, w, h } = d.r0;
    if (d.mode === 'move') { x = clamp(d.r0.x + dx, 0, 1 - w); y = clamp(d.r0.y + dy, 0, 1 - h); }
    else {
      if (d.mode === 'nw' || d.mode === 'sw') { const nx = clamp(d.r0.x + dx, 0, d.r0.x + d.r0.w - 0.05); w = d.r0.w + (d.r0.x - nx); x = nx; }
      if (d.mode === 'ne' || d.mode === 'se') { w = clamp(d.r0.w + dx, 0.05, 1 - d.r0.x); }
      if (d.mode === 'nw' || d.mode === 'ne') { const ny = clamp(d.r0.y + dy, 0, d.r0.y + d.r0.h - 0.05); h = d.r0.h + (d.r0.y - ny); y = ny; }
      if (d.mode === 'sw' || d.mode === 'se') { h = clamp(d.r0.h + dy, 0.05, 1 - d.r0.y); }
    }
    onChange({ x, y, w, h });
  };
  const onUp = () => { drag.current = null; };

  return (
    <div className="pgm-crop-editor" ref={wrapRef} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
      <div className="pgm-crop-box" ref={boxRef} style={{ ['--arw' as any]: srcW, ['--arh' as any]: srcH }}>
        <canvas ref={cvRef} className="pgm-crop-canvas" />
        <div className="pgm-crop-rect" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
          onPointerDown={onHandleDown('move')}>
          {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
            <span key={h} className={`pgm-crop-handle ${h}`} onPointerDown={onHandleDown(h)} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface Layer { trackId: string; clip: VideoClip; sourceTime: number; }

const EASINGS: Easing[] = ['linear', 'ease', 'ease-in', 'ease-out', 'hold'];
const COLOR_PROPS: { key: keyof ClipColor; label: string }[] = [
  { key: 'exposure', label: 'Exposure' }, { key: 'contrast', label: 'Contrast' }, { key: 'saturation', label: 'Saturation' },
  { key: 'temperature', label: 'Temp' }, { key: 'tint', label: 'Tint' },
];
type TKey = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';
const PROPS: { key: TKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'x', label: 'X', min: -1, max: 1, step: 0.01 },
  { key: 'y', label: 'Y', min: -1, max: 1, step: 0.01 },
  { key: 'scale', label: 'Scale', min: 0, max: 4, step: 0.01 },
  { key: 'rotation', label: 'Rotate', min: -180, max: 180, step: 1 },
  { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01 },
];

/**
 * Program monitor (MAW): live preview synced to the playhead, compositing every
 * video track (upper over lower) with per-clip opacity, blend mode, and an
 * animatable transform (position / scale / rotation / opacity with keyframes).
 * Hidden <video>s decode/seek/play; a <canvas> draws the stack each frame.
 * Clip-local time comes from each playing <video>'s currentTime, so transform
 * animation stays smooth between the coarse step ticks. See docs/VIDEO.md.
 */
export function ProgramMonitor({
  project, currentStep, isPlaying, getVideoUrl, onClose, onSetClip, onSetCanvasSize, onSelectClip, canvasRef, mode = 'floating',
}: {
  project: Project;
  /** 'floating': small panel over the arrangement. 'dock': docked strip above it
   *  (Song view). 'full': fills its container — the dedicated Video tab, sized
   *  for precise crop/transform work. */
  mode?: 'floating' | 'dock' | 'full';
  currentStep: number;
  isPlaying: boolean;
  getVideoUrl: (assetId: string) => string | null;
  onClose?: () => void;
  onSetClip: (trackId: string, clipId: string, patch: Partial<VideoClip>) => void;
  onSetCanvasSize: (width: number, height: number) => void;
  /** Follows the playhead: whichever clip is on top at the current position also
   *  becomes the selected clip in the arrangement, so it's highlighted there too. */
  onSelectClip: (trackId: string, clipId: string) => void;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}) {
  const canvasW = project.canvasWidth ?? DEFAULT_CANVAS_WIDTH;
  const canvasH = project.canvasHeight ?? DEFAULT_CANVAS_HEIGHT;
  const secPerStep = 60 / project.bpm / project.stepsPerBeat;
  const t = Math.max(0, currentStep) * secPerStep;
  const [ease, setEase] = useState<Easing>('ease');
  const [showColor, setShowColor] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const [showScope, setShowScope] = useState(false);
  const histoRef = useRef<HTMLCanvasElement>(null);

  const videoTracks = useMemo(() => project.tracks.filter((tr) => tr.type === 'video'), [project.tracks]);
  const assets = useMemo(() => {
    const ids = new Set<string>();
    for (const tr of videoTracks) for (const c of tr.videoClips ?? []) ids.add(c.assetId);
    return (project.videoAssets ?? []).filter((a) => ids.has(a.id));
  }, [project.videoAssets, videoTracks]);

  // Active clip per track at the playhead, ordered bottom → top.
  const layers: Layer[] = [];
  for (const tr of videoTracks) {
    const cs = [...(tr.videoClips ?? [])].sort((a, b) => a.start - b.start);
    const c = cs.find((cl) => { const s0 = cl.start * secPerStep; return t >= s0 && t < s0 + cl.duration; });
    if (c) layers.push({ trackId: tr.id, clip: c, sourceTime: c.offset + (t - c.start * secPerStep) });
  }
  const top = layers[layers.length - 1] ?? null;
  const topName = top ? assets.find((a) => a.id === top.clip.assetId)?.name : null;
  const topLocalT = top ? Math.max(0, t - top.clip.start * secPerStep) : 0;     // clip-local seconds at playhead

  // Whatever clip the playhead currently lands on also becomes the selection, so
  // the arrangement highlights it and the inspector above always matches what's
  // actually showing.
  const topTrackId = top?.trackId, topClipId = top?.clip.id;
  useEffect(() => {
    if (topTrackId && topClipId) onSelectClip(topTrackId, topClipId);
  }, [topTrackId, topClipId]); // eslint-disable-line react-hooks/exhaustive-deps

  const vids = useRef<Map<string, HTMLVideoElement>>(new Map());
  const layersRef = useRef<{ clip: VideoClip }[]>([]);
  layersRef.current = layers.map((l) => ({ clip: l.clip }));
  const frameRef = useRef({ t: 0, secPerStep: 0.125 });
  frameRef.current = { t, secPerStep };                       // for title localT in the draw loop

  // Composite every active layer each animation frame, with its evaluated transform.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const cv = canvasRef.current, ctx = cv?.getContext('2d');
      if (cv && ctx) {
        const W = cv.width, H = cv.height;
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        for (const l of layersRef.current) {
          if (l.clip.text != null) {                          // title clip → burn-in text
            const localT = Math.max(0, frameRef.current.t - l.clip.start * frameRef.current.secPerStep);
            drawTitle(ctx, W, H, l.clip, evalTransform(l.clip, localT), localT);
            continue;
          }
          const el = vids.current.get(l.clip.assetId);
          if (!el || !el.videoWidth) continue;
          const localT = Math.max(0, el.currentTime - (l.clip.offset ?? 0)); // smooth, from the playing video
          drawVideoLayer(ctx, el, W, H, evalTransform(l.clip, localT), l.clip.blend, l.clip.color, l.clip.crop);
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // RGB histogram scope: periodically sample the program canvas (downsampled).
  useEffect(() => {
    if (!showScope) return;
    const id = window.setInterval(() => {
      const src = canvasRef.current, hc = histoRef.current;
      const sctx = src?.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
      const hctx = hc?.getContext('2d');
      if (!src || !hc || !sctx || !hctx) return;
      let data: Uint8ClampedArray;
      try { data = sctx.getImageData(0, 0, src.width, src.height).data; } catch { return; }
      const bins = 64;
      const r = new Float32Array(bins), g = new Float32Array(bins), b = new Float32Array(bins);
      for (let i = 0; i < data.length; i += 4 * 8) { r[data[i] >> 2]++; g[data[i + 1] >> 2]++; b[data[i + 2] >> 2]++; }
      let max = 1; for (let i = 0; i < bins; i++) max = Math.max(max, r[i], g[i], b[i]);
      const W = hc.width, H = hc.height;
      hctx.globalCompositeOperation = 'source-over'; hctx.fillStyle = '#0a0a0e'; hctx.fillRect(0, 0, W, H);
      hctx.globalCompositeOperation = 'lighter';
      const drawCh = (arr: Float32Array, col: string) => { hctx.fillStyle = col; for (let i = 0; i < bins; i++) { const h = (arr[i] / max) * H; hctx.fillRect((i / bins) * W, H - h, Math.ceil(W / bins), h); } };
      drawCh(r, 'rgba(255,64,64,.65)'); drawCh(g, 'rgba(64,255,96,.6)'); drawCh(b, 'rgba(96,140,255,.65)');
      hctx.globalCompositeOperation = 'source-over';
    }, 150);
    return () => window.clearInterval(id);
  }, [showScope]);

  // Seek/play the active clips' <video> elements; pause the rest.
  const syncKey = layers.map((l) => `${l.clip.assetId}@${l.sourceTime.toFixed(2)}`).join('|') + (isPlaying ? 'P' : 'S');
  useEffect(() => {
    const activeNow = new Map(layers.map((l) => [l.clip.assetId, l.sourceTime]));
    for (const [id, el] of vids.current) {
      const target = activeNow.get(id);
      if (target === undefined) { if (!el.paused) el.pause(); continue; }
      if (isPlaying) {
        if (Math.abs(el.currentTime - target) > 0.2) el.currentTime = target;
        if (el.paused) void el.play().catch(() => { /* autoplay blocked until a gesture */ });
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.04) el.currentTime = target;
      }
    }
  }, [syncKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── transform editing helpers (operate on the top clip) ──
  const kfOf = (clip: VideoClip, key: TKey): Keyframe[] | undefined => clip.transform?.kf?.[key];
  const valueAt = (key: TKey): number => {
    if (!top) return key === 'scale' || key === 'opacity' ? 1 : 0;
    const ev = evalTransform(top.clip, topLocalT);
    return ev[key];
  };
  const writeTransform = (mutate: (tf: ClipTransform, opacityStatic: number | undefined) => { transform: ClipTransform; opacity?: number }) => {
    if (!top) return;
    const tf: ClipTransform = { ...(top.clip.transform ?? {}), kf: { ...(top.clip.transform?.kf ?? {}) } };
    onSetClip(top.trackId, top.clip.id, mutate(tf, top.clip.opacity));
  };
  const setValue = (key: TKey, v: number) => writeTransform((tf) => {
    if (kfOf(top!.clip, key)?.length) {                       // animated → write a keyframe at the playhead
      tf.kf![key] = upsertKeyframe(tf.kf![key], topLocalT, v, ease);
      return { transform: tf };
    }
    if (key === 'opacity') return { transform: tf, opacity: v }; // static opacity lives on the clip
    tf[key] = v;                                                 // static x/y/scale/rotation
    return { transform: tf };
  });
  const setColor = (key: keyof ClipColor, v: number) => { if (top) onSetClip(top.trackId, top.clip.id, { color: { ...(top.clip.color ?? {}), [key]: v } }); };
  const resetColor = () => { if (top) onSetClip(top.trackId, top.clip.id, { color: undefined }); };
  const setCrop = (c: ClipCrop) => { if (top) onSetClip(top.trackId, top.clip.id, { crop: c }); };
  const resetCrop = () => { if (top) onSetClip(top.trackId, top.clip.id, { crop: undefined }); };
  const topAsset = top ? assets.find((a) => a.id === top.clip.assetId) : undefined;
  const cropDims = top?.clip.crop ? { w: Math.round(top.clip.crop.w * (topAsset?.width ?? 0)), h: Math.round(top.clip.crop.h * (topAsset?.height ?? 0)) } : null;
  // Crop the clip to a slot's shape and place+scale it there — several clips on
  // stacked video tracks, each set to a different slot, sit side by side instead
  // of covering the whole frame on top of each other.
  const applyLayoutSlot = (key: LayoutSlotKey) => {
    if (!top || !topAsset?.width || !topAsset?.height) return;
    const slot = LAYOUT_SLOTS[key];
    const slotAR = (slot.wFrac / slot.hFrac) * (canvasW / canvasH);
    const crop = centeredCropForAspect(topAsset.width, topAsset.height, slotAR);
    const scale = Math.max(slot.wFrac, slot.hFrac);
    const x = slot.cx - 0.5, y = slot.cy - 0.5;
    const tf: ClipTransform = { ...(top.clip.transform ?? {}), scale, x, y, kf: { ...(top.clip.transform?.kf ?? {}), scale: undefined, x: undefined, y: undefined } };
    onSetClip(top.trackId, top.clip.id, { crop, transform: tf });
  };
  const toggleKey = (key: TKey) => writeTransform((tf) => {
    const list = tf.kf![key];
    const hasHere = list?.some((k) => Math.abs(k.t - topLocalT) <= 0.02);
    if (hasHere) {
      const next = (list ?? []).filter((k) => Math.abs(k.t - topLocalT) > 0.02);
      tf.kf![key] = next.length ? next : undefined;
    } else {
      tf.kf![key] = upsertKeyframe(list, topLocalT, valueAt(key), ease);
    }
    return { transform: tf };
  });

  return (
    <div className={`pgm${mode === 'dock' ? ' pgm-dock' : mode === 'full' ? ' pgm-full' : ''}`}>
      <div className="pgm-head">
        <span className="pgm-title"><Film size={12} /> Program{layers.length > 1 ? ` · ${layers.length} layers` : ''}</span>
        <button className={`pgm-close ${showScope ? 'on' : ''}`} title="Histogram scope" onClick={() => setShowScope((s) => !s)}><BarChart3 size={13} /></button>
        {onClose && <button className="pgm-close" title="Hide preview" onClick={onClose}><X size={13} /></button>}
      </div>
      <div className="pgm-body">
        <div className="pgm-stage">
      <div className="pgm-screen" style={{ ['--arw' as any]: canvasW, ['--arh' as any]: canvasH, aspectRatio: `${canvasW} / ${canvasH}` }}>
        <canvas ref={canvasRef} width={canvasW} height={canvasH} className="pgm-canvas" />
        {showCrop && top && top.clip.text == null && (
          <CropEditor el={vids.current.get(top.clip.assetId)} crop={top.clip.crop} onChange={setCrop} />
        )}
        {layers.length === 0 && <div className="pgm-empty">{assets.length ? 'No video at the playhead' : 'Add a clip to see it here'}</div>}
        <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
          {assets.map((a) => {
            const url = getVideoUrl(a.id);
            return (
              <video
                key={a.id}
                ref={(el) => { if (el) vids.current.set(a.id, el); else vids.current.delete(a.id); }}
                src={url ?? undefined}
                muted playsInline preload="auto"
              />
            );
          })}
        </div>
      </div>
        </div>
        <div className="pgm-controls">
          {showScope && <canvas ref={histoRef} width={200} height={46} className="pgm-histo" />}
          <div className="pgm-canvassize">
            <span className="pgm-tlabel">Screen size</span>
            <div className="pgm-irow2">
              {CANVAS_SIZE_PRESETS.map((p) => (
                <button key={p.label} className={`pgm-section-toggle ${canvasW === p.width && canvasH === p.height ? 'on' : ''}`}
                  title={`${p.width}×${p.height}`} onClick={() => onSetCanvasSize(p.width, p.height)}>
                  {p.label} <span className="pgm-presub">{p.sub}</span>
                </button>
              ))}
              <span className="pgm-canvasdims">{canvasW}×{canvasH}</span>
            </div>
          </div>
      {top && (
        <div className="pgm-inspector">
          <div className="pgm-irow">
            <span className="pgm-name" title={topName ?? ''}>{top.clip.text != null ? 'Title' : topName}</span>
            {top.clip.text == null && (
              <label className="pgm-ctrl" title="Blend mode">Blend
                <select value={top.clip.blend ?? 'normal'} onChange={(e) => onSetClip(top.trackId, top.clip.id, { blend: e.target.value as VideoBlend })}>
                  {VIDEO_BLENDS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
            )}
          </div>
          {top.clip.text != null && (
            <div className="pgm-title-edit">
              <textarea className="pgm-titletext" rows={2} value={top.clip.text} placeholder="Title text…"
                onChange={(e) => onSetClip(top.trackId, top.clip.id, { text: e.target.value })} />
              <div className="pgm-irow2">
                <select className="pgm-color-sel pgm-fontsel" value={top.clip.titleFont ?? 'Inter'} title="Font"
                  style={{ fontFamily: `"${top.clip.titleFont ?? 'Inter'}", sans-serif` }}
                  onChange={(e) => onSetClip(top.trackId, top.clip.id, { titleFont: e.target.value })}>
                  {TITLE_FONTS.map((f) => <option key={f.slug} value={f.name} style={{ fontFamily: `"${f.name}", sans-serif` }}>{f.name}</option>)}
                </select>
                <select className="pgm-color-sel" value={top.clip.titleAppear ?? 'fade'} title="Appear effect"
                  onChange={(e) => onSetClip(top.trackId, top.clip.id, { titleAppear: e.target.value as TitleAppear })}>
                  {TITLE_APPEARS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="pgm-irow2">
                <input type="color" className="pgm-color" title="Text colour" value={top.clip.titleColor ?? '#ffffff'}
                  onChange={(e) => onSetClip(top.trackId, top.clip.id, { titleColor: e.target.value })} />
                <select className="pgm-color-sel" value={top.clip.titleAlign ?? 'center'} title="Align"
                  onChange={(e) => onSetClip(top.trackId, top.clip.id, { titleAlign: e.target.value as 'left' | 'center' | 'right' })}>
                  <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </select>
                <button className={`pgm-section-toggle ${top.clip.titleBold ? 'on' : ''}`} title="Bold" onClick={() => onSetClip(top.trackId, top.clip.id, { titleBold: !top.clip.titleBold })}>B</button>
                <button className={`pgm-section-toggle ${top.clip.titleBg ? 'on' : ''}`} title="Background bar (lower third)" onClick={() => onSetClip(top.trackId, top.clip.id, { titleBg: !top.clip.titleBg })}>BG</button>
                <label className="pgm-ctrl" title="Text size">Size
                  <input type="range" min={0.03} max={0.25} step={0.005} value={top.clip.titleSize ?? 0.08} onChange={(e) => onSetClip(top.trackId, top.clip.id, { titleSize: parseFloat(e.target.value) })} />
                </label>
              </div>
            </div>
          )}
          <div className="pgm-tgrid">
            {PROPS.map(({ key, label, min, max, step }) => {
              const animated = !!kfOf(top.clip, key)?.length;
              const here = kfOf(top.clip, key)?.some((k) => Math.abs(k.t - topLocalT) <= 0.02);
              return (
                <div className="pgm-trow" key={key}>
                  <span className="pgm-tlabel">{label}</span>
                  <input type="range" min={min} max={max} step={step} value={Number(valueAt(key).toFixed(3))}
                    onChange={(e) => setValue(key, parseFloat(e.target.value))} />
                  <input type="number" className="pgm-tnum" min={min} max={max} step={step} value={Number(valueAt(key).toFixed(2))}
                    onChange={(e) => setValue(key, parseFloat(e.target.value))} />
                  <button className={`pgm-key ${animated ? (here ? 'here' : 'on') : ''}`} title={animated ? 'Keyframe at playhead (click to add/remove)' : 'Add keyframe (animate)'}
                    onClick={() => toggleKey(key)}><Diamond size={11} /></button>
                </div>
              );
            })}
          </div>
          <div className="pgm-irow2">
            <label className="pgm-ctrl" title="Fade in seconds — overlap two clips on stacked tracks for a cross dissolve">Fade in
              <input type="number" className="pgm-tnum" min={0} max={Math.max(0.1, top.clip.duration)} step={0.05}
                value={Number((top.clip.fadeIn ?? 0).toFixed(2))}
                onChange={(e) => onSetClip(top.trackId, top.clip.id, { fadeIn: Math.max(0, parseFloat(e.target.value) || 0) })} />
            </label>
            <label className="pgm-ctrl" title="Fade out seconds">Fade out
              <input type="number" className="pgm-tnum" min={0} max={Math.max(0.1, top.clip.duration)} step={0.05}
                value={Number((top.clip.fadeOut ?? 0).toFixed(2))}
                onChange={(e) => onSetClip(top.trackId, top.clip.id, { fadeOut: Math.max(0, parseFloat(e.target.value) || 0) })} />
            </label>
            <label className="pgm-ctrl" title="Easing for new keyframes">Ease
              <select value={ease} onChange={(e) => setEase(e.target.value as Easing)}>
                {EASINGS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
          </div>
          {top.clip.text == null && (
          <div className="pgm-irow2">
            <button className={`pgm-section-toggle ${showCrop ? 'on' : ''}`} onClick={() => setShowCrop((s) => !s)} title="Crop a region of the source frame"><CropIcon size={12} /> Crop</button>
            {top.clip.crop && <button className="pgm-reset" title="Reset crop" onClick={resetCrop}><RotateCcw size={11} /></button>}
            <button className={`pgm-section-toggle ${showColor ? 'on' : ''}`} onClick={() => setShowColor((s) => !s)} title="Color grade"><Palette size={12} /> Color</button>
            {showColor && top.clip.color && <button className="pgm-reset" title="Reset color" onClick={resetColor}><RotateCcw size={11} /></button>}
          </div>
          )}
          {showCrop && top.clip.text == null && (
            <>
              <div className="pgm-note">Drag the box or its corners to pick the region — the export and clip lane use this crop.</div>
              <div className="pgm-sizes">
                <span>Video <b>{topAsset?.width ?? '?'}×{topAsset?.height ?? '?'}</b></span>
                <span>Screen <b>{canvasW}×{canvasH}</b></span>
                <span>Crop <b>{cropDims ? `${cropDims.w}×${cropDims.h}` : 'full frame'}</b></span>
              </div>
            </>
          )}
          {top.clip.text == null && (
            <div className="pgm-layout">
              <span className="pgm-tlabel"><LayoutGrid size={11} /> Place on screen</span>
              <div className="pgm-layout-grid">
                {LAYOUT_GRID.map((key) => {
                  const slot = LAYOUT_SLOTS[key];
                  return (
                    <button key={key} className="pgm-layout-cell" title={slot.label} onClick={() => applyLayoutSlot(key)}>
                      <span className="pgm-layout-frame">
                        <span className="pgm-layout-region" style={{
                          left: `${(slot.cx - slot.wFrac / 2) * 100}%`, top: `${(slot.cy - slot.hFrac / 2) * 100}%`,
                          width: `${slot.wFrac * 100}%`, height: `${slot.hFrac * 100}%`,
                        }} />
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="pgm-note">Crops the clip to fit that slot (no stretch) and positions it there — set several clips on different slots for a split-screen or multi-cam scene.</div>
            </div>
          )}
          {showColor && top.clip.text == null && (
            <div className="pgm-tgrid">
              {COLOR_PROPS.map(({ key, label }) => (
                <div className="pgm-trow" key={key}>
                  <span className="pgm-tlabel">{label}</span>
                  <input type="range" min={-1} max={1} step={0.01} value={top.clip.color?.[key] ?? 0} onChange={(e) => setColor(key, parseFloat(e.target.value))} />
                  <input type="number" className="pgm-tnum" min={-1} max={1} step={0.05} value={Number((top.clip.color?.[key] ?? 0).toFixed(2))} onChange={(e) => setColor(key, parseFloat(e.target.value) || 0)} />
                  <span />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
