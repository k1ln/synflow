# @synflow/core

The headless synflow audio engine. Load a synflow flow (`{ nodes, edges }` JSON) and
play it with **no editor UI** — in a web app, a game, or an Electron/webview DAW.
The package depends on **nothing** (no React, no `@xyflow/react`); it only uses the
Web Audio API, so it runs anywhere a browser `AudioContext` is available.

- **Load & play** flows headlessly.
- **Drive from outside** via command nodes (`engine.command(...)`) and a parameter
  automation API (`setParam` / `connectToParam`).
- **Many instances on one `AudioContext`** (DAW tracks, game emitters) — no cross-talk.
- **Portable flows** that embed their sub-flows and samples → play with just an `AudioContext`.

---

## Install / import

In this monorepo the app imports it directly via the workspace alias:

```ts
import { AudioGraphManager, EventBus } from '@synflow/core';
```

For external projects, build the package (`npm run build` in `packages/core`) and
consume the `dist/` output (ESM + CJS + types), or depend on it as a workspace/file
package. The barrel exports everything below.

---

## Quick start

```ts
import { AudioGraphManager, EventBus } from '@synflow/core';

// 1. The HOST owns the AudioContext (autoplay, lifecycle, routing).
const ctx = new AudioContext();

// 2. A flow is just JSON: { nodes: SynNode[], edges: SynEdge[] }.
const flow = await fetch('/flows/PolyOrgan.portable.json').then(r => r.json());

// 3. Build the engine. nodesRef/edgesRef are plain { current: [...] } holders.
const engine = new AudioGraphManager(
  ctx,
  { current: flow.nodes },
  { current: flow.edges },
  { bus: new EventBus() },          // options (all optional except none) — see below
);

await ctx.resume();                 // must follow a user gesture in browsers
await engine.initialize();          // builds the Web Audio graph

// 4. Drive it (see Command nodes / Automation below)…

// 5. Tear down when done.
engine.dispose();
```

`SynNode` is `{ id: string; type: string; data: any }` (plus anything else — the editor's
`@xyflow/react` nodes are assignable as-is). `SynEdge` is
`{ source, target, sourceHandle?, targetHandle? }`.

---

## Constructor & options

```ts
new AudioGraphManager(audioContext, nodesRef, edgesRef, options?)
```

```ts
interface EngineOptions {
  bus?: EventBus;          // shared event bus. Omit → process singleton (single-app).
                           //   Pass `new EventBus()` per instance for isolation.
  destination?: AudioNode; // where master output connects. Default: audioContext.destination.
                           //   Pass a mixer channel to route/mix many engines.
  input?: ButtonInput;     // keyboard/button source (editor: EventManager). Headless: omit.
  midi?: MidiInput;        // Web MIDI source. Headless: omit.
  flowLoader?: FlowLoader; // resolves FlowNode sub-flows by name. Omit for portable flows.
  assetStore?: AssetStore; // loads/saves sample & recording audio. Omit if flows embed samples.
}
```

**The host owns the `AudioContext`** — core never creates one. This is what lets you run
many engine instances on a single shared context (browsers cap the number of contexts).

---

## Multiple instances (DAW tracks / game voices)

```ts
const ctx = new AudioContext();          // ONE shared context
const masterBus = ctx.createGain();
masterBus.connect(ctx.destination);

const track = (flow) => {
  const channel = ctx.createGain();      // per-track output
  channel.connect(masterBus);
  const eng = new AudioGraphManager(
    ctx, { current: flow.nodes }, { current: flow.edges },
    { bus: new EventBus(), destination: channel },   // own bus = no cross-talk
  );
  return eng;
};
```

---

## Host adapters (keyboard / MIDI / storage)

Browser-specific capabilities are **injected**, so core stays portable. Register them
once per process (the editor does this at startup):

```ts
import { setHostAdapters } from '@synflow/core';

setHostAdapters({
  input:      myKeyboardManager,   // implements ButtonInput
  midi:       myMidiManager,       // implements MidiInput
  flowLoader: async (name, folder) => loadFlowJson(name, folder),  // FlowLoader
  assetStore: {                                                    // AssetStore
    loadAudio: async (name) => fetchArrayBuffer(name),
    saveAudio: async (kind, blob, filename) => save(kind, blob, filename),
  },
});
```

A pure headless host can skip all of these: keyboard/MIDI simply no-op, and a
**portable** flow needs no `flowLoader`/`assetStore` at all.

Per-instance overrides are also accepted via `EngineOptions` (`{ input, midi, flowLoader,
assetStore }`); the engine prefers the option, then the process-level adapter.

---

## Command nodes — driving a flow from outside

Place a **Command In** node in the flow, give it a `commandName`, and wire its output to
anything (a gate, an AudioParam, a frequency). Then drive it:

```ts
engine.command('play', { note: 'C4', velocity: 100 }); // sendNodeOn + payload
engine.commandOff('play');                             // sendNodeOff
engine.noteOn('lead', { frequency: 440 });             // aliases of command/commandOff
engine.noteOff('lead');

// Read a "Command Out" node (flow → host):
const off = engine.onCommand('level', (payload) => console.log(payload));
off(); // unsubscribe

// Discover a flow's control surface:
engine.listCommands();        // [{ id, name, kind: 'trigger'|'value'|'note' }]
engine.listCommandOutputs();  // [{ id, name }]
```

Command-In payload is unified — `{ type?: 'on'|'off', value?, note?, frequency?, velocity? }` —
so one node can drive gates, values, or notes; the wiring decides what's used.

---

## Automation

Three ways to automate node parameters; **all coexist**.

**1. In-graph signal automation (audio-rate, sample-accurate)** — connect an
oscillator/LFO/`Constant`/`ADSR`/`Automation` node's output to a target's `param-*` handle
inside the flow. Pure Web Audio; travels with the flow.

**2. In-graph event automation (control-rate)** — `AutomationFlowNode`, sequencers, etc.
emit values that the engine applies to params (with built-in smoothing).

**3. Host automation (from outside the core)** — the host drives params directly:

```ts
// control-rate (DAW automation lanes, knob moves) — uses the engine's smoothing:
engine.setParam(oscNodeId, 'frequency', 880);
engine.setParam(gainNodeId, 'gain', 0.5);

// audio-rate (sidechain, sample-accurate LFO) — connect your OWN signal:
const lfo = ctx.createOscillator(); lfo.frequency.value = 5;
const depth = ctx.createGain();    depth.gain.value = 200;
lfo.connect(depth); lfo.start();
engine.connectToParam(depth, oscNodeId, 'frequency');     // depth → osc.frequency
// later: engine.disconnectFromParam(depth, oscNodeId, 'frequency');

// discover & resolve params:
engine.listParams(filterNodeId);                 // [{ name: 'frequency', value }, { name: 'Q', value }]
const p = engine.getAudioParam(filterNodeId, 'frequency'); // the raw AudioParam
```

Guideline: keep envelopes/LFOs **in the flow** when they should be portable; use the host
param API when a DAW lane or game logic owns the modulation.

---

## Portable (self-contained) flows

Core consumes portable flows natively — no `flowLoader`/`assetStore` required:

- A `FlowNode` with `data.embeddedFlow = { nodes, edges }` is inlined directly.
- A `SampleFlowNode` with `data.arrayBuffer` as a base64 string decodes its sample inline.

The editor produces these via `window.flowSynth.exportPortableFlow()` (recursively inlines
sub-flows + embeds sample audio). The result is one JSON you can drop into any host:

```ts
const portable = await fetch('/lead.portable.json').then(r => r.json());
const eng = new AudioGraphManager(ctx, { current: portable.nodes }, { current: portable.edges },
  { bus: new EventBus() });           // no flowLoader, no assetStore
await eng.initialize();
```

---

## EventBus

A small instantiable pub/sub used as the flow's control wiring. The host can talk to it
directly, but the typed methods above are preferred.

```ts
const bus = new EventBus();
const cb = (d) => console.log(d);
bus.subscribe('audio.started', cb);
bus.emit('command.play', { type: 'on' });
bus.unsubscribe('audio.started', cb);
```

> Note: `EventBus.emit` dispatches handlers asynchronously (`setTimeout(0)`) to avoid
> re-entrancy. Triggers fire on the next task, not synchronously.

---

## API summary

| Symbol | Purpose |
|---|---|
| `AudioGraphManager(ctx, nodesRef, edgesRef, options?)` | The engine. `initialize()`, `dispose()`. |
| `engine.command/commandOff/noteOn/noteOff(name, payload?)` | Drive Command-In nodes. |
| `engine.onCommand/offCommand(name, cb)` | Read Command-Out nodes (returns unsubscribe). |
| `engine.listCommands() / listCommandOutputs()` | Discover the control surface. |
| `engine.setParam(nodeId, key, value)` | Control-rate param automation. |
| `engine.getAudioParam(nodeId, key)` | Resolve a node's `AudioParam`. |
| `engine.connectToParam(source, nodeId, key)` / `disconnectFromParam(...)` | Audio-rate automation. |
| `engine.listParams(nodeId)` | List a node's automatable params. |
| `engine.virtualNodes` | `Map<id, virtualNode>` (advanced/introspection). |
| `EventBus` | Instantiable pub/sub. |
| `setHostAdapters({ input, midi, flowLoader, assetStore })` | Register browser/host capabilities. |
| `EngineOptions`, `ButtonInput`, `MidiInput`, `FlowLoader`, `AssetStore`, `SynNode`, `SynEdge` | Types. |

See [docs/HEADLESS-RUNTIME.md](../../docs/HEADLESS-RUNTIME.md) for the architecture rationale.
