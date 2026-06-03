import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PoolItem, Project } from '../model/project';
import { isBlackKey, midiName } from '../model/pitch';

// ── Computer-keyboard → musical mapping ──────────────────────────────────────
// Letter rows play the synth (one+ octave, classic "musical typing" layout);
// number row plays the drum pads. Black-note keys are the staggered upper letters.
const KEY_SEMITONE: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ';': 16,
};
// semitone → the key that triggers it (for drawing key hints on the piano).
const SEMITONE_KEY: Record<number, string> = Object.fromEntries(
  Object.entries(KEY_SEMITONE).map(([k, s]) => [s, k]),
);
const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

const VISIBLE_SEMITONES = 24; // two octaves of keys drawn on the keyboard

/**
 * Live performance view: play the selected synth on a piano keyboard and every
 * drum on a pad grid — by mouse, touch, or computer keyboard. Notes are held for
 * as long as the key/pointer is down (real noteOn/noteOff against @synflow/core).
 */
export function Live({
  project, synthId, onSelectSynth, onNoteOn, onNoteOff, onDrumDown, onDrumUp,
}: {
  project: Project;
  synthId: string;
  onSelectSynth: (id: string) => void;
  onNoteOn: (instId: string, midi: number) => void;
  onNoteOff: (instId: string, midi: number) => void;
  onDrumDown: (instId: string) => void;
  onDrumUp: (instId: string) => void;
}) {
  // Live mode plays the PROJECT POOL instruments (not track-bound).
  const synths = project.pool.filter((p) => p.kind === 'synth');
  const drums: PoolItem[] = project.pool.filter((p) => p.kind === 'drum');
  const synth = synths.find((s) => s.id === synthId) ?? synths[0];

  const [octave, setOctave] = useState(4);          // base octave; key 'a' = C(octave)
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [activePads, setActivePads] = useState<Set<string>>(new Set());

  const baseMidi = 12 * (octave + 1);               // octave 4 → 60 (C4)

  // Latest values for the keyboard listener (bound once; reads through refs so
  // changing octave/synth never strands a held note).
  const ref = useRef({ synth, drums, baseMidi, onNoteOn, onNoteOff, onDrumDown, onDrumUp });
  ref.current = { synth, drums, baseMidi, onNoteOn, onNoteOff, onDrumDown, onDrumUp };
  // What each held computer key actually triggered, so keyup releases the same.
  const heldNote = useRef<Map<string, { instId: string; midi: number }>>(new Map());
  const heldPad = useRef<Map<string, string>>(new Map());

  const pressNote = useCallback((instId: string, midi: number) => {
    setActiveNotes((s) => (s.has(midi) ? s : new Set(s).add(midi)));
    ref.current.onNoteOn(instId, midi);
  }, []);
  const releaseNote = useCallback((instId: string, midi: number) => {
    setActiveNotes((s) => { if (!s.has(midi)) return s; const n = new Set(s); n.delete(midi); return n; });
    ref.current.onNoteOff(instId, midi);
  }, []);
  const pressPad = useCallback((instId: string) => {
    setActivePads((s) => (s.has(instId) ? s : new Set(s).add(instId)));
    ref.current.onDrumDown(instId);
  }, []);
  const releasePad = useCallback((instId: string) => {
    setActivePads((s) => { if (!s.has(instId)) return s; const n = new Set(s); n.delete(instId); return n; });
    ref.current.onDrumUp(instId);
  }, []);

  // Computer keyboard → notes / pads / octave. Bound once for the view's lifetime.
  useEffect(() => {
    const isTyping = (el: EventTarget | null) =>
      el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') { setOctave((o) => Math.max(0, o - 1)); return; }
      if (key === 'x') { setOctave((o) => Math.min(8, o + 1)); return; }
      const padIdx = PAD_KEYS.indexOf(key);
      if (padIdx >= 0) {
        const drum = ref.current.drums[padIdx];
        if (drum && !heldPad.current.has(key)) { heldPad.current.set(key, drum.id); pressPad(drum.id); e.preventDefault(); }
        return;
      }
      const semi = KEY_SEMITONE[key];
      if (semi != null && ref.current.synth && !heldNote.current.has(key)) {
        const midi = ref.current.baseMidi + semi;
        heldNote.current.set(key, { instId: ref.current.synth.id, midi });
        pressNote(ref.current.synth.id, midi);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const note = heldNote.current.get(key);
      if (note) { heldNote.current.delete(key); releaseNote(note.instId, note.midi); }
      const padId = heldPad.current.get(key);
      if (padId) { heldPad.current.delete(key); releasePad(padId); }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      // Release anything still held when leaving the view.
      for (const { instId, midi } of heldNote.current.values()) ref.current.onNoteOff(instId, midi);
      for (const instId of heldPad.current.values()) ref.current.onDrumUp(instId);
      heldNote.current.clear(); heldPad.current.clear();
    };
  }, [pressNote, releaseNote, pressPad, releasePad]);

  // Keys drawn on the piano: white keys flow left→right, black keys overlay.
  const midis = Array.from({ length: VISIBLE_SEMITONES + 1 }, (_, i) => baseMidi + i);
  const whites = midis.filter((m) => !isBlackKey(m));

  return (
    <div className="live">
      <div className="live-bar">
        <div className="live-group">
          <span className="live-label">Synth</span>
          <select className="live-select" value={synth?.id ?? ''} onChange={(e) => onSelectSynth(e.target.value)}>
            {synths.length === 0 && <option value="">— no synth in project —</option>}
            {synths.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="live-group">
          <span className="live-label">Octave</span>
          <button className="live-oct" onClick={() => setOctave((o) => Math.max(0, o - 1))} title="Octave down (Z)">−</button>
          <span className="live-octval">C{octave}</span>
          <button className="live-oct" onClick={() => setOctave((o) => Math.min(8, o + 1))} title="Octave up (X)">+</button>
        </div>
        <span className="live-hint">Letters play the synth · number row plays drums · Z / X shift octave · touch-friendly</span>
      </div>

      <div className="live-keyboard" style={{ ['--whites' as any]: whites.length }}>
        <div className="lk-whites">
          {whites.map((m) => {
            const hint = SEMITONE_KEY[m - baseMidi];
            return (
              <button
                key={m}
                className={`lk-white ${activeNotes.has(m) ? 'on' : ''}`}
                disabled={!synth}
                onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); if (synth) pressNote(synth.id, m); }}
                onPointerUp={() => synth && releaseNote(synth.id, m)}
                onPointerLeave={(e) => { if (e.buttons && synth) releaseNote(synth.id, m); }}
                onPointerCancel={() => synth && releaseNote(synth.id, m)}
              >
                {(m % 12 === 0) && <span className="lk-oct">{midiName(m)}</span>}
                {hint && <span className="lk-hint">{hint}</span>}
              </button>
            );
          })}
        </div>
        <div className="lk-blacks">
          {whites.map((m, i) => {
            const black = m + 1;
            // a black key sits to the right of every white except E and B
            if (isBlackKey(m + 1) === false || i === whites.length - 1) return null;
            const hint = SEMITONE_KEY[black - baseMidi];
            return (
              <button
                key={black}
                className={`lk-black ${activeNotes.has(black) ? 'on' : ''}`}
                disabled={!synth}
                style={{ left: `calc(${((i + 1) / whites.length) * 100}% - (100% / ${whites.length}) * 0.3)` }}
                onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); if (synth) pressNote(synth.id, black); }}
                onPointerUp={() => synth && releaseNote(synth.id, black)}
                onPointerLeave={(e) => { if (e.buttons && synth) releaseNote(synth.id, black); }}
                onPointerCancel={() => synth && releaseNote(synth.id, black)}
              >
                {hint && <span className="lk-hint">{hint}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="live-pads-head">
        <span className="live-label">Drum pads</span>
        <span className="live-hint">{drums.length} drum{drums.length === 1 ? '' : 's'} · keys 1–0</span>
      </div>
      <div className="live-pads">
        {drums.length === 0 && <div className="live-empty">No drum instruments — add some on a track first.</div>}
        {drums.map((d, i) => (
          <button
            key={d.id}
            className={`live-pad ${activePads.has(d.id) ? 'on' : ''}`}
            onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); pressPad(d.id); }}
            onPointerUp={() => releasePad(d.id)}
            onPointerLeave={(e) => { if (e.buttons) releasePad(d.id); }}
            onPointerCancel={() => releasePad(d.id)}
          >
            <span className="live-pad-key">{PAD_KEYS[i] ?? ''}</span>
            <span className="live-pad-name">{d.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
