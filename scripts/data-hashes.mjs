import { createHash } from 'node:crypto';
import { DATASET_FILES } from '../src/data/registry.js';

// Hash UTF-8 CSV contents exactly as registered. Even a schema-valid update
// requires review; a hash is an integrity baseline, not a semantic validator.
export function datasetHashes(contents) {
  return Object.fromEntries(DATASET_FILES.map((file, index) => [
    file, createHash('sha256').update(contents[index], 'utf8').digest('hex'),
  ]));
}
