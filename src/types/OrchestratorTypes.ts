/**
 * Orchestrator Node - Timeline-based sequencer with audio, events, and piano roll rows
 */

export interface AudioSegmentEvent {
  id: string;
  startTime: number; // seconds
  duration: number; // seconds
  audioBuffer?: ArrayBuffer;
  diskFileName?: string; // reference to wav file on disk
  arrayBuffer?: ArrayBuffer; // fallback for serialized data
  fileUrl?: string; // URL to audio file
  speed?: number; // playback speed multiplier (default 1)
  reverse?: boolean; // play in reverse
  gain?: number; // volume (0-1)
  detectedFrequency?: number | null; // for repitching
}

export interface FrequencyGateEvent {
  id: string;
  startTime: number; // seconds
  duration: number; // seconds
  frequency: number; // Hz
  velocity?: number; // 0-127 for MIDI-like control
}

export interface MusicNote {
  id: string;
  startTime: number; // seconds
  duration: number; // seconds
  pitch: number; // MIDI note number (0-127) or Hz
  velocity?: number; // 0-127
}

export interface OrchestratorRow {
  id: string;
  label: string;
  type: 'audio' | 'event' | 'pianoroll';
  audioSegments?: AudioSegmentEvent[];
  events?: FrequencyGateEvent[];
  notes?: MusicNote[];
  muted?: boolean;
  volume?: number; // 0-1
  monoMode?: boolean; // for event & pianoroll rows: prevent overlap
}

export interface TimeSignature {
  beats: number; // numerator (4 for 4/4)
  noteValue: number; // denominator (4 for 4/4, which means quarter note)
}

export interface OrchestratorData {
  rows: OrchestratorRow[];
  timeSignature: TimeSignature; // 4/4, 3/4, etc
  duration: number; // total length in seconds, auto-extends
  currentPosition: number; // 0-1 (playhead position as percentage)
  isPlaying?: boolean;
  snapToGrid?: boolean;
  gridGranularity?: 'beat' | 'half' | 'quarter' | 'eighth' | 'sixteenth';
  zoom?: number; // px per beat (default 80)
  tempo?: number; // BPM (inherited from clock, stored for reference)
}

export type GridGranularityType = 'beat' | 'half' | 'quarter' | 'eighth' | 'sixteenth';

/**
 * Maps grid granularity to beat divisions
 * beat = 1.0 (full beat), half = 0.5, quarter = 0.25, etc
 */
export const GRANULARITY_DIVISOR: Record<GridGranularityType, number> = {
  beat: 1.0,
  half: 0.5,
  quarter: 0.25,
  eighth: 0.125,
  sixteenth: 0.0625
};

export const DEFAULT_ORCHESTRATOR_DATA: OrchestratorData = {
  rows: [],
  timeSignature: { beats: 4, noteValue: 4 },
  duration: 60,
  currentPosition: 0,
  isPlaying: false,
  snapToGrid: true,
  gridGranularity: 'quarter',
  zoom: 80,
  tempo: 120
};
