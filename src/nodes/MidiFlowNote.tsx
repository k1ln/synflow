import React, { useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';

/**
 * MidiFlowNote: listens to Web MIDI and emits note-on frequencies (A4=440) via its output handle.
 * data props:
 *  - device (optional substring match for midi input name)
 *  - channel (0-15 or 'any')
 *  - lastNote (string like 'C4')
 *  - frequency (number last emitted)
 *  - id (node id)
 *  - onChange (propagate internal state)
 */
export type MidiFlowNoteData = {
  device?: string;
  channel?: number | 'any';
  lastNote?: string;
  frequency?: number;
  enabled?: boolean; // persist enabled state
  id: string;
  onChange: (data: any) => void;
};

function midiNoteToFreq(note: number) {
  return +(440 * Math.pow(2, (note - 69) / 12)).toFixed(4);
}
function midiNoteToName(note: number) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return names[note % 12] + (Math.floor(note / 12) - 1);
}

// MIDI message map: accessible by hex (string) and name
export const MIDI_MESSAGE_MAP: Record<string, { cmd: number; hex: string; name: string; desc?: string }> = {
  '0x8': { cmd: 0x8, hex: '0x8', name: 'note-off', desc: 'Note Off' },
  '0x9': { cmd: 0x9, hex: '0x9', name: 'note-on', desc: 'Note On' },
  '0xA': { cmd: 0xA, hex: '0xA', name: 'poly-aftertouch', desc: 'Polyphonic Aftertouch' },
  '0xB': { cmd: 0xB, hex: '0xB', name: 'control-change', desc: 'Control Change (CC)' },
  '0xC': { cmd: 0xC, hex: '0xC', name: 'program-change', desc: 'Program Change' },
  '0xD': { cmd: 0xD, hex: '0xD', name: 'channel-aftertouch', desc: 'Channel Aftertouch' },
  '0xE': { cmd: 0xE, hex: '0xE', name: 'pitch-bend', desc: 'Pitch Bend' },
  // System/common (cmd === 0xF)
  '0xF0': { cmd: 0xF, hex: '0xF0', name: 'sysex-start', desc: 'SysEx Start' },
  '0xF1': { cmd: 0xF, hex: '0xF1', name: 'mtc-quarter-frame', desc: 'MTC Quarter Frame' },
  '0xF2': { cmd: 0xF, hex: '0xF2', name: 'song-position', desc: 'Song Position Pointer' },
  '0xF3': { cmd: 0xF, hex: '0xF3', name: 'song-select', desc: 'Song Select' },
  '0xF6': { cmd: 0xF, hex: '0xF6', name: 'tune-request', desc: 'Tune Request' },
  '0xF7': { cmd: 0xF, hex: '0xF7', name: 'sysex-end', desc: 'SysEx End (EOX)' },
  '0xF8': { cmd: 0xF, hex: '0xF8', name: 'clock', desc: 'Timing Clock' }
};

export function getMidiByCmd(cmd: number) {
  // prefer lower nibble mapping for channel messages
  const hex = cmd >= 0xF ? `0xF${(cmd & 0xf).toString(16).toUpperCase()}` : `0x${cmd.toString(16).toUpperCase()}`;
  return MIDI_MESSAGE_MAP[hex] || null;
}

const MidiFlowNote: React.FC<{ data: MidiFlowNoteData }> = ({ data }) => {
  // Always enabled (auto-start). User request: hide start/stop; ignore persisted disabled state.
  const enabled = true;
  const eventBus = EventBus.getInstance();
  const [accessError, setAccessError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>('');
  const [lastNote, setLastNote] = useState(data.lastNote || '');
  const [frequency, setFrequency] = useState<number>(data.frequency || 0);
  const [lastChannel, setLastChannel] = useState<number | null>(null); // 0-based
  const [devices, setDevices] = useState<string[]>([]);

  // Define the message types we'll expose as labeled handles
  const messageTypes = [
    { id: 'note-on', label: 'Note On' },
    { id: 'note-off', label: 'Note Off' },
    { id: 'control-change', label: 'Control Change' },
    { id: 'program-change', label: 'Program Change' },
    { id: 'poly-aftertouch', label: 'Poly Aftertouch' },
    { id: 'channel-aftertouch', label: 'Channel Aftertouch' },
    { id: 'pitch-bend', label: 'Pitch Bend' },
    { id: 'sysex', label: 'SysEx' },
    { id: 'mtc', label: 'MTC' },
    { id: 'song-position', label: 'Song Pos' },
    { id: 'song-select', label: 'Song Select' },
    { id: 'tune-request', label: 'Tune Req' },
    { id: 'clock', label: 'Clock' }
  ];

  useEffect(() => { if (data.onChange) data.onChange({ ...data, lastNote, frequency, enabled: true }); }, [lastNote, frequency]);

  // Minimal fallback typings if @types/webmidi not installed
  type MidiInput = any; type MidiAccess = any; type MidiMessageEvent = any;

  useEffect(() => {
    let cancelled = false;
    let inputs: MidiInput[] = [];
    function attach(input: MidiInput) {
      const iname = (input.name || input.id || '').toString();
      if (data.device && !iname.toLowerCase().includes(String(data.device).toLowerCase())) return;
      inputs.push(input);
      input.onmidimessage = (msg: MidiMessageEvent) => {
        const [status, d1, d2] = msg.data;
        const cmd = status >> 4; const ch = status & 0xf;
        setLastChannel(ch);
        const channelFilterActive = data.channel !== undefined && data.channel !== 'any';
        const passesFilter = !channelFilterActive || ch === data.channel;
        if (!passesFilter) return; // still record channel above

        // Helper to emit both generic and specific events
        function emit(typeId: string, onOff: 'on' | 'off', payload: any) {
          const base = `${data.id}.${typeId}`;
          if (onOff === 'on') {
            eventBus.emit(`${base}.sendNodeOn`, payload);
          } else {
            eventBus.emit(`${base}.sendNodeOff`, payload);
          }
          // keep compatibility: also emit main-input for note on/off
          if (typeId === 'note-on' && onOff === 'on') {
            eventBus.emit(`${data.id}.main-input.sendNodeOn`, payload);
          } else if (typeId === 'note-off' && onOff === 'off') {
            eventBus.emit(`${data.id}.main-input.sendNodeOff`, payload);
          }
        }

        if (cmd === 0x9 && d2 > 0) { // note on
          const freq = midiNoteToFreq(d1);
          const name = midiNoteToName(d1);
          emit('note-on', 'on', { value: freq, frequency: freq, note: name, noteNumber: d1, velocity: d2, channel: ch });

        } else if (cmd === 0x8 || (cmd === 0x9 && d2 === 0)) { // note off
          emit('note-off', 'off', { value: 0, frequency: 0, note: lastNote, noteNumber: d1, velocity: d2, channel: ch });
        } else if (cmd === 0xB) { // Control Change
          emit('control-change', 'on', { controller: d1, value: d2, channel: ch });
        } else if (cmd === 0xC) { // Program Change (1 data byte)
          emit('program-change', 'on', { program: d1, channel: ch });
        } else if (cmd === 0xA) { // Poly Aftertouch
          emit('poly-aftertouch', 'on', { noteNumber: d1, pressure: d2, channel: ch });
        } else if (cmd === 0xD) { // Channel Aftertouch
          emit('channel-aftertouch', 'on', { pressure: d1, channel: ch });
        } else if (cmd === 0xE) { // Pitch Bend (14-bit)
          const lsb = d1; const msb = d2;
          const value14 = (msb << 7) | lsb; // 0-16383
          emit('pitch-bend', 'on', { value14, channel: ch });
        } else if (cmd === 0xF) { // System/Common messages
          // 'ch' holds subtype identifier
          switch (ch) {
            case 0: emit('sysex', 'on', { data: msg.data }); break; // 0xF0
            case 1: emit('mtc', 'on', { data: msg.data }); break;    // 0xF1
            case 2: emit('song-position', 'on', { data: msg.data }); break; // 0xF2
            case 3: emit('song-select', 'on', { data: msg.data }); break;   // 0xF3
            case 6: emit('tune-request', 'on', { data: msg.data }); break;  // 0xF6
            case 7: emit('sysex', 'off', { data: msg.data }); break;        // 0xF7 (EOX)
            case 8: emit('clock', 'on', {}); break;                        // 0xF8
            default: emit('sysex', 'on', { data: msg.data }); break;
          }
        }
      };
    }
    (async () => {
      try {
        // Ensure requestMIDIAccess is called with the navigator binding to avoid
        // "Illegal invocation" errors in some environments.
        if (!(navigator as any).requestMIDIAccess || typeof (navigator as any).requestMIDIAccess !== 'function') {
          setAccessError('MIDI unavailable');
          return;
        }
        const midi: MidiAccess = await (navigator as any).requestMIDIAccess();
        if (cancelled || !midi) return;
        const names: string[] = [];
        for (const inp of midi.inputs.values()) {
          names.push(inp.name || inp.id || '');
          attach(inp);
        }
        setDevices(names.sort());
        setDeviceName(inputs[0]?.name || inputs[0]?.id || '');
        midi.onstatechange = (e: any) => {
          // Re-scan on device change
          inputs = [];
          const newNames: string[] = [];
          for (const inp of midi.inputs.values()) {
            newNames.push(inp.name || inp.id || '');
            attach(inp);
          }
          setDevices(newNames.sort());
          setDeviceName(inputs[0]?.name || inputs[0]?.id || '');
        };
      } catch (err: any) {
        setAccessError('MIDI unavailable');
        console.error(err);
      }
    })();
    return () => { cancelled = true; inputs.forEach(i => (i.onmidimessage = null)); };
  }, [enabled, data.device, data.channel, data.id]);

  // calculate node height based on handle count (reduced for compact layout)
  const baseHeight = 130;
  const handleHeight = 14;
  const nodeHeight = baseHeight + messageTypes.length * handleHeight;

  return (
    <div style={
      { 
        padding: 8, 
        paddingRight: 8, 
        border: '1px solid #555', 
        borderRadius: 6, 
        width: "120px", 
        height: nodeHeight, 
        background: '#2d2d2d', 
        color: '#eee', 
        position: 'relative' }}>
      <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>Midi Note</div>
      <div style={{ fontSize: 10, marginBottom: 4 }}>
        <label style={{ display: 'block', marginBottom: 3 }}>Device
        </label>
        <select
          value={data.device || ''}
          onChange={e => {
            const val = e.target.value;
            data.onChange({ ...data, device: val === '' ? undefined : val });
          }}
          style={{ width: '100%', background: '#444', color: '#fff', border: '1px solid #666', padding: 2, marginTop: 2, fontSize: 10 }}
        >
          <option value=''>Any</option>
          {devices.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <label style={{ display: 'block', marginBottom: 3 }}>Ch (1-16)
        </label>
        <input
          type='number'
          min={1}
          max={16}
          value={data.channel === 'any' || data.channel === undefined ? '' : (data.channel + 1)}
          placeholder='any'
          onChange={e => {
            const raw = e.target.value;
            if (raw === '') return data.onChange({ ...data, channel: 'any' });
            let num = Number(raw);
            if (isNaN(num)) return; // ignore
            num = Math.max(1, Math.min(16, num));
            // store 0-based internally
            data.onChange({ ...data, channel: num - 1 });
          }}
          style={{
            width: '100%',
            background: '#444',
            color: '#fff',
            border: '1px solid #666',
            padding: 2,
            marginTop: 2,
            marginRight: 2,
            fontSize: 10
          }}
        />
        {/* Start/Stop button removed (auto-start enabled). */}
      </div>
      {accessError && <div style={{ color: '#f66', fontSize: 10 }}>{accessError}</div>}
      <div style={{ fontSize: 10, marginTop: 4 }}>Dev: {deviceName || 'n/a'}</div>
      <div style={{ fontSize: 10 }}>
        {messageTypes.map((m, idx) => {
          // Render note-on and note-off as a single visual group labelled "Note"
          if (m.id === 'note-on') {
            const top = 161 + idx * handleHeight;
            return (
              <React.Fragment key={'note-group'}>
                <div style={{ position: 'absolute', right: 8, top: top - 6, fontSize: 10, color: '#ddd' }}>Note</div>
                {/* Render both handles (note-on and note-off) at the same position for compatibility */}
                <Handle type='source' position={Position.Right} id={'note-on'} style={{ top, width: 10, height: 10 }} />
                <Handle type='source' position={Position.Right} id={'note-off'} style={{ top, width: 10, height: 10 }} />
              </React.Fragment>
            );
          }
          if (m.id === 'note-off') return null; // already rendered with note-on
          const top = 146 + idx * handleHeight;
          return (
            <React.Fragment key={m.id}>
              <div style={{ position: 'absolute', right: 8, top:top-6, fontSize: 10, color: '#ddd' }}>{m.label}</div>
              <Handle type='source' position={Position.Right} id={m.id} style={{ top, width: 10, height: 10 }} />
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ fontSize: 10 }}>{lastNote || '-'} {frequency ? `${frequency}Hz` : ''}</div>
      <Handle type='source' position={Position.Right} id='output' style={{ top: 146, width: 10, height: 10 }} />
    </div>
  );
};

export default MidiFlowNote;
