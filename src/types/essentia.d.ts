/**
 * Type declarations for essentia.js
 * https://github.com/MTG/essentia.js
 */

declare module 'essentia.js' {
  export class Essentia {
    constructor(wasmModule: any);
    
    version: string;
    algorithmNames: string[];
    
    // Vector utilities
    arrayToVector(array: Float32Array | number[]): any;
    vectorToArray(vector: any): Float32Array;
    
    // Frame generation
    FrameGenerator(signal: any, frameSize: number, hopSize: number): any;
    
    // Windowing
    Windowing(frame: any, type?: string, normalized?: boolean, size?: number, zeroPadding?: number): {
      frame: any;
    };
    
    // Spectrum analysis
    Spectrum(frame: any, size?: number): {
      spectrum: any;
    };
    
    FFT(frame: any, size?: number): {
      fft: any;
    };
    
    CartesianToPolar(fft: any): {
      magnitude: any;
      phase: any;
    };
    
    // Onset detection
    OnsetDetection(
      spectrum: any,
      phase: any,
      method?: 'hfc' | 'complex' | 'flux' | 'complex_phase' | 'melflux' | 'rms',
      sampleRate?: number
    ): {
      onsetDetection: number;
    };
    
    OnsetRate(signal: any): {
      onsets: number[];
      onsetRate: number;
    };
  }
  
  export function EssentiaWASM(): Promise<any>;
}
