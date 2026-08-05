// Faster-than-realtime bounce: render the whole song arrangement to a WAV using
// an OfflineAudioContext. Rebuilds the same graph as live playback (Mixer + core
// engines), then steps the offline timeline with ctx.suspend()/resume() to fire
// note/drum triggers (which sound "now") and schedules audio clips as buffers.
import { Mixer, type ResolvedFx } from './Mixer';
import { InstrumentHost } from './InstrumentHost';
import { VoicePool } from './VoicePool';
import { encodeWav } from './wav';
import { scheduleFade } from './clipFade';
import type { AudioAssets } from './AudioAssets';
import { findEntry, cloneFlow } from '../synflow/library';
import { activeClipAt, trackAudible, songLengthSteps, songLengthSlots, swingDelaySteps, clipPatternId, patternContent, patternLengthOf, syncPatterns, timelineAutoValue, clipRate, type Project } from '../model/project';
import { midiToFreq } from '../model/pitch';

import type { WavBits } from './wav';
export interface BounceOpts { sampleRate?: number; tailSeconds?: number; bits?: WavBits }

const resolveFx = (inserts: { name: string; fxId: string; flow?: any; eq?: any }[]): ResolvedFx[] =>
  inserts
    .map((ins): ResolvedFx | null => {
      if (ins.eq) return { name: ins.name, eq: ins.eq };
      const flow = ins.flow ?? findEntry(ins.fxId)?.flow;
      return flow ? { name: ins.name, flow: cloneFlow(flow) } : null;
    })
    .filter((x): x is ResolvedFx => !!x);

/** Render the project's song timeline to a 16-bit PCM WAV (stereo). */
export async function bounceProjectToWav(project: Project, assets: AudioAssets, opts: BounceOpts = {}): Promise<ArrayBuffer> {
  project = syncPatterns(project);   // snapshots reflect the latest live edits
  const sr = opts.sampleRate ?? 44100;
  const tail = opts.tailSeconds ?? 2;
  const spp = 60 / project.bpm / project.stepsPerBeat;       // seconds per step
  const songSteps = Math.max(1, songLengthSteps(project)); // grown to contain long audio clips
  const lengthSec = songSteps * spp + tail;

  const ctx = new OfflineAudioContext(2, Math.ceil(lengthSec * sr), sr);
  const mixer = new Mixer(ctx as unknown as AudioContext);
  await mixer.masterChain.setChain(resolveFx(project.masterFx));
  for (const bus of project.buses ?? []) { const b = mixer.bus(bus.id, bus.volume); await b.chain.setChain(resolveFx(bus.fx)); }

  const hosts = new Map<string, InstrumentHost>();  // drum use → host
  const pools = new Map<string, VoicePool>();        // synth use → voice pool
  const bufCache = new Map<string, AudioBuffer>();   // assetId → decoded buffer

  // ── build the graph (mirrors app.buildAudio) ──────────────────────────────
  for (const track of project.tracks) {
    const t = mixer.track(track.id, track.volume);
    mixer.setTrackPan(track.id, track.pan ?? 0);
    mixer.setTrackTrim(track.id, track.trim ?? 1, !!track.phase);
    mixer.setTrackGate(track.id, trackAudible(track, project.tracks));   // mute/solo (silences the strip's output)
    await t.chain.setChain(resolveFx(track.fx));
    if (track.type === 'audio') {
      for (const c of track.audioClips ?? []) {
        const asset = project.assets.find((a) => a.id === c.assetId); if (!asset) continue;
        let buf = bufCache.get(asset.id);
        if (!buf) { const b = await assets.resolveBuffer(asset); if (!b) continue; buf = b; bufCache.set(asset.id, b); }
        const when = c.start * spp; if (when >= lengthSec) continue;
        const dur = Math.min(c.duration, lengthSec - when);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const rate = clipRate(c);
        src.playbackRate.value = rate;
        const g = ctx.createGain();
        src.connect(g).connect(t.sum);
        scheduleFade(g.gain, c.gain, when, dur, c.fadeIn, c.fadeOut);
        src.start(when, c.offset, dur * rate);   // buffer seconds = timeline seconds × rate
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

  // ── collect every trigger as a timed event (mirrors the live scheduler) ────
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
  for (let s = 0; s < songSteps; s++) {
    const slot = Math.floor(s / project.totalSteps);
    const base = s * spp;

    for (const track of project.tracks) {
      const swingSec = swingDelaySteps(s, track.swing ?? project.swing ?? 0) * spp;  // off-beat groove (per-track override)
      // Timeline automation (song-scope curves): exact linear segments per step.
      for (const lane of track.automation ?? []) {
        if (!lane.points?.length) continue;
        const v0 = timelineAutoValue(lane.points, s), v1 = timelineAutoValue(lane.points, s + 1);
        if (v0 != null && v1 != null) { const t = base; events.push({ time: t, fn: () => autoSegment(track.id, lane, v0, t, v1, t + spp) }); }
      }
      if (track.type === 'audio') continue;                              // scheduled as buffers above
      const activeClip = track.loop ? null : activeClipAt(track.clips, slot, songLengthSlots(project)); // loop = whole song; else clips gate
      if (!track.loop && !activeClip) continue;
      const pid = activeClip ? clipPatternId(track, activeClip) : (track.activePatternId ?? undefined);
      const len = patternLengthOf(track, pid);
      const originSteps = activeClip ? activeClip.start * project.totalSteps : 0;
      const step = (((s - originSteps) % len) + len) % len; // pattern restarts at the clip / song start (mirrors live)
      // Every fn passes its exact time as `when`: the engine anchors envelopes/params
      // there sample-accurately, so the suspend-block granularity below only affects
      // DELIVERY (which merely has to happen before `when`), not audible timing.
      for (const lane of track.automation ?? []) { if (lane.points?.length) continue; const len = lane.values.length || 1; const v = lane.values[((step % len) + len) % len]; if (v != null) { const t = base + swingSec; events.push({ time: t, fn: () => autoValue(track.id, lane, v, t) }); } }
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
            events.push({ time: on, fn: () => vp.noteOn(id, f, n.velocity ?? 1, on) });
            events.push({ time: off, fn: () => vp.noteOff(id, off) });
          }
        } else if (track.type === 'drums' && content.steps?.[step]) {
          const host = hosts.get(use.id); if (!host) continue;
          const on = base + swingSec; const off = on + Math.min(spp * 0.9, 0.5);
          events.push({ time: on, fn: () => host.trigger({}, on) });
          events.push({ time: off, fn: () => host.release({}, off) });
        }
      }
    }
  }

  // ── group by render block (suspend granularity is 128 frames) ─────────────
  // Floor (not round) so delivery always precedes the event's `when`; events in
  // the first block (can't suspend at frame 0) fire before rendering starts —
  // currentTime is 0 then, so their scheduled `when` still lands exactly.
  const groups = new Map<number, Array<() => void>>();
  const preRender: Array<() => void> = [];
  for (const e of events) {
    if (e.time >= lengthSec) continue;
    const frame = Math.floor((e.time * sr) / 128) * 128;
    if (frame < 128) { preRender.push(e.fn); continue; }
    (groups.get(frame) ?? groups.set(frame, []).get(frame)!).push(e.fn);
  }
  // The engine's EventBus defers subscribers via setTimeout(0); drain the macrotask
  // queue before resuming so every trigger lands while the context is still paused.
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  for (const frame of [...groups.keys()].sort((a, b) => a - b)) {
    const fns = groups.get(frame)!;
    void ctx.suspend(frame / sr).then(async () => { for (const fn of fns) fn(); await tick(); await tick(); void ctx.resume(); });
  }
  for (const fn of preRender) fn();
  if (preRender.length) { await tick(); await tick(); }

  const rendered = await ctx.startRendering();
  const channels = Array.from({ length: rendered.numberOfChannels }, (_, c) => rendered.getChannelData(c));

  for (const vp of pools.values()) vp.dispose();
  for (const h of hosts.values()) h.dispose();
  return encodeWav(channels, sr, opts.bits ?? 16);
}
