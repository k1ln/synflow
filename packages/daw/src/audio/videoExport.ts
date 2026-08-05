// Real in-browser video export via WebCodecs (GPU-accelerated) + mp4-muxer.
// Produces a standard .mp4 (H.264 + AAC) that plays everywhere / uploads to
// YouTube. No wasm, no SharedArrayBuffer/COOP-COEP. Chromium-only (already a
// given here). Picture comes from the video track's clips, scaled to the chosen
// resolution/fps and laid on the song timeline (gaps → black); audio is the song
// mixdown (which already includes each video's extracted audio). See docs/VIDEO.md.
import { songLengthSteps, type Project } from '../model/project';
import { evalTransform, drawVideoLayer, drawTitle } from './videoTransform';
import type { AudioAssets } from './AudioAssets';
import { bounceProjectToWav } from './bounce';
import { decodeToBuffer } from './decodeAudioFile';
import { encodeWav } from './wav';
import { loadTitleFonts } from '../fonts';

export type ExportContent = 'both' | 'video' | 'audio';
export type ExportFormat = 'mp4' | 'webm';
export type ExportQuality = 'low' | 'medium' | 'high';

export interface ExportOpts {
  content: ExportContent;
  width?: number;      // target px (undefined/0 = source)
  height?: number;
  fps: number;
  format: ExportFormat;
  quality: ExportQuality;
  range?: { startSec: number; endSec: number }; // in/out; omitted = whole song
  wavBits?: 16 | 24 | 32;   // audio-only WAV bit depth (32 = float); default 16
  sampleRate?: number;      // audio-only WAV sample rate; default 44100
}

export interface ExportResult { blob: Blob; ext: string; }

/** Bitrate multiplier on the base (W·H·fps) heuristic. */
const QUALITY_MULT: Record<ExportQuality, number> = { low: 0.04, medium: 0.075, high: 0.14 };
export const QUALITY_PRESETS: ExportQuality[] = ['low', 'medium', 'high'];
export const FORMAT_PRESETS: { id: ExportFormat; label: string }[] = [
  { id: 'mp4', label: 'MP4 (H.264 + AAC)' },
  { id: 'webm', label: 'WebM (VP9 + Opus)' },
];

/** Resolve a video asset's container bytes (session blob or disk). */
export type VideoBlobResolver = (assetId: string) => Promise<Blob | null>;

export function webCodecsSupported(): boolean {
  return typeof window !== 'undefined' && 'VideoEncoder' in window && 'AudioEncoder' in window && 'VideoFrame' in window;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Resolution presets offered in the UI (label → height; width derives from AR). */
export const RES_PRESETS: { label: string; height?: number }[] = [
  { label: 'Source' },
  { label: '2160p (4K)', height: 2160 },
  { label: '1080p', height: 1080 },
  { label: '720p', height: 720 },
  { label: '480p', height: 480 },
];
export const FPS_PRESETS = [24, 25, 30, 60];

function seekVideo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { v.removeEventListener('seeked', done); resolve(); };
    v.addEventListener('seeked', done);
    try { v.currentTime = Math.max(0, Math.min(t, (v.duration || t) - 1e-3)); } catch { resolve(); }
    window.setTimeout(done, 2000); // never hang on a bad seek
  });
}

async function loadVideoEl(blob: Blob): Promise<{ el: HTMLVideoElement; url: string }> {
  const url = URL.createObjectURL(blob);
  const el = document.createElement('video');
  el.muted = true; el.preload = 'auto'; el.src = url;
  await new Promise<void>((resolve) => {
    el.onloadeddata = () => resolve();
    el.onerror = () => resolve();
    window.setTimeout(resolve, 4000);
  });
  return { el, url };
}

/** Encode the song mixdown (optionally just the [startSec,endSec] range) into the
 *  muxer with the given codec ('mp4a.40.2' AAC for mp4, 'opus' for webm). */
async function encodeAudio(project: Project, assets: AudioAssets, muxer: any, codec: string, startSec: number, endSec: number, onProgress?: (f: number) => void): Promise<void> {
  const wav = await bounceProjectToWav(project, assets);
  const buf = await decodeToBuffer(wav);
  const sampleRate = buf.sampleRate;
  const channels = buf.numberOfChannels;
  const from = Math.max(0, Math.floor(startSec * sampleRate));
  const to = Math.min(buf.length, Math.ceil(endSec * sampleRate));
  const enc = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => console.error('[Mothscilla] audio encode error', e),
  });
  enc.configure({ codec, sampleRate, numberOfChannels: channels, bitrate: 192_000 });

  const CHUNK = 4096;
  const total = Math.max(1, to - from);
  for (let s = from; s < to; s += CHUNK) {
    const n = Math.min(CHUNK, to - s);
    // f32-planar: channel 0 frames, then channel 1 frames, …
    const planar = new Float32Array(n * channels);
    for (let c = 0; c < channels; c++) planar.set(buf.getChannelData(c).subarray(s, s + n), c * n);
    const data = new AudioData({
      format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: channels,
      timestamp: Math.round(((s - from) / sampleRate) * 1e6), data: planar,
    });
    enc.encode(data); data.close();
    onProgress?.(Math.min(1, (s + n - from) / total));
    if (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
  }
  await enc.flush();
  enc.close();
}

/** Slice a decoded mixdown to [startSec,endSec] and re-encode as WAV (audio-only range). */
async function rangedWav(project: Project, assets: AudioAssets, startSec: number, endSec: number, bits: 16 | 24 | 32 = 16, sampleRate?: number): Promise<ArrayBuffer> {
  const wav = await bounceProjectToWav(project, assets, { bits: 32, sampleRate });   // full-precision intermediate
  const buf = await decodeToBuffer(wav);
  const from = Math.max(0, Math.floor(startSec * buf.sampleRate));
  const to = Math.min(buf.length, Math.ceil(endSec * buf.sampleRate));
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).slice(from, to));
  return encodeWav(chans, buf.sampleRate, bits);
}

/**
 * Export the project. `audio` → WAV bounce; `video`/`both` → WebCodecs-encoded mp4.
 * `getVideoBlob` resolves each video asset's container bytes.
 */
export async function exportVideo(
  project: Project,
  assets: AudioAssets,
  opts: ExportOpts,
  getVideoBlob: VideoBlobResolver,
  onProgress?: (frac: number, phase: string) => void,
): Promise<ExportResult> {
  const secPerStep = 60 / project.bpm / project.stepsPerBeat;
  const fullSec = Math.max(0.04, songLengthSteps(project) * secPerStep);
  const startSec = opts.range ? Math.max(0, Math.min(opts.range.startSec, fullSec - 0.04)) : 0;
  const endSec = opts.range ? Math.max(startSec + 0.04, Math.min(opts.range.endSec, fullSec)) : fullSec;

  // ── audio-only → reuse the existing WAV bounce (sliced to the range) ──
  if (opts.content === 'audio') {
    onProgress?.(0.2, 'Bouncing audio');
    const bits = opts.wavBits ?? 16;
    const wav = opts.range
      ? await rangedWav(project, assets, startSec, endSec, bits, opts.sampleRate)
      : await bounceProjectToWav(project, assets, { bits, sampleRate: opts.sampleRate });
    onProgress?.(1, 'Done');
    return { blob: new Blob([wav], { type: 'audio/wav' }), ext: 'wav' };
  }

  if (!webCodecsSupported()) throw new Error('This browser lacks WebCodecs — video export needs a recent Chromium (Chrome/Edge).');

  // All video tracks, bottom → top (later track composites on top), each with its
  // clips sorted by start.
  const videoTracks = project.tracks
    .filter((t) => t.type === 'video' && (t.videoClips?.length ?? 0) > 0)
    .map((t) => ({ id: t.id, clips: [...(t.videoClips ?? [])].sort((a, b) => a.start - b.start) }));
  if (videoTracks.length === 0) throw new Error('No video clips to export. Add a Video track and import a clip first.');
  const allClips = videoTracks.flatMap((t) => t.clips);
  const vassets = new Map((project.videoAssets ?? []).map((a) => [a.id, a]));

  // Target resolution from the first real (non-title) clip; default 16:9 if titles only.
  const firstVideoClip = allClips.find((c) => c.text == null && c.assetId);
  const first = firstVideoClip ? vassets.get(firstVideoClip.assetId) : undefined;
  const srcW = first?.width || 1280, srcH = first?.height || 720;
  const W = even(opts.width || srcW);
  const H = even(opts.height || Math.round(W * (srcH / srcW)));
  const fps = opts.fps;

  // Range → frame count. Reuses the constant-BPM step math.
  const totalSec = Math.max(0.04, endSec - startSec);
  const totalFrames = Math.max(1, Math.ceil(totalSec * fps));

  // ── pick muxer + codecs for the chosen container ──
  const webm = opts.format === 'webm';
  const muxAudio = opts.content === 'both';
  const audioCodec = webm ? 'opus' : 'mp4a.40.2';
  const videoCandidates = webm ? ['vp09.00.10.08', 'vp8'] : ['avc1.640028', 'avc1.4d0028', 'avc1.42E01F'];
  let muxer: any;
  if (webm) {
    const { Muxer, ArrayBufferTarget } = await import('webm-muxer');
    muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'V_VP9', width: W, height: H, frameRate: fps },
      ...(muxAudio ? { audio: { codec: 'A_OPUS', numberOfChannels: 2, sampleRate: 48000 } } : {}),
      firstTimestampBehavior: 'offset',
    });
  } else {
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
    muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: W, height: H },
      ...(muxAudio ? { audio: { codec: 'aac', numberOfChannels: 2, sampleRate: 48000 } } : {}),
      fastStart: 'in-memory',
    });
  }
  const addV = (chunk: EncodedVideoChunk, meta?: any) => muxer.addVideoChunk(chunk, meta);

  // Pick a supported encoder config (try hardware, fall back to software).
  const bitrate = Math.round(W * H * fps * QUALITY_MULT[opts.quality]);
  let cfg: VideoEncoderConfig | null = null;
  for (const codec of videoCandidates) {
    const c: VideoEncoderConfig = { codec, width: W, height: H, bitrate, framerate: fps, hardwareAcceleration: 'prefer-hardware' };
    if ((await VideoEncoder.isConfigSupported(c)).supported) { cfg = c; break; }
    const sw = { ...c, hardwareAcceleration: 'prefer-software' as const };
    if ((await VideoEncoder.isConfigSupported(sw)).supported) { cfg = sw; break; }
  }
  if (!cfg) throw new Error(`No supported ${webm ? 'VP9/VP8' : 'H.264'} encoder configuration for this resolution.`);

  const venc = new VideoEncoder({
    output: (chunk, meta) => addV(chunk, meta),
    error: (e) => console.error('[Mothscilla] video encode error', e),
  });
  venc.configure(cfg);

  // One <video> element per source asset (titles have no asset).
  const els = new Map<string, { el: HTMLVideoElement; url: string }>();
  for (const id of new Set(allClips.filter((c) => c.text == null && c.assetId).map((c) => c.assetId))) {
    const blob = await getVideoBlob(id);
    if (blob) els.set(id, await loadVideoEl(blob));
  }

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d')!;
  const frameDurUs = Math.round(1e6 / fps);
  // Titles render on-canvas, so their fonts must be loaded before the first frame.
  await loadTitleFonts();
  try { await (document as any).fonts?.ready; } catch { /* no font manager */ }

  try {
    for (let f = 0; f < totalFrames; f++) {
      const t = startSec + f / fps;                       // timeline seconds (range-offset)
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);   // gaps → black
      // Composite every video track at this time, bottom → top, with its transform.
      for (const tr of videoTracks) {
        const clip = tr.clips.find((c) => { const s0 = c.start * secPerStep; return t >= s0 && t < s0 + c.duration; });
        if (!clip) continue;
        const localT = t - clip.start * secPerStep;
        if (clip.text != null) { drawTitle(ctx, W, H, clip, evalTransform(clip, localT), localT); continue; }
        const src = els.get(clip.assetId); if (!src) continue;
        await seekVideo(src.el, clip.offset + localT);
        drawVideoLayer(ctx, src.el, W, H, evalTransform(clip, localT), clip.blend, clip.color);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      const frame = new VideoFrame(canvas, { timestamp: f * frameDurUs, duration: frameDurUs });
      venc.encode(frame, { keyFrame: f % (fps * 2) === 0 });
      frame.close();
      if (venc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
      onProgress?.(f / totalFrames, `Encoding video ${Math.round((f / totalFrames) * 100)}%`);
    }
    await venc.flush();
    venc.close();

    if (muxAudio) {
      onProgress?.(0.95, 'Encoding audio');
      await encodeAudio(project, assets, muxer, audioCodec, startSec, endSec);
    }
    muxer.finalize();
    onProgress?.(1, 'Done');
    const { buffer } = muxer.target as { buffer: ArrayBuffer };
    return { blob: new Blob([buffer], { type: webm ? 'video/webm' : 'video/mp4' }), ext: webm ? 'webm' : 'mp4' };
  } finally {
    for (const { url } of els.values()) URL.revokeObjectURL(url);
  }
}
