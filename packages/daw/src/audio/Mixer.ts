import { AudioGraphManager, EventBus } from '@synflow/core';
import type { Flow } from '../synflow/instruments';
import type { EqSettings } from '../model/project';
import { EqNode } from './EqNode';

/** A resolved insert: either a Synflow flow or the built-in graphical EQ. */
export interface ResolvedFx { name: string; flow?: Flow; eq?: EqSettings }
interface Insert { name: string; engine?: AudioGraphManager; inId?: string; outId?: string; eq?: EqNode }

/** A rebuildable FX chain: input → [synflow engines / native EQ] → output. */
export class FxChain {
  readonly input: GainNode;
  readonly output: GainNode;
  private fx: Insert[] = [];

  constructor(private ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.rewire();
  }

  get count(): number { return this.fx.length; }
  get names(): string[] { return this.fx.map((f) => f.name); }
  setParam(i: number, nodeId: string, param: string, value: number): void { this.fx[i]?.engine?.setParam(nodeId, param, value); }

  /** Rebuild the whole chain from resolved inserts. */
  async setChain(inserts: ResolvedFx[]): Promise<void> {
    for (const f of this.fx) this.disposeInsert(f);
    this.fx = [];
    for (const ins of inserts) {
      if (ins.eq) {
        const eq = new EqNode(this.ctx); eq.setSettings(ins.eq);
        this.fx.push({ name: ins.name, eq });
      } else if (ins.flow) {
        const engine = new AudioGraphManager(this.ctx as any, { current: ins.flow.nodes } as any, { current: ins.flow.edges } as any, { bus: new EventBus() });
        await engine.initialize();
        this.fx.push({
          name: ins.name, engine,
          inId: ins.flow.nodes.find((n: any) => n.data?.isInput)?.id,
          outId: ins.flow.nodes.find((n: any) => n.data?.isOutput)?.id,
        });
      }
    }
    this.rewire();
  }

  /** Live-update a native EQ insert without rebuilding the chain. */
  updateEq(i: number, settings: EqSettings): void { this.fx[i]?.eq?.setSettings(settings); }
  /** The AnalyserNode of a native EQ insert (for the editor's spectrum), or null. */
  getEqAnalyser(i: number): AnalyserNode | null { return this.fx[i]?.eq?.analyser ?? null; }

  private inOut(f: Insert): { in: AudioNode; out: AudioNode } | null {
    if (f.eq) return { in: f.eq.input, out: f.eq.output };
    const inN = f.inId ? f.engine?.getAudioInput(f.inId) : undefined;
    const outN = f.outId ? f.engine?.getAudioOutput(f.outId) : undefined;
    return inN && outN ? { in: inN, out: outN } : null;
  }

  private rewire(): void {
    try { this.input.disconnect(); } catch { /* noop */ }
    for (const f of this.fx) { const io = this.inOut(f); if (io) { try { io.out.disconnect(); } catch { /* noop */ } } }
    let node: AudioNode = this.input;
    for (const f of this.fx) { const io = this.inOut(f); if (io) { node.connect(io.in); node = io.out; } }
    node.connect(this.output); // passthrough when empty
  }

  private disposeInsert(f: Insert): void {
    try { f.engine?.dispose(); } catch { /* noop */ }
    try { f.eq?.dispose(); } catch { /* noop */ }
  }

  dispose(): void {
    for (const f of this.fx) this.disposeInsert(f);
    this.fx = [];
    try { this.input.disconnect(); } catch { /* noop */ }
    try { this.output.disconnect(); } catch { /* noop */ }
  }
}

/**
 * Three-level mixer:
 *   instrument-use → use FX chain → track sum → track FX chain → track vol →
 *   master sum → master FX chain → master vol → destination.
 */
export class Mixer {
  readonly masterSum: GainNode;
  readonly masterChain: FxChain;
  private masterVol: GainNode;
  readonly masterMeter: AnalyserNode;
  private tracks = new Map<string, { sum: GainNode; chain: FxChain; vol: GainNode; pan: StereoPannerNode; gate: GainNode; meter: AnalyserNode }>();
  // Per use: instrument → inst FX (the pool instrument's general FX) → insert FX
  // (this instrument-in-track's FX) → track sum.
  private uses = new Map<string, { inst: FxChain; insert: FxChain }>();

  constructor(private ctx: AudioContext) {
    this.masterSum = ctx.createGain();
    this.masterChain = new FxChain(ctx);
    this.masterVol = ctx.createGain();
    this.masterMeter = ctx.createAnalyser(); this.masterMeter.fftSize = 1024;
    this.masterSum.connect(this.masterChain.input);
    this.masterChain.output.connect(this.masterVol);
    this.masterVol.connect(ctx.destination);
    this.masterVol.connect(this.masterMeter);   // post-fader meter tap (dead-end)
  }

  /** Get/create a track strip (sum → track FX → vol → pan → gate → master sum). */
  track(trackId: string, volume = 0.8): { sum: GainNode; chain: FxChain; vol: GainNode } {
    let t = this.tracks.get(trackId);
    if (!t) {
      const sum = this.ctx.createGain();
      const chain = new FxChain(this.ctx);
      const vol = this.ctx.createGain(); vol.gain.value = volume;
      const pan = this.ctx.createStereoPanner();
      const gate = this.ctx.createGain();           // mute/solo gate (0 or 1)
      const meter = this.ctx.createAnalyser(); meter.fftSize = 1024;
      sum.connect(chain.input);
      chain.output.connect(vol);
      vol.connect(pan);
      pan.connect(gate);
      gate.connect(this.masterSum);
      gate.connect(meter);                          // post-fader meter tap (dead-end)
      t = { sum, chain, vol, pan, gate, meter };
      this.tracks.set(trackId, t);
    }
    return t;
  }

  /** The node an instrument-use connects its output into (inst FX → insert FX → track sum). */
  use(useId: string, trackId: string): AudioNode {
    let u = this.uses.get(useId);
    if (!u) {
      const inst = new FxChain(this.ctx);
      const insert = new FxChain(this.ctx);
      inst.output.connect(insert.input);
      insert.output.connect(this.track(trackId).sum);
      u = { inst, insert };
      this.uses.set(useId, u);
    }
    return u.inst.input;
  }

  trackChain(trackId: string): FxChain | undefined { return this.tracks.get(trackId)?.chain; }
  useChain(useId: string): FxChain | undefined { return this.uses.get(useId)?.insert; }      // instrument-in-track FX
  usePoolChain(useId: string): FxChain | undefined { return this.uses.get(useId)?.inst; }     // instrument-general FX
  /** Instrument-level gain: scales a use's signal at its chain input (pre-FX). */
  setUseGain(useId: string, v: number): void { const u = this.uses.get(useId); if (u) u.inst.input.gain.value = v; }
  setTrackVolume(trackId: string, v: number): void { const t = this.tracks.get(trackId); if (t) t.vol.gain.value = v; }
  /** Stereo pan, −1 (left) … +1 (right). */
  setTrackPan(trackId: string, v: number): void { const t = this.tracks.get(trackId); if (t) t.pan.pan.value = Math.max(-1, Math.min(1, v)); }
  /** Mute/solo gate: silences the strip instantly (incl. already-playing audio clips). */
  setTrackGate(trackId: string, on: boolean): void { const t = this.tracks.get(trackId); if (t) t.gate.gain.value = on ? 1 : 0; }
  /** Post-fader analyser for a track's level meter (null if the strip isn't built yet). */
  trackMeter(trackId: string): AnalyserNode | null { return this.tracks.get(trackId)?.meter ?? null; }
  setMaster(v: number): void { this.masterVol.gain.value = v; }

  removeUse(useId: string): void { const u = this.uses.get(useId); if (u) { u.inst.dispose(); u.insert.dispose(); this.uses.delete(useId); } }
  removeTrack(trackId: string): void {
    const t = this.tracks.get(trackId);
    if (t) { t.chain.dispose(); try { t.sum.disconnect(); t.vol.disconnect(); t.pan.disconnect(); t.gate.disconnect(); } catch { /* noop */ } this.tracks.delete(trackId); }
  }
}
