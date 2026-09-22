import React from "react";
import { OptionSelect } from "../components";
import { WAVEFORM_OPTIONS_CUSTOM } from "../components";

type OscillatorType = "sine" | "square" | "sawtooth" | "triangle" | "custom";

interface OscillatorTypeSelectorProps {
  type: OscillatorType;
  onTypeChange: (newType: OscillatorType) => void;
}

const OscillatorTypeSelector: React.FC<OscillatorTypeSelectorProps> = ({
  type,
  onTypeChange,
}) => (
  <div className="node-field">
    <span className="node-label">Waveform</span>
    <OptionSelect
      value={type}
      onChange={(v) => onTypeChange(v as OscillatorType)}
      options={WAVEFORM_OPTIONS_CUSTOM}
      columns={2}
      aria-label="Oscillator type"
    />
  </div>
);

export default OscillatorTypeSelector;
