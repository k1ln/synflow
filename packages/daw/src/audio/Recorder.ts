// Mic recording via MediaRecorder. start() opens the mic and records; stop()
// returns the captured bytes + MIME (decoded elsewhere into an AudioAsset).
export class Recorder {
  private mr: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  recording = false;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const pref = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t));
    this.mr = new MediaRecorder(this.stream, pref ? { mimeType: pref } : undefined);
    this.chunks = [];
    this.mr.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.mr.start();
    this.recording = true;
  }

  /** Stop recording; resolves the captured audio bytes (null if not recording). */
  async stop(): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
    const mr = this.mr; if (!mr) return null;
    return new Promise((resolve) => {
      mr.onstop = async () => {
        const mime = (mr.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(this.chunks, { type: mime });
        this.cleanup();
        resolve({ bytes: await blob.arrayBuffer(), mime });
      };
      this.recording = false;
      mr.stop();
    });
  }

  cancel(): void { try { this.mr?.stop(); } catch { /* noop */ } this.cleanup(); }

  private cleanup(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null; this.mr = null; this.chunks = [];
  }
}
