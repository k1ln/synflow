// Bucket B (AS) — Gain. Port 0 = main audio input, port 1 = gain modulation
// (a-rate, e.g. an ADSR/Automation driving the "gain" handle). param 0 = base
// gain. Mirrors native C++ GainNode.h / web GainFlowNode exactly: unconnected
// port 1 -> plain scalar gain; connected -> base * control per-sample.

export function numInputs(): i32 { return 2; }
export function numOutputs(): i32 { return 1; }

export function process(frames: i32): void {
  const g: f32 = param(0);
  const modulated: bool = isConnected(1);
  for (let i: i32 = 0; i < frames; i++) {
    const gv: f32 = modulated ? g * inputAt(1, i) : g;
    setOutput(0, i, inputAt(0, i) * gv);
  }
}
