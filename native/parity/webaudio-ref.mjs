// Reference renderer: runs each test through REAL Chrome Web Audio
// (OfflineAudioContext) and writes build/ref_<name>.f32. Also generates the
// shared build/input.f32 the C++ side reads, so input is byte-identical.
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SR = 48000;
const N = 8192;
const buildDir = new URL('./build/', import.meta.url);
fs.mkdirSync(buildDir, { recursive: true });
const p = (name) => new URL(name, buildDir);

// deterministic broadband input (mulberry32 white noise, exercises all freqs)
function genInput() {
  let a = 0x9e3779b9 >>> 0;
  const rnd = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const v = new Float32Array(N);
  for (let i = 0; i < N; i++) v[i] = (rnd() * 2 - 1) * 0.25;
  return v;
}

const tests = JSON.parse(fs.readFileSync(new URL('./tests.json', import.meta.url)));
const input = genInput();
fs.writeFileSync(p('input.f32'), Buffer.from(input.buffer));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
});
const page = await browser.newPage();

async function render(test) {
  return page.evaluate(async (inputArr, test, SR) => {
    const n = inputArr.length;
    const ctx = new OfflineAudioContext(1, n, SR);
    const buf = ctx.createBuffer(1, n, SR);
    buf.copyToChannel(Float32Array.from(inputArr), 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;

    let node;
    switch (test.node) {
      case 'gain':
        node = ctx.createGain();
        node.gain.value = test.gain;
        break;
      case 'biquad':
        node = ctx.createBiquadFilter();
        node.type = test.filterType;
        node.frequency.value = test.frequency;
        node.Q.value = test.Q;
        if (test.gain !== undefined) node.gain.value = test.gain;
        break;
      case 'delay':
        node = ctx.createDelay(2);
        node.delayTime.value = test.delayTime / 1000; // ms -> s
        break;
      case 'compressor':
        node = ctx.createDynamicsCompressor();
        for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release'])
          if (test[k] !== undefined) node[k].value = test[k];
        break;
      default:
        throw new Error('unknown node ' + test.node);
    }
    src.connect(node).connect(ctx.destination);
    src.start();
    const rendered = await ctx.startRendering();
    return Array.from(rendered.getChannelData(0));
  }, Array.from(input), test, SR);
}

for (const test of tests) {
  const out = await render(test);
  fs.writeFileSync(p(`ref_${test.name}.f32`), Buffer.from(Float32Array.from(out).buffer));
  console.log(`ref ${test.name}: ${out.length} samples`);
}

await browser.close();
console.log('wrote input.f32 + ref_*.f32 from Chrome', (await (async () => 'Web Audio')()));
