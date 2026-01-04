/**
 * Enhanced YIN Pitch Detection Algorithm
 * Multi-resolution analysis for better accuracy
 * Ideal for grain synthesis applications
 */

/**
 * Detect pitch using enhanced YIN with multi-resolution
 * @param buffer - AudioBuffer to analyze
 * @param start - Start time in seconds (optional)
 * @param end - End time in seconds (optional)
 * @returns Detected frequency in Hz, or null if no pitch
 */
export const detectPitch = (
  buffer: AudioBuffer,
  start = 0,
  end?: number
): number | null => {
  const sampleRate = buffer.sampleRate;
  const channelData = buffer.getChannelData(0);
  
  // Convert time bounds to sample indices
  const startSample = Math.floor(start * sampleRate);
  const endSample = end
    ? Math.min(Math.floor(end * sampleRate), channelData.length)
    : channelData.length;
  
  // Extract the segment to analyze
  const segment = channelData.slice(startSample, endSample);
  
  // For very short segments (< 256 samples), use FFT
  if (segment.length < 256) {
    return fftPitchDetect(segment, sampleRate);
  }

  // For short segments (256-1024), use zero-padding + small windows
  if (segment.length < 1024) {
    return detectPitchShort(segment, sampleRate);
  }

  // Multi-resolution: try different window sizes
  const windowSizes = [
    8192, // Best for low frequencies (down to ~20 Hz)
    4096, // Good general purpose
    2048, // Better for higher frequencies
    1024, // For shorter segments
  ].filter((size) => size <= segment.length);

  if (windowSizes.length === 0) {
    windowSizes.push(segment.length);
  }

  // Analyze multiple positions and window sizes
  const detections: { freq: number; confidence: number }[] = [];

  for (const windowSize of windowSizes) {
    // Analyze at multiple positions (start, middle, end)
    const positions = [
      0,
      Math.floor((segment.length - windowSize) / 2),
      Math.max(0, segment.length - windowSize),
    ].filter(
      (pos, idx, arr) =>
        arr.indexOf(pos) === idx && pos + windowSize <= segment.length
    );

    for (const pos of positions) {
      const window = segment.slice(pos, pos + windowSize);
      const result = yinPitchDetect(window, sampleRate);
      if (result) {
        detections.push(result);
      }
    }
  }

  // Also try FFT for comparison on medium segments
  if (segment.length < 4096) {
    const fftResult = fftPitchDetect(segment, sampleRate);
    if (fftResult) {
      detections.push({ freq: fftResult, confidence: 0.6 });
    }
  }

  if (detections.length === 0) {
    return null;
  }

  // Find consensus among detections
  // Group similar frequencies (within 5% of each other)
  const groups: { freq: number; count: number; conf: number }[] = [];
  
  for (const det of detections) {
    let found = false;
    for (const group of groups) {
      const ratio = det.freq / group.freq;
      if (ratio > 0.95 && ratio < 1.05) {
        // Average the frequencies, sum confidence
        group.freq = (group.freq * group.count + det.freq) /
          (group.count + 1);
        group.count++;
        group.conf += det.confidence;
        found = true;
        break;
      }
    }
    if (!found) {
      groups.push({
        freq: det.freq,
        count: 1,
        conf: det.confidence
      });
    }
  }

  // Pick group with best combined score (count + confidence)
  let best = groups[0];
  for (const group of groups) {
    const score = group.count * 2 + group.conf;
    const bestScore = best.count * 2 + best.conf;
    if (score > bestScore) {
      best = group;
    }
  }

  return Math.round(best.freq * 10) / 10;
};

/**
 * Pitch detection for short segments (256-1024 samples)
 * Uses zero-padding and autocorrelation
 */
const detectPitchShort = (
  segment: Float32Array,
  sampleRate: number
): number | null => {
  // Zero-pad to 2048 for better frequency resolution
  const padded = new Float32Array(2048);
  padded.set(segment, 0);
  
  const detections: { freq: number; confidence: number }[] = [];
  
  // Try YIN on padded signal
  const yinResult = yinPitchDetect(padded, sampleRate);
  if (yinResult) {
    detections.push(yinResult);
  }
  
  // Also try FFT
  const fftResult = fftPitchDetect(segment, sampleRate);
  if (fftResult) {
    detections.push({ freq: fftResult, confidence: 0.7 });
  }
  
  // Try autocorrelation on original (unpadded)
  const acResult = autocorrelationPitch(segment, sampleRate);
  if (acResult) {
    detections.push(acResult);
  }
  
  if (detections.length === 0) {
    return null;
  }
  
  // Find best detection
  let best = detections[0];
  for (const det of detections) {
    if (det.confidence > best.confidence) {
      best = det;
    }
  }
  
  return Math.round(best.freq * 10) / 10;
};

/**
 * Simple autocorrelation pitch detection
 * Good for short, clean signals
 */
const autocorrelationPitch = (
  samples: Float32Array,
  sampleRate: number
): { freq: number; confidence: number } | null => {
  const n = samples.length;
  if (n < 64) return null;
  
  // Compute autocorrelation
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / 50)); // Min 50 Hz
  const minLag = Math.max(2, Math.floor(sampleRate / 4000)); // Max 4000 Hz
  
  const ac = new Float32Array(maxLag + 1);
  let maxAc = 0;
  
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += samples[i] * samples[i + lag];
    }
    ac[lag] = sum;
    if (lag === 0) maxAc = sum;
  }
  
  // Normalize
  if (maxAc > 0) {
    for (let i = 0; i <= maxLag; i++) {
      ac[i] /= maxAc;
    }
  }
  
  // Find first peak after initial drop
  let foundDip = false;
  let bestLag = -1;
  let bestVal = 0;
  
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (!foundDip && ac[lag] < 0.5) {
      foundDip = true;
    }
    if (foundDip && ac[lag] > bestVal && ac[lag] > 0.3) {
      bestVal = ac[lag];
      bestLag = lag;
    }
  }
  
  if (bestLag === -1) {
    return null;
  }
  
  // Parabolic interpolation
  let betterLag = bestLag;
  if (bestLag > 0 && bestLag < maxLag) {
    const y0 = ac[bestLag - 1];
    const y1 = ac[bestLag];
    const y2 = ac[bestLag + 1];
    const denom = 2 * (2 * y1 - y2 - y0);
    if (Math.abs(denom) > 0.0001) {
      betterLag = bestLag + (y2 - y0) / denom;
    }
  }
  
  const freq = sampleRate / betterLag;
  
  if (freq < 50 || freq > 4000) {
    return null;
  }
  
  return { freq, confidence: bestVal };
};

/**
 * FFT-based pitch detection using spectral peak
 * Works well for short segments with clear harmonics
 */
const fftPitchDetect = (
  samples: Float32Array,
  sampleRate: number
): number | null => {
  // Pad to power of 2 for FFT
  const fftSize = nextPowerOf2(Math.max(samples.length * 2, 512));
  const padded = new Float32Array(fftSize);
  
  // Apply Hann window to reduce spectral leakage
  for (let i = 0; i < samples.length; i++) {
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / samples.length));
    padded[i] = samples[i] * window;
  }
  
  // Simple DFT (for small sizes FFT would be faster but this is simpler)
  const real = new Float32Array(fftSize / 2);
  const imag = new Float32Array(fftSize / 2);
  const magnitude = new Float32Array(fftSize / 2);
  
  // Compute only lower frequencies (up to ~4000 Hz)
  const maxBin = Math.min(
    fftSize / 2,
    Math.ceil((4000 * fftSize) / sampleRate)
  );
  const minBin = Math.max(1, Math.floor((50 * fftSize) / sampleRate));
  
  for (let k = minBin; k < maxBin; k++) {
    let re = 0;
    let im = 0;
    const omega = (2 * Math.PI * k) / fftSize;
    for (let n = 0; n < fftSize; n++) {
      re += padded[n] * Math.cos(omega * n);
      im -= padded[n] * Math.sin(omega * n);
    }
    real[k] = re;
    imag[k] = im;
    magnitude[k] = Math.sqrt(re * re + im * im);
  }
  
  // Find dominant peak
  let maxMag = 0;
  let peakBin = -1;
  for (let k = minBin; k < maxBin; k++) {
    if (magnitude[k] > maxMag) {
      maxMag = magnitude[k];
      peakBin = k;
    }
  }
  
  if (peakBin === -1 || maxMag < 0.01) {
    return null;
  }
  
  // Parabolic interpolation for sub-bin accuracy
  let betterBin = peakBin;
  if (peakBin > minBin && peakBin < maxBin - 1) {
    const y0 = magnitude[peakBin - 1];
    const y1 = magnitude[peakBin];
    const y2 = magnitude[peakBin + 1];
    const denom = 2 * (2 * y1 - y2 - y0);
    if (Math.abs(denom) > 0.0001) {
      betterBin = peakBin + (y2 - y0) / denom;
    }
  }
  
  const freq = (betterBin * sampleRate) / fftSize;
  
  if (freq < 50 || freq > 4000) {
    return null;
  }
  
  return freq;
};

/**
 * Next power of 2 helper
 */
const nextPowerOf2 = (n: number): number => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

/**
 * YIN pitch detection on a windowed sample
 * Returns frequency and confidence score
 */
const yinPitchDetect = (
  samples: Float32Array,
  sampleRate: number
): { freq: number; confidence: number } | null => {
  const bufferSize = samples.length;
  const halfBuffer = Math.floor(bufferSize / 2);
  
  // Adaptive threshold based on signal energy
  let energy = 0;
  for (let i = 0; i < bufferSize; i++) {
    energy += samples[i] * samples[i];
  }
  energy /= bufferSize;
  
  // Very quiet signals need stricter threshold
  const baseThreshold = energy < 0.001 ? 0.1 : 0.2;
  
  // Step 1: Compute difference function
  const diff = new Float32Array(halfBuffer);
  for (let tau = 0; tau < halfBuffer; tau++) {
    let sum = 0;
    for (let i = 0; i < halfBuffer; i++) {
      const delta = samples[i] - samples[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }
  
  // Step 2: Cumulative mean normalized difference
  const cmndf = new Float32Array(halfBuffer);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfBuffer; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = diff[tau] / (runningSum / tau);
  }
  
  // Step 3: Find first minimum below threshold
  // Extended frequency range: 20 Hz to 4000 Hz
  const minPeriod = Math.floor(sampleRate / 4000);
  const maxPeriod = Math.floor(sampleRate / 20);
  
  let bestTau = -1;
  let bestVal = Infinity;
  
  // First pass: find dip below threshold
  for (
    let tau = Math.max(2, minPeriod);
    tau < Math.min(maxPeriod, halfBuffer);
    tau++
  ) {
    if (cmndf[tau] < baseThreshold) {
      // Found a dip, find the local minimum
      while (
        tau + 1 < halfBuffer &&
        cmndf[tau + 1] < cmndf[tau]
      ) {
        tau++;
      }
      bestTau = tau;
      bestVal = cmndf[tau];
      break;
    }
  }
  
  // Second pass: if no threshold dip, find global minimum
  if (bestTau === -1) {
    for (
      let tau = Math.max(2, minPeriod);
      tau < Math.min(maxPeriod, halfBuffer);
      tau++
    ) {
      if (cmndf[tau] < bestVal) {
        bestVal = cmndf[tau];
        bestTau = tau;
      }
    }
    // Only accept if reasonably confident
    if (bestVal > 0.4) {
      return null;
    }
  }
  
  if (bestTau === -1 || bestTau < 2) {
    return null;
  }
  
  // Step 4: Parabolic interpolation for sub-sample accuracy
  let betterTau = bestTau;
  if (bestTau > 0 && bestTau < halfBuffer - 1) {
    const s0 = cmndf[bestTau - 1];
    const s1 = cmndf[bestTau];
    const s2 = cmndf[bestTau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 0.0001) {
      betterTau = bestTau + (s2 - s0) / denom;
    }
  }
  
  const frequency = sampleRate / betterTau;
  
  // Sanity check with extended range
  if (frequency < 20 || frequency > 4000) {
    return null;
  }
  
  // Confidence: lower cmndf value = higher confidence
  const confidence = Math.max(0, 1 - bestVal);
  
  return {
    freq: frequency,
    confidence
  };
};

/**
 * Convert frequency to musical note name
 */
export const frequencyToNote = (freq: number): string => {
  const noteNames = [
    'C', 'C#', 'D', 'D#', 'E', 'F',
    'F#', 'G', 'G#', 'A', 'A#', 'B'
  ];
  
  // A4 = 440 Hz
  const semitonesFromA4 = 12 * Math.log2(freq / 440);
  const midiNote = Math.round(69 + semitonesFromA4);
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = ((midiNote % 12) + 12) % 12;
  const cents = Math.round(
    (semitonesFromA4 - Math.round(semitonesFromA4)) * 100
  );
  
  const centsStr = cents >= 0 ? `+${cents}` : `${cents}`;
  return `${noteNames[noteIndex]}${octave} (${centsStr}¢)`;
};

/**
 * Calculate playback rate to transpose from one freq to another
 */
export const frequencyRatio = (
  sourceFreq: number,
  targetFreq: number
): number => {
  return targetFreq / sourceFreq;
};

export default detectPitch;
