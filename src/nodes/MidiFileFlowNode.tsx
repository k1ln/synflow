import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import EventBus from '../sys/EventBus';
import { CustomNumberInput } from '../util/CustomNumberInput';

export interface MidiNote {
  note: number;        // MIDI note number (0-127)
  velocity: number;    // Velocity (0-127)
  startTick: number;   // Start position in ticks
  durationTicks: number; // Duration in ticks
  channel: number;     // MIDI channel
}

export interface MidiTrack {
  name?: string;
  notes: MidiNote[];
}

export interface MidiTempoChange {
  tick: number;         // Absolute tick position of the tempo change
  bpm: number;          // Tempo in beats per minute
}

export interface ParsedMidiFile {
  name: string;
  ticksPerBeat: number;
  tracks: MidiTrack[];
  totalTicks: number;
  totalBars: number;    // Assuming 4/4 time signature (4 beats per bar)
  tempoChanges: MidiTempoChange[];  // Tempo changes found in the file (sorted by tick)
}

export interface MidiFileFlowNodeData {
  id?: string;
  label?: string;
  midiFile?: ParsedMidiFile | null;
  currentBar: number;
  currentTick: number;
  isPlaying: boolean;
  loop: boolean;
  subdivision?: number;  // Clock subdivision: 1 = per beat, 4 = per 16th note, etc.
  transpose?: number;    // Transpose in semitones (+12 = up one octave)
  singleVoiceMode?: boolean; // Only one note at a time (monophonic)
  style?: React.CSSProperties;
  onChange?: (data: any) => void;
}

export interface MidiFileFlowNodeProps {
  id: string;
  data: MidiFileFlowNodeData;
}

/**
 * Parse a MIDI file ArrayBuffer into a structured format
 */
function parseMidiFile(buffer: ArrayBuffer, fileName: string): ParsedMidiFile {
  const data = new Uint8Array(buffer);
  let offset = 0;

  const readBytes = (n: number): number[] => {
    const bytes = [];
    for (let i = 0; i < n; i++) {
      bytes.push(data[offset++]);
    }
    return bytes;
  };

  const readInt = (n: number): number => {
    let result = 0;
    for (let i = 0; i < n; i++) {
      result = (result << 8) | data[offset++];
    }
    return result;
  };

  const readVarLen = (): number => {
    let result = 0;
    let byte;
    do {
      byte = data[offset++];
      result = (result << 7) | (byte & 0x7f);
    } while (byte & 0x80);
    return result;
  };

  // Read header chunk
  const headerChunk = String.fromCharCode(...readBytes(4));
  if (headerChunk !== 'MThd') {
    throw new Error('Invalid MIDI file: missing MThd header');
  }

  const headerLength = readInt(4);
  const format = readInt(2);
  const numTracks = readInt(2);
  const ticksPerBeat = readInt(2);

  const tracks: MidiTrack[] = [];
  let totalTicks = 0;
  const tempoChanges: MidiTempoChange[] = [];

  // Read track chunks
  for (let t = 0; t < numTracks; t++) {
    const trackChunk = String.fromCharCode(...readBytes(4));
    if (trackChunk !== 'MTrk') {
      console.warn('Expected MTrk chunk, got:', trackChunk);
      continue;
    }

    const trackLength = readInt(4);
    const trackEnd = offset + trackLength;
    const notes: MidiNote[] = [];
    const activeNotes: Map<string, { note: number; velocity: number; startTick: number; channel: number }> = new Map();
    let currentTick = 0;
    let runningStatus = 0;
    let trackName: string | undefined;

    while (offset < trackEnd) {
      const deltaTime = readVarLen();
      currentTick += deltaTime;

      let statusByte = data[offset];
      
      // Running status: if high bit is not set, use previous status
      if ((statusByte & 0x80) === 0) {
        statusByte = runningStatus;
      } else {
        offset++;
        if ((statusByte & 0xf0) !== 0xf0) {
          runningStatus = statusByte;
        }
      }

      const messageType = statusByte & 0xf0;
      const channel = statusByte & 0x0f;

      switch (messageType) {
        case 0x90: { // Note On
          const note = data[offset++];
          const velocity = data[offset++];
          
          if (velocity > 0) {
            // Note on with velocity > 0
            const key = `${channel}-${note}`;
            activeNotes.set(key, { note, velocity, startTick: currentTick, channel });
            console.log(`[Parse] NoteOn: note=${note}, vel=${velocity}, tick=${currentTick}`);
          } else {
            // Note on with velocity 0 is treated as note off
            const key = `${channel}-${note}`;
            const activeNote = activeNotes.get(key);
            if (activeNote) {
              const durationTicks = currentTick - activeNote.startTick;
              console.log(`[Parse] NoteOff(vel0): note=${note}, startTick=${activeNote.startTick}, endTick=${currentTick}, durationTicks=${durationTicks}`);
              notes.push({
                note: activeNote.note,
                velocity: activeNote.velocity,
                startTick: activeNote.startTick,
                durationTicks: durationTicks,
                channel: activeNote.channel
              });
              activeNotes.delete(key);
            }
          }
          break;
        }
        case 0x80: { // Note Off
          const note = data[offset++];
          const velocity = data[offset++]; // Release velocity (often ignored)
          
          const key = `${channel}-${note}`;
          const activeNote = activeNotes.get(key);
          if (activeNote) {
            const durationTicks = currentTick - activeNote.startTick;
            console.log(`[Parse] NoteOff(0x80): note=${note}, startTick=${activeNote.startTick}, endTick=${currentTick}, durationTicks=${durationTicks}`);
            notes.push({
              note: activeNote.note,
              velocity: activeNote.velocity,
              startTick: activeNote.startTick,
              durationTicks: durationTicks,
              channel: activeNote.channel
            });
            activeNotes.delete(key);
          }
          break;
        }
        case 0xa0: // Polyphonic aftertouch
        case 0xb0: // Control change
        case 0xe0: // Pitch bend
          offset += 2;
          break;
        case 0xc0: // Program change
        case 0xd0: // Channel aftertouch
          offset += 1;
          break;
        case 0xf0: // System messages
          if (statusByte === 0xff) {
            // Meta event
            const metaType = data[offset++];
            const metaLength = readVarLen();
            
            if (metaType === 0x03) {
              // Track name
              trackName = String.fromCharCode(...data.slice(offset, offset + metaLength));
            } else if (metaType === 0x51 && metaLength === 3) {
              // Set Tempo: 3-byte big-endian microseconds per quarter note
              const microsPerBeat = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
              const tempoBpm = Math.round((60000000 / microsPerBeat) * 100) / 100;
              tempoChanges.push({ tick: currentTick, bpm: tempoBpm });
              console.log(`[Parse] Tempo change at tick ${currentTick}: ${tempoBpm} BPM (${microsPerBeat} µs/beat)`);
            }
            offset += metaLength;
          } else if (statusByte === 0xf0 || statusByte === 0xf7) {
            // SysEx
            const sysexLength = readVarLen();
            offset += sysexLength;
          }
          break;
        default:
          // Unknown message type, try to skip
          console.warn('Unknown MIDI message type:', messageType.toString(16));
          break;
      }
    }

    // Close any notes that weren't properly ended
    activeNotes.forEach((activeNote, key) => {
      notes.push({
        note: activeNote.note,
        velocity: activeNote.velocity,
        startTick: activeNote.startTick,
        durationTicks: currentTick - activeNote.startTick,
        channel: activeNote.channel
      });
    });

    if (currentTick > totalTicks) {
      totalTicks = currentTick;
    }

    tracks.push({ name: trackName, notes });
    offset = trackEnd;
  }

  // Calculate total bars (assuming 4/4 time, 4 beats per bar)
  const ticksPerBar = ticksPerBeat * 4;
  const totalBars = Math.ceil(totalTicks / ticksPerBar);

  // Sort tempo changes by tick and deduplicate
  tempoChanges.sort((a, b) => a.tick - b.tick);

  return {
    name: fileName,
    ticksPerBeat,
    tracks,
    totalTicks,
    totalBars,
    tempoChanges
  };
}

const MidiFileFlowNode: React.FC<MidiFileFlowNodeProps> = ({ id, data }) => {
  const eventBus = EventBus.getInstance();
  const nodeId = data.id ?? id;

  const [midiFile, setMidiFile] = useState<ParsedMidiFile | null>(data.midiFile || null);
  const [currentBar, setCurrentBar] = useState<number>(data.currentBar ?? 0);
  const [currentTick, setCurrentTick] = useState<number>(data.currentTick ?? 0);
  const [isPlaying, setIsPlaying] = useState<boolean>(data.isPlaying ?? false);
  const [loop, setLoop] = useState<boolean>(data.loop ?? true);
  const [subdivision, setSubdivision] = useState<number>(data.subdivision ?? 1);
  const [transpose, setTranspose] = useState<number>(data.transpose ?? 12); // Default +12 (one octave up)
  const [singleVoiceMode, setSingleVoiceMode] = useState<boolean>(data.singleVoiceMode ?? false);
  const suppressOnChangeRef = useRef(false);
  const [jumpToBar, setJumpToBar] = useState<number>(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notify parent of changes
  useEffect(() => {
    if (data.onChange instanceof Function) {
      if (suppressOnChangeRef.current) {
        // This update originated from the virtual node sync; avoid emitting back to prevent update loops.
        suppressOnChangeRef.current = false;
      } else {
        data.onChange({
          ...data,
          midiFile,
          currentBar,
          currentTick,
          isPlaying,
          loop,
          subdivision,
          transpose,
          singleVoiceMode
        });
      }
    }
  }, [midiFile, currentBar, currentTick, isPlaying, loop, subdivision, transpose, singleVoiceMode]);

  // Subscribe to virtual node updates for UI sync
  useEffect(() => {
    if (!nodeId) return;
    
    const channel = `FlowNode.${nodeId}.params.updateParams`;
    const handler = (p: any) => {
      const d = p?.data || p;
      // Mark that the following state changes should NOT trigger data.onChange emissions
      // for any incoming virtual node update to avoid feedback loops.
      suppressOnChangeRef.current = true;
      if (typeof d.currentBar === 'number') setCurrentBar(d.currentBar);
      if (typeof d.currentTick === 'number') setCurrentTick(d.currentTick);
      if (typeof d.isPlaying === 'boolean') setIsPlaying(d.isPlaying);
    };
    
    eventBus.subscribe(channel, handler);
    return () => { eventBus.unsubscribe(channel, handler as any); };
  }, [nodeId, eventBus]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseMidiFile(buffer, file.name);
      setMidiFile(parsed);
      setCurrentBar(0);
      setCurrentTick(0);
      
      // Notify virtual node of new MIDI file and reset playback to beginning
      eventBus.emit(`${nodeId}.reset.receiveNodeOn`, { gate: 1 });
      eventBus.emit(`${nodeId}.params.updateParams`, {
        nodeid: nodeId,
        data: { midiFile: parsed, currentBar: 0, currentTick: 0, singleVoiceMode }
      });
    } catch (error) {
      console.error('Failed to parse MIDI file:', error);
      alert('Failed to parse MIDI file. Please ensure it is a valid .mid file.');
    }

    // Reset file input
    if (event.target) event.target.value = '';
  }, [nodeId, eventBus]);

  const handleJumpToBar = useCallback(() => {
    if (!midiFile) return;
    
    const targetBar = Math.max(0, Math.min(jumpToBar, midiFile.totalBars - 1));
    const ticksPerBar = midiFile.ticksPerBeat * 4;
    const targetTick = targetBar * ticksPerBar;
    
    setCurrentBar(targetBar);
    setCurrentTick(targetTick);
    
    eventBus.emit(`${nodeId}.params.updateParams`, {
      nodeid: nodeId,
      data: { currentBar: targetBar, currentTick: targetTick, jumpToBar: targetBar }
    });
  }, [nodeId, midiFile, jumpToBar, eventBus]);

  const handleReset = useCallback(() => {
    setCurrentBar(0);
    setCurrentTick(0);
    
    eventBus.emit(`${nodeId}.reset.receiveNodeOn`, { gate: 1 });
  }, [nodeId, eventBus]);

  const baseStyle = (data.style || {}) as React.CSSProperties;

  return (
    <div style={{ ...baseStyle, minWidth: 220, padding: 10, position: 'relative' }}>
      {/* Clock input - triggers tick advance */}
      <Handle
        type="target"
        position={Position.Left}
        id="clock"
        style={{ top: '30%', background: '#0af' }}
        title="Clock Input"
      />
      
      {/* Reset input */}
      <Handle
        type="target"
        position={Position.Left}
        id="reset"
        style={{ top: '70%', background: '#fa0' }}
        title="Reset Input"
      />
      
      {/* Main output - sends both note on and note off events */}
      <Handle
        type="source"
        position={Position.Right}
        id="main-output"
        style={{ top: '35%', background: '#0f0' }}
        title="Note Output (On/Off)"
      />

      {/* Tempo output - sends BPM changes read from the MIDI file */}
      <Handle
        type="source"
        position={Position.Right}
        id="tempo-output"
        style={{ top: '65%', background: '#f80' }}
        title="Tempo Output (BPM)"
      />

      <div style={{ marginBottom: 8, fontWeight: 'bold', fontSize: 13 }}>
        MIDI File Player
      </div>

      {/* File upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        style={{
          width: '100%',
          padding: '6px 10px',
          marginBottom: 8,
          background: baseStyle.background || '#333',
          color: baseStyle.color || '#fff',
          border: '1px solid #555',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 12
        }}
      >
        {midiFile ? `📁 ${midiFile.name}` : '📁 Load MIDI File...'}
      </button>

      {midiFile && (
        <>
          {/* File info */}
          <div style={{ fontSize: 11, marginBottom: 8, opacity: 0.8 }}>
            <div>Tracks: {midiFile.tracks.length}</div>
            <div>Bars: {midiFile.totalBars}</div>
            <div>PPQ: {midiFile.ticksPerBeat}</div>
            {midiFile.tempoChanges?.length > 0 && (
              <div>Tempo: {midiFile.tempoChanges[0].bpm} BPM{midiFile.tempoChanges.length > 1 ? ` (+${midiFile.tempoChanges.length - 1} changes)` : ''}</div>
            )}
          </div>

          {/* Progress bar */}
          <div style={{
            width: '100%',
            height: 8,
            background: '#222',
            borderRadius: 4,
            marginBottom: 8,
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${(currentTick / midiFile.totalTicks) * 100}%`,
              height: '100%',
              background: isPlaying ? '#0f0' : '#666',
              transition: 'width 50ms linear'
            }} />
          </div>

          {/* Current position */}
          <div style={{ fontSize: 12, marginBottom: 8, textAlign: 'center' }}>
            Bar: {currentBar + 1} / {midiFile.totalBars}
          </div>

          {/* Jump to bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <span style={{ fontSize: 11 }}>Jump to:</span>
            <CustomNumberInput
              value={jumpToBar + 1}
              min={1}
              max={midiFile.totalBars}
              step={1}
              onChange={(v) => setJumpToBar(Math.max(0, v - 1))}
              style={baseStyle}
            />
            <button
              onClick={handleJumpToBar}
              style={{
                padding: '4px 8px',
                background: '#2a5a2a',
                color: '#fff',
                border: '1px solid #3a7a3a',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11
              }}
            >
              Go
            </button>
          </div>

          {/* Loop toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
            />
            Loop
          </label>

          {/* Single Voice Mode toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={singleVoiceMode}
              onChange={(e) => {
                const newMode = e.target.checked;
                setSingleVoiceMode(newMode);
                eventBus.emit(`${nodeId}.params.updateParams`, {
                  nodeid: nodeId,
                  data: { singleVoiceMode: newMode }
                });
              }}
            />
            Single Voice (Mono)
          </label>

          {/* Subdivision control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <span style={{ fontSize: 11 }}>Clock = 1/</span>
            <select
              value={subdivision}
              onChange={(e) => {
                const newSub = parseInt(e.target.value, 10);
                setSubdivision(newSub);
                eventBus.emit(`${nodeId}.params.updateParams`, {
                  nodeid: nodeId,
                  data: { subdivision: newSub }
                });
              }}
              style={{
                background: baseStyle.background || '#333',
                color: baseStyle.color || '#fff',
                border: '1px solid #555',
                borderRadius: 4,
                padding: '2px 4px',
                fontSize: 11
              }}
            >
              <option value={1}>1 (beat)</option>
              <option value={2}>2 (8th)</option>
              <option value={4}>4 (16th)</option>
              <option value={8}>8 (32nd)</option>
            </select>
            <span style={{ fontSize: 10, opacity: 0.7 }}>
              ({midiFile ? Math.floor(midiFile.ticksPerBeat / subdivision) : '-'} ticks)
            </span>
          </div>

          {/* Transpose control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <span style={{ fontSize: 11 }}>Transpose:</span>
            <select
              value={transpose}
              onChange={(e) => {
                const newTranspose = parseInt(e.target.value, 10);
                setTranspose(newTranspose);
                eventBus.emit(`${nodeId}.params.updateParams`, {
                  nodeid: nodeId,
                  data: { transpose: newTranspose }
                });
              }}
              style={{
                background: baseStyle.background || '#333',
                color: baseStyle.color || '#fff',
                border: '1px solid #555',
                borderRadius: 4,
                padding: '2px 4px',
                fontSize: 11
              }}
            >
              <option value={-24}>-24 (2 oct down)</option>
              <option value={-12}>-12 (1 oct down)</option>
              <option value={0}>0 (original)</option>
              <option value={12}>+12 (1 oct up)</option>
              <option value={24}>+24 (2 oct up)</option>
            </select>
          </div>

          {/* Reset button */}
          <button
            onClick={handleReset}
            style={{
              width: '100%',
              padding: '6px 10px',
              background: '#5a2a2a',
              color: '#fff',
              border: '1px solid #7a3a3a',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            Reset to Start
          </button>
        </>
      )}

      {!midiFile && (
        <div style={{ fontSize: 11, opacity: 0.6, textAlign: 'center' }}>
          Load a MIDI file to start
        </div>
      )}
    </div>
  );
};

export default React.memo(MidiFileFlowNode);
