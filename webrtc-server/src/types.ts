export type SessionDirection = 'capture' | 'playback';

export interface SessionConfig {
  id: string;
  name: string;
  direction: SessionDirection;
  hostApiId?: number | null;
  inputDeviceId?: number | null;
  outputDeviceId?: number | null;
  sampleRate: number;
  channelCount: number;
  blockSize: number;
  latencyMs: number;
  description?: string;
}

export interface SessionState {
  config: SessionConfig;
  createdAt: number;
  updatedAt: number;
}

export interface PersistedState {
  sessions: SessionState[];
}

export interface ListDevicesResponse {
  hostApis: HostApiSummary[];
  devices: DeviceSummary[];
}

export interface HostApiSummary {
  id: number;
  name: string;
  type?: string;
  defaultInput?: number;
  defaultOutput?: number;
}

export type DeviceKind = "input" | "output" | "both";

export interface DeviceSummary {
  id: number;
  name: string;
  hostApiId?: number;
  hostApiName?: string;
  maxInputChannels: number;
  maxOutputChannels: number;
  defaultSampleRate?: number;
  kind: DeviceKind;
  description: string;
}
