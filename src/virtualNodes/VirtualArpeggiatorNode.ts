import VirtualNode from "./VirtualNode";
import EventBus from "../sys/EventBus";
import { CustomNode } from "../sys/AudioGraphManager";

export type ArpeggiatorMode =
  | "up"
  | "down"
  | "up-down"
  | "down-up"
  | "chord"
  | "chord-major-up"
  | "chord-major-down"
  | "chord-minor-up"
  | "chord-minor-down"
  | "random"
  | "random-walk"
  | "up-down-incl"
  | "down-up-incl"
  | "converge"
  | "diverge"
  | "shuffle";

export interface ArpeggiatorNodeData {
  noteCount?: number; // 1-24
  mode?: ArpeggiatorMode;
  baseFrequency?: number;
  octaveSpread?: number; // How many octaves to spread notes across (default 1)
  currentStep?: number;
  swing?: number; // 0-1, adds groove by delaying every second note
}

export type ArpeggiatorRuntimeNode = CustomNode & {
  data: ArpeggiatorNodeData;
} & { id: string };

/**
 * VirtualArpeggiatorNode receives:
 * - Clock pulses on 'clock-input' handle (triggers next step)
 * - Frequency values on 'freq-input' handle (sets base frequency)
 * 
 * Outputs the arpeggiated frequency on each clock pulse.
 */
export class VirtualArpeggiatorNode extends VirtualNode<
  ArpeggiatorRuntimeNode,
  undefined
> {
  private noteCount: number = 4;
  private mode: ArpeggiatorMode = "up";
  private baseFrequency: number = 440; // A4
  private octaveSpread: number = 1;
  private currentStep: number = 0;
  private direction: number = 1; // For ping-pong modes: 1 = up, -1 = down
  private lastBpm: number = 120;
  private swing: number = 0; // 0-1, swing amount
  private stepCounter: number = 0; // Counts steps for swing
  private shuffleBag: number[] = []; // For shuffle mode

  constructor(
    audioContext: AudioContext | undefined,
    eventBus: EventBus,
    node: ArpeggiatorRuntimeNode
  ) {
    super(audioContext, undefined, eventBus, node);
    
    this.noteCount = Math.max(1, Math.min(24, node.data?.noteCount ?? 4));
    this.mode = node.data?.mode ?? "up";
    this.baseFrequency = node.data?.baseFrequency ?? 440;
    this.octaveSpread = node.data?.octaveSpread ?? 1;
    this.currentStep = node.data?.currentStep ?? 0;
    this.swing = Math.max(0, Math.min(1, node.data?.swing ?? 0));

    this.installSubscriptions();
  }

  private installSubscriptions() {
    // Clock input - advances the arpeggiator
    this.eventBus.subscribe(
      `${this.node.id}.clock-input.receiveNodeOn`,
      (data: any) => this.handleClockPulse(data)
    );

    // Frequency input - sets the base frequency for arpeggiation
    this.eventBus.subscribe(
      `${this.node.id}.freq-input.receiveNodeOn`,
      (data: any) => this.handleFrequencyInput(data)
    );

    // Reset input - resets the arpeggiator to step 0
    this.eventBus.subscribe(
      `${this.node.id}.reset-input.receiveNodeOn`,
      () => this.reset()
    );

    // Parameter updates from UI
    this.eventBus.subscribe(
      `${this.node.id}.params.updateParams`,
      (data: any) => this.handleUpdateParams(data)
    );
  }

  private handleClockPulse(data: any) {
    // Extract BPM and interval if present
    if (typeof data?.bpm === 'number') {
      this.lastBpm = data.bpm;
    }
    let intervalMs = data?.intervalMs || (60 / this.lastBpm) * 1000;

    // Apply swing: delay every second note
    if (this.swing > 0 && this.stepCounter % 2 === 1) {
      intervalMs = intervalMs * (1 + this.swing * 0.5); // Add up to 50% delay
    }
    this.stepCounter++;

    // Check if this is a chord mode
    const isChordMode = this.mode.startsWith('chord');
    
    if (isChordMode) {
      // Get chord frequencies
      const chordFreqs = this.getChordFrequencies();
      
      if (this.mode === 'chord') {
        // Original chord mode: emit all notes at once
        chordFreqs.forEach((freq, index) => {
          this.eventBus.emit(`${this.node.id}.main-output.sendNodeOn`, {
            frequency: freq,
            value: freq,
            step: index,
            bpm: this.lastBpm,
            nodeId: this.node.id
          });
        });
      } else {
        // New chord modes: play notes sequentially
        const stepDuration = intervalMs / chordFreqs.length;
        
        chordFreqs.forEach((freq, i) => {
          const delay = i * stepDuration;
          setTimeout(() => {
            this.eventBus.emit(`${this.node.id}.main-output.sendNodeOn`, {
              frequency: freq,
              value: freq,
              step: i,
              bpm: this.lastBpm,
              nodeId: this.node.id
            });
          }, delay);
        });
      }
    } else {
      // Calculate all frequencies in the arpeggio
      const frequencies = this.calculateArpeggioNotes();
      
      // Subdivide the beat interval by the number of notes
      const stepDuration = intervalMs / this.noteCount;
      
      // Get the sequence of notes based on the mode
      const sequence = this.getSequence();
      
      // Schedule each note in the sequence
      sequence.forEach((stepIndex, i) => {
        const delay = i * stepDuration;
        setTimeout(() => {
          const outputFrequency = frequencies[stepIndex];
          this.eventBus.emit(`${this.node.id}.main-output.sendNodeOn`, {
            frequency: outputFrequency,
            value: outputFrequency,
            step: stepIndex,
            bpm: this.lastBpm,
            nodeId: this.node.id
          });
        }, delay);
      });
      
      // Update current step to the last note in the sequence
      this.currentStep = sequence[sequence.length - 1];
    }

    // Sync state
    this.sync();
  }

  private handleFrequencyInput(data: any) {
    // Accept frequency from various possible field names
    const incomingFreq = data?.frequency ?? data?.value ?? data?.freq;
    
    if (typeof incomingFreq === 'number' && incomingFreq > 0) {
      this.baseFrequency = incomingFreq;
      this.sync();
    }
  }

  handleUpdateParams(data: any) {
    const params = data?.data || data;
    if (!params) return;

    let changed = false;

    if (typeof params.noteCount === 'number') {
      const newCount = Math.max(1, Math.min(24, params.noteCount));
      if (newCount !== this.noteCount) {
        this.noteCount = newCount;
        changed = true;
      }
    }

    if (typeof params.mode === 'string') {
      if (params.mode !== this.mode) {
        this.mode = params.mode as ArpeggiatorMode;
        this.direction = 1; // Reset direction for ping-pong modes
        changed = true;
      }
    }

    if (typeof params.baseFrequency === 'number' && params.baseFrequency > 0) {
      if (params.baseFrequency !== this.baseFrequency) {
        this.baseFrequency = params.baseFrequency;
        changed = true;
      }
    }

    if (typeof params.octaveSpread === 'number') {
      const newSpread = Math.max(0.25, Math.min(4, params.octaveSpread));
      if (newSpread !== this.octaveSpread) {
        this.octaveSpread = newSpread;
        changed = true;
      }
    }

    if (typeof params.swing === 'number') {
      const newSwing = Math.max(0, Math.min(1, params.swing));
      if (newSwing !== this.swing) {
        this.swing = newSwing;
        changed = true;
      }
    }

    if (changed) {
      this.sync();
    }
  }

  private reset() {
    this.currentStep = 0;
    this.direction = 1;
    this.stepCounter = 0;
    this.shuffleBag = [];
    this.sync();
  }

  /**
   * Get chord frequencies based on the current mode
   */
  private getChordFrequencies(): number[] {
    let intervals: number[] = [];
    
    switch (this.mode) {
      case 'chord':
        // Original chord mode - just use the base frequency
        return [this.baseFrequency];
        
      case 'chord-major-up':
        // Major chord ascending: root, major third, perfect fifth
        intervals = [0, 4, 7];
        break;
        
      case 'chord-major-down':
        // Major chord descending: perfect fifth, major third, root
        intervals = [7, 4, 0];
        break;
        
      case 'chord-minor-up':
        // Minor chord ascending: root, minor third, perfect fifth
        intervals = [0, 3, 7];
        break;
        
      case 'chord-minor-down':
        // Minor chord descending: perfect fifth, minor third, root
        intervals = [7, 3, 0];
        break;
        
      default:
        intervals = [0];
    }
    
    // Calculate frequencies from semitone intervals
    return intervals.map(semitones => 
      this.baseFrequency * Math.pow(2, semitones / 12)
    );
  }

  /**
   * Calculate all notes in the arpeggio based on current settings
   */
  private calculateArpeggioNotes(): number[] {
    const notes: number[] = [];
    const semitoneStep = (12 * this.octaveSpread) / Math.max(1, this.noteCount - 1);

    for (let i = 0; i < this.noteCount; i++) {
      // Calculate frequency by semitone intervals
      const semitones = i * semitoneStep;
      const freq = this.baseFrequency * Math.pow(2, semitones / 12);
      notes.push(freq);
    }

    return notes;
  }

  /**
   * Get the full sequence of note indices for the current mode
   */
  private getSequence(): number[] {
    const sequence: number[] = [];
    const maxIndex = this.noteCount - 1;

    switch (this.mode) {
      case 'up':
        for (let i = 0; i < this.noteCount; i++) {
          sequence.push(i);
        }
        break;

      case 'down':
        for (let i = maxIndex; i >= 0; i--) {
          sequence.push(i);
        }
        break;

      case 'up-down':
        // Up without repeating top
        for (let i = 0; i < this.noteCount; i++) {
          sequence.push(i);
        }
        // Down without repeating top and bottom
        for (let i = maxIndex - 1; i > 0; i--) {
          sequence.push(i);
        }
        break;

      case 'up-down-incl':
        // Up including top
        for (let i = 0; i < this.noteCount; i++) {
          sequence.push(i);
        }
        // Down including top and bottom
        for (let i = maxIndex; i >= 0; i--) {
          sequence.push(i);
        }
        break;

      case 'down-up':
        // Down without repeating bottom
        for (let i = maxIndex; i >= 0; i--) {
          sequence.push(i);
        }
        // Up without repeating bottom and top
        for (let i = 1; i < maxIndex; i++) {
          sequence.push(i);
        }
        break;

      case 'down-up-incl':
        // Down including bottom
        for (let i = maxIndex; i >= 0; i--) {
          sequence.push(i);
        }
        // Up including bottom and top
        for (let i = 0; i < this.noteCount; i++) {
          sequence.push(i);
        }
        break;

      case 'random':
        for (let i = 0; i < this.noteCount; i++) {
          sequence.push(Math.floor(Math.random() * this.noteCount));
        }
        break;

      case 'random-walk':
        let current = this.currentStep;
        for (let i = 0; i < this.noteCount; i++) {
          sequence.push(current);
          const change = Math.random() > 0.5 ? 1 : -1;
          current += change;
          if (current > maxIndex) current = maxIndex;
          if (current < 0) current = 0;
        }
        break;

      case 'converge':
        // Plays outer notes first, then moves inward
        // e.g., for 4 notes: 0, 3, 1, 2
        {
          let low = 0;
          let high = maxIndex;
          while (low <= high) {
            sequence.push(low);
            if (low !== high) {
              sequence.push(high);
            }
            low++;
            high--;
          }
        }
        break;

      case 'diverge':
        // Plays inner notes first, then moves outward
        // e.g., for 4 notes (0,1,2,3): 1, 2, 0, 3 or for odd: middle, then out
        {
          const mid = Math.floor(maxIndex / 2);
          const visited = new Set<number>();
          let offset = 0;
          
          while (visited.size < this.noteCount) {
            const low = mid - offset;
            const high = mid + offset + (maxIndex % 2 === 0 ? 1 : 0);
            
            if (low >= 0 && !visited.has(low)) {
              sequence.push(low);
              visited.add(low);
            }
            if (high <= maxIndex && !visited.has(high) && high !== low) {
              sequence.push(high);
              visited.add(high);
            }
            offset++;
          }
        }
        break;

      case 'shuffle':
        // Plays all notes once in random order, then reshuffles
        // Refill bag when empty
        if (this.shuffleBag.length === 0) {
          for (let i = 0; i < this.noteCount; i++) {
            this.shuffleBag.push(i);
          }
          // Fisher-Yates shuffle
          for (let i = this.shuffleBag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.shuffleBag[i], this.shuffleBag[j]] = [this.shuffleBag[j], this.shuffleBag[i]];
          }
        }
        // For sequence generation, return the full current shuffle bag
        sequence.push(...this.shuffleBag);
        break;

      default:
        // Default to up
        for (let i = 0; i < this.noteCount; i++) {
          sequence.push(i);
        }
    }

    return sequence;
  }

  /**
   * Get the next step index based on the current mode
   */
  private getNextStepIndex(): number {
    const maxIndex = this.noteCount - 1;

    switch (this.mode) {
      case 'up':
        this.currentStep = (this.currentStep + 1) % this.noteCount;
        return this.currentStep;

      case 'down':
        this.currentStep = this.currentStep - 1;
        if (this.currentStep < 0) this.currentStep = maxIndex;
        return this.currentStep;

      case 'up-down': // Ping-pong without repeating end notes
        if (this.direction === 1) {
          this.currentStep++;
          if (this.currentStep >= maxIndex) {
            this.currentStep = maxIndex;
            this.direction = -1;
          }
        } else {
          this.currentStep--;
          if (this.currentStep <= 0) {
            this.currentStep = 0;
            this.direction = 1;
          }
        }
        return this.currentStep;

      case 'up-down-incl': // Ping-pong with repeating end notes
        this.currentStep += this.direction;
        if (this.currentStep > maxIndex) {
          this.currentStep = maxIndex - 1;
          this.direction = -1;
        } else if (this.currentStep < 0) {
          this.currentStep = 1;
          this.direction = 1;
        }
        return this.currentStep;

      case 'down-up':
        if (this.direction === -1) {
          this.currentStep--;
          if (this.currentStep <= 0) {
            this.currentStep = 0;
            this.direction = 1;
          }
        } else {
          this.currentStep++;
          if (this.currentStep >= maxIndex) {
            this.currentStep = maxIndex;
            this.direction = -1;
          }
        }
        return this.currentStep;

      case 'down-up-incl':
        this.currentStep += this.direction;
        if (this.currentStep < 0) {
          this.currentStep = 1;
          this.direction = 1;
        } else if (this.currentStep > maxIndex) {
          this.currentStep = maxIndex - 1;
          this.direction = -1;
        }
        return this.currentStep;

      case 'random':
        this.currentStep = Math.floor(Math.random() * this.noteCount);
        return this.currentStep;

      case 'random-walk': // Random walk - move up or down by 1 step randomly
        const change = Math.random() > 0.5 ? 1 : -1;
        this.currentStep += change;
        if (this.currentStep > maxIndex) this.currentStep = maxIndex;
        if (this.currentStep < 0) this.currentStep = 0;
        return this.currentStep;

      case 'converge': {
        // Alternate between low and high, moving inward
        const sequence = this.getSequence();
        const seqIndex = this.currentStep % sequence.length;
        this.currentStep++;
        return sequence[seqIndex];
      }

      case 'diverge': {
        // Follow the diverge sequence
        const sequence = this.getSequence();
        const seqIndex = this.currentStep % sequence.length;
        this.currentStep++;
        return sequence[seqIndex];
      }

      case 'shuffle': {
        // Pull next note from shuffle bag, refill when empty
        if (this.shuffleBag.length === 0) {
          for (let i = 0; i < this.noteCount; i++) {
            this.shuffleBag.push(i);
          }
          // Fisher-Yates shuffle
          for (let i = this.shuffleBag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.shuffleBag[i], this.shuffleBag[j]] = [this.shuffleBag[j], this.shuffleBag[i]];
          }
        }
        const note = this.shuffleBag.shift()!;
        this.currentStep = note;
        return note;
      }

      case 'chord':
        // In chord mode, cycle through all notes (or we could emit all at once)
        this.currentStep = (this.currentStep + 1) % this.noteCount;
        return this.currentStep;

      default:
        return this.currentStep;
    }
  }

  private sync() {
    if (this.node.data) {
      this.node.data.noteCount = this.noteCount;
      this.node.data.mode = this.mode;
      this.node.data.baseFrequency = this.baseFrequency;
      this.node.data.octaveSpread = this.octaveSpread;
      this.node.data.currentStep = this.currentStep;
      this.node.data.swing = this.swing;
    }

    // Notify UI of state changes
    this.eventBus.emit('params.updateParams', {
      nodeid: this.node.id,
      data: {
        noteCount: this.noteCount,
        mode: this.mode,
        baseFrequency: this.baseFrequency,
        octaveSpread: this.octaveSpread,
        currentStep: this.currentStep,
        swing: this.swing,
        from: 'VirtualArpeggiatorNode'
      }
    });
  }

  public dispose() {
    // Clean up subscriptions
    this.eventBus.unsubscribeAll(`${this.node.id}.clock-input.receiveNodeOn`);
    this.eventBus.unsubscribeAll(`${this.node.id}.freq-input.receiveNodeOn`);
    this.eventBus.unsubscribeAll(`${this.node.id}.reset-input.receiveNodeOn`);
    this.eventBus.unsubscribeAll(`${this.node.id}.params.updateParams`);
  }
}

export default VirtualArpeggiatorNode;
