// Pure DSP helpers for building PeriodicWave objects.
// Relocated into core so the engine no longer depends on the GUI oscillator node.

export function buildWavetablePeriodicWave(
  ctx: AudioContext,
  samples: number[]
): PeriodicWave {
  const N = samples.length;
  const numH = Math.min(N >> 1, 256);
  const real = new Float32Array(numH + 1);
  const imag = new Float32Array(numH + 1);
  for (let k = 0; k <= numH; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const a = (2 * Math.PI * k * n) / N;
      re += samples[n] * Math.cos(a);
      im -= samples[n] * Math.sin(a);
    }
    real[k] = re / N;
    imag[k] = im / N;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

export function buildPulsePeriodicWave(
  audioContext: AudioContext,
  dutyCycle: number = 0.5,
  numHarmonics: number = 128
): PeriodicWave {
  const real = new Float32Array(numHarmonics);
  const imag = new Float32Array(numHarmonics);

  real[0] = 2 * dutyCycle - 1; // DC offset
  imag[0] = 0;

  for (let n = 1; n < numHarmonics; n++) {
    real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * dutyCycle);
    imag[n] = 0;
  }

  return audioContext.createPeriodicWave(real, imag, { disableNormalization: false });
}
