import React, { useState } from 'react';
import { X, Settings } from 'lucide-react';
import { DEFAULT_SETTINGS, type DawSettings } from '../synflow/flowStore';

/** DAW preferences (track sizing in the Song arrangement view). Saved to
 *  <folder>/settings.json (or localStorage without a folder) — see flowStore. */
export function SettingsPanel({ settings, onChange, onClose }: {
  settings: DawSettings;
  onChange: (patch: Partial<DawSettings>) => void;
  onClose: () => void;
}) {
  const [width, setWidth] = useState(settings.trackWidth);
  const [height, setHeight] = useState(settings.trackHeight);

  const commitWidth = () => onChange({ trackWidth: Math.max(120, Math.min(480, width || DEFAULT_SETTINGS.trackWidth)) });
  const commitHeight = () => onChange({ trackHeight: Math.max(40, Math.min(240, height || DEFAULT_SETTINGS.trackHeight)) });

  return (
    <div className="syn-overlay" onClick={onClose}>
      <div className="exp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="exp-head">
          <span className="exp-title"><Settings size={15} /> Settings</span>
          <button className="syn-close" onClick={onClose} title="Close"><X size={16} /></button>
        </div>
        <div className="exp-body">
          <div className="exp-section">
            <span className="exp-label">Track width (song view header column, px)</span>
            <input className="set-input" type="number" min={120} max={480} value={width}
              onChange={(e) => setWidth(parseInt(e.target.value, 10) || 0)} onBlur={commitWidth}
              onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
          </div>
          <div className="exp-section">
            <span className="exp-label">Track height (song view row, px)</span>
            <input className="set-input" type="number" min={40} max={240} value={height}
              onChange={(e) => setHeight(parseInt(e.target.value, 10) || 0)} onBlur={commitHeight}
              onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
          </div>
          <p className="exp-note">Saved to settings.json in your project folder (or this browser, if no folder is set up).</p>
        </div>
        <div className="exp-foot">
          <button className="exp-secondary" onClick={() => { setWidth(DEFAULT_SETTINGS.trackWidth); setHeight(DEFAULT_SETTINGS.trackHeight); onChange({ trackWidth: DEFAULT_SETTINGS.trackWidth, trackHeight: DEFAULT_SETTINGS.trackHeight }); }}>Reset to defaults</button>
          <button className="exp-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
