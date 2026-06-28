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

/** A knob's default mapped to the 0..1 the <Knob> component uses. */
export const knob01 = (k: ExposedKnob): number => {
  const v = k.default ?? k.min;
  const range = k.max - k.min || 1;
  return Math.max(0, Math.min(1, (v - k.min) / range));
};

/** Map a 0..1 knob position back to the param's real value. */
export const knobValue = (k: ExposedKnob, v01: number): number => k.min + v01 * (k.max - k.min);
