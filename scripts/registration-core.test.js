// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  checkRegistryConflicts,
  discoverDataset,
  parseRepositoryUrl,
  validateDataset,
} from './registration-core.mjs';

const columns = 'state,state_fips,state_name,n_schools,pct_schools_below_95,coverage,coverage_ci_low,coverage_ci_high,coverage_K,coverage_1,coverage_2,coverage_3,coverage_4,coverage_5,coverage_ci_low_K,coverage_ci_low_1,coverage_ci_low_2,coverage_ci_low_3,coverage_ci_low_4,coverage_ci_low_5,coverage_ci_high_K,coverage_ci_high_1,coverage_ci_high_2,coverage_ci_high_3,coverage_ci_high_4,coverage_ci_high_5,prob_below_95,tier';
const countyColumns = 'county,county_fips,n_schools,pct_schools_below_95,coverage,coverage_ci_low,coverage_ci_high,coverage_K,coverage_1,coverage_2,coverage_3,coverage_4,coverage_5,coverage_ci_low_K,coverage_ci_low_1,coverage_ci_low_2,coverage_ci_low_3,coverage_ci_low_4,coverage_ci_low_5,coverage_ci_high_K,coverage_ci_high_1,coverage_ci_high_2,coverage_ci_high_3,coverage_ci_high_4,coverage_ci_high_5,prob_below_95,tier';
const schoolColumns = 'school_id,school_name,county,enrollment,lon,lat,no_data,coverage,coverage_ci_low,coverage_ci_high,coverage_K,coverage_1,coverage_2,coverage_3,coverage_4,coverage_5,coverage_ci_low_K,coverage_ci_low_1,coverage_ci_low_2,coverage_ci_low_3,coverage_ci_low_4,coverage_ci_low_5,coverage_ci_high_K,coverage_ci_high_1,coverage_ci_high_2,coverage_ci_high_3,coverage_ci_high_4,coverage_ci_high_5,prob_below_95,tier';
const valid = [
  `${columns}\nnc,37,North Carolina,1,0,0.95,,,,,,,,,,,,,,,,,,,,,,H\n`,
  `${countyColumns}\nWake,,1,0,0.95,,,,,,,,,,,,,,,,,,,,,,H\n`,
  `${schoolColumns}\n1,School,Wake,10,,,0,0.95,,,,,,,,,,,,,,,,,,,,,,H\n`,
];

describe('registration core', () => {
  it('accepts and canonicalizes GitHub repository URLs', () => {
    expect(parseRepositoryUrl('https://github.com/ACCIDDA/measles-NC.git')).toMatchObject({
      owner: 'ACCIDDA', repo: 'measles-NC', canonicalUrl: 'https://github.com/ACCIDDA/measles-NC',
    });
  });
  it('rejects invalid URLs', () => {
    expect(() => parseRepositoryUrl('https://example.com/data')).toThrow(/github.com/);
    expect(() => parseRepositoryUrl('https://github.com/a/b/../../secret')).toThrow(/exactly one/);
  });
  it('discovers the template dataset under data/', () => {
    expect(discoverDataset(['data/state.csv', 'data/counties.csv', 'data/schools.csv'], 'nc').root).toBe('data/');
    expect(() => discoverDataset(['data/state.csv'], 'nc')).toThrow(/required dataset files/);
  });
  it('validates a complete public/private-compatible bundle', () => {
    expect(validateDataset({
      stateCode: 'nc',
      files: ['data/state.csv', 'data/counties.csv', 'data/schools.csv'],
      contents: valid,
    })).toMatchObject({ stateName: 'North Carolina' });
  });
  it('rejects a wrong state and duplicate registrations', () => {
    expect(() => validateDataset({
      stateCode: 'va',
      files: ['state.csv', 'counties.csv', 'schools.csv'],
      contents: valid,
    })).toThrow(/state must be va/);
    expect(() => checkRegistryConflicts({
      nc: { repository_id: '123', repository_url: 'https://github.com/a/nc' },
    }, 'nc', '456', 'https://github.com/a/other')).toThrow(/already registered/);
    expect(() => checkRegistryConflicts({
      nc: { repository_id: '123', repository_url: 'https://github.com/a/nc' },
    }, 'va', '123', 'https://github.com/a/nc')).toThrow(/already registered/);
  });
  it('rejects invalid dataset values', () => {
    const invalid = [...valid];
    invalid[2] = invalid[2].replace(',0.95,', ',1.5,');
    expect(() => validateDataset({
      stateCode: 'nc',
      files: ['state.csv', 'counties.csv', 'schools.csv'],
      contents: invalid,
    })).toThrow(/above maximum|in range/);
  });
  it('rejects an unknown state code before repository access', async () => {
    const { isStateCode } = await import('./registration-core.mjs');
    expect(isStateCode('zz')).toBe(false);
    expect(isStateCode('nc')).toBe(true);
  });
});
