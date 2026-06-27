import React, { useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';
import MidiKnob from '../components/MidiKnob';
import { ArpeggiatorMode } from '../virtualNodes/VirtualArpeggiatorNode';
import './AudioNode.css';

export interface ArpeggiatorFlowNodeData {
  id?: string;
  noteCount?: number;
  mode?: ArpeggiatorMode;
  baseFrequency?: number;
  octaveSpread?: number;
  currentStep?: number;
  swing?: number;
  onChange?: (data: any) => void;
  style?: React.CSSProperties;
}

export interface ArpeggiatorFlowNodeProps {
  id?: string;
  data: ArpeggiatorFlowNodeData;
}

const ArpeggiatorFlowNode: React.FC<ArpeggiatorFlowNodeProps> = ({
  id,
  data
}) => {
  const eventBus = EventBus.getInstance();
  const nodeId = (data as any).id ?? id;

  const [noteCount, setNoteCount] = useState<number>(data.noteCount ?? 4);
  const [mode, setMode] = useState<ArpeggiatorMode>(data.mode ?? 'up');
  const [octaveSpread, setOctaveSpread] = useState<number>(data.octaveSpread ?? 1);
  const [baseFrequency, setBaseFrequency] = useState<number>(data.baseFrequency ?? 440);
  const [currentStep, setCurrentStep] = useState<number>(data.currentStep ?? 0);
  const [swing, setSwing] = useState<number>(data.swing ?? 0);

  // Listen for updates from the virtual node
  useEffect(() => {
    const handleUpdate = (params: any) => {
      const d = params?.data || params;
      if (d?.from !== 'VirtualArpeggiatorNode') return;

      if (typeof d.noteCount === 'number') setNoteCount(d.noteCount);
      if (typeof d.mode === 'string') setMode(d.mode as ArpeggiatorMode);
      if (typeof d.octaveSpread === 'number') setOctaveSpread(d.octaveSpread);
      if (typeof d.baseFrequency === 'number') setBaseFrequency(d.baseFrequency);
      if (typeof d.currentStep === 'number') setCurrentStep(d.currentStep);
      if (typeof d.swing === 'number') setSwing(d.swing);
    };

    eventBus.subscribe(`${nodeId}.params.updateParams`, handleUpdate);
    return () => {
      eventBus.unsubscribe(`${nodeId}.params.updateParams`, handleUpdate);
    };
  }, [nodeId, eventBus]);

  // Emit changes to virtual node (excluding baseFrequency to prevent resets)
  useEffect(() => {
    const params = {
      noteCount,
      mode,
      octaveSpread,
      swing
    };

    eventBus.emit(`${nodeId}.params.updateParams`, {
      nodeid: nodeId,
      data: params
    });

    if (data.onChange) {
      data.onChange(params);
    }
  }, [noteCount, mode, octaveSpread, swing, nodeId]);

  const handleNoteCountChange = (value: number) => {
    const val = Math.round(value);
    setNoteCount(Math.max(1, Math.min(24, val)));
  };

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMode(e.target.value as ArpeggiatorMode);
  };

  const handleOctaveSpreadChange = (value: number) => {
    setOctaveSpread(Math.max(0.25, Math.min(4, value)));
  };

  const handleSwingChange = (value: number) => {
    setSwing(Math.max(0, Math.min(1, value)));
  };

  const modeDescriptions: Record<ArpeggiatorMode, string> = {
    'up': 'Ascending',
    'down': 'Descending',
    'up-down': 'Up-Down (no repeat)',
    'down-up': 'Down-Up (no repeat)',
    'up-down-incl': 'Up-Down (repeat)',
    'down-up-incl': 'Down-Up (repeat)',
    'chord': 'Chord (all notes)',
    'chord-major-up': 'Major Chord Up',
    'chord-major-down': 'Major Chord Down',
    'chord-minor-up': 'Minor Chord Up',
    'chord-minor-down': 'Minor Chord Down',
    'random': 'Random',
    'random-walk': 'Random Walk',
    'converge': 'Converge (Out→In)',
    'diverge': 'Diverge (In→Out)',
    'shuffle': 'Shuffle (All once)'
  };

  // Use ADSR-style defaults if no custom style provided
  if (data.style === undefined) {
    data.style = {
      padding: '10px',
      border: '1px solid #ddd',
      borderRadius: '5px',
      width: '200px',
      textAlign: 'center',
      background: '#333',
      color: '#eee',
    };
  }

  const selectStyle: React.CSSProperties = {
    width: '100%',
    background: '#111',
    color: '#eee',
    border: '1px solid #333',
    borderRadius: '3px',
    padding: '4px 6px',
    fontSize: 11,
    fontFamily: 'inherit',
    cursor: 'pointer'
  };

  const handleStyle: React.CSSProperties = {
    width: '8px',
    height: '8px',
    background: '#ffffff',
    border: '1px solid #333',
    borderRadius: '50%',
    boxShadow: '0 0 3px 1px rgba(255,255,255,0.45)'
  };

  return (
    <div style={data.style}>
      <div className="audio-header">
        <label><b>Arpeggiator</b></label>
      </div>

      {/* Clock Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="clock-input"
        style={{ ...handleStyle, top: 20 }}
        title="Clock input - triggers arpeggiator steps"
      />

      {/* Frequency Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="freq-input"
        style={{ ...handleStyle, top: 40 }}
        title="Frequency input - sets base note"
      />

      {/* Reset Input */}
      <Handle
        type="target"
        position={Position.Left}
        id="reset-input"
        style={{ ...handleStyle, top: 60 }}
        title="Reset - restart arpeggio from beginning"
      />

      {/* Main Output */}
      <Handle
        type="source"
        position={Position.Right}
        id="main-output"
        style={{ ...handleStyle, top: '50%' }}
        title="Arpeggiated frequency output"
      />

      {/* Mode Selection */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 10 }}>Pattern</label>
        <select
          value={mode}
          onChange={handleModeChange}
          style={selectStyle}
        >
          {Object.entries(modeDescriptions).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Control Knobs */}
      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 50 }}>
          <label style={{ fontSize: 10 }}>Notes</label>
          <MidiKnob
            style={{ display: 'inline-block' }}
            min={1}
            max={24}
            value={noteCount}
            onChange={handleNoteCountChange}
          />
          <span style={{ fontSize: 10 }}>{noteCount}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 50 }}>
          <label style={{ fontSize: 10 }}>Octaves</label>
          <MidiKnob
            style={{ display: 'inline-block' }}
            min={0.25}
            max={4}
            value={octaveSpread}
            onChange={handleOctaveSpreadChange}
          />
          <span style={{ fontSize: 10 }}>{octaveSpread.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 50 }}>
          <label style={{ fontSize: 10 }}>Swing</label>
          <MidiKnob
            style={{ display: 'inline-block' }}
            min={0}
            max={1}
            value={swing}
            onChange={handleSwingChange}
          />
          <span style={{ fontSize: 10 }}>{swing.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default ArpeggiatorFlowNode;
