import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';
import { MidiNote, ParsedMidiFile } from '../nodes/MidiFileFlowNode';

export interface MidiFileVirtualData {
  midiFile?: ParsedMidiFile | null;
  currentBar: number;
  currentTick: number;
  isPlaying: boolean;
  loop: boolean;
  ticksPerClock?: number;  // How many MIDI ticks to advance per clock signal (0 = auto from PPQ)
  subdivision?: number;    // Clock subdivision: 1 = whole beat, 2 = half, 4 = quarter, etc.
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
  
  // Handler references for cleanup
  private emitEventsForConnectedEdges: (
    node: MidiFileRuntimeNode,
    data: any,
    eventType: string
  ) => void;

  constructor(
    eventBus: EventBus,
    node: MidiFileRuntimeNode,
    emitEventsForConnectedEdges: (
      node: MidiFileRuntimeNode,
      data: any,
      eventType: string
    ) => void
  ) {
    super(undefined, undefined, eventBus, node);
    this.emitEventsForConnectedEdges = emitEventsForConnectedEdges;
    
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
        return;
      }
    }
    this.noteIndex = this.sortedNotes.length;
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

    // Forward note-on events to connected edges (main-output handle)
    this.eventBus.subscribe(
      `${this.node.id}.main-output.sendNodeOn`,
      (data: any) => {
        this.emitEventsForConnectedEdges(this.node, data, 'receiveNodeOn');
      }
    );

    // Forward note-off events to connected edges (main-output handle)
    this.eventBus.subscribe(
      `${this.node.id}.main-output.sendNodeOff`,
      (data: any) => {
        this.emitEventsForConnectedEdges(this.node, data, 'receiveNodeOff');
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
    console.log(`[Clock] interval=${clockInterval.toFixed(1)}ms, ticksToAdvance=${ticksToAdvance}, msPerTick=${this.msPerTick.toFixed(3)}, range=${startTick}-${endTick}`);
    
    // Only process notes if we have a valid msPerTick (need at least one clock interval)
    // This ensures note durations are always clock-dependent
    if (this.msPerTick > 0) {
      // Process all note-ons in this tick range with proper timing
      // Note-offs are scheduled via setTimeout based on the note duration
      this.processNoteOnsInRange(startTick, endTick, clockInterval, ticksToAdvance);
    }
    
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
    if (this.msPerTick <= 0) return; // Can't calculate durations without clock timing
    
    // Process all notes that start within this range
    while (
      this.noteIndex < this.sortedNotes.length &&
      this.sortedNotes[this.noteIndex].startTick < endTick
    ) {
      const note = this.sortedNotes[this.noteIndex];
      
      // Only process notes that start at or after startTick
      if (note.startTick >= startTick) {
        // SANITY CHECK: Warn about zero or negative durations
        if (note.durationTicks <= 0) {
          console.warn(`[WARNING] Note ${note.note} has invalid durationTicks=${note.durationTicks}! This note will be skipped.`);
          this.noteIndex++;
          continue;
        }
        
        // Calculate the delay for this note-on based on its position in the tick range
        let noteOnDelayMs = 0;
        if (clockIntervalMs > 0 && ticksInRange > 0) {
          const tickOffset = note.startTick - startTick;
          noteOnDelayMs = (tickOffset / ticksInRange) * clockIntervalMs;
        }
        
        // Calculate note-off delay based on duration in ticks * ms per tick
        // This ties note duration directly to clock speed
        // Ensure minimum duration of 50ms to prevent immediate note-off
        const rawDurationMs = note.durationTicks * this.msPerTick;
        const durationMs = Math.max(50, rawDurationMs);
        
        // Detailed debug logging
        console.log(`[NoteOn] note=${note.note}, durationTicks=${note.durationTicks}, msPerTick=${this.msPerTick.toFixed(3)}, rawDurationMs=${rawDurationMs.toFixed(1)}, finalDurationMs=${durationMs.toFixed(1)}, noteOnDelay=${noteOnDelayMs.toFixed(1)}`);
        
        const key = `${note.channel}-${note.note}`;
        
        // Cancel any existing timeout for this note (in case of overlapping notes)
        if (this.activeNoteOffTimeouts.has(key)) {
          clearTimeout(this.activeNoteOffTimeouts.get(key)!);
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
    
    console.log(`[NoteOff scheduled] note=${noteNumber}, delay=${actualDelay.toFixed(1)}ms`);
    
    const timeoutId = setTimeout(() => {
      console.log(`[NoteOff fired] note=${noteNumber}`);
      this.emitNoteOff(noteNumber, channel);
      this.activeNoteOffTimeouts.delete(key);
    }, actualDelay);
    
    this.activeNoteOffTimeouts.set(key, timeoutId);
  }

  private emitNoteOn(note: MidiNote) {
    // Convert MIDI note number to frequency
    const frequency = 440 * Math.pow(2, (note.note - 69) / 12);
    
    console.log(`[emitNoteOn] note=${note.note}, velocity=${note.velocity}, frequency=${frequency.toFixed(2)}`);
    
    const payload = {
      note: note.note,
      velocity: note.velocity,
      channel: note.channel,
      frequency: frequency,
      value: frequency,  // Also include as 'value' for compatibility with other nodes
      gate: 1,
      startTick: note.startTick,
      durationTicks: note.durationTicks,
      sourceHandle: 'main-output'  // Important for edge routing
    };
    
    // Emit to main-output handle
    this.eventBus.emit(`${this.node.id}.main-output.sendNodeOn`, payload);
  }

  private emitNoteOff(noteNumber: number, channel: number) {
    const frequency = 440 * Math.pow(2, (noteNumber - 69) / 12);
    
    console.log(`[emitNoteOff] note=${noteNumber}, frequency=${frequency.toFixed(2)}`);
    
    const payload = {
      note: noteNumber,
      channel: channel,
      frequency: frequency,
      value: frequency,  // Also include as 'value' for compatibility with other nodes
      gate: 0,
      velocity: 0,
      sourceHandle: 'main-output'  // Important for edge routing
    };
    
    // Emit to main-output handle (same output for both on and off)
    this.eventBus.emit(`${this.node.id}.main-output.sendNodeOff`, payload);
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
    this.isPlaying = false;
    this.lastClockTime = 0;
    
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
