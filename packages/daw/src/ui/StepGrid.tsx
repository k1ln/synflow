import React from 'react';

/** One drum row: an instrument-in-track's step pattern. */
export function StepGrid({
  id, name, steps, muted, totalSteps, stepsPerBeat, currentStep, onToggle, onMute,
}: {
  id: string;
  name: string;
  steps: boolean[];
  muted?: boolean;
  totalSteps: number;
  stepsPerBeat: number;
  currentStep: number;
  onToggle: (useId: string, step: number) => void;
  onMute: (useId: string) => void;
}) {
  return (
    <div className="channel">
      <button className={`chan-name ${muted ? 'muted' : ''}`} onClick={() => onMute(id)} title="mute/unmute">{name}</button>
      <div className="steps" style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <button
            key={i}
            className={['step', steps[i] ? 'on' : '', i === currentStep ? 'playhead' : '', i % stepsPerBeat === 0 ? 'beat' : ''].join(' ')}
            onClick={() => onToggle(id, i)}
          />
        ))}
      </div>
    </div>
  );
}
