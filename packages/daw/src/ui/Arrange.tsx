import React from 'react';
import { Repeat, X, Drum, Music2 } from 'lucide-react';
import type { Project, Clip } from '../model/project';

const coverage = (clip: Clip, next: Clip | undefined, slots: number) => (clip.loop ? (next?.start ?? slots) - clip.start : clip.length);

/** Song arrangement: tracks × a bar/pattern timeline. Place clips of each track's
 *  pattern; toggle a clip to LOOP so it just keeps going. */
export function Arrange({
  project, currentSlot, songMode, selTrack,
  onToggleSongMode, onSetSongSlots, onSelectTrack, onAddClip, onRemoveClip, onToggleLoop, onClipLen,
}: {
  project: Project;
  currentSlot: number;
  songMode: boolean;
  selTrack: string;
  onToggleSongMode: () => void;
  onSetSongSlots: (n: number) => void;
  onSelectTrack: (id: string) => void;
  onAddClip: (trackId: string, slot: number) => void;
  onRemoveClip: (trackId: string, clipId: string) => void;
  onToggleLoop: (trackId: string, clipId: string) => void;
  onClipLen: (trackId: string, clipId: string, length: number) => void;
}) {
  const N = project.songSlots;
  return (
    <div className="arrange2">
      <div className="arr2-bar">
        <button className={`arr2-mode ${songMode ? 'on' : ''}`} onClick={onToggleSongMode} title="Toggle what the transport plays">
          {songMode ? 'Song' : 'Pattern'}
        </button>
        <span className="arr2-hint">{songMode ? 'transport plays the arrangement' : 'transport loops the current pattern — switch to Song to play the arrangement'}</span>
        <label className="arr2-len">bars
          <input type="number" min={1} max={64} value={N} onChange={(e) => onSetSongSlots(Math.max(1, Math.min(64, parseInt(e.target.value, 10) || N)))} />
        </label>
      </div>

      <div className="arr2-ruler">
        <div className="arr2-headcell" />
        <div className="arr2-ticks" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>
          {Array.from({ length: N }, (_, b) => <div key={b} className={`arr2-tick ${b % 4 === 0 ? 'beat' : ''}`}>{b + 1}</div>)}
        </div>
      </div>

      <div className="arr2-rows">
        {project.tracks.map((track) => {
          const sorted = [...track.clips].sort((a, b) => a.start - b.start);
          return (
            <div key={track.id} className={`arr2-row ${track.id === selTrack ? 'sel' : ''}`}>
              <div className="arr2-trk" onClick={() => onSelectTrack(track.id)}>
                {track.type === 'drums' ? <Drum size={12} /> : <Music2 size={12} />}
                <span>{track.name}</span>
              </div>
              <div
                className="arr2-lane"
                style={{ ['--n' as any]: N }}
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onAddClip(track.id, Math.floor(((e.clientX - r.left) / r.width) * N)); }}
              >
                {sorted.map((c, i) => {
                  const w = coverage(c, sorted[i + 1], N);
                  return (
                    <div
                      key={c.id} className={`arr2-clip ${c.loop ? 'loop' : ''} ${track.type}`}
                      style={{ left: `${(c.start / N) * 100}%`, width: `${(w / N) * 100}%` }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="arr2-clip-name">{c.loop ? 'loop' : `${c.length}`}</span>
                      <div className="arr2-clip-tools">
                        <button className={`arr2-clip-btn ${c.loop ? 'on' : ''}`} title="Loop — keep it going" onClick={() => onToggleLoop(track.id, c.id)}><Repeat size={11} /></button>
                        {!c.loop && <button className="arr2-clip-btn" title="Shorter" onClick={() => onClipLen(track.id, c.id, Math.max(1, c.length - 1))}>−</button>}
                        {!c.loop && <button className="arr2-clip-btn" title="Longer" onClick={() => onClipLen(track.id, c.id, c.length + 1)}>+</button>}
                        <button className="arr2-clip-btn" title="Remove" onClick={() => onRemoveClip(track.id, c.id)}><X size={11} /></button>
                      </div>
                    </div>
                  );
                })}
                {songMode && currentSlot >= 0 && <div className="arr2-ph" style={{ left: `${(currentSlot / N) * 100}%` }} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
