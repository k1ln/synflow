import React, { useEffect, useState, useRef } from 'react';
import { Handle, Position, useUpdateNodeInternals } from '@xyflow/react';
import { OrchestratorData, DEFAULT_ORCHESTRATOR_DATA } from '../types/OrchestratorTypes';
import EventBus from '../sys/EventBus';

export interface OrchestratorFlowNodeProps {
  data: {
    id: string;
    label?: string;
    orchestrator?: OrchestratorData;
    onChange?: (data: any) => void;
  };
}

const OrchestratorFlowNode: React.FC<OrchestratorFlowNodeProps> = ({ data }) => {
  const [label, setLabel] = useState(data.label || 'Orchestrator');
  const [orchestratorData, setOrchestratorData] = useState<OrchestratorData>(
    data.orchestrator || DEFAULT_ORCHESTRATOR_DATA
  );
  const [currentPosition, setCurrentPosition] = useState(0);
  const [currentTempo, setCurrentTempo] = useState(120);
  const updateNodeInternals = useUpdateNodeInternals();
  const syncIntervalRef = useRef<number | null>(null);

  // Format time display: mm:ss.ms
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  // Sync UI from dialog updates
  const handleOrchestratorChange = (newData: OrchestratorData) => {
    setOrchestratorData(newData);
    if (data.onChange) {
      data.onChange({
        ...data,
        orchestrator: newData
      });
    }
  };
  
  // Open orchestrator editor in side panel
  const openEditor = () => {
    EventBus.getInstance().emit('orchestrator.openEditor', {
      nodeId: data.id,
      orchestratorData,
      onChange: handleOrchestratorChange
    });
  };

  // Update position display from playback
  useEffect(() => {
    setCurrentPosition(orchestratorData.currentPosition * orchestratorData.duration);
  }, [orchestratorData.currentPosition, orchestratorData.duration]);

  // Setup style
  const style: React.CSSProperties = {
    padding: '8px 12px',
    border: '2px solid #00ff88',
    borderRadius: '6px',
    textAlign: 'center',
    background: '#1a1a2e',
    color: '#eee',
    minWidth: '180px',
    boxShadow: '0 0 8px 2px rgba(0,255,136,0.15)'
  };

  const playheadPercentage = orchestratorData.currentPosition * 100;

  return (
    <div style={style}>
      {/* Node title */}
      <div
        style={{
          fontSize: '12px',
          fontWeight: 'bold',
          marginBottom: '6px',
          cursor: 'pointer',
          padding: '2px'
        }}
        onClick={openEditor}
      >
        {label}
      </div>

      {/* Time display */}
      <div
        style={{
          fontSize: '11px',
          color: '#aaa',
          marginBottom: '6px',
          fontFamily: 'monospace'
        }}
      >
        {formatTime(currentPosition)} / {formatTime(orchestratorData.duration)}
      </div>

      {/* Playhead indicator bar */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '6px',
          background: '#333',
          borderRadius: '2px',
          overflow: 'hidden',
          marginBottom: '6px',
          border: '1px solid #555'
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${playheadPercentage}%`,
            width: '3px',
            height: '100%',
            background: '#00ff88',
            transition: 'none',
            boxShadow: '0 0 4px rgba(0,255,136,0.8)'
          }}
        />
      </div>

      {/* Edit button */}
      <button
        onClick={openEditor}
        style={{
          width: '100%',
          padding: '6px 8px',
          background: '#00ff88',
          color: '#000',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#00dd6f';
          e.currentTarget.style.boxShadow = '0 0 8px rgba(0,255,136,0.6)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#00ff88';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        Edit
      </button>

      {/* Input handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="clock"
        style={{
          background: '#00ff88',
          width: '8px',
          height: '8px',
          top: '20px'
        }}
        title="Clock input (beat pulses)"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="restart"
        style={{
          background: '#ff6b6b',
          width: '8px',
          height: '8px',
          top: '40px'
        }}
        title="Restart (jump to 0)"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="setPosition"
        style={{
          background: '#ffd43b',
          width: '8px',
          height: '8px',
          top: '60px'
        }}
        title="Set position (0-1)"
      />

      {/* Output handles (dynamic per row) */}
      {orchestratorData.rows.map((row, idx) => (
        <Handle
          key={`row-${row.id}-out`}
          type="source"
          position={Position.Right}
          id={`row-${row.id}-out`}
          style={{
            background: row.type === 'audio' ? '#4a9eff' : row.type === 'event' ? '#90ee90' : '#dda0dd',
            width: '8px',
            height: '8px',
            top: `${80 + idx * 20}px`
          }}
          title={`${row.label} output (${row.type})`}
        />
      ))}
    </div>
  );
};

export default OrchestratorFlowNode;
