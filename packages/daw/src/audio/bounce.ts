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
import { trackActiveAt, trackAudible, songLengthSteps, songLengthSlots, swingDelaySteps, type Project } from '../model/project';
import { midiToFreq } from '../model/pitch';

export interface BounceOpts { sampleRate?: number; tailSeconds?: number }

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
        const g = ctx.createGain();
        src.connect(g).connect(t.sum);
        scheduleFade(g.gain, c.gain, when, dur, c.fadeIn, c.fadeOut);
        src.start(when, c.offset, dur);
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
  for (const track of project.tracks) for (const s of track.sends ?? []) mixer.setSend(track.id, s.busId, s.level);
  for (const track of project.tracks) if (track.sidechain && project.tracks.some((k) => k.id === track.sidechain!.keyTrackId)) mixer.setSidechain(track.id, track.sidechain.keyTrackId, track.sidechain.amount, track.sidechain.release);

  // ── collect every trigger as a timed event (mirrors the live scheduler) ────
  const events: Array<{ time: number; fn: () => void }> = [];
  let nid = 1;
  for (let s = 0; s < songSteps; s++) {
    const slot = Math.floor(s / project.totalSteps);
    const base = s * spp;
    const swingSec = swingDelaySteps(s, project.swing ?? 0) * spp;       // off-beat groove (mirrors live)
    for (const track of project.tracks) {
      if (track.type === 'audio') continue;                              // scheduled as buffers above
      if (!trackActiveAt(track.clips, slot, songLengthSlots(project))) continue; // song arrangement gates playback
      const step = s % Math.max(1, track.length);
      for (const use of track.uses) {
        if (use.muted) continue;
        if (track.type === 'synth' && use.notes) {
          const vp = pools.get(use.id); if (!vp) continue;
          for (const n of use.notes) {
            if (Math.floor(n.start) !== step) continue;
            const on = base + (n.start - step) * spp + swingSec;
            const id = nid++; const f = midiToFreq(n.midi);
            events.push({ time: on, fn: () => vp.noteOn(id, f) });
            events.push({ time: on + n.length * spp, fn: () => vp.noteOff(id) });
          }
        } else if (track.type === 'drums' && use.steps?.[step]) {
          const host = hosts.get(use.id); if (!host) continue;
          events.push({ time: base + swingSec, fn: () => host.trigger() });
          events.push({ time: base + swingSec + Math.min(spp * 0.9, 0.5), fn: () => host.release() });
        }
      }
    }
  }

  // ── group by render block (suspend granularity is 128 frames) ─────────────
  const groups = new Map<number, Array<() => void>>();
  for (const e of events) {
    if (e.time >= lengthSec) continue;
    const frame = Math.max(128, Math.round((e.time * sr) / 128) * 128); // can't suspend at frame 0
    (groups.get(frame) ?? groups.set(frame, []).get(frame)!).push(e.fn);
  }
  for (const frame of [...groups.keys()].sort((a, b) => a - b)) {
    const fns = groups.get(frame)!;
    void ctx.suspend(frame / sr).then(() => { for (const fn of fns) fn(); void ctx.resume(); });
  }

  const rendered = await ctx.startRendering();
  const channels = Array.from({ length: rendered.numberOfChannels }, (_, c) => rendered.getChannelData(c));

  for (const vp of pools.values()) vp.dispose();
  for (const h of hosts.values()) h.dispose();
  return encodeWav(channels, sr);
}
