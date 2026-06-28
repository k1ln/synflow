import type { ClockSource } from './ClockSource';
import type { Transport } from './Transport';

/**
 * Lookahead step scheduler (the classic Web Audio pattern). On a coarse timer it
 * looks a little ahead of the audio clock and emits each step that falls inside
 * the window with its precise audio time; callers schedule sample/synth triggers
 * against that time. Works for any ClockSource (realtime or offline).
 */
export class Scheduler {
  lookahead = 0.12;     // seconds scheduled ahead of the clock
  intervalMs = 25;      // how often the lookahead runs
  totalSteps = 16;      // pattern length (steps); wraps (loops)
  // Optional loop window (steps). Active when loopEnd > loopStart: the cursor wraps
  // back to loopStart the moment it would reach loopEnd. 0/0 = disabled (full song).
  loopStart = 0;
  loopEnd = 0;

  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private step = 0;

  constructor(
    private clock: ClockSource,
    private transport: Transport,
    /** Called for each scheduled step. `time` is the clock time it should sound. */
    private onStep: (step: number, time: number) => void,
  ) {}

  start(fromStep = 0): void {
    this.step = ((fromStep % this.totalSteps) + this.totalSteps) % this.totalSteps;
    this.nextStepTime = this.clock.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  /** Jump the playback cursor to `step` while running (live seek). */
  seek(step: number): void {
    this.step = ((step % this.totalSteps) + this.totalSteps) % this.totalSteps;
    this.nextStepTime = this.clock.currentTime + 0.05;
  }

  stop(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
  }

  /** Advance the lookahead window; emit any steps now due within it. */
  tick(): void {
    const stepDur = this.transport.secondsPerStep;
    while (this.nextStepTime < this.clock.currentTime + this.lookahead) {
      this.onStep(this.step, this.nextStepTime);
      this.nextStepTime += stepDur;
      let next = this.step + 1;
      // Loop the region only when crossing loopEnd exactly, so seeking outside the
      // window (e.g. a marker jump) isn't yanked back — it just plays on.
      if (this.loopEnd > this.loopStart && next === this.loopEnd) next = this.loopStart;
      this.step = next % Math.max(1, this.totalSteps);
    }
  }
}
