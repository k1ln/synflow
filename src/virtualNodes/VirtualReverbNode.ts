import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import { ReverbFlowNodeProps } from "../nodes/ReverbFlowNode";

const DEFAULT_SECONDS = 3;
const DEFAULT_DECAY = 2;
const MAX_SECONDS = 50;
const MIN_SECONDS = 0.1;
const MAX_DECAY = 100;
const MIN_DECAY = 0.01;
const DEFAULT_FORMULA = "(Math.random() * 2 - 1) * Math.pow(1 - n / length, decay)";

export class VirtualReverbNode extends VirtualNode<CustomNode & ReverbFlowNodeProps> {
    private compiledFormula: ((n: number, length: number, decay: number, channel: number, reverse: boolean) => number) | null = null;
    private cachedFormulaSource: string | null = null;

    constructor(audioContext: AudioContext, eventBus: EventBus, node: CustomNode & ReverbFlowNodeProps) {
        super(audioContext, audioContext.createConvolver(), eventBus, node);
    }

    handleUpdateParams(node: CustomNode & ReverbFlowNodeProps, payload: any) {
        if (!payload || !payload.data) return;
        const data = node.data;
        let shouldRebuild = false;
        Object.keys(payload.data).forEach((key) => {
            const value = payload.data[key];
            switch (key) {
                case "seconds":
                    data.seconds = this.normalizeSeconds(value);
                    shouldRebuild = true;
                    break;
                case "decay":
                    data.decay = this.normalizeDecay(value);
                    shouldRebuild = true;
                    break;
                case "reverse":
                    data.reverse = !!value;
                    shouldRebuild = true;
                    break;
                case "formula":
                    if (typeof value === "string") {
                        data.formula = value;
                        this.cachedFormulaSource = null;
                        this.compiledFormula = null;
                        shouldRebuild = true;
                    }
                    break;
                default:
                    super.handleUpdateParams(node, { data: { [key]: value } });
            }
        });
        if (shouldRebuild) {
            this.rebuildImpulse();
        }
    }

    render(
        seconds: number = DEFAULT_SECONDS,
        decay: number = DEFAULT_DECAY,
        reverse: boolean = false,
        formula?: string
    ) {
        const data = this.node?.data;
        if (data) {
            data.seconds = this.normalizeSeconds(data.seconds ?? seconds);
            data.decay = this.normalizeDecay(data.decay ?? decay);
            data.reverse = data.reverse ?? reverse;
            data.formula = typeof data.formula === "string" && data.formula.trim().length > 0 ? data.formula : (formula ?? DEFAULT_FORMULA);
        }
        this.rebuildImpulse();
    }

    private rebuildImpulse() {
        if (!this.audioNode) return;
        const ctx = this.audioContext;
        if (!ctx) return;
        const convolver = this.audioNode as unknown as ConvolverNode;
        const data = this.node?.data ?? {};
        const seconds = this.normalizeSeconds((data as any).seconds ?? DEFAULT_SECONDS);
        const decay = this.normalizeDecay((data as any).decay ?? DEFAULT_DECAY);
        const reverse = !!((data as any).reverse ?? false);
        const formula = typeof (data as any).formula === "string" && (data as any).formula.trim().length > 0
            ? (data as any).formula
            : DEFAULT_FORMULA;

        const rate = ctx.sampleRate;
        const length = Math.max(1, Math.floor(rate * seconds));
        const impulse = ctx.createBuffer(2, length, rate);
        const formulaFn = this.getFormulaFunction(formula);

        for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                const n = reverse ? length - i : i;
                let sample = 0;
                try {
                    sample = formulaFn(n, length, decay, channel, reverse);
                } catch (err) {
                    console.warn("[VirtualReverbNode] Custom formula threw", err);
                    sample = this.defaultSample(n, length, decay);
                }
                channelData[i] = sample;
            }
        }

        try {
            convolver.buffer = impulse;
        } catch (err) {
            console.warn("[VirtualReverbNode] Failed to assign impulse buffer", err);
        }
    }

    private normalizeSeconds(value: any): number {
        const num = typeof value === "number" ? value : parseFloat(value);
        if (!Number.isFinite(num)) return DEFAULT_SECONDS;
        return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, num));
    }

    private normalizeDecay(value: any): number {
        const num = typeof value === "number" ? value : parseFloat(value);
        if (!Number.isFinite(num)) return DEFAULT_DECAY;
        return Math.min(MAX_DECAY, Math.max(MIN_DECAY, num));
    }

    private defaultSample(n: number, length: number, decay: number): number {
        return (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
    }

    private getFormulaFunction(formulaSource: string) {
        if (formulaSource === this.cachedFormulaSource && this.compiledFormula) {
            return this.compiledFormula;
        }

        let compiled: ((n: number, length: number, decay: number, channel: number, reverse: boolean) => number) | null = null;
        try {
            const body = `return (${formulaSource});`;
            const fn = new Function("n", "length", "decay", "channel", "reverse", "Math", body) as (
                n: number,
                length: number,
                decay: number,
                channel: number,
                reverse: boolean,
                math: Math
            ) => number;
            compiled = (n, length, decay, channel, reverse) => {
                const result = fn(n, length, decay, channel, reverse, Math);
                return typeof result === "number" && Number.isFinite(result)
                    ? result
                    : this.defaultSample(n, length, decay);
            };
            this.cachedFormulaSource = formulaSource;
            this.compiledFormula = compiled;
        } catch (err) {
            console.warn("[VirtualReverbNode] Failed to compile custom formula", err);
            this.cachedFormulaSource = null;
            this.compiledFormula = null;
        }

        return compiled || this.defaultSample.bind(this);
    }
}

export default VirtualReverbNode;
