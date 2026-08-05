import React, { useEffect, useRef, useState } from 'react';
import { newNoteId, type PianoNote, type MusicalKey } from '../model/project';
import { midiName, isBlackKey, inScale, snapToScale, ROOT_NAMES, SCALE_LABELS, type ScaleType } from '../model/pitch';

const LOW = 21;    // A0  — full 88-key piano; the lane scrolls vertically
const HIGH = 108;  // C8
const ROW_H = 28;  // px per semitone row
const VIEW_H = 644;          // visible lane height (px) before it scrolls (~2 octaves)
const BASE_PX_PER_STEP = 22; // step width at zoom = 1; longer patterns scroll sideways
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 6;
const CENTER_MIDI = 72;      // scroll so this pitch (C5) sits near the top of the initial view

type SnapMode = 'off' | 'quarter' | 'step';
const SNAP_UNIT: Record<SnapMode, number> = { off: 0, quarter: 0.25, step: 1 };
const SNAP_LABEL: Record<SnapMode, string> = { off: 'free', quarter: '¼', step: '1' };

const snapTo = (v: number, unit: number) => (unit > 0 ? Math.round(v / unit) * unit : v);

/** The note lane's current horizontal scale/scroll — reported so sibling UI (a
 *  track's automation lanes) can size and scroll itself to stay aligned underneath. */
export interface RollView { px: number; scrollLeft: number; disp: number }

/** Piano roll for one synth instrument-in-track. Notes are free-positioned:
 *  click empty space to add, drag the body to move (pitch+time), drag the right
 *  edge to resize, right-click / Delete to remove. Snap is optional. */
export function PianoRoll({
  id, notes, totalSteps, stepsPerBeat, barSteps, currentStep, onAddNote, onRemoveNote, onMoveNote, onResizeNote, onUpdateNotes, onSetVelocity, onPlayNote, onQuantize, onTranspose, onHumanize, musicalKey, onSetKey, onAddChord,
  onKeyDown: onGutterDown, onKeyUp: onGutterUp, onViewChange,
}: {
  id: string;
  name: string;
  notes: PianoNote[];
  voices?: number;
  totalSteps: number;        // the pattern length (steps) — playback wraps here
  stepsPerBeat: number;
  barSteps: number;          // steps per bar — the lane grows in whole bars to fit notes
  currentStep: number;
  onViewChange?: (view: RollView) => void; // px/scroll/length, so automation lanes below can align
  onAddNote: (useId: string, midi: number, start: number, length?: number) => void;
  onRemoveNote: (useId: string, noteId: number) => void;
  onMoveNote: (useId: string, noteId: number, midi: number, start: number) => void;
  onResizeNote: (useId: string, noteId: number, length: number) => void;
  onUpdateNotes: (useId: string, updater: (notes: PianoNote[]) => PianoNote[]) => void;
  onSetVelocity: (useId: string, noteId: number, velocity: number) => void;
  onPlayNote: (useId: string, midi: number) => void;
  onQuantize: (useId: string, gridSteps: number) => void;
  onTranspose: (useId: string, semitones: number) => void;
  onHumanize: (useId: string) => void;
  musicalKey?: MusicalKey;
  onSetKey: (key: MusicalKey | null) => void;
  onAddChord: (useId: string, midis: number[], start: number, length?: number) => void;
  onKeyDown: (useId: string, midi: number) => void;
  onKeyUp: (useId: string, midi: number) => void;
}) {
  const rows: number[] = [];
  for (let m = HIGH; m >= LOW; m--) rows.push(m);
  // Drawable width auto-extends to the right: at least the pattern length, but grown
  // in whole bars to fit the notes plus one empty bar of headroom so you can always
  // drag/draw further right than the last note. (The pattern itself grows to match —
  // see the app's note handlers — so the extra notes actually play.)
  const per = Math.max(1, barSteps);
  const lastEnd = notes.reduce((m, n) => Math.max(m, n.start + n.length), 0);
  const disp = Math.max(totalSteps, Math.ceil(lastEnd / per) * per + per);
  const dispRef = useRef(disp); dispRef.current = disp;   // read live during a drag so the lane keeps extending
  const laneRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);    // scroll viewport (vertical pitch + horizontal time)
  const [snap, setSnap] = useState<SnapMode>('quarter');
  const [qGrid, setQGrid] = useState(stepsPerBeat / 4);   // quantize grid in steps (default 1/16)
  const QGRID: [string, number][] = [
    ['¼', stepsPerBeat], ['⅛', stepsPerBeat / 2], ['1/16', stepsPerBeat / 4], ['1/32', stepsPerBeat / 8],
    ['⅛T', stepsPerBeat / 3], ['1/16T', stepsPerBeat / 6],        // triplet grids
    ['⅛·', stepsPerBeat * 0.75], ['1/16·', stepsPerBeat * 0.375], // dotted grids
  ];
  const [chord, setChord] = useState(false);             // chord mode: clicks stamp a triad
  // Horizontal zoom: Ctrl/Cmd+wheel (anchored at the cursor) or the +/− buttons.
  // Plain wheel stays native 2-axis scroll — see the wheel effect below.
  const [zoom, setZoom] = useState(1);
  const px = BASE_PX_PER_STEP * zoom; // px per step at the current zoom
  const pxRef = useRef(px); pxRef.current = px;
  const zoomBy = (factor: number) => setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor)));
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
  // Shift a chord by octaves so it fits the keyboard range (no notes off-frame).
  const fitChord = (midis: number[]): number[] => {
    let ms = [...midis];
    while (Math.max(...ms) > HIGH) ms = ms.map((m) => m - 12);
    while (Math.min(...ms) < LOW) ms = ms.map((m) => m + 12);
    return ms.map((m) => Math.max(LOW, Math.min(HIGH, m)));
  };
  // Selection is a SET so a marquee can grab many notes and move/resize/copy/delete
  // them as a group. The last note length you drew or resized is remembered and
  // reused for the next note you add (Ableton-style).
  const [selSet, setSelSet] = useState<Set<number>>(new Set());
  const [marquee, setMarquee] = useState<null | { x0: number; y0: number; x1: number; y1: number }>(null);
  const lastLenRef = useRef(2);                          // default length for new notes (steps)
  const clipboardRef = useRef<PianoNote[]>([]);          // copied notes, for ⌘V paste
  const drag = useRef<null | (
    | { kind: 'note-move' | 'note-resize'; noteId: number; startX: number; startY: number; laneW: number; orig: Map<number, { start: number; len: number; midi: number }>; moved: boolean }
    | { kind: 'marquee'; startX: number; startY: number; laneW: number; left: number; top: number; x0: number; y0: number; moved: boolean }
  )>(null);

  // Key-gutter keyboard: hold a note on mouse-down, release on mouse-up anywhere.
  const held = useRef<number | null>(null);
  const releaseKey = () => { if (held.current != null) { onGutterUp(id, held.current); held.current = null; } window.removeEventListener('pointerup', releaseKey); };
  const pressKey = (midi: number) => { if (held.current === midi) return; if (held.current != null) onGutterUp(id, held.current); held.current = midi; onGutterDown(id, midi); window.addEventListener('pointerup', releaseKey); };

  const unit = SNAP_UNIT[snap];

  // Start the view centred on a useful octave (the lane is a full piano now).
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = Math.max(0, (HIGH - CENTER_MIDI) * ROW_H); }, []);

  // ── velocity lane: draw velocities by dragging; x picks the note, y its level ──
  const velScrollRef = useRef<HTMLDivElement>(null);
  const onViewChangeRef = useRef(onViewChange); onViewChangeRef.current = onViewChange;
  // keep the velocity lane (and the track's automation lanes) horizontally locked
  // to the note lane: read px/disp from refs so this listener never needs rebinding.
  useEffect(() => {
    const body = bodyRef.current; if (!body) return;
    const sync = () => {
      if (velScrollRef.current) velScrollRef.current.scrollLeft = body.scrollLeft;
      onViewChangeRef.current?.({ px: pxRef.current, scrollLeft: body.scrollLeft, disp: dispRef.current });
    };
    body.addEventListener('scroll', sync);
    return () => body.removeEventListener('scroll', sync);
  }, []);
  // Also report on zoom / length changes (no scroll event fires for those).
  useEffect(() => {
    onViewChangeRef.current?.({ px, scrollLeft: bodyRef.current?.scrollLeft ?? 0, disp });
  }, [px, disp]);
  const onVelDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const lane = e.currentTarget as HTMLElement;
    const paint = (clientX: number, clientY: number) => {
      const r = lane.getBoundingClientRect();
      const step = (clientX - r.left) / px;
      const vel = Math.max(0.05, Math.min(1, 1 - (clientY - r.top) / r.height));
      // nearest note whose span contains x (else nearest start within half a step)
      let best: PianoNote | null = null, bestD = 0.5;
      for (const n of notes) {
        if (step >= n.start && step < n.start + n.length) { best = n; bestD = 0; break; }
        const d = Math.abs(n.start - step);
        if (d < bestD) { best = n; bestD = d; }
      }
      if (!best) return;
      // dragging over a selected note edits the whole selection together
      if (selSet.has(best.id) && selSet.size > 1) onUpdateNotes(id, (ns) => ns.map((n) => (selSet.has(n.id) ? { ...n, velocity: vel } : n)));
      else onSetVelocity(id, best.id, vel);
    };
    paint(e.clientX, e.clientY);
    const mv = (ev: PointerEvent) => paint(ev.clientX, ev.clientY);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  // Middle-click drag pans the lane (both axes) — like the song board.
  const onBodyPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    const el = bodyRef.current!; const sx = e.clientX, sy = e.clientY, sl = el.scrollLeft, st = el.scrollTop;
    const move = (ev: PointerEvent) => { el.scrollLeft = sl - (ev.clientX - sx); el.scrollTop = st - (ev.clientY - sy); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); el.classList.remove('panning'); };
    el.classList.add('panning');
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  // Plain wheel/two-finger scrolls the lane natively. Alt+wheel over a note nudges
  // its velocity (non-passive so we can preventDefault). Notes read live via a ref.
  const notesRef = useRef(notes); notesRef.current = notes;
  const velRef = useRef(onSetVelocity); velRef.current = onSetVelocity;
  useEffect(() => {
    const lane = laneRef.current; if (!lane) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.altKey) return; // let it scroll
      const el = (e.target as HTMLElement).closest('.pr-note') as HTMLElement | null;
      if (!el) return;
      const nid = Number(el.dataset.nid);
      const n = notesRef.current.find((x) => x.id === nid); if (!n) return;
      e.preventDefault(); e.stopPropagation();
      setSelSet(new Set([nid]));
      velRef.current(id, nid, Math.max(0.05, Math.min(1, (n.velocity ?? 1) - Math.sign(e.deltaY) * 0.05)));
    };
    lane.addEventListener('wheel', onWheel, { passive: false });
    return () => lane.removeEventListener('wheel', onWheel);
  }, [id]);

  // Ctrl/Cmd+wheel zooms horizontally, anchored at the cursor (trackpad pinch also
  // sends ctrlKey wheel events). Non-passive so we can preventDefault over the zoom.
  useEffect(() => {
    const body = bodyRef.current; if (!body) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = body.getBoundingClientRect();
      const anchorX = e.clientX - rect.left; // px from the scroll viewport's left edge
      const cur = pxRef.current;
      const d = e.deltaY * (e.deltaMode === 1 ? 16 : 1); // normalise line-mode wheels to px
      const factor = Math.min(1.5, Math.max(1 / 1.5, Math.exp(-d * 0.0008)));
      const nextPx = Math.max(BASE_PX_PER_STEP * MIN_ZOOM, Math.min(BASE_PX_PER_STEP * MAX_ZOOM, cur * factor));
      if (nextPx === cur) return;
      const frac = (anchorX + body.scrollLeft) / cur; // step under the cursor
      setZoom(nextPx / BASE_PX_PER_STEP);
      requestAnimationFrame(() => { body.scrollLeft = Math.max(0, frac * nextPx - anchorX); });
    };
    body.addEventListener('wheel', onWheel, { passive: false });
    return () => body.removeEventListener('wheel', onWheel);
  }, []);

  // Note ids intersecting a lane-relative rectangle (marquee). Steps are a fixed
  // pixel width (px) so the mapping never depends on the lane width.
  const notesInRect = (ax0: number, ay0: number, ax1: number, ay1: number): number[] => {
    const sx0 = Math.min(ax0, ax1) / px, sx1 = Math.max(ax0, ax1) / px;
    const r0 = Math.floor(Math.min(ay0, ay1) / ROW_H), r1 = Math.floor(Math.max(ay0, ay1) / ROW_H);
    const mHi = HIGH - r0, mLo = HIGH - r1;
    return notesRef.current.filter((n) => n.start < sx1 && n.start + n.length > sx0 && n.midi >= mLo && n.midi <= mHi).map((n) => n.id);
  };

  // ── Empty-lane pointer: click = add a note; drag = marquee-select ──────────────
  const onLanePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const rect = laneRef.current!.getBoundingClientRect();
    drag.current = { kind: 'marquee', startX: e.clientX, startY: e.clientY, laneW: rect.width, left: rect.left, top: rect.top, x0: e.clientX - rect.left, y0: e.clientY - rect.top, moved: false };
    window.addEventListener('pointermove', onLaneDragMove);
    window.addEventListener('pointerup', onLaneDragEnd);
  };
  const onLaneDragMove = (e: PointerEvent) => {
    const d = drag.current; if (!d || d.kind !== 'marquee') return;
    if (Math.abs(e.clientX - d.startX) > 3 || Math.abs(e.clientY - d.startY) > 3) d.moved = true;
    if (!d.moved) return;
    const x1 = e.clientX - d.left, y1 = e.clientY - d.top;
    setMarquee({ x0: d.x0, y0: d.y0, x1, y1 });
    setSelSet(new Set(notesInRect(d.x0, d.y0, x1, y1)));
  };
  const onLaneDragEnd = () => {
    window.removeEventListener('pointermove', onLaneDragMove);
    window.removeEventListener('pointerup', onLaneDragEnd);
    const d = drag.current; drag.current = null;
    if (!d || d.kind !== 'marquee') return;
    if (d.moved) { setMarquee(null); return; }       // finished a selection box
    // a plain click on empty space → add a note (using the remembered length); the
    // pattern grows to fit, so you can place past the current end.
    const start = Math.max(0, snapTo(d.x0 / px, unit || 0.25));
    const root = keyed(Math.max(LOW, Math.min(HIGH, HIGH - Math.floor(d.y0 / ROW_H))));
    if (chord) onAddChord(id, fitChord(triadFrom(root)), start, lastLenRef.current);
    else onAddNote(id, root, start, lastLenRef.current);
    setSelSet(new Set());
  };

  // ── Note pointer: move or resize, as a group when the note is part of a selection ─
  const beginDrag = (e: React.PointerEvent, note: PianoNote, mode: 'move' | 'resize') => {
    if (e.button !== 0) return;                         // let middle-click bubble up so the body can pan
    e.stopPropagation();
    if (e.shiftKey) {                                   // shift-click toggles membership, no drag
      setSelSet((s) => { const n = new Set(s); n.has(note.id) ? n.delete(note.id) : n.add(note.id); return n; });
      return;
    }
    const group = selSet.has(note.id) ? selSet : new Set([note.id]); // grabbing an unselected note selects just it
    if (!selSet.has(note.id)) setSelSet(group);
    if (mode === 'move') onPlayNote(id, note.midi);     // audition the note you grab
    const orig = new Map<number, { start: number; len: number; midi: number }>();
    for (const n of notesRef.current) if (group.has(n.id)) orig.set(n.id, { start: n.start, len: n.length, midi: n.midi });
    drag.current = { kind: mode === 'move' ? 'note-move' : 'note-resize', noteId: note.id, startX: e.clientX, startY: e.clientY, laneW: laneRef.current!.getBoundingClientRect().width, orig, moved: false };
    window.addEventListener('pointermove', onNoteDragMove);
    window.addEventListener('pointerup', onNoteDragEnd);
  };

  const onNoteDragMove = (e: PointerEvent) => {
    const d = drag.current; if (!d || (d.kind !== 'note-move' && d.kind !== 'note-resize')) return;
    if (Math.abs(e.clientX - d.startX) > 2 || Math.abs(e.clientY - d.startY) > 2) d.moved = true;
    const dSteps = snapTo((e.clientX - d.startX) / px, unit);
    if (d.kind === 'note-move') {
      let dRow = Math.round((e.clientY - d.startY) / ROW_H);
      // clamp the group delta so every note stays in range (keeps the shape intact)
      let rLo = -Infinity, rHi = Infinity, sLo = -Infinity, sHi = Infinity;
      for (const o of d.orig.values()) { rHi = Math.min(rHi, o.midi - LOW); rLo = Math.max(rLo, o.midi - HIGH); sLo = Math.max(sLo, -o.start); sHi = Math.min(sHi, dispRef.current - o.len - o.start); }
      dRow = Math.max(rLo, Math.min(rHi, dRow));
      const dS = Math.max(sLo, Math.min(sHi, dSteps));
      onUpdateNotes(id, (ns) => ns.map((n) => { const o = d.orig.get(n.id); return o ? { ...n, start: o.start + dS, midi: keyed(o.midi - dRow) } : n; }));
    } else {
      const min = unit || 0.25;
      onUpdateNotes(id, (ns) => ns.map((n) => { const o = d.orig.get(n.id); return o ? { ...n, length: Math.max(min, Math.min(dispRef.current - o.start, o.len + dSteps)) } : n; }));
      const og = d.orig.get(d.noteId); if (og) lastLenRef.current = Math.max(min, Math.min(dispRef.current - og.start, og.len + dSteps)); // remember for the next added note
    }
  };
  const onNoteDragEnd = () => {
    window.removeEventListener('pointermove', onNoteDragMove);
    window.removeEventListener('pointerup', onNoteDragEnd);
    const d = drag.current; drag.current = null;
    // a click (no drag) on a note collapses a group selection down to just that note
    if (d && (d.kind === 'note-move' || d.kind === 'note-resize') && !d.moved) setSelSet(new Set([d.noteId]));
  };

  // Duplicate `src` just after itself and select the copies (⌘D, and ⌘V paste).
  const duplicate = (src: PianoNote[]) => {
    if (!src.length) return;
    const span = Math.max(unit || 1, Math.max(...src.map((n) => n.start + n.length)) - Math.min(...src.map((n) => n.start)));
    const copies = src.map((n) => ({ ...n, id: newNoteId(), start: Math.max(0, n.start + span) })); // pattern grows to fit the copies
    onUpdateNotes(id, (ns) => [...ns, ...copies]);
    setSelSet(new Set(copies.map((n) => n.id)));
  };

  // Accent the downbeats: notes that start on a bar boundary get a touch louder and
  // longer — the way a human leans on beat 1. Applies to the selection, or all notes.
  const accentDownbeats = () => onUpdateNotes(id, (ns) => ns.map((n) => {
    if (selSet.size && !selSet.has(n.id)) return n;
    const onBar = Math.abs(((n.start % per) + per) % per) < 0.01;
    if (!onBar) return n;
    return { ...n, velocity: Math.min(1, (n.velocity ?? 1) + 0.18), length: Math.min(dispRef.current - n.start, n.length * 1.15) };
  }));

  const onKeyDown = (e: React.KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if ((e.key === 'Delete' || e.key === 'Backspace') && selSet.size) { e.preventDefault(); onUpdateNotes(id, (ns) => ns.filter((n) => !selSet.has(n.id))); setSelSet(new Set()); return; }
    if (meta && k === 'a') { e.preventDefault(); setSelSet(new Set(notesRef.current.map((n) => n.id))); return; }
    if (meta && k === 'c') { clipboardRef.current = notesRef.current.filter((n) => selSet.has(n.id)).map((n) => ({ ...n })); return; }
    if (meta && k === 'x') { clipboardRef.current = notesRef.current.filter((n) => selSet.has(n.id)).map((n) => ({ ...n })); onUpdateNotes(id, (ns) => ns.filter((n) => !selSet.has(n.id))); setSelSet(new Set()); return; }
    if (meta && k === 'd') { e.preventDefault(); duplicate(notesRef.current.filter((n) => selSet.has(n.id))); return; }
    if (meta && k === 'v') { e.preventDefault(); duplicate(clipboardRef.current); return; }
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
        <button className="pr-tool-btn" title="Accent downbeats — notes on each bar's first beat get a little louder & longer (human feel). Affects the selection, or all notes." onClick={accentDownbeats}>Accent</button>
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
        <div className="arr2-zoom" title="Zoom (Ctrl/Cmd + mouse wheel over the notes)">
          <button onClick={() => zoomBy(1 / 1.3)} aria-label="Zoom out">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => zoomBy(1.3)} aria-label="Zoom in">+</button>
        </div>
        <span className="pr-hint">click to add (keeps last length) · drag empty to select · move/resize a selection together · ⌘D copy · Del remove · Ctrl+scroll to zoom</span>
      </div>
      <div className="pr-body" ref={bodyRef} style={{ maxHeight: VIEW_H }} onPointerDown={onBodyPointerDown}>
        <div className="pr-ruler-row">
          <div className="pr-corner" />
          <div className="pr-ruler" style={{ minWidth: disp * px }}>
            {Array.from({ length: Math.ceil(disp / per) }, (_, b) => (
              <span key={b} className={`pr-barnum ${b * per >= totalSteps ? 'past' : ''}`} style={{ left: b * per * px }}>{b + 1}</span>
            ))}
          </div>
        </div>
        <div className="pr-grid-row">
        <div className="pr-keys" style={{ height: rows.length * ROW_H }}>
          {rows.map((midi) => (
            <div
              key={midi} className={`pr-keyrow ${isBlackKey(midi) ? 'black' : ''}`} style={{ height: ROW_H }}
              onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); pressKey(midi); }}
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
            minWidth: disp * px,   // fixed px/step: the lane grows rightward without shifting notes
            // bar lines (strongest) · beat lines · fine step lines — order matches .pr-lane background-image
            backgroundSize: `${px * per}px 100%, ${px * stepsPerBeat}px 100%, ${px}px 100%`,
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
            const left = n.start * px;
            const width = Math.max(2, n.length * px);
            const vel = n.velocity ?? 1;
            return (
              <div
                key={n.id}
                className={`pr-note ${selSet.has(n.id) ? 'sel' : ''}`}
                data-nid={n.id}
                style={{ top, left, width, height: ROW_H - 1, opacity: 0.35 + 0.65 * vel }}
                title={`${midiName(n.midi)} @ ${n.start.toFixed(2)} · ${n.length.toFixed(2)} · vel ${Math.round(vel * 100)}% (alt+scroll to change)`}
                onPointerDown={(e) => beginDrag(e, n, 'move')}
                onContextMenu={(e) => { e.preventDefault(); onRemoveNote(id, n.id); }}
              >
                <span className="pr-note-resize" onPointerDown={(e) => beginDrag(e, n, 'resize')} />
              </div>
            );
          })}
          {/* where the pattern loops — the lane extends past it to give drawing room */}
          {disp > totalSteps && <div className="pr-loopend" style={{ left: totalSteps * px }} title="pattern loops here" />}
          {marquee && (
            <div className="pr-marquee" style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }} />
          )}
          {currentStep >= 0 && (
            <div className="pr-playhead" style={{ left: (currentStep % totalSteps) * px }} />
          )}
        </div>
        </div>
      </div>
      {/* Velocity lane: one bar per note (aligned with the note lane's x axis,
          scroll-synced). Click/drag to draw — height = velocity. */}
      <div className="pr-velrow">
        <div className="pr-vel-label" title="Note velocity — click/drag to draw">vel</div>
        <div className="pr-vel-scroll" ref={velScrollRef}>
          <div className="pr-vel-lane" style={{ minWidth: disp * px }} onPointerDown={onVelDown}>
            {notes.map((n) => (
              <div key={n.id} className={`pr-vel-bar ${selSet.has(n.id) ? 'sel' : ''}`}
                style={{ left: n.start * px, width: Math.max(4, Math.min(10, n.length * px - 2)), height: `${Math.max(4, (n.velocity ?? 1) * 100)}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
