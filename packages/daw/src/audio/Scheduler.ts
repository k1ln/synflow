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

  private timer: ReturnType<typeof setInterval> | null = null;
  private nextStepTime = 0;
  private step = 0;

  constructor(
    private clock: ClockSource,
    private transport: Transport,
    /** Called for each scheduled step. `time` is the clock time it should sound. */
    private onStep: (step: number, time: number) => void,
  ) {}

  start(): void {
    this.step = 0;
    this.nextStepTime = this.clock.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
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
      this.step = (this.step + 1) % this.totalSteps;
    }
  }
}
