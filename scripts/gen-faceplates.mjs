// Generates hardware-style custom-UI faceplates for the bundled instrument
// examples (rotary knobs via data-knob, faders via data-param, a playable
// keyboard with an octave bar via data-octave). Run after editing a preset's
// exposed knobs: `node scripts/gen-faceplates.mjs`.
import fs from 'node:fs';
const DIR = 'public/flow-examples/instruments';

const knob = (key, label) =>
  `<div class="kn" data-knob="${key}" title="${label}"><div class="dial"><span class="tk"></span></div><div class="kl">${label}</div><div class="kv" data-readout="${key}"></div></div>`;
const fader = (key, label) =>
  `<div class="fd"><input type="range" data-param="${key}"><div class="kl">${label}</div></div>`;

const WHITE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
const WN = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
const BLACK = { 0: 1, 1: 3, 3: 6, 4: 8, 5: 10, 7: 13, 8: 15, 10: 18 };
function keyboard(base, n = 8) {
  const whites = WHITE.slice(0, n).map((s, i) =>
    `<div class="wk" data-note="${base + s}">${s % 12 === 0 ? `<span>${WN[i]}${Math.floor((base + s) / 12) - 1}</span>` : ''}</div>`).join('');
  const blacks = Object.entries(BLACK).filter(([wi]) => wi < n - 1).map(([wi, s]) =>
    `<div class="bk" data-note="${base + s}" style="left:calc(${(((+wi) + 1) / n) * 100}% - (100%/${n})*0.32)"></div>`).join('');
  return `<div class="krow">
    <div class="oct"><button class="ob" data-octave="-1">◀ OCT</button><span class="ol" data-octave-label></span><button class="ob" data-octave="1">OCT ▶</button></div>
    <div class="kbd"><div class="wks" style="--n:${n}">${whites}</div><div class="bks">${blacks}</div></div>
  </div>`;
}

const baseCss = `
  *{box-sizing:border-box}
  .panel{font-family:'Inter',system-ui,sans-serif;width:520px;max-width:100%;border-radius:14px;padding:16px 18px 18px;
    background:var(--bg);color:var(--ink);box-shadow:0 10px 30px rgba(0,0,0,.5), var(--edge);}
  .brand{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;border-bottom:1px solid var(--line);padding-bottom:10px}
  .logo{font-size:18px;font-weight:900;letter-spacing:.04em;color:var(--accent);text-shadow:var(--logoSh)}
  .model{font-size:9px;letter-spacing:.34em;text-transform:uppercase;color:var(--dim)}
  .sect{display:flex;flex-wrap:wrap;gap:14px 10px;align-items:flex-end}
  .group{display:flex;flex-direction:column;gap:7px}
  .gt{font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
  .knobs{display:flex;flex-wrap:wrap;gap:12px 8px}
  .kn{display:flex;flex-direction:column;align-items:center;gap:2px;width:54px}
  .dial{width:40px;height:40px;border-radius:50%;position:relative;background:var(--knob);
    box-shadow:0 2px 4px rgba(0,0,0,.5),inset 0 1px 1px rgba(255,255,255,.18);border:1px solid rgba(0,0,0,.55)}
  .tk{position:absolute;left:50%;top:4px;width:3px;height:13px;border-radius:2px;background:var(--accent);
    transform-origin:50% 16px;transform:translateX(-50%) rotate(var(--a,-135deg));box-shadow:0 0 5px var(--accent)}
  .kl{font-size:8px;letter-spacing:.03em;text-transform:uppercase;color:var(--ink);text-align:center;line-height:1.05;max-width:54px}
  .kv{font-size:8px;font-family:ui-monospace,monospace;color:var(--accent)}
  .fd{display:flex;flex-direction:column;align-items:center;gap:5px;width:34px}
  .fd input[type=range]{writing-mode:vertical-lr;direction:rtl;width:7px;height:96px;accent-color:var(--accent);background:transparent}
  .krow{margin-top:14px}
  .oct{display:flex;align-items:center;gap:8px;margin-bottom:7px}
  .ob{background:var(--knob);color:var(--ink);border:1px solid rgba(0,0,0,.5);border-radius:5px;padding:3px 9px;font-size:9px;font-weight:700;letter-spacing:.06em}
  .ob:active{filter:brightness(1.35)}
  .ol{font-family:ui-monospace,monospace;font-size:10px;color:var(--accent);min-width:34px;text-align:center}
  .kbd{position:relative;height:96px;border-radius:0 0 8px 8px;overflow:hidden}
  .wks{display:grid;grid-template-columns:repeat(var(--n),1fr);height:100%;gap:2px}
  .wk{position:relative;border-radius:0 0 5px 5px;background:linear-gradient(180deg,#fbfdff,#cdd4dc);display:flex;align-items:flex-end;justify-content:center;padding-bottom:5px}
  .wk span{font-size:8px;color:#5a6470;font-weight:700}
  .wk.on{background:linear-gradient(180deg,var(--accent),var(--accent2))}
  .bks{position:absolute;inset:0;pointer-events:none}
  .bk{position:absolute;top:0;width:calc((100%/var(--n,8))*0.62);height:60%;border-radius:0 0 4px 4px;background:linear-gradient(180deg,#2a2f36,#0c0f13);pointer-events:auto;box-shadow:0 2px 3px rgba(0,0,0,.5)}
  .bk.on{background:linear-gradient(180deg,var(--accent),#0c0f13)}
  .pad{height:130px;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
    font-size:18px;font-weight:800;letter-spacing:.1em;color:var(--bg);background:linear-gradient(180deg,var(--accent),var(--accent2));margin-top:14px}
  .pad span{font-size:9px;font-weight:600;opacity:.8}
  .pad.on{filter:brightness(1.25)}
`;

const panel = ({ theme, logo, model, knobsHtml, play }) =>
  `<style>${baseCss}</style>
<div class="panel" style="${theme}">
  <div class="brand"><div class="logo">${logo}</div><div class="model">${model}</div></div>
  ${knobsHtml}
  ${play}
</div>`;

const groupFromKnobs = (title, picks, render = knob) =>
  `<div class="group"><div class="gt">${title}</div><div class="knobs">${picks.map(([key, label]) => render(key, label)).join('')}</div></div>`;

function keyFinder(j) {
  const all = [];
  for (const n of j.nodes) for (const k of (n.data.knobs || [])) all.push({ id: n.id, param: k.param, label: k.label });
  return (idPrefix, param) => {
    const f = all.find((x) => x.id.startsWith(idPrefix) && x.param === param);
    return f ? [`${f.id}.${f.param}`, f.label] : null;
  };
}

function drumPanel(j, logo, model, padLabel) {
  const picks = [];
  for (const n of j.nodes) for (const k of (n.data.knobs || [])) picks.push([`${n.id}.${k.param}`, k.label]);
  return {
    logo, model,
    theme: '--bg:linear-gradient(180deg,#2b2b2e,#161618);--ink:#e6e2da;--dim:#9a948a;--line:#444;--accent:#f0a020;--accent2:#c06010;--logoSh:0 0 10px rgba(240,160,32,.4);--edge:inset 0 1px 0 rgba(255,255,255,.08);--knob:radial-gradient(circle at 50% 35%,#3a3a3a,#0e0e0e 72%)',
    knobsHtml: `<div class="sect">${groupFromKnobs('Voice', picks)}</div>`,
    play: `<div class="pad" data-hit>${padLabel}<span>tap / play</span></div>`,
  };
}

const CONFIGS = {
  'juno-106': (j) => {
    const f = keyFinder(j);
    const dco = ['gSaw|gain', 'gPulse|gain', 'gSub|gain', 'gNoise|gain'].map((s) => { const [a, b] = s.split('|'); return f(a, b); }).filter(Boolean);
    const flt = [f('hpf', 'frequency'), f('vcf', 'frequency'), f('vcf', 'Q')].filter(Boolean);
    const env = [f('fenv', 'maxPercent'), f('fenv', 'attackTime'), f('fenv', 'sustainTime'), f('fenv', 'sustainLevel'), f('fenv', 'releaseTime')].filter(Boolean);
    const amp = [f('aenv', 'attackTime'), f('aenv', 'sustainTime'), f('aenv', 'sustainLevel'), f('aenv', 'releaseTime')].filter(Boolean);
    const mod = [f('lfo', 'frequency'), f('gLfo', 'gain'), f('chorus', 'mix'), f('chorus', 'rate')].filter(Boolean);
    return {
      logo: 'Juna-106', model: 'Polyphonic Synthesizer',
      theme: '--bg:linear-gradient(180deg,#d7dade,#b7bcc2);--ink:#23262b;--dim:#5a5f66;--line:#9aa0a8;--accent:#c0392b;--accent2:#8e2820;--logoSh:none;--edge:inset 0 1px 0 #fff;--knob:radial-gradient(circle at 50% 35%,#3a3d42,#16181b 72%)',
      knobsHtml: `<div class="sect">${groupFromKnobs('DCO Mixer', dco, fader)}${groupFromKnobs('VCF', flt)}${groupFromKnobs('Filter Env', env)}${groupFromKnobs('VCA', amp)}${groupFromKnobs('LFO · Chorus', mod)}</div>`,
      play: keyboard(48, 8),
    };
  },
  'tb-303': (j) => {
    const f = keyFinder(j);
    const picks = [f('ladder', 'cutoff'), f('ladder', 'resonance'), f('ladder', 'drive'), f('fenv', 'amount'), f('fenv', 'decay'), f('amp', 'sustainTime')].filter(Boolean);
    return {
      logo: 'Acidbass', model: 'BB-303 · Computer Controlled Bass',
      theme: '--bg:linear-gradient(180deg,#cdd0d2,#9ea2a5);--ink:#1c1c1c;--dim:#4a4d50;--line:#888;--accent:#e07b1a;--accent2:#b85a10;--logoSh:none;--edge:inset 0 1px 0 #fff;--knob:radial-gradient(circle at 50% 35%,#2e3034,#101113 72%)',
      knobsHtml: `<div class="sect">${groupFromKnobs('Filter / Envelope', picks)}</div>`,
      play: keyboard(48, 8),
    };
  },
  'minimoog-lead': (j) => {
    const f = keyFinder(j);
    const osc = [f('g1', 'gain'), f('g2', 'gain'), f('g3', 'gain'), f('gN', 'gain')].filter(Boolean);
    const flt = [f('ladder', 'cutoff'), f('ladder', 'resonance'), f('ladder', 'drive'), f('fenv', 'amount'), f('fenv', 'attack'), f('fenv', 'decay'), f('fenv', 'sustain')].filter(Boolean);
    const amp = [f('aenv', 'attackTime'), f('aenv', 'sustainTime'), f('aenv', 'sustainLevel'), f('aenv', 'releaseTime')].filter(Boolean);
    const mod = [f('lfo', 'frequency'), f('gLfo', 'gain')].filter(Boolean);
    return {
      logo: 'minimog', model: 'Model-D · Monophonic',
      theme: '--bg:linear-gradient(180deg,#1d1a17,#0c0a08);--ink:#d8cfc2;--dim:#8a7f70;--line:#3a322a;--accent:#e0a458;--accent2:#9c6a25;--logoSh:0 0 10px rgba(224,164,88,.4);--edge:0 0 0 8px #2a1d12, 0 0 0 9px #1a110a;--knob:radial-gradient(circle at 50% 35%,#3a3a3a,#0e0e0e 72%)',
      knobsHtml: `<div class="sect">${groupFromKnobs('Oscillator Bank', osc)}${groupFromKnobs('Filter', flt)}${groupFromKnobs('Loudness', amp)}${groupFromKnobs('Mod', mod)}</div>`,
      play: keyboard(36, 8),
    };
  },
  'sh-101': (j) => {
    const f = keyFinder(j);
    const osc = [f('gSaw', 'gain'), f('gPulse', 'gain'), f('gSub', 'gain'), f('gN', 'gain')].filter(Boolean);
    const flt = [f('ladder', 'cutoff'), f('ladder', 'resonance'), f('ladder', 'drive'), f('fenv', 'amount'), f('fenv', 'attack'), f('fenv', 'decay'), f('fenv', 'sustain')].filter(Boolean);
    const amp = [f('aenv', 'attackTime'), f('aenv', 'sustainTime'), f('aenv', 'sustainLevel'), f('aenv', 'releaseTime')].filter(Boolean);
    const mod = [f('lfo', 'frequency'), f('gLfo', 'gain')].filter(Boolean);
    return {
      logo: 'Mono-101', model: 'Monophonic Synthesizer',
      theme: '--bg:linear-gradient(180deg,#43474c,#2a2d31);--ink:#dfe3e8;--dim:#9aa0a8;--line:#565b61;--accent:#e8543f;--accent2:#a83828;--logoSh:none;--edge:inset 0 1px 0 rgba(255,255,255,.1);--knob:radial-gradient(circle at 50% 35%,#16181b,#070809 72%)',
      knobsHtml: `<div class="sect">${groupFromKnobs('Source Mixer', osc)}${groupFromKnobs('Filter', flt)}${groupFromKnobs('Envelope', amp)}${groupFromKnobs('LFO', mod)}</div>`,
      play: keyboard(36, 8),
    };
  },
  'fm-epiano': (j) => {
    const f = keyFinder(j);
    const op = [f('fm', 'level1'), f('fm', 'ratio1'), f('fm', 'level3'), f('fm', 'feedback')].filter(Boolean);
    const env = [f('fm', 'attack'), f('fm', 'decay'), f('fm', 'sustain'), f('fm', 'release')].filter(Boolean);
    const tone = [f('ladder', 'cutoff'), f('ladder', 'resonance')].filter(Boolean);
    return {
      logo: 'FM-7', model: 'Digital FM · 6-Operator',
      theme: '--bg:linear-gradient(180deg,#10263d,#070f18);--ink:#cfe6ff;--dim:#5e84a8;--line:#1c344c;--accent:#4cc4ff;--accent2:#1f7fb8;--logoSh:0 0 12px rgba(76,196,255,.5);--edge:inset 0 1px 0 rgba(120,200,255,.12);--knob:radial-gradient(circle at 50% 35%,#1b3a55,#08151f 72%)',
      knobsHtml: `<div class="sect">${groupFromKnobs('Operators', op)}${groupFromKnobs('Envelope', env)}${groupFromKnobs('Tone', tone)}</div>`,
      play: keyboard(60, 8),
    };
  },
  'tr808-kick': (j) => drumPanel(j, 'Rhythm-808', 'RX-808 · Bass Drum', 'KICK'),
  'tr808-snare': (j) => drumPanel(j, 'Rhythm-808', 'RX-808 · Snare Drum', 'SNARE'),
  'tr808-hat': (j) => drumPanel(j, 'Rhythm-808', 'RX-808 · Hi-Hat', 'HAT'),
};

let fail = false;
for (const [file, build] of Object.entries(CONFIGS)) {
  const p = `${DIR}/${file}.json`;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const cfg = build(j);
  const html = panel(cfg);
  const knobKeys = new Set();
  for (const n of j.nodes) for (const k of (n.data.knobs || [])) knobKeys.add(`${n.id}.${k.param}`);
  const refs = [...html.matchAll(/data-(?:param|knob|readout)="([^"]+)"/g)].map((m) => m[1]);
  const bad = refs.filter((r) => !knobKeys.has(r));
  if (bad.length) { console.log(`✗ ${file}: unbound ${bad.join(', ')}`); fail = true; continue; }
  j.customUi = html;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  console.log(`✓ ${file} · ${refs.length} bindings · ${html.length}c`);
}
process.exit(fail ? 1 : 0);
