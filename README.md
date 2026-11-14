# Measles Vaccination (MMR) Coverage Dashboard

An interactive dashboard visualizing measles (MMR) vaccination coverage across
the United States, drilling down from a national overview to individual states,
counties, and K–5 schools. Built by [ACCIDDA](https://github.com/ACCIDDA).

🔗 **Live:** https://accidda.github.io/measles-dashboard/

## What it shows

- **National view**: every US state shaded by its overall coverage; states
  without data yet render greyed.
- **State view**: click a state to zoom into its counties, each colored by
  coverage tier (high / medium / low) or by an under-vaccination lens.
- **County view**: drill into a county to see its individual K–5 schools,
  each with a per-grade coverage breakdown.

Coverage estimates come from the [imuGAP](https://github.com/ACCIDDA/imuGAP)
Bayesian model; school and county geography come from public sources.

## Data

All coverage data is published as static CSV files at predictable URLs, so the
files that drive the dashboard double as a downloadable, no-auth API:

```
/data/states.csv                               one row per state
/data/states/<state>.csv                       one row per county
/data/states/<state>/counties/<county>.csv     one row per school
```

Each file carries the same coverage columns at every level: overall coverage
with 95% credible intervals, a per-grade (K–5) breakdown, and a coverage tier.

The CSVs are generated from model output by the scripts in `scripts/build-data/`
and regenerated when the model updates, not on every deploy. The full URL scheme
and column reference, with `curl` examples, are in [`docs/API.md`](docs/API.md).

## Tech

Single-page [Vite](https://vitejs.dev) + [React 18](https://react.dev) app.
Page chrome is React; the interactive map is [D3](https://d3js.org) over
[us-atlas](https://github.com/topojson/us-atlas) TopoJSON. Deployed as a static
site on GitHub Pages under the `/measles-dashboard/` base path.

How it all fits together is documented in
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

State repositories are registered centrally through GitHub Actions. See
[`docs/REGISTRATION.md`](docs/REGISTRATION.md) for the submission format,
public repository requirement, and administrator review process.
[Data validation](docs/DATA_VALIDATION.md) describes recurring API checks,
registered SHA-256 fingerprints, and automated issues for failing states.

## Quick start

Built and tested against **Node 20** (pinned in [`.nvmrc`](./.nvmrc); what CI
runs). Run `nvm use` to match it.

```sh
nvm use
npm install
npm run dev        # http://localhost:5173
```

Full command list and the contributor workflow are in
[`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). In short: `nvm use` (Node 20),
`npm install`, and the pre-commit hook runs lint + tests. Adding a new state
needs data and a config entry, not code changes.
