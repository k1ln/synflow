import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Drum, Music2, Repeat, AudioWaveform, Film, Volume2, VolumeX, Waves, Snowflake, X } from 'lucide-react';
import { RealtimeClock } from './audio/ClockSource';
import { Transport } from './audio/Transport';
import { Scheduler } from './audio/Scheduler';
import { Metronome } from './audio/Metronome';
import { InstrumentHost } from './audio/InstrumentHost';
import { VoicePool } from './audio/VoicePool';
import { Mixer, FxChain, type ResolvedFx } from './audio/Mixer';
import { AudioAssets } from './audio/AudioAssets';
import type { Peaks } from './audio/waveform';
import { AudioClipPlayer } from './audio/AudioClipPlayer';
import { pickAudioFile } from './audio/decodeAudioFile';
import { pickVideoFile, probeVideo, extractAudioFromVideo } from './audio/video';
import { encodeWav } from './audio/wav';
import { splitClipAt } from './audio/clipSplit';
import { Recorder } from './audio/Recorder';
import { useMidiInput, type MidiNoteEvent, type MidiCcEvent } from './audio/useMidiInput';
import { bounceProjectToWav } from './audio/bounce';
import { bounceProjectStream } from './audio/bounceStream';
import { exportVideo, type ExportOpts, type VideoBlobResolver } from './audio/videoExport';
import {
  defaultProject, newNoteId, uid, fxInsert, newBus, blankSteps, activeClipAt, patternLoopLength, songLengthSteps, songLengthSlots, normalizeProject, trackAudible, swingDelaySteps, quantizeNotes,
  clipPatternId, patternContent, patternLengthOf, checkoutPattern, nextPatternName, syncPatterns, snapshotActivePattern, timelineAutoValue, type Pattern, type AutoPoint, type AutomationLane,
  EQ_FX_ID, defaultEq,
  type Project, type Track, type PoolItem, type PianoNote, type FxInsert, type Bus, type LoopRegion, type MusicalKey, type AudioAsset, type AudioClip, type VideoAsset, type VideoClip, type EqSettings,
} from './model/project';
import { midiToFreq } from './model/pitch';
import { type Flow, makeSynthVoice, makeKick } from './synflow/instruments';
import { flowKnobs } from './synflow/knobs';
import { makeFilterFx } from './synflow/effects';
import { LIBRARY, findEntry, cloneFlow, registerEntries, type LibraryEntry } from './synflow/library';
import { fsSupported, restoreFolder, seedLibrary, readAllFlows, writeFlow, pickFolder, saveProject, loadProject, listSongs, songSlug, createBounceWritable, createExportWritable, listAllAssets, listAudioFiles, writeVideoFile, readVideoFile } from './synflow/flowStore';
import { ExportDialog } from './ui/ExportDialog';
import { ProgramMonitor } from './ui/ProgramMonitor';
import { loadTitleFonts } from './fonts';
import { TopBar, type ViewId } from './ui/TopBar';
import { Pool } from './ui/Pool';
import { TrackEditor, type TrackEditorHandlers, type AutoTarget } from './ui/TrackEditor';
import { FxBar } from './ui/FxBar';
import { Arrange } from './ui/Arrange';
import { InstrumentPanel } from './ui/InstrumentPanel';
import { CustomUiEditor } from './ui/CustomUiEditor';
import { SynflowEditor } from './ui/SynflowEditor';
import { EqEditor } from './ui/EqEditor';
import { StorageSetup } from './ui/StorageSetup';
import { Meter } from './ui/Meter';
import { LoudnessMeter } from './ui/LoudnessMeter';
import { SpectrumAnalyzer } from './ui/SpectrumAnalyzer';
import { slicePeaks } from './audio/waveform';
import { downloadMidi, parseMidiFile } from './audio/midiFile';
import { AddPluginDialog, type PluginPick } from './ui/AddPluginDialog';
import { makeVstaiFlow, isVstaiFlow, vstaiHtmlOf } from './synflow/vstai';
import { VstaiGui } from './ui/VstaiGui';

type ImportInfo = { name: string; phase: 'reading' | 'decoding'; read: number; total: number; startedAt: number };

/** Compact pan readout: "C", "L42", "R42". */
const panLabel = (p: number): string => { const v = Math.round(p * 100); return v === 0 ? 'C' : v < 0 ? `L${-v}` : `R${v}`; };

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
  const [view, setView] = useState<ViewId>('song');
  const [browserOpen, setBrowserOpen] = useState(true);
  const [armed, setArmed] = useState(false);
  const [selTrack, setSelTrack] = useState<string>(() => defaultProject().tracks[0]?.id ?? '');
  const [armedPool, setArmedPool] = useState<string | null>(null);
  // `useId` set → the Live view is scoped to ONE track instance (edits its own flow),
  // not the shared pool template.
  const [openItem, setOpenItem] = useState<{ kind: 'instrument' | 'effect'; id: string; useId?: string } | null>(null);
  const [songMode, setSongMode] = useState(false);
  const songModeRef = useRef(false); songModeRef.current = songMode;
  const [editor, setEditor] = useState<{ flow: Flow; title: string; onSaved: (f: Flow) => void } | null>(null);
  const [eqEditor, setEqEditor] = useState<{ title: string; settings: EqSettings; sampleRate: number; getAnalyser: () => AnalyserNode | null; onChange: (s: EqSettings, commit: boolean) => void } | null>(null);
  const [customUiEdit, setCustomUiEdit] = useState<string | null>(null); // poolId whose custom UI is being edited
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
  const metronomeRef = useRef<Metronome | null>(null);
  const [metronome, setMetronome] = useState(false);
  const assetsMgrRef = useRef<AudioAssets | null>(null);                // audio asset cache (disk/embedded)
  const audioPlayersRef = useRef<Map<string, AudioClipPlayer>>(new Map()); // audio-track clip players, keyed by track.id
  const videoBlobsRef = useRef<Map<string, Blob>>(new Map());           // videoAssetId → container Blob (session cache for poster/export)
  const videoUrlsRef = useRef<Map<string, string>>(new Map());          // videoAssetId → object URL (program-monitor preview)
  const projectRef = useRef(project); projectRef.current = project;
  const currentStepRef = useRef(currentStep); currentStepRef.current = currentStep;
  const isPlayingRef = useRef(isPlaying); isPlayingRef.current = isPlaying;
  const viewRef = useRef(view); viewRef.current = view;
  const selTrackRef = useRef(selTrack); selTrackRef.current = selTrack;
  const splitAtPlayheadRef = useRef<() => void>(() => {}); // set once the split handlers exist; driven by the `S` shortcut
  const armedPoolRef = useRef(armedPool); armedPoolRef.current = armedPool;
  // Pool-level Live is a pure audition sandbox: knob/gain/sample tweaks made there
  // are session-only (drive liveSynths/liveDrums directly) and NEVER touch
  // project.pool or any track's real engine — otherwise "just jamming" with a
  // shared instrument would silently rewrite what every track using it plays.
  // (Track Live — a track's own use-scoped session — is unaffected: it already
  // writes to that use's own independent flow.) Keyed by poolId, kept only for
  // this tab's lifetime; falls back to the real pool value until first touched.
  const [liveFlowOverride, setLiveFlowOverride] = useState<Record<string, Flow>>({});
  const liveFlowOverrideRef = useRef(liveFlowOverride); liveFlowOverrideRef.current = liveFlowOverride;
  const [liveGainOverride, setLiveGainOverride] = useState<Record<string, number>>({});
  const liveGainOverrideRef = useRef(liveGainOverride); liveGainOverrideRef.current = liveGainOverride;
  const liveFlowFor = (pool: PoolItem): Flow => liveFlowOverride[pool.id] ?? pool.flow;
  const liveGainFor = (pool: PoolItem): number => liveGainOverride[pool.id] ?? pool.gain ?? 1;
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
        if (last) { const raw = await loadProject(handle, last); if (raw && !cancelled) { const proj = normalizeProject(raw); setProject(proj); resetHistory(proj); setSelTrack(proj.tracks[0]?.id ?? ''); } }
      } else if (fsSupported) {
        setStorageSetup(true);
      } else {
        const local = localStorage.getItem('mothscilla:localSong');
        if (local) { try { const proj = normalizeProject(JSON.parse(local)); if (!cancelled) { setProject(proj); resetHistory(proj); setSelTrack(proj.tracks[0]?.id ?? ''); } } catch { /* ignore */ } }
      }
      // Crash recovery: offer the autosave when it's newer than the last explicit save.
      if (!cancelled) {
        try {
          const raw = localStorage.getItem('mothscilla:autosave');
          const auto = raw ? JSON.parse(raw) : null;
          const lastSave = Number(localStorage.getItem('mothscilla:lastSaveAt') || 0);
          if (auto?.project && auto.at > lastSave &&
              window.confirm(`Restore unsaved changes from your last session? (autosaved ${new Date(auto.at).toLocaleString()})`)) {
            const proj = normalizeProject(auto.project);
            setProject(proj); resetHistory(proj); setSelTrack(proj.tracks[0]?.id ?? '');
          } else if (auto) {
            localStorage.removeItem('mothscilla:autosave');   // declined → don't ask again
          }
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, [adoptFolder]);

  // ── Autosave (crash recovery): periodic + on tab hide/close. The song JSON is
  // small (disk-based audio stays a reference), so localStorage is enough. ──────
  const autosaveDirtyRef = useRef(false);
  const bootedRef = useRef(false);
  useEffect(() => {
    if (!bootedRef.current) { bootedRef.current = true; return; }   // ignore the initial render
    autosaveDirtyRef.current = true;
  }, [project]);
  const writeAutosave = useCallback(() => {
    if (!autosaveDirtyRef.current) return;
    try {
      localStorage.setItem('mothscilla:autosave', JSON.stringify({ at: Date.now(), project: syncPatterns(projectRef.current) }));
      autosaveDirtyRef.current = false;
    } catch { /* quota exceeded (embedded audio) — skip */ }
  }, []);
  useEffect(() => {
    const t = window.setInterval(writeAutosave, 30_000);
    const flush = () => writeAutosave();
    window.addEventListener('beforeunload', flush);
    const onHide = () => { if (document.hidden) writeAutosave(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { window.clearInterval(t); window.removeEventListener('beforeunload', flush); document.removeEventListener('visibilitychange', onHide); };
  }, [writeAutosave]);

  const addFromFolder = useCallback(async () => {
    const h = await pickFolder().catch(() => null);
    if (h) await adoptFolder(h, true);
  }, [adoptFolder]);

  // Return a copy of a flow with node.data[param] set (knob value lives in the flow).
  const setFlowParam = (flow: Flow, nodeId: string, param: string, value: number | string): Flow =>
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
    // Prefer this instance's own flow (independent per-track params); fall back to
    // the pool template for legacy uses that predate per-use flow.
    const use = projectRef.current.tracks.flatMap((t) => t.uses).find((u) => u.id === useId);
    const flow = use?.flow ?? pool.flow;
    if (pool.kind === 'synth') {
      if (!poolsRef.current.has(useId)) poolsRef.current.set(useId, await VoicePool.create(() => new InstrumentHost(ctx, flow, dest), voices ?? 6, () => ctx.currentTime));
    } else if (!hostsRef.current.has(useId)) {
      const host = new InstrumentHost(ctx, flow, dest); await host.load();
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
    for (const bus of proj.buses ?? []) { const b = mixer.bus(bus.id, bus.volume); await b.chain.setChain(resolveFx(bus.fx)); }
    for (const track of proj.tracks) {
      const t = mixer.track(track.id, track.volume);
      mixer.setTrackPan(track.id, track.pan ?? 0);
      mixer.setTrackTrim(track.id, track.trim ?? 1, !!track.phase);
      mixer.setTrackGate(track.id, trackAudible(track, proj.tracks));
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
    for (const track of proj.tracks) for (const s of track.sends ?? []) mixer.setSend(track.id, s.busId, s.level, s.pre);
    for (const track of proj.tracks) mixer.setTrackOutput(track.id, track.outputBusId ?? null);
    for (const track of proj.tracks) {
      if (track.sidechain && proj.tracks.some((k) => k.id === track.sidechain!.keyTrackId)) mixer.setSidechain(track.id, track.sidechain.keyTrackId, track.sidechain.amount, track.sidechain.release);
      else mixer.clearSidechain(track.id);
    }
  }, [buildUse, ensureAssets]);

  // ── Undo / redo history ────────────────────────────────────────────────────
  // Snapshot the (immutable) project on every change, coalescing a burst of rapid
  // edits (e.g. a drag) into one step. Undo/redo restore a snapshot and rebuild
  // audio. View, transport mode, playhead and selection live outside the project,
  // so they're left untouched. Loading/opening a song rebases history (resetHistory).
  const HISTORY_MAX = 80, HISTORY_DEBOUNCE = 400;
  const historyRef = useRef<{ stack: Project[]; index: number }>({ stack: [project], index: 0 });
  const applyingHistoryRef = useRef(false);
  const histTimerRef = useRef<number | null>(null);
  const [histUI, setHistUI] = useState({ canUndo: false, canRedo: false });
  const syncHistUI = () => { const h = historyRef.current; setHistUI({ canUndo: h.index > 0, canRedo: h.index < h.stack.length - 1 }); };
  const resetHistory = (p: Project) => {
    if (histTimerRef.current != null) { clearTimeout(histTimerRef.current); histTimerRef.current = null; }
    historyRef.current = { stack: [p], index: 0 };
    syncHistUI();
  };
  const commitHistory = () => {
    if (histTimerRef.current != null) { clearTimeout(histTimerRef.current); histTimerRef.current = null; }
    const h = historyRef.current, present = projectRef.current;
    if (present === h.stack[h.index]) return;                 // nothing new since the last checkpoint
    const stack = h.stack.slice(0, h.index + 1);              // a fresh edit discards the redo branch
    stack.push(present);
    if (stack.length > HISTORY_MAX) stack.splice(0, stack.length - HISTORY_MAX);
    historyRef.current = { stack, index: stack.length - 1 };
    syncHistUI();
  };
  const applyHistory = (p: Project) => {
    applyingHistoryRef.current = true;
    projectRef.current = p; setProject(p);
    setSelTrack((id) => (p.tracks.some((t) => t.id === id) ? id : p.tracks[0]?.id ?? ''));
    void buildAudio(); syncHistUI();
  };
  const undo = () => { commitHistory(); const h = historyRef.current; if (h.index <= 0) return; const index = h.index - 1; historyRef.current = { stack: h.stack, index }; applyHistory(h.stack[index]); };
  const redo = () => { const h = historyRef.current; if (h.index >= h.stack.length - 1) return; const index = h.index + 1; historyRef.current = { stack: h.stack, index }; applyHistory(h.stack[index]); };
  const histRef = useRef({ undo, redo }); histRef.current = { undo, redo };

  // Watch the project: schedule a coalesced snapshot (skip our own undo/redo applies).
  useEffect(() => {
    if (applyingHistoryRef.current) { applyingHistoryRef.current = false; return; }
    if (project === historyRef.current.stack[historyRef.current.index]) return;
    const id = window.setTimeout(commitHistory, HISTORY_DEBOUNCE);
    histTimerRef.current = id;
    return () => clearTimeout(id);
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global shortcut map (all ignored inside text fields):
  //   Space = play/stop · Home/Return-to-zero = seek 0 · S = split at playhead
  //   ⌘Z / ⌘⇧Z / ⌘Y = undo/redo · Delete = remove selected clip
  //   ⌘C/⌘X/⌘V = copy/cut/paste clip · ⌘D = duplicate clip
  // Handlers live in keyActionsRef (updated every render) so this listener mounts once.
  const keyActionsRef = useRef<Record<string, () => void>>({});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      const act = (name: string) => { e.preventDefault(); keyActionsRef.current[name]?.(); };
      if (e.metaKey || e.ctrlKey) {
        if (k === 'z' || k === 'y') { e.preventDefault(); if (k === 'y' || e.shiftKey) histRef.current.redo(); else histRef.current.undo(); return; }
        if (k === 'c') return act('copyClip');
        if (k === 'x') return act('cutClip');
        if (k === 'v') return act('pasteClip');
        if (k === 'd') return act('duplicateClip');
        return;
      }
      if (k === ' ') return act('togglePlay');
      if (k === 'home') return act('rewind');
      if (k === 'delete' || k === 'backspace') return act('deleteClip');
      if (k === 's' && !e.altKey) { e.preventDefault(); splitAtPlayheadRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Apply an automation lane value / linear segment to its target, by scope. Track
  // volume + track-FX go through the Mixer; INSTRUMENT lanes reach the instrument's
  // own engine (synflow knobs → AudioParams; .vstai params → the worklet port) and
  // its insert-FX chain; master-FX go through the master chain. Refs-only, so these
  // stay correct inside the long-lived scheduler closure.
  const applyAutoValue = (trackId: string, lane: AutomationLane, v: number, when: number) => {
    if (lane.scope === 'instrument' && lane.useId) {
      if (lane.fxIndex != null) mixerRef.current?.useChain(lane.useId)?.setParam(lane.fxIndex, lane.nodeId, lane.param, v, when);
      else { poolsRef.current.get(lane.useId)?.setParamAt(lane.nodeId, lane.param, v, when); hostsRef.current.get(lane.useId)?.setParamAt(lane.nodeId, lane.param, v, when); }
    } else if (lane.scope === 'master' && lane.fxIndex != null) {
      mixerRef.current?.masterChain.setParam(lane.fxIndex, lane.nodeId, lane.param, v, when);
    } else {
      mixerRef.current?.applyAutomation(trackId, lane, v, when);   // track volume / track-FX
    }
  };
  const applyAutoSegment = (trackId: string, lane: AutomationLane, v0: number, t0: number, v1: number, t1: number) => {
    if (lane.scope === 'instrument' && lane.useId) {
      if (lane.fxIndex != null) mixerRef.current?.useChain(lane.useId)?.setParamSegment(lane.fxIndex, lane.nodeId, lane.param, v0, t0, v1, t1);
      else { poolsRef.current.get(lane.useId)?.setParamSegment(lane.nodeId, lane.param, v0, t0, v1, t1); hostsRef.current.get(lane.useId)?.setParamSegment(lane.nodeId, lane.param, v0, t0, v1, t1); }
    } else if (lane.scope === 'master' && lane.fxIndex != null) {
      mixerRef.current?.masterChain.setParamSegment(lane.fxIndex, lane.nodeId, lane.param, v0, t0, v1, t1);
    } else {
      mixerRef.current?.applyAutomationSegment(trackId, lane, v0, t0, v1, t1);
    }
  };

  const ensureAudio = useCallback(async () => {
    if (ctxRef.current) return;
    const ctx = new AudioContext(); ctxRef.current = ctx;
    mixerRef.current = new Mixer(ctx);
    metronomeRef.current = new Metronome(ctx);
    metronomeRef.current.enabled = metronome;
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
      const globalSwing = proj.swing ?? 0;
      // Metronome: click on each beat, accenting the bar downbeat.
      const metro = metronomeRef.current;
      if (metro?.enabled && s % proj.stepsPerBeat === 0) metro.click(time, s % proj.totalSteps === 0);
      for (const track of proj.tracks) {
        if (!trackAudible(track, proj.tracks)) continue;   // mute/solo (read live; the gate also silences instantly)
        const swingMs = swingDelaySteps(s, track.swing ?? globalSwing) * stepMs;   // off-beat groove (per-track override)
        // Timeline automation (song-scope curves): schedule this step's exact linear
        // segment on the audio clock — sample-accurate ramps, no zipper.
        if (song) for (const lane of track.automation ?? []) {
          if (!lane.points?.length) continue;
          const v0 = timelineAutoValue(lane.points, s), v1 = timelineAutoValue(lane.points, s + 1);
          if (v0 != null && v1 != null) applyAutoSegment(track.id, lane, v0, time, v1, time + stepMs / 1000);
        }
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
        // LOOP (the track's loop toggle) = play the pattern continuously: through the
        // whole song in Song mode, or as the live gate in Pattern mode. When loop is OFF
        // in Song mode, the track's clips decide and each clip restarts the pattern at
        // its start (clip-anchored phase). Multi-bar patterns play from step 0 either way.
        const activeClip = song && !track.loop ? activeClipAt(track.clips, slot, songLengthSlots(proj)) : null;
        if (song ? (!track.loop && !activeClip) : !track.loop) continue;
        // Which pattern plays here: the clip's own, or the active one (live loop /
        // pattern mode). Content is resolved per use via patternContent below.
        const pid = activeClip ? clipPatternId(track, activeClip) : (track.activePatternId ?? undefined);
        const len = patternLengthOf(track, pid);
        const originSteps = activeClip ? activeClip.start * proj.totalSteps : 0;
        const step = (((s - originSteps) % len) + len) % len;    // each pattern loops at its own length
        // Everything below is scheduled ON THE AUDIO CLOCK (`time` is this step's
        // exact AudioContext time from the lookahead scheduler): notes, releases and
        // automation execute sample-accurately regardless of main-thread jitter.
        for (const lane of track.automation ?? []) {   // drive automated params (volume / track-FX) per step
          if (lane.points?.length) continue;           // timeline lanes handled above
          const len = lane.values.length || 1; const v = lane.values[((step % len) + len) % len];
          if (v != null) applyAutoValue(track.id, lane, v, time + swingMs / 1000);
        }
        for (const use of track.uses) {
          if (use.muted) continue;
          const content = patternContent(track, pid, use.id);
          if (track.type === 'synth' && content.notes) {
            const vp = poolsRef.current.get(use.id); if (!vp) continue;
            for (const n of content.notes) {
              // free placement: trigger the note in the step it starts in, with a
              // sub-step delay for the fractional part.
              if (Math.floor(n.start) !== step) continue;
              const sub = (n.start - step) * stepMs + swingMs;        // ms into this step (+ swing)
              const f = midiToFreq(n.midi);
              const onAt = time + sub / 1000;
              vp.noteOn(n.id, f, n.velocity ?? 1, onAt);
              vp.noteOff(n.id, onAt + (n.length * stepMs) / 1000);
            }
          } else if (track.type === 'drums' && content.steps?.[step]) {
            const host = hostsRef.current.get(use.id); if (!host) continue;
            const onAt = time + swingMs / 1000;
            host.trigger({}, onAt);
            host.release({}, onAt + gateMs / 1000);
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
  // Hi-res waveform for the on-screen part of a clip. `getClipPeaks` is the sync fast
  // path (peaks from a hot RAM buffer); `getClipPeaksAsync` reads ONLY the visible byte
  // range off disk for large/streamed files, so nothing decodes the whole file.
  const getClipPeaks = useCallback((assetId: string, startSec: number, endSec: number, buckets: number) => {
    const asset = projectRef.current.assets.find((a) => a.id === assetId);
    return asset ? ensureAssets().peaksWindow(asset, startSec, endSec, buckets) : null;
  }, [ensureAssets]);
  const getClipPeaksAsync = useCallback((assetId: string, startSec: number, endSec: number, buckets: number): Promise<Peaks | null> => {
    const asset = projectRef.current.assets.find((a) => a.id === assetId);
    return asset ? ensureAssets().peaksWindowFromDisk(asset, startSec, endSec, buckets) : Promise.resolve<Peaks | null>(null);
  }, [ensureAssets]);

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
      if (track.type !== 'audio' || !trackAudible(track, proj.tracks)) continue;
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

  // Apply the project's loop region to the scheduler (song mode only). Reads refs
  // so it's safe from play() and effects alike.
  const syncSchedulerLoop = () => {
    const s = schedulerRef.current; if (!s) return;
    const proj = projectRef.current; const lp = proj.loop;
    if (songModeRef.current && lp?.on && lp.endBar > lp.startBar) {
      s.loopStart = Math.max(0, Math.floor(lp.startBar)) * proj.totalSteps;
      s.loopEnd = Math.floor(lp.endBar) * proj.totalSteps;
    } else { s.loopEnd = 0; }
  };

  const play = useCallback(async () => {
    await ensureAudio();
    await ctxRef.current!.resume();
    transportRef.current!.bpm = projectRef.current.bpm;
    const proj = projectRef.current;
    schedulerRef.current!.totalSteps = songModeRef.current ? songLengthSteps(proj) : patternLoopLength(proj.tracks);
    syncSchedulerLoop();
    transportRef.current!.start(seekRef.current); schedulerRef.current!.start(seekRef.current);
    primeAudioClips(seekRef.current);
    setIsPlaying(true);
  }, [ensureAudio]);

  // Keep the loop length in sync as content changes (e.g. a long import grows the
  // song) so the full clip plays without re-pressing play.
  useEffect(() => {
    const s = schedulerRef.current; if (!s) return;
    s.totalSteps = songMode ? songLengthSteps(project) : patternLoopLength(project.tracks);
    const lp = project.loop;
    if (songMode && lp?.on && lp.endBar > lp.startBar) { s.loopStart = Math.max(0, Math.floor(lp.startBar)) * project.totalSteps; s.loopEnd = Math.floor(lp.endBar) * project.totalSteps; }
    else { s.loopEnd = 0; }
  }, [project, songMode]);

  const setLoop = (patch: Partial<LoopRegion>) => setProject((p) => {
    const def: LoopRegion = p.loop ?? { on: false, startBar: 0, endBar: Math.max(1, Math.min(4, p.songSlots)) };
    const next: LoopRegion = { ...def, ...patch };
    next.startBar = Math.max(0, Math.floor(next.startBar));
    next.endBar = Math.max(next.startBar + 1, Math.floor(next.endBar));
    return { ...p, loop: next };
  });

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
    const wasPlaying = isPlayingRef.current;
    schedulerRef.current?.stop(); transportRef.current?.stop();
    for (const vp of poolsRef.current.values()) vp.allOff();
    for (const p of audioPlayersRef.current.values()) p.stopAll();
    stopAudition();
    for (const t of projectRef.current.tracks) mixerRef.current?.setTrackVolume(t.id, t.volume); // restore static volume after volume automation
    setIsPlaying(false);
    // First stop (while playing) returns the playhead to where playback started;
    // pressing stop again (already stopped) rewinds to the very beginning.
    if (wasPlaying) setCurrentStep(seekRef.current);
    else { seekRef.current = 0; setCurrentStep(0); }
  }, [stopAudition]);

  const setBpm = (bpm: number) => { setProject((p) => ({ ...p, bpm })); if (transportRef.current) transportRef.current.bpm = bpm; };
  const setSwing = (swing: number) => setProject((p) => ({ ...p, swing }));  // scheduler reads projectRef live

  // Time signature = beats-per-bar (denominator fixed at quarter). Resizes the bar
  // (totalSteps) + drum step rows; metronome accent + bar grid follow totalSteps.
  const setTimeSig = (beatsPerBar: number) => setProject((p) => {
    const bpb = Math.max(1, Math.min(16, Math.floor(beatsPerBar)));
    const total = bpb * p.stepsPerBeat;
    if (total === p.totalSteps) return p;
    const oldTotal = p.totalSteps;
    const resize = (steps: boolean[]) => Array.from({ length: total }, (_, i) => steps?.[i] ?? false);
    const resizeVals = (vals: (number | null)[]) => Array.from({ length: total }, (_, i) => vals?.[i] ?? null);
    return {
      ...p,
      totalSteps: total,
      tracks: p.tracks.map((t) => ({
        ...t,
        length: t.length === oldTotal ? total : t.length, // keep 1-bar tracks synced; leave polymeter alone
        uses: t.uses.map((u) => (u.steps ? { ...u, steps: resize(u.steps) } : u)),
        // Keep automation lanes in step with the new bar length (they'd otherwise
        // silently shift against the pattern after a meter change).
        automation: (t.automation ?? []).map((l) => (l.values.length === oldTotal ? { ...l, values: resizeVals(l.values) } : l)),
        // Pattern snapshots hold step rows too — resize the 1-bar ones the same way.
        patterns: t.patterns?.map((pt) => (pt.length === oldTotal
          ? { ...pt, length: total, steps: Object.fromEntries(Object.entries(pt.steps).map(([k, v]) => [k, resize(v)])) }
          : pt)),
      })),
    };
  });

  // ── Timeline markers ────────────────────────────────────────────────────────
  const addMarker = (step: number) => setProject((p) => ({ ...p, markers: [...(p.markers ?? []), { id: uid('mk'), name: `Marker ${(p.markers?.length ?? 0) + 1}`, step: Math.max(0, Math.round(step)) }] }));
  const renameMarker = (id: string, name: string) => setProject((p) => ({ ...p, markers: (p.markers ?? []).map((m) => (m.id === id ? { ...m, name } : m)) }));
  const removeMarker = (id: string) => setProject((p) => ({ ...p, markers: (p.markers ?? []).filter((m) => m.id !== id) }));
  const toggleMetronome = () => setMetronome((on) => { const next = !on; if (metronomeRef.current) metronomeRef.current.enabled = next; return next; });

  // ─── song save / load (the whole project) ──────────────────────────────────
  const flashSaved = () => { setSaved(true); window.setTimeout(() => setSaved(false), 1600); };

  const saveSong = useCallback(async () => {
    const root = folderRef.current;
    if (root) {
      try {
        await ensureAssets().persistDisk(projectRef.current.assets); // large audio stays on disk (streamed)
        const file = await saveProject(root, syncPatterns(projectRef.current)); localStorage.setItem('mothscilla:lastSong', file); localStorage.setItem('mothscilla:lastSaveAt', String(Date.now())); localStorage.removeItem('mothscilla:autosave'); flashSaved(); console.info('[Mothscilla] saved song to disk:', file);
      }
      catch (e) { console.warn('[Mothscilla] save song failed', e); }
    } else {
      try { localStorage.setItem('mothscilla:localSong', JSON.stringify(syncPatterns(projectRef.current))); localStorage.setItem('mothscilla:lastSaveAt', String(Date.now())); localStorage.removeItem('mothscilla:autosave'); flashSaved(); console.info('[Mothscilla] no folder — saved song to localStorage'); } catch (e) { console.warn('[Mothscilla] save song failed', e); }
    }
  }, [ensureAssets]);

  // Export a portable song: embed every audio asset as base64 and download it.
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportSong = useCallback(async () => {
    setExporting(true); setExportProgress(0);
    try {
      const proj = syncPatterns(projectRef.current);
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
    resetHistory(proj);                 // a freshly loaded/new song is the history baseline
    setSelTrack(proj.tracks[0]?.id ?? '');
    setOpenItem(null); setEditor(null);
  }, [resetAudio]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const auditionIdRef = useRef(0); // unique, decreasing ids — chord notes audition in the same ms, so performance.now() would collide and leak voices
  const audition = useCallback(async (useId: string, payload?: { frequency: number }) => {
    await ensureAudio(); await ctxRef.current?.resume();
    if (!hostsRef.current.has(useId) && !poolsRef.current.has(useId)) await buildAudio();
    const vp = poolsRef.current.get(useId);
    if (vp) { const id = --auditionIdRef.current; vp.noteOn(id, payload?.frequency ?? 440); window.setTimeout(() => vp.noteOff(id), 350); return; }
    const host = hostsRef.current.get(useId);
    if (host) { host.trigger(); window.setTimeout(() => host.release(), 220); }
  }, [ensureAudio, buildAudio]);

  // Piano-roll key gutter: hold a note (ADSR on at mouse-down, release at mouse-up)
  // through the use's own voice pool. midi doubles as the voice id (no clash with
  // scheduled notes, whose ids are >1000).
  const useNoteOn = useCallback(async (useId: string, midi: number, velocity = 1) => {
    await ensureAudio(); await ctxRef.current?.resume();
    if (!poolsRef.current.has(useId)) await buildAudio();
    poolsRef.current.get(useId)?.noteOn(midi, midiToFreq(midi), velocity);
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

  const liveNoteOn = useCallback(async (poolId: string, midi: number, velocity = 1) => { await buildLive(poolId); liveSynthsRef.current.get(poolId)?.noteOn(midi, midiToFreq(midi), velocity); }, [buildLive]);
  const liveNoteOff = useCallback((poolId: string, midi: number) => { liveSynthsRef.current.get(poolId)?.noteOff(midi); }, []);
  const liveDrumDown = useCallback(async (poolId: string) => { await buildLive(poolId); const h = liveDrumsRef.current.get(poolId); h?.trigger(); window.setTimeout(() => h?.release(), 220); }, [buildLive]);

  // ── Web MIDI keyboard input ─────────────────────────────────────────────────
  // Route hardware MIDI to whatever the on-screen keyboard would play: the armed
  // pool instrument on the Live page, else the selected synth track's instrument.
  const midiTarget = (): { kind: 'use'; useId: string } | { kind: 'live'; poolId: string } | null => {
    const proj = projectRef.current;
    const armedSynth = () => { const p = proj.pool.find((x) => x.id === armedPoolRef.current); return p?.kind === 'synth' ? p : null; };
    if (viewRef.current === 'live') { const p = armedSynth(); if (p) return { kind: 'live', poolId: p.id }; }
    const t = proj.tracks.find((x) => x.id === selTrackRef.current);
    if (t?.type === 'synth' && t.uses[0]) return { kind: 'use', useId: t.uses[0].id };
    const p = armedSynth(); if (p) return { kind: 'live', poolId: p.id };
    return null;
  };
  const routeMidi = (e: MidiNoteEvent) => {
    const tgt = midiTarget(); if (!tgt) return;
    if (e.type === 'on') {
      if (tgt.kind === 'use') void useNoteOn(tgt.useId, e.midi, e.velocity);
      else void liveNoteOn(tgt.poolId, e.midi, e.velocity);
    } else {
      if (tgt.kind === 'use') useNoteOff(tgt.useId, e.midi);
      else liveNoteOff(tgt.poolId, e.midi);
    }
  };
  const midiHandlerRef = useRef(routeMidi); midiHandlerRef.current = routeMidi;

  // ── MIDI learn: map hardware CCs to DAW controls (track volume/pan, master). ──
  // Flow: arm learn (TopBar) → touch a fader in the UI → move a hardware knob.
  // Mappings persist in localStorage and apply on every CC message.
  type MidiMapTarget = { kind: 'trackVolume'; trackId: string } | { kind: 'trackPan'; trackId: string };
  const [midiLearn, setMidiLearn] = useState<{ active: boolean; target: MidiMapTarget | null }>({ active: false, target: null });
  const midiLearnRef = useRef(midiLearn); midiLearnRef.current = midiLearn;
  const midiMapRef = useRef<Record<number, MidiMapTarget>>({});
  useEffect(() => { try { midiMapRef.current = JSON.parse(localStorage.getItem('mothscilla:midiMap') || '{}'); } catch { /* ignore */ } }, []);
  /** UI controls report a touch here so an armed learn latches onto them. */
  const midiLearnTouch = (target: MidiMapTarget) => {
    if (midiLearnRef.current.active) setMidiLearn({ active: true, target });
  };
  const applyMidiTarget = (target: MidiMapTarget, value: number) => {
    if (target.kind === 'trackVolume') setTrackVolume(target.trackId, value);
    else setTrackPan(target.trackId, value * 2 - 1);
  };
  const routeCc = (e: MidiCcEvent) => {
    const learn = midiLearnRef.current;
    if (learn.active && learn.target) {
      midiMapRef.current = { ...midiMapRef.current, [e.cc]: learn.target };
      try { localStorage.setItem('mothscilla:midiMap', JSON.stringify(midiMapRef.current)); } catch { /* ignore */ }
      setMidiLearn({ active: false, target: null });
      return;
    }
    const target = midiMapRef.current[e.cc];
    if (target) applyMidiTarget(target, e.value);
  };
  const ccHandlerRef = useRef(routeCc); ccHandlerRef.current = routeCc;
  const midi = useMidiInput((e) => midiHandlerRef.current(e), (e) => ccHandlerRef.current(e));

  // Clicking a pool item goes to the Live tab, which shows that item's view.
  const openInstrument = (poolId: string) => {
    setArmedPool(poolId);
    setOpenItem({ kind: 'instrument', id: poolId });
    setView('live');
    void buildLive(poolId);
  };
  const openEffectPage = (effectId: string) => { setOpenItem({ kind: 'effect', id: effectId }); setView('live'); };
  // Tweak an effect's exposed knob: update the library default + persist (future inserts use it).
  const onEffectKnob = (effectId: string, nodeId: string, param: string, value: number | string) => {
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
  const onPoolFxKnob = (poolId: string, i: number, nodeId: string, param: string, value: number | string) => {
    for (const u of usesOfPool(poolId)) mixerRef.current?.usePoolChain(u.id)?.setParam(i, nodeId, param, value);
    liveFxRef.current.get(poolId)?.setParam(i, nodeId, param, value);
    const insert = poolById(poolId)?.fx?.[i]; const base = insert?.flow ?? (insert && findEntry(insert.fxId)?.flow); if (!insert || !base) return;
    const flow = setFlowParam(base, nodeId, param, value);
    mapPool(poolId, (pi) => ({ ...pi, fx: (pi.fx ?? []).map((x, j) => (j === i ? { ...x, flow } : x)) }));
  };

  // Tweak an exposed knob from pool-level Live (audition sandbox): drive the live
  // engine only, and keep the new value in the session-only override so the panel
  // reflects it — the real pool flow (and every track that plays it) is untouched.
  const onInstrumentKnob = (poolId: string, nodeId: string, param: string, value: number | string) => {
    liveSynthsRef.current.get(poolId)?.setParam(nodeId, param, value);
    liveDrumsRef.current.get(poolId)?.setParam(nodeId, param, value);
    const pool = projectRef.current.pool.find((p) => p.id === poolId); if (!pool) return;
    const base = liveFlowOverrideRef.current[poolId] ?? pool.flow;
    setLiveFlowOverride((m) => ({ ...m, [poolId]: setFlowParam(base, nodeId, param, value) }));
  };

  // Rename an exposed knob's label — session-only, same reasoning as onInstrumentKnob.
  const onInstrumentKnobRename = (poolId: string, nodeId: string, param: string, label: string) => {
    const pool = projectRef.current.pool.find((p) => p.id === poolId); if (!pool) return;
    const base = liveFlowOverrideRef.current[poolId] ?? pool.flow;
    setLiveFlowOverride((m) => ({ ...m, [poolId]: setFlowKnobLabel(base, nodeId, param, label) }));
  };

  // Save a custom UI: keep it on the pool item (per-song) AND embed it in the flow
  // so it persists to disk and travels with the instrument into other songs.
  const saveCustomUi = (poolId: string, html: string) => {
    const pool = projectRef.current.pool.find((p) => p.id === poolId); if (!pool) return;
    const flow = { ...pool.flow, customUi: html };
    mapPool(poolId, (pi) => ({ ...pi, customUi: html, flow }));
    persistDebounced(`instrument:${pool.libId ?? pool.id}`, { group: 'instrument', id: pool.libId ?? pool.id, name: pool.name, category: pool.kind === 'synth' ? 'Synths' : 'Drums', kind: pool.kind === 'synth' ? 'piano' : 'step', flow });
  };

  const onInstrumentGain = (poolId: string, v: number) => {
    mapPool(poolId, (pi) => ({ ...pi, gain: v }));
    for (const u of usesOfPool(poolId)) mixerRef.current?.setUseGain(u.id, v);
    const g = liveGainRef.current.get(poolId); if (g) g.gain.value = v;
  };
  // Pool-level Live's own Gain knob (audition sandbox): session-only, mirrors
  // onInstrumentKnob — never writes pool.gain nor touches a track's real strip.
  const onLiveInstrumentGain = (poolId: string, v: number) => {
    const g = liveGainRef.current.get(poolId); if (g) g.gain.value = v;
    setLiveGainOverride((m) => ({ ...m, [poolId]: v }));
  };

  // ── Per-use instrument edits: change ONE track instance's params, independent
  //    of the pool template and other tracks. Live to this use's engine + persist
  //    to the use's own flow. ─────────────────────────────────────────────────
  const useFlowBase = (u: Track['uses'][number]): Flow | undefined => u.flow ?? projectRef.current.pool.find((p) => p.id === u.poolId)?.flow;
  const onUseInstrumentKnob = (useId: string, nodeId: string, param: string, value: number | string) => {
    poolsRef.current.get(useId)?.setParam(nodeId, param, value);
    hostsRef.current.get(useId)?.setParam(nodeId, param, value);
    mapUse(useId, (u) => { const base = useFlowBase(u); return base ? { ...u, flow: setFlowParam(base, nodeId, param, value) } : u; });
  };
  const onUseInstrumentKnobRename = (useId: string, nodeId: string, param: string, label: string) => {
    mapUse(useId, (u) => { const base = useFlowBase(u); return base ? { ...u, flow: setFlowKnobLabel(base, nodeId, param, label) } : u; });
  };
  const vstaiUseSample = (useId: string, msg: { channels: number; frames: number; rate: number; data: Float32Array }) => {
    poolsRef.current.get(useId)?.postToNode('vstai', { type: 'sample', ...msg });
    hostsRef.current.get(useId)?.postToNode('vstai', { type: 'sample', ...msg });
  };
  const useAutomateParam = (useId: string) => (nodeId: string, param: string, label: string, min: number, max: number, mode: 'step' | 'curve') => {
    const track = projectRef.current.tracks.find((t) => t.uses.some((u) => u.id === useId));
    if (!track) return;
    addParamLane(track.id, { scope: 'instrument', useId, nodeId, param, label, min, max }, mode);
  };
  /** Open ONE track instance in the Live view (its own flow / engine), not the pool. */
  const openInstrumentUse = async (useId: string) => {
    const proj = projectRef.current;
    let ctx: { track: Track; use: Track['uses'][number] } | null = null;
    for (const t of proj.tracks) { const u = t.uses.find((x) => x.id === useId); if (u) { ctx = { track: t, use: u }; break; } }
    if (!ctx) return;
    const pool = proj.pool.find((p) => p.id === ctx!.use.poolId); if (!pool) return;
    await ensureAudio();
    const dest = mixerRef.current?.use(useId, ctx.track.id);
    if (dest) await buildUse(useId, pool, dest, ctx.use.voices);
    setArmedPool(pool.id);
    setOpenItem({ kind: 'instrument', id: pool.id, useId });
    setView('live');
  };
  /** Edit ONE track instance's flow in Synflow → save back to the use + rebuild it. */
  const editUseInstrument = (useId: string) => {
    const proj = projectRef.current;
    let ctx: { track: Track; use: Track['uses'][number] } | null = null;
    for (const t of proj.tracks) { const u = t.uses.find((x) => x.id === useId); if (u) { ctx = { track: t, use: u }; break; } }
    if (!ctx) return;
    const pool = proj.pool.find((p) => p.id === ctx!.use.poolId);
    const flow = ctx.use.flow ?? pool?.flow; if (!flow) return;
    setEditor({ flow, title: `${pool?.name ?? 'Instrument'} (this track)`, onSaved: (f) => {
      mapUse(useId, (u) => ({ ...u, flow: f }));
      const dest = mixerRef.current?.use(useId, ctx!.track.id);
      poolsRef.current.get(useId)?.dispose(); poolsRef.current.delete(useId);
      hostsRef.current.get(useId)?.dispose(); hostsRef.current.delete(useId);
      if (dest && pool) void buildUse(useId, pool, dest, ctx!.use.voices);
    } });
  };
  /** Play/stop a specific use's engine live (Live view keyboard for a track instance). */
  const useDrumHit = (useId: string) => { const h = hostsRef.current.get(useId); if (!h) return; h.trigger(); window.setTimeout(() => h.release(), 220); };

  // Open an instrument flow in Synflow → on save replace the pool flow + rebuild engines + persist.
  const openInstrumentEditor = (pool: PoolItem) => {
    setEditor({ flow: pool.flow, title: pool.name, onSaved: (f0) => {
      // Synflow now round-trips flow.customUi — prefer a faceplate edited there,
      // falling back to whatever the instrument already had.
      const customUi = f0.customUi ?? pool.customUi ?? pool.flow.customUi;
      const f = { ...f0, customUi };
      mapPool(pool.id, (pi) => ({ ...pi, flow: f, customUi }));
      for (const u of usesOfPool(pool.id)) {
        const t = trackOfUse(u.id); const strip = t ? mixerRef.current?.use(u.id, t.id) : undefined;
        hostsRef.current.get(u.id)?.dispose(); hostsRef.current.delete(u.id);
        poolsRef.current.get(u.id)?.dispose(); poolsRef.current.delete(u.id);
        if (strip) void buildUse(u.id, { ...pool, flow: f }, strip, u.voices);
      }
      liveSynthsRef.current.get(pool.id)?.dispose(); liveSynthsRef.current.delete(pool.id);
      liveDrumsRef.current.get(pool.id)?.dispose(); liveDrumsRef.current.delete(pool.id);
      // The audition sandbox's session-only tweaks were against the OLD flow shape —
      // drop them so Live falls back to the just-saved (real) flow instead of stale nodes.
      setLiveFlowOverride((m) => { if (!(pool.id in m)) return m; const { [pool.id]: _drop, ...rest } = m; return rest; });
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
    setLiveFlowOverride((m) => { if (!(poolId in m)) return m; const { [poolId]: _drop, ...rest } = m; return rest; });
    setLiveGainOverride((m) => { if (!(poolId in m)) return m; const { [poolId]: _drop, ...rest } = m; return rest; });
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
  // Grow a track's pattern length (in whole bars) so it contains its longest note —
  // never shrinks (respects the bars control). Lets the piano roll extend rightward
  // as you write past the last bar, and keeps those notes audible.
  // Set a track's pattern length AND stretch its full-pattern arrangement clips to the
  // new bar count (clamped to the next clip so they never overlap), so the song shows/
  // plays the whole pattern. Shared by the bars control and the piano-roll auto-grow.
  const withTrackLen = (t: Track, newLen: number, barSteps: number): Track => {
    if (newLen === t.length) return t;
    const oldBars = Math.max(1, Math.round(t.length / barSteps));
    const newBars = Math.max(1, Math.round(newLen / barSteps));
    const sorted = [...t.clips].sort((a, b) => a.start - b.start);
    const gapAfter = (c: { start: number }) => { const nx = sorted.find((o) => o.start > c.start); return nx ? nx.start - c.start : Infinity; };
    const clips = newBars === oldBars ? t.clips
      : t.clips.map((c) => (!c.loop && c.length === oldBars ? { ...c, length: Math.max(1, Math.min(newBars, gapAfter(c))) } : c));
    return { ...t, length: newLen, clips };
  };
  const fitTrackLen = (t: Track, barSteps: number): Track => {
    let end = 0;
    for (const u of t.uses) for (const n of u.notes ?? []) end = Math.max(end, n.start + n.length);
    const fit = Math.ceil(end / barSteps) * barSteps;
    return fit > t.length ? withTrackLen(t, fit, barSteps) : t;
  };
  // mapUse + grow the owning track to fit its notes (for note add/move/resize edits).
  const mapUseFit = (useId: string, fn: (u: Track['uses'][number]) => Track['uses'][number]) =>
    setProject((p) => ({ ...p, tracks: p.tracks.map((t) => (t.uses.some((u) => u.id === useId) ? fitTrackLen({ ...t, uses: t.uses.map((u) => (u.id === useId ? fn(u) : u)) }, p.totalSteps) : t)) }));
  const trackOfUse = (useId: string) => projectRef.current.tracks.find((t) => t.uses.some((u) => u.id === useId));
  const useById = (useId: string) => projectRef.current.tracks.flatMap((t) => t.uses).find((u) => u.id === useId);

  const rebuildUseChain = (useId: string, fx: FxInsert[]) => void mixerRef.current?.useChain(useId)?.setChain(resolveFx(fx));
  const rebuildTrackChain = (trackId: string, fx: FxInsert[]) => void mixerRef.current?.trackChain(trackId)?.setChain(resolveFx(fx));
  const rebuildMaster = (fx: FxInsert[]) => void mixerRef.current?.masterChain.setChain(resolveFx(fx));

  // Open a flow in Synflow; on save, set the override + live-reload + persist.
  const editFxFlow = (insert: FxInsert, apply: (flow: Flow) => void) => {
    const flow = insert.flow ?? findEntry(insert.fxId)?.flow;
    if (!flow) return;
    // .vstai plugins are NOT Synflow graphs — they open their own GUI instead.
    if (isVstaiFlow(flow)) { setVstaiFxGui({ insert }); return; }
    setEditor({ flow, title: insert.name, onSaved: (f) => { apply(f); persistFx(insert, f); } });
  };

  // ── .vstai FX GUI: locate an insert anywhere in the project and route its own
  //    HTML GUI to the right live chain (params, sample uploads) + persistence. ──
  const [vstaiFxGui, setVstaiFxGui] = useState<null | { insert: FxInsert }>(null);
  const locateInsert = (insertId: string): null | { chain: () => FxChain | undefined; index: number; patch: (fn: (f: FxInsert) => FxInsert) => void } => {
    const p = projectRef.current;
    const m = p.masterFx.findIndex((f) => f.id === insertId);
    if (m >= 0) return { chain: () => mixerRef.current?.masterChain, index: m, patch: (fn) => setProject((x) => ({ ...x, masterFx: x.masterFx.map((f, j) => (j === m ? fn(f) : f)) })) };
    for (const t of p.tracks) {
      const i = t.fx.findIndex((f) => f.id === insertId);
      if (i >= 0) return { chain: () => mixerRef.current?.trackChain(t.id), index: i, patch: (fn) => mapTrack(t.id, (x) => ({ ...x, fx: x.fx.map((f, j) => (j === i ? fn(f) : f)) })) };
      for (const u of t.uses) {
        const j = u.fx.findIndex((f) => f.id === insertId);
        if (j >= 0) return { chain: () => mixerRef.current?.useChain(u.id), index: j, patch: (fn) => mapUse(u.id, (x) => ({ ...x, fx: x.fx.map((f, k) => (k === j ? fn(f) : f)) })) };
      }
    }
    for (const b of p.buses ?? []) {
      const i = b.fx.findIndex((f) => f.id === insertId);
      if (i >= 0) return { chain: () => mixerRef.current?.busChain(b.id), index: i, patch: (fn) => mapBus(b.id, (x) => ({ ...x, fx: x.fx.map((f, j) => (j === i ? fn(f) : f)) })) };
    }
    return null;
  };
  const vstaiFxParam = (insert: FxInsert, index: number, value: number) => {
    const loc = locateInsert(insert.id); if (!loc) return;
    loc.chain()?.setParam(loc.index, 'vstai', `param${index}`, value);                       // live
    loc.patch((f) => ({ ...f, flow: f.flow ? setFlowParam(f.flow, 'vstai', `param${index}`, value) : f.flow }));  // persist
  };
  const vstaiFxSample = (insert: FxInsert, msg: { channels: number; frames: number; rate: number; data: Float32Array }) => {
    const loc = locateInsert(insert.id); if (!loc) return;
    loc.chain()?.post(loc.index, 'vstai', { type: 'sample', ...msg }, [msg.data.buffer]);
  };

  // ── Automation from a GUI/knob context menu: add a lane to the right track ──
  type ParamTarget = { scope: 'instrument' | 'track'; useId?: string; fxIndex?: number; nodeId: string; param: string; label: string; min: number; max: number };
  const addParamLane = (trackId: string, tgt: ParamTarget, mode: 'step' | 'curve') => {
    mapTrack(trackId, (t) => {
      const midV = (tgt.min + tgt.max) / 2;
      const common = { id: uid('aut'), scope: tgt.scope, useId: tgt.useId, fxIndex: tgt.fxIndex, nodeId: tgt.nodeId, param: tgt.param, min: tgt.min, max: tgt.max, label: tgt.label };
      const lane = mode === 'curve'
        ? { ...common, values: [], points: [{ step: 0, value: midV }, { step: Math.max(1, songLengthSteps(projectRef.current)), value: midV }] }
        : { ...common, values: Array.from({ length: Math.max(1, t.length) }, () => midV) };
      return { ...t, automation: [...t.automation, lane] };
    });
    setSelTrack(trackId);
    setView(mode === 'curve' ? 'song' : 'tracks');
  };
  /** Right-click on an INSTRUMENT plugin param → automate it on a track that uses it. */
  const instrumentAutomateParam = (poolId: string) => (nodeId: string, param: string, label: string, min: number, max: number, mode: 'step' | 'curve') => {
    const proj = projectRef.current;
    const onSel = proj.tracks.find((t) => t.id === selTrackRef.current && t.uses.some((u) => u.poolId === poolId));
    const track = onSel ?? proj.tracks.find((t) => t.uses.some((u) => u.poolId === poolId));
    if (!track) { window.alert('Add this instrument to a synth/drum track first — automation lives on the track that plays it.'); return; }
    const use = track.uses.find((u) => u.poolId === poolId)!;
    addParamLane(track.id, { scope: 'instrument', useId: use.id, nodeId, param, label, min, max }, mode);
  };
  /** Right-click on an EFFECT plugin param → automate it on its track/instrument chain. */
  const fxAutomateParam = (insert: FxInsert) => (index: number, label: string, min: number, max: number, mode: 'step' | 'curve') => {
    const proj = projectRef.current;
    for (const t of proj.tracks) {
      const ti = t.fx.findIndex((f) => f.id === insert.id);
      if (ti >= 0) { addParamLane(t.id, { scope: 'track', fxIndex: ti, nodeId: 'vstai', param: `param${index}`, label, min, max }, mode); return; }
      for (const u of t.uses) {
        const ui = u.fx.findIndex((f) => f.id === insert.id);
        if (ui >= 0) { addParamLane(t.id, { scope: 'instrument', useId: u.id, fxIndex: ui, nodeId: 'vstai', param: `param${index}`, label, min, max }, mode); return; }
      }
    }
    window.alert('This effect is on the master or a bus — lane automation is available for track and instrument effects.');
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
    onAddNote: (useId, midi, start, length = 2) => { void audition(useId, { frequency: midiToFreq(midi) }); mapUseFit(useId, (u) => ({ ...u, notes: [...(u.notes ?? []), { id: newNoteId(), midi, start, length, velocity: 0.8 }] })); },
    onAddChord: (useId, midis, start, length = 2) => { for (const m of midis) void audition(useId, { frequency: midiToFreq(m) }); mapUseFit(useId, (u) => ({ ...u, notes: [...(u.notes ?? []), ...midis.map((m) => ({ id: newNoteId(), midi: m, start, length, velocity: 0.8 }))] })); },
    onAddAutomation: (trackId, target: AutoTarget) => mapTrack(trackId, (t) => ({ ...t, automation: [...t.automation, { id: uid('aut'), scope: target.scope ?? 'track', useId: target.useId, fxIndex: target.fxIndex, nodeId: target.nodeId, param: target.param, min: target.min, max: target.max, label: target.label, values: Array.from({ length: Math.max(1, t.length) }, () => (target.nodeId === '__volume__' ? t.volume : (target.min + target.max) / 2)) }] })),
    onPaintAutomation: (trackId, laneId, step, value) => mapTrack(trackId, (t) => ({ ...t, automation: t.automation.map((l) => (l.id === laneId ? { ...l, values: l.values.map((v, i) => (i === step ? value : v)) } : l)) })),
    // Song-scope curve lane: two endpoints spanning the arrangement at a sensible start value.
    onAddTimelineAutomation: (trackId, target: AutoTarget) => mapTrack(trackId, (t) => {
      const end = Math.max(1, songLengthSteps(projectRef.current));
      const v0 = target.nodeId === '__volume__' ? t.volume : (target.min + target.max) / 2;
      return { ...t, automation: [...t.automation, { id: uid('aut'), scope: target.scope ?? 'track', useId: target.useId, fxIndex: target.fxIndex, nodeId: target.nodeId, param: target.param, min: target.min, max: target.max, label: target.label, values: [], points: [{ step: 0, value: v0 }, { step: end, value: v0 }] }] };
    }),
    onRemoveAutomation: (trackId, laneId) => mapTrack(trackId, (t) => ({ ...t, automation: t.automation.filter((l) => l.id !== laneId) })),
    onRemoveNote: (useId, noteId) => mapUse(useId, (u) => ({ ...u, notes: (u.notes ?? []).filter((n) => n.id !== noteId) })),
    onMoveNote: (useId, noteId, midi, start) => mapUse(useId, (u) => ({ ...u, notes: (u.notes ?? []).map((n) => (n.id === noteId ? { ...n, midi, start } : n)) })),
    onResizeNote: (useId, noteId, length) => mapUse(useId, (u) => ({ ...u, notes: (u.notes ?? []).map((n) => (n.id === noteId ? { ...n, length } : n)) })),
    onUpdateNotes: (useId, updater) => mapUseFit(useId, (u) => ({ ...u, notes: updater(u.notes ?? []) })),    // batch edits: group move/resize/delete/duplicate (grows the pattern to fit)
    onSetVelocity: (useId, noteId, velocity) => mapUse(useId, (u) => ({ ...u, notes: (u.notes ?? []).map((n) => (n.id === noteId ? { ...n, velocity } : n)) })),
    onQuantize: (useId, gridSteps) => mapUse(useId, (u) => ({ ...u, notes: quantizeNotes(u.notes ?? [], gridSteps) })),
    onTranspose: (useId, semitones) => mapUse(useId, (u) => {
      const notes = u.notes ?? [];
      if (!notes.length) return u;
      const LO = 48, HI = 72; // keep all notes inside the piano-roll's visible range (PianoRoll LOW..HIGH)
      const minM = Math.min(...notes.map((n) => n.midi)), maxM = Math.max(...notes.map((n) => n.midi));
      const d = Math.max(LO - minM, Math.min(HI - maxM, semitones)); // uniform shift → preserves intervals
      return d === 0 ? u : { ...u, notes: notes.map((n) => ({ ...n, midi: n.midi + d })) };
    }),
    onHumanize: (useId) => mapUse(useId, (u) => ({ ...u, notes: (u.notes ?? []).map((n) => ({ ...n, velocity: Math.max(0.2, Math.min(1, (n.velocity ?? 1) + (Math.random() * 2 - 1) * 0.22)) })) })),
    onSetKey: (key: MusicalKey | null) => setProject((p) => ({ ...p, key: key ?? undefined })),
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
    onOpenInstrument: (useId) => void openInstrumentUse(useId),
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
    onSetTrackSwing: (trackId, swing) => mapTrack(trackId, (t) => ({ ...t, swing: swing ?? undefined })),
    onBrowseInstruments: () => { if (selectedTrack) openInstrumentBrowser(selectedTrack.id); },
    onTrackFxBrowse: () => {
      const t = selectedTrack; if (!t) return;
      openEffectBrowser(`Add effect — ${t.name}`, (ins) => { mapTrack(t.id, (x) => ({ ...x, fx: [...x.fx, ins] })); rebuildTrackChain(t.id, [...(projectRef.current.tracks.find((x) => x.id === t.id)?.fx ?? []), ins]); });
    },
    onUseFxBrowse: (useId) => {
      openEffectBrowser('Add instrument effect', (ins) => { const cur = useById(useId)?.fx ?? []; mapUse(useId, (u) => ({ ...u, fx: [...u.fx, ins] })); rebuildUseChain(useId, [...cur, ins]); });
    },
    onSwitchPattern: (trackId, patternId) => switchPattern(trackId, patternId),
    onAddPattern: (trackId, duplicate) => addPattern(trackId, duplicate),
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
    onSetAudioClipTE: (trackId, clipId, patch) => setAudioClip(trackId, clipId, patch),
    onSplitAudioClip: (trackId, clipId, atSteps) => splitAudioClip(trackId, clipId, atSteps),
    onRemoveAudioClip: (trackId, clipId) => removeAudioClip(trackId, clipId),
    onDuplicateAudioClip: (trackId, clipId) => duplicateAudioClip(trackId, clipId),
    onAudioClipGain: (trackId, clipId, gain) => setAudioClipGain(trackId, clipId, gain),
    onNormalizeAudioClip: (trackId, clipId) => normalizeAudioClip(trackId, clipId),
    onFadeAudioClip: (trackId, clipId, fadeIn, fadeOut) => setAudioClipFades(trackId, clipId, fadeIn, fadeOut),
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
  const setTrackVolume = (trackId: string, v: number) => { midiLearnTouch({ kind: 'trackVolume', trackId }); mapTrack(trackId, (t) => ({ ...t, volume: v })); mixerRef.current?.setTrackVolume(trackId, v); };
  const setTrackPan = (trackId: string, v: number) => { midiLearnTouch({ kind: 'trackPan', trackId }); mapTrack(trackId, (t) => ({ ...t, pan: v })); mixerRef.current?.setTrackPan(trackId, v); };
  const setTrackTrim = (trackId: string, v: number) => { const t = projectRef.current.tracks.find((x) => x.id === trackId); mixerRef.current?.setTrackTrim(trackId, v, !!t?.phase); mapTrack(trackId, (x) => ({ ...x, trim: v })); };
  const toggleTrackPhase = (trackId: string) => { const t = projectRef.current.tracks.find((x) => x.id === trackId); const phase = !t?.phase; mixerRef.current?.setTrackTrim(trackId, t?.trim ?? 1, phase); mapTrack(trackId, (x) => ({ ...x, phase })); };
  const renameTrack = (trackId: string, name: string) => mapTrack(trackId, (t) => ({ ...t, name }));
  const toggleTrackLoop = (trackId: string) => mapTrack(trackId, (t) => ({ ...t, loop: !t.loop })); // scheduler reads loop live
  // Push mute/solo resolution to every track's gate (solo is global, so one track's
  // change can flip others audible/silent). The scheduler also reads it live for triggering.
  const applyGates = (tracks: Track[]) => { const m = mixerRef.current; if (m) for (const t of tracks) m.setTrackGate(t.id, trackAudible(t, tracks)); };
  const toggleTrackMute = (trackId: string) => setProject((p) => { const tracks = p.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)); applyGates(tracks); return { ...p, tracks }; });
  const toggleTrackSolo = (trackId: string) => setProject((p) => { const tracks = p.tracks.map((t) => (t.id === trackId ? { ...t, soloed: !t.soloed } : t)); applyGates(tracks); return { ...p, tracks }; });
  const setTrackLength = (trackId: string, length: number) => {
    const len = Math.max(1, Math.min(256, length));
    const per = projectRef.current.totalSteps;
    mapTrack(trackId, (t) => {
      const t2 = withTrackLen(t, len, per);   // length + full-pattern clip resize (grow or shrink)
      return {
        ...t2,
        uses: t2.uses.map((u) => (u.steps ? { ...u, steps: Array.from({ length: len }, (_, i) => u.steps![i] ?? false) } : u)),
      };
    });
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
  const addClip = (trackId: string, slot: number) => mapTrack(trackId, (t) => {
    if (t.clips.some((c) => c.start === slot)) return t;
    const bars = Math.max(1, Math.round(t.length / projectRef.current.totalSteps)); // span the whole pattern (multi-bar)
    return { ...t, clips: [...t.clips, { id: uid('clip'), start: Math.max(0, slot), length: bars, loop: false }] };
  });
  const removeClip = (trackId: string, clipId: string) => mapTrack(trackId, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) }));
  const toggleClipLoop = (trackId: string, clipId: string) => mapTrack(trackId, (t) => ({ ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, loop: !c.loop } : c)) }));

  // ── Clip selection + clipboard (arrangement): click selects; Delete/⌘C/⌘X/⌘V/⌘D. ──
  type ClipSel = { trackId: string; clipId: string; kind: 'pattern' | 'audio' | 'video' };
  const [selClip, setSelClip] = useState<ClipSel | null>(null);
  const selClipRef = useRef<ClipSel | null>(null); selClipRef.current = selClip;
  const clipClipboardRef = useRef<{ kind: ClipSel['kind']; trackId: string; data: any } | null>(null);
  const findSelClip = (): any => {
    const s = selClipRef.current; if (!s) return null;
    const t = projectRef.current.tracks.find((x) => x.id === s.trackId); if (!t) return null;
    return s.kind === 'pattern' ? t.clips.find((c) => c.id === s.clipId)
      : s.kind === 'audio' ? (t.audioClips ?? []).find((c) => c.id === s.clipId)
        : (t.videoClips ?? []).find((c) => c.id === s.clipId);
  };
  const deleteSelClip = () => {
    const s = selClipRef.current; if (!s) return;
    if (s.kind === 'pattern') removeClip(s.trackId, s.clipId);
    else if (s.kind === 'audio') removeAudioClip(s.trackId, s.clipId);
    else removeVideoClip(s.trackId, s.clipId);
    setSelClip(null);
  };
  const copySelClip = () => {
    const s = selClipRef.current; const c = findSelClip();
    if (s && c) clipClipboardRef.current = { kind: s.kind, trackId: s.trackId, data: JSON.parse(JSON.stringify(c)) };
  };
  /** Insert a copy of clip `data` on its source track at `start`; returns the new id. */
  const insertClipCopy = (kind: ClipSel['kind'], trackId: string, data: any, start: number): string => {
    const id = uid(kind === 'pattern' ? 'clip' : kind === 'audio' ? 'aclip' : 'vclip');
    mapTrack(trackId, (t) => kind === 'pattern'
      ? { ...t, clips: [...t.clips, { ...data, id, start }] }
      : kind === 'audio'
        ? { ...t, audioClips: [...(t.audioClips ?? []), { ...data, id, start }] }
        : { ...t, videoClips: [...(t.videoClips ?? []), { ...data, id, start }] });
    return id;
  };
  const pasteClip = () => {
    const cb = clipClipboardRef.current; if (!cb) return;
    const step = Math.max(0, currentStepRef.current);
    // Pattern clips live on the bar grid; media clips on the step grid.
    const start = cb.kind === 'pattern' ? Math.round(step / projectRef.current.totalSteps) : step;
    const id = insertClipCopy(cb.kind, cb.trackId, cb.data, start);
    setSelClip({ trackId: cb.trackId, clipId: id, kind: cb.kind });
  };
  const duplicateSelClip = () => {
    const s = selClipRef.current; const c = findSelClip(); if (!s || !c) return;
    // place the copy right after the original (bars for pattern clips, steps for media)
    const len = s.kind === 'pattern' ? Math.max(1, c.length ?? 1) : (c.duration ?? 1) * (projectRef.current.bpm / 60) * projectRef.current.stepsPerBeat;
    const id = insertClipCopy(s.kind, s.trackId, JSON.parse(JSON.stringify(c)), c.start + len);
    setSelClip({ trackId: s.trackId, clipId: id, kind: s.kind });
  };
  keyActionsRef.current = {
    togglePlay: () => { if (isPlayingRef.current) stop(); else void play(); },
    rewind: () => seekTo(0),
    deleteClip: deleteSelClip,
    copyClip: copySelClip,
    cutClip: () => { copySelClip(); deleteSelClip(); },
    pasteClip,
    duplicateClip: duplicateSelClip,
  };

  // ── patterns: switch the edited pattern (checkout), add/duplicate, assign to clips ──
  const switchPattern = (trackId: string, patternId: string) => mapTrack(trackId, (t) => checkoutPattern(t, patternId));
  const addPattern = (trackId: string, duplicate = false) => mapTrack(trackId, (t) => {
    const saved = snapshotActivePattern(t);
    const src = duplicate ? saved.patterns!.find((p) => p.id === (t.activePatternId ?? saved.patterns![0].id)) : undefined;
    const pat: Pattern = {
      id: uid('pat'), name: nextPatternName(saved), length: src?.length ?? Math.max(1, t.length),
      steps: src ? Object.fromEntries(Object.entries(src.steps).map(([k, v]) => [k, [...v]])) :
        Object.fromEntries(t.uses.filter((u) => u.steps).map((u) => [u.id, blankSteps(t.length)])),
      notes: src ? Object.fromEntries(Object.entries(src.notes).map(([k, v]) => [k, v.map((n) => ({ ...n, id: newNoteId() }))])) :
        Object.fromEntries(t.uses.filter((u) => u.notes).map((u) => [u.id, []])),
    };
    return checkoutPattern({ ...saved, patterns: [...saved.patterns!, pat] }, pat.id);
  });
  /** Cycle a clip to the track's next pattern (badge click on the arrangement). */
  const cycleClipPattern = (trackId: string, clipId: string) => mapTrack(trackId, (t) => {
    const pats = t.patterns ?? [];
    if (pats.length < 2) return t;
    return {
      ...t,
      clips: t.clips.map((c) => {
        if (c.id !== clipId) return c;
        const cur = pats.findIndex((p) => p.id === clipPatternId(t, c));
        return { ...c, patternId: pats[(Math.max(0, cur) + 1) % pats.length].id };
      }),
    };
  });
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
  const setAudioClipFades = (trackId: string, clipId: string, fadeIn: number, fadeOut: number) =>
    updateAudioClips(trackId, (cs) => cs.map((c) => (c.id === clipId ? { ...c, fadeIn: Math.max(0, Math.min(c.duration, fadeIn)), fadeOut: Math.max(0, Math.min(c.duration, fadeOut)) } : c)));
  // Normalize: scale the clip's gain so its loudest point in the trimmed region hits
  // ~−0.3 dBFS, read from the asset's cached waveform peaks (no decode needed).
  const normalizeAudioClip = (trackId: string, clipId: string) => {
    const c = projectRef.current.tracks.find((t) => t.id === trackId)?.audioClips?.find((x) => x.id === clipId);
    const asset = c && projectRef.current.assets.find((a) => a.id === c.assetId);
    if (!c || !asset?.peaks) return;
    const sl = slicePeaks(asset.peaks, asset.duration, c.offset, c.duration); if (!sl) return;
    let peak = 0;
    for (let i = 0; i < sl.min.length; i++) peak = Math.max(peak, Math.abs(sl.min[i]), Math.abs(sl.max[i]));
    if (peak > 0) setAudioClipGain(trackId, clipId, Math.max(0, Math.min(1.5, 0.97 / peak)));
  };
  const trimAudioClip = (trackId: string, clipId: string, offset: number, duration: number) => updateAudioClips(trackId, (cs) => cs.map((c) => (c.id === clipId ? { ...c, offset: Math.max(0, offset), duration: Math.max(0.02, duration) } : c)));
  const splitAudioClip = (trackId: string, clipId: string, atSteps: number) => {
    const secPerStep = 60 / projectRef.current.bpm / projectRef.current.stepsPerBeat;
    updateAudioClips(trackId, (cs) => cs.flatMap((c) => (c.id === clipId ? splitClipAt(c, atSteps, secPerStep, () => uid('aclip')) ?? [c] : [c])));
  };
  // Duplicate a clip immediately after itself (start += its own length in steps).
  const duplicateAudioClip = (trackId: string, clipId: string) => {
    const secPerStep = 60 / projectRef.current.bpm / projectRef.current.stepsPerBeat;
    updateAudioClips(trackId, (cs) => {
      const c = cs.find((x) => x.id === clipId); if (!c) return cs;
      return [...cs, { ...c, id: uid('aclip'), start: c.start + c.duration / secPerStep }];
    });
    void buildAudio();
  };

  // Split whatever clip sits under the playhead on the selected track (the `S` key).
  splitAtPlayheadRef.current = () => {
    const proj = projectRef.current;
    const t = proj.tracks.find((x) => x.id === selTrackRef.current);
    if (!t) return;
    const at = currentStepRef.current;
    const secPerStep = 60 / proj.bpm / proj.stepsPerBeat;
    const inside = (c: { start: number; duration: number }) => at > c.start + 0.05 && at < c.start + c.duration / secPerStep - 0.05;
    if (t.type === 'audio') { const c = (t.audioClips ?? []).find(inside); if (c) splitAudioClip(t.id, c.id, at); }
    else if (t.type === 'video') { const c = (t.videoClips ?? []).find(inside); if (c) splitVideoClip(t.id, c.id, at); }
  };

  // Decode bytes → asset, drop a clip at the playhead on `trackId`, rebuild audio.
  const ingestAndAdd = async (trackId: string, name: string, bytes: ArrayBuffer, mime: string, startStep?: number) => {
    await ensureAudio();
    let asset: AudioAsset;
    try { asset = await ensureAssets().ingest(name, bytes, mime); }
    catch (e) { console.warn('[Mothscilla] audio decode failed', e); return; }
    const clip: AudioClip = { id: uid('aclip'), assetId: asset.id, start: Math.max(0, startStep ?? currentStepRef.current), offset: 0, duration: asset.duration, gain: 1 };
    const cur = projectRef.current;
    const next: Project = { ...cur, assets: [...cur.assets, asset], tracks: cur.tracks.map((t) => (t.id === trackId ? { ...t, audioClips: [...(t.audioClips ?? []), clip] } : t)) };
    projectRef.current = next; setProject(next);
    await buildAudio();
  };

  const downloadBytes = (data: ArrayBuffer, name: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Export each track as its own pre-master WAV stem (a soloed bounce per track).
  const exportStems = async () => {
    const proj = projectRef.current;
    const stems = proj.tracks.filter((t) => (t.type === 'drums' || t.type === 'synth') ? t.uses.length > 0 : t.type === 'audio' ? (t.audioClips?.length ?? 0) > 0 : false);
    if (!stems.length) { window.alert('No tracks with content to export as stems.'); return; }
    setBouncing(true); setBounceProgress(0);
    try {
      for (let i = 0; i < stems.length; i++) {
        const target = stems[i];
        const solo: Project = { ...proj, masterFx: [], tracks: proj.tracks.map((t) => ({ ...t, soloed: t.id === target.id, muted: false })) };
        const wav = await bounceProjectToWav(solo, ensureAssets());
        downloadBytes(wav, `${songSlug(proj.name)}__${songSlug(target.name)}.wav`, 'audio/wav');
        setBounceProgress((i + 1) / stems.length);
        await new Promise((r) => setTimeout(r, 200)); // let each download register
      }
    } finally { setBouncing(false); setBounceProgress(0); }
  };

  // Freeze / bounce-in-place: render a track to a pre-master WAV, add it as an audio
  // track, and mute the original (delete the frozen track + unmute the original to undo).
  const freezeTrack = async (trackId: string) => {
    const proj = projectRef.current;
    const target = proj.tracks.find((t) => t.id === trackId); if (!target) return;
    setBouncing(true); setBounceProgress(0);
    try {
      await ensureAudio();
      const solo: Project = { ...proj, masterFx: [], tracks: proj.tracks.map((t) => ({ ...t, soloed: t.id === trackId, muted: false })) };
      const wav = await bounceProjectToWav(solo, ensureAssets());
      const asset = await ensureAssets().ingest(`${target.name} (frozen)`, wav, 'audio/wav');
      const clip: AudioClip = { id: uid('aclip'), assetId: asset.id, start: 0, offset: 0, duration: asset.duration, gain: 1 };
      const nt: Track = { id: uid('track'), name: `${target.name} (frozen)`, type: 'audio', volume: 0.8, loop: true, length: proj.totalSteps, uses: [], clips: [], audioClips: [clip], fx: [], automation: [] };
      const next: Project = { ...proj, assets: [...proj.assets, asset], tracks: [...proj.tracks.map((t) => (t.id === trackId ? { ...t, muted: true } : t)), nt] };
      projectRef.current = next; setProject(next); await buildAudio(); setSongMode(true);
    } finally { setBouncing(false); setBounceProgress(0); }
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
      // The video's audio rides on its OWN audio track (video tracks don't play their
      // own audioClips), aligned to the clip, so it's audible and editable separately.
      const audioTrack: Track | null = (audioAsset && aclip) ? {
        id: uid('track'), name: `${baseName} (audio)`, type: 'audio', volume: 0.8, loop: true,
        length: cur.totalSteps, uses: [], clips: [], audioClips: [aclip], fx: [], automation: [],
      } : null;
      const next: Project = {
        ...cur,
        videoAssets: [...(cur.videoAssets ?? []), videoAsset],
        assets: audioAsset ? [...cur.assets, audioAsset] : cur.assets,
        tracks: [
          ...cur.tracks.map((t) => (t.id !== trackId ? t : { ...t, videoClips: [...(t.videoClips ?? []), vclip] })),
          ...(audioTrack ? [audioTrack] : []),
        ],
      };
      projectRef.current = next; setProject(next);
      setSongMode(true);                 // the extracted audio plays on the arrangement timeline
      await buildAudio();
      if (!hadAudio) window.alert(`Imported "${baseName}". This file's audio couldn't be extracted in-browser (common for AVI). The video still imports; see docs/VIDEO.md for the demux fallback.`);
    } catch (e) {
      console.warn('[Mothscilla] video import failed', e);
      window.alert('Video import failed — see the console.');
    } finally { setImporting(null); }
    setSongMode(true);
  };

  // ── MIDI file import: one synth track per MIDI track (notes → active pattern) ──
  const importMidiBytes = async (bytes: ArrayBuffer, fileName: string) => {
    let parsed;
    try { parsed = parseMidiFile(bytes); }
    catch (e) { console.warn('[Mothscilla] MIDI import failed', e); window.alert('Could not read that MIDI file.'); return; }
    if (!parsed.tracks.length) { window.alert('No notes found in that MIDI file.'); return; }
    const cur = projectRef.current;
    // Instrument: reuse the first synth in the pool, else add the library saw lead.
    let poolId = cur.pool.find((p) => p.kind === 'synth')?.id;
    let poolAdd: PoolItem | null = null;
    if (!poolId) {
      const entry = findEntry('saw-lead');
      if (!entry) { window.alert('No synth instrument available to host the MIDI notes.'); return; }
      poolAdd = { id: uid('pool'), name: entry.name, libId: entry.id, kind: 'synth', flow: cloneFlow(entry.flow) };
      poolId = poolAdd.id;
    }
    const spb = cur.stepsPerBeat;
    const newTracks: Track[] = parsed.tracks.map((mt, i) => {
      const notes: PianoNote[] = mt.notes.map((n) => ({
        id: newNoteId(), midi: n.midi,
        start: n.startBeats * spb, length: Math.max(0.25, n.lengthBeats * spb),
        velocity: Math.max(0.05, Math.min(1, n.velocity)),
      }));
      const endStep = Math.max(...notes.map((n) => n.start + n.length), 1);
      const length = Math.max(cur.totalSteps, Math.ceil(endStep / cur.totalSteps) * cur.totalSteps);
      const bars = Math.max(1, Math.round(length / cur.totalSteps));
      return {
        id: uid('track'), name: mt.name || `${fileName.replace(/\.[^.]+$/, '')} ${i + 1}`, type: 'synth' as const,
        volume: 0.8, loop: false, length, fx: [], automation: [],
        clips: [{ id: uid('clip'), start: 0, length: bars, loop: false }],
        uses: [{ id: uid('use'), poolId: poolId!, fx: [], voices: 8, notes }],
      };
    });
    const next = normalizeProject({
      ...cur,
      ...(parsed.bpm && cur.tracks.every((t) => t.uses.length === 0 && !(t.audioClips?.length)) ? { bpm: parsed.bpm } : {}),
      pool: poolAdd ? [...cur.pool, poolAdd] : cur.pool,
      tracks: [...cur.tracks, ...newTracks],
    });
    projectRef.current = next; setProject(next);
    await buildAudio();
    setSongMode(true);
  };

  // ── OS drag-and-drop: audio/video/MIDI files dropped anywhere import directly ──
  const [dropHover, setDropHover] = useState(false);
  const ensureTrackOfType = (type: 'audio' | 'video'): string => {
    const cur = projectRef.current;
    const sel = cur.tracks.find((t) => t.id === selTrackRef.current);
    if (sel?.type === type) return sel.id;
    const existing = cur.tracks.find((t) => t.type === type);
    if (existing) return existing.id;
    const track: Track = { id: uid('track'), name: type === 'audio' ? 'Audio' : 'Video', type, volume: 0.8, loop: true, length: cur.totalSteps, uses: [], clips: [], ...(type === 'audio' ? { audioClips: [] } : { videoClips: [] }), fx: [], automation: [] };
    const next = { ...cur, tracks: [...cur.tracks, track] };
    projectRef.current = next; setProject(next);
    return track.id;
  };
  const onAppDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDropHover(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    for (const f of files) {
      const name = f.name; const lower = name.toLowerCase();
      try {
        if (lower.endsWith('.mid') || lower.endsWith('.midi') || f.type === 'audio/midi' || f.type === 'audio/mid') {
          await importMidiBytes(await f.arrayBuffer(), name);
        } else if (f.type.startsWith('audio/')) {
          const trackId = ensureTrackOfType('audio');
          setImporting({ name, phase: 'decoding', read: 0, total: 0, startedAt: Date.now() });
          try { await ingestAndAdd(trackId, name.replace(/\.[^.]+$/, ''), await f.arrayBuffer(), f.type); } finally { setImporting(null); }
          setSongMode(true);
        } else if (f.type.startsWith('video/')) {
          const trackId = ensureTrackOfType('video');
          setImporting({ name, phase: 'decoding', read: 0, total: 0, startedAt: Date.now() });
          try {
            await ensureAudio();
            const baseName = name.replace(/\.[^.]+$/, '');
            const { videoAsset, audioAsset, vclip, aclip } = await buildVideoEntities(await f.arrayBuffer(), f.type, baseName, Math.max(0, currentStepRef.current));
            const cur = projectRef.current;
            const audioTrack: Track | null = (audioAsset && aclip) ? { id: uid('track'), name: `${baseName} (audio)`, type: 'audio', volume: 0.8, loop: true, length: cur.totalSteps, uses: [], clips: [], audioClips: [aclip], fx: [], automation: [] } : null;
            const next: Project = { ...cur, videoAssets: [...(cur.videoAssets ?? []), videoAsset], assets: audioAsset ? [...cur.assets, audioAsset] : cur.assets, tracks: [...cur.tracks.map((t) => (t.id !== trackId ? t : { ...t, videoClips: [...(t.videoClips ?? []), vclip] })), ...(audioTrack ? [audioTrack] : [])] };
            projectRef.current = next; setProject(next); setSongMode(true);
            await buildAudio();
          } finally { setImporting(null); }
        }
      } catch (err) { console.warn('[Mothscilla] drop import failed', name, err); }
    }
  };

  // ── Live capture: mic, recorded to a clip ────────────────────────────────────
  // No preview screen — Mic just arms the source, Record captures it, from the topbar.
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const monitorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recRef = useRef<{ rec: MediaRecorder } | null>(null);
  const micOn = !!micStream;

  const toggleMic = useCallback(async () => {
    if (micOn) { micStream?.getTracks().forEach((t) => t.stop()); setMicStream(null); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(s);
      s.getAudioTracks()[0]?.addEventListener('ended', () => setMicStream(null));
    } catch (e) { console.warn('[Mothscilla] mic denied', e); window.alert('Could not start the microphone (permission denied or no device).'); }
  }, [micOn, micStream]);

  // Ingest the mic recording into its own new audio track, anchored at `startStep`.
  const ingestRecordedSources = async (label: string, mime: string, bytes: ArrayBuffer, startStep: number) => {
    await ensureAudio();
    const asset = await ensureAssets().ingest(label, bytes, mime);
    const aclip: AudioClip = { id: uid('aclip'), assetId: asset.id, start: startStep, offset: 0, duration: asset.duration, gain: 1 };
    const track: Track = { id: uid('track'), name: label, type: 'audio', volume: 0.8, loop: true, length: projectRef.current.totalSteps, uses: [], clips: [], audioClips: [aclip], fx: [], automation: [] };
    const cur = projectRef.current;
    const next: Project = { ...cur, assets: [...cur.assets, asset], tracks: [...cur.tracks, track] };
    projectRef.current = next; setProject(next); setSelTrack(track.id);
    setView('song'); setSongMode(true);
    await buildAudio();
  };

  // Record the mic to its own track, anchored at the current playhead position.
  const toggleRecord = useCallback(async () => {
    if (recording) { try { recRef.current?.rec.stop(); } catch { /* already stopped */ } return; }
    if (!micStream) { window.alert('Enable the microphone first, then record.'); return; }
    const amime = ['audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? 'audio/webm';
    const stamp = new Date().toLocaleTimeString();
    const label = `Mic ${stamp}`;
    await ensureAudio();
    const startStep = Math.max(0, currentStepRef.current);
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(micStream, { mimeType: amime });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const blob = new Promise<Blob>((resolve) => { rec.onstop = () => resolve(new Blob(chunks, { type: amime })); });
    recRef.current = { rec };
    rec.start(250);
    setRecording(true);
    void blob.then(async (b) => {
      setRecording(false);
      recRef.current = null;
      try { await ingestRecordedSources(label, amime, await b.arrayBuffer(), startStep); }
      catch (e) { console.warn('[Mothscilla] recording ingest failed', e); }
      micStream?.getTracks().forEach((t) => t.stop()); setMicStream(null);
    });
  }, [recording, micStream, ensureAudio]);

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

  // Count-in: when starting a take from stopped, click one bar of metronome (with
  // playback rolling) before capture begins, so the performer has the tempo.
  const [countingIn, setCountingIn] = useState(false);
  const startRecording = async (trackId: string) => {
    try {
      const proj = projectRef.current;
      if (!isPlayingRef.current) {
        setCountingIn(true);
        try {
          await ensureAudio();
          const ctx = ctxRef.current!;
          const metro = metronomeRef.current;
          const spb = 60 / proj.bpm;
          const beats = Math.max(1, Math.round(proj.totalSteps / proj.stepsPerBeat));
          const t0 = ctx.currentTime + 0.05;
          for (let b = 0; b < beats; b++) metro?.click(t0 + b * spb, b === 0);
          await new Promise((r) => setTimeout(r, (0.05 + beats * spb) * 1000));
          void play();                                   // roll playback with the take
        } finally { setCountingIn(false); }
      }
      const rec = new Recorder(); await rec.start(); recorderRef.current = rec; setRecTrack(trackId);
      recStartStepRef.current = Math.max(0, currentStepRef.current);   // take lands where capture began
    }
    catch (e) { console.warn('[Mothscilla] mic access failed', e); recorderRef.current = null; setCountingIn(false); }
  };
  const recStartStepRef = useRef(0);
  const stopRecording = async () => {
    const rec = recorderRef.current; const trackId = recTrack; setRecTrack(null);
    if (!rec || !trackId) return;
    const res = await rec.stop(); recorderRef.current = null;
    if (res) await ingestAndAdd(trackId, `take ${new Date().toLocaleTimeString()}`, res.bytes, res.mime, recStartStepRef.current);
  };

  // ── Plugin browser: add instruments/effects from pool, library or VibeSynth gallery ──
  const [pluginBrowser, setPluginBrowser] = useState<null | {
    mode: 'instrument' | 'effect'; title: string; pool?: PoolItem[]; library: LibraryEntry[];
    onPick: (pick: PluginPick) => void | Promise<void>;
  }>(null);

  /** Add a use of a pool item to a track (mirrors onAddUse, callable with a fresh item). */
  const addUseOfPool = (trackId: string, pool: PoolItem) => {
    // Each track instance gets its OWN copy of the instrument flow, so param edits
    // on this track stay independent of the pool template and of other tracks.
    const flow = cloneFlow(pool.flow);
    const use = pool.kind === 'drum'
      ? { id: uid('use'), poolId: pool.id, flow, fx: [], steps: blankSteps(projectRef.current.totalSteps) }
      : { id: uid('use'), poolId: pool.id, flow, fx: [], notes: [], voices: 6 };
    mapTrack(trackId, (t) => ({ ...t, uses: [...t.uses, use] }));
    const dest = mixerRef.current?.use(use.id, trackId);
    if (dest) void buildUse(use.id, pool, dest, (use as { voices?: number }).voices);
  };

  /** Stable identity for a browser pick: library entries use their id; gallery
   *  plugins use `vstai:<slug>` so the SAME plugin is always one shared pool item. */
  const pickLibId = (pick: PluginPick): string | null =>
    pick.kind === 'library' ? pick.entry.id : pick.kind === 'gallery' ? `vstai:${pick.item.slug}` : null;

  /** Resolve a pick to a pool item, REUSING an existing one (same identity) instead
   *  of duplicating — so "the same synth" is one entity across the pool and every
   *  track. Adds a new pool item (synchronously into projectRef) only when needed. */
  const ensurePoolItem = (pick: PluginPick, kind: 'synth' | 'drum'): PoolItem | undefined => {
    if (pick.kind === 'pool') return projectRef.current.pool.find((p) => p.id === pick.poolId);
    const libId = pickLibId(pick);
    const existing = libId ? projectRef.current.pool.find((p) => p.libId === libId && p.kind === kind) : undefined;
    if (existing) return existing;
    const item: PoolItem = pick.kind === 'library'
      ? { id: uid('pool'), name: pick.entry.name, libId: libId!, kind, flow: cloneFlow(pick.entry.flow) }
      : { id: uid('pool'), name: pick.item.name, libId: libId!, kind, flow: makeVstaiFlow(pick.doc, pick.item.name) };
    const next = { ...projectRef.current, pool: [...projectRef.current.pool, item] };
    projectRef.current = next; setProject(next);   // sync so a following add/dedup sees it
    return item;
  };

  const openInstrumentBrowser = (trackId: string) => {
    const track = projectRef.current.tracks.find((t) => t.id === trackId); if (!track) return;
    const kind: 'synth' | 'drum' = track.type === 'drums' ? 'drum' : 'synth';
    setPluginBrowser({
      mode: 'instrument',
      title: `Add ${kind === 'drum' ? 'drum' : 'synth'} — ${track.name}`,
      pool: projectRef.current.pool.filter((p) => p.kind === kind),
      library: library.filter((e) => e.group === 'instrument' && ((e.kind === 'piano') === (kind === 'synth'))),
      onPick: async (pick) => {
        await ensureAudio();
        const item = ensurePoolItem(pick, kind);
        if (item) addUseOfPool(trackId, item);
      },
    });
  };

  /** A .vstai instrument GUI uploaded a sample: forward it to every engine hosting
   *  this pool item (live voices + every track use). Data is structured-cloned per
   *  engine (no transfer) since several instances need the same bytes. */
  const vstaiInstrumentSample = (poolId: string, msg: { channels: number; frames: number; rate: number; data: Float32Array }) => {
    // Pool-level Live is audition-only: a sample dropped into the plugin's own GUI
    // here stays in the jam engine, same as onInstrumentKnob — it must not land in
    // any track's actual sampler (that's what Track Live / vstaiUseSample is for).
    liveSynthsRef.current.get(poolId)?.postToNode('vstai', { type: 'sample', ...msg });
    liveDrumsRef.current.get(poolId)?.postToNode('vstai', { type: 'sample', ...msg });
  };

  /** Pool panel "+": add an instrument/drum to the PROJECT POOL (no track use). */
  const openPoolBrowser = (kind: 'synth' | 'drum') => {
    setPluginBrowser({
      mode: 'instrument',
      title: `Add ${kind === 'drum' ? 'drum' : 'synth'} to the project pool`,
      pool: projectRef.current.pool.filter((p) => p.kind === kind),
      library: library.filter((e) => e.group === 'instrument' && ((e.kind === 'piano') === (kind === 'synth'))),
      onPick: async (pick) => {
        await ensureAudio();
        ensurePoolItem(pick, kind);   // adds to the pool if new; reuses if already there
      },
    });
  };

  /** Open the effect browser; `addInsert` places the picked insert into a specific chain.
   *  Gallery picks embed their flow in the insert so saved songs stay self-contained. */
  const openEffectBrowser = (title: string, addInsert: (ins: FxInsert) => void) => {
    setPluginBrowser({
      mode: 'effect', title, library: effects,
      onPick: (pick) => {
        if (pick.kind === 'library') addInsert(fxInsert(pick.entry.id));
        else if (pick.kind === 'gallery') addInsert({ id: uid('fx'), fxId: `vstai:${pick.item.slug}`, name: pick.item.name, flow: makeVstaiFlow(pick.doc, pick.item.name) });
      },
    });
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

  // ── Aux/return buses + sends ────────────────────────────────────────────────
  const busById = (id: string): Bus | undefined => projectRef.current.buses?.find((b) => b.id === id);
  const busFx = (busId: string): FxInsert[] => busById(busId)?.fx ?? [];
  const mapBus = (busId: string, fn: (b: Bus) => Bus) => setProject((p) => ({ ...p, buses: (p.buses ?? []).map((b) => (b.id === busId ? fn(b) : b)) }));
  const rebuildBus = (busId: string, fx: FxInsert[]) => void mixerRef.current?.busChain(busId)?.setChain(resolveFx(fx));

  const onAddBus = () => {
    const b = newBus(`Bus ${(projectRef.current.buses?.length ?? 0) + 1}`);
    setProject((p) => ({ ...p, buses: [...(p.buses ?? []), b] }));
    mixerRef.current?.bus(b.id, b.volume);
  };
  const onRemoveBus = (busId: string) => {
    setProject((p) => ({ ...p, buses: (p.buses ?? []).filter((b) => b.id !== busId), tracks: p.tracks.map((t) => ({ ...t, sends: (t.sends ?? []).filter((s) => s.busId !== busId) })) }));
    mixerRef.current?.removeBus(busId);
  };
  const onBusName = (busId: string, name: string) => mapBus(busId, (b) => ({ ...b, name }));
  const onBusVolume = (busId: string, v: number) => { mixerRef.current?.setBusVolume(busId, v); mapBus(busId, (b) => ({ ...b, volume: v })); };
  const onBusFxAdd = (busId: string, fxId: string) => { const ins = fxInsert(fxId); const next = [...busFx(busId), ins]; mapBus(busId, (b) => ({ ...b, fx: next })); rebuildBus(busId, next); };
  const onBusFxRemove = (busId: string, i: number) => { const next = busFx(busId).filter((_, j) => j !== i); mapBus(busId, (b) => ({ ...b, fx: next })); rebuildBus(busId, next); };
  const onBusFxEdit = (busId: string, i: number) => {
    const insert = busFx(busId)[i]; if (!insert) return;
    if (insert.fxId === EQ_FX_ID) {
      const chain = () => mixerRef.current?.busChain(busId);
      openEqEditor(busById(busId)?.name ?? 'Bus', insert, () => chain()?.getEqAnalyser(i) ?? null, (eq) => chain()?.updateEq(i, eq),
        (eq) => mapBus(busId, (b) => ({ ...b, fx: b.fx.map((x, j) => (j === i ? { ...x, eq } : x)) })));
      return;
    }
    editFxFlow(insert, (f) => { const next = busFx(busId).map((x, j) => (j === i ? { ...x, flow: f } : x)); mapBus(busId, (b) => ({ ...b, fx: next })); rebuildBus(busId, next); });
  };
  const onBusFxKnob = (busId: string, i: number, nodeId: string, param: string, v: number | string) => {
    mixerRef.current?.busChain(busId)?.setParam(i, nodeId, param, v);
    const insert = busFx(busId)[i]; const base = insert?.flow ?? (insert && findEntry(insert.fxId)?.flow); if (!insert || !base) return;
    const flow = setFlowParam(base, nodeId, param, v);
    mapBus(busId, (b) => ({ ...b, fx: b.fx.map((y, j) => (j === i ? { ...y, flow } : y)) }));
  };
  const onSetSend = (trackId: string, busId: string, level: number, pre?: boolean) => {
    const prevPre = !!projectRef.current.tracks.find((t) => t.id === trackId)?.sends?.find((s) => s.busId === busId)?.pre;
    const nextPre = pre ?? prevPre;
    // The mixer keeps separate pre/post taps — silence the old one on a toggle.
    if (nextPre !== prevPre) mixerRef.current?.setSend(trackId, busId, 0, prevPre);
    mixerRef.current?.setSend(trackId, busId, level, nextPre);
    mapTrack(trackId, (t) => {
      const sends = [...(t.sends ?? [])];
      const idx = sends.findIndex((s) => s.busId === busId);
      if (idx >= 0) sends[idx] = { busId, level, pre: nextPre }; else sends.push({ busId, level, pre: nextPre });
      return { ...t, sends };
    });
  };
  /** Replace a timeline automation lane's points (curve editor on the arrangement). */
  const onEditAutomationPoints = (trackId: string, laneId: string, points: AutoPoint[]) =>
    mapTrack(trackId, (t) => ({ ...t, automation: t.automation.map((l) => (l.id === laneId ? { ...l, points } : l)) }));

  /** Route a track's output to a group bus (or back to the master). */
  const onSetTrackOutput = (trackId: string, busId: string | null) => {
    mixerRef.current?.setTrackOutput(trackId, busId);
    mapTrack(trackId, (t) => ({ ...t, outputBusId: busId ?? undefined }));
  };

  // Set/clear a track's sidechain. keyTrackId null turns ducking off.
  const onSetSidechain = (targetId: string, keyTrackId: string | null, patch?: { amount?: number; release?: number }) => {
    if (!keyTrackId) {
      mixerRef.current?.clearSidechain(targetId);
      mapTrack(targetId, (t) => { const { sidechain: _omit, ...rest } = t; return rest as Track; });
      return;
    }
    const cur = projectRef.current.tracks.find((t) => t.id === targetId)?.sidechain;
    const sc = { keyTrackId, amount: patch?.amount ?? cur?.amount ?? 0.6, release: patch?.release ?? cur?.release ?? 200 };
    mixerRef.current?.setSidechain(targetId, sc.keyTrackId, sc.amount, sc.release);
    mapTrack(targetId, (t) => ({ ...t, sidechain: sc }));
  };

  // ─── position readout ──────────────────────────────────────────────────────
  const sib = currentStep < 0 ? 0 : currentStep % project.totalSteps;
  const bar = currentStep < 0 ? 1 : Math.floor(currentStep / project.totalSteps) + 1;
  const pos = `${String(bar).padStart(3, '0')}.${Math.floor(sib / project.stepsPerBeat) + 1}.${String((sib % project.stepsPerBeat) * 25).padStart(2, '0')}`;
  const hasVideoContent = project.tracks.some((t) => t.type === 'video' && (t.videoClips?.length ?? 0) > 0);

  return (
    <div className={`app-shell ${dropHover ? 'drop-hover' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); setDropHover(true); } }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setDropHover(false); }}
      onDrop={onAppDrop}>
      <TopBar
        view={view} setView={setView} isPlaying={isPlaying} onPlay={isPlaying ? stop : play} onStop={stop}
        armed={armed} onArm={() => setArmed((a) => !a)} metronome={metronome} onToggleMetronome={toggleMetronome} bpm={project.bpm} onBpm={setBpm} swing={project.swing ?? 0} onSwing={setSwing} beatsPerBar={Math.max(1, Math.round(project.totalSteps / project.stepsPerBeat))} onTimeSig={setTimeSig} position={pos}
        browserOpen={browserOpen} setBrowserOpen={setBrowserOpen}
        canUndo={histUI.canUndo} canRedo={histUI.canRedo} onUndo={undo} onRedo={redo}
        projectName={project.name} onProjectName={(name) => setProject((p) => ({ ...p, name }))}
        onNewSong={newSong} onSave={saveSong} saved={saved} onOpenSong={openSong} onExport={() => setExportOpen(true)} exporting={exporting} exportProgress={exportProgress} onBounce={bounceSong} bouncing={bouncing} bounceProgress={bounceProgress} onExportMidi={() => downloadMidi(projectRef.current)} onExportStems={exportStems}
        micOn={micOn} onToggleMic={toggleMic} recording={recording} onToggleRecord={toggleRecord}
        midiConnected={midi.devices.length > 0} midiTitle={midi.devices.length ? `MIDI: ${midi.devices.join(', ')}` : 'No MIDI device'} midiLearn={midiLearn.active} onMidiLearn={() => setMidiLearn((m) => ({ active: !m.active, target: null }))}
      />
      <div className="workspace">
        {browserOpen && <Pool pool={project.pool} effects={effects} instrumentLib={library.filter((e) => e.group === 'instrument')} armed={armedPool} recordings={project.assets} previewKey={previewKey} onPreview={auditionAsset} onPlaceRecording={placeAssetOnTrack} onRemoveRecording={removeRecording} onOpenInstrument={openInstrument} onEditEffect={openEffectPage} onRemoveInstrument={removePoolItem} onRemoveEffect={removeEffect} onAddFromFolder={addFromFolder} onAddInstrument={addInstrumentToPool} onNewEffect={newEffect} onBrowsePool={openPoolBrowser} source={folder ? `disk · ${folder.name}` : 'built-in'} />}
        <div className="main">
          {view === 'tracks' && (
            <div className="tracks-view">
              <div className="tracks-rail">
                {project.tracks.map((t) => (
                  <div key={t.id} className={`trk ${t.id === selTrack ? 'sel' : ''}`} data-type={t.type} onClick={() => setSelTrack(t.id)}>
                    <span className="trk-ico">{t.type === 'drums' ? <Drum size={13} /> : t.type === 'audio' ? <AudioWaveform size={13} /> : t.type === 'video' ? <Film size={13} /> : <Music2 size={13} />}</span>
                    <span className="trk-name">{t.name}</span>
                    <button className={`trk-loop ${t.loop ? 'on' : ''}`} title={t.loop ? 'Live loop on (click to stop)' : 'Live loop — play this track continuously'} onClick={(e) => { e.stopPropagation(); toggleTrackLoop(t.id); }}><Repeat size={15} /></button>
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
              {hasVideoContent && monitorOpen && (
                <ProgramMonitor dock project={project} currentStep={currentStep} isPlaying={isPlaying} getVideoUrl={getVideoUrl} onSetClip={setVideoClip} onClose={() => setMonitorOpen(false)} canvasRef={monitorCanvasRef} />
              )}
              <Arrange
                project={project} currentStep={currentStep} songMode={songMode} selTrack={selTrack}
                onToggleSongMode={toggleSongMode} onSetSongSlots={setSongSlots} onSelectTrack={setSelTrack} onToggleMute={toggleTrackMute} onToggleSolo={toggleTrackSolo} onToggleTrackLoop={toggleTrackLoop} onTrackVolume={setTrackVolume} onSeek={seekTo} onOpenInstrument={openInstrumentUse}
                markers={project.markers ?? []} onAddMarker={addMarker} onRenameMarker={renameMarker} onRemoveMarker={removeMarker}
                loop={project.loop} onSetLoop={setLoop}
                onAddClip={addClip} onRemoveClip={removeClip} onToggleLoop={toggleClipLoop} onCycleClipPattern={cycleClipPattern} onClipLen={setClipLen} selClip={selClip} onSelectClip={setSelClip} onEditAutomationPoints={onEditAutomationPoints}
                onMoveClip={moveClip} onMoveAudioClip={moveAudioClip} onRemoveAudioClip={removeAudioClip}
                onMoveVideoClip={moveVideoClip} onRemoveVideoClip={removeVideoClip} onSetAudioClip={setAudioClip} onSetVideoClip={setVideoClip}
                onSplitAudioClip={splitAudioClip} onSplitVideoClip={splitVideoClip} onPlayClip={auditionClip} previewKey={previewKey}
                onDuplicateAudioClip={duplicateAudioClip} onNormalizeAudioClip={normalizeAudioClip}
                getClipPeaks={getClipPeaks} getClipPeaksAsync={getClipPeaksAsync}
              />
              {hasVideoContent && !monitorOpen && (
                <button className="pgm-reopen" title="Show video preview" onClick={() => setMonitorOpen(true)}><Film size={14} /> Preview</button>
              )}
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
              // Use-scoped view: a specific track instance with its OWN flow/engine —
              // params here stay independent of the pool template and other tracks.
              const use = item.useId ? project.tracks.flatMap((t) => t.uses).find((u) => u.id === item.useId) : undefined;
              if (use) {
                const useTrack = project.tracks.find((t) => t.uses.some((u) => u.id === use.id));
                return (
                  <InstrumentPanel
                    name={pool.name} trackName={useTrack?.name ?? 'track'} kind={pool.kind} flow={use.flow ?? pool.flow} gain={pool.gain ?? 1}
                    onGain={(v) => onInstrumentGain(pool.id, v)}
                    onKnob={(nodeId, param, v) => onUseInstrumentKnob(use.id, nodeId, param, v)}
                    onKnobRename={(nodeId, param, label) => onUseInstrumentKnobRename(use.id, nodeId, param, label)}
                    onEdit={() => editUseInstrument(use.id)}
                    onNoteOn={(m) => void useNoteOn(use.id, m)} onNoteOff={(m) => useNoteOff(use.id, m)} onHit={() => useDrumHit(use.id)}
                    onVstaiSample={(msg) => vstaiUseSample(use.id, msg)}
                    onAutomateParam={useAutomateParam(use.id)}
                  />
                );
              }
              return (
                <InstrumentPanel
                  name={pool.name} kind={pool.kind} flow={liveFlowFor(pool)} gain={liveGainFor(pool)}
                  onGain={(v) => onLiveInstrumentGain(pool.id, v)}
                  onKnob={(nodeId, param, v) => onInstrumentKnob(pool.id, nodeId, param, v)}
                  onKnobRename={(nodeId, param, label) => onInstrumentKnobRename(pool.id, nodeId, param, label)}
                  onEdit={() => editInstrument(pool.id)}
                  customUi={pool.customUi ?? pool.flow.customUi} onEditUi={() => setCustomUiEdit(pool.id)}
                  onNoteOn={(m) => void liveNoteOn(pool.id, m)} onNoteOff={(m) => liveNoteOff(pool.id, m)} onHit={() => void liveDrumDown(pool.id)}
                  onVstaiSample={(msg) => vstaiInstrumentSample(pool.id, msg)}
                  onAutomateParam={instrumentAutomateParam(pool.id)}
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
                <FxBar label="Master FX" color="var(--cat-master, var(--accent))" fx={project.masterFx} effects={effects} onAdd={onMasterFxAdd} onBrowse={() => openEffectBrowser('Add effect — Master', (ins) => { setProject((p) => ({ ...p, masterFx: [...p.masterFx, ins] })); rebuildMaster([...projectRef.current.masterFx, ins]); })} onRemove={onMasterFxRemove} onEdit={onMasterFxEdit}
                  onKnob={(i, nodeId, param, v) => {
                    mixerRef.current?.masterChain.setParam(i, nodeId, param, v);
                    const insert = projectRef.current.masterFx[i]; const base = insert?.flow ?? (insert && findEntry(insert.fxId)?.flow); if (!insert || !base) return;
                    const flow = setFlowParam(base, nodeId, param, v);
                    setProject((p) => ({ ...p, masterFx: p.masterFx.map((x, j) => (j === i ? { ...x, flow } : x)) }));
                  }} />
                <div className="mx-master-meter"><span className="mx-pan-label">MASTER</span><Meter analyser={() => mixerRef.current?.masterMeter ?? null} height={10} /></div>
                <LoudnessMeter analysers={() => mixerRef.current?.loudnessAnalysers() ?? null} peak={() => mixerRef.current?.masterMeter ?? null} playing={isPlaying} />
                <SpectrumAnalyzer analyser={() => mixerRef.current?.spectrumAnalyser() ?? null} />
              </div>
              <div className="mx-tracks">
                {project.tracks.map((t) => (
                  <div className={`mx-strip ${t.muted ? 'muted' : ''} ${t.soloed ? 'soloed' : ''}`} data-type={t.type} key={t.id}>
                    <div className="mx-strip-head">
                      <span className="trk-ico">{t.type === 'drums' ? <Drum size={13} /> : t.type === 'audio' ? <AudioWaveform size={13} /> : t.type === 'video' ? <Film size={13} /> : <Music2 size={13} />}</span>
                      <span className="mx-name-txt">{t.name}</span>
                      <button className={`mx-solo ${t.soloed ? 'on' : ''}`} title={t.soloed ? 'Unsolo' : 'Solo'} onClick={() => toggleTrackSolo(t.id)}>S</button>
                      <button className={`mx-mute ${t.muted ? 'on' : ''}`} title={t.muted ? 'Unmute track' : 'Mute track'} onClick={() => toggleTrackMute(t.id)}>
                        {t.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                      </button>
                      <button className={`mx-mute ${t.phase ? 'on' : ''}`} title={t.phase ? 'Polarity inverted (ø)' : 'Invert polarity (ø)'} onClick={() => toggleTrackPhase(t.id)}>ø</button>
                      {(t.type === 'drums' || t.type === 'synth') && <button className="mx-mute" title="Freeze to a new audio track (bounce-in-place; mutes this one)" onClick={() => freezeTrack(t.id)}><Snowflake size={12} /></button>}
                    </div>
                    <div className="mx-meterrow"><Meter analyser={() => mixerRef.current?.trackMeter(t.id) ?? null} /></div>
                    <div className="mx-panrow">
                      <span className="mx-pan-label">TRIM</span>
                      <input className="mx-pan" type="range" min={0} max={2} step={0.01} value={t.trim ?? 1}
                        title="Pre-FX input gain (double-click to reset)" onDoubleClick={() => setTrackTrim(t.id, 1)}
                        onChange={(e) => setTrackTrim(t.id, parseFloat(e.target.value))} />
                      <span className="mx-pan-val">{Math.round((t.trim ?? 1) * 100)}</span>
                    </div>
                    <div className="mx-panrow">
                      <span className="mx-pan-label">PAN</span>
                      <input className="mx-pan" type="range" min={-1} max={1} step={0.02} value={t.pan ?? 0}
                        title="Pan (double-click to center)" onDoubleClick={() => setTrackPan(t.id, 0)}
                        onChange={(e) => setTrackPan(t.id, parseFloat(e.target.value))} />
                      <span className="mx-pan-val">{panLabel(t.pan ?? 0)}</span>
                    </div>
                    <div className="mx-volrow">
                      <input className="mx-vol" type="range" min={0} max={1} step={0.01} value={t.volume} onChange={(e) => setTrackVolume(t.id, parseFloat(e.target.value))} />
                      <span className="mx-pct">{Math.round(t.volume * 100)}</span>
                    </div>
                    <FxBar label="Track FX" fx={t.fx} effects={effects} compact
                      onAdd={(fx) => { const ins = fxInsert(fx); mapTrack(t.id, (x) => ({ ...x, fx: [...x.fx, ins] })); rebuildTrackChain(t.id, [...t.fx, ins]); }}
                      onBrowse={() => openEffectBrowser(`Add effect — ${t.name}`, (ins) => { mapTrack(t.id, (x) => ({ ...x, fx: [...x.fx, ins] })); rebuildTrackChain(t.id, [...(projectRef.current.tracks.find((x) => x.id === t.id)?.fx ?? []), ins]); })}
                      onRemove={(i) => { const next = t.fx.filter((_, j) => j !== i); mapTrack(t.id, (x) => ({ ...x, fx: next })); rebuildTrackChain(t.id, next); }}
                      onEdit={(i) => { const insert = t.fx[i]; if (insert) editFxFlow(insert, (f) => { const next = t.fx.map((x, j) => (j === i ? { ...x, flow: f } : x)); mapTrack(t.id, (x) => ({ ...x, fx: next })); rebuildTrackChain(t.id, next); }); }}
                      onKnob={(i, nodeId, param, v) => {
                        mixerRef.current?.trackChain(t.id)?.setParam(i, nodeId, param, v);
                        const insert = t.fx[i]; const base = insert?.flow ?? (insert && findEntry(insert.fxId)?.flow); if (!insert || !base) return;
                        const flow = setFlowParam(base, nodeId, param, v);
                        mapTrack(t.id, (x) => ({ ...x, fx: x.fx.map((y, j) => (j === i ? { ...y, flow } : y)) }));
                      }}
                    />
                    {(project.buses ?? []).length > 0 && (
                      <div className="mx-outrow" title="Where this track's output goes: master, or a group/submix bus">
                        <span className="mx-send-lbl">Out</span>
                        <select className="mx-out" value={t.outputBusId ?? ''} onChange={(e) => onSetTrackOutput(t.id, e.target.value || null)}>
                          <option value="">Master</option>
                          {(project.buses ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                    )}
                    {(project.buses ?? []).length > 0 && (
                      <div className="mx-sends">
                        {(project.buses ?? []).map((b) => {
                          const lvl = t.sends?.find((s) => s.busId === b.id)?.level ?? 0;
                          return (
                            <div className="mx-sendrow" key={b.id} title={`Send to ${b.name} (double-click to zero)`}>
                              <span className="mx-send-lbl">{b.name}</span>
                              <input className="mx-send" type="range" min={0} max={1} step={0.01} value={lvl}
                                onDoubleClick={() => onSetSend(t.id, b.id, 0)}
                                onChange={(e) => onSetSend(t.id, b.id, parseFloat(e.target.value))} />
                              <span className="mx-pct">{Math.round(lvl * 100)}</span>
                              {(() => { const pre = !!t.sends?.find((s) => s.busId === b.id)?.pre; return (
                                <button className={`mx-prepost ${pre ? 'pre' : ''}`} title={pre ? 'Pre-fader (level independent of the track fader)' : 'Post-fader'}
                                  onClick={() => onSetSend(t.id, b.id, lvl, !pre)}>{pre ? 'pre' : 'post'}</button>
                              ); })()}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {t.type !== 'video' && project.tracks.some((k) => k.id !== t.id && k.type !== 'video') && (() => {
                      const sc = t.sidechain;
                      return (
                        <div className={`mx-duck ${sc ? 'on' : ''}`}>
                          <div className="mx-duck-head">
                            <span className="mx-duck-lbl" title="Sidechain ducking: dip this track's level when the key track plays (kick-ducks-bass)">DUCK</span>
                            <select className="mx-duck-key" value={sc?.keyTrackId ?? ''} title="Key track that triggers the ducking"
                              onChange={(e) => onSetSidechain(t.id, e.target.value || null)}>
                              <option value="">Off</option>
                              {project.tracks.filter((k) => k.id !== t.id && k.type !== 'video').map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                            </select>
                          </div>
                          {sc && (
                            <div className="mx-duck-ctl">
                              <span className="mx-send-lbl" title="Ducking depth">Amt</span>
                              <input className="mx-send" type="range" min={0} max={1} step={0.01} value={sc.amount} onChange={(e) => onSetSidechain(t.id, sc.keyTrackId, { amount: parseFloat(e.target.value) })} />
                              <span className="mx-pct">{Math.round(sc.amount * 100)}</span>
                              <span className="mx-send-lbl" title="Release / recovery time (ms)">Rel</span>
                              <input className="mx-send" type="range" min={20} max={600} step={5} value={sc.release} onChange={(e) => onSetSidechain(t.id, sc.keyTrackId, { release: parseFloat(e.target.value) })} />
                              <span className="mx-pct">{Math.round(sc.release)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
                {(project.buses ?? []).map((b) => (
                  <div className="mx-strip mx-bus" data-type="bus" key={b.id}>
                    <div className="mx-strip-head">
                      <span className="trk-ico"><Waves size={13} /></span>
                      <input className="mx-bus-name" value={b.name} spellCheck={false} title="Bus name" onChange={(e) => onBusName(b.id, e.target.value)} />
                      <button className="mx-mute" title="Remove bus" onClick={() => onRemoveBus(b.id)}><Trash2 size={13} /></button>
                    </div>
                    <div className="mx-meterrow"><Meter analyser={() => mixerRef.current?.busMeter(b.id) ?? null} /></div>
                    <div className="mx-volrow">
                      <input className="mx-vol" type="range" min={0} max={1} step={0.01} value={b.volume} onChange={(e) => onBusVolume(b.id, parseFloat(e.target.value))} />
                      <span className="mx-pct">{Math.round(b.volume * 100)}</span>
                    </div>
                    <FxBar label="Bus FX" fx={b.fx} effects={effects} compact
                      onAdd={(fx) => onBusFxAdd(b.id, fx)} onBrowse={() => openEffectBrowser(`Add effect — ${b.name}`, (ins) => { mapBus(b.id, (x) => ({ ...x, fx: [...x.fx, ins] })); rebuildBus(b.id, [...(busById(b.id)?.fx ?? []), ins]); })} onRemove={(i) => onBusFxRemove(b.id, i)} onEdit={(i) => onBusFxEdit(b.id, i)}
                      onKnob={(i, nodeId, param, v) => onBusFxKnob(b.id, i, nodeId, param, v)} />
                  </div>
                ))}
                <button className="mx-addbus" title="Add an aux/return bus (a shared FX destination like one reverb for many tracks)" onClick={onAddBus}>
                  <Plus size={14} /> Bus
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {editor && <SynflowEditor flow={editor.flow} title={editor.title} onSaved={editor.onSaved} onClose={() => setEditor(null)} />}
      {eqEditor && <EqEditor title={eqEditor.title} settings={eqEditor.settings} sampleRate={eqEditor.sampleRate} getAnalyser={eqEditor.getAnalyser} onChange={eqEditor.onChange} onClose={() => setEqEditor(null)} />}
      {customUiEdit && (() => {
        const pool = project.pool.find((p) => p.id === customUiEdit);
        if (!pool || pool.kind === undefined) { return null; }
        return (
          <CustomUiEditor
            poolName={pool.name} kind={pool.kind} initialHtml={pool.customUi ?? pool.flow.customUi ?? ''} knobs={flowKnobs(pool.flow)}
            valueOf={(nodeId, param) => liveFlowFor(pool).nodes.find((n: any) => n.id === nodeId)?.data?.[param]}
            onKnob={(nodeId, param, v) => onInstrumentKnob(pool.id, nodeId, param, v)}
            onNoteOn={(m, vel) => void liveNoteOn(pool.id, m, vel)} onNoteOff={(m) => liveNoteOff(pool.id, m)} onHit={() => void liveDrumDown(pool.id)}
            onSave={(html) => saveCustomUi(pool.id, html)}
            onClose={() => setCustomUiEdit(null)} />
        );
      })()}
      {storageSetup && <StorageSetup onFolder={(h2) => adoptFolder(h2, true)} onSkip={() => setStorageSetup(false)} />}
      {vstaiFxGui && (
        <div className="syn-overlay" onClick={() => setVstaiFxGui(null)}>
          <div className="vstai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="plg-head">
              <span className="plg-title">{vstaiFxGui.insert.name} <span className="fxdev-ai">AI</span></span>
              <button className="syn-close" onClick={() => setVstaiFxGui(null)} title="Close"><X size={16} /></button>
            </div>
            {(() => {
              const html = vstaiHtmlOf(vstaiFxGui.insert.flow);
              const params = flowKnobs(vstaiFxGui.insert.flow).map((k) => { const m = /^param(\d+)$/.exec(k.param); return m ? { index: +m[1], label: k.label, min: k.min, max: k.max } : null; }).filter((x): x is { index: number; label: string; min: number; max: number } => !!x);
              const vd = vstaiFxGui.insert.flow?.nodes?.find((n: any) => n.id === 'vstai')?.data;   // persisted knob positions
              const values: Record<number, number> = {};
              for (const p of params) { const v = vd?.[`param${p.index}`]; if (typeof v === 'number') values[p.index] = v; }
              return html
                ? <VstaiGui html={html} maxHeight="62vh" params={params} values={values}
                    onParam={(i, v) => vstaiFxParam(vstaiFxGui.insert, i, v)}
                    onSample={(m) => vstaiFxSample(vstaiFxGui.insert, m)}
                    onAutomate={fxAutomateParam(vstaiFxGui.insert)} />
                : <div className="plg-none" style={{ padding: 16 }}>This plugin shipped without a GUI.</div>;
            })()}
          </div>
        </div>
      )}
      {pluginBrowser && (
        <AddPluginDialog mode={pluginBrowser.mode} title={pluginBrowser.title} library={pluginBrowser.library}
          pool={pluginBrowser.pool} onPick={pluginBrowser.onPick} onClose={() => setPluginBrowser(null)} />
      )}
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
