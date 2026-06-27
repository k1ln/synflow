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
  onChange: (data:any)=> void;
};

function midiNoteToFreq(note:number){
  return +(440 * Math.pow(2, (note - 69)/12)).toFixed(4);
}
function midiNoteToName(note:number){
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return names[note%12] + (Math.floor(note/12)-1);
}

const MidiFlowNote:React.FC<{ data: MidiFlowNoteData }> = ({ data }) => {
  // Always enabled (auto-start). User request: hide start/stop; ignore persisted disabled state.
  const enabled = true;
  const eventBus = EventBus.getInstance();
  const [accessError, setAccessError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>('');
  const [lastNote, setLastNote] = useState(data.lastNote || '');
  const [frequency, setFrequency] = useState<number>(data.frequency || 0);
  const [lastChannel, setLastChannel] = useState<number | null>(null); // 0-based
  const [devices, setDevices] = useState<string[]>([]);

  useEffect(()=>{ if(data.onChange) data.onChange({ ...data, lastNote, frequency, enabled:true }); }, [lastNote, frequency]);

  // Minimal fallback typings if @types/webmidi not installed
  type MidiInput = any; type MidiAccess = any; type MidiMessageEvent = any;

  useEffect(()=>{
    let cancelled = false;
    let inputs: MidiInput[] = [];
    function attach(input: MidiInput){
      if(data.device && !input.name.toLowerCase().includes(data.device.toLowerCase())) return;
      inputs.push(input);
      input.onmidimessage = (msg: MidiMessageEvent)=>{
        const [status, note, velocity] = msg.data;
        const cmd = status >> 4; const ch = status & 0xf;
        setLastChannel(ch);
        const channelFilterActive = data.channel !== undefined && data.channel !== 'any';
        const passesFilter = !channelFilterActive || ch === data.channel;
        if(!passesFilter) return; // still record channel above
        if(cmd === 0x9 && velocity>0){ // note on
          const freq = midiNoteToFreq(note);
          const name = midiNoteToName(note);
          eventBus.emit(`${data.id}.main-input.sendNodeOn`, { value: freq, frequency: freq, note: name });
        } else if (cmd === 0x8 || (cmd === 0x9 && velocity === 0)) { // note off (explicit or velocity=0)
          eventBus.emit(`${data.id}.main-input.sendNodeOff`, { value: 0, frequency: 0, note: lastNote });
        }
      };
    }
    (async ()=>{
      try {
        const req = (navigator as any).requestMIDIAccess;
        if(typeof req !== 'function'){
          setAccessError('MIDI unavailable');
          return;
        }
        const midi: MidiAccess = await req();
        if(cancelled || !midi) return;
        const names: string[] = [];
        for (const inp of midi.inputs.values()) { 
          names.push(inp.name); 
          attach(inp); 
        }
        setDevices(names.sort());
        setDeviceName(inputs[0]?.name || '');
        midi.onstatechange = (e: any)=>{
          // Re-scan on device change
          inputs = [];
          const newNames: string[] = [];
          for (const inp of midi.inputs.values()) { 
            newNames.push(inp.name); 
            attach(inp); 
          }
          setDevices(newNames.sort());
          setDeviceName(inputs[0]?.name || '');
        };
      } catch (err:any) {
        setAccessError('MIDI unavailable');
        console.error(err);
      }
    })();
    return ()=> { cancelled = true; inputs.forEach(i=> (i.onmidimessage = null)); };
  }, [enabled, data.device, data.channel, data.id]);

  return (
    <div style={{ padding:8, border:'1px solid #555', borderRadius:6, width:100, background:'#2d2d2d', color:'#eee' }}>
      <div style={{ fontWeight:600, marginBottom:4, fontSize:12 }}>Midi Note</div>
      <Handle type='target' position={Position.Left} id='main-input' style={{ top:20, width:10, height:10 }} />
      <div style={{ fontSize:10, marginBottom:4 }}>
        <label style={{ display:'block', marginBottom:3 }}>Device
          <select
            value={data.device || ''}
            onChange={e=> {
              const val = e.target.value;
              data.onChange({ ...data, device: val === '' ? undefined : val });
            }}
            style={{ width:'100%', background:'#444', color:'#fff', border:'1px solid #666', padding:2, marginTop:2, fontSize:10 }}
          >
            <option value=''>Any</option>
            {devices.map(d=> <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label style={{ display:'block', marginBottom:3 }}>Ch (1-16)
          <input
            type='number'
            min={1}
            max={16}
            value={data.channel==='any'||data.channel===undefined?'' : (data.channel + 1)}
            placeholder='any'
            onChange={e=> {
              const raw = e.target.value;
              if(raw==='') return data.onChange({ ...data, channel: 'any' });
              let num = Number(raw);
              if(isNaN(num)) return; // ignore
              num = Math.max(1, Math.min(16, num));
              // store 0-based internally
              data.onChange({ ...data, channel: num - 1 });
            }}
            style={{ 
              width:'95%', 
              background:'#444', 
              color:'#fff', 
              border:'1px solid #666', 
              padding:2, 
              marginTop:2, 
              marginRight:2, 
              fontSize:10 
            }}
          />
        </label>
        <div style={{ fontSize:9, opacity:0.7, marginTop:-2, marginBottom:4 }}>Blank = any</div>
  {/* Start/Stop button removed (auto-start enabled). */}
      </div>
      {accessError && <div style={{ color:'#f66', fontSize:10 }}>{accessError}</div>}
      <div style={{ fontSize:10, marginTop:4 }}>Dev: {deviceName || 'n/a'}</div>
      <div style={{ fontSize:10 }}>
        {lastChannel !== null ? (
          <>Ch {lastChannel+1}{(data.channel!==undefined && data.channel!=='any') ? (lastChannel===data.channel ? ' ✓' : ' ✗') : ''}</>
        ) : 'Ch -'}
      </div>
      <div style={{ fontSize:10 }}>{lastNote || '-'} {frequency? `${frequency}Hz` : ''}</div>
      <Handle type='source' position={Position.Right} id='output' style={{ top:20, width:10, height:10 }} />
    </div>
  );
};

export default MidiFlowNote;
