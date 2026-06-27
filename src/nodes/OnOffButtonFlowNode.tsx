// Renamed from OnOffButton.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';
import './AudioNode.css';

export interface OnOffButtonFlowNodeProps {
  data: {
    id: string;
    label?: string;
    isOn: boolean;
    style: React.CSSProperties;
    onChange: (data: any) => void;
  };
}

const OnOffButtonFlowNode: React.FC<OnOffButtonFlowNodeProps> = ({ data }) => {
  const eventBus = EventBus.getInstance();
  const prevOn = useRef<boolean | null>(null);
  // OnOffButtonFlowNode render
  const [isOn, setIsOn] = useState<boolean>(data.isOn);
  useEffect(() => {
    setIsOn(data.isOn);
  }, [data.isOn]);
  const [label, setLabel] = useState<string>(data.label || 'Gate');
  const [style, setStyle] = useState<React.CSSProperties>(data.style || { padding: '10px', border: '1px solid #555', borderRadius: 5, width:110, maxHeight: 70, background: '#121212', color: '#eee' });

  const nodeStyle = {
    ...style,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    padding:  '10px',
    minHeight: 32
  };

  useEffect(() => { if (data.onChange) data.onChange({ ...data, isOn, label, style }); }, [isOn, label, style]);
  useEffect(() => {
    if (prevOn.current === isOn) return;
    prevOn.current = isOn;
    eventBus.emit(data.id + '.toggle-inputGUI.receiveNodeOn', { nodeid: data.id });
    eventBus.emit(data.id + '.params.updateParams', { nodeid: data.id, data: { isOn } });
  }, [isOn]);
  
  return (
    <div style={nodeStyle}>
      <button
        className="nodrag nowheel nopan"
        draggable={false}
        onMouseDown={(e) => { e.stopPropagation(); }}
        onPointerDown={(e) => { e.stopPropagation(); }}
        onClick={() => {
          setIsOn(o => !o);
        }}
        style={{
          padding: '2px 6px',
          width: 68,
          background: isOn ? '#0a0' : '#4a0F0F',
          color: '#fff',
          border: '1px solid #222',
          fontSize: 18,
          cursor: 'pointer',
          borderRadius: 4,
          alignContent: 'left'
        }}
        title='Toggle gate enable'
      >
        {isOn ? 'ON' : 'OFF'}
      </button>
      <Handle type='target' position={Position.Left} id='toggle-input' style={{ top: 8, background: '#fa0', width: 10, height: 10 }} />
      <div style={{ position: 'absolute', left: -4, top: 15 , fontSize: 9, color: '#fa0' }}>T</div>
      <Handle type='target' position={Position.Left} id='main-input' style={{ top: 35, background: '#5e5', width: 10, height: 10 }} />
      <div style={{ position: 'absolute', left: -4, top: 40, fontSize: 9, color: '#5e5' }}>IN</div>
      <Handle type='source' position={Position.Right} id='output' style={{ top: 25, background: '#888', width: 10, height: 10 }} />
      <div style={{ position: 'absolute', right: -12, top: 32, fontSize: 9, color: '#888' }}>OUT</div>
    </div>
  );
};

export default React.memo(OnOffButtonFlowNode);
