import { describe, it, expect } from 'vitest';
import { AudioGraphManager, EventBus } from '@synflow/core';
import { makeFilterFx, makeDelayFx } from '../src/synflow/effects';

const G = globalThis as any;
if (!G.AudioNode) G.AudioNode = class AudioNode {};
if (!G.AudioParam) G.AudioParam = class AudioParam {};
if (!G.AudioContext) G.AudioContext = class AudioContext {};

const param = (value = 0) => Object.assign(new G.AudioParam(), { value });
const node = (extra: Record<string, any> = {}) => Object.assign(new G.AudioNode(), { connect() {}, disconnect() {}, ...extra });

function mockCtx(): any {
  return {
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ frequency: param(1000), Q: param(1), gain: param(0), detune: param(0), type: 'lowpass' }),
    createDelay: () => node({ delayTime: param(0) }),
    destination: node(),
    currentTime: 0,
  };
}

describe('FX flows route as inserts', () => {
  for (const [name, make] of [['filter', makeFilterFx], ['delay', makeDelayFx]] as const) {
    it(`${name} exposes tagged audio input + output the DAW can route through`, async () => {
      const flow = make();
      const inId = flow.nodes.find((n) => n.data?.isInput)!.id;
      const outId = flow.nodes.find((n) => n.data?.isOutput)!.id;
      const mgr = new AudioGraphManager(mockCtx(), { current: flow.nodes } as any, { current: flow.edges } as any, { bus: new EventBus() });
      await mgr.initialize();
      expect(mgr.getAudioInput(inId)).toBeInstanceOf(G.AudioNode);
      expect(mgr.getAudioOutput(outId)).toBeInstanceOf(G.AudioNode);
    });
  }
});
