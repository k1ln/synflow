import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';
import {
  OrchestratorData,
  AudioSegmentEvent,
  FrequencyGateEvent,
  MusicNote,
  OrchestratorRow,
  GRANULARITY_DIVISOR
} from '../types/OrchestratorTypes';

export type OrchestratorRuntimeNode = CustomNode & { data: OrchestratorData; id: string };

/**
 * VirtualOrchestratorNode manages a multi-row timeline sequencer with audio, events, and piano roll support.
 * It receives clock pulses, position changes, and restart commands from external nodes.
 */
export class VirtualOrchestratorNode extends VirtualNode<OrchestratorRuntimeNode, GainNode> {
  private data: OrchestratorData;
  private currentTempo: number = 120; // BPM
  private beatDuration: number = 0.5; // seconds per beat (at 120 BPM)
  private currentPosition: number = 0; // in seconds
  private isPlaying: boolean = false;
  private lastPlayheadPosition: number = 0; // for detecting event crossings
  
  // Track active audio sources per row for polyphony control
  private activeSources: Map<string, Set<AudioBufferSourceNode>> = new Map();
  // Track active events per row for mono mode
  private activeEvents: Map<string, string> = new Map(); // row-id -> event-id
  
  // Clock tracking
  private clockInputs: { handle: string; handler: (d: any) => void }[] = [];
  private restartHandler?: (d: any) => void;
  private setPositionHandler?: (d: any) => void;
  
  // Decoded audio buffers (lazy-loaded)
  private audioBuffers: Map<string, AudioBuffer | null> = new Map();

  constructor(
    audioContext: AudioContext | undefined,
    eventBus: EventBus,
    node: OrchestratorRuntimeNode
  ) {
    const gainNode = audioContext?.createGain();
    super(audioContext, gainNode as GainNode, eventBus, node);
    this.data = node.data || { rows: [], duration: 60, currentPosition: 0 };
    this.setupClockSubscriptions();
    this.setupPositionSubscriptions();
  }

  /**
   * Clock input: receives beat pulses with tempo information
   */
  private setupClockSubscriptions() {
    // Subscribe to clock input (expects tempo in payload)
    const clockCh = this.node.id + '.clock.receiveNodeOn';
    const clockHandler = (payload: any) => {
      const tempo = payload?.tempo || payload?.value || this.currentTempo;
      if (typeof tempo === 'number' && tempo > 0) {
        this.currentTempo = tempo;
        this.beatDuration = 60 / tempo; // convert BPM to seconds per beat
      }
      // Advance playhead by one beat
      this.advance(this.beatDuration);
    };
    
    this.eventBus.subscribe(clockCh, clockHandler);
    this.clockInputs.push({ handle: clockCh, handler: clockHandler });
  }

  /**
   * Position control: set playhead position (0-1)
   */
  private setupPositionSubscriptions() {
    // Restart: jump to position 0
    const restartCh = this.node.id + '.restart.receiveNodeOn';
    this.restartHandler = () => this.setPosition(0);
    this.eventBus.subscribe(restartCh, this.restartHandler);

    // Set position: jump to value (0-1) or frequency (as normalized position)
    const setPosCh = this.node.id + '.setPosition.receiveNodeOn';
    this.setPositionHandler = (payload: any) => {
      const pos = payload?.value ?? payload?.frequency ?? 0;
      if (typeof pos === 'number') {
        this.setPosition(Math.max(0, Math.min(1, pos)));
      }
    };
    this.eventBus.subscribe(setPosCh, this.setPositionHandler);
  }

  /**
   * Advance playhead by delta seconds and check for event triggers
   */
  private advance(deltaSeconds: number) {
    if (!this.isPlaying) return;
    
    const oldPos = this.currentPosition;
    this.currentPosition = Math.min(this.currentPosition + deltaSeconds, this.data.duration);
    
    // Auto-loop at end (optional, can be user-configurable)
    if (this.currentPosition >= this.data.duration) {
      this.currentPosition = 0;
      this.lastPlayheadPosition = 0;
    }
    
    this.checkEventTriggers(oldPos, this.currentPosition);
    this.syncUIPosition();
  }

  /**
   * Set absolute playhead position (0-1 normalized, or in seconds)
   */
  private setPosition(position: number) {
    // Interpret as 0-1 range if less than duration, else as seconds
    let newPos = position < 1 ? position * this.data.duration : position;
    newPos = Math.max(0, Math.min(newPos, this.data.duration));
    
    const oldPos = this.currentPosition;
    this.currentPosition = newPos;
    
    // Reset event triggers for mono mode
    this.activeEvents.clear();
    
    // Optional: check triggers when seeking (can cause double-triggers)
    // For safety, we'll skip trigger checking on seek to avoid artifacts
    this.syncUIPosition();
  }

  /**
   * Check which events have been crossed by playhead movement
   */
  private checkEventTriggers(fromTime: number, toTime: number) {
    for (const row of this.data.rows) {
      if (row.muted) continue;

      // Audio row: fire segment triggers
      if (row.type === 'audio' && row.audioSegments) {
        for (const seg of row.audioSegments) {
          if (this.timeRangeCrossed(fromTime, toTime, seg.startTime, seg.startTime + seg.duration)) {
            this.fireAudioSegment(row, seg);
          }
        }
      }

      // Event row: fire gate + frequency
      if (row.type === 'event' && row.events) {
        for (const event of row.events) {
          if (this.timeRangeCrossed(fromTime, toTime, event.startTime, event.startTime + event.duration)) {
            this.fireEvent(row, event);
          }
        }
      }

      // Piano roll: fire note triggers
      if (row.type === 'pianoroll' && row.notes) {
        for (const note of row.notes) {
          if (this.timeRangeCrossed(fromTime, toTime, note.startTime, note.startTime + note.duration)) {
            this.fireNote(row, note);
          }
        }
      }
    }
  }

  /**
   * Check if playhead crossed into an event's time range
   */
  private timeRangeCrossed(fromTime: number, toTime: number, eventStart: number, eventEnd: number): boolean {
    return fromTime < eventEnd && toTime > eventStart;
  }

  /**
   * Fire audio segment on row
   */
  private fireAudioSegment(row: OrchestratorRow, segment: AudioSegmentEvent) {
    if (!this.audioContext) return;

    // Load buffer if not cached
    let buffer = this.audioBuffers.get(segment.id);
    if (buffer === undefined) {
      // TODO: Load from arrayBuffer/disk/url
      // For now, assume buffer is in segment.audioBuffer
      buffer = null; // placeholder
      this.audioBuffers.set(segment.id, buffer);
    }
    if (!buffer) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = segment.speed ?? 1;
    
    // Create gain node for row volume
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = row.volume ?? 1;
    
    source.connect(gainNode);
    gainNode.connect(this.audioNode!);
    
    // Calculate playback start within segment
    const offsetInSegment = Math.max(0, this.currentPosition - segment.startTime);
    const playDuration = Math.min(segment.duration - offsetInSegment, 
                                   this.data.duration - this.currentPosition);
    
    source.start(this.audioContext.currentTime, offsetInSegment, playDuration);
    
    // Track for cleanup
    const sources = this.activeSources.get(row.id) || new Set();
    sources.add(source);
    this.activeSources.set(row.id, sources);
    
    source.onended = () => {
      sources.delete(source);
    };
  }

  /**
   * Fire frequency+gate event
   */
  private fireEvent(row: OrchestratorRow, event: FrequencyGateEvent) {
    // Check mono mode
    if (row.monoMode && this.activeEvents.has(row.id)) {
      // Stop previous event
      const prevEventId = this.activeEvents.get(row.id);
      if (prevEventId) {
        this.eventBus.emit(
          this.node.id + '.' + row.id + '.' + prevEventId + '.sendNodeOff',
          { gate: 0, frequency: 0 }
        );
      }
    }

    const eventHandle = row.id + '-' + event.id;
    this.activeEvents.set(row.id, event.id);
    
    // Emit ON
    this.eventBus.emit(
      this.node.id + '.' + eventHandle + '.sendNodeOn',
      { 
        gate: 1, 
        frequency: event.frequency, 
        velocity: event.velocity ?? 100
      }
    );

    // Schedule OFF
    const offDelay = (event.startTime + event.duration - this.currentPosition) * 1000;
    setTimeout(() => {
      this.eventBus.emit(
        this.node.id + '.' + eventHandle + '.sendNodeOff',
        { gate: 0, frequency: 0 }
      );
      if (this.activeEvents.get(row.id) === event.id) {
        this.activeEvents.delete(row.id);
      }
    }, Math.max(0, offDelay));
  }

  /**
   * Fire piano note (similar to event)
   */
  private fireNote(row: OrchestratorRow, note: MusicNote) {
    // Convert MIDI note to frequency
    const frequency = this.midiToFrequency(note.pitch);
    
    // Check mono mode
    if (row.monoMode && this.activeEvents.has(row.id)) {
      const prevEventId = this.activeEvents.get(row.id);
      if (prevEventId) {
        this.eventBus.emit(
          this.node.id + '.' + row.id + '.' + prevEventId + '.sendNodeOff',
          { gate: 0, frequency: 0 }
        );
      }
    }

    const eventHandle = row.id + '-' + note.id;
    this.activeEvents.set(row.id, note.id);
    
    // Emit ON
    this.eventBus.emit(
      this.node.id + '.' + eventHandle + '.sendNodeOn',
      { 
        gate: 1, 
        frequency: frequency, 
        velocity: note.velocity ?? 100
      }
    );

    // Schedule OFF
    const offDelay = (note.startTime + note.duration - this.currentPosition) * 1000;
    setTimeout(() => {
      this.eventBus.emit(
        this.node.id + '.' + eventHandle + '.sendNodeOff',
        { gate: 0, frequency: 0 }
      );
      if (this.activeEvents.get(row.id) === note.id) {
        this.activeEvents.delete(row.id);
      }
    }, Math.max(0, offDelay));
  }

  /**
   * Convert MIDI note number to Hz frequency
   */
  private midiToFrequency(midiNote: number): number {
    // A4 (MIDI 69) = 440 Hz
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  /**
   * Sync current position to UI
   */
  private syncUIPosition() {
    if (this.node.data) {
      this.node.data.currentPosition = this.currentPosition / this.data.duration;
      this.eventBus.emit(
        'FlowNode.' + this.node.id + '.params.updateParams',
        {
          nodeid: this.node.id,
          data: {
            currentPosition: this.node.data.currentPosition,
            from: 'VirtualOrchestratorNode'
          }
        }
      );
    }
  }

  /**
   * Play/pause control
   */
  public setPlaying(playing: boolean) {
    this.isPlaying = playing;
  }

  /**
   * Get current playhead position as 0-1
   */
  public getPosition(): number {
    return this.data.duration > 0 ? this.currentPosition / this.data.duration : 0;
  }

  /**
   * Get current tempo
   */
  public getTempo(): number {
    return this.currentTempo;
  }

  /**
   * Stop all active sources and events
   */
  public stopAll() {
    this.activeSources.forEach(set => {
      set.forEach(source => {
        try { source.stop(); } catch {}
      });
      set.clear();
    });
    this.activeSources.clear();
    
    this.activeEvents.forEach((eventId, rowId) => {
      this.eventBus.emit(
        this.node.id + '.' + rowId + '.' + eventId + '.sendNodeOff',
        { gate: 0, frequency: 0 }
      );
    });
    this.activeEvents.clear();
  }

  render() {
    // No-op for now
  }
}

export default VirtualOrchestratorNode;
