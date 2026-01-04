import VirtualNode from "./VirtualNode";
import EventBus from "../sys/EventBus";
import { CustomNode } from "../sys/AudioGraphManager";
import { OscillatorFlowNodeProps } from "../nodes/OscillatorFlowNode";


export class VirtualAudioWorkletOscillatorNode extends VirtualNode<CustomNode & OscillatorFlowNodeProps> {
  /**
   * List of named input handles for this node.
   * The order matches the input indices of the AudioWorkletNode.
   * Example: ["main-input", "sync-input"]
   */
  connectHandleNames: string[] = ["main-input", "sync"];
  audioWorkletNode: AudioWorkletNode | null = null;
  oscType: string = "sine";
  customTable: Float32Array | null = null;
  // Track active input connections for possible rewiring
  private _activeInputConnections: { inputNode: AudioNode; handle: string }[] = [];

  constructor(audioContext: AudioContext, eventBus: EventBus, node: CustomNode & OscillatorFlowNodeProps) {
    super(audioContext, null, eventBus, node);
    this.oscType = node.data.type || "sine";
  }

  async render(frequency: number, type: OscillatorType, customTable?: Float32Array) {
    await this.ensureWorkletLoaded();
    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
    }
    // 3 inputs: 0 = FM, 1 = frequency (event), 2 = sync
    this.audioWorkletNode = new AudioWorkletNode(this.audioContext!, "hard-sync-oscillator", {
      numberOfInputs: 3,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {
        frequency,
        detune: this.node.data.detune || 0,
        type: 0,
      },
    });
    this.audioNode = this.audioWorkletNode;
    this.setType(type);
    if (type === "custom" && customTable) {
      this.setCustomTable(customTable);
    }
    this.subscribeParams();
    // Reconnect any previously registered input connections
    this._activeInputConnections.forEach(({ inputNode, handle }) => {
      this._connectInputNode(inputNode, handle);
    });
    // Main output connection events remain unchanged
    this.eventBus.subscribe(
      this.node.id + ".main-input.receiveNodeOn",
      () => this.audioWorkletNode && this.audioWorkletNode.connect(this.node.destination)
    );
    this.eventBus.subscribe(
      this.node.id + ".main-input.receiveNodeOff",
      () => this.audioWorkletNode && this.audioWorkletNode.disconnect()
    );
  }

  /**
   * Connect an AudioNode to a named input handle.
   * The handle must be present in connectHandleNames.
   * This is the generic connection method, similar to VirtualAudioWorkletNode.
   */
  connectToInput(inputNode: AudioNode, connectHandleName: string) {
    if (!this.connectHandleNames.includes(connectHandleName)) {
      throw new Error(`Unknown input handle: ${connectHandleName}`);
    }
    // Track for possible re-connection after re-render
    if (!this._activeInputConnections.some(c => c.inputNode === inputNode && c.handle === connectHandleName)) {
      this._activeInputConnections.push({ inputNode, handle: connectHandleName });
    }
    this._connectInputNode(inputNode, connectHandleName);
  }

  /**
   * Internal: actually connect the input node to the correct input index.
   */
  private _connectInputNode(inputNode: AudioNode, connectHandleName: string) {
    if (this.audioWorkletNode) {
      const inputIndex = this.connectHandleNames.indexOf(connectHandleName);
      if (inputIndex === -1) {
        throw new Error(`Input handle not found: ${connectHandleName}`);
      }
      inputNode.connect(this.audioWorkletNode, 0, inputIndex);
    }
  }

  /**
   * Disconnect an AudioNode from a named input handle.
   */
  disconnectInput(inputNode: AudioNode, connectHandleName: string) {
    if (this.audioWorkletNode) {
      const inputIndex = this.connectHandleNames.indexOf(connectHandleName);
      if (inputIndex !== -1) {
        inputNode.disconnect(this.audioWorkletNode, 0, inputIndex);
      }
    }
    this._activeInputConnections = this._activeInputConnections.filter(
      c => !(c.inputNode === inputNode && c.handle === connectHandleName)
    );
  }

  async ensureWorkletLoaded() {
    const worklet = this.audioContext && this.audioContext.audioWorklet;
    // Use public folder path which works in both dev and production
    const modulePath = "/HardSyncOscillatorProcessor.js";
    if (worklet && Array.isArray((worklet as any).modules)) {
      if (!(worklet as any).modules.includes(modulePath)) {
        await worklet.addModule(modulePath);
      }
    } else {
      // Always try to addModule if modules property is missing
      await worklet.addModule(modulePath);
    }
  }

  setType(type: OscillatorType) {
    this.oscType = type;
    if (this.audioWorkletNode) {
      this.audioWorkletNode.port.postMessage({ type: "setType", value: type });
    }
  }

  setCustomTable(table: Float32Array) {
    this.customTable = table;
    if (this.audioWorkletNode) {
      this.audioWorkletNode.port.postMessage({ type: "setCustomTable", value: table });
    }
  }



  updateFrequency(frequency: number) {
    if (this.audioWorkletNode) {
      this.audioWorkletNode.parameters.get("frequency")?.setValueAtTime(frequency, this.audioContext!.currentTime);
    }
  }

  updateDetune(detune: number) {
    if (this.audioWorkletNode) {
      this.audioWorkletNode.parameters.get("detune")?.setValueAtTime(detune, this.audioContext!.currentTime);
    }
  }
}

export default VirtualAudioWorkletOscillatorNode;
