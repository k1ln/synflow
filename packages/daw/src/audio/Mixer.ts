import { AudioGraphManager, EventBus } from '@synflow/core';
import type { Flow } from '../synflow/instruments';

interface FxInsert { engine: AudioGraphManager; inId?: string; outId?: string; name: string; }

/** One mixer channel: instruments → input → [FX chain] → volume → master. */
export class ChannelStrip {
  readonly input: GainNode;
  private vol: GainNode;
  private fx: FxInsert[] = [];

  constructor(private ctx: AudioContext, private master: GainNode, volume = 0.8) {
    this.input = ctx.createGain();
    this.vol = ctx.createGain();
    this.vol.gain.value = volume;
    this.rewire();
  }

  /** Instruments connect their output here. */
  get destination(): AudioNode { return this.input; }
  get fxNames(): string[] { return this.fx.map((f) => f.name); }
  setVolume(v: number): void { this.vol.gain.value = v; }

  async addFx(name: string, flow: Flow): Promise<void> {
    const engine = new AudioGraphManager(this.ctx as any, { current: flow.nodes } as any, { current: flow.edges } as any, { bus: new EventBus() });
    await engine.initialize();
    const inId = flow.nodes.find((n) => n.data?.isInput)?.id;
    const outId = flow.nodes.find((n) => n.data?.isOutput)?.id;
    this.fx.push({ engine, inId, outId, name });
    this.rewire();
  }

  removeFx(index: number): void {
    const f = this.fx[index];
    if (!f) return;
    try { f.engine.dispose(); } catch { /* noop */ }
    this.fx.splice(index, 1);
    this.rewire();
  }

  private rewire(): void {
    try { this.input.disconnect(); } catch { /* noop */ }
    try { this.vol.disconnect(); } catch { /* noop */ }
    for (const f of this.fx) {
      const o = f.outId && f.engine.getAudioOutput(f.outId);
      if (o) { try { o.disconnect(); } catch { /* noop */ } }
    }
    let node: AudioNode = this.input;
    for (const f of this.fx) {
      const inN = f.inId ? f.engine.getAudioInput(f.inId) : undefined;
      const outN = f.outId ? f.engine.getAudioOutput(f.outId) : undefined;
      if (inN && outN) { node.connect(inN); node = outN; }
    }
    node.connect(this.vol);
    this.vol.connect(this.master);
  }

  dispose(): void { for (const f of this.fx) { try { f.engine.dispose(); } catch { /* noop */ } } }
}

/** Master bus + per-channel strips. */
export class Mixer {
  readonly master: GainNode;
  private strips = new Map<string, ChannelStrip>();

  constructor(private ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
  }

  strip(channelId: string, volume?: number): ChannelStrip {
    let s = this.strips.get(channelId);
    if (!s) { s = new ChannelStrip(this.ctx, this.master, volume); this.strips.set(channelId, s); }
    return s;
  }
  get(channelId: string): ChannelStrip | undefined { return this.strips.get(channelId); }
  setMaster(v: number): void { this.master.gain.value = v; }
}
