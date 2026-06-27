#!/usr/bin/env node
/**
 * Generate a manifest of all flow examples in public/flow-examples
 * This allows the app to discover all examples without hardcoding them
 */

import fs from 'fs';
import path from 'path';
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
  
  const flowExamples = getAllJsonFiles(EXAMPLES_DIR);
  
  const manifest = {
    generated: new Date().toISOString(),
    examples: flowExamples.sort()
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
  
  console.log(`✓ Generated manifest with ${flowExamples.length} examples:`);
  flowExamples.forEach(example => console.log(`  - ${example}`));
  console.log(`\nManifest written to: ${OUTPUT_FILE}`);
} catch (error) {
  console.error('Error generating manifest:', error);
  process.exit(1);
}
