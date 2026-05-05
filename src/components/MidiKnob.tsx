import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Knob } from 'react-rotary-knob-react19';
import MidiManager from './MidiManager';

export interface MidiKnobProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  detent?: number;
  onChange: (v: number) => void;
  onMidiLearnChange?: (mapping: MidiMapping | null) => void;
  midiMapping?: MidiMapping | null;
  style?: React.CSSProperties;
  label?: string;
  coarse?: boolean;
  disabled?: boolean;
  /** 0..1 base smoothing factor (1 = instant). */
  midiSmoothing?: number;
  /** Multiplier applied to effective smoothing step to make movement feel more ( >1 ) or less (<1) sensitive. Default 2 */
  midiSensitivity?: number;
  /** If provided, mapping will be persisted across reloads under this key. */
  persistKey?: string;
  /** Accent color for the knob border and indicator. Defaults to #4ade80. */
  accentColor?: string;
}

export interface MidiMapping {
  channel: number;
  controller: number;
  min: number;
  max: number;
  /** If set, interpret incoming CC values as relative deltas instead of absolute position. */
  relativeMode?: 'twosComplement'; // extend with more modes as needed
}

// Utility to scale 0..127 (MIDI CC range) into min..max
function scaleCC(value: number, min: number, max: number) { const norm = value / 127; return min + norm * (max - min); }

// Debounce util to limit onChange storm when rotating quickly via MIDI
function useDebounced<T>(value: T, delay: number) { const [v, setV] = useState(value); useEffect(() => { const id = setTimeout(() => setV(value), delay); return () => clearTimeout(id); }, [value, delay]); return v; }

const STORAGE_PREFIX = 'midiMap:';

function makeKnobSkin(accentColor: string) {
  return {
    knobX: 71,
    knobY: 71,
    updateAttributes: [],
    svg: `<svg width="204px" height="204px" viewBox="0 0 204 204" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
        <circle id="path-2" cx="98.0400009" cy="98.0400009" r="88.0400009"></circle>
    </defs>
    <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
        <g id="s13" transform="translate(4.000000, 4.000000)">
            <g id="container">
                <use stroke="${accentColor}" stroke-width="7" fill="transparent" fill-rule="evenodd" xlink:href="#path-2"></use>
                <g id="knob" transform="translate(27.431373, 27.431373)">
                    <circle fill="transparent" cx="71" cy="71" r="62"></circle>
                    <line x1="71" y1="46" x2="71" y2="-15" stroke="${accentColor}" stroke-width="11" stroke-linecap="round"></line>
                </g>
            </g>
        </g>
    </g>
</svg>`
  };
}

const MidiKnob: React.FC<MidiKnobProps> = ({ value, min, max, detent, onChange, midiMapping, onMidiLearnChange, style, disabled, midiSmoothing = 0.25, midiSensitivity = 2, persistKey, accentColor = '#4ade80' }) => {
  const knobSkin = React.useMemo(() => makeKnobSkin(accentColor), [accentColor]);
  const [isLearning, setIsLearning] = useState(false);
  // Track last received MIDI channel (0-based internally). Shows real arrival channel even if mapping fixed.
  const [internalMapping, setInternalMapping] = useState<MidiMapping | null>(midiMapping || null);
  const learningSince = useRef<number | null>(null);
  const activeMapping = midiMapping !== undefined ? midiMapping : internalMapping;
  const [hover, setHover] = useState(false);
  const valueRef = useRef(value);
  useEffect(()=> { valueRef.current = value; }, [value]);
  const smoothFactor = Math.min(1, Math.max(0, midiSmoothing));
  const sensitivity = Math.max(0.01, midiSensitivity);

  useEffect(() => { setInternalMapping(midiMapping || null); }, [midiMapping]);

  // Load persisted mapping on mount
  useEffect(() => {
    if (!persistKey) return;
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + persistKey);
      if (raw) {
        const parsed: MidiMapping = JSON.parse(raw);
        setInternalMapping(parsed);
        onMidiLearnChange?.(parsed);
      }
    } catch (e) {
      console.warn('Failed to load MIDI mapping', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  // Persist mapping changes
  useEffect(() => {
    if (!persistKey) return;
    try {
      if (activeMapping) {
        localStorage.setItem(STORAGE_PREFIX + persistKey, JSON.stringify(activeMapping));
      } else {
        localStorage.removeItem(STORAGE_PREFIX + persistKey);
      }
    } catch (e) {
      console.warn('Failed to persist MIDI mapping', e);
    }
  }, [activeMapping, persistKey]);

  // Right-click (context menu) initiates learn; if already learning, cancel.
  const handleContextMenu: React.MouseEventHandler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (isLearning) {
      // cancel current learn attempt
      setIsLearning(false);
      learningSince.current = null;
    } else {
      setIsLearning(true);
      learningSince.current = performance.now();
    }
  };

  // Auto cancel learn after 10s
  useEffect(() => {
    if (!isLearning) return;
    const id = setTimeout(() => setIsLearning(false), 10000);
    return () => clearTimeout(id);
  }, [isLearning]);

  useEffect(() => {
    const midi = MidiManager.getInstance();
    let unsub: (() => void) | null = null;
    midi.ensureAccess().catch(() => {/* ignore */});
    unsub = midi.onCC(({ channel, controller, value: ccVal }) => {
      if (isLearning) {
        // Initial mapping creation
        const mapping: MidiMapping = { channel, controller, min, max };
        // Heuristic: relative two's complement encoders usually hover around 64 +/- few steps
        if (ccVal >= 60 && ccVal <= 68) {
          mapping.relativeMode = 'twosComplement';
          // Learned relative (twosComplement) encoder for CC
        }
        setInternalMapping(mapping);
        onMidiLearnChange?.(mapping);
        setIsLearning(false);
        learningSince.current = null;
        if (!mapping.relativeMode) {
          // For absolute, jump to current position of hardware
            const scaled = scaleCC(ccVal, min, max);
            onChange(scaled);
        }
      } else if (activeMapping && channel === activeMapping.channel && controller === activeMapping.controller) {
        if (activeMapping.relativeMode === 'twosComplement') {
          // Decode two's complement style: 64 = 0, 65..127 positive, 63..0 negative
          let delta: number;
          if (ccVal === 64) delta = 0;
          else if (ccVal > 64) delta = ccVal - 64; // 65..127 => +1..+63
          else delta = ccVal - 64; // 63..0 => -1..-64 (two's complement centered at 64)
          // Apply sensitivity scaling: treat delta in steps; scale by (max-min)/128 by default
          const range = activeMapping.max - activeMapping.min;
          // Base step size (feel free to adjust). Using 1/200 of range per detent gives decent resolution.
          const baseStep = range / 200;
          const applied = delta * baseStep * sensitivity; // sensitivity amplifies effect
          const current = valueRef.current;
          let next = current + applied;
          // Clamp to mapping min/max
          if (next < activeMapping.min) next = activeMapping.min;
          if (next > activeMapping.max) next = activeMapping.max;
          onChange(next);
        } else {
          // Absolute mode (default)
          const target = scaleCC(ccVal, activeMapping.min, activeMapping.max);
          const current = valueRef.current;
          // Snap to exact min/max when receiving extreme CC values
          if (ccVal === 0) { onChange(activeMapping.min); return; }
          if (ccVal === 127) { onChange(activeMapping.max); return; }
          // Effective step includes sensitivity multiplier and clamps to 1
          const effective = Math.min(1, smoothFactor * sensitivity);
          const next = current + (target - current) * effective;
          // If remaining delta is tiny, snap to the exact target so we can reach 0
          if (Math.abs(target - current) < 0.5) {
            onChange(target);
          } else {
            onChange(next);
          }
        }
      }
    });
    return () => { unsub && unsub(); };
  }, [isLearning, activeMapping, min, max, onChange, onMidiLearnChange, smoothFactor, sensitivity]);

  const knobChange = useCallback((v: number) => { 
    const distance = Math.abs(v - valueRef.current);
    const range = max - min;
    // More lenient jump detection - allow up to 60% for large ranges, 50% for normal ranges
    const maxJump = range > 150 ? range * 0.9 : range * 0.8;
    if (distance > maxJump) {
      // Skip this update if it's likely a spurious jump from the knob library
      return;
    }
    onChange(v); 
  }, [onChange, max, min]);
  // Remove debounce to prevent visual glitches on load and during interaction
  const displayValue = value;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', ...style }}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onBlur={() => setHover(false)}
    >
      <div style={{ position: 'relative' }}>
        <Knob
          min={min}
          max={max}
          unlockDistance={50}
          value={displayValue}
          onChange={knobChange}
          disabled={disabled}
          skin={knobSkin}
        />
        {detent !== undefined && (
          <div style={{ position: 'absolute', top: 0, left: 0 }} />
        )}
        {isLearning && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,200,0,0.25)', borderRadius: 4, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#222' }}>LEARN</div>
        )}
        {(activeMapping || isLearning) && (
          <div style={{
            position: 'absolute',
            top: 22,
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#FFD700',
            fontSize: 8,
            pointerEvents: 'none',
            touchAction: 'none',
            userSelect: 'none',
            zIndex: 1000,
            whiteSpace: 'nowrap'
          }}>
            {activeMapping ? `CC ${activeMapping.controller}` : 'Learning… move a control'}
          </div>
        )}
      </div>
      {/* Channel info moved into knob overlay to hover above the control */}
    </div>
  );
};

export default MidiKnob;
