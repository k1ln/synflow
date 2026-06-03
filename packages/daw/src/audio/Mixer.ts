import { AudioGraphManager, EventBus } from '@synflow/core';
import type { Flow } from '../synflow/instruments';

export interface ResolvedFx { name: string; flow: Flow }
interface Insert { engine: AudioGraphManager; inId?: string; outId?: string; name: string }

/** A rebuildable FX chain: input → [synflow FX engines] → output. */
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
  setParam(i: number, nodeId: string, param: string, value: number): void { this.fx[i]?.engine.setParam(nodeId, param, value); }

  /** Rebuild the whole chain from resolved inserts (FX = @synflow/core engines). */
  async setChain(inserts: ResolvedFx[]): Promise<void> {
    for (const f of this.fx) { try { f.engine.dispose(); } catch { /* noop */ } }
    this.fx = [];
    for (const ins of inserts) {
      const engine = new AudioGraphManager(this.ctx as any, { current: ins.flow.nodes } as any, { current: ins.flow.edges } as any, { bus: new EventBus() });
      await engine.initialize();
      this.fx.push({
        engine, name: ins.name,
        inId: ins.flow.nodes.find((n: any) => n.data?.isInput)?.id,
        outId: ins.flow.nodes.find((n: any) => n.data?.isOutput)?.id,
      });
    }
    this.rewire();
  }

  private rewire(): void {
    try { this.input.disconnect(); } catch { /* noop */ }
    for (const f of this.fx) { const o = f.outId && f.engine.getAudioOutput(f.outId); if (o) { try { o.disconnect(); } catch { /* noop */ } } }
    let node: AudioNode = this.input;
    for (const f of this.fx) {
      const inN = f.inId ? f.engine.getAudioInput(f.inId) : undefined;
      const outN = f.outId ? f.engine.getAudioOutput(f.outId) : undefined;
      if (inN && outN) { node.connect(inN); node = outN; }
    }
    node.connect(this.output); // passthrough when empty
  }

  dispose(): void {
    for (const f of this.fx) { try { f.engine.dispose(); } catch { /* noop */ } }
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
  private tracks = new Map<string, { sum: GainNode; chain: FxChain; vol: GainNode }>();
  private uses = new Map<string, FxChain>();

  constructor(private ctx: AudioContext) {
    this.masterSum = ctx.createGain();
    this.masterChain = new FxChain(ctx);
    this.masterVol = ctx.createGain();
    this.masterSum.connect(this.masterChain.input);
    this.masterChain.output.connect(this.masterVol);
    this.masterVol.connect(ctx.destination);
  }

  /** Get/create a track strip (sum → track FX → vol → master sum). */
  track(trackId: string, volume = 0.8): { sum: GainNode; chain: FxChain; vol: GainNode } {
    let t = this.tracks.get(trackId);
    if (!t) {
      const sum = this.ctx.createGain();
      const chain = new FxChain(this.ctx);
      const vol = this.ctx.createGain(); vol.gain.value = volume;
      sum.connect(chain.input);
      chain.output.connect(vol);
      vol.connect(this.masterSum);
      t = { sum, chain, vol };
      this.tracks.set(trackId, t);
    }
    return t;
  }

  /** The node an instrument-use connects its output into (use FX chain → track sum). */
  use(useId: string, trackId: string): AudioNode {
    let chain = this.uses.get(useId);
    if (!chain) {
      chain = new FxChain(this.ctx);
      chain.output.connect(this.track(trackId).sum);
      this.uses.set(useId, chain);
    }
    return chain.input;
  }

  trackChain(trackId: string): FxChain | undefined { return this.tracks.get(trackId)?.chain; }
  useChain(useId: string): FxChain | undefined { return this.uses.get(useId); }
  setTrackVolume(trackId: string, v: number): void { const t = this.tracks.get(trackId); if (t) t.vol.gain.value = v; }
  setMaster(v: number): void { this.masterVol.gain.value = v; }

  removeUse(useId: string): void { const c = this.uses.get(useId); if (c) { c.dispose(); this.uses.delete(useId); } }
  removeTrack(trackId: string): void {
    const t = this.tracks.get(trackId);
    if (t) { t.chain.dispose(); try { t.sum.disconnect(); t.vol.disconnect(); } catch { /* noop */ } this.tracks.delete(trackId); }
  }
}
