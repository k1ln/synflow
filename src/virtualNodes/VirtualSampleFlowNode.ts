import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';
import { SampleFlowNodeProps, AudioBufferSegment } from '../nodes/SampleFlowNode';

// Helper to convert potentially serialized buffer to ArrayBuffer
const toArrayBuffer = (buf: unknown): ArrayBuffer | null => {
  if (buf instanceof ArrayBuffer) {
    return buf;
  }
  if (buf && typeof buf === 'object' && buf !== null) {
    // Handle serialized ArrayBuffer (e.g., from JSON persistence)
    try {
      const values = Object.values(buf as object) as number[];
      if (values.length > 0 && typeof values[0] === 'number') {
        return new Uint8Array(values).buffer;
      }
    } catch {
      // ignore conversion errors
    }
  }
  return null;
};

/**
 * VirtualSampleFlowNode wraps playback of user-loaded audio file segments.
 * It exposes a GainNode (for connectivity) and creates short-lived AudioBufferSourceNodes
 * per segment trigger. Each segment has its own input handle id; when a receiveNodeOn event
 * for that handle fires, that portion of the buffer is played.
 */
export class VirtualSampleFlowNode extends VirtualNode<CustomNode & SampleFlowNodeProps, GainNode> {
  private decodedBuffer: AudioBuffer | null = null;
  private reversedBuffer: AudioBuffer | null = null;
  private segments: AudioBufferSegment[] = [];
  private currentlyPlaying: Set<AudioBufferSourceNode> = new Set();
  // Track sources per segment so we can stop only one segment on Off
  private segmentSources: Map<string, Set<AudioBufferSourceNode>> = new Map();
  // Queue of segment play requests received before the buffer finished decoding
  private pendingSegments: AudioBufferSegment[] = [];
  // Prevent multiple identical params listeners when segments update frequently
  private paramsListenerAttached = false;
  private segmentHandlers: { event:string; handler:(d:any)=>void }[] = [];
  private loopEnabled = false;
  private loopMode: 'hold'|'toggle' = 'hold';
  private reverse = false;
  private speed = 1;

  // Per-segment granular synthesis state
  private grainSchedulers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private grainReadPtrs:   Map<string, number>                        = new Map();
  private grainNodes:      Map<string, AudioBufferSourceNode[]>       = new Map();

  constructor(audioContext: AudioContext, eventBus: EventBus, node: CustomNode & SampleFlowNodeProps){
    super(audioContext, audioContext.createGain(), eventBus, node);
    this.subscribeDynamic();
    this.eventBus.subscribe(this.node.id + '.stopAll', ()=> this.stopAll());
    // Eagerly decode if the restored node already has data (avoids null decodedBuffer on first triggers)
    const initialData: any = (node as any)?.data || {};
    this.loopEnabled = initialData.loopEnabled ?? this.loopEnabled;
    this.loopMode = initialData.loopMode || this.loopMode;
    this.reverse = initialData.reverse ?? this.reverse;
    this.speed = typeof initialData.speed === 'number' ? initialData.speed : this.speed;
    const initialBuf = toArrayBuffer(initialData.arrayBuffer);
    if (initialBuf) {
      this.decodeArrayBuffer(initialBuf);
    } else if (initialData.diskFileName) {
      this.loadFromDisk(initialData.diskFileName);
    } else if (initialData.fileUrl) {
      this.fetchAndDecode(initialData.fileUrl);
    }
    // Initial segments (from restored flow) -> subscribe now
    const initialSegs = initialData.segments;
    if(Array.isArray(initialSegs) && initialSegs.length){
      this.updateSegmentSubscriptions(initialSegs);
    }
  }

  private subscribeDynamic(){
    if (this.paramsListenerAttached) return;
    this.paramsListenerAttached = true;
    const handler = (payload:any)=>{
      const d = payload?.data || {};
      const buf = toArrayBuffer(d.arrayBuffer);
      if (buf) {
        this.decodeArrayBuffer(buf);
      } else if (!this.decodedBuffer && d.diskFileName) {
        this.loadFromDisk(d.diskFileName);
      } else if (!this.decodedBuffer && d.fileUrl) {
        this.fetchAndDecode(d.fileUrl);
      }
      if(Array.isArray(d.segments)){
        // Before updating, check which looping segments are playing and have changed boundaries
        const oldSegments = this.segments;
        const newSegments: AudioBufferSegment[] = d.segments;
        this.updateSegmentSubscriptions(newSegments);

        // Restart any currently-playing looping segment whose boundaries/speed/reverse changed
        for (const newSeg of newSegments) {
          const sources = this.segmentSources.get(newSeg.id);
          if (!sources || !sources.size) continue;
          const eff = this.effectiveSettings(newSeg);
          if (!eff.loopEnabled) continue;
          const old = oldSegments.find(s => s.id === newSeg.id);
          if (!old) continue;
          const changed =
            old.start !== newSeg.start ||
            old.end !== newSeg.end ||
            old.speed !== newSeg.speed ||
            old.reverse !== newSeg.reverse;
          if (changed) {
            this.stopSegment(newSeg.id);
            this.playSegment(newSeg);
          }
        }

        // Restart granular engines when on/off toggle or period-defining params change.
        // Pitch, spread, speed, frozen are read live per tick so they don't need a restart.
        for (const newSeg of newSegments) {
          const old = oldSegments.find(s => s.id === newSeg.id);
          if (!old) continue;
          const wasRunning   = this.grainSchedulers.has(newSeg.id);
          const enabling     = !old.grainEnabled && !!newSeg.grainEnabled;
          const disabling    = !!old.grainEnabled && !newSeg.grainEnabled;
          const periodChanged =
            old.grainSize    !== newSeg.grainSize ||
            old.grainOverlap !== newSeg.grainOverlap ||
            old.start        !== newSeg.start ||
            old.end          !== newSeg.end;
          if (disabling) {
            this.stopGranular(newSeg.id);
          } else if (enabling) {
            this.playGranular(newSeg);
          } else if (wasRunning && periodChanged) {
            this.stopGranular(newSeg.id);
            this.playGranular(newSeg);
          }
        }
      }
      if (typeof d.loopEnabled === 'boolean') {
        this.loopEnabled = d.loopEnabled;
      }
      if (d.loopMode === 'toggle' || d.loopMode === 'hold') {
        this.loopMode = d.loopMode;
      }
      if (typeof d.reverse === 'boolean') {
        this.reverse = d.reverse;
      }
      if (typeof d.speed === 'number') {
        this.speed = d.speed;
      }
    };
    this.eventBus.subscribe(this.node.id + '.params.updateParams', handler);
  }

  private updateSegmentSubscriptions(segments: AudioBufferSegment[]){
    this.detachSegmentSubscriptions();
    this.segments = segments;
    // Reset segmentSources map for removed segments
    const existingIds = new Set(segments.map(s=>s.id));
    [...this.segmentSources.keys()].forEach(id=>{ if(!existingIds.has(id)) this.segmentSources.delete(id); });
    segments.forEach(seg=>{
      const onEvent = this.node.id + '.' + seg.id + '.receiveNodeOn';
      const offEvent = this.node.id + '.' + seg.id + '.receiveNodeOff';
      const onHandler = (payload?: any)=>{
        // Always use the correct segment from segments array by id
        let segment: AudioBufferSegment | undefined;
        if (payload?.segment && payload.segment.id) {
          segment = this.segments.find(s => s.id === payload.segment.id);
        } else if (payload?.nodeId) {
          segment = this.segments.find(s => s.id === seg.id);
        }
        if (!segment) segment = seg;
        // Extract target frequency for repitching (from value or frequency field)
        const targetFreq = typeof payload?.value === 'number'
          ? payload.value
          : typeof payload?.frequency === 'number'
            ? payload.frequency
            : undefined;
        this.handleSegmentOn(segment, targetFreq);
      };
      const offHandler = (payload?: any)=>{
        let segment: AudioBufferSegment | undefined;
        if (payload?.segment && payload.segment.id) {
          segment = this.segments.find(s => s.id === payload.segment.id);
        } else if (payload?.nodeId) {
          segment = this.segments.find(s => s.id === seg.id);
        }
        if (!segment) segment = seg;
        this.handleSegmentOff(segment.id);
      };
      this.eventBus.subscribe(onEvent, onHandler);
      this.eventBus.subscribe(offEvent, offHandler);
      this.segmentHandlers.push({ event: onEvent, handler: onHandler });
      this.segmentHandlers.push({ event: offEvent, handler: offHandler });
    });
  }

  private detachSegmentSubscriptions(){
    this.segmentHandlers.forEach(({ event, handler })=>{
      this.eventBus.unsubscribe(event, handler);
    });
    this.segmentHandlers = [];
  }

  private async decodeArrayBuffer(buf: ArrayBuffer){
    try{
      this.decodedBuffer = await this.audioContext!.decodeAudioData(buf.slice(0));
      // Invalidate reverse cache whenever source buffer changes
      this.reversedBuffer = null;
      
      this.eventBus.emit(this.node.id + '-GUI.params.updateParams', {
        nodeid: this.node.id,
        data: {
          duration: this.decodedBuffer.duration,
          arrayBuffer: buf
        }
      });
      // Flush any queued segment play requests that arrived before decoding finished
      if(this.pendingSegments.length){
        const queued = [...this.pendingSegments];
        this.pendingSegments.length = 0;
        queued.forEach(seg=> this.playSegment(seg));
      }
    } catch(e){
      console.warn('[VirtualSampleFlowNode] decode failed', e);
    }
  }

  private buildReversedBuffer(source: AudioBuffer | null){
    if(!source) return null;
    const ctx = this.audioContext!;
    const reversed = ctx.createBuffer(
      source.numberOfChannels,
      source.length,
      source.sampleRate
    );
    for(let ch = 0; ch < source.numberOfChannels; ch++){
      const src = source.getChannelData(ch);
      const dest = reversed.getChannelData(ch);
      for(let i = 0, j = src.length - 1; i < src.length; i++, j--){
        dest[i] = src[j];
      }
    }
    return reversed;
  }

  /**
   * Create a buffer with smoothed loop boundaries to prevent clicks.
   * Applies a crossfade at the loop point so the end blends into the beginning.
   */
  private createLoopSmoothedBuffer(
    source: AudioBuffer,
    offset: number,
    length: number
  ): AudioBuffer {
    const ctx = this.audioContext!;
    const sampleRate = source.sampleRate;
    
    // Calculate sample positions
    const startSample = Math.floor(offset * sampleRate);
    const lengthSamples = Math.floor(length * sampleRate);
    const endSample = startSample + lengthSamples;
    
    // Crossfade duration: 5-10ms typically works well (adjust as needed)
    const crossfadeDuration = 0.005; // 5ms
    const crossfadeSamples = Math.min(
      Math.floor(crossfadeDuration * sampleRate),
      Math.floor(lengthSamples / 4) // Don't crossfade more than 25% of the loop
    );
    
    // Create new buffer for the loop segment
    const loopBuffer = ctx.createBuffer(
      source.numberOfChannels,
      lengthSamples,
      sampleRate
    );
    
    // Copy and process each channel
    for (let ch = 0; ch < source.numberOfChannels; ch++) {
      const srcData = source.getChannelData(ch);
      const destData = loopBuffer.getChannelData(ch);
      
      // Copy the main segment
      for (let i = 0; i < lengthSamples; i++) {
        const srcIdx = startSample + i;
        if (srcIdx >= 0 && srcIdx < source.length) {
          destData[i] = srcData[srcIdx];
        }
      }
      
      // Apply crossfade at loop boundaries if we have enough samples
      if (crossfadeSamples > 0 && lengthSamples > crossfadeSamples * 2) {
        for (let i = 0; i < crossfadeSamples; i++) {
          const fadeRatio = i / crossfadeSamples; // 0 to 1
          
          // Crossfade at the end: blend end with beginning
          const endIdx = lengthSamples - crossfadeSamples + i;
          const startIdx = i;
          
          if (endIdx < lengthSamples) {
            // Fade out the end, fade in the beginning
            destData[endIdx] = destData[endIdx] * (1 - fadeRatio) + 
                               destData[startIdx] * fadeRatio;
          }
        }
      }
    }
    
    return loopBuffer;
  }

  private async fetchAndDecode(url: string){
    try {
      const resp = await fetch(url);
      if(!resp.ok) return;
      const buf = await resp.arrayBuffer();
      await this.decodeArrayBuffer(buf);
    } catch(e){ console.warn('[VirtualSampleFlowNode] fetch decode failed', e); }
  }

  private async loadFromDisk(diskFileName: string) {
    try {
      const {
        loadRootHandle,
        verifyPermission,
        loadSampleFromDisk
      } = await import('../util/FileSystemAudioStore');
      const root = await loadRootHandle();
      if (!root) {
        console.warn('[VirtualSampleFlowNode] no disk root handle');
        return;
      }
      const hasPermission = await verifyPermission(root, 'read');
      if (!hasPermission) {
        console.warn('[VirtualSampleFlowNode] no disk permission');
        return;
      }
      const buf = await loadSampleFromDisk(root, diskFileName);
      if (buf) {
        await this.decodeArrayBuffer(buf);
      }
    } catch (e) {
      console.warn('[VirtualSampleFlowNode] disk load failed', e);
    }
  }

  private computePlayback(seg: AudioBufferSegment){
    const base = this.decodedBuffer;
    if(!base){
      this.pendingSegments.push(seg);
      return null;
    }
    const eff = this.effectiveSettings(seg);
    const speed = eff.speed;
    const isReverse = eff.reverse;
    const buffer = isReverse ? this.getReversedBuffer() : this.decodedBuffer;
    if(!buffer) return null;
    const duration = base.duration;
    const start = Math.max(0, Math.min(seg.start, duration));
    const end = Math.max(start, Math.min(seg.end, duration));
    const length = Math.max(0, end - start);
    if(length <= 0) return null;
    const offset = isReverse ? Math.max(0, duration - end) : start;
    const loopStart = offset;
    const loopEnd = offset + length;
    const isLoop = eff.loopEnabled;
    return { buffer, offset, length, loopStart, loopEnd, speed, isLoop, isReverse };
  }

  private getReversedBuffer(){
    if(!this.decodedBuffer) return null;
    if(this.reversedBuffer) return this.reversedBuffer;
    this.reversedBuffer = this.buildReversedBuffer(this.decodedBuffer);
    return this.reversedBuffer;
  }

  private playSegment(seg: AudioBufferSegment, targetFrequency?: number){
    // Route to granular engine when enabled
    if (seg.grainEnabled) {
      this.playGranular(seg);
      return;
    }
    const playback = this.computePlayback(seg);
    if(!playback) {
      return;
    }
    const { buffer, offset, length, loopStart, loopEnd, isLoop, speed } = playback;
    if (!buffer) {
      return;
    }
    const src = this.audioContext!.createBufferSource();
    
    // Apply loop smoothing if looping is enabled
    if (isLoop && buffer) {
      src.buffer = this.createLoopSmoothedBuffer(buffer, offset, length);
    } else {
      src.buffer = buffer;
    }
    
    // Calculate playback rate: combine speed setting with repitch ratio
    let finalRate = speed;
    if (
      typeof targetFrequency === 'number' &&
      targetFrequency > 0 &&
      typeof seg.detectedFrequency === 'number' &&
      seg.detectedFrequency > 0
    ) {
      // Repitch: target / source frequency ratio
      const repitchRatio = targetFrequency / seg.detectedFrequency;
      finalRate = speed * repitchRatio;
    }
    src.playbackRate.value = finalRate;
    
    src.connect(this.audioNode!);
    const when = this.audioContext!.currentTime;
    // Use offset/duration to play only the segment.
    // IMPORTANT: never pass `undefined` as an explicit argument to start(),
    // otherwise it becomes NaN and the browser throws, resulting in silence.
    if (!isLoop) {
      // Non-looping: play from offset in original buffer
      src.start(when, offset, length);
    } else {
      // Looping: we've already created a smoothed buffer segment, play from start
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = length;
      src.start(when, 0);
    }
    this.currentlyPlaying.add(src);
    const set = this.segmentSources.get(seg.id) || new Set<AudioBufferSourceNode>();
    set.add(src);
    this.segmentSources.set(seg.id, set);
    src.onended = ()=>{
      this.currentlyPlaying.delete(src);
      const segSet = this.segmentSources.get(seg.id);
      if (segSet) {
        segSet.delete(src);
        if (!segSet.size) {
          this.segmentSources.delete(seg.id);
        }
      }
    };
  }

  private handleSegmentOn(seg: AudioBufferSegment, targetFrequency?: number){
    const eff = this.effectiveSettings(seg);
    // Hold mode (On→Off): stop existing, play new; OFF stops
    if (eff.loopMode === 'hold') {
      const existing = this.segmentSources.get(seg.id);
      if (existing && existing.size) {
        // Already playing in hold mode, stop and restart
        this.stopSegment(seg.id);
      }
      this.playSegment(seg, targetFrequency);
      return;
    }
    // Toggle mode (On↔On): toggle play/stop on each ON
    const existing = this.segmentSources.get(seg.id);
    if(existing && existing.size){
      this.stopSegment(seg.id);
      return;
    }
    this.playSegment(seg, targetFrequency);
  }

  private handleSegmentOff(segmentId: string){
    // Find the segment to check its effective settings
    const seg = this.segments.find((s) => s.id === segmentId);
    if (!seg) {
      // Segment not found, stop anyway as fallback
      this.stopSegment(segmentId);
      return;
    }
    const eff = this.effectiveSettings(seg);
    // Only stop on OFF if holdEnabled is true (default)
    // If holdEnabled is false, ignore OFF and let it play
    if (!eff.holdEnabled) {
      return;
    }
    // Stop on OFF only in hold mode (On→Off)
    // Toggle mode (On↔On) ignores OFF
    if (eff.loopMode === 'hold') {
      this.stopSegment(segmentId);
    }
  }

  private stopAll(){
    // Stop all granular schedulers
    for (const id of [...this.grainSchedulers.keys()]) this.stopGranular(id);
    this.currentlyPlaying.forEach(s=>{ try{ s.stop(); } catch{} });
    this.currentlyPlaying.clear();
    this.segmentSources.clear();
  }

  private stopSegment(segmentId: string){
    this.stopGranular(segmentId);
    const set = this.segmentSources.get(segmentId);
    if(!set || !set.size) return;
    set.forEach(src=>{ try{ src.stop(); } catch{} this.currentlyPlaying.delete(src); });
    set.clear();
    this.segmentSources.delete(segmentId);
  }

  // ── Granular engine ─────────────────────────────────────────────────────────────

  /**
   * Build a mono Float32Array snapshot of the segment's audio region.
   * Called once per playGranular call so grains always read from a stable copy.
   */
  private getSegmentMonoData(seg: AudioBufferSegment): Float32Array | null {
    const buf = this.decodedBuffer;
    if (!buf) return null;
    const sr    = buf.sampleRate;
    const start = Math.floor(Math.max(0, seg.start) * sr);
    const end   = Math.min(Math.floor(seg.end * sr), buf.length);
    const len   = Math.max(1, end - start);
    const mono  = new Float32Array(len);
    const nc    = buf.numberOfChannels;
    for (let ch = 0; ch < nc; ch++) {
      const cd = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) mono[i] += (cd[start + i] || 0) / nc;
    }
    return mono;
  }

  /**
   * Start an asynchronous granular scheduler for the given segment.
   * Each tick: pick a read position (pointer + jitter), copy grainSize samples,
   * apply a Hann window, and play via AudioBufferSourceNode at pitch-shifted rate.
   * Pitch, spread, speed and frozen are re-read from this.segments on every tick
   * so MIDI knob changes take effect immediately without restarting the engine.
   * Only grainSize / grainOverlap (which control the interval period) require a
   * full restart – that is handled in subscribeDynamic.
   */
  private playGranular(seg: AudioBufferSegment): void {
    this.stopGranular(seg.id); // clear any previous scheduler for this segment

    const segMono = this.getSegmentMonoData(seg);
    if (!segMono || segMono.length === 0) return;

    const sr            = this.audioContext!.sampleRate;
    const segLen        = segMono.length;
    const grainSizeMs   = Math.max(5, seg.grainSize ?? 100);
    const overlap       = Math.min(0.95, Math.max(0, seg.grainOverlap ?? 0.6));
    const periodMs      = Math.max(1, grainSizeMs * (1 - overlap));
    const periodSamples = Math.floor(periodMs / 1000 * sr);

    this.grainReadPtrs.set(seg.id, 0);

    const grains: AudioBufferSourceNode[] = [];
    this.grainNodes.set(seg.id, grains);

    const handle = setInterval(() => {
      const ctx = this.audioContext;
      if (!ctx || !this.audioNode) return;

      // Re-read live params from the current segment state
      const liveSeg      = this.segments.find(s => s.id === seg.id) ?? seg;
      const pitch        = liveSeg.grainPitch  ?? 0;
      const spread       = Math.max(0, Math.min(0.5, liveSeg.grainSpread ?? 0.05));
      const speed        = liveSeg.grainSpeed  ?? 0.1;
      const frozen       = !!liveSeg.grainFrozen;
      const grainSampNow = Math.max(2, Math.floor((liveSeg.grainSize ?? grainSizeMs) / 1000 * sr));

      // Advance read pointer
      let ptr = this.grainReadPtrs.get(seg.id) ?? 0;
      if (!frozen) {
        const step = Math.round(speed * periodSamples * 0.15);
        ptr = ((ptr + step) % segLen + segLen) % segLen;
        this.grainReadPtrs.set(seg.id, ptr);
      }

      // Apply jitter (spread)
      const jitter = Math.round((Math.random() * 2 - 1) * spread * segLen);
      const start  = ((ptr + jitter) % segLen + segLen) % segLen;

      // Build Hann-windowed grain
      const grainBuf  = ctx.createBuffer(1, grainSampNow, sr);
      const gd        = grainBuf.getChannelData(0);
      const N         = Math.max(1, grainSampNow - 1);
      for (let i = 0; i < grainSampNow; i++) {
        const win = 0.5 * (1 - Math.cos(2 * Math.PI * i / N));
        gd[i]     = (segMono[(start + i) % segLen] || 0) * win;
      }

      // Play grain
      const src = ctx.createBufferSource();
      src.buffer           = grainBuf;
      src.playbackRate.value = Math.pow(2, pitch / 12);
      src.connect(this.audioNode);
      src.start();

      // Track and cap concurrent grains
      grains.push(src);
      if (grains.length > 64) {
        const old = grains.shift();
        try { old?.stop(); old?.disconnect(); } catch {}
      }
      src.onended = () => {
        try { src.disconnect(); } catch {}
        const idx = grains.indexOf(src);
        if (idx !== -1) grains.splice(idx, 1);
      };
    }, periodMs);

    this.grainSchedulers.set(seg.id, handle);
  }

  /** Stop and clean up the granular engine for one segment. */
  private stopGranular(segId: string): void {
    const handle = this.grainSchedulers.get(segId);
    if (handle !== undefined) {
      clearInterval(handle);
      this.grainSchedulers.delete(segId);
    }
    const grains = this.grainNodes.get(segId);
    if (grains) {
      for (const g of grains) { try { g.stop(); g.disconnect(); } catch {} }
      this.grainNodes.delete(segId);
    }
    this.grainReadPtrs.delete(segId);
  }

  private effectiveSettings(seg: AudioBufferSegment){
    return {
      loopEnabled: seg.loopEnabled ?? this.loopEnabled,
      loopMode: seg.loopMode ?? this.loopMode,
      holdEnabled: seg.holdEnabled !== false, // default true
      reverse: seg.reverse ?? this.reverse,
      speed: typeof seg.speed === 'number' ? seg.speed : this.speed
    } as {
      loopEnabled: boolean;
      loopMode: 'hold'|'toggle';
      holdEnabled: boolean;
      reverse: boolean;
      speed: number;
    };
  }

  // Exposed render if we later want to set gain etc.
  render(){ /* no-op for now */ }
}

export default VirtualSampleFlowNode;
