#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { datasetHashes } from './data-hashes.mjs';
import {
  buildRegistryEntry,
  checkRegistryConflicts,
  discoverDataset,
  isStateCode,
  parseRepositoryUrl,
  registryJson,
  validateDataset,
} from './registration-core.mjs';

const token = process.env.GITHUB_TOKEN;
const centralRepository = process.env.GITHUB_REPOSITORY;
const stateCode = (process.env.STATE_CODE || '').trim().toLowerCase();
const repositoryInput = (process.env.REPOSITORY_URL || '').trim();

function fail(message) {
  console.error(`register-state-repository: ${message}`);
  process.exit(1);
}

if (!isStateCode(stateCode)) fail('state_code must be a recognized two-letter USPS code.');
if (!token) fail('no GitHub token is available.');
if (!centralRepository?.includes('/')) fail('GITHUB_REPOSITORY is not set.');

const source = (() => {
  try {
    return parseRepositoryUrl(repositoryInput);
  } catch (error) {
    fail(error.message);
  }
})();
const api = 'https://api.github.com';
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
};

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) {
    const detail = await response.text();
    const suffix = response.status === 404
      ? ' The repository may not exist, be inaccessible, or be private.'
      : ` (${response.status})`;
    throw new Error(`GitHub API request failed${suffix}: ${detail.slice(0, 300)}`);
  }
  return response.status === 204 ? null : response.json();
}

async function main() {
  const repository = await request(`/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}`);
  if (repository.private) {
    throw new Error('the source repository must be public; private repositories are not supported.');
  }
  const branch = await request(`/repos/${source.owner}/${source.repo}/branches/${encodeURIComponent(repository.default_branch)}`);
  const sourceCommitSha = branch.commit.sha;
  const tree = await request(`/repos/${source.owner}/${source.repo}/git/trees/${sourceCommitSha}?recursive=1`);
  if (tree.truncated) throw new Error('repository tree is too large to inspect safely; contact an administrator.');
  const dataset = discoverDataset(
    tree.tree.filter((item) => item.type === 'blob').map((item) => item.path),
    stateCode,
  );
  const blobs = await Promise.all(dataset.files.map(async (path) => {
    const item = tree.tree.find((entry) => entry.path === path);
    const blob = await request(`/repos/${source.owner}/${source.repo}/git/blobs/${item.sha}`);
    return Buffer.from(blob.content, 'base64').toString('utf8');
  }));
  const result = validateDataset({ stateCode, files: dataset.files, contents: blobs });
  const centralRegistryPath = 'public/data/stateRegistry.json';
  const registry = JSON.parse(readFileSync(centralRegistryPath, 'utf8'));
  const manifestPath = 'public/data/states.json';
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  checkRegistryConflicts(registry, stateCode, repository.id, source.canonicalUrl, { reverify: true });
  const existing = registry[stateCode];
  const homepage = (typeof existing === 'string' ? existing : existing?.base_url)
    || `https://${source.owner}.github.io/${source.repo}/`;
  registry[stateCode] = buildRegistryEntry({
    stateCode,
    repositoryUrl: source.canonicalUrl,
    repositoryId: repository.id,
    datasetPath: dataset.root || '.',
    sourceCommitSha,
    stateName: result.stateName,
    reportingPeriod: result.reportingPeriod,
    baseUrl: homepage,
    dataHashes: datasetHashes(blobs),
  });
  manifest[stateCode] = {
    ...(manifest[stateCode] || {}),
    fips: registry[stateCode].fips,
    name: result.stateName,
    status: 'ready',
  };
  process.stdout.write(JSON.stringify({
    repository,
    sourceCommitSha,
    dataset,
    result,
    registry: registryJson(registry),
    registryPath: centralRegistryPath,
    manifest: `${JSON.stringify(manifest, null, 2)}\n`,
    manifestPath,
    baseUrl: homepage,
  }));
}

main().catch((error) => fail(error.message));
