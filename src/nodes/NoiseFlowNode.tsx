import React, { useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';

export type NoiseKind = 'white' | 'pink' | 'brown' | 'blue' | 'violet' | 'gray';

export interface NoiseFlowNodeData {
  id?: string;
  label: string;
  noiseType?: NoiseKind;
  style?: React.CSSProperties;
  processorCode?: string; // dynamically generated
  params?: any[];
}

interface NoiseFlowNodeProps { data: NoiseFlowNodeData; }

const NOISE_TYPES: NoiseKind[] = ['white','pink','brown','blue','violet','gray'];

// Generate AudioWorkletProcessor code for each noise type (gain removed; fixed amplitude)
function buildNoiseProcessor(noiseType: NoiseKind) {
  return `class ExtendAudioWorkletProcessor extends AudioWorkletProcessor {\n  constructor(){\n    super();\n    this._pinkState = new Float32Array(7);\n    this._brown = 0;\n    this._grayLast = 0;\n  }\n  process(inputs, outputs, parameters){\n    const out = outputs[0]; if(!out) return true;\n    for(let ch=0; ch<out.length; ch++){\n      const buf = out[ch];\n      for(let i=0;i<buf.length;i++){\n        let sample = 0;\n        switch('${noiseType}') {\n          case 'white': sample = (Math.random()*2-1); break;\n          case 'pink': { let ps = this._pinkState; ps[0] = 0.99886 * ps[0] + Math.random() * 0.0555179; ps[1] = 0.99332 * ps[1] + Math.random() * 0.0750759; ps[2] = 0.96900 * ps[2] + Math.random() * 0.1538520; ps[3] = 0.86650 * ps[3] + Math.random() * 0.3104856; ps[4] = 0.55000 * ps[4] + Math.random() * 0.5329522; ps[5] = -0.7616 * ps[5] - Math.random() * 0.0168980; sample = ps[0]+ps[1]+ps[2]+ps[3]+ps[4]+ps[5]+ps[6] + Math.random()*0.5362; ps[6] = Math.random()*0.115926; sample *= 0.11; break; }\n          case 'brown': { this._brown += (Math.random()*2 - 1) * 0.02; if (this._brown < -1) this._brown = -1; else if (this._brown > 1) this._brown = 1; sample = this._brown; break; }\n          case 'blue': { const w1 = (Math.random()*2-1); const w2 = (Math.random()*2-1); sample = (w2 - w1); break; }\n          case 'violet': { const w1 = (Math.random()*2-1); const w2 = (Math.random()*2-1); const w3 = (Math.random()*2-1); sample = (w3 - 2*w2 + w1); break; }\n          case 'gray': { const white = (Math.random()*2-1); this._grayLast = 0.97 * this._grayLast + 0.03 * white; sample = this._grayLast; break; }\n        }\n        buf[i] = sample * 0.35;\n      }\n    }\n    return true;\n  }\n}`;
}

const NoiseFlowNode: React.FC<NoiseFlowNodeProps> = ({ data }) => {
  const eventBus = EventBus.getInstance();
  const [noiseType, setNoiseType] = useState<NoiseKind>(data.noiseType || 'white');

  // Persist selected noise type
  useEffect(()=>{ (data as any).noiseType = noiseType; }, [noiseType, data]);

  // Rebuild processor code & emit save so VirtualAudioWorkletNode hot swaps
  useEffect(()=>{
    const code = buildNoiseProcessor(noiseType);
    data.processorCode = code;
    const nodeId = data.id || (data as any)._reactFlowNodeId;
    if (nodeId) {
      eventBus.emit(nodeId + '.processor.save', { code });
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
