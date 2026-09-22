#!/usr/bin/env node
/**
 * Synflow public flow gallery — catalogue + thumbnail builder.
 *
 *   node scripts/build-flow-gallery.mjs
 *       Rebuild site/gallery/data/index.json and site/gallery/shots/<slug>.svg from
 *       every flow in site/gallery/data/*.json.
 *
 *   node scripts/build-flow-gallery.mjs publish <flow.json> [--name "Title"] [--desc "…"]
 *                                       [--tags a,b] [--author "Name"] [--search <dir>]…
 *       Add a flow to the gallery: copies it to site/gallery/data/<slug>.json, bundles
 *       any sub-flows (FlowNode → selectedNode) found by name in the --search folders
 *       (default: flow-examples), then rebuilds the catalogue.
 *
 * A gallery flow is a normal Synflow flow ({nodes, edges}) plus optional:
 *   name, description, author, tags[], dependencies{ <subflowName>: {nodes, edges} }
 * Open one in the editor with:  https://synflow.org/?import=<URL of the .json>
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'site', 'gallery', 'data');
const SHOTS = path.join(ROOT, 'site', 'gallery', 'shots');

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'flow';
const shortType = (t) => String(t || 'Node').replace(/FlowNode$|Node$/, '') || 'Node';

// ── thumbnails ────────────────────────────────────────────────────────────────
const CAT = {
  source: '#34d399', gain: '#38bdf8', mod: '#fbbf24', fx: '#c084fc', io: '#4da8ff', ctl: '#9aa3b8',
};
function category(type) {
  const t = shortType(type);
  if (/Oscillator|Noise|Sample|Mic|Karplus|Wavetable|FM|Brass|Granular|MidiFile|Recording/i.test(t)) return 'source';
  if (/Gain|Constant|Mixer|Panner|Unison/i.test(t)) return 'gain';
  if (/ADSR|LFO|EnvGen|Automation|Arpeggiator|Clock|SpeedDivider|Frequency|Shifter/i.test(t)) return 'mod';
  if (/Filter|Biquad|Reverb|Delay|Chorus|Distortion|Ladder|RingMod|Vocoder|Compressor|Svf/i.test(t)) return 'fx';
  if (/MasterOut|Input|Output|Flow$|^Flow/i.test(t)) return 'io';
  return 'ctl';
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function flowToSvg(flow) {
  const nodes = (flow.nodes || []).filter((n) => n && n.position);
  if (!nodes.length) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 6"/>';
  const size = (n) => ({ w: n.measured?.width || n.width || 150, h: n.measured?.height || n.height || 56 });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    const { w, h } = size(n);
    x0 = Math.min(x0, n.position.x); y0 = Math.min(y0, n.position.y);
    x1 = Math.max(x1, n.position.x + w); y1 = Math.max(y1, n.position.y + h);
  }
  const pad = 40;
  const vw = x1 - x0 + pad * 2, vh = y1 - y0 + pad * 2;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = (flow.edges || []).map((e) => {
    const a = byId.get(e.source), b = byId.get(e.target);
    if (!a || !b) return '';
    const sa = size(a), sb = size(b);
    const ax = a.position.x + sa.w - x0 + pad, ay = a.position.y + sa.h / 2 - y0 + pad;
    const bx = b.position.x - x0 + pad, by = b.position.y + sb.h / 2 - y0 + pad;
    const dx = Math.max(40, Math.abs(bx - ax) / 2);
    return `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)}C${(ax + dx).toFixed(1)} ${ay.toFixed(1)} ${(bx - dx).toFixed(1)} ${by.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}"/>`;
  }).join('');
  const boxes = nodes.map((n) => {
    const { w, h } = size(n);
    const c = CAT[category(n.type)];
    const x = n.position.x - x0 + pad, y = n.position.y - y0 + pad;
    const label = esc(String(n.data?.label || shortType(n.type)).slice(0, 22));
    const bh = Math.min(h, 56);
    return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${bh}" rx="8" fill="#121324" stroke="${c}" stroke-opacity=".7" stroke-width="2"/>`
      + `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="6" height="${bh}" rx="3" fill="${c}"/>`
      + `<text x="${(x + 16).toFixed(1)}" y="${(y + bh / 2 + 6).toFixed(1)}" font-size="17" fill="#eef1f8">${label}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}" font-family="ui-sans-serif,system-ui,sans-serif">`
    + `<rect width="100%" height="100%" fill="#0a0b0f"/>`
    + `<g fill="none" stroke="#4da8ff" stroke-opacity=".45" stroke-width="2.5">${edges}</g>${boxes}</svg>`;
}

// ── catalogue ─────────────────────────────────────────────────────────────────
async function rebuild() {
  await fs.mkdir(SHOTS, { recursive: true });
  const files = (await fs.readdir(DATA)).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const rows = [];
  for (const f of files) {
    const slug = f.slice(0, -5);
    let doc;
    try { doc = JSON.parse(await fs.readFile(path.join(DATA, f), 'utf8')); }
    catch (e) { console.warn(`! skipping ${f}: ${e.message}`); continue; }
    if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) { console.warn(`! skipping ${f}: not a flow`); continue; }
    const types = {};
    for (const n of doc.nodes) { const t = shortType(n.type); if (t) types[t] = (types[t] || 0) + 1; }
    const topTypes = Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => ({ type: t, count: n }));
    const cats = new Set(doc.nodes.map((n) => category(n.type)));
    await fs.writeFile(path.join(SHOTS, `${slug}.svg`), flowToSvg(doc));
    rows.push({
      slug,
      name: doc.name || slug,
      description: doc.description || '',
      author: doc.author || '',
      tags: Array.isArray(doc.tags) ? doc.tags : [],
      nodes: doc.nodes.length,
      edges: doc.edges.length,
      nodeTypes: topTypes,
      hasCustomUi: typeof doc.customUi === 'string' && !!doc.customUi.trim(),
      dependencies: Object.keys(doc.dependencies || {}),
      makesSound: doc.nodes.some((n) => /MasterOut/.test(n.type)),
      needsMic: doc.nodes.some((n) => /Mic/.test(n.type)),
      needsMidi: doc.nodes.some((n) => /Midi/.test(n.type)),
      categories: [...cats],
      publishedAt: doc.publishedAt || 0,
    });
  }
  rows.sort((a, b) => (b.publishedAt - a.publishedAt) || a.name.localeCompare(b.name));
  await fs.writeFile(path.join(DATA, 'index.json'), JSON.stringify(rows, null, 1) + '\n');
  console.log(`gallery: ${rows.length} flows → site/gallery/data/index.json`);
}

// ── publish ───────────────────────────────────────────────────────────────────
async function findFlow(name, dirs) {
  const walk = async (dir) => {
    let ents; try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { const r = await walk(p); if (r) return r; }
      else if (e.name === `${name}.json`) return p;
    }
    return null;
  };
  for (const d of dirs) { const r = await walk(d); if (r) return JSON.parse(await fs.readFile(r, 'utf8')); }
  return null;
}

async function bundleDeps(doc, dirs, out = {}) {
  for (const n of doc.nodes || []) {
    const dep = n.type === 'FlowNode' ? n.data?.selectedNode : null;
    if (!dep || out[dep]) continue;
    const sub = await findFlow(dep, dirs);
    if (!sub) { console.warn(`! sub-flow "${dep}" not found in search dirs — flow will miss it`); continue; }
    out[dep] = { nodes: sub.nodes || [], edges: sub.edges || [] };
    await bundleDeps(sub, dirs, out);
  }
  return out;
}

async function publish(argv) {
  const file = argv[0];
  if (!file) { console.error('usage: publish <flow.json> [--name] [--desc] [--tags a,b] [--author] [--search dir]'); process.exit(1); }
  const opt = { search: [] };
  for (let i = 1; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, ''), v = argv[i + 1];
    if (k === 'search') opt.search.push(path.resolve(v)); else opt[k] = v;
  }
  const doc = JSON.parse(await fs.readFile(file, 'utf8'));
  const name = opt.name || doc.name || path.basename(file, '.json');
  const dirs = opt.search.length ? opt.search : [path.join(ROOT, 'flow-examples')];
  const out = {
    name,
    description: opt.desc || doc.description || '',
    author: opt.author || doc.author || '',
    tags: opt.tags ? opt.tags.split(',').map((t) => t.trim()).filter(Boolean) : (doc.tags || []),
    publishedAt: doc.publishedAt || Date.now(),
    nodes: doc.nodes, edges: doc.edges,
    ...(typeof doc.customUi === 'string' && doc.customUi ? { customUi: doc.customUi } : {}),
  };
  const deps = await bundleDeps(doc, dirs);
  if (Object.keys(deps).length) out.dependencies = deps;
  await fs.mkdir(DATA, { recursive: true });
  const slug = slugify(name);
  await fs.writeFile(path.join(DATA, `${slug}.json`), JSON.stringify(out));
  console.log(`published "${name}" → site/gallery/data/${slug}.json`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === 'publish') { await publish(rest); await rebuild(); } else await rebuild();
}
