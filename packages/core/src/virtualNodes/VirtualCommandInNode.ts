import VirtualNode from "./VirtualNode";
import { CustomNode } from "../AudioGraphManager";
import EventBus from "../EventBus";

/**
 * VirtualCommandInNode is the external control entry point of a flow.
 *
 * A host drives it with `engine.command(name, payload)` (or `window.flowSynth`),
 * which emits `command.<commandName>` on the bus. This node forwards that into
 * the graph through the normal edge routing, carrying a unified payload
 * `{ type?: 'on'|'off', value?, note?, frequency?, velocity? }` so a single
 * output can drive gate inputs, AudioParam values, or note targets.
 */
export class VirtualCommandInNode extends VirtualNode<CustomNode, undefined> {
  private commandName: string;
  private handleConnectedEdges: (node: CustomNode, data: any, eventType: string) => void;
  private unsubscribeCmd?: () => void;

  constructor(
    eventBus: EventBus,
    node: CustomNode,
    handleConnectedEdges: (node: CustomNode, data: any, eventType: string) => void,
  ) {
    super(undefined, undefined, eventBus, node);
    this.commandName = (node.data as any)?.commandName || "";
    this.handleConnectedEdges = handleConnectedEdges;
    this.subscribeCommand();

    this.eventBus.subscribe(`${this.node.id}.params.updateParams`, (payload: any) => {
      const d = payload?.data ?? payload;
      if (d && typeof d.commandName === "string" && d.commandName !== this.commandName) {
        this.commandName = d.commandName;
        this.subscribeCommand();
      }
    });
  }

  /** (Re)subscribe to the global command channel for this node's commandName. */
  private subscribeCommand() {
    if (this.unsubscribeCmd) { this.unsubscribeCmd(); this.unsubscribeCmd = undefined; }
    if (!this.commandName) return;
    const eventName = `command.${this.commandName}`;
    const cb = (payload: any) => this.fire(payload);
    this.eventBus.subscribe(eventName, cb);
    this.unsubscribeCmd = () => this.eventBus.unsubscribe(eventName, cb);
  }

  /** Forward a received command into the graph. */
  private fire(payload: any) {
    const data = payload && typeof payload === "object" ? payload : { value: payload };
    const isOff = data.type === "off";
    const eventType = isOff ? "receiveNodeOff" : "receiveNodeOn";
    // Mirror to node-scoped send events (UI / local listeners can observe).
    this.eventBus.emit(
      `${this.node.id}.main-output.${isOff ? "sendNodeOff" : "sendNodeOn"}`,
      data,
    );
    this.handleConnectedEdges(this.node, data, eventType);
  }

  dispose() {
    if (this.unsubscribeCmd) this.unsubscribeCmd();
    this.eventBus.unsubscribeAllByNodeId(this.node.id);
  }
}

export default VirtualCommandInNode;
