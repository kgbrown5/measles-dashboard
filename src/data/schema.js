// Documentation for the CSV shapes consumed by the dashboard (#77).
//
// The generated machine-readable schema (public/data/schema.json) and the
// API.md column tables derive from this definition. It documents the format
// expected by the UI and describes CSVs assembled for downloads; it does not
// validate data fetched from state APIs.
//
// Types are a small language-agnostic vocabulary so the JSON is easy to map
// into any reader:
//   "string"  -> e.g. Arrow string / pandas object
//   "integer" -> e.g. Arrow int64
//   "number"  -> e.g. Arrow float64 (coverage values are proportions in [0, 1])
//
// Columns may carry an optional `constraints` object to document expected
// value ranges or enumerations for consumers of schema.json. These are
// descriptive metadata; the dashboard does not apply them to API responses.
// The vocabulary is deliberately tiny and JSON-serializable:
//   { min, max }  inclusive numeric bounds
//   { enum: [...] } the value (compared as a string) must be one of these
//   { pattern }   a regex (string) the value must match
// Blank cells represent values unavailable from the source data; see the
// API.md completeness note for documented conventions.

const GRADES = ['K', '1', '2', '3', '4', '5'];

// A proportion in [0, 1]: coverage values, CI bounds, and the below-95 shares.
const UNIT = { min: 0, max: 1 };

// Shared coverage block, in the exact order the producers emit it.
export const COVERAGE_BLOCK = [
  { name: 'coverage', type: 'number', description: 'Overall MMR coverage (proportion, 0-1)', constraints: UNIT },
  { name: 'coverage_ci_low', type: 'number', description: 'Lower bound, 95% credible interval for coverage', constraints: UNIT },
  { name: 'coverage_ci_high', type: 'number', description: 'Upper bound, 95% credible interval for coverage', constraints: UNIT },
  ...GRADES.map((g) => ({ name: `coverage_${g}`, type: 'number', description: `Per-grade coverage (grade ${g})`, constraints: UNIT })),
  ...GRADES.map((g) => ({ name: `coverage_ci_low_${g}`, type: 'number', description: `Per-grade CI lower bound (grade ${g})`, constraints: UNIT })),
  ...GRADES.map((g) => ({ name: `coverage_ci_high_${g}`, type: 'number', description: `Per-grade CI upper bound (grade ${g})`, constraints: UNIT })),
  { name: 'prob_below_95', type: 'number', description: 'Posterior probability that coverage is below 95%', constraints: UNIT },
  { name: 'tier', type: 'string', description: 'Coverage tier: H (>=95%), M (90-95%), L (<90%)', constraints: { enum: ['H', 'M', 'L'] } },
];

// Leading identity columns, per file shape.
const STATE_ID = [
  { name: 'state', type: 'string', description: 'Two-letter USPS state code', constraints: { pattern: '^[a-z]{2}$' } },
  // FIPS is emitted without zero-padding (e.g. California is "6", not "06").
  { name: 'state_fips', type: 'string', description: 'State FIPS code (1-2 digits, not zero-padded)', constraints: { pattern: '^[0-9]{1,2}$' } },
  { name: 'state_name', type: 'string', description: 'State name' },
  { name: 'n_schools', type: 'integer', description: 'Number of schools in the state', constraints: { min: 0 } },
  { name: 'pct_schools_below_95', type: 'number', description: 'Fraction of schools below 95% coverage (0-1)', constraints: UNIT },
];
const COUNTY_ID = [
  { name: 'county', type: 'string', description: 'County name' },
  { name: 'county_fips', type: 'string', description: '5-digit county FIPS code (may be blank)', constraints: { pattern: '^[0-9]{5}$' } },
  { name: 'n_schools', type: 'integer', description: 'Number of schools in the county', constraints: { min: 0 } },
  { name: 'pct_schools_below_95', type: 'number', description: 'Fraction of schools below 95% coverage (0-1)', constraints: UNIT },
];
const SCHOOL_ID = [
  { name: 'school_id', type: 'string', description: 'School identifier' },
  { name: 'school_name', type: 'string', description: 'School name' },
  { name: 'county', type: 'string', description: 'County name' },
  { name: 'enrollment', type: 'integer', description: 'K-5 enrollment', constraints: { min: 0 } },
  { name: 'lon', type: 'number', description: 'Longitude (may be blank)', constraints: { min: -180, max: 180 } },
  { name: 'lat', type: 'number', description: 'Latitude (may be blank)', constraints: { min: -90, max: 90 } },
  { name: 'no_data', type: 'integer', description: '1 if the school has a location but no model estimate, else 0', constraints: { enum: [0, 1] } },
];

// Each published file's full, ordered column list = identity + coverage block.
export const FILES = {
  'data/states.csv': {
    description: 'One row per state (national summary).',
    columns: [...STATE_ID, ...COVERAGE_BLOCK],
  },
  'data/states/{state}.csv': {
    description: 'One row per county in a state.',
    columns: [...COUNTY_ID, ...COVERAGE_BLOCK],
  },
  'data/all-schools.csv': {
    description: 'One row per school nationwide, with a leading state column.',
    columns: [{ name: 'state', type: 'string', description: 'Two-letter USPS state code' }, ...SCHOOL_ID, ...COVERAGE_BLOCK],
  },
  'data/states/{state}/schools.csv': {
    description: 'One row per school in a state.',
    columns: [...SCHOOL_ID, ...COVERAGE_BLOCK],
  },
  'data/states/{state}/counties/{county}.csv': {
    description: 'One row per school in a county (the county column is dropped; the path identifies the county).',
    columns: [...SCHOOL_ID.filter((c) => c.name !== 'county'), ...COVERAGE_BLOCK],
  },
};

// Convenience: the ordered column names for a file shape.
export function columnNames(file) {
  return FILES[file].columns.map((c) => c.name);
}

// The object serialized to public/data/schema.json. It documents CSVs fetched
// from state APIs and the on-demand CSV shapes assembled by the browser.
export const SCHEMA = {
  description: 'Column schema for CSV data fetched from registered state APIs and assembled by the dashboard. '
    + 'Coverage values are proportions in [0, 1]. Types: string, integer, number. '
    + 'Generated from src/data/schema.js by scripts/build-schema-json.mjs; do not edit by hand.',
  files: FILES,
};
