// Polyphony: a pool of voices (each an engine instance of the instrument flow).
// Overlapping notes ring simultaneously; when all voices are busy the oldest is
// stolen. Depends only on a minimal Voice interface so it's unit-testable.
//
// Scheduling: noteOn/noteOff accept `when` (AudioContext seconds). The audio events
// are forwarded to the voice immediately (the engine executes them sample-accurately
// at `when`); only the pool's OWN bookkeeping (which voice is free) is deferred via
// the optional `now` clock so a voice isn't considered free before its note ends.

export interface Voice {
  noteOn(payload: { frequency: number; velocity?: number; when?: number }): void;
  noteOff(payload?: Record<string, any>): void;
}

export class VoicePool {
  private active = new Map<number, Voice>(); // noteId -> voice
  private queue: number[] = [];              // noteIds in arrival order (for stealing)

  constructor(private voices: Voice[], private now?: () => number) {}

  /** Build a pool by creating + loading N voices. `now` (e.g. () => ctx.currentTime)
   *  lets scheduled noteOffs free their voice at the right moment. */
  static async create(make: () => Voice & { load?: () => Promise<void> }, n: number, now?: () => number): Promise<VoicePool> {
    const voices = Array.from({ length: Math.max(1, n) }, make);
    await Promise.all(voices.map((v) => v.load?.()));
    return new VoicePool(voices, now);
  }

  noteOn(noteId: number, frequency: number, velocity = 1, when?: number): void {
    // Same id retriggered before its previous occurrence was released (e.g. a
    // duplicate/reused id from corrupted or hand-merged project data — two distinct
    // notes sharing one id). Release the old voice first: otherwise `active.set`
    // below overwrites the map entry while that voice is still physically playing,
    // it silently drops out of the `busy` set, and a later noteOn treats it as free
    // and retriggers it — the original note orphaned, sounding for the rest of playback.
    const prev = this.active.get(noteId);
    if (prev) {
      prev.noteOff(when != null ? { when } : {});
      const i = this.queue.indexOf(noteId);
      if (i >= 0) this.queue.splice(i, 1);
    }
    const busy = new Set(this.active.values());
    let voice = this.voices.find((v) => !busy.has(v));
    // A duplicate/reused noteId (e.g. corrupted or hand-edited project data) can leave
    // a stale entry in `queue` that no longer maps to anything in `active` — skip those
    // rather than treat the pop as a real steal, so we never fall through to grabbing
    // voices[0] unconditionally (which would silently orphan whatever it's still playing).
    while (!voice && this.queue.length) {
      const stealId = this.queue.shift(); // oldest
      const stolen = stealId !== undefined ? this.active.get(stealId) : undefined;
      if (!stolen) continue; // stale queue entry, already freed — try the next
      stolen.noteOff(when != null ? { when } : {}); // cut the stolen note exactly when the new one starts
      this.active.delete(stealId!);
      voice = stolen;
    }
    if (!voice) voice = this.voices[0]; // pool exhausted and queue empty: last resort
    this.active.set(noteId, voice);
    this.queue.push(noteId);
    voice.noteOn(when != null ? { frequency, velocity, when } : { frequency, velocity });
  }

  noteOff(noteId: number, when?: number): void {
    const v = this.active.get(noteId);
    if (!v) return;
    v.noteOff(when != null ? { when } : {});   // engine schedules the release at `when`
    // Free the voice when the release actually begins (guarded: the same noteId may
    // retrigger next pattern loop and map to a new voice before this fires).
    const free = () => {
      if (this.active.get(noteId) === v) this.active.delete(noteId);
      const i = this.queue.indexOf(noteId);
      if (i >= 0) this.queue.splice(i, 1);
    };
    const delayMs = when != null && this.now ? (when - this.now()) * 1000 : 0;
    if (delayMs > 5) setTimeout(free, delayMs);
    else free();
  }

  private activeHas(voice: Voice): boolean {
    for (const v of this.active.values()) if (v === voice) return true;
    return false;
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

  /** Scheduled param set across all voices (automation). */
  setParamAt(nodeId: string, param: string, value: number, when: number): void {
    for (const v of this.voices) (v as any).setParamAt?.(nodeId, param, value, when);
  }
  /** Scheduled linear segment across all voices (timeline automation). */
  setParamSegment(nodeId: string, param: string, v0: number, t0: number, v1: number, t1: number): void {
    for (const v of this.voices) (v as any).setParamSegment?.(nodeId, param, v0, t0, v1, t1);
  }

  /** Post a raw message to a node in every voice's engine (e.g. .vstai samples). */
  postToNode(nodeId: string, msg: unknown): void {
    for (const v of this.voices) (v as any).postToNode?.(nodeId, msg);
  }

  get activeCount(): number { return this.active.size; }

  /** Release all notes and tear down every voice's engine (for flow reload). */
  dispose(): void {
    this.allOff();
    for (const v of this.voices) (v as any).dispose?.();
    this.voices = [];
  }
}
