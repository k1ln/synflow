import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import EventManager from "../sys/EventManager";
import { ButtonNodeProps } from "../nodes/ButtonFlowNode";
import { MidiButtonMapping } from "../nodes/MidiButtonFlowNode";
import MidiManager from "../components/MidiManager";

/**
 * VirtualButtonNode is a virtual node for button logic in the audio graph.
 * It does not wrap an AudioNode, but provides event-based triggering.
 */
export class VirtualButtonNode extends VirtualNode<CustomNode & ButtonNodeProps, undefined> {
    eventManager: EventManager;
    oldButton: string | null;
    private midiMapping: MidiButtonMapping | null = null;
    private isLearning: boolean = false;
    private unsubscribeMidi: (() => void) | null = null;

    constructor(
        eventManager: EventManager,
        eventBus: EventBus,
        node: CustomNode & ButtonNodeProps
    ) {
        // Button nodes do not have an AudioNode, so pass undefined
        super(undefined, undefined, eventBus, node);
        this.eventManager = eventManager;
        this.oldButton = this.node.data.assignedKey;
        this.midiMapping = (this.node.data as any).midiMapping || null;
        this.setupMidi();
    }

    render(assignedKey: string | null = null) {
        this.eventManager.removeButtonDownCallback(
            this.oldButton!,
            this.node.id
        );
        this.eventManager.removeButtonUpCallback(
            this.oldButton!,
            this.node.id
        );
        this.eventManager.addButtonDownCallback(
            this.node.data.assignedKey!,
            this.node.id,
            (data) => {
                this.eventBus.emit(this.node.id + ".main-input.sendNodeOn", { nodeid: this.node.id });
            }
        );
        this.eventManager.addButtonUpCallback(
            this.node.data.assignedKey!,
            this.node.id,
            (data) => {
                this.eventBus.emit(this.node.id + ".main-input.sendNodeOff", { nodeid: this.node.id });
            }
        );
        // Param updates (assignedKey / midiMapping) may come via params.updateParams or legacy channel
        this.eventBus.unsubscribeAll(this.node.id + ".updateParams.params");
        this.eventBus.unsubscribeAll(this.node.id + ".params.updateParams");
        
        this.eventBus.subscribe(
            this.node.id + ".updateParams.params",
            (data) => {
                // Support legacy midiLearn trigger inside params payload
                if (data?.midiLearn || data?.data?.midiLearn) this.startMidiLearn();
                this.updateParams(data);
            }
        );
        this.eventBus.subscribe(
            this.node.id + ".params.updateParams",
            (data) => {
                // VirtualButtonNode params update
                this.updateParams(data);
            }
        );
        // Dedicated MIDI learn trigger from UI
        const learnEvent = this.node.id + '.updateParams.midiLearn';
        const learnCb = (data: any) => { if (data?.midiLearn) { this.startMidiLearn(); } };
        this.eventBus.subscribe(learnEvent, learnCb);
    }

    updateParams(payload: any) {
        // Accept shapes: {assignedKey,...} or { data: { assignedKey, midiMapping } }
        const d = payload?.data ? payload.data : payload;
        if (payload.meta?.origin === 'virtual') {
            return;
            // ignore our own echo to prevent loops
            // still update any local-only state if provided
        }
        if (!d) return;
        if (d.midiMapping) {
            this.midiMapping = d.midiMapping;
            (this.node.data as any).midiMapping = d.midiMapping;
        }
    }

    /**
     * Triggers the "sendNodeOn" event for this button node.
     */
    triggerOn() {
        this.eventBus.emit(this.node.id + ".main-input.sendNodeOn", { nodeid: this.node.id });
    }

    /**
     * Triggers the "sendNodeOff" event for this button node.
     */
    triggerOff() {
        this.eventBus.emit(this.node.id + ".main-input.sendNodeOff", { nodeid: this.node.id });
    }

    


    /**
     * Subscribes to "sendNodeOn" and "sendNodeOff" events for this button node.
     * @param onHandler Handler for "sendNodeOn"
     * @param offHandler Handler for "sendNodeOff"
     */
    subscribeOnOff(onHandler: (data: any) => void, offHandler: (data: any) => void) {
        this.eventBus.subscribe(
            this.node.id + ".main-input.sendNodeOn",
            (data) => {
                this.eventBus.emit(this.node.id + ".style.background", { color: "green" });
                onHandler(data);
            }
        );
        this.eventBus.subscribe(
            this.node.id + ".main-input.sendNodeOff",
            (data) => {
                this.eventBus.emit(this.node.id + ".style.background", { color: "#333" });
                offHandler(data);
            }
        );
    }

    private async setupMidi() {
        try {
            const midi = MidiManager.getInstance();
            await midi.ensureAccess();
            if (this.unsubscribeMidi) this.unsubscribeMidi();
            this.unsubscribeMidi = midi.onMessage(({ status, channel, data1, data2 }) => {
                const statusHi = status & 0xF0;
                if (this.isLearning) {
                    if (statusHi === 0x90 && data2 > 0) {
                        this.midiMapping = { type: 'note', channel, number: data1 };
                        this.isLearning = false;
                        // Standard params update for persistence & UI (node scoped + global)
                        this.eventBus.emit(this.node.id + '.params.updateParams', { nodeid: this.node.id, data: { midiMapping: this.midiMapping } });
                        this.eventBus.emit('params.updateParams', { nodeid: this.node.id, data: { midiMapping: this.midiMapping } });
                        return;
                    }
                    if (statusHi === 0xB0) {
                        this.midiMapping = { type: 'cc', channel, number: data1 };
                        this.isLearning = false;
                        this.eventBus.emit(this.node.id + '.params.updateParams', { nodeid: this.node.id, data: { midiMapping: this.midiMapping } });
                        this.eventBus.emit('params.updateParams', { nodeid: this.node.id, data: { midiMapping: this.midiMapping } });
                        return;
                    }
                } else if (this.midiMapping) {
                    if (this.midiMapping.type === 'note') {
                        if (statusHi === 0x90 && channel === this.midiMapping.channel && data1 === this.midiMapping.number) {
                            if (data2 > 0) {
                                this.eventBus.emit(this.node.id + '.main-input.sendNodeOn', { nodeid: this.node.id, source: 'midi' });
                            } else {
                                this.eventBus.emit(this.node.id + '.main-input.sendNodeOff', { nodeid: this.node.id, source: 'midi' });
                            }
                        } else if (statusHi === 0x80 && channel === this.midiMapping.channel && data1 === this.midiMapping.number) {
                            this.eventBus.emit(this.node.id + '.main-input.sendNodeOff', { nodeid: this.node.id, source: 'midi' });
                        }
                    } else if (this.midiMapping.type === 'cc') {
                        if (statusHi === 0xB0 && channel === this.midiMapping.channel && data1 === this.midiMapping.number) {
                            if (data2 > 0) {
                                this.eventBus.emit(this.node.id + '.main-input.sendNodeOn', { nodeid: this.node.id, source: 'midi', value: data2 });
                            } else {
                                this.eventBus.emit(this.node.id + '.main-input.sendNodeOff', { nodeid: this.node.id, source: 'midi' });
                            }
                        }
                    }
                }
            });
        } catch (e) { /* ignore */ }
    }

    private startMidiLearn() {
        if (this.isLearning) return;
        this.isLearning = true;
        this.eventBus.emit(this.node.id + '.style.background', { color: '#7a5b00' });
        setTimeout(() => { if (this.isLearning) { this.isLearning = false; this.eventBus.emit(this.node.id + '.style.background', { color: '#333' }); } }, 10000);
    }
}

export default VirtualButtonNode;