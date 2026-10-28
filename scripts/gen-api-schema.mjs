#!/usr/bin/env node
// Regenerate the schema tables in docs/API.md from the documented CSV shapes
// in src/data/schema.js, so the docs cannot drift from the schema reference.
//
// The column tables live between sentinel comments in API.md; this script
// rewrites the content between them. A sync test (csvSchema.test.js) calls
// `renderApiMd` to assert API.md is already up to date, so a schema change
// without re-running this fails CI.
//
//   node scripts/gen-api-schema.mjs        # rewrite API.md in place
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILES, COVERAGE_BLOCK } from '../src/data/schema.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_MD = join(ROOT, 'docs', 'API.md');

const COVERAGE_NAMES = new Set(COVERAGE_BLOCK.map((c) => c.name));

// Display path for a file key (drop the leading data/ for brevity in the table).
const display = (key) => key.replace(/^data\//, '');

function identityTable() {
  const rows = Object.entries(FILES).map(([key, def]) => {
    const ids = def.columns.filter((c) => !COVERAGE_NAMES.has(c.name)).map((c) => `\`${c.name}\``).join(', ');
    return `| \`${display(key)}\` | ${ids} |`;
  });
  return ['| File | Leading columns (then the shared coverage block) |', '| --- | --- |', ...rows].join('\n');
}

function coverageTable() {
  const rows = COVERAGE_BLOCK.map((c) => `| \`${c.name}\` | ${c.type} | ${c.description} |`);
  return ['| Column | Type | Description |', '| --- | --- | --- |', ...rows].join('\n');
}

// Replace the content between <!-- BEGIN GENERATED: <id> --> and the matching
// END marker. Throws if a marker pair is missing (fail loud, not silent).
function replaceBlock(text, id, body) {
  const begin = `<!-- BEGIN GENERATED: ${id} -->`;
  const end = `<!-- END GENERATED: ${id} -->`;
  const re = new RegExp(`${begin}[\\s\\S]*?${end}`);
  if (!re.test(text)) throw new Error(`gen-api-schema: markers for "${id}" not found in API.md`);
  return text.replace(re, `${begin}\n${body}\n${end}`);
}

export function renderApiMd(text) {
  let out = replaceBlock(text, 'identity', identityTable());
  out = replaceBlock(out, 'coverage', coverageTable());
  return out;
}

// Run directly -> rewrite API.md in place.
if (import.meta.url === `file://${process.argv[1]}`) {
  const current = readFileSync(API_MD, 'utf8');
  const next = renderApiMd(current);
  writeFileSync(API_MD, next);
  console.log(next === current ? 'gen-api-schema: API.md already up to date' : 'gen-api-schema: updated API.md');
}
