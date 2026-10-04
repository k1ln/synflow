// @ts-nocheck — Node-only test of plain .mjs modules; the repo has no @types/node to check it against
import { describe, it, expect, beforeEach } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { createHash, randomBytes } from 'node:crypto';
import { handleRequest, readEnv } from '../publish-proxy/core.mjs';
import { validateFlow, validateMeta, inspectFlow } from '../publish-proxy/validate.mjs';
import { fakeGithub, USERS, NOW } from './helpers/fakeGithub';

const ORIGIN = 'https://synflow.org';
const ENV = readEnv({
  GITHUB_TOKEN: 'ghp_test', OAUTH_CLIENT_ID: 'cid', OAUTH_CLIENT_SECRET: 'csecret',
  SESSION_SECRET: 'x'.repeat(40), PUBLIC_URL: 'https://publish.example',
  COOLDOWN_SECONDS: '0', DAILY_LIMIT: '3', MIN_ACCOUNT_AGE_DAYS: '7', GLOBAL_DAILY_LIMIT: '10', MAX_OPEN_REQUESTS: '10',
});

const flow = (extra = {}) => ({
  nodes: [
    { id: 'osc', type: 'OscillatorFlowNode', position: { x: 0, y: 0 }, data: { frequency: 440 } },
    { id: 'out', type: 'MasterOutFlowNode', position: { x: 200, y: 0 }, data: {} },
  ],
  edges: [{ id: 'e1', source: 'osc', target: 'out' }],
  ...extra,
});
const submission = (over = {}) => ({ name: 'Warm Pad', description: 'A slow, warm pad with a detuned saw.', tags: ['pad', 'Warm'], license: 'MIT', flow: flow(), ...over });

let gh: ReturnType<typeof fakeGithub>;
beforeEach(() => { gh = fakeGithub(USERS); });

const call = (req: any, env = ENV, now = NOW) =>
  handleRequest({ query: new URLSearchParams(), headers: {}, body: '', ...req }, env, { fetch: gh.fetch, now });

/** Full sign-in through the real login → callback routes; returns the session token. */
async function signIn(who = 'alice', env = ENV): Promise<string> {
  const login = await call({ method: 'GET', path: '/auth/login', query: new URLSearchParams({ origin: ORIGIN, nonce: 'n'.repeat(24) }) }, env);
  const state = new URL(login.headers.Location).searchParams.get('state')!;
  const cb = await call({ method: 'GET', path: '/auth/callback', query: new URLSearchParams({ code: who, state }) }, env);
  const m = /"token":"([^"]+)"/.exec(cb.body);
  if (!m) throw new Error('no token in callback page: ' + cb.body);
  return m[1];
}
const publish = (token: string | null, body: any, env = ENV, now = NOW) => call({
  method: 'POST', path: '/api/publish', headers: { origin: ORIGIN, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}, env, now);

describe('sign-in', () => {
  it('redirects to GitHub with a signed state and no scopes', async () => {
    const r = await call({ method: 'GET', path: '/auth/login', query: new URLSearchParams({ origin: ORIGIN, nonce: 'n'.repeat(24) }) });
    expect(r.status).toBe(302);
    const u = new URL(r.headers.Location);
    expect(u.origin + u.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(u.searchParams.get('client_id')).toBe('cid');
    expect(u.searchParams.get('redirect_uri')).toBe('https://publish.example/auth/callback');
    expect(u.searchParams.has('scope')).toBe(false);
  });

  it('refuses origins that are not allow-listed (no open redirect / token leak)', async () => {
    const r = await call({ method: 'GET', path: '/auth/login', query: new URLSearchParams({ origin: 'https://evil.example', nonce: 'n'.repeat(24) }) });
    expect(r.status).toBe(400);
    expect(r.headers.Location).toBeUndefined();
  });

  it('posts the session only to the origin baked into the signed state, then revokes the GitHub token', async () => {
    const login = await call({ method: 'GET', path: '/auth/login', query: new URLSearchParams({ origin: ORIGIN, nonce: 'n'.repeat(24) }) });
    const state = new URL(login.headers.Location).searchParams.get('state')!;
    const cb = await call({ method: 'GET', path: '/auth/callback', query: new URLSearchParams({ code: 'alice', state }) });
    expect(cb.body).toContain(`postMessage(`);
    expect(cb.body).toContain(`"${ORIGIN}"`);
    expect(cb.body).toContain('"login":"alice"');
    expect(gh.st.tokenRevoked).toBe(true);
  });

  it('rejects a forged or tampered state', async () => {
    const cb = await call({ method: 'GET', path: '/auth/callback', query: new URLSearchParams({ code: 'alice', state: 'e30.AAAA' }) });
    expect(cb.status).toBe(400);
    expect(cb.body).not.toContain('"token"');
  });

  it('rejects an expired state', async () => {
    const login = await call({ method: 'GET', path: '/auth/login', query: new URLSearchParams({ origin: ORIGIN, nonce: 'n'.repeat(24) }) });
    const state = new URL(login.headers.Location).searchParams.get('state')!;
    const cb = await call({ method: 'GET', path: '/auth/callback', query: new URLSearchParams({ code: 'alice', state }) }, ENV, NOW + 11 * 60 * 1000);
    expect(cb.status).toBe(400);
  });

  it('does not issue sessions to organisation accounts', async () => {
    const login = await call({ method: 'GET', path: '/auth/login', query: new URLSearchParams({ origin: ORIGIN, nonce: 'n'.repeat(24) }) });
    const state = new URL(login.headers.Location).searchParams.get('state')!;
    const cb = await call({ method: 'GET', path: '/auth/callback', query: new URLSearchParams({ code: 'bot', state }) });
    expect(cb.body).not.toContain('"token"');
  });
});

describe('publish: authentication & eligibility', () => {
  it('requires a session', async () => {
    expect((await publish(null, submission())).status).toBe(401);
  });

  it('rejects a tampered session token', async () => {
    const t = await signIn();
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), uid: 9999 })).toString('base64url');
    expect((await publish(`${forged}.${sig}`, submission())).status).toBe(401);
  });

  it('rejects an expired session', async () => {
    const t = await signIn();
    expect((await publish(t, submission(), ENV, NOW + 7 * 3600 * 1000)).status).toBe(401);
  });

  it('rejects a state token used as a session (token-type confusion)', async () => {
    const login = await call({ method: 'GET', path: '/auth/login', query: new URLSearchParams({ origin: ORIGIN, nonce: 'n'.repeat(24) }) });
    const state = new URL(login.headers.Location).searchParams.get('state')!;
    expect((await publish(state, submission())).status).toBe(401);
  });

  it('blocks accounts younger than MIN_ACCOUNT_AGE_DAYS', async () => {
    const r = await publish(await signIn('newbie'), submission());
    expect(r.status).toBe(403);
    expect(gh.st.issues).toHaveLength(0);
  });

  it('honours the block list', async () => {
    const env = readEnv({ ...ENV_RAW(), BLOCKED_USERS: 'Alice' });
    const r = await publish(await signIn('alice', env), submission(), env);
    expect(r.status).toBe(403);
  });

  it('rejects a disallowed Origin header', async () => {
    const t = await signIn();
    const r = await call({ method: 'POST', path: '/api/publish', headers: { origin: 'https://evil.example', authorization: `Bearer ${t}` }, body: JSON.stringify(submission()) });
    expect(r.status).toBe(403);
  });
});

function ENV_RAW() {
  return {
    GITHUB_TOKEN: 'ghp_test', OAUTH_CLIENT_ID: 'cid', OAUTH_CLIENT_SECRET: 'csecret', SESSION_SECRET: 'x'.repeat(40),
    PUBLIC_URL: 'https://publish.example', COOLDOWN_SECONDS: '0', DAILY_LIMIT: '3', MIN_ACCOUNT_AGE_DAYS: '7',
  };
}

describe('publish: happy path', () => {
  it('opens a labelled issue and attaches the gzipped flow, verifiable against the SHA-256 in the marker', async () => {
    const r = await publish(await signIn(), submission());
    expect(r.status).toBe(200);
    const out = JSON.parse(r.body);
    expect(out).toMatchObject({ number: 1, remaining: 2, limit: 3 });

    const issue = gh.st.issues[0];
    expect(issue.title).toBe('Publish: Warm Pad');
    expect(issue.labels).toEqual(['publish-request', 'by-1001']);
    const marker = JSON.parse(/<!-- synflow-submission (\{.*?\}) -->/.exec(issue.body)![1]);
    expect(marker).toMatchObject({ v: 1, uid: 1001, login: 'alice', chunks: 1 });

    const data = /```\n([^`]+)\n```/.exec(gh.st.comments[1][0])![1];
    const text = gunzipSync(Buffer.from(data, 'base64')).toString();
    expect(createHash('sha256').update(text).digest('hex')).toBe(marker.sha256);
    expect(JSON.parse(text)).toMatchObject({ name: 'Warm Pad', author: 'alice', tags: ['pad', 'warm'] });
  });

  it('takes the author from the verified GitHub login, ignoring client-supplied identity', async () => {
    await publish(await signIn(), submission({ author: 'Linus Torvalds', flow: { ...flow(), author: 'Linus Torvalds' } }));
    const data = /```\n([^`]+)\n```/.exec(gh.st.comments[1][0])![1];
    expect(JSON.parse(gunzipSync(Buffer.from(data, 'base64')).toString()).author).toBe('alice');
  });

  it('neutralises @mentions, #refs and HTML in user text', async () => {
    await publish(await signIn(), submission({ name: 'Hi @octocat', description: 'ping @torvalds, fixes #123 <img src=x onerror=alert(1)>' }));
    const { body } = gh.st.issues[0];
    expect(body).not.toMatch(/@(?!\u200b)\w/);   // every @ is followed by a zero-width space
    expect(body).not.toContain('<img');
    expect(body).not.toContain('#123');
  });

  it('labels flows that carry executable content and lists them for the reviewer', async () => {
    const f = flow();
    f.nodes[0].type = 'AudioWorkletFlowNode';
    f.nodes[0].data = { processorCode: 'class P extends AudioWorkletProcessor {}' };
    await publish(await signIn(), submission({ flow: f }));
    expect(gh.st.issues[0].labels).toContain('runs-code');
    expect(gh.st.issues[0].body).toContain('AudioWorkletFlowNode.processorCode');
  });

  it('splits large flows across several comments', async () => {
    // Incompressible padding so the gzip output really spans multiple 60k chunks.
    const f = flow();
    f.nodes[0].data = { arrayBuffer: randomBytes(300_000).toString('base64') };
    const r = await publish(await signIn(), submission({ flow: f }));
    expect(r.status).toBe(200);
    const n = gh.st.comments[1].length;
    expect(n).toBeGreaterThan(1);
    const marker = JSON.parse(/<!-- synflow-submission (\{.*?\}) -->/.exec(gh.st.issues[0].body)![1]);
    expect(marker.chunks).toBe(n);
    const data = gh.st.comments[1].map((c) => /```\n([^`]+)\n```/.exec(c)![1]).join('');
    expect(createHash('sha256').update(gunzipSync(Buffer.from(data, 'base64'))).digest('hex')).toBe(marker.sha256);
  });

  it('closes the issue if the flow data could not be fully attached', async () => {
    gh.st.failComments = true;
    const r = await publish(await signIn(), submission());
    expect(r.status).toBe(502);
    expect(gh.st.issues[0].state).toBe('closed');
  });
});

describe('publish: validation', () => {
  it.each([
    ['not json', '{nope'],
    ['no name', submission({ name: ' ' })],
    ['short description', submission({ description: 'meh' })],
    ['no license confirmation', submission({ license: undefined })],
    ['no flow', submission({ flow: undefined })],
    ['empty flow', submission({ flow: { nodes: [], edges: [] } })],
    ['node without position', submission({ flow: { nodes: [{ id: 'a', type: 'X' }], edges: [] } })],
    ['weird node type', submission({ flow: { nodes: [{ id: 'a', type: '../../x', position: { x: 0, y: 0 } }], edges: [] } })],
    ['too many tags', submission({ tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })],
  ])('400s on %s', async (_name, body) => {
    const r = await publish(await signIn(), body);
    expect(r.status).toBe(400);
    expect(gh.st.issues).toHaveLength(0);
  });

  it('413s on an oversized payload before parsing it', async () => {
    const r = await publish(await signIn(), 'x'.repeat(2_200_000));
    expect(r.status).toBe(413);
  });
});

describe('publish: anti-spam', () => {
  it('allows DAILY_LIMIT publishes per account, then 429s with Retry-After', async () => {
    const t = await signIn();
    for (let i = 0; i < 3; i++) {
      gh.st.now = NOW + i * 1000;
      expect((await publish(t, submission({ name: `Flow ${i}` }), ENV, NOW + i * 1000)).status).toBe(200);
    }
    const r = await publish(t, submission({ name: 'One too many' }), ENV, NOW + 5000);
    expect(r.status).toBe(429);
    expect(JSON.parse(r.body)).toMatchObject({ used: 3, remaining: 0 });
    expect(Number(r.headers['Retry-After'])).toBeGreaterThan(86000);
    expect(gh.st.issues).toHaveLength(3);
  });

  it('cannot be dodged by signing in again — the quota belongs to the GitHub id', async () => {
    for (let i = 0; i < 3; i++) await publish(await signIn(), submission({ name: `Flow ${i}` }));
    expect((await publish(await signIn(), submission())).status).toBe(429);
  });

  it('frees a slot once the oldest publish is 24 h old (rolling window)', async () => {
    const t = await signIn();
    gh.st.now = NOW; await publish(t, submission({ name: 'Flow a' }));
    gh.st.now = NOW + 3600_000; await publish(t, submission({ name: 'Flow b' }), ENV, NOW + 3600_000);
    gh.st.now = NOW + 2 * 3600_000; await publish(t, submission({ name: 'Flow c' }), ENV, NOW + 2 * 3600_000);
    const later = NOW + 24 * 3600_000 + 1000;
    const longEnv = readEnv({ ...ENV_RAW(), SESSION_HOURS: '72' });
    const t2 = await signIn('alice', longEnv); // fresh session (the first one expired)
    gh.st.now = later;
    // oldest (NOW) has aged out, the other two haven't → exactly one slot is free
    expect((await publish(t2, submission({ name: 'Flow d' }), longEnv, later)).status).toBe(200);
    expect((await publish(t2, submission({ name: 'Flow e' }), longEnv, later + 1000)).status).toBe(429);
  });

  it('enforces a cooldown between publishes', async () => {
    const env = readEnv({ ...ENV_RAW(), COOLDOWN_SECONDS: '120' });
    const t = await signIn('alice', env);
    expect((await publish(t, submission({ name: 'Flow a' }), env)).status).toBe(200);
    const r = await publish(t, submission({ name: 'Flow b' }), env, NOW + 30_000);
    expect(r.status).toBe(429);
    expect(Number(r.headers['Retry-After'])).toBeLessThanOrEqual(90);
    expect((await publish(t, submission({ name: 'Flow b' }), env, NOW + 121_000)).status).toBe(200);
  });

  it('serialises parallel requests from one account so a burst cannot beat the quota', async () => {
    const t = await signIn();
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => publish(t, submission({ name: `Burst ${i}` }))));
    const ok = results.filter((r) => r.status === 200).length;
    expect(ok).toBeLessThanOrEqual(3);
    expect(gh.st.issues.length).toBeLessThanOrEqual(3);
  });

  it('trips a global circuit breaker when the review queue is full', async () => {
    const env = readEnv({ ...ENV_RAW(), MAX_OPEN_REQUESTS: '2' });
    for (let i = 0; i < 2; i++) gh.st.issues.push({ number: 100 + i, title: 'x', body: '', labels: ['publish-request', `by-${50 + i}`], state: 'open', created_at: new Date(NOW - 1000).toISOString(), html_url: '' });
    const r = await publish(await signIn('alice', env), submission(), env);
    expect(r.status).toBe(503);
    expect(gh.st.issues).toHaveLength(2);
  });

  it('exposes the remaining quota to the editor', async () => {
    const t = await signIn();
    await publish(t, submission());
    const r = await call({ method: 'GET', path: '/api/quota', headers: { origin: ORIGIN, authorization: `Bearer ${t}` } });
    expect(JSON.parse(r.body)).toMatchObject({ login: 'alice', limit: 3, used: 1, remaining: 2 });
    expect(r.headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
  });
});

describe('plumbing', () => {
  it('answers CORS preflight only for allowed origins', async () => {
    const ok = await call({ method: 'OPTIONS', path: '/api/publish', headers: { origin: ORIGIN } });
    expect(ok.status).toBe(204);
    expect(ok.headers['Access-Control-Allow-Origin']).toBe(ORIGIN);
    const bad = await call({ method: 'OPTIONS', path: '/api/publish', headers: { origin: 'https://evil.example' } });
    expect(bad.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('refuses to run when misconfigured and names what is missing (never values)', async () => {
    const r = await call({ method: 'GET', path: '/api/quota' }, readEnv({}));
    expect(r.status).toBe(500);
    expect(r.body).toContain('GITHUB_TOKEN');
  });
});

describe('validate.mjs', () => {
  it('accepts a minimal flow and rejects duplicate node ids', () => {
    expect(validateFlow(flow())).toBeNull();
    const dup = flow(); dup.nodes[1].id = 'osc';
    expect(validateFlow(dup)).toMatch(/duplicate/);
  });
  it('validates bundled sub-flows too', () => {
    expect(validateFlow(flow({ dependencies: { kick: { nodes: [], edges: [] } } }))).toMatch(/Sub-flow/);
    expect(validateFlow(flow({ dependencies: { 'a/b': flow() } }))).toMatch(/invalid name/);
  });
  it('normalises tags', () => {
    expect(validateMeta({ name: 'ok', description: 'long enough text', tags: ['Synth Lead', 'synth-lead', ''] }).value.tags).toEqual(['synth-lead']);
  });
  it('flags camelCase code fields such as FunctionFlowNode.functionCode, but not plain text fields', () => {
    const f = flow();
    f.nodes[0].type = 'FunctionFlowNode';
    f.nodes[0].data = { functionCode: 'function process(v){return v}', description: 'a description', label: 'Descript' };
    expect(inspectFlow(f).executable).toEqual([{ name: 'FunctionFlowNode.functionCode', count: 1 }]);
  });
  it('flags executable content, including customUi', () => {
    const f = flow({ customUi: '<div></div>' });
    expect(inspectFlow(f).executable.map((e) => e.name)).toContain('flow.customUi');
  });
});
