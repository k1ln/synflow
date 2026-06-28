import React, { useEffect, useRef } from 'react';
import { type ExposedKnob, knobReadout } from '../synflow/knobs';

/**
 * Renders a pool item's custom HTML UI inside a Shadow DOM (so the author's CSS
 * can't leak into the app) and wires declarative data-attribute bindings to the
 * synth engine:
 *   • data-param="nodeId.param"  on <input range|number> — two-way bound to an
 *     exposed param; min/max/step default from the knob declaration.
 *   • data-readout="nodeId.param" on any element — shows the live formatted value.
 *   • data-note="60" (+ optional data-vel="0..1") on any element — pointer down/up
 *     plays/releases that MIDI note; gets a `.on` class while held.
 *   • data-hit on any element — triggers a drum hit (flash `.on` briefly).
 */
export function CustomInstrumentUI({ html, knobs, valueOf, onKnob, onNoteOn, onNoteOff, onHit, className }: {
  html: string;
  knobs: ExposedKnob[];
  valueOf: (nodeId: string, param: string) => number | undefined;
  onKnob: (nodeId: string, param: string, value: number) => void;
  onNoteOn?: (midi: number, velocity?: number) => void;
  onNoteOff?: (midi: number) => void;
  onHit?: () => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);
  const cbs = useRef({ onKnob, onNoteOn, onNoteOff, onHit, valueOf });
  cbs.current = { onKnob, onNoteOn, onNoteOff, onHit, valueOf };
  const knobMap = useRef(new Map<string, ExposedKnob>());
  knobMap.current = new Map(knobs.map((k) => [`${k.nodeId}.${k.param}`, k]));

  const splitKey = (key: string): [string, string] => { const i = key.lastIndexOf('.'); return [key.slice(0, i), key.slice(i + 1)]; };

  const sync = () => {
    const root = shadowRef.current; if (!root) return;
    root.querySelectorAll<HTMLInputElement>('input[data-param]').forEach((el) => {
      const [nodeId, param] = splitKey(el.getAttribute('data-param') || '');
      const v = cbs.current.valueOf(nodeId, param);
      if (v != null && root.activeElement !== el) el.value = String(v);  // don't fight an active drag
    });
    root.querySelectorAll<HTMLElement>('[data-readout]').forEach((el) => {
      const key = el.getAttribute('data-readout') || ''; const [nodeId, param] = splitKey(key);
      const v = cbs.current.valueOf(nodeId, param); const k = knobMap.current.get(key);
      el.textContent = v == null ? '' : (k ? knobReadout(k, (v - k.min) / ((k.max - k.min) || 1)) : String(v));
    });
    root.querySelectorAll<HTMLElement>('[data-knob]').forEach((el) => {
      if (root.activeElement === el || (el as any).__dragging) return;
      const key = el.getAttribute('data-knob') || ''; const [nodeId, param] = splitKey(key);
      const v = cbs.current.valueOf(nodeId, param); const k = knobMap.current.get(key);
      if (v == null) return;
      const min = k ? k.min : Number(el.getAttribute('data-min') ?? 0);
      const max = k ? k.max : Number(el.getAttribute('data-max') ?? 1);
      el.style.setProperty('--a', `${-135 + ((v - min) / ((max - min) || 1)) * 270}deg`);
    });
  };

  // Rebuild + wire whenever the HTML changes.
  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    if (!shadowRef.current) shadowRef.current = host.attachShadow({ mode: 'open' });
    const root = shadowRef.current;
    root.innerHTML = '<style>:host{display:block}*{box-sizing:border-box}[data-note],[data-hit]{user-select:none;touch-action:none;cursor:pointer}[data-knob]{user-select:none;touch-action:none;cursor:ns-resize}</style>' + html;
    const cleanups: Array<() => void> = [];

    root.querySelectorAll<HTMLInputElement>('input[data-param]').forEach((el) => {
      const key = el.getAttribute('data-param') || ''; const k = knobMap.current.get(key);
      if (el.type === 'range' || el.type === 'number') {
        if (k) {
          if (!el.hasAttribute('min')) el.min = String(k.min);
          if (!el.hasAttribute('max')) el.max = String(k.max);
          if (!el.hasAttribute('step')) el.step = String(((k.max - k.min) / 100) || 0.01);
        }
        const h = () => { const [nodeId, param] = splitKey(key); cbs.current.onKnob(nodeId, param, Number(el.value)); };
        el.addEventListener('input', h);
        cleanups.push(() => el.removeEventListener('input', h));
      }
    });

    root.querySelectorAll<HTMLElement>('[data-knob]').forEach((el) => {
      const key = el.getAttribute('data-knob') || ''; const k = knobMap.current.get(key);
      const [nodeId, param] = splitKey(key);
      const min = k ? k.min : Number(el.getAttribute('data-min') ?? 0);
      const max = k ? k.max : Number(el.getAttribute('data-max') ?? 1);
      const range = (max - min) || 1;
      const setA = (v01: number) => el.style.setProperty('--a', `${-135 + Math.max(0, Math.min(1, v01)) * 270}deg`);
      const cur = cbs.current.valueOf(nodeId, param); if (cur != null) setA((cur - min) / range);
      const down = (e: PointerEvent) => {
        e.preventDefault(); el.setPointerCapture?.(e.pointerId); (el as any).__dragging = true;
        const startY = e.clientY; const startV = cbs.current.valueOf(nodeId, param) ?? min;
        const sens = (e.pointerType === 'touch' ? 0.004 : 0.006) * range;
        const move = (ev: PointerEvent) => {
          ev.preventDefault();
          const v = Math.max(min, Math.min(max, startV + (startY - ev.clientY) * sens));
          cbs.current.onKnob(nodeId, param, v); setA((v - min) / range);
        };
        const up = () => { (el as any).__dragging = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
        window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      };
      el.addEventListener('pointerdown', down);
      cleanups.push(() => el.removeEventListener('pointerdown', down));
    });

    root.querySelectorAll<HTMLElement>('[data-note]').forEach((el) => {
      const midi = Number(el.getAttribute('data-note'));
      const vel = el.hasAttribute('data-vel') ? Number(el.getAttribute('data-vel')) : 1;
      const down = (e: PointerEvent) => { e.preventDefault(); el.classList.add('on'); el.setPointerCapture?.(e.pointerId); cbs.current.onNoteOn?.(midi, vel); };
      const up = () => { el.classList.remove('on'); cbs.current.onNoteOff?.(midi); };
      const leave = (e: PointerEvent) => { if (e.buttons) up(); };
      el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', leave); el.addEventListener('pointercancel', up);
      cleanups.push(() => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointerleave', leave); el.removeEventListener('pointercancel', up); });
    });

    root.querySelectorAll<HTMLElement>('[data-hit]').forEach((el) => {
      const down = (e: PointerEvent) => { e.preventDefault(); el.classList.add('on'); cbs.current.onHit?.(); window.setTimeout(() => el.classList.remove('on'), 120); };
      el.addEventListener('pointerdown', down);
      cleanups.push(() => el.removeEventListener('pointerdown', down));
    });

    sync();
    return () => cleanups.forEach((fn) => fn());
  }, [html]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reflect external param changes (MIDI, other controls) into bound inputs/readouts.
  const valueSig = knobs.map((k) => `${k.nodeId}.${k.param}=${valueOf(k.nodeId, k.param)}`).join('|');
  useEffect(() => { sync(); }, [valueSig]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={hostRef} className={className} />;
}
