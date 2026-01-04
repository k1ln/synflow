import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';
import './AudioNode.css';

export interface MidiButtonMapping {
  type: 'note' | 'cc' | 'aftertouch';
  channel: number; // 0-based
  number: number;  // note or CC number
}

export type MidiButtonNodeProps = {
  data: {
    assignedKey: string | null;
    midiMapping?: MidiButtonMapping | null;
    label: string;
    style: React.CSSProperties;
    ispressed: boolean;
    id: string;
    onChange: (data: any) => void;
    dispatchEvent: (event: string) => void;
  };
};

const MidiButtonFlowNode: React.FC<MidiButtonNodeProps> = ({ data }) => {
  const [label, setLabel] = useState(data.label || 'MIDI Button');
  const [style, setStyle] = useState<React.CSSProperties>(data.style);
  const [isMidiLearning, setIsMidiLearning] = useState(false);
  const [midiMapping, setMidiMapping] = useState<MidiButtonMapping | null>(data.midiMapping || null);
  const learningSinceRef = useRef<number | null>(null);
  const eventBus = EventBus.getInstance();

  useEffect(() => {
    if (data.onChange instanceof Function) {
      data.onChange({ ...data, label, style, midiMapping });
    }
  }, [label, style, midiMapping]);

  useEffect(() => {
    if (data.midiMapping && data.midiMapping !== midiMapping) {
      setMidiMapping(data.midiMapping);
    }
  }, [data.midiMapping]);

  

  const changeBackgroundColorCallback = React.useCallback((payload: any) => {
    setStyle(prev => ({ ...prev, background: payload.color }));
  }, []);

  useEffect(() => {
    eventBus.subscribe(data.id + '.style.background', changeBackgroundColorCallback);
    eventBus.subscribe(data.id + '.finishMidiLearn', (p) => {
      // UpdateParams MidiButtonFlowNode
      if (p?.data.midiMapping) {
        setMidiMapping(p.data.midiMapping);
      }
    });
    return () => eventBus.unsubscribe(data.id + '.style.background', changeBackgroundColorCallback);
  });

  useEffect(() => {
    if (!isMidiLearning) return;
    learningSinceRef.current = performance.now();
    const id = setTimeout(() => { setIsMidiLearning(false); learningSinceRef.current = null; }, 10000);
    return () => clearTimeout(id);
  }, [isMidiLearning]);

  useEffect(() => {
    if (isMidiLearning && data.midiMapping) {
      setIsMidiLearning(false);
      learningSinceRef.current = null;
    }
  }, [data.midiMapping, isMidiLearning]);

  const toggleMidiLearn = () => {
    if (isMidiLearning) {
      setIsMidiLearning(false);
      learningSinceRef.current = null;
      return;
    }
    setIsMidiLearning(true);
    learningSinceRef.current = performance.now();
    eventBus.emit(data.id + '.updateParams.midiLearn', { midiLearn: true });
  };

  const handleContextMenu: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    toggleMidiLearn();
  };

  if (data.style === undefined) {
    data.style = { padding: '10px', border: '1px solid #ddd', borderRadius: '5px', width: '150px', textAlign: 'center', background: '#333', color: '#eee' };
  }

  return (
    <div style={data.style}>
      <Handle type="source" position={Position.Right} id="output" className="mainOutput" />
      <div>
        <button
          className="nodrag nowheel nopan"
          draggable={false}
          onMouseDown={(e) => { e.stopPropagation(); }}
          onPointerDown={(e) => { e.stopPropagation(); }}
          onContextMenu={handleContextMenu}
          style={{
            position: 'relative',
            padding: '10px',
            margin: '10px 0',
            background: isMidiLearning ? '#7a5b00' : '#444',
            color: '#fff',
            border: '1px solid #ddd',
            borderRadius: '5px',
            cursor: 'pointer',
            width: 'auto',
            maxWidth: '100%'
          }}
          title={isMidiLearning ? 'Move a MIDI control / press a MIDI button to map (right-click to cancel)' : midiMapping ? 'Right-click to re-learn MIDI mapping' : 'Right-click to MIDI learn'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, opacity: 0.85 }}>
              {isMidiLearning
                ? 'Learning…'
                : midiMapping
                  ? `MIDI: Ch ${midiMapping.channel + 1} ${midiMapping.type.toUpperCase()} ${midiMapping.number}`
                  : 'No MIDI mapping'}
            </span>
          </div>
          {isMidiLearning && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,200,0,0.2)', borderRadius: 5, pointerEvents: 'none' }} />
          )}
        </button>
      </div>
    </div>
  );
};

export default MidiButtonFlowNode;
