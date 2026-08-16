#!/usr/bin/env node
/**
 * Generate a manifest of all flow examples in public/flow-examples
 * This allows the app to discover all examples without hardcoding them
 */

import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '../public/flow-examples');

// Top-level subfolders that are their own independent bundle (seeded to their
// own sibling folder under flows/ on disk, e.g. flows/drums/) rather than
// being nested content inside the main "examples" bundle (flows/examples/).
const INDEPENDENT_BUNDLES = ['drums'];

function getAllJsonFiles(dir, baseDir = dir) {
  const files = [];

  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Recursively scan subdirectories
      files.push(...getAllJsonFiles(fullPath, baseDir));
    } else if (stat.isFile() && item.endsWith('.json') && item !== 'manifest.json') {
      // Get relative path from base directory
      const relativePath = path.relative(baseDir, fullPath);
      // Convert to forward slashes and remove .json extension
      const flowPath = relativePath.replace(/\\/g, '/').replace(/\.json$/, '');
      files.push(flowPath);
    }
  }

  return files;
}

function generateManifestFor(dir, label, excludeTopLevel = []) {
  const outputFile = path.join(dir, 'manifest.json');
  const flowExamples = getAllJsonFiles(dir)
    .filter((flowPath) => !excludeTopLevel.includes(flowPath.split('/')[0]))
    .sort();

  // Content version: an md5 of every example file's bytes. Changes only when an
  // example's content actually changes, so the app can detect "the bundled
  // version is newer than the copy on disk" and re-seed just then.
  const h = crypto.createHash('md5');
  for (const name of flowExamples) {
    h.update(name);
    h.update(fs.readFileSync(path.join(dir, `${name}.json`)));
  }
  const version = h.digest('hex').slice(0, 16);

  const manifest = {
    generated: new Date().toISOString(),
    version,
    examples: flowExamples
  };

  fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2));
  console.log(`✓ Generated ${label} manifest (version ${version}) with ${flowExamples.length} examples:`);
  flowExamples.forEach(example => console.log(`  - ${example}`));
  console.log(`  written to: ${outputFile}`);
}

try {
  if (!fs.existsSync(ROOT_DIR)) {
    console.error('Examples directory not found:', ROOT_DIR);
    process.exit(1);
  }

  for (const bundle of INDEPENDENT_BUNDLES) {
    const bundleDir = path.join(ROOT_DIR, bundle);
    if (fs.existsSync(bundleDir)) generateManifestFor(bundleDir, bundle);
  }

  // Main "examples" bundle: everything at ROOT_DIR except the independent
  // bundle subfolders (they get their own manifest above).
  generateManifestFor(ROOT_DIR, 'examples', INDEPENDENT_BUNDLES);
} catch (error) {
  console.error('Error generating manifest:', error);
  process.exit(1);
}
