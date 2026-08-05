import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Film, Diamond, Palette, BarChart3, RotateCcw } from 'lucide-react';
import { VIDEO_BLENDS, TITLE_APPEARS, type ClipColor, type ClipTransform, type Easing, type Keyframe, type Project, type TitleAppear, type VideoBlend, type VideoClip } from '../model/project';
import { evalTransform, drawVideoLayer, drawTitle, upsertKeyframe } from '../audio/videoTransform';
import { TITLE_FONTS } from '../fonts';

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
  project, currentStep, isPlaying, getVideoUrl, onClose, onSetClip, canvasRef, dock = false,
}: {
  project: Project;
  dock?: boolean;
  currentStep: number;
  isPlaying: boolean;
  getVideoUrl: (assetId: string) => string | null;
  onClose: () => void;
  onSetClip: (trackId: string, clipId: string, patch: Partial<VideoClip>) => void;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}) {
  const secPerStep = 60 / project.bpm / project.stepsPerBeat;
  const t = Math.max(0, currentStep) * secPerStep;
  const [ease, setEase] = useState<Easing>('ease');
  const [showColor, setShowColor] = useState(false);
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
          drawVideoLayer(ctx, el, W, H, evalTransform(l.clip, localT), l.clip.blend, l.clip.color);
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
    <div className={`pgm${dock ? ' pgm-dock' : ''}`}>
      <div className="pgm-head">
        <span className="pgm-title"><Film size={12} /> Program{layers.length > 1 ? ` · ${layers.length} layers` : ''}</span>
        <button className={`pgm-close ${showScope ? 'on' : ''}`} title="Histogram scope" onClick={() => setShowScope((s) => !s)}><BarChart3 size={13} /></button>
        <button className="pgm-close" title="Hide preview" onClick={onClose}><X size={13} /></button>
      </div>
      <div className="pgm-body">
        <div className="pgm-stage">
      <div className="pgm-screen">
        <canvas ref={canvasRef} width={1280} height={720} className="pgm-canvas" />
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
            <button className={`pgm-section-toggle ${showColor ? 'on' : ''}`} onClick={() => setShowColor((s) => !s)} title="Color grade"><Palette size={12} /> Color</button>
            {showColor && top.clip.color && <button className="pgm-reset" title="Reset color" onClick={resetColor}><RotateCcw size={11} /></button>}
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
