import React, { useCallback, useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';
import './AudioNode.css';

export interface MouseTriggerButtonProps {
  data: {
    id: string;
    label?: string;
    style?: React.CSSProperties;
    onChange?: (d:any)=>void;
  };
}

const DEFAULT_STYLE: React.CSSProperties = {
  padding: 0,
  border: '1px solid #2a3139',
  borderRadius: '5px',
  width: '80px',
  textAlign: 'center',
  background: '#1f1f1f',
  color: '#eee',
  userSelect: 'none'
};

const MouseTriggerButton: React.FC<MouseTriggerButtonProps> = ({ data }) => {
  const eventBus = EventBus.getInstance();
  const [style, setStyle] = useState<React.CSSProperties>({ ...DEFAULT_STYLE, ...(data.style||{}) });
  const [active, setActive] = useState(false);

  useEffect(()=>{ data.onChange?.({ ...data, style }); }, [style]);

  const fireOn = useCallback(()=>{
    eventBus.emit(data.id + '.main-input.sendNodeOn', { nodeid: data.id, source: 'mouse' });
  }, [data.id, eventBus]);
  const fireOff = useCallback(()=>{
    eventBus.emit(data.id + '.main-input.sendNodeOff', { nodeid: data.id, source: 'mouse' });
  }, [data.id, eventBus]);

  const handlePointerDown = (e: React.PointerEvent)=>{
    e.stopPropagation();
    setActive(true);
    fireOn();
  };
  const handlePointerUp = (e: React.PointerEvent)=>{
    e.stopPropagation();
    setActive(false);
    fireOff();
  };

  useEffect(()=>{
    const up = ()=>{ if(active){ setActive(false); fireOff(); } };
    window.addEventListener('pointerup', up);
    return ()=> window.removeEventListener('pointerup', up);
  }, [active, fireOff]);

  return (
    <div style={{ ...style, background: active ? '#336633' : style.background }}>
      <Handle type='target' id='main-input' position={Position.Left} style={{ top:'50%', width:10, height:10 }} />
      <Handle type='source' id='output' position={Position.Right} className='mainOutput' style={{ top:'50%' }} />
      <button
          className='nodrag nowheel nopan'
          style={{
            padding: '12px 10px',
            width: '100%',
            height: '100%',
            minHeight: 36,
            borderRadius: 4,
            border: 'none',
            background: active ? '#1fa64d' : '#2f2f2f',
            color: '#fff',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontSize: 13,
            fontWeight: 'bold'
          }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={(e)=>{ if(active){ handlePointerUp(e as any); } }}
        >
          {active ? 'ON' : 'Trigger'}
        </button>
    </div>
  );
};

export default React.memo(MouseTriggerButton);
