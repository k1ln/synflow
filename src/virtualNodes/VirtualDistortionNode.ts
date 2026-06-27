import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";

export class VirtualDistortionNode extends VirtualNode<CustomNode> {
    constructor(audioContext: AudioContext, eventBus: EventBus, node: CustomNode) {
        super(
            audioContext,
            audioContext.createWaveShaper(),
            eventBus,
            node
        );
    }

    render(curve: Float32Array | null = null, oversample: OverSampleType = "none") {
        if (this.audioNode) {
            this.audioNode.curve = curve;
            this.audioNode.oversample = oversample;
        }
    }

    private parseCurve(value: unknown): Float32Array | null {
        if (!value && value !== 0) return null;
        if (value instanceof Float32Array) return value;
        if (Array.isArray(value)) {
            const floats = value.map(Number).filter((num) => Number.isFinite(num));
            return new Float32Array(floats);
        }
        if (typeof value === "string") {
            const parts = value.split(',').map((token) => Number(token.trim()));
            const floats = parts.filter((num) => Number.isFinite(num));
            if (floats.length === 0) return null;
            return new Float32Array(floats);
        }
        return null;
    }

    handleUpdateParams(node: CustomNode, payload: any) {
        if (!payload || typeof payload.data !== "object") {
            return;
        }

        const updatesForSuper = { ...payload.data } as Record<string, unknown>;
        let curveString: string | undefined;

        if ("curve" in updatesForSuper) {
            const rawCurve = updatesForSuper.curve;
            const parsed = this.parseCurve(rawCurve);
            if (this.audioNode) {
                this.audioNode.curve = parsed;
            }
            if (typeof rawCurve === "string") {
                curveString = rawCurve;
            }
            delete updatesForSuper.curve;
        }

        // Let the base class persist scalar params (drive, oversample, etc.).
        super.handleUpdateParams(node, { ...payload, data: updatesForSuper });

        if (!node.data) {
            node.data = {} as any;
        }

        if (curveString !== undefined) {
            (node.data as any).curve = curveString;
        }

        if (payload.data && Object.prototype.hasOwnProperty.call(payload.data, "drive")) {
            (node.data as any).drive = payload.data.drive;
        }

        if (payload.data && Object.prototype.hasOwnProperty.call(payload.data, "driveKnob")) {
            (node.data as any).driveKnob = payload.data.driveKnob;
        }
    }
}

export default VirtualDistortionNode;