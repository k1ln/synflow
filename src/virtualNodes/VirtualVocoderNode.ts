import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import { VocoderFlowNodeProps } from "../nodes/VocoderFlowNode";

/**
 * VirtualVocoderNode - A classic vocoder audio processor (Daft Punk style)
 * 
 * A vocoder works by:
 * 1. Taking two inputs: carrier (synth - typically saw wave) and modulator (voice)
 * 2. Splitting both signals into frequency bands using bandpass filters
 * 3. Extracting the amplitude envelope from each modulator band
 * 4. Applying those envelopes to the corresponding carrier bands
 * 5. Summing all the processed bands to create the output
 * 
 * For the classic Daft Punk sound:
 * - Use a rich carrier (sawtooth or pulse wave, ideally with slight detuning)
 * - 16-24 bands works well
 * - Fast attack (2-10ms), moderate release (20-50ms)
 * - Q factor around 8-12 for that synthetic resonant character
 */

type VocoderBand = {
  carrierFilter: BiquadFilterNode;
  modulatorFilter: BiquadFilterNode;
  modulatorAnalyser: AnalyserNode;
  vca: GainNode;  // VCA (Voltage Controlled Amplifier) for this band
  frequency: number;
  envelopeValue: number;  // Current envelope level
};

export class VirtualVocoderNode extends VirtualNode<CustomNode & VocoderFlowNodeProps> {
  // Input nodes
  private carrierInputGain: GainNode;
  private modulatorInputGain: GainNode;
  private outputGain: GainNode;
  
  // Band processing
  private bands: VocoderBand[] = [];
  private analyser: AnalyserNode;
  
  // Parameters
  private bandCount: number = 16;
  private lowFreq: number = 100;
  private highFreq: number = 8000;
  private attackTime: number = 5;
  private releaseTime: number = 20;
  private qFactor: number = 8;
  
  // Envelope processing
  private envelopeInterval?: ReturnType<typeof setInterval>;
  private envelopeBuffer!: Float32Array<ArrayBuffer>;
  
  // Animation frame for UI
  private raf?: number;
  private lastEmit: number = 0;
  private emitMs: number = 50;

  // Named input handles for AudioGraphManager connection routing
  public connectHandleNames: string[] = ['carrier', 'modulator', 'main-input'];

  constructor(
    audioContext: AudioContext,
    eventBus: EventBus,
    node: CustomNode & VocoderFlowNodeProps
  ) {
    // Create carrier input gain as the main audio node
    const carrierInputGain = audioContext.createGain();
    super(audioContext, carrierInputGain, eventBus, node);

    this.carrierInputGain = carrierInputGain;
    this.modulatorInputGain = audioContext.createGain();
    this.outputGain = audioContext.createGain();
    
    // Analyser for output visualization
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.7;
    
    // Buffer for envelope analysis
    this.envelopeBuffer = new Float32Array(128) as Float32Array<ArrayBuffer>;

    // Initialize parameters from node data
    const data = node.data;
    this.bandCount = data?.bandCount ?? 16;
    this.lowFreq = data?.lowFreq ?? 100;
    this.highFreq = data?.highFreq ?? 8000;
    this.attackTime = data?.attackTime ?? 5;
    this.releaseTime = data?.releaseTime ?? 20;
    this.qFactor = data?.qFactor ?? 8;

    // Set initial gains
    this.carrierInputGain.gain.value = data?.carrierGain ?? 1;
    this.modulatorInputGain.gain.value = data?.modulatorGain ?? 1;
    this.outputGain.gain.value = data?.outputGain ?? 1;

    // Build the vocoder
    this.buildVocoder();
    
    // Start envelope following
    this.startEnvelopeFollowing();
    
    // Subscribe to parameter updates
    this.subscribeVocoderParams();
    
    // Start visualization loop
    this.startVisualizationLoop();
  }

  /**
   * Build the vocoder filter bank
   */
  private buildVocoder() {
    // Clean up existing bands
    this.stopEnvelopeFollowing();
    this.disconnectBands();
    this.bands = [];

    if (!this.audioContext) return;

    // Calculate logarithmically spaced frequencies
    const frequencies = this.calculateBandFrequencies();
    
    console.log(`[Vocoder] Building vocoder with ${this.bandCount} bands, Q=${this.qFactor}, range=${this.lowFreq}-${this.highFreq}Hz`);
    console.log(`[Vocoder] Band frequencies: ${frequencies.map(f => Math.round(f)).join(', ')}`);
    
    // Create filter bands
    for (let i = 0; i < this.bandCount; i++) {
      const freq = frequencies[i];
      const band = this.createBand(freq);
      this.bands.push(band);
    }

    // Connect the routing
    this.connectBands();
  }

  /**
   * Calculate logarithmically spaced band center frequencies
   */
  private calculateBandFrequencies(): number[] {
    const frequencies: number[] = [];
    const logLow = Math.log10(this.lowFreq);
    const logHigh = Math.log10(this.highFreq);
    const logStep = (logHigh - logLow) / this.bandCount;
    
    for (let i = 0; i < this.bandCount; i++) {
      const logFreq = logLow + (i + 0.5) * logStep;
      frequencies.push(Math.pow(10, logFreq));
    }
    
    return frequencies;
  }

  /**
   * Create a single vocoder band
   */
  private createBand(frequency: number): VocoderBand {
    const ctx = this.audioContext!;
    
    // === CARRIER PATH ===
    // Bandpass filter to extract frequency band from carrier (synth)
    const carrierFilter = ctx.createBiquadFilter();
    carrierFilter.type = 'bandpass';
    carrierFilter.frequency.value = frequency;
    carrierFilter.Q.value = this.qFactor;
    
    // === MODULATOR PATH ===
    // Bandpass filter to extract frequency band from modulator (voice)
    const modulatorFilter = ctx.createBiquadFilter();
    modulatorFilter.type = 'bandpass';
    modulatorFilter.frequency.value = frequency;
    modulatorFilter.Q.value = this.qFactor;
    
    // Analyser to measure the envelope of this modulator band
    const modulatorAnalyser = ctx.createAnalyser();
    modulatorAnalyser.fftSize = 256;
    modulatorAnalyser.smoothingTimeConstant = 0.5;
    
    // === VCA (Voltage Controlled Amplifier) ===
    // This gain node controls how much of the carrier band passes through
    // Its gain is modulated by the modulator's envelope
    const vca = ctx.createGain();
    vca.gain.value = 0; // Start silent, envelope will control this
    
    return {
      carrierFilter,
      modulatorFilter,
      modulatorAnalyser,
      vca,
      frequency,
      envelopeValue: 0
    };
  }

  /**
   * Connect all the bands in the vocoder
   */
  private connectBands() {
    if (!this.audioContext) return;
    
    for (const band of this.bands) {
      // === CARRIER CHAIN ===
      // carrier input -> bandpass filter -> VCA -> output mixer
      this.carrierInputGain.connect(band.carrierFilter);
      band.carrierFilter.connect(band.vca);
      band.vca.connect(this.outputGain);
      
      // === MODULATOR CHAIN ===
      // modulator input -> bandpass filter -> analyser (for envelope extraction)
      this.modulatorInputGain.connect(band.modulatorFilter);
      band.modulatorFilter.connect(band.modulatorAnalyser);
    }
    
    // Connect output to main analyser for visualization
    this.outputGain.connect(this.analyser);
  }

  /**
   * Start the envelope following process
   * This reads envelope levels from analysers and applies them to VCAs
   */
  private startEnvelopeFollowing() {
    this.stopEnvelopeFollowing();
    
    if (!this.audioContext) return;
    
    // Update at ~120Hz for responsive envelope following
    const updateIntervalMs = 8;
    let debugCounter = 0;
    
    this.envelopeInterval = setInterval(() => {
      if (!this.audioContext || this.audioContext.state !== 'running') return;
      
      const now = this.audioContext.currentTime;
      // Faster coefficients for more responsive envelope
      const attackCoef = Math.exp(-updateIntervalMs / this.attackTime);
      const releaseCoef = Math.exp(-updateIntervalMs / this.releaseTime);
      
      let maxEnvelope = 0;
      let maxRms = 0;
      
      for (const band of this.bands) {
        // Get time-domain data from the modulator band
        band.modulatorAnalyser.getFloatTimeDomainData(this.envelopeBuffer);
        
        // Calculate both RMS and peak for better envelope detection
        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < this.envelopeBuffer.length; i++) {
          const sample = this.envelopeBuffer[i];
          sumSquares += sample * sample;
          const absSample = Math.abs(sample);
          if (absSample > peak) peak = absSample;
        }
        const rms = Math.sqrt(sumSquares / this.envelopeBuffer.length);
        
        if (rms > maxRms) maxRms = rms;
        
        // Use a mix of RMS and peak for better transient response
        // Peak helps catch consonants, RMS gives smoother envelope
        const mixedLevel = (rms * 0.6 + peak * 0.4);
        
        // Boost significantly - voice through bandpass filters is very quiet
        // The boost factor of 20-30 is typical for vocoders
        const targetEnvelope = Math.min(1, mixedLevel * 25);
        
        // Apply attack/release envelope smoothing
        const currentEnvelope = band.envelopeValue;
        let newEnvelope: number;
        
        if (targetEnvelope > currentEnvelope) {
          // Attack: fast rise
          newEnvelope = currentEnvelope + (targetEnvelope - currentEnvelope) * (1 - attackCoef);
        } else {
          // Release: slower decay
          newEnvelope = currentEnvelope + (targetEnvelope - currentEnvelope) * (1 - releaseCoef);
        }
        
        band.envelopeValue = newEnvelope;
        if (newEnvelope > maxEnvelope) maxEnvelope = newEnvelope;
        
        // Apply envelope to VCA with smooth transition
        const rampTime = updateIntervalMs / 1000;
        band.vca.gain.setTargetAtTime(newEnvelope, now, rampTime / 3);
      }
      
      // Debug log every ~500ms
      debugCounter++;
      if (debugCounter % 60 === 0) {
        // Show envelope distribution across bands
        const bandValues = this.bands.map(b => b.envelopeValue.toFixed(2)).join(', ');
        console.log(`[Vocoder] maxRms: ${maxRms.toFixed(6)}, maxEnvelope: ${maxEnvelope.toFixed(4)}`);
        console.log(`[Vocoder] Band envelopes: [${bandValues}]`);
      }
    }, updateIntervalMs);
  }

  /**
   * Stop the envelope following process
   */
  private stopEnvelopeFollowing() {
    if (this.envelopeInterval) {
      clearInterval(this.envelopeInterval);
      this.envelopeInterval = undefined;
    }
  }

  /**
   * Disconnect all bands
   */
  private disconnectBands() {
    for (const band of this.bands) {
      try { band.carrierFilter.disconnect(); } catch {}
      try { band.modulatorFilter.disconnect(); } catch {}
      try { band.modulatorAnalyser.disconnect(); } catch {}
      try { band.vca.disconnect(); } catch {}
    }
    try { this.carrierInputGain.disconnect(); } catch {}
    try { this.modulatorInputGain.disconnect(); } catch {}
    try { this.outputGain.disconnect(); } catch {}
  }

  /**
   * Subscribe to parameter updates from UI
   */
  private subscribeVocoderParams() {
    this.eventBus.subscribe(`${this.node.id}.vocoder.setParams`, (data: any) => {
      this.handleParamUpdate(data);
    });
  }

  /**
   * Handle parameter updates
   */
  private handleParamUpdate(data: any) {
    let needsRebuild = false;
    
    if (data.bandCount !== undefined && data.bandCount !== this.bandCount) {
      this.bandCount = Math.max(4, Math.min(32, Math.round(data.bandCount)));
      needsRebuild = true;
    }
    
    if (data.lowFreq !== undefined && data.lowFreq !== this.lowFreq) {
      this.lowFreq = Math.max(20, Math.min(this.highFreq - 100, data.lowFreq));
      needsRebuild = true;
    }
    
    if (data.highFreq !== undefined && data.highFreq !== this.highFreq) {
      this.highFreq = Math.max(this.lowFreq + 100, Math.min(20000, data.highFreq));
      needsRebuild = true;
    }
    
    if (data.qFactor !== undefined && data.qFactor !== this.qFactor) {
      this.qFactor = Math.max(1, Math.min(20, data.qFactor));
      // Update existing filter Q values without rebuild
      for (const band of this.bands) {
        band.carrierFilter.Q.value = this.qFactor;
        band.modulatorFilter.Q.value = this.qFactor;
      }
    }
    
    if (data.attackTime !== undefined) {
      this.attackTime = Math.max(0.5, Math.min(100, data.attackTime));
    }
    
    if (data.releaseTime !== undefined) {
      this.releaseTime = Math.max(1, Math.min(200, data.releaseTime));
    }
    
    if (data.carrierGain !== undefined) {
      this.carrierInputGain.gain.value = Math.max(0, Math.min(2, data.carrierGain));
    }
    
    if (data.modulatorGain !== undefined) {
      this.modulatorInputGain.gain.value = Math.max(0, Math.min(2, data.modulatorGain));
    }
    
    if (data.outputGain !== undefined) {
      this.outputGain.gain.value = Math.max(0, Math.min(2, data.outputGain));
    }
    
    if (needsRebuild) {
      this.buildVocoder();
      this.startEnvelopeFollowing();
    }
  }

  /**
   * Start visualization loop
   */
  private startVisualizationLoop() {
    if (typeof window === 'undefined') return;
    
    const loop = () => {
      this.raf = window.requestAnimationFrame(loop);
      
      const now = performance.now();
      if (now - this.lastEmit < this.emitMs) return;
      this.lastEmit = now;
      
      // Get band levels for visualization (envelope values)
      const bandLevels = this.bands.map(band => band.envelopeValue);
      
      this.eventBus.emit(`${this.node.id}.vocoder.spectrum`, {
        bands: bandLevels,
        timestamp: now
      });
    };
    
    loop();
  }

  /**
   * Get the modulator input node (for external connections)
   */
  public getModulatorInput(): AudioNode {
    return this.modulatorInputGain;
  }

  /**
   * Get carrier input (main audioNode)
   */
  public getCarrierInput(): AudioNode {
    return this.carrierInputGain;
  }

  /**
   * Connect to a named input handle (carrier or modulator)
   * This method is called by AudioGraphManager for routing
   */
  public connectToInput(source: AudioNode, handleName: string): void {
    console.log(`[VirtualVocoderNode] connectToInput called with handle: ${handleName}`);
    if (handleName === 'carrier' || handleName === 'main-input') {
      console.log('[VirtualVocoderNode] Connecting to CARRIER input');
      source.connect(this.carrierInputGain);
    } else if (handleName === 'modulator') {
      console.log('[VirtualVocoderNode] Connecting to MODULATOR input');
      source.connect(this.modulatorInputGain);
    } else {
      console.warn(`[VirtualVocoderNode] Unknown handle: ${handleName}, defaulting to carrier`);
      source.connect(this.carrierInputGain);
    }
  }

  /**
   * Override getOutputNode for downstream connections
   */
  public getOutputNode(): AudioNode | undefined {
    return this.outputGain;
  }

  /**
   * Render/update vocoder with new settings
   */
  render(settings?: {
    bandCount?: number;
    lowFreq?: number;
    highFreq?: number;
    attackTime?: number;
    releaseTime?: number;
    qFactor?: number;
    carrierGain?: number;
    modulatorGain?: number;
    outputGain?: number;
  }) {
    if (settings) {
      this.handleParamUpdate(settings);
    }
  }

  /**
   * Cleanup
   */
  disconnect() {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = undefined;
    }
    
    this.stopEnvelopeFollowing();
    
    this.eventBus.unsubscribe(
      `${this.node.id}.vocoder.setParams`,
      this.handleParamUpdate.bind(this)
    );
    
    this.disconnectBands();
    
    try { this.analyser.disconnect(); } catch {}
    
    super.disconnect();
  }
}

export default VirtualVocoderNode;
