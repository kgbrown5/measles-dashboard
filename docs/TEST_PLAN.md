# Test Plan

## Purpose and scope

This plan tests the changes in the dashboard history starting at
`81ac83f2e7ffecf54c2f6fd73610e15d759ed139`, together with the North Carolina
(`measles-NC`, `main`) and shared-helper (`measles-AA`, `iteration-1`)
repositories. It focuses on:

- Loading state metadata and school/county CSV data from a separate state
  repository.
- Keeping the map's county and school data aligned with those CSVs.
- Downloading the data shown at national, state, and county zoom levels.
- The shared R producer-helper and producer contract.

It does not claim to test inherited map behavior beyond the user flows needed to
verify these changes. Usability testing is omitted.

Use the latest intended commits on dashboard `dev`, NC `main`, and AA
`iteration-1` as the test subjects; record their full SHAs. A local checkout
may use a working branch that tracks the target branch.

**Source-of-truth decision remains open:** the app loads North Carolina's
`data/counties.csv` and `data/schools.csv` from the external repository, while
`DownloadButton` links to dashboard-local `/data/all-schools.csv`,
`/data/states/nc/schools.csv`, and `/data/states/nc/counties/<county>.csv`.
Those dashboard-local school CSVs are not present in this checkout. The live
dashboard did serve all three downloads successfully in a preflight check
(results below), but confirm which repository/build process is responsible for
publishing them before calling future data updates reproducible and accepted.

The specified AA branch contains shared R helpers, producer scripts, and
synthetic producer tests, but no AA-specific data feed or output. This plan
tests its helper/producer contract; AA map/data integration is not yet
testable.

## People and timing

- **Test executor and acceptance approver:** the professor. The professor will
  execute the checks in this plan and record the results by **December 31,
  2026**.
- **Project maintainer:** prepare the checked-out commits, dependencies, and
  test evidence, and resolve failures before the professor's acceptance run.
- **User perspectives covered:** a map visitor drilling from national to state
  and county detail; a researcher/data analyst downloading and reading CSVs;
  and a state data contributor/engineer publishing metadata and data in a
  separate repository. The professor is the only confirmed tester; no separate
  user testers have been scheduled.

## Test environments

| Environment | Versions and use |
| --- | --- |
| Local development and acceptance | macOS 14.6.1 (Sonoma), arm64; Google Chrome 156.0.8078.47; Node 20.19.0 or later within major version 20; R 4.3.2. The available machine currently has Node 20.11.0/npm 10.2.4, below the engine requirements of packages in the lockfile; upgrade Node before installing/running dashboard tests, then record the actual Node and npm versions. |
| Dashboard GitHub Actions | GitHub-hosted `ubuntu-latest`; Node 20 selected by `.nvmrc`; npm dependencies installed from `package-lock.json`; Playwright/@playwright/test 1.59.1 with Chromium. `.nvmrc` does not pin the Node patch version. `ubuntu-latest` is a moving image, so record the actual image, Node, and browser versions shown in each run. |
| Producer GitHub Actions | GitHub-hosted `ubuntu-latest`; R installed by `r-lib/actions/setup-r@v2`; `data.table` and `testthat` installed by `setup-r-dependencies@v2` from public RSPM. The R version is not pinned in the workflow; record the version in the run log. |

The local R suite requires `testthat`; CI also installs `data.table`. The
dashboard test suite uses jsdom for unit/component tests and Playwright Chromium
for end-to-end tests.

## Automated tests and tools

From the dashboard repository root, select the required Node version and
install the lockfile dependencies before running the commands:

```sh
nvm install 20.19.0
nvm use 20.19.0
npm ci
```

Use the specified branches/commits as the test subjects:

| Level | Command | What it checks |
| --- | --- | --- |
| Unit/component | `npm test` | Vitest suites, including metadata/registry behavior, CSV loading and transformation, schema validation, and download-link construction. |
| Focused regression | `npx vitest run src/config/states.test.js src/hooks/useUnifiedMapData.test.js src/components/Header/DownloadButton.test.jsx src/data/csvSchema.test.js` | The state configuration, remote-data loader contract, national/state/county download paths, and CSV schema contract. |
| Lint | `npm run lint` | ESLint over `src/`. |
| Production build | `npm run build` | Vite build and the `prebuild` data-generation steps. Also inspect `dist/data/`; a successful build alone does not prove that the linked CSVs exist or contain data. |
| Browser integration | `npm run build && npx playwright install chromium && npm run test:e2e` | Playwright Chromium against the built app. Covers map rendering, state/county interaction and existing manifest behavior. |
| R producer helpers and schema | `Rscript scripts/build-data/tests/testthat.R` | Run from both the dashboard checkout and `measles-AA` checkout. Tests point-in-polygon assignment, coverage gaps, tier thresholds, county-name case, and output column order using small synthetic fixtures, not a full model fit. |

Useful focused browser specs include `e2e/app-loads.spec.js` and
`e2e/data-manifest.spec.js`. Vitest and testthat validate local logic/contracts;
they do not prove that the published state repository is reachable or that a
real browser can fetch it cross-origin.

### Baseline readiness gaps

Resolve these before treating the automated suites as acceptance evidence:

- The current checkout has no `public/data/states/` school CSV directories.
  `src/data/csvSchema.test.js` discovers local state directories and expects
  both `ca` and `nc`; populate the expected test data or update the contract
  test to validate the agreed decentralized-data design.
- `src/hooks/useUnifiedMapData.test.js` mocks/asserts dashboard-local
  `data/states/nc.csv` and `data/states/nc/schools.csv` URLs, while the current
  loader requests `data/counties.csv` and `data/schools.csv` from the external
  state registry URL. Align the fixtures and assertions before using this test
  as proof of the current integration.
- The dashboard's **Producer Tests** workflow is in the dashboard repository
  and only runs for dashboard pull requests that touch
  `scripts/build-data/**`. It does not automatically run for changes pushed to
  the separate AA repository; run the AA `testthat` command there and record
  that local result unless that repository adds its own workflow.
- The attempted local focused test run did not execute: dependencies were not
  installed. `npm ci` then failed with `ENOSPC` (insufficient disk space), so
  no Vitest result is claimed here. The available machine has only Node
  20.11.0, below the current dependencies' engine requirements.
- The R test runner could not start because `testthat` is not installed. No R
  suite result is claimed here.
- The GitHub Actions API returned no workflow runs for the repository at the
  time of this check. Existing runs must be inspected when available; absence
  of a run is not a pass.

### Preflight results (October 27, 2026)

The following is a live deployment smoke check, not a local build or full
acceptance run:

- The NC decentralized repo's `data/meta.json`, `data/counties.csv`, and
  `data/schools.csv` each returned HTTP 200.
- Dashboard `data/all-schools.csv`, `data/states/nc/schools.csv`, and
  `data/states/nc/counties/wake.csv` each returned HTTP 200 with
  `text/csv`. Parsed results contained 9,831 national rows, 1,822 NC rows, and
  165 Wake County rows. The NC state rows matched the NC subset in the national
  export; Wake County rows matched the Wake subset of the NC export; the CSV
  columns aligned across all three.
- These results confirm current public URLs and sample file consistency only.
  They do not prove that the local checkout rebuilds/publishes the files, or
  that every county download has the expected contents.

### GitHub Actions: how to inspect and reproduce checks

The preference for this test cycle is to inspect existing runs and run
equivalent commands locally, not to push a test branch or open a PR.

1. In GitHub, open the dashboard repository's **Actions** tab and find a run for
   the commit being assessed. Open each job, check its final status, and retain
   the run URL, commit SHA, job results, and any relevant logs/artifacts.
2. For **CI**, inspect **Lint**, **Unit Tests**, **Build**, and **E2E Tests**.
   The workflow runs on pull requests and pushes to `dev` or `main`; E2E uses
   the build artifact. If E2E fails, download `playwright-report` and
   `test-results` from that run.
3. **Producer Tests** run only for pull requests that change
   `scripts/build-data/**`. A missing run for a change outside those paths is
   expected; a missing run after a matching pull request is not evidence of a
   pass. Inspect the “R producer tests” job.
4. **Deploy to GitHub Pages** runs for pushes to `main` or manual dispatch. It
   is a deployment workflow, not a general validation workflow. Inspect its
   build/deploy jobs only when checking a deployment.
5. To reproduce the validation locally, run the matching commands in the table
   above. GitHub Actions itself does not run on the local machine; local
   commands are equivalent checks, not a new Actions run. Do not report a
   workflow as passed unless its GitHub run is visible and successful.

## Integration and system test cases

Run the clean-data flow before failure cases. Keep browser DevTools Network open
with **Preserve log** enabled and inspect response URLs/statuses. For CSV checks,
use `curl -fL <URL> -o <file.csv>` and inspect the header and rows in a
spreadsheet or CSV reader.

| ID | Tester / setup | Steps | Expected result |
| --- | --- | --- | --- |
| INT-1: decentralized registry and metadata | Professor; Chrome, online; dashboard's deployed URL or production preview | Open the national view. In Network, find `data/stateRegistry.json`, then the NC `data/meta.json` request to the registered state-repository URL. | Registry and metadata requests return HTTP 200 and valid JSON. The metadata identifies NC correctly; the page has no uncaught console error. |
| INT-2: state data reaches map | Professor; same browser session | Select NC and inspect requests to the registered repo's `data/counties.csv` and `data/schools.csv`. Check map and school detail for Wake County and New Hanover County; compare displayed values with source CSV rows. | Both CSVs return HTTP 200 with the expected headers. NC counties and schools appear; multi-word county names join correctly; CSV proportions display as percentages. |
| INT-3: map-level download links | Professor; after the download-source decision is resolved | At national zoom, activate **Data** and save/open the result. Repeat at NC state zoom and Wake County zoom. Inspect filename, HTTP status, header, and row scope. | Each link downloads a non-empty CSV at the agreed source URL. National contains all currently published states and a `state` identifier; state contains only NC schools; county contains only the selected county's schools. Header matches `src/data/schema.js`; coverage values and missing cells are represented as documented. A 404, HTML error page, wrong scope, or empty CSV fails acceptance. |
| INT-4: cross-repository updates | Professor/data contributor; online | Compare the repository registry URL with the NC `data/meta.json`, `data/counties.csv`, and `data/schools.csv` in the same commit/release. Reopen or hard-refresh the NC map after an update. | The registry resolves to the intended repo; metadata and CSV schema agree; the map reflects the updated CSV rows without requiring edits to dashboard map logic. Record the repo commit and dataset version/date used. |
| INT-5: unavailable or malformed remote data | Professor; use DevTools request blocking or a temporary local test copy, not a public data edit | Block the NC `data/counties.csv` request, then separately make the registry or metadata request unavailable. Reload and select NC. | The app does not silently show stale/success-shaped NC data. The failed request and user-visible failure can be identified in the browser. Restore normal network access and confirm a reload recovers. |
| INT-6: direct route and back/forward | Professor; Chrome, online | Open `/measles-dashboard/state/nc` directly, select a county, then use browser Back and Forward. | The route loads NC, requests the decentralized data, and the URL/view remain in sync. |

**Source-of-truth decision for INT-3:** the current deployed dashboard links to
its own published `data/...` files. Decide whether those are generated from
state-repository data during the dashboard build or whether the links should
point directly to decentralized state repositories (including a defined
county-download URL). The current NC feed alone does not establish the
national CSV or guarantee per-county file generation. Until that is agreed,
the live smoke result can be recorded, but regeneration after a repository
data update remains unaccepted.

## Producer and repository contract checks

1. In the dashboard repository, run
   `Rscript scripts/build-data/tests/testthat.R`. Expected: all tests pass,
   including synthetic adjacent-county assignment, unmatched school IDs,
   `0.90`/`0.95` tier boundaries, title-cased county names, and the shared
   CSV column order.
2. In `measles-AA` on `iteration-1`, run the same
   `Rscript scripts/build-data/tests/testthat.R` command from the repository
   root. Expected: all shared-helper/producer-contract tests pass. Compare
   `scripts/build-data/R/producer-helpers.R` and the schema expectations with
   the dashboard versions; keep corresponding testthat tests in sync.
3. In `measles-NC`, verify the published `data/meta.json`,
   `data/counties.csv`, and `data/schools.csv` exist and have rows, and compare
   their headers and county/school names with the dashboard's expected schema
   and map joins. The checked-in test suite uses synthetic fixtures; it does
   not regenerate or validate all NC source estimates.
4. Do not mark AA data production/integration tested: the specified AA branch
   has producer code and synthetic tests but no AA output files or registered
   feed.

## Performance, reliability, and data-specific checks

- Repeat INT-2 three times in a fresh browser session. Each run must complete
  the initial map and NC county/school load within the existing 15-second
  map-render timeout, without duplicate state-data fetches on refocus. Record
  the three observed load times and any failed requests.
- Check a high-coverage row, a value around the 95% threshold, a multi-word
  county, a school with blank/no-data coverage if present, and missing
  per-grade fields. Values must agree with the source CSV; blank values must
  not be interpreted as zero.
- Verify remote responses are successful over HTTPS and readable by the
  browser. Record any CORS, timeout, or transient availability failures and
  repeat once after recovery; do not count a failed first request as a pass
  merely because a later retry succeeds.

No separate throughput/load target has been specified. This plan records
response/render times and tests repeated loads; it does not claim capacity for
large concurrent traffic.

## Acceptance record

The professor records the date, tested commit SHAs for all three repositories,
machine/browser versions, test IDs, command or URL, pass/fail, and a short
evidence pointer (Actions run URL/log or screenshot/CSV file). Acceptance
requires all applicable automated checks and INT-1 through INT-6 to pass, the
download-source blocker to be resolved, and the helper-only scope for AA to be
clearly distinguished from untested AA data integration. Failures remain
open; do not describe an unrun test as passed.
