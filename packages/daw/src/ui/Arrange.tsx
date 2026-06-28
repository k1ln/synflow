import React, { useEffect, useRef, useState } from 'react';
import { Repeat, X, Drum, Music2, AudioWaveform, Film, Volume2, VolumeX, Play, Square, Scissors } from 'lucide-react';
import { songLengthSlots, type Project, type Clip, type AudioClip, type VideoClip } from '../model/project';

const coverage = (clip: Clip, next: Clip | undefined, slots: number) => (clip.loop ? (next?.start ?? slots) - clip.start : clip.length);

const MIN_PX_PER_BAR = 0.02; // zoom out far enough to fit very long (hour+) songs
const MAX_PX_PER_BAR = 320;
const TRK_W = 150; // frozen track-name column width (keep in sync with .arr2-trk in app.css)
const clampZoom = (n: number) => Math.max(MIN_PX_PER_BAR, Math.min(MAX_PX_PER_BAR, n));

/** Whole seconds → hh:mm:ss. */
const fmtTime = (sec: number) => {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/** Compact marker label: m:ss, or h:mm:ss past an hour. */
const fmtMark = (sec: number) => {
  const t = Math.max(0, Math.round(sec));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

// "Nice" spacing ladders so labels never crowd: the time ruler steps through
// these seconds, the bar ruler through these bar counts. We pick the smallest
// step whose on-screen spacing clears the minimum pixel gap.
const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 28800];
const BAR_STEPS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384];
const MIN_TIME_LABEL_PX = 64;
const MIN_BAR_LABEL_PX = 40; // gap between bar numbers (they thin out further when zoomed out)
const MIN_GRID_LINE_PX = 7;  // gap between grid lines (so they never merge into a wash)
const pickStep = (ladder: number[], minValue: number) => ladder.find((s) => s >= minValue) ?? ladder[ladder.length - 1];

/** Song arrangement: tracks × a bar/pattern timeline. Place clips of each track's
 *  pattern; drag to move, drag the right edge to resize, toggle a clip to LOOP.
 *  The timeline fits the panel by default, zooms (− / + or mouse wheel over the
 *  song, anchored at the cursor; Shift-wheel scrolls) and scrolls; the ruler +
 *  track-name column stay frozen. Scrub the ruler to move
 *  the playhead (live-seeks while playing); it follows playback. */
export function Arrange({
  project, currentStep, songMode, selTrack,
  onToggleSongMode, onSetSongSlots, onSelectTrack, onToggleMute, onTrackVolume, onSeek, onAddClip, onRemoveClip, onToggleLoop, onClipLen, onMoveClip, onMoveAudioClip, onRemoveAudioClip, onMoveVideoClip, onRemoveVideoClip, onSetAudioClip, onSetVideoClip, onSplitAudioClip, onSplitVideoClip, onPlayClip, previewKey,
}: {
  project: Project;
  currentStep: number;
  songMode: boolean;
  selTrack: string;
  onToggleSongMode: () => void;
  onSetSongSlots: (n: number) => void;
  onSelectTrack: (id: string) => void;
  onToggleMute: (trackId: string) => void;
  onTrackVolume: (trackId: string, v: number) => void;
  onSeek: (step: number) => void;
  onAddClip: (trackId: string, slot: number) => void;
  onRemoveClip: (trackId: string, clipId: string) => void;
  onToggleLoop: (trackId: string, clipId: string) => void;
  onClipLen: (trackId: string, clipId: string, length: number) => void;
  onMoveClip: (trackId: string, clipId: string, start: number) => void;
  onMoveAudioClip: (trackId: string, clipId: string, start: number) => void;
  onRemoveAudioClip: (trackId: string, clipId: string) => void;
  onMoveVideoClip: (trackId: string, clipId: string, start: number) => void;
  onRemoveVideoClip: (trackId: string, clipId: string) => void;
  onSetAudioClip: (trackId: string, clipId: string, patch: Partial<AudioClip>) => void;
  onSetVideoClip: (trackId: string, clipId: string, patch: Partial<VideoClip>) => void;
  onSplitAudioClip: (trackId: string, clipId: string, atSteps: number) => void;
  onSplitVideoClip: (trackId: string, clipId: string, atSteps: number) => void;
  onPlayClip: (clip: AudioClip) => void;
  previewKey: string | null;
}) {
  const N = songLengthSlots(project); // grows past songSlots to contain long audio clips
  const secToSteps = (s: number) => s * (project.bpm / 60) * project.stepsPerBeat;
  const totalTimelineSteps = N * project.totalSteps;        // whole-song length in steps
  const secPerStep = 60 / project.bpm / project.stepsPerBeat;
  const posSec = (currentStep < 0 ? 0 : currentStep) * secPerStep;
  const totalSec = totalTimelineSteps * secPerStep;
  const playheadPct = currentStep < 0 ? -1 : (currentStep / Math.max(1, totalTimelineSteps)) * 100;

  // Timeline zoom in px-per-bar. Fits the panel until the user zooms manually.
  const [pxPerBar, setPxPerBar] = useState(96);
  const userZoomedRef = useRef(false);
  const lanePx = N * pxPerBar;
  // Mirrors for the wheel handler (stable effect, always-current values).
  const pxPerBarRef = useRef(pxPerBar); pxPerBarRef.current = pxPerBar;
  const nRef = useRef(N); nRef.current = N;
  // Zoom multiplicatively so it stays smooth across the whole range (incl. tiny px/bar).
  const zoom = (factor: number) => { userZoomedRef.current = true; setPxPerBar((p) => clampZoom(p * factor)); };

  // Adaptive density: widen the gap between labels/lines as the timeline shrinks so
  // they never overlap or merge. Time markers track real duration; bar numbers and
  // grid lines thin out (lines stay finer than numbers).
  const pxPerSec = lanePx / Math.max(0.001, totalSec);
  const timeStep = pickStep(TIME_STEPS, MIN_TIME_LABEL_PX / Math.max(0.001, pxPerSec));
  const barEvery = pickStep(BAR_STEPS, MIN_BAR_LABEL_PX / Math.max(0.001, pxPerBar));
  const lineEvery = pickStep(BAR_STEPS, MIN_GRID_LINE_PX / Math.max(0.001, pxPerBar));
  const timeMarks: number[] = [];
  for (let t = 0; t <= totalSec + 1e-6; t += timeStep) timeMarks.push(t);
  const barMarks: number[] = [];
  for (let b = 0; b < N; b += barEvery) barMarks.push(b);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Fit the whole song to the panel width by default; re-fit on resize / bar-count
  // change. Stops once the user zooms by hand.
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const fit = () => { if (!userZoomedRef.current) setPxPerBar(clampZoom((el.clientWidth - TRK_W) / Math.max(1, N))); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [N]);

  // Mouse wheel over the *ruler* (timeline) zooms, anchored at the cursor. Over the
  // track rows the wheel scrolls normally (move through the song). Shift-/horizontal-
  // wheel and the frozen track-name column are left alone. (Non-passive so we can
  // preventDefault when we do zoom.)
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // let it scroll horizontally
      const rulerRect = rulerRef.current?.getBoundingClientRect();
      if (!rulerRect || e.clientY > rulerRect.bottom) return;            // over the rows → scroll, don't zoom
      const rect = el.getBoundingClientRect();
      const anchorX = e.clientX - rect.left - TRK_W;   // px from the lane's left edge (viewport-relative)
      if (anchorX < 0) return;                          // over the frozen track-name column
      e.preventDefault();
      const cur = pxPerBarRef.current;
      // Zoom by the actual scroll distance (not a fixed step per event) so it feels
      // the same on a mouse notch or a high-frequency trackpad. Gentle + clamped.
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : 1);     // normalise line-mode wheels to px
      const factor = Math.min(1.5, Math.max(1 / 1.5, Math.exp(-px * 0.0005)));
      const next = clampZoom(cur * factor);
      if (next === cur) return;
      const n = nRef.current;
      const frac = (anchorX + el.scrollLeft) / Math.max(1, n * cur); // timeline fraction under the cursor
      userZoomedRef.current = true;
      setPxPerBar(next);
      const newScroll = frac * (n * next) - anchorX;    // keep that fraction under the cursor
      requestAnimationFrame(() => { el.scrollLeft = Math.max(0, newScroll); });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Keep the playhead in view during playback.
  useEffect(() => {
    if (currentStep < 0) return;
    const el = scrollRef.current; if (!el) return;
    const x = TRK_W + (currentStep / Math.max(1, totalTimelineSteps)) * lanePx;
    if (x < el.scrollLeft + TRK_W + 8 || x > el.scrollLeft + el.clientWidth - 32) {
      el.scrollLeft = Math.max(0, x - el.clientWidth / 2);
    }
  }, [currentStep, lanePx, totalTimelineSteps]);

  // ── Ruler scrub → seek ──────────────────────────────────────────────────────
  const rulerRef = useRef<HTMLDivElement>(null);
  const seekFromX = (clientX: number) => {
    const el = rulerRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onSeek(frac * totalTimelineSteps);
  };
  const onSeekMove = (e: PointerEvent) => seekFromX(e.clientX);
  const onSeekUp = () => { window.removeEventListener('pointermove', onSeekMove); window.removeEventListener('pointerup', onSeekUp); };
  const onRulerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    seekFromX(e.clientX);
    window.addEventListener('pointermove', onSeekMove); window.addEventListener('pointerup', onSeekUp);
  };

  // ── Clip drag (move / resize / audio|video move / media edge-trim) ───────────
  type TrimSnap = { offset: number; duration: number; start: number; max: number };
  const drag = useRef<null | { kind: 'move' | 'resize' | 'audio' | 'video' | 'trimL' | 'trimR'; media?: 'audio' | 'video'; trackId: string; clipId: string; startX: number; laneW: number; orig: number; snap?: TrimSnap }>(null);
  const onDragMove = (e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    if (d.kind === 'trimL' || d.kind === 'trimR') {
      const s = d.snap!;
      const dSec = ((e.clientX - d.startX) / d.laneW) * totalTimelineSteps * secPerStep;
      const setClip = d.media === 'audio' ? onSetAudioClip : onSetVideoClip;
      if (d.kind === 'trimR') {
        setClip(d.trackId, d.clipId, { duration: Math.max(0.05, Math.min(s.max - s.offset, s.duration + dSec)) });
      } else {
        const offset = Math.max(0, Math.min(s.offset + s.duration - 0.05, s.offset + dSec));
        const delta = offset - s.offset;
        setClip(d.trackId, d.clipId, { offset, duration: s.duration - delta, start: Math.max(0, s.start + delta / secPerStep) });
      }
      return;
    }
    if (d.kind === 'audio' || d.kind === 'video') {
      const dSteps = ((e.clientX - d.startX) / d.laneW) * totalTimelineSteps;
      const move = d.kind === 'audio' ? onMoveAudioClip : onMoveVideoClip;
      move(d.trackId, d.clipId, Math.max(0, d.orig + dSteps));
      return;
    }
    const dSlots = Math.round(((e.clientX - d.startX) / d.laneW) * N);
    if (d.kind === 'move') onMoveClip(d.trackId, d.clipId, Math.max(0, d.orig + dSlots));
    else onClipLen(d.trackId, d.clipId, Math.max(1, d.orig + dSlots));
  };
  const onDragEnd = () => { window.removeEventListener('pointermove', onDragMove); window.removeEventListener('pointerup', onDragEnd); drag.current = null; };
  const begin = (e: React.PointerEvent, kind: 'move' | 'resize' | 'audio' | 'video', trackId: string, clipId: string, orig: number) => {
    e.stopPropagation(); if (e.button !== 0) return;
    drag.current = { kind, trackId, clipId, startX: e.clientX, laneW: (e.currentTarget.closest('.arr2-lane') as HTMLElement).getBoundingClientRect().width, orig };
    window.addEventListener('pointermove', onDragMove); window.addEventListener('pointerup', onDragEnd);
  };
  const beginTrim = (e: React.PointerEvent, side: 'L' | 'R', media: 'audio' | 'video', trackId: string, clip: { id: string; assetId: string; offset: number; duration: number; start: number; text?: string }) => {
    e.stopPropagation(); if (e.button !== 0) return;
    const max = clip.text != null ? 1e9 : (media === 'audio'        // titles have no source cap → freely resizable
      ? project.assets.find((a) => a.id === clip.assetId)?.duration
      : (project.videoAssets ?? []).find((a) => a.id === clip.assetId)?.duration) ?? (clip.offset + clip.duration);
    drag.current = { kind: side === 'L' ? 'trimL' : 'trimR', media, trackId, clipId: clip.id, startX: e.clientX, laneW: (e.currentTarget.closest('.arr2-lane') as HTMLElement).getBoundingClientRect().width, orig: 0, snap: { offset: clip.offset, duration: clip.duration, start: clip.start, max } };
    window.addEventListener('pointermove', onDragMove); window.addEventListener('pointerup', onDragEnd);
  };
  // Split a media clip at the playhead if it lands inside it, else at its midpoint.
  const splitMedia = (media: 'audio' | 'video', trackId: string, clip: { id: string; start: number; duration: number }) => {
    const widthSteps = secToSteps(clip.duration);
    const inside = currentStep > clip.start && currentStep < clip.start + widthSteps;
    const at = inside ? currentStep : clip.start + widthSteps / 2;
    (media === 'audio' ? onSplitAudioClip : onSplitVideoClip)(trackId, clip.id, at);
  };

  return (
    <div className="arrange2">
      <div className="arr2-bar">
        <button className={`arr2-mode ${songMode ? 'on' : ''}`} onClick={onToggleSongMode} title="Toggle what the transport plays">
          {songMode ? 'Song' : 'Pattern'}
        </button>
        <span className="arr2-hint">{songMode ? 'transport plays the arrangement' : 'transport loops the current pattern — switch to Song to play the arrangement'}</span>
        <span className="arr2-time" title="Playhead position / song length (hh:mm:ss)">{fmtTime(posSec)} / {fmtTime(totalSec)}</span>
        <div className="arr2-zoom" title="Zoom timeline (mouse wheel over the song · Shift-wheel to scroll)">
          <button onClick={() => zoom(1 / 1.5)} aria-label="Zoom out">−</button>
          <span>{pxPerBar >= 10 ? Math.round(pxPerBar) : pxPerBar.toFixed(pxPerBar >= 1 ? 1 : 2)}px/bar</span>
          <button onClick={() => zoom(1.5)} aria-label="Zoom in">+</button>
        </div>
        <label className="arr2-len" title={N > project.songSlots ? `grown to ${N} bars to fit audio` : 'minimum song length in bars'}>bars
          <input type="number" min={1} max={9999} value={project.songSlots} onChange={(e) => onSetSongSlots(Math.max(1, Math.min(9999, parseInt(e.target.value, 10) || project.songSlots)))} />
          {N > project.songSlots && <span className="arr2-len-grown">→ {N}</span>}
        </label>
      </div>

      <div className="arr2-scroll" ref={scrollRef}>
        <div className="arr2-grid" style={{ ['--lane-w' as any]: `${lanePx}px` }}>
          <div className="arr2-ruler">
            <div className="arr2-headcell" />
            <div className="arr2-ticks" ref={rulerRef} onPointerDown={onRulerDown}>
              {/* bar numbers, thinned to the adaptive interval so they never crowd */}
              {barMarks.map((b) => (
                <div key={`b${b}`} className="arr2-barmark" style={{ left: `${(b / N) * 100}%` }}>
                  <span>{b + 1}</span>
                </div>
              ))}
              {/* duration line: time markers at adaptive intervals */}
              {timeMarks.map((t) => (
                <div key={`t${t}`} className="arr2-timemark" style={{ left: `${(t / Math.max(0.001, totalSec)) * 100}%` }}>
                  <span>{fmtMark(t)}</span>
                </div>
              ))}
              {playheadPct >= 0 && <div className="arr2-ph ruler" style={{ left: `${playheadPct}%` }} />}
            </div>
          </div>

          <div className="arr2-rows">
            {project.tracks.map((track) => {
              const isAudio = track.type === 'audio';
              const isVideo = track.type === 'video';
              const isMedia = isAudio || isVideo;
              const sorted = [...track.clips].sort((a, b) => a.start - b.start);
              return (
                <div key={track.id} className={`arr2-row ${track.id === selTrack ? 'sel' : ''} ${track.muted ? 'muted' : ''}`}>
                  <div className="arr2-trk" onClick={() => onSelectTrack(track.id)}>
                    <div className="arr2-trk-head">
                      <button
                        className={`arr2-mute ${track.muted ? 'on' : ''}`}
                        title={track.muted ? 'Unmute track' : 'Mute track'}
                        onClick={(e) => { e.stopPropagation(); onToggleMute(track.id); }}
                      >
                        {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                      </button>
                      {track.type === 'drums' ? <Drum size={12} /> : track.type === 'audio' ? <AudioWaveform size={12} /> : track.type === 'video' ? <Film size={12} /> : <Music2 size={12} />}
                      <span>{track.name}</span>
                    </div>
                    <input className="arr2-vol" type="range" min={0} max={1} step={0.01} value={track.volume}
                      title={`Volume ${Math.round(track.volume * 100)}%`}
                      onClick={(e) => e.stopPropagation()} onChange={(e) => onTrackVolume(track.id, parseFloat(e.target.value))} />
                  </div>
                  <div
                    className="arr2-lane"
                    style={{ ['--n' as any]: N / lineEvery, cursor: isMedia ? 'default' : 'copy' }}
                    onClick={isMedia ? undefined : (e) => { const r = e.currentTarget.getBoundingClientRect(); onAddClip(track.id, Math.floor(((e.clientX - r.left) / r.width) * N)); }}
                  >
                    {isVideo
                      ? (track.videoClips ?? []).map((c: VideoClip) => {
                          const asset = (project.videoAssets ?? []).find((a) => a.id === c.assetId);
                          const w = secToSteps(c.duration) / totalTimelineSteps;
                          return (
                            <div
                              key={c.id} className={`arr2-clip ${c.text != null ? 'title' : 'video'}`}
                              style={{ left: `${(c.start / totalTimelineSteps) * 100}%`, width: `${Math.max(0.5, w * 100)}%`, backgroundImage: asset?.poster ? `url(${asset.poster})` : undefined }}
                              onPointerDown={(e) => begin(e, 'video', track.id, c.id, c.start)}
                            >
                              <span className="arr2-clip-name">{c.text != null ? (c.text || 'title') : (asset?.name ?? 'video')}</span>
                              <div className="arr2-clip-tools">
                                <button className="arr2-clip-btn" title="Split at playhead" onPointerDown={(e) => e.stopPropagation()} onClick={() => splitMedia('video', track.id, c)}><Scissors size={10} /></button>
                                <button className="arr2-clip-btn" title="Delete clip" onPointerDown={(e) => e.stopPropagation()} onClick={() => onRemoveVideoClip(track.id, c.id)}><X size={10} /></button>
                              </div>
                              <span className="arr2-trim left" title="Trim in" onPointerDown={(e) => beginTrim(e, 'L', 'video', track.id, c)} />
                              <span className="arr2-trim right" title="Trim out" onPointerDown={(e) => beginTrim(e, 'R', 'video', track.id, c)} />
                            </div>
                          );
                        })
                    : isAudio
                      ? (track.audioClips ?? []).map((c: AudioClip) => {
                          const asset = project.assets.find((a) => a.id === c.assetId);
                          const w = secToSteps(c.duration) / totalTimelineSteps;
                          return (
                            <div
                              key={c.id} className="arr2-clip audio"
                              style={{ left: `${(c.start / totalTimelineSteps) * 100}%`, width: `${Math.max(0.5, w * 100)}%` }}
                              onPointerDown={(e) => begin(e, 'audio', track.id, c.id, c.start)}
                            >
                              <span className="arr2-clip-name">{asset?.name ?? 'audio'}</span>
                              <div className="arr2-clip-tools">
                                <input className="arr2-fade" type="number" min={0} max={Math.max(0.1, c.duration)} step={0.05} value={Number((c.fadeIn ?? 0).toFixed(2))} title="Fade in (s) — overlap clips for a crossfade" onPointerDown={(e) => e.stopPropagation()} onChange={(e) => onSetAudioClip(track.id, c.id, { fadeIn: Math.max(0, parseFloat(e.target.value) || 0) })} />
                                <input className="arr2-fade" type="number" min={0} max={Math.max(0.1, c.duration)} step={0.05} value={Number((c.fadeOut ?? 0).toFixed(2))} title="Fade out (s)" onPointerDown={(e) => e.stopPropagation()} onChange={(e) => onSetAudioClip(track.id, c.id, { fadeOut: Math.max(0, parseFloat(e.target.value) || 0) })} />
                                <button className={`arr2-clip-btn ${previewKey === c.id ? 'on' : ''}`} title={previewKey === c.id ? 'Stop' : 'Play'} onPointerDown={(e) => e.stopPropagation()} onClick={() => onPlayClip(c)}>{previewKey === c.id ? <Square size={10} /> : <Play size={10} />}</button>
                                <button className="arr2-clip-btn" title="Split at playhead" onPointerDown={(e) => e.stopPropagation()} onClick={() => splitMedia('audio', track.id, c)}><Scissors size={10} /></button>
                                <button className="arr2-clip-btn" title="Delete clip" onPointerDown={(e) => e.stopPropagation()} onClick={() => onRemoveAudioClip(track.id, c.id)}><X size={10} /></button>
                              </div>
                              <span className="arr2-trim left" title="Trim in" onPointerDown={(e) => beginTrim(e, 'L', 'audio', track.id, c)} />
                              <span className="arr2-trim right" title="Trim out" onPointerDown={(e) => beginTrim(e, 'R', 'audio', track.id, c)} />
                            </div>
                          );
                        })
                      : sorted.map((c, i) => {
                          const w = coverage(c, sorted[i + 1], N);
                          return (
                            <div
                              key={c.id} className={`arr2-clip ${c.loop ? 'loop' : ''} ${track.type}`}
                              style={{ left: `${(c.start / N) * 100}%`, width: `${(w / N) * 100}%` }}
                              onPointerDown={(e) => begin(e, 'move', track.id, c.id, c.start)}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="arr2-clip-name">{c.loop ? 'loop' : `${c.length}`}</span>
                              <div className="arr2-clip-tools">
                                <button className={`arr2-clip-btn ${c.loop ? 'on' : ''}`} title="Loop — keep it going" onPointerDown={(e) => e.stopPropagation()} onClick={() => onToggleLoop(track.id, c.id)}><Repeat size={11} /></button>
                                <button className="arr2-clip-btn" title="Remove" onPointerDown={(e) => e.stopPropagation()} onClick={() => onRemoveClip(track.id, c.id)}><X size={11} /></button>
                              </div>
                              {!c.loop && <span className="arr2-clip-resize" onPointerDown={(e) => begin(e, 'resize', track.id, c.id, c.length)} />}
                            </div>
                          );
                        })}
                    {playheadPct >= 0 && <div className="arr2-ph" style={{ left: `${playheadPct}%` }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
