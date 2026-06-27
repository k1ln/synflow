import React from 'react';
import { FieldDescriptor, DataFromDescriptors, makeDefaults } from './field-descriptor';

export const ConvolverDataSchema = {
  label: { type: 'string', label: 'Label', default: 'Convolver' },
  normalize: { type: 'boolean', label: 'Normalize', default: true },
  impulseResponseUrl: { type: 'url', label: 'Impulse Response URL', default: '' },
  style: { type: 'style', label: 'Style', default: {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    width: '200px',
    textAlign: 'center',
    background: '#333',
    color: '#eee',
  } as React.CSSProperties },
} as const satisfies Record<string, FieldDescriptor>;

export type ConvolverData = DataFromDescriptors<typeof ConvolverDataSchema>;

export const defaultConvolverData: ConvolverData = makeDefaults(ConvolverDataSchema);
