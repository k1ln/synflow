// node-server.mjs — plain Node host (local testing or a small VPS behind nginx/caddy).
//   GITHUB_TOKEN=… OAUTH_CLIENT_ID=… OAUTH_CLIENT_SECRET=… SESSION_SECRET=… PUBLIC_URL=http://localhost:8788 node publish-proxy/node-server.mjs
import http from 'node:http';
import { handleRequest, readEnv } from './core.mjs';

const PORT = parseInt(process.env.PORT || '8788', 10);
const MAX_BODY = 3_000_000;

http.createServer((req, res) => {
  const chunks = []; let size = 0; let aborted = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) { aborted = true; res.writeHead(413).end(); req.destroy(); } else chunks.push(c);
  });
  req.on('end', async () => {
    if (aborted) return;
    const url = new URL(req.url, 'http://localhost');
    const out = await handleRequest({
      method: req.method, path: url.pathname, query: url.searchParams, headers: req.headers,
      body: Buffer.concat(chunks).toString('utf8'),
    }, readEnv(process.env));
    res.writeHead(out.status, out.headers).end(out.body);
  });
}).listen(PORT, () => console.info(`Synflow publish proxy on :${PORT}`));
