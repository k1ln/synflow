import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';
// Static imports (requested): use direct imports instead of dynamic import/then chains
import { uploadAudio } from '../services/apiClient';
import { loadRootHandle, writeAudioBlob } from '../util/FileSystemAudioStore';

interface RecordingData {
  label?: string;
  isRecording?: boolean;
  holdMode?: boolean;
}

// Virtual node that taps audio input, passes it through, and records PCM frames via AudioWorklet.
// On stop, emits a blob-ready event to be persisted by front-end (IndexedDB or uploaded).
export class VirtualRecordingNode extends VirtualNode<CustomNode & { data: RecordingData }, GainNode> {
  private workletNode?: AudioWorkletNode;
  private frames: Float32Array[] = [];
  private recording = false;
  private startTime = 0;
  private passthroughGain: GainNode; // we re-create & assign to audioNode
  private sampleRate: number;
  private maxBytes: number; // soft cap for final WAV (default ~25MB)
  private maxSeconds: number; // optional duration guard

  constructor(ctx: AudioContext, eventBus: EventBus, node: CustomNode & { data: RecordingData }) {
    const gain = ctx.createGain();
    super(ctx, gain, eventBus, node);
    this.passthroughGain = gain;
    this.sampleRate = ctx.sampleRate;
    // Derive limits from node data or defaults
    const d: any = node.data || {};
    this.maxBytes = (typeof d.maxBytes === 'number' && d.maxBytes > 0) ? d.maxBytes : 25 * 1024 * 1024 + 100000000; // 125MB
    this.maxSeconds = (typeof d.maxSeconds === 'number' && d.maxSeconds > 0) ? d.maxSeconds : 0; // 0 = no explicit time cap
    this.initWorklet().catch(e => console.warn('[VirtualRecordingNode] worklet init failed', e));
    this.subscribeControl();
  }

  private async initWorklet() {
    if (!this.audioContext) return;
    const processorCode = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this._chunks = [];
    this._samples = 0;
    this._flushEvery = 16384; // default batch size; adjust via message
    this.port.onmessage = (e)=>{
      if(e.data && typeof e.data.setFlushSamples === 'number'){
        const v = e.data.setFlushSamples | 0; if(v > 256) this._flushEvery = v;
      } else if(e.data === 'flush') {
        this._flush();
      }
    };
  }
  _flush(){
    if(this._samples === 0) return;
    const merged = new Float32Array(this._samples);
    let o=0; for(const c of this._chunks){ merged.set(c,o); o+=c.length; }
    this._chunks.length = 0; this._samples = 0;
    this.port.postMessage({ type:'chunk', buffer: merged.buffer }, [merged.buffer]);
  }
  process(inputs, outputs){
    const input = inputs[0];
    const output = outputs[0];
    if (input && input[0]) {
      if (output) {
        for (let ch = 0; ch < input.length && ch < output.length; ch++) {
          output[ch].set(input[ch]);
        }
      }
      const frame = input[0].slice ? input[0].slice() : new Float32Array(input[0]);
      this._chunks.push(frame); this._samples += frame.length;
      if(this._samples >= this._flushEvery){ this._flush(); }
    }
    return true;
  }
}
registerProcessor('RecorderProcessor', RecorderProcessor);
`;
    const blob = new Blob([processorCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      await this.audioContext.audioWorklet.addModule(url);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'RecorderProcessor');
      this.workletNode.port.onmessage = (ev) => {
        if (!this.recording) return;
        const data = ev.data;
        if(data && data.type === 'chunk' && data.buffer instanceof ArrayBuffer){
          const f32 = new Float32Array(data.buffer);
            this.frames.push(f32);
            this.guardSize();
        }
      };
      // Upstream nodes already connect to passthroughGain (initial audioNode). Route that into worklet.
      this.passthroughGain.connect(this.workletNode);
      // Expose worklet as primary audio node for future connections & param automation.
      (this as any).audioNode = this.workletNode as any;
    } catch (e) {
      console.error('[VirtualRecordingNode] addModule failed', e);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private subscribeControl() {
    // UI or external triggers
    this.eventBus.subscribe(this.node.id + '.control.start', () => this.startRecording());
    this.eventBus.subscribe(this.node.id + '.control.stop', () => this.stopRecording());
    // External receive channels (case-insensitive variants)
    const onChannels = [
      this.node.id + '.record.receiveNodeOn'
    ];
    const offChannels = [
      this.node.id + '.record.receiveNodeOff',
    ];
    const handleOn = () => {
      const holdMode = !!(this.node.data as any)?.holdMode;
      if (holdMode) {
        if (!this.recording) {
          this.startRecording();
        }
      } else {
        if (this.recording) {
          this.stopRecording();
        } else {
          this.startRecording();
        }
      }
    };
    const handleOff = () => {
      const holdMode = !!(this.node.data as any)?.holdMode;
      if (holdMode) {
        if (this.recording) this.stopRecording();
      }
    };
    onChannels.forEach(c => this.eventBus.subscribe(c, handleOn));
    offChannels.forEach(c => this.eventBus.subscribe(c, handleOff));
    // Allow param updates to label etc via existing VirtualNode subscription
  }

  // Called after creation by AudioGraphManager (no special rendering needed beyond passthrough)
  render() {
    // nothing special; ensure gain at unity
    if (this.passthroughGain) this.passthroughGain.gain.value = 1;
  }

  // Override to log param updates specifically for holdMode
  handleUpdateParams(node: any, data: any) {
    super.handleUpdateParams(node, data);
  }

  private startRecording() {
    if (this.recording) return;
    this.frames = [];
    this.recording = true;
    this.startTime = performance.now();
    
    // Update node data and emit params update
    if (this.node.data) {
      (this.node.data as any).isRecording = true;
    }
    this.eventBus.emit("FlowNode."+this.node.id + '.params.updateParams', { nodeid: this.node.id, data: { isRecording: true } });
    
    this.emitStatus();
  }

  private async stopRecording() {
    if (!this.recording) return;
    this.recording = false;
    const durationMs = performance.now() - this.startTime;
    
    // Update node data and emit params update
    if (this.node.data) {
      (this.node.data as any).isRecording = false;
    }
    this.eventBus.emit("FlowNode."+this.node.id + '.params.updateParams', { nodeid: this.node.id, data: { isRecording: false } });
    
    this.emitStatus(durationMs);
    // Flush any remaining buffered audio inside worklet
    try { this.workletNode?.port.postMessage('flush'); } catch {}
    // Assemble WAV & handle persistence + optional upload + download
    try {
      const wavBlob = this.buildWav();
      // Emit event for legacy listeners (if any still attached)
      this.eventBus.emit(this.node.id + '.recording.ready', { blob: wavBlob, durationMs });
      // Inline persistence to IndexedDB (if available in browser). Avoid if running in non-browser env.
      if (typeof window !== 'undefined') {
        const id = 'rec-' + Date.now();
        const name = id + '.wav';
        let wroteFs = false;
        // Use IIFE to allow await without making stopRecording async
        try {
          const root = await loadRootHandle();
          if (root) {
            const res = await writeAudioBlob(root, 'recording', wavBlob, name);
            wroteFs = res.ok;
          }
        } catch (e) { console.warn('[VirtualRecordingNode] FS write failed', e); }
        if (!wroteFs) {
          try {
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.href = url; a.download = name; a.style.display = 'none';
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 5000);
          } catch (e) { console.warn('[VirtualRecordingNode] download trigger failed', e); }
        }
        // Optional backend upload if authenticated
        try {
          const token = localStorage.getItem('authToken');
          if (token) uploadAudio(wavBlob, name).catch(err => console.warn('[VirtualRecordingNode] upload failed', err));
        } catch (e) { console.warn('[VirtualRecordingNode] upload invocation failed', e); }
      }
    } catch (e) {
      this.eventBus.emit(this.node.id + '.status.update', { error: 'wav_failed' });
    }
  }

  private emitStatus(elapsedMs?: number) {
    const statusEvent = this.node.id + '.status.update';
    const payload = { recording: this.recording, elapsedMs: elapsedMs ?? (performance.now() - this.startTime) };
    this.eventBus.emit(statusEvent, payload);
  }

  private buildWav(): Blob {
    // Interleave frames (mono). Optionally extend to stereo later.
    const totalSamples = this.frames.reduce((acc, f) => acc + f.length, 0);
    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const f of this.frames) { merged.set(f, offset); offset += f.length; }
    // Convert float32 [-1,1] to 16-bit PCM
    const buffer = new ArrayBuffer(44 + totalSamples * 2);
    const view = new DataView(buffer);
    const writeString = (off: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
    const sampleRate = this.sampleRate;
    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + totalSamples * 2, true);
    writeString(8, 'WAVE');
    // fmt chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // channels
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate (sampleRate * channels * bytesPerSample)
    view.setUint16(32, 2, true); // block align (channels * bytesPerSample)
    view.setUint16(34, 16, true); // bits per sample
    // data chunk
    writeString(36, 'data');
    view.setUint32(40, totalSamples * 2, true);
    // samples
    let idx = 44;
    for (let i = 0; i < merged.length; i++) {
      let s = merged[i];
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(idx, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      idx += 2;
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  private guardSize() {
    // Check duration cap
    if (this.maxSeconds > 0) {
      const elapsedSec = (performance.now() - this.startTime) / 1000;
      if (elapsedSec > this.maxSeconds) {
        this.eventBus.emit(this.node.id + '.status.update', { error: 'max_duration_exceeded' });
        this.stopRecording();
        return;
      }
    }
    // Estimate final WAV size: samples * 2 bytes + 44 header
    const sampleCount = this.frames.reduce((acc, f) => acc + f.length, 0);
    const estimatedBytes = sampleCount * 2 + 44;
    if (estimatedBytes > this.maxBytes) {
      this.eventBus.emit(this.node.id + '.status.update', { error: 'max_size_exceeded' });
      this.stopRecording();
    }
  }

  // Connect source input to worklet if available
  // Removed custom connect override; base VirtualNode.connect now operates on the worklet once ready.

  disconnect() {
    super.disconnect();
    this.workletNode?.disconnect();
    this.workletNode = undefined;
    this.frames = [];
    this.recording = false;
  }
}

export default VirtualRecordingNode;
