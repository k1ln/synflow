import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Drum, Music2, Repeat, AudioWaveform, Film } from 'lucide-react';
import { RealtimeClock } from './audio/ClockSource';
import { Transport } from './audio/Transport';
import { Scheduler } from './audio/Scheduler';
import { InstrumentHost } from './audio/InstrumentHost';
import { VoicePool } from './audio/VoicePool';
import { Mixer, FxChain, type ResolvedFx } from './audio/Mixer';
import { AudioAssets } from './audio/AudioAssets';
import { AudioClipPlayer } from './audio/AudioClipPlayer';
import { pickAudioFile } from './audio/decodeAudioFile';
import { pickVideoFile, probeVideo, extractAudioFromVideo } from './audio/video';
import { encodeWav } from './audio/wav';
import { Recorder } from './audio/Recorder';
import { bounceProjectToWav } from './audio/bounce';
import { bounceProjectStream } from './audio/bounceStream';
import { exportVideo, type ExportOpts, type VideoBlobResolver } from './audio/videoExport';
import {
  defaultProject, newNoteId, uid, fxInsert, blankSteps, trackActiveAt, patternLoopLength, songLengthSteps, songLengthSlots, normalizeProject,
  EQ_FX_ID, defaultEq,
  type Project, type Track, type PoolItem, type FxInsert, type AudioAsset, type AudioClip, type VideoAsset, type VideoClip, type SourceLayout, type EqSettings,
} from './model/project';
import { midiToFreq } from './model/pitch';
import { type Flow, makeSynthVoice, makeKick } from './synflow/instruments';
import { makeFilterFx } from './synflow/effects';
import { LIBRARY, findEntry, cloneFlow, registerEntries, type LibraryEntry } from './synflow/library';
import { fsSupported, restoreFolder, seedLibrary, readAllFlows, writeFlow, pickFolder, saveProject, loadProject, listSongs, songSlug, createBounceWritable, createExportWritable, listAllAssets, listAudioFiles, writeVideoFile, readVideoFile } from './synflow/flowStore';
import { ExportDialog } from './ui/ExportDialog';
import { ProgramMonitor } from './ui/ProgramMonitor';
import { loadTitleFonts } from './fonts';
import { TopBar, type ViewId } from './ui/TopBar';
import { Pool } from './ui/Pool';
import { TrackEditor, type TrackEditorHandlers } from './ui/TrackEditor';
import { FxBar } from './ui/FxBar';
import { Arrange } from './ui/Arrange';
import { InstrumentPanel } from './ui/InstrumentPanel';
import { SynflowEditor } from './ui/SynflowEditor';
import { EqEditor } from './ui/EqEditor';
import { StorageSetup } from './ui/StorageSetup';

type ImportInfo = { name: string; phase: 'reading' | 'decoding'; read: number; total: number; startedAt: number };

/** h:mm:ss (drops the hours field below an hour). */
function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

const fmtMB = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

/** Progress overlay shown while importing audio. Hidden for quick imports so it
 *  only appears for the longer files the user is waiting on. */
function ImportOverlay({ info }: { info: ImportInfo }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(id); }, []);
  useEffect(() => { void loadTitleFonts(); }, []); // self-hosted title fonts (canvas needs them ready)
  const elapsed = now - info.startedAt;
  if (elapsed < 300) return null; // short imports: don't flash the bar
  const pct = info.phase === 'reading' && info.total > 0 ? Math.round((info.read / info.total) * 100) : null;
  return (
    <div className="syn-overlay import-overlay">
      <div className="import-card">
        <div className="import-title">Importing audio…</div>
        {info.name && <div className="import-name">{info.name}</div>}
        <div className={`import-bar ${pct == null ? 'indeterminate' : ''}`}>
          <div className="import-bar-fill" style={pct == null ? undefined : { width: `${pct}%` }} />
        </div>
        <div className="import-meta">
          <span>{info.phase === 'reading' ? (pct != null ? `${pct}% · ${fmtMB(info.read)} / ${fmtMB(info.total)}` : 'Reading…') : 'Decoding…'}</span>
          <span>{fmtElapsed(elapsed)} elapsed</span>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [project, setProject] = useState<Project>(() => defaultProject());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [view, setView] = useState<ViewId>('tracks');
  const [browserOpen, setBrowserOpen] = useState(true);
  const [armed, setArmed] = useState(false);
  const [selTrack, setSelTrack] = useState<string>(() => defaultProject().tracks[0]?.id ?? '');
  const [armedPool, setArmedPool] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<{ kind: 'instrument' | 'effect'; id: string } | null>(null);
  const [songMode, setSongMode] = useState(false);
  const songModeRef = useRef(false); songModeRef.current = songMode;
  const [editor, setEditor] = useState<{ flow: Flow; title: string; onSaved: (f: Flow) => void } | null>(null);
  const [eqEditor, setEqEditor] = useState<{ title: string; settings: EqSettings; sampleRate: number; getAnalyser: () => AnalyserNode | null; onChange: (s: EqSettings, commit: boolean) => void } | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[]>(LIBRARY);
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [storageSetup, setStorageSetup] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recTrack, setRecTrack] = useState<string | null>(null); // audio track currently recording
  const [importing, setImporting] = useState<ImportInfo | null>(null); // long audio import progress

  const ctxRef = useRef<AudioContext | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const schedulerRef = useRef<Scheduler | null>(null);
  const hostsRef = useRef<Map<string, InstrumentHost>>(new Map());      // drum uses, keyed by use.id
  const poolsRef = useRef<Map<string, VoicePool>>(new Map());           // synth uses, keyed by use.id
  const liveSynthsRef = useRef<Map<string, VoicePool>>(new Map());      // live synths, keyed by poolId
  const liveDrumsRef = useRef<Map<string, InstrumentHost>>(new Map());  // live drums, keyed by poolId
  const liveGainRef = useRef<Map<string, GainNode>>(new Map());         // live per-instrument gain, keyed by poolId
  const liveFxRef = useRef<Map<string, FxChain>>(new Map());            // live per-instrument FX chain, keyed by poolId
  const mixerRef = useRef<Mixer | null>(null);
  const assetsMgrRef = useRef<AudioAssets | null>(null);                // audio asset cache (disk/embedded)
  const audioPlayersRef = useRef<Map<string, AudioClipPlayer>>(new Map()); // audio-track clip players, keyed by track.id
  const videoBlobsRef = useRef<Map<string, Blob>>(new Map());           // videoAssetId → container Blob (session cache for poster/export)
  const videoUrlsRef = useRef<Map<string, string>>(new Map());          // videoAssetId → object URL (program-monitor preview)
  const projectRef = useRef(project); projectRef.current = project;
  const currentStepRef = useRef(currentStep); currentStepRef.current = currentStep;
  const seekRef = useRef(0);                                            // step playback starts from / playhead rests at
  const recorderRef = useRef<Recorder | null>(null);
  const folderRef = useRef<FileSystemDirectoryHandle | null>(null); folderRef.current = folder;

  // Built-in graphical EQ first, then the Synflow effects from the library.
  const effects: LibraryEntry[] = [{ id: EQ_FX_ID, name: 'Equalizer', category: 'Built-in', group: 'effect', flow: { nodes: [], edges: [] } as any }, ...library.filter((e) => e.group === 'effect')];
  const selectedTrack = project.tracks.find((t) => t.id === selTrack) ?? project.tracks[0];

  // Keep findEntry's catalog in sync so flows added at runtime (folder-loaded or
  // newly created in Synflow) resolve their name/flow when added to an FX chain.
  useEffect(() => registerEntries(library), [library]);

  // ─── flow folder (File System Access) ──────────────────────────────────────
  const adoptFolder = useCallback(async (handle: FileSystemDirectoryHandle, intoPool = false) => {
    try {
      await seedLibrary(handle);
      const entries = await readAllFlows(handle);
      setLibrary(entries.length ? entries : LIBRARY);
      setFolder(handle);
      if (intoPool) {
        setProject((p) => {
          const have = new Set(p.pool.map((pi) => pi.libId ?? pi.id));
          const add: PoolItem[] = entries
            .filter((e) => e.group === 'instrument' && !have.has(e.id))
            .map((e) => ({ id: uid('pool'), name: e.name, libId: e.id, kind: e.kind === 'piano' ? 'synth' : 'drum', flow: cloneFlow(e.flow) }));
          return add.length ? { ...p, pool: [...p.pool, ...add] } : p;
        });
      }
    } catch (e) { console.warn('[Mothscilla] flow folder load failed', e); }
    setStorageSetup(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const handle = await restoreFolder();
      if (cancelled) return;
      if (handle) {
        await adoptFolder(handle);
        const last = localStorage.getItem('mothscilla:lastSong');
        if (last) { const raw = await loadProject(handle, last); if (raw && !cancelled) { const proj = normalizeProject(raw); setProject(proj); setSelTrack(proj.tracks[0]?.id ?? ''); } }
      } else if (fsSupported) {
        setStorageSetup(true);
      } else {
        const local = localStorage.getItem('mothscilla:localSong');
        if (local) { try { const proj = normalizeProject(JSON.parse(local)); if (!cancelled) { setProject(proj); setSelTrack(proj.tracks[0]?.id ?? ''); } } catch { /* ignore */ } }
      }
    })();
    return () => { cancelled = true; };
  }, [adoptFolder]);

  const addFromFolder = useCallback(async () => {
    const h = await pickFolder().catch(() => null);
    if (h) await adoptFolder(h, true);
  }, [adoptFolder]);

  // Return a copy of a flow with node.data[param] set (knob value lives in the flow).
  const setFlowParam = (flow: Flow, nodeId: string, param: string, value: number): Flow =>
    ({ ...flow, nodes: flow.nodes.map((n: any) => (n.id === nodeId ? { ...n, data: { ...n.data, [param]: value } } : n)) });

  // Return a copy of a flow with an exposed knob's label renamed (lives in node.data.knobs).
  const setFlowKnobLabel = (flow: Flow, nodeId: string, param: string, label: string): Flow =>
    ({ ...flow, nodes: flow.nodes.map((n: any) => (n.id === nodeId && Array.isArray(n.data?.knobs)
      ? { ...n, data: { ...n.data, knobs: n.data.knobs.map((k: any) => (k.param === param ? { ...k, label } : k)) } }
      : n)) });

  // Debounced disk write (knob drags fire continuously). Keyed by group:id.
  const persistTimers = useRef<Map<string, number>>(new Map());
  const persistDebounced = (key: string, meta: { group: 'instrument' | 'effect'; id: string; name: string; category: string; kind?: string; flow: Flow }) => {
    const root = folderRef.current; if (!root) return;
    const prev = persistTimers.current.get(key); if (prev) window.clearTimeout(prev);
    persistTimers.current.set(key, window.setTimeout(() => {
      writeFlow(root, meta).catch((e) => console.warn('[Mothscilla] save to disk failed', e));
    }, 500));
  };

  const persistFx = useCallback((insert: FxInsert, flow: Flow) => {
    const root = folderRef.current; if (!root) { console.info('[Mothscilla] no folder set — edit kept in project only'); return; }
    const def = findEntry(insert.fxId);
    writeFlow(root, { group: 'effect', id: insert.fxId, name: insert.name, category: def?.category ?? 'Effects', flow }).catch((e) => console.warn('[Mothscilla] save effect failed', e));
  }, []);
  // ─── audio build (3-level FX) ──────────────────────────────────────────────
  const resolveFx = (inserts: FxInsert[]): ResolvedFx[] =>
    inserts
      .map((ins): ResolvedFx | null => {
        if (ins.eq) return { name: ins.name, eq: ins.eq };               // native graphical EQ
        const flow = ins.flow ?? findEntry(ins.fxId)?.flow;
        return flow ? { name: ins.name, flow: cloneFlow(flow) } : null;  // synflow effect
      })
      .filter((x): x is ResolvedFx => !!x);

  const buildUse = useCallback(async (useId: string, pool: PoolItem, dest: AudioNode, voices?: number) => {
    const ctx = ctxRef.current!;
    if (pool.kind === 'synth') {
      if (!poolsRef.current.has(useId)) poolsRef.current.set(useId, await VoicePool.create(() => new InstrumentHost(ctx, pool.flow, dest), voices ?? 6));
    } else if (!hostsRef.current.has(useId)) {
      const host = new InstrumentHost(ctx, pool.flow, dest); await host.load();
      hostsRef.current.set(useId, host);
    }
    mixerRef.current?.setUseGain(useId, pool.gain ?? 1); // instrument gain
  }, []);

  // Lazily create the audio-asset cache and keep its folder current.
  const ensureAssets = useCallback((): AudioAssets => {
    if (!assetsMgrRef.current) assetsMgrRef.current = new AudioAssets();
    assetsMgrRef.current.setFolder(folderRef.current);
    return assetsMgrRef.current;
  }, []);

  const buildAudio = useCallback(async () => {
    const mixer = mixerRef.current; if (!mixer || !ctxRef.current) return;
    const proj = projectRef.current;
    await mixer.masterChain.setChain(resolveFx(proj.masterFx));
    for (const track of proj.tracks) {
      const t = mixer.track(track.id, track.volume);
      await t.chain.setChain(resolveFx(track.fx));
      if (track.type === 'audio') {
        let player = audioPlayersRef.current.get(track.id);
        if (!player) { player = new AudioClipPlayer(ctxRef.current!, ensureAssets(), t.sum); audioPlayersRef.current.set(track.id, player); }
        await player.preload(track.audioClips ?? [], (id) => proj.assets.find((a) => a.id === id));
        continue; // audio tracks have no instrument uses
      }
      for (const use of track.uses) {
        const dest = mixer.use(use.id, track.id);
        const pool = proj.pool.find((p) => p.id === use.poolId);
        await mixer.usePoolChain(use.id)!.setChain(resolveFx(pool?.fx ?? [])); // instrument-general FX
        await mixer.useChain(use.id)!.setChain(resolveFx(use.fx));             // instrument-in-track FX
        if (pool) await buildUse(use.id, pool, dest, use.voices);
      }
    }
  }, [buildUse, ensureAssets]);

  const ensureAudio = useCallback(async () => {
    if (ctxRef.current) return;
    const ctx = new AudioContext(); ctxRef.current = ctx;
    mixerRef.current = new Mixer(ctx);
    const clock = new RealtimeClock(ctx);
    const transport = new Transport(clock);
    transport.stepsPerBeat = projectRef.current.stepsPerBeat;
    transportRef.current = transport;
    await buildAudio();
    const scheduler = new Scheduler(clock, transport, (s, time) => {
      const proj = projectRef.current;
      const song = songModeRef.current;
      const slot = song ? Math.floor(s / proj.totalSteps) : 0;
      const lead = Math.max(0, (time - clock.currentTime) * 1000);
      const stepMs = transport.secondsPerStep * 1000;
      const gateMs = Math.min(transport.secondsPerStep * 0.9, 0.5) * 1000;
      for (const track of proj.tracks) {
        if (track.muted) continue;     // arrangement mute (scheduler reads it live)
        // Audio tracks live on the song timeline: trigger clips whose start falls in
        // this absolute step (with a sub-step delay for the fractional part).
        if (track.type === 'audio') {
          if (!song) continue;
          const player = audioPlayersRef.current.get(track.id); if (!player) continue;
          for (const c of track.audioClips ?? []) {
            if (Math.floor(c.start) !== s) continue;
            const asset = proj.assets.find((a) => a.id === c.assetId); if (!asset) continue;
            const sub = (c.start - s) * stepMs;
            player.schedule(c, asset, time + sub / 1000, lead + sub);
          }
          continue;
        }
        // Pattern/live: only ACTIVE (looped) tracks play (click loop to bring in/out).
        // Song: the track's CLIPS decide (loop is the live toggle, not the arrangement).
        if (song ? !trackActiveAt(track.clips, slot, songLengthSlots(proj)) : !track.loop) continue;
        const step = s % Math.max(1, track.length);    // each track loops at its own length
        for (const use of track.uses) {
          if (use.muted) continue;
          if (track.type === 'synth' && use.notes) {
            const vp = poolsRef.current.get(use.id); if (!vp) continue;
            for (const n of use.notes) {
              // free placement: trigger the note in the step it starts in, with a
              // sub-step delay for the fractional part.
              if (Math.floor(n.start) !== step) continue;
              const sub = (n.start - step) * stepMs;        // ms into this step
              const f = midiToFreq(n.midi);
              window.setTimeout(() => vp.noteOn(n.id, f), lead + sub);
              window.setTimeout(() => vp.noteOff(n.id), lead + sub + n.length * stepMs);
            }
          } else if (track.type === 'drums' && use.steps?.[step]) {
            const host = hostsRef.current.get(use.id); if (!host) continue;
            window.setTimeout(() => host.trigger(), lead);
            window.setTimeout(() => host.release(), lead + gateMs);
          }
        }
      }
      window.setTimeout(() => setCurrentStep(s), lead);
    });
    scheduler.totalSteps = patternLoopLength(projectRef.current.tracks);
    schedulerRef.current = scheduler;
  }, [buildAudio]);

  // ─── audition: hear a recorded asset / clip on demand (clip play, browser preview) ──
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const auditionRef = useRef<{ src: AudioBufferSourceNode; gain: GainNode; key: string } | null>(null);
  const stopAudition = useCallback(() => {
    const a = auditionRef.current;
    if (a) {
      try { a.src.onended = null; a.src.stop(); } catch { /* already stopped */ }
      try { a.src.disconnect(); a.gain.disconnect(); } catch { /* noop */ }
    }
    auditionRef.current = null;
    setPreviewKey(null);
  }, []);
  // `key` lets the UI show play/stop per clip (clip id) or per recording ('asset:'+id);
  // clicking the same thing again stops it. Routed through the master bus.
  const auditionAudio = useCallback(async (key: string, assetId: string, opts?: { offset?: number; duration?: number; gain?: number }) => {
    if (auditionRef.current?.key === key) { stopAudition(); return; }
    await ensureAudio(); await ctxRef.current?.resume();
    const ctx = ctxRef.current; const mixer = mixerRef.current; if (!ctx || !mixer) return;
    const asset = projectRef.current.assets.find((a) => a.id === assetId); if (!asset) return;
    const buffer = await ensureAssets().resolveBuffer(asset); if (!buffer) return;
    stopAudition();
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const gain = ctx.createGain(); gain.gain.value = opts?.gain ?? 1;
    src.connect(gain).connect(mixer.masterSum);
    src.start(0, Math.max(0, opts?.offset ?? 0), opts?.duration && opts.duration > 0 ? opts.duration : undefined);
    src.onended = () => { if (auditionRef.current?.src === src) stopAudition(); };
    auditionRef.current = { src, gain, key };
    setPreviewKey(key);
  }, [ensureAudio, ensureAssets, stopAudition]);
  const auditionClip = useCallback((clip: AudioClip) => auditionAudio(clip.id, clip.assetId, { offset: clip.offset, duration: clip.duration, gain: clip.gain }), [auditionAudio]);
  const auditionAsset = useCallback((assetId: string) => auditionAudio('asset:' + assetId, assetId), [auditionAudio]);

  // Start any audio clip that the playhead lands *inside* (the per-step scheduler
  // only fires a clip at its start, so playing/seeking mid-clip would stay silent).
  const primeAudioClips = (fromStep: number) => {
    const ctx = ctxRef.current; const tr = transportRef.current;
    if (!ctx || !tr || !songModeRef.current) return;
    const proj = projectRef.current;
    const spp = tr.secondsPerStep;
    const lead = 0.06;                         // small lead-in so it starts cleanly
    const when = ctx.currentTime + lead;
    for (const track of proj.tracks) {
      if (track.type !== 'audio' || track.muted) continue;
      const player = audioPlayersRef.current.get(track.id); if (!player) continue;
      for (const c of track.audioClips ?? []) {
        const endStep = c.start + c.duration / spp;
        if (fromStep <= c.start || fromStep >= endStep) continue;   // not inside this clip
        const into = (fromStep - c.start) * spp;                    // seconds into the clip
        const asset = proj.assets.find((a) => a.id === c.assetId); if (!asset) continue;
        player.schedule({ ...c, offset: c.offset + into, duration: c.duration - into }, asset, when, lead * 1000);
      }
    }
  };

  const play = useCallback(async () => {
    await ensureAudio();
    await ctxRef.current!.resume();
    transportRef.current!.bpm = projectRef.current.bpm;
    const proj = projectRef.current;
    schedulerRef.current!.totalSteps = songModeRef.current ? songLengthSteps(proj) : patternLoopLength(proj.tracks);
    transportRef.current!.start(seekRef.current); schedulerRef.current!.start(seekRef.current);
    primeAudioClips(seekRef.current);
    setIsPlaying(true);
  }, [ensureAudio]);

  // Keep the loop length in sync as content changes (e.g. a long import grows the
  // song) so the full clip plays without re-pressing play.
  useEffect(() => {
    const s = schedulerRef.current; if (!s) return;
    s.totalSteps = songMode ? songLengthSteps(project) : patternLoopLength(project.tracks);
  }, [project, songMode]);

  // Opening the Song view plays the arrangement: audio tracks only sound in Song
  // mode, and Pattern mode loops a single bar. (You can still flip to Pattern here.)
  useEffect(() => { if (view === 'song') setSongMode(true); }, [view]);

  // Move the playhead (and where playback begins) to an absolute step; live-seeks if playing.
  const seekTo = (step: number) => {
    const total = songModeRef.current ? songLengthSteps(projectRef.current) : patternLoopLength(projectRef.current.tracks);
    const s = Math.max(0, Math.min(Math.max(1, total) - 1, Math.round(step)));
    seekRef.current = s;
    setCurrentStep(s);
    if (isPlaying) {
      schedulerRef.current?.seek(s);
      for (const p of audioPlayersRef.current.values()) p.stopAll(); // drop clips from the old position
      primeAudioClips(s);                                            // and start whatever the new spot is inside
    }
  };

  const stop = useCallback(() => {
    schedulerRef.current?.stop(); transportRef.current?.stop();
    for (const vp of poolsRef.current.values()) vp.allOff();
    for (const p of audioPlayersRef.current.values()) p.stopAll();
    stopAudition();
    setIsPlaying(false); setCurrentStep(seekRef.current);   // return playhead to the seek point
  }, [stopAudition]);

  const setBpm = (bpm: number) => { setProject((p) => ({ ...p, bpm })); if (transportRef.current) transportRef.current.bpm = bpm; };

  // ─── song save / load (the whole project) ──────────────────────────────────
  const flashSaved = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1600); };

  const saveSong = useCallback(async () => {
    const root = folderRef.current;
    if (root) {
      try {
        await ensureAssets().persistDisk(projectRef.current.assets); // large audio stays on disk (streamed)
        const file = await saveProject(root, projectRef.current); localStorage.setItem('mothscilla:lastSong', file); flashSaved(); console.info('[Mothscilla] saved song to disk:', file);
      }
      catch (e) { console.warn('[Mothscilla] save song failed', e); }
    } else {
      try { localStorage.setItem('mothscilla:localSong', JSON.stringify(projectRef.current)); flashSaved(); console.info('[Mothscilla] no folder — saved song to localStorage'); } catch (e) { console.warn('[Mothscilla] save song failed', e); }
    }
  }, [ensureAssets]);

  // Export a portable song: embed every audio asset as base64 and download it.
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportSong = useCallback(async () => {
    setExporting(true); setExportProgress(0);
    try {
      const proj = projectRef.current;
      const { assets, skipped } = await ensureAssets().embedAll(proj.assets, setExportProgress);
      const blob = new Blob([JSON.stringify({ ...proj, assets })], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${songSlug(proj.name)}.json`; a.click();
      URL.revokeObjectURL(url);
      flashSaved();
      if (skipped.length) window.alert(`Exported, but ${skipped.length} large audio file(s) couldn't be embedded (too big for a portable JSON):\n\n• ${skipped.join('\n• ')}\n\nThey stay as disk references. To share the audio, send the project folder or use Bounce.`);
    } catch (e) { console.warn('[Mothscilla] export failed', e); window.alert('Export failed — see the console. Large audio can\'t be embedded; share the project folder or Bounce instead.'); }
    finally { setExporting(false); }
  }, [ensureAssets]);

  // ── Detailed export popup (audio / video / both, via WebCodecs) ──────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPhase, setExportPhase] = useState('');
  const runExport = useCallback(async (opts: ExportOpts) => {
    setExporting(true); setExportProgress(0); setExportPhase('');
    try {
      const proj = projectRef.current;
      // Resolve a video asset's bytes: session cache first, then disk.
      const getVideoBlob: VideoBlobResolver = async (assetId) => {
        const cached = videoBlobsRef.current.get(assetId); if (cached) return cached;
        const va = (proj.videoAssets ?? []).find((a) => a.id === assetId);
        if (va?.source.kind === 'disk' && folderRef.current) {
          const blob = await readVideoFile(folderRef.current, va.source.fileName);
          if (blob) videoBlobsRef.current.set(assetId, blob);
          return blob;
        }
        return null;
      };
      const { blob, ext } = await exportVideo(proj, ensureAssets(), opts, getVideoBlob, (f, phase) => { setExportProgress(f); setExportPhase(phase); });
      const file = `${songSlug(proj.name)}.${ext}`;
      if (folderRef.current) {
        const w = await createExportWritable(folderRef.current, file);
        try { await w.write(blob); } finally { await w.close(); }
        console.info('[Mothscilla] exported to exports/' + file);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = file; a.click();
        URL.revokeObjectURL(url);
      }
      flashSaved();
      setExportOpen(false);
    } catch (e) { console.warn('[Mothscilla] export failed', e); window.alert('Export failed: ' + ((e as Error)?.message ?? e)); }
    finally { setExporting(false); setExportPhase(''); }
  }, [ensureAssets]);

  // ── Program monitor (live video preview synced to the playhead) ──────────────
  const [monitorOpen, setMonitorOpen] = useState(true);
  const [videoBlobTick, setVideoBlobTick] = useState(0); // bump to re-render when a disk video finishes loading
  // Object URL for a video asset's bytes (session blob), created on demand + cached.
  const getVideoUrl = useCallback((assetId: string): string | null => {
    const cached = videoUrlsRef.current.get(assetId); if (cached) return cached;
    const blob = videoBlobsRef.current.get(assetId); if (!blob) return null;
    const url = URL.createObjectURL(blob); videoUrlsRef.current.set(assetId, url); return url;
  }, []);
  // Load disk-backed video bytes into the session cache (so a reopened project
  // previews/exports its video). Re-renders via the tick when each one lands.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const va of projectRef.current.videoAssets ?? []) {
        if (videoBlobsRef.current.has(va.id)) continue;
        if (va.source.kind === 'disk' && folderRef.current) {
          const blob = await readVideoFile(folderRef.current, va.source.fileName);
          if (blob && !cancelled) { videoBlobsRef.current.set(va.id, blob); setVideoBlobTick((n) => n + 1); }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [project.videoAssets]);
  void videoBlobTick; // referenced so the monitor re-renders when blobs load

  // Bounce the song to a WAV faster than realtime (OfflineAudioContext).
  const [bouncing, setBouncing] = useState(false);
  const [bounceProgress, setBounceProgress] = useState(0);
  const bounceSong = useCallback(async () => {
    setBouncing(true); setBounceProgress(0);
    try {
      const proj = projectRef.current;
      const file = `${songSlug(proj.name)}.wav`;
      if (folderRef.current) {
        // Streaming, low-RAM, FX-aware mixdown straight to <folder>/bounces/.
        const writable = await createBounceWritable(folderRef.current, file);
        try {
          await bounceProjectStream(proj, ensureAssets(), writable, { onProgress: setBounceProgress });
        } finally { await writable.close(); }
        console.info(`[Mothscilla] bounced song to bounces/${file}`);
      } else {
        // No project folder: small in-memory bounce + download.
        const wav = await bounceProjectToWav(proj, ensureAssets());
        const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
        const a = document.createElement('a'); a.href = url; a.download = file; a.click();
        URL.revokeObjectURL(url);
        console.info('[Mothscilla] bounced song to WAV (download)');
      }
    } catch (e) { console.warn('[Mothscilla] bounce failed', e); }
    finally { setBouncing(false); }
  }, [ensureAssets]);

  // Tear down all audio so it rebuilds from a freshly loaded project.
  const resetAudio = useCallback(() => {
    schedulerRef.current?.stop(); transportRef.current?.stop();
    for (const h of hostsRef.current.values()) h.dispose(); hostsRef.current.clear();
    for (const p of poolsRef.current.values()) p.dispose(); poolsRef.current.clear();
    for (const p of liveSynthsRef.current.values()) p.dispose(); liveSynthsRef.current.clear();
    for (const h of liveDrumsRef.current.values()) h.dispose(); liveDrumsRef.current.clear();
    liveGainRef.current.clear();
    for (const c of liveFxRef.current.values()) c.dispose(); liveFxRef.current.clear();
    for (const p of audioPlayersRef.current.values()) p.dispose(); audioPlayersRef.current.clear();
    assetsMgrRef.current?.dispose(); assetsMgrRef.current = null;
    try { void ctxRef.current?.close(); } catch { /* noop */ }
    ctxRef.current = null; mixerRef.current = null; schedulerRef.current = null; transportRef.current = null;
    setIsPlaying(false); setCurrentStep(-1);
  }, []);

  const loadProjectState = useCallback((raw: Project) => {
    resetAudio();
    const proj = normalizeProject(raw);
    setProject(proj);
    setSelTrack(proj.tracks[0]?.id ?? '');
    setOpenItem(null); setEditor(null);
  }, [resetAudio]);

  // Open a song by picking its .json from the songs folder (native file picker).
  const openSong = useCallback(async () => {
    const root = folderRef.current;
    try {
      let startIn: any;
      try { startIn = root ? await root.getDirectoryHandle('songs', { create: true }) : undefined; } catch { /* no songs dir yet */ }
      const picker = (window as any).showOpenFilePicker;
      if (!picker) { console.warn('[Mothscilla] file picker not supported in this browser'); return; }
      const [handle] = await picker({ startIn, multiple: false, types: [{ description: 'Mothscilla song', accept: { 'application/json': ['.json'] } }] });
      if (!handle) return;
      const proj = JSON.parse(await (await handle.getFile()).text());
      loadProjectState(proj);
      localStorage.setItem('mothscilla:lastSong', handle.name);
    } catch (e: any) { if (e?.name !== 'AbortError') console.warn('[Mothscilla] open song failed', e); }
  }, [loadProjectState]);

  // Start a brand-new song: a fresh default project (unique name so it doesn't
  // clobber an existing file) loaded into the editor and written to disk at once,
  // so it persists alongside the others and Save targets it from here on.
  const newSong = useCallback(async () => {
    const root = folderRef.current;
    let name = 'New Song';
    if (root) {
      try {
        const taken = new Set((await listSongs(root)).map((s) => songSlug(s.name)));
        if (taken.has(songSlug(name))) { let n = 2; while (taken.has(songSlug(`New Song ${n}`))) n++; name = `New Song ${n}`; }
      } catch { /* fall back to plain "New Song" */ }
    }
    const proj: Project = { ...defaultProject(), name };
    loadProjectState(proj);
    if (root) {
      try { const file = await saveProject(root, proj); localStorage.setItem('mothscilla:lastSong', file); flashSaved(); console.info('[Mothscilla] created new song on disk:', file); }
      catch (e) { console.warn('[Mothscilla] new song save failed', e); }
    } else {
      try { localStorage.setItem('mothscilla:localSong', JSON.stringify(proj)); flashSaved(); } catch { /* ignore */ }
    }
  }, [loadProjectState]);

  // ─── audition (click feedback) + live performance ──────────────────────────
  const audition = useCallback(async (useId: string, payload?: { frequency: number }) => {
    await ensureAudio(); await ctxRef.current?.resume();
    if (!hostsRef.current.has(useId) && !poolsRef.current.has(useId)) await buildAudio();
    const vp = poolsRef.current.get(useId);
    if (vp) { const id = -Math.floor(performance.now()); vp.noteOn(id, payload?.frequency ?? 440); window.setTimeout(() => vp.noteOff(id), 350); return; }
    const host = hostsRef.current.get(useId);
    if (host) { host.trigger(); window.setTimeout(() => host.release(), 220); }
  }, [ensureAudio, buildAudio]);

  // Piano-roll key gutter: hold a note (ADSR on at mouse-down, release at mouse-up)
  // through the use's own voice pool. midi doubles as the voice id (no clash with
  // scheduled notes, whose ids are >1000).
  const useNoteOn = useCallback(async (useId: string, midi: number) => {
    await ensureAudio(); await ctxRef.current?.resume();
    if (!poolsRef.current.has(useId)) await buildAudio();
    poolsRef.current.get(useId)?.noteOn(midi, midiToFreq(midi));
  }, [ensureAudio, buildAudio]);
  const useNoteOff = useCallback((useId: string, midi: number) => { poolsRef.current.get(useId)?.noteOff(midi); }, []);

  // Live path: instrument → liveFx (the instrument's general FX) → liveGain → master.
  // Returns the node the live engine connects to.
  const liveDest = (poolId: string): AudioNode => {
    const ctx = ctxRef.current!; const mixer = mixerRef.current!;
    let g = liveGainRef.current.get(poolId);
    if (!g) { g = ctx.createGain(); g.gain.value = projectRef.current.pool.find((p) => p.id === poolId)?.gain ?? 1; g.connect(mixer.masterSum); liveGainRef.current.set(poolId, g); }
    let fx = liveFxRef.current.get(poolId);
    if (!fx) { fx = new FxChain(ctx); fx.output.connect(g); liveFxRef.current.set(poolId, fx); }
    return fx.input;
  };
  const buildLive = useCallback(async (poolId: string) => {
    await ensureAudio(); await ctxRef.current?.resume();
    const ctx = ctxRef.current!;
    const pool = projectRef.current.pool.find((p) => p.id === poolId); if (!pool) return;
    const dest = liveDest(poolId);
    await liveFxRef.current.get(poolId)!.setChain(resolveFx(pool.fx ?? []));
    if (pool.kind === 'synth') {
      if (!liveSynthsRef.current.has(poolId)) liveSynthsRef.current.set(poolId, await VoicePool.create(() => new InstrumentHost(ctx, pool.flow, dest), 8));
    } else if (!liveDrumsRef.current.has(poolId)) {
      const h = new InstrumentHost(ctx, pool.flow, dest); await h.load();
      liveDrumsRef.current.set(poolId, h);
    }
  }, [ensureAudio]);

  const liveNoteOn = useCallback(async (poolId: string, midi: number) => { await buildLive(poolId); liveSynthsRef.current.get(poolId)?.noteOn(midi, midiToFreq(midi)); }, [buildLive]);
  const liveNoteOff = useCallback((poolId: string, midi: number) => { liveSynthsRef.current.get(poolId)?.noteOff(midi); }, []);
  const liveDrumDown = useCallback(async (poolId: string) => { await buildLive(poolId); const h = liveDrumsRef.current.get(poolId); h?.trigger(); window.setTimeout(() => h?.release(), 220); }, [buildLive]);

  // Clicking a pool item goes to the Live tab, which shows that item's view.
  const openInstrument = (poolId: string) => {
    setArmedPool(poolId);
    setOpenItem({ kind: 'instrument', id: poolId });
    setView('live');
    void buildLive(poolId);
  };
  const openEffectPage = (effectId: string) => { setOpenItem({ kind: 'effect', id: effectId }); setView('live'); };
  // Tweak an effect's exposed knob: update the library default + persist (future inserts use it).
  const onEffectKnob = (effectId: string, nodeId: string, param: string, value: number) => {
    const e = library.find((x) => x.id === effectId && x.group === 'effect'); if (!e) return;
    const flow = setFlowParam(e.flow, nodeId, param, value);
    setLibrary((lib) => lib.map((x) => (x.id === effectId && x.group === 'effect' ? { ...x, flow } : x)));
    persistDebounced(`effect:${effectId}`, { group: 'effect', id: effectId, name: e.name, category: e.category, flow });
  };

  const mapPool = (poolId: string, fn: (p: PoolItem) => PoolItem) =>
    setProject((p) => ({ ...p, pool: p.pool.map((pi) => (pi.id === poolId ? fn(pi) : pi)) }));
  const usesOfPool = (poolId: string) => projectRef.current.tracks.flatMap((t) => t.uses).filter((u) => u.poolId === poolId);
  const poolById = (poolId: string) => projectRef.current.pool.find((p) => p.id === poolId);

  // Instrument-general FX (added from the live page): heard live + in every track.
  const rebuildPoolFx = (poolId: string, fx: FxInsert[]) => {
    for (const u of usesOfPool(poolId)) void mixerRef.current?.usePoolChain(u.id)?.setChain(resolveFx(fx));
    void liveFxRef.current.get(poolId)?.setChain(resolveFx(fx));
  };
  const onPoolFxAdd = (poolId: string, fxId: string) => { const next = [...(poolById(poolId)?.fx ?? []), fxInsert(fxId)]; mapPool(poolId, (pi) => ({ ...pi, fx: next })); rebuildPoolFx(poolId, next); };
  const onPoolFxRemove = (poolId: string, i: number) => { const next = (poolById(poolId)?.fx ?? []).filter((_, j) => j !== i); mapPool(poolId, (pi) => ({ ...pi, fx: next })); rebuildPoolFx(poolId, next); };
  const onPoolFxEdit = (poolId: string, i: number) => {
    const insert = poolById(poolId)?.fx?.[i]; if (!insert) return;
    if (insert.fxId === EQ_FX_ID) {
      const poolChains = () => [...usesOfPool(poolId).map((u) => mixerRef.current?.usePoolChain(u.id)), liveFxRef.current.get(poolId)];
      openEqEditor(poolById(poolId)?.name ?? 'Instrument', insert,
        () => liveFxRef.current.get(poolId)?.getEqAnalyser(i) ?? (usesOfPool(poolId)[0] ? mixerRef.current?.usePoolChain(usesOfPool(poolId)[0].id)?.getEqAnalyser(i) ?? null : null),
        (eq) => poolChains().forEach((c) => c?.updateEq(i, eq)),
        (eq) => mapPool(poolId, (pi) => ({ ...pi, fx: (pi.fx ?? []).map((x, j) => (j === i ? { ...x, eq } : x)) })));
      return;
    }
    editFxFlow(insert, (f) => { const next = (poolById(poolId)?.fx ?? []).map((x, j) => (j === i ? { ...x, flow: f } : x)); mapPool(poolId, (pi) => ({ ...pi, fx: next })); rebuildPoolFx(poolId, next); });
  };
  const onPoolFxKnob = (poolId: string, i: number, nodeId: string, param: string, value: number) => {
    for (const u of usesOfPool(poolId)) mixerRef.current?.usePoolChain(u.id)?.setParam(i, nodeId, param, value);
    liveFxRef.current.get(poolId)?.setParam(i, nodeId, param, value);
    const insert = poolById(poolId)?.fx?.[i]; const base = insert?.flow ?? (insert && findEntry(insert.fxId)?.flow); if (!insert || !base) return;
    const flow = setFlowParam(base, nodeId, param, value);
    mapPool(poolId, (pi) => ({ ...pi, fx: (pi.fx ?? []).map((x, j) => (j === i ? { ...x, flow } : x)) }));
  };

  // Tweak an exposed knob: drive every live + per-track engine of this instrument,
  // and update the flow default so it sticks (and saves on Edit-in-Synflow).
  const onInstrumentKnob = (poolId: string, nodeId: string, param: string, value: number) => {
    liveSynthsRef.current.get(poolId)?.setParam(nodeId, param, value);
    liveDrumsRef.current.get(poolId)?.setParam(nodeId, param, value);
    for (const u of usesOfPool(poolId)) { hostsRef.current.get(u.id)?.setParam(nodeId, param, value); poolsRef.current.get(u.id)?.setParam(nodeId, param, value); }
    const pool = projectRef.current.pool.find((p) => p.id === poolId); if (!pool) return;
    const flow = setFlowParam(pool.flow, nodeId, param, value);
    mapPool(poolId, (pi) => ({ ...pi, flow }));            // value sticks on reopen
    persistDebounced(`instrument:${pool.libId ?? pool.id}`, { group: 'instrument', id: pool.libId ?? pool.id, name: pool.name, category: pool.kind === 'synth' ? 'Synths' : 'Drums', kind: pool.kind === 'synth' ? 'piano' : 'step', flow });
  };

  // Rename an exposed knob's label; persists to the flow so it sticks on reopen/save.
  const onInstrumentKnobRename = (poolId: string, nodeId: string, param: string, label: string) => {
    const pool = projectRef.current.pool.find((p) => p.id === poolId); if (!pool) return;
    const flow = setFlowKnobLabel(pool.flow, nodeId, param, label);
    mapPool(poolId, (pi) => ({ ...pi, flow }));
    persistDebounced(`instrument:${pool.libId ?? pool.id}`, { group: 'instrument', id: pool.libId ?? pool.id, name: pool.name, category: pool.kind === 'synth' ? 'Synths' : 'Drums', kind: pool.kind === 'synth' ? 'piano' : 'step', flow });
  };

  const onInstrumentGain = (poolId: string, v: number) => {
    mapPool(poolId, (pi) => ({ ...pi, gain: v }));
    for (const u of usesOfPool(poolId)) mixerRef.current?.setUseGain(u.id, v);
    const g = liveGainRef.current.get(poolId); if (g) g.gain.value = v;
  };

  // Open an instrument flow in Synflow → on save replace the pool flow + rebuild engines + persist.
  const openInstrumentEditor = (pool: PoolItem) => {
    setEditor({ flow: pool.flow, title: pool.name, onSaved: (f) => {
      mapPool(pool.id, (pi) => ({ ...pi, flow: f }));
      for (const u of usesOfPool(pool.id)) {
        const t = trackOfUse(u.id); const strip = t ? mixerRef.current?.use(u.id, t.id) : undefined;
        hostsRef.current.get(u.id)?.dispose(); hostsRef.current.delete(u.id);
        poolsRef.current.get(u.id)?.dispose(); poolsRef.current.delete(u.id);
        if (strip) void buildUse(u.id, { ...pool, flow: f }, strip, u.voices);
      }
      liveSynthsRef.current.get(pool.id)?.dispose(); liveSynthsRef.current.delete(pool.id);
      liveDrumsRef.current.get(pool.id)?.dispose(); liveDrumsRef.current.delete(pool.id);
      const root = folderRef.current;
      if (root) writeFlow(root, { group: 'instrument', id: pool.libId ?? pool.id, name: pool.name, category: pool.kind === 'synth' ? 'Synths' : 'Drums', kind: pool.kind === 'synth' ? 'piano' : 'step', flow: f }).then(() => console.info('[Mothscilla] saved instrument to disk')).catch((e) => console.warn('[Mothscilla] save instrument failed', e));
      else console.info('[Mothscilla] no folder set — instrument edit kept in project only');
    } });
  };
  const editInstrument = (poolId: string) => {
    const pool = projectRef.current.pool.find((p) => p.id === poolId); if (pool) openInstrumentEditor(pool);
  };

  // Open an effect flow in Synflow → on save update the library entry + persist (future inserts use it).
  const openEffectEditor = (e: LibraryEntry) => {
    setEditor({ flow: e.flow, title: e.name, onSaved: (f) => {
      setLibrary((lib) => lib.map((x) => (x.id === e.id && x.group === 'effect' ? { ...x, flow: f } : x)));
      const root = folderRef.current;
      if (root) writeFlow(root, { group: 'effect', id: e.id, name: e.name, category: e.category, flow: f }).then(() => console.info('[Mothscilla] saved effect to disk')).catch((er) => console.warn('[Mothscilla] save effect failed', er));
      else console.info('[Mothscilla] no folder set — effect edit kept in project only');
    } });
  };
  const editEffect = (effectId: string) => {
    const e = library.find((x) => x.id === effectId && x.group === 'effect'); if (e) openEffectEditor(e);
  };

  // Add an EXISTING library instrument/drum to the project pool (a copy of its flow,
  // tracking libId so edits save back to the same file). Already on disk → no write.
  const addInstrumentToPool = (entry: LibraryEntry) => {
    const kind: 'synth' | 'drum' = entry.kind === 'piano' ? 'synth' : entry.kind === 'step' ? 'drum' : entry.category === 'Drums' ? 'drum' : 'synth';
    const item: PoolItem = { id: uid('pool'), name: entry.name, libId: entry.id, kind, flow: cloneFlow(entry.flow) };
    setProject((p) => ({ ...p, pool: [...p.pool, item] }));
  };

  // Create a brand-new effect from a starter flow: add it to the library, show its
  // live view, and open Synflow to add/edit nodes. Testable by adding it to any FX chain.
  const newEffect = () => {
    const id = uid('fx');
    const name = 'New Effect';
    const flow = cloneFlow(makeFilterFx({ type: 'lowpass', frequency: 1200 }));
    const entry: LibraryEntry = { id, name, category: 'Effects', group: 'effect', flow };
    setLibrary((lib) => [...lib, entry]);
    const root = folderRef.current;
    if (root) writeFlow(root, { group: 'effect', id, name, category: 'Effects', flow }).catch((e) => console.warn('[Mothscilla] save effect failed', e));
    setOpenItem({ kind: 'effect', id }); setView('live');
    openEffectEditor(entry);
  };

  // Remove an instrument/drum from the pool: drop its uses from every track,
  // tear down its engines, and close its panel.
  const removePoolItem = (poolId: string) => {
    for (const t of projectRef.current.tracks) {
      for (const u of t.uses) {
        if (u.poolId !== poolId) continue;
        hostsRef.current.get(u.id)?.dispose(); hostsRef.current.delete(u.id);
        poolsRef.current.get(u.id)?.dispose(); poolsRef.current.delete(u.id);
        mixerRef.current?.removeUse(u.id);
      }
    }
    liveSynthsRef.current.get(poolId)?.dispose(); liveSynthsRef.current.delete(poolId);
    liveDrumsRef.current.get(poolId)?.dispose(); liveDrumsRef.current.delete(poolId);
    try { liveGainRef.current.get(poolId)?.disconnect(); } catch { /* noop */ }
    liveGainRef.current.delete(poolId);
    liveFxRef.current.get(poolId)?.dispose(); liveFxRef.current.delete(poolId);
    setProject((p) => ({ ...p, pool: p.pool.filter((pi) => pi.id !== poolId), tracks: p.tracks.map((t) => ({ ...t, uses: t.uses.filter((u) => u.poolId !== poolId) })) }));
    if (openItem?.id === poolId) setOpenItem(null);
  };

  // Remove an effect from the pool (the catalog of effects you can add).
  const removeEffect = (effectId: string) => setLibrary((lib) => lib.filter((e) => !(e.id === effectId && e.group === 'effect')));

  // ─── project edits ─────────────────────────────────────────────────────────
  const mapTrack = (trackId: string, fn: (t: Track) => Track) =>
    setProject((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === trackId ? fn(t) : t)) }));
  const mapUse = (useId: string, fn: (u: Track['uses'][number]) => Track['uses'][number]) =>
    setProject((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, uses: t.uses.map((u) => (u.id === useId ? fn(u) : u)) })) }));
  const trackOfUse = (useId: string) => projectRef.current.tracks.find((t) => t.uses.some((u) => u.id === useId));
  const useById = (useId: string) => projectRef.current.tracks.flatMap((t) => t.uses).find((u) => u.id === useId);

  const rebuildUseChain = (useId: string, fx: FxInsert[]) => void mixerRef.current?.useChain(useId)?.setChain(resolveFx(fx));
  const rebuildTrackChain = (trackId: string, fx: FxInsert[]) => void mixerRef.current?.trackChain(trackId)?.setChain(resolveFx(fx));
  const rebuildMaster = (fx: FxInsert[]) => void mixerRef.current?.masterChain.setChain(resolveFx(fx));

  // Open a flow in Synflow; on save, set the override + live-reload + persist.
  const editFxFlow = (insert: FxInsert, apply: (flow: Flow) => void) => {
    const flow = insert.flow ?? findEntry(insert.fxId)?.flow;
    if (flow) setEditor({ flow, title: insert.name, onSaved: (f) => { apply(f); persistFx(insert, f); } });
  };

  // Open the native graphical EQ. `updateLive` pushes edits to the live node(s)
  // (every move); `writeBack` persists to the model (on release).
  const openEqEditor = (title: string, insert: FxInsert, getAnalyser: () => AnalyserNode | null, updateLive: (eq: EqSettings) => void, writeBack: (eq: EqSettings) => void) => {
    setEqEditor({
      title, settings: insert.eq ?? defaultEq(), sampleRate: ctxRef.current?.sampleRate ?? 48000, getAnalyser,
      onChange: (eq, commit) => { updateLive(eq); if (commit) writeBack(eq); },
    });
  };

  const h: TrackEditorHandlers = {
    onToggleStep: (useId, step) => mapUse(useId, (u) => {
      if (!(u.steps ?? [])[step]) void audition(useId);
      return { ...u, steps: (u.steps ?? blankSteps(projectRef.current.totalSteps)).map((s, i) => (i === step ? !s : s)) };
    }),
    onMuteUse: (useId) => mapUse(useId, (u) => ({ ...u, muted: !u.muted })),
    onAddNote: (useId, midi, start) => { void audition(useId, { frequency: midiToFreq(midi) }); mapUse(useId, (u) => ({ ...u, notes: [...(u.notes ?? []), { id: newNoteId(), midi, start, length: 2 }] })); },
    onRemoveNote: (useId, noteId) => mapUse(useId, (u) => ({ ...u, notes: (u.notes ?? []).filter((n) => n.id !== noteId) })),
    onMoveNote: (useId, noteId, midi, start) => mapUse(useId, (u) => ({ ...u, notes: (u.notes ?? []).map((n) => (n.id === noteId ? { ...n, midi, start } : n)) })),
    onResizeNote: (useId, noteId, length) => mapUse(useId, (u) => ({ ...u, notes: (u.notes ?? []).map((n) => (n.id === noteId ? { ...n, length } : n)) })),
    onPlayNote: (useId, midi) => void audition(useId, { frequency: midiToFreq(midi) }),
    onKeyDown: (useId, midi) => void useNoteOn(useId, midi),
    onKeyUp: (useId, midi) => useNoteOff(useId, midi),
    onAddUse: (poolId) => {
      const track = selectedTrack; if (!track) return;
      const pool = project.pool.find((p) => p.id === poolId); if (!pool) return;
      const use = pool.kind === 'drum'
        ? { id: uid('use'), poolId, fx: [], steps: blankSteps(project.totalSteps) }
        : { id: uid('use'), poolId, fx: [], notes: [], voices: 6 };
      mapTrack(track.id, (t) => ({ ...t, uses: [...t.uses, use] }));
      const dest = mixerRef.current?.use(use.id, track.id);
      if (dest) void buildUse(use.id, pool, dest, use.voices);
    },
    // Create a brand-new instrument from scratch (in Synflow) for THIS track: add it
    // to the pool, drop a use onto the track, persist, then open the node editor.
    onCreateUse: () => {
      const track = selectedTrack; if (!track) return;
      const kind: 'synth' | 'drum' = track.type === 'drums' ? 'drum' : 'synth';
      const id = uid('pool');
      const name = kind === 'synth' ? 'New Synth' : 'New Drum';
      const flow = cloneFlow(kind === 'synth' ? makeSynthVoice('sawtooth') : makeKick());
      const item: PoolItem = { id, name, libId: id, kind, flow };
      const use = kind === 'drum'
        ? { id: uid('use'), poolId: id, fx: [], steps: blankSteps(project.totalSteps) }
        : { id: uid('use'), poolId: id, fx: [], notes: [], voices: 6 };
      setProject((p) => ({ ...p, pool: [...p.pool, item], tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, uses: [...t.uses, use] } : t)) }));
      const dest = mixerRef.current?.use(use.id, track.id);
      if (dest) void buildUse(use.id, item, dest, use.voices);
      const root = folderRef.current;
      if (root) writeFlow(root, { group: 'instrument', id, name, category: kind === 'synth' ? 'Synths' : 'Drums', kind: kind === 'synth' ? 'piano' : 'step', flow }).catch((e) => console.warn('[Mothscilla] save instrument failed', e));
      openInstrumentEditor(item);
    },
    onRemoveUse: (useId) => {
      mapTrack(trackOfUse(useId)?.id ?? '', (t) => ({ ...t, uses: t.uses.filter((u) => u.id !== useId) }));
      hostsRef.current.get(useId)?.dispose(); hostsRef.current.delete(useId);
      poolsRef.current.get(useId)?.dispose(); poolsRef.current.delete(useId);
      mixerRef.current?.removeUse(useId);
    },
    onUseFxAdd: (useId, fxId) => { const ins = fxInsert(fxId); const cur = useById(useId)?.fx ?? []; mapUse(useId, (u) => ({ ...u, fx: [...u.fx, ins] })); rebuildUseChain(useId, [...cur, ins]); },
    onUseFxRemove: (useId, i) => { const cur = (useById(useId)?.fx ?? []).filter((_, j) => j !== i); mapUse(useId, (u) => ({ ...u, fx: u.fx.filter((_, j) => j !== i) })); rebuildUseChain(useId, cur); },
    onUseFxEdit: (useId, i) => {
      const insert = useById(useId)?.fx[i]; if (!insert) return;
      if (insert.fxId === EQ_FX_ID) {
        const chain = () => mixerRef.current?.useChain(useId);
        openEqEditor('Instrument', insert, () => chain()?.getEqAnalyser(i) ?? null, (eq) => chain()?.updateEq(i, eq),
          (eq) => mapUse(useId, (u) => ({ ...u, fx: u.fx.map((x, j) => (j === i ? { ...x, eq } : x)) })));
        return;
      }
      editFxFlow(insert, (f) => { mapUse(useId, (u) => ({ ...u, fx: u.fx.map((x, j) => (j === i ? { ...x, flow: f } : x)) })); rebuildUseChain(useId, (useById(useId)?.fx ?? []).map((x, j) => (j === i ? { ...x, flow: f } : x))); });
    },
    onTrackFxAdd: (fxId) => { const t = selectedTrack; if (!t) return; const ins = fxInsert(fxId); mapTrack(t.id, (x) => ({ ...x, fx: [...x.fx, ins] })); rebuildTrackChain(t.id, [...t.fx, ins]); },
    onTrackFxRemove: (i) => { const t = selectedTrack; if (!t) return; const next = t.fx.filter((_, j) => j !== i); mapTrack(t.id, (x) => ({ ...x, fx: next })); rebuildTrackChain(t.id, next); },
    onTrackFxEdit: (i) => {
      const t = selectedTrack; const insert = t?.fx[i]; if (!t || !insert) return;
      if (insert.fxId === EQ_FX_ID) {
        const chain = () => mixerRef.current?.track(t.id).chain;
        openEqEditor(t.name, insert, () => chain()?.getEqAnalyser(i) ?? null, (eq) => chain()?.updateEq(i, eq),
          (eq) => mapTrack(t.id, (x) => ({ ...x, fx: x.fx.map((f, j) => (j === i ? { ...f, eq } : f)) })));
        return;
      }
      editFxFlow(insert, (f) => { const next = t.fx.map((x, j) => (j === i ? { ...x, flow: f } : x)); mapTrack(t.id, (x) => ({ ...x, fx: next })); rebuildTrackChain(t.id, next); });
    },
    onUseFxKnob: (useId, i, nodeId, param, value) => {
      mixerRef.current?.useChain(useId)?.setParam(i, nodeId, param, value);
      const insert = useById(useId)?.fx[i]; const base = insert?.flow ?? (insert && findEntry(insert.fxId)?.flow); if (!insert || !base) return;
      const flow = setFlowParam(base, nodeId, param, value);
      mapUse(useId, (u) => ({ ...u, fx: u.fx.map((x, j) => (j === i ? { ...x, flow } : x)) }));
    },
    onTrackFxKnob: (i, nodeId, param, value) => {
      const t = selectedTrack; if (!t) return;
      mixerRef.current?.trackChain(t.id)?.setParam(i, nodeId, param, value);
      const insert = t.fx[i]; const base = insert?.flow ?? (insert && findEntry(insert.fxId)?.flow); if (!insert || !base) return;
      const flow = setFlowParam(base, nodeId, param, value);
      mapTrack(t.id, (x) => ({ ...x, fx: x.fx.map((y, j) => (j === i ? { ...y, flow } : y)) }));
    },
    onRename: (name) => { if (selectedTrack) renameTrack(selectedTrack.id, name); },
    onToggleLoop: () => { if (selectedTrack) toggleTrackLoop(selectedTrack.id); },
    onSetLength: (length) => { if (selectedTrack) setTrackLength(selectedTrack.id, length); },
    onSetVoices: (useId, voices) => setUseVoices(useId, voices),
    onTrackVolume: (trackId, v) => setTrackVolume(trackId, v),
    onImportAudio: (trackId) => void importAudioClip(trackId),
    onAddClipFromAsset: (trackId, asset) => void addClipFromAsset(trackId, asset),
    onOpenLibrary: () => void refreshAudioLibrary(),
    onStartRec: (trackId) => void startRecording(trackId),
    onStopRec: () => void stopRecording(),
    onMoveAudioClip: (trackId, clipId, start) => moveAudioClip(trackId, clipId, start),
    onTrimAudioClip: (trackId, clipId, offset, duration) => trimAudioClip(trackId, clipId, offset, duration),
    onSplitAudioClip: (trackId, clipId, atSteps) => splitAudioClip(trackId, clipId, atSteps),
    onRemoveAudioClip: (trackId, clipId) => removeAudioClip(trackId, clipId),
    onAudioClipGain: (trackId, clipId, gain) => setAudioClipGain(trackId, clipId, gain),
    onPlayAudioClip: (clip) => auditionClip(clip),
  };

  const addTrack = (type: 'drums' | 'synth' | 'audio' | 'video') => {
    const id = uid('track');
    const isMedia = type === 'audio' || type === 'video';
    const label = type === 'drums' ? 'Drums' : type === 'audio' ? 'Audio' : type === 'video' ? 'Video' : 'Synth';
    setProject((p) => ({ ...p, tracks: [...p.tracks, {
      id, name: `${label} ${p.tracks.length + 1}`, type, volume: 0.8,
      loop: !isMedia, length: p.totalSteps, uses: [],
      clips: isMedia ? [] : [{ id: uid('clip'), start: 0, length: 1, loop: true }],
      audioClips: type === 'audio' ? [] : undefined,
      videoClips: type === 'video' ? [] : undefined, fx: [], automation: [],
    }] }));
    setSelTrack(id);
    if (isMedia) setSongMode(true); // media plays on the song timeline
    if (type === 'video') void importVideoClip(id); // immediately prompt for a file
  };
  // A title is a video-track clip with `text` (no asset) → reuses the whole video
  // pipeline (compositing, transform, fades, trim/split, export burn-in).
  const addTitle = () => {
    const id = uid('track');
    const start = Math.max(0, currentStepRef.current);
    const clip: VideoClip = { id: uid('vclip'), assetId: '', start, offset: 0, duration: 4, text: 'Title', titleBg: true, titleFont: 'Inter', titleAppear: 'fade', fadeIn: 0.3, fadeOut: 0.3, transform: { y: 0.32 } };
    setProject((p) => ({ ...p, tracks: [...p.tracks, {
      id, name: `Title ${p.tracks.length + 1}`, type: 'video', volume: 0.8, loop: false, length: p.totalSteps,
      uses: [], clips: [], videoClips: [clip], fx: [], automation: [],
    }] }));
    setSelTrack(id); setSongMode(true); setMonitorOpen(true);
  };
  const removeTrack = (trackId: string) => {
    setProject((p) => ({ ...p, tracks: p.tracks.filter((t) => t.id !== trackId) }));
    for (const u of projectRef.current.tracks.find((t) => t.id === trackId)?.uses ?? []) {
      hostsRef.current.get(u.id)?.dispose(); hostsRef.current.delete(u.id);
      poolsRef.current.get(u.id)?.dispose(); poolsRef.current.delete(u.id);
    }
    mixerRef.current?.removeTrack(trackId);
  };
  const setTrackVolume = (trackId: string, v: number) => { mapTrack(trackId, (t) => ({ ...t, volume: v })); mixerRef.current?.setTrackVolume(trackId, v); };
  const renameTrack = (trackId: string, name: string) => mapTrack(trackId, (t) => ({ ...t, name }));
  const toggleTrackLoop = (trackId: string) => mapTrack(trackId, (t) => ({ ...t, loop: !t.loop })); // scheduler reads loop live
  const toggleTrackMute = (trackId: string) => mapTrack(trackId, (t) => ({ ...t, muted: !t.muted })); // scheduler reads muted live
  const setTrackLength = (trackId: string, length: number) => {
    const len = Math.max(1, Math.min(256, length));
    mapTrack(trackId, (t) => ({
      ...t, length: len,
      uses: t.uses.map((u) => (u.steps ? { ...u, steps: Array.from({ length: len }, (_, i) => u.steps![i] ?? false) } : u)),
    }));
    if (schedulerRef.current && !songModeRef.current) schedulerRef.current.totalSteps = patternLoopLength(projectRef.current.tracks.map((t) => (t.id === trackId ? { ...t, length: len } : t)));
  };
  const setUseVoices = (useId: string, voices: number) => {
    const v = Math.max(1, Math.min(16, voices));
    mapUse(useId, (u) => ({ ...u, voices: v }));
    // rebuild this synth use's voice pool with the new polyphony
    const track = trackOfUse(useId); const u = useById(useId); const pool = u && projectRef.current.pool.find((p) => p.id === u.poolId);
    const dest = track ? mixerRef.current?.use(useId, track.id) : undefined;
    if (pool && dest) { poolsRef.current.get(useId)?.dispose(); poolsRef.current.delete(useId); void buildUse(useId, pool, dest, v); }
  };

  // ─── arrangement (song) ─────────────────────────────────────────────────────
  const toggleSongMode = () => setSongMode((m) => {
    const next = !m;
    if (schedulerRef.current) schedulerRef.current.totalSteps = next ? songLengthSteps(projectRef.current) : patternLoopLength(projectRef.current.tracks);
    return next;
  });
  const setSongSlots = (n: number) => setProject((p) => ({ ...p, songSlots: n }));
  const addClip = (trackId: string, slot: number) => mapTrack(trackId, (t) => (t.clips.some((c) => c.start === slot) ? t : { ...t, clips: [...t.clips, { id: uid('clip'), start: Math.max(0, slot), length: 1, loop: false }] }));
  const removeClip = (trackId: string, clipId: string) => mapTrack(trackId, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) }));
  const toggleClipLoop = (trackId: string, clipId: string) => mapTrack(trackId, (t) => ({ ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, loop: !c.loop } : c)) }));
  const setClipLen = (trackId: string, clipId: string, length: number) => mapTrack(trackId, (t) => ({ ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, length } : c)) }));
  const moveClip = (trackId: string, clipId: string, start: number) => mapTrack(trackId, (t) => ({ ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, start } : c)) }));
  const moveAudioClip = (trackId: string, clipId: string, start: number) => mapTrack(trackId, (t) => ({ ...t, audioClips: (t.audioClips ?? []).map((c) => (c.id === clipId ? { ...c, start } : c)) }));
  const updateAudioClips = (trackId: string, fn: (cs: AudioClip[]) => AudioClip[]) => mapTrack(trackId, (t) => ({ ...t, audioClips: fn(t.audioClips ?? []) }));
  const removeAudioClip = (trackId: string, clipId: string) => updateAudioClips(trackId, (cs) => cs.filter((c) => c.id !== clipId));
  const setAudioClip = (trackId: string, clipId: string, patch: Partial<AudioClip>) => { updateAudioClips(trackId, (cs) => cs.map((c) => (c.id === clipId ? { ...c, ...patch } : c))); void buildAudio(); };
  const moveVideoClip = (trackId: string, clipId: string, start: number) => mapTrack(trackId, (t) => ({ ...t, videoClips: (t.videoClips ?? []).map((c) => (c.id === clipId ? { ...c, start } : c)) }));
  const removeVideoClip = (trackId: string, clipId: string) => mapTrack(trackId, (t) => ({ ...t, videoClips: (t.videoClips ?? []).filter((c) => c.id !== clipId) }));
  const setVideoClip = (trackId: string, clipId: string, patch: Partial<VideoClip>) => mapTrack(trackId, (t) => ({ ...t, videoClips: (t.videoClips ?? []).map((c) => (c.id === clipId ? { ...c, ...patch } : c)) }));
  const splitVideoClip = (trackId: string, clipId: string, atSteps: number) => {
    const secPerStep = 60 / projectRef.current.bpm / projectRef.current.stepsPerBeat;
    mapTrack(trackId, (t) => ({ ...t, videoClips: (t.videoClips ?? []).flatMap((c) => {
      if (c.id !== clipId) return [c];
      const into = (atSteps - c.start) * secPerStep;                  // seconds into the clip
      if (into <= 0.05 || into >= c.duration - 0.05) return [c];
      return [
        { ...c, duration: into, fadeOut: undefined },                 // first half keeps fade-in
        { ...c, id: uid('vclip'), start: atSteps, offset: c.offset + into, duration: c.duration - into, fadeIn: undefined }, // second keeps fade-out
      ];
    }) }));
  };

  // Drop a recording onto the selected audio track (or the first one, creating it
  // if there is none) at the playhead, then rebuild so it plays back with transport.
  const placeAssetOnTrack = (assetId: string) => {
    const cur = projectRef.current;
    const asset = cur.assets.find((a) => a.id === assetId); if (!asset) return;
    const clip: AudioClip = { id: uid('aclip'), assetId, start: Math.max(0, currentStepRef.current), offset: 0, duration: asset.duration, gain: 1 };
    const target = cur.tracks.find((t) => t.id === selTrack && t.type === 'audio') ?? cur.tracks.find((t) => t.type === 'audio');
    let next: Project;
    if (target) {
      next = { ...cur, tracks: cur.tracks.map((t) => (t.id === target.id ? { ...t, audioClips: [...(t.audioClips ?? []), clip] } : t)) };
    } else {
      const id = uid('track');
      const nt: Track = { id, name: `Audio ${cur.tracks.filter((t) => t.type === 'audio').length + 1}`, type: 'audio', volume: 0.8, loop: true, length: cur.totalSteps, uses: [], clips: [], audioClips: [clip], fx: [], automation: [] };
      next = { ...cur, tracks: [...cur.tracks, nt] };
    }
    projectRef.current = next; setProject(next);
    void buildAudio();
  };

  // Delete a recording from the project: drop the asset and any clips that use it.
  const removeRecording = (assetId: string) => {
    if (previewKey === 'asset:' + assetId) stopAudition();
    setProject((p) => ({
      ...p,
      assets: p.assets.filter((a) => a.id !== assetId),
      tracks: p.tracks.map((t) => ({ ...t, audioClips: (t.audioClips ?? []).filter((c) => c.assetId !== assetId) })),
    }));
  };
  const setAudioClipGain = (trackId: string, clipId: string, gain: number) => updateAudioClips(trackId, (cs) => cs.map((c) => (c.id === clipId ? { ...c, gain } : c)));
  const trimAudioClip = (trackId: string, clipId: string, offset: number, duration: number) => updateAudioClips(trackId, (cs) => cs.map((c) => (c.id === clipId ? { ...c, offset: Math.max(0, offset), duration: Math.max(0.02, duration) } : c)));
  const splitAudioClip = (trackId: string, clipId: string, atSteps: number) => {
    const secPerStep = 60 / projectRef.current.bpm / projectRef.current.stepsPerBeat;
    updateAudioClips(trackId, (cs) => cs.flatMap((c) => {
      if (c.id !== clipId) return [c];
      const into = (atSteps - c.start) * secPerStep;                 // seconds into the clip
      if (into <= 0.02 || into >= c.duration - 0.02) return [c];
      return [
        { ...c, duration: into },
        { ...c, id: uid('aclip'), start: atSteps, offset: c.offset + into, duration: c.duration - into },
      ];
    }));
  };

  // Decode bytes → asset, drop a clip at the playhead on `trackId`, rebuild audio.
  const ingestAndAdd = async (trackId: string, name: string, bytes: ArrayBuffer, mime: string) => {
    await ensureAudio();
    let asset: AudioAsset;
    try { asset = await ensureAssets().ingest(name, bytes, mime); }
    catch (e) { console.warn('[Mothscilla] audio decode failed', e); return; }
    const clip: AudioClip = { id: uid('aclip'), assetId: asset.id, start: Math.max(0, currentStepRef.current), offset: 0, duration: asset.duration, gain: 1 };
    const cur = projectRef.current;
    const next: Project = { ...cur, assets: [...cur.assets, asset], tracks: cur.tracks.map((t) => (t.id === trackId ? { ...t, audioClips: [...(t.audioClips ?? []), clip] } : t)) };
    projectRef.current = next; setProject(next);
    await buildAudio();
  };

  const importAudioClip = async (trackId: string) => {
    let startedAt = 0;
    const picked = await pickAudioFile((read, total) => {
      if (!startedAt) startedAt = Date.now();
      setImporting({ name: '', phase: 'reading', read, total, startedAt });
    });
    if (!picked) { setImporting(null); return; }
    if (!startedAt) startedAt = Date.now();
    setImporting({ name: picked.name, phase: 'decoding', read: 0, total: 0, startedAt });
    try { await ingestAndAdd(trackId, picked.name.replace(/\.[^.]+$/, ''), picked.bytes, picked.mime); }
    finally { setImporting(null); }
    setSongMode(true); // audio plays on the song timeline
  };

  // Turn video container bytes into a VideoAsset (+ extracted AudioAsset) and a
  // VideoClip/AudioClip at `start`. Shared by file import and live recording.
  const buildVideoEntities = async (bytes: ArrayBuffer, mime: string, baseName: string, start: number) => {
    const probe = await probeVideo(bytes, mime);
    const audioBuf = await extractAudioFromVideo(bytes);
    let audioAsset: AudioAsset | null = null;
    if (audioBuf) {
      const chans = Array.from({ length: audioBuf.numberOfChannels }, (_, c) => audioBuf.getChannelData(c));
      const wav = encodeWav(chans, audioBuf.sampleRate);
      try { audioAsset = await ensureAssets().ingest(`${baseName} (audio)`, wav, 'audio/wav'); }
      catch (e) { console.warn('[Mothscilla] extracted-audio ingest failed', e); }
    }
    const blob = new Blob([bytes], { type: mime });
    const ext = mime.includes('webm') ? '.webm' : mime.includes('quicktime') ? '.mov' : '.mp4';
    const fileName = `${baseName}${ext}`;
    let source: VideoAsset['source'] = { kind: 'embedded', base64: '', mime }; // bytes live in videoBlobsRef this session
    if (folderRef.current) {
      try { await writeVideoFile(folderRef.current, fileName, blob); source = { kind: 'disk', fileName, mime }; } catch { /* keep session-only */ }
    }
    const videoAsset: VideoAsset = {
      id: uid('vasset'), name: baseName, source,
      duration: probe.duration || audioBuf?.duration || 0,
      width: probe.width, height: probe.height, hasAudio: !!audioBuf,
      audioAssetId: audioAsset?.id, poster: probe.poster,
    };
    videoBlobsRef.current.set(videoAsset.id, blob);
    const vclip: VideoClip = { id: uid('vclip'), assetId: videoAsset.id, start, offset: 0, duration: videoAsset.duration };
    const aclip: AudioClip | null = audioAsset ? { id: uid('aclip'), assetId: audioAsset.id, start, offset: 0, duration: audioAsset.duration, gain: 1 } : null;
    return { videoAsset, audioAsset, vclip, aclip, hadAudio: !!audioBuf };
  };

  // Import a video onto a video track (+ the extracted audio on its audio lane).
  const importVideoClip = async (trackId: string) => {
    let startedAt = 0;
    const picked = await pickVideoFile((read, total) => {
      if (!startedAt) startedAt = Date.now();
      setImporting({ name: '', phase: 'reading', read, total, startedAt });
    });
    if (!picked) { setImporting(null); return; }
    if (!startedAt) startedAt = Date.now();
    setImporting({ name: picked.name, phase: 'decoding', read: 0, total: 0, startedAt });
    try {
      await ensureAudio();
      const baseName = picked.name.replace(/\.[^.]+$/, '');
      const { videoAsset, audioAsset, vclip, aclip, hadAudio } = await buildVideoEntities(picked.bytes, picked.mime, baseName, Math.max(0, currentStepRef.current));
      const cur = projectRef.current;
      const next: Project = {
        ...cur,
        videoAssets: [...(cur.videoAssets ?? []), videoAsset],
        assets: audioAsset ? [...cur.assets, audioAsset] : cur.assets,
        tracks: cur.tracks.map((t) => (t.id !== trackId ? t : {
          ...t, videoClips: [...(t.videoClips ?? []), vclip],
          ...(aclip ? { audioClips: [...(t.audioClips ?? []), aclip] } : {}),
        })),
      };
      projectRef.current = next; setProject(next);
      await buildAudio();
      if (!hadAudio) window.alert(`Imported "${baseName}". This file's audio couldn't be extracted in-browser (common for AVI). The video still imports; see docs/VIDEO.md for the demux fallback.`);
    } catch (e) {
      console.warn('[Mothscilla] video import failed', e);
      window.alert('Video import failed — see the console.');
    } finally { setImporting(null); }
    setSongMode(true);
  };

  // ── Live capture: webcam (reaction) + screen, recorded to a clip ─────────────
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const monitorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; dest: MediaStreamAudioDestinationNode } | null>(null);
  const cameraOn = !!cameraStream, screenOn = !!screenStream;
  // Live-source layout (fractions of the frame) — set in the monitor's Sources panel.
  const [cameraLayout, setCameraLayout] = useState<SourceLayout>({ x: 0.70, y: 0.70, w: 0.28 });
  const [screenLayout, setScreenLayout] = useState<SourceLayout>({ x: 0, y: 0, w: 1 });
  const [camDeviceId, setCamDeviceId] = useState<string | undefined>();
  const [micDeviceId, setMicDeviceId] = useState<string | undefined>();
  const [mediaDevices, setMediaDevices] = useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cams: [], mics: [] });

  const enumerateMedia = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setMediaDevices({ cams: list.filter((d) => d.kind === 'videoinput'), mics: list.filter((d) => d.kind === 'audioinput') });
    } catch { /* no perms yet */ }
  }, []);
  useEffect(() => {
    void enumerateMedia();
    navigator.mediaDevices?.addEventListener?.('devicechange', enumerateMedia);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', enumerateMedia);
  }, [enumerateMedia]);

  const startCamera = useCallback(async (camId?: string, micId?: string) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: camId ? { exact: camId } : undefined, width: 1280, height: 720 },
        audio: micId ? { deviceId: { exact: micId } } : true,
      });
      setCameraStream((prev) => { prev?.getTracks().forEach((t) => t.stop()); return s; });
      s.getVideoTracks()[0]?.addEventListener('ended', () => setCameraStream(null));
      setView('song'); setMonitorOpen(true);
      void enumerateMedia(); // labels are populated once permission is granted
    } catch (e) { console.warn('[Mothscilla] camera denied', e); window.alert('Could not start the camera (permission denied or no device).'); }
  }, [enumerateMedia]);

  const toggleCamera = useCallback(() => {
    if (cameraOn) { cameraStream?.getTracks().forEach((t) => t.stop()); setCameraStream(null); return; }
    void startCamera(camDeviceId, micDeviceId);
  }, [cameraOn, cameraStream, startCamera, camDeviceId, micDeviceId]);

  const selectCamDevice = useCallback((id: string) => { setCamDeviceId(id); if (cameraOn) void startCamera(id, micDeviceId); }, [cameraOn, startCamera, micDeviceId]);
  const selectMicDevice = useCallback((id: string) => { setMicDeviceId(id); if (cameraOn) void startCamera(camDeviceId, id); }, [cameraOn, startCamera, camDeviceId]);
  const setSourceLayout = useCallback((key: 'camera' | 'screen', patch: Partial<SourceLayout>) => {
    (key === 'camera' ? setCameraLayout : setScreenLayout)((l) => ({ ...l, ...patch }));
  }, []);

  const toggleScreen = useCallback(async () => {
    setScreenStream((cur) => { cur?.getTracks().forEach((t) => t.stop()); return null; });
    if (screenOn) return;
    try {
      const s = await (navigator.mediaDevices as any).getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      s.getVideoTracks()[0]?.addEventListener('ended', () => setScreenStream(null)); // user clicked "Stop sharing"
      setScreenStream(s); setView('song'); setMonitorOpen(true);
    } catch (e) { console.warn('[Mothscilla] display capture cancelled', e); }
  }, [screenOn]);

  // Record the program-monitor composite (screen + facecam + clips/titles) plus a
  // mix of screen/camera/song audio → a WebM, ingested as a new video track.
  const toggleRecord = useCallback(async () => {
    if (recording) { recRef.current?.rec.stop(); return; }
    const canvas = monitorCanvasRef.current;
    if (!canvas) { window.alert('Start the camera or screen first, then record.'); return; }
    await ensureAudio();
    const ctx = ctxRef.current!;
    const vstream = canvas.captureStream(30);
    const dest = ctx.createMediaStreamDestination();
    const tapTrack = (s: MediaStream | null) => { const tr = s?.getAudioTracks?.()[0]; if (tr) { try { ctx.createMediaStreamSource(new MediaStream([tr])).connect(dest); } catch { /* skip */ } } };
    tapTrack(screenStream); tapTrack(cameraStream);
    try { mixerRef.current?.masterSum.connect(dest); } catch { /* song mix optional */ }
    const tracks = [...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()];
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
    const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      setRecording(false);
      try { mixerRef.current?.masterSum.disconnect(dest); } catch { /* noop */ }
      recRef.current = null;
      const blob = new Blob(chunks, { type: 'video/webm' });
      try {
        await ensureAudio();
        const name = `Recording ${new Date().toLocaleTimeString()}`;
        const { videoAsset, audioAsset, vclip, aclip } = await buildVideoEntities(await blob.arrayBuffer(), 'video/webm', name, Math.max(0, currentStepRef.current));
        const id = uid('track');
        const nt: Track = { id, name, type: 'video', volume: 0.8, loop: false, length: projectRef.current.totalSteps, uses: [], clips: [], videoClips: [vclip], audioClips: aclip ? [aclip] : [], fx: [], automation: [] };
        const cur = projectRef.current;
        const next: Project = { ...cur, videoAssets: [...(cur.videoAssets ?? []), videoAsset], assets: audioAsset ? [...cur.assets, audioAsset] : cur.assets, tracks: [...cur.tracks, nt] };
        projectRef.current = next; setProject(next); setSelTrack(id);
        await buildAudio();
      } catch (e) { console.warn('[Mothscilla] recording ingest failed', e); }
    };
    recRef.current = { rec, chunks, dest };
    rec.start(250);
    setRecording(true);
  }, [recording, screenStream, cameraStream, ensureAudio]);

  // Shared audio library: every disk asset used by any song in the folder, merged
  // with the open song's assets. Refreshed when the "from project" picker opens.
  const [audioLibrary, setAudioLibrary] = useState<AudioAsset[]>([]);
  const assetKey = (a: AudioAsset) => (a.source.kind === 'disk' ? 'disk:' + a.source.fileName : 'id:' + a.id);
  const refreshAudioLibrary = useCallback(async () => {
    const root = folderRef.current;
    const byKey = new Map<string, AudioAsset>();
    if (root) {
      // every file actually on disk (incl. subfolders) — duration filled on add
      for (const f of await listAudioFiles(root)) {
        const a: AudioAsset = { id: 'disk:' + f.path, name: f.name, duration: f.duration, peaks: { min: [], max: [] }, source: { kind: 'disk', fileName: f.path, mime: f.mime } };
        byKey.set(assetKey(a), a);
      }
      // song-referenced assets carry real duration + waveform peaks → let them win
      for (const a of await listAllAssets(root)) byKey.set(assetKey(a), a);
    }
    for (const a of projectRef.current.assets) byKey.set(assetKey(a), a); // the open song wins
    setAudioLibrary([...byKey.values()].sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  // Drop a clip from a library/project asset (no re-import/decode) at the playhead.
  // Registers the asset into the open song if it isn't there yet (deduped by file).
  const addClipFromAsset = async (trackId: string, asset: AudioAsset) => {
    await ensureAudio();
    let a = asset;
    // A raw disk file has no duration yet — open it (WAV header) or convert it
    // (legacy codec) to learn the length; this also primes the streaming cache.
    if (!(a.duration > 0) && a.source.kind === 'disk') {
      const s = await ensureAssets().resolveStream(a); // may migrate + mutate a.source
      if (s) a = { ...a, duration: s.meta.frames / s.meta.sampleRate };
    }
    if (!(a.duration > 0)) { console.warn('[Mothscilla] could not resolve audio (missing/unreadable?)', asset.name); return; }
    const cur = projectRef.current;
    const existing = cur.assets.find((x) => assetKey(x) === assetKey(a));
    const assetId = existing ? existing.id : uid('asset');
    const assets = existing ? cur.assets : [...cur.assets, { ...a, id: assetId }];
    const clip: AudioClip = { id: uid('aclip'), assetId, start: Math.max(0, currentStepRef.current), offset: 0, duration: a.duration, gain: 1 };
    const next: Project = { ...cur, assets, tracks: cur.tracks.map((t) => (t.id === trackId ? { ...t, audioClips: [...(t.audioClips ?? []), clip] } : t)) };
    projectRef.current = next; setProject(next);
    await buildAudio();
    setSongMode(true);
  };

  const startRecording = async (trackId: string) => {
    try { const rec = new Recorder(); await rec.start(); recorderRef.current = rec; setRecTrack(trackId); }
    catch (e) { console.warn('[Mothscilla] mic access failed', e); recorderRef.current = null; }
  };
  const stopRecording = async () => {
    const rec = recorderRef.current; const trackId = recTrack; setRecTrack(null);
    if (!rec || !trackId) return;
    const res = await rec.stop(); recorderRef.current = null;
    if (res) await ingestAndAdd(trackId, `take ${new Date().toLocaleTimeString()}`, res.bytes, res.mime);
  };

  const onMasterFxAdd = (fxId: string) => { const ins = fxInsert(fxId); setProject((p) => ({ ...p, masterFx: [...p.masterFx, ins] })); rebuildMaster([...project.masterFx, ins]); };
  const onMasterFxRemove = (i: number) => { const next = project.masterFx.filter((_, j) => j !== i); setProject((p) => ({ ...p, masterFx: next })); rebuildMaster(next); };
  const onMasterFxEdit = (i: number) => {
    const insert = project.masterFx[i]; if (!insert) return;
    if (insert.fxId === EQ_FX_ID) {
      const chain = () => mixerRef.current?.masterChain;
      openEqEditor('Master', insert, () => chain()?.getEqAnalyser(i) ?? null, (eq) => chain()?.updateEq(i, eq),
        (eq) => setProject((p) => ({ ...p, masterFx: p.masterFx.map((x, j) => (j === i ? { ...x, eq } : x)) })));
      return;
    }
    editFxFlow(insert, (f) => { const next = projectRef.current.masterFx.map((x, j) => (j === i ? { ...x, flow: f } : x)); setProject((p) => ({ ...p, masterFx: next })); rebuildMaster(next); });
  };

  // ─── position readout ──────────────────────────────────────────────────────
  const sib = currentStep < 0 ? 0 : currentStep % project.totalSteps;
  const pos = `001.${Math.floor(sib / project.stepsPerBeat) + 1}.${String((sib % project.stepsPerBeat) * 25).padStart(2, '0')}`;
  const hasVideoContent = project.tracks.some((t) => t.type === 'video' && (t.videoClips?.length ?? 0) > 0);

  return (
    <div className="app-shell">
      <TopBar
        view={view} setView={setView} isPlaying={isPlaying} onPlay={isPlaying ? stop : play} onStop={stop}
        armed={armed} onArm={() => setArmed((a) => !a)} bpm={project.bpm} onBpm={setBpm} position={pos}
        browserOpen={browserOpen} setBrowserOpen={setBrowserOpen}
        projectName={project.name} onProjectName={(name) => setProject((p) => ({ ...p, name }))}
        onNewSong={newSong} onSave={saveSong} saved={saved} onOpenSong={openSong} onExport={() => setExportOpen(true)} exporting={exporting} exportProgress={exportProgress} onBounce={bounceSong} bouncing={bouncing} bounceProgress={bounceProgress}
        cameraOn={cameraOn} onToggleCamera={toggleCamera} screenOn={screenOn} onToggleScreen={toggleScreen} recording={recording} onToggleRecord={toggleRecord}
      />
      <div className="workspace">
        {browserOpen && <Pool pool={project.pool} effects={effects} instrumentLib={library.filter((e) => e.group === 'instrument')} armed={armedPool} recordings={project.assets} previewKey={previewKey} onPreview={auditionAsset} onPlaceRecording={placeAssetOnTrack} onRemoveRecording={removeRecording} onOpenInstrument={openInstrument} onEditEffect={openEffectPage} onRemoveInstrument={removePoolItem} onRemoveEffect={removeEffect} onAddFromFolder={addFromFolder} onAddInstrument={addInstrumentToPool} onNewEffect={newEffect} source={folder ? `disk · ${folder.name}` : 'built-in'} />}
        <div className="main">
          {view === 'tracks' && (
            <div className="tracks-view">
              <div className="tracks-rail">
                {project.tracks.map((t) => (
                  <div key={t.id} className={`trk ${t.id === selTrack ? 'sel' : ''}`} onClick={() => setSelTrack(t.id)}>
                    {t.type === 'drums' ? <Drum size={13} /> : t.type === 'audio' ? <AudioWaveform size={13} /> : t.type === 'video' ? <Film size={13} /> : <Music2 size={13} />}
                    <span className="trk-name">{t.name}</span>
                    <button className={`trk-loop ${t.loop ? 'on' : ''}`} title={t.loop ? 'Looping' : 'Loop off'} onClick={(e) => { e.stopPropagation(); toggleTrackLoop(t.id); }}><Repeat size={12} /></button>
                    <button className="trk-del" title="Delete track" onClick={(e) => { e.stopPropagation(); removeTrack(t.id); }}><Trash2 size={12} /></button>
                  </div>
                ))}
                <div className="trk-add">
                  <button onClick={() => addTrack('drums')}><Plus size={12} /> Drums</button>
                  <button onClick={() => addTrack('synth')}><Plus size={12} /> Synth</button>
                  <button onClick={() => addTrack('audio')}><Plus size={12} /> Audio</button>
                  <button onClick={() => addTrack('video')}><Plus size={12} /> Video</button>
                  <button onClick={addTitle}><Plus size={12} /> Title</button>
                </div>
              </div>
              <div className="track-editor-wrap">
                {selectedTrack
                  ? <TrackEditor project={project} track={selectedTrack} effects={effects} currentStep={currentStep} recTrack={recTrack} previewKey={previewKey} audioLibrary={audioLibrary} h={h} />
                  : <div className="te-empty">No track — add one.</div>}
              </div>
            </div>
          )}

          {view === 'song' && (
            <>
              <Arrange
                project={project} currentStep={currentStep} songMode={songMode} selTrack={selTrack}
                onToggleSongMode={toggleSongMode} onSetSongSlots={setSongSlots} onSelectTrack={setSelTrack} onToggleMute={toggleTrackMute} onTrackVolume={setTrackVolume} onSeek={seekTo}
                onAddClip={addClip} onRemoveClip={removeClip} onToggleLoop={toggleClipLoop} onClipLen={setClipLen}
                onMoveClip={moveClip} onMoveAudioClip={moveAudioClip} onRemoveAudioClip={removeAudioClip}
                onMoveVideoClip={moveVideoClip} onRemoveVideoClip={removeVideoClip} onSetAudioClip={setAudioClip} onSetVideoClip={setVideoClip}
                onSplitAudioClip={splitAudioClip} onSplitVideoClip={splitVideoClip} onPlayClip={auditionClip} previewKey={previewKey}
              />
              {(hasVideoContent || cameraOn || screenOn) && (monitorOpen
                ? <ProgramMonitor project={project} currentStep={currentStep} isPlaying={isPlaying} getVideoUrl={getVideoUrl} onSetClip={setVideoClip} onClose={() => setMonitorOpen(false)} canvasRef={monitorCanvasRef}
                    capture={{ cameraStream, screenStream, cameraLayout, screenLayout, setLayout: setSourceLayout, cams: mediaDevices.cams, mics: mediaDevices.mics, camDeviceId, micDeviceId, selectCam: selectCamDevice, selectMic: selectMicDevice }} />
                : <button className="pgm-reopen" title="Show video preview" onClick={() => setMonitorOpen(true)}><Film size={14} /> Preview</button>)}
            </>
          )}

          {view === 'live' && (() => {
            // The Live tab IS the instrument view: show the instrument you clicked
            // in the pool (or the first one). No "back" — switch via tabs / the pool.
            const item = openItem ?? (project.pool[0] ? { kind: 'instrument' as const, id: project.pool[0].id } : null);
            if (!item) return <div className="te-empty">Add an instrument to the pool, then click it to play it here.</div>;
            if (item.kind === 'instrument') {
              const pool = project.pool.find((p) => p.id === item.id);
              if (!pool) return <div className="te-empty">Click an instrument in the pool.</div>;
              return (
                <InstrumentPanel
                  name={pool.name} kind={pool.kind} flow={pool.flow} gain={pool.gain ?? 1}
                  onGain={(v) => onInstrumentGain(pool.id, v)}
                  onKnob={(nodeId, param, v) => onInstrumentKnob(pool.id, nodeId, param, v)}
                  onKnobRename={(nodeId, param, label) => onInstrumentKnobRename(pool.id, nodeId, param, label)}
                  onEdit={() => editInstrument(pool.id)}
                  onNoteOn={(m) => void liveNoteOn(pool.id, m)} onNoteOff={(m) => liveNoteOff(pool.id, m)} onHit={() => void liveDrumDown(pool.id)}
                  fx={pool.fx ?? []} effects={effects}
                  onFxAdd={(fxId) => onPoolFxAdd(pool.id, fxId)} onFxRemove={(i) => onPoolFxRemove(pool.id, i)}
                  onFxEdit={(i) => onPoolFxEdit(pool.id, i)} onFxKnob={(i, nodeId, param, v) => onPoolFxKnob(pool.id, i, nodeId, param, v)}
                />
              );
            }
            const e = library.find((x) => x.id === item.id && x.group === 'effect');
            if (!e) return null;
            return (
              <InstrumentPanel
                name={e.name} kind="effect" flow={e.flow}
                onKnob={(nodeId, param, v) => onEffectKnob(e.id, nodeId, param, v)}
                onEdit={() => editEffect(e.id)}
              />
            );
          })()}

          {view === 'mix' && (
            <div className="mixer-view">
              <div className="mx-master">
                <FxBar label="Master FX" color="var(--cat-master, var(--accent))" fx={project.masterFx} effects={effects} onAdd={onMasterFxAdd} onRemove={onMasterFxRemove} onEdit={onMasterFxEdit}
                  onKnob={(i, nodeId, param, v) => {
                    mixerRef.current?.masterChain.setParam(i, nodeId, param, v);
                    const insert = projectRef.current.masterFx[i]; const base = insert?.flow ?? (insert && findEntry(insert.fxId)?.flow); if (!insert || !base) return;
                    const flow = setFlowParam(base, nodeId, param, v);
                    setProject((p) => ({ ...p, masterFx: p.masterFx.map((x, j) => (j === i ? { ...x, flow } : x)) }));
                  }} />
              </div>
              <div className="mx-tracks">
                {project.tracks.map((t) => (
                  <div className="mx-strip" key={t.id}>
                    <div className="mx-strip-head">{t.type === 'drums' ? <Drum size={13} /> : t.type === 'audio' ? <AudioWaveform size={13} /> : t.type === 'video' ? <Film size={13} /> : <Music2 size={13} />} {t.name}</div>
                    <input className="mx-vol" type="range" min={0} max={1} step={0.01} value={t.volume} onChange={(e) => setTrackVolume(t.id, parseFloat(e.target.value))} />
                    <FxBar label="Track FX" fx={t.fx} effects={effects} compact
                      onAdd={(fx) => { const ins = fxInsert(fx); mapTrack(t.id, (x) => ({ ...x, fx: [...x.fx, ins] })); rebuildTrackChain(t.id, [...t.fx, ins]); }}
                      onRemove={(i) => { const next = t.fx.filter((_, j) => j !== i); mapTrack(t.id, (x) => ({ ...x, fx: next })); rebuildTrackChain(t.id, next); }}
                      onEdit={(i) => { const insert = t.fx[i]; if (insert) editFxFlow(insert, (f) => { const next = t.fx.map((x, j) => (j === i ? { ...x, flow: f } : x)); mapTrack(t.id, (x) => ({ ...x, fx: next })); rebuildTrackChain(t.id, next); }); }}
                      onKnob={(i, nodeId, param, v) => {
                        mixerRef.current?.trackChain(t.id)?.setParam(i, nodeId, param, v);
                        const insert = t.fx[i]; const base = insert?.flow ?? (insert && findEntry(insert.fxId)?.flow); if (!insert || !base) return;
                        const flow = setFlowParam(base, nodeId, param, v);
                        mapTrack(t.id, (x) => ({ ...x, fx: x.fx.map((y, j) => (j === i ? { ...y, flow } : y)) }));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {editor && <SynflowEditor flow={editor.flow} title={editor.title} onSaved={editor.onSaved} onClose={() => setEditor(null)} />}
      {eqEditor && <EqEditor title={eqEditor.title} settings={eqEditor.settings} sampleRate={eqEditor.sampleRate} getAnalyser={eqEditor.getAnalyser} onChange={eqEditor.onChange} onClose={() => setEqEditor(null)} />}
      {storageSetup && <StorageSetup onFolder={(h2) => adoptFolder(h2, true)} onSkip={() => setStorageSetup(false)} />}
      {exportOpen && (
        <ExportDialog
          hasVideo={project.tracks.some((t) => t.type === 'video' && (t.videoClips?.length ?? 0) > 0)}
          bars={songLengthSlots(project)} secPerBar={project.totalSteps * (60 / project.bpm / project.stepsPerBeat)}
          busy={exporting} progress={exportProgress} phase={exportPhase}
          onClose={() => setExportOpen(false)} onRun={runExport} onExportProject={exportSong}
        />
      )}
      {importing && <ImportOverlay info={importing} />}
    </div>
  );
}
