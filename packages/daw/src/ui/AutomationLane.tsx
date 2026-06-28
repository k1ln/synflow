import React, { useRef } from 'react';
import type { AutomationLane as Lane } from '../model/project';

export function AutomationLane({
  lane, label, totalSteps, currentStep, onSet,
}: {
  lane: Lane;
  label: string;
  totalSteps: number;
  currentStep: number;
  onSet: (laneId: string, step: number, value: number) => void;
}) {
  const barsRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const apply = (e: React.MouseEvent) => {
    const el = barsRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(0.999, (e.clientX - rect.left) / rect.width));
    const step = Math.floor(x * totalSteps);
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onSet(lane.id, step, lane.min + (1 - y) * (lane.max - lane.min));
  };

  return (
    <div className="autolane">
      <div className="al-label">⌁ {label}</div>
      <div
        ref={barsRef}
        className="al-bars"
        style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}
        onMouseDown={(e) => { dragging.current = true; apply(e); }}
        onMouseMove={(e) => { if (dragging.current) apply(e); }}
        onMouseUp={() => (dragging.current = false)}
        onMouseLeave={() => (dragging.current = false)}
      >
        {Array.from({ length: totalSteps }, (_, s) => {
          const v = lane.values[s];
          const frac = v == null ? 0 : (v - lane.min) / (lane.max - lane.min);
          return (
            <div key={s} className={`al-cell ${s === currentStep ? 'playhead' : ''}`}>
              <div className="al-bar" style={{ height: `${Math.max(2, frac * 100)}%` }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
