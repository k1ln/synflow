import React, { useEffect, useRef, useState } from 'react';
import type { PianoNote, MusicalKey } from '../model/project';
import { midiName, isBlackKey, inScale, snapToScale, ROOT_NAMES, SCALE_LABELS, type ScaleType } from '../model/pitch';

const LOW = 48;    // C3
const HIGH = 72;   // C5
const ROW_H = 14;  // px per semitone row

type SnapMode = 'off' | 'quarter' | 'step';
const SNAP_UNIT: Record<SnapMode, number> = { off: 0, quarter: 0.25, step: 1 };
const SNAP_LABEL: Record<SnapMode, string> = { off: 'free', quarter: '¼', step: '1' };

const snapTo = (v: number, unit: number) => (unit > 0 ? Math.round(v / unit) * unit : v);

/** Piano roll for one synth instrument-in-track. Notes are free-positioned:
 *  click empty space to add, drag the body to move (pitch+time), drag the right
 *  edge to resize, right-click / Delete to remove. Snap is optional. */
export function PianoRoll({
  id, notes, totalSteps, stepsPerBeat, currentStep, onAddNote, onRemoveNote, onMoveNote, onResizeNote, onSetVelocity, onPlayNote, onQuantize, onTranspose, onHumanize, musicalKey, onSetKey, onAddChord,
  onKeyDown: onGutterDown, onKeyUp: onGutterUp,
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
  onMoveNote: (useId: string, noteId: number, midi: number, start: number) => void;
  onResizeNote: (useId: string, noteId: number, length: number) => void;
  onSetVelocity: (useId: string, noteId: number, velocity: number) => void;
  onPlayNote: (useId: string, midi: number) => void;
  onQuantize: (useId: string, gridSteps: number) => void;
  onTranspose: (useId: string, semitones: number) => void;
  onHumanize: (useId: string) => void;
  musicalKey?: MusicalKey;
  onSetKey: (key: MusicalKey | null) => void;
  onAddChord: (useId: string, midis: number[], start: number) => void;
  onKeyDown: (useId: string, midi: number) => void;
  onKeyUp: (useId: string, midi: number) => void;
}) {
  const rows: number[] = [];
  for (let m = HIGH; m >= LOW; m--) rows.push(m);
  const laneRef = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<SnapMode>('quarter');
  const [qGrid, setQGrid] = useState(stepsPerBeat / 4);   // quantize grid in steps (default 1/16)
  const QGRID: [string, number][] = [['¼', stepsPerBeat], ['⅛', stepsPerBeat / 2], ['1/16', stepsPerBeat / 4], ['1/32', stepsPerBeat / 8]];
  const [chord, setChord] = useState(false);             // chord mode: clicks stamp a triad
  // Snap an entered pitch into the key when snap is on (no-op otherwise).
  const keyed = (m: number) => (musicalKey?.snap ? snapToScale(m, musicalKey.root, musicalKey.scale) : m);
  // A triad rooted at `root`: diatonic (root/3rd/5th up the scale) when a key is
  // set, else a plain major triad.
  const triadFrom = (root: number): number[] => {
    if (!musicalKey) return [root, root + 4, root + 7];
    const asc = [root];
    for (let m = root + 1; asc.length < 5 && m < root + 24; m++) if (inScale(m, musicalKey.root, musicalKey.scale)) asc.push(m);
    return [asc[0], asc[2] ?? root + 4, asc[4] ?? root + 7];
  };
  const [sel, setSel] = useState<number | null>(null);
  const drag = useRef<null | {
    mode: 'move' | 'resize'; noteId: number; startX: number; startY: number;
    origStart: number; origLen: number; origMidi: number; laneW: number; moved: boolean;
  }>(null);

  // Key-gutter keyboard: hold a note on mouse-down, release on mouse-up anywhere.
  const held = useRef<number | null>(null);
  const releaseKey = () => { if (held.current != null) { onGutterUp(id, held.current); held.current = null; } window.removeEventListener('pointerup', releaseKey); };
  const pressKey = (midi: number) => { if (held.current === midi) return; if (held.current != null) onGutterUp(id, held.current); held.current = midi; onGutterDown(id, midi); window.addEventListener('pointerup', releaseKey); };

  const unit = SNAP_UNIT[snap];
  const stepFromX = (clientX: number, laneW: number) => (clientX / laneW) * totalSteps;

  // Scroll-wheel over a note adjusts its velocity. A native non-passive listener is
  // needed so we can preventDefault (and stop the editor from scrolling). Notes are
  // read live via a ref so the listener stays attached without re-binding.
  const notesRef = useRef(notes); notesRef.current = notes;
  const velRef = useRef(onSetVelocity); velRef.current = onSetVelocity;
  useEffect(() => {
    const lane = laneRef.current; if (!lane) return;
    const onWheel = (e: WheelEvent) => {
      const el = (e.target as HTMLElement).closest('.pr-note') as HTMLElement | null;
      if (!el) return;
      const nid = Number(el.dataset.nid);
      const n = notesRef.current.find((x) => x.id === nid); if (!n) return;
      e.preventDefault(); e.stopPropagation();
      setSel(nid);
      velRef.current(id, nid, Math.max(0.05, Math.min(1, (n.velocity ?? 1) - Math.sign(e.deltaY) * 0.05)));
    };
    lane.addEventListener('wheel', onWheel, { passive: false });
    return () => lane.removeEventListener('wheel', onWheel);
  }, [id]);

  const onLanePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const rect = laneRef.current!.getBoundingClientRect();
    const rawStart = stepFromX(e.clientX - rect.left, rect.width);
    const start = Math.max(0, Math.min(totalSteps - 0.25, snapTo(rawStart, unit || 0.25)));
    const row = Math.floor((e.clientY - rect.top) / ROW_H);
    const root = keyed(Math.max(LOW, Math.min(HIGH, HIGH - row)));
    if (chord) onAddChord(id, triadFrom(root), start);
    else onAddNote(id, root, start);
  };

  const beginDrag = (e: React.PointerEvent, note: PianoNote, mode: 'move' | 'resize') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSel(note.id);
    if (mode === 'move') onPlayNote(id, note.midi); // audition the note you grab
    const laneW = laneRef.current!.getBoundingClientRect().width;
    drag.current = { mode, noteId: note.id, startX: e.clientX, startY: e.clientY, origStart: note.start, origLen: note.length, origMidi: note.midi, laneW, moved: false };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  };

  const onDragMove = (e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dSteps = ((e.clientX - d.startX) / d.laneW) * totalSteps;
    if (Math.abs(e.clientX - d.startX) > 2 || Math.abs(e.clientY - d.startY) > 2) d.moved = true;
    if (d.mode === 'move') {
      const len = d.origLen;
      const start = Math.max(0, Math.min(totalSteps - len, snapTo(d.origStart + dSteps, unit)));
      const midi = Math.max(LOW, Math.min(HIGH, d.origMidi - Math.round((e.clientY - d.startY) / ROW_H)));
      onMoveNote(id, d.noteId, keyed(midi), start);
    } else {
      const min = unit || 0.25;
      const len = Math.max(min, Math.min(totalSteps - d.origStart, snapTo(d.origLen + dSteps, unit)));
      onResizeNote(id, d.noteId, len);
    }
  };

  const onDragEnd = () => {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    drag.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel != null) { onRemoveNote(id, sel); setSel(null); }
  };

  return (
    <div className="pianoroll" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="pr-tools">
        <span className="pr-snap-label">snap</span>
        {(['off', 'quarter', 'step'] as SnapMode[]).map((m) => (
          <button key={m} className={`pr-snap ${snap === m ? 'on' : ''}`} onClick={() => setSnap(m)}>{SNAP_LABEL[m]}</button>
        ))}
        <span className="pr-snap-label">grid</span>
        <select className="pr-qgrid" value={qGrid} onChange={(e) => setQGrid(parseFloat(e.target.value))} title="Quantize grid">
          {QGRID.map(([lbl, v]) => <option key={lbl} value={v}>{lbl}</option>)}
        </select>
        <button className="pr-quant" title="Snap every note's start to the grid" onClick={() => onQuantize(id, qGrid)}>Quantize</button>
        <span className="pr-snap-label">edit</span>
        <button className="pr-tool-btn" title="Transpose down an octave" onClick={() => onTranspose(id, -12)}>8va−</button>
        <button className="pr-tool-btn" title="Transpose down a semitone" onClick={() => onTranspose(id, -1)}>♭</button>
        <button className="pr-tool-btn" title="Transpose up a semitone" onClick={() => onTranspose(id, 1)}>♯</button>
        <button className="pr-tool-btn" title="Transpose up an octave" onClick={() => onTranspose(id, 12)}>8va+</button>
        <button className="pr-tool-btn" title="Humanize note velocities" onClick={() => onHumanize(id)}>Humanize</button>
        <span className="pr-snap-label">key</span>
        <select className="pr-qgrid pr-key-root" value={musicalKey?.root ?? 0} disabled={!musicalKey} title="Key root"
          onChange={(e) => musicalKey && onSetKey({ ...musicalKey, root: parseInt(e.target.value, 10) })}>
          {ROOT_NAMES.map((nm, i) => <option key={nm} value={i}>{nm}</option>)}
        </select>
        <select className="pr-qgrid pr-key-scale" value={musicalKey?.scale ?? ''} title="Scale — highlights in-key rows"
          onChange={(e) => { const v = e.target.value; if (!v) onSetKey(null); else onSetKey({ root: musicalKey?.root ?? 0, scale: v as ScaleType, snap: musicalKey?.snap ?? false }); }}>
          <option value="">Off</option>
          {(Object.keys(SCALE_LABELS) as ScaleType[]).map((s) => <option key={s} value={s}>{SCALE_LABELS[s]}</option>)}
        </select>
        <button className={`pr-snap ${musicalKey?.snap ? 'on' : ''}`} disabled={!musicalKey} title="Snap entered notes into the scale" onClick={() => musicalKey && onSetKey({ ...musicalKey, snap: !musicalKey.snap })}>snap</button>
        <button className={`pr-snap ${chord ? 'on' : ''}`} title="Chord mode: each click stamps a triad (diatonic when a key is set)" onClick={() => setChord((c) => !c)}>chord</button>
        <span className="pr-hint">click to add · drag to move · drag edge to resize · right-click / Delete to remove</span>
      </div>
      <div className="pr-body">
        <div className="pr-keys">
          {rows.map((midi) => (
            <div
              key={midi} className={`pr-keyrow ${isBlackKey(midi) ? 'black' : ''}`} style={{ height: ROW_H }}
              onPointerDown={(e) => { e.preventDefault(); pressKey(midi); }}
              onPointerEnter={(e) => { if (e.buttons & 1) pressKey(midi); }} // glide while held
              title={`${midiName(midi)} — hold to play`}
            >{midiName(midi)}</div>
          ))}
        </div>
        <div
          ref={laneRef}
          className="pr-lane"
          style={{
            height: rows.length * ROW_H,
            // fine step lines + stronger beat lines
            backgroundSize: `${100 / totalSteps}% 100%, ${(100 / totalSteps) * stepsPerBeat}% 100%`,
          }}
          onPointerDown={onLanePointerDown}
        >
          {rows.map((midi) => {
            const off = musicalKey ? !inScale(midi, musicalKey.root, musicalKey.scale) : false;
            const isRoot = musicalKey ? (((midi - musicalKey.root) % 12) + 12) % 12 === 0 : false;
            return <div key={`bg${midi}`} className={`pr-rowbg ${isBlackKey(midi) ? 'black' : 'white'} ${off ? 'off-key' : ''} ${isRoot ? 'root-key' : ''}`} style={{ top: (HIGH - midi) * ROW_H, height: ROW_H }} />;
          })}
          {notes.map((n) => {
            const top = (HIGH - n.midi) * ROW_H;
            const left = (n.start / totalSteps) * 100;
            const width = (n.length / totalSteps) * 100;
            const vel = n.velocity ?? 1;
            return (
              <div
                key={n.id}
                className={`pr-note ${sel === n.id ? 'sel' : ''}`}
                data-nid={n.id}
                style={{ top, left: `${left}%`, width: `${width}%`, height: ROW_H - 1, opacity: 0.35 + 0.65 * vel }}
                title={`${midiName(n.midi)} @ ${n.start.toFixed(2)} · ${n.length.toFixed(2)} · vel ${Math.round(vel * 100)}% (scroll to change)`}
                onPointerDown={(e) => beginDrag(e, n, 'move')}
                onContextMenu={(e) => { e.preventDefault(); onRemoveNote(id, n.id); }}
              >
                <span className="pr-note-resize" onPointerDown={(e) => beginDrag(e, n, 'resize')} />
              </div>
            );
          })}
          {currentStep >= 0 && (
            <div className="pr-playhead" style={{ left: `${((currentStep % totalSteps) / totalSteps) * 100}%` }} />
          )}
        </div>
      </div>
    </div>
  );
}
