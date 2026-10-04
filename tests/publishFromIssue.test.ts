// @ts-nocheck — Node-only test of plain .mjs modules; the repo has no @types/node to check it against
// End to end: the publish proxy files an issue, the maintainer "approves" it, and
// scripts/publish-from-issue.mjs turns it into a gallery entry (against a local fake GitHub API).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { handleRequest, readEnv } from '../publish-proxy/core.mjs';
import { fakeGithub, USERS, NOW } from './helpers/fakeGithub';

const ORIGIN = 'https://synflow.org';
const ENV = readEnv({
  GITHUB_TOKEN: 't', OAUTH_CLIENT_ID: 'cid', OAUTH_CLIENT_SECRET: 's', SESSION_SECRET: 'x'.repeat(40),
  PUBLIC_URL: 'https://publish.example', COOLDOWN_SECONDS: '0',
});
const SCRIPT = path.resolve(__dirname, '../scripts/publish-from-issue.mjs');

const flow = () => ({
  nodes: [
    { id: 'osc', type: 'OscillatorFlowNode', position: { x: 0, y: 0 }, data: { frequency: 220 } },
    { id: 'sub', type: 'FlowNode', position: { x: 100, y: 0 }, data: { selectedNode: 'kick' } },
    { id: 'out', type: 'MasterOutFlowNode', position: { x: 300, y: 0 }, data: {} },
  ],
  edges: [{ id: 'e1', source: 'osc', target: 'out' }],
  dependencies: { kick: { nodes: [{ id: 'k', type: 'OscillatorFlowNode', position: { x: 0, y: 0 }, data: {} }], edges: [] } },
});

let gh: ReturnType<typeof fakeGithub>;
let server: http.Server; let apiUrl = '';
let galleryDir = '';
let apiLog: string[] = [];
let tmp = '';

beforeAll(async () => {
  // The Actions script talks to this: GET comments, POST comment, DELETE label.
  server = http.createServer((req, res) => {
    apiLog.push(`${req.method} ${req.url}`);
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      const m = /\/issues\/(\d+)\/comments/.exec(req.url!);
      if (req.method === 'GET' && m) {
        const rows = (gh.st.comments[+m[1]] || []).map((b) => ({ body: b, user: { login: 'k1ln' } }));
        rows.push({ body: 'looks fun, +1', user: { login: 'randomperson' } });   // noise from a third party
        res.end(JSON.stringify(rows));
      } else if (req.method === 'POST' && m) { (gh.st.comments[+m[1]] ||= []).push(`BOT:${JSON.parse(body).body}`); res.statusCode = 201; res.end('{}'); }
      else { res.statusCode = 204; res.end(); }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  apiUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => server.close());

beforeEach(async () => {
  gh = fakeGithub(USERS);
  apiLog = [];
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'synflow-e2e-'));
  galleryDir = path.join(tmp, 'gallery');
});

async function submit(): Promise<number> {
  const call = (req) => handleRequest({ query: new URLSearchParams(), headers: {}, body: '', ...req }, ENV, { fetch: gh.fetch, now: NOW });
  const login = await call({ method: 'GET', path: '/auth/login', query: new URLSearchParams({ origin: ORIGIN, nonce: 'n'.repeat(24) }) });
  const state = new URL(login.headers.Location).searchParams.get('state')!;
  const cb = await call({ method: 'GET', path: '/auth/callback', query: new URLSearchParams({ code: 'alice', state }) });
  const token = /"token":"([^"]+)"/.exec(cb.body)![1];
  const r = await call({
    method: 'POST', path: '/api/publish', headers: { origin: ORIGIN, authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Sub Bass', description: 'A deep sub bass with a kick sub-flow.', tags: ['bass'], license: 'MIT', flow: flow() }),
  });
  expect(r.status).toBe(200);
  return JSON.parse(r.body).number;
}

/** Run the Actions script as if `approved` had just been added to the issue. */
async function approve(n: number, labelName = 'approved') {
  const issue = gh.st.issues[n - 1];
  const eventPath = path.join(tmp, 'event.json');
  await fs.writeFile(eventPath, JSON.stringify({
    label: { name: labelName },
    issue: { number: n, state: 'open', body: issue.body, user: { login: 'k1ln' }, labels: [...issue.labels, labelName].map((name) => ({ name })) },
  }));
  const out = path.join(tmp, 'output.txt');
  await fs.writeFile(out, '');
  const code: number = await new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT], {
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_TOKEN: 'x', GITHUB_REPOSITORY: 'k1ln/synflow', GITHUB_API_URL: apiUrl, GITHUB_OUTPUT: out, SYNFLOW_GALLERY_DIR: galleryDir },
      stdio: 'ignore',
    });
    p.on('exit', (c) => resolve(c ?? -1));
  });
  return { code, output: await fs.readFile(out, 'utf8') };
}

describe('approve → publish', () => {
  it('publishes an approved submission to the gallery with the verified author and bundled sub-flows', async () => {
    const n = await submit();
    const { code, output } = await approve(n);
    expect(code).toBe(0);
    expect(output.trim()).toBe('slug=sub-bass');

    const doc = JSON.parse(await fs.readFile(path.join(galleryDir, 'data', 'sub-bass.json'), 'utf8'));
    expect(doc).toMatchObject({ name: 'Sub Bass', author: 'alice', tags: ['bass'] });
    expect(Object.keys(doc.dependencies)).toEqual(['kick']);       // carried over, not looked up on disk
    const index = JSON.parse(await fs.readFile(path.join(galleryDir, 'data', 'index.json'), 'utf8'));
    expect(index.map((r) => r.slug)).toEqual(['sub-bass']);
    await fs.access(path.join(galleryDir, 'shots', 'sub-bass.svg'));
  });

  it('never overwrites an existing gallery entry with the same name', async () => {
    await fs.mkdir(path.join(galleryDir, 'data'), { recursive: true });
    await fs.writeFile(path.join(galleryDir, 'data', 'sub-bass.json'), JSON.stringify({ name: 'Original', nodes: [], edges: [] }));
    const n = await submit();
    const { code, output } = await approve(n);
    expect(code).toBe(0);
    expect(output.trim()).toBe(`slug=sub-bass-${n}`);
    expect(JSON.parse(await fs.readFile(path.join(galleryDir, 'data', 'sub-bass.json'), 'utf8')).name).toBe('Original');
  });

  it('rejects tampered flow data, tells the issue why, and withdraws the approval', async () => {
    const n = await submit();
    const c = gh.st.comments[n][0];
    gh.st.comments[n][0] = c.replace(/```\n(.)/, (_m, ch) => '```\n' + (ch === 'A' ? 'B' : 'A'));   // flip one character
    const { code } = await approve(n);
    expect(code).toBe(1);
    await expect(fs.access(path.join(galleryDir, 'data', 'sub-bass.json'))).rejects.toThrow();
    expect(gh.st.comments[n].at(-1)).toMatch(/^BOT:❌ Could not publish:/);
    expect(apiLog).toContain(`DELETE /repos/k1ln/synflow/issues/${n}/labels/approved`);
  });

  it('rejects an issue with missing chunks', async () => {
    const n = await submit();
    gh.st.comments[n] = [];
    expect((await approve(n)).code).toBe(1);
    expect(gh.st.comments[n].at(-1)).toMatch(/incomplete/);
  });

  it('ignores any label other than `approved`', async () => {
    const n = await submit();
    const { code } = await approve(n, 'help-wanted');
    expect(code).toBe(1);
    await expect(fs.access(galleryDir)).rejects.toThrow();
  });

  it('refuses an issue that was not created by the publish service', async () => {
    const n = await submit();
    gh.st.issues[n - 1].body = 'please publish my totally legit flow';
    expect((await approve(n)).code).toBe(1);
  });
});
