import React, { useCallback, useRef, useState } from 'react';
import { RealtimeClock } from './audio/ClockSource';
import { Transport } from './audio/Transport';
import { Scheduler } from './audio/Scheduler';
import { InstrumentHost } from './audio/InstrumentHost';
import { defaultProject, type Channel, type Project } from './model/project';
import type { Flow } from './synflow/instruments';
import { TransportBar } from './ui/TransportBar';
import { ChannelRack } from './ui/ChannelRack';
import { SamplerEditor } from './ui/SamplerEditor';

export function App() {
  const [project, setProject] = useState<Project>(() => defaultProject());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [showSampler, setShowSampler] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const schedulerRef = useRef<Scheduler | null>(null);
  const hostsRef = useRef<Map<string, InstrumentHost>>(new Map());
  const projectRef = useRef(project);
  projectRef.current = project;

  const createHost = useCallback(async (ch: Channel) => {
    const ctx = ctxRef.current;
    if (!ctx || hostsRef.current.has(ch.id)) return;
    const host = new InstrumentHost(ctx, ch.flow, ctx.destination);
    await host.load();
    hostsRef.current.set(ch.id, host);
  }, []);

  // Build the audio graph once, on first Play (browser autoplay policy).
  const ensureAudio = useCallback(async () => {
    if (ctxRef.current) return;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const clock = new RealtimeClock(ctx);
    const transport = new Transport(clock);
    transport.stepsPerBeat = projectRef.current.stepsPerBeat;
    transportRef.current = transport;

    for (const ch of projectRef.current.channels) await createHost(ch);

    const scheduler = new Scheduler(clock, transport, (step, time) => {
      const proj = projectRef.current;
      const lead = Math.max(0, (time - clock.currentTime) * 1000);
      for (const ch of proj.channels) {
        if (ch.muted || !ch.steps[step]) continue;
        const host = hostsRef.current.get(ch.id);
        if (!host) continue;
        const payload = ch.note ? { frequency: ch.note.frequency } : {};
        window.setTimeout(() => host.trigger(payload), lead);
      }
      window.setTimeout(() => setCurrentStep(step), lead);
    });
    scheduler.totalSteps = projectRef.current.totalSteps;
    schedulerRef.current = scheduler;
  }, [createHost]);

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
    setIsPlaying(false);
    setCurrentStep(-1);
  }, []);

  const setBpm = (bpm: number) => {
    setProject((p) => ({ ...p, bpm }));
    if (transportRef.current) transportRef.current.bpm = bpm;
  };
  const toggleStep = (chId: string, step: number) =>
    setProject((p) => ({
      ...p,
      channels: p.channels.map((c) => (c.id === chId ? { ...c, steps: c.steps.map((s, i) => (i === step ? !s : s)) } : c)),
    }));
  const toggleMute = (chId: string) =>
    setProject((p) => ({ ...p, channels: p.channels.map((c) => (c.id === chId ? { ...c, muted: !c.muted } : c)) }));

  const addChannel = useCallback((name: string, flow: Flow) => {
    const ch: Channel = { id: crypto.randomUUID(), name, flow, steps: Array(projectRef.current.totalSteps).fill(false) };
    setProject((p) => ({ ...p, channels: [...p.channels, ch] }));
    void createHost(ch); // build its engine now if audio is already running
  }, [createHost]);

  return (
    <div className="app">
      <TransportBar isPlaying={isPlaying} bpm={project.bpm} onPlay={play} onStop={stop} onBpm={setBpm} />
      <div className="toolbar">
        <button onClick={() => setShowSampler(true)}>+ Sample instrument</button>
      </div>
      <ChannelRack project={project} currentStep={currentStep} onToggle={toggleStep} onMute={toggleMute} />
      <p className="hint">
        Channel Rack (FL-style). Click steps to program a beat, then ▶ Play. Instruments are
        @synflow/core flows. Import a sample to make a looping sample instrument.
      </p>
      {showSampler && <SamplerEditor onCreate={addChannel} onClose={() => setShowSampler(false)} />}
    </div>
  );
}
