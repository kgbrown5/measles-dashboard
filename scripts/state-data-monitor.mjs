import { DATASET_FILES, dataUrl } from '../src/data/registry.js';
import { csvParse } from 'd3-dsv';
import { setTimeout as delay } from 'node:timers/promises';
import { datasetHashes } from './data-hashes.mjs';
import { isStateCode, parseRepositoryUrl, validateDataset } from './registration-core.mjs';

// Network requests are bounded and retried before an outage is reported. No
// credentials are ever sent to a state's endpoint or followed through redirects.
export async function fetchPublicText(url, { fetchImpl = fetch, origin, attempts = 3 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(15000),
        headers: { ...(origin ? { Origin: origin } : {}), 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (origin && new URL(response.url || url).origin !== origin) {
        const allowed = response.headers.get('access-control-allow-origin');
        if (allowed !== '*' && allowed !== origin) throw new Error(`CORS does not allow dashboard origin ${origin}`);
      }
      return await response.text();
    } catch (error) {
      if (attempt === attempts) throw new Error(`${url}: ${error.message}`);
      await delay(250 * attempt);
    }
  }
}

export function githubClient(token, fetchImpl = fetch) {
  return async (path, options = {}) => {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid GitHub API path');
    const response = await fetchImpl(`https://api.github.com${path}`, {
      method: options.method || 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    if (!response.ok) throw new Error(`GitHub ${path}: HTTP ${response.status}`);
    return response.json();
  };
}

function repositorySource(entry) {
  if (typeof entry === 'object' && entry.repository_url) return parseRepositoryUrl(entry.repository_url);
  // Legacy URL entries have no identity metadata. Only infer conventional Pages
  // project sites; arbitrary custom domains need an explicit repository_url.
  const url = new URL(typeof entry === 'string' ? entry : entry.base_url);
  const match = /^([a-z0-9-]+)\.github\.io$/i.exec(url.hostname);
  const parts = url.pathname.split('/').filter(Boolean);
  if (!match || parts.length !== 1) return null;
  return parseRepositoryUrl(`https://github.com/${match[1]}/${parts[0]}`);
}

export async function checkState(stateCode, entry, { request, readText, origin, countyGeometries } = {}) {
  const result = { state: stateCode, errors: [], warnings: [], urls: {}, hashes: {}, repository: null };
  if (!isStateCode(stateCode)) {
    result.errors.push(`Unknown state code: ${stateCode}`);
    return result;
  }
  try {
    const source = repositorySource(entry);
    if (source) {
      const repo = await request(`/repos/${source.owner}/${source.repo}`);
      if (entry.repository_id && String(repo.id) !== String(entry.repository_id)) {
        throw new Error('Repository ID changed: reverify the registry; refusing to notify a replacement repository.');
      }
      // Remember the ID for a second check immediately before issue creation.
      result.repository = { id: String(repo.id), full_name: repo.full_name };
      if (repo.private) result.errors.push('Registered repository is no longer public.');
      if (repo.archived) result.errors.push('Registered repository is archived.');
      if (!repo.has_issues) result.warnings.push('Repository issues are disabled; notification cannot be delivered.');
    } else {
      result.warnings.push('No repository_url: automatic issue delivery requires re-registration.');
    }
  } catch (error) {
    result.errors.push(error.message);
  }

  try {
    const files = [...DATASET_FILES, 'meta.json'];
    for (const file of files) result.urls[file] = dataUrl(entry, file);
    const responses = await Promise.allSettled(files.map(file => readText(result.urls[file], { origin })));
    responses.forEach((response, i) => {
      if (response.status === 'rejected') result.errors.push(`${files[i]}: ${response.reason.message}`);
    });
    if (responses.slice(0, 3).every(response => response.status === 'fulfilled')) {
      const contents = responses.slice(0, 3).map(response => response.value);
      result.hashes = datasetHashes(contents);
      try {
        result.row_counts = validateDataset({ stateCode, files: DATASET_FILES, contents }).rowCounts;
      } catch (error) {
        result.errors.push(error.message);
      }
      if (countyGeometries) {
        const fips = csvParse(contents[0])[0]?.state_fips?.padStart(2, '0');
        const byName = new Map(countyGeometries.filter(county => String(county.id).startsWith(fips))
          .map(county => [county.properties.name, String(county.id)]));
        for (const county of csvParse(contents[1])) {
          if (!byName.has(county.county)) {
            result.errors.push(`counties.csv: county "${county.county}" does not match a county name on the dashboard map.`);
          } else if (county.county_fips && county.county_fips !== byName.get(county.county)) {
            result.errors.push(`counties.csv: county_fips for "${county.county}" does not match the dashboard map.`);
          }
        }
      }
      if (entry.data_sha256) {
        for (const file of DATASET_FILES) {
          if (!/^[a-f0-9]{64}$/.test(entry.data_sha256[file] || '')) {
            result.errors.push(`${file}: missing or invalid registered SHA-256; re-register this repository.`);
          } else if (entry.data_sha256[file] !== result.hashes[file]) {
            result.errors.push(`${file}: published SHA-256 ${result.hashes[file]} differs from registered ${entry.data_sha256[file]}; reverify and re-register the data.`);
          }
        }
      } else {
        result.warnings.push('No registered SHA-256 baseline; schema checks only. Re-register to enable drift detection.');
      }
      if (responses[3].status === 'fulfilled') {
        try {
          const meta = JSON.parse(responses[3].value);
          // fips is used directly as a prefix when selecting county polygons.
          const stateFips = csvParse(contents[0])[0]?.state_fips?.padStart(2, '0');
          if (meta.code !== stateCode || meta.fips !== stateFips) throw new Error('code/fips must match the registered state (fips must be a two-digit string).');
          for (const field of ['name', 'fullName', 'dataDir', 'sourceUrl', 'sourceLabel']) {
            if (typeof meta[field] !== 'string' || !meta[field].trim()) throw new Error(`${field} is required.`);
          }
        } catch (error) {
          result.errors.push(`meta.json: ${error.message}`);
        }
      }
    }
  } catch (error) {
    result.errors.push(error.message);
  }
  return result;
}

export async function monitorRegistry(registry, options) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) throw new Error('Registry must be an object keyed by state code.');
  const results = [];
  // Bound network concurrency while keeping a widespread outage within the
  // workflow timeout. A state's failure never prevents checking another state.
  const entries = Object.entries(registry);
  for (let index = 0; index < entries.length; index += 4) {
    results.push(...await Promise.all(entries.slice(index, index + 4)
      .map(([code, entry]) => checkState(code, entry, options))));
  }
  return results;
}

function issueBody(result, centralRepository, runUrl) {
  const details = result.errors.join('\n').slice(0, 18000)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('@', '&#64;');
  return [
    `<!-- state-data-monitor:${centralRepository}:${result.state} -->`,
    `The dashboard's published-data check failed for **${result.state.toUpperCase()}**.`,
    '',
    `<pre>${details}</pre>`,
    '',
    'Restore the public CSV and meta.json endpoints, check the schema and county/school links, and verify the data source.',
    'If this is an intentional data update, rerun **Register State Repository** in the dashboard repository using the same state code and repository URL. An administrator must review and merge the resulting PR to refresh the SHA-256 baseline.',
    'A changed hash means the published data differs from the reviewed version; it does not by itself mean the estimates are incorrect.',
    '',
    `[Validation run and full report](${runUrl})`,
    `[Registration instructions](https://github.com/${centralRepository}/blob/HEAD/docs/REGISTRATION.md)`,
  ].join('\n');
}

export async function reportStateIssue(result, { request, centralRepository, runUrl }) {
  if (!result.errors.length) return { status: 'healthy' };
  if (!result.repository) throw new Error(`${result.state}: no verified repository available for issue delivery.`);
  const repo = await request(`/repositories/${result.repository.id}`);
  if (String(repo.id) !== result.repository.id || !/^[\w.-]+\/[\w.-]+$/.test(repo.full_name)) throw new Error('Repository identity could not be verified.');
  if (!repo.has_issues || repo.archived) throw new Error(`${repo.full_name}: issues disabled or repository archived.`);
  const path = `/repos/${repo.full_name}/issues`;
  const marker = `<!-- state-data-monitor:${centralRepository}:${result.state} -->`;
  // Paginate: unrelated issues and PRs must not hide an existing alert.
  for (let page = 1; ; page++) {
    const issues = await request(`${path}?state=open&per_page=100&page=${page}`);
    const existing = issues.find(issue => !issue.pull_request && issue.body?.includes(marker));
    if (existing) return { status: 'existing', url: existing.html_url };
    if (issues.length < 100) break;
  }
  const issue = await request(path, {
    method: 'POST',
    body: {
      title: `[Dashboard data validation] ${result.state.toUpperCase()}: reverify registered data`,
      body: issueBody(result, centralRepository, runUrl),
    },
  });
  return { status: 'created', url: issue.html_url };
}
