import React from 'react';
import MasterOutFlowNode from '../nodes/MasterOutFlowNode';
import OscillatorFlowNode from '../nodes/OscillatorFlowNode';
import AudioWorkletOscillatorFlowNode from '../nodes/AudioWorkletOscillatorFlowNode';
import FlowNode from '../nodes/FlowNode';
import BiquadFilterFlowNode from '../nodes/BiquadFilterFlowNode';
import DynamicCompressorFlowNode from '../nodes/DynamicCompressorFlowNode';
import GainFlowNode from '../nodes/GainFlowNode';
import DelayFlowNode from '../nodes/DelayFlowNode';
import ReverbFlowNode from '../nodes/ReverbFlowNode';
import DistortionFlowNode from '../nodes/DistortionFlowNode';
import AudioWorkletFlowNode from '../nodes/AudioWorkletFlowNode';
import IIRFilterFlowNode from '../nodes/IIRFilterFlowNode';
import ADSRFlowNode from '../nodes/ADSRFlowNode';
import ButtonFlowNode from '../nodes/ButtonFlowNode';
import MidiButtonFlowNode from '../nodes/MidiButtonFlowNode';
import OnOffButtonFlowNode from '../nodes/OnOffButtonFlowNode';
import ClockFlowNode from '../nodes/ClockFlowNode';
import FrequencyFlowNode from '../nodes/FrequencyFlowNode';
import ConstantFlowNode from '../nodes/ConstantFlowNode';
import SwitchFlowNode from '../nodes/SwitchFlowNode';
import BlockingSwitchFlowNode from '../nodes/BlockingSwitchFlowNode';
import FunctionFlowNode from '../nodes/FunctionFlowNode';
import InputNode from '../nodes/InputNode';
import OutputNode from '../nodes/OutputNode';
import SampleFlowNode from '../nodes/SampleFlowNode';
import MidiFlowNote from '../nodes/MidiFlowNote';
import SequencerFlowNode from '../nodes/SequencerFlowNode';
import SequencerFrequencyFlowNode from '../nodes/SequencerFrequencyFlowNode';
import AutomationFlowNode from '../nodes/AutomationFlowNode';
import AnalyzerNodeGPT from '../nodes/AnalyzerNodeGPT';
import LogFlowNode from '../nodes/LogFlowNode';
import MidiKnobFlowNode from '../nodes/MidiKnobFlowNode';
import EventFlowNode from '../nodes/EventFlowNode';
import MouseTriggerButton from '../nodes/MouseTriggerButton';
import NoiseFlowNode from '../nodes/NoiseFlowNode';
import MicFlowNode from '../nodes/MicFlowNode';
import RecordingFlowNode from '../nodes/RecordingFlowNode';
import SpeedDividerFlowNode from '../nodes/SpeedDividerFlowNode';
import AudioSignalFreqShifterFlowNode from '../nodes/AudioSignalFreqShifterFlowNode';
import FlowEventFreqShifterFlowNode from '../nodes/FlowEventFreqShifterFlowNode';
import EqualizerFlowNode from '../nodes/EqualizerFlowNode';

export type ControlType = 'string' | 'number' | 'boolean' | 'select';

export interface DocControl {
  type: ControlType;
  label?: string;
  options?: string[];
}

export interface DocItem {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<any>;
  defaultProps: Record<string, any>;
  controls: Record<string, DocControl>;
}
// Base style for interactive node previews (ensures handles position correctly)
const baseNodeStyle: React.CSSProperties = {
  padding: '4px',
  border: '1px solid #2a3139',
  borderRadius: 6,
  background: '#1f1f1f',
  color: '#eee',
  position: 'relative',
};

// Simple visual-only handles used in docs to mimic XYFlow handles
// without requiring a full ReactFlow context.
const DocHandle: React.FC<{ side: 'left' | 'right'; top: number }> = ({ side, top }) => {
  const style: React.CSSProperties = {
    position: 'absolute',
    top,
    width: 10,
    height: 10,
    borderRadius: '50%',
    border: '1px solid #999',
    background: '#222',
  };
  if (side === 'left') {
    (style as any).left = -7;
  } else {
    (style as any).right = -7;
  }
  return <div style={style} />;
};

// Generic wrapper to render simple flow nodes that only need a label + style,
// while still allowing the Docs Playground to tweak the label prop.
const createNodePreview = (
  NodeComp: React.ComponentType<any>,
  fallbackLabel: string
): React.FC<{ label?: string }> => {
  const Preview: React.FC<{ label?: string }> = ({ label }) => (
    <div
      style={{
        borderRadius: 8,
        padding: 8,
        border: '1px solid #262a3a',
        background: '#050608',
        display: 'inline-flex',
        justifyContent: 'center',
      }}
    >
      <NodeComp
        data={{
          label: label ?? fallbackLabel,
          style: baseNodeStyle,
          onChange: () => {},
        } as any}
      />
    </div>
  );
  return Preview;
};

// Dedicated docs wrapper for the Gain node (with detailed state).
const GainNodeDoc: React.FC<{ label: string; gain: number }> = ({ label, gain }) => {
  return (
    <div
      style={{
        borderRadius: 8,
        padding: 8,
        border: '1px solid #262a3a',
        background: '#050608',
        display: 'inline-flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'inline-block',
        }}
      >
        <GainFlowNode
          key={label + ':' + gain}
          data={{
            label,
            gain,
            style: {
              ...baseNodeStyle,
            },
            onChange: () => {
              // For the docs view we ignore graph wiring and side effects.
            },
          }}
        />
        <DocHandle side="left" top={16} />
        <DocHandle side="left" top={70} />
        <DocHandle side="right" top={40} />
      </div>
    </div>
  );
};

// Interactive previews for all node types using either the generic wrapper
// or dedicated wrappers where more detailed defaults / handles are needed.
const MasterOutPreview = createNodePreview(MasterOutFlowNode, 'Master Out');
// Oscillator: provide sensible defaults and fake handles so the
// docs view shows a realistic node with visible connections.
const OscillatorPreview: React.FC<{
  label?: string;
  frequency?: number;
  detune?: number;
  type?: string;
  frequencyType?: 'hz' | 'midi' | 'lfo';
}> = ({
  label = 'Oscillator',
  frequency = 440,
  detune = 0,
  type = 'sine',
  frequencyType = 'hz',
}) => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <OscillatorFlowNode
        data={{
          label,
          frequency,
          detune,
          type,
          style: baseNodeStyle,
          frequencyType,
          midiNode: '',
          knobValue: 50,
          knobDetuneValue: 0,
          id: 'osc-doc',
          flowId: 'docs',
          freqMidiMapping: null,
          detuneMidiMapping: null,
          onChange: () => {},
        }}
      />
      {/* Mirror real handles from OscillatorFlowNode: main-input, frequency, detune, output */}
      <DocHandle side="left" top={20} />
      <DocHandle side="left" top={55} />
      <DocHandle side="left" top={139} />
      <DocHandle side="right" top={70} />
    </div>
  </div>
);
// AudioWorklet Oscillator: mirror FM, frequency and sync inputs plus main output.
const AudioWorkletOscPreview: React.FC<{
  label?: string;
  frequency?: number;
  detune?: number;
  type?: OscillatorType;
  frequencyType?: 'hz' | 'midi' | 'lfo';
}> = ({
  label = 'AW Oscillator',
  frequency = 440,
  detune = 0,
  type = 'sine',
  frequencyType = 'hz',
}) => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <AudioWorkletOscillatorFlowNode
        data={{
          label,
          frequency,
          detune,
          type,
          style: baseNodeStyle,
          frequencyType,
          midiNode: '',
          knobValue: 50,
          knobDetuneValue: 0,
          id: 'awosc-doc',
          flowId: 'docs',
          freqMidiMapping: null,
          detuneMidiMapping: null,
          onChange: () => {},
          syncConnected: false,
        }}
      />
      <DocHandle side="right" top={50} />
    </div>
  </div>
);
const FlowNodePreview = createNodePreview(FlowNode, 'Flow Node');
// Biquad filter with proper numeric defaults to avoid NaN and realistic UI.
const BiquadFilterPreview: React.FC<{
  label?: string;
  frequency?: number;
  Q?: number;
  gain?: number;
  type?: string;
}> = ({
  label = 'Filter',
  frequency = 1000,
  Q = 1,
  gain = 0,
  type = 'lowpass',
}) => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <BiquadFilterFlowNode
        data={{
          label,
          frequency,
          detune: 0,
          Q,
          gain,
          type,
          style: baseNodeStyle,
          id: 'biquad-doc',
          flowId: 'docs',
          onChange: () => {},
          freqMidiMapping: null,
          detuneMidiMapping: null,
          qMidiMapping: null,
          gainMidiMapping: null,
        }}
      />
      {/* Mirror real handles from BiquadFilterFlowNode: main-input, frequency, detune, Q, gain, output */}
      <DocHandle side="left" top={20} />
      <DocHandle side="left" top={55} />
      <DocHandle side="left" top={95} />
      <DocHandle side="left" top={135} />
      <DocHandle side="left" top={175} />
      <DocHandle side="right" top={100} />
    </div>
  </div>
);
// Dynamic compressor with safe numeric defaults.
const DynamicCompressorPreview: React.FC<{
  label?: string;
  threshold?: number;
  knee?: number;
  ratio?: number;
  attack?: number;
  release?: number;
}> = ({
  label = 'Compressor',
  threshold = -24,
  knee = 30,
  ratio = 4,
  attack = 0.01,
  release = 0.25,
}) => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <DynamicCompressorFlowNode
        data={{
          label,
          threshold,
          knee,
          ratio,
          attack,
          release,
          style: baseNodeStyle,
          id: 'comp-doc',
          flowId: 'docs',
          onChange: () => {},
          thresholdMidiMapping: null,
          kneeMidiMapping: null,
          ratioMidiMapping: null,
          attackMidiMapping: null,
          releaseMidiMapping: null,
        }}
      />
      {/* Mirror real handles from DynamicCompressorFlowNode: main-input, threshold, knee, ratio, attack, release, output */}
      <DocHandle side="left" top={20} />
      <DocHandle side="left" top={55} />
      <DocHandle side="left" top={95} />
      <DocHandle side="left" top={135} />
      <DocHandle side="left" top={175} />
      <DocHandle side="left" top={215} />
      <DocHandle side="right" top={120} />
    </div>
  </div>
);
// Delay with a visible main input/output handle.
const DelayPreview: React.FC<{
  label?: string;
  delayTime?: number;
}> = ({ label = 'Delay', delayTime = 500 }) => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <DelayFlowNode
        data={{
          label,
          delayTime,
          style: baseNodeStyle,
          delayMidiMapping: null,
          knobValue: 0.5,
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={22} />
      <DocHandle side="right" top={22} />
    </div>
  </div>
);
// Reverb with handles.
const ReverbPreview: React.FC<{
  label?: string;
  seconds?: number;
  decay?: number;
  reverse?: boolean;
}> = ({ label = 'Reverb', seconds = 3, decay = 2, reverse = false }) => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <ReverbFlowNode
        data={{
          label,
          seconds,
          decay,
          reverse,
          style: baseNodeStyle,
          secondsMidiMapping: null,
          decayMidiMapping: null,
          secondsKnobValue: 0.4,
          decayKnobValue: 0.4,
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={24} />
      <DocHandle side="left" top={79} />
      <DocHandle side="left" top={149} />
      <DocHandle side="left" top={179} />
      <DocHandle side="left" top={209} />
      <DocHandle side="right" top={100} />
    </div>
  </div>
);
// Distortion with handles and reasonable defaults.
const DistortionPreview: React.FC<{
  label?: string;
  drive?: number;
  preset?: string;
  formula?: string;
}> = ({
  label = 'Distortion',
  drive = 1,
  preset = 'Soft Clip',
  formula = 'Math.tanh(x*3)',
}) => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <DistortionFlowNode
        data={{
          label,
          curve: '',
          oversample: 'none',
          preset,
          formula,
          style: baseNodeStyle,
          drive: 1,
          driveKnob: 50,
          driveMidiMapping: null,
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={24} />
      <DocHandle side="right" top={24} />
    </div>
  </div>
);
const AudioWorkletPreview = createNodePreview(AudioWorkletFlowNode, 'AudioWorklet');
// IIR filter with visible main/feedforward/feedback handles.
const IIRFilterPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <IIRFilterFlowNode
        data={{
          label: 'IIR Filter',
          feedforward: undefined,
          feedback: undefined,
          ffMidiMappings: [],
          fbMidiMappings: [],
          style: baseNodeStyle,
          id: 'iir-doc',
          flowId: 'docs',
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={22} />
      <DocHandle side="left" top={78} />
      <DocHandle side="left" top={130} />
      <DocHandle side="right" top={60} />
    </div>
  </div>
);
// ADSR with all 7 parameter input handles at correct positions.
const ADSRPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <ADSRFlowNode
        data={{
          label: 'ADSR',
          attackTime: 0.1,
          sustainTime: 0.5,
          sustainLevel: 0.7,
          releaseTime: 0.3,
          minPercent: 0,
          maxPercent: 100,
          style: baseNodeStyle,
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={22} />
      <DocHandle side="left" top={52} />
      <DocHandle side="left" top={82} />
      <DocHandle side="left" top={112} />
      <DocHandle side="left" top={142} />
      <DocHandle side="left" top={172} />
      <DocHandle side="left" top={202} />
      <DocHandle side="right" top={120} />
    </div>
  </div>
);
const ButtonPreview = createNodePreview(ButtonFlowNode, 'Button');
const MidiButtonPreview = createNodePreview(MidiButtonFlowNode, 'MIDI Button');
const OnOffButtonPreview = createNodePreview(OnOffButtonFlowNode, 'On/Off Button');
// Log: input-only debugging node that displays event history.
const LogPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <LogFlowNode
        data={{
          id: 'log-doc',
          label: 'Log',
          maxEntries: 20,
          style: baseNodeStyle,
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={30} />
    </div>
  </div>
);
// Event node: main input on left, output on right, with listener and function transform
const EventPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <EventFlowNode
        data={{
          id: 'event-doc',
          listener: '',
          functionCode: 'return main;',
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={32} />
      <DocHandle side="right" top={95} />
    </div>
  </div>
);
// Mouse Trigger: interactive button with both input (for chaining) and output (for triggering)
const MouseTriggerPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <MouseTriggerButton
        data={{
          id: 'mouse-trigger-doc',
          label: 'Trigger',
          style: {},
          onChange: () => {},
        }}
      />
      <DocHandle side="right" top={23} />
    </div>
  </div>
);
// Noise generator: audio source node with output only, no inputs
const NoisePreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <NoiseFlowNode
        data={{
          id: 'noise-doc',
          label: 'Noise',
          noiseType: 'white',
          style: {},
        }}
      />
    </div>
  </div>
);
// Clock with simple fake handles and default BPM.
const ClockPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <ClockFlowNode
        id="clock-doc"
        data={{
          bpm: 120,
          onChange: () => {},
          sendOff: false,
          offDelayMs: undefined,
          sendOffBeforeNextOn: false,
        }}
      />
      <DocHandle side="left" top={40} />
      <DocHandle side="right" top={40} />
    </div>
  </div>
);
// Frequency utility with an obvious input handle.
const FrequencyPreview: React.FC<{
  frequency?: number;
  frequencyType?: 'hz' | 'midi' | 'lfo';
  knobValue?: number;
}> = ({ frequency = 440, frequencyType = 'hz', knobValue = 50 }) => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <FrequencyFlowNode
        data={{
          value: frequency,
          frequency: frequency,
          frequencyType,
          knobValue,
          id: 'freq-doc',
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={20} />
      <DocHandle side="right" top={20} />
    </div>
  </div>
);
// Constant value node with input/output handles.
const ConstantPreview: React.FC<{ value?: string }> = ({ value = '1.0' }) => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <ConstantFlowNode
        data={{
          value,
          id: 'const-doc',
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={12} />
      <DocHandle side="right" top={12} />
    </div>
  </div>
);
// Switch with two input handles (main and reset) and multiple outputs.
const SwitchPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <SwitchFlowNode
        data={{
          numOutputs: 2,
          activeOutput: 0,
          id: 'switch-doc',
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={25} />
      <DocHandle side="left" top={75} />
    </div>
  </div>
);
// Blocking Switch with two input handles (input and reset) and multiple outputs with source tracking.
const BlockingSwitchPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <BlockingSwitchFlowNode
        data={{
          numOutputs: 2,
          id: 'blocking-switch-doc',
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={30} />
      <DocHandle side="left" top={70} />
    </div>
  </div>
);
// Function node with main input + additional configurable inputs/outputs.
const FunctionPreview: React.FC<{
  functionCode?: string;
  numInputs?: number;
  numOutputs?: number;
}> = ({
  functionCode = 'return Number(main) * 2;',
  numInputs = 1,
  numOutputs = 1,
}) => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
      maxWidth: 420,
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <FunctionFlowNode
        data={{
          id: 'function-doc',
          functionCode,
          value: '',
          numInputs,
          numOutputs,
          inputDefaults: Array.from({ length: numInputs }, () => '0'),
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={40} />
      {Array.from({ length: numInputs }).map((_, i) => (
        <DocHandle key={`input-${i}`} side="left" top={70 + i * 20} />
      ))}
      {Array.from({ length: numOutputs }).map((_, i) => (
        <DocHandle key={`output-${i}`} side="right" top={20 + i * 17} />
      ))}
    </div>
  </div>
);
// Input bus node: output handle only (receives via EventBus, no visible input).
const InputPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <InputNode
        id="input-doc"
        data={{
          index: 0,
          value: null,
          onChange: () => {},
        }}
      />
      <DocHandle side="right" top={32} />
    </div>
  </div>
);
// Output bus node: input handle only (outputs via EventBus, no visible output).
const OutputPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <OutputNode
        id="output-doc"
        data={{
          index: 0,
          value: null,
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={32} />
    </div>
  </div>
);
// Sample player: dynamic segment input handles on left, main audio output on right.
const SamplePreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
      maxWidth: 420,
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <SampleFlowNode
        data={{
          id: 'sample-doc',
          label: 'Sample',
          audioFileName: 'demo.wav',
          style: baseNodeStyle,
          onChange: () => {},
        } as any}
      />
      {/* Show 3 example segment input handles */}
      <DocHandle side="left" top={180} />
      <DocHandle side="left" top={320} />
      <DocHandle side="left" top={460} />
      {/* Main audio output */}
      <DocHandle side="right" top={60} />
    </div>
  </div>
);
// MIDI note source: output only (input from Web MIDI API hardware).
const MidiFlowNotePreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <MidiFlowNote
        data={{
          id: 'midi-note-doc',
          device: undefined,
          channel: 'any',
          lastNote: '',
          frequency: 0,
          enabled: true,
          onChange: () => {},
        }}
      />
      <DocHandle side="right" top={20} />
    </div>
  </div>
);
// Sequencer: main clock input + outputs on the right.
const SequencerPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
      maxWidth: 480,
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <SequencerFlowNode
        data={{
          id: 'seq-doc',
          label: 'Sequencer',
          squares: 8,
          rows: 3,
          activeIndex: 0,
          style: baseNodeStyle,
          onChange: () => {},
        }}
      />
      {/* Input handles */}
      <DocHandle side="left" top={30} />
      <DocHandle side="left" top={70} />
      {/* Output handles: sync + 3 row outputs */}
      <DocHandle side="right" top={15} />
      <DocHandle side="right" top={40} />
      <DocHandle side="right" top={57} />
      <DocHandle side="right" top={73} />
    </div>
  </div>
);
// Sequencer (frequency): same as sequencer with frequency outputs.
const SequencerFreqPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
      maxWidth: 480,
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <SequencerFrequencyFlowNode
        data={{
          id: 'seq-freq-doc',
          squares: 8,
          rows: 3,
          frequencyType: 'midi',
          defaultPulseMs: 100,
          style: baseNodeStyle,
          onChange: () => {},
        }}
      />
      {/* Input handles */}
      <DocHandle side="left" top={30} />
      <DocHandle side="left" top={70} />
      {/* Output handles: sync + 3 row outputs */}
      <DocHandle side="right" top={15} />
      <DocHandle side="right" top={40} />
      <DocHandle side="right" top={57} />
      <DocHandle side="right" top={73} />
    </div>
  </div>
);
// Automation curve: trigger input and modulation output.
const AutomationPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 12,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
      maxWidth: 640,
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <AutomationFlowNode
        data={{
          id: 'automation-doc',
          label: 'Automation',
          lengthSec: 2,
          points: undefined,
          min: 0,
          max: 200,
          loop: true,
          style: baseNodeStyle,
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={60} />
      <DocHandle side="right" top={60} />
    </div>
  </div>
);
// Analyzer: audio input and pass-through output.
const AnalyzerPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <AnalyzerNodeGPT
        data={{
          id: 'analyzer-doc',
          label: 'Analyzer',
          mode: 'bars',
          fftSize: 1024,
          minDecibels: -96,
          maxDecibels: -10,
          smoothingTimeConstant: 0.8,
          colorPreset: 'aurora',
          style: undefined,
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={70} />
      <DocHandle side="right" top={70} />
    </div>
  </div>
);
// MIDI Knob helper: trigger input on left, value output on right.
const MidiKnobPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <MidiKnobFlowNode
        id="midi-knob-doc"
        data={{
          label: 'Macro',
          min: 0,
          max: 1,
          curve: 'linear',
          value: 0.5,
          midiMapping: null,
          controlsOpen: false,
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={22} />
      <DocHandle side="right" top={18} />
    </div>
  </div>
);
// Mic: audio output only.
const MicPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <MicFlowNode
        data={{
          id: 'mic-doc',
          label: 'Mic',
          selectedDeviceId: undefined,
          devices: [],
          autoStart: false,
          style: baseNodeStyle,
          onChange: () => {},
        }}
      />
      <DocHandle side="right" top={36} />
    </div>
  </div>
);
// Recording: pass-through main input, trigger input, and output.
const RecordingPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <RecordingFlowNode
        data={{
          id: 'recording-doc',
          label: 'Recording',
          isRecording: false,
          recordedMs: 0,
          style: baseNodeStyle,
          onChange: () => {},
          holdMode: false,
        }}
      />
      <DocHandle side="left" top={32} />
    </div>
  </div>
);
// Speed Divider: multiple inputs and one output.
const SpeedDividerPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <SpeedDividerFlowNode
        data={{
          id: 'speed-div-doc',
          divider: 2,
          multiplier: 1,
          incomingBpm: 0,
          style: baseNodeStyle,
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={12} />
      <DocHandle side="left" top={38} />
      <DocHandle side="right" top={28} />
    </div>
  </div>
);
// Audio Signal Freq Shifter: two input handles (audio and shift) and one audio output.
const AudioSignalFreqShiftPreview: React.FC = () => (
  <div style={{ ...baseNodeStyle, width: 110, minHeight: 160 }}>
    {/* Header */}
    <div style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' }}>
      🔊 AUDIO SHIFT
    </div>
    {/* Audio Input (main-input) */}
    <DocHandle side="left" top={25} />
    <div style={{ position: 'absolute', left: 14, top: 19, fontSize: 7, color: '#4CAF50' }}>
      🔊
    </div>
    {/* Shift Input (receives shift amount in semitones) */}
    <DocHandle side="left" top={65} />
    <div style={{ position: 'absolute', left: 14, top: 59, fontSize: 7, color: '#FF9800' }}>
      ±
    </div>
    {/* Audio Output */}
    <DocHandle side="right" top={25} />
    <div style={{ position: 'absolute', right: 14, top: 19, fontSize: 7, color: '#4CAF50' }}>
      🔊
    </div>
    {/* Content */}
    <div style={{ fontSize: 9, textAlign: 'center', marginTop: 8 }}>
      <div>Shift: 0 semitones</div>
      <div style={{ fontSize: 8, color: '#999', marginTop: 4 }}>
        Shifts audio signal<br/>frequencies using<br/>AudioWorklet
      </div>
    </div>
  </div>
);
// Flow Event Freq Shifter: two input handles (trigger and shift) and one output.
const FlowEventFreqShiftPreview: React.FC = () => (
  <div style={{ ...baseNodeStyle, width: 110, minHeight: 160 }}>
    {/* Header */}
    <div style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' }}>
      ⚡ EVENT SHIFT
    </div>
    {/* Trigger Input (receives frequency events) */}
    <DocHandle side="left" top={25} />
    <div style={{ position: 'absolute', left: 14, top: 19, fontSize: 7, color: '#2196F3' }}>
      ▶
    </div>
    {/* Shift Input (receives shift amount in semitones) */}
    <DocHandle side="left" top={65} />
    <div style={{ position: 'absolute', left: 14, top: 59, fontSize: 7, color: '#FF9800' }}>
      ±
    </div>
    {/* Flow Output (emits shifted frequency) */}
    <DocHandle side="right" top={25} />
    <div style={{ position: 'absolute', right: 14, top: 19, fontSize: 7, color: '#FF9800' }}>
      ⚡
    </div>
    {/* Content */}
    <div style={{ fontSize: 9, textAlign: 'center', marginTop: 8 }}>
      <div>Shift: 0 semitones</div>
      <div style={{ fontSize: 8, color: '#999', marginTop: 4 }}>
        Shifts frequency values<br/>in flow events<br/>using 2^(n/12) ratio
      </div>
    </div>
  </div>
);
// Equalizer: drafted UI with explicit DRAFTED badge to show it’s not finished.
const EqualizerPreview: React.FC = () => (
  <div
    style={{
      borderRadius: 8,
      padding: 8,
      border: '1px solid #262a3a',
      background: '#050608',
      display: 'inline-flex',
      justifyContent: 'center',
    }}
  >
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        style={{
          position: 'absolute',
          top: -10,
          left: 0,
          padding: '2px 6px',
          borderRadius: 4,
          background: '#5b3a1a',
          color: '#ffd7a1',
          fontSize: 10,
          fontWeight: 600,
        }}
      >
        DRAFTED
      </div>
      <EqualizerFlowNode
        data={{
          id: 'eq-doc',
          label: 'Equalizer',
          bands: undefined,
          style: undefined,
          onChange: () => {},
        }}
      />
      <DocHandle side="left" top={70} />
      <DocHandle side="right" top={70} />
    </div>
  </div>
);

export const docs: DocItem[] = [
  {
    id: 'master-out-node',
    title: 'Master Out',
    description: [
      'Role',
      '- Final mix / output stage for the entire graph. Collects one or more audio streams and routes them to the audio hardware (speakers/headphones).',
      '',
      'Inputs',
      '- main-input (left): summed audio from upstream nodes (mixers, effects, instrument chains, etc.).',
      '',
      'Output',
      '- output (right): system audio output. In practice this goes to the AudioContext destination; there is usually no need to connect this further inside the graph.',
      '',
      'Typical use cases',
      '- As the final node that everything eventually feeds into.',
      '- For global metering, limiting, or recording taps placed just before the output stage.',
    ].join('\n'),
    component: MasterOutPreview,
    defaultProps: {
      label: 'Master Out',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'oscillator-node',
    title: 'Oscillator',
    description: [
      'Role',
      '- Core tone generator. Produces a continuous periodic waveform (sine, square, saw, etc.) at a given frequency.',
      '',
      'Inputs',
      '- main-input (left, top): gate/trigger events (receiveNodeOn/receiveNodeOff) used by VirtualOscillatorNode to start/stop the underlying Web Audio OscillatorNode.',
      '- frequency (left, middle): control signal that sets or modulates the oscillator frequency. Typically driven by VirtualFrequencyNode, sequencers or envelopes.',
      '- detune (left, bottom): fine frequency offset control, often mapped to a MIDI knob or slow modulation source for vibrato and detune effects.',
      '',
      'Output',
      '- output (right): raw audio waveform at the current frequency and shape. Typically fed into filters, mixers, gain stages or effects.',
      '',
      'Typical use cases',
      '- Building synth voices as the primary sound source before filters and envelopes.',
      '- Creating LFO-style control signals when tuned to very low frequencies.',
      '',
      'Behaviour',
      '- VirtualOscillatorNode rebuilds a Web Audio OscillatorNode on each render, applying the latest frequency and type (waveform) values.',
      '- It subscribes to main-input.receiveNodeOn / main-input.receiveNodeOff on the EventBus; receiveNodeOn ensures the oscillator is running, and receiveNodeOff stops it and marks playbackState as "stopped".',
      '- If no explicit frequency/type are provided, it falls back to 440 Hz and a sine waveform.',
    ].join('\n'),
    component: OscillatorPreview,
    defaultProps: {
      label: 'Oscillator',
      frequency: 440,
      detune: 0,
      type: 'sine',
      frequencyType: 'hz',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
      frequency: { type: 'number', label: 'Frequency (Hz)' },
      detune: { type: 'number', label: 'Detune (cents)' },
      type: {
        type: 'select',
        label: 'Waveform',
        options: ['sine', 'square', 'sawtooth', 'triangle'],
      },
      frequencyType: {
        type: 'select',
        label: 'Frequency Mode',
        options: ['hz', 'midi', 'lfo'],
      },
    },
  },
  {
    id: 'audio-worklet-oscillator-node',
    title: 'AudioWorklet Oscillator',
    description: [
      'Role',
      '- Custom oscillator implemented via an AudioWorklet. Similar to the standard Oscillator node but with more flexible or higher-quality DSP running in its own worklet context.',
      '',
      'Inputs',
      '- main-input (left, top): FM/audio modulation input. Feeds the worklet\'s first input for frequency or amplitude modulation of the core oscillator.',
      '- frequency (left, middle): control/event input that updates the target frequency (via VirtualAudioWorkletOscillatorNode) rather than feeding raw audio.',
      '- sync (left, bottom): hard-sync/control input. Pulses on this handle are used to reset or synchronise the internal oscillator phase via the worklet.',
      '',
      'Output',
      '- output (right): audio generated by the worklet-based oscillator.',
      '',
      'Typical use cases',
      '- Advanced or experimental oscillator shapes not available in the built-in Web Audio oscillator.',
      '- CPU-intensive tone generation that benefits from running in an AudioWorklet.',
      '- Hard-sync and FM-style patches where separate FM, frequency and sync inputs are needed.',
      '',
      'Behaviour',
      '- VirtualAudioWorkletOscillatorNode creates a dedicated AudioWorkletNode ("hard-sync-oscillator") with three inputs and one output, wiring main-input, frequency control and sync into the processor.',
      '- It ensures the worklet module is loaded, then sets initial frequency, detune and type via AudioParam/port messages.',
      '- It subscribes to main-input.receiveNodeOn / main-input.receiveNodeOff events to connect or disconnect the worklet output from the destination, effectively starting and stopping the oscillator in the graph.',
    ].join('\n'),
    component: AudioWorkletOscPreview,
    defaultProps: {
      label: 'AudioWorklet Osc',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'flow-node',
    title: 'Flow Node (Subgraph)',
    description: [
      'Role',
      '- Container node representing a saved flow or subgraph. Lets you reuse complex patches as a single building block.',
      '',
      'Inputs',
      '- main-input (left): audio or event signal that enters the internal subgraph.',
      '',
      'Output',
      '- output (right): audio or event signal produced by the internal subgraph and exposed back to the main graph.',
      '',
      'Typical use cases',
      '- Packaging commonly used chains (e.g. “lead synth + FX” or “drum bus”) into one reusable node.',
      '- Keeping large graphs visually manageable by collapsing detail.',
    ].join('\n'),
    component: FlowNodePreview,
    defaultProps: {
      label: 'Flow Node',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'biquad-filter-node',
    title: 'Biquad Filter',
    description: [
      'Role',
      '- Tone-shaping filter based on the Web Audio BiquadFilterNode. Supports modes such as low-pass, high-pass, band-pass, etc.',
      '',
      'Inputs',
      '- main-input (left, top): audio signal to be filtered. Typically fed from oscillators, samples or upstream effects.',
      '- frequency (left, upper-middle): control/modulation input for the filter cutoff frequency (20 Hz to 20 kHz). Can be driven by envelopes, LFOs or automation to create sweeps and dynamic tonal shifts.',
      '- detune (left, middle): fine-tuning offset in cents (-1200 to +1200). Used for subtle frequency shifts or modulation effects.',
      '- Q (left, lower-middle): resonance/quality factor control (0.0001 to 40). Higher Q values create more pronounced peaks or notches at the cutoff frequency.',
      '- gain (left, bottom): filter gain in dB (-40 to +40). Primarily used with peaking, lowshelf and highshelf filter types to boost or cut specific frequency ranges.',
      '',
      'Output',
      '- output (right): filtered version of the incoming audio.',
      '',
      'Typical use cases',
      '- Sculpting the spectrum of oscillators, samples or complete mixes.',
      '- Creating sweeps and resonant effects via modulated cutoff and Q.',
      '- Building multimode filter patches (lowpass, highpass, bandpass, notch, shelving, peaking) for subtractive synthesis.',
      '',
      'Behaviour',
      '- VirtualBiquadFilterNode creates a Web Audio BiquadFilterNode and applies the filter type and frequency during render().',
      '- Deterministic defaults: detune, Q and gain are explicitly set to 0 to ensure reusable automation and consistent behaviour across filter modes.',
      '- Filter type can be changed dynamically (lowpass, highpass, bandpass, lowshelf, highshelf, peaking, notch, allpass) to switch tonal characteristics without rewiring.',
    ].join('\n'),
    component: BiquadFilterPreview,
    defaultProps: {
      label: 'Filter',
      frequency: 1000,
      Q: 1,
      gain: 0,
      type: 'lowpass',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
      frequency: { type: 'number', label: 'Cutoff (Hz)' },
      Q: { type: 'number', label: 'Resonance (Q)' },
      gain: { type: 'number', label: 'Gain (dB)' },
      type: {
        type: 'select',
        label: 'Mode',
        options: ['lowpass', 'highpass', 'bandpass', 'notch', 'lowshelf', 'highshelf', 'peaking'],
      },
    },
  },
  {
    id: 'dynamic-compressor-node',
    title: 'Dynamic Compressor',
    description: [
      'Role',
      '- Dynamics processor that reduces the dynamic range of an audio signal (making loud parts quieter and/or quiet parts louder).',
      '',
      'Inputs',
      '- main-input (left, top): audio signal to be compressed. Typically fed from instruments, buses or entire submixes.',
      '- threshold (left, upper): dB level (-100 to 0) above which compression starts. Signals below this level pass through unaffected; signals above are attenuated according to the ratio.',
      '- knee (left, upper-middle): transition range (0 to 40 dB) around the threshold. A soft knee (higher values) creates a gradual compression curve; a hard knee (0 dB) applies compression abruptly once the threshold is crossed.',
      '- ratio (left, middle): compression ratio (1:1 to 20:1). Higher ratios (e.g., 10:1 or more) produce stronger compression or limiting; lower ratios (2:1 to 4:1) provide gentle dynamic control.',
      '- attack (left, lower-middle): how quickly compression engages after the signal exceeds the threshold (0 to 1 second). Fast attack (< 10 ms) tames transients; slow attack (> 50 ms) lets transients through for punchier drums or percussive material.',
      '- release (left, bottom): how quickly compression disengages after the signal drops below the threshold (0 to 1 second). Fast release restores dynamics quickly; slow release produces smoother, more sustained compression.',
      '',
      'Output',
      '- output (right): compressed audio with reduced dynamic range.',
      '',
      'Typical use cases',
      '- Smoothing out level spikes on instruments or buses.',
      '- Glue compression on submixes or the master bus.',
      '- Sidechain-style pumping effects (when threshold/ratio are modulated in response to external signals).',
      '- Dynamic range control for vocals, bass or full mixes.',
      '',
      'Behaviour',
      '- VirtualDynamicCompressorNode creates a Web Audio DynamicsCompressorNode and applies threshold, knee, ratio, attack and release values during render().',
      '- Defaults: threshold -24 dB, knee 30 dB, ratio 12:1, attack 3 ms, release 250 ms—suited for general-purpose compression.',
      '- All five parameters are exposed as AudioParams, allowing smooth real-time modulation from envelopes, LFOs or automation nodes.',
    ].join('\n'),
    component: DynamicCompressorPreview,
    defaultProps: {
      label: 'Compressor',
      threshold: -24,
      knee: 30,
      ratio: 4,
      attack: 0.01,
      release: 0.25,
    },
    controls: {
      label: { type: 'string', label: 'Label' },
      threshold: { type: 'number', label: 'Threshold (dB)' },
      knee: { type: 'number', label: 'Knee (dB)' },
      ratio: { type: 'number', label: 'Ratio' },
      attack: { type: 'number', label: 'Attack (s)' },
      release: { type: 'number', label: 'Release (s)' },
    },
  },
  {
    id: 'gain-node',
    title: 'Gain Node',
    description: [
      'Role',
      '- Primary amplitude control block in the flow. Scales an incoming audio signal by a gain factor and passes the result on.',
      '',
      'Inputs',
      '- main-input (left, top): audio signal in (any mono or stereo stream from oscillators, samplers, filters, effects, etc.).',
      '- gain (left, bottom): control/modulation signal that shapes the gain value over time. Typical sources: ADSR envelopes, LFOs, sequencers, automation or MIDI-derived control flows.',
      '',
      'Output',
      '- output (right): audio signal out after applying the current gain. Usually feeds mixers, effect chains, or the master output.',
      '',
      'Gain value semantics',
      '- 0  → full mute (no audio passes through).',
      '- 1  → unity gain (signal level unchanged).',
      '- >1 → amplification (louder signal, may clip if pushed hard into downstream stages).',
      '- Very large values can intentionally overdrive later nodes for creative distortion if desired.',
      '',
      'Knob behaviour',
      '- Non-linear mapping from knob position to numeric gain so that the musically useful 0..≈5 range has fine control while still allowing very high gains near the end of the rotation.',
      '- The numeric gain shown under the knob is the actual linear factor applied to the audio signal.',
      '',
      'Typical use cases',
      '- Balancing levels between parallel branches of the graph.',
      '- Building fades, swells and volume automation (often by feeding the gain input from ADSR or LFO nodes).',
      '- Implementing ducking/side-chain style effects by modulating the gain from another signal path.',
      '- General loudness shaping before or after filters, delays, reverbs and other processing blocks.',
    ].join('\n'),
    component: GainNodeDoc,
    defaultProps: {
      label: 'Gain',
      gain: 1,
    },
    controls: {
      label: { type: 'string', label: 'Label' },
      gain: { type: 'number', label: 'Gain' },
    },
  },
  {
    id: 'delay-node',
    title: 'Delay',
    description: [
      'Role',
      '- Creates echoes by delaying the incoming audio signal by a configurable time, optionally with feedback for repeating echoes.',
      '',
      'Inputs',
      '- main-input (left): audio signal to be delayed.',
      '- time / feedback / mix parameter handles: control signals that adjust delay time, feedback amount and wet/dry mix when exposed in the UI.',
      '',
      'Output',
      '- output (right): combination of original and delayed signal, depending on the mix setting.',
      '',
      'Typical use cases',
      '- Slapback and echo effects on instruments or vocals.',
      '- Rhythmic delay patterns when driven from a clock-synchronised modulation source.',
    ].join('\n'),
    component: DelayPreview,
    defaultProps: {
      label: 'Delay',
      delayTime: 500,
    },
    controls: {
      label: { type: 'string', label: 'Label' },
      delayTime: { type: 'number', label: 'Delay Time (ms)' },
    },
  },
  {
    id: 'reverb-node',
    title: 'Reverb',
    description: [
      'Role',
      '- Generates reverb using impulse response convolution. Creates an impulse buffer dynamically based on seconds, decay, reverse and formula parameters, then applies it via a Web Audio ConvolverNode.',
      '',
      'Inputs',
      '- main-input (left, top): dry audio signal to be reverberated. Fed into the convolver for processing.',
      '- seconds (left, upper-middle): control input for impulse length (0.1 to 50 seconds). Determines how long the reverb tail lasts. Logarithmic scaling for musical control.',
      '- decay (left, middle): control input for decay curve exponent (0.01 to 100). Higher values create faster decay; lower values produce longer, more sustained reverb tails. Logarithmic scaling.',
      '- reverse (left, lower-middle): boolean control input. When true, reverses the impulse response to create reverse/swell reverb effects where the tail builds up before the signal.',
      '- formula (left, bottom): control input for custom impulse generation formula. Allows advanced users to define their own impulse response algorithm using JavaScript expressions with variables: n (sample index), length (buffer length), decay, channel (0 or 1), reverse. Default formula: "(Math.random() * 2 - 1) * Math.pow(1 - n / length, decay)".',
      '',
      'Output',
      '- output (right): convolved audio with reverb applied. The result of convolving the input signal with the generated impulse response.',
      '',
      'Typical use cases',
      '- Putting sounds into a shared “room” or “hall” space.',
      '- Creating long ambient tails or subtle space around otherwise dry signals.',
    ].join('\n'),
    component: ReverbPreview,
    defaultProps: {
      label: 'Reverb',
      seconds: 3,
      decay: 2,
      reverse: false,
    },
    controls: {
      label: { type: 'string', label: 'Label' },
      seconds: { type: 'number', label: 'Length (s)' },
      decay: { type: 'number', label: 'Decay' },
      reverse: { type: 'boolean', label: 'Reverse' },
    },
  },
  {
    id: 'distortion-node',
    title: 'Distortion',
    description: [
      'Role',
      '- Applies waveshaping distortion using a Web Audio WaveShaperNode with customizable transfer curves. Generates harmonic content by mapping input sample values through a nonlinear curve defined by mathematical formulas.',
      '',
      'Inputs',
      '- main-input (left, top): audio signal to be distorted. Fed into the waveshaper for nonlinear processing.',
      '',
      'Output',
      '- output (right): distorted audio with added harmonics, saturation, and altered dynamics based on the selected curve formula and drive amount.',
      '',
      'Drive parameter',
      '- drive: logarithmic multiplier (0.1 to 100x) that scales the input signal amplitude before waveshaping. Higher drive pushes more of the signal into the nonlinear region, producing more aggressive distortion.',
      '- driveKnob: 0-100 UI value mapped logarithmically to the drive multiplier for musical control feel.',
      '- MIDI-controllable via MidiKnob integration for real-time expression.',
      '',
      'Formula system',
      '- formula: JavaScript expression defining the waveshaping transfer curve. Input variable is x (driven input sample), output is clamped to -1..1.',
      '- The node evaluates the formula at 256 sample points to generate a Float32Array curve for the WaveShaperNode.',
      '- Formulas are validated and cached; errors fall back to linear (no distortion).',
      '- Examples: "Math.tanh(x*3)" (soft clipping), "Math.sign(x)*Math.pow(Math.abs(x),0.3)" (fuzz), "Math.sin(x*3.14159)" (wavefold).',
      '',
      'Presets',
      '- 11 built-in presets covering common distortion types: Soft Clip, Hard Clip, Heavy Dist, Fuzz, Metal, Asymmetric, Fold, Bit Crush, Sine Fold, Overdrive, and Custom.',
      '- Each preset provides a different waveshaping character and harmonic profile.',
      '- Custom preset allows entering arbitrary formulas for experimental sound design.',
      '',
      'Oversample control',
      '- oversample: "none", "2x", or "4x". Controls internal oversampling to reduce aliasing artifacts when generating high harmonics.',
      '- Higher oversampling improves audio quality at the cost of increased CPU usage.',
      '',
      'Typical use cases',
      '- Adding warmth, tube saturation, or subtle harmonic enhancement to instruments.',
      '- Heavy guitar/bass distortion, fuzz pedal emulation, and aggressive tones.',
      '- Bitcrushing and lo-fi digital distortion effects.',
      '- Wavefold synthesis and experimental nonlinear processing.',
      '- Real-time drive modulation via MIDI controllers for expressive performance.',
      '',
      'Behaviour',
      '- VirtualDistortionNode creates a Web Audio WaveShaperNode and applies the generated curve.',
      '- The curve parameter is parsed from comma-separated string, Float32Array, or array into a Float32Array.',
      '- When drive, formula, or oversample change, the curve is regenerated and applied to the WaveShaperNode.',
      '- The UI canvas visualizes the transfer curve in real-time, showing input-to-output mapping.',
      '- Drive changes are smoothed via MIDI knob integration to prevent zipper noise during automation.',
    ].join('\n'),
    component: DistortionPreview,
    defaultProps: {
      label: 'Distortion',
      drive: 1,
      preset: 'Soft Clip',
      formula: 'Math.tanh(x*3)',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
      drive: { type: 'number', label: 'Drive' },
      preset: {
        type: 'select',
        label: 'Preset',
        options: ['Soft Clip', 'Hard Clip', 'Custom'],
      },
      formula: { type: 'string', label: 'Custom Formula' },
    },
  },
  {
    id: 'audio-worklet-node',
    title: 'AudioWorklet Processor',
    description: [
      'Role',
      '- Generic wrapper for a custom AudioWorklet-based processor. Lets you run bespoke DSP code inside the graph.',
      '',
      'Inputs',
      '- main-input (left): audio and/or control signals consumed by the worklet code.',
      '',
      'Output',
      '- output (right): audio generated or transformed by the custom worklet.',
      '',
      'Typical use cases',
      '- Hosting custom effects, modulators or instruments implemented as AudioWorklets.',
      '- Prototyping new DSP ideas without modifying the core engine.',
    ].join('\n'),
    component: AudioWorkletPreview,
    defaultProps: {
      label: 'AudioWorklet',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'iir-filter-node',
    title: 'IIR Filter',
    description: [
      'Role',
      '- Infinite Impulse Response filter for specialised tone-shaping where custom coefficient sets are supplied. Uses the Web Audio IIRFilterNode to implement custom transfer functions defined by feedforward (numerator) and feedback (denominator) coefficient arrays.',
      '',
      'Inputs',
      '- main-input (left, top): audio signal to be filtered using the configured IIR coefficients.',
      '- feedforward (left, middle): control input for modulating feedforward coefficients. Feedforward coefficients shape the immediate frequency response without recursion.',
      '- feedback (left, bottom): control input for modulating feedback coefficients. Feedback coefficients create resonance and recursive filtering by feeding output back into the input.',
      '',
      'Output',
      '- output (right): audio after IIR filtering based on the current feedforward and feedback coefficient configuration.',
      '',
      'Coefficient system',
      '- feedforward: array of numerator coefficients (default: [0.5, 0.5]). Controls the direct path from input to output.',
      '- feedback: array of denominator coefficients (default: [1.0, -0.5]). Controls the recursive feedback path that creates resonance.',
      '- Each coefficient can be adjusted individually via numeric input or MIDI-controllable knob (-2 to 2 range).',
      '- Coefficients can be dynamically added or removed using the "Add coefficient" and "x" buttons.',
      '- Maximum of 20 coefficients per array (hard safety cap to prevent performance issues).',
      '- All coefficients must be finite numbers; invalid values are filtered out automatically.',
      '',
      'MIDI Control',
      '- Each feedforward and feedback coefficient has its own MidiKnob with learn functionality.',
      '- MIDI mappings are persisted per coefficient using keys: iir:{flowId}:{nodeId}:ff:{index} and iir:{flowId}:{nodeId}:fb:{index}.',
      '- MIDI sensitivity: 0.8, smoothing: 0.4 for musical control without zipper noise.',
      '- When coefficients are added or removed, MIDI mapping arrays automatically resize to stay aligned.',
      '',
      'Typical use cases',
      '- Implementing custom EQ curves or response shapes not covered by standard biquad filters.',
      '- Emulating specific hardware responses using precalculated coefficients.',
      '- Creating unique resonant filter designs with multiple poles and zeros.',
      '- Real-time coefficient modulation via MIDI for expressive filter sweeps.',
      '- Educational demonstrations of IIR filter theory and transfer function design.',
      '',
      'Behaviour',
      '- VirtualIIRFilterNode creates a Web Audio IIRFilterNode with the current feedforward and feedback coefficients.',
      '- Because the Web Audio API does not allow changing IIRFilterNode coefficients after creation, VirtualIIRFilterNode recreates the entire node when coefficients change.',
      '- When coefficients update, the old node is disconnected, a new IIRFilterNode is created with updated coefficients, and all connections are reset via resetConnectionsOfNode().',
      '- The node subscribes to <nodeId>.params.updateParams events on the EventBus to receive coefficient updates from the UI.',
      '- Coefficient arrays are sanitized on every update: mapped to numbers, filtered for finite values, and capped at 20 elements.',
      '- If feedforward or feedback arrays are empty or invalid, defaults ([0.5, 0.5] and [1.0, -0.5]) are used.',
    ].join('\n'),
    component: IIRFilterPreview,
    defaultProps: {
      label: 'IIR Filter',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'adsr-node',
    title: 'ADSR Envelope',
    description: [
      'Role',
      '- Generates an Attack-Decay-Sustain-Release style envelope in response to gate events. Emits control events (not audio signals) with ADSR timing parameters that downstream nodes use to shape audio or modulate parameters.',
      '',
      'Important Note',
      '- This node emits control events (nodeOn/nodeOff with timing parameters), NOT audio signals. It does not generate or process audio waveforms itself.',
      '- Downstream nodes (Gain, Oscillator, Filter, etc.) receive the ADSR parameters and apply the envelope shape to their audio processing.',
      '- This is an event-based envelope generator that works with the flow event system, not the Web Audio API\'s AudioParam automation.',
      '',
      'Inputs',
      '- main-input (left, top ~20px): gate/trigger events (receiveNodeOn/receiveNodeOff) that start and stop the envelope. When receiveNodeOn arrives, the ADSR emits a nodeOn event with all current ADSR parameters. When receiveNodeOff arrives, it emits nodeOff with releaseTime.',
      '- attack-input (left, ~50px): control input to modulate attack time dynamically. Expects payload.value (number, seconds). Updates attackTime and stores in node.data.',
      '- sustainTime-input (left, ~80px): control input to modulate sustain time dynamically. Expects payload.value (number, seconds). Updates sustainTime and stores in node.data.',
      '- sustainLevel-input (left, ~110px): control input to modulate sustain level dynamically. Expects payload.value (number, 0-1 range). Updates sustainLevel and stores in node.data.',
      '- release-input (left, ~140px): control input to modulate release time dynamically. Expects payload.value (number, seconds). Updates releaseTime and stores in node.data.',
      '- minPercent-input (left, ~170px): control input to modulate minimum percent parameter. Expects payload.value (number, -1000 to 1000 range). Default 0. Used by downstream nodes for envelope scaling.',
      '- maxPercent-input (left, ~200px): control input to modulate maximum percent parameter. Expects payload.value (number, -1000 to 1000 range). Default 100. Used by downstream nodes for envelope scaling.',
      '',
      'Output',
      '- output (right): emits control events (nodeOn/nodeOff) with ADSR envelope parameters attached. Downstream nodes receive these events and apply the envelope shape to their processing. Does NOT output audio signals.',
      '',
      'ADSR Parameters',
      '- attackTime: duration of the attack phase (0 to lengthSec seconds, default 0.1s). How long it takes to ramp up from zero to peak.',
      '- sustainTime: duration of the sustain phase (0 to lengthSec seconds, default 0.5s). How long to hold at sustainLevel.',
      '- sustainLevel: amplitude level during sustain phase (0 to 1, default 0.7). The level held during the sustain phase.',
      '- releaseTime: duration of the release phase (0 to lengthSec seconds, default 0.3s). How long it takes to ramp down from sustainLevel to zero after gate off.',
      '- minPercent: minimum envelope scaling percentage (-1000 to 1000, default 0). Allows envelope inversion and offset.',
      '- maxPercent: maximum envelope scaling percentage (-1000 to 1000, default 100). Allows envelope amplification beyond 100%.',
      '- lengthSec: upper bound for each phase duration (default: max of attack/sustain/release, minimum 0.001s, maximum 60s). Acts as a constraint, not total envelope length.',
      '',
      'UI Controls',
      '- Phase Max (s): text input with arrow key support to set lengthSec. Up/Down: ±0.01s, Left/Right: ±1s. When changed, existing phase times are clamped to the new maximum.',
      '- Four phase knobs: Attack, Sustain Time, Sustain Level, Release. Each has a MidiKnob for visual control and displays current value with 3 decimal precision.',
      '- Two percent knobs: Min % and Max %. Control the envelope scaling range with integer values.',
      '',
      'Typical use cases',
      '- Shaping amplitude (volume) envelopes for notes and phrases by sending events to Gain nodes.',
      '- Modulating filter cutoff or other parameters in a musical ADSR-shaped way.',
      '- Creating complex modulation sources by combining multiple ADSR nodes with different timing.',
      '- Envelope inversion or bipolar modulation using negative minPercent or maxPercent values.',
      '',
      'Behaviour',
      '- VirtualADSRNode is an event-only node (no Web Audio AudioNode). It stores ADSR parameters internally and listens for updates.',
      '- On main-input.receiveNodeOn: if already on, emits nodeOff first (re-trigger), then emits nodeOn with current parameters (attackTime, sustainTime, sustainLevel, releaseTime, minPercent, maxPercent) via handleConnectedEdgesADSRNodeOn().',
      '- On main-input.receiveNodeOff: emits nodeOff with releaseTime and percent parameters via handleConnectedEdgesADSRNodeOff(), then sets isOn to false.',
      '- Parameter inputs (attack-input, sustainTime-input, etc.): update internal parameters and store in node.data when receiveNodeOn events arrive with payload.value.',
      '- Subscribes to <nodeId>.params.updateParams on EventBus for UI-driven parameter changes.',
      '- All timing parameters are validated and clamped: phases to [0, lengthSec], sustainLevel to [0, 1], percents to [-1000, 1000].',
      '- The node maintains an isOn state flag to detect re-triggers and handle overlapping gates correctly.',
    ].join('\n'),
    component: ADSRPreview,
    defaultProps: {
      label: 'ADSR',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'button-node',
    title: 'Button',
    description: [
      'Role',
      '- Manual trigger node that emits an event or gate when clicked.',
      '',
      'Inputs',
      '- (optional) event/control inputs depending on the concrete ButtonFlowNode UI.',
      '',
      'Output',
      '- main-output: event/gate signal that can trigger downstream nodes such as envelopes, sequencers or toggles.',
      '',
      'Typical use cases',
      '- Manually triggering notes, envelopes or recording.',
      '- Providing simple UI controls for debugging or performance.',
    ].join('\n'),
    component: ButtonPreview,
    defaultProps: {
      label: 'Button',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'midi-button-node',
    title: 'MIDI Button',
    description: [
      'Role',
      '- Button-like node that is controllable via MIDI note or CC messages.',
      '',
      'Inputs',
      '- MIDI input (virtual): mapping configuration determines which external controller events trigger this node.',
      '',
      'Output',
      '- main-output: event/gate when the mapped MIDI control is activated.',
      '',
      'Typical use cases',
      '- Triggering envelopes, toggles or sequences from a MIDI keyboard or pad controller.',
    ].join('\n'),
    component: MidiButtonPreview,
    defaultProps: {
      label: 'MIDI Button',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'onoff-button-node',
    title: 'On/Off Button',
    description: [
      'Role',
      '- Toggle-style button that switches between on and off states, emitting corresponding events.',
      '',
      'Inputs',
      '- optional event inputs to flip or force the state programmatically.',
      '',
      'Output',
      '- main-output: on/off events that can enable/disable parts of the graph or gate other signals.',
      '',
      'Typical use cases',
      '- Bypassing effect chains or muting branches.',
      '- Enabling/disabling sequencers or clocks.',
    ].join('\n'),
    component: OnOffButtonPreview,
    defaultProps: {
      label: 'On/Off Button',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'clock-node',
    title: 'Clock',
    description: [
      'Role',
      '- Tempo-synchronised pulse generator with drift correction. Emits periodic ON events (and optional OFF events) based on BPM. Acts as the master timing source for sequencers, envelopes, and rhythmic modulation in the graph.',
      '',
      'Inputs',
      '- main-input (left): gate/trigger events that toggle the clock on/off. Each receiveNodeOn event flips the isEmitting state. When enabled, the clock starts ticking; when disabled, it stops.',
      '',
      'Output',
      '- main-output (right): periodic nodeOn events (and optional nodeOff events) at intervals determined by BPM. These drive downstream sequencers, envelopes, triggers, and other time-based nodes.',
      '',
      'BPM Control',
      '- bpm: beats per minute (1 to 20000, default 120). Determines the interval between ON pulses: intervalMs = (60 / bpm) * 1000.',
      '- Displayed as a CustomNumberInput with direct text editing and arrow key adjustment.',
      '- Changes take effect on the next tick (no need to restart the clock).',
      '',
      'Emit Toggle',
      '- isEmitting: boolean state controlling whether the clock is actively ticking (default true).',
      '- Displayed as a colored button in the top-right corner: green (⏻) when emitting, red when stopped.',
      '- Click the button or send a gate to main-input to toggle emission on/off.',
      '- State is persisted in node.data and synchronized via EventBus params.updateParams.',
      '',
      'OFF Event Configuration (Advanced, Collapsible)',
      '- sendOff: boolean (default false). When true, the clock emits a nodeOff event in addition to nodeOn.',
      '- offDelayMs: delay in milliseconds (numeric or string, e.g. "75"). Determines when the OFF event fires relative to ON.',
      '- sendOffBeforeNextOn: boolean (default false). Controls OFF scheduling mode:',
      '  - false (default): OFF fires offDelayMs milliseconds AFTER the current ON event (default 50ms).',
      '  - true: OFF fires offDelayMs milliseconds BEFORE the NEXT ON event (default 10ms).',
      '- If offDelayMs is empty/undefined, defaults apply: 50ms (after mode) or 10ms (before mode).',
      '- If offDelayMs >= intervalMs, it is clamped to intervalMs - 1 to ensure valid timing.',
      '- OFF events are cleared and rescheduled on each tick to prevent overlap.',
      '',
      'UI Sections',
      '- BPM: always visible, main control for tempo.',
      '- OFF events: collapsible section (click ▶ to expand) containing:',
      '  - "send OFF" checkbox: enables OFF event emission.',
      '  - "OFF before next ON" checkbox: switches between after/before scheduling modes (disabled when send OFF is unchecked).',
      '  - "OFF delay ms" text input: sets the delay value with mode-specific placeholder (disabled when send OFF is unchecked).',
      '',
      'Typical use cases',
      '- Master tempo source for sequencers and rhythmic modulation.',
      '- Creating clock-divided patterns when combined with Speed Divider nodes.',
      '- Gate generators with precise ON/OFF timing for envelope triggering.',
      '- Tempo-synchronized LFO resets or parameter automation triggers.',
      '',
      'Behaviour (VirtualClockNode)',
      '- VirtualClockNode is an event-only node (no Web Audio AudioNode). It maintains timing state and emits events via EventBus.',
      '- Uses drift-corrected scheduling: tracks startTime (performance.now()) and tickCount to calculate absolute next tick time, preventing cumulative timing drift.',
      '- intervalMs = (60 / bpm) * 1000. Next tick time = startTime + (tickCount * intervalMs).',
      '- On each tick:',
      '  1. Emits nodeId.main-input.sendNodeOn event.',
      '  2. Increments tickCount.',
      '  3. If sendOff is enabled, schedules a nodeOff event:',
      '     - After mode: fires offDelayMs after ON (default 50ms).',
      '     - Before mode: fires intervalMs - offDelayMs before next ON (default 10ms before).',
      '  4. Calculates delay to next tick: max(0, nextTickTime - performance.now()) for drift correction.',
      '  5. Schedules next tick via setTimeout.',
      '- Subscribes to main-input.receiveNodeOn: toggles isEmitting state and starts/stops the clock.',
      '- Subscribes to main-input.sendNodeOn/sendNodeOff: forwards events to connected edges via emitEventsForConnectedEdges().',
      '- Subscribes to nodeId.params.updateParams: dynamically updates bpm, isEmitting, sendOff, offDelayMs, sendOffBeforeNextOn. Changes to isEmitting are debounced (200ms) before applying start/stop.',
      '- start(): stops any existing interval, resets startTime and tickCount, syncs isEmitting state, begins ticking.',
      '- stop(): clears timeout/offTimeout, sets isEmitting to false, syncs state.',
      '- syncState(): updates node.data.isEmitting and emits params.updateParams to keep UI in sync.',
      '- dispose(): stops the clock and clears all timers.',
      '',
      'OFF Event Timing Details',
      '- offDelayMs normalization: accepts number, numeric string (e.g. "75"), or undefined/empty (uses defaults). Non-numeric values fallback to defaults.',
      '- Clamping: if offDelayMs >= intervalMs, clamped to max(1, intervalMs - 1) to ensure OFF always fires within the cycle.',
      '- Before mode offset calculation: fireIn = intervalMs - offset. If offset >= intervalMs, clamped to intervalMs - 1.',
      '- After mode fires a separate setTimeout(offDelayMs) after each ON.',
      '- Before mode fires a single setTimeout(intervalMs - offset) to hit just before the next ON.',
      '- offTimeout is cleared before each new tick to prevent orphaned OFF events when clock params change mid-cycle.',
    ].join('\n'),
    component: ClockPreview,
    defaultProps: {
      bpm: 120,
      sendOff: false,
      offDelayMs: 0,
      sendOffBeforeNextOn: false,
    },
    controls: {
      bpm: { type: 'number', label: 'BPM' },
      sendOff: { type: 'boolean', label: 'Send OFF events' },
      offDelayMs: { type: 'number', label: 'OFF delay (ms)' },
      sendOffBeforeNextOn: {
        type: 'boolean',
        label: 'Send OFF before next ON',
      },
    },
  },
  {
    id: 'frequency-node',
    title: 'Frequency',
    description: [
      'Role',
      '- Utility node for generating and transforming frequency control signals. Provides three distinct frequency modes (Hz, MIDI, LFO) with logarithmic/power-curve knob mapping for musical control. Used to drive oscillators, filters, and other frequency-sensitive nodes.',
      '',
      'Important Note',
      '- This is a control/event node, NOT an audio processing node. It emits frequency values as control signals when triggered, not continuous audio-rate modulation.',
      '',
      'Inputs',
      '- main-input (left, top ~18px): trigger/gate events (receiveNodeOn) that cause the node to emit its current frequency value to connected outputs. Each trigger sends frequency, frequencyType, knobValue, and value fields.',
      '',
      'Output',
      '- output (right, top ~18px): control signal containing frequency data. Emitted payload includes: { value: frequency, frequency, frequencyType, knobValue }. The "value" field is the primary numeric output consumed by downstream nodes.',
      '',
      'Frequency Modes',
      '- hz (Hertz): standard frequency mode for audio synthesis (20 Hz to 20 kHz range).',
      '  - Knob range: 0-100',
      '  - Mapping: logarithmic from 20 Hz to 20000 Hz. Formula: freq = 20 * pow(1000, knobValue/100)',
      '  - Provides musical spacing across the audible spectrum.',
      '',
      '- midi (MIDI Note): frequency derived from MIDI note numbers (C-1 to B7 range).',
      '  - Knob range: 24-96 (MIDI note numbers)',
      '  - Mapping: linear note numbers converted to Hz. Formula: freq = 440 * pow(2, (note - 69) / 12)',
      '  - Displays note name and octave (e.g. "A4", "C#3") below the frequency.',
      '  - Reverse mapping: note = 69 + 12 * log2(freq / 440)',
      '',
      '- lfo (Low Frequency Oscillator): very low frequencies for modulation (0.01 Hz to 250 Hz range).',
      '  - Knob range: 0-250',
      '  - Mapping: power curve (exponent 0.5) from 0.01 Hz to 250 Hz. Formula: freq = 0.01 * pow(25000, pow(knobValue/250, 0.5))',
      '  - Provides fine control at slow LFO rates, faster movement at higher rates.',
      '  - Reverse mapping: knobValue = 250 * pow(log(freq/0.01) / log(25000), 2)',
      '',
      'Knob Control',
      '- MidiKnob component provides visual rotary control with min/max values per mode.',
      '- Knob changes update knobValue state, which is then converted to frequency via mode-specific mapping.',
      '- All frequency values are rounded to 3 decimal places for display and output.',
      '',
      'Direct Frequency Input',
      '- Text input below the mode selector allows direct frequency entry.',
      '- When frequency is manually entered, the knob position updates via reverse mapping to stay synchronized.',
      '- In MIDI mode, manual frequency input also updates the displayed MIDI note name.',
      '',
      'Mode Switching',
      '- Dropdown selector: midi / hz / lfo',
      '- Changing mode updates knob min/max ranges and re-maps the current frequency to the new knob scale.',
      '- When switching to MIDI mode, knob range becomes 24-96 and note name display appears.',
      '- When switching to hz or lfo, knob ranges adjust accordingly and note name disappears.',
      '',
      'UI Layout',
      '- Compact 72px-wide node with vertically stacked controls:',
      '  1. MidiKnob (44x44px) at top',
      '  2. Frequency display ("XXX.XXX Hz") in gray',
      '  3. MIDI note name display (in MIDI mode only) in dimmer gray',
      '  4. Mode selector dropdown (50px wide)',
      '  5. Direct frequency text input (50px wide)',
      '',
      'Typical use cases',
      '- Converting MIDI note numbers from sequencers into oscillator frequencies.',
      '- Centralizing pitch control that fans out to multiple oscillators for detuned unison or chord voicing.',
      '- Generating LFO control rates for modulation effects.',
      '- Providing a manual frequency source with intuitive knob control and mode switching.',
      '- Bridging between different frequency representations (Hz ↔ MIDI ↔ LFO).',
      '',
      'Behaviour (VirtualFrequencyNode)',
      '- VirtualFrequencyNode is an event-only node (no Web Audio AudioNode). It stores frequency state and emits control values on demand.',
      '- Subscribes to main-input.receiveNodeOn: when triggered, calls handleConnectedEdges() to emit current frequency data to all connected outputs.',
      '- Emitted payload: { value: this.frequency, frequency: this.frequency, frequencyType: this.frequencyType, knobValue: this.knobValue }',
      '- The "value" field is the primary output consumed by downstream nodes (oscillators, filters, etc.).',
      '- Subscribes to nodeId.params.updateParams: updates internal frequency, frequencyType, and knobValue when UI changes occur, then immediately re-emits via handleReceiveNodeOn().',
      '- Stores three pieces of state: frequency (number), frequencyType ("midi" | "hz" | "lfo"), knobValue (number).',
      '- Provides setter methods: setFrequency(value), setKnobValue(value), setFrequencyType(type), and getter: getFrequency().',
      '- dispose(): unsubscribes from main-input.receiveNodeOn and params.updateParams to clean up event listeners.',
      '',
      'Frequency Mapping Details',
      '- Hz mode logarithmic formula ensures equal knob movement produces equal perceived pitch change (exponential frequency scaling).',
      '- MIDI mode uses standard equal-temperament tuning (A4 = 440 Hz, 12 semitones per octave).',
      '- LFO mode power curve (sqrt) provides finer resolution at slow rates where precise control is needed, with faster traversal at higher rates.',
      '- All modes clamp knob values to their valid ranges to prevent out-of-bounds frequencies.',
      '- Frequency display always shows Hz regardless of mode, with mode-specific knob value and optional MIDI note name.',
    ].join('\n'),
    component: FrequencyPreview,
    defaultProps: {
      frequency: 440,
      frequencyType: 'hz',
      knobValue: 50,
    },
    controls: {
      frequency: { type: 'number', label: 'Frequency' },
      frequencyType: {
        type: 'select',
        label: 'Mode',
        options: ['hz', 'midi', 'lfo'],
      },
      knobValue: { type: 'number', label: 'Knob (0-100)' },
    },
  },
  {
    id: 'constant-node',
    title: 'Constant',
    description: [
      'Role',
      '- Emits a constant numeric or string control value. Acts as a simple value source that can be triggered to emit its stored value to connected nodes. Often used as an offset, bias, or fixed parameter value in the graph.',
      '',
      'Important Note',
      '- This is a control/event node, NOT an audio processing node. It emits values when triggered by input events, not continuous signals.',
      '',
      'Inputs',
      '- main-input (left, centered ~50%): trigger events (receiveNodeOn or receiveNodeOff) that cause the node to emit its current value. Responds to both ON and OFF events, emitting the same value for both.',
      '',
      'Output',
      '- output (right, centered ~50%): control signal containing the constant value. Emitted payload: { value: this.value }. The value field can be numeric or string depending on what is entered in the text input.',
      '',
      'UI Control',
      '- Text input (50px wide, 10pt font): displays and edits the constant value.',
      '- Value can be numeric (e.g. "440", "1.5", "-10") or string (e.g. "Default").',
      '- Default value: "Default" (if not specified).',
      '- Compact 72px-wide node with centered input field.',
      '',
      'Keyboard Shortcuts (Numeric Values Only)',
      '- Arrow Up: +1',
      '- Arrow Down: -1',
      '- Arrow Right: +10',
      '- Arrow Left: -10',
      '- Ctrl+Arrow Up: +100',
      '- Ctrl+Arrow Down: -100',
      '- Ctrl+Arrow Right: +1000',
      '- Ctrl+Arrow Left: -1000',
      '- Keyboard shortcuts only work when the current value is a valid finite number (parsed via parseFloat).',
      '- If the value is not numeric, arrow keys have no effect.',
      '',
      'Typical use cases',
      '- Providing baseline values that other modulation sources add or multiply with.',
      '- Keeping important parameters fixed but visible and easily adjustable in the graph.',
      '- Fixed gain offsets, DC control voltages, or parameter defaults.',
      '- Manual control values that can be quickly adjusted via keyboard shortcuts.',
      '- Trigger-driven value emission for event-based systems.',
      '',
      'Behaviour (VirtualConstantNode)',
      '- VirtualConstantNode is an event-only node (no Web Audio AudioNode). It stores a value and emits it when triggered.',
      '- Subscribes to main-input.receiveNodeOn: when triggered, calls handleConnectedEdges() to emit { value: this.value } to all connected outputs.',
      '- Subscribes to main-input.receiveNodeOff: when triggered, also emits { value: this.value } to all connected outputs (same behavior as ON).',
      '- The value can be any type (string, number, etc.) as stored in this.value.',
      '- Subscribes to nodeId.params.updateParams: updates internal value when UI changes occur via data.data.value.',
      '- render(): sets up or resets event subscriptions for receiveNodeOn and receiveNodeOff.',
      '- dispose(): unsubscribes from main-input.receiveNodeOn to clean up event listeners.',
      '- The node emits its value for BOTH ON and OFF events, making it suitable as a constant source that responds to any trigger type.',
      '',
      'Value Handling',
      '- onChange in UI: triggers whenever the text input value changes, updating node.data.value.',
      '- VirtualConstantNode stores the value as-is (can be string or number).',
      '- Downstream nodes receive { value: ... } and interpret it according to their needs.',
      '- Numeric operations (keyboard shortcuts) only work when parseFloat(value) returns a finite number.',
    ].join('\n'),
    component: ConstantPreview,
    defaultProps: {
      value: '1.0',
    },
    controls: {
      value: { type: 'number', label: 'Value' },
    },
  },
  {
    id: 'switch-node',
    title: 'Switch',
    description: [
      'Role',
      '- Sequential routing node that cycles through multiple outputs. Each trigger advances to the next output in sequence, wrapping back to the first after the last. Useful for sequencing, routing patterns, and cyclic signal distribution.',
      '',
      'Important Note',
      '- This is a control/event node, NOT an audio processing node. It routes event signals by emitting to one output at a time based on the current active index.',
      '',
      'Inputs',
      '- main-input (left, top ~25%): trigger events (receiveNodeOn) that advance to the next output. Each trigger increments activeOutput and wraps to 0 after reaching numOutputs - 1. Emits sendNodeOn to the newly active output with { activeOutput: index }.',
      '- reset-input (left, bottom ~75%): trigger events (receiveNodeOn) that reset activeOutput to 0. Does not emit an output event, just resets the internal counter.',
      '',
      'Outputs',
      '- output-0, output-1, ..., output-N (right, distributed vertically): dynamic number of outputs (default 2, range 1-100). Only the currently active output receives events. Position calculated as: top = (index + 1) * (nodeHeight / (numOutputs + 1))',
      '- When a trigger arrives at main-input, the node emits main-input.sendNodeOn with payload { activeOutput: index } which the graph manager routes to the corresponding output-{index} handle.',
      '',
      'Dynamic Output Configuration',
      '- numOutputs: number of available outputs (default 2, min 1, max 100).',
      '- Text input labeled "No. steps" allows direct entry of output count.',
      '- Node height adjusts dynamically: height = max(100, numOutputs * 20) to accommodate all outputs.',
      '- Output handle positions recalculate automatically when numOutputs changes.',
      '- updateNodeInternals() is called internally when outputs change to refresh handle positions in the flow graph.',
      '',
      'UI Controls',
      '- "No. steps" text input: displays and edits numOutputs.',
      '- Accepts numeric input (1-100 range enforced).',
      '- Keyboard shortcuts for adjusting numOutputs:',
      '  - Arrow Up: +1',
      '  - Arrow Down: -1',
      '  - Ctrl+Arrow Up: +10',
      '  - Ctrl+Arrow Down: -10',
      '- Compact 72px-wide node with dynamic height.',
      '',
      'Cycling Behavior',
      '- activeOutput starts at 0 (first output).',
      '- Each main-input trigger: activeOutput = (activeOutput + 1) % numOutputs',
      '- Example with 3 outputs: 0 → 1 → 2 → 0 → 1 → 2 → ...',
      '- lastOutput tracks the previous active index (stored but not used in current implementation).',
      '- activeOutput is clamped to valid range [0, numOutputs - 1] when numOutputs changes.',
      '',
      'Reset Functionality',
      '- reset-input.receiveNodeOn sets activeOutput to 0 immediately.',
      '- Does NOT emit any output event, only resets internal state.',
      '- Useful for syncing multiple switches or starting sequences from a known state.',
      '',
      'Typical use cases',
      '- Sequential pattern generation: cycle through different note values, filters, or effects.',
      '- Rhythmic routing: distribute triggers to different drum sounds or percussion in rotation.',
      '- Round-robin voice allocation: cycle through multiple oscillator voices for polyphony.',
      '- Step sequencing: advance through a sequence of outputs representing different steps.',
      '- A/B/C testing: rotate through multiple processing chains or parameter sets.',
      '- Clock division routing: distribute clock pulses to different branches in sequence.',
      '',
      'Behaviour (VirtualSwitchNode)',
      '- VirtualSwitchNode is an event-only node (no Web Audio AudioNode). It maintains activeOutput state and routes events.',
      '- Constructor: initializes numOutputs from node.data.numOutputs (min 1), activeOutput from node.data.activeOutput (clamped to valid range), subscribes immediately to main-input.receiveNodeOn and reset-input.receiveNodeOn.',
      '- handleNodeOn(): increments activeOutput, wraps to 0 if >= numOutputs, updates node.data.activeOutput, emits via emitActiveOutput("sendNodeOn", activeOutput).',
      '- handleReset(): sets activeOutput to 0, updates node.data.activeOutput. Does not emit events.',
      '- emitActiveOutput(kind, index): emits to EventBus at path nodeId.main-input.{sendNodeOn|sendNodeOff} with payload { activeOutput: index }. The graph manager then routes this to the specific output-{index} handle.',
      '- setNumOutputs(n): updates numOutputs (min 1), resets activeOutput to 0 if it exceeds new range.',
      '- setActiveOutput(index): manually sets activeOutput to a specific index (clamped to [0, numOutputs - 1]).',
      '- setSendNodeOn(handler): registers a custom handler for sendNodeOn events (for advanced integration).',
      '- render(): re-establishes event subscriptions (unsubscribes then resubscribes to ensure clean state).',
      '- dispose(): unsubscribes from main-input.receiveNodeOn, reset-input.receiveNodeOn, and any custom sendNodeOn handler.',
      '',
      'State Management',
      '- activeOutput: current output index (0-based). Persisted in node.data.activeOutput.',
      '- lastOutput: previous output index before last increment (stored but not actively used in routing logic).',
      '- numOutputs: total number of outputs. Persisted in node.data.numOutputs.',
      '- All state changes update node.data immediately for persistence across sessions.',
      '',
      'Event Flow',
      '1. Trigger arrives at main-input (receiveNodeOn)',
      '2. VirtualSwitchNode increments activeOutput (with wraparound)',
      '3. Emits main-input.sendNodeOn with { activeOutput: newIndex }',
      '4. Graph manager routes sendNodeOn to the specific output-{newIndex} handle',
      '5. Connected nodes on that output receive the trigger',
      '6. Other outputs remain silent (no event emitted)',
    ].join('\n'),
    component: SwitchPreview,
    defaultProps: {
      label: 'Switch',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'blocking-switch-node',
    title: 'Blocking Switch',
    description: [
      'Role',
      '- Polyphonic voice allocation node with source tracking and blocking behavior. Routes incoming ON signals to available outputs, remembering which source is on which output. When a source sends OFF, it goes to the same output, then frees that lane. When all outputs are busy, new signals are blocked (dropped) until an output becomes available.',
      '',
      'Important Note',
      '- This is a control/event node, NOT an audio processing node. It tracks signal sources and allocates them to outputs in a blocking manner, ideal for polyphonic voice management.',
      '',
      'Inputs',
      '- input (left, top ~30%, green #5e5, labeled "IN"): trigger events (receiveNodeOn / receiveNodeOff) from various sources. Each unique source (identified by data.value) gets assigned to an available output. If all outputs are busy, the signal is blocked (no emission).',
      '- reset-input (left, bottom ~70%, red #e55, labeled "RST"): trigger events (receiveNodeOn) that forcibly release all occupied outputs. Sends nodeOff to all active sources, then clears all assignments.',
      '',
      'Outputs',
      '- output-0, output-1, ..., output-N (right, distributed vertically): dynamic number of outputs (default 2, range 1-100). Each output can handle one active source at a time. Occupied outputs shown in orange (#fa0), free outputs in gray (#888).',
      '- Position calculated as: top = (index + 1) * (nodeHeight / (numOutputs + 1)) + 10px offset',
      '- Output index labels displayed next to each handle.',
      '',
      'Source Tracking System',
      '- sourceToOutputMap (Map<string, number>): tracks which source (data.value) is assigned to which output index.',
      '- occupiedOutputs (Set<number>): tracks which output indices are currently busy.',
      '- When nodeOn arrives: checks if source already has an assigned output (ignores duplicate ON). If not, finds first available output (!occupiedOutputs.has(i)), assigns source to it, adds to occupiedOutputs, emits input.sendNodeOn with { ...data, activeOutput: index }.',
      '- When nodeOff arrives: looks up output from sourceToOutputMap, emits input.sendNodeOff to that output, removes source from map, deletes output from occupiedOutputs.',
      '- If source not found in map on nodeOff: silently ignored (no assigned output).',
      '',
      'Blocking Behavior',
      '- When all outputs are busy (occupiedOutputs.size >= numOutputs), new nodeOn signals are **blocked** (dropped, no emission).',
      '- No queuing or waiting: blocked signals are simply ignored until an output frees up.',
      '- Ideal for polyphonic instruments with limited voice count: excess notes are dropped rather than stealing voices.',
      '- Reset can forcibly free all outputs to make room for new signals.',
      '',
      'Dynamic Output Configuration',
      '- numOutputs: number of available voice slots (default 2, min 1, max 100).',
      '- +/- buttons flank the "No. steps" text input for quick adjustment.',
      '- Text input accepts direct numeric entry (1-100 clamped).',
      '- Keyboard shortcuts: Arrow Up/Down (±1), Ctrl+Arrow Up/Down (±10).',
      '- Node height adjusts dynamically: height = max(110, numOutputs * 22).',
      '- Output handle positions recalculate automatically.',
      '- Changing numOutputs triggers handleReset() to avoid invalid output indices.',
      '',
      'Visual Feedback',
      '- Occupied outputs: orange (#fa0) handles with orange index labels.',
      '- Free outputs: gray (#888) handles with gray (#777) index labels.',
      '- UI subscribes to nodeId.status.update events from VirtualBlockingSwitchNode to receive occupiedOutputs array.',
      '- Status updates trigger re-render to show current allocation state in real-time.',
      '',
      'UI Layout',
      '- 120px-wide node (wider than regular Switch to accommodate labels and buttons).',
      '- Title: "Blocking Switch" with subtitle "locks occupied lanes" (9px, 70% opacity).',
      '- Input handle labels: "IN" (green, left of handle at 37%), "RST" (red, left of handle at 75%).',
      '- Output index labels: positioned right of each handle at (top - 5)px.',
      '- +/- buttons: 18x18px, #272727 background, flanking the numOutputs text input.',
      '',
      'Typical use cases',
      '- Polyphonic synthesizer voice allocation: route MIDI notes to available oscillator voices, block excess notes.',
      '- Drum machine with limited simultaneous voices: first 8 triggers get voices, rest are dropped.',
      '- Sound effect pooling: manage limited audio channels for overlapping effects.',
      '- Resource-limited event routing: ensure no more than N simultaneous events are active.',
      '- Voice stealing prevention: unlike round-robin, this never interrupts an active voice.',
      '- Controlled polyphony in dense musical textures.',
      '',
      'Behaviour (VirtualBlockingSwitchNode)',
      '- VirtualBlockingSwitchNode is an event-only node (no Web Audio AudioNode). It maintains source-to-output mappings and occupied state.',
      '- Constructor: initializes numOutputs from node.data.numOutputs (min 1), creates empty sourceToOutputMap and occupiedOutputs, subscribes to nodeId.input.receiveNodeOn, nodeId.input.receiveNodeOff, and nodeId.reset-input.receiveNodeOn.',
      '',
      'handleNodeOn(data):',
      '1. Extract sourceId from data.source || data.nodeId || "unknown"',
      '2. Check if sourceToOutputMap.has(data.value): if yes, ignore (already active)',
      '3. Check if occupiedOutputs.size >= numOutputs: if yes, block signal (return early)',
      '4. Find first available output: loop i from 0 to numOutputs-1, check !occupiedOutputs.has(i)',
      '5. If found: add source to sourceToOutputMap, add index to occupiedOutputs, emit nodeId.input.sendNodeOn with { ...data, activeOutput: outputIndex }',
      '6. If not found (shouldn\'t happen): log warning',
      '',
      'handleNodeOff(data):',
      '1. Check if sourceToOutputMap.has(data.value)',
      '2. If yes: retrieve outputIndex, emit nodeId.input.sendNodeOff with { ...data, activeOutput: outputIndex }, delete from sourceToOutputMap, delete from occupiedOutputs',
      '3. If no: silently ignore (no assigned output for this source)',
      '',
      'handleReset():',
      '1. Iterate sourceToOutputMap entries',
      '2. For each (value, outputIndex): emit nodeId.input.sendNodeOff with { value, activeOutput: outputIndex }',
      '3. Clear sourceToOutputMap',
      '4. Clear occupiedOutputs',
      '5. Result: all voices forcibly released, ready for fresh allocation',
      '',
      'handleUpdateParams(node, data):',
      '- Calls super.handleUpdateParams()',
      '- If data.numOutputs changes: updates this.numOutputs (min 1), calls handleReset() to avoid invalid indices',
      '',
      'setSendNodeOn(handler) / setSendNodeOff(handler):',
      '- Registers custom handlers for input.sendNodeOn / input.sendNodeOff events',
      '- Used by graph manager to route to specific output-{index} handles',
      '',
      'getStatus():',
      '- Returns { numOutputs, occupiedOutputs: Array.from(occupiedOutputs), sourceAssignments: Object.fromEntries(sourceToOutputMap) }',
      '- Used for debugging and UI status updates',
      '',
      'dispose():',
      '- Unsubscribes from input.receiveNodeOn, input.receiveNodeOff, reset-input.receiveNodeOn',
      '',
      'Key Differences vs Regular Switch',
      '- Regular Switch: cycles through all outputs sequentially, one active at a time.',
      '- Blocking Switch: tracks multiple sources simultaneously, each on its own output, blocks when full.',
      '- Regular Switch: activeOutput counter, no source tracking.',
      '- Blocking Switch: sourceToOutputMap and occupiedOutputs, full polyphonic allocation.',
      '- Regular Switch: reset sets activeOutput to 0.',
      '- Blocking Switch: reset sends nodeOff to all active sources and clears all assignments.',
      '- Regular Switch: input handle named "main-input".',
      '- Blocking Switch: input handle named "input" (no "main-" prefix).',
      '- Blocking Switch: visual feedback (orange/gray handles) shows occupied state in real-time.',
    ].join('\n'),
    component: BlockingSwitchPreview,
    defaultProps: {
      label: 'Blocking Switch',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'function-node',
    title: 'Function',
    description: [
      'Role',
      '- Programmable event/control node that transforms input values using user-defined JavaScript code. Supports configurable number of inputs and outputs for complex data processing and routing logic.',
      '',
      'Important Note',
      '- This is a control/event node that processes data values, NOT an audio processing node. It operates on discrete events (ON/OFF) rather than continuous audio streams.',
      '',
      'Inputs',
      '- main-input (left, top ~40): Primary trigger input. When this receives a value, the function is evaluated and outputs are emitted.',
      '- input-0, input-1, ..., input-N (left, starting ~70, spaced 20px apart): Additional inputs (1-8 configurable). These provide supplementary values to the function.',
      '- Each additional input can have a default value that\'s used when no connection is present.',
      '- Additional inputs update their stored values but do NOT trigger function evaluation - only main-input triggers execution.',
      '',
      'Outputs',
      '- output-0, output-1, ..., output-N (right, starting ~20, spaced 17px apart): Multiple outputs (1-8 configurable).',
      '- Single value return: emitted on output-0 via main-input.sendNodeOn/Off event.',
      '- Array return: each array element is emitted to corresponding output by index (output-0 gets array[0], output-1 gets array[1], etc.).',
      '',
      'Configuration',
      '- No. of Inputs (1-8): sets number of additional inputs beyond main-input. Use arrow keys or type to adjust.',
      '- No. of Outputs (1-8): sets number of output handles. Use arrow keys or type to adjust.',
      '- Default input1, input2, etc.: optional default values for each additional input when not connected.',
      '',
      'Function Code',
      '- Uses CodeMirror editor with JavaScript syntax highlighting.',
      '- Code should define a function named "process" that receives arguments: (main, input1, input2, ..., inputN).',
      '- Example single output: "function process(main, input1) { return Number(main) * Number(input1); }"',
      '- Example multiple outputs: "function process(main, input1) { return [main * 2, main * input1]; }"',
      '- The function is evaluated using new Function() constructor, so standard JavaScript is supported.',
      '- Return single value to emit on output-0, or return array to emit to multiple outputs by index.',
      '',
      'UI Controls',
      '- CodeMirror editor: multi-line JavaScript editor with VS Code dark theme.',
      '- Number inputs for configuring input/output counts with keyboard shortcuts (arrow keys for ±1).',
      '- Text inputs for setting default values for each additional input.',
      '',
      'Event Handling',
      '- Subscribes to main-input.receiveNodeOn: triggers function evaluation, emits result via sendNodeOn.',
      '- Subscribes to main-input.receiveNodeOff: triggers function evaluation, emits result via sendNodeOff.',
      '- Subscribes to input-${i}.receiveNodeOn: updates stored value for that input, does NOT trigger evaluation.',
      '- Subscribes to params.updateParams: allows runtime updates to functionCode, numInputs, and inputDefaults.',
      '',
      'Behaviour (VirtualFunctionNode)',
      '- When main-input receives ON event:',
      '  1. Collects mainValue from event data.',
      '  2. Constructs argument list: [mainValue, input0Value || default0, input1Value || default1, ...].',
      '  3. Creates Function with argNames ["main", "input1", "input2", ...] and user code.',
      '  4. Executes function with collected arguments.',
      '  5. If result is array: calls handleConnectedEdges for each output by index with corresponding array value.',
      '  6. If result is single value: emits via main-input.sendNodeOn with { value: result }.',
      '',
      '- When main-input receives OFF event:',
      '  1. Same evaluation process as ON event.',
      '  2. Emits result via main-input.sendNodeOff with { value: result }.',
      '',
      '- When additional input receives ON event:',
      '  1. Updates inputValues[i] with received value.',
      '  2. Does NOT trigger function evaluation or emit outputs.',
      '  3. Updated value will be used on next main-input trigger.',
      '',
      '- When numInputs changes:',
      '  1. Resizes inputDefaults and inputValues arrays.',
      '  2. Pads with empty strings if increased, truncates if decreased.',
      '  3. Maintains existing values where possible.',
      '',
      '- Error handling:',
      '  1. If function evaluation throws error, logs to console.',
      '  2. Sets outputValue to "Error" and emits { value: "Error" }.',
      '  3. Does not crash node - recovers for next evaluation.',
      '',
      'Examples',
      '',
      'Example 1: Multiplier with two inputs',
      '- Configuration: No. of Inputs = 1, No. of Outputs = 1',
      '- Default input1: 2',
      '- Function Code:',
      '  function process(main, input1) {',
      '    return Number(main) * Number(input1);',
      '  }',
      '- Usage: Connect a value source to main-input and a multiplier value to input-0. When main-input triggers with value 10 and input-0 has value 3, output is 30.',
      '',
      'Example 2: Range mapper (input to output range)',
      '- Configuration: No. of Inputs = 4, No. of Outputs = 1',
      '- Defaults: input1 = 0, input2 = 100, input3 = 0, input4 = 1',
      '- Function Code:',
      '  function process(main, input1, input2, input3, input4) {',
      '    const inMin = Number(input1);',
      '    const inMax = Number(input2);',
      '    const outMin = Number(input3);',
      '    const outMax = Number(input4);',
      '    const normalized = (Number(main) - inMin) / (inMax - inMin);',
      '    return outMin + normalized * (outMax - outMin);',
      '  }',
      '- Usage: Maps input range (0-100) to output range (0-1). Connect input ranges to input-0 through input-3, main value to main-input.',
      '',
      'Example 3: MIDI note transposer',
      '- Configuration: No. of Inputs = 1, No. of Outputs = 1',
      '- Default input1: 12',
      '- Function Code:',
      '  function process(main, input1) {',
      '    return Number(main) + Number(input1);',
      '  }',
      '- Usage: Transpose MIDI notes by octaves. Connect MIDI note to main-input, transpose amount to input-0. Default +12 transposes up one octave.',
      '',
      'Example 4: Multi-output harmonics generator',
      '- Configuration: No. of Inputs = 0, No. of Outputs = 3',
      '- Function Code:',
      '  function process(main) {',
      '    const freq = Number(main);',
      '    return [freq, freq * 2, freq * 3];',
      '  }',
      '- Usage: Takes a frequency and outputs fundamental, 2nd harmonic, and 3rd harmonic on separate outputs for parallel oscillator control.',
      '',
      'Example 5: Conditional router with threshold',
      '- Configuration: No. of Inputs = 1, No. of Outputs = 2',
      '- Default input1: 50',
      '- Function Code:',
      '  function process(main, input1) {',
      '    const val = Number(main);',
      '    const threshold = Number(input1);',
      '    return [',
      '      val >= threshold ? val : 0,',
      '      val < threshold ? val : 0',
      '    ];',
      '  }',
      '- Usage: Routes values above threshold to output-0, below threshold to output-1. Connect threshold control to input-0.',
      '',
      'Example 6: Weighted average mixer',
      '- Configuration: No. of Inputs = 3, No. of Outputs = 1',
      '- Defaults: input1 = 0, input2 = 0.5, input3 = 0.5',
      '- Function Code:',
      '  function process(main, input1, input2, input3) {',
      '    const val1 = Number(main);',
      '    const val2 = Number(input1);',
      '    const weight1 = Number(input2);',
      '    const weight2 = Number(input3);',
      '    return val1 * weight1 + val2 * weight2;',
      '  }',
      '- Usage: Mix two values with adjustable weights. Connect sources to main-input and input-0, weight controls to input-1 and input-2.',
      '',
      'Typical Use Cases',
      '- Mathematical transformations: multiply/divide/add constants, apply formulas like exponentials or logarithms.',
      '- Data routing logic: conditional outputs based on input ranges or thresholds.',
      '- Multi-output distribution: split one input into multiple transformed outputs (e.g., [value, value*2, value*0.5]).',
      '- MIDI note processing: convert MIDI notes to frequencies, transpose, apply scales.',
      '- Sequencer step generation: compute step values from clock ticks and parameters.',
      '- Prototyping new control behaviors before implementing dedicated nodes.',
      '- Complex modulation sources: combine multiple inputs with custom algorithms.',
    ].join('\n'),
    component: FunctionPreview,
    defaultProps: {
      functionCode: 'return Number(main) * 2;',
      numInputs: 1,
      numOutputs: 1,
    },
    controls: {
      functionCode: { type: 'string', label: 'Function body' },
      numInputs: { type: 'number', label: 'Inputs' },
      numOutputs: { type: 'number', label: 'Outputs' },
    },
  },
  {
    id: 'input-node',
    title: 'Input (Bus)',
    description: [
      'Role',
      '- Indexed input bus node for custom Flow nodes. Acts as a named entry point that receives events/data from outside the Flow node and forwards them to internal processing.',
      '- Typically used inside custom Flow nodes to define external input endpoints that can be connected from the parent graph.',
      '',
      'Important Note',
      '- This is NOT an audio input device node (microphone/line-in). It\'s a virtual routing node for event/data flow within custom components.',
      '- The input connection is event-based (via EventBus subscriptions) rather than a visible handle in the FlowNode UI.',
      '',
      'Inputs',
      '- NO VISIBLE INPUT HANDLE. Receives events via EventBus subscriptions only (invisible to UI).',
      '- The node subscribes to "${nodeId}input-${index}.receiveNodeOn" and "${nodeId}input-${index}.receiveNodeOff" events.',
      '- When events are received, they are immediately forwarded to connected outputs via handleConnectedEdges.',
      '- Input routing is handled by the parent AudioGraphManager, not by visible graph connections.',
      '',
      'Output',
      '- output-${index} (right, top 70): Forwards received events/data to connected nodes inside the custom Flow.',
      '- The output handle ID matches the input index for consistent routing.',
      '',
      'Configuration',
      '- Index (adjustable via +/- buttons): Determines which input bus this node represents (0, 1, 2, ...).',
      '- Multiple Input nodes can exist in a Flow with different indices to create multiple input endpoints.',
      '- The index is displayed in a read-only text field below the buttons.',
      '',
      'UI Controls',
      '- IN badge: Identifies the node as an input bus.',
      '- Plus (+) button: Increments the index by 1.',
      '- Minus (-) button: Decrements the index by 1 (minimum 0).',
      '- Index display: Shows the current input bus index number.',
      '',
      'Event Handling',
      '- Subscribes to "${nodeId}input-${index}.receiveNodeOn": Receives ON events with data payload.',
      '- Subscribes to "${nodeId}input-${index}.receiveNodeOff": Receives OFF events with data payload.',
      '- Subscribes to "${nodeId}.params.updateParams": Allows runtime updates to index and configuration.',
      '- When params.updateParams is received, unsubscribes all events and resubscribes with new index.',
      '',
      'Behaviour (VirtualInputNode)',
      '- When input-${index}.receiveNodeOn is received:',
      '  1. Extracts data payload from event.',
      '  2. Calls handleConnectedEdges(node, data, "receiveNodeOn").',
      '  3. Forwards data to all connected outputs on the right side.',
      '',
      '- When input-${index}.receiveNodeOff is received:',
      '  1. Extracts data payload from event.',
      '  2. Calls handleConnectedEdges(node, data, "receiveNodeOff").',
      '  3. Forwards OFF event to all connected outputs.',
      '',
      '- When index changes via params.updateParams:',
      '  1. Unsubscribes from all events for old index via unsubscribeAllByNodeId.',
      '  2. Updates internal index value.',
      '  3. Resubscribes to events with new index pattern.',
      '  4. Ensures routing remains consistent with UI state.',
      '',
      '- Pass-through behavior:',
      '  1. No processing or transformation of data.',
      '  2. Acts as a transparent routing point.',
      '  3. Maintains event type (ON/OFF) during forwarding.',
      '',
      'Typical Use Cases',
      '- Defining input endpoints for custom Flow nodes that encapsulate reusable processing chains.',
      '- Creating parameterized components with multiple configurable inputs (e.g., input-0 for main signal, input-1 for control).',
      '- Building modular sub-graphs where external connections map to specific internal processing paths.',
      '- Routing events from parent graph into child Flow node for hierarchical composition.',
      '- Multi-channel processing where each Input node represents a separate channel or parameter.',
      '',
      'Example Workflow',
      '1. Inside a custom Flow node, place Input node with index=0.',
      '2. Connect Input node output to internal processing (e.g., Function, Switch).',
      '3. In parent graph, connect external source to Flow node\'s input-0 handle.',
      '4. External events arriving at Flow node\'s input-0 trigger "${flowNodeId}input-0.receiveNodeOn".',
      '5. Input node forwards data to internal processing chain.',
      '6. Processed result exits via Output node back to parent graph.',
    ].join('\n'),
    component: InputPreview,
    defaultProps: {},
    controls: {},
  },
  {
    id: 'output-node',
    title: 'Output (Bus)',
    description: [
      'Role',
      '- Indexed output bus node for custom Flow nodes. Acts as a named exit point that receives data from internal processing and forwards it to the parent graph.',
      '- Typically used inside custom Flow nodes to define external output endpoints that can be connected to in the parent graph.',
      '',
      'Important Note',
      '- This is NOT a speaker/audio output device node. It\'s a virtual routing node for event/data flow within custom components.',
      '- The output connection is event-based (via handleReceiveOutput callback) rather than a standard graph edge.',
      '',
      'Inputs',
      '- input (left, top 70): Receives incoming events/data from internal processing nodes.',
      '- The node has a single visible input handle with ID "input".',
      '- Connected to internal processing outputs (e.g., Function results, processed signals).',
      '',
      'Output',
      '- NO VISIBLE OUTPUT HANDLE. Emits events to parent graph via handleReceiveOutput callback (invisible to UI).',
      '- The node subscribes to "${nodeId}.input.receiveNodeOn" and "${nodeId}.input.receiveNodeOff" events.',
      '- When input events are received, they are forwarded to the parent graph via handleReceiveOutput callback.',
      '- Output routing is handled by the parent AudioGraphManager\'s custom Flow node output mapping.',
      '',
      'Configuration',
      '- Index (adjustable via +/- buttons): Determines which output bus this node represents (0, 1, 2, ...).',
      '- Multiple Output nodes can exist in a Flow with different indices to create multiple output endpoints.',
      '- The index is displayed in a read-only text field below the buttons.',
      '',
      'UI Controls',
      '- OUT badge: Identifies the node as an output bus.',
      '- Plus (+) button: Increments the index by 1.',
      '- Minus (-) button: Decrements the index by 1 (minimum 0).',
      '- Index display: Shows the current output bus index number.',
      '',
      'Event Handling',
      '- Subscribes to "${nodeId}.input.receiveNodeOn": Receives ON events with data payload.',
      '- Subscribes to "${nodeId}.input.receiveNodeOff": Receives OFF events with data payload.',
      '- Subscribes to "${nodeId}.params.updateParams": Allows runtime updates to index and value.',
      '- When params.updateParams is received, updates internal index and value state.',
      '',
      'Behaviour (VirtualOutputNode)',
      '- When input.receiveNodeOn is received:',
      '  1. Extracts data payload from event.',
      '  2. Calls handleReceiveOutput(node, data, "receiveNodeOn").',
      '  3. Parent AudioGraphManager routes data to appropriate output-${index} handle on parent Flow node.',
      '  4. External connections in parent graph receive the forwarded event.',
      '',
      '- When input.receiveNodeOff is received:',
      '  1. Extracts data payload from event.',
      '  2. Calls handleReceiveOutput(node, data, "receiveNodeOff").',
      '  3. Forwards OFF event to parent graph output mapping.',
      '',
      '- When params.updateParams is received:',
      '  1. Updates internal value if "value" property is present.',
      '  2. Updates internal index if "index" property is present (as number).',
      '  3. Index change does not require resubscription (single "input" handle).',
      '',
      '- Pass-through behavior:',
      '  1. No processing or transformation of data.',
      '  2. Acts as a transparent routing point from internal to external.',
      '  3. Maintains event type (ON/OFF) during forwarding.',
      '',
      'Typical Use Cases',
      '- Defining output endpoints for custom Flow nodes that encapsulate reusable processing chains.',
      '- Creating parameterized components with multiple outputs (e.g., output-0 for main result, output-1 for side-chain).',
      '- Building modular sub-graphs where internal processing results map to external output handles.',
      '- Routing processed data from child Flow node back to parent graph for further processing or final output.',
      '- Multi-channel output where each Output node represents a separate channel or derived signal.',
      '',
      'Example Workflow',
      '1. Inside a custom Flow node, place Output node with index=0.',
      '2. Connect internal processing output (e.g., Function result) to Output node input.',
      '3. In parent graph, connect Flow node\'s output-0 handle to next processing stage.',
      '4. Internal processing completes and emits data to Output node\'s input handle.',
      '5. Output node receives "${nodeId}.input.receiveNodeOn" event.',
      '6. Calls handleReceiveOutput which routes to parent Flow node\'s output-0.',
      '7. External connections receive forwarded data and continue processing.',
    ].join('\n'),
    component: OutputPreview,
    defaultProps: {},
    controls: {},
  },
  {
    id: 'sample-node',
    title: 'Sample Player',
    description: [
      'Role',
      '- Loads and plays back audio samples from disk or memory. Supports dividing audio files into multiple segments, each with independent playback controls, pitch detection, and trigger inputs.',
      '- Each segment can be triggered independently, looped, reversed, time-stretched, and pitch-shifted in real-time.',
      '',
      'Inputs',
      '- DYNAMIC SEGMENT INPUTS (left side): One input handle per segment with ID matching segment ID.',
      '  - Each segment has its own trigger input that appears when the segment is created.',
      '  - Position: Vertically centered within each segment card (50% of card height).',
      '  - Subscribes to "${nodeId}.${segmentId}.receiveNodeOn" and "${nodeId}.${segmentId}.receiveNodeOff" events.',
      '  - receiveNodeOn payload can include frequency value for automatic pitch-shifting (repitching).',
      '  - If payload.value or payload.frequency contains a target frequency in Hz, and segment has detectedFrequency, playback rate is adjusted to match target pitch.',
      '',
      'Output',
      '- output (right, top): Main audio output. All triggered segments are mixed through a GainNode and routed to this handle.',
      '- Connects to downstream audio processing nodes (filters, effects, mixers, master out).',
      '',
      'Configuration',
      '- File Loading: Click "Load Audio File" button or drag-and-drop audio files (WAV, MP3, OGG, etc.).',
      '- Waveform Selector: Click 🎵 button to open advanced waveform editor with zoom, selection, and visual playback position.',
      '- Segment Management: Add segments via "Add Segment" button or waveform selector. Each segment is a separate playable region.',
      '',
      'Segment Properties (Per Segment)',
      '- Label: Descriptive name for the segment.',
      '- Start Time: Beginning of segment in seconds (adjustable via text input with arrow key increments).',
      '- End Time: End of segment in seconds.',
      '- Loop Enabled: Whether segment loops continuously when triggered.',
      '- Loop Mode: "hold" (On→Off: trigger starts, OFF stops) or "toggle" (On↔On: each ON toggles play/stop, OFF ignored).',
      '- Hold Enabled: If false, segment ignores OFF events and plays to completion; if true (default), OFF stops playback.',
      '- Reverse: Play segment backwards.',
      '- Speed: Playback speed multiplier (-10 to +10, logarithmic scale; 1 = normal speed).',
      '- Detected Frequency: Pitch of segment in Hz, detected via "🎵 Detect" button. Used for automatic repitching when triggered with frequency payload.',
      '- Waveform Visualization: Each segment displays Audacity-style dual-layer waveform (peak outer envelope + RMS inner volume).',
      '',
      'Waveform Selector Modal',
      '- Opens full-screen overlay with zoomable waveform, selection tools, and real-time playback preview.',
      '- Selection: Click and drag to select region. Handles at selection boundaries can be dragged to adjust.',
      '- Panning: Hold Space + drag to pan view.',
      '- Zoom: Mouse wheel to zoom in/out at cursor position. Buttons: Reset Zoom, Zoom to Selection.',
      '- Playback Preview: Play/Stop button, Loop toggle, Reverse toggle, Speed slider (-100 to +20).',
      '- Playback position marker shows current playback location on waveform.',
      '- Add Part: Creates new segment from current selection with configured speed.',
      '',
      'Event Handling (VirtualSampleFlowNode)',
      '- Subscribes to "${nodeId}.${segmentId}.receiveNodeOn": Triggers segment playback.',
      '  - If payload.value or payload.frequency is present and segment.detectedFrequency is set, applies pitch-shifting (playbackRate = speed * targetFreq / detectedFreq).',
      '  - In "hold" mode: stops existing playback and starts new; OFF event stops playback.',
      '  - In "toggle" mode: toggles playback on each ON; OFF event is ignored.',
      '- Subscribes to "${nodeId}.${segmentId}.receiveNodeOff": Stops segment playback (only if holdEnabled=true and loopMode="hold").',
      '- Subscribes to "${nodeId}.stopAll": Immediately stops all playing segments.',
      '- Subscribes to "${nodeId}.params.updateParams": Updates segments, loop settings, speed, reverse, and reloads audio if needed.',
      '',
      'Behaviour (VirtualSampleFlowNode)',
      '- Audio Loading:',
      '  1. Accepts ArrayBuffer, disk file (via File System Access API), or backend URL.',
      '  2. Decodes audio using Web Audio API decodeAudioData.',
      '  3. Emits "${nodeId}-GUI.params.updateParams" with decoded duration.',
      '  4. Queues segment play requests received before decoding completes, plays them after decoding finishes.',
      '',
      '- Segment Playback:',
      '  1. Creates AudioBufferSourceNode per segment trigger.',
      '  2. Applies segment start/end offsets and duration.',
      '  3. Sets playback rate: speed * (optional repitch ratio).',
      '  4. Configures loop (loop=true, loopStart, loopEnd) if loopEnabled=true.',
      '  5. Uses reversed buffer if reverse=true (lazily built on first use, cached).',
      '  6. Connects source to internal GainNode, then to output handle.',
      '  7. Tracks active sources per segment for independent stop control.',
      '',
      '- Repitching (Automatic Pitch-Shifting):',
      '  1. Segment must have detectedFrequency set (via 🎵 Detect button).',
      '  2. Trigger event must include payload.value or payload.frequency (target pitch in Hz).',
      '  3. Playback rate adjusted: finalRate = speed * (targetFrequency / detectedFrequency).',
      '  4. Enables melodic/harmonic sample playback from single recording (e.g., instrument samples).',
      '',
      '- Loop Modes:',
      '  - Hold mode: ON starts, OFF stops. Retriggering stops current and starts new.',
      '  - Toggle mode: Each ON toggles play/stop state; OFF events ignored.',
      '',
      '- Reverse Playback:',
      '  1. Builds reversed AudioBuffer by reversing all channel data.',
      '  2. Adjusts offset calculation to play from end backwards.',
      '  3. Reversed buffer cached after first build for performance.',
      '',
      'UI Controls',
      '- Load Audio File button: Opens file picker to load audio.',
      '- 🎵 Waveform button: Opens full-screen waveform selector modal.',
      '- Add Segment button: Creates new segment with default range.',
      '- Per-segment controls: Label input, Start/End time inputs (with arrow key increment support), Loop/Hold/Reverse checkboxes, Speed input, Play/Stop preview buttons.',
      '- 🎵 Detect button (per segment): Analyzes segment audio and detects fundamental frequency for repitching.',
      '- Remove (×) button: Deletes segment.',
      '',
      'Typical Use Cases',
      '- One-shot drums: Trigger individual drum hits from multi-sample kit.',
      '- Pitched instruments: Load instrument recording, detect pitch, trigger with frequency input from sequencer or MIDI for melodic playback.',
      '- Loops and textures: Load ambient loops, reverse playback, time-stretch for evolving soundscapes.',
      '- Multi-sample instruments: Define segments for different velocity layers or articulations, trigger independently.',
      '- Granular-style triggering: Divide sample into many short segments, trigger with rapid sequencer for granular synthesis effect.',
      '- Live performance: Map segments to MIDI buttons or sequencer steps for real-time triggering.',
      '',
      'Advanced Features',
      '- Persistent Storage: Saves audio to disk via File System Access API (sampling/ folder) for reload across sessions.',
      '- Dynamic Handle Creation: Input handles created/removed automatically as segments are added/deleted.',
      '- Pitch Detection: Autocorrelation-based fundamental frequency detection for automatic repitching.',
      '- Visual Feedback: Dual-layer waveform (peak + RMS), playback position marker in waveform selector.',
      '- Arrow Key Adjustment: Hold Ctrl/Shift while using arrow keys in numeric inputs for fine/coarse control.',
    ].join('\n'),
    component: SamplePreview,
    defaultProps: {},
    controls: {},
  },
  {
    id: 'midi-flow-note-node',
    title: 'MIDI Flow Note',
    description: [
      'Role',
      '- Listens to Web MIDI hardware/software devices and converts MIDI note-on/off messages into frequency values (A4=440Hz).',
      '- Automatically enabled on creation; subscribes to MIDI input devices and filters by device name and MIDI channel.',
      '',
      'Inputs',
      '- MIDI hardware: Receives MIDI note messages from connected MIDI devices via Web MIDI API (browser permission required).',
      '- No flow input handles - MIDI data comes exclusively from external MIDI devices.',
      '',
      'Configuration',
      '- Device filter: Select specific MIDI device by name or leave blank for "Any".',
      '- Channel filter: Choose MIDI channel 1-16 or leave blank for "Any" to receive from all channels.',
      '',
      'Output',
      '- output (right handle): Emits note frequency in Hz when note-on is received (e.g., 440 for A4), and 0 when note-off is received.',
      '- Virtual event bus: Emits sendNodeOn/sendNodeOff events with frequency and note name (e.g., "C4", "A#5").',
      '',
      'Typical use cases',
      '- Driving oscillator frequencies from MIDI keyboard.',
      '- Triggering envelopes and other nodes from MIDI note events.',
      '- Controlling synth parameters with MIDI note pitch.',
    ].join('\n'),
    component: MidiFlowNotePreview,
    defaultProps: {},
    controls: {},
  },
  {
    id: 'sequencer-node',
    title: 'Sequencer',
    description: [
      'Role',
      '- Multi-row step sequencer that advances on clock pulses and emits gate/trigger events for active steps in each row.',
      '- Supports 1-25 independent rows, each with configurable per-step patterns and pulse lengths.',
      '',
      'Inputs',
      '- advance (left, top 30%): Clock/gate pulse that advances the playhead to the next step.',
      '- reset (left, top 70%): Resets the playhead to step 0.',
      '- main-input (event bus): Alternative clock input that also advances the sequence.',
      '- G (event bus): Toggles graphical playhead updates on/off for performance optimization.',
      '',
      'Outputs',
      '- sync (right, top 15%): Emits a pulse when the sequence wraps from last step to first, or on explicit reset.',
      '- row-0, row-1, ... row-N (right, dynamic): Each row has its own output handle that emits gate pulses with payload {index, row, gate, sourceHandle} when that row\'s active steps fire.',
      '- main-input (event bus, legacy): Row 0 also emits to main-input channel for backward compatibility.',
      '',
      'Configuration',
      '- Steps: 1-128 steps per row (configurable via input field).',
      '- Rows: Add/remove rows (1-25) with +/− buttons; each row gets a unique color-coded output handle.',
      '- Pattern editing: Click step dots to toggle on/off; Ctrl/Alt/Shift+click selects step for individual pulse length adjustment.',
      '- Pulse lengths: Set default pulse duration (ms) or configure per-step durations for fine timing control.',
      '- Graphics toggle: Checkbox to enable/disable visual playhead updates (useful when CPU-bound).',
      '',
      'Features',
      '- Visual playhead: Green gradient indicator shows current step position (when graphics enabled).',
      '- Pattern persistence: Automatically saves patterns to disk (sequencer-{id}-pattern.json in sampling/ folder) every 2 seconds.',
      '- Arrow key control: Use up/down arrows in numeric inputs for quick value adjustment.',
      '- Manual controls: Advance (▶) and Reset (↺) buttons for testing without clock source.',
      '',
      'Typical use cases',
      '- Creating multi-track drum patterns with independent triggers per instrument.',
      '- Generating rhythmic modulation patterns for filters, effects, or synth parameters.',
      '- Building polyrhythmic sequences by connecting different rows to different voices.',
      '- Step sequencing with per-step articulation control via pulse length variation.',
    ].join('\n'),
    component: SequencerPreview,
    defaultProps: {},
    controls: {},
  },
  {
    id: 'sequencer-frequency-node',
    title: 'Sequencer (Frequency)',
    description: [
      'Role',
      '- Multi-row frequency/pitch sequencer that advances on clock pulses and emits per-step frequency values with gate events.',
      '- Supports 1-25 independent rows, each with editable note values (e.g., C4, A#3) or direct frequency editing.',
      '',
      'Inputs',
      '- main-input (left, top 30%): Clock/gate pulse that advances the playhead to the next step.',
      '- reset (left, top 70%): Resets the playhead to step 0.',
      '- G (event bus): Toggles graphical playhead updates on/off for performance optimization.',
      '',
      'Outputs',
      '- sync (right, top 15%): Emits a pulse when the sequence wraps from last step to first.',
      '- row-0, row-1, ... row-N (right, dynamic): Each row outputs frequency values (Hz) plus gate events with payload {index, row, value, sourceHandle} when active steps fire.',
      '- main-input (event bus, legacy): Row 0 also emits to main-input channel for backward compatibility.',
      '',
      'Configuration',
      '- Steps: 1-128 steps per row (configurable via input field).',
      '- Rows: Add/remove rows (1-25) with +/− buttons; each row gets a unique color-coded output handle.',
      '- Frequency mode: Switch between MIDI (note numbers 24-96), Hz (20-20000 Hz) or LFO (0.01-250 Hz) via dropdown.',
      '- Pattern editing: Click step dots to toggle on/off; right-click to edit note name (e.g., "C#4").',
      '- Note editing: Direct text input for note names (supports sharps with # and flats with b).',
      '- Knob range: Visual knob per step shows and adjusts frequency/note value within current mode\'s range.',
      '- Pulse lengths: Set default pulse duration (ms) or configure per-step durations.',
      '- Graphics toggle: Checkbox to enable/disable visual updates.',
      '',
      'Features',
      '- Visual display: Each step shows note name (e.g., "A4") and frequency (e.g., "440Hz").',
      '- Multi-mode support: Seamlessly switch between MIDI note, Hz or LFO scales; existing frequencies are preserved and mapped to new scale.',
      '- Per-step configuration: Select any step to adjust its individual pulse length.',
      '- Arrow key control: Use up/down arrows in numeric inputs for quick value adjustment.',
      '- Pattern persistence: Supports saving/loading patterns like regular sequencer.',
      '',
      'Typical use cases',
      '- Melodic sequences and basslines routed directly to oscillator frequency inputs.',
      '- Arpeggios and chord progressions with per-note timing control.',
      '- Multi-voice polyphonic patterns using independent rows for different voices.',
      '- Filter cutoff modulation patterns using Hz or LFO mode.',
      '- Pitch automation for glitchy or experimental sound design.',
    ].join('\n'),
    component: SequencerFreqPreview,
    defaultProps: {},
    controls: {},
  },
  {
    id: 'automation-node',
    title: 'Automation',
    description: [
      'Role',
      '- Visual automation curve editor that generates time-based modulation envelopes for controlling parameters.',
      '- Creates custom breakpoint curves with adjustable duration, range, and loop settings.',
      '',
      'Inputs',
      '- main-input (left): Trigger/gate input that starts playback of the automation curve. Each trigger emits the full curve parameters to AudioGraphManager for scheduling.',
      '',
      'Output',
      '- output (right): Control signal following the drawn automation curve. Output is a percentage value (0-200% by default) that modulates connected parameters over time.',
      '',
      'Configuration',
      '- Node width: Adjustable from 260-2600px via numeric input (arrow keys: ±1px, Shift+arrows: ±10px).',
      '- Length: Automation duration from 0.05 to 30 seconds, adjusted via knob.',
      '- Range: Min/max percentage values (-1000% to +1000%, default 0-200%) define the vertical scale of the curve.',
      '- Loop: Checkbox to enable/disable curve looping (future feature for continuous playback).',
      '- Active %: Shows the percentage value of the currently selected point.',
      '',
      'Curve Editing',
      '- Visual canvas: Interactive 130px height canvas displays the automation curve with gridlines and percentage labels.',
      '- Add points: Click anywhere on canvas to add a breakpoint at that time/value position.',
      '- Move points: Click and drag any point to adjust its position. Points auto-sort by time (x-axis).',
      '- Delete points: Right-click on any point (except first/last) to remove it. Minimum 2 points required (start/end).',
      '- Delete button: Appears when non-endpoint is selected; click to remove that point.',
      '- Select points: Click near a point (22px threshold) to select it; selected points show yellow with orange outline and enlarged.',
      '- Point display: Each point shows as a dot; selected points are highlighted and show their percentage value.',
      '',
      'Coordinate System',
      '- X-axis: Normalized time 0..1 (left to right) representing 0% to 100% of lengthSec duration.',
      '- Y-axis: Normalized vertical position where 0 (top) = max%, 0.5 (middle) = 100%, 1 (bottom) = min%.',
      '- Default curve: Flat line at middle (100%) with points at start and end.',
      '- Visual labels: Top edge shows max%, bottom shows min%, with 0% baseline marked.',
      '',
      'Behavior',
      '- Trigger-based: Sending a gate to main-input emits the curve parameters (lengthSec, points, min, max, loop) to AudioGraphManager.',
      '- Scheduling: AudioGraphManager handles the actual time-based playback and value interpolation.',
      '- Linear interpolation: Output values are linearly interpolated between adjacent breakpoints.',
      '- Context menu prevention: Right-clicks on canvas are handled internally (point deletion) without triggering flow add-node palette.',
      '',
      'Features',
      '- Drag protection: Sets data-block-drag attribute during point manipulation to prevent accidental node dragging.',
      '- Width persistence: Node width is saved and restored with the node data.',
      '- Visual feedback: Canvas redraws on all parameter changes with anti-aliased curve rendering.',
      '- Keyboard control: Arrow keys in width/range inputs provide precise adjustments.',
      '',
      'Typical use cases',
      '- Filter cutoff sweeps and resonance modulation over time.',
      '- Gain/volume envelopes with custom attack/decay shapes.',
      '- Parameter automation for effects (delay time, reverb decay, distortion drive).',
      '- Complex modulation curves that don\'t fit standard ADSR envelopes.',
      '- Multi-stage automation sequences for evolving textures.',
      '- Macro control curves synchronized to musical phrases or sections.',
    ].join('\n'),
    component: AutomationPreview,
    defaultProps: {},
    controls: {},
  },
  {
    id: 'analyzer-gpt-node',
    title: 'Analyzer (GPT)',
    description: [
      'Role',
      '- Real-time audio visualization and analysis node with LED-style frequency bars or oscilloscope waveform display.',
      '- Monitors audio streams with configurable FFT analysis and provides visual feedback for mixing, sound design, and debugging.',
      '',
      'Inputs',
      '- main-input (left, top 55%): Audio signal to be analyzed. Connected audio passes through a tap gain node to the analyzer without interrupting the signal flow.',
      '',
      'Outputs',
      '- output (right, top 55%): Pass-through audio output. Signal is tapped for analysis but continues unchanged to downstream nodes.',
      '- Event bus: Emits analysis data every 33ms to \'\${nodeId}.analyser.data\' with payload {fftSize, freq: Uint8Array, wave: Uint8Array, timestamp}.',
      '',
      'Display Modes',
      '- bars: LED-style frequency spectrum with 52 columns and 24 rows. Color-coded by level (blue < 20%, green 20-75%, orange 75-90%, red > 90%).',
      '- scope: Oscilloscope-style waveform display showing time-domain audio signal.',
      '',
      'Configuration',
      '- Label: Editable text input for node identification.',
      '- Mode: Toggle between "bars" (frequency) and "scope" (waveform) visualization.',
      '- Color preset: Choose from "aurora" (blue/pink), "ember" (orange/cream), or "mono" (blue/white) gradient themes.',
      '- FFT size: 256, 512, 1024, 2048, or 4096 samples. Larger values provide better frequency resolution but slower response.',
      '- Smoothing: 0.00 to 0.98 time constant for temporal smoothing of frequency data. Higher values create smoother, slower-changing displays.',
      '- Min dB: Minimum decibel threshold (-96 default). Values below this are treated as silence.',
      '- Max dB: Maximum decibel threshold (-10 default). Values above this are clipped to maximum display.',
      '',
      'Visual Features',
      '- Canvas: 240x120px (scaled to 100% width) with gradient background matching selected color preset.',
      '- Peak meter: Shows current peak level as percentage (0-100%) updated every 180ms.',
      '- Glow effects: Active bars/waveform rendered with shadowBlur and lighter composite mode for visual pop.',
      '- Radial highlight: Subtle radial gradient overlay (35% opacity at 30%/20% position) for depth.',
      '- Bars mode: Gap spacing (2px horizontal, 1.5px vertical) with rounded corners for LED aesthetic.',
      '',
      'Technical Details',
      '- Analysis chain: Input → tapGain (unity) → AnalyserNode. TapGain is the exposed audioNode for connections.',
      '- Data extraction: getByteFrequencyData() for spectrum, getByteTimeDomainData() for waveform.',
      '- Update rate: RequestAnimationFrame loop with 33ms throttle for event bus emissions.',
      '- FFT validation: Automatically clamps and rounds fftSize to nearest power of 2 between 32 and 32768.',
      '- Memory efficiency: Uint8Array buffers (0-255 range) recreated when fftSize changes.',
      '',
      'Typical use cases',
      '- Monitoring frequency content during sound design and mixing.',
      '- Visualizing oscillator waveforms and filter frequency responses.',
      '- Debugging signal flow issues (silence detection, clipping identification).',
      '- Creating visual feedback for live performances or recording sessions.',
      '- Analyzing transients and attack characteristics in percussive sounds.',
      '- Real-time spectrum analysis for educational demonstrations.',
    ].join('\n'),
    component: AnalyzerPreview,
    defaultProps: {},
    controls: {},
  },
  {
    id: 'log-node',
    title: 'Log',
    description: [
      'Role',
      '- Debugging and inspection node that displays a real-time history of incoming events with timestamps and payloads.',
      '- Purely observational - does not pass signals through or connect to the audio graph.',
      '',
      'Inputs',
      '- main-input (left): Receives both receiveNodeOn and receiveNodeOff events. All incoming data is logged and displayed in chronological order.',
      '',
      'Outputs',
      '- None. This is a terminal/observer node that does not output signals. Events are logged to both the UI display and browser console.',
      '',
      'Configuration',
      '- Label: Text input field for naming the log node (helpful when using multiple log nodes).',
      '- Max entries: Numeric input (1-200, default 20) controlling how many recent events to keep in history.',
      '',
      'Display Features',
      '- Event list: Scrollable panel (max height 200px) showing recent events in reverse chronological order (newest first).',
      '- Event type badges: "on" events shown in green, "off" events in red.',
      '- Timestamps: Each entry shows time in HH:MM:SS.mmm format with millisecond precision.',
      '- Expandable details: Click any event summary to reveal full payload in a formatted code block.',
      '- JSON formatting: Object payloads automatically pretty-printed with 2-space indentation.',
      '- Empty state: Shows "no events" message when no data has been received.',
      '',
      'Technical Details',
      '- Event subscription: Listens to \'\${nodeId}.main-input.receiveNodeOn\' and \'\${nodeId}.main-input.receiveNodeOff\' on EventBus.',
      '- Console logging: All events also logged to browser console with [LogFlowNode ON/OFF] prefix and node ID.',
      '- State management: Recent entries stored in React state array, automatically trimmed to maxEntries length.',
      '- No audio connection: VirtualLogNode does not create or connect any Web Audio nodes.',
      '- Memory efficiency: Only stores the specified number of recent events; older events are automatically discarded.',
      '',
      'UI Styling',
      '- Event panel: Dark background (#181818) with 1px border, 4px padding, and rounded corners.',
      '- Summary rows: Truncated with ellipsis for long payloads, separated by bottom borders.',
      '- Payload view: Monospace font (Consolas/Monaco) with cyan text color (#0cf) on dark background (#111).',
      '- Auto-scroll: Panel scrolls vertically when event list exceeds 200px height.',
      '',
      'Typical use cases',
      '- Debugging signal flow by observing what events reach specific points in the graph.',
      '- Inspecting control values and timing during development.',
      '- Monitoring gate/trigger patterns from sequencers or clocks.',
      '- Verifying MIDI note data conversion and frequency values.',
      '- Tracking automation curve outputs and parameter changes.',
      '- Analyzing event payloads for troubleshooting complex patches.',
    ].join('\n'),
    component: LogPreview,
    defaultProps: {},
    controls: {},
  },
  {
    id: 'midi-knob-node',
    title: 'MIDI Knob',
    description: [
      'Role',
      '- Macro control knob that can be mapped to MIDI CC controllers, emitting continuous control signals. Supports MIDI learn, curve types (linear, exponential, logarithmic), and trigger-based value emission.',
      '',
      'Important Note',
      '- This is a control/event node, NOT an audio processing node. It generates control values that can be routed to audio parameter inputs or other control nodes.',
      '',
      'Inputs',
      '- main-input (left, top ~22px): trigger events (receiveNodeOn) that cause the node to emit its current value to the output. Useful for synchronizing value updates with clock signals or other event sources.',
      '',
      'Output',
      '- output (right, top ~18px): emits current knob value with each change or trigger. Value is scaled between min/max range and shaped by the selected curve type. Payload: { value: number }',
      '',
      'MIDI Learn & Mapping',
      '- Right-click the knob to enter MIDI learn mode (10s timeout).',
      '- Move any MIDI CC controller to map it to this knob.',
      '- Supports both absolute and relative (two\'s complement) CC modes.',
      '- Automatically detects relative encoders (CC values around 64).',
      '- Mapped CC shown below knob: "CC {number}"',
      '- Mapping persists in localStorage if persistKey provided.',
      '- Smoothing and sensitivity controls via midiSmoothing and midiSensitivity props.',
      '',
      'Curve Types',
      '- linear: uniform scaling from min to max (default)',
      '- exponential: emphasizes low end with power curve (k=3), useful for frequency ranges',
      '- logarithmic: proportional scaling for positive ranges (min/max > 0), useful for decibel or frequency controls',
      '- Curve is applied when mapping from normalized [0..1] to min/max range.',
      '',
      'UI Controls',
      '- Node name input: editable label at top',
      '- Main knob: 44x44px rotary control with visual feedback',
      '- Value display: shows current value with 4 decimal precision',
      '- "adv" button: toggles advanced controls panel',
      '- Advanced panel (when open):',
      '  - Min: text input for minimum value (supports negative, decimal)',
      '  - Max: text input for maximum value',
      '  - Curve: dropdown selector (linear/logarithmic/exponential)',
      '- Node width: 70px (compact), height adjusts for expanded controls',
      '',
      'Value Range & Resolution',
      '- Internal knob uses MIDI-like resolution (0-127) for smooth, predictable operation.',
      '- Output value is scaled and curved to configured min/max range.',
      '- Supports any numeric range including negative values.',
      '- Value clamped to min/max bounds.',
      '',
      'Typical use cases',
      '- Mapping hardware MIDI controllers to synthesis parameters.',
      '- Creating macro controls that drive multiple downstream parameters.',
      '- Building control surfaces for live performance.',
      '- Centralized parameter control with MIDI integration.',
      '- Frequency control with logarithmic mapping.',
      '- Envelope/filter parameters with exponential curves.',
      '- Triggered parameter changes synchronized to clock or sequencer.',
      '',
      'Behaviour (VirtualMidiKnobNode)',
      '- VirtualMidiKnobNode is an event-only node (no Web Audio AudioNode). It maintains knob state and handles MIDI.',
      '- Constructor: initializes value, min, max, curve from node.data, subscribes to main-input.receiveNodeOn and updateParams.midiLearn events, calls setupMidi() for MIDI CC handling, emits initial render() to establish baseline state.',
      '- handleReceiveNodeOn(data): responds to trigger events on main-input by emitting current value via handleConnectedEdges with { value }. Allows external events to request current state.',
      '- handleUpdateParams(node, payload): processes parameter updates from UI (min, max, value, curve, midiMapping). Only triggers render() if values actually changed to avoid unnecessary emissions.',
      '- render(value, min, max, curve, midiMapping): consolidated emission method that checks for actual changes using snapshot comparison (_lastSnapshot). Emits two events:',
      '  1. nodeId.params.updateParams.internal: internal state sync (prevents feedback loops)',
      '  2. handleConnectedEdges with { value }: downstream trigger with current value',
      '- mapCcToValue(v): maps incoming MIDI CC value (0..127) to output range using configured curve:',
      '  - Normalizes CC to [0..1]',
      '  - Applies curve transformation (linear/exponential/logarithmic)',
      '  - Scales to [min..max]',
      '- setupMidi(): establishes MIDI listener via MidiManager singleton. Handles CC messages (status 0xB0) matching midiMapping.channel and midiMapping.number. On match: calls mapCcToValue(), updates internal value, emits params.updateParams for UI sync, calls render() to propagate to outputs.',
      '- startMidiLearn(): initiates one-shot MIDI message listener. On first CC message (0xB0 status), creates midiMapping { type: \'cc\', channel, number }, emits params.updateParams to notify UI and persist mapping, calls render() to propagate mapping change, unsubscribes listener. For absolute CCs, immediately jumps to hardware position.',
      '- dispose(): unsubscribes all EventBus listeners by nodeId, releases MIDI listener (unsubscribeMidi).',
      '',
      'State Management',
      '- value: current knob position (scaled to min/max range)',
      '- min: minimum output value (default 0)',
      '- max: maximum output value (default 1)',
      '- curve: scaling curve type (linear/exponential/logarithmic)',
      '- midiMapping: { type: \'cc\', channel: number, number: number } | null',
      '- _lastSnapshot: tracks last emitted state to prevent duplicate emissions',
      '- All state persisted in node.data for session continuity.',
      '',
      'Event Flow',
      '1. User rotates knob OR MIDI CC arrives → value updated',
      '2. VirtualMidiKnobNode.render() checks for actual change',
      '3. Emits params.updateParams.internal (UI sync)',
      '4. Emits via handleConnectedEdges with { value } to output handle',
      '5. Connected parameter inputs receive new value',
      '6. Alternatively, external trigger at main-input → handleReceiveNodeOn → immediate emission of current value',
    ].join('\n'),
    component: MidiKnobPreview,
    defaultProps: {
      label: 'Macro',
      min: 0,
      max: 1,
      curve: 'linear',
      value: 0.5,
    },
    controls: {
      label: { type: 'string', label: 'Label' },
      min: { type: 'number', label: 'Min' },
      max: { type: 'number', label: 'Max' },
      curve: {
        type: 'select',
        label: 'Curve',
        options: ['linear', 'exp', 'log'],
      },
      value: { type: 'number', label: 'Value' },
    },
  },
  {
    id: 'event-node',
    title: 'Event',
    description: [
      'Role',
      '- Generic event router and transformer for non-audio data flowing through the graph. Listens to EventBus events (both graph-internal and external application events) and applies JavaScript transformations before forwarding to connected nodes. Bridges external application events with the flow graph.',
      '',
      'Important Note',
      '- This is a control/event node, NOT an audio processing node. It operates on event data, not audio signals. Used for coordinating control logic, UI interactions, MIDI messages, and custom application events.',
      '',
      'Inputs',
      '- main-input (left, top ~32px): trigger events (receiveNodeOn / receiveNodeOff) from connected nodes. Incoming events are transformed via functionCode and forwarded to output. Accepts any payload structure; the value is passed as the \'main\' parameter to the transformation function.',
      '',
      'Output',
      '- output (right, center ~50%): emits transformed events to connected nodes. After applying functionCode transformation, emits sendNodeOn or sendNodeOff (matching input event type) with the transformed payload. Payload structure: { value: transformedResult }',
      '',
      'EventBus Listener',
      '- Dropdown selector shows all available EventBus event names (both graph-internal events like nodeId.handle.receiveNodeOn and custom application events).',
      '- When a listener is selected, the node subscribes to that EventBus event.',
      '- External events received on the listener are automatically transformed and emitted to output as receiveNodeOn.',
      '- Refresh button (↻) updates the list of available events.',
      '- Listener examples: custom app events, global MIDI events, system notifications, inter-node coordination events.',
      '',
      'Function Transformation',
      '- JavaScript code editor (CodeMirror) allows custom transformation logic.',
      '- Function receives \'main\' parameter containing the incoming event payload.',
      '- Default: "return main;" (pass-through, no transformation)',
      '- Function should return the transformed value to be sent to output.',
      '- Example: "return { on: main, off: main };" - structure for downstream nodes',
      '- Example: "return Number(main) * 2;" - multiply numeric values',
      '- Example: "return { ...main, timestamp: Date.now() };" - add metadata',
      '- Transformation errors are caught and emitted as { error: errorMessage } to prevent graph crashes.',
      '',
      'Last Payload Display',
      '- Shows the most recent payload received from the listener in JSON format.',
      '- Scrollable display (max 120px height) for inspecting complex payloads.',
      '- Updates in real-time when listener events arrive.',
      '- Useful for debugging event structures and verifying listener behavior.',
      '',
      'UI Controls',
      '- Listener dropdown: select EventBus event to subscribe to (80px label width)',
      '- Refresh button (↻): reload available event list from EventBus',
      '- Last payload display: JSON-formatted event data preview (monospace, scrollable)',
      '- Function Editor: CodeMirror with JavaScript syntax highlighting and dark theme',
      '- Test transform button: manually execute functionCode with lastPayload (preview only in UI)',
      '- Node size: 360px wide, dynamic height based on code editor and payload display',
      '',
      'Event Flow Modes',
      '1. Graph-triggered (via main-input):',
      '   - Connected node emits event to main-input',
      '   - VirtualEventNode receives receiveNodeOn or receiveNodeOff',
      '   - Applies functionCode transformation',
      '   - Emits sendNodeOn/sendNodeOff to output',
      '   - Connected downstream nodes receive transformed payload',
      '',
      '2. EventBus listener (external trigger):',
      '   - External code/UI emits to selected EventBus event',
      '   - VirtualEventNode receives via listener subscription',
      '   - Applies functionCode transformation',
      '   - Emits as receiveNodeOn to output',
      '   - Connected downstream nodes receive transformed payload',
      '',
      '3. Manual test (UI only):',
      '   - "Test transform" button applies functionCode to lastPayload',
      '   - Result shown in UI only (does not emit to graph)',
      '   - Useful for validating transformation logic',
      '',
      'External Trigger Integration',
      '- External code can trigger via: window.flowSynth?.emit(eventName, payload)',
      '- If Event node listens to eventName, it will receive and transform the payload.',
      '- Enables integration with custom UI elements, WebSocket events, external APIs, etc.',
      '- Example: window.flowSynth?.emit(\'customTrigger\', { note: 60, velocity: 127 })',
      '',
      'Typical use cases',
      '- Bridging external application events into the flow graph.',
      '- Transforming event payloads between incompatible node formats.',
      '- Coordinating interactions between UI elements, MIDI, and audio nodes.',
      '- Implementing higher-level control logic (state machines, conditional routing).',
      '- Converting external API responses into graph-compatible events.',
      '- Adding metadata or timestamps to events flowing through the graph.',
      '- Debugging event flow by logging or reformatting payloads.',
      '- Multiplexing external events to multiple graph branches.',
      '',
      'Behaviour (VirtualEventNode)',
      '- VirtualEventNode is an event-only node (no Web Audio AudioNode). It subscribes to EventBus events and transforms payloads.',
      '- Constructor: initializes listener and functionCode from node.data, subscribes to nodeId.params.updateParams for UI-driven config changes, subscribes to nodeId.main-input.receiveNodeOn and nodeId.main-input.receiveNodeOff for graph-triggered events. If listener is defined, immediately subscribes to that EventBus event with externalHandler.',
      '',
      'params.updateParams subscription:',
      '- When listener changes: unsubscribes from old listener, subscribes to new listener with externalHandler',
      '- When functionCode changes: updates internal transformation function',
      '- Dynamic reconfiguration without node recreation',
      '',
      'main-input.receiveNodeOn / receiveNodeOff subscriptions:',
      '- Extract value from inputData?.value ?? inputData',
      '- Call emitTransformed(value, eventType)',
      '- Allows connected nodes to trigger transformations',
      '',
      'externalHandler (listener callback):',
      '- Receives raw payload from subscribed EventBus event',
      '- Calls emitTransformed(payload, \'receiveNodeOn\')',
      '- Always emits as receiveNodeOn regardless of external event nature',
      '',
      'emitTransformed(main, kind):',
      '1. Create new Function with \'main\' parameter and functionCode body',
      '2. Execute function: const result = func(main)',
      '3. Emit to EventBus at nodeId.main-input.sendNodeOn or sendNodeOff (matching kind)',
      '4. Call handleConnected(node, { value: result }, kind) to route to graph edges',
      '5. On error: emit { value: { error: String(e) } } instead of throwing',
      '',
      'Error Handling:',
      '- Transformation errors are caught in try-catch',
      '- Emits { error: errorMessage } to output instead of crashing',
      '- Allows graph to continue operating even with faulty transformations',
      '- Downstream nodes receive error object and can handle appropriately',
      '',
      'State Management',
      '- listener: currently subscribed EventBus event name (string | undefined)',
      '- functionCode: JavaScript transformation function (string)',
      '- externalHandler: callback for EventBus listener subscription (managed internally)',
      '- lastPayload: most recent event payload (UI-only state, not used in VirtualNode)',
      '- All state persisted in node.data via onChange callback for session continuity.',
    ].join('\n'),
    component: EventPreview,
    defaultProps: {},
    controls: {},
  },
  {
    id: 'mouse-trigger-button-node',
    title: 'Mouse Trigger Button',
    description: [
      'Role',
      '- Interactive button node specialized for direct mouse/pointer interactions (press, hold, release) that emits ON and OFF events. Useful for manual triggering, live performance, and patch testing. Functions as both a user interface element and a flow graph node.',
      '',
      'Important Note',
      '- This is a control/event node, NOT an audio processing node. It generates trigger events (sendNodeOn/sendNodeOff) that can control envelopes, gates, sequencers, and other event-driven nodes.',
      '',
      'Inputs',
      '- main-input (left, center ~50%): optional trigger input that allows chaining with other trigger sources. While the node primarily responds to mouse interaction, it can receive external trigger events for programmatic control or cascading trigger chains. This enables integration with sequencers, clocks, or other trigger generators.',
      '',
      'Output',
      '- output (right, center ~50%): emits trigger events based on button state. Sends sendNodeOn when button is pressed (pointer down) and sendNodeOff when button is released (pointer up). Payload: { nodeid: string, source: \'mouse\' }. Connected to mainOutput class for standard trigger routing.',
      '',
      'Button Interaction',
      '- Pointer Down: activates button, changes background to green (#1fa64d active, #336633 container), displays "ON", emits sendNodeOn event',
      '- Pointer Up: deactivates button, restores normal background (#2f2f2f button, #1f1f1f container), displays "Trigger", emits sendNodeOff event',
      '- Pointer Leave (while active): automatically releases button and emits sendNodeOff to prevent stuck triggers',
      '- Global Pointer Up listener: ensures button releases even if pointer leaves node area, preventing orphaned ON states',
      '',
      'Visual Feedback',
      '- Inactive state: gray background (#2f2f2f), white text, "Trigger" label',
      '- Active state: bright green background (#1fa64d), white text, "ON" label',
      '- Container background: dark (#1f1f1f) inactive, darker green (#336633) active',
      '- Bold text (fontWeight: bold), 13px font size',
      '- Smooth color transitions provide clear visual feedback',
      '',
      'Node Appearance',
      '- Width: 80px (compact, suitable for dense patches)',
      '- Min height: 36px (adequate for touch/pointer targets)',
      '- Border: 1px solid #2a3139',
      '- Border radius: 5px (rounded corners)',
      '- User select disabled (prevents accidental text selection during rapid clicking)',
      '',
      'Event Emission',
      '- Emits to EventBus at: nodeId + \'.main-input.sendNodeOn\' (press) and nodeId + \'.main-input.sendNodeOff\' (release)',
      '- Payload structure: { nodeid: nodeId, source: \'mouse\' }',
      '- Source tag \'mouse\' identifies events as originating from direct user interaction',
      '- Events route through graph manager to connected downstream nodes',
      '',
      'Pointer Event Handling',
      '- Uses Pointer Events API (works with mouse, touch, pen)',
      '- stopPropagation() on pointer events prevents interference with XYFlow drag behavior',
      '- Global window listener for pointer up ensures clean release even if pointer leaves viewport',
      '- Cleanup on unmount removes global listener to prevent memory leaks',
      '',
      'Interaction Classes',
      '- nodrag: prevents XYFlow drag when interacting with button',
      '- nowheel: disables mouse wheel events on button',
      '- nopan: prevents canvas panning when clicking button',
      '- Essential for separating button interaction from canvas navigation',
      '',
      'Typical use cases',
      '- Manual triggering of envelopes, gates, or sequencers during live performance.',
      '- Testing and debugging patches by manually firing events.',
      '- Creating interactive control panels with multiple trigger buttons.',
      '- Starting/stopping recording or playback sequences.',
      '- Triggering one-shot samples or sound effects.',
      '- Manually advancing sequencers or step controls.',
      '- Gate control for filters, VCAs, or other dynamics processors.',
      '- Live performance tools for human-in-the-loop control.',
      '- Emergency stop/reset buttons in complex patches.',
      '- Teaching and demonstration of patch behavior.',
      '',
      'Behaviour (VirtualMouseTriggerButtonNode)',
      '- VirtualMouseTriggerButtonNode is an event-only node (no Web Audio AudioNode). All logic is handled directly by the FlowNode component.',
      '- Constructor: minimal initialization, extends VirtualNode with undefined audioNode and params.',
      '- render(): empty implementation - all event handling occurs in the FlowNode UI component.',
      '- The FlowNode directly emits to EventBus without routing through the VirtualNode, making it a pure UI-driven trigger source.',
      '- This architecture keeps latency minimal for responsive user interaction.',
      '',
      'Event Flow',
      '1. User presses button (pointer down)',
      '2. FlowNode sets active state to true',
      '3. Background changes to green, label changes to "ON"',
      '4. FlowNode calls fireOn() → emits nodeId.main-input.sendNodeOn to EventBus',
      '5. Graph manager routes sendNodeOn to connected output edges',
      '6. Downstream nodes receive trigger event',
      '7. User releases button (pointer up or pointer leave)',
      '8. FlowNode sets active state to false',
      '9. Background restores to gray, label changes to "Trigger"',
      '10. FlowNode calls fireOff() → emits nodeId.main-input.sendNodeOff to EventBus',
      '11. Graph manager routes sendNodeOff to connected output edges',
      '12. Downstream nodes receive release event',
      '',
      'State Management',
      '- active: boolean state tracking button press (true = pressed, false = released)',
      '- style: React.CSSProperties merged with DEFAULT_STYLE, persisted via onChange',
      '- label: optional button text (not currently exposed in UI, defaults to state-based "Trigger"/"ON")',
      '- All state managed in FlowNode component (useState), not in VirtualNode',
      '',
      'Memory Management',
      '- Global pointer up listener added on mount, removed on unmount',
      '- useEffect cleanup ensures no orphaned listeners',
      '- React.memo optimization prevents unnecessary re-renders',
      '- Event handler callbacks memoized with useCallback for performance',
    ].join('\n'),
    component: MouseTriggerPreview,
    defaultProps: {
      label: 'Mouse Trigger',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'noise-node',
    title: 'Noise',
    description: [
      'Role',
      '- AudioWorklet-based noise generator that produces various types of noise (white, pink, brown, blue, violet, gray) for sound design, percussion, textures, and modulation. Pure audio source node with no audio inputs. Hot-swappable noise type selection with dynamic processor code generation.',
      '',
      'Important Note',
      '- This is an AUDIO SOURCE node implemented via AudioWorkletProcessor. It generates audio signals, not control/event data. No audio inputs are available - this is a pure generator node.',
      '',
      'Inputs',
      '- None. This node is a pure audio source with no audio or control inputs. Noise generation is continuous and controlled only by the noise type selector.',
      '',
      'Output',
      '- output (right, center ~50%): continuous audio stream of selected noise type. Output amplitude is scaled to 0.35 (35% of full scale) to prevent clipping when mixed with other sources. Suitable for feeding into filters, envelopes, effects, or mixing directly into the signal chain.',
      '',
      'Noise Types',
      '- white: uniform spectral density across all frequencies. Pure random values: (Math.random()*2-1). Bright, hissy character. Ideal for percussion hats, cymbals, snare snares.',
      '- pink: equal energy per octave (1/f spectrum). Softer than white noise. Implemented via 7-stage filter bank with carefully tuned coefficients. Natural, balanced sound. Great for ambient textures, wind, rain, or general background noise.',
      '- brown: even softer than pink (1/f² spectrum). Random walk accumulator with clamping to [-1, 1]. Deep, rumbling character. Useful for drones, bass textures, thunder, or low-frequency modulation.',
      '- blue: rising spectrum (f spectrum, inverse of pink). Calculated as difference of two white noise samples. Bright, airy, less harsh than white. Good for breath sounds, air, or high-frequency emphasis.',
      '- violet: steeper rising spectrum (f² spectrum). Second-order difference of white noise. Very bright, thin character. Specialized use for extreme high-frequency content or as modulation source.',
      '- gray: psychoacoustic equal loudness across frequencies. Simple IIR filter (0.97 feedback) smoothing white noise. Balanced perceived loudness. Natural for speech-like textures or neutral background.',
      '',
      'UI Controls',
      '- Noise type dropdown: select from 6 noise types (white/pink/brown/blue/violet/gray)',
      '- Compact selector: 80px width, dark theme (#1e1e1e background, #eee text)',
      '- Small font (0.6rem) for space efficiency',
      '- Centered text alignment',
      '- No label input (noise type is the primary control)',
      '',
      'Node Appearance',
      '- Width: 80px (compact, suitable for dense patches)',
      '- Padding: 4px',
      '- Text centered',
      '- Output handle: right side, center position, 10x10px, gray #444 with #888 border',
      '',
      'Dynamic Processor Generation',
      '- When noise type changes, NoiseFlowNode calls buildNoiseProcessor(noiseType) to generate fresh AudioWorkletProcessor code.',
      '- Generated code includes type-specific algorithm (white/pink/brown/blue/violet/gray).',
      '- Processor maintains internal state for stateful algorithms (pink filter bank, brown accumulator, gray IIR).',
      '- Fixed amplitude scaling: sample * 0.35 (prevents clipping, maintains headroom).',
      '- No gain parameter exposed (simplicity; use downstream Gain node for volume control).',
      '',
      'Hot Swap / Live Updates',
      '- NoiseFlowNode emits nodeId + \'.processor.save\' event with { code } when type changes.',
      '- VirtualAudioWorkletNode listens for .processor.save, tears down old worklet, compiles and instantiates new processor.',
      '- Seamless transition without node recreation or edge reconnection.',
      '- Graph remains live; downstream nodes continue receiving audio without interruption.',
      '',
      'AudioWorklet Implementation',
      '- Uses ExtendAudioWorkletProcessor class (registered dynamically per node instance).',
      '- Processor name: noise-worklet-processor-{nodeId} (unique per node).',
      '- Constructor initializes state arrays (_pinkState: Float32Array(7), _brown: number, _grayLast: number).',
      '- process() method: generates noise samples per channel per frame, applies type-specific algorithm, outputs scaled samples.',
      '- No parameterDescriptors (no exposed automation parameters for simplicity).',
      '- Pure source node: ignores inputs array, writes directly to outputs[0].',
      '',
      'Algorithm Details',
      '- White: Math.random()*2-1 (uniform distribution, -1 to +1)',
      '- Pink: 7-stage IIR filter bank with coefficients (0.99886, 0.99332, 0.96900, 0.86650, 0.55000, -0.7616) + white noise injection. Sum scaled by 0.11. Classic Voss-McCartney algorithm approximation.',
      '- Brown: Brownian motion via random walk: _brown += (Math.random()*2-1)*0.02, clamped to [-1, 1]. Integrator with leak.',
      '- Blue: Difference filter: w2 - w1 (two consecutive white samples). First-order high-pass characteristic.',
      '- Violet: Second difference: w3 - 2*w2 + w1 (three consecutive white samples). Second-order high-pass.',
      '- Gray: Simple IIR low-pass: _grayLast = 0.97 * _grayLast + 0.03 * white. Single-pole smoothing filter.',
      '',
      'Fallback Processor Code',
      '- If node.data.processorCode is missing on graph load, AudioGraphManager generates default code in addVirtualNode case "NoiseFlowNode".',
      '- Default uses noiseType from node.data (or \'white\' if undefined).',
      '- Ensures backward compatibility with older saved graphs.',
      '- Generated code includes all 6 noise types in a switch statement.',
      '',
      'Typical use cases',
      '- Synthesizer percussion: white/pink noise through ADSR envelope and filter for hi-hats, snares, cymbals.',
      '- Sound design textures: pink/brown noise for wind, rain, ocean, ambient backgrounds.',
      '- Modulation source: any noise type routed to parameter inputs for randomized modulation.',
      '- Filter sweeps and risers: noise + automated filter frequency for build-ups and transitions.',
      '- Subtractive synthesis: noise as raw material, shaped by filters and envelopes.',
      '- Clap synthesis: burst of filtered white noise.',
      '- Bass textures: brown noise with slight filtering for deep drones.',
      '- High-frequency sparkle: blue/violet noise mixed subtly into pads or leads.',
      '- Test signal: white noise for testing filters, effects, or frequency response.',
      '- Vinyl/tape emulation: gentle pink or gray noise for analog warmth.',
      '',
      'Behaviour (VirtualAudioWorkletNode)',
      '- NoiseFlowNode is backed by VirtualAudioWorkletNode, not a dedicated VirtualNoiseNode.',
      '- AudioGraphManager treats it as a specialized AudioWorklet source (case "NoiseFlowNode" in addVirtualNode).',
      '- Constructor: VirtualAudioWorkletNode receives audioContext, eventBus, node, and unique processorName \'noise-worklet-processor-{nodeId}\'.',
      '- createWorklet(): compiles processorCode via Blob + AudioWorklet.addModule(), then creates AudioWorkletNode instance.',
      '- Listens to nodeId.processor.save event: on receipt, calls teardown(), awaits createWorklet() with new code, restores connections.',
      '- No explicit render() calls for noise (processor generates continuously once instantiated).',
      '- AudioWorkletNode.connect() used for routing output to downstream nodes.',
      '',
      'State Management',
      '- noiseType: current selected noise type (white/pink/brown/blue/violet/gray), persisted in node.data',
      '- processorCode: dynamically generated AudioWorkletProcessor source code (string), persisted in node.data',
      '- Internal processor state (_pinkState, _brown, _grayLast) maintained within AudioWorkletProcessor instance (not accessible from main thread)',
      '- UI state managed in NoiseFlowNode component (useState), synced to node.data via useEffect',
      '',
      'Performance',
      '- AudioWorklet runs on dedicated audio thread (no main thread blocking)',
      '- Efficient per-sample processing (no buffer allocation overhead)',
      '- Hot swap incurs brief audio glitch during processor teardown/recreation (~10-50ms)',
      '- Stateful algorithms (pink, brown, gray) maintain continuity across render quanta',
      '',
      'Amplitude Scaling',
      '- All noise types scaled by 0.35 (buf[i] = sample * 0.35)',
      '- Prevents clipping when multiple noise sources or mixed with oscillators',
      '- Maintains approximately -9dB headroom',
      '- For louder output, chain through Gain node or use in mix with appropriate levels',
    ].join('\n'),
    component: NoisePreview,
    defaultProps: {
      label: 'Noise',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'mic-node',
    title: 'Mic',
    description: [
      'Role',
      '- Microphone/audio input device node that captures live audio from the user\'s microphone or line-in and brings it into the graph as an audio source. Pure source node with device selection and dynamic switching capabilities.',
      '',
      'Important Note',
      '- This is an AUDIO INPUT DEVICE node (microphone/line-in capture), NOT a virtual routing node. It captures real audio from hardware devices connected to the computer.',
      '',
      'Inputs',
      '- None. This is a pure audio source node with no input handles. Audio comes directly from the selected hardware device (microphone, line-in, etc.).',
      '',
      'Output',
      '- output (right, center ~50%): live audio stream from the selected microphone or audio input device. Audio is routed through a bypass AudioWorklet for consistent processing and can be connected to any audio processing node downstream (filters, effects, analyzers, recorders, etc.).',
      '',
   
      'Device Selection',
      '- Dynamic device dropdown: lists all available audio input devices (microphones, line-in, etc.).',
      '- Default option: uses system default microphone when no specific device is selected.',
      '- Refresh button (↻): manually re-enumerates devices to detect newly connected hardware.',
      '- Device persistence: selected device ID is saved and restored when reopening the flow.',
      '- Hot-swap support: changing devices dynamically recreates the audio source without breaking connections.',
      '',
      'Permissions & Security',
      '- Browser microphone permission required: first use triggers browser permission prompt.',
      '- Permission error display: shows error message if permission is denied or enumeration fails.',
      '- Automatic permission check: attempts getUserMedia on mount to ensure permission is granted before listing devices.',
      '- Device labels: full device names only visible after permission is granted; otherwise shows generic labels.',
      '',
      'UI Controls',
      '- "Device" label with refresh button: header for device selection.',
      '- Device dropdown: select from available audio input devices or use default.',
      '- Loading indicator: shows "(loading...)" during device enumeration.',
      '- Permission error display: red text showing permission/enumeration failure reasons.',
      '',
      'Node Appearance',
      '- Width: 180px (accommodates device dropdown).',
      '- Padding: 6px (compact, functional layout).',
      '- Font size: 0.6rem for labels, 0.65rem for dropdown (space-efficient).',
      '- Dark theme styling: #1e1e1e background, #eee text, #444 borders.',
      '- Output handle: right side, center (50%), 10x10px.',
      '',
      'Audio Configuration (VirtualMicNode)',
      '- Channel count: mono (1 channel, ideal: 1, max: 1) to reduce processing cost.',
      '- Sample rate: matches AudioContext.sampleRate (typically 48000 Hz) to avoid resampling overhead.',
      '- Echo cancellation: disabled (preserves raw audio for processing).',
      '- Noise suppression: disabled (preserves raw audio).',
      '- Auto gain control: disabled (preserves dynamic range for manual processing).',
      '- Latency: controlled by AudioContext latencyHint: \'interactive\' (typically 3-6ms) for low-latency monitoring.',
      '',
      'Typical use cases',
      '- Vocal processing: real-time effects, pitch correction, harmonization.',
      '- Instrument processing: guitar/bass effects chains, amp simulation.',
      '- Live sampling: record loops or one-shots directly from mic input.',
      '- Voice analysis: pitch detection, speech recognition, formant analysis.',
      '- Live performance: low-latency monitoring with effects.',
      '- Podcast/streaming: real-time audio enhancement and filtering.',
      '',
      'Virtual behaviour (VirtualMicNode)',
      '- VirtualMicNode wraps a MediaStreamAudioSourceNode created from navigator.mediaDevices.getUserMedia.',
      '- Device switching: when selectedDeviceId changes (via params.updateParams), the node tears down the old MediaStream, requests a new one with the updated device constraint, and reconnects seamlessly.',
      '- Race condition protection: createToken mechanism prevents overlapping device switches; only the latest request completes.',
      '- Stream lifecycle: old stream tracks are stopped after the new stream is successfully connected to avoid audio gaps.',
      '- Bypass worklet: audio is routed through a simple AudioWorklet pass-through processor (mic-bypass-processor) for consistent graph topology and potential future processing injection.',
      '- Worklet registration: processor code is inlined and registered dynamically; worklet URL is managed and revoked on disposal.',
      '- Error handling: if getUserMedia fails (permission denied, device unavailable), audioNode is cleared and permission error is displayed in UI.',
      '- render(): creates initial MediaStream using selectedDeviceId from node.data (if present) or system default.',
      '- disconnect(): stops all MediaStream tracks, disconnects source and worklet nodes, revokes worklet URL, cleans up all resources.',
      '',
      'Device Enumeration',
      '- Uses navigator.mediaDevices.enumerateDevices() to list all audio input devices.',
      '- Permission-aware: calls getUserMedia first (then immediately stops tracks) to trigger permission and ensure device labels are visible.',
      '- Filters for kind === \'audioinput\' to show only microphones and line-in devices.',
      '- Device validation: if previously selected device is no longer available (unplugged), selection is cleared and default is used.',
      '- Loading state: displays loading indicator during enumeration (permission prompt + device listing).',
      '- Error feedback: displays permission errors or enumeration failures in red text below dropdown.',
    ].join('\n'),
    component: MicPreview,
    defaultProps: {
      label: 'Mic',
      autoStart: false,
    },
    controls: {
      label: { type: 'string', label: 'Label' },
      autoStart: { type: 'boolean', label: 'Auto start' },
    },
  },
  {
    id: 'recording-node',
    title: 'Recording',
    description: [
      'Role',
      '- Audio recording node that captures incoming audio via AudioWorklet and saves it as WAV files to disk (File System Access API) or triggers browser download. Features pass-through topology (audio continues downstream), dual control modes (toggle vs hold), and external trigger support for hands-free recording.',
      '',
      'Important Note',
      '- This is an AUDIO PROCESSING and FILE I/O node. It both processes audio (pass-through with tap recording) and performs file operations. Recorded audio is saved as 16-bit PCM WAV files.',
      '',
      'Inputs',
      '- main-input (left, top ~30%): primary audio stream to be recorded and passed through. Connects to any audio source (oscillators, samples, mic, effects chains, etc.). Audio is tapped by the recorder worklet and simultaneously forwarded to output.',
      '- record (left, top ~70%): external trigger input for remote start/stop control. Behavior depends on Hold Mode setting:',
      '  - Toggle mode (holdMode=false): receiveNodeOn OR receiveNodeOff toggles recording state (on→off, off→on).',
      '  - Hold mode (holdMode=true): receiveNodeOn starts recording, receiveNodeOff stops recording.',
      '  This handle enables sequencer-driven recording, clock-synced loops, or MIDI-triggered captures.',
      '',
      'Output',
      '- output (right, center ~50%): pass-through audio forwarded unchanged from main-input. Allows recording node to sit inline in an effects chain or bus without interrupting signal flow. Gain is unity (1.0) for transparent pass-through.',
      '',
      'Recording Control Modes',
      '- Toggle mode (holdMode=false, default): Click button to start recording, click again to stop. External triggers toggle state.',
      '- Hold mode (holdMode=true): Press and hold button (mouse down) to record, release (mouse up) to stop. External receiveNodeOn starts, receiveNodeOff stops.',
      '- Hold mode is ideal for quick bursts, one-shots, or hands-free recording driven by external gates/envelopes.',
      '',
      'UI Controls',
      '- Record button: large clickable button showing current state:',
      '  - Idle: "○ Rec" with gray background (#222).',
      '  - Recording: "● REC" with red gradient background (linear-gradient(90deg,#ff4d4d,#cc0000)).',
      '  - Button behavior adapts to Hold Mode checkbox.',
      '- Elapsed time display: shows recorded duration in seconds (e.g. "2.45s") or "Idle" when not recording. Updates in real-time via requestAnimationFrame loop.',
      '- Hold checkbox: toggle between Toggle mode and Hold mode. Labeled "Hold" with tooltip explaining behavior.',
      '- Error display: red text below controls if recording fails (e.g. worklet crash, size limit exceeded).',
      '',
      'Node Appearance',
      '- Width: 160px (accommodates button and controls).',
      '- Padding: 8px.',
      '- Background: #1f1f1f (dark theme).',
      '- Border: 1px solid #2a3139, borderRadius: 6px.',
      '- Handle positions: left 30% (main), left 70% (trigger), right 50% (output).',
      '',
      'File Output & Persistence',
      '- Format: 16-bit PCM WAV, mono channel, sample rate matches AudioContext (typically 48000 Hz).',
      '- File naming: "rec-{timestamp}.wav" (e.g. "rec-1704505200000.wav").',
      '- Primary storage: File System Access API (if permission granted) → writes to "recording/" subdirectory in selected workspace folder.',
      '- Fallback: if File System API unavailable or permission denied, triggers browser download instead (file saved to Downloads folder).',
      '- Size limits: default soft cap ~125MB (configurable via maxBytes in node.data). Recording auto-stops if limit exceeded.',
      '- Duration limits: optional maxSeconds guard (default 0 = unlimited). Recording auto-stops if exceeded.',
      '',
      'Typical use cases',
      '- Loop recording: capture live-played patterns for later playback via Sample node.',
      '- Stem/bus recording: tap a submix or master bus to capture full arrangements.',
      '- Effect snapshots: record processed audio (e.g. reverb tails, filter sweeps) for reuse.',
      '- Live sampling: record mic input, chop in external editor, reimport as samples.',
      '- Performance capture: archive full sessions or improvised performances.',
      '- Automated recording: trigger via sequencer or clock for hands-free loop capture.',
      '',
      'Virtual behaviour (VirtualRecordingNode)',
      '- VirtualRecordingNode wraps a GainNode (unity gain pass-through) connected to an AudioWorklet recorder processor.',
      '- Worklet: "RecorderProcessor" captures mono audio frames (128 samples per process() call) and batches them into chunks (default 16384 samples) before posting to main thread via MessagePort.',
      '- Frame accumulation: main thread collects Float32Array chunks in this.frames array during recording.',
      '- Size guard: after each chunk, estimates final WAV size (samples * 2 bytes + 44 header) and auto-stops if maxBytes exceeded.',
      '- Duration guard: checks elapsed time (performance.now() - startTime) and auto-stops if maxSeconds exceeded.',
      '- Start: clears frames[], sets recording=true, emits status update, sends isRecording: true to UI via params.updateParams.',
      '- Stop: sets recording=false, flushes worklet buffer, assembles WAV from frames, emits recording.ready event, persists to disk or triggers download, sends isRecording: false to UI.',
      '- WAV assembly: merges all Float32Array frames into single buffer, converts float32 [-1,1] to int16 PCM, writes RIFF/WAV header (44 bytes), creates Blob.',
      '- Event subscriptions:',
      '  - {nodeId}.control.start: starts recording (direct UI button).',
      '  - {nodeId}.control.stop: stops recording (direct UI button).',
      '  - {nodeId}.record.receiveNodeOn: external trigger ON (behavior depends on holdMode).',
      '  - {nodeId}.record.receiveNodeOff: external trigger OFF (behavior depends on holdMode).',
      '  - {nodeId}.params.updateParams: updates holdMode and other params dynamically.',
      '- Status updates: emits {nodeId}.status.update with { recording: boolean, elapsedMs: number, error?: string } for UI synchronization.',
      '- render(): sets pass-through gain to unity (1.0) for transparent audio routing.',
      '- disconnect(): stops recording, disconnects worklet, clears frames to free memory.',
      '',
      'External Trigger Behavior',
      '- Toggle mode (holdMode=false):',
      '  - receiveNodeOn: if idle, start recording; if recording, stop recording.',
      '  - receiveNodeOff: if idle, start recording; if recording, stop recording (same toggle logic).',
      '- Hold mode (holdMode=true):',
      '  - receiveNodeOn: if idle, start recording; if already recording, no-op.',
      '  - receiveNodeOff: if recording, stop recording; if idle, no-op.',
      '',
      'AudioWorklet Processor Details',
      '- RecorderProcessor: simple pass-through + tap processor.',
      '- process(): copies input to output (transparent pass-through), slices input[0] into Float32Array, pushes to internal chunks array.',
      '- Batching: accumulates samples until this._samples >= this._flushEvery (default 16384), then posts merged Float32Array to main thread via port.postMessage with transferable ArrayBuffer for zero-copy efficiency.',
      '- Flush command: worklet listens for "flush" message to force immediate batch flush (used on stop to capture remaining buffer).',
      '- Dynamic batch size: worklet accepts { setFlushSamples: number } message to adjust _flushEvery threshold (useful for tuning latency vs throughput).',
      '',
      'Memory Management',
      '- Frames accumulate in main thread as Float32Array[] during recording. Each chunk is ~65KB (16384 samples * 4 bytes).',
      '- WAV assembly: merges all chunks into single Float32Array (O(n) memory, 2x peak usage during merge), converts to int16 PCM (halves size), wraps in Blob.',
      '- Cleanup: frames[] cleared after WAV is built and persisted. Blob handed to browser or File System API, then GC collects.',
      '- Worklet: minimal overhead (128-sample ring buffer per process cycle).',
      '',
      'File System Integration',
      '- Uses loadRootHandle() from FileSystemAudioStore to retrieve stored workspace folder handle.',
      '- Uses writeAudioBlob(root, "recording", wavBlob, name) to write WAV to recording/ subdirectory.',
      '- If File System write succeeds, no download is triggered (file saved to disk).',
      '- If File System unavailable or write fails, falls back to createObjectURL + <a> download link (temporary link revoked after 5s).',
      '- Recorded files appear in Audio Explorer panel under "recording" folder for playback, download, or deletion.',
    ].join('\n'),
    component: RecordingPreview,
    defaultProps: {
      label: 'Recording',
      holdMode: false,
    },
    controls: {
      label: { type: 'string', label: 'Label' },
      holdMode: { type: 'boolean', label: 'Hold mode' },
    },
  },
  {
    id: 'speed-divider-node',
    title: 'Speed Divider',
    description: [
      'Role',
      '- Clock/trigger rate transformation node that divides and/or multiplies incoming event rates to create polyrhythmic patterns, slower tempos, or faster subdivisions. Features dynamic BPM tracking, hit counter display, and real-time parameter modulation via control inputs.',
      '',
      'Important Note',
      '- This is an EVENT PROCESSING node (not audio). It operates on trigger/gate events (receiveNodeOn/receiveNodeOff) and forwards transformed timing patterns downstream. No audio signal passes through this node.',
      '',
      'Inputs',
      '- input (left, top ~25%): main trigger/clock stream to be divided/multiplied. Receives receiveNodeOn events (typically from Clock node, sequencers, or MIDI triggers). Each ON event increments the internal hit counter.',
      '- divider-input (left, center ~50%): control input for dynamic divider value (1-10). Receives events with { value: number } payload to update the division ratio in real-time. Useful for live pattern variations or automation.',
      '- multiplier-input (left, bottom ~75%): control input for dynamic multiplier value (1-10). Receives events with { value: number } payload to update the multiplication ratio. Enables live tempo multiplication without rewiring.',
      '',
      'Output',
      '- output (right, center ~50%): transformed trigger stream. Emits receiveNodeOn events at divided/multiplied rates. Each output event includes { nodeid: string, ...originalPayload } to maintain event chain context.',
      '',
      'Division Logic',
      '- Divider (÷): waits for N incoming events before forwarding ONE output event.',
      '- Example: divider=2 → every 2nd input pulse triggers output (half speed).',
      '- Example: divider=4 → every 4th input pulse triggers output (quarter speed).',
      '- Hit counter: displays "{current}/{divider}" (e.g. "3/4") showing progress toward next output pulse.',
      '- Counter resets to 0 after each output emission and when divider value changes.',
      '',
      'Multiplication Logic',
      '- Multiplier (×): emits N output events for each incoming event, evenly spaced across the detected interval.',
      '- Example: multiplier=2 → each input pulse generates 2 output pulses (double speed).',
      '- Example: multiplier=4 → each input pulse generates 4 output pulses (quadruple speed).',
      '- First pulse fires immediately on input; remaining pulses are scheduled via setTimeout at calculated intervals.',
      '- Interval calculation: intervalMs = (current event time - last event time). BPM = 60000 / intervalMs.',
      '- Spacing: remaining pulses are spread evenly: spacing = intervalMs / multiplier. Pulse N fires at delay = spacing * N.',
      '- If no interval is known yet (first event), all multiplier pulses fire immediately.',
      '',
      'BPM Tracking',
      '- Automatically calculates incoming BPM from event timing: BPM = 60000 / (event interval in ms).',
      '- Display: shows calculated BPM below multiplier control (e.g. "120 bpm") or "--" if no events received yet.',
      '- Updates on every incoming event to reflect tempo changes in real-time.',
      '- Useful for monitoring clock sources or verifying division/multiplication math.',
      '',
      'UI Controls',
      '- Divider input (÷): number input (1-10) controlling division ratio. Displays current value and hit counter below.',
      '- Multiplier input (×): number input (1-10) controlling multiplication ratio. Displays calculated BPM below.',
      '- Hit counter: "{current}/{divider}" display showing progress toward next divided output (e.g. "2/3" means 2 hits received, 1 more needed).',
      '- BPM display: shows incoming tempo calculated from event spacing (e.g. "120 bpm") or "--" when idle.',
      '',
      'Node Appearance',
      '- Width: 120px (compact for dense patches).',
      '- Padding: 8px.',
      '- Background: #1f1f1f (dark theme).',
      '- Border: 1px solid #2a3139, borderRadius: 6px.',
      '- Handle positions: left 25% (input), left 50% (divider), left 75% (multiplier), right 50% (output).',
      '- Layout: vertical stack with ÷ control on top, × control below, monospace counters/BPM.',
      '',
      'Combined Division & Multiplication',
      '- When both divider > 1 and multiplier > 1, node first divides, then multiplies:',
      '  1. Wait for divider N hits (division).',
      '  2. On Nth hit, emit multiplier M output events (multiplication).',
      '- Example: divider=2, multiplier=3 → every 2nd input generates 3 evenly spaced outputs (1.5x net rate).',
      '- Example: divider=4, multiplier=2 → every 4th input generates 2 evenly spaced outputs (0.5x net rate).',
      '- Net rate = (multiplier / divider) × input rate.',
      '',
      'Typical use cases',
      '- Polyrhythmic patterns: divide/multiply clocks to create 3:4, 5:4, 7:8 polyrhythms.',
      '- Slower modulation: divide fast LFO or clock to create slower parameter automation.',
      '- Subdivision: multiply clock to create 16th notes from 8th notes, or triplets from quarter notes.',
      '- Live tempo variation: modulate divider/multiplier via automation or MIDI knobs for dynamic tempo shifts.',
      '- Euclidean-like rhythms: combine multiple Speed Dividers with different ratios for complex patterns.',
      '- Tempo matching: use BPM display to verify clock sources before mixing patterns.',
      '',
      'Virtual behaviour (VirtualSpeedDividerNode)',
      '- VirtualSpeedDividerNode is an event-only node (no Web Audio AudioNode). It processes events via EventBus subscriptions.',
      '- State: hitCount (0 to divider-1), divider (1-10), multiplier (1-10), lastEventTime, intervalMs, incomingBpm.',
      '- Event subscriptions:',
      '  - {nodeId}.input.receiveNodeOn: increments hitCount, calculates interval/BPM, fires output if hitCount >= divider.',
      '  - {nodeId}.input.receiveNodeOff: immediately forwards to output (pass-through, no division/multiplication).',
      '  - {nodeId}.divider-input.receiveNodeOn: updates divider from payload.value (1-10), resets hitCount, emits status.',
      '  - {nodeId}.multiplier-input.receiveNodeOn: updates multiplier from payload.value (1-10).',
      '  - FlowNode.{nodeId}.params.updateParams: updates divider/multiplier from UI input changes.',
      '- handleOn(data): core division/multiplication logic:',
      '  1. Calculate intervalMs = now - lastEventTime.',
      '  2. Calculate incomingBpm = 60000 / intervalMs.',
      '  3. Emit BPM status update to UI.',
      '  4. Increment hitCount.',
      '  5. Emit hitCount status update to UI.',
      '  6. If hitCount >= divider: reset hitCount to 0, call fireMultipliedEvents().',
      '  7. Clear any previously scheduled timeouts to avoid overlapping pulses.',
      '- fireMultipliedEvents(data): multiplication logic:',
      '  1. Emit first output event immediately: sendNodeOn({ ...data, nodeid: this.node.id }).',
      '  2. If multiplier > 1 and intervalMs > 0: calculate spacing = intervalMs / multiplier.',
      '  3. For i = 1 to multiplier-1: schedule setTimeout(() => sendNodeOn(...), spacing * i).',
      '  4. Store timeout IDs in scheduledTimeouts[] for cleanup.',
      '  5. If multiplier > 1 but intervalMs = 0 (first event): emit all multiplier events immediately.',
      '- clearScheduled(): called on each new input event to cancel pending scheduled pulses (prevents overlap/confusion).',
      '- handleOff(data): forwards receiveNodeOff events directly to sendNodeOff handler (no processing).',
      '- emitHitCount(): emits {nodeId}.status.hitCount with { count: hitCount } for UI counter display.',
      '- emitBpm(): emits {nodeId}.status.bpm with { bpm: incomingBpm } for UI BPM display.',
      '- setSendNodeOn(handler): AudioGraphManager sets this to connect output events to downstream nodes via handleConnectedEdges.',
      '- setSendNodeOff(handler): AudioGraphManager sets this for OFF event forwarding.',
      '- render(): no-op (event-only node, no audio rendering).',
      '- disconnect(): clears all scheduled timeouts, calls super.disconnect() to clean up subscriptions.',
      '',
      'Parameter Modulation',
      '- Divider and multiplier can be modulated dynamically via their respective input handles.',
      '- Send events with { value: number } payload (1-10 range) to divider-input or multiplier-input.',
      '- Divider changes reset hitCount to 0 to avoid confusion (e.g. changing from 4 to 2 mid-count).',
      '- Multiplier changes take effect on next divided output pulse (no retroactive rescheduling).',
      '- Useful for creating evolving patterns, generative rhythms, or MIDI-controlled tempo variations.',
      '',
      'Timing Precision',
      '- Interval/BPM calculation: based on performance.now() timestamps (microsecond precision in modern browsers).',
      '- Multiplication scheduling: uses setTimeout with calculated delays (resolution ~4ms depending on browser throttling).',
      '- Drift: minimal for short intervals (<1s). Longer intervals may accumulate slight drift due to setTimeout precision limits.',
      '- No drift correction: unlike ClockFlowNode (which uses absolute time anchoring), this node schedules relative to each event.',
      '- For critical timing, consider using dedicated Clock nodes and routing divided/multiplied outputs as gates.',
      '',
      'Edge Cases & Limits',
      '- Divider/multiplier clamped to 1-10 range (enforced in both UI and event handlers).',
      '- First event: if no previous event (lastEventTime=0), intervalMs is unknown → multiplier pulses fire immediately without spacing.',
      '- Very fast input (<10ms intervals): multiplier scheduling may not complete before next input event → clearScheduled() cancels pending pulses.',
      '- receiveNodeOff: forwarded immediately without hit counting (useful for passing gate OFF events through polyrhythmic chains).',
      '- Divider change mid-count: hitCount resets to 0 (prevents partial-count confusion and ensures clean pattern restart).',
    ].join('\n'),
    component: SpeedDividerPreview,
    defaultProps: {
      divider: 2,
      multiplier: 1,
    },
    controls: {
      divider: { type: 'number', label: 'Divider' },
      multiplier: { type: 'number', label: 'Multiplier' },
    },
  },
  {
    id: 'audio-signal-freq-shifter-node',
    title: 'Audio Frequency Shifter',
    description: [
      'Role',
      '- Shifts audio signal frequencies by a specified number of semitones using AudioWorklet processing.',
      '- Uses pitch ratio 2^(semitones/12) for frequency shifting.',
      '',
      'Inputs',
      '- main-input (left, top): Audio signal to be frequency-shifted.',
      '- shift-input (left, bottom): Flow event to dynamically set shift amount in semitones.',
      '',
      'Output',
      '- output (right): Frequency-shifted audio signal.',
      '',
      'Parameters',
      '- shift: Semitone shift amount (-96 to +96). Can be set via UI knob, MIDI, or shift-input handle.',
      '',
      'Implementation',
      '- Uses AudioWorklet processor with overlap-add pitch shifting algorithm.',
      '- Ring buffer with Hann window for smooth transitions.',
      '',
      'Typical use cases',
      '- Pitch shifting audio, creating harmonies, inharmonic textures, and experimental sound design.',
    ].join('\n'),
    component: AudioSignalFreqShiftPreview,
    defaultProps: {
      label: 'Audio Freq Shifter',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'flow-event-freq-shifter-node',
    title: 'Flow Event Frequency Shifter',
    description: [
      'Role',
      '- Shifts frequency values in flow events by a specified number of semitones.',
      '- Does NOT process audio signals - only transforms frequency values in events.',
      '',
      'Inputs',
      '- trigger-input (left, top): Flow event containing frequency to be shifted.',
      '- shift-input (left, bottom): Flow event to dynamically set shift amount in semitones.',
      '',
      'Output',
      '- flow-output (right): Flow event with shifted frequency using ratio 2^(semitones/12).',
      '',
      'Parameters',
      '- shift: Semitone shift amount (-96 to +96). Can be set via UI knob, MIDI, or shift-input handle.',
      '',
      'Typical use cases',
      '- Transposing melodic sequences, building harmonizers, or creating pitch variations.',
      '- Dynamic pitch modulation by connecting other nodes to shift-input.',
    ].join('\n'),
    component: FlowEventFreqShiftPreview,
    defaultProps: {
      label: 'Flow Event Freq Shifter',
    },
    controls: {
      label: { type: 'string', label: 'Label' },
    },
  },
  {
    id: 'equalizer-node',
    title: 'Equalizer',
    description: [
      'Role',
      '- Professional 5-band parametric equalizer with real-time visualization and interactive frequency response editing.',
      '',
      'Inputs',
      '- main-input (left, 50%): Audio signal to be equalized.',
      '',
      'Output',
      '- output (right, 50%): EQ\'d audio with per-band boosts/cuts applied.',
      '',
      'Features',
      '- Interactive canvas visualization showing input spectrum and EQ response curve.',
      '- Draggable band handles for intuitive frequency/gain adjustment.',
      '- Real-time frequency analyzer displaying input signal strength.',
      '- Logarithmic frequency scale (20 Hz - 20 kHz) with visual grid.',
      '',
      'Band Parameters',
      '- Frequency: 20-20000 Hz (logarithmic scale)',
      '- Gain: -24 to +24 dB',
      '- Q Factor: 0.1 to 20 (bandwidth control)',
      '- Type: lowshelf, highshelf, peaking, lowpass, highpass, bandpass, notch',
      '',
      'Default Bands',
      '- Band 1: 60 Hz Low Shelf',
      '- Band 2: 250 Hz Peaking',
      '- Band 3: 1 kHz Peaking',
      '- Band 4: 4 kHz Peaking',
      '- Band 5: 12 kHz High Shelf',
      '',
      'Implementation',
      '- Chain of BiquadFilterNodes, one per band.',
      '- Combined frequency response computed and displayed in real-time.',
      '- AnalyserNode provides input spectrum visualization.',
      '- UI updates broadcast via EventBus to virtual node.',
      '',
      'Typical use cases',
      '- Surgical frequency correction and tone shaping.',
      '- Mix balancing and mastering.',
      '- Creative filter effects and resonant peaks.',
      '- Problem frequency removal (notch filter).',
    ].join('\n'),
    component: EqualizerPreview,
    defaultProps: {},
    controls: {},
  },
];

export default docs;
