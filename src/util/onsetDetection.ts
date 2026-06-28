/**
 * Onset detection using Essentia.js
 * Provides professional audio onset detection for auto-sampling
 * Based on MTG's Essentia.js onset detection demo
 */

import { Essentia, EssentiaWASM } from 'essentia.js';

let essentiaInstance: any = null;

export type OnsetDetectionMethod = 'hfc' | 'complex' | 'flux' | 'complex_phase';

export type OnsetDetectionOptions = {
  methods?: OnsetDetectionMethod[];
  methodWeights?: number[];
  sensitivity?: number; // 0-1, higher = more sensitive
  frameSize?: number;
  hopSize?: number;
  overlapPadding?: number; // seconds to extend each segment on both sides
};

/**
 * Initialize Essentia.js (lazy loading)
 */
async function initEssentia() {
  if (essentiaInstance) return essentiaInstance;
  
  try {
    // The package index.js does: const EssentiaWASM = require("./dist/essentia-wasm.umd")
    // which returns { EssentiaWASM: Module } since the umd file ends with: exports.EssentiaWASM = Module
    // So EssentiaWASM from our named import is { EssentiaWASM: Module } — we need .EssentiaWASM
    const wasmModule = (EssentiaWASM as any).EssentiaWASM ?? EssentiaWASM;
    essentiaInstance = new Essentia(wasmModule);
    console.log('Essentia.js initialized');
    return essentiaInstance;
  } catch (err) {
    console.error('Failed to initialize Essentia.js:', err);
    return null;
  }
}

/**
 * Detect onsets in an audio buffer using Essentia.js with advanced options
 */
export async function detectOnsets(
  audioBuffer: AudioBuffer,
  rangeStart: number,
  rangeEnd: number,
  options: OnsetDetectionOptions = {}
): Promise<number[]> {
  const essentia = await initEssentia();
  
  if (!essentia) {
    console.warn('Essentia.js not available, falling back to simple detection');
    return fallbackOnsetDetection(audioBuffer, rangeStart, rangeEnd);
  }

  const {
    sensitivity = 0.7,
    frameSize = 1024,
    hopSize = 512
  } = options;

  try {
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(rangeStart * sampleRate);
    const endSample = Math.floor(rangeEnd * sampleRate);
    
    // Extract the audio segment (mono: channel 0)
    const channelData = audioBuffer.getChannelData(0);
    const segmentLength = endSample - startSample;
    const segment = new Float32Array(segmentLength);
    
    for (let i = 0; i < segmentLength; i++) {
      segment[i] = channelData[startSample + i];
    }

    // Need at least 4 frames for reliable peak picking
    if (segmentLength < frameSize * 4) {
      console.warn(`Segment too short for Essentia onset detection (${segmentLength} samples, need ${frameSize * 4}), using fallback`);
      return fallbackOnsetDetection(audioBuffer, rangeStart, rangeEnd);
    }

    // Frame-based onset detection: Windowing → Spectrum → OnsetDetection (hfc)
    // More stable than SuperFluxExtractor in the WASM environment.
    const onsetValues: number[] = [];

    for (let pos = 0; pos + frameSize <= segmentLength; pos += hopSize) {
      const frame = new Float32Array(frameSize);
      for (let j = 0; j < frameSize; j++) {
        frame[j] = segment[pos + j];
      }

      const frameVec = essentia.arrayToVector(frame);
      const windowed = essentia.Windowing(frameVec, true, frameSize, 'hann');
      const specResult = essentia.Spectrum(windowed.frame, frameSize);
      // 'hfc' doesn't use the phase argument — pass spectrum as a harmless placeholder
      const odResult = essentia.OnsetDetection(specResult.spectrum, specResult.spectrum, 'hfc', sampleRate);
      onsetValues.push(odResult.onsetDetection);
    }

    const numFrames = onsetValues.length;
    if (numFrames < 3) {
      return fallbackOnsetDetection(audioBuffer, rangeStart, rangeEnd);
    }

    // Dynamic threshold: mean + (1 - sensitivity) * spread
    const maxVal = Math.max(...onsetValues);
    const meanVal = onsetValues.reduce((a, b) => a + b, 0) / numFrames;
    const threshold = meanVal + (1 - sensitivity) * (maxVal - meanVal) * 0.8;

    // Minimum gap between onsets: 50 ms
    const minGapFrames = Math.max(1, Math.ceil(0.05 * sampleRate / hopSize));

    // Peak picking: local maximum above threshold, respecting min gap
    const onsetTimes: number[] = [];
    let lastOnsetFrame = -minGapFrames;

    for (let i = 1; i < numFrames - 1; i++) {
      if (
        onsetValues[i] >= threshold &&
        onsetValues[i] > onsetValues[i - 1] &&
        onsetValues[i] >= onsetValues[i + 1] &&
        i - lastOnsetFrame >= minGapFrames
      ) {
        onsetTimes.push(rangeStart + (i * hopSize) / sampleRate);
        lastOnsetFrame = i;
      }
    }

    // Build cut points: start + onsets + end
    const minBoundaryDistance = 0.03; // 30 ms
    const filteredOnsets = onsetTimes.filter(
      t => t > rangeStart + minBoundaryDistance && t < rangeEnd - minBoundaryDistance
    );

    const cutPoints = [rangeStart, ...filteredOnsets, rangeEnd];
    const uniqueCutPoints = [...new Set(cutPoints)].sort((a, b) => a - b);

    console.log(`Essentia detected ${onsetTimes.length} onsets in ${(rangeEnd - rangeStart).toFixed(1)}s, creating ${uniqueCutPoints.length - 1} segments`);
    return uniqueCutPoints;

  } catch (err) {
    console.error('Essentia onset detection failed:', err);
    return fallbackOnsetDetection(audioBuffer, rangeStart, rangeEnd);
  }
}

/**
 * Fallback onset detection (valley-based) when Essentia is not available
 */
function fallbackOnsetDetection(
  audioBuffer: AudioBuffer,
  rangeStart: number,
  rangeEnd: number
): number[] {
  const sampleRate = audioBuffer.sampleRate;
  const startSample = Math.floor(rangeStart * sampleRate);
  const endSample = Math.floor(rangeEnd * sampleRate);
  const windowSize = Math.floor(0.02 * sampleRate); // 20ms
  const hopSize = Math.floor(windowSize / 4);
  
  // Calculate RMS energy
  const energies: { time: number; energy: number }[] = [];
  const channelData = audioBuffer.getChannelData(0);
  const channelData2 = audioBuffer.numberOfChannels > 1 
    ? audioBuffer.getChannelData(1) 
    : null;
  
  for (let i = startSample; i < endSample - windowSize; i += hopSize) {
    let sumSquares = 0;
    for (let j = 0; j < windowSize; j++) {
      let sample = channelData[i + j] || 0;
      if (channelData2) {
        sample = (sample + (channelData2[i + j] || 0)) / 2;
      }
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / windowSize);
    energies.push({ time: i / sampleRate, energy: rms });
  }
  
  if (energies.length < 10) {
    return [rangeStart, rangeEnd];
  }
  
  // Calculate threshold
  let totalEnergy = 0;
  let maxEnergy = 0;
  for (const e of energies) {
    totalEnergy += e.energy;
    if (e.energy > maxEnergy) maxEnergy = e.energy;
  }
  const avgEnergy = totalEnergy / energies.length;
  const dynamicRange = maxEnergy / (avgEnergy + 0.0001);
  const quietThreshold = dynamicRange > 10 ? avgEnergy * 0.4 : avgEnergy * 0.6;
  
  // Smooth energy
  const smoothedEnergies: { time: number; energy: number }[] = [];
  const smoothWindow = 5;
  for (let i = 0; i < energies.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - smoothWindow); 
         j < Math.min(energies.length, i + smoothWindow + 1); j++) {
      sum += energies[j].energy;
      count++;
    }
    smoothedEnergies.push({ time: energies[i].time, energy: sum / count });
  }
  
  // Find valleys
  const valleys: number[] = [];
  const minSegmentDuration = 0.05;
  
  for (let i = 2; i < smoothedEnergies.length - 2; i++) {
    const prev = smoothedEnergies[i - 1].energy;
    const curr = smoothedEnergies[i].energy;
    const next = smoothedEnergies[i + 1].energy;
    
    if (curr < prev && curr < next && curr < quietThreshold) {
      const time = smoothedEnergies[i].time;
      if (valleys.length === 0 || time - valleys[valleys.length - 1] > minSegmentDuration) {
        valleys.push(time);
      }
    }
  }
  
  const cutPoints = [rangeStart];
  if (valleys.length > 0) {
    cutPoints.push(...valleys);
  }
  cutPoints.push(rangeEnd);
  
  return [...new Set(cutPoints)].sort((a, b) => a - b);
}
