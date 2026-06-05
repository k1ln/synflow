// Low-RAM, FX-aware song mixdown. Renders the arrangement in overlapping time
// windows through the real Mixer + FX graph (an OfflineAudioContext per window),
// feeding each window only the slice of each clip it needs (read straight off the
// on-disk WAV), and streams the 16-bit PCM result to disk a window at a time. This
// keeps memory bounded no matter how long the song or how many clips — so a dozen
// hour-long stems mix down without ever holding the whole thing in RAM.
//
// FX continuity: each window is rendered with a pre-roll (`preRollSec`) before its
// start so reverb/delay tails and filter state are warmed up; we then write only
// the window's own span and discard the pre-roll. No overlap-add, so sources that
// span window boundaries are never double-counted.
import { Mixer, type ResolvedFx } from './Mixer';
import { InstrumentHost } from './InstrumentHost';
import { VoicePool } from './VoicePool';
import { wavHeader, encodeWavFrames } from './wav';
import { readWavFrames } from './wavReader';
import { findEntry, cloneFlow } from '../synflow/library';
import { trackActiveAt, songLengthSteps, songLengthSlots, type Project } from '../model/project';
import { midiToFreq } from '../model/pitch';
import type { AudioAssets } from './AudioAssets';

const resolveFx = (inserts: { name: string; fxId: string; flow?: any; eq?: any }[]): ResolvedFx[] =>
  inserts
    .map((ins): ResolvedFx | null => {
      if (ins.eq) return { name: ins.name, eq: ins.eq };
      const flow = ins.flow ?? findEntry(ins.fxId)?.flow;
      return flow ? { name: ins.name, flow: cloneFlow(flow) } : null;
    })
    .filter((x): x is ResolvedFx => !!x);

/** A streaming sink (e.g. a File System Access writable). */
export interface BounceSink { write(data: BufferSource): Promise<void>; }

export interface BounceStreamOpts {
  sampleRate?: number;
  windowSec?: number;   // render granularity
  preRollSec?: number;  // FX warm-up before each window (>= longest tail)
  onProgress?: (frac: number) => void;
}

/** Read a clip's [offsetSec, offsetSec+durSec) into a small AudioBuffer at `sr`. */
async function readClipBuffer(
  ctx: BaseAudioContext, assets: AudioAssets, project: Project,
  assetId: string, offsetSec: number, durSec: number, sr: number,
): Promise<AudioBuffer | null> {
  const asset = project.assets.find((a) => a.id === assetId); if (!asset) return null;
  const outFrames = Math.max(1, Math.round(durSec * sr));
  if (assets.isDisk(asset)) {
    const s = await assets.resolveStream(asset); if (!s) return null; // converts legacy mp3 → WAV once, then streams
    const srcStart = Math.round(offsetSec * s.meta.sampleRate);
    const planar = await readWavFrames(s.blob, s.meta, srcStart, outFrames, sr);
    const buf = ctx.createBuffer(2, outFrames, sr);
    buf.copyToChannel((planar[0] ?? new Float32Array(outFrames)) as any, 0);
    buf.copyToChannel((planar[1] ?? planar[0] ?? new Float32Array(outFrames)) as any, 1);
    return buf;
  }
  // Embedded/non-WAV: decode whole then copy the slice (these are short anyway).
  const whole = await assets.resolveBuffer(asset); if (!whole) return null;
  const startFrame = Math.round(offsetSec * whole.sampleRate);
  const buf = ctx.createBuffer(2, outFrames, sr);
  for (let c = 0; c < 2; c++) {
    const ch = whole.getChannelData(Math.min(c, whole.numberOfChannels - 1));
    const out = new Float32Array(outFrames);
    for (let i = 0; i < outFrames; i++) out[i] = ch[startFrame + i] ?? 0;
    buf.copyToChannel(out, c);
  }
  return buf;
}

export async function bounceProjectStream(
  project: Project, assets: AudioAssets, sink: BounceSink, opts: BounceStreamOpts = {},
): Promise<{ frames: number; sampleRate: number }> {
  const sr = opts.sampleRate ?? 44100;
  const WIN = opts.windowSec ?? 30;
  const PRE = opts.preRollSec ?? 4;
  const spp = 60 / project.bpm / project.stepsPerBeat;
  const lengthSec = Math.max(spp, songLengthSteps(project) * spp);
  const songSteps = Math.round(lengthSec / spp);
  const slots = songLengthSlots(project);
  const totalFrames = Math.round(lengthSec * sr);

  await sink.write(wavHeader(sr, 2, totalFrames)); // 16-bit stereo header up front

  let written = 0;
  for (let t0 = 0; t0 < lengthSec; t0 += WIN) {
    const t1 = Math.min(t0 + WIN, lengthSec);
    const preStart = Math.max(0, t0 - PRE);
    const localLen = t1 - preStart;
    const ctx = new OfflineAudioContext(2, Math.ceil(localLen * sr) + 128, sr);
    const mixer = new Mixer(ctx as unknown as AudioContext);
    await mixer.masterChain.setChain(resolveFx(project.masterFx));
    const hosts = new Map<string, InstrumentHost>();
    const pools = new Map<string, VoicePool>();

    // ── build graph + schedule audio clips for this window ───────────────────
    for (const track of project.tracks) {
      const t = mixer.track(track.id, track.volume);
      await t.chain.setChain(resolveFx(track.fx));
      if (track.muted) continue;
      if (track.type === 'audio') {
        for (const c of track.audioClips ?? []) {
          const clipStart = c.start * spp, clipEnd = clipStart + c.duration;
          const segStart = Math.max(clipStart, preStart), segEnd = Math.min(clipEnd, t1);
          if (segEnd <= segStart) continue;
          const buf = await readClipBuffer(ctx, assets, project, c.assetId, c.offset + (segStart - clipStart), segEnd - segStart, sr);
          if (!buf) continue;
          const src = ctx.createBufferSource(); src.buffer = buf;
          const g = ctx.createGain(); g.gain.value = c.gain;
          src.connect(g).connect(t.sum);
          src.start(segStart - preStart);
        }
        continue;
      }
      for (const use of track.uses) {
        const pool = project.pool.find((p) => p.id === use.poolId); if (!pool) continue;
        const dest = mixer.use(use.id, track.id);
        await mixer.usePoolChain(use.id)!.setChain(resolveFx(pool.fx ?? []));
        await mixer.useChain(use.id)!.setChain(resolveFx(use.fx));
        mixer.setUseGain(use.id, pool.gain ?? 1);
        if (pool.kind === 'synth') pools.set(use.id, await VoicePool.create(() => new InstrumentHost(ctx, pool.flow, dest), use.voices ?? 6));
        else { const host = new InstrumentHost(ctx, pool.flow, dest); await host.load(); hosts.set(use.id, host); }
      }
    }

    // ── collect synth/drum triggers whose time falls in [preStart, t1) ───────
    const events: Array<{ time: number; fn: () => void }> = [];
    let nid = 1;
    for (let s = Math.max(0, Math.floor(preStart / spp)); s < Math.min(songSteps, Math.ceil(t1 / spp)); s++) {
      const slot = Math.floor(s / project.totalSteps);
      const base = s * spp;
      for (const track of project.tracks) {
        if (track.type === 'audio' || track.muted) continue;
        if (!trackActiveAt(track.clips, slot, slots)) continue;
        const step = s % Math.max(1, track.length);
        for (const use of track.uses) {
          if (use.muted) continue;
          if (track.type === 'synth' && use.notes) {
            const vp = pools.get(use.id); if (!vp) continue;
            for (const n of use.notes) {
              if (Math.floor(n.start) !== step) continue;
              const on = base + (n.start - step) * spp;
              const id = nid++; const f = midiToFreq(n.midi);
              events.push({ time: on, fn: () => vp.noteOn(id, f) });
              events.push({ time: on + n.length * spp, fn: () => vp.noteOff(id) });
            }
          } else if (track.type === 'drums' && use.steps?.[step]) {
            const host = hosts.get(use.id); if (!host) continue;
            events.push({ time: base, fn: () => host.trigger() });
            events.push({ time: base + Math.min(spp * 0.9, 0.5), fn: () => host.release() });
          }
        }
      }
    }
    const groups = new Map<number, Array<() => void>>();
    for (const e of events) {
      const local = e.time - preStart;
      if (local < 0 || local >= localLen) continue;
      const frame = Math.max(128, Math.round((local * sr) / 128) * 128); // can't suspend at frame 0
      (groups.get(frame) ?? groups.set(frame, []).get(frame)!).push(e.fn);
    }
    for (const frame of [...groups.keys()].sort((a, b) => a - b)) {
      const fns = groups.get(frame)!;
      void ctx.suspend(frame / sr).then(() => { for (const fn of fns) fn(); void ctx.resume(); });
    }

    // ── render, write the window's own span (drop the pre-roll) ──────────────
    const rendered = await ctx.startRendering();
    const chans = Array.from({ length: rendered.numberOfChannels }, (_, c) => rendered.getChannelData(c));
    const skip = Math.round((t0 - preStart) * sr);
    let count = Math.round((t1 - t0) * sr);
    if (written + count > totalFrames) count = totalFrames - written;
    if (count > 0) { await sink.write(encodeWavFrames(chans, skip, count)); written += count; }

    for (const vp of pools.values()) vp.dispose();
    for (const h of hosts.values()) h.dispose();
    opts.onProgress?.(Math.min(1, written / totalFrames));
  }

  if (written < totalFrames) { // pad to the declared header length if rounding left a gap
    const pad = totalFrames - written;
    await sink.write(encodeWavFrames([new Float32Array(pad), new Float32Array(pad)], 0, pad));
    written = totalFrames;
  }
  return { frames: written, sampleRate: sr };
}
