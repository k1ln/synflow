import React from 'react';

/** One drum row: an instrument-in-track's step pattern. A pattern longer than one
 *  bar (`totalSteps > barSteps`) is split into per-bar groups so it reads as bars. */
export function StepGrid({
  id, name, steps, muted, totalSteps, stepsPerBeat, barSteps, currentStep, onToggle, onMute,
}: {
  id: string;
  name: string;
  steps: boolean[];
  muted?: boolean;
  totalSteps: number;
  stepsPerBeat: number;
  barSteps: number;        // steps per bar (project.totalSteps) — where to break into bar groups
  currentStep: number;
  onToggle: (useId: string, step: number) => void;
  onMute: (useId: string) => void;
}) {
  const per = Math.max(1, barSteps);
  const bars = Math.max(1, Math.ceil(totalSteps / per));
  return (
    <div className="channel">
      <button className={`chan-name ${muted ? 'muted' : ''}`} onClick={() => onMute(id)} title="mute/unmute">{name}</button>
      <div className="steps-bars">
        {Array.from({ length: bars }, (_, b) => {
          const count = Math.min(per, totalSteps - b * per);   // last bar may be partial (polymeter)
          return (
            <div key={b} className="steps" style={{ gridTemplateColumns: `repeat(${count}, 1fr)`, flex: count }}>
              {Array.from({ length: count }, (_, j) => {
                const i = b * per + j;
                return (
                  <button
                    key={i}
                    className={['step', steps[i] ? 'on' : '', i === currentStep ? 'playhead' : '', i % stepsPerBeat === 0 ? 'beat' : ''].join(' ')}
                    onClick={() => onToggle(id, i)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
