// Per-clip video transform: evaluate position/scale/rotation/opacity at a given
// clip-local time (interpolating keyframes with easing), and draw a video layer
// with that transform. Shared by the program monitor (ui) and the exporter
// (audio) so preview and render match exactly. See docs/VIDEO.md.
import { blendCompositeOp, type ClipColor, type Easing, type Keyframe, type VideoBlend, type VideoClip } from '../model/project';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

/** Build a canvas `filter` string for exposure/contrast/saturation (0 = neutral). */
export function colorFilter(c?: ClipColor): string {
  if (!c) return 'none';
  const b = 1 + (c.exposure ?? 0) * 0.6;
  const ct = 1 + (c.contrast ?? 0) * 0.5;
  const s = Math.max(0, 1 + (c.saturation ?? 0));
  if (b === 1 && ct === 1 && s === 1) return 'none';
  return `brightness(${b.toFixed(3)}) contrast(${ct.toFixed(3)}) saturate(${s.toFixed(3)})`;
}

/** Warm/cool + magenta/green tint as a soft-light overlay colour (null = neutral). */
export function tintColor(c?: ClipColor): string | null {
  const temp = c?.temperature ?? 0, tint = c?.tint ?? 0;
  if (!temp && !tint) return null;
  return `rgb(${clamp255(128 + temp * 80 + tint * 55)},${clamp255(128 - tint * 80)},${clamp255(128 - temp * 80 + tint * 55)})`;
}

/** Eased progress 0..1 for the segment after a keyframe ('hold' is handled by the
 *  caller, which returns the left value). Named presets approximate Bezier eases. */
function easeFn(e: Easing | undefined, f: number): number {
  switch (e) {
    case 'ease-in': return f * f;
    case 'ease-out': return 1 - (1 - f) * (1 - f);
    case 'ease': return f < 0.5 ? 2 * f * f : 1 - ((-2 * f + 2) ** 2) / 2;
    default: return f; // linear
  }
}

/** Sample a keyframed property at clip-local time `t`, else the static value. */
function sample(kfs: Keyframe[] | undefined, staticVal: number | undefined, t: number, def: number): number {
  if (kfs && kfs.length) {
    if (t <= kfs[0].t) return kfs[0].value;
    const last = kfs[kfs.length - 1];
    if (t >= last.t) return last.value;
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i], b = kfs[i + 1];
      if (t >= a.t && t <= b.t) {
        if (a.ease === 'hold') return a.value;
        const f = (t - a.t) / Math.max(1e-6, b.t - a.t);
        return a.value + (b.value - a.value) * easeFn(a.ease, f);
      }
    }
    return last.value;
  }
  return staticVal ?? def;
}

export interface EvaluatedTransform { x: number; y: number; scale: number; rotation: number; opacity: number }

/** Resolve a clip's transform at clip-local time `t` (seconds from clip start).
 *  The fade in/out (cross-dissolve handles) multiplies the resolved opacity. */
export function evalTransform(clip: VideoClip, t: number): EvaluatedTransform {
  const tf = clip.transform;
  let opacity = sample(tf?.kf?.opacity, clip.opacity, t, 1);
  const fi = clip.fadeIn ?? 0, fo = clip.fadeOut ?? 0, dur = clip.duration;
  if (fi > 0 && t < fi) opacity *= Math.max(0, t / fi);
  if (fo > 0 && t > dur - fo) opacity *= Math.max(0, (dur - t) / fo);
  return {
    x: sample(tf?.kf?.x, tf?.x, t, 0),
    y: sample(tf?.kf?.y, tf?.y, t, 0),
    scale: sample(tf?.kf?.scale, tf?.scale, t, 1),
    rotation: sample(tf?.kf?.rotation, tf?.rotation, t, 0),
    opacity,
  };
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draw a video frame into a WxH canvas with the evaluated transform + blend.
 *  Base fit is object-fit: contain; `scale` multiplies it, `x`/`y` offset by a
 *  fraction of the frame, rotation is around the clip centre. */
export function drawVideoLayer(
  ctx: Ctx2D,
  el: HTMLVideoElement,
  W: number, H: number,
  ev: EvaluatedTransform,
  blend: VideoBlend | undefined,
  color?: ClipColor,
): void {
  const vw = el.videoWidth, vh = el.videoHeight;
  if (!vw || !vh) return;
  ctx.save();
  ctx.globalAlpha = clamp01(ev.opacity);
  ctx.globalCompositeOperation = blendCompositeOp(blend);
  ctx.translate(W / 2 + ev.x * W, H / 2 + ev.y * H);
  if (ev.rotation) ctx.rotate((ev.rotation * Math.PI) / 180);
  const fit = Math.min(W / vw, H / vh) * Math.max(0, ev.scale);
  const w = vw * fit, h = vh * fit;
  ctx.filter = colorFilter(color);                          // exposure/contrast/saturation
  try { ctx.drawImage(el, -w / 2, -h / 2, w, h); } catch { /* frame not ready */ }
  ctx.filter = 'none';
  const tc = tintColor(color);                              // warm/cool + magenta/green
  if (tc) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = tc; ctx.fillRect(-w / 2, -h / 2, w, h); }
  ctx.restore();
}

/** Draw a title clip (a VideoClip with `text`) into the WxH canvas, positioned/
 *  scaled/faded by its evaluated transform, with an optional intro animation.
 *  Lower-third background, alignment, bold, font + a readability shadow are
 *  supported; `\n` splits lines. `localT` (clip-local seconds) drives the appear. */
export function drawTitle(ctx: Ctx2D, W: number, H: number, clip: VideoClip, ev: EvaluatedTransform, localT: number): void {
  // Intro animation over the fade-in length (or ~0.5s).
  const appear = clip.titleAppear ?? 'none';
  const adur = clip.fadeIn && clip.fadeIn > 0 ? clip.fadeIn : 0.5;
  const p = appear === 'none' ? 1 : Math.max(0, Math.min(1, localT / adur));
  const e = 1 - Math.pow(1 - p, 3);                              // easeOutCubic
  let dx = 0, dy = 0, sc = 1, blur = 0;
  if (p < 1) {
    if (appear === 'slide-up') dy = (1 - e) * 0.12;
    else if (appear === 'slide-down') dy = -(1 - e) * 0.12;
    else if (appear === 'slide-left') dx = (1 - e) * 0.16;
    else if (appear === 'slide-right') dx = -(1 - e) * 0.16;
    else if (appear === 'pop') sc = 0.7 + 0.3 * e;
    else if (appear === 'blur') blur = (1 - e) * 0.035 * H;
  }
  let text = clip.text ?? '';
  if (appear === 'typewriter' && p < 1) text = text.slice(0, Math.ceil(e * text.length));
  if (!text) return;
  const motion = appear !== 'none' && appear !== 'fade';
  const alpha = clamp01(ev.opacity) * (motion ? e : 1);          // ease opacity in for motion effects
  if (alpha <= 0) return;

  const lines = text.split('\n');
  const size = Math.max(4, (clip.titleSize ?? 0.08) * H * Math.max(0.05, ev.scale) * sc);
  const lineH = size * 1.3;
  const totalH = lines.length * lineH;
  const align = clip.titleAlign ?? 'center';
  const family = clip.titleFont ? `"${clip.titleFont}", Inter, system-ui, sans-serif` : 'Inter, system-ui, sans-serif';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'source-over';
  ctx.translate(W / 2 + (ev.x + dx) * W, H / 2 + (ev.y + dy) * H);
  if (ev.rotation) ctx.rotate((ev.rotation * Math.PI) / 180);
  ctx.font = `${clip.titleBold ? '700' : '600'} ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (clip.titleBg) {
    let maxW = 0; for (const ln of lines) maxW = Math.max(maxW, ctx.measureText(ln).width);
    const pad = size * 0.45;
    const bx = align === 'center' ? -maxW / 2 : align === 'right' ? -maxW : 0;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(bx - pad, -totalH / 2 - pad * 0.3, maxW + pad * 2, totalH + pad * 0.6);
  }
  if (blur > 0) ctx.filter = `blur(${blur.toFixed(2)}px)`;
  ctx.fillStyle = clip.titleColor ?? '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = size * 0.12; ctx.shadowOffsetY = size * 0.03;
  lines.forEach((ln, i) => ctx.fillText(ln, 0, -totalH / 2 + lineH * (i + 0.5)));
  ctx.filter = 'none';
  ctx.restore();
}

/** Insert or replace a keyframe at time `t` (within ~1 frame), keeping the list
 *  sorted. Returns a new array (immutable update). */
export function upsertKeyframe(kfs: Keyframe[] | undefined, t: number, value: number, ease: Easing): Keyframe[] {
  const out = [...(kfs ?? [])].filter((k) => Math.abs(k.t - t) > 0.02);
  out.push({ t, value, ease });
  out.sort((a, b) => a.t - b.t);
  return out;
}
