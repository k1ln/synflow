// Regression test: a WHEN_CAPABLE node (ADSR/Automation/AiVstFlowNode) must get its
// receiveNodeOn/receiveNodeOff delivered immediately (sample-accurate scheduling via
// the Web Audio param timeline), even when its id doesn't follow the `name.Type`
// convention (e.g. .vstai's AiVstFlowNode, whose flow-builder gives it the plain id
// 'vstai' — see packages/daw/src/synflow/vstai.ts). Before the fix, nodeHonorsWhen()
// only parsed the id string, so such nodes silently fell back to wall-clock
// setTimeout delivery in REAL-TIME playback — jittery at best, and easy to lose
// track of a scheduled release relative to the note that's actually sounding.
// This must run on a REAL (non-offline) AudioContext: isOfflineContext() short-
// circuits the deferred path entirely, so an offline test can't see this bug.
import { AudioContext } from 'node-web-audio-api';
globalThis.AudioContext = AudioContext;
const { AudioGraphManager, EventBus } = await import('@synflow/core');

const ctx = new AudioContext();
const bus = new EventBus();

// Deliberately a non-dotted id — same shape as .vstai's AiVstFlowNode node.
const nodes = [{ id: 'plugin', type: 'AiVstFlowNode', data: {} }];
const engine = new AudioGraphManager(ctx, { current: nodes }, { current: [] }, { bus, destination: ctx.destination });

let delivered = false;
bus.subscribe('plugin.main-input.receiveNodeOn', () => { delivered = true; });

// Schedule 200ms into the future. The EventBus itself defers subscriber calls by
// one setTimeout(0) tick regardless of path, so check shortly after that (well
// under the 200ms window): the sample-accurate path fires almost immediately
// (the AudioParam ramp is scheduled ahead, not the delivery); the buggy fallback
// only fires ~200ms later via its own setTimeout(delayMs).
engine.receiveNodeOn('plugin', 'main-input', { when: ctx.currentTime + 0.2 });
await new Promise((r) => setTimeout(r, 20));

const pass = delivered;
console.log(`WHEN_CAPABLE node with a plain id delivered ${pass ? 'promptly (sample-accurate path)' : 'was deferred ~200ms (setTimeout fallback — BUG)'}`);
console.log(pass ? 'PASS: nodeHonorsWhen recognizes declared node type, not just id suffix' : 'FAIL');
await ctx.close();
process.exit(pass ? 0 : 1);
