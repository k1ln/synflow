/**
 * Reads a publish-request issue back into a validated flow. Shared by the approval workflow
 * (scripts/publish-from-issue.mjs) and the maintainer's preview (scripts/review-submission.mjs).
 *
 * Everything here is untrusted input: the marker, the chunks and the flow itself are re-checked
 * (checksum + the same validation the proxy applied) before the caller sees anything.
 */
import { gunzipSync } from 'node:zlib';
import { validateFlow, validateMeta, sha256Hex } from '../publish-proxy/validate.mjs';

export class Reject extends Error {}
const reject = (msg) => { throw new Reject(msg); };

/**
 * @param issue    {number, body, user:{login}}
 * @param getComments  (page:number) => Promise<Array<{body:string, user:{login:string}}>>  (100 per page)
 */
export async function loadSubmission(issue, getComments) {
  const m = /<!-- synflow-submission (\{[^\n]*?\}) -->/.exec(issue.body || '');
  if (!m) reject('This issue has no submission marker — it was not created by the publish service.');
  let marker;
  try { marker = JSON.parse(m[1]); } catch { reject('The submission marker is corrupt.'); }
  if (marker.v !== 1 || !/^[0-9a-f]{64}$/.test(marker.sha256) || !Number.isInteger(marker.chunks)
    || marker.chunks < 1 || marker.chunks > 12 || !/^[A-Za-z0-9-]{1,39}$/.test(marker.login)) {
    reject('The submission marker is malformed.');
  }

  // Only comments written by the issue's author (the publish service) count — anyone can comment.
  const parts = new Map();
  for (let page = 1; page <= 4; page++) {
    const rows = (await getComments(page)) || [];
    for (const c of rows) {
      if (c.user?.login !== issue.user.login) continue;
      const cm = /^<!-- synflow-chunk (\d+)\/(\d+) -->/.exec(c.body || '');
      const data = /```\n([A-Za-z0-9+/=]+)\n```/.exec(c.body || '');
      if (!cm || !data || +cm[2] !== marker.chunks) continue;
      if (parts.has(+cm[1]) && parts.get(+cm[1]) !== data[1]) reject(`Chunk ${cm[1]} appears twice with different content.`);
      parts.set(+cm[1], data[1]);
    }
    if (rows.length < 100) break;
  }
  for (let i = 1; i <= marker.chunks; i++) if (!parts.has(i)) reject(`Flow data is incomplete (missing part ${i} of ${marker.chunks}).`);

  let text;
  try {
    const packed = Buffer.from([...parts.keys()].sort((a, b) => a - b).map((k) => parts.get(k)).join(''), 'base64');
    text = gunzipSync(packed, { maxOutputLength: 4_000_000 }).toString('utf8');
  } catch { reject('Could not decompress the flow data.'); }
  if (await sha256Hex(text) !== marker.sha256) reject('The flow data does not match its checksum.');

  let doc;
  try { doc = JSON.parse(text); } catch { reject('The flow data is not valid JSON.'); }
  const flowErr = validateFlow(doc);
  if (flowErr) reject(flowErr);
  const meta = validateMeta(doc);
  if (!meta.ok) reject(meta.error);
  if (doc.author !== marker.login) reject('The flow author does not match the submitting account.');
  return { doc, meta: meta.value, login: marker.login };
}
