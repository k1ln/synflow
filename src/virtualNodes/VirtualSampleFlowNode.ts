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
        this.updateSegmentSubscriptions(d.segments);
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
    const playback = this.computePlayback(seg);
    if(!playback) {
      return;
    }
    const { buffer, offset, length, loopStart, loopEnd, isLoop, speed } = playback;
    if (!buffer) {
      return;
    }
    const src = this.audioContext!.createBufferSource();
    src.buffer = buffer;
    
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
    
    if(isLoop){
      src.loop = true;
      src.loopStart = loopStart;
      src.loopEnd = loopEnd;
    }
    src.connect(this.audioNode!);
    const when = this.audioContext!.currentTime;
    // Use offset/duration to play only the segment.
    // IMPORTANT: never pass `undefined` as an explicit argument to start(),
    // otherwise it becomes NaN and the browser throws, resulting in silence.
    if (!isLoop) {
      src.start(when, offset, length);
    } else {
      src.start(when, offset);
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
    this.currentlyPlaying.forEach(s=>{ try{ s.stop(); } catch{} });
    this.currentlyPlaying.clear();
    this.segmentSources.clear();
  }

  private stopSegment(segmentId: string){
    const set = this.segmentSources.get(segmentId);
    if(!set || !set.size) return;
    set.forEach(src=>{ try{ src.stop(); } catch{} this.currentlyPlaying.delete(src); });
    set.clear();
    this.segmentSources.delete(segmentId);
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
