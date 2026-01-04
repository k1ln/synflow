import VirtualNode from "./VirtualNode";
import { CustomNode } from "../sys/AudioGraphManager";
import EventBus from "../sys/EventBus";
import { AudioWorkletFlowNodeProps } from "../nodes/AudioWorkletFlowNode";

export class VirtualAudioWorkletNode extends VirtualNode<CustomNode & AudioWorkletFlowNodeProps, AudioWorkletNode | undefined> {
    private _currentProcessorName: string;
    private _reconnectTargets: (AudioNode | AudioParam)[] = [];
    private _moduleCounter = 0;
    // Resolves once the bootstrap processor has been registered and the initial AudioWorkletNode created
    private _lastError: string | null = null;
    private _debug = false;
    // If true we will inject a small DC-removed sine tone (for debugging silence when no upstream input)
    private _injectTestTone = false;
    private _pendingConnections: (AudioNode | AudioParam)[] = [];
    private _pendingParamConnections: { source: AudioNode; paramId: string }[] = [];
    private _activeParamConnections: { source: AudioNode; paramId: string }[] = [];
    private _pendingFlowMessages: { id?: string; name: string; value: number }[] = [];
    // Guard to avoid concurrent createWorklet races
    private _creatingPromise: Promise<void> | null = null;

    constructor(
        audioContext: AudioContext,
        eventBus: EventBus,
        node: CustomNode & AudioWorkletFlowNodeProps,
        initialProcessorName: string = 'dynamic-worklet-processor'
    ) {
        super(audioContext, undefined, eventBus, node);
        this._currentProcessorName = initialProcessorName;
        // minimal placeholder processor to start (will be replaced by save events)
        // Kick off bootstrap load and creation; store promise so caller can await readiness before wiring edges

        this.subscribeToCodeSaves();
        this.subscribeToParamUpdates();
        this.subscribeToParamDescriptorChanges();
        // Eager bootstrap so the base processor is registered early
        this.createWorklet().catch(e => {
            if (this._debug) console.error('[VirtualAudioWorkletNode] initial createWorklet failed', e);
        });
    }

    public async createWorklet() {
        if (this.audioNode) return; // already created
        if (this._creatingPromise) return this._creatingPromise; // creation in flight

        this._creatingPromise = (async () => {
            let userCode = this.node.data.processorCode || '';
            if (!userCode.trim()) {
                userCode = `class ExtendAudioWorkletProcessor extends AudioWorkletProcessor {\n  process(inputs, outputs) {\n    if (inputs && inputs[0] && outputs && outputs[0]) {\n      const input = inputs[0];\n      const output = outputs[0];\n      for (let ch = 0; ch < input.length; ch++) {\n        output[ch].set(input[ch]);\n      }\n    }\n    return true;\n  }\n}`;
            }
            const wrapped = this.wrapUserCode(userCode, this._currentProcessorName, (this.node.data as any).params);
            try {
                await this.installModule(wrapped, this._currentProcessorName);
                // Retry a few times because some browsers have slight lag after addModule
                let created = false;
                for (let attempt = 0; attempt < 3 && !created; attempt++) {
                    try {
                        this.audioNode = new AudioWorkletNode(this.audioContext!, this._currentProcessorName);
                        this.startPort(this.audioNode);
                        created = true;
                    } catch (err) {
                        if (attempt === 2) throw err;
                        await new Promise(r => setTimeout(r, 10 * (attempt + 1)));
                    }
                }
                if (created) {
                    this.attachProcessorErrorHandler();
                    const params = (this.node.data as any).params;
                    if (Array.isArray(params) && params.length) this.applyParams(params);
                    this.flushPendingConnections();
                    if (this._activeParamConnections.length) {
                        this._pendingParamConnections.push(...this._activeParamConnections);
                        this._activeParamConnections = [];
                    }
                    this.flushPendingParamConnections();
                    this.flushPendingFlowMessages();
                }
            } catch (e: any) {
                this._lastError = e?.message || String(e);
                if (this._debug) console.error('[VirtualAudioWorkletNode] createWorklet failed', e, { code: userCode });
                this.eventBus.emit(this.node.id + '.processor.error', { error: this._lastError });
                throw e;
            }
        })();

        try { await this._creatingPromise; } finally { this._creatingPromise = null; }
    }


    private subscribeToCodeSaves() {
        this.eventBus.subscribe(this.node.id + '.processor.save', (payload: { code: string }) => {
            if (!payload || typeof payload.code !== 'string') return;
            this.updateProcessorFromCode(payload.code);
        });
    }

    // Track connections so we can rewire after recreation
    connect(destination: AudioNode | AudioParam) {
        if (!this.audioNode) {
            this._pendingConnections.push(destination);
            this.createWorklet().then(() => this.flushPendingConnections()).catch(() => {/* ignore */ });
            return;
        }
        super.connect(destination);
        if (!this._reconnectTargets.includes(destination)) this._reconnectTargets.push(destination);
    }

    private async updateProcessorFromCode(code: string) {
        if (!this.audioContext) return;
        // Ensure initial bootstrap finished so audioWorklet scope is valid
        try { await this.createWorklet(); } catch { /* ignore bootstrap failure; attempt anyway */ }
        // Generate unique name so browser loads fresh module
        this._moduleCounter++;
        const newName = `${this._currentProcessorName}-${this._moduleCounter}`;
        const wrapped = this.wrapUserCode(code, newName, (this.node.data as any).params);
        try {
            await this.installModule(wrapped, newName);
            const old = this.audioNode;
            try { old?.disconnect(); } catch (_) { /* ignore */ }
            // attempt instantiation (no retry; user just saved new code so errors should surface immediately)
            this.audioNode = new AudioWorkletNode(this.audioContext, newName);
            this.startPort(this.audioNode);
            this._currentProcessorName = newName;
            this.attachProcessorErrorHandler();
            const params = (this.node.data as any).params;
            if (Array.isArray(params) && params.length) this.applyParams(params);
            this.reconnectDownstream();
            this.flushPendingConnections();
            if (this._activeParamConnections.length) {
                this._pendingParamConnections.push(...this._activeParamConnections);
                this._activeParamConnections = [];
            }
            this.flushPendingParamConnections();
            this.flushPendingFlowMessages();
        } catch (e: any) {
            if (this._debug) console.error('[VirtualAudioWorkletNode] updateProcessor failed', e, { code });
            this._lastError = (e && e.message) ? e.message : String(e);
            this.eventBus.emit(this.node.id + '.processor.error', { error: this._lastError });
        }
    }

    private reconnectDownstream() {
        if (!this.audioNode) return;
        this._reconnectTargets.forEach(t => {
            try {
                if (t instanceof AudioNode) {
                    this.audioNode!.connect(t);
                } else if (t instanceof AudioParam) {
                    this.audioNode!.connect(t as any);
                }
            } catch (e) { console.warn('[VirtualAudioWorkletNode] reconnect failed', e); }
        });
    }

    private wrapUserCode(code: string, processorName: string, params?: any[]) {
        // Remove any existing registerProcessor calls (simple regex; not full parse)
        code = code.replace(/registerProcessor\s*\([\s\S]*?\);?/g, '');
        // Find first class extending AudioWorkletProcessor
        const classMatch = code.match(/class\s+([A-Za-z0-9_]+)\s+extends\s+AudioWorkletProcessor/);
        let className = classMatch ? classMatch[1] : 'ExtendAudioWorkletProcessor';
        if (!classMatch) {
            if (/process\s*\(/.test(code)) {
                code = `class ${className} extends AudioWorkletProcessor {\n${code}\n}\n`;
            } else {
                code = `class ${className} extends AudioWorkletProcessor {\n  process(inputs, outputs, parameters){ return true; }\n}\n` + code;
            }
        }

        const sanitizedName = `__Original_${processorName.replace(/[^A-Za-z0-9_]/g, '_')}`;
        const descriptors = Array.isArray(params) ? params.map((p: any) => {
            if (!p || typeof p.name !== 'string') return null;
            const mode = p.mode === 'flow' ? 'flow' : 'stream';
            if (mode === 'flow') return null;
            const defaultValue = typeof p.value === 'number' ? p.value : Number(p.value) || 0;
            const descriptor: any = { name: p.name, defaultValue, automationRate: 'a-rate' };
            if (typeof p.minValue === 'number') descriptor.minValue = p.minValue;
            if (typeof p.maxValue === 'number') descriptor.maxValue = p.maxValue;
            return descriptor;
        }).filter(Boolean) : [];
        const descriptorJson = JSON.stringify(descriptors, null, 2);

        code += `\nconst ${sanitizedName} = ${className};`;
        code += `\nconst __hostParameterDescriptors = ${descriptorJson};`;
        code += `\nregisterProcessor('${processorName}', class extends ${sanitizedName} {\n  static get parameterDescriptors() {\n    const host = Array.isArray(__hostParameterDescriptors) ? __hostParameterDescriptors : [];\n    let base = [];\n    const own = Object.getOwnPropertyDescriptor(${sanitizedName}, 'parameterDescriptors');\n    if (own && typeof own.get === 'function') {\n      try {\n        const value = own.get.call(this);\n        if (Array.isArray(value)) base = value.slice();\n      } catch (_) { base = []; }\n    } else if (Array.isArray(${sanitizedName}.parameterDescriptors)) {\n      const existing = ${sanitizedName}.parameterDescriptors;\n      base = typeof existing.slice === 'function' ? existing.slice() : Array.from(existing);\n    }\n    if (!host.length) return base;\n    const merged = base.slice();\n    host.forEach((desc) => {\n      if (!desc || typeof desc.name !== 'string') return;\n      if (!merged.some(existing => existing && existing.name === desc.name)) merged.push(desc);\n    });\n    return merged;\n  }\n});`;
        return code;
    }

    async installModule(source: string, name: string) {
        const blob = new Blob([source], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        try {
            await this.audioContext!.audioWorklet.addModule(url);
        } catch (e: any) {
            this._lastError = e?.message || String(e);
            if (this._debug) console.error('[VirtualAudioWorkletNode] addModule failed', e, { name });
            this.eventBus.emit(this.node.id + '.processor.error', { error: this._lastError });
            throw e;
        } finally {
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    }

    // render kept for API symmetry; no-op because creation is handled asynchronously via this.ready
    render(_processorName?: string, _options?: AudioWorkletNodeOptions) {
        // Intentionally empty; callers should await instance.ready before connecting
    }

    private attachProcessorErrorHandler() {
        if (!this.audioNode) return;
        this.audioNode.onprocessorerror = (ev: any) => {
            this._lastError = 'Processor error';
            if (this._debug) console.error('[VirtualAudioWorkletNode] processor runtime error', ev);
            this.eventBus.emit(this.node.id + '.processor.error', { error: this._lastError });
        };
        if (this.audioContext?.state === 'suspended') {
            this.audioContext.resume().catch(() => {/* ignore resume failure */ });
        }
    }

    public enableDebugLogging(enable: boolean) { this._debug = enable; }
    public enableTestTone(enable: boolean) { this._injectTestTone = enable; }
    public getLastError() { return this._lastError; }
    private flushPendingConnections() {
        if (!this.audioNode || this._pendingConnections.length === 0) return;
        const queued = [...this._pendingConnections];
        this._pendingConnections = [];
        queued.forEach(dest => {
            try {
                super.connect(dest);
                if (!this._reconnectTargets.includes(dest)) this._reconnectTargets.push(dest);
            } catch (e) { console.warn('[VirtualAudioWorkletNode] failed flushing pending connection', e); }
        });
    }

    private getStoredParams(): any[] {
        const list = (this.node.data as any)?.params;
        return Array.isArray(list) ? list : [];
    }

    private getParamEntryById(paramId?: string): any | undefined {
        if (!paramId) return undefined;
        const id = String(paramId);
        return this.getStoredParams().find((entry: any) => entry && String(entry.id ?? entry.name ?? '') === id);
    }

    private getParamEntryByName(name?: string): any | undefined {
        if (!name) return undefined;
        return this.getStoredParams().find((entry: any) => entry && entry.name === name);
    }

    private resolveParamMode(entry: any, fallback: 'stream' | 'flow' = 'stream'): 'stream' | 'flow' {
        if (!entry || typeof entry !== 'object') return fallback;
        return entry.mode === 'flow' ? 'flow' : 'stream';
    }

    private lookupAudioParam(name?: string): AudioParam | undefined {
        if (!this.audioNode || !name) return undefined;
        const map: any = this.audioNode.parameters as any;
        if (map && typeof map.get === 'function') {
            const found = map.get(name);
            if (found instanceof AudioParam) return found;
        }
        if (map && name in map) {
            const candidate = map[name];
            if (candidate instanceof AudioParam) return candidate;
        }
        return undefined;
    }

    private clearParamConnectionsFor(paramId?: string, name?: string) {
        if (!paramId && !name) return;
        const resolvedName = name || (paramId ? this.getParameterNameById(paramId) : undefined);
        const audioParam = this.lookupAudioParam(resolvedName);
        const matches = (entry: { paramId: string }) => {
            if (paramId) return entry.paramId === paramId;
            const linkedName = this.getParameterNameById(entry.paramId);
            return !!resolvedName && linkedName === resolvedName;
        };
        this._pendingParamConnections = this._pendingParamConnections.filter(entry => !matches(entry));
        const remaining: { source: AudioNode; paramId: string }[] = [];
        this._activeParamConnections.forEach(entry => {
            if (!matches(entry)) {
                remaining.push(entry);
                return;
            }
            if (audioParam) {
                try { entry.source.disconnect(audioParam); } catch { /* ignore */ }
            } else {
                try { entry.source.disconnect(); } catch { /* ignore */ }
            }
        });
        this._activeParamConnections = remaining;
    }

    private queueFlowMessage(update: { id?: string; name: string; value: number }) {
        if (!update || typeof update.name !== 'string' || !Number.isFinite(update.value)) return;
        this._pendingFlowMessages.push(update);
        this.flushPendingFlowMessages();
    }

    private flushPendingFlowMessages() {
        if (!this.audioNode || !this.audioNode.port || this._pendingFlowMessages.length === 0) return;
        const pending = this._pendingFlowMessages.splice(0);
        const failed: { id?: string; name: string; value: number }[] = [];
        pending.forEach(update => {
            const message = {
                type: 'flow-param-update',
                nodeId: this.node.id,
                name: update.name,
                value: update.value,
                id: update.id,
                timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now()
            };
            try {
                this.audioNode!.port.postMessage(message);
            } catch (e) {
                failed.push(update);
                if (this._debug) console.warn('[VirtualAudioWorkletNode] flow param message failed', e, message);
            }
        });
        if (failed.length) this._pendingFlowMessages.unshift(...failed);
    }

    private startPort(node: AudioWorkletNode | undefined) {
        if (!node || !node.port) return;
        try { node.port.start?.(); } catch { /* ignore */ }
    }

    public getParameterNameById(paramId: string): string | undefined {
        if (!paramId) return undefined;
        const entry = this.getParamEntryById(paramId) || this.getParamEntryByName(paramId);
        return entry && typeof entry.name === 'string' ? entry.name : undefined;
    }

    public getParameterById(paramId: string): AudioParam | undefined {
        if (!paramId) return undefined;
        const entry = this.getParamEntryById(paramId) || this.getParamEntryByName(paramId);
        const mode = this.resolveParamMode(entry);
        if (mode === 'flow') return undefined;
        const name = entry && typeof entry.name === 'string' ? entry.name : this.getParameterNameById(paramId);
        if (!name) return undefined;
        return this.lookupAudioParam(name);
    }

    public getParameterByName(name: string): AudioParam | undefined {
        if (!this.audioNode || typeof name !== 'string' || !name) return undefined;
        const entry = this.getParamEntryByName(name);
        const mode = this.resolveParamMode(entry);
        if (mode === 'flow') return undefined;
        return this.lookupAudioParam(name);
    }

    public registerParamConnection(source: AudioNode, paramId: string) {
        if (!source || !paramId) return;
        const entry = this.getParamEntryById(paramId) || this.getParamEntryByName(paramId);
        if (this.resolveParamMode(entry) === 'flow') return;
        const exists = this._pendingParamConnections.some(entry => entry.source === source && entry.paramId === paramId)
            || this._activeParamConnections.some(entry => entry.source === source && entry.paramId === paramId);
        if (exists) return;
        if (!this.tryConnectParam(source, paramId)) {
            this._pendingParamConnections.push({ source, paramId });
        }
    }

    public unregisterParamConnection(source: AudioNode, paramId: string) {
        if (!source || !paramId) return;
        this._pendingParamConnections = this._pendingParamConnections.filter(entry => !(entry.source === source && entry.paramId === paramId));
        this._activeParamConnections = this._activeParamConnections.filter(entry => !(entry.source === source && entry.paramId === paramId));
        const paramName = this.getParameterNameById(paramId);
        const param = this.lookupAudioParam(paramName);
        if (param) {
            try {
                source.disconnect(param);
            } catch (_) {
                /* ignore disconnect errors */
            }
        }
    }

    private tryConnectParam(source: AudioNode, paramId: string): boolean {
        const param = this.getParameterById(paramId);
        if (!param) return false;
        try {
            source.connect(param);
            if (!this._activeParamConnections.some(entry => entry.source === source && entry.paramId === paramId)) {
                this._activeParamConnections.push({ source, paramId });
            }
            return true;
        } catch (e) {
            if (this._debug) console.warn('[VirtualAudioWorkletNode] param connect failed', e, { paramId });
            return false;
        }
    }

    private flushPendingParamConnections() {
        if (!this.audioNode || this._pendingParamConnections.length === 0) return;
        const remaining: { source: AudioNode; paramId: string }[] = [];
        this._pendingParamConnections.forEach(entry => {
            if (!this.tryConnectParam(entry.source, entry.paramId)) {
                remaining.push(entry);
            }
        });
        this._pendingParamConnections = remaining;
    }

    // ---- Parameter Integration ----
    private subscribeToParamUpdates() {
        const id = this.node.id;
        const handler = (payload: any) => {
            if (!payload || (payload.nodeid && payload.nodeid !== id)) return;
            const updates = this.extractParamUpdates(payload);
            if (!updates.length) return;
            this.updateStoredParams(updates);
            this.applyParams(updates);
        };
        this.eventBus.subscribe(id + '.params.updateParams', handler);
        this.eventBus.subscribe('params.updateParams', handler);
    }

    private subscribeToParamDescriptorChanges() {
        const id = this.node.id;
        const handler = (payload: any) => {
            if (!payload || (payload.nodeid && payload.nodeid !== id)) return;
            if (Array.isArray(payload.params)) {
                (this.node.data as any).params = payload.params;
            }
            const code = (this.node.data as any).processorCode;
            if (typeof code === 'string') {
                this.updateProcessorFromCode(code);
            }
        };
        this.eventBus.subscribe(id + '.processor.paramsChanged', handler);
        this.eventBus.subscribe('processor.paramsChanged', handler);
    }

    private extractParamUpdates(payload: any): Array<{ id?: string; name: string; value: number; mode?: 'stream' | 'flow' }> {
        const data = payload?.data;
        if (!data) return [];

        const normalizeValue = (raw: any): number | null => {
            if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? parsed : null;
        };

        if (Array.isArray(data.params)) {
            return data.params
                .map((entry: any) => {
                    if (!entry) return null;
                    const entryId = entry.id ? String(entry.id) : undefined;
                    const existing = entryId ? this.getParamEntryById(entryId) : undefined;
                    const fallback = !existing && typeof entry.name === 'string' ? this.getParamEntryByName(entry.name) : existing;
                    const inferredName = typeof entry.name === 'string' ? entry.name : this.getParameterNameById(String(entry.id ?? ''));
                    const name = inferredName;
                    const value = normalizeValue(entry.value);
                    if (!name || value === null) return null;
                    const id = entryId;
                    const mode = entry.mode === 'flow' || entry.mode === 'stream'
                        ? entry.mode
                        : this.resolveParamMode(existing || fallback);
                    return { id, name, value, mode };
                })
                .filter(Boolean) as Array<{ id?: string; name: string; value: number; mode?: 'stream' | 'flow' }>;
        }

        if (typeof data !== 'object') return [];

        const updates: Array<{ id?: string; name: string; value: number; mode?: 'stream' | 'flow' }> = [];
        Object.entries(data).forEach(([key, raw]) => {
            if (key === 'params') return;
            const value = normalizeValue(raw);
            if (value === null) return;
            let mode: 'stream' | 'flow' | undefined;
            let paramId: string | undefined;
            if (key.startsWith('param-')) {
                if (key.startsWith('param-flow-')) {
                    paramId = key.slice('param-flow-'.length);
                    mode = 'flow';
                } else if (key.startsWith('param-stream-')) {
                    paramId = key.slice('param-stream-'.length);
                    mode = 'stream';
                } else {
                    paramId = key.slice('param-'.length);
                }
                const name = this.getParameterNameById(paramId);
                const entry = this.getParamEntryById(paramId) || this.getParamEntryByName(name ?? '');
                const resolvedMode = mode ?? this.resolveParamMode(entry);
                if (name) updates.push({ id: paramId, name, value, mode: resolvedMode });
                return;
            }
            const name = typeof key === 'string' ? key : undefined;
            if (!name) return;
            const entry = this.getParamEntryByName(name);
            updates.push({ name, value, mode: this.resolveParamMode(entry) });
        });
        return updates;
    }

    private updateStoredParams(updates: Array<{ id?: string; name: string; value: number; mode?: 'stream' | 'flow' }>) {
        if (!updates.length) return;
        const target = Array.isArray((this.node.data as any).params) ? (this.node.data as any).params : (this.node.data as any).params = [];
        updates.forEach(update => {
            const { id, name, value, mode } = update;
            if (!name || !Number.isFinite(value)) return;
            let entry = target.find((existing: any) => existing && ((id && existing.id === id) || existing.name === name));
            if (!entry) {
                entry = { id: id || name, name, value, mode: mode ?? 'stream' };
                target.push(entry);
            } else {
                const previousMode = this.resolveParamMode(entry);
                entry.value = value;
                if (id && !entry.id) entry.id = id;
                if (mode) entry.mode = mode;
                const nextMode = this.resolveParamMode(entry);
                if (previousMode === 'stream' && nextMode === 'flow') {
                    this.clearParamConnectionsFor(entry.id ?? name, name);
                }
            }
        });
    }

    private applyParams(params: Array<{ id?: string; name: string; value: number; mode?: 'stream' | 'flow' }>) {
        if (!Array.isArray(params) || params.length === 0) return;
        params.forEach(p => {
            if (!p || typeof p.name !== 'string') return;
            const value = typeof p.value === 'number' ? p.value : Number(p.value);
            if (!Number.isFinite(value)) return;
            const stored = (p.id ? this.getParamEntryById(p.id) : undefined) || this.getParamEntryByName(p.name);
            const mode = p.mode ?? this.resolveParamMode(stored);
            const resolvedId = p.id || (stored && stored.id ? String(stored.id) : undefined);
            const resolvedName = stored && typeof stored.name === 'string' ? stored.name : p.name;
            if (mode === 'flow') {
                this.queueFlowMessage({ id: resolvedId, name: resolvedName, value });
                return;
            }
            const ap = this.getParameterByName(resolvedName);
            if (ap && this.audioContext) {
                try { ap.setValueAtTime(value, this.audioContext.currentTime); } catch { /* ignore */ }
            } else if (this.audioNode && this.audioContext) {
                const fallback = this.lookupAudioParam(resolvedName);
                if (fallback) {
                    try { fallback.setValueAtTime(value, this.audioContext.currentTime); } catch { /* ignore */ }
                }
            }
        });
    }
}