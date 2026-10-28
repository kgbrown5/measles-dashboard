import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderApiMd } from '../../scripts/gen-api-schema.mjs';

const ROOT = resolve(__dirname, '../..');

describe('schema docs', () => {
  it('keeps API.md schema tables in sync with schema.js', () => {
    const md = readFileSync(resolve(ROOT, 'docs', 'API.md'), 'utf8');
    expect(renderApiMd(md)).toBe(md);
  });
});
