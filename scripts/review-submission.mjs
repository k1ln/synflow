#!/usr/bin/env node
/**
 * Maintainer preview of a publish-request issue, before you add the `approved` label.
 *
 *   node scripts/review-submission.mjs <issue-number> [--out flow.json] [--repo owner/name]
 *
 * Needs the GitHub CLI (`gh auth login`). Decodes and validates the attached flow exactly like the
 * approval workflow does, prints what it is made of — including every node that carries code — and
 * writes the flow to a file you can load with "Import Flow" in the editor.
 */
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inspectFlow } from '../publish-proxy/validate.mjs';
import { Reject, loadSubmission } from './submission.mjs';

const args = process.argv.slice(2);
const number = parseInt(args[0], 10);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i > 0 ? args[i + 1] : d; };
if (!Number.isInteger(number)) { console.error('usage: review-submission.mjs <issue-number> [--out flow.json] [--repo owner/name]'); process.exit(1); }
const repo = opt('repo', 'k1ln/synflow');
const gh = (route) => JSON.parse(execFileSync('gh', ['api', `repos/${repo}${route}`], { encoding: 'utf8', maxBuffer: 50e6 }));

try {
  const issue = gh(`/issues/${number}`);
  if (!(issue.labels || []).some((l) => l.name === 'publish-request')) throw new Reject(`#${number} is not a publish request.`);
  const { doc, meta, login } = await loadSubmission(issue, (page) => gh(`/issues/${number}/comments?per_page=100&page=${page}`));
  const info = inspectFlow(doc);
  const out = opt('out', `${meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flow'}.json`);
  await fs.writeFile(out, JSON.stringify(doc, null, 2));

  console.log(`#${number}  "${meta.name}" by @${login}  [${issue.state}]`);
  console.log(`  ${meta.description.replace(/\n/g, '\n  ')}`);
  console.log(`  tags: ${meta.tags.join(', ') || '—'}`);
  console.log(`  ${info.nodes} nodes, ${info.edges} connections, ${Object.keys(doc.dependencies || {}).length} bundled sub-flow(s)`);
  console.log(`  made of: ${info.types.slice(0, 12).map((t) => `${t.name}${t.count > 1 ? ` ×${t.count}` : ''}`).join(', ')}`);
  if (info.executable.length) {
    console.log('\n  ⚠ contains code / markup that runs in visitors\' browsers — read it before approving:');
    for (const e of info.executable) console.log(`    - ${e.name} ×${e.count}`);
  } else console.log('  no script / worklet / HTML content detected');
  if (info.diskSamples) console.log(`  note: ${info.diskSamples} sample node(s) reference local audio that isn't included`);
  console.log(`\n  flow written to ${out} — load it with "Import Flow" in the editor.`);
  console.log(`  approve:  gh issue edit ${number} --repo ${repo} --add-label approved`);
} catch (e) {
  console.error(e instanceof Reject ? `✗ ${e.message}` : e.message);
  process.exit(1);
}
