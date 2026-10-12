import { useState, useEffect, useRef, useCallback } from 'react';
import * as topojson from 'topojson-client';
import { csvParse } from 'd3-dsv';
import { covTier } from '../config/index.js';
import { getStateConfig, normalizeFips } from '../config/states.js';

// CDN URLs for shared topology data. us-atlas drives the US states + counties;
// world-atlas provides surrounding countries (Canada, Mexico, Caribbean) to
// render as muted background context on the national zoom (closes #30).
const US_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';
const WORLD_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// Grade columns in the #20 CSV schema, K→5 order. The in-memory model the map +
// sidebar consume expects 6 per-grade values per school.
const GRADE_KEYS = ['K', '1', '2', '3', '4', '5'];

const NC_REMOTE = 'https://cgbryan1.github.io/measles-NC/';

function withBase(path) {
  if (path.startsWith('data/states/nc')) return `${NC_REMOTE}${path}`;
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  return `${base}${path}`;
}

// Coverage in the CSVs is a proportion in [0,1]; the existing UI works in
// percent (covTier(95), `coverage < 95`, `.toFixed(1)+'%'`). Convert on load.
function toPct(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return n <= 1 ? n * 100 : n;
}

// Shared per-state topology structures (county features, neighbor states, mesh,
// adjacency, name→feature) derived from the us-atlas, independent of data source.
function buildTopology({ stateCode, us }) {
  const cfg = getStateConfig(stateCode);

  const stateFeatures = topojson
    .feature(us, us.objects.counties)
    .features
    .filter(f => String(f.id).startsWith(cfg.fips));
  const neighborStates = topojson
    .feature(us, us.objects.states)
    .features
    .filter(f => String(f.id) !== String(+cfg.fips));
  const stateMesh = topojson.mesh(us, us.objects.states, (a, b) => a !== b);

  // Adjacency map (county id → adjacent county ids) restricted to this state.
  const stateCountyIds = new Set(stateFeatures.map(f => f.id));
  const adjacencyMap = {};
  stateFeatures.forEach(f => { adjacencyMap[f.id] = []; });
  topojson.neighbors(us.objects.counties.geometries).forEach((neighbors, i) => {
    const geo = us.objects.counties.geometries[i];
    const id = geo.id != null ? String(geo.id) : String(i);
    if (!stateCountyIds.has(id)) return;
    neighbors.forEach(j => {
      const nGeo = us.objects.counties.geometries[j];
      const nId = nGeo.id != null ? String(nGeo.id) : String(j);
      if (stateCountyIds.has(nId) && !adjacencyMap[id].includes(nId)) {
        adjacencyMap[id].push(nId);
      }
    });
  });

  const featureByName = {};
  stateFeatures.forEach(f => { featureByName[f.properties.name] = f; });

  return { stateFeatures, neighborStates, stateMesh, adjacencyMap, featureByName };
}

// Build the per-state derived structures from the #20 CSV bundle:
//   countyRows — parsed rows from states/<code>.csv        (one per county)
//   schoolRows — parsed rows from states/<code>/schools.csv (one per school,
//                carrying a `county` column)
// plus the shared us-atlas topology. Returns the same shape the legacy
// dashboard.json path produced, so the map + sidebar are unchanged.
// Parse the national states.csv into a per-state summary keyed by lowercase
// code (#50). Powers the state-level summary panel: overall coverage, % of
// schools below 95, school count, and the K-5 per-grade breakdown — all taken
// straight from the state row (no client-side aggregation).
function buildStateSummaries(text) {
  const out = {};
  if (!text) return out;
  csvParse(text).forEach(r => {
    const code = String(r.state || '').toLowerCase();
    if (!code) return;
    out[code] = {
      name: r.state_name || code.toUpperCase(),
      coverage: toPct(r.coverage),
      pctBelow95: r.pct_schools_below_95 != null && r.pct_schools_below_95 !== ''
        ? Number(r.pct_schools_below_95) * 100 : null,
      nSchools: r.n_schools != null && r.n_schools !== '' ? Number(r.n_schools) : null,
      grades: GRADE_KEYS.map(g => toPct(r['coverage_' + g])),
    };
  });
  return out;
}

// National-zoom choropleth shading, derived from states.csv (one row per state)
// keyed by 2-digit FIPS. Coverage stays a proportion in [0,1]; the national view
// multiplies by 100. States absent from states.csv render greyed. This replaces
// the former national.json stub so the CSVs are the single tabular source (#68);
// if a broader all-states national dataset ever lands (#14) it would be its own
// national.csv, read the same way.
function buildCoverageByFips(text) {
  const out = {};
  if (!text) return out;
  csvParse(text).forEach(r => {
    const fips = normalizeFips(r.state_fips);
    if (!fips || r.coverage == null || r.coverage === '') return;
    out[fips] = { coverage: Number(r.coverage), status: 'ready' };
  });
  return out;
}

function buildStatePayloadFromCsv({ stateCode, countyRows, schoolRows, us }) {
  const { stateFeatures, neighborStates, stateMesh, adjacencyMap, featureByName } =
    buildTopology({ stateCode, us });

  const countyData = {};
  countyRows.forEach(c => {
    const name = c.county;
    countyData[name + ' County'] = {
      mean: toPct(c.coverage),
      // Per-grade aggregate (#50). Model node values straight from the CSV (not
      // a client-side mean), so they track the producer's numbers as-is. Blank
      // for states with no county-level breakdown (e.g. NC) → all null.
      grades: GRADE_KEYS.map(g => toPct(c['coverage_' + g])),
      herd_immunity: c.pct_schools_below_95 != null && c.pct_schools_below_95 !== ''
        ? Number(c.pct_schools_below_95) : null,
      fips: featureByName[name] ? featureByName[name].id : null,
    };
  });

  const allSchools = schoolRows.map(s => {
    // Per-grade coverage (K-5). The estimated-vs-reported distinction was
    // dropped (#58): every value is the model's coverage for that grade.
    const grades = GRADE_KEYS.map(g => toPct(s['coverage_' + g]));
    const coverage = toPct(s.coverage);
    const lon = s.lon != null && s.lon !== '' ? Number(s.lon) : null;
    const lat = s.lat != null && s.lat !== '' ? Number(s.lat) : null;
    // no_data (#60): school has a location but no model coverage (it wasn't in
    // the fit). coverage is null; the UI renders it as a grey, inert dot.
    const noData = String(s.no_data) === '1' || coverage == null;
    return {
      county: s.county + ' County',
      coords: lon != null && lat != null && !Number.isNaN(lon) && !Number.isNaN(lat)
        ? [lon, lat] : null,
      feature: featureByName[s.county],
      coverage,
      tier: noData ? null : covTier(coverage),
      noData,
      name: s.school_name,
      size: s.enrollment != null && s.enrollment !== '' ? Number(s.enrollment) : null,
      grades,
    };
  });

  return { countyData, allSchools, stateFeatures, neighborStates, stateMesh, adjacencyMap };
}

/**
 * Unified data orchestrator that backs the zoom-aware map. Replaces the
 * legacy `useNationalData` + `useDashboardData` pair.
 *
 * - Loads the shared us-atlas, world-atlas, national stub, and per-state
 *   manifest exactly once at mount.
 * - Lazy-loads each state's #20 CSV bundle (states/<code>.csv +
 *   states/<code>/schools.csv) on demand via `focusState(code)`. Re-focusing a
 *   previously loaded state is a cache hit; no extra fetches occur.
 * - Returns a stable `focusState` callback and a `stateData` map keyed by
 *   lowercase state code, so the consumer can render whichever state's
 *   counties + schools are currently in focus.
 *
 * Surfaces (in addition to the loaded data):
 *   - loading: true until the initial shared payload resolves
 *   - error: top-level error string (initial fetch only)
 *   - stateError: per-state error keyed by state code (e.g. for "ready" but
 *     missing data files; "coming_soon" states intentionally don't fetch)
 *   - focusState(code): trigger a lazy fetch + cache for that state. No-op
 *     for unknown / non-ready codes.
 */
export function useUnifiedMapData() {
  const [base, setBase] = useState({
    us: null,
    world: null,
    stateFeatures: null,
    coverageByFips: null,
    countriesFeatures: null,
    manifest: null,
    stateSummaryByCode: {},
    loading: true,
    error: null,
  });

  // Per-state cache: lowercase code → derived payload (countyData, allSchools, …).
  // Held in a ref so multiple consumers calling `focusState` in flight don't
  // race; pending promises are tracked separately for dedupe.
  const stateCacheRef = useRef({});
  const inFlightRef = useRef({});
  const usRef = useRef(null);
  const manifestRef = useRef(null);
  const [stateData, setStateData] = useState({});
  const [stateError, setStateError] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [usRes, worldRes, manifestRes, statesCsvRes] = await Promise.all([
          fetch(US_ATLAS_URL),
          fetch(WORLD_ATLAS_URL),
          fetch(withBase('data/states.json')),
          fetch(withBase('data/states.csv')),
        ]);

        if (!usRes.ok) throw new Error('Failed to load US map data');

        const us = await usRes.json();
        // world-atlas + manifest + state summaries are optional; degrade rather
        // than fail the whole app if any are missing.
        const world = worldRes.ok ? await worldRes.json() : null;
        const manifest = manifestRes.ok ? await manifestRes.json() : {};
        const statesCsvText = statesCsvRes.ok ? await statesCsvRes.text() : '';
        const stateSummaryByCode = buildStateSummaries(statesCsvText);

        const stateFeatures = topojson.feature(us, us.objects.states).features;
        // National choropleth shading comes straight from states.csv now (#68).
        const coverageByFips = buildCoverageByFips(statesCsvText);

        // world-atlas exposes `countries` (and `land`); we need countries so
        // we can filter the US out and leave Canada/Mexico/Caribbean as
        // background. Use `land` as a fallback when only that key is present.
        let countriesFeatures = [];
        if (world) {
          const objName = world.objects && (world.objects.countries ? 'countries' : (world.objects.land ? 'land' : null));
          if (objName) {
            const fc = topojson.feature(world, world.objects[objName]);
            countriesFeatures = fc.type === 'FeatureCollection' ? fc.features : [fc];
            // Filter out the United States — we render the us-atlas states on
            // top in their own colour scheme, so leaving the world's US
            // polygon under it would just blur the choropleth edges.
            countriesFeatures = countriesFeatures.filter(f => {
              const id = f.id != null ? String(f.id) : '';
              const name = f.properties && (f.properties.name || f.properties.NAME);
              return id !== '840' && name !== 'United States of America';
            });
          }
        }

        if (!cancelled) {
          usRef.current = us;
          manifestRef.current = manifest;
          setBase({
            us,
            world,
            stateFeatures,
            coverageByFips,
            countriesFeatures,
            manifest,
            stateSummaryByCode,
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setBase(prev => ({ ...prev, loading: false, error: err.message || String(err) }));
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // Lazy-load a single state's #20 CSV bundle on demand.
  const focusState = useCallback((rawCode) => {
    const code = String(rawCode || '').toLowerCase();
    if (!code) return Promise.resolve(null);

    // Cache hit — nothing to do.
    if (stateCacheRef.current[code]) return Promise.resolve(stateCacheRef.current[code]);
    if (inFlightRef.current[code]) return inFlightRef.current[code];

    const manifest = manifestRef.current;
    const us = usRef.current;
    if (!us) {
      // Shared payload hasn't resolved yet; nothing we can build.
      return Promise.resolve(null);
    }

    // Surface a clean error for non-ready / unknown states without firing
    // any fetches.  Callers (e.g. the map) treat this as "no county data".
    const entry = manifest && manifest[code];
    if (!entry || entry.status !== 'ready') {
      setStateError(prev => ({ ...prev, [code]: 'not_ready' }));
      return Promise.resolve(null);
    }

    const promise = (async () => {
      try {
        // #20 CSV bundle: the county summary + the combined per-state schools
        // file. (Per-county files under counties/ are the canonical download/API
        // unit (#21/#22); the app reads schools.csv to avoid an N+1 fan-out.)
        const [countyRes, schoolRes] = await Promise.all([
          fetch(withBase(`data/states/${code}.csv`)),
          fetch(withBase(`data/states/${code}/schools.csv`)),
        ]);
        if (!countyRes.ok) throw new Error(`Failed to load ${code.toUpperCase()} data`);
        const countyRows = csvParse(await countyRes.text());
        const schoolRows = schoolRes.ok ? csvParse(await schoolRes.text()) : [];
        const payload = buildStatePayloadFromCsv({ stateCode: code, countyRows, schoolRows, us });
        stateCacheRef.current[code] = payload;
        setStateData(prev => ({ ...prev, [code]: payload }));
        setStateError(prev => {
          if (!prev[code]) return prev;
          const next = { ...prev }; delete next[code]; return next;
        });
        return payload;
      } catch (err) {
        setStateError(prev => ({ ...prev, [code]: err.message || String(err) }));
        return null;
      } finally {
        delete inFlightRef.current[code];
      }
    })();
    inFlightRef.current[code] = promise;
    return promise;
  }, []);

  return {
    // Shared (loaded once)
    loading: base.loading,
    error: base.error,
    stateFeatures: base.stateFeatures,
    coverageByFips: base.coverageByFips,
    countriesFeatures: base.countriesFeatures,
    manifest: base.manifest,
    stateSummaryByCode: base.stateSummaryByCode,
    // Per-state (lazy)
    stateData,
    stateError,
    focusState,
  };
}

export default useUnifiedMapData;
