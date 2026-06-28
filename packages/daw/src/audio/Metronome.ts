/** A simple synthesized click track. Each click is a short pitched blip with a
 *  fast decay; the bar downbeat is higher + louder than the other beats. Routed
 *  straight to the context destination so it never passes through (or is muted
 *  by) the mixer. Schedule clicks at precise audio times from the step scheduler. */
export class Metronome {
  private gain: GainNode;
  enabled = false;
  level = 0.5;

  constructor(private ctx: BaseAudioContext, destination?: AudioNode) {
    this.gain = ctx.createGain();
    this.gain.gain.value = this.level;
    this.gain.connect(destination ?? ctx.destination);
  }

  setLevel(v: number): void { this.level = Math.max(0, Math.min(1, v)); this.gain.gain.value = this.level; }

  /** Schedule one click at clock time `when`. `accent` = bar downbeat. */
  click(when: number, accent: boolean): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 2000 : 1500;
    const peak = accent ? 0.9 : 0.5;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peak, when + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    osc.connect(env).connect(this.gain);
    osc.start(when);
    osc.stop(when + 0.05);
    osc.onended = () => { try { osc.disconnect(); env.disconnect(); } catch { /* noop */ } };
  }

  dispose(): void { try { this.gain.disconnect(); } catch { /* noop */ } }
}
