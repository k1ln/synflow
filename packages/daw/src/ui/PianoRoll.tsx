import React from 'react';
import type { PianoNote } from '../model/project';
import { midiName, isBlackKey } from '../model/pitch';

const LOW = 48;   // C3
const HIGH = 72;  // C5

/** Piano roll for one synth instrument-in-track (its own notes). */
export function PianoRoll({
  id, name, notes, voices, totalSteps, stepsPerBeat, currentStep, onAddNote, onRemoveNote,
}: {
  id: string;
  name: string;
  notes: PianoNote[];
  voices?: number;
  totalSteps: number;
  stepsPerBeat: number;
  currentStep: number;
  onAddNote: (useId: string, midi: number, start: number) => void;
  onRemoveNote: (useId: string, noteId: number) => void;
}) {
  const rows: number[] = [];
  for (let m = HIGH; m >= LOW; m--) rows.push(m);
  const noteAt = (midi: number, step: number) =>
    notes.find((n) => n.midi === midi && step >= n.start && step < n.start + n.length);

  return (
    <div className="pianoroll">
      <div className="pr-grid">
        {rows.map((midi) => (
          <div className="pr-row" key={midi}>
            <div className={`pr-key ${isBlackKey(midi) ? 'black' : ''}`}>{midiName(midi)}</div>
            <div className="pr-cells" style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}>
              {Array.from({ length: totalSteps }, (_, s) => {
                const note = noteAt(midi, s);
                return (
                  <button
                    key={s}
                    className={[
                      'pr-cell', note ? 'on' : '', note && note.start === s ? 'note-start' : '',
                      s % stepsPerBeat === 0 ? 'beat' : '', s === currentStep ? 'playhead' : '',
                    ].join(' ')}
                    onClick={() => (note ? onRemoveNote(id, note.id) : onAddNote(id, midi, s))}
                    title={`${midiName(midi)} @ step ${s + 1}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
