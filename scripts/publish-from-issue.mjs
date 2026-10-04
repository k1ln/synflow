#!/usr/bin/env node
/**
 * Turn an approved "Publish: …" issue into a gallery entry. Run by
 * .github/workflows/gallery-publish.yml when a maintainer adds the `approved` label.
 *
 * The issue is *data*, never instructions: it is read from the event payload and the API
 * (never interpolated into a shell), the attached flow is re-validated with the same rules
 * the proxy used, and the result goes through the normal gallery CLI.
 *
 * On success: writes site/gallery/data/<slug>.json (+ catalogue, thumbnail) and prints
 * `slug=<slug>` to $GITHUB_OUTPUT. On failure: comments on the issue, removes `approved`
 * (so re-labelling retries) and exits 1.
 */
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectFlow, slugify, neutralizeMarkdown } from '../publish-proxy/validate.mjs';
import { Reject, loadSubmission } from './submission.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { GITHUB_EVENT_PATH, GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_OUTPUT } = process.env;
const API = process.env.GITHUB_API_URL || 'https://api.github.com';   // set by Actions; overridden in tests

async function api(method, route, body) {
  const res = await fetch(`${API}/repos/${GITHUB_REPOSITORY}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'synflow-gallery-publish',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 404) throw new Error(`GitHub ${method} ${route} → ${res.status}`);
  return res.status === 204 || res.status === 404 ? null : res.json();
}

const reject = (msg) => { throw new Reject(msg); };

async function main() {
  const event = JSON.parse(await fs.readFile(GITHUB_EVENT_PATH, 'utf8'));
  const issue = event.issue;
  const labels = (issue.labels || []).map((l) => l.name);
  if (event.label?.name !== 'approved' || !labels.includes('publish-request')) reject('Not an approved publish request.');
  if (issue.state !== 'open') reject('This request is already closed.');

  const { doc, meta, login } = await loadSubmission(issue, (page) => api('GET', `/issues/${issue.number}/comments?per_page=100&page=${page}`));

  const dataDir = path.join(process.env.SYNFLOW_GALLERY_DIR || path.join(ROOT, 'site', 'gallery'), 'data');
  let slug = slugify(meta.name);
  if (await fs.stat(path.join(dataDir, `${slug}.json`)).then(() => true, () => false)) slug = `${slug}-${issue.number}`;

  const tmp = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'synflow-')), 'submission.json');
  await fs.writeFile(tmp, JSON.stringify(doc));
  // execFile with an argv array: nothing user-written ever reaches a shell.
  execFileSync(process.execPath, [
    path.join(ROOT, 'scripts', 'build-flow-gallery.mjs'), 'publish', tmp,
    '--name', meta.name, '--desc', meta.description, '--tags', meta.tags.join(','), '--author', login, '--slug', slug,
  ], { stdio: 'inherit', cwd: ROOT });

  const info = inspectFlow(doc);
  console.log(`published ${slug}: ${info.nodes} nodes, ${info.executable.length} executable field(s)`);
  if (GITHUB_OUTPUT) await fs.appendFile(GITHUB_OUTPUT, `slug=${slug}\n`);
}

main().catch(async (e) => {
  console.error(e.message);
  if (e instanceof Reject) {
    try {
      const event = JSON.parse(await fs.readFile(GITHUB_EVENT_PATH, 'utf8'));
      const n = event.issue?.number;
      if (n && event.label?.name === 'approved') {
        await api('POST', `/issues/${n}/comments`, { body: `❌ Could not publish: ${neutralizeMarkdown(e.message)}\n\nThe \`approved\` label was removed; fix the problem (or close this issue) and add it again to retry.` });
        await api('DELETE', `/issues/${n}/labels/approved`);
      }
    } catch (e2) { console.error('could not report on the issue:', e2.message); }
  }
  process.exit(1);
});
