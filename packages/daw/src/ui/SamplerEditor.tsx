import React, { useCallback, useRef, useState } from 'react';
import { pickAudioFile, decodeToBuffer, arrayBufferToBase64 } from '../audio/decodeAudioFile';
import { computePeaksMixed, type Peaks } from '../audio/waveform';
import { makeSampleInstrument } from '../synflow/sampleInstrument';
import type { Flow } from '../synflow/instruments';
import { Waveform } from './Waveform';

const WIDTH = 600;
const HEIGHT = 120;

export function SamplerEditor({ onCreate, onClose }: { onCreate: (name: string, flow: Flow) => void; onClose: () => void }) {
  const [name, setName] = useState('Sample');
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  const [duration, setDuration] = useState(0);
  const [loopStart, setLoopStart] = useState(0); // normalized 0..1
  const [loopEnd, setLoopEnd] = useState(1);
  const [loop, setLoop] = useState(false);
  const bytesRef = useRef<ArrayBuffer | null>(null);
  const dragging = useRef<null | 'start' | 'end'>(null);

  const importFile = useCallback(async () => {
    const picked = await pickAudioFile();
    if (!picked) return;
    bytesRef.current = picked.bytes;
    setName(picked.name.replace(/\.[^.]+$/, ''));
    try {
      const buf = await decodeToBuffer(picked.bytes);
      const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
      setPeaks(computePeaksMixed(chans, WIDTH));
      setDuration(buf.duration);
      setLoopStart(0); setLoopEnd(1); setLoop(false);
    } catch (e) {
      console.warn('[Sampler] decode failed', e);
    }
  }, []);

  const onMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (dragging.current === 'start') setLoopStart(Math.min(x, loopEnd - 0.01));
    else setLoopEnd(Math.max(x, loopStart + 0.01));
  };

  const create = () => {
    if (!bytesRef.current) return;
    const base64 = arrayBufferToBase64(bytesRef.current);
    const flow = makeSampleInstrument({ base64, start: loopStart * duration, end: loopEnd * duration, loop });
    onCreate(name || 'Sample', flow);
    onClose();
  };

  return (
    <div className="sampler-overlay" onMouseUp={() => (dragging.current = null)}>
      <div className="sampler">
        <div className="sampler-head">
          <strong>Sampler</strong>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="sampler-row">
          <button onClick={importFile}>Import audio…</button>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" />
          <label className="loopchk"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> loop</label>
          <span className="dur">{duration ? duration.toFixed(2) + 's' : '—'}</span>
        </div>
        <div className="wave-wrap" style={{ width: WIDTH, height: HEIGHT }} onMouseMove={onMove} onMouseUp={() => (dragging.current = null)}>
          <Waveform peaks={peaks} width={WIDTH} height={HEIGHT} loop={{ start: loopStart, end: loopEnd }} />
          {peaks && (
            <>
              <div className="loop-handle" style={{ left: loopStart * WIDTH }} onMouseDown={(e) => { e.preventDefault(); dragging.current = 'start'; }} />
              <div className="loop-handle" style={{ left: loopEnd * WIDTH }} onMouseDown={(e) => { e.preventDefault(); dragging.current = 'end'; }} />
            </>
          )}
        </div>
        <div className="sampler-row">
          <button className="primary" disabled={!peaks} onClick={create}>Add as channel</button>
          <span className="hint2">Drag the handles to set the loop region. The sample is embedded (portable).</span>
        </div>
      </div>
    </div>
  );
}
