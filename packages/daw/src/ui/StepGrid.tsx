import React from 'react';
import type { Instrument } from '../model/project';

export function StepGrid({
  instrument, totalSteps, stepsPerBeat, currentStep, onToggle, onMute,
}: {
  instrument: Instrument;
  totalSteps: number;
  stepsPerBeat: number;
  currentStep: number;
  onToggle: (instrumentId: string, step: number) => void;
  onMute: (instrumentId: string) => void;
}) {
  return (
    <div className="channel">
      <button className={`chan-name ${instrument.muted ? 'muted' : ''}`} onClick={() => onMute(instrument.id)} title="mute/unmute">
        {instrument.name}
      </button>
      <div className="steps" style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}>
        {instrument.steps.map((on, i) => (
          <button
            key={i}
            className={['step', on ? 'on' : '', i === currentStep ? 'playhead' : '', i % stepsPerBeat === 0 ? 'beat' : ''].join(' ')}
            onClick={() => onToggle(instrument.id, i)}
          />
        ))}
      </div>
    </div>
  );
}
