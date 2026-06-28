import React, { useCallback, useRef, useState } from 'react';
import { RealtimeClock } from './audio/ClockSource';
import { Transport } from './audio/Transport';
import { Scheduler } from './audio/Scheduler';
import { InstrumentHost } from './audio/InstrumentHost';
import { VoicePool } from './audio/VoicePool';
import { Mixer } from './audio/Mixer';
import { defaultProject, newNoteId, uid, type Instrument, type Project, type Track } from './model/project';
import { midiToFreq } from './model/pitch';
import { makeBlip, makeSynthVoice, type Flow } from './synflow/instruments';
import { findEntry, cloneFlow, type LibraryEntry } from './synflow/library';
import { openInSynflow } from './synflow/editorBridge';
import { TopBar, type ViewId } from './ui/TopBar';
import { Browser } from './ui/Browser';
import { Arrange } from './ui/Arrange';
import { Mixer as MixerView } from './ui/Mixer';
import { FXChain } from './ui/FXChain';
import { PluginPanel } from './ui/PluginPanel';
import { TrackList, type TrackHandlers } from './ui/TrackList';
import { SamplerEditor } from './ui/SamplerEditor';

export function App() {
  const [project, setProject] = useState<Project>(() => defaultProject());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [noteLength, setNoteLength] = useState(2);
  const [samplerTrack, setSamplerTrack] = useState<string | null>(null);
  const [view, setView] = useState<ViewId>('arrange');
  const [browserOpen, setBrowserOpen] = useState(true);
  const [armed, setArmed] = useState(false);
  const [selTrack, setSelTrack] = useState<string>(() => defaultProject().tracks[0]?.id ?? '');
  const [openPlugin, setOpenPlugin] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const schedulerRef = useRef<Scheduler | null>(null);
  const hostsRef = useRef<Map<string, InstrumentHost>>(new Map()); // step instruments
  const poolsRef = useRef<Map<string, VoicePool>>(new Map());      // piano instruments
  const mixerRef = useRef<Mixer | null>(null);                      // strips keyed by track id
  const projectRef = useRef(project);
  projectRef.current = project;

  const buildInstrumentAudio = useCallback(async (inst: Instrument, dest: AudioNode) => {
    const ctx = ctxRef.current!;
    if (inst.kind === 'piano') {
      if (poolsRef.current.has(inst.id)) return;
      poolsRef.current.set(inst.id, await VoicePool.create(() => new InstrumentHost(ctx, inst.flow, dest), inst.voices ?? 6));
    } else {
      if (hostsRef.current.has(inst.id)) return;
      const host = new InstrumentHost(ctx, inst.flow, dest);
      await host.load();
      hostsRef.current.set(inst.id, host);
    }
  }, []);

  const buildTrackAudio = useCallback(async (track: Track) => {
    const mixer = mixerRef.current;
    if (!mixer || !ctxRef.current) return;
    const strip = mixer.strip(track.id, track.volume);
    for (let i = 0; i < track.fx.length; i++) {
      const def = findEntry(track.fx[i]);
      const flow = track.fxFlows?.[i] ?? def?.flow; // edited-in-Synflow override wins
      if (flow && strip.fxNames.length <= i) await strip.addFx(def?.name ?? track.fx[i], cloneFlow(flow));
    }
    for (const inst of track.instruments) await buildInstrumentAudio(inst, strip.destination);
  }, [buildInstrumentAudio]);

  const ensureAudio = useCallback(async () => {
    if (ctxRef.current) return;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    mixerRef.current = new Mixer(ctx);
    const clock = new RealtimeClock(ctx);
    const transport = new Transport(clock);
    transport.stepsPerBeat = projectRef.current.stepsPerBeat;
    transportRef.current = transport;

    for (const track of projectRef.current.tracks) await buildTrackAudio(track);

    const scheduler = new Scheduler(clock, transport, (step, time) => {
      const proj = projectRef.current;
      const mixer = mixerRef.current!;
      const lead = Math.max(0, (time - clock.currentTime) * 1000);
      const stepMs = transport.secondsPerStep * 1000;
      const gateMs = Math.min(transport.secondsPerStep * 0.9, 0.5) * 1000;
      for (const track of proj.tracks) {
        // instruments
        for (const inst of track.instruments) {
          if (inst.muted) continue;
          if (inst.kind === 'piano') {
            const pool = poolsRef.current.get(inst.id);
            if (!pool || !inst.notes) continue;
            for (const n of inst.notes) {
              if (n.start !== step) continue;
              const freq = midiToFreq(n.midi);
              window.setTimeout(() => pool.noteOn(n.id, freq), lead);
              window.setTimeout(() => pool.noteOff(n.id), lead + n.length * stepMs);
            }
          } else if (inst.steps[step]) {
            const host = hostsRef.current.get(inst.id);
            if (!host) continue;
            window.setTimeout(() => host.trigger(), lead);
            window.setTimeout(() => host.release(), lead + gateMs);
          }
        }
        // automation lanes → @synflow/core setParam (control-rate)
        for (const lane of track.automation) {
          const v = lane.values[step];
          if (v == null) continue;
          window.setTimeout(() => {
            if (lane.fxIndex != null) mixer.get(track.id)?.setFxParam(lane.fxIndex, lane.nodeId, lane.param, v);
            else if (lane.instrumentId) {
              hostsRef.current.get(lane.instrumentId)?.setParam(lane.nodeId, lane.param, v);
              poolsRef.current.get(lane.instrumentId)?.setParam(lane.nodeId, lane.param, v);
            }
          }, lead);
        }
      }
      window.setTimeout(() => setCurrentStep(step), lead);
    });
    scheduler.totalSteps = projectRef.current.totalSteps;
    schedulerRef.current = scheduler;
  }, [buildTrackAudio]);

  const play = useCallback(async () => {
    await ensureAudio();
    await ctxRef.current!.resume();
    transportRef.current!.bpm = projectRef.current.bpm;
    schedulerRef.current!.totalSteps = projectRef.current.totalSteps;
    transportRef.current!.start();
    schedulerRef.current!.start();
    setIsPlaying(true);
  }, [ensureAudio]);

  const stop = useCallback(() => {
    schedulerRef.current?.stop();
    transportRef.current?.stop();
    for (const p of poolsRef.current.values()) p.allOff();
    setIsPlaying(false);
    setCurrentStep(-1);
  }, []);

  // Audition: trigger an instrument immediately on click (builds/resumes audio on
  // the user gesture). Gives instant feedback that the controls are live.
  const audition = useCallback(async (instId: string, payload?: { frequency: number }) => {
    await ensureAudio();
    await ctxRef.current?.resume();
    const pool = poolsRef.current.get(instId);
    if (pool) {
      const nid = -Math.floor(performance.now());
      pool.noteOn(nid, payload?.frequency ?? 440);
      window.setTimeout(() => pool.noteOff(nid), 350);
      return;
    }
    const host = hostsRef.current.get(instId);
    if (host) { host.trigger(payload ?? {}); window.setTimeout(() => host.release(payload ?? {}), 220); }
  }, [ensureAudio]);

  // ─── project edits ──────────────────────────────────────────────────────────
  const setBpm = (bpm: number) => { setProject((p) => ({ ...p, bpm })); if (transportRef.current) transportRef.current.bpm = bpm; };

  const mapInstrument = (instId: string, fn: (i: Instrument) => Instrument) =>
    setProject((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, instruments: t.instruments.map((i) => (i.id === instId ? fn(i) : i)) })) }));
  const mapTrack = (trackId: string, fn: (t: Track) => Track) =>
    setProject((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === trackId ? fn(t) : t)) }));

  const h: TrackHandlers = {
    onVolume: (trackId, v) => { mapTrack(trackId, (t) => ({ ...t, volume: v })); mixerRef.current?.get(trackId)?.setVolume(v); },
    onAddFx: async (trackId, fxId) => {
      mapTrack(trackId, (t) => ({ ...t, fx: [...t.fx, fxId] }));
      const def = findEntry(fxId);
      const strip = mixerRef.current?.get(trackId);
      if (def && strip) await strip.addFx(def.name, cloneFlow(def.flow));
    },
    onRemoveFx: (trackId, index) => { mapTrack(trackId, (t) => ({ ...t, fx: t.fx.filter((_, i) => i !== index) })); mixerRef.current?.get(trackId)?.removeFx(index); },
    onToggleStep: (instId, step) => mapInstrument(instId, (i) => {
      if (!i.steps[step]) void audition(instId); // audition when turning a step ON
      return { ...i, steps: i.steps.map((s, n) => (n === step ? !s : s)) };
    }),
    onMute: (instId) => mapInstrument(instId, (i) => ({ ...i, muted: !i.muted })),
    onAddNote: (instId, midi, start) => { void audition(instId, { frequency: midiToFreq(midi) }); mapInstrument(instId, (i) => ({ ...i, notes: [...(i.notes ?? []), { id: newNoteId(), midi, start, length: noteLength }] })); },
    onRemoveNote: (instId, noteId) => mapInstrument(instId, (i) => ({ ...i, notes: (i.notes ?? []).filter((n) => n.id !== noteId) })),
    onAddInstrument: (trackId, kind) => {
      const total = projectRef.current.totalSteps;
      const inst: Instrument = kind === 'piano'
        ? { id: uid('inst'), name: 'Synth', kind: 'piano', flow: makeSynthVoice('square'), steps: [], notes: [], voices: 6 }
        : { id: uid('inst'), name: 'Drum', kind: 'step', flow: makeBlip(660), steps: Array(total).fill(false) };
      mapTrack(trackId, (t) => ({ ...t, instruments: [...t.instruments, inst] }));
      const strip = mixerRef.current?.get(trackId);
      if (strip) void buildInstrumentAudio(inst, strip.destination);
    },
    onAddSample: (trackId) => setSamplerTrack(trackId),
    onAddAutomation: (trackId) =>
      mapTrack(trackId, (t) => ({
        ...t,
        automation: [...t.automation, { id: uid('auto'), fxIndex: 0, nodeId: 'filt.BiquadFilterFlowNode', param: 'frequency', min: 200, max: 6000, values: Array(projectRef.current.totalSteps).fill(null) }],
      })),
    onSetAutomation: (laneId, step, value) =>
      setProject((p) => ({
        ...p,
        tracks: p.tracks.map((t) => ({ ...t, automation: t.automation.map((l) => (l.id === laneId ? { ...l, values: l.values.map((v, i) => (i === step ? value : v)) } : l)) })),
      })),
    onAddTrack: () => setProject((p) => ({ ...p, tracks: [...p.tracks, { id: uid('track'), name: `Track ${p.tracks.length + 1}`, volume: 0.8, fx: [], instruments: [], automation: [] }] })),
  };

  // Browser → add a library flow (instrument or effect) to the selected track.
  const addFromLibrary = (entry: LibraryEntry) => {
    const trackId = selTrack || projectRef.current.tracks[0]?.id;
    if (!trackId) return;
    if (entry.group === 'effect') { void h.onAddFx(trackId, entry.id); return; }
    const total = projectRef.current.totalSteps;
    const inst: Instrument = entry.kind === 'piano'
      ? { id: uid('inst'), name: entry.name, kind: 'piano', flow: cloneFlow(entry.flow), steps: [], notes: [], voices: 6 }
      : { id: uid('inst'), name: entry.name, kind: 'step', flow: cloneFlow(entry.flow), steps: Array(total).fill(false) };
    mapTrack(trackId, (t) => ({ ...t, instruments: [...t.instruments, inst] }));
    const strip = mixerRef.current?.get(trackId);
    if (strip) void buildInstrumentAudio(inst, strip.destination);
  };

  // Replace an instrument's flow (e.g. after editing it in Synflow) and rebuild
  // its live engine in place, keeping it routed to the same track strip.
  const reloadInstrument = (instId: string, flow: Flow) => {
    mapInstrument(instId, (i) => ({ ...i, flow }));
    const track = projectRef.current.tracks.find((t) => t.instruments.some((i) => i.id === instId));
    const inst = track?.instruments.find((i) => i.id === instId);
    const strip = track ? mixerRef.current?.get(track.id) : undefined;
    if (!inst || !strip || !ctxRef.current) return;
    hostsRef.current.get(instId)?.dispose(); hostsRef.current.delete(instId);
    poolsRef.current.get(instId)?.dispose(); poolsRef.current.delete(instId);
    void buildInstrumentAudio({ ...inst, flow }, strip.destination);
  };

  // Replace a track FX flow (after editing in Synflow): persist as an override
  // and swap the live insert in place.
  const reloadFx = (trackId: string, fxIndex: number, flow: Flow) => {
    mapTrack(trackId, (t) => {
      const fxFlows = [...(t.fxFlows ?? [])];
      fxFlows[fxIndex] = flow;
      return { ...t, fxFlows };
    });
    const def = findEntry(projectRef.current.tracks.find((t) => t.id === trackId)?.fx[fxIndex] ?? '');
    void mixerRef.current?.get(trackId)?.replaceFx(fxIndex, def?.name ?? 'FX', cloneFlow(flow));
  };

  // "Edit in Synflow" — open the flow in the editor window; reload on save.
  const editInstrument = (inst: Instrument) => openInSynflow(inst.flow, (f) => reloadInstrument(inst.id, f));
  const editFx = (track: Track, fxIndex: number) => {
    const flow = track.fxFlows?.[fxIndex] ?? findEntry(track.fx[fxIndex])?.flow;
    if (flow) openInSynflow(flow, (f) => reloadFx(track.id, fxIndex, f));
  };

  const addSampleInstrument = useCallback((name: string, flow: Flow) => {
    const trackId = samplerTrack;
    if (!trackId) return;
    const inst: Instrument = { id: uid('inst'), name, kind: 'step', flow, steps: Array(projectRef.current.totalSteps).fill(false) };
    mapTrack(trackId, (t) => ({ ...t, instruments: [...t.instruments, inst] }));
    const strip = mixerRef.current?.get(trackId);
    if (strip) void buildInstrumentAudio(inst, strip.destination);
    setSamplerTrack(null);
  }, [samplerTrack, buildInstrumentAudio]);

  const sib = currentStep < 0 ? 0 : currentStep % project.totalSteps;
  const pos = `001.${Math.floor(sib / project.stepsPerBeat) + 1}.${String((sib % project.stepsPerBeat) * 25).padStart(2, '0')}`;
  const selectedTrack = project.tracks.find((t) => t.id === selTrack) ?? project.tracks[0];
  const openInst = openPlugin ? project.tracks.flatMap((t) => t.instruments).find((i) => i.id === openPlugin) : null;

  // Plugin knobs → the instrument's real @synflow/core params (live).
  const pluginParam = (inst: Instrument) => (role: string, value: number) => {
    const setP = (nodeId?: string, param?: string, v?: number) => {
      if (!nodeId || !param || v == null) return;
      hostsRef.current.get(inst.id)?.setParam(nodeId, param, v);
      poolsRef.current.get(inst.id)?.setParam(nodeId, param, v);
    };
    const osc = inst.flow.nodes.find((n) => n.type === 'OscillatorFlowNode')?.id;
    const adsr = inst.flow.nodes.find((n) => n.type === 'ADSRFlowNode')?.id;
    if (role === 'tune') setP(osc, 'detune', (value - 0.5) * 4800);
    else if (role === 'ampA') setP(adsr, 'attackTime', value);
    else if (role === 'ampD') setP(adsr, 'decayTime', value);
    else if (role === 'ampS') setP(adsr, 'sustainLevel', value);
    else if (role === 'ampR') setP(adsr, 'releaseTime', value);
  };
  // FX-chain knobs → the FX flow's real params (live).
  const fxParam = (track: Track) => (fxIndex: number, knobIndex: number, value: number) => {
    const fxId = track.fx[fxIndex];
    const strip = mixerRef.current?.get(track.id);
    if (!strip) return;
    if (fxId === 'lowpass' || fxId === 'highpass') {
      if (knobIndex === 0) strip.setFxParam(fxIndex, 'filt.BiquadFilterFlowNode', 'frequency', 60 * Math.pow(2, value * 7.6)); // ~60..12k Hz
      else if (knobIndex === 1) strip.setFxParam(fxIndex, 'filt.BiquadFilterFlowNode', 'Q', 0.1 + value * 18);
    } else if (fxId === 'delay' && knobIndex === 0) {
      strip.setFxParam(fxIndex, 'dly.DelayFlowNode', 'delayTime', 10 + value * 990);
    }
  };

  return (
    <div className="app-shell">
      <TopBar
        view={view} setView={setView} isPlaying={isPlaying} onPlay={play} onStop={stop}
        armed={armed} onArm={() => setArmed((a) => !a)} bpm={project.bpm} onBpm={setBpm} position={pos}
        browserOpen={browserOpen} setBrowserOpen={setBrowserOpen}
      />
      <div className="workspace">
        {browserOpen && <Browser onAdd={addFromLibrary} />}
        <div className="main">
          {view === 'arrange' && (
            <Arrange
              project={project} selId={selTrack} onSelect={setSelTrack} currentStep={currentStep}
              onOpen={(id) => {
                setSelTrack(id);
                const t = project.tracks.find((tr) => tr.id === id);
                setView(t?.instruments.some((i) => i.kind === 'piano') ? 'piano' : 'rack');
              }}
            />
          )}
          {(view === 'rack' || view === 'piano') && (
            <div className="editor-scroll">
              <div className="toolbar">
                <label className="notelen">note length
                  <select value={noteLength} onChange={(e) => setNoteLength(parseInt(e.target.value, 10))}>
                    <option value={1}>1</option><option value={2}>2</option><option value={4}>4</option><option value={8}>8</option>
                  </select>
                </label>
              </div>
              <TrackList project={project} currentStep={currentStep} noteLength={noteLength} h={h} />
            </div>
          )}
          {view === 'mix' && (
            <MixerView project={project} selId={selTrack} onSelect={setSelTrack} onVolume={h.onVolume} />
          )}
          {view !== 'mix' && selectedTrack && (
            <FXChain
              track={selectedTrack} onOpenInstrument={setOpenPlugin} onFxParam={fxParam(selectedTrack)}
              onEditInstrument={(id) => { const inst = selectedTrack.instruments.find((i) => i.id === id); if (inst) editInstrument(inst); }}
              onEditFx={(i) => editFx(selectedTrack, i)}
            />
          )}
        </div>
        {openInst && <PluginPanel instrument={openInst} onClose={() => setOpenPlugin(null)} onParam={pluginParam(openInst)} onEdit={() => editInstrument(openInst)} />}
      </div>
      {samplerTrack && <SamplerEditor onCreate={addSampleInstrument} onClose={() => setSamplerTrack(null)} />}
    </div>
  );
}
