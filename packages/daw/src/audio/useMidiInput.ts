import { useEffect, useRef, useState } from 'react';

export interface MidiNoteEvent { type: 'on' | 'off'; midi: number; velocity: number /* 0..1 */ }

/**
 * Web MIDI input: subscribes to every connected MIDI input port and forwards
 * note-on/off (with normalized velocity) to `onNote`. `onNote` is kept in a ref
 * so the subscription stays stable while always calling the latest handler.
 * Returns the connected device names and whether the browser supports Web MIDI.
 */
export function useMidiInput(onNote: (e: MidiNoteEvent) => void): { devices: string[]; supported: boolean } {
  const handler = useRef(onNote); handler.current = onNote;
  const [devices, setDevices] = useState<string[]>([]);
  const supported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

  useEffect(() => {
    if (!supported) return;
    let access: any = null;
    let cancelled = false;

    const onMessage = (ev: any) => {
      const [status, data1, data2] = ev.data as Uint8Array;
      const cmd = status & 0xf0;
      // note-on with velocity 0 is the conventional note-off
      if (cmd === 0x90 && data2 > 0) handler.current({ type: 'on', midi: data1, velocity: data2 / 127 });
      else if (cmd === 0x80 || (cmd === 0x90 && data2 === 0)) handler.current({ type: 'off', midi: data1, velocity: 0 });
    };

    const wire = () => {
      if (!access || cancelled) return;
      const names: string[] = [];
      access.inputs.forEach((inp: any) => { inp.onmidimessage = onMessage; if (inp.name) names.push(inp.name); });
      setDevices(names);
    };

    (navigator as any).requestMIDIAccess().then((a: any) => {
      if (cancelled) return;
      access = a;
      access.onstatechange = wire;
      wire();
    }).catch(() => { /* user denied or unavailable */ });

    return () => {
      cancelled = true;
      if (access) access.inputs.forEach((inp: any) => { inp.onmidimessage = null; });
    };
  }, [supported]);

  return { devices, supported };
}
