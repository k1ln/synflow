// @ts-nocheck
import { SynNode as Node, SynEdge as Edge } from "./types";
import { ButtonNodeProps } from "./nodeData";

export type DataBaseNode = {
    nodes: Node[];
    edges: Edge[];
};

export type AudioNodeData = {
    frequency?: number;
    type?: OscillatorType;
    gain?: number;
    delayTime?: number;
    filterType?: BiquadFilterType;
    threshold?: number;
    ratio?: number;
    curve?: Float32Array | null;
    oversample?: OverSampleType;
    processorUrl?: string;
    smoothingTimeConstant?: number;
    fftSize?: number;
    minDecibels?: number;
    maxDecibels?: number;
};

export type CustomNode = {
    id: string;
    type: string;
    data: unknown;
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
