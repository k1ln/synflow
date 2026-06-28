import React, { useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';
import { OptionSelect } from '../components/OptionSelect';
import { NOISE_OPTIONS } from '../components/nodeSymbols';
import './AudioNode.css';

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
    <div style={{ ...(data.style||{}), width: 132, padding: 6, textAlign:'center' }}>
      <div className="node-title">NOISE</div>
      <Handle type="source" position={Position.Right} id="output" style={{ top: '50%', width:10, height:10, background:'#444', border:'1px solid #888' }} />
      <OptionSelect
        value={noiseType}
        onChange={(v) => setNoiseType(v as NoiseKind)}
        options={NOISE_OPTIONS}
        columns={2}
        aria-label="Noise type"
      />
    </div>
  );
};

export default React.memo(NoiseFlowNode);
