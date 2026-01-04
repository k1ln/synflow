import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import VirtualNode from "./VirtualNode";

type EQBand = {
  id: number;
  frequency: number;
  gain: number;
  Q: number;
  type: BiquadFilterType;
};

type EqualizerConfig = {
  bands?: EQBand[];
};

const DEFAULT_BANDS: EQBand[] = [
  {
    id: 0,
    frequency: 60,
    gain: 0,
    Q: 1,
    type: "lowshelf",
  },
  {
    id: 1,
    frequency: 250,
    gain: 0,
    Q: 1,
    type: "peaking",
  },
  {
    id: 2,
    frequency: 1000,
    gain: 0,
    Q: 1,
    type: "peaking",
  },
  {
    id: 3,
    frequency: 4000,
    gain: 0,
    Q: 1,
    type: "peaking",
  },
  {
    id: 4,
    frequency: 12000,
    gain: 0,
    Q: 1,
    type: "highshelf",
  },
];

const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const RESPONSE_POINTS = 256;

class VirtualEqualizerNode extends VirtualNode<CustomNode> {
  private inputGain: GainNode;
  private outputGain: GainNode;
  private analyser: AnalyserNode;
  private filters: BiquadFilterNode[] = [];
  private bands: EQBand[] = [];
  private freq: Uint8Array;
  private wave: Uint8Array;
  private raf?: number;
  private lastEmit = 0;
  private emitMs = 33;
  private responseFreqs: Float32Array;
  private responseMag: Float32Array;
  private responsePhase: Float32Array;

  constructor(
    ctx: AudioContext,
    bus: EventBus,
    node: CustomNode,
  ) {
    const inputGain = ctx.createGain();
    super(ctx, inputGain, bus, node);

    this.inputGain = inputGain;
    this.outputGain = ctx.createGain();
    this.analyser = ctx.createAnalyser();

    // Set up analyzer
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    this.freq = new Uint8Array(
      this.analyser.frequencyBinCount,
    );
    this.wave = new Uint8Array(this.analyser.fftSize);

    // Pre-allocate response arrays
    this.responseFreqs = new Float32Array(RESPONSE_POINTS);
    this.responseMag = new Float32Array(RESPONSE_POINTS);
    this.responsePhase = new Float32Array(RESPONSE_POINTS);

    // Generate logarithmic frequency points
    for (let i = 0; i < RESPONSE_POINTS; i++) {
      const ratio = i / (RESPONSE_POINTS - 1);
      this.responseFreqs[i] =
        FREQ_MIN *
        Math.pow(FREQ_MAX / FREQ_MIN, ratio);
    }

    // Initialize bands from node data or defaults
    const cfg = node.data as EqualizerConfig;
    this.bands = cfg?.bands?.length
      ? [...cfg.bands]
      : [...DEFAULT_BANDS];

    // Build filter chain
    this.buildFilterChain();

    // Subscribe to band updates from UI
    this.eventBus.subscribe(
      `${node.id}.equalizer.setBands`,
      this.handleSetBands.bind(this),
    );

    // Start analysis loop
    this.startLoop();
  }

  private buildFilterChain() {
    // Disconnect existing filters
    this.disconnectFilters();

    // Create new filters for each band
    this.filters = this.bands.map((band) => {
      const filter =
        this.audioContext!.createBiquadFilter();
      this.applyBandToFilter(filter, band);
      return filter;
    });

    // Chain: inputGain -> filters -> analyser -> outputGain
    let prev: AudioNode = this.inputGain;
    this.filters.forEach((filter) => {
      prev.connect(filter);
      prev = filter;
    });
    prev.connect(this.analyser);
    this.analyser.connect(this.outputGain);

    // Use outputGain as the source for downstream connections
    this.audioNode = this.inputGain;
  }

  private disconnectFilters() {
    try {
      this.inputGain.disconnect();
    } catch {
      // ignore
    }
    this.filters.forEach((f) => {
      try {
        f.disconnect();
      } catch {
        // ignore
      }
    });
    try {
      this.analyser.disconnect();
    } catch {
      // ignore
    }
  }

  private applyBandToFilter(
    filter: BiquadFilterNode,
    band: EQBand,
  ) {
    filter.type = band.type;
    filter.frequency.value = band.frequency;
    filter.gain.value = band.gain;
    filter.Q.value = band.Q;
  }

  private handleSetBands(data: { bands: EQBand[] }) {
    if (!data?.bands?.length) return;

    // Check if band count changed
    const countChanged =
      data.bands.length !== this.bands.length;

    this.bands = [...data.bands];

    if (countChanged) {
      // Rebuild chain if band count changed
      this.buildFilterChain();
    } else {
      // Update existing filters
      this.filters.forEach((filter, idx) => {
        if (this.bands[idx]) {
          this.applyBandToFilter(filter, this.bands[idx]);
        }
      });
    }
  }

  private computeResponse(): Float32Array {
    const combinedResponse = new Float32Array(
      RESPONSE_POINTS,
    );
    combinedResponse.fill(0);

    // Sum up responses from all filters (in dB)
    this.filters.forEach((filter) => {
      filter.getFrequencyResponse(
        this.responseFreqs,
        this.responseMag,
        this.responsePhase,
      );
      for (let i = 0; i < RESPONSE_POINTS; i++) {
        // Convert magnitude to dB and add
        const dB = 20 * Math.log10(
          Math.max(0.0001, this.responseMag[i]),
        );
        combinedResponse[i] += dB;
      }
    });

    return combinedResponse;
  }

  private startLoop() {
    if (typeof window === "undefined") return;

    const loop = () => {
      this.raf = window.requestAnimationFrame(loop);
      if (!this.analyser) return;

      // Get frequency data
      this.analyser.getByteFrequencyData(this.freq);
      this.analyser.getByteTimeDomainData(this.wave);

      // Throttle emission
      const now = performance.now();
      if (now - this.lastEmit < this.emitMs) return;
      this.lastEmit = now;

      // Compute combined frequency response
      const response = this.computeResponse();

      // Emit data to UI
      this.eventBus.emit(
        `${this.node.id}.equalizer.data`,
        {
          freq: Array.from(this.freq),
          wave: Array.from(this.wave),
          response: Array.from(response),
          bands: this.bands,
          timestamp: now,
        },
      );
    };

    loop();
  }

  render(settings?: Partial<EqualizerConfig>) {
    if (settings?.bands?.length) {
      this.handleSetBands({ bands: settings.bands });
    }
  }

  /**
   * Override getOutputNode to route audio
   * through the filter chain
   */
  public getOutputNode(): AudioNode | undefined {
    return this.outputGain;
  }

  disconnect() {
    // Stop animation loop
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = undefined;
    }

    // Unsubscribe from events
    this.eventBus.unsubscribe(
      `${this.node.id}.equalizer.setBands`,
      this.handleSetBands.bind(this),
    );

    // Disconnect all audio nodes
    this.disconnectFilters();
    try {
      this.outputGain.disconnect();
    } catch {
      // ignore
    }

    super.disconnect();
  }
}

export default VirtualEqualizerNode;
