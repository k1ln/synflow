// validate.mjs
// =====================================================================
//  Validation + inspection of a gallery submission. Shared by the publish
//  proxy (reject early) and scripts/publish-from-issue.mjs (re-check before
//  anything lands in the repo) — the issue is data, so it is never trusted.
//
//  Pure functions, no I/O, only globalThis.crypto → runs on Node, Cloudflare
//  Workers and Scaleway Functions alike.
// =====================================================================

export const LIMITS = {
  maxFlowBytes: 2_000_000,   // serialized submission, before compression
  maxNodes: 1500,
  maxEdges: 4000,
  maxDependencies: 40,
  maxNameLength: 60,
  maxDescriptionLength: 600,
  maxTags: 6,
  maxTagLength: 24,
  maxCustomUiBytes: 100_000,
};

// node.data keys whose string values run as code / markup inside the editor.
// Not blocked — plenty of legit flows use them — but surfaced to the reviewer.
// Suffix match, so camelCase keys count too (functionCode, processorCode, assemblyScript, wasmBase64…).
const EXECUTABLE_KEY = /(code|script|html|wasmbase64)$/i;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'flow';
}

export async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Strip control characters and collapse whitespace (single line). */
export function cleanLine(s) {
  // eslint-disable-next-line no-control-regex
  return String(s ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * User-written text → safe to embed in a GitHub issue: no @mentions or #123
 * cross-references (notification spam), no raw HTML.
 */
export function neutralizeMarkdown(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/@/g, '@\u200b')
    .replace(/#(?=\d)/g, '#\u200b')
    .replace(/`/g, "'");
}

/** → { ok: true, value: {name, description, tags} } | { ok: false, error } */
export function validateMeta(input) {
  const m = isObj(input) ? input : {};
  const name = cleanLine(m.name);
  if (name.length < 2) return { ok: false, error: 'Give the flow a name (at least 2 characters).' };
  if (name.length > LIMITS.maxNameLength) return { ok: false, error: `Name is too long (max ${LIMITS.maxNameLength}).` };
  // Descriptions may contain line breaks; everything else is flattened.
  const description = String(m.description ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (description.length < 10) return { ok: false, error: 'Describe what the flow does (at least 10 characters).' };
  if (description.length > LIMITS.maxDescriptionLength) return { ok: false, error: `Description is too long (max ${LIMITS.maxDescriptionLength}).` };
  const rawTags = Array.isArray(m.tags) ? m.tags : [];
  const tags = [];
  for (const t of rawTags) {
    const tag = cleanLine(t).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (tag && tag.length <= LIMITS.maxTagLength && !tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > LIMITS.maxTags) return { ok: false, error: `Use at most ${LIMITS.maxTags} tags.` };
  return { ok: true, value: { name, description, tags } };
}

function checkGraph(g, where) {
  if (!isObj(g) || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) return `${where}: needs nodes[] and edges[].`;
  if (g.nodes.length === 0) return `${where}: has no nodes.`;
  if (g.nodes.length > LIMITS.maxNodes) return `${where}: too many nodes (max ${LIMITS.maxNodes}).`;
  if (g.edges.length > LIMITS.maxEdges) return `${where}: too many edges (max ${LIMITS.maxEdges}).`;
  const ids = new Set();
  for (const n of g.nodes) {
    if (!isObj(n) || typeof n.id !== 'string' || !n.id || n.id.length > 200) return `${where}: a node has no valid id.`;
    if (typeof n.type !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(n.type)) return `${where}: node "${String(n.id).slice(0, 40)}" has an invalid type.`;
    if (!isObj(n.position) || !Number.isFinite(n.position.x) || !Number.isFinite(n.position.y)) return `${where}: node "${n.id.slice(0, 40)}" has no position.`;
    if (n.data !== undefined && !isObj(n.data)) return `${where}: node "${n.id.slice(0, 40)}" has invalid data.`;
    if (ids.has(n.id)) return `${where}: duplicate node id "${n.id.slice(0, 40)}".`;
    ids.add(n.id);
  }
  for (const e of g.edges) {
    if (!isObj(e) || typeof e.source !== 'string' || typeof e.target !== 'string') return `${where}: an edge is malformed.`;
  }
  return null;
}

/** → error string, or null when the submission document is acceptable. */
export function validateFlow(doc) {
  if (!isObj(doc)) return 'Flow must be a JSON object.';
  const bad = checkGraph(doc, 'Flow');
  if (bad) return bad;
  if (doc.customUi !== undefined) {
    if (typeof doc.customUi !== 'string') return 'customUi must be a string.';
    if (doc.customUi.length > LIMITS.maxCustomUiBytes) return 'customUi is too large.';
  }
  if (doc.dependencies !== undefined) {
    if (!isObj(doc.dependencies)) return 'dependencies must be an object.';
    const names = Object.keys(doc.dependencies);
    if (names.length > LIMITS.maxDependencies) return `Too many sub-flows (max ${LIMITS.maxDependencies}).`;
    for (const name of names) {
      if (!name || name.length > 120 || /[\\/]/.test(name)) return 'A sub-flow has an invalid name.';
      const b = checkGraph(doc.dependencies[name], `Sub-flow "${name.slice(0, 40)}"`);
      if (b) return b;
    }
  }
  if (JSON.stringify(doc).length > LIMITS.maxFlowBytes) {
    return `Flow is too large (max ${(LIMITS.maxFlowBytes / 1e6).toFixed(0)} MB — embedded audio samples are the usual cause).`;
  }
  return null;
}

/** Facts for the reviewer: what the flow is made of and what could run code. */
export function inspectFlow(doc) {
  const graphs = [doc, ...Object.values(doc.dependencies || {})];
  const types = new Map();
  const executable = new Map();
  let nodes = 0, edges = 0, diskSamples = 0;
  for (const g of graphs) {
    nodes += g.nodes.length; edges += g.edges.length;
    for (const n of g.nodes) {
      types.set(n.type, (types.get(n.type) || 0) + 1);
      const data = isObj(n.data) ? n.data : {};
      if (n.type === 'SampleFlowNode' && data.diskFileName && !data.arrayBuffer) diskSamples++;
      for (const [k, v] of Object.entries(data)) {
        if (EXECUTABLE_KEY.test(k) && typeof v === 'string' && v.trim()) {
          const key = `${n.type}.${k}`;
          executable.set(key, (executable.get(key) || 0) + 1);
        }
      }
    }
  }
  if (typeof doc.customUi === 'string' && doc.customUi.trim()) executable.set('flow.customUi', 1);
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  return { nodes, edges, diskSamples, types: top(types), executable: top(executable) };
}
