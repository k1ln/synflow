// @ts-nocheck
import { SynNode as Node, SynEdge as Edge } from "./types";
import VirtualADSRNode from "./virtualNodes/VirtualADSRNode";
import VirtualBlockingSwitchNode from "./virtualNodes/VirtualBlockingSwitchNode";
import VirtualButtonNode from "./virtualNodes/VirtualButtonNode";
import VirtualMidiButtonNode from "./virtualNodes/VirtualMidiButtonNode";
import VirtualOscillatorNode from "./virtualNodes/VirtualOscillatorNode";
import VirtualLogNode from "./virtualNodes/VirtualLogNode";
import { ADSRFlowNodeProps } from "./nodeData";
import { AudioWorkletFlowNodeProps } from "./nodeData";
import { BiquadFilterFlowNodeProps } from "./nodeData";
import { DelayFlowNodeProps } from "./nodeData";
import { ReverbFlowNodeProps } from "./nodeData";
import { IIRFilterFlowNodeProps } from "./nodeData";
import { OscillatorFlowNodeProps } from "./nodeData";
import { DistortionFlowNodeProps } from "./nodeData";
import { DynamicCompressorFlowNodeProps } from "./nodeData";
import { ClockNodeProps } from "./nodeData";
import { ConstantNodeProps } from "./nodeData";
import { FlowNodeProps } from "./nodeData";
import { FrequencyFlowNodeProps } from "./nodeData";
import { FunctionNodeProps } from "./nodeData";
import { InputNodeProps } from "./nodeData";
import { OutputNodeProps } from "./nodeData";
import { SwitchFlowNodeProps } from "./nodeData";
import { ButtonNodeProps } from "./nodeData";
import { MidiButtonNodeProps } from "./nodeData";
import { VirtualGainNode } from "./virtualNodes/VirtualGainNode";
import { VirtualDelayNode } from "./virtualNodes/VirtualDelayNode";
import VirtualReverbNode from "./virtualNodes/VirtualReverbNode";
import VirtualBiquadFilterNode from "./virtualNodes/VirtualBiquadFilterNode";
import VirtualSvfDriveFilterNode from "./virtualNodes/VirtualSvfDriveFilterNode";
import VirtualLadderFilterNode from "./virtualNodes/VirtualLadderFilterNode";
import VirtualKarplusNode from "./virtualNodes/VirtualKarplusNode";
import VirtualFMNode from "./virtualNodes/VirtualFMNode";
import VirtualWavetableNode from "./virtualNodes/VirtualWavetableNode";
import VirtualGranularNode from "./virtualNodes/VirtualGranularNode";
import VirtualEnvGenNode from "./virtualNodes/VirtualEnvGenNode";
import VirtualRingModNode from "./virtualNodes/VirtualRingModNode";
import VirtualChorusNode from "./virtualNodes/VirtualChorusNode";
import VirtualIIRFilterNode from "./virtualNodes/VirtualIIRFilterNode";
import VirtualDynamicCompressorNode from "./virtualNodes/VirtualDynamicCompressorNode";
import VirtualDistortionNode from "./virtualNodes/VirtualDistortionNode";
import VirtualMasterOut from "./virtualNodes/VirtualMasterOut";
import { VirtualAudioWorkletNode } from "./virtualNodes/VirtualAudioWorkletNode";
import VirtualClockNode from "./virtualNodes/VirtualClockNode";
import VirtualSwitchNode from "./virtualNodes/VirtualSwitchNode";
import VirtualConstantNode from "./virtualNodes/VirtualConstantNode";
import VirtualFrequencyNode from "./virtualNodes/VirtualFrequencyNode";
import VirtualFunctionNode from "./virtualNodes/VirtualFunctionNode";
import VirtualEventNode from "./virtualNodes/VirtualEventNode";
import VirtualFlowNode from "./virtualNodes/VirtualFlowNode";
import VirtualInputNode from "./virtualNodes/VirtualInputNode";
import VirtualOutputNode from "./virtualNodes/VirtualOutputNode";
import VirtualMidiNode from "./virtualNodes/VirtualMidiNode";
import VirtualOnOffButtonNode from "./virtualNodes/VirtualOnOffButtonNode";
import VirtualSampleFlowNode from "./virtualNodes/VirtualSampleFlowNode";
import VirtualSequencerNode from "./virtualNodes/VirtualSequencerNode";
import VirtualScriptSequencerNode from "./virtualNodes/VirtualScriptSequencerNode";
import VirtualSequencerFrequencyNode from "./virtualNodes/VirtualSequencerFrequencyNode";
import VirtualAutomationNode from "./virtualNodes/VirtualAutomationNode";
import VirtualArpeggiatorNode from "./virtualNodes/VirtualArpeggiatorNode";
import VirtualMidiKnobNode from "./virtualNodes/VirtualMidiKnobNode";
import { VirtualMouseTriggerButtonNode } from './virtualNodes/VirtualMouseTriggerButtonNode';
import VirtualRecordingNode from "./virtualNodes/VirtualRecordingNode";
import VirtualMicNode from "./virtualNodes/VirtualMicNode";
import VirtualWebRTCInputNode from "./virtualNodes/VirtualWebRTCInputNode";
import VirtualWebRTCOutputNode from "./virtualNodes/VirtualWebRTCOutputNode";
import VirtualAnalyzerNodeGPT from "./virtualNodes/VirtualAnalyzerNodeGPT";
import VirtualOscilloscopeNode from "./virtualNodes/VirtualOscilloscopeNode";
import VirtualSpeedDividerNode from "./virtualNodes/VirtualSpeedDividerNode";
import VirtualAudioSignalFreqShifterNode from "./virtualNodes/VirtualAudioSignalFreqShifterNode";
import { AudioSignalFreqShifterFlowNodeProps } from "./nodeData";
import VirtualFlowEventFreqShifterNode from "./virtualNodes/VirtualFlowEventFreqShifterNode";
import { FlowEventFreqShifterFlowNodeProps } from "./nodeData";
import VirtualEqualizerNode from "./virtualNodes/VirtualEqualizerNode";
import { EqualizerFlowNodeProps } from "./nodeData";
import VirtualVocoderNode from "./virtualNodes/VirtualVocoderNode";
import { VocoderFlowNodeProps } from "./nodeData";
import VirtualMidiFileNode from "./virtualNodes/VirtualMidiFileNode";
import { MidiFileFlowNodeProps } from "./nodeData";
import VirtualAudioWorkletOscillatorNode from "./virtualNodes/VirtualAudioWorkletOscillatorNode";
import VirtualNoiseNode from "./virtualNodes/VirtualNoiseNode";
import VirtualUnisonBeginNode from "./virtualNodes/VirtualUnisonBeginNode";
import VirtualUnisonEndNode from "./virtualNodes/VirtualUnisonEndNode";
import VirtualCommandInNode from "./virtualNodes/VirtualCommandInNode";
import VirtualCommandOutNode from "./virtualNodes/VirtualCommandOutNode";
import type { CustomNode, AudioNodeData } from "./AudioGraphTypes";

/**
 * Creates and registers a virtual node on the manager's virtualNodes map.
 * Extracted from AudioGraphManager to keep that file smaller.
 */
export async function addVirtualNode(manager: any, node: CustomNode, parentNode: CustomNode | null): Promise<void> {
    if (manager.virtualNodes.has(node.id)) return;

    if (parentNode) {
        node.id = parentNode.id + "." + node.id;
    }
    const nodeData = node.data as AudioNodeData;

    switch (node.type) {
        case "AudioWorkletOscillatorFlowNode": {
            const virtualAWOscNode = new VirtualAudioWorkletOscillatorNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            await virtualAWOscNode.render(
                nodeData.frequency || 440,
                nodeData.type || "sine"
            );
            manager.virtualNodes.set(node.id, virtualAWOscNode);
            break;
        }
        case "SampleFlowNode": {
            const virtualSampleFlowNode = new VirtualSampleFlowNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualSampleFlowNode.render();
            manager.virtualNodes.set(node.id, virtualSampleFlowNode);
            break;
        }
        case "OscillatorFlowNode": {
            const oscNode = new VirtualOscillatorNode(
                manager.audioContext,
                manager.eventBus,
                node,
                manager.resetConnectionsOfNode.bind(manager)
            );
            oscNode.render(
                nodeData.frequency || 440,
                nodeData.type || "sine",
                nodeData.pulseWidth,
                nodeData.periodicWaveHarmonics,
                nodeData.detune
            );
            manager.virtualNodes.set(node.id, oscNode);
            break;
        }
        case "GainFlowNode": {
            const virtualGainNode = new VirtualGainNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualGainNode.render(nodeData.gain ?? 1);
            manager.virtualNodes.set(node.id, virtualGainNode);
            break;
        }
        case "CrossfaderFlowNode": {
            const crossfaderNode = new VirtualCrossfaderNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            crossfaderNode.render(nodeData.crossfade || 0);
            manager.virtualNodes.set(node.id, crossfaderNode);
            break;
        }
        case "DelayFlowNode": {
            const delayNode = new VirtualDelayNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            const initialDelayMs = typeof nodeData.delayTime === 'number' && Number.isFinite(nodeData.delayTime) ? nodeData.delayTime : 500;
            delayNode.render(initialDelayMs);
            manager.virtualNodes.set(node.id, delayNode);
            break;
        }
        case "ReverbFlowNode": {
            const reverbNode = new VirtualReverbNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            const initialSeconds = typeof (node.data as any)?.seconds === 'number' ? (node.data as any).seconds : undefined;
            const initialDecay = typeof (node.data as any)?.decay === 'number' ? (node.data as any).decay : undefined;
            const initialReverse = typeof (node.data as any)?.reverse === 'boolean' ? (node.data as any).reverse : undefined;
            const initialFormula = typeof (node.data as any)?.formula === 'string' ? (node.data as any).formula : undefined;
            reverbNode.render(initialSeconds, initialDecay, initialReverse, initialFormula);
            manager.virtualNodes.set(node.id, reverbNode);
            break;
        }
        case "BiquadFilterFlowNode": {
            const virtualBiquadFilterNode = new VirtualBiquadFilterNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualBiquadFilterNode.render(
                nodeData.filterType || "lowpass",
                nodeData.frequency || 1000,
                nodeData.Q ?? 0,
                nodeData.gain ?? 0,
                nodeData.detune ?? 0
            );
            manager.virtualNodes.set(node.id, virtualBiquadFilterNode);
            break;
        }
        case "SvfDriveFilterFlowNode": {
            const virtualSvfDriveFilterNode = new VirtualSvfDriveFilterNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualSvfDriveFilterNode.render(nodeData);
            manager.virtualNodes.set(node.id, virtualSvfDriveFilterNode);
            break;
        }
        case "LadderFilterFlowNode": {
            const virtualLadderFilterNode = new VirtualLadderFilterNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualLadderFilterNode.render(nodeData);
            manager.virtualNodes.set(node.id, virtualLadderFilterNode);
            break;
        }
        case "KarplusFlowNode": {
            const virtualKarplusNode = new VirtualKarplusNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualKarplusNode.render(nodeData);
            manager.virtualNodes.set(node.id, virtualKarplusNode);
            break;
        }
        case "FMFlowNode": {
            const virtualFMNode = new VirtualFMNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualFMNode.render(nodeData);
            manager.virtualNodes.set(node.id, virtualFMNode);
            break;
        }
        case "WavetableFlowNode": {
            const virtualWavetableNode = new VirtualWavetableNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualWavetableNode.render(nodeData);
            manager.virtualNodes.set(node.id, virtualWavetableNode);
            break;
        }
        case "GranularFlowNode": {
            const virtualGranularNode = new VirtualGranularNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualGranularNode.render(nodeData);
            manager.virtualNodes.set(node.id, virtualGranularNode);
            break;
        }
        case "EnvGenFlowNode": {
            const virtualEnvGenNode = new VirtualEnvGenNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualEnvGenNode.render(nodeData);
            manager.virtualNodes.set(node.id, virtualEnvGenNode);
            break;
        }
        case "RingModFlowNode": {
            const virtualRingModNode = new VirtualRingModNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualRingModNode.render();
            manager.virtualNodes.set(node.id, virtualRingModNode);
            break;
        }
        case "ChorusFlowNode": {
            const virtualChorusNode = new VirtualChorusNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualChorusNode.render(nodeData);
            manager.virtualNodes.set(node.id, virtualChorusNode);
            break;
        }
        case "IIRFilterFlowNode": {
            const virtualIIRFilterNode = new VirtualIIRFilterNode(
                manager.audioContext,
                manager.eventBus,
                node,
                manager.resetConnectionsOfNode.bind(manager)
            );
            manager.virtualNodes.set(node.id, virtualIIRFilterNode);
            break;
        }
        case "DynamicCompressorFlowNode": {
            const compressor = new VirtualDynamicCompressorNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            compressor.render(
                nodeData.threshold || -24,
                nodeData.knee || 30,
                nodeData.ratio || 12,
                nodeData.attack || 0.003,
                nodeData.release || 0.25
            );
            manager.virtualNodes.set(node.id, compressor);
            break;
        }
        case "SequencerFlowNode": {
            const virtualSequencerNode = new VirtualSequencerNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualSequencerNode.setSendNodeOn((data) => manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOn'));
            virtualSequencerNode.setSendNodeOff((data) => manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOff'));
            manager.virtualNodes.set(node.id, virtualSequencerNode);
            break;
        }
        case "ScriptSequencerFlowNode": {
            const virtualScriptSequencerNode = new VirtualScriptSequencerNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualScriptSequencerNode.setSendNodeOn((data) => manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOn'));
            virtualScriptSequencerNode.setSendNodeOff((data) => manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOff'));
            manager.virtualNodes.set(node.id, virtualScriptSequencerNode);
            break;
        }
        case "SequencerFrequencyFlowNode": {
            const virtualSequencerFrequencyNode = new VirtualSequencerFrequencyNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualSequencerFrequencyNode.setSendNodeOn((data) => manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOn'));
            virtualSequencerFrequencyNode.setSendNodeOff((data) => manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOff'));
            manager.virtualNodes.set(node.id, virtualSequencerFrequencyNode);
            break;
        }
        case "MidiFileFlowNode": {
            const virtualMidiFileNode = new VirtualMidiFileNode(
                manager.eventBus,
                node,
                manager.emitEventsForConnectedEdges.bind(manager),
                manager.handleSendNodeEventByHandle.bind(manager)
            );
            manager.virtualNodes.set(node.id, virtualMidiFileNode);
            break;
        }
        case "DistortionFlowNode": {
            const virtualDistortionNode = new VirtualDistortionNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            let curveArray: Float32Array | null = null;
            if (nodeData.curve && typeof nodeData.curve === 'string') {
                const values = nodeData.curve.split(',').map(Number);
                curveArray = new Float32Array(values);
            }
            virtualDistortionNode.render(curveArray, nodeData.oversample || "none");
            manager.virtualNodes.set(node.id, virtualDistortionNode);
            break;
        }
        case "AutomationFlowNode": {
            const virtualAutomationNode = new VirtualAutomationNode(
                manager.eventBus,
                node
            );
            manager.eventBus.subscribe(node.id + '.main-input.sendNodeOn', (data: any) => {
                manager.handleConnectedEdgesAutomationNodeOn(node, data, 'receiveNodeOn');
            });
            manager.eventBus.subscribe(node.id + '.main-input.sendNodeOff', (data: any) => {
                manager.handleConnectedEdgesAutomationNodeOff(node, data, 'receiveNodeOff');
            });
            manager.virtualNodes.set(node.id, virtualAutomationNode);
            break;
        }
        case "ArpeggiatorFlowNode": {
            const virtualArpeggiatorNode = new VirtualArpeggiatorNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            manager.eventBus.subscribe(node.id + '.main-output.sendNodeOn', (data: any) => {
                manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOn');
            });
            manager.virtualNodes.set(node.id, virtualArpeggiatorNode);
            break;
        }
        case "AnalyzerNodeGPT": {
            const virtualAnalyzer = new VirtualAnalyzerNodeGPT(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualAnalyzer.render(nodeData);
            manager.virtualNodes.set(node.id, virtualAnalyzer);
            break;
        }
        case "OscilloscopeFlowNode": {
            const virtualOscilloscope = new VirtualOscilloscopeNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualOscilloscope.render(nodeData);
            manager.virtualNodes.set(node.id, virtualOscilloscope);
            break;
        }
        case "EqualizerFlowNode": {
            const virtualEqualizer = new VirtualEqualizerNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualEqualizer.render(nodeData);
            manager.virtualNodes.set(node.id, virtualEqualizer);
            break;
        }
        case "VocoderFlowNode": {
            const virtualVocoder = new VirtualVocoderNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualVocoder.render({
                bandCount: nodeData.bandCount,
                lowFreq: nodeData.lowFreq,
                highFreq: nodeData.highFreq,
                attackTime: nodeData.attackTime,
                releaseTime: nodeData.releaseTime,
                qFactor: nodeData.qFactor,
                carrierGain: nodeData.carrierGain,
                modulatorGain: nodeData.modulatorGain,
                outputGain: nodeData.outputGain
            });
            manager.virtualNodes.set(node.id, virtualVocoder);
            break;
        }
        case "MasterOutFlowNode": {
            const virtualMasterOut = new VirtualMasterOut(manager.audioContext, manager.eventBus, node);
            manager.virtualNodes.set(node.id, virtualMasterOut);
            break;
        }
        case "AudioWorkletFlowNode": {
            const dynamicWorkletNode = new VirtualAudioWorkletNode(
                manager.audioContext,
                manager.eventBus,
                node,
                'dynamic-worklet-processor'
            );
            await dynamicWorkletNode.createWorklet();
            manager.virtualNodes.set(node.id, dynamicWorkletNode);
            break;
        }
        case "NoiseFlowNode": {
            const noiseNode = new VirtualNoiseNode(
                manager.audioContext,
                manager.eventBus,
                node,
            );
            await noiseNode.init();
            manager.virtualNodes.set(node.id, noiseNode);
            break;
        }
        case "ButtonFlowNode": {
            const virtualButtonNode = new VirtualButtonNode(
                manager.eventManager,
                manager.eventBus,
                node
            );
            virtualButtonNode.render((node as ButtonNodeProps).data.assignedKey);
            virtualButtonNode.subscribeOnOff(
                (data) => manager.emitEventsForConnectedEdges(node, data, "receiveNodeOn"),
                (data) => manager.emitEventsForConnectedEdges(node, data, "receiveNodeOff")
            );
            manager.virtualNodes.set(node.id, virtualButtonNode);
            break;
        }
        case "MidiButtonFlowNode": {
            const virtualMidiButtonNode = new VirtualMidiButtonNode(
                manager.eventManager,
                manager.eventBus,
                node
            );
            virtualMidiButtonNode.render();
            virtualMidiButtonNode.subscribeOnOff(
                (data) => manager.emitEventsForConnectedEdges(node, data, "receiveNodeOn"),
                (data) => manager.emitEventsForConnectedEdges(node, data, "receiveNodeOff")
            );
            manager.virtualNodes.set(node.id, virtualMidiButtonNode);
            break;
        }
        case "OnOffButtonFlowNode": {
            const virtualOnOff = new VirtualOnOffButtonNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualOnOff.setSendNodeOn((data) => manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOn'));
            virtualOnOff.setSendNodeOff((data) => manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOff'));
            manager.virtualNodes.set(node.id, virtualOnOff);
            break;
        }
        case "SpeedDividerFlowNode": {
            const virtualSpeedDivider = new VirtualSpeedDividerNode(
                manager.eventBus,
                node
            );
            virtualSpeedDivider.setSendNodeOn((data) => manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOn'));
            virtualSpeedDivider.setSendNodeOff((data) => manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOff'));
            manager.eventBus.subscribe(node.id + '.divider-input.receiveNodeOn', (payload: any) => {
                virtualSpeedDivider['divider'] = typeof payload.value === 'number' ? Math.max(1, Math.min(10, payload.value)) : virtualSpeedDivider['divider'];
                virtualSpeedDivider['hitCount'] = 0;
                virtualSpeedDivider['emitHitCount'] && virtualSpeedDivider['emitHitCount']();
            });
            manager.eventBus.subscribe(node.id + '.multiplier-input.receiveNodeOn', (payload: any) => {
                virtualSpeedDivider['multiplier'] = typeof payload.value === 'number' ? Math.max(1, Math.min(10, payload.value)) : virtualSpeedDivider['multiplier'];
            });
            manager.virtualNodes.set(node.id, virtualSpeedDivider);
            break;
        }
        case "AudioSignalFreqShifterFlowNode": {
            const virtualAudioFreqShifter = new VirtualAudioSignalFreqShifterNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualAudioFreqShifter.render(nodeData.shift || 0);
            manager.virtualNodes.set(node.id, virtualAudioFreqShifter);
            break;
        }
        case "FlowEventFreqShifterFlowNode": {
            const virtualFlowEventFreqShifter = new VirtualFlowEventFreqShifterNode(
                manager.eventBus,
                node
            );
            virtualFlowEventFreqShifter.setSendNodeOn((data) => manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOn'));
            virtualFlowEventFreqShifter.setSendNodeOff((data) => manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOff'));
            virtualFlowEventFreqShifter.render(nodeData.shift || 0);
            manager.virtualNodes.set(node.id, virtualFlowEventFreqShifter);
            break;
        }
        case "ClockFlowNode": {
            const virtualClockNode = new VirtualClockNode(
                manager.eventBus,
                node,
                manager.emitEventsForConnectedEdges.bind(manager)
            );
            virtualClockNode.render((node as ClockNodeProps).data.bpm);
            manager.virtualNodes.set(node.id, virtualClockNode);
            break;
        }
        case "SwitchFlowNode": {
            const virtualSwitchNode = new VirtualSwitchNode(
                manager.eventBus,
                node
            );
            virtualSwitchNode.render();
            virtualSwitchNode.setSendNodeOn((data) => {
                manager.handleSendNodeEventSwitch(node, data, "receiveNodeOn");
            });
            manager.virtualNodes.set(node.id, virtualSwitchNode);
            break;
        }
        case "BlockingSwitchFlowNode": {
            const virtualBlockingSwitchNode = new VirtualBlockingSwitchNode(
                manager.eventBus,
                node
            );
            virtualBlockingSwitchNode.setSendNodeOn((data) => {
                manager.handleSendNodeEventSwitch(node, data, "receiveNodeOn");
            });
            virtualBlockingSwitchNode.setSendNodeOff((data) => {
                manager.handleSendNodeEventSwitch(node, data, "receiveNodeOff");
            });
            manager.virtualNodes.set(node.id, virtualBlockingSwitchNode);
            break;
        }
        case "ConstantFlowNode": {
            const virtualConstantNode = new VirtualConstantNode(
                manager.eventBus,
                node,
                (node as ConstantNodeProps).data.value || 0,
                manager.handleConnectedEdges.bind(manager)
            );
            manager.virtualNodes.set(node.id, virtualConstantNode);
            break;
        }
        case "FrequencyFlowNode": {
            const virtualFrequencyNode = new VirtualFrequencyNode(
                manager.eventBus,
                node,
                (node as FrequencyFlowNodeProps).data.frequency || 440,
                (node as FrequencyFlowNodeProps).data.frequencyType || "hz",
                (node as FrequencyFlowNodeProps).data.knobValue || 0,
                manager.handleConnectedEdges.bind(manager)
            );
            manager.virtualNodes.set(node.id, virtualFrequencyNode);
            break;
        }
        case "MidiFlowNote": {
            const virtualMidiNode = new VirtualMidiNode(node.id, node.id);
            manager.eventBus.subscribe(`${node.id}.main-input.sendNodeOn`, (payload: any) => {
                manager.handleConnectedEdges({ id: node.id, type: node.type, data: node.data }, { value: payload.value, frequency: payload.frequency, note: payload.note }, "receiveNodeOn");
            });
            manager.eventBus.subscribe(`${node.id}.main-input.sendNodeOff`, (payload: any) => {
                manager.handleConnectedEdges({ id: node.id, type: node.type, data: node.data }, { value: payload.value, frequency: payload.frequency, note: payload.note }, "receiveNodeOff");
            });
            const forward = (eventId: string) => {
                manager.eventBus.subscribe(`${node.id}.${eventId}.sendNodeOn`, (payload: any) => {
                    manager.handleConnectedEdges({ id: node.id, type: node.type, data: node.data }, payload, "receiveNodeOn", eventId);
                });
                manager.eventBus.subscribe(`${node.id}.${eventId}.sendNodeOff`, (payload: any) => {
                    manager.handleConnectedEdges({ id: node.id, type: node.type, data: node.data }, payload, "receiveNodeOff", eventId);
                });
            };
            ['note-on', 'note-off', 'control-change', 'program-change', 'poly-aftertouch', 'channel-aftertouch', 'pitch-bend', 'sysex', 'mtc', 'song-position', 'song-select', 'tune-request', 'clock'].forEach(forward);
            manager.virtualNodes.set(node.id, virtualMidiNode);
            break;
        }
        case "FunctionFlowNode": {
            const virtualFunctionNode = new VirtualFunctionNode(
                manager.eventBus,
                node,
                manager.handleConnectedEdges.bind(manager)
            );
            manager.virtualNodes.set(node.id, virtualFunctionNode);
            break;
        }
        case "EventFlowNode": {
            const virtualEventNode = new VirtualEventNode(
                manager.eventBus,
                node,
                manager.handleConnectedEdges.bind(manager)
            );
            manager.virtualNodes.set(node.id, virtualEventNode);
            break;
        }
        case "MidiKnobFlowNode": {
            const virtualMidiKnob = new VirtualMidiKnobNode(
                manager.eventBus,
                node,
                manager.handleConnectedEdges.bind(manager)
            );
            manager.virtualNodes.set(node.id, virtualMidiKnob);
            break;
        }
        case "LogFlowNode": {
            const virtualLogNode = new VirtualLogNode(
                manager.eventBus,
                node
            );
            manager.virtualNodes.set(node.id, virtualLogNode);
            break;
        }
        case "ADSRFlowNode": {
            const virtualADSRNode = new VirtualADSRNode(
                manager.eventBus,
                node,
                manager.handleConnectedEdgesADSRNodeOff.bind(manager),
                manager.handleConnectedEdgesADSRNodeOn.bind(manager)
            );
            manager.virtualNodes.set(node.id, virtualADSRNode);
            break;
        }
        case "FlowNode": {
            // Portable flows embed their sub-flow inline (data.embeddedFlow) so no
            // FlowLoader is needed; otherwise resolve the sub-flow by name.
            const customNode = (node as any).data?.embeddedFlow
                ?? await manager.loadFlowByName(
                    (node as any).data.selectedNode,
                    (node as any).data.selectedNodeFolderPath || ''
                );
            if (!customNode) {
                console.warn('FlowNode: sub-flow not found:', (node as any).data.selectedNode);
                break;
            }
            const edges = customNode.edges;
            for (const n of customNode.nodes) {
                await manager.addVirtualNode(n, node);
            }
            for (const edge of edges) {
                edge.source = node.id + "." + edge.source;
                edge.target = node.id + "." + edge.target;
            }
            manager.connectVirtualNodes(edges);
            const outputAudioMap = new Map<number, GainNode>();
            for (const n of customNode.nodes) {
                if ((n as any).type === 'OutputNode') {
                    const vOut = manager.virtualNodes.get((n as any).id) as any;
                    if (vOut?.audioNode instanceof GainNode) {
                        outputAudioMap.set((n as any).data?.index ?? 0, vOut.audioNode);
                    }
                }
            }
            const virtualFlowNode = new VirtualFlowNode(
                manager.eventBus,
                node,
                manager.handleConnectedEdgesFromOutput.bind(manager),
                customNode,
                undefined,
                outputAudioMap,
            );
            manager.virtualNodes.set(node.id, virtualFlowNode);
            break;
        }
        case "InputNode": {
            const virtualInputNode = new VirtualInputNode(
                manager.eventBus,
                node,
                manager.handleConnectedEdges.bind(manager)
            );
            manager.virtualNodes.set(node.id, virtualInputNode);
            break;
        }
        case "OutputNode": {
            const virtualOutputNode = new VirtualOutputNode(
                manager.eventBus,
                node,
                manager.handleConnectedEdges.bind(manager)
            );
            manager.virtualNodes.set(node.id, virtualOutputNode);
            const edge: Edge = {
                id: node.id + ".main-input",
                source: node.id,
                target: parentNode ? parentNode.id : null,
                sourceHandle: "main-input",
                targetHandle: "output-" + (node as any).data.index,
            };
            manager.virtualEdges.set(
                node.id,
                manager.sortEdges([...manager.virtualEdges.get(node.id) || [], edge])
            );
            break;
        }
        case "MouseTriggerButton": {
            const virtualMouseTrigger = new VirtualMouseTriggerButtonNode(
                manager.eventBus,
                node
            );
            virtualMouseTrigger.render();
            manager.eventBus.subscribe(node.id + '.main-input.sendNodeOn', (data: any) => {
                manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOn');
            });
            manager.eventBus.subscribe(node.id + '.main-input.sendNodeOff', (data: any) => {
                manager.emitEventsForConnectedEdges(node, data, 'receiveNodeOff');
            });
            manager.virtualNodes.set(node.id, virtualMouseTrigger);
            break;
        }
        case "RecordingFlowNode": {
            const virtualRecording = new VirtualRecordingNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            virtualRecording.render();
            manager.virtualNodes.set(node.id, virtualRecording);
            break;
        }
        case "MicFlowNode": {
            const virtualMic = new VirtualMicNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            await virtualMic.render();
            manager.virtualNodes.set(node.id, virtualMic);
            break;
        }
        case "WebRTCInputFlowNode": {
            const virtualWebRTCIn = new VirtualWebRTCInputNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            await virtualWebRTCIn.render();
            manager.virtualNodes.set(node.id, virtualWebRTCIn);
            break;
        }
        case "WebRTCOutputFlowNode": {
            const virtualWebRTCOut = new VirtualWebRTCOutputNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            await virtualWebRTCOut.render();
            manager.virtualNodes.set(node.id, virtualWebRTCOut);
            break;
        }
        case "WebRTCPulseNode": {
            const virtualWebRTC = new VirtualWebRTCPulseNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            await virtualWebRTC.render();
            manager.virtualNodes.set(node.id, virtualWebRTC);
            break;
        }
        case "WebSocketAudioNode": {
            const virtualWebSocket = new VirtualWebSocketAudioNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            await virtualWebSocket.render();
            manager.virtualNodes.set(node.id, virtualWebSocket);
            break;
        }
        case "UnisonBeginFlowNode": {
            const virtualUnisonBegin = new VirtualUnisonBeginNode(
                manager.audioContext,
                manager.eventBus,
                node,
                manager.handleConnectedEdges.bind(manager),
                (nodeId: string) => manager.virtualEdges.get(nodeId)
            );
            const unisonNodes = manager.collectUnisonNodes(node.id);
            const unisonOriginalIds = unisonNodes.map(n => n.id);
            const unisonEdges = manager.edgesRef.current.filter(e =>
                unisonOriginalIds.includes(e.source)
            );
            virtualUnisonBegin.setUnisonNodes(unisonNodes);
            for (let i = 0; i < node.data.numberOfVoices; i++) {
                for (let j = 0; j < unisonNodes.length; j++) {
                    const voiceNode = { ...unisonNodes[j], id: unisonOriginalIds[j] + "-" + i };
                    await manager.addVirtualNode(voiceNode, null);
                }
                const voiceEdges = unisonEdges.map(e => ({
                    ...e,
                    source: e.source + "-" + i,
                    target: unisonOriginalIds.includes(e.target) ? e.target + "-" + i : e.target,
                }));
                manager.connectVirtualNodes(voiceEdges);
            }
            manager.virtualNodes.set(node.id, virtualUnisonBegin);
            break;
        }
        case "UnisonEndFlowNode": {
            const virtualUnisonEnd = new VirtualUnisonEndNode(
                manager.audioContext,
                manager.eventBus,
                node
            );
            manager.virtualNodes.set(node.id, virtualUnisonEnd);
            break;
        }
        case "CommandInFlowNode": {
            const vCommandIn = new VirtualCommandInNode(
                manager.eventBus,
                node,
                manager.handleConnectedEdges.bind(manager)
            );
            manager.virtualNodes.set(node.id, vCommandIn);
            break;
        }
        case "CommandOutFlowNode": {
            const vCommandOut = new VirtualCommandOutNode(manager.eventBus, node);
            manager.virtualNodes.set(node.id, vCommandOut);
            break;
        }
        default:
            console.warn(`Unsupported node type: ${node.type}`);
    }
}
