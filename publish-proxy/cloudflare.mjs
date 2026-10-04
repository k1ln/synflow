// cloudflare.mjs — Cloudflare Worker entrypoint (alternative to Scaleway).
//   wrangler secret put GITHUB_TOKEN / OAUTH_CLIENT_SECRET / SESSION_SECRET ; wrangler deploy
import { handleRequest, readEnv } from './core.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = {};
    request.headers.forEach((v, k) => (headers[k] = v));
    const out = await handleRequest({
      method: request.method, path: url.pathname, query: url.searchParams, headers,
      body: request.method === 'POST' ? await request.text() : '',
    }, readEnv(env));
    return new Response(out.body || null, { status: out.status, headers: out.headers });
  },
};
