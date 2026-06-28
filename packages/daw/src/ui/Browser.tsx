import React, { useState } from 'react';
import { Search, ChevronDown, ChevronRight, Music } from 'lucide-react';

const GROUPS = [
  { name: 'Instruments', cat: 'var(--cat-source)', items: ['Poly Synth', 'FM Operator', 'Sampler Rack', 'Granular', 'Wavetable'] },
  { name: 'Effects', cat: 'var(--cat-fx)', items: ['Reverb', 'Biquad Filter', 'Delay', 'Distortion', 'Vocoder', 'Equalizer'] },
  { name: 'Modulators', cat: 'var(--cat-mod)', items: ['ADSR Envelope', 'LFO', 'Automation', 'Event Shift'] },
  { name: 'Sources', cat: 'var(--cat-source)', items: ['Oscillator', 'Noise', 'Microphone'] },
  { name: 'MIDI', cat: 'var(--cat-midi)', items: ['Clock', 'Sequencer', 'Arpeggiator', 'MIDI Knob'] },
];

export function Browser() {
  const [open, setOpen] = useState<Record<string, boolean>>({ Instruments: true, Effects: true });
  const [sel, setSel] = useState('Reverb');
  return (
    <div className="browser">
      <div className="browser-search">
        <Search size={14} />
        <span>Search the library…</span>
      </div>
      <div className="browser-list">
        {GROUPS.map((g) => (
          <div key={g.name}>
            <button className="browser-group" onClick={() => setOpen((o) => ({ ...o, [g.name]: !o[g.name] }))}>
              {open[g.name] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span className="bg-name">{g.name}</span>
              <span className="bg-count">{g.items.length}</span>
            </button>
            {open[g.name] && g.items.map((it) => (
              <div key={it} className={`browser-item ${sel === it ? 'sel' : ''}`} onClick={() => setSel(it)}>
                <span className="bi-dot" style={{ background: g.cat, boxShadow: `0 0 6px ${g.cat}` }} />
                <span className="bi-name">{it}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="browser-foot"><Music size={14} /><span>nocturne-set/</span></div>
    </div>
  );
}
