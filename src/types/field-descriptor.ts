import React from 'react';

export type FieldType = 'string' | 'boolean' | 'url' | 'style';

export type FieldDescriptor = {
  type: FieldType;
  label?: string;
  default?: unknown;
  // extensible hints: placeholder, min, max, etc.
  placeholder?: string;
};

export type ValueFrom<D extends FieldDescriptor> =
  D['type'] extends 'boolean' ? boolean :
  D['type'] extends 'style' ? React.CSSProperties :
  string; // string and url collapse to string for values

export type DataFromDescriptors<S extends Record<string, FieldDescriptor>> = {
  [K in keyof S]: ValueFrom<S[K]>;
};

export function makeDefaults<S extends Record<string, FieldDescriptor>>(schema: S): DataFromDescriptors<S> {
  const out: any = {};
  for (const [k, d] of Object.entries(schema)) out[k] = (d as FieldDescriptor).default ?? null;
  return out as DataFromDescriptors<S>;
}
