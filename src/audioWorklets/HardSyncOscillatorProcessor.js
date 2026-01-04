// Airbnb JS style guide followed

class HardSyncOscillatorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 440, minValue: 0, maxValue: 20000 },
      { name: 'detune', defaultValue: 0, minValue: -1200, maxValue: 1200 },
      { name: 'type', defaultValue: 0, minValue: 0, maxValue: 4, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.phase = 0;
    this.lastSync = 0;
    // We maintain an internal buffer to compute mono output once per block
    this.internalBuffer = new Float32Array(128); 
    this.oscType = 'sine';
    this.customTable = null;
    
    this.port.onmessage = (e) => {
      if (e.data.type === 'settype') {
        this.oscType = e.data.value;
      }
      if (e.data.type === 'setcustomtable') {
        this.customTable = e.data.value;
      }
    };
  }

  sine(phase) {
    return Math.sin(2 * Math.PI * phase);
  }

  // Note: These are still naive (aliasing) generators. 
  // For production, use PolyBLEP or Wavetables.
  square(phase) {
    return phase < 0.5 ? 1 : -1;
  }

  sawtooth(phase) {
    return 2 * (phase - Math.floor(phase + 0.5));
  }

  triangle(phase) {
    return 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25));
  }

  custom(phase) {
    if (!this.customTable) return 0;
    const idx = Math.floor(phase * 1024) % 1024;
    return this.customTable[idx] || 0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const fmIn = inputs[0]; // FM modulation input
    const syncIn = inputs[1]; // Hard Sync input
    
    // Parameter typed arrays
    const freq = parameters.frequency;
    const detune = parameters.detune;

    // Use the first channel of sync/FM or null
    const syncChannel = syncIn && syncIn.length > 0 ? syncIn[0] : null;
    const fmChannel = fmIn && fmIn.length > 0 ? fmIn[0] : null;
    
    let { phase, lastSync } = this;
    const blockSize = output[0].length; // Typically 128

    // 1. Generate the Mono Block
    for (let i = 0; i < blockSize; i += 1) {
      const currentSync = syncChannel ? syncChannel[i] : 0;
      
      // Calculate Phase Increment (Frequency)
      const currentFreq = (freq.length > 1 ? freq[i] : freq[0]);
      const currentDetune = (detune.length > 1 ? detune[i] : detune[0]);
      const baseFreq = currentFreq * (2 ** (currentDetune / 1200));
      const fmValue = fmChannel ? fmChannel[i] || 0 : 0;
      const finalFreq = baseFreq + fmValue;
      const phaseInc = finalFreq / sampleRate;

      // HARD SYNC LOGIC (Subsample Accurate)
      // Detect rising edge: was <= 0, now > 0
      if (syncChannel && currentSync > 0 && lastSync <= 0) {
        // Calculate the fraction of time 't' (0 to 1) where the crossing occurred
        // Linear interpolation: 0 = lastSync, 1 = currentSync
        // We want to find 'd' where value was 0.
        // d = -lastSync / (currentSync - lastSync)
        // Check divisor to avoid NaN if signal is flat 0 (though loop condition prevents this mostly)
        const range = currentSync - lastSync;
        const fraction = range !== 0 ? -lastSync / range : 0;
        
        // Reset phase. 
        // Instead of 0, we set it to how much it WOULD have incremented 
        // in the time remaining AFTER the zero crossing.
        phase = phaseInc * (1 - fraction);
      } else {
        phase += phaseInc;
      }

      // Wrap phase
      if (phase >= 1) phase -= 1;
      if (phase < 0) phase += 1; // Handle negative frequencies if necessary

      lastSync = currentSync;

      // Generate Sample
      let sample = 0;
      switch (this.oscType) {
        case 'sine': sample = this.sine(phase); break;
        case 'square': sample = this.square(phase); break;
        case 'sawtooth': sample = this.sawtooth(phase); break;
        case 'triangle': sample = this.triangle(phase); break;
        case 'custom': sample = this.custom(phase); break;
        default: sample = this.sine(phase);
      }
      
      this.internalBuffer[i] = sample;
    }

    // 2. Write to all Output Channels
    // We copy the generated mono block to all output channels (L/R)
    for (let ch = 0; ch < output.length; ch += 1) {
      output[ch].set(this.internalBuffer);
    }

    // 3. Persist State
    this.phase = phase;
    this.lastSync = lastSync;

    return true;
  }
}

registerProcessor('hard-sync-oscillator', HardSyncOscillatorProcessor);