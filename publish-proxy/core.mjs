// core.mjs
// =====================================================================
//  Provider-agnostic core of the Synflow publish proxy.
//
//  The editor's "Publish to GitHub" button talks to this. It turns a flow into
//  a reviewable GitHub *issue* on the gallery repo; a maintainer adds the
//  `approved` label and .github/workflows/gallery-publish.yml puts it live.
//
//  Anti-spam, in layers (see README.md for the reasoning):
//    1. GitHub sign-in (OAuth) — the identity is the immutable numeric GitHub id,
//       not an IP address or a token the client invents.
//    2. Account age   — brand-new throw-away accounts can't publish.
//    3. Per-user quota (DAILY_LIMIT / rolling 24 h) + cooldown between publishes.
//       Counted from the issues themselves (label `by-<id>`), so there is no
//       database and the count survives restarts and scales across instances.
//    4. Global circuit breaker — daily intake cap and a cap on unreviewed issues.
//    5. Strict validation of everything that is stored; user text is neutralised
//       so it can't @mention people or cross-link issues.
//    6. Nothing goes live without a maintainer's label.
//    7. The GitHub token needs *only* "Issues: write" — it can't touch code.
//
//  Uses only fetch + WebCrypto + CompressionStream, so it runs unchanged on
//  Scaleway Functions, Cloudflare Workers and plain Node ≥ 20.
// =====================================================================
import { LIMITS, validateMeta, validateFlow, inspectFlow, sha256Hex, neutralizeMarkdown } from './validate.mjs';

const DAY = 24 * 3600 * 1000;
const CHUNK_CHARS = 60_000;   // GitHub caps an issue/comment body at 65 536
const MAX_CHUNKS = 12;
const PUBLISH_LABEL = 'publish-request';

// ── config ────────────────────────────────────────────────────────────────────
const int = (v, d, min, max) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const list = (v, d) => String(v ?? d).split(',').map((s) => s.trim()).filter(Boolean);

export function readEnv(src = {}) {
  return {
    token: src.GITHUB_TOKEN || '',
    owner: src.GITHUB_OWNER || 'k1ln',
    repo: src.GITHUB_REPO || 'synflow',
    clientId: src.OAUTH_CLIENT_ID || '',
    clientSecret: src.OAUTH_CLIENT_SECRET || '',
    sessionSecret: src.SESSION_SECRET || '',
    publicUrl: (src.PUBLIC_URL || '').replace(/\/+$/, ''),
    allowedOrigins: list(src.ALLOWED_ORIGINS, 'https://synflow.org,https://www.synflow.org,http://localhost:5173,http://127.0.0.1:5173'),
    pagesUrl: (src.PAGES_URL || 'https://k1ln.github.io/synflow').replace(/\/+$/, ''),
    dailyLimit: int(src.DAILY_LIMIT, 3, 1, 50),
    cooldownSeconds: int(src.COOLDOWN_SECONDS, 120, 0, 3600),
    minAccountAgeDays: int(src.MIN_ACCOUNT_AGE_DAYS, 7, 0, 3650),
    globalDailyLimit: int(src.GLOBAL_DAILY_LIMIT, 40, 1, 90),   // ≤ one API page (100)
    maxOpen: int(src.MAX_OPEN_REQUESTS, 60, 1, 90),
    sessionHours: int(src.SESSION_HOURS, 6, 1, 72),
    blocked: list(src.BLOCKED_USERS, '').map((s) => s.toLowerCase()),
  };
}

function missingConfig(env) {
  return [
    ['GITHUB_TOKEN', env.token], ['OAUTH_CLIENT_ID', env.clientId], ['OAUTH_CLIENT_SECRET', env.clientSecret],
    ['SESSION_SECRET (≥ 32 chars)', env.sessionSecret.length >= 32 ? 'ok' : ''], ['PUBLIC_URL', env.publicUrl],
  ].filter(([, v]) => !v).map(([k]) => k);
}

// ── small utils ───────────────────────────────────────────────────────────────
const enc = new TextEncoder();
const b64uEncode = (bytes) => {
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64uDecode = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const toBase64 = (bytes) => {
  let bin = ''; const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(bin);
};
async function gzipBase64(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

// ── signed tokens (OAuth state + session) ─────────────────────────────────────
const hmacKey = (env, usages) =>
  globalThis.crypto.subtle.importKey('raw', enc.encode(env.sessionSecret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);

async function signToken(env, payload) {
  const body = b64uEncode(enc.encode(JSON.stringify(payload)));
  const sig = await globalThis.crypto.subtle.sign('HMAC', await hmacKey(env, ['sign']), enc.encode(body));
  return `${body}.${b64uEncode(new Uint8Array(sig))}`;
}

/** → payload, or null when the signature, type or expiry is wrong. */
async function verifyToken(env, token, typ, now) {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  try {
    const ok = await globalThis.crypto.subtle.verify('HMAC', await hmacKey(env, ['verify']), b64uDecode(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64uDecode(body)));
    if (payload.typ !== typ || !(payload.exp > now)) return null;
    return payload;
  } catch { return null; }
}

// ── GitHub API ────────────────────────────────────────────────────────────────
async function gh(ctx, method, path, body) {
  const res = await ctx.fetch('https://api.github.com' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + ctx.env.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'synflow-publish-proxy',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) {
    const err = new Error(`GitHub ${method} ${path.split('?')[0]} → ${res.status}: ${(json && json.message) || text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const repoPath = (env) => `/repos/${env.owner}/${env.repo}`;
const knownLabels = new Set();
async function ensureLabel(ctx, name, color, description) {
  if (knownLabels.has(name)) return;
  try {
    await gh(ctx, 'POST', `${repoPath(ctx.env)}/labels`, { name, color, description });
  } catch (e) {
    if (e.status !== 422) throw e;   // 422 = already exists
  }
  knownLabels.add(name);
}

/** Issues created in the last 24 h that carry all of `labels`. */
async function recentIssues(ctx, labels, state = 'all') {
  const cutoff = ctx.now - DAY;
  const q = new URLSearchParams({
    labels: labels.join(','), state, since: new Date(cutoff).toISOString(),
    sort: 'created', direction: 'desc', per_page: '100',
  });
  const rows = await gh(ctx, 'GET', `${repoPath(ctx.env)}/issues?${q}`);
  return (Array.isArray(rows) ? rows : [])
    .filter((i) => !i.pull_request && Date.parse(i.created_at) >= cutoff)
    .map((i) => Date.parse(i.created_at))
    .sort((a, b) => a - b);   // ascending
}

async function userQuota(ctx, uid) {
  const { env, now } = ctx;
  const times = await recentIssues(ctx, [PUBLISH_LABEL, `by-${uid}`]);
  const used = times.length;
  const remaining = Math.max(0, env.dailyLimit - used);
  // The slot that frees next belongs to the (used - limit + 1)-th oldest publish.
  const resetsAt = used >= env.dailyLimit ? times[used - env.dailyLimit] + DAY : null;
  const last = used ? times[used - 1] : 0;
  const cooldownEndsAt = last && env.cooldownSeconds ? last + env.cooldownSeconds * 1000 : 0;
  return { limit: env.dailyLimit, used, remaining, resetsAt, cooldownEndsAt: cooldownEndsAt > now ? cooldownEndsAt : null };
}

// ── HTTP plumbing ─────────────────────────────────────────────────────────────
function corsHeaders(ctx) {
  const o = ctx.origin;
  return o && ctx.env.allowedOrigins.includes(o)
    ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' }
    : { Vary: 'Origin' };
}
const reply = (ctx, status, obj, extra = {}) => ({
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(ctx), ...extra },
  body: JSON.stringify(obj),
});
const fail = (ctx, status, error, extra) => reply(ctx, status, { error }, extra);
const retryAfter = (ms) => ({ 'Retry-After': String(Math.max(1, Math.ceil(ms / 1000))) });

function htmlPage(status, title, message, script = '') {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
    },
    body: `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<body style="font:15px system-ui;background:#0a0b0f;color:#eef1f8;display:grid;place-items:center;height:100vh;margin:0">
<p>${esc(message)}</p><script>${script}</script></body>`,
  };
}

/** postMessage payload → editor window. `<` escaped so nothing can close the script tag. */
function postBack(origin, data) {
  const js = JSON.stringify(data).replace(/</g, '\\u003c');
  return `try{window.opener&&window.opener.postMessage(${js},${JSON.stringify(origin).replace(/</g, '\\u003c')});}catch(e){}setTimeout(function(){window.close()},1200);`;
}

// ── routes ────────────────────────────────────────────────────────────────────
async function routeLogin(ctx) {
  const { env, query, now } = ctx;
  const origin = query.get('origin') || '';
  const nonce = query.get('nonce') || '';
  if (!env.allowedOrigins.includes(origin)) return htmlPage(400, 'Not allowed', 'This site is not allowed to use the publish service.');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return htmlPage(400, 'Bad request', 'Missing or malformed nonce.');
  const state = await signToken(env, { typ: 'state', origin, nonce, exp: now + 10 * 60 * 1000 });
  const url = new URL('https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: env.clientId, redirect_uri: `${env.publicUrl}/auth/callback`, state, allow_signup: 'true',
  }).toString();   // no scope: we only need the public profile
  return { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store' }, body: '' };
}

async function routeCallback(ctx) {
  const { env, query, now } = ctx;
  const st = await verifyToken(env, query.get('state'), 'state', now);
  if (!st) return htmlPage(400, 'Sign-in expired', 'This sign-in link has expired. Close this window and try again.');
  const back = (data) => htmlPage(200, 'Synflow', data.error ? `Sign-in failed: ${data.error}` : `Signed in as ${data.login}. You can close this window.`,
    postBack(st.origin, { type: 'synflow-publish-auth', nonce: st.nonce, ...data }));
  const code = query.get('code');
  if (!code || query.get('error')) return back({ error: query.get('error_description') || 'cancelled' });

  let ghToken = '';
  try {
    const r = await ctx.fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'synflow-publish-proxy' },
      body: JSON.stringify({ client_id: env.clientId, client_secret: env.clientSecret, code, redirect_uri: `${env.publicUrl}/auth/callback` }),
    });
    ghToken = (await r.json()).access_token || '';
    if (!ghToken) return back({ error: 'GitHub rejected the sign-in code' });
    const u = await ctx.fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'synflow-publish-proxy' },
    });
    if (!u.ok) return back({ error: 'could not read your GitHub profile' });
    const user = await u.json();
    if (user.type !== 'User' || !Number.isSafeInteger(user.id) || !/^[A-Za-z0-9-]{1,39}$/.test(user.login || '')) {
      return back({ error: 'only personal GitHub accounts can publish' });
    }
    const exp = now + env.sessionHours * 3600 * 1000;
    const token = await signToken(env, { typ: 'session', uid: user.id, login: user.login, created: Date.parse(user.created_at) || now, iat: now, exp });
    return back({ token, login: user.login, expiresAt: exp });
  } catch {
    return back({ error: 'GitHub is unreachable, try again' });
  } finally {
    // We only needed to learn who the user is — don't leave an authorisation behind.
    // Awaited: serverless runtimes may freeze the instance as soon as we return.
    if (ghToken) {
      try {
        await ctx.fetch(`https://api.github.com/applications/${env.clientId}/token`, {
          method: 'DELETE',
          headers: { Authorization: 'Basic ' + btoa(`${env.clientId}:${env.clientSecret}`), Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'synflow-publish-proxy' },
          body: JSON.stringify({ access_token: ghToken }),
        });
      } catch { /* best effort */ }
    }
  }
}

async function authenticate(ctx) {
  const m = /^Bearer (\S+)$/.exec(ctx.headers.authorization || '');
  const s = m && await verifyToken(ctx.env, m[1], 'session', ctx.now);
  if (!s) return { err: fail(ctx, 401, 'Please sign in with GitHub again.') };
  if (ctx.env.blocked.includes(String(s.uid)) || ctx.env.blocked.includes(String(s.login).toLowerCase())) {
    return { err: fail(ctx, 403, 'This account may not publish.') };
  }
  return { user: s };
}

async function routeQuota(ctx) {
  const { err, user } = await authenticate(ctx);
  if (err) return err;
  const q = await userQuota(ctx, user.uid);
  const minAgeMs = ctx.env.minAccountAgeDays * DAY;
  return reply(ctx, 200, { login: user.login, ...q, eligibleAt: ctx.now - user.created < minAgeMs ? user.created + minAgeMs : null });
}

// One publish per user at a time, so a burst of parallel requests can't all pass the quota check.
const inFlight = new Set();

async function routePublish(ctx) {
  const { env, now } = ctx;
  const { err, user } = await authenticate(ctx);
  if (err) return err;

  const minAgeMs = env.minAccountAgeDays * DAY;
  if (now - user.created < minAgeMs) {
    return fail(ctx, 403, `Your GitHub account must be at least ${env.minAccountAgeDays} days old to publish.`);
  }
  if (ctx.body.length > LIMITS.maxFlowBytes + 100_000) return fail(ctx, 413, 'Submission is too large.');
  let req;
  try { req = JSON.parse(ctx.body); } catch { return fail(ctx, 400, 'Body is not valid JSON.'); }
  const meta = validateMeta(req);
  if (!meta.ok) return fail(ctx, 400, meta.error);
  const flow = req && req.flow;
  const flowErr = validateFlow(flow);
  if (flowErr) return fail(ctx, 400, flowErr);
  if (req.license !== 'MIT') return fail(ctx, 400, 'Please confirm the flow may be published under the MIT license.');

  // The author is the verified GitHub account — never a client-supplied name.
  const doc = {
    name: meta.value.name, description: meta.value.description, author: user.login, tags: meta.value.tags,
    nodes: flow.nodes, edges: flow.edges,
    ...(typeof flow.customUi === 'string' && flow.customUi ? { customUi: flow.customUi } : {}),
    ...(flow.dependencies && Object.keys(flow.dependencies).length ? { dependencies: flow.dependencies } : {}),
  };
  const text = JSON.stringify(doc);
  const packed = await gzipBase64(text);
  const chunks = [];
  for (let i = 0; i < packed.length; i += CHUNK_CHARS) chunks.push(packed.slice(i, i + CHUNK_CHARS));
  if (chunks.length > MAX_CHUNKS) return fail(ctx, 413, 'Flow is too large after compression.');
  const sha = await sha256Hex(text);
  const info = inspectFlow(doc);

  if (inFlight.has(user.uid)) return fail(ctx, 429, 'A publish is already in progress.', retryAfter(10_000));
  inFlight.add(user.uid);
  try {
    // 3. per-user quota + cooldown (authoritative: counted from GitHub)
    const q = await userQuota(ctx, user.uid);
    if (q.cooldownEndsAt) {
      return fail(ctx, 429, `Slow down — you can publish again in ${Math.ceil((q.cooldownEndsAt - now) / 1000)} s.`, retryAfter(q.cooldownEndsAt - now));
    }
    if (q.remaining <= 0) {
      return reply(ctx, 429, { error: `Daily limit reached (${q.limit} per 24 h). Try again later.`, ...q }, retryAfter(q.resetsAt - now));
    }
    // 4. global circuit breaker
    const [today, open] = await Promise.all([recentIssues(ctx, [PUBLISH_LABEL]), recentIssues(ctx, [PUBLISH_LABEL], 'open')]);
    if (today.length >= env.globalDailyLimit || open.length >= env.maxOpen) {
      return fail(ctx, 503, 'The gallery review queue is full right now. Please try again tomorrow.', retryAfter(3600_000));
    }

    await ensureLabel(ctx, PUBLISH_LABEL, '0e8a16', 'A flow submitted for the public gallery');
    await ensureLabel(ctx, `by-${user.uid}`, 'ededed', `Submitted by GitHub user ${user.login}`);
    const labels = [PUBLISH_LABEL, `by-${user.uid}`];
    if (info.executable.length) {
      await ensureLabel(ctx, 'runs-code', 'd93f0b', 'Contains script, worklet, WASM or HTML content — review carefully');
      labels.push('runs-code');
    }

    const issue = await gh(ctx, 'POST', `${repoPath(env)}/issues`, {
      title: `Publish: ${meta.value.name}`,
      body: issueBody({ meta: meta.value, user, info, sha, chunks: chunks.length, env, quota: q }),
      labels,
    });
    try {
      for (let i = 0; i < chunks.length; i++) {
        await gh(ctx, 'POST', `${repoPath(env)}/issues/${issue.number}/comments`, { body: chunkBody(i + 1, chunks.length, chunks[i]) });
      }
    } catch (e) {
      // Half-uploaded submission: close it so it can't be approved by mistake.
      await gh(ctx, 'PATCH', `${repoPath(env)}/issues/${issue.number}`, { state: 'closed', state_reason: 'not_planned' }).catch(() => {});
      throw e;
    }
    return reply(ctx, 200, {
      url: issue.html_url, number: issue.number,
      remaining: q.remaining - 1, limit: q.limit,
      message: `Submitted “${meta.value.name}” for review.`,
    });
  } catch (e) {
    return fail(ctx, e.status === 403 || e.status === 429 ? 503 : 502, `Could not reach GitHub: ${String(e.message || e).slice(0, 200)}`);
  } finally {
    inFlight.delete(user.uid);
  }
}

// ── issue content ─────────────────────────────────────────────────────────────
function issueBody({ meta, user, info, sha, chunks, env, quota }) {
  const marker = { v: 1, sha256: sha, chunks, uid: user.uid, login: user.login };
  const kinds = info.types.slice(0, 10).map((t) => `${t.name}${t.count > 1 ? ` ×${t.count}` : ''}`).join(', ');
  return [
    `<!-- synflow-submission ${JSON.stringify(marker)} -->`,
    `**${neutralizeMarkdown(meta.name)}** · submitted by [${user.login}](https://github.com/${user.login}) · ${info.nodes} nodes, ${info.edges} connections`,
    '',
    ...neutralizeMarkdown(meta.description).split('\n').map((l) => `> ${l}`),
    '',
    meta.tags.length ? `Tags: ${meta.tags.map((t) => `\`${t}\``).join(' ')}` : '_No tags._',
    `Built from: ${neutralizeMarkdown(kinds)}`,
    '',
    info.executable.length
      ? `### ⚠️ Contains code or markup that runs in the editor\n${info.executable.map((e) => `- \`${e.name}\` ×${e.count}`).join('\n')}\n\nRead these before approving.`
      : '### No script / worklet / HTML content detected',
    info.diskSamples ? `\n_${info.diskSamples} sample node(s) point at local audio files that are not part of the submission._` : '',
    '',
    '### Review',
    `The flow data is attached below as ${chunks} comment${chunks === 1 ? '' : 's'} (gzip + base64, SHA-256 \`${sha.slice(0, 16)}…\`).`,
    `Add the **\`approved\`** label to publish it to ${env.pagesUrl}/gallery/ — or close the issue to reject. Only people with triage access can label, and the workflow re-validates everything first.`,
    '',
    `<sub>Submitter's quota: ${quota.used + 1}/${quota.limit} in the last 24 h.</sub>`,
  ].join('\n');
}

function chunkBody(i, n, data) {
  return `<!-- synflow-chunk ${i}/${n} -->\n<details><summary>Flow data ${i}/${n}</summary>\n\n\`\`\`\n${data}\n\`\`\`\n\n</details>`;
}

// ── entry point ───────────────────────────────────────────────────────────────
/**
 * @param {{method:string, path:string, query?:URLSearchParams, headers?:Record<string,string>, body?:string}} req
 * @param {ReturnType<typeof readEnv>} env
 * @param {{fetch?:typeof fetch, now?:number}} [deps]
 * @returns {Promise<{status:number, headers:Record<string,string>, body:string}>}
 */
export async function handleRequest(req, env, deps = {}) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) headers[k.toLowerCase()] = v;
  const ctx = {
    env, headers,
    fetch: deps.fetch || globalThis.fetch,
    now: deps.now ?? Date.now(),
    query: req.query || new URLSearchParams(),
    body: req.body || '',
    origin: headers.origin || '',
  };

  if (req.method === 'OPTIONS') return { status: 204, headers: corsHeaders(ctx), body: '' };
  const missing = missingConfig(env);
  if (missing.length) return fail(ctx, 500, `Publish service is not configured (missing ${missing.join(', ')}).`);
  if (ctx.origin && !env.allowedOrigins.includes(ctx.origin)) return fail(ctx, 403, 'Origin not allowed.');

  const path = (req.path || '/').replace(/\/+$/, '');
  try {
    if (req.method === 'GET' && path.endsWith('/auth/login')) return await routeLogin(ctx);
    if (req.method === 'GET' && path.endsWith('/auth/callback')) return await routeCallback(ctx);
    if (req.method === 'GET' && path.endsWith('/api/quota')) return await routeQuota(ctx);
    if (req.method === 'POST' && path.endsWith('/api/publish')) return await routePublish(ctx);
    return fail(ctx, 404, 'Not found.');
  } catch (e) {
    return fail(ctx, 502, `Unexpected error: ${String(e.message || e).slice(0, 200)}`);
  }
}
