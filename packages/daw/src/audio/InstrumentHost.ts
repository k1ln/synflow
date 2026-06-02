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
    const cmds = this.engine.listCommands();
    if (cmds.length) { this.commandName = cmds[0].name; return; }
    const node = this.flow.nodes.find((n) => TRIGGER_TYPES.some((t) => n.type === t || String(n.id).endsWith(t)));
    if (node) this.triggerNodeId = node.id;
  }

  /** Whether this instrument can be triggered at all. */
  get playable(): boolean { return this.commandName !== null || this.triggerNodeId !== null; }

  trigger(payload: Record<string, any> = {}): void {
    if (this.commandName) { this.engine.command(this.commandName, payload); return; }
    if (this.triggerNodeId) this.bus.emit(`${this.triggerNodeId}.main-input.sendNodeOn`, { nodeid: this.triggerNodeId, ...payload });
  }
  release(payload: Record<string, any> = {}): void {
    if (this.commandName) { this.engine.commandOff(this.commandName, payload); return; }
    if (this.triggerNodeId) this.bus.emit(`${this.triggerNodeId}.main-input.sendNodeOff`, { nodeid: this.triggerNodeId, ...payload });
  }
  noteOn(payload: Record<string, any>): void { this.trigger(payload); }
  noteOff(payload: Record<string, any> = {}): void { this.release(payload); }

  setParam(nodeId: string, key: string, value: number | string): void { this.engine.setParam(nodeId, key, value); }
  listParams(nodeId: string) { return this.engine.listParams(nodeId); }

  dispose(): void { this.engine.dispose(); }
}
