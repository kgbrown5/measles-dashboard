import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useUnifiedMapData } from './useUnifiedMapData.js';

// Tiny us-atlas fixture: NC (37) with two counties — "Wake" and the multi-word
// "New Hanover" (guards the producer's title-casing contract: the CSV `county`
// must match these atlas names exactly) — plus a throwaway "Other" state (99).
function mockUsAtlas() {
  return {
    type: 'Topology',
    arcs: [
      [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
      [[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]],
      [[4, 4], [5, 4], [5, 5], [4, 5], [4, 4]],
    ],
    transform: { scale: [1, 1], translate: [0, 0] },
    objects: {
      counties: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Polygon', id: '37001', arcs: [[0]], properties: { name: 'Wake' } },
          { type: 'Polygon', id: '37002', arcs: [[2]], properties: { name: 'New Hanover' } },
          { type: 'Polygon', id: '99001', arcs: [[1]], properties: { name: 'Other' } },
        ],
      },
      states: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Polygon', id: '37', arcs: [[0]], properties: { name: 'North Carolina' } },
          { type: 'Polygon', id: '99', arcs: [[1]], properties: { name: 'Otherland' } },
        ],
      },
    },
  };
}

function mockWorldAtlas() {
  return {
    type: 'Topology',
    arcs: [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]],
    transform: { scale: [1, 1], translate: [0, 0] },
    objects: {
      countries: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Polygon', id: '124', arcs: [[0]], properties: { name: 'Canada' } },
          { type: 'Polygon', id: '840', arcs: [[0]], properties: { name: 'United States of America' } },
        ],
      },
    },
  };
}

// #20 CSV bundle fixtures. Coverage is a proportion in [0,1]; the loader
// converts to percent. One county (Wake) with one school.
const COV_COLS =
  'coverage,coverage_ci_low,coverage_ci_high,' +
  'coverage_K,coverage_1,coverage_2,coverage_3,coverage_4,coverage_5,' +
  'coverage_ci_low_K,coverage_ci_low_1,coverage_ci_low_2,coverage_ci_low_3,coverage_ci_low_4,coverage_ci_low_5,' +
  'coverage_ci_high_K,coverage_ci_high_1,coverage_ci_high_2,coverage_ci_high_3,coverage_ci_high_4,coverage_ci_high_5,' +
  'prob_below_95,tier';
const COV_VALS =
  '0.94,0.93,0.95,' +
  '0.95,0.94,0.96,0.93,0.97,0.95,' +
  '0.93,0.92,0.94,0.91,0.95,0.93,' +
  '0.97,0.96,0.98,0.95,0.99,0.97,' +
  '0.1,M';
// A second school in a multi-word county, with distinct per-grade values.
const COV_VALS_2 =
  '0.91,0.90,0.92,' +
  '0.90,0.91,0.92,0.93,0.94,0.95,' +
  '0.89,0.90,0.91,0.92,0.93,0.94,' +
  '0.92,0.93,0.94,0.95,0.96,0.97,' +
  '0.4,M';
function mockCountyCsv() {
  return 'county,county_fips,n_schools,pct_schools_below_95,' + COV_COLS + '\n' +
    'Wake,37183,1,0.0,' + COV_VALS + '\n' +
    // multi-word county must round-trip to the atlas name exactly
    'New Hanover,37129,1,1.0,' + COV_VALS_2 + '\n';
}
// empty coverage block for a no_data school (#60): location but no fit coverage.
const COV_VALS_EMPTY = Array(COV_COLS.split(',').length).fill('').join(',');
function mockSchoolCsv() {
  // combined per-state schools.csv carries `county`, `lon`/`lat`, and `no_data`.
  // Wake school: omits coords (null-coords fallback). New Hanover: has coords.
  // No-Data school: has coords + no_data=1 + empty coverage (grey-dot case).
  return 'school_id,school_name,county,enrollment,lon,lat,no_data,' + COV_COLS + '\n' +
    '1,Test Elementary,Wake,100,,,0,' + COV_VALS + '\n' +
    '2,Coastal Elementary,New Hanover,80,-77.9,34.2,0,' + COV_VALS_2 + '\n' +
    '3,Ghost Elementary,Wake,50,-78.7,35.9,1,' + COV_VALS_EMPTY + '\n';
}

function mockManifest() {
  return {
    nc: { fips: '37', name: 'North Carolina', status: 'ready', data_url: '/data/states/nc.csv' },
    tx: { fips: '48', name: 'Texas', status: 'coming_soon' },
  };
}

// National states.csv: one row per ready state, carrying the state-level
// aggregate the #50 summary panel reads. Reuses the shared coverage block.
function mockStatesCsv() {
  return 'state,state_fips,state_name,n_schools,pct_schools_below_95,' + COV_COLS + '\n' +
    'nc,37,North Carolina,1825,0.3951,' + COV_VALS + '\n';
}

function buildFetchMock(captured, { dashboardOk = true } = {}) {
  return vi.fn((url) => {
    captured.push(url);
    if (url.includes('counties-10m.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockUsAtlas()) });
    }
    if (url.includes('countries-110m.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockWorldAtlas()) });
    }
    if (url.endsWith('data/states.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockManifest()) });
    }
    if (url.endsWith('data/states.csv')) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(mockStatesCsv()) });
    }
    // #20 per-state CSV bundle: county summary + combined schools file.
    if (url.endsWith('data/states/nc.csv')) {
      if (!dashboardOk) return Promise.resolve({ ok: false, text: () => Promise.resolve('') });
      return Promise.resolve({ ok: true, text: () => Promise.resolve(mockCountyCsv()) });
    }
    if (url.endsWith('data/states/nc/schools.csv')) {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(mockSchoolCsv()) });
    }
    return Promise.resolve({ ok: false, text: () => Promise.resolve('') });
  });
}

describe('useUnifiedMapData', () => {
  let originalFetch;
  let captured;

  beforeEach(() => {
    captured = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = buildFetchMock(captured);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads the map and local state CSVs when remote metadata returns 404', async () => {
    const localFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(url => {
      if (url.endsWith('data/stateRegistry.json')) {
        return Promise.resolve({ ok: true, json: async () => ({ nc: 'https://example.test/nc/' }) });
      }
      return localFetch(url);
    });
    const { result } = renderHook(() => useUnifiedMapData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();

    await act(async () => { await result.current.focusState('nc'); });
    expect(result.current.stateData.nc.allSchools).toHaveLength(3);
    expect(captured).toContain('/data/states/nc.csv');
    expect(captured).toContain('/data/states/nc/schools.csv');
    expect(captured).not.toContain('https://example.test/nc/data/states/nc.csv');
  });

  it('loads shared topology + manifest on mount', async () => {
    const { result } = renderHook(() => useUnifiedMapData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(captured.some(u => u.includes('counties-10m.json'))).toBe(true);
    expect(captured.some(u => u.includes('countries-110m.json'))).toBe(true);
    expect(captured.some(u => u.endsWith('data/states.csv'))).toBe(true);
    expect(captured.some(u => u.endsWith('data/states.json'))).toBe(true);
    // national.json is gone (#68): national shading derives from states.csv.
    expect(captured.some(u => u.endsWith('data/national.json'))).toBe(false);

    expect(Array.isArray(result.current.stateFeatures)).toBe(true);
    expect(result.current.stateFeatures).toHaveLength(2);
    // coverageByFips now comes from states.csv (coverage 0.94 for NC/37).
    expect(result.current.coverageByFips['37']).toEqual({ coverage: 0.94, status: 'ready' });
    expect(result.current.manifest.nc).toBeDefined();
  });

  it('builds per-state summaries from states.csv for the #50 panel', async () => {
    const { result } = renderHook(() => useUnifiedMapData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(captured.some(u => u.endsWith('data/states.csv'))).toBe(true);
    const nc = result.current.stateSummaryByCode.nc;
    expect(nc).toBeDefined();
    expect(nc.name).toBe('North Carolina');
    expect(nc.coverage).toBe(94);        // 0.94 → 94
    expect(nc.nSchools).toBe(1825);
    expect(nc.pctBelow95).toBeCloseTo(39.51);  // 0.3951 → 39.51
    expect(nc.grades).toEqual([95, 94, 96, 93, 97, 95]);  // coverage_K..5
  });

  it('filters the US out of the world countries layer', async () => {
    const { result } = renderHook(() => useUnifiedMapData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const names = result.current.countriesFeatures.map(f => f.properties && f.properties.name);
    expect(names).toContain('Canada');
    expect(names).not.toContain('United States of America');
  });

  it('lazy-loads NC on focusState("nc") and builds derived payload', async () => {
    const { result } = renderHook(() => useUnifiedMapData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // No per-state fetch yet.
    expect(captured.some(u => u.endsWith('data/states/nc.csv'))).toBe(false);

    await act(async () => { await result.current.focusState('nc'); });

    expect(captured.some(u => u.endsWith('data/states/nc.csv'))).toBe(true);
    expect(captured.some(u => u.endsWith('data/states/nc/schools.csv'))).toBe(true);

    const nc = result.current.stateData.nc;
    expect(nc).toBeDefined();
    // NC fixture has two counties (Wake + New Hanover) under FIPS 37.
    expect(nc.stateFeatures).toHaveLength(2);
    expect(nc.stateFeatures.map(f => f.id).sort()).toEqual(['37001', '37002']);
    expect(nc.countyData['Wake County']).toBeDefined();
    expect(nc.countyData['Wake County'].mean).toBe(94);
    // Per-grade aggregate exposed for the county breakdown panel (#50);
    // coverage_K = 0.95 → 95.
    expect(nc.countyData['Wake County'].grades).toEqual([95, 94, 96, 93, 97, 95]);

    const wakeSchool = nc.allSchools.find(s => s.name === 'Test Elementary');
    // CSV overall coverage 0.94 (proportion) → 94 (percent) in-memory.
    expect(wakeSchool.coverage).toBe(94);
    expect(wakeSchool.size).toBe(100);
    // grades is a flat per-grade array; coverage_K = 0.95 → 95.
    expect(wakeSchool.grades[0]).toBe(95);
    // No lon/lat columns for this row → coords null (map uses fallback).
    expect(wakeSchool.coords).toBeNull();
  });

  it('matches multi-word county names to the atlas and groups their schools', async () => {
    // Guards the producer title-casing contract: a CSV county like "New Hanover"
    // must resolve to its atlas feature (fips set) and own its schools. Before
    // title-casing, lowercased names ("new hanover") silently dropped to 0 schools.
    const { result } = renderHook(() => useUnifiedMapData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.focusState('nc'); });

    const nc = result.current.stateData.nc;
    expect(nc.countyData['New Hanover County']).toBeDefined();
    expect(nc.countyData['New Hanover County'].fips).toBe('37002');

    const coastal = nc.allSchools.find(s => s.name === 'Coastal Elementary');
    expect(coastal).toBeDefined();
    // school.county is keyed as "<County> County" so the map can group it.
    expect(coastal.county).toBe('New Hanover County');
  });

  it('parses the per-grade coverage array and lon/lat coords', async () => {
    const { result } = renderHook(() => useUnifiedMapData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.focusState('nc'); });

    const nc = result.current.stateData.nc;
    const coastal = nc.allSchools.find(s => s.name === 'Coastal Elementary');
    // grades is a flat K-5 array of per-grade coverage (percent).
    expect(coastal.grades[0]).toBe(90);   // coverage_K 0.90 → 90
    expect(coastal.grades[1]).toBe(91);   // coverage_1 0.91 → 91
    // lon/lat present → [lon, lat] coords.
    expect(coastal.coords).toEqual([-77.9, 34.2]);
  });

  it('flags a no_data school (location but no fit coverage) for grey rendering', async () => {
    const { result } = renderHook(() => useUnifiedMapData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.focusState('nc'); });

    const nc = result.current.stateData.nc;
    const ghost = nc.allSchools.find(s => s.name === 'Ghost Elementary');
    expect(ghost).toBeDefined();          // not dropped despite no coverage
    expect(ghost.noData).toBe(true);
    expect(ghost.coverage).toBeNull();    // no estimate
    expect(ghost.tier).toBeNull();        // so no tier color
    expect(ghost.coords).toEqual([-78.7, 35.9]);  // still placed at its location
  });

  it('caches per-state data: refocusing the same state does not re-fetch', async () => {
    const { result } = renderHook(() => useUnifiedMapData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.focusState('nc'); });
    const fetchesAfterFirst = captured.filter(u => u.endsWith('data/states/nc.csv')).length;
    expect(fetchesAfterFirst).toBe(1);

    await act(async () => { await result.current.focusState('nc'); });
    const fetchesAfterSecond = captured.filter(u => u.endsWith('data/states/nc.csv')).length;
    expect(fetchesAfterSecond).toBe(1);
  });

  it('focusing a coming_soon state surfaces an error and skips per-state fetches', async () => {
    const { result } = renderHook(() => useUnifiedMapData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.focusState('tx'); });

    expect(captured.some(u => u.endsWith('data/states/tx.csv'))).toBe(false);
    expect(result.current.stateData.tx).toBeUndefined();
    expect(result.current.stateError.tx).toBe('not_ready');
  });

  it('focusing an unknown state code is a no-op', async () => {
    const { result } = renderHook(() => useUnifiedMapData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.focusState('zz'); });
    expect(result.current.stateData.zz).toBeUndefined();
  });

  it('surfaces a per-state error when the dashboard fetch fails', async () => {
    captured = [];
    globalThis.fetch = buildFetchMock(captured, { dashboardOk: false });

    const { result } = renderHook(() => useUnifiedMapData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.focusState('nc'); });

    expect(result.current.stateError.nc).toMatch(/failed to load/i);
    expect(result.current.stateData.nc).toBeUndefined();
  });

  it('deduplicates in-flight focusState calls', async () => {
    const { result } = renderHook(() => useUnifiedMapData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      const a = result.current.focusState('nc');
      const b = result.current.focusState('nc');
      await Promise.all([a, b]);
    });
    const fetches = captured.filter(u => u.endsWith('data/states/nc.csv')).length;
    expect(fetches).toBe(1);
  });
});
