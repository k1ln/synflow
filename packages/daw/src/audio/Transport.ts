import type { ClockSource } from './ClockSource';

/** Audio-clock master: tempo, time signature, play/stop, and beat<->time math. */
export class Transport {
  bpm = 120;
  timeSigNum = 4;
  timeSigDen = 4;
  stepsPerBeat = 4;          // 16th-note grid (FL default)
  isPlaying = false;
  private startedAt = 0;     // clock time at which position 0 began

  constructor(private clock: ClockSource) {}

  get secondsPerBeat(): number { return 60 / this.bpm; }
  get secondsPerStep(): number { return this.secondsPerBeat / this.stepsPerBeat; }

  start(): void {
    this.startedAt = this.clock.currentTime + 0.05; // small lead-in
    this.isPlaying = true;
  }
  stop(): void { this.isPlaying = false; }

  /** Playback position in seconds since start (clamped at >= 0). */
  get positionSeconds(): number {
    return Math.max(0, this.clock.currentTime - this.startedAt);
  }
  get positionBeats(): number { return this.positionSeconds / this.secondsPerBeat; }

  /** Clock time at which a given absolute step index occurs. */
  timeOfStep(step: number): number {
    return this.startedAt + step * this.secondsPerStep;
  }
}
