import VirtualNode from "./VirtualNode";
import EventBus from "../sys/EventBus";
import { CustomNode } from "../sys/AudioGraphManager";

export type AutomationPoint = { x: number; y: number };
export type AutomationParams = {
  lengthSec?: number; // total seconds
  points?: AutomationPoint[]; // normalized x (0..1) and y (0..1) where: y=0 -> 200%, y=0.5 ->100%, y=1 ->0%
  // legacy min/max (ignored now, fixed 0..200%) kept for backwards compatibility
  min?: number;
  max?: number;
  loop?: boolean;
};

export class VirtualAutomationNode extends VirtualNode<CustomNode & { data: any }, undefined> {
  private lengthSec: number = 2;
  private minVal: number = 0; // fixed bottom percent
  private maxVal: number = 200; // fixed top percent
  private loop: boolean = true; // retained for future looping scheduling
  private points: AutomationPoint[] = [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }];

  constructor(eventBus: EventBus, node: CustomNode & { data: any }) {
    super(undefined, undefined as any, eventBus, node);
    const d = (node.data || {}) as AutomationParams;
    this.lengthSec = typeof d.lengthSec === 'number' ? Math.max(0.01, d.lengthSec) : 2;
    // ignore persisted min/max; enforce fixed 0..200
    this.minVal = 0;
    this.maxVal = 200;
    this.loop = d.loop ?? true;
  if (Array.isArray(d.points) && d.points.length) this.points = d.points.slice();

    this.subscribe();
  }

  private subscribe() {
    // Start/stop playback on main-input receive events
  this.eventBus.subscribe(this.node.id + '.main-input.receiveNodeOn', () => this.trigger());
  this.eventBus.subscribe(this.node.id + '.main-input.receiveNodeOff', () => {/* no-op: scheduling already transferred to AudioGraphManager */});

    // Params update from UI
    this.eventBus.subscribe(this.node.id + '.params.updateParams', (p: any) => {
      const data = p?.data || {};
      let changed = false;
      if (typeof data.lengthSec === 'number') { this.lengthSec = Math.max(0.01, data.lengthSec); changed = true; }
  // ignore data.min/data.max updates (fixed mapping)
      if (typeof data.loop === 'boolean') { this.loop = data.loop; changed = true; }
      if (Array.isArray(data.points)) { this.points = data.points.slice(); changed = true; }
      if (this.maxVal < this.minVal) { this.maxVal = this.minVal; changed = true; }
      // No continuous playback now; only next trigger causes reschedule.
    });
  }
  // Single trigger: emit parameters (points & length) so AudioGraphManager can schedule full envelope.
  private trigger() {
    this.eventBus.emit(this.node.id + '.main-input.sendNodeOn', {
      lengthSec: this.lengthSec,
      points: this.points,
      min: this.minVal,
      max: this.maxVal,
      loop: this.loop
    });
  }

  private sampleCurve(t: number): number {
    // Linear interpolation between nearest points
    const pts = (this.points && this.points.length ? this.points : [{ x: 0, y: 0 }, { x: 1, y: 1 }]).slice().sort((a, b) => a.x - b.x);
    if (t <= pts[0].x) return pts[0].y;
    if (t >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (t >= a.x && t <= b.x) {
        const u = (t - a.x) / (b.x - a.x);
        return a.y + (b.y - a.y) * u;
      }
    }
    return 0;
  }

  public dispose() {
    this.eventBus.unsubscribeAllByNodeId(this.node.id);
  }
}

export default VirtualAutomationNode;
