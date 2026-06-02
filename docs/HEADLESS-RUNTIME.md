# Synflow Headless Runtime — Architecture Design

**Status:** Design proposal
**Scope chosen:** Browser + Electron/webview hosts (Web Audio is always present) · In-process JS control API · No native port, no Node/socket/MIDI/OSC transport.
**Goal:** Ship a `@synflow/core` package that loads a flow JSON and plays it *without any Flow UI*, driven by plain JS method calls — so a self-built DAW or a game can reuse flows as instruments/sound objects.

---

## 1. Goals & non-goals

**Goals**
- Load a flow file (`{ nodes, edges }`) and play it headless — no React, no `@xyflow/react`, no DOM editor.
- Drive a running flow from host code via an in-process JS API: trigger command nodes, set params live, read outputs back.
- Run **many flow instances** in one page/app (DAW = many tracks/voices; game = many emitters) without cross-talk.
- Flows are portable assets, reusable across the editor, a DAW, and a game.
- The existing editor (`Flow.tsx`) becomes *a consumer of the same core*, so there is exactly one engine implementation.

**Non-goals (explicitly out, per chosen scope)**
- No native engine (Unity/Unreal/JUCE/Godot) port.
- No Node.js / `node-web-audio-api` runtime.
- No WebSocket/JSON-RPC/MIDI/OSC transport layer. (MIDI/keyboard stay only as *optional input sources*, not the control API.)

---

## 2. Current state — what's already reusable vs. coupled

The codebase already separates **UI** from **engine**:

| Layer | Files | Reusable headless? |
|---|---|---|
| UI / editor | [Flow.tsx](../src/Flow.tsx), [src/nodes/](../src/nodes/) `*FlowNode.tsx` | No — and we don't need it |
| Graph orchestration | [AudioGraphManager.ts](../src/sys/AudioGraphManager.ts), [AudioGraphEventHandlers.ts](../src/sys/AudioGraphEventHandlers.ts), [VirtualNodeFactory.ts](../src/sys/VirtualNodeFactory.ts) | **Yes**, with decoupling |
| Audio/logic nodes | [src/virtualNodes/](../src/virtualNodes/) `Virtual*Node.ts` | **Mostly yes** (each already takes `eventBus` + `audioContext` in its constructor) |
| Wiring / control bus | [EventBus.ts](../src/sys/EventBus.ts), [EventManager.ts](../src/sys/EventManager.ts) | Needs de-singletonizing |
| External control (already!) | [exposeFlowSynth.ts](../src/sys/exposeFlowSynth.ts) | Proves the model; replace global with engine method |

**The engine never reads the React tree.** It boots from plain data:

```ts
// Flow.tsx:1302
managerRef.current = new AudioGraphManager(ctx, nodesRef, edgesRef);
manager.initialize();
```

`nodesRef`/`edgesRef` are typed `React.RefObject` but only `.current` (a plain array) is used — any `{ current: [] }` works. A flow file is React Flow's serialization `{ nodes, edges }`; the engine ignores UI-only fields (`position`, `measured`, `style`, `dragging`, …).

**The control surface already half-exists.** [exposeFlowSynth.ts](../src/sys/exposeFlowSynth.ts) wires `window.flowSynth.emit(name, payload)` straight to the EventBus, and command nodes ([VirtualButtonNode](../src/virtualNodes/VirtualButtonNode.ts), Input, OnOff, Midi) listen on `${nodeId}.main-input.sendNodeOn/Off`. "Play by commands" = emit the right EventBus events.

### Coupling that must be removed

1. **Singletons.** `EventBus.getInstance()` and `EventManager.getInstance()` are process-global. Two flows would share one bus → cross-talk. Fatal for multi-track / multi-voice.
2. **Browser globals.** [EventManager](../src/sys/EventManager.ts) binds `window` keydown/keyup; `MidiManager` uses Web MIDI; oscilloscope/analyzer draw to canvas.
3. **Flow + asset loading.** `loadFlowByName` ([AudioGraphManager.ts:85](../src/sys/AudioGraphManager.ts#L85)) uses the File System Access API + IndexedDB; samples/worklet-URLs/impulses assume browser fetch paths.
4. **Output routing.** `VirtualMasterOut` wraps the `AudioContext` itself and connects to `ctx.destination` ([VirtualMasterOut.ts](../src/virtualNodes/VirtualMasterOut.ts)). For multi-instance mixing, each engine should output to an *injected destination node*, not hard-wired `ctx.destination`.

None of these are deep rewrites — every `Virtual*Node` already receives `eventBus`/`audioContext` by constructor, so it's mostly threading an instance instead of calling `getInstance()`.

---

## 3. Target architecture

### 3.1 Module layout

```
src/
  core/                         ← @synflow/core (headless, no React/DOM)
    SynflowEngine.ts            ← public facade (the in-process API)
    AudioGraphManager.ts        ← moved from sys/, takes injected bus + env
    AudioGraphEventHandlers.ts  ← moved from sys/
    VirtualNodeFactory.ts       ← moved from sys/
    EventBus.ts                 ← class only, no getInstance() singleton
    env.ts                      ← SynflowEnv interface + headless defaults
    io.ts                       ← FlowIO descriptors (inputs/params/outputs)
    types.ts                    ← Flow, EngineOptions, …
  virtualNodes/                 ← unchanged logic; only constructor wiring touched
  adapters/
    browserEnv.ts               ← keyboard + Web MIDI + canvas observers
  nodes/, Flow.tsx              ← editor; now imports from core/
```

`@synflow/core` exports `SynflowEngine` and types only. The editor and any host import it the same way.

### 3.2 The public API (`SynflowEngine`)

```ts
class SynflowEngine {
  constructor(opts: EngineOptions);

  // lifecycle
  async load(flow: Flow): Promise<void>;   // build graph (suspended)
  async start(): Promise<void>;            // resume / connect to output
  stop(): void;                            // disconnect, keep graph
  dispose(): void;                         // tear down fully

  // control ("play by commands") — in-process JS
  noteOn(target: string, payload?: NotePayload): void;   // freq/note/velocity
  noteOff(target: string, payload?: NotePayload): void;
  setParam(nodeId: string, key: string, value: number | string): void;
  trigger(eventName: string, payload?: unknown): void;   // fire any flow event
  on(eventName: string, cb: (data: any) => void): () => void;  // read outputs/meters

  // discovery — host learns the flow's I/O without parsing internals
  listInputs(): PortDescriptor[];
  listParams(): ParamDescriptor[];
  listOutputs(): PortDescriptor[];

  // routing
  get output(): AudioNode;   // this instance's bus out, for host mixing
}
```

```ts
interface EngineOptions {
  audioContext: AudioContext;        // SHARED across instances (see §6)
  destination?: AudioNode;           // where this instance's output goes
                                     //   (default: audioContext.destination)
  flowLoader?: FlowLoader;           // resolve FlowNode sub-flows by name
  assetResolver?: AssetResolver;     // resolve samples / worklet URLs / impulses
  env?: Partial<SynflowEnv>;         // keyboard/midi/canvas; headless no-op default
}

type FlowLoader = (name: string, folderPath?: string) => Promise<Flow | null>;
type AssetResolver = (url: string) => Promise<ArrayBuffer>;
```

### 3.3 `SynflowEnv` — the browser bits, injectable

```ts
interface SynflowEnv {
  now(): number;                                   // time source
  input?: { onKey(cb): () => void };               // keyboard → buttons (optional)
  midi?: { onMessage(cb): () => void };            // Web MIDI (optional)
  observers?: ObserverSink;                        // oscilloscope/analyzer data out
}
```

In a web game / DAW you pass `adapters/browserEnv.ts`. Headless tests pass nothing → no-ops. Keyboard and MIDI become *optional input sources that feed the same EventBus* — never the primary control path.

---

## 4. Control model — the four verbs and how they map

The whole control surface reduces to four EventBus interactions (event-name conventions are taken from the existing code, so the verbs are a typed wrapper, not new plumbing):

| Verb | EventBus mapping (existing) | Drives |
|---|---|---|
| `noteOn / noteOff(target, p)` | `${target}.main-input.sendNodeOn/Off` | Button, OnOff, Midi, Input command nodes ([VirtualButtonNode](../src/virtualNodes/VirtualButtonNode.ts), [VirtualInputNode](../src/virtualNodes/VirtualInputNode.ts)) |
| `setParam(id, key, v)` | `${id}.params.updateParams` `{ data: { [key]: v } }` | Any node param (handled in [VirtualNode.handleUpdateParams](../src/virtualNodes/VirtualNode.ts)) |
| `trigger(name, p)` | `bus.emit(name, p)` | Any named flow event (same as `window.flowSynth.emit`) |
| `on(name, cb)` | `bus.subscribe(name, cb)` | Read outputs, meters, `audio.started/stopped` |

`target` is a node id. `listInputs()` returns the ids worth targeting, so a host never hard-codes them.

> **Note on `EventBus.emit`:** it currently dispatches each handler in `setTimeout(…, 0)` to break React re-entrancy ([EventBus.ts:112](../src/sys/EventBus.ts#L112)). That adds ~1 task of latency per hop and is a *UI* workaround. For the headless engine, make the async-dispatch behavior a constructor flag so non-React hosts can run synchronous, low-latency dispatch. (Decide per instance; the editor keeps async.)

---

## 5. I/O port model (discovery)

`InputNode`/`OutputNode`/`Button`/`Midi` nodes are the flow's public ports. The engine enumerates them after `load()`:

- **Inputs** — `InputNode` (`data.index`), `ButtonFlowNode` (`data.assignedKey`), `OnOffButtonFlowNode`, `MidiButtonFlowNode`, `MidiFlowNote`.
- **Params** — collected from node `data` keys that map to AudioParams / settable fields (same set `handleUpdateParams` already accepts).
- **Outputs** — `OutputNode` (`data.index`) and `MasterOutFlowNode`; plus observer nodes (oscilloscope/analyzer) exposed as `on()` streams.

This is what lets a DAW show "this instrument has 1 trigger, params {cutoff, gain}, 1 audio out" and a game say `engine.noteOn(inputs[0].id, { note })` generically.

---

## 6. Multi-instance — the critical detail for DAW & games

Browsers cap the number of live `AudioContext`s. **Do not create one context per flow.** Instead:

- Host creates **one shared `AudioContext`** and passes it to every `SynflowEngine`.
- Each engine owns **its own `EventBus`, its own `VirtualNode` map, and its own output `GainNode`** (`engine.output`), connected to an injected `destination`.
- `VirtualMasterOut` changes from "connect to `ctx.destination`" to "connect to the engine's output gain" so the host mixes/routes N instances.
- Disposing one engine tears down only its subgraph and unsubscribes only its bus (the current `dispose()` already iterates `this.virtualNodes` and `unsubscribeAllByNodeId` — once the bus is per-instance this becomes clean).

Pattern: **DAW track = 1 engine; polyphonic voice pool = N engines sharing the context**, or a single flow using the existing Unison machinery. Game = an instance pool keyed by sound object.

---

## 7. Refactor plan (phased, each phase shippable)

**Phase 0 — Prove detachment (spike).** Throwaway script: import `AudioGraphManager` + factory, feed an example flow as `{ current: nodes }`, instantiate, render offline / play. Confirms the engine runs with no React. (Matches the "proof-of-concept" option; do it even though we chose the doc, to de-risk Phase 1.)

**Phase 1 — De-singletonize the bus.** Convert `EventBus` to a plain instantiable class; remove `getInstance()`. `AudioGraphManager` creates/owns one bus. Replace the global in [exposeFlowSynth.ts](../src/sys/exposeFlowSynth.ts) with engine-scoped access. Update `Flow.tsx` to use the manager's bus. Same for `EventManager` (per-engine, env-driven). *Biggest change; everything else is small after this.*

**Phase 2 — Injectable env.** Extract keyboard/Web-MIDI/canvas into `adapters/browserEnv.ts` behind `SynflowEnv`; headless default = no-ops. Observer nodes stream via `env.observers` instead of touching canvas directly.

**Phase 3 — Pluggable flow + asset resolution.** Replace `loadFlowByName`'s direct FS/IndexedDB calls with injected `flowLoader`; route sample/worklet/impulse loads through `assetResolver`. Editor passes adapters that keep today's behavior.

**Phase 4 — `SynflowEngine` facade + I/O discovery.** Implement the §3.2 API on top of the manager; add `listInputs/Params/Outputs`; add per-instance output gain + injected destination (§6).

**Phase 5 — Editor consumes the core.** Rewrite `Flow.tsx`'s `init()` ([Flow.tsx:1278](../src/Flow.tsx#L1278)) to construct a `SynflowEngine` with browser adapters instead of `new AudioGraphManager(...)` directly. One engine, two consumers.

---

## 8. Example usage

**DAW track**
```ts
const ctx = new AudioContext();
const synth = new SynflowEngine({ audioContext: ctx, destination: trackBus });
await synth.load(await fetch('/flows/PolyOrgan.json').then(r => r.json()));
await synth.start();

const [trigger] = synth.listInputs();
synth.noteOn(trigger.id, { note: 'C4', velocity: 100 });
synth.setParam(cutoffNodeId, 'frequency', 1200);
// ...later
synth.noteOff(trigger.id, { note: 'C4' });
```

**Game (instance pool, shared context)**
```ts
const ctx = new AudioContext();
const laser = new SynflowEngine({ audioContext: ctx });
await laser.load(laserFlow); await laser.start();
onEnemyHit(() => laser.trigger('fire'));   // a named EventFlowNode
```

---

## 9. Risks & open questions

- **`@ts-nocheck`.** `AudioGraphManager`, `VirtualNodeFactory`, `AudioGraphTypes` are `@ts-nocheck`. Moving them into a published core is the moment to type the public surface (`Flow`, `EngineOptions`, descriptors) even if internals stay loose initially.
- **AudioWorklet module loading.** `AudioWorkletFlowNode` calls `audioWorklet.addModule(url)`; in Electron/webview the URL base differs from a dev server. The `assetResolver` must yield a valid module URL (or a Blob URL) per host.
- **Async EventBus latency.** The `setTimeout(0)` dispatch (§4) is fine for UI, adds jitter for tight musical timing — make it a per-instance flag.
- **Unison / sub-flow id namespacing.** The engine prefixes ids (`parent.child`, `id-voiceIndex`); `noteOn(target)` must accept the *public* node id and the engine resolves the prefix. `listInputs()` should return already-resolved targets.
- **Shared singletons hiding elsewhere.** Audit `MidiManager.getInstance()` and any other `getInstance()` for per-instance leakage during Phase 1.

---

## 10. TL;DR

The engine is already headless-capable; the work is **(a)** make `EventBus`/`EventManager` per-instance, **(b)** hide browser I/O behind an injectable `env`, **(c)** make flow/asset loading pluggable, **(d)** wrap it in a `SynflowEngine` with a 4-verb in-process API + I/O discovery, and **(e)** point the editor at the same core. No new audio code; mostly deleting `getInstance()` and threading one bus.
