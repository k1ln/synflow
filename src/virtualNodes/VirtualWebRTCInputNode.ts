import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';

export interface WebRTCInputVirtualData {
  sessionId?: string;
  serverUrl?: string;
  label?: string;
  connectionState?: string;
  lastError?: string;
  style?: any;
}

export class VirtualWebRTCInputNode extends VirtualNode<
  CustomNode & { data: WebRTCInputVirtualData },
  GainNode
> {
  private outputGain: GainNode;
  private sourceNode?: MediaStreamAudioSourceNode;
  private remoteStream: MediaStream | null = null;
  private pc: RTCPeerConnection | null = null;
  private connecting = false;
  private desiredKey: string | null = null;
  private activeKey: string | null = null;
  private connectionState = 'disconnected';
  private lastError: string | null = null;

  constructor(ctx: AudioContext, eventBus: EventBus, node: CustomNode & { data: WebRTCInputVirtualData }) {
    const gain = ctx.createGain();
    gain.gain.value = 1;
    super(ctx, gain, eventBus, node);
    this.outputGain = gain;
  }

  async render(): Promise<void> {
    await this.ensureConnection();
  }

  handleUpdateParams(node: CustomNode & { data: WebRTCInputVirtualData }, data: any): void {
    const prevSession = this.node.data?.sessionId;
    const prevServer = this.node.data?.serverUrl;
    super.handleUpdateParams(node, data);
    const nextSession = this.node.data?.sessionId;
    const nextServer = this.node.data?.serverUrl;
    if (prevSession !== nextSession || prevServer !== nextServer) {
      this.ensureConnection().catch((err) => this.emitError(err));
    }
  }

  private async ensureConnection(): Promise<void> {
    const sessionId = (this.node.data?.sessionId || '').trim();
    const serverUrl = this.normalizeBaseUrl(this.node.data?.serverUrl);

    if (!sessionId || !serverUrl) {
      this.desiredKey = null;
      this.activeKey = null;
      if (this.pc) {
        this.closePeer();
      }
      if (this.connectionState !== 'idle') {
        this.updateConnectionState('idle');
      }
      return;
    }

    const key = `${serverUrl}::${sessionId}`;
    this.desiredKey = key;

    if (this.connecting) {
      return;
    }

    if (this.activeKey === key && this.pc) {
      return;
    }

    await this.startConnection(serverUrl, sessionId, key);
  }

  private async startConnection(serverUrl: string, sessionId: string, key: string): Promise<void> {
    this.connecting = true;
    const desiredAtStart = this.desiredKey;
    try {
      this.closePeer();
      this.updateConnectionState('connecting');

      const pc = new RTCPeerConnection();
      this.pc = pc;

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state) {
          this.updateConnectionState(state);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          this.updateConnectionState('failed', 'ICE connection failed');
        }
      };

      pc.ontrack = (event: RTCTrackEvent) => {
        if (event.track.kind !== 'audio') {
          return;
        }
        const stream = event.streams && event.streams[0] ? event.streams[0] : this.remoteStream || new MediaStream();
        if (!event.streams || event.streams.length === 0) {
          stream.addTrack(event.track);
        }
        this.attachRemoteStream(stream);
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      await this.waitForIceGathering(pc);
      const localSdp = pc.localDescription?.sdp;
      if (!localSdp) {
        throw new Error('Missing local SDP');
      }

      const res = await fetch(`${serverUrl}/api/sessions/${sessionId}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: localSdp }),
      });

      if (!res.ok) {
        throw new Error(`Offer rejected (${res.status})`);
      }

      const payload = await res.json();
      if (!payload || typeof payload.sdp !== 'string') {
        throw new Error('Invalid answer from server');
      }

      await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });

      this.remoteStream = null;
      if (this.desiredKey !== desiredAtStart) {
        return;
      }
      this.activeKey = key;
      this.updateConnectionState('connected');
    } catch (err) {
      this.emitError(err);
      this.activeKey = null;
      this.closePeer();
    } finally {
      this.connecting = false;
    }

    if (this.desiredKey !== key) {
      await this.ensureConnection();
    }
  }

  private attachRemoteStream(stream: MediaStream): void {
    if (!this.audioContext) {
      return;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore disconnect errors
      }
      this.sourceNode = undefined;
    }

    this.remoteStream = stream;

    try {
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.outputGain);
      this.sourceNode = source;
    } catch (err) {
      this.emitError(err);
    }
  }

  private waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', checkState);
      const timeout = setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }, 2000);
      pc.addEventListener('icegatheringstatechange', () => clearTimeout(timeout), { once: true });
    });
  }

  private updateConnectionState(state: string, error?: string | null): void {
    this.connectionState = state;
    if (typeof error === 'string' || error === null) {
      this.lastError = error;
    } else if (state === 'connected') {
      this.lastError = null;
    }

    if (this.node.data) {
      this.node.data.connectionState = state;
      if (this.lastError && this.lastError.trim()) {
        this.node.data.lastError = this.lastError;
      } else {
        delete this.node.data.lastError;
      }
    }

    const payload = {
      nodeId: this.node.id,
      connectionState: state,
      error: this.lastError ?? undefined,
    };

    this.eventBus.emit(`${this.node.id}.status.update`, { ...payload });
    this.eventBus.emit(`FlowNode.${this.node.id}.status.update`, { ...payload });
    this.eventBus.emit(`FlowNode.${this.node.id}.params.updateParams`, {
      nodeid: this.node.id,
      data: {
        connectionState: state,
        lastError: this.lastError ?? undefined,
      },
    });
  }

  private emitError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.lastError = message;
    this.updateConnectionState('error', message);
  }

  private closePeer(): void {
    if (this.pc) {
      try {
        this.pc.ontrack = null;
        this.pc.onconnectionstatechange = null;
        this.pc.close();
      } catch {
        // ignore close errors
      }
    }
    this.pc = null;

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // noop
      }
      this.sourceNode = undefined;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      this.remoteStream = null;
    }
  }

  disconnect(): void {
    this.closePeer();
    super.disconnect();
  }

  private normalizeBaseUrl(value?: string): string | null {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    return withProtocol.replace(/\/+$/, '');
  }
}

export default VirtualWebRTCInputNode;
