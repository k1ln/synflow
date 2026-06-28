import React from 'react';
import type { Project } from '../model/project';

export function ChannelRack({
  project, currentStep, onToggle, onMute,
}: {
  project: Project;
  currentStep: number;
  onToggle: (channelId: string, step: number) => void;
  onMute: (channelId: string) => void;
}) {
  return (
    <div className="rack">
      {project.channels.filter((c) => c.kind === 'step').map((ch) => (
        <div className="channel" key={ch.id}>
          <button
            className={`chan-name ${ch.muted ? 'muted' : ''}`}
            onClick={() => onMute(ch.id)}
            title="mute/unmute"
          >
            {ch.name}
          </button>
          <div className="steps">
            {ch.steps.map((on, i) => (
              <button
                key={i}
                className={[
                  'step',
                  on ? 'on' : '',
                  i === currentStep ? 'playhead' : '',
                  i % project.stepsPerBeat === 0 ? 'beat' : '',
                ].join(' ')}
                onClick={() => onToggle(ch.id, i)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
