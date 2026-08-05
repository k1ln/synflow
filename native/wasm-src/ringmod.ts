// Bucket B (AS) — four-quadrant ring modulator: out = a * b. Two audio
// inputs ([0]=a, [1]=b); an unconnected side is treated as 1 (multiply-by-1),
// so an unconnected modulator passes the carrier through unchanged. Mirrors
// native C++ RingModNode.h / web RingModFlowNode exactly.

export function numInputs(): i32 { return 2; }
export function numOutputs(): i32 { return 1; }

export function process(frames: i32): void {
  const hasA: bool = isConnected(0);
  const hasB: bool = isConnected(1);
  for (let i: i32 = 0; i < frames; i++) {
    const a: f32 = hasA ? inputAt(0, i) : 1.0;
    const b: f32 = hasB ? inputAt(1, i) : 1.0;
    setOutput(0, i, a * b);
  }
}
