import { AudioGraphManager, EventBus } from '@synflow/core';

type Flow = { nodes: any[]; edges: any[] };

// Fallback trigger node types (when a flow has no Command-In port).
const TRIGGER_TYPES = ['ButtonFlowNode', 'OnOffButtonFlowNode', 'MouseTriggerButton', 'MidiButtonFlowNode', 'MidiFlowNote'];

/**
 * Wraps one @synflow/core engine (a portable flow) as a playable DAW instrument.
 * Plays via a Command-In node if present, otherwise drives a button/MIDI trigger
 * node directly — so any existing flow works as an instrument.
 */
export class InstrumentHost {
  readonly engine: AudioGraphManager;
  readonly bus: EventBus;
  // Per-voice velocity VCA: the engine's master output runs through this gain so a
  // note's velocity (0..1) scales its loudness, independent of whether the flow
  // itself has a velocity input. Set on each trigger.
  private vca: GainNode | null = null;
  // Nodes the DAW drives directly via receiveNodeOn/Off (data.isTrigger flows).
  private triggers: Array<{ nodeId: string; handle: string }> = [];
  // Pitchable params (data.isPitch) set from a note's frequency before triggering.
  private pitchTargets: Array<{ nodeId: string; param: string }> = [];
  private commandName: string | null = null;
  private triggerNodeId: string | null = null;
  // When the last scheduled trigger fires (AudioContext seconds) — threaded into
  // release as `onWhen` so the engine can anchor a future release exactly.
  private lastTriggerWhen: number | null = null;

  constructor(private ctx: BaseAudioContext, private flow: Flow, destination?: AudioNode) {
    this.bus = new EventBus();
    // Insert a velocity VCA between the engine output and the real destination.
    const vca = ctx.createGain();
    vca.connect(destination ?? ctx.destination);
    this.vca = vca;
    this.engine = new AudioGraphManager(
      ctx as any,
      { current: flow.nodes } as any,
      { current: flow.edges } as any,
      { bus: this.bus, destination: vca },
    );
  }

  async load(): Promise<void> {
    await this.engine.initialize();
    this.pitchTargets = this.flow.nodes
      .filter((n) => n.data?.isPitch)
      .map((n) => ({ nodeId: n.id, param: n.data.pitchParam || 'frequency' }));
    // 1. Explicit trigger nodes — the DAW drives these with receiveNodeOn/Off.
    this.triggers = this.flow.nodes
      .filter((n) => n.data?.isTrigger)
      .map((n) => ({ nodeId: n.id, handle: n.data.triggerHandle || 'main-input' }));
    if (this.triggers.length) return;
    // 2. A Command-In port.
    const cmds = this.engine.listCommands();
    if (cmds.length) { this.commandName = cmds[0].name; return; }
    // 3. A button/MIDI trigger node.
    const node = this.flow.nodes.find((n) => TRIGGER_TYPES.some((t) => n.type === t || String(n.id).endsWith(t)));
    if (node) this.triggerNodeId = node.id;
  }

  /** Whether this instrument can be triggered at all. */
  get playable(): boolean { return this.triggers.length > 0 || this.commandName !== null || this.triggerNodeId !== null; }

  /** Note/step ON — sets velocity + pitch (if given) then injects receiveNodeOn into
   *  the trigger node(s). `when` (AudioContext seconds) schedules everything sample-
   *  accurately on the audio clock; omitted = immediately (live keys/MIDI input). */
  trigger(payload: Record<string, any> = {}, when?: number): void {
    if (this.vca && payload.velocity != null) {
      const v = Math.max(0, Math.min(1, payload.velocity));
      if (when != null) this.vca.gain.setValueAtTime(v, Math.max(when, this.ctx.currentTime));
      else this.vca.gain.value = v;
    }
    if (payload.frequency != null) {
      for (const p of this.pitchTargets) {
        if (when != null) this.engine.setParamAtTime(p.nodeId, p.param, payload.frequency, when);
        else this.engine.setParam(p.nodeId, p.param, payload.frequency);
      }
    }
    this.lastTriggerWhen = when ?? null;
    const pl = when != null ? { ...payload, when } : payload;
    if (this.triggers.length) { for (const t of this.triggers) this.engine.receiveNodeOn(t.nodeId, t.handle, pl); return; }
    // Command/button paths don't schedule yet — defer delivery until ~when so a
    // scheduled call never fires early (same net behaviour as before).
    this.deferUntil(when, () => {
      if (this.commandName) { this.engine.command(this.commandName, pl); return; }
      if (this.triggerNodeId) this.engine.sendNodeOn(this.triggerNodeId, 'main-input', pl);
    });
  }
  /** Note/step OFF — injects receiveNodeOff so envelopes release (at `when` if given). */
  release(payload: Record<string, any> = {}, when?: number): void {
    const pl = when != null
      ? (this.lastTriggerWhen != null ? { ...payload, when, onWhen: this.lastTriggerWhen } : { ...payload, when })
      : payload;
    if (this.triggers.length) { for (const t of this.triggers) this.engine.receiveNodeOff(t.nodeId, t.handle, pl); return; }
    this.deferUntil(when, () => {
      if (this.commandName) { this.engine.commandOff(this.commandName, pl); return; }
      if (this.triggerNodeId) this.engine.sendNodeOff(this.triggerNodeId, 'main-input', pl);
    });
  }

  /** Run `fn` at ~AudioContext time `when` (immediately if past/absent/offline). */
  private deferUntil(when: number | undefined, fn: () => void): void {
    const offline = typeof OfflineAudioContext !== 'undefined' && this.ctx instanceof OfflineAudioContext;
    const delayMs = when != null && !offline ? (when - this.ctx.currentTime) * 1000 : 0;
    if (delayMs > 1) setTimeout(fn, delayMs);
    else fn();
  }
  noteOn(payload: Record<string, any> = {}): void { this.trigger(payload, payload.when); }
  noteOff(payload: Record<string, any> = {}): void { this.release(payload, payload.when); }

  setParam(nodeId: string, key: string, value: number | string): void { this.engine.setParam(nodeId, key, value); }
  /** Automation: set a param at AudioContext time `when` (control-rate fallback when
   *  the target isn't an AudioParam, e.g. .vstai worklet params). */
  setParamAt(nodeId: string, key: string, value: number, when: number): void {
    if (this.engine.setParamAtTime) this.engine.setParamAtTime(nodeId, key, value, when, 0.008);
    else this.engine.setParam(nodeId, key, value);
  }
  /** Automation: exact linear segment v0@t0 → v1@t1 on a param (AudioParam only;
   *  otherwise steps to v0 then v1). */
  setParamSegment(nodeId: string, key: string, v0: number, t0: number, v1: number, t1: number): void {
    if (this.engine.setParamAtTime && this.engine.rampParamTo) {
      this.engine.setParamAtTime(nodeId, key, v0, t0);
      this.engine.rampParamTo(nodeId, key, v1, t1);
    } else { this.engine.setParam(nodeId, key, v1); }
  }
  /** Post a raw message to a node's worklet port (e.g. .vstai sample upload). */
  postToNode(nodeId: string, msg: unknown): void { this.engine.postToNode?.(nodeId, msg); }
  listParams(nodeId: string) { return this.engine.listParams(nodeId); }

  dispose(): void { this.engine.dispose(); try { this.vca?.disconnect(); } catch { /* noop */ } this.vca = null; }
}
