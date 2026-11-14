import { csvParse, csvParseRows } from 'd3-dsv';
import { FILES, columnNames } from '../src/data/schema.js';
import { validateRows } from '../src/data/validate.js';

const STATE_FIPS = {
  al: '01', ak: '02', az: '04', ar: '05', ca: '06', co: '08', ct: '09',
  de: '10', dc: '11', fl: '12', ga: '13', hi: '15', id: '16', il: '17',
  in: '18', ia: '19', ks: '20', ky: '21', la: '22', me: '23', md: '24',
  ma: '25', mi: '26', mn: '27', ms: '28', mo: '29', mt: '30', ne: '31',
  nv: '32', nh: '33', nj: '34', nm: '35', ny: '36', nc: '37', nd: '38',
  oh: '39', ok: '40', or: '41', pa: '42', ri: '44', sc: '45', sd: '46',
  tn: '47', tx: '48', ut: '49', vt: '50', va: '51', wa: '53', wv: '54',
  wi: '55', wy: '56', pr: '72',
};

export function isStateCode(value) {
  return Object.hasOwn(STATE_FIPS, value);
}

const DATASET_FILES = [
  ['state.csv', 'counties.csv', 'schools.csv'],
  ['data/state.csv', 'data/counties.csv', 'data/schools.csv'],
];

export function parseRepositoryUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('repository_url must be an HTTPS GitHub repository URL.');
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') {
    throw new Error('repository_url must use https://github.com/<owner>/<repository>.');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw new Error('repository_url must identify exactly one GitHub repository.');
  }
  return {
    owner: parts[0],
    repo: parts[1].replace(/\.git$/, ''),
    canonicalUrl: `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/, '')}`,
  };
}

function expand(path, stateCode) {
  return path.replace('{state}', stateCode);
}

export function discoverDataset(treePaths, stateCode) {
  const normalized = new Set(treePaths);
  for (const candidate of DATASET_FILES) {
    const files = candidate.map((path) => expand(path, stateCode));
    if (files.every((path) => normalized.has(path))) {
      return {
        root: files[0].slice(0, -'state.csv'.length),
        files,
        shapes: ['data/states.csv', 'data/states/{state}.csv', 'data/states/{state}/schools.csv'],
      };
    }
  }
  throw new Error(
    `could not find the required dataset files. Expected state.csv, counties.csv, `
      + `and schools.csv (optionally under data/).`,
  );
}

function validateFile(path, shape, contents) {
  // d3-dsv intentionally tolerates malformed quotes and extra/missing cells.
  // Reject those at ingestion rather than silently dropping or shifting values.
  let quoted = false;
  let fieldStart = true;
  let closed = false;
  for (let i = 0; i < contents.length; i++) {
    const char = contents[i];
    if (quoted) {
      if (char === '"') {
        if (contents[i + 1] === '"') i++;
        else { quoted = false; closed = true; }
      }
    } else if (char === ',' || char === '\r' || char === '\n') {
      fieldStart = true;
      closed = false;
    } else if (closed || (char === '"' && !fieldStart)) {
      return [`${path}: malformed CSV quoting.`];
    } else {
      quoted = char === '"';
      fieldStart = false;
    }
  }
  if (quoted) return [`${path}: unterminated CSV quoted field.`];
  const rows = csvParse(contents);
  const expected = columnNames(shape);
  if (!rows.columns || rows.columns.join(',') !== expected.join(',')) {
    return [`${path}: header must exactly match the ACCIDA schema (${expected.join(',')}).`];
  }
  const errors = validateRows(shape, rows).map((error) => `${path}: ${error}`);
  csvParseRows(contents).slice(1).forEach((row, index) => {
    if (row.length !== expected.length) errors.push(`${path}: row ${index + 1} has ${row.length} cells; expected ${expected.length}.`);
  });
  return errors;
}

export function validateDataset({ stateCode, files, contents }) {
  if (!isStateCode(stateCode)) throw new Error(`Unknown state code: ${stateCode}`);
  const [statePath, countyPath, schoolsPath] = files;
  const shapes = [
    'data/states.csv',
    'data/states/{state}.csv',
    'data/states/{state}/schools.csv',
  ];
  const errors = shapes.flatMap((shape, index) => validateFile(files[index], shape, contents[index]));
  const [stateRows, countyRows, schoolRows] = contents.map((text) => csvParse(text));
  if (stateRows.length !== 1) errors.push(`${statePath}: must contain exactly one state row.`);
  const stateRow = stateRows[0];
  if (stateRow && stateRow.state !== stateCode) {
    errors.push(`${statePath}: state must be ${stateCode}.`);
  }
  if (stateRow && stateRow.state_fips?.padStart(2, '0') !== STATE_FIPS[stateCode]) {
    errors.push(`${statePath}: state_fips must be ${STATE_FIPS[stateCode]}.`);
  }
  if (stateRow && !stateRow.state_name?.trim()) errors.push(`${statePath}: state_name is required.`);
  if (!countyRows.length) errors.push(`${countyPath}: must contain at least one county row.`);
  if (!schoolRows.length) errors.push(`${schoolsPath}: must contain at least one school row.`);
  for (const [path, rows, keys] of [
    [countyPath, countyRows, ['county']],
    [schoolsPath, schoolRows, ['school_id', 'school_name', 'county']],
  ]) {
    const identities = new Set();
    for (const row of rows) {
      for (const key of keys) {
        if (!row[key]?.trim()) errors.push(`${path}: ${key} is required.`);
      }
      if (identities.has(row[keys[0]])) errors.push(`${path}: duplicate ${keys[0]} "${row[keys[0]]}".`);
      identities.add(row[keys[0]]);
    }
  }
  const countyFips = new Set();
  for (const row of countyRows) {
    if (!row.county_fips) continue; // Blank county FIPS is supported by the schema.
    if (!row.county_fips.startsWith(STATE_FIPS[stateCode])) errors.push(`${countyPath}: county_fips ${row.county_fips} belongs to another state.`);
    if (countyFips.has(row.county_fips)) errors.push(`${countyPath}: duplicate county_fips ${row.county_fips}.`);
    countyFips.add(row.county_fips);
  }
  const countyNames = new Set(countyRows.map((row) => row.county));
  for (const row of schoolRows) {
    if (!countyNames.has(row.county)) {
      errors.push(`${schoolsPath}: school county "${row.county}" is absent from ${countyPath}.`);
      break;
    }
  }
  // Overall coverage drives map shading; CI/grade values alone cannot replace it.
  for (const [index, rows] of [stateRows, countyRows, schoolRows].entries()) {
    if (!rows.some((row) => row.coverage?.trim() && row.no_data !== '1')) {
      errors.push(`${files[index]}: must contain at least one usable overall coverage measurement.`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return {
    stateName: stateRow.state_name,
    reportingPeriod: stateRow.reporting_period || null,
    rowCounts: { states: stateRows.length, counties: countyRows.length, schools: schoolRows.length },
  };
}

export function checkRegistryConflicts(registry, stateCode, repositoryId, repositoryUrl, { reverify = false } = {}) {
  for (const [code, value] of Object.entries(registry)) {
    const entry = typeof value === 'string' ? { base_url: value } : value || {};
    if (code === stateCode) {
      if (reverify && !entry.repository_id) {
        const source = parseRepositoryUrl(repositoryUrl);
        const expectedBase = `https://${source.owner}.github.io/${source.repo}`;
        if (entry.repository_url === source.canonicalUrl
          || entry.base_url?.replace(/\/$/, '').toLowerCase() === expectedBase.toLowerCase()) continue;
      }
      if (String(entry.repository_id) === String(repositoryId)) {
        if (reverify) continue;
        throw new Error(`${stateCode.toUpperCase()} is already registered for this repository.`);
      }
      throw new Error(`${stateCode.toUpperCase()} is already registered for ${entry.repository_url || 'another repository'}.`);
    }
    if (String(entry.repository_id) === String(repositoryId)) {
      throw new Error(`repository ${repositoryUrl} is already registered for state ${code.toUpperCase()}.`);
    }
  }
}

export function buildRegistryEntry({ stateCode, repositoryUrl, repositoryId, datasetPath, sourceCommitSha, stateName, reportingPeriod, baseUrl, dataHashes }) {
  return {
    base_url: baseUrl,
    repository_url: repositoryUrl,
    repository_id: String(repositoryId),
    dataset_path: datasetPath,
    source_commit_sha: sourceCommitSha,
    dataset_version: sourceCommitSha,
    ...(dataHashes ? { data_sha256: dataHashes } : {}),
    reporting_period: reportingPeriod,
    fips: STATE_FIPS[stateCode],
    state_name: stateName,
    status: 'ready',
  };
}

export function registryJson(registry) {
  return `${JSON.stringify(registry, null, 2)}\n`;
}

export { FILES };
