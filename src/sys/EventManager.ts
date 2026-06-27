import EventBus from "./EventBus";
import { AudioGraphManager } from "./AudioGraphManager";

export default class EventManager {
    private btnAndCallbacksDown: Record<string, { [nodeId: string]: (...args: unknown[]) => void }>;
    private btnAndCallbacksUp: Record<string, { [nodeId: string]: (...args: unknown[]) => void }>;
    private handleDelete: () => void = () => { };
    public static instance: EventManager;

    constructor(
         // Replace 'any' with the actual type of your event bus
    ) {
        // Initializing EventManager
        this.initializeEventListeners();
        this.btnAndCallbacksDown = {};
        this.btnAndCallbacksUp = {};
    }

    public static getInstance(): EventManager {
        if (!EventManager.instance) {
            EventManager.instance = new EventManager();
        }
        return EventManager.instance;
    }

    initializeEventListeners() {
        // Initialize event listeners here
        window.removeEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.addEventListener('keyup', this.handleKeyUp);
    }
    sethandleDelete(callback: () => void) {
        this.handleDelete = callback;
    }

    handleKeyUp = (event: KeyboardEvent) => {
        const key = event.key.toUpperCase();
        const callbacks = this.btnAndCallbacksUp[key];
        if (callbacks !== undefined) {
            Object.keys(callbacks).forEach(nodeId => callbacks[nodeId](event));
        }
    }

    handleKeyDown = (event: KeyboardEvent) => {
        // Handle key down events
        //console.log("Key down event:", event);
        const key = event.key.toUpperCase();
        if (key === "DELETE") {
            this.handleDelete()
        }
        if (event.repeat) {
            return; // Prevent spamming by ignoring repeated keydown events
        }
        //console.log(JSON.stringify(this.btnAndCallbacksDown));
        const callbacks = this.btnAndCallbacksDown[key];
        //console.log("Callbacks for key:", key, "callbacks:", callbacks);
        if (callbacks !== undefined) {
            Object.keys(callbacks).forEach(nodeId => {
                //console.log(`Invoking callback for nodeId: ${nodeId}: ${callbacks[nodeId].toString()}`);
                callbacks[nodeId](event);
            });
        }
        //eventBus.emit(node.id + ".main-input.sendNodeOn", { nodeid: node.id });
    }
    addButtonDownCallback(key: string, nodeId:string, callback: (...args: unknown[]) => void) {
        if (this.btnAndCallbacksDown[key]==undefined) {
            this.btnAndCallbacksDown[key] = {};
        }
        this.btnAndCallbacksDown[key][nodeId] = callback;
    }
    addButtonUpCallback(key: string, nodeId:string, callback: (...args: unknown[]) => void) {
        if (this.btnAndCallbacksUp[key]==undefined) {   
            this.btnAndCallbacksUp[key] = {};
        }    
        this.btnAndCallbacksUp[key][nodeId] = callback;
    }
    removeButtonDownCallback(key: string, nodeid:string) {
        if (this.btnAndCallbacksDown[key]) {
            delete this.btnAndCallbacksDown[key][nodeid];
        }
    }
    removeButtonUpCallback(key: string, nodeid:string) {
        if (this.btnAndCallbacksUp[key]) {
            delete this.btnAndCallbacksUp[key][nodeid];
        }
    }
    clearButtonCallbacks() {
        Object.keys(this.btnAndCallbacksDown).forEach(
            key => delete this.btnAndCallbacksDown[key]
        );
        this.btnAndCallbacksDown = {};
        Object.keys(this.btnAndCallbacksUp).forEach(
            key => delete this.btnAndCallbacksUp[key]
        );
        this.btnAndCallbacksUp = {};
    }
    setHandleDelete(callback: () => void) {
        this.handleDelete = callback;
    }   
}