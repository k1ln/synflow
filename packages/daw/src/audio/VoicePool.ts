// Polyphony: a pool of voices (each an engine instance of the instrument flow).
// Overlapping notes ring simultaneously; when all voices are busy the oldest is
// stolen. Depends only on a minimal Voice interface so it's unit-testable.

export interface Voice {
  noteOn(payload: { frequency: number; velocity?: number }): void;
  noteOff(payload?: Record<string, any>): void;
}

export class VoicePool {
  private active = new Map<number, Voice>(); // noteId -> voice
  private queue: number[] = [];              // noteIds in arrival order (for stealing)

  constructor(private voices: Voice[]) {}

  /** Build a pool by creating + loading N voices. */
  static async create(make: () => Voice & { load?: () => Promise<void> }, n: number): Promise<VoicePool> {
    const voices = Array.from({ length: Math.max(1, n) }, make);
    await Promise.all(voices.map((v) => v.load?.()));
    return new VoicePool(voices);
  }

  noteOn(noteId: number, frequency: number, velocity = 1): void {
    let voice = this.voices.find((v) => ![...this.active.values()].includes(v));
    if (!voice) {
      const stealId = this.queue.shift(); // oldest
      if (stealId !== undefined) { this.active.get(stealId)?.noteOff(); this.active.delete(stealId); }
      voice = this.voices.find((v) => ![...this.active.values()].includes(v)) ?? this.voices[0];
    }
    this.active.set(noteId, voice);
    this.queue.push(noteId);
    voice.noteOn({ frequency, velocity });
  }

  noteOff(noteId: number): void {
    const v = this.active.get(noteId);
    if (v) { v.noteOff(); this.active.delete(noteId); }
    const i = this.queue.indexOf(noteId);
    if (i >= 0) this.queue.splice(i, 1);
  }

  allOff(): void {
    for (const v of this.active.values()) v.noteOff();
    this.active.clear();
    this.queue = [];
  }

  /** Automate a param across all voices (control-rate). */
  setParam(nodeId: string, param: string, value: number | string): void {
    for (const v of this.voices) (v as any).setParam?.(nodeId, param, value);
  }

  get activeCount(): number { return this.active.size; }

  /** Release all notes and tear down every voice's engine (for flow reload). */
  dispose(): void {
    this.allOff();
    for (const v of this.voices) (v as any).dispose?.();
    this.voices = [];
  }
}
