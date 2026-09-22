/**
 * Orchestrator Node data shapes — timeline-based sequencer with audio,
 * events, and piano roll rows.
 *
 * This is the engine's copy: packages/core is a standalone published
 * package (see package.json's description — "headless synflow audio
 * engine") and can't reach into the editor's src/types/OrchestratorTypes.ts.
 * VirtualOrchestratorNode.ts used to import from '../types/OrchestratorTypes'
 * — a path that never existed in this package — which only compiled because
 * of this file's @ts-nocheck. Keep this structurally in sync with the
 * editor's copy at src/types/OrchestratorTypes.ts; it's the wire shape for
 * OrchestratorFlowNode's `data`.
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
