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
import { FX_LIBRARY } from './synflow/effects';
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
    for (const fxId of track.fx) {
      const def = FX_LIBRARY.find((f) => f.id === fxId);
      if (def && strip.fxNames.length < track.fx.length) await strip.addFx(def.name, def.make());
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
      const def = FX_LIBRARY.find((f) => f.id === fxId);
      const strip = mixerRef.current?.get(trackId);
      if (def && strip) await strip.addFx(def.name, def.make());
    },
    onRemoveFx: (trackId, index) => { mapTrack(trackId, (t) => ({ ...t, fx: t.fx.filter((_, i) => i !== index) })); mixerRef.current?.get(trackId)?.removeFx(index); },
    onToggleStep: (instId, step) => mapInstrument(instId, (i) => ({ ...i, steps: i.steps.map((s, n) => (n === step ? !s : s)) })),
    onMute: (instId) => mapInstrument(instId, (i) => ({ ...i, muted: !i.muted })),
    onAddNote: (instId, midi, start) => mapInstrument(instId, (i) => ({ ...i, notes: [...(i.notes ?? []), { id: newNoteId(), midi, start, length: noteLength }] })),
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
        {browserOpen && <Browser />}
        <div className="main">
          {view === 'arrange' && (
            <Arrange project={project} selId={selTrack} onSelect={setSelTrack} currentStep={currentStep} />
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
            <FXChain track={selectedTrack} onOpenInstrument={setOpenPlugin} onFxParam={fxParam(selectedTrack)} />
          )}
        </div>
        {openInst && <PluginPanel instrument={openInst} onClose={() => setOpenPlugin(null)} onParam={pluginParam(openInst)} />}
      </div>
      {samplerTrack && <SamplerEditor onCreate={addSampleInstrument} onClose={() => setSamplerTrack(null)} />}
    </div>
  );
}
