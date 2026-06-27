import { randomUUID } from 'crypto';
import { SessionStorage } from './storage.js';
import { PortAudioSession } from './PortAudioSession.js';
import { SessionConfig, SessionDirection, SessionState } from './types.js';

interface SessionRecord {
  state: SessionState;
  engine: PortAudioSession;
}

const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_CHANNELS = 2;
const DEFAULT_BLOCK_SIZE = 480;
const DEFAULT_LATENCY = 10;
const DEFAULT_DIRECTION: SessionDirection = 'capture';

export class SessionManager {
  private readonly storage: SessionStorage;
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(storage: SessionStorage) {
    this.storage = storage;
  }

  async init(): Promise<void> {
    const persisted = await this.storage.load();
    for (const state of persisted.sessions) {
      const normalized = this.normalizeState(state);
      const engine = new PortAudioSession(normalized.config);
      this.sessions.set(normalized.config.id, { state: normalized, engine });
    }
  }

  list(): SessionState[] {
    return Array.from(this.sessions.values()).map((entry) => entry.state);
  }

  get(id: string): SessionState | undefined {
    return this.sessions.get(id)?.state;
  }

  getEngine(id: string): PortAudioSession | undefined {
    return this.sessions.get(id)?.engine;
  }

  async create(config: Partial<Omit<SessionConfig, 'id'>> & { name: string }): Promise<SessionState> {
    const id = randomUUID();
    const direction = this.ensureDirection(config.direction);
    const sessionConfig: SessionConfig = {
      id,
      name: config.name,
      direction,
      hostApiId: config.hostApiId ?? null,
      inputDeviceId: config.inputDeviceId ?? null,
      outputDeviceId: config.outputDeviceId ?? null,
      sampleRate: config.sampleRate ?? DEFAULT_SAMPLE_RATE,
      channelCount: config.channelCount ?? DEFAULT_CHANNELS,
      blockSize: config.blockSize ?? DEFAULT_BLOCK_SIZE,
      latencyMs: config.latencyMs ?? DEFAULT_LATENCY,
      description: config.description,
    };

    if (direction === 'capture') {
      sessionConfig.outputDeviceId = null;
    } else {
      sessionConfig.inputDeviceId = null;
    }

    const state: SessionState = {
      config: sessionConfig,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const engine = new PortAudioSession(sessionConfig);
    this.sessions.set(id, { state, engine });
    await this.persist();
    return state;
  }

  async update(id: string, patch: Partial<SessionConfig>): Promise<SessionState> {
    const entry = this.sessions.get(id);
    if (!entry) {
      throw new Error(`Session ${id} not found`);
    }

    const nextConfig: SessionConfig = {
      ...entry.state.config,
      ...patch,
      id,
    };
    nextConfig.direction = this.ensureDirection(nextConfig.direction);

    if (nextConfig.direction === 'capture') {
      nextConfig.outputDeviceId = null;
    } else {
      nextConfig.inputDeviceId = null;
    }

    entry.state = {
      ...entry.state,
      config: nextConfig,
      updatedAt: Date.now(),
    };

    entry.engine.updateConfig(entry.state.config);
    await this.persist();
    return entry.state;
  }

  async remove(id: string): Promise<void> {
    const entry = this.sessions.get(id);
    if (!entry) return;
    await entry.engine.shutdown();
    this.sessions.delete(id);
    await this.persist();
  }

  async handleOffer(id: string, sdp: string): Promise<{ sdp: string }> {
    const entry = this.sessions.get(id);
    if (!entry) {
      throw new Error(`Session ${id} not found`);
    }
    return entry.engine.applyOffer(sdp);
  }

  private async persist(): Promise<void> {
    const snapshot: SessionState[] = this.list();
    await this.storage.save({ sessions: snapshot });
  }

  private ensureDirection(value: unknown): SessionDirection {
    return value === 'playback' ? 'playback' : DEFAULT_DIRECTION;
  }

  private normalizeState(state: SessionState): SessionState {
    const direction = this.ensureDirection(state.config.direction);
    const normalizedConfig: SessionConfig = {
      ...state.config,
      direction,
    };

    if (direction === 'capture') {
      normalizedConfig.outputDeviceId = null;
    } else {
      normalizedConfig.inputDeviceId = null;
    }

    return {
      ...state,
      config: normalizedConfig,
    };
  }
}
