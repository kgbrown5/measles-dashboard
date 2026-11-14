# Architecture

How the dashboard fits together. This is the high-level map; for contributor
tooling (tests, lint, CI) see [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Overview

A single-page Vite + React 18 app that visualizes MMR vaccination coverage as a
zoomable choropleth. React owns the page chrome (header, sidebar, legend,
toasts); [D3](https://d3js.org) owns the interactive map. There is no backend:
the app is a static bundle deployed to GitHub Pages, and all data is fetched as
static files at predictable URLs.

## View model

The app is organized around one idea: a **zoom level** that the URL drives.

```
national            ->   state            ->   county
(all US states)          (one state's          (one county's
                          counties)             schools)
```

- `national` (`/`): every US state shaded by overall coverage; states without
  data render greyed.
- `state` (`/state/<code>`): that state's counties, colored by coverage tier or
  an under-vaccination lens.
- `county` (`/state/<code>/<county>`): that county's individual K-5 schools.

`src/App.jsx` parses the route into a `{ zoomLevel, stateCode, county }`
descriptor, holds the small set of UI state (selected school, current view,
toasts), and keeps the URL and zoom in sync via `history` + `popstate`. Pressing
Escape steps back up a level.

## The map (`src/components/Map/UnifiedMap.jsx`)

The only non-trivial module, and the one that interleaves React and D3. The
pattern, which edits must preserve:

- React renders the SVG shell; D3 owns everything inside `#map-g` (state/county
  paths, school dots, zoom transform, tooltips).
- D3 selections, the projection, and the zoom behavior are stored on **mutable
  refs**, not React state, so the big setup effect runs once and lighter effects
  (recolor on view change, highlight selection, zoom into a county) reuse them.
- D3 event handlers read interactive state through refs (mirrored from props in
  a "keep refs in sync" block) to avoid stale closures. If you add new state the
  map reads inside a D3 handler, mirror it into a ref the same way.
- Coloring goes through tier functions in `src/config/index.js`
  (`covTier`, `uvTier`, `TIER_COLORS`, `GRADES`); edit thresholds there, not
  inline.
- Tooltips are built with `document.createElement`, not `innerHTML` (kept that
  way deliberately).

DOM ids/classes (`#map-svg`, `#map-g`, `#tooltip`, `.county-path`, `#sidebar`,
etc.) are load-bearing: D3 selects by them and e2e tests query them. Don't rename
without updating both.

## Geography

County and state polygons come from
[us-atlas](https://github.com/topojson/us-atlas) TopoJSON (loaded once from a
CDN), filtered to a state's counties by its 2-digit FIPS prefix.
[world-atlas](https://github.com/topojson/world-atlas) supplies surrounding
countries as muted background on the national view. Per-state structures
(county features, a neighbor-state mesh, a county adjacency map) are derived from
the topology at load time.

## Configuration (`src/config/`)

Adding a state is meant to be **data + config, not code**:

- `src/config/states.js`: per-state metadata (display name, `dataDir`, FIPS,
  data-source attribution) plus the FIPS <-> USPS lookups the national view uses
  to route a clicked state to `/state/<code>`.
- `src/config/index.js`: the visual contract (tier thresholds/colors, grade
  labels, legend copy, marker shapes).

A `public/data/states.json` manifest marks which states are `ready` vs.
`coming_soon`; the per-state coverage that shades the national map is derived
from `public/data/states.csv` (one row per state, keyed by FIPS) — the CSVs are
the single tabular source (#68). The loader refuses to fetch a state that isn't
`ready`.

## Data loading (`src/hooks/`)

`useUnifiedMapData.js` is the single data orchestrator. At mount it loads the
shared topology + manifests once, then **lazy-loads a state's data on demand**
via `focusState(code)`, caching per state so re-focusing is free. It returns the
shared base data plus a `stateData` map the map/sidebar render from. Supporting
hooks: `useStateManifest` (the ready/coming-soon manifest), `useGeolocation` /
`useStateGeolocation` (locate the visitor).

State APIs are selected through `public/data/stateRegistry.json`. Legacy string
entries point to a deployment base URL; registration creates object entries
with repository identity, dataset path, source commit, and CSV SHA-256 hashes.
The browser and live-data monitor share URL resolution in `src/data/registry.js`.
The app fetches `meta.json`, state summaries, and county/school CSVs from the
registered deployments.

Registration validates source Git blobs before opening a registry PR. The
separate **Check State Data** workflow checks the deployed endpoints, schema,
county geography joins, CORS, metadata, and registered hashes. Scheduled failures
open deduplicated issues in state repositories with reverification instructions.
See [Data validation](DATA_VALIDATION.md) for setup and limits.

## Styling

All styles live in one file, `src/styles/index.css`, imported from `main.jsx`.
Many ids/classes there are shared with the D3 map and e2e selectors (see the map
section), so treat them as a contract.
