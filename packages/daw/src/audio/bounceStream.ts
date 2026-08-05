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
import { wavHeader, encodeWavFrames, type WavBits } from './wav';
import { scheduleFadeWindow } from './clipFade';
import { readWavFrames } from './wavReader';
import { findEntry, cloneFlow } from '../synflow/library';
import { activeClipAt, trackAudible, songLengthSteps, songLengthSlots, swingDelaySteps, clipPatternId, patternContent, patternLengthOf, syncPatterns, timelineAutoValue, clipRate, type Project } from '../model/project';
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
  bits?: WavBits;       // 16 (dithered) | 24 | 32-float; default 16
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
  project = syncPatterns(project);   // snapshots reflect the latest live edits
  const sr = opts.sampleRate ?? 44100;
  const bits = opts.bits ?? 16;
  const WIN = opts.windowSec ?? 30;
  const PRE = opts.preRollSec ?? 4;
  const spp = 60 / project.bpm / project.stepsPerBeat;
  const lengthSec = Math.max(spp, songLengthSteps(project) * spp);
  const songSteps = Math.round(lengthSec / spp);
  const slots = songLengthSlots(project);
  const totalFrames = Math.round(lengthSec * sr);

  await sink.write(wavHeader(sr, 2, totalFrames, bits)); // stereo header up front

  let written = 0;
  for (let t0 = 0; t0 < lengthSec; t0 += WIN) {
    const t1 = Math.min(t0 + WIN, lengthSec);
    const preStart = Math.max(0, t0 - PRE);
    const localLen = t1 - preStart;
    const ctx = new OfflineAudioContext(2, Math.ceil(localLen * sr) + 128, sr);
    const mixer = new Mixer(ctx as unknown as AudioContext);
    await mixer.masterChain.setChain(resolveFx(project.masterFx));
    for (const bus of project.buses ?? []) { const b = mixer.bus(bus.id, bus.volume); await b.chain.setChain(resolveFx(bus.fx)); }
    const hosts = new Map<string, InstrumentHost>();
    const pools = new Map<string, VoicePool>();

    // ── build graph + schedule audio clips for this window ───────────────────
    for (const track of project.tracks) {
      const t = mixer.track(track.id, track.volume);
      mixer.setTrackPan(track.id, track.pan ?? 0);
      mixer.setTrackTrim(track.id, track.trim ?? 1, !!track.phase);
      await t.chain.setChain(resolveFx(track.fx));
      if (!trackAudible(track, project.tracks)) continue;   // mute/solo
      if (track.type === 'audio') {
        for (const c of track.audioClips ?? []) {
          const clipStart = c.start * spp, clipEnd = clipStart + c.duration;
          const segStart = Math.max(clipStart, preStart), segEnd = Math.min(clipEnd, t1);
          if (segEnd <= segStart) continue;
          const rate = clipRate(c);
          // source span = timeline span × rate, offset scaled from the clip start
          const buf = await readClipBuffer(ctx, assets, project, c.assetId, c.offset + (segStart - clipStart) * rate, (segEnd - segStart) * rate, sr);
          if (!buf) continue;
          const src = ctx.createBufferSource(); src.buffer = buf;
          src.playbackRate.value = rate;
          const g = ctx.createGain(); g.gain.value = c.gain;
          src.connect(g).connect(t.sum);
          if (c.fadeIn || c.fadeOut) {
            // Schedule just this window's slice of the clip's fade envelope.
            scheduleFadeWindow(g.gain, c.gain, c.duration, c.fadeIn ?? 0, c.fadeOut ?? 0,
              segStart - clipStart, segEnd - clipStart, (cl) => (clipStart + cl) - preStart);
          }
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
        const useFlow = use.flow ?? pool.flow;   // per-track instrument instance
        if (pool.kind === 'synth') pools.set(use.id, await VoicePool.create(() => new InstrumentHost(ctx, useFlow, dest), use.voices ?? 6, () => ctx.currentTime));
        else { const host = new InstrumentHost(ctx, useFlow, dest); await host.load(); hosts.set(use.id, host); }
      }
    }
    for (const track of project.tracks) for (const s of track.sends ?? []) mixer.setSend(track.id, s.busId, s.level, s.pre);
  for (const track of project.tracks) mixer.setTrackOutput(track.id, track.outputBusId ?? null);
    for (const track of project.tracks) if (track.sidechain && project.tracks.some((k) => k.id === track.sidechain!.keyTrackId)) mixer.setSidechain(track.id, track.sidechain.keyTrackId, track.sidechain.amount, track.sidechain.release);

    // ── collect synth/drum triggers whose time falls in [preStart, t1) ───────
    const events: Array<{ time: number; fn: () => void }> = [];
  // Apply an automation lane by scope (mirrors app.applyAuto*): instrument lanes
  // reach the offline instrument engines (pools/hosts); others go through the mixer.
  const autoValue = (trackId: string, lane: any, v: number, when: number) => {
    if (lane.scope === 'instrument' && lane.useId) {
      if (lane.fxIndex != null) mixer.useChain(lane.useId)?.setParam(lane.fxIndex, lane.nodeId, lane.param, v, when);
      else { pools.get(lane.useId)?.setParamAt(lane.nodeId, lane.param, v, when); hosts.get(lane.useId)?.setParamAt(lane.nodeId, lane.param, v, when); }
    } else if (lane.scope === 'master' && lane.fxIndex != null) mixer.masterChain.setParam(lane.fxIndex, lane.nodeId, lane.param, v, when);
    else mixer.applyAutomation(trackId, lane, v, when);
  };
  const autoSegment = (trackId: string, lane: any, v0: number, t0: number, v1: number, t1: number) => {
    if (lane.scope === 'instrument' && lane.useId) {
      if (lane.fxIndex != null) mixer.useChain(lane.useId)?.setParamSegment(lane.fxIndex, lane.nodeId, lane.param, v0, t0, v1, t1);
      else { pools.get(lane.useId)?.setParamSegment(lane.nodeId, lane.param, v0, t0, v1, t1); hosts.get(lane.useId)?.setParamSegment(lane.nodeId, lane.param, v0, t0, v1, t1); }
    } else if (lane.scope === 'master' && lane.fxIndex != null) mixer.masterChain.setParamSegment(lane.fxIndex, lane.nodeId, lane.param, v0, t0, v1, t1);
    else mixer.applyAutomationSegment(trackId, lane, v0, t0, v1, t1);
  };
    let nid = 1;
    for (let s = Math.max(0, Math.floor(preStart / spp)); s < Math.min(songSteps, Math.ceil(t1 / spp)); s++) {
      const slot = Math.floor(s / project.totalSteps);
      const base = s * spp;

      for (const track of project.tracks) {
        if (!trackAudible(track, project.tracks)) continue;
        const swingSec = swingDelaySteps(s, track.swing ?? project.swing ?? 0) * spp;  // off-beat groove (per-track override)
        for (const lane of track.automation ?? []) {   // timeline curves (song scope)
          if (!lane.points?.length) continue;
          const v0 = timelineAutoValue(lane.points, s), v1 = timelineAutoValue(lane.points, s + 1);
          if (v0 != null && v1 != null) { const t = base; events.push({ time: t, fn: () => autoSegment(track.id, lane, v0, t - preStart, v1, t + spp - preStart) }); }
        }
        if (track.type === 'audio') continue;
        const activeClip = track.loop ? null : activeClipAt(track.clips, slot, slots); // loop = whole song; else clips gate
        if (!track.loop && !activeClip) continue;
        const pid = activeClip ? clipPatternId(track, activeClip) : (track.activePatternId ?? undefined);
        const len = patternLengthOf(track, pid);
        const originSteps = activeClip ? activeClip.start * project.totalSteps : 0;
        const step = (((s - originSteps) % len) + len) % len; // pattern restarts at the clip / song start (mirrors live)
        // `when` is the event's exact LOCAL context time (song time − preStart):
        // envelopes anchor there sample-accurately; suspend blocks only deliver.
        const local = (t: number) => t - preStart;
        for (const lane of track.automation ?? []) { if (lane.points?.length) continue; const len = lane.values.length || 1; const v = lane.values[((step % len) + len) % len]; if (v != null) { const t = base + swingSec; events.push({ time: t, fn: () => autoValue(track.id, lane, v, local(t)) }); } }
        for (const use of track.uses) {
          if (use.muted) continue;
          const content = patternContent(track, pid, use.id);
          if (track.type === 'synth' && content.notes) {
            const vp = pools.get(use.id); if (!vp) continue;
            for (const n of content.notes) {
              if (Math.floor(n.start) !== step) continue;
              const on = base + (n.start - step) * spp + swingSec;
              const off = on + n.length * spp;
              const id = nid++; const f = midiToFreq(n.midi);
              events.push({ time: on, fn: () => vp.noteOn(id, f, n.velocity ?? 1, local(on)) });
              events.push({ time: off, fn: () => vp.noteOff(id, local(off)) });
            }
          } else if (track.type === 'drums' && content.steps?.[step]) {
            const host = hosts.get(use.id); if (!host) continue;
            const on = base + swingSec; const off = on + Math.min(spp * 0.9, 0.5);
            events.push({ time: on, fn: () => host.trigger({}, local(on)) });
            events.push({ time: off, fn: () => host.release({}, local(off)) });
          }
        }
      }
    }
    // Floor (not round) so delivery precedes `when`; first-block events fire
    // before rendering starts (currentTime 0), their scheduled `when` still exact.
    const groups = new Map<number, Array<() => void>>();
    const preRender: Array<() => void> = [];
    for (const e of events) {
      const local = e.time - preStart;
      if (local < 0 || local >= localLen) continue;
      const frame = Math.floor((local * sr) / 128) * 128;
      if (frame < 128) { preRender.push(e.fn); continue; }
      (groups.get(frame) ?? groups.set(frame, []).get(frame)!).push(e.fn);
    }
    // Drain the EventBus's setTimeout(0) subscriber hop before resuming (see bounce.ts).
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    for (const frame of [...groups.keys()].sort((a, b) => a - b)) {
      const fns = groups.get(frame)!;
      void ctx.suspend(frame / sr).then(async () => { for (const fn of fns) fn(); await tick(); await tick(); void ctx.resume(); });
    }
    for (const fn of preRender) fn();
    if (preRender.length) { await tick(); await tick(); }

    // ── render, write the window's own span (drop the pre-roll) ──────────────
    const rendered = await ctx.startRendering();
    const chans = Array.from({ length: rendered.numberOfChannels }, (_, c) => rendered.getChannelData(c));
    const skip = Math.round((t0 - preStart) * sr);
    let count = Math.round((t1 - t0) * sr);
    if (written + count > totalFrames) count = totalFrames - written;
    if (count > 0) { await sink.write(encodeWavFrames(chans, skip, count, bits)); written += count; }

    for (const vp of pools.values()) vp.dispose();
    for (const h of hosts.values()) h.dispose();
    opts.onProgress?.(Math.min(1, written / totalFrames));
  }

  if (written < totalFrames) { // pad to the declared header length if rounding left a gap
    const pad = totalFrames - written;
    await sink.write(encodeWavFrames([new Float32Array(pad), new Float32Array(pad)], 0, pad, bits));
    written = totalFrames;
  }
  return { frames: written, sampleRate: sr };
}
