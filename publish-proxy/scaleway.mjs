// scaleway.mjs — Scaleway Serverless Functions entrypoint (Node 20/22), handler: scaleway.handle
// Scaleway passes an AWS-Lambda-style event: { httpMethod, path, queryStringParameters, headers, body, isBase64Encoded }.
import { handleRequest, readEnv } from './core.mjs';

export async function handle(event = {}) {
  let body = event.body || '';
  if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
  const out = await handleRequest({
    method: event.httpMethod || event.method || 'GET',
    path: event.path || '/',
    query: new URLSearchParams(event.queryStringParameters || {}),
    headers: event.headers || {},
    body,
  }, readEnv(process.env));
  return { statusCode: out.status, headers: out.headers, body: out.body };
}

export default handle;
