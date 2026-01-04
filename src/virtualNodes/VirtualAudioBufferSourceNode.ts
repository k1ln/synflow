import VirtualNode from './VirtualNode';
import EventBus from '../sys/EventBus';
import { CustomNode } from '../sys/AudioGraphManager';
import { SampleFlowNodeProps, AudioBufferSegment } from '../nodes/SampleFlowNode';

/**
 * VirtualAudioBufferSourceNode wraps playback of user-loaded audio file segments.
 * It exposes a GainNode (for connectivity) and creates short-lived AudioBufferSourceNodes
 * per segment trigger. Each segment has its own input handle id; when a receiveNodeOn event
 * for that handle fires, that portion of the buffer is played.
 */
export class VirtualSampleFlowNode extends VirtualNode<CustomNode & SampleFlowNodeProps, GainNode> {
  private decodedBuffer: AudioBuffer | null = null;
  private segments: AudioBufferSegment[] = [];
  private currentlyPlaying: Set<AudioBufferSourceNode> = new Set();
  // Track sources per segment so we can stop only one segment on Off
  private segmentSources: Map<string, Set<AudioBufferSourceNode>> = new Map();
  // Queue of segment play requests received before the buffer finished decoding
  private pendingSegments: AudioBufferSegment[] = [];
  // Prevent multiple identical params listeners when segments update frequently
  private paramsListenerAttached = false;

  constructor(audioContext: AudioContext, eventBus: EventBus, node: CustomNode & SampleFlowNodeProps){
    super(audioContext, audioContext.createGain(), eventBus, node);
    this.subscribeDynamic();
    // Eagerly decode if the restored node already has data (avoids null decodedBuffer on first triggers)
    const initialData: any = (node as any)?.data || {};
    if(initialData.arrayBuffer instanceof ArrayBuffer){
      this.decodeArrayBuffer(initialData.arrayBuffer);
    } else if(initialData.fileUrl){
      this.fetchAndDecode(initialData.fileUrl);
    }
    // Initial segments (from restored flow) -> subscribe now
    const initialSegs = initialData.segments;
    if(Array.isArray(initialSegs) && initialSegs.length){
      this.updateSegmentSubscriptions(initialSegs);
    }
  }

  private subscribeDynamic(){
    // Listen for param updates (segments changes, new buffer sources, etc.)
    this.eventBus.subscribe(this.node.id + '.params.updateParams', (payload:any)=>{
      const d = payload?.data || {};
      if(d.arrayBuffer instanceof ArrayBuffer){ this.decodeArrayBuffer(d.arrayBuffer); }
      else if(!this.decodedBuffer && d.fileUrl){ this.fetchAndDecode(d.fileUrl); }
      if(Array.isArray(d.segments)){
        this.updateSegmentSubscriptions(d.segments);
      }
    });
  }

  private updateSegmentSubscriptions(segments: AudioBufferSegment[]){
  // Remove previous segment-specific handlers but keep the params listener.
  // Simpler approach: unsubscribe all then reattach the dynamic params listener explicitly.
  this.eventBus.unsubscribeAllByNodeId(this.node.id);
  this.paramsListenerAttached = false; // force re-attach
  this.subscribeDynamic();
    this.segments = segments;
    // Reset segmentSources map for removed segments
    const existingIds = new Set(segments.map(s=>s.id));
    [...this.segmentSources.keys()].forEach(id=>{ if(!existingIds.has(id)) this.segmentSources.delete(id); });
    segments.forEach(seg=>{
      const onEvent = this.node.id + '.' + seg.id + '.receiveNodeOn';
      const offEvent = this.node.id + '.' + seg.id + '.receiveNodeOff';
      this.eventBus.subscribe(onEvent, ()=>{ this.playSegment(seg); });
      this.eventBus.subscribe(offEvent, ()=>{ this.stopSegment(seg.id); });
    });
  }

  private async decodeArrayBuffer(buf: ArrayBuffer){
    try{
      this.decodedBuffer = await this.audioContext!.decodeAudioData(buf.slice(0));
      // push duration back to UI via params update
      this.eventBus.emit(this.node.id + '.params.updateParams', { nodeid: this.node.id, data:{ duration: this.decodedBuffer.duration }});
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

  private async fetchAndDecode(url: string){
    try {
      const resp = await fetch(url);
      if(!resp.ok) return;
      const buf = await resp.arrayBuffer();
      await this.decodeArrayBuffer(buf);
    } catch(e){ console.warn('[VirtualSampleFlowNode] fetch decode failed', e); }
  }

  private playSegment(seg: AudioBufferSegment){
    if(!this.decodedBuffer){
      // Buffer not ready yet; queue the request
      this.pendingSegments.push(seg);
      return;
    }
    const start = Math.max(0, Math.min(seg.start, this.decodedBuffer.duration));
    const end = Math.max(start, Math.min(seg.end, this.decodedBuffer.duration));
    const length = Math.max(0, end - start);
    if(length <= 0) return;
    const src = this.audioContext!.createBufferSource();
    src.buffer = this.decodedBuffer;
    src.connect(this.audioNode!);
    src.start(0, start, length);
    this.currentlyPlaying.add(src);
    // Map segment -> sources
    const set = this.segmentSources.get(seg.id) || new Set<AudioBufferSourceNode>();
    set.add(src);
    this.segmentSources.set(seg.id, set);
    src.onended = ()=>{ this.currentlyPlaying.delete(src); };
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

  // Exposed render if we later want to set gain etc.
  render(){ /* no-op for now */ }
}

export default VirtualSampleFlowNode;
