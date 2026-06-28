import React, { useCallback, useRef, useState } from 'react';
import { RealtimeClock } from './audio/ClockSource';
import { Transport } from './audio/Transport';
import { Scheduler } from './audio/Scheduler';
import { InstrumentHost } from './audio/InstrumentHost';
import { VoicePool } from './audio/VoicePool';
import { defaultProject, newNoteId, type Channel, type Project } from './model/project';
import { midiToFreq } from './model/pitch';
import type { Flow } from './synflow/instruments';
import { TransportBar } from './ui/TransportBar';
import { ChannelRack } from './ui/ChannelRack';
import { PianoRoll } from './ui/PianoRoll';
import { SamplerEditor } from './ui/SamplerEditor';

export function App() {
  const [project, setProject] = useState<Project>(() => defaultProject());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showSampler, setShowSampler] = useState(false);
  const [noteLength, setNoteLength] = useState(2);

  const ctxRef = useRef<AudioContext | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const schedulerRef = useRef<Scheduler | null>(null);
  const hostsRef = useRef<Map<string, InstrumentHost>>(new Map()); // step channels
  const poolsRef = useRef<Map<string, VoicePool>>(new Map());      // piano channels
  const projectRef = useRef(project);
  projectRef.current = project;

  const buildChannelAudio = useCallback(async (ch: Channel) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ch.kind === 'piano') {
      if (poolsRef.current.has(ch.id)) return;
      const pool = await VoicePool.create(() => new InstrumentHost(ctx, ch.flow, ctx.destination), ch.voices ?? 6);
      poolsRef.current.set(ch.id, pool);
    } else {
      if (hostsRef.current.has(ch.id)) return;
      const host = new InstrumentHost(ctx, ch.flow, ctx.destination);
      await host.load();
      hostsRef.current.set(ch.id, host);
    }
  }, []);

  const ensureAudio = useCallback(async () => {
    if (ctxRef.current) return;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const clock = new RealtimeClock(ctx);
    const transport = new Transport(clock);
    transport.stepsPerBeat = projectRef.current.stepsPerBeat;
    transportRef.current = transport;

    for (const ch of projectRef.current.channels) await buildChannelAudio(ch);

    const scheduler = new Scheduler(clock, transport, (step, time) => {
      const proj = projectRef.current;
      const lead = Math.max(0, (time - clock.currentTime) * 1000);
      const stepMs = transport.secondsPerStep * 1000;
      for (const ch of proj.channels) {
        if (ch.muted) continue;
        if (ch.kind === 'piano') {
          const pool = poolsRef.current.get(ch.id);
          if (!pool || !ch.notes) continue;
          for (const n of ch.notes) {
            if (n.start !== step) continue;
            const freq = midiToFreq(n.midi);
            window.setTimeout(() => pool.noteOn(n.id, freq), lead);
            window.setTimeout(() => pool.noteOff(n.id), lead + n.length * stepMs);
          }
        } else {
          if (!ch.steps[step]) continue;
          const host = hostsRef.current.get(ch.id);
          if (!host) continue;
          const gateMs = Math.min(transport.secondsPerStep * 0.9, 0.5) * 1000;
          window.setTimeout(() => host.trigger(), lead);
          window.setTimeout(() => host.release(), lead + gateMs);
        }
      }
      window.setTimeout(() => setCurrentStep(step), lead);
    });
    scheduler.totalSteps = projectRef.current.totalSteps;
    schedulerRef.current = scheduler;
  }, [buildChannelAudio]);

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

  const setBpm = (bpm: number) => {
    setProject((p) => ({ ...p, bpm }));
    if (transportRef.current) transportRef.current.bpm = bpm;
  };
  const toggleStep = (chId: string, step: number) =>
    setProject((p) => ({ ...p, channels: p.channels.map((c) => (c.id === chId ? { ...c, steps: c.steps.map((s, i) => (i === step ? !s : s)) } : c)) }));
  const toggleMute = (chId: string) =>
    setProject((p) => ({ ...p, channels: p.channels.map((c) => (c.id === chId ? { ...c, muted: !c.muted } : c)) }));

  const addNote = (chId: string, midi: number, start: number) =>
    setProject((p) => ({
      ...p,
      channels: p.channels.map((c) =>
        c.id === chId ? { ...c, notes: [...(c.notes ?? []), { id: newNoteId(), midi, start, length: noteLength }] } : c),
    }));
  const removeNote = (chId: string, noteId: number) =>
    setProject((p) => ({
      ...p,
      channels: p.channels.map((c) => (c.id === chId ? { ...c, notes: (c.notes ?? []).filter((n) => n.id !== noteId) } : c)),
    }));

  const addSampleChannel = useCallback((name: string, flow: Flow) => {
    const ch: Channel = { id: crypto.randomUUID(), name, kind: 'step', flow, steps: Array(projectRef.current.totalSteps).fill(false) };
    setProject((p) => ({ ...p, channels: [...p.channels, ch] }));
    void buildChannelAudio(ch);
  }, [buildChannelAudio]);

  const pianoChannels = project.channels.filter((c) => c.kind === 'piano');

  return (
    <div className="app">
      <TransportBar isPlaying={isPlaying} bpm={project.bpm} onPlay={play} onStop={stop} onBpm={setBpm} />
      <div className="toolbar">
        <button onClick={() => setShowSampler(true)}>+ Sample instrument</button>
        <label className="notelen">note length
          <select value={noteLength} onChange={(e) => setNoteLength(parseInt(e.target.value, 10))}>
            <option value={1}>1</option><option value={2}>2</option><option value={4}>4</option><option value={8}>8</option>
          </select>
        </label>
      </div>
      <ChannelRack project={project} currentStep={currentStep} onToggle={toggleStep} onMute={toggleMute} />
      {pianoChannels.map((ch) => (
        <PianoRoll
          key={ch.id} channel={ch} totalSteps={project.totalSteps} stepsPerBeat={project.stepsPerBeat}
          currentStep={currentStep} noteLength={noteLength} onAddNote={addNote} onRemoveNote={removeNote}
        />
      ))}
      <p className="hint">
        Step channels (drums) up top; piano-roll channels below (polyphonic via a voice pool).
        Click cells to program; ▶ Play. Notes send receiveNodeOn at start and receiveNodeOff at end.
      </p>
      {showSampler && <SamplerEditor onCreate={addSampleChannel} onClose={() => setShowSampler(false)} />}
    </div>
  );
}
