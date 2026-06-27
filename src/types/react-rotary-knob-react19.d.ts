declare module 'react-rotary-knob-react19' {
  import * as React from 'react';
  export interface KnobProps {
    min?: number;
    max?: number;
    value: number;
    onChange: (value: number) => void;
    unlockDistance?: number;
    disabled?: boolean;
    preciseMode?: boolean;
    style?: React.CSSProperties;
  }
  export class Knob extends React.Component<KnobProps> {}
}
