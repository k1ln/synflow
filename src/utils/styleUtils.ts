import type { CSSProperties } from 'react';
import { NODE_CATEGORY_COLORS } from '../components/NodePaletteDialog';

export const DARK_NODE_BG = 'rgba(18, 19, 36, 0.52)';

/**
 * Base look shared by every flow node. This is the single source of truth that
 * used to be the inline `nodeStyleObj` in Flow.tsx. Most nodes now get this look
 * from the `.flow-node` CSS class (see AudioNode.css); a handful of bespoke
 * nodes that merge their own local style still import this so their default look
 * matches. Width is intentionally omitted so nodes size to their content.
 */
export const baseNodeStyle: CSSProperties = {
  padding: '5px',
  border: '1px solid rgba(80, 95, 130, 0.50)',
  borderRadius: '7px',
  textAlign: 'center',
  background: 'rgba(18, 19, 36, 0.52)',
  backdropFilter: 'blur(6px)',
  color: '#eee',
  boxShadow: '0 1px 3px rgba(0,0,0,0.45), 0 0 8px 2px rgba(0,255,136,0.08)',
};

export function makeDistortionCurve(amount: number): Float32Array {
  const k = typeof amount === "number" ? amount : 50;
  const numSamples = 44100;
  const curve = new Float32Array(numSamples);
  const deg = Math.PI / 180;
  for (let i = 0; i < numSamples; i++) {
    const x = (i * 2) / numSamples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
};

const glowCache = new Map<string, string>();
export const makeGlow = (hex: string, strength: 'normal' | 'strong' = 'normal'): string => {
  const cacheKey = `${hex}-${strength}`;
  const cached = glowCache.get(cacheKey);
  if (cached) return cached;
  const rgb = hexToRgb(hex) || { r: 0, g: 255, b: 136 };
  const baseShadow = '0 1px 3px rgba(0,0,0,0.45)';
  let result: string;
  if (strength === 'strong') {
    result = `${baseShadow}, 0 0 14px 3px rgba(${rgb.r},${rgb.g},${rgb.b},0.40)`;
  } else {
    result = `${baseShadow}, 0 0 8px 2px rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`;
  }
  glowCache.set(cacheKey, result);
  return result;
};

const edgeGlowCache = new Map<string, string>();
export const makeEdgeGlowFilter = (hex: string, strength: 'normal' | 'strong' = 'normal'): string => {
  const cacheKey = `${hex}-${strength}`;
  const cached = edgeGlowCache.get(cacheKey);
  if (cached) return cached;
  const rgb = hexToRgb(hex) || { r: 255, g: 255, b: 255 };
  const a1 = strength === 'strong' ? 0.8 : 0.6;
  const a2 = strength === 'strong' ? 0.5 : 0.3;
  const result = `drop-shadow(0 0 2px rgba(${rgb.r},${rgb.g},${rgb.b},${a1})) drop-shadow(0 0 4px rgba(${rgb.r},${rgb.g},${rgb.b},${a2}))`;
  edgeGlowCache.set(cacheKey, result);
  return result;
};

export function normalizeNodeStylesForTheme(arr: any[] | undefined): any[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((n) => {
    const data = n?.data || {};
    const style = { ...(data.style || {}) } as any;
    if (!style.background || style.background === '#333' || style.background === '#222' || style.background === '#1f1f1f' || style.background === '#161618' || style.background === '#1c1d2a') {
      style.background = DARK_NODE_BG;
    }
    if (!style.backdropFilter) style.backdropFilter = 'blur(6px)';
    if (!style.border) style.border = '1px solid rgba(80, 95, 130, 0.50)';
    if (!style.borderRadius) style.borderRadius = '5px';
    if (!style.glowColor) style.glowColor = '#00ff88';
    if (!style.boxShadow) style.boxShadow = makeGlow(style.glowColor, 'normal');
    if (!style.color) style.color = '#eeeeee';
    const catColor = NODE_CATEGORY_COLORS[n.type as string];
    if (catColor) {
      const rgb = hexToRgb(catColor) || { r: 255, g: 255, b: 255 };
      style.borderTop = `3px solid ${catColor}`;
      const insetGlow = `inset 0 3px 12px rgba(${rgb.r},${rgb.g},${rgb.b},0.22)`;
      const outerGlow = makeGlow(style.glowColor || '#00ff88', 'normal');
      style.boxShadow = `${outerGlow}, ${insetGlow}`;
      (style as any)['--node-accent'] = catColor;
    }
    return { ...n, data: { ...data, style } };
  });
}
