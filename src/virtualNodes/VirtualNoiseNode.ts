import VirtualNode from "./VirtualNode";
import EventBus from "../sys/EventBus";
import { CustomNode } from "../sys/AudioGraphManager";
import { NoiseFlowNodeData, NoiseKind } from "../nodes/NoiseFlowNode";
import { compileWasmModule } from "../sys/wasmUtils";

export class VirtualNoiseNode extends VirtualNode<CustomNode & { data: NoiseFlowNodeData }> {
  audioWorkletNode: AudioWorkletNode | null = null;
  private _noiseType: NoiseKind;
  private _reconnectTargets: (AudioNode | AudioParam)[] = [];

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & { data: NoiseFlowNodeData },
  ) {
    super(audioContext, undefined as any, eventBus, node);
    this._noiseType = node.data.noiseType || 'white';
  }

  async init() {
    await this._ensureModuleLoaded();
    await this._createWorkletNode();
    this._subscribeNoiseType();
  }

  private async _ensureModuleLoaded() {
    const worklet = this.audioContext!.audioWorklet;
    const modulePath = '/NoiseGeneratorProcessor.js';
    const loaded: string[] = (worklet as any)._loadedModules ?? ((worklet as any)._loadedModules = []);
    if (!loaded.includes(modulePath)) {
      await worklet.addModule(modulePath);
      loaded.push(modulePath);
    }
  }

  private async _createWorkletNode() {
    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
    }
    const wasmModule = await compileWasmModule('/noise-generator.wasm');
    this.audioWorkletNode = new AudioWorkletNode(this.audioContext!, 'noise-generator', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { wasmModule },
    });
    this.audioNode = this.audioWorkletNode;
    this.audioWorkletNode.port.postMessage({ type: 'setNoiseType', value: this._noiseType });
    this._reconnectTargets.forEach(t => {
      try { this.audioWorkletNode!.connect(t as AudioNode); } catch (_) { /* ignore */ }
    });
  }

  private _subscribeNoiseType() {
    this.eventBus.subscribe(this.node.id + '.noiseType.change', (payload: { value: NoiseKind }) => {
      this._noiseType = payload.value;
      if (this.audioWorkletNode) {
        this.audioWorkletNode.port.postMessage({ type: 'setNoiseType', value: this._noiseType });
      }
    });
  }

  connect(destination: AudioNode | AudioParam) {
    if (!this._reconnectTargets.includes(destination)) {
      this._reconnectTargets.push(destination);
    }
    super.connect(destination);
  }

  setNoiseType(type: NoiseKind) {
    this._noiseType = type;
    if (this.audioWorkletNode) {
      this.audioWorkletNode.port.postMessage({ type: 'setNoiseType', value: type });
    }
  }

  getGainParam(): AudioParam | null {
    return (this.audioWorkletNode?.parameters as any)?.get?.('gain') ?? null;
  }
}

export default VirtualNoiseNode;
