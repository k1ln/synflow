import type { Flow } from './instruments';

/** A host-exposed knob declared in Synflow (node.data.knobs). */
export interface ExposedKnob { nodeId: string; param: string; label: string; min: number; max: number; default?: number }

/** Collect every exposed knob across a flow's nodes. The knob's value is the live
 *  node.data[param] (so DAW tweaks persist when reopened), falling back to the
 *  declared default. */
export function flowKnobs(flow?: Pick<Flow, 'nodes'>): ExposedKnob[] {
  return (flow?.nodes ?? []).flatMap((n: any) =>
    Array.isArray(n.data?.knobs)
      ? n.data.knobs.map((k: any) => ({
          nodeId: n.id, param: k.param, label: k.label || k.param, min: k.min ?? 0, max: k.max ?? 1,
          default: typeof n.data[k.param] === 'number' ? n.data[k.param] : k.default,
        }))
      : [],
  );
}

/** One choice of a host-exposed option (a discrete "option button" param). */
export interface OptionChoice { value: string; label: string }
/** A host-exposed discrete param declared in Synflow (node.data.options). Renders
 *  as option buttons (e.g. an oscillator's waveform) instead of a knob. */
export interface ExposedOption { nodeId: string; param: string; label: string; choices: OptionChoice[]; value: string }

/** Normalize a raw choice (a bare string or { value, label }) to { value, label }. */
const toChoice = (c: any): OptionChoice =>
  typeof c === 'string' ? { value: c, label: c } : { value: String(c.value), label: c.label ?? String(c.value) };

/** Collect every exposed option across a flow's nodes. The current value is the live
 *  node.data[param] (so DAW selections persist), falling back to the first choice. */
export function flowOptions(flow?: Pick<Flow, 'nodes'>): ExposedOption[] {
  return (flow?.nodes ?? []).flatMap((n: any) =>
    Array.isArray(n.data?.options)
      ? n.data.options.map((o: any) => {
          const choices = (Array.isArray(o.choices) ? o.choices : []).map(toChoice);
          const raw = n.data[o.param];
          return {
            nodeId: n.id, param: o.param, label: o.label || o.param, choices,
            value: String(raw ?? o.default ?? choices[0]?.value ?? ''),
          };
        })
      : [],
  );
}

/** A knob's default mapped to the 0..1 the <Knob> component uses. */
export const knob01 = (k: ExposedKnob): number => {
  const v = k.default ?? k.min;
  const range = k.max - k.min || 1;
  return Math.max(0, Math.min(1, (v - k.min) / range));
};

/** Map a 0..1 knob position back to the param's real value. */
export const knobValue = (k: ExposedKnob, v01: number): number => k.min + v01 * (k.max - k.min);

/** Human-readable readout of a knob's real value (precision scales with its range). */
export const knobReadout = (k: ExposedKnob, v01: number): string => {
  const v = knobValue(k, v01);
  const span = Math.abs(k.max - k.min);
  const dp = span >= 100 ? 0 : span >= 10 ? 1 : span >= 1 ? 2 : 3;
  const s = v.toFixed(dp);
  // Trim trailing zeros only after a decimal point ("1.50"→"1.5"), never from
  // whole numbers ("40" must not become "4", "1200" not "12").
  return (s.includes('.') ? s.replace(/\.?0+$/, '') : s) || '0';
};
