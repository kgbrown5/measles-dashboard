// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { csvFormat } from 'd3-dsv';
import { columnNames } from '../src/data/schema.js';
import { dataUrl, DATASET_FILES } from '../src/data/registry.js';
import { datasetHashes } from './data-hashes.mjs';
import { buildRegistryEntry, checkRegistryConflicts, validateDataset } from './registration-core.mjs';
import { checkState, fetchPublicText, githubClient, monitorRegistry, reportStateIssue } from './state-data-monitor.mjs';

const shapes = ['data/states.csv', 'data/states/{state}.csv', 'data/states/{state}/schools.csv'];
function bundle(overrides = {}) {
  return [
    { state: 'nc', state_fips: '37', state_name: 'North Carolina', n_schools: '1', coverage: '0.96', tier: 'H', ...overrides.state },
    { county: 'Wake', county_fips: '37183', n_schools: '1', coverage: '0.96', tier: 'H', ...overrides.county },
    { school_id: '1', school_name: 'School', county: 'Wake', no_data: '0', coverage: '0.96', tier: 'H', ...overrides.school },
  ].map((row, index) => csvFormat([row], columnNames(shapes[index])) + '\n');
}
const meta = { code: 'nc', fips: '37', name: 'NC', fullName: 'North Carolina', dataDir: 'NC', sourceUrl: 'https://example.org', sourceLabel: 'Source' };
const repo = { id: 123, full_name: 'team/measles-NC', private: false, has_issues: true, archived: false };
function entry(contents = bundle()) {
  return {
    base_url: 'https://team.github.io/measles-NC/', dataset_path: 'data/',
    repository_url: 'https://github.com/team/measles-NC', repository_id: '123',
    data_sha256: datasetHashes(contents),
  };
}
function options(contents = bundle(), metadata = meta) {
  return {
    request: vi.fn(async () => repo),
    readText: vi.fn(async url => {
      const file = new URL(url).pathname.split('/').pop();
      return file === 'meta.json' ? JSON.stringify(metadata) : contents[DATASET_FILES.indexOf(file)];
    }),
    origin: 'https://accidda.github.io',
  };
}
const validate = contents => validateDataset({ stateCode: 'nc', files: DATASET_FILES, contents });

describe('published state data', () => {
  it('checks a healthy bundle and records its reviewed fingerprints', async () => {
    const result = await checkState('nc', entry(), options());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.row_counts).toEqual({ states: 1, counties: 1, schools: 1 });
    expect(result.hashes).toEqual(entry().data_sha256);
  });

  it('flags schema-valid drift, including changes to optional cells', async () => {
    const changed = bundle({ school: { enrollment: '500' } });
    const result = await checkState('nc', entry(), options(changed));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/schools.csv: published SHA-256.*differs/);
  });

  it('runs semantic checks even when the hash matches', async () => {
    const invalid = bundle({ school: { coverage: '1.5' } });
    const result = await checkState('nc', entry(invalid), options(invalid));
    expect(result.errors.join('\n')).toMatch(/above maximum/);
    expect(result.errors.join('\n')).not.toMatch(/differs/);
  });

  it.each([
    [{ state: { state: 'va' } }, /state must be nc/],
    [{ county: { county_fips: '51183' } }, /another state/],
    [{ school: { county: 'Absent' } }, /absent from/],
    [{ school: { school_id: '' } }, /school_id is required/],
    [{ school: { coverage: '', coverage_ci_low: '0.5' } }, /usable overall coverage/],
    [{ state: { coverage: '' } }, /usable overall coverage/],
  ])('rejects a bundle that cannot support the dashboard: %j', (change, expected) => {
    expect(() => validate(bundle(change))).toThrow(expected);
  });

  it('rejects duplicate identities and truncated/extra CSV cells', () => {
    const duplicate = bundle();
    duplicate[2] += duplicate[2].split('\n')[1] + '\n';
    expect(() => validate(duplicate)).toThrow(/duplicate school_id/);
    const truncated = bundle();
    truncated[1] = truncated[1].replace(/,H\n$/, '\n');
    expect(() => validate(truncated)).toThrow(/cells; expected/);
    const extra = bundle();
    extra[1] = extra[1].replace(/\n$/, ',extra\n');
    expect(() => validate(extra)).toThrow(/cells; expected/);
    const unclosed = bundle();
    unclosed[2] = unclosed[2].replace('School', '"School');
    expect(() => validate(unclosed)).toThrow(/unterminated CSV/);
  });

  it('accepts escaped quotes, commas, and newlines inside quoted fields', () => {
    expect(() => validate(bundle({ school: { school_name: 'School "A",\nElementary' } }))).not.toThrow();
  });

  it('detects county names and FIPS that cannot join to the map', async () => {
    const opts = { ...options(), countyGeometries: [{ id: '37183', properties: { name: 'Wake' } }] };
    expect((await checkState('nc', entry(), opts)).errors).toEqual([]);
    opts.countyGeometries[0].properties.name = 'Different';
    expect((await checkState('nc', entry(), opts)).errors.join()).toMatch(/does not match a county name/);
    opts.countyGeometries[0] = { id: '37181', properties: { name: 'Wake' } };
    expect((await checkState('nc', entry(), opts)).errors.join()).toMatch(/county_fips.*does not match/);
  });

  it('allows documented blank coordinates and intervals and unpadded state FIPS', () => {
    expect(() => validate(bundle())).not.toThrow();
    expect(() => validateDataset({ stateCode: 'ca', files: DATASET_FILES, contents: bundle({
      state: { state: 'ca', state_fips: '6', state_name: 'California' },
      county: { county_fips: '06001' },
    }) })).not.toThrow();
  });

  it('detects missing metadata, malformed JSON, and metadata state mismatches', async () => {
    const missing = options();
    missing.readText = async url => { throw new Error(`${url}: HTTP 404`); };
    expect((await checkState('nc', entry(), missing)).errors).toHaveLength(4);
    expect((await checkState('nc', entry(), options(bundle(), { ...meta, fips: 37 }))).errors.join()).toMatch(/meta.json.*two-digit/);
    const badJson = options();
    const original = badJson.readText;
    badJson.readText = url => url.endsWith('meta.json') ? '<html>' : original(url);
    expect((await checkState('nc', entry(), badJson)).errors.join()).toMatch(/meta.json/);
  });

  it('continues validating other states after an endpoint fails', async () => {
    const opts = options();
    const original = opts.readText;
    opts.readText = url => url.includes('broken') ? Promise.reject(new Error('HTTP 404')) : original(url);
    const results = await monitorRegistry({ va: { ...entry(), base_url: 'https://broken.test/' }, nc: entry() }, opts);
    expect(results[0].errors.length).toBeGreaterThan(0);
    expect(results[1].errors).toEqual([]);
  });

  it('does not notify a new repository at a reused URL', async () => {
    const result = await checkState('nc', { ...entry(), repository_id: '456' }, options());
    expect(result.errors.join()).toMatch(/Repository ID changed/);
    expect(result.repository).toBeNull();
  });

  it('keeps legacy URLs working and explicitly reports missing baselines', async () => {
    const result = await checkState('nc', 'https://team.github.io/measles-NC/', options());
    expect(result.errors).toEqual([]);
    expect(result.warnings.join()).toMatch(/No registered SHA-256/);
    expect(result.repository.id).toBe('123');
  });

  it('rejects partial baselines instead of silently skipping files', async () => {
    const result = await checkState('nc', { ...entry(), data_sha256: {} }, options());
    expect(result.errors).toHaveLength(3);
  });
});

describe('URLs shared with the browser', () => {
  it('supports legacy strings, metadata entries, and root bundles', () => {
    expect(dataUrl('https://example.org/site', 'state.csv')).toBe('https://example.org/site/data/state.csv');
    expect(dataUrl(entry(), 'schools.csv')).toBe('https://team.github.io/measles-NC/data/schools.csv');
    expect(dataUrl({ ...entry(), dataset_path: '.' }, 'meta.json')).toBe('https://team.github.io/measles-NC/meta.json');
  });
  it('rejects ambiguous or credential-bearing endpoint URLs', () => {
    expect(() => dataUrl('https://user:pass@example.org', 'state.csv')).toThrow(/credentials/);
    expect(() => dataUrl({ ...entry(), dataset_path: '../' }, 'state.csv')).toThrow(/dataset_path/);
  });
});

describe('network and browser availability', () => {
  const response = (body, headers = {}) => new Response(body, { headers });
  it('retries transient failures, bounds requests, and sends no credentials to data hosts', async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(response('csv', { 'access-control-allow-origin': '*' }));
    expect(await fetchPublicText('https://example.org/data.csv', { fetchImpl, origin: 'https://accidda.github.io' })).toBe('csv');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
  it('fails on HTTP errors and missing browser CORS access', async () => {
    await expect(fetchPublicText('https://example.org', { attempts: 1, fetchImpl: async () => new Response('', { status: 404 }) })).rejects.toThrow(/HTTP 404/);
    await expect(fetchPublicText('https://example.org', { attempts: 1, origin: 'https://accidda.github.io', fetchImpl: async () => response('csv') })).rejects.toThrow(/CORS/);
  });
  it('does not require CORS on same-origin data', async () => {
    await expect(fetchPublicText('https://accidda.github.io/data.csv', { origin: 'https://accidda.github.io', fetchImpl: async () => response('csv') })).resolves.toBe('csv');
  });
  it('restricts credentials to GitHub and surfaces authorization failures', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 403 }));
    await expect(githubClient('secret', fetchImpl)('/repos/team/repo')).rejects.toThrow(/HTTP 403/);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.github.com/repos/team/repo');
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('error');
  });
});

describe('state issue delivery', () => {
  const failed = { state: 'nc', errors: ['schools.csv: invalid coverage'], repository: { id: '123' } };
  const context = { centralRepository: 'ACCIDDA/measles-dashboard', runUrl: 'https://github.com/ACCIDDA/measles-dashboard/actions/runs/1' };
  it('creates an actionable issue in the verified state repository', async () => {
    const request = vi.fn().mockResolvedValueOnce(repo).mockResolvedValueOnce([]).mockResolvedValueOnce({ html_url: 'https://github.com/team/measles-NC/issues/1' });
    expect(await reportStateIssue(failed, { ...context, request })).toMatchObject({ status: 'created' });
    const [path, { body }] = request.mock.calls[2];
    expect(path).toBe('/repos/team/measles-NC/issues');
    expect(body.body).toContain('Register State Repository');
    expect(body.body).toContain('schools.csv: invalid coverage');
    expect(body.body).toContain(context.runUrl);
  });
  it('deduplicates through pagination and excludes PRs', async () => {
    const marker = '<!-- state-data-monitor:ACCIDDA/measles-dashboard:nc -->';
    const firstPage = Array.from({ length: 100 }, () => ({ pull_request: {}, body: marker }));
    const request = vi.fn().mockResolvedValueOnce(repo).mockResolvedValueOnce(firstPage).mockResolvedValueOnce([{ body: marker, html_url: 'existing' }]);
    expect(await reportStateIssue(failed, { ...context, request })).toEqual({ status: 'existing', url: 'existing' });
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[2][0]).toContain('page=2');
  });
  it('does not notify healthy states and fails explicitly for undeliverable alerts', async () => {
    const request = vi.fn();
    expect(await reportStateIssue({ errors: [] }, { ...context, request })).toEqual({ status: 'healthy' });
    expect(request).not.toHaveBeenCalled();
    await expect(reportStateIssue({ ...failed, repository: null }, { ...context, request })).rejects.toThrow(/no verified repository/);
    request.mockResolvedValue({ ...repo, has_issues: false });
    await expect(reportStateIssue(failed, { ...context, request })).rejects.toThrow(/issues disabled/);
  });
  it('does not hide failed issue writes', async () => {
    const request = vi.fn().mockResolvedValueOnce(repo).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('HTTP 403'));
    await expect(reportStateIssue(failed, { ...context, request })).rejects.toThrow(/403/);
  });
});

describe('reverification', () => {
  it('refreshes the same repository but cannot replace a registered identity', () => {
    expect(() => checkRegistryConflicts({ nc: entry() }, 'nc', 123, entry().repository_url, { reverify: true })).not.toThrow();
    expect(() => checkRegistryConflicts({ nc: entry() }, 'nc', 456, 'https://github.com/team/other', { reverify: true })).toThrow(/already registered/);
    expect(() => checkRegistryConflicts({ nc: 'https://team.github.io/measles-NC/' }, 'nc', 123, entry().repository_url, { reverify: true })).not.toThrow();
    expect(() => checkRegistryConflicts({ nc: 'https://team.github.io/measles-NC/' }, 'nc', 456, 'https://github.com/team/other', { reverify: true })).toThrow(/already registered/);
  });
  it('persists approved hashes in the registration entry', () => {
    const hashes = datasetHashes(bundle());
    expect(buildRegistryEntry({ stateCode: 'nc', dataHashes: hashes }).data_sha256).toEqual(hashes);
  });
});
