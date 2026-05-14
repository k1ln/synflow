import React, { useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';

export type NoiseKind = 'white' | 'pink' | 'brown' | 'blue' | 'violet' | 'gray' | 'velvet' | 'green' | 'infrared' | 'binary' | 'crackle';

export interface NoiseFlowNodeData {
  id?: string;
  label: string;
  noiseType?: NoiseKind;
  style?: React.CSSProperties;
  processorCode?: string; // dynamically generated
  params?: any[];
}

interface NoiseFlowNodeProps { data: NoiseFlowNodeData; }

const NOISE_TYPES: NoiseKind[] = ['white','pink','brown','blue','violet','gray','velvet','green','infrared','binary','crackle'];


const NoiseFlowNode: React.FC<NoiseFlowNodeProps> = ({ data }) => {
  const eventBus = EventBus.getInstance();
  const [noiseType, setNoiseType] = useState<NoiseKind>(data.noiseType || 'white');

  // Persist selected noise type
  useEffect(()=>{ (data as any).noiseType = noiseType; }, [noiseType, data]);

  // Notify VirtualNoiseNode of type changes
  useEffect(()=>{
    const nodeId = data.id || (data as any)._reactFlowNodeId;
    if (nodeId) {
      eventBus.emit(nodeId + '.noiseType.change', { value: noiseType });
    }
  }, [noiseType]);

  return (
    <div style={{ ...(data.style||{}), width: 80, padding: 4, textAlign:'center' }}>
      <Handle type="source" position={Position.Right} id="output" style={{ top: '50%', width:10, height:10, background:'#444', border:'1px solid #888' }} />
      <select value={noiseType} onChange={e=> setNoiseType(e.target.value as NoiseKind)} style={{background:'#1e1e1e', color:'#eee', border:'1px solid #444', borderRadius:4, padding:'2px 4px', fontSize:'0.6rem', width:'100%', textAlign:'center'}}>
        {NOISE_TYPES.map(nt => <option key={nt} value={nt}>{nt}</option>)}
      </select>
    </div>
  );
};

export default React.memo(NoiseFlowNode);
