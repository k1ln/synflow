import { SynNode as Node, SynEdge as Edge } from "./types";

export type DataBaseNode = {
    nodes: Node[];
    edges: Edge[];
};

/** A constructed virtual node instance (varies per node type). */
export type VirtualNodeType = any;

export type AudioNodeData = {
    // Genuinely dynamic, same as CustomNode.data above: VirtualNodeFactory
    // casts `node.data` to this type once per node and then reads whatever
    // fields that node type's data shape actually has (e.g. `curve`/
    // `oversample` for distortion, `Q`/`detune` for a filter, `bandCount`/
    // `qFactor` for the equalizer) — there's no single node shape here, so
    // the named fields below document the common/well-known ones without
    // claiming to be exhaustive.
    [key: string]: unknown;
    frequency?: number;
    type?: OscillatorType;
    gain?: number;
    delayTime?: number;
    filterType?: BiquadFilterType;
    threshold?: number;
    ratio?: number;
    // Two shapes in flight: raw flow data persists it as a comma-separated
    // string (DistortionFlowNode's factory case parses it with .split(',')),
    // VirtualDistortionNode.render() takes the parsed Float32Array.
    curve?: Float32Array | string | null;
    oversample?: OverSampleType;
    processorUrl?: string;
    smoothingTimeConstant?: number;
    fftSize?: number;
    Q?: number;
    detune?: number;
    pulseWidth?: number;
    periodicWaveHarmonics?: number;
    knee?: number;
    attack?: number;
    release?: number;
    shift?: number;
    bandCount?: number;
    lowFreq?: number;
    highFreq?: number;
    attackTime?: number;
    releaseTime?: number;
    qFactor?: number;
    carrierGain?: number;
    modulatorGain?: number;
    outputGain?: number;
    minDecibels?: number;
    maxDecibels?: number;
};

export type CustomNode = {
    id: string;
    type: string;
    // Genuinely dynamic: shape varies per node `type` (ADSR has attackTime/
    // decayTime, oscillator has frequency, etc.) with no single discriminated
    // union backing it today — same convention as VirtualNodeType above.
    data: any;
    parentNode?: CustomNode | null;
    functions?: {
        [key: string]: (...args: any[]) => void;
    };
};

export interface ExtendedOscillatorNode extends OscillatorNode {
    playbackState?: string;
}

export const webAudioApiFlowNodes = new Set<string>([
    "MasterOutFlowNode",
    "OscillatorFlowNode",
    "BiquadFilterFlowNode",
    "DynamicCompressorFlowNode",
    "GainFlowNode",
    "CrossfaderFlowNode",
    "DelayFlowNode",
    "ReverbFlowNode",
    "DistortionFlowNode",
    "AudioWorkletFlowNode",
    "IIRFilterFlowNode",
    "SampleFlowNode",
    "MicFlowNode",
    "WebRTCInputFlowNode",
    "WebRTCOutputFlowNode",
    "WebRTCPulseNode",
    "WebSocketAudioNode",
    "RecordingFlowNode",
    "AnalyzerNodeGPT",
    "OscilloscopeFlowNode",
    "AudioSignalFreqShifterFlowNode",
    "AudioWorkletOscillatorFlowNode",
    "EqualizerFlowNode",
    "VocoderFlowNode",
]);
