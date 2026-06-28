// Abstracts the audio clock so the same Transport/Scheduler drive both realtime
// playback (AudioContext) and faster-than-realtime bounce (OfflineAudioContext).
export interface ClockSource {
  readonly currentTime: number;
  readonly sampleRate: number;
}

export class RealtimeClock implements ClockSource {
  constructor(private ctx: BaseAudioContext) {}
  get currentTime(): number { return this.ctx.currentTime; }
  get sampleRate(): number { return this.ctx.sampleRate; }
}
