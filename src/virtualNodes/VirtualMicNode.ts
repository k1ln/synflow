import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';

export interface MicVirtualData {
  selectedDeviceId?: string;
  label?: string;
  style?: any;
}

/**
 * VirtualMicNode wraps a MediaStreamAudioSourceNode. It listens for param updates
 * (selectedDeviceId) and (re)creates the underlying source node when device changes.
 * Provides an audioNode that can be connected like other source nodes.
 */
export class VirtualMicNode extends VirtualNode<
  CustomNode & { data: MicVirtualData },
  AudioWorkletNode | MediaStreamAudioSourceNode | undefined
> {
  private currentStream: MediaStream | null = null;
  private pendingDeviceId: string | undefined;
  // Low-latency management flags
  private creating = false;
  private createToken = 0;
  private currentDeviceId?: string;
  private passThroughNode?: AudioWorkletNode;
  private sourceNode?: MediaStreamAudioSourceNode;
  private workletUrl?: string;
  private workletRegistered = false;

  constructor(ctx: AudioContext, eventBus: EventBus, node: CustomNode & { data: MicVirtualData }) {
    // Pass undefined initially; will create on first render or device selection.
    super(ctx, undefined, eventBus, node);
    this.subscribeMicEvents();
  }

  private subscribeMicEvents() {
    // React to updates from Flow node (params.updateParams) already subscribed via base.
    // Additional explicit subscription for device changes if needed.
    this.eventBus.subscribe(this.node.id + '.params.updateParams', (payload: any) => {
      const devId = payload?.data?.selectedDeviceId;
      if (typeof devId === 'string' || devId === '') {
        this.setDevice(devId || undefined);
      }
    });
  }

  async setDevice(deviceId?: string) {
    if (this.creating) return; // avoid concurrent race
    if (deviceId === this.currentDeviceId) return; // already active
    this.pendingDeviceId = deviceId;
    await this.createMediaStream(deviceId);
  }

  private async createMediaStream(deviceId?: string) {
    if (!this.audioContext) return;

    // If existing stream matches device and is live, skip re-init
    if (this.currentStream && deviceId === this.currentDeviceId && this.currentStream.getAudioTracks().some(t => t.readyState === 'live')) {
      return;
    }

    const token = ++this.createToken;
    this.creating = true;
    const oldStream = this.currentStream; // hold until new is ready to reduce gap

    try {
      const audioConstraints: MediaTrackConstraints = {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        channelCount: { ideal: 1, max: 1 }, // mono lowers processing cost
        sampleRate: this.audioContext.sampleRate, // request matching rate to avoid resample
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
        // Note: Mic latency controlled by AudioContext latencyHint: 'interactive'
      };
      const constraints: MediaStreamConstraints = { audio: audioConstraints, video: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (token !== this.createToken) { // superseded by newer request
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      this.currentStream = stream;
      this.currentDeviceId = deviceId;

      try {
        // Re-create source node; disconnect old after swap
        const newSource = this.audioContext.createMediaStreamSource(stream);
        await this.ensurePassThroughNode();

        if (this.passThroughNode) {
          try { this.sourceNode?.disconnect(); } catch {/* noop */}
          try { this.passThroughNode.disconnect(); } catch {/* noop */}
          newSource.connect(this.passThroughNode);
          this.audioNode = this.passThroughNode;
        } else {
          try { this.audioNode?.disconnect(); } catch { /* noop */ }
          this.audioNode = newSource;
        }

        this.sourceNode = newSource;
      } catch (err) {
        console.warn('[VirtualMicNode] createMediaStreamSource failed', err);
        this.audioNode = undefined;
      }

      // Stop old after successful handover
      if (oldStream && oldStream !== stream) {
        oldStream.getTracks().forEach(t => t.stop());
      }
    } catch (e) {
      console.warn('[VirtualMicNode] Failed to get user media', e);
      // If failure and no current stream, clear node
      if (!this.currentStream) this.audioNode = undefined;
    } finally {
      this.creating = false;
    }
  }

  /** Call once after construction to create initial stream if autoStart or selectedDeviceId present */
  async render() {
    const initialDevice = this.node.data?.selectedDeviceId;
    await this.createMediaStream(initialDevice);
  }

  disconnect() {
    super.disconnect();
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(t => t.stop());
      this.currentStream = null;
    }
    try { this.sourceNode?.disconnect(); } catch {/* noop */}
    try { this.passThroughNode?.disconnect(); } catch {/* noop */}
    this.sourceNode = undefined;
    this.passThroughNode = undefined;
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
      this.workletUrl = undefined;
      this.workletRegistered = false;
    }
  }

  private async ensurePassThroughNode() {
    if (!this.audioContext) {
      return;
    }

    if (!this.workletRegistered) {
      const processorCode = `class MicBypassProcessor extends AudioWorkletProcessor{process(inputs,outputs){const input=inputs[0];const output=outputs[0];if(input && input.length && output && output.length){for(let ch=0;ch<input.length && ch<output.length;ch++){output[ch].set(input[ch]);}}return true;}}registerProcessor('mic-bypass-processor',MicBypassProcessor);`;
      const blob = new Blob([processorCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      try {
        await this.audioContext.audioWorklet.addModule(url);
        this.workletUrl = url;
        this.workletRegistered = true;
      } catch (e) {
        console.warn('[VirtualMicNode] Failed to register bypass worklet', e);
        URL.revokeObjectURL(url);
        this.workletUrl = undefined;
        this.workletRegistered = false;
        return;
      }
    }

    if (!this.passThroughNode) {
      try {
        this.passThroughNode = new AudioWorkletNode(this.audioContext, 'mic-bypass-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
      } catch (e) {
        console.warn('[VirtualMicNode] Failed to create bypass worklet node', e);
        this.passThroughNode = undefined;
      }
    }
  }
}

export default VirtualMicNode;
