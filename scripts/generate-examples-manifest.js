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

const EXAMPLES_DIR = path.join(__dirname, '../public/flow-examples');
const OUTPUT_FILE = path.join(EXAMPLES_DIR, 'manifest.json');

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

try {
  if (!fs.existsSync(EXAMPLES_DIR)) {
    console.error('Examples directory not found:', EXAMPLES_DIR);
    process.exit(1);
  }
  
  const flowExamples = getAllJsonFiles(EXAMPLES_DIR).sort();

  // Content version: an md5 of every example file's bytes. Changes only when an
  // example's content actually changes, so the app can detect "the bundled
  // version is newer than the copy on disk" and re-seed just then.
  const h = crypto.createHash('md5');
  for (const name of flowExamples) {
    h.update(name);
    h.update(fs.readFileSync(path.join(EXAMPLES_DIR, `${name}.json`)));
  }
  const version = h.digest('hex').slice(0, 16);

  const manifest = {
    generated: new Date().toISOString(),
    version,
    examples: flowExamples
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
  console.log(`  version: ${version}`);
  
  console.log(`✓ Generated manifest with ${flowExamples.length} examples:`);
  flowExamples.forEach(example => console.log(`  - ${example}`));
  console.log(`\nManifest written to: ${OUTPUT_FILE}`);
} catch (error) {
  console.error('Error generating manifest:', error);
  process.exit(1);
}
