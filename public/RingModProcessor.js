// Four-quadrant ring modulator: out = a * b, sample-accurate.
// Two audio inputs (a = inputs[0], b = inputs[1]). If one side is missing the
// signal passes through unchanged (multiply-by-1 semantics), so an unconnected
// modulator doesn't silence the carrier.

class RingModProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const a = inputs[0];
    const b = inputs[1];
    const output = outputs[0];
    if (!output || !output.length) return true;

    const aCh = a && a[0];
    const bCh = b && b[0];
    const out0 = output[0];
    const n = out0.length;

    if (aCh && bCh) {
      for (let i = 0; i < n; i++) out0[i] = aCh[i] * bCh[i];
    } else if (aCh) {
      out0.set(aCh);
    } else if (bCh) {
      out0.set(bCh);
    } else {
      out0.fill(0);
    }
    for (let c = 1; c < output.length; c++) output[c].set(out0);
    return true;
  }
}

registerProcessor('ring-mod-processor', RingModProcessor);
