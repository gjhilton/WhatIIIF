#!/usr/bin/env node
// Usage: node engine/build.js [--content content] [--out dist]
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { build } from './lib/build.js';

const { values } = parseArgs({ options: { content: { type: 'string', default: 'content' }, out: { type: 'string', default: 'dist' } } });
const clientGenerated = fileURLToPath(new URL('./client/src/generated/site.json', import.meta.url));

try {
  await build({ contentDir: values.content, outDir: values.out, siteConfigPath: clientGenerated, log: console.log });
} catch (error) {
  console.error(`\nBuild failed: ${error.message}`);
  process.exit(1);
}
