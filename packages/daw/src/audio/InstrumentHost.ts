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
  // Nodes the DAW drives directly via receiveNodeOn/Off (data.isTrigger flows).
  private triggers: Array<{ nodeId: string; handle: string }> = [];
  // Pitchable params (data.isPitch) set from a note's frequency before triggering.
  private pitchTargets: Array<{ nodeId: string; param: string }> = [];
  private commandName: string | null = null;
  private triggerNodeId: string | null = null;

  constructor(ctx: BaseAudioContext, private flow: Flow, destination?: AudioNode) {
    this.bus = new EventBus();
    this.engine = new AudioGraphManager(
      ctx as any,
      { current: flow.nodes } as any,
      { current: flow.edges } as any,
      { bus: this.bus, destination },
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

  /** Note/step ON — sets pitch (if given) then injects receiveNodeOn into the trigger node(s). */
  trigger(payload: Record<string, any> = {}): void {
    if (payload.frequency != null) {
      for (const p of this.pitchTargets) this.engine.setParam(p.nodeId, p.param, payload.frequency);
    }
    if (this.triggers.length) { for (const t of this.triggers) this.engine.receiveNodeOn(t.nodeId, t.handle, payload); return; }
    if (this.commandName) { this.engine.command(this.commandName, payload); return; }
    if (this.triggerNodeId) this.engine.sendNodeOn(this.triggerNodeId, 'main-input', payload);
  }
  /** Note/step OFF — injects receiveNodeOff so envelopes release. */
  release(payload: Record<string, any> = {}): void {
    if (this.triggers.length) { for (const t of this.triggers) this.engine.receiveNodeOff(t.nodeId, t.handle, payload); return; }
    if (this.commandName) { this.engine.commandOff(this.commandName, payload); return; }
    if (this.triggerNodeId) this.engine.sendNodeOff(this.triggerNodeId, 'main-input', payload);
  }
  noteOn(payload: Record<string, any> = {}): void { this.trigger(payload); }
  noteOff(payload: Record<string, any> = {}): void { this.release(payload); }

  setParam(nodeId: string, key: string, value: number | string): void { this.engine.setParam(nodeId, key, value); }
  listParams(nodeId: string) { return this.engine.listParams(nodeId); }

  dispose(): void { this.engine.dispose(); }
}
