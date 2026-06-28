import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Drum, Music2, Repeat } from 'lucide-react';
import { RealtimeClock } from './audio/ClockSource';
import { Transport } from './audio/Transport';
import { Scheduler } from './audio/Scheduler';
import { InstrumentHost } from './audio/InstrumentHost';
import { VoicePool } from './audio/VoicePool';
import { Mixer, type ResolvedFx } from './audio/Mixer';
import {
  defaultProject, newNoteId, uid, fxInsert, blankSteps, trackPlaysAt, patternLoopLength,
  type Project, type Track, type PoolItem, type FxInsert,
} from './model/project';
import { midiToFreq } from './model/pitch';
import { type Flow } from './synflow/instruments';
import { LIBRARY, findEntry, cloneFlow, type LibraryEntry } from './synflow/library';
import { fsSupported, restoreFolder, seedLibrary, readAllFlows, writeFlow, pickFolder } from './synflow/flowStore';
import { TopBar, type ViewId } from './ui/TopBar';
import { Pool } from './ui/Pool';
import { TrackEditor, type TrackEditorHandlers } from './ui/TrackEditor';
import { FxBar } from './ui/FxBar';
import { Live } from './ui/Live';
import { Arrange } from './ui/Arrange';
import { InstrumentPanel } from './ui/InstrumentPanel';
import { SynflowEditor } from './ui/SynflowEditor';
import { StorageSetup } from './ui/StorageSetup';

export function App() {
  const [project, setProject] = useState<Project>(() => defaultProject());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [view, setView] = useState<ViewId>('tracks');
  const [browserOpen, setBrowserOpen] = useState(true);
  const [armed, setArmed] = useState(false);
  const [selTrack, setSelTrack] = useState<string>(() => defaultProject().tracks[0]?.id ?? '');
  const [liveSynth, setLiveSynth] = useState<string>('');
  const [armedPool, setArmedPool] = useState<string | null>(null);
  const [instPanel, setInstPanel] = useState<string | null>(null);
  const [songMode, setSongMode] = useState(false);
  const songModeRef = useRef(false); songModeRef.current = songMode;
  const [editor, setEditor] = useState<{ flow: Flow; title: string; onSaved: (f: Flow) => void } | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[]>(LIBRARY);
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [storageSetup, setStorageSetup] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const schedulerRef = useRef<Scheduler | null>(null);
  const hostsRef = useRef<Map<string, InstrumentHost>>(new Map());      // drum uses, keyed by use.id
  const poolsRef = useRef<Map<string, VoicePool>>(new Map());           // synth uses, keyed by use.id
  const liveSynthsRef = useRef<Map<string, VoicePool>>(new Map());      // live synths, keyed by poolId
  const liveDrumsRef = useRef<Map<string, InstrumentHost>>(new Map());  // live drums, keyed by poolId
  const liveGainRef = useRef<Map<string, GainNode>>(new Map());         // live per-instrument gain, keyed by poolId
  const mixerRef = useRef<Mixer | null>(null);
  const projectRef = useRef(project); projectRef.current = project;
  const folderRef = useRef<FileSystemDirectoryHandle | null>(null); folderRef.current = folder;

  const effects = library.filter((e) => e.group === 'effect');
  const selectedTrack = project.tracks.find((t) => t.id === selTrack) ?? project.tracks[0];

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
      if (handle) await adoptFolder(handle);
      else if (fsSupported) setStorageSetup(true);
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
      .map((ins) => ({ name: ins.name, flow: ins.flow ?? findEntry(ins.fxId)?.flow }))
      .filter((x): x is { name: string; flow: Flow } => !!x.flow)
      .map((x) => ({ name: x.name, flow: cloneFlow(x.flow) }));

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

  const buildAudio = useCallback(async () => {
    const mixer = mixerRef.current; if (!mixer || !ctxRef.current) return;
    const proj = projectRef.current;
    await mixer.masterChain.setChain(resolveFx(proj.masterFx));
    for (const track of proj.tracks) {
      const t = mixer.track(track.id, track.volume);
      await t.chain.setChain(resolveFx(track.fx));
      for (const use of track.uses) {
        const dest = mixer.use(use.id, track.id);
        await mixer.useChain(use.id)!.setChain(resolveFx(use.fx));
        const pool = proj.pool.find((p) => p.id === use.poolId);
        if (pool) await buildUse(use.id, pool, dest, use.voices);
      }
    }
  }, [buildUse]);

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
        // Live loop gate: a looping track always plays; in Song mode clips can too.
        if (song ? !trackPlaysAt(track, slot, proj.songSlots) : !track.loop) continue;
        const step = s % Math.max(1, track.length);    // each track loops at its own length
        for (const use of track.uses) {
          if (use.muted) continue;
          if (track.type === 'synth' && use.notes) {
            const vp = poolsRef.current.get(use.id); if (!vp) continue;
            for (const n of use.notes) {
              if (n.start !== step) continue;
              const f = midiToFreq(n.midi);
              window.setTimeout(() => vp.noteOn(n.id, f), lead);
              window.setTimeout(() => vp.noteOff(n.id), lead + n.length * stepMs);
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
    scheduler.totalSteps = projectRef.current.totalSteps;
    schedulerRef.current = scheduler;
  }, [buildAudio]);

  const play = useCallback(async () => {
    await ensureAudio();
    await ctxRef.current!.resume();
    transportRef.current!.bpm = projectRef.current.bpm;
    const proj = projectRef.current;
    schedulerRef.current!.totalSteps = songModeRef.current ? proj.songSlots * proj.totalSteps : patternLoopLength(proj.tracks);
    transportRef.current!.start(); schedulerRef.current!.start();
    setIsPlaying(true);
  }, [ensureAudio]);

  const stop = useCallback(() => {
    schedulerRef.current?.stop(); transportRef.current?.stop();
    for (const vp of poolsRef.current.values()) vp.allOff();
    setIsPlaying(false); setCurrentStep(-1);
  }, []);

  const setBpm = (bpm: number) => { setProject((p) => ({ ...p, bpm })); if (transportRef.current) transportRef.current.bpm = bpm; };

  // ─── audition (click feedback) + live performance ──────────────────────────
  const audition = useCallback(async (useId: string, payload?: { frequency: number }) => {
    await ensureAudio(); await ctxRef.current?.resume();
    if (!hostsRef.current.has(useId) && !poolsRef.current.has(useId)) await buildAudio();
    const vp = poolsRef.current.get(useId);
    if (vp) { const id = -Math.floor(performance.now()); vp.noteOn(id, payload?.frequency ?? 440); window.setTimeout(() => vp.noteOff(id), 350); return; }
    const host = hostsRef.current.get(useId);
    if (host) { host.trigger(); window.setTimeout(() => host.release(), 220); }
  }, [ensureAudio, buildAudio]);

  const liveGain = (poolId: string): GainNode => {
    const ctx = ctxRef.current!; const mixer = mixerRef.current!;
    let g = liveGainRef.current.get(poolId);
    if (!g) { g = ctx.createGain(); g.gain.value = projectRef.current.pool.find((p) => p.id === poolId)?.gain ?? 1; g.connect(mixer.masterSum); liveGainRef.current.set(poolId, g); }
    return g;
  };
  const buildLive = useCallback(async (poolId: string) => {
    await ensureAudio(); await ctxRef.current?.resume();
    const ctx = ctxRef.current!;
    const pool = projectRef.current.pool.find((p) => p.id === poolId); if (!pool) return;
    const dest = liveGain(poolId);
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
  const liveDrumUp = useCallback(() => {}, []);

  // Open the per-instrument page (live + exposed knobs + gain + edit).
  const openInstrument = (poolId: string) => {
    const pool = project.pool.find((p) => p.id === poolId);
    setArmedPool(poolId);
    if (pool?.kind === 'synth') setLiveSynth(poolId);
    setInstPanel(poolId);
    void buildLive(poolId);
  };

  const mapPool = (poolId: string, fn: (p: PoolItem) => PoolItem) =>
    setProject((p) => ({ ...p, pool: p.pool.map((pi) => (pi.id === poolId ? fn(pi) : pi)) }));
  const usesOfPool = (poolId: string) => projectRef.current.tracks.flatMap((t) => t.uses).filter((u) => u.poolId === poolId);

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

  const onInstrumentGain = (poolId: string, v: number) => {
    mapPool(poolId, (pi) => ({ ...pi, gain: v }));
    for (const u of usesOfPool(poolId)) mixerRef.current?.setUseGain(u.id, v);
    const g = liveGainRef.current.get(poolId); if (g) g.gain.value = v;
  };

  // Edit an instrument flow in Synflow → replace the pool flow + rebuild engines + persist.
  const editInstrument = (poolId: string) => {
    const pool = projectRef.current.pool.find((p) => p.id === poolId); if (!pool) return;
    setEditor({ flow: pool.flow, title: pool.name, onSaved: (f) => {
      mapPool(poolId, (pi) => ({ ...pi, flow: f }));
      for (const u of usesOfPool(poolId)) {
        const t = trackOfUse(u.id); const strip = t ? mixerRef.current?.use(u.id, t.id) : undefined;
        hostsRef.current.get(u.id)?.dispose(); hostsRef.current.delete(u.id);
        poolsRef.current.get(u.id)?.dispose(); poolsRef.current.delete(u.id);
        if (strip) void buildUse(u.id, { ...pool, flow: f }, strip, u.voices);
      }
      liveSynthsRef.current.get(poolId)?.dispose(); liveSynthsRef.current.delete(poolId);
      liveDrumsRef.current.get(poolId)?.dispose(); liveDrumsRef.current.delete(poolId);
      const root = folderRef.current;
      if (root) writeFlow(root, { group: 'instrument', id: pool.libId ?? pool.id, name: pool.name, category: pool.kind === 'synth' ? 'Synths' : 'Drums', kind: pool.kind === 'synth' ? 'piano' : 'step', flow: f }).then(() => console.info('[Mothscilla] saved instrument to disk')).catch((e) => console.warn('[Mothscilla] save instrument failed', e));
      else console.info('[Mothscilla] no folder set — instrument edit kept in project only');
    } });
  };

  // Edit an effect flow in Synflow → update the library entry + persist (future inserts use it).
  const editEffect = (effectId: string) => {
    const e = library.find((x) => x.id === effectId && x.group === 'effect'); if (!e) return;
    setEditor({ flow: e.flow, title: e.name, onSaved: (f) => {
      setLibrary((lib) => lib.map((x) => (x.id === effectId && x.group === 'effect' ? { ...x, flow: f } : x)));
      const root = folderRef.current;
      if (root) writeFlow(root, { group: 'effect', id: effectId, name: e.name, category: e.category, flow: f }).then(() => console.info('[Mothscilla] saved effect to disk')).catch((er) => console.warn('[Mothscilla] save effect failed', er));
      else console.info('[Mothscilla] no folder set — effect edit kept in project only');
    } });
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
    setProject((p) => ({ ...p, pool: p.pool.filter((pi) => pi.id !== poolId), tracks: p.tracks.map((t) => ({ ...t, uses: t.uses.filter((u) => u.poolId !== poolId) })) }));
    if (instPanel === poolId) setInstPanel(null);
    if (liveSynth === poolId) setLiveSynth('');
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

  const h: TrackEditorHandlers = {
    onToggleStep: (useId, step) => mapUse(useId, (u) => {
      if (!(u.steps ?? [])[step]) void audition(useId);
      return { ...u, steps: (u.steps ?? blankSteps(projectRef.current.totalSteps)).map((s, i) => (i === step ? !s : s)) };
    }),
    onMuteUse: (useId) => mapUse(useId, (u) => ({ ...u, muted: !u.muted })),
    onAddNote: (useId, midi, start) => { void audition(useId, { frequency: midiToFreq(midi) }); mapUse(useId, (u) => ({ ...u, notes: [...(u.notes ?? []), { id: newNoteId(), midi, start, length: 2 }] })); },
    onRemoveNote: (useId, noteId) => mapUse(useId, (u) => ({ ...u, notes: (u.notes ?? []).filter((n) => n.id !== noteId) })),
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
      editFxFlow(insert, (f) => { mapUse(useId, (u) => ({ ...u, fx: u.fx.map((x, j) => (j === i ? { ...x, flow: f } : x)) })); rebuildUseChain(useId, (useById(useId)?.fx ?? []).map((x, j) => (j === i ? { ...x, flow: f } : x))); });
    },
    onTrackFxAdd: (fxId) => { const t = selectedTrack; if (!t) return; const ins = fxInsert(fxId); mapTrack(t.id, (x) => ({ ...x, fx: [...x.fx, ins] })); rebuildTrackChain(t.id, [...t.fx, ins]); },
    onTrackFxRemove: (i) => { const t = selectedTrack; if (!t) return; const next = t.fx.filter((_, j) => j !== i); mapTrack(t.id, (x) => ({ ...x, fx: next })); rebuildTrackChain(t.id, next); },
    onTrackFxEdit: (i) => {
      const t = selectedTrack; const insert = t?.fx[i]; if (!t || !insert) return;
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
  };

  const addTrack = (type: 'drums' | 'synth') => {
    const id = uid('track');
    setProject((p) => ({ ...p, tracks: [...p.tracks, { id, name: `${type === 'drums' ? 'Drums' : 'Synth'} ${p.tracks.length + 1}`, type, volume: 0.8, loop: true, length: p.totalSteps, uses: [], clips: [{ id: uid('clip'), start: 0, length: 1, loop: true }], fx: [], automation: [] }] }));
    setSelTrack(id);
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
  const setTrackLength = (trackId: string, length: number) => {
    const len = Math.max(1, Math.min(64, length));
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
    if (schedulerRef.current) schedulerRef.current.totalSteps = next ? projectRef.current.songSlots * projectRef.current.totalSteps : patternLoopLength(projectRef.current.tracks);
    return next;
  });
  const setSongSlots = (n: number) => setProject((p) => ({ ...p, songSlots: n }));
  const addClip = (trackId: string, slot: number) => mapTrack(trackId, (t) => (t.clips.some((c) => c.start === slot) ? t : { ...t, clips: [...t.clips, { id: uid('clip'), start: Math.max(0, slot), length: 1, loop: false }] }));
  const removeClip = (trackId: string, clipId: string) => mapTrack(trackId, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) }));
  const toggleClipLoop = (trackId: string, clipId: string) => mapTrack(trackId, (t) => ({ ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, loop: !c.loop } : c)) }));
  const setClipLen = (trackId: string, clipId: string, length: number) => mapTrack(trackId, (t) => ({ ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, length } : c)) }));

  const onMasterFxAdd = (fxId: string) => { const ins = fxInsert(fxId); setProject((p) => ({ ...p, masterFx: [...p.masterFx, ins] })); rebuildMaster([...project.masterFx, ins]); };
  const onMasterFxRemove = (i: number) => { const next = project.masterFx.filter((_, j) => j !== i); setProject((p) => ({ ...p, masterFx: next })); rebuildMaster(next); };
  const onMasterFxEdit = (i: number) => {
    const insert = project.masterFx[i]; if (!insert) return;
    editFxFlow(insert, (f) => { const next = projectRef.current.masterFx.map((x, j) => (j === i ? { ...x, flow: f } : x)); setProject((p) => ({ ...p, masterFx: next })); rebuildMaster(next); });
  };

  // ─── position readout ──────────────────────────────────────────────────────
  const sib = currentStep < 0 ? 0 : currentStep % project.totalSteps;
  const pos = `001.${Math.floor(sib / project.stepsPerBeat) + 1}.${String((sib % project.stepsPerBeat) * 25).padStart(2, '0')}`;

  return (
    <div className="app-shell">
      <TopBar
        view={view} setView={setView} isPlaying={isPlaying} onPlay={isPlaying ? stop : play} onStop={stop}
        armed={armed} onArm={() => setArmed((a) => !a)} bpm={project.bpm} onBpm={setBpm} position={pos}
        browserOpen={browserOpen} setBrowserOpen={setBrowserOpen}
      />
      <div className="workspace">
        {browserOpen && <Pool pool={project.pool} effects={effects} armed={armedPool} onOpenInstrument={openInstrument} onEditEffect={editEffect} onRemoveInstrument={removePoolItem} onRemoveEffect={removeEffect} onAddFromFolder={addFromFolder} source={folder ? `disk · ${folder.name}` : 'built-in'} />}
        <div className="main">
          {view === 'tracks' && (
            <div className="tracks-view">
              <div className="tracks-rail">
                {project.tracks.map((t) => (
                  <div key={t.id} className={`trk ${t.id === selTrack ? 'sel' : ''}`} onClick={() => setSelTrack(t.id)}>
                    {t.type === 'drums' ? <Drum size={13} /> : <Music2 size={13} />}
                    <span className="trk-name">{t.name}</span>
                    <button className={`trk-loop ${t.loop ? 'on' : ''}`} title={t.loop ? 'Looping' : 'Loop off'} onClick={(e) => { e.stopPropagation(); toggleTrackLoop(t.id); }}><Repeat size={12} /></button>
                    <button className="trk-del" title="Delete track" onClick={(e) => { e.stopPropagation(); removeTrack(t.id); }}><Trash2 size={12} /></button>
                  </div>
                ))}
                <div className="trk-add">
                  <button onClick={() => addTrack('drums')}><Plus size={12} /> Drums</button>
                  <button onClick={() => addTrack('synth')}><Plus size={12} /> Synth</button>
                </div>
              </div>
              <div className="track-editor-wrap">
                {selectedTrack
                  ? <TrackEditor project={project} track={selectedTrack} effects={effects} currentStep={currentStep} h={h} />
                  : <div className="te-empty">No track — add one.</div>}
              </div>
            </div>
          )}

          {view === 'song' && (
            <Arrange
              project={project} currentSlot={currentStep < 0 ? -1 : Math.floor(currentStep / project.totalSteps)} songMode={songMode} selTrack={selTrack}
              onToggleSongMode={toggleSongMode} onSetSongSlots={setSongSlots} onSelectTrack={setSelTrack}
              onAddClip={addClip} onRemoveClip={removeClip} onToggleLoop={toggleClipLoop} onClipLen={setClipLen}
            />
          )}

          {view === 'live' && (
            <Live
              project={project} synthId={liveSynth} onSelectSynth={setLiveSynth}
              onNoteOn={liveNoteOn} onNoteOff={liveNoteOff} onDrumDown={liveDrumDown} onDrumUp={liveDrumUp}
            />
          )}

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
                    <div className="mx-strip-head">{t.type === 'drums' ? <Drum size={13} /> : <Music2 size={13} />} {t.name}</div>
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
      {instPanel && (() => {
        const pool = project.pool.find((p) => p.id === instPanel);
        if (!pool) return null;
        return (
          <InstrumentPanel
            pool={pool} gain={pool.gain ?? 1}
            onGain={(v) => onInstrumentGain(pool.id, v)}
            onKnob={(nodeId, param, v) => onInstrumentKnob(pool.id, nodeId, param, v)}
            onEdit={() => editInstrument(pool.id)}
            onClose={() => setInstPanel(null)}
            onNoteOn={(m) => void liveNoteOn(pool.id, m)} onNoteOff={(m) => liveNoteOff(pool.id, m)}
            onHit={() => void liveDrumDown(pool.id)}
          />
        );
      })()}
      {editor && <SynflowEditor flow={editor.flow} title={editor.title} onSaved={editor.onSaved} onClose={() => setEditor(null)} />}
      {storageSetup && <StorageSetup onFolder={(h2) => adoptFolder(h2, true)} onSkip={() => setStorageSetup(false)} />}
    </div>
  );
}
