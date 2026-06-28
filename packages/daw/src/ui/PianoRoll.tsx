import React from 'react';
import type { Instrument } from '../model/project';
import { midiName, isBlackKey } from '../model/pitch';

const LOW = 48;   // C3
const HIGH = 72;  // C5

export function PianoRoll({
  instrument, totalSteps, stepsPerBeat, currentStep, noteLength,
  onAddNote, onRemoveNote,
}: {
  instrument: Instrument;
  totalSteps: number;
  stepsPerBeat: number;
  currentStep: number;
  noteLength: number;
  onAddNote: (instrumentId: string, midi: number, start: number) => void;
  onRemoveNote: (instrumentId: string, noteId: number) => void;
}) {
  const rows: number[] = [];
  for (let m = HIGH; m >= LOW; m--) rows.push(m);
  const noteAt = (midi: number, step: number) =>
    instrument.notes?.find((n) => n.midi === midi && step >= n.start && step < n.start + n.length);

  return (
    <div className="pianoroll">
      <div className="pr-title">{instrument.name} — piano roll <span className="pr-poly">{instrument.voices ?? 1} voices</span></div>
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
                    onClick={() => (note ? onRemoveNote(instrument.id, note.id) : onAddNote(instrument.id, midi, s))}
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
