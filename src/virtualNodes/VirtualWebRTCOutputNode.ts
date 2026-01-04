import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';

export interface WebRTCOutputVirtualData {
  sessionId?: string;
  serverUrl?: string;
  label?: string;
  connectionState?: string;
  lastError?: string;
  style?: any;
}

export class VirtualWebRTCOutputNode extends VirtualNode<
  CustomNode & { data: WebRTCOutputVirtualData },
  GainNode
> {
  private inputGain: GainNode;
  private destination: MediaStreamAudioDestinationNode;
  private pc: RTCPeerConnection | null = null;
  private connecting = false;
  private desiredKey: string | null = null;
  private activeKey: string | null = null;
  private connectionState = 'disconnected';
  private lastError: string | null = null;

  constructor(ctx: AudioContext, eventBus: EventBus, node: CustomNode & { data: WebRTCOutputVirtualData }) {
    const gain = ctx.createGain();
    gain.gain.value = 1;
    const dest = ctx.createMediaStreamDestination();
    gain.connect(dest);
    super(ctx, gain, eventBus, node);
    this.inputGain = gain;
    this.destination = dest;
  }

  async render(): Promise<void> {
    await this.ensureConnection();
  }

  handleUpdateParams(node: CustomNode & { data: WebRTCOutputVirtualData }, data: any): void {
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

      const stream = this.destination.stream;
      const tracks = stream.getAudioTracks();
      if (!tracks.length) {
        throw new Error('Audio destination has no tracks to send');
      }
      tracks.forEach((track) => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer();
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
        this.pc.onconnectionstatechange = null;
        this.pc.close();
      } catch {
        // ignore
      }
    }
    this.pc = null;
    this.activeKey = null;
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

export default VirtualWebRTCOutputNode;
