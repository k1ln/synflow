import { browserFlowLoader } from './browserFlowLoader';

// Client for the publish proxy (publish-proxy/): "Publish to GitHub" opens a review issue on the
// gallery repo. The proxy owns every rule that matters (sign-in, quota, validation) — this file
// only talks to it. Configure the proxy's base URL at build time with VITE_SYNFLOW_PUBLISH_URL.

export const PUBLISH_URL: string = String((import.meta as any).env?.VITE_SYNFLOW_PUBLISH_URL || '').replace(/\/+$/, '');
export const isPublishConfigured = (): boolean => PUBLISH_URL.length > 0;

// Mirrors publish-proxy/validate.mjs for instant feedback; the server's answer is authoritative.
export const PUBLISH_LIMITS = { name: 60, descriptionMin: 10, descriptionMax: 600, maxTags: 6 } as const;

export interface PublishSession { token: string; login: string; expiresAt: number }
export interface PublishQuota {
  login: string; limit: number; used: number; remaining: number;
  resetsAt: number | null;        // when the next slot frees up (only when remaining === 0)
  cooldownEndsAt: number | null;  // short pause between two publishes
  eligibleAt: number | null;      // account too young until then
}
export interface PublishResult { url: string; number: number; remaining: number; limit: number; message: string }
export interface FlowGraph { nodes: any[]; edges: any[]; customUi?: string }

export class PublishError extends Error {
  constructor(message: string, readonly status = 0, readonly retryAfterMs = 0) { super(message); }
}

// ── session ───────────────────────────────────────────────────────────────────
// sessionStorage on purpose: gone when the tab closes, so a stolen value has a short life. Flows
// can contain script nodes, and the proxy limits what a stolen session could do anyway
// (a few publishes a day, each needing a maintainer's approval).
const SESSION_KEY = 'synflow:publish-session';

export function loadSession(): PublishSession | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (s && typeof s.token === 'string' && typeof s.login === 'string' && s.expiresAt > Date.now() + 30_000) return s;
  } catch { /* storage unavailable or corrupt */ }
  return null;
}
export function clearSession(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
}
function saveSession(s: PublishSession): void {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

/**
 * GitHub sign-in in a popup. Must be called straight from a click handler (before any `await`)
 * or the browser will block the popup. The proxy answers with postMessage; we only accept it from
 * the proxy's origin and only with the nonce we generated for this attempt.
 */
export function signIn(): Promise<PublishSession> {
  return new Promise((resolve, reject) => {
    if (!isPublishConfigured()) return reject(new PublishError('Publishing is not configured for this build.'));
    const proxyOrigin = new URL(PUBLISH_URL).origin;
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 32);
    const url = `${PUBLISH_URL}/auth/login?${new URLSearchParams({ origin: window.location.origin, nonce })}`;
    const popup = window.open(url, 'synflow-publish-auth', 'popup,width=560,height=720');
    if (!popup) return reject(new PublishError('The sign-in window was blocked — allow pop-ups for this site and try again.'));

    const done = (fn: () => void) => { window.removeEventListener('message', onMessage); clearInterval(poll); fn(); };
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (e.origin !== proxyOrigin || !d || d.type !== 'synflow-publish-auth' || d.nonce !== nonce) return;
      if (d.error || typeof d.token !== 'string') return done(() => reject(new PublishError(String(d.error || 'Sign-in failed.'))));
      const session = { token: d.token, login: String(d.login), expiresAt: Number(d.expiresAt) };
      saveSession(session);
      done(() => resolve(session));
    };
    window.addEventListener('message', onMessage);
    const poll = setInterval(() => { if (popup.closed) setTimeout(() => done(() => reject(new PublishError('Sign-in cancelled.'))), 600); }, 500);
  });
}

// ── API ───────────────────────────────────────────────────────────────────────
async function api<T>(path: string, session: PublishSession, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${PUBLISH_URL}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${session.token}` } });
  } catch {
    throw new PublishError('Could not reach the publish service. Check your connection and try again.');
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return body as T;
  if (res.status === 401) clearSession();
  throw new PublishError(String(body.error || `Publish failed (${res.status}).`), res.status, (Number(res.headers.get('Retry-After')) || 0) * 1000);
}

export const fetchQuota = (s: PublishSession) => api<PublishQuota>('/api/quota', s);

export const publishFlow = (s: PublishSession, meta: { name: string; description: string; tags: string[] }, flow: object) =>
  api<PublishResult>('/api/publish', s, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...meta, license: 'MIT', flow }),
  });

// ── building the submission ───────────────────────────────────────────────────
/** Every sub-flow (FlowNode → selectedNode), recursively, keyed by name — the gallery's `dependencies`. */
async function collectDependencies(nodes: any[], out: Record<string, { nodes: any[]; edges: any[] }> = {}) {
  for (const n of nodes) {
    const name = n?.type === 'FlowNode' ? n.data?.selectedNode : null;
    if (!name || out[name]) continue;
    const sub = await browserFlowLoader(name, n.data?.selectedNodeFolderPath || '');
    if (!sub) continue;   // the gallery CLI would also just warn; the reviewer sees the missing sub-flow
    out[name] = { nodes: sub.nodes, edges: sub.edges };
    await collectDependencies(sub.nodes, out);
  }
  return out;
}

// Editor-only state that doesn't belong in a published file.
const cleanNode = (n: any) => {
  const { selected: _s, dragging: _d, ...rest } = n;
  return rest;
};

export async function buildSubmissionFlow(graph: FlowGraph) {
  const nodes = JSON.parse(JSON.stringify(graph.nodes)).map(cleanNode);
  const edges = JSON.parse(JSON.stringify(graph.edges));
  const dependencies = await collectDependencies(nodes);
  return {
    nodes, edges,
    ...(graph.customUi ? { customUi: graph.customUi } : {}),
    ...(Object.keys(dependencies).length ? { dependencies } : {}),
  };
}

/** What the reviewer will be told about — shown to the author before they send. */
export function describeFlow(graph: FlowGraph) {
  const scripty = /(code|script|html|wasmbase64)$/i;   // keep in sync with publish-proxy/validate.mjs
  let runsCode = !!graph.customUi?.trim();
  let diskSamples = 0;
  for (const n of graph.nodes) {
    const data = n?.data || {};
    if (n.type === 'SampleFlowNode' && data.diskFileName && !data.arrayBuffer) diskSamples++;
    if (!runsCode) runsCode = Object.entries(data).some(([k, v]) => scripty.test(k) && typeof v === 'string' && v.trim());
  }
  return { nodes: graph.nodes.length, edges: graph.edges.length, runsCode, diskSamples };
}

export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(/[,\n]+/).map((t) => t.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')).filter(Boolean))];
}
