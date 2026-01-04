import { EventEmitter } from 'events';
import portAudio from 'naudiodon';
import wrtc from 'wrtc';
import { SessionConfig } from './types.js';

const { nonstandard } = wrtc as any;
const CHANNELS_DEFAULT = 2;
const SAMPLE_FORMAT = portAudio.SampleFormat16Bit;
const BYTES_PER_SAMPLE = 2;
const TARGET_SAMPLE_RATE = 48000;
const WEBRTC_FRAME_SIZE = 480; // 10ms at 48kHz

interface CaptureState {
  stream: any;
  buffer: Int16Array;
  offset: number;
}

interface PlaybackState {
  stream: any;
  sink: any;
  queue: Buffer[];
  draining: boolean;
  sampleRate: number;
  channelCount: number;
  track: MediaStreamTrack;
  trackEndedHandler?: () => void;
}

export interface OfferResult {
  sdp: string;
}

export class PortAudioSession extends EventEmitter {
  readonly id: string;
  private config: SessionConfig;
  private capture: CaptureState | null = null;
  private playback: PlaybackState | null = null;
  private pc: RTCPeerConnection | null = null;
  private audioSource: InstanceType<typeof nonstandard.RTCAudioSource> | null = null;
  private track: MediaStreamTrack | null = null;
  private remoteTrack: MediaStreamTrack | null = null;

  constructor(config: SessionConfig) {
    super();
    this.id = config.id;
    this.config = config;
  }

  get activeConfig(): SessionConfig {
    return this.config;
  }

  updateConfig(patch: Partial<SessionConfig>): void {
    const previousDirection = this.config.direction;
    this.config = { ...this.config, ...patch };

    const directionChanged = patch.direction !== undefined && patch.direction !== previousDirection;

    if (directionChanged) {
      this.stopCapture();
      this.stopPlayback();
    }

    if (this.config.direction === 'capture') {
      if (
        directionChanged ||
        patch.inputDeviceId !== undefined ||
        patch.sampleRate !== undefined ||
        patch.blockSize !== undefined ||
        patch.channelCount !== undefined
      ) {
        this.restartCapture();
      }
    } else if (this.config.direction === 'playback') {
      if (
        directionChanged ||
        patch.outputDeviceId !== undefined ||
        patch.sampleRate !== undefined ||
        patch.blockSize !== undefined ||
        patch.channelCount !== undefined ||
        patch.latencyMs !== undefined
      ) {
        this.restartPlayback();
      }
    }
  }

  async applyOffer(remoteSdp: string): Promise<OfferResult> {
    await this.closePeer();
    const pc = new wrtc.RTCPeerConnection({ iceServers: [] });
    this.pc = pc;

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'closed' || state === 'failed' || state === 'disconnected') {
        this.emit('connectionstate', state);
        if (this.config.direction === 'capture') {
          this.restartCapture();
        } else {
          this.stopPlayback();
        }
      } else {
        this.emit('connectionstate', state);
      }
    };

    pc.ontrack = (event: any) => {
      if (event.track.kind === 'audio') {
        this.handleRemoteTrack(event.track);
      }
    };

    if (this.config.direction === 'capture') {
      const audioSource = new nonstandard.RTCAudioSource();
      const track = audioSource.createTrack();
      pc.addTrack(track);
      this.audioSource = audioSource;
      this.track = track;
    } else {
      this.audioSource = null;
      this.track = null;
      if (typeof pc.addTransceiver === 'function') {
        try {
          pc.addTransceiver('audio', { direction: 'recvonly' });
        } catch (err) {
          console.warn(`[session ${this.id}] failed to add recvonly transceiver`, err);
        }
      }
    }

    await pc.setRemoteDescription({ type: 'offer', sdp: remoteSdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (this.config.direction === 'capture') {
      this.startCapture();
    }

    const sdp = pc.localDescription?.sdp ?? answer.sdp;
    if (!sdp) {
      throw new Error(`[session ${this.id}] missing local SDP`);
    }
    return { sdp };
  }

  async closePeer(): Promise<void> {
    if (this.pc) {
      try {
        for (const sender of this.pc.getSenders()) {
          try {
            sender.track?.stop();
          } catch (err) {
            console.warn(`[session ${this.id}] failed to stop sender track`, err);
          }
        }
        await this.pc.close();
      } catch (err) {
        console.warn(`[session ${this.id}] error closing peer`, err);
      }
    }
    this.pc = null;
    this.track = null;
    this.stopPlayback(true);
    this.remoteTrack = null;
    if (this.audioSource) {
      try {
        this.audioSource.close();
      } catch (err) {
        console.warn(`[session ${this.id}] error closing audio source`, err);
      }
      this.audioSource = null;
    }
    this.stopCapture();
  }

  async shutdown(): Promise<void> {
    await this.closePeer();
  }

  private startCapture() {
    if (this.config.direction !== 'capture') {
      return;
    }
    if (!this.audioSource) {
      return;
    }

    const sampleRate = this.config.sampleRate || TARGET_SAMPLE_RATE;
    const channelCount = this.config.channelCount || CHANNELS_DEFAULT;
    const framesPerBuffer = Math.max(WEBRTC_FRAME_SIZE, this.config.blockSize || WEBRTC_FRAME_SIZE);
    const deviceId = this.config.inputDeviceId ?? undefined;

    try {
      const stream = new portAudio.AudioIO({
        inOptions: {
          channelCount,
          sampleFormat: SAMPLE_FORMAT,
          sampleRate,
          framesPerBuffer,
          deviceId,
          closeOnError: false,
        } as any,
      });

      const targetSamples = channelCount * WEBRTC_FRAME_SIZE;
      const buffer = new Int16Array(targetSamples);
      let offset = 0;

      (stream as any).on('data', (chunk: Buffer) => {
        if (!this.audioSource) return;
        const incomingSamples = Math.floor(chunk.length / BYTES_PER_SAMPLE);
        if (incomingSamples <= 0) return;
        const view = new Int16Array(chunk.buffer, chunk.byteOffset, incomingSamples);
        let src = 0;

        while (src < incomingSamples) {
          const remaining = targetSamples - offset;
          const available = incomingSamples - src;
          const toCopy = Math.min(remaining, available);
          buffer.set(view.subarray(src, src + toCopy), offset);
          src += toCopy;
          offset += toCopy;

          if (offset >= targetSamples) {
            const packet = new Int16Array(buffer);
            try {
              this.audioSource.onData({
                samples: packet,
                sampleRate,
                bitsPerSample: 16,
                channelCount,
                numberOfFrames: WEBRTC_FRAME_SIZE,
              });
            } catch (err) {
              console.error(`[session ${this.id}] failed to push audio packet`, err);
            }
            offset = 0;
          }
        }
      });

      (stream as any).on('error', (err: unknown) => {
        console.error(`[session ${this.id}] input stream error`, err);
        this.stopCapture();
      });

      stream.start();
      this.capture = { stream, buffer, offset };
    } catch (err) {
      console.error(`[session ${this.id}] failed to open capture stream`, err);
      this.capture = null;
    }
  }

  private stopCapture() {
    if (!this.capture) return;
    const { stream } = this.capture;
    this.capture = null;
    try {
      const duplex = stream as any;
      duplex.removeAllListeners?.('data');
      duplex.removeAllListeners?.('error');
      if (typeof (stream as any).quit === 'function') {
        try {
          (stream as any).quit();
        } catch (err) {
          console.warn(`[session ${this.id}] error quitting capture stream`, err);
        }
      }
      if (typeof (stream as any).stop === 'function') {
        try {
          (stream as any).stop();
        } catch (err) {
          console.warn(`[session ${this.id}] error stopping capture stream`, err);
        }
      }
      if (typeof duplex?.destroy === 'function') {
        duplex.destroy();
      }
    } catch (err) {
      console.error(`[session ${this.id}] error tearing down capture`, err);
    }
  }

  private restartCapture() {
    this.stopCapture();
    if (this.audioSource) {
      this.startCapture();
    }
  }

  private handleRemoteTrack(track: MediaStreamTrack) {
    this.remoteTrack = track;
    if (this.config.direction !== 'playback') {
      return;
    }
    this.startPlaybackForTrack(track);
  }

  private startPlaybackForTrack(track: MediaStreamTrack) {
    if (this.config.direction !== 'playback') {
      return;
    }

    this.stopPlayback();

    const sampleRate = this.config.sampleRate || TARGET_SAMPLE_RATE;
    const channelCount = this.config.channelCount || CHANNELS_DEFAULT;
    const framesPerBuffer = Math.max(WEBRTC_FRAME_SIZE, this.config.blockSize || WEBRTC_FRAME_SIZE);
    const deviceId = this.config.outputDeviceId ?? undefined;

    const sink = new nonstandard.RTCAudioSink(track);

    const stream = new portAudio.AudioIO({
      outOptions: {
        channelCount,
        sampleFormat: SAMPLE_FORMAT,
        sampleRate,
        framesPerBuffer,
        deviceId,
        latency: this.config.latencyMs,
        closeOnError: false,
      } as any,
    });

    const playbackState: PlaybackState = {
      stream,
      sink,
      queue: [],
      draining: false,
      sampleRate,
      channelCount,
      track,
    };

    const trackEndedHandler = () => {
      if (this.remoteTrack === track) {
        this.remoteTrack = null;
      }
      if (this.playback?.track === track) {
        this.stopPlayback();
      }
    };

    playbackState.trackEndedHandler = trackEndedHandler;
    track.addEventListener?.('ended', trackEndedHandler, { once: false });

    sink.ondata = (audioData: any) => {
      this.enqueuePlaybackFrame(audioData);
    };

    sink.onended = () => {
      if (this.remoteTrack === track) {
        this.remoteTrack = null;
      }
      if (this.playback?.track === track) {
        this.stopPlayback();
      }
    };

    (stream as any).on('error', (err: unknown) => {
      console.error(`[session ${this.id}] playback stream error`, err);
      this.restartPlayback();
    });

    (stream as any).on('drain', () => {
      this.flushPlaybackQueue();
    });

    this.playback = playbackState;

    try {
      stream.start();
    } catch (err) {
      console.error(`[session ${this.id}] failed to start playback stream`, err);
      try {
        sink.stop?.();
      } catch (sinkErr) {
        console.warn(`[session ${this.id}] failed to stop sink after start error`, sinkErr);
      }
      if (playbackState.trackEndedHandler && track.removeEventListener) {
        try {
          track.removeEventListener('ended', playbackState.trackEndedHandler);
        } catch (removeErr) {
          console.warn(`[session ${this.id}] failed to remove track handler after start error`, removeErr);
        }
      }
      this.playback = null;
    }
  }

  private enqueuePlaybackFrame(audioData: any) {
    if (this.config.direction !== 'playback') {
      return;
    }

    const playback = this.playback;
    if (!playback) {
      return;
    }

    const { samples, sampleRate } = audioData ?? {};
    if (!samples || typeof samples.length !== 'number' || samples.length === 0) {
      return;
    }

    if (sampleRate && sampleRate !== playback.sampleRate) {
      console.warn(
        `[session ${this.id}] remote sample rate ${sampleRate} differs from configured ${playback.sampleRate}; playback may sound incorrect`
      );
    }

    const frameBytes = new Uint8Array(samples.buffer, samples.byteOffset ?? 0, samples.byteLength ?? samples.length * BYTES_PER_SAMPLE);
    const buffer = Buffer.from(frameBytes);
    playback.queue.push(buffer);
    this.flushPlaybackQueue();
  }

  private flushPlaybackQueue() {
    const playback = this.playback;
    if (!playback) {
      return;
    }

    while (playback.queue.length > 0) {
      const next = playback.queue[0];
      const ok = playback.stream.write(next);
      if (!ok) {
        playback.draining = true;
        return;
      }
      playback.queue.shift();
    }
    playback.draining = false;
  }

  private stopPlayback(clearTrack = false) {
    if (!this.playback) {
      if (clearTrack) {
        this.remoteTrack = null;
      }
      return;
    }

    const { stream, sink, track, trackEndedHandler } = this.playback;
    this.playback = null;

    if (trackEndedHandler && track?.removeEventListener) {
      try {
        track.removeEventListener('ended', trackEndedHandler);
      } catch (err) {
        console.warn(`[session ${this.id}] failed to remove track listener`, err);
      }
    }

    try {
      sink?.stop?.();
    } catch (err) {
      console.warn(`[session ${this.id}] error stopping audio sink`, err);
    }

    try {
      sink?.removeAllListeners?.('data');
      sink?.removeAllListeners?.('ended');
    } catch (err) {
      console.warn(`[session ${this.id}] error removing sink listeners`, err);
    }

    try {
      (stream as any).removeAllListeners?.('drain');
      (stream as any).removeAllListeners?.('error');
      if (typeof (stream as any).stop === 'function') {
        (stream as any).stop();
      }
      if (typeof (stream as any).quit === 'function') {
        (stream as any).quit();
      }
      if (typeof (stream as any).destroy === 'function') {
        (stream as any).destroy();
      }
    } catch (err) {
      console.error(`[session ${this.id}] error tearing down playback stream`, err);
    }

    if (clearTrack) {
      this.remoteTrack = null;
    }
  }

  private restartPlayback() {
    if (this.config.direction !== 'playback') {
      this.stopPlayback();
      return;
    }

    const track = this.remoteTrack;
    if (!track || track.readyState === 'ended') {
      this.stopPlayback();
      return;
    }

    this.startPlaybackForTrack(track);
  }
}
