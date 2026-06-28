import React from 'react';
import { ChevronRight, Plus, Piano } from 'lucide-react';
import type { Track } from '../model/project';
import { FX_LIBRARY } from '../synflow/effects';
import { Knob } from './Knob';

const CATS = ['var(--cat-source)', 'var(--cat-gain)', 'var(--cat-mod)', 'var(--cat-fx)', 'var(--cat-midi)'];

function Device({ name, cat, knobs, onClick, isInstrument }: {
  name: string; cat: string; knobs: { label: string; val: number }[]; onClick?: () => void; isInstrument?: boolean;
}) {
  return (
    <div
      className="fxc-device" onClick={onClick} title={isInstrument ? 'Open instrument' : name}
      style={{ cursor: onClick ? 'pointer' : 'default', borderColor: `color-mix(in srgb, ${cat} 45%, rgba(80,95,130,.5))`, boxShadow: `0 1px 3px rgba(0,0,0,.45), 0 0 10px 1px color-mix(in srgb, ${cat} 16%, transparent)` }}
    >
      <div className="fxc-dev-head" style={{ borderBottomColor: `color-mix(in srgb, ${cat} 28%, transparent)` }}>
        {isInstrument ? <Piano size={12} style={{ color: cat }} /> : <span className="fxc-dot" style={{ background: cat, boxShadow: `0 0 6px ${cat}` }} />}
        <span className="fxc-dev-name" style={{ color: cat, textShadow: `0 0 10px color-mix(in srgb, ${cat} 40%, transparent)` }}>{name}</span>
        {isInstrument && <span className="fxc-inst">inst</span>}
      </div>
      <div className="fxc-knobs">{knobs.map((k, i) => <Knob key={i} value={k.val} color={cat} size={40} label={k.label} />)}</div>
    </div>
  );
}

export function FXChain({ track, onOpenInstrument }: { track: Track; onOpenInstrument: (id: string) => void }) {
  const instKnobs = [{ label: 'Cutoff', val: .6 }, { label: 'Reso', val: .35 }, { label: 'Drive', val: .45 }];
  const fxKnobs = [{ label: 'Drive', val: .5 }, { label: 'Tone', val: .55 }, { label: 'Mix', val: .45 }];
  const deviceCount = track.instruments.length + track.fx.length;
  return (
    <div className="fxchain">
      <div className="fxc-head">
        <span className="fxc-bar" />
        <span className="fxc-track">{track.name}</span>
        <span className="fxc-label">FX Chain</span>
        <span className="fxc-count">{deviceCount} device{deviceCount === 1 ? '' : 's'}</span>
      </div>
      <div className="fxc-row">
        {track.instruments.map((inst, i) => (
          <React.Fragment key={inst.id}>
            <Device name={inst.name} cat={CATS[i % CATS.length]} knobs={instKnobs} isInstrument onClick={() => onOpenInstrument(inst.id)} />
            <ChevronRight size={16} className="fxc-chev" />
          </React.Fragment>
        ))}
        {track.fx.map((fxId, i) => {
          const def = FX_LIBRARY.find((f) => f.id === fxId);
          return (
            <React.Fragment key={i}>
              <Device name={def?.name ?? fxId} cat="var(--cat-fx)" knobs={fxKnobs} />
              {i < track.fx.length - 1 && <ChevronRight size={16} className="fxc-chev" />}
            </React.Fragment>
          );
        })}
        <button className="fxc-add" title="Add device"><Plus size={18} /></button>
      </div>
    </div>
  );
}
