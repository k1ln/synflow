import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';
import { MidiNote, MidiTempoChange, ParsedMidiFile } from '../nodes/MidiFileFlowNode';

export interface MidiFileVirtualData {
  midiFile?: ParsedMidiFile | null;
  currentBar: number;
  currentTick: number;
  isPlaying: boolean;
  loop: boolean;
  ticksPerClock?: number;  // How many MIDI ticks to advance per clock signal (0 = auto from PPQ)
  subdivision?: number;    // Clock subdivision: 1 = whole beat, 2 = half, 4 = quarter, etc.
  transpose?: number;      // Transpose notes by semitones (+12 = up one octave, -12 = down one octave)
  singleVoiceMode?: boolean; // Only one note at a time (monophonic)
}

export type MidiFileRuntimeNode = CustomNode & { data: MidiFileVirtualData } & { id: string };

/**
 * VirtualMidiFileNode handles MIDI file playback.
 * - Advances on clock input signals
 * - Emits receiveNodeOn when a MIDI note starts
 * - Emits receiveNodeOff when a MIDI note ends (via setTimeout after note duration)
 * - Can jump to any bar and reset
 * 
 * Clock behavior: Each clock tick advances by ticksPerBeat/subdivision MIDI ticks.
 * This means if subdivision=1, each clock = 1 beat. If subdivision=4, each clock = 1/4 beat (16th note).
 * All notes that fall within the advanced tick range are played at the right relative time.
 */
export class VirtualMidiFileNode extends VirtualNode<MidiFileRuntimeNode, undefined> {
  private midiFile: ParsedMidiFile | null = null;
  private currentTick: number = 0;
  private currentBar: number = 0;
  private loop: boolean = true;
  private ticksPerBar: number = 0;
  private isPlaying: boolean = false;
  private subdivision: number = 1;  // 1 = per beat, 4 = per 16th note, etc.
  private ticksPerClock: number = 0; // 0 = auto-calculate from PPQ and subdivision
  private transpose: number = 0;     // Transpose in semitones (+12 = up one octave)
  private singleVoiceMode: boolean = false; // Only one note at a time (monophonic)
  
  // Track currently playing note for single voice mode
  private currentPlayingNote: { note: number; frequency: number; channel: number } | null = null;
  
  // Track the last clock time for timing calculations
  private lastClockTime: number = 0;
  // Estimated ms per tick based on clock intervals
  private msPerTick: number = 0;
  
  // Track active note-off timeouts so we can cancel them on reset/jump
  private activeNoteOffTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  
  // All notes sorted by start tick for efficient lookup
  private sortedNotes: MidiNote[] = [];
  
  // Current position in sorted notes array
  private noteIndex: number = 0;
  
  // Tempo changes sorted by tick
  private tempoChanges: MidiTempoChange[] = [];
  // Current position in tempo changes array
  private tempoIndex: number = 0;
  
  // Handler references for cleanup
  private emitEventsForConnectedEdges: (
    node: MidiFileRuntimeNode,
    data: any,
    eventType: string
  ) => void;
  private emitForHandle: (
    node: MidiFileRuntimeNode,
    data: any,
    eventType: string,
    sourceHandle: string
  ) => void;

  constructor(
    eventBus: EventBus,
    node: MidiFileRuntimeNode,
    emitEventsForConnectedEdges: (
      node: MidiFileRuntimeNode,
      data: any,
      eventType: string
    ) => void,
    emitForHandle?: (
      node: MidiFileRuntimeNode,
      data: any,
      eventType: string,
      sourceHandle: string
    ) => void
  ) {
    super(undefined, undefined, eventBus, node);
    this.emitEventsForConnectedEdges = emitEventsForConnectedEdges;
    this.emitForHandle = emitForHandle || emitEventsForConnectedEdges;
    
    // Initialize from node data
    this.loadFromData(node.data);
    this.installSubscriptions();
  }

  private loadFromData(data: MidiFileVirtualData) {
    if (data.midiFile) {
      this.setMidiFile(data.midiFile);
    }
    this.currentBar = data.currentBar ?? 0;
    this.currentTick = data.currentTick ?? 0;
    this.loop = data.loop ?? true;
    this.isPlaying = data.isPlaying ?? false;
    this.subdivision = data.subdivision ?? 1;
    this.ticksPerClock = data.ticksPerClock ?? 0;
    this.transpose = data.transpose ?? 0;
    this.singleVoiceMode = data.singleVoiceMode ?? false;
    
    // Reset note index to match current position
    this.resetNoteIndex();
  }

  private setMidiFile(midiFile: ParsedMidiFile) {
    this.midiFile = midiFile;
    this.ticksPerBar = midiFile.ticksPerBeat * 4; // Assuming 4/4 time
    
    // Flatten all notes from all tracks and sort by start tick
    this.sortedNotes = [];
    for (const track of midiFile.tracks) {
      this.sortedNotes.push(...track.notes);
    }
    this.sortedNotes.sort((a, b) => a.startTick - b.startTick);
    
    // Debug: Log parsed notes
    console.log(`[MidiFile] Loaded ${this.sortedNotes.length} notes, ticksPerBeat=${midiFile.ticksPerBeat}`);
    if (this.sortedNotes.length > 0) {
      // Log first few notes to check duration
      const sample = this.sortedNotes.slice(0, 5);
      sample.forEach((n, i) => {
        console.log(`  Note[${i}]: note=${n.note}, startTick=${n.startTick}, durationTicks=${n.durationTicks}, velocity=${n.velocity}`);
      });
    }
    
    // Store tempo changes
    this.tempoChanges = midiFile.tempoChanges || [];
    this.tempoIndex = 0;
    
    // Reset playback state
    this.currentTick = 0;
    this.currentBar = 0;
    this.noteIndex = 0;
    // Cancel any pending note-offs
    this.activeNoteOffTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
    this.activeNoteOffTimeouts.clear();
  }

  private resetNoteIndex() {
    // Find the first note that starts at or after currentTick
    this.noteIndex = 0;
    for (let i = 0; i < this.sortedNotes.length; i++) {
      if (this.sortedNotes[i].startTick >= this.currentTick) {
        this.noteIndex = i;
        break;
      }
      if (i === this.sortedNotes.length - 1) {
        this.noteIndex = this.sortedNotes.length;
      }
    }
    
    // Find the last tempo change at or before currentTick
    this.tempoIndex = 0;
    for (let i = 0; i < this.tempoChanges.length; i++) {
      if (this.tempoChanges[i].tick <= this.currentTick) {
        this.tempoIndex = i + 1; // next one to check
      } else {
        break;
      }
    }
  }

  private installSubscriptions() {
    // Clock input - advance one tick
    this.eventBus.subscribe(
      `${this.node.id}.clock.receiveNodeOn`,
      () => this.onClockTick()
    );
    this.eventBus.subscribe(
      `${this.node.id}.clock.receivenodeOn`,
      () => this.onClockTick()
    );
    
    // Also accept main-input as clock (for backwards compatibility)
    this.eventBus.subscribe(
      `${this.node.id}.main-input.receiveNodeOn`,
      () => this.onClockTick()
    );
    this.eventBus.subscribe(
      `${this.node.id}.main-input.receivenodeOn`,
      () => this.onClockTick()
    );

    // Reset input
    this.eventBus.subscribe(
      `${this.node.id}.reset.receiveNodeOn`,
      () => this.reset()
    );
    this.eventBus.subscribe(
      `${this.node.id}.reset.receivenodeOn`,
      () => this.reset()
    );

    // Forward note-on events — only to edges wired from main-output
    this.eventBus.subscribe(
      `${this.node.id}.main-output.sendNodeOn`,
      (data: any) => {
        this.emitForHandle(this.node, data, 'receiveNodeOn', 'main-output');
      }
    );

    // Forward note-off events — only to edges wired from main-output
    this.eventBus.subscribe(
      `${this.node.id}.main-output.sendNodeOff`,
      (data: any) => {
        this.emitForHandle(this.node, data, 'receiveNodeOff', 'main-output');
      }
    );

    // Forward tempo events — only to edges wired from tempo-output
    this.eventBus.subscribe(
      `${this.node.id}.tempo-output.sendNodeOn`,
      (data: any) => {
        this.emitForHandle(this.node, data, 'receiveNodeOn', 'tempo-output');
      }
    );

    // Parameter updates from UI
    this.eventBus.subscribe(
      `${this.node.id}.params.updateParams`,
      (p: any) => this.handleParamUpdate(p)
    );
  }

  private handleParamUpdate(p: any) {
    const d = p?.data || p;
    if (!d) return;
    
    // Avoid feedback loops
    if (d.from === 'VirtualMidiFileNode') return;

    if (d.midiFile) {
      this.setMidiFile(d.midiFile);
    }

    if (typeof d.loop === 'boolean') {
      this.loop = d.loop;
    }

    if (typeof d.subdivision === 'number') {
      this.subdivision = Math.max(1, d.subdivision);
    }

    if (typeof d.ticksPerClock === 'number') {
      this.ticksPerClock = Math.max(0, d.ticksPerClock);
    }

    if (typeof d.transpose === 'number') {
      this.transpose = d.transpose;
    }

    if (typeof d.singleVoiceMode === 'boolean') {
      this.singleVoiceMode = d.singleVoiceMode;
      // If switching to single voice mode while notes are playing, turn them all off
      if (this.singleVoiceMode) {
        this.turnOffAllActiveNotes();
        this.currentPlayingNote = null;
      }
    }

    if (typeof d.jumpToBar === 'number') {
      this.jumpToBar(d.jumpToBar);
    }

    if (typeof d.currentBar === 'number' && typeof d.currentTick === 'number') {
      this.currentBar = d.currentBar;
      this.currentTick = d.currentTick;
      this.resetNoteIndex();
      // Turn off any currently playing notes when jumping
      this.turnOffAllActiveNotes();
    }
  }

  /**
   * Calculate how many MIDI ticks to advance per clock signal.
   * If ticksPerClock is set (>0), use that.
   * Otherwise, calculate from ticksPerBeat / subdivision.
   */
  private getTicksPerClock(): number {
    if (this.ticksPerClock > 0) {
      return this.ticksPerClock;
    }
    if (!this.midiFile) return 1;
    // Default: advance by ticksPerBeat / subdivision
    // subdivision=1 means 1 beat per clock, subdivision=4 means 1/4 beat (16th note) per clock
    return Math.floor(this.midiFile.ticksPerBeat / this.subdivision);
  }

  private onClockTick() {
    if (!this.midiFile) return;
    
    const wasPlaying = this.isPlaying;
    this.isPlaying = true;
    const now = performance.now();
    const clockInterval = this.lastClockTime > 0 ? now - this.lastClockTime : 0;
    this.lastClockTime = now;
    
    const ticksToAdvance = this.getTicksPerClock();
    const startTick = this.currentTick;
    const endTick = startTick + ticksToAdvance;
    
    // Calculate ms per tick based on clock interval
    // This determines note duration - faster clock = shorter notes
    if (clockInterval > 0 && ticksToAdvance > 0) {
      this.msPerTick = clockInterval / ticksToAdvance;
    }
    
    // Debug clock timing
    //console.log(`[Clock] interval=${clockInterval.toFixed(1)}ms, ticksToAdvance=${ticksToAdvance}, msPerTick=${this.msPerTick.toFixed(3)}, range=${startTick}-${endTick}`);
    
    // On the very first clock tick, emit the initial tempo so connected
    // clock nodes start at the right BPM immediately.
    if (!wasPlaying && this.tempoChanges.length > 0) {
      // Find the last tempo change at or before the current position
      let initialTempo = this.tempoChanges[0];
      for (let i = 1; i < this.tempoChanges.length; i++) {
        if (this.tempoChanges[i].tick <= startTick) {
          initialTempo = this.tempoChanges[i];
        } else {
          break;
        }
      }
      this.emitTempoChange(initialTempo);
    }
    
    // Process all note-ons in this tick range with proper timing
    // Note-offs are scheduled via setTimeout based on the note duration
    // Even on first tick (msPerTick=0), we should play notes with a default duration
    this.processNoteOnsInRange(startTick, endTick, clockInterval, ticksToAdvance);
    
    // Emit any tempo changes that fall within this tick range
    this.processTempoChangesInRange(startTick, endTick);
    
    // Advance the tick position
    this.currentTick = endTick;
    
    // Update bar number
    this.currentBar = Math.floor(this.currentTick / this.ticksPerBar);
    
    // Check for end of file
    if (this.currentTick >= this.midiFile.totalTicks) {
      if (this.loop) {
        // Reset to beginning
        this.reset();
      } else {
        this.isPlaying = false;
        this.turnOffAllActiveNotes();
      }
    }
    
    // Sync UI
    this.syncUI();
  }

  /**
   * Process all note-ons that fall within the tick range [startTick, endTick)
   * Schedule them with proper timing offsets based on their position within the range.
   * Note-offs are scheduled via setTimeout based on the note duration and current clock speed.
   */
  private processNoteOnsInRange(startTick: number, endTick: number, clockIntervalMs: number, ticksInRange: number) {
    if (!this.midiFile) return;
    // Note: We no longer skip when msPerTick is 0 - we use a default fallback instead
    
    // Process all notes that start within this range
    while (
      this.noteIndex < this.sortedNotes.length &&
      this.sortedNotes[this.noteIndex].startTick < endTick
    ) {
      const note = this.sortedNotes[this.noteIndex];
      
      // Only process notes that start at or after startTick
      if (note.startTick >= startTick) {
        // SANITY CHECK: Warn about zero or negative durations and fix them
        let noteDurationTicks = note.durationTicks;
        if (noteDurationTicks <= 0) {
          console.warn(`[WARNING] Note ${note.note} has invalid durationTicks=${noteDurationTicks}! Using minimum duration of 120 ticks.`);
          noteDurationTicks = 120; // Use a reasonable minimum duration (typically 1/8 note at 480 PPQ)
        }
        
        // Calculate the delay for this note-on based on its position in the tick range
        let noteOnDelayMs = 0;
        if (clockIntervalMs > 0 && ticksInRange > 0) {
          const tickOffset = note.startTick - startTick;
          noteOnDelayMs = (tickOffset / ticksInRange) * clockIntervalMs;
        }
        
        // Calculate note-off delay based on duration in ticks * ms per tick
        // This ties note duration directly to clock speed.
        // If msPerTick is not yet calculated (e.g. very first clock), derive a
        // sensible default from a nominal BPM (120) and the file's PPQ so the
        // first notes are not unrealistically short.
        let effectiveMsPerTick = this.msPerTick;
        if (effectiveMsPerTick <= 0) {
          const ticksPerBeat = this.midiFile?.ticksPerBeat || 480;
          const defaultBpm = 120; // 120 BPM as musical default
          const msPerBeat = 60000 / defaultBpm; // e.g. 500ms at 120 BPM
          effectiveMsPerTick = msPerBeat / ticksPerBeat; // ~1.04ms at 480 PPQ
        }
        const rawDurationMs = noteDurationTicks * effectiveMsPerTick;
        const durationMs = Math.max(50, rawDurationMs);
        
        // Detailed debug logging
        console.log(`[NoteOn] note=${note.note}, durationTicks=${noteDurationTicks}, msPerTick=${effectiveMsPerTick.toFixed(3)}, rawDurationMs=${rawDurationMs.toFixed(1)}, finalDurationMs=${durationMs.toFixed(1)}, noteOnDelay=${noteOnDelayMs.toFixed(1)}`);
        
        const key = `${note.channel}-${note.note}`;
        
        // If this note is already active, send an immediate NoteOff
        // before scheduling the new NoteOn. This guarantees that
        // synth/ADSR envelopes retrigger cleanly on repeated notes.
        if (this.activeNoteOffTimeouts.has(key)) {
          clearTimeout(this.activeNoteOffTimeouts.get(key)!);
          this.activeNoteOffTimeouts.delete(key);
          this.emitNoteOff(note.note, note.channel);
        }
        
        // Capture current duration for the scheduled note-off
        const capturedDurationMs = durationMs;
        
        // Schedule the note-on
        if (noteOnDelayMs > 0) {
          const capturedNote = note;
          setTimeout(() => {
            this.emitNoteOn(capturedNote);
            // Schedule note-off after the note duration
            this.scheduleNoteOff(capturedNote.note, capturedNote.channel, capturedDurationMs, key);
          }, noteOnDelayMs);
        } else {
          this.emitNoteOn(note);
          // Schedule note-off after the note duration
          this.scheduleNoteOff(note.note, note.channel, capturedDurationMs, key);
        }
      }
      
      this.noteIndex++;
    }
  }

  /**
   * Schedule a note-off event using setTimeout
   */
  private scheduleNoteOff(noteNumber: number, channel: number, delayMs: number, key: string) {
    // Ensure minimum delay of 10ms to avoid immediate off
    const actualDelay = Math.max(10, delayMs);
    const scheduledAt = performance.now();
    const expectedFireAt = scheduledAt + actualDelay;

    console.log(
      `[NoteOff scheduled] note=${noteNumber}, delay=${actualDelay.toFixed(1)}ms, ` +
      `scheduledAt=${scheduledAt.toFixed(1)}ms, expectedFireAt=${expectedFireAt.toFixed(1)}ms`
    );

    const timeoutId = setTimeout(() => {
      const firedAt = performance.now();
      const elapsed = firedAt - scheduledAt;
      console.log(
        `[NoteOff fired] note=${noteNumber}, firedAt=${firedAt.toFixed(1)}ms, ` +
        `elapsed=${elapsed.toFixed(1)}ms (requested=${actualDelay.toFixed(1)}ms)`
      );
      this.emitNoteOff(noteNumber, channel);
      this.activeNoteOffTimeouts.delete(key);
    }, actualDelay);
    
    this.activeNoteOffTimeouts.set(key, timeoutId);
  }

  private emitNoteOn(note: MidiNote) {
    // Apply transpose and convert MIDI note number to frequency
    const transposedNote = note.note + this.transpose;
    const frequency = 440 * Math.pow(2, (transposedNote - 69) / 12);
    const now = performance.now();
    
    console.log(
      `[emitNoteOn] t=${now.toFixed(1)}ms, note=${note.note}, transposed=${transposedNote}, ` +
      `velocity=${note.velocity}, frequency=${frequency.toFixed(2)}, singleVoiceMode=${this.singleVoiceMode}`
    );
    
    // In single voice mode, turn off the currently playing note before starting a new one
    if (this.singleVoiceMode && this.currentPlayingNote) {
      console.log(
        `[SingleVoice] Stopping current note ${this.currentPlayingNote.note} ` +
        `(freq=${this.currentPlayingNote.frequency.toFixed(2)}) before starting new note ${transposedNote}`
      );
      
      // Cancel any scheduled note-off for the current note
      const currentKey = `${this.currentPlayingNote.channel}-${this.currentPlayingNote.note - this.transpose}`;
      if (this.activeNoteOffTimeouts.has(currentKey)) {
        clearTimeout(this.activeNoteOffTimeouts.get(currentKey)!);
        this.activeNoteOffTimeouts.delete(currentKey);
      }
      
      // Emit immediate note-off for the current note
      this.emitNoteOff(this.currentPlayingNote.note - this.transpose, this.currentPlayingNote.channel);
      this.currentPlayingNote = null;
    }
    
    const payload = {
      note: transposedNote,
      originalNote: note.note,
      velocity: note.velocity,
      channel: note.channel,
      frequency: frequency,
      value: frequency,  // Also include as 'value' for compatibility with other nodes
      gate: 1,
      startTick: note.startTick,
      durationTicks: note.durationTicks
      // Note: sourceHandle omitted intentionally - emitEventsForConnectedEdges
      // will send to all connected edges from this node
    };
    
    // Update currently playing note for single voice mode
    if (this.singleVoiceMode) {
      this.currentPlayingNote = {
        note: transposedNote,
        frequency: frequency,
        channel: note.channel
      };
    }
    
    // Emit to main-output handle
    this.eventBus.emit(`${this.node.id}.main-output.sendNodeOn`, payload);
  }

  private emitNoteOff(noteNumber: number, channel: number) {
    // Apply transpose
    const transposedNote = noteNumber + this.transpose;
    const frequency = 440 * Math.pow(2, (transposedNote - 69) / 12);
    const now = performance.now();

    console.log(
      `[emitNoteOff] t=${now.toFixed(1)}ms, note=${noteNumber}, transposed=${transposedNote}, ` +
      `frequency=${frequency.toFixed(2)}, singleVoiceMode=${this.singleVoiceMode}`
    );
    
    // In single voice mode, only emit note-off if this is the currently playing note
    if (this.singleVoiceMode) {
      if (!this.currentPlayingNote || this.currentPlayingNote.note !== transposedNote) {
        console.log(
          `[SingleVoice] Skipping note-off for ${transposedNote} ` +
          `(current=${this.currentPlayingNote?.note ?? 'none'})`
        );
        return;
      }
      // Clear the current playing note
      this.currentPlayingNote = null;
    }
    
    const payload = {
      note: transposedNote,
      originalNote: noteNumber,
      channel: channel,
      frequency: frequency,
      value: frequency,  // Also include as 'value' for compatibility with other nodes
      gate: 0,
      velocity: 0
      // Note: sourceHandle omitted intentionally - emitEventsForConnectedEdges
      // will send to all connected edges from this node
    };
    
    // Emit to main-output handle (same output for both on and off)
    this.eventBus.emit(`${this.node.id}.main-output.sendNodeOff`, payload);
  }

  /**
   * Check for tempo changes in the tick range [startTick, endTick) and emit them.
   * Only the last tempo change in the range is emitted (if multiple fall within one clock tick).
   */
  private processTempoChangesInRange(startTick: number, endTick: number) {
    if (this.tempoChanges.length === 0) return;
    
    let lastTempoInRange: MidiTempoChange | null = null;
    
    while (
      this.tempoIndex < this.tempoChanges.length &&
      this.tempoChanges[this.tempoIndex].tick < endTick
    ) {
      const tc = this.tempoChanges[this.tempoIndex];
      if (tc.tick >= startTick) {
        lastTempoInRange = tc;
      }
      this.tempoIndex++;
    }
    
    if (lastTempoInRange) {
      this.emitTempoChange(lastTempoInRange);
    }
  }

  /**
   * Emit a tempo change event on the tempo-output handle.
   * The payload includes bpm and value (same number) so the receiving clock
   * node can read it from either field.
   */
  private emitTempoChange(tc: MidiTempoChange) {
    console.log(`[MidiFile] Tempo change at tick ${tc.tick}: ${tc.bpm} BPM`);
    const payload = {
      bpm: tc.bpm,
      value: tc.bpm,
      tick: tc.tick
    };
    this.eventBus.emit(`${this.node.id}.tempo-output.sendNodeOn`, payload);
  }

  private turnOffAllActiveNotes() {
    // Cancel all pending note-off timeouts
    this.activeNoteOffTimeouts.forEach((timeoutId, key) => {
      clearTimeout(timeoutId);
      // Extract note and channel from key (format: "channel-note")
      const [channelStr, noteStr] = key.split('-');
      const channel = parseInt(channelStr, 10);
      const note = parseInt(noteStr, 10);
      // Emit the note-off immediately
      this.emitNoteOff(note, channel);
    });
    this.activeNoteOffTimeouts.clear();
    this.currentPlayingNote = null;
  }

  private jumpToBar(bar: number) {
    if (!this.midiFile) return;
    
    // Turn off any currently playing notes
    this.turnOffAllActiveNotes();
    
    // Set new position
    const targetBar = Math.max(0, Math.min(bar, this.midiFile.totalBars - 1));
    this.currentBar = targetBar;
    this.currentTick = targetBar * this.ticksPerBar;
    
    // Reset note index to new position
    this.resetNoteIndex();
    
    this.syncUI();
  }

  private reset() {
    // Turn off any currently playing notes
    this.turnOffAllActiveNotes();
    
    // Reset to beginning
    this.currentTick = 0;
    this.currentBar = 0;
    this.noteIndex = 0;
    this.tempoIndex = 0;
    this.isPlaying = false;
    this.lastClockTime = 0;
    this.currentPlayingNote = null;
    
    this.syncUI();
  }

  private syncUI() {
    // Send update to UI node
    this.eventBus.emit(
      `FlowNode.${this.node.id}.params.updateParams`,
      {
        nodeid: this.node.id,
        data: {
          currentBar: this.currentBar,
          currentTick: this.currentTick,
          isPlaying: this.isPlaying,
          from: 'VirtualMidiFileNode'
        }
      }
    );
    
    // Also update node data directly
    if (this.node.data) {
      this.node.data.currentBar = this.currentBar;
      this.node.data.currentTick = this.currentTick;
      this.node.data.isPlaying = this.isPlaying;
    }
  }

  // Cleanup method
  public dispose() {
    this.turnOffAllActiveNotes();
    // Unsubscribe would go here if needed
  }
}

export default VirtualMidiFileNode;
