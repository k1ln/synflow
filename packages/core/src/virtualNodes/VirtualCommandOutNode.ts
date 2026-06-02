import VirtualNode from "./VirtualNode";
import { CustomNode } from "../AudioGraphManager";
import EventBus from "../EventBus";

/**
 * VirtualCommandOutNode forwards flow events/values back out to the host.
 *
 * When something in the graph triggers its input, it emits
 * `commandOut.<commandName>` on the bus. A host listens with
 * `engine.onCommand(name, cb)`. Mirror of OutputNode, but host-facing.
 */
export class VirtualCommandOutNode extends VirtualNode<CustomNode, undefined> {
  private commandName: string;

  constructor(eventBus: EventBus, node: CustomNode) {
    super(undefined, undefined, eventBus, node);
    this.commandName = (node.data as any)?.commandName || "";

    this.eventBus.subscribe(`${this.node.id}.input.receiveNodeOn`, (d: any) => this.forward(d, "on"));
    this.eventBus.subscribe(`${this.node.id}.input.receiveNodeOff`, (d: any) => this.forward(d, "off"));

    this.eventBus.subscribe(`${this.node.id}.params.updateParams`, (payload: any) => {
      const d = payload?.data ?? payload;
      if (d && typeof d.commandName === "string") this.commandName = d.commandName;
    });
  }

  private forward(data: any, type: "on" | "off") {
    if (!this.commandName) return;
    this.eventBus.emit(`commandOut.${this.commandName}`, { type, ...(data && typeof data === "object" ? data : { value: data }) });
  }

  dispose() {
    this.eventBus.unsubscribeAllByNodeId(this.node.id);
  }
}

export default VirtualCommandOutNode;
