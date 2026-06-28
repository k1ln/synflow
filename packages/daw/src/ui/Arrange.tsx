import React from 'react';
import type { Project } from '../model/project';

const CATS = ['var(--cat-source)', 'var(--cat-gain)', 'var(--cat-mod)', 'var(--cat-fx)', 'var(--cat-midi)'];
const BARS = 16;

// A simple deterministic clip layout per track so the timeline reads as an arrangement.
function clipsFor(i: number, name: string): Array<[number, number, string]> {
  const layouts: Array<Array<[number, number]>> = [
    [[0, 8], [8, 6]], [[2, 6], [10, 4]], [[0, 14]], [[4, 4], [12, 2]],
    [[0, 6], [6, 4], [10, 6]], [[6, 4], [12, 4]], [[0, 8], [8, 8]],
  ];
  return (layouts[i % layouts.length]).map(([s, l]) => [s, l, name]);
}

export function Arrange({
  project, selId, onSelect, currentStep, totalBars = BARS,
}: {
  project: Project;
  selId: string | null;
  onSelect: (trackId: string) => void;
  currentStep: number;
  totalBars?: number;
}) {
  // map the looping step playhead onto the first bar of the timeline
  const f = currentStep < 0 ? -1 : (currentStep / project.totalSteps) / totalBars; // 0..1 across timeline

  return (
    <div className="arrange">
      <div className="arr-ruler">
        <div className="arr-head-spacer" />
        <div className="arr-bars">
          {Array.from({ length: totalBars }, (_, b) => (
            <div className="arr-bar" key={b}>{b + 1}</div>
          ))}
        </div>
      </div>
      <div className="arr-rows">
        {project.tracks.map((track, i) => {
          const cat = CATS[i % CATS.length];
          const sel = track.id === selId;
          return (
            <div className={`arr-row ${sel ? 'sel' : ''}`} key={track.id} onClick={() => onSelect(track.id)}>
              <div className="arr-trackhead" style={{ borderLeftColor: cat }}>
                <span className="arr-track-name">{track.name}</span>
                <span className="arr-track-sub">{track.instruments.length} inst · {track.fx.length} fx</span>
              </div>
              <div className="arr-lane">
                {clipsFor(i, track.name).map(([start, len, label], k) => (
                  <div
                    key={k}
                    className="arr-clip"
                    style={{
                      left: `${(start / totalBars) * 100}%`,
                      width: `${(len / totalBars) * 100}%`,
                      background: `color-mix(in srgb, ${cat} 22%, transparent)`,
                      borderColor: `color-mix(in srgb, ${cat} 60%, transparent)`,
                    }}
                  >
                    <span className="arr-clip-label" style={{ color: cat }}>{label}</span>
                    <div className="arr-clip-wave" style={{ background: `repeating-linear-gradient(90deg, ${cat}, ${cat} 1px, transparent 1px, transparent 4px)` }} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {f >= 0 && <div className="arr-playhead" style={{ left: `calc(180px + (100% - 180px) * ${f})` }} />}
    </div>
  );
}
