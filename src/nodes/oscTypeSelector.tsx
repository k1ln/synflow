import React from "react";

type OscillatorType = "sine" | "square" | "sawtooth" | "triangle" | "custom";

interface OscillatorTypeSelectorProps {
  type: OscillatorType;
  onTypeChange: (newType: OscillatorType) => void;
}

const OscillatorTypeSelector: React.FC<OscillatorTypeSelectorProps> = ({
  type,
  onTypeChange,
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onTypeChange(event.target.value as OscillatorType); // Notify parent
  };

  return (
    <div>
      <label htmlFor="oscillator-type">Select Oscillator Type:</label>
      <select
        id="oscillator-type"
        value={type}
        onChange={handleChange}
      >
        {["sine", "square", "sawtooth", "triangle", "custom"].map((oscType) => (
          <option key={oscType} value={oscType}>
            {oscType}
          </option>
        ))}
      </select>
    </div>
  );
};

export default OscillatorTypeSelector;