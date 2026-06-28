// Plays audio clips for one audio track. Disk-backed WAV clips stream off disk
// frame-by-frame through an AudioWorklet (low RAM, sample-accurate onset) — so a
// dozen hour-long clips can play at once. Embedded/short clips fall back to an
// AudioBufferSource. The loose <audio> + MediaElementSource path is opt-in
// (`stream: true`) for live monitoring. Output connects to the track's mixer strip
// so track FX + volume apply.
import type { AudioAsset, AudioClip } from '../model/project';
import type { AudioAssets } from './AudioAssets';
import { ClipStreamer, ensureClipStreamModule } from './ClipStreamer';

interface Active { stop: () => void }

export class AudioClipPlayer {
  private active: Active[] = [];

  constructor(private ctx: AudioContext, private assets: AudioAssets, private dest: AudioNode) {}

  /** Warm caches so scheduling inside the lookahead window is synchronous: open the
   *  on-disk WAV (header) for streaming clips, decode short/embedded ones to a buffer. */
  async preload(clips: AudioClip[], byId: (id: string) => AudioAsset | undefined): Promise<void> {
    const seen = new Set<string>();
    let needModule = false;
    for (const c of clips) {
      if (seen.has(c.assetId)) continue; seen.add(c.assetId);
      const asset = byId(c.assetId); if (!asset) continue;
      if (this.assets.isDisk(asset)) { await this.assets.resolveStream(asset); needModule = true; } // disk → stream (converts legacy mp3/webm to WAV once)
      else await this.assets.resolveBuffer(asset);
    }
    if (needModule) await ensureClipStreamModule(this.ctx);
  }

  /** Schedule a clip. `when` is the clock time it should sound; `leadMs` is ms from
   *  now to `when` (used by the opt-in <audio> path). Disk WAVs stream; otherwise
   *  the sample-accurate buffer path is used. */
  schedule(clip: AudioClip, asset: AudioAsset, when: number, leadMs: number, stream = false): void {
    if (stream && this.assets.isStreamed(asset)) { this.scheduleStreamed(clip, asset, leadMs); return; }
    const s = this.assets.cachedStream(asset); // populated by preload for any disk asset (after WAV conversion)
    if (s) this.scheduleStream(clip, s.blob, s.meta, when);
    else this.scheduleBuffer(clip, asset, when);
  }

  private scheduleStream(clip: AudioClip, blob: Blob, meta: import('./wavReader').WavMeta, when: number): void {
    const a: Active = { stop: () => {} };
    const streamer = new ClipStreamer(this.ctx, blob, meta, {
      startTime: Math.max(when, this.ctx.currentTime),
      offsetSec: clip.offset, durationSec: clip.duration, gain: clip.gain, dest: this.dest,
      onEnded: () => { this.active = this.active.filter((x) => x !== a); },
    });
    a.stop = () => streamer.stop();
    this.active.push(a);
  }

  private scheduleBuffer(clip: AudioClip, asset: AudioAsset, when: number): void {
    const buf = this.assets.cachedBuffer(asset);
    const start = (b: AudioBuffer) => {
      const src = this.ctx.createBufferSource(); src.buffer = b;
      const g = this.ctx.createGain(); g.gain.value = clip.gain;
      src.connect(g).connect(this.dest);
      const at = Math.max(when, this.ctx.currentTime);
      src.start(at, clip.offset, clip.duration);
      const a: Active = { stop: () => { try { src.stop(); } catch { /* noop */ } try { src.disconnect(); } catch { /* noop */ } } };
      this.active.push(a);
      src.onended = () => { this.active = this.active.filter((x) => x !== a); };
    };
    if (buf) start(buf);
    else void this.assets.resolveBuffer(asset).then((b) => { if (b) start(b); });
  }

  private scheduleStreamed(clip: AudioClip, asset: AudioAsset, leadMs: number): void {
    void this.assets.resolveUrl(asset).then((url) => {
      if (!url) return;
      const el = new Audio(url); el.preload = 'auto';
      const node = this.ctx.createMediaElementSource(el);
      const g = this.ctx.createGain(); g.gain.value = clip.gain;
      node.connect(g).connect(this.dest);
      const a: Active = { stop: () => { try { el.pause(); } catch { /* noop */ } try { node.disconnect(); } catch { /* noop */ } } };
      this.active.push(a);
      const t0 = window.setTimeout(() => { el.currentTime = clip.offset; void el.play().catch(() => {}); }, Math.max(0, leadMs));
      const t1 = window.setTimeout(() => { el.pause(); this.active = this.active.filter((x) => x !== a); }, Math.max(0, leadMs) + clip.duration * 1000);
      a.stop = () => { window.clearTimeout(t0); window.clearTimeout(t1); try { el.pause(); } catch { /* noop */ } try { node.disconnect(); } catch { /* noop */ } };
    });
  }

  stopAll(): void { for (const a of this.active) a.stop(); this.active = []; }
  dispose(): void { this.stopAll(); }
}
