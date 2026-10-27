# Test Plan

## What this plan tests

The focus is the work in the dashboard since commit
`81ac83f2e7ffecf54c2f6fd73610e15d759ed139`, plus related work in
`measles-NC` (`main`) and `measles-AA` (`iteration-1`):

- The dashboard reads North Carolina metadata and CSV data from a separate
  repository.
- Map download links provide national-, state-, and county-level CSVs.
- The data producers use a consistent schema and shared R helpers.

The professor is the tester and acceptance approver. Complete these tests by
December 31, 2026. Record the date and the commit SHA for each repository.

**Known issue to decide:** the map loads NC data from the NC repository, but
the download links point to CSV files published by the dashboard. The live
downloads work, but the local dashboard checkout does not contain those files.
Decide which repository/build process owns these downloads before accepting
future data updates.

**Test environment:** macOS 14.6.1 (arm64), Chrome 156.0.8078.47, Node 20.19.0
or later, and R 4.3.2. The available machine currently has Node 20.11.0, which
is too old for the locked dependencies. Upgrade Node before running dashboard
tests. GitHub Actions uses `ubuntu-latest`; record the versions shown in the
specific run.

## 1. Unit tests

These are automated tests of small pieces of code. Run from the dashboard root:

1. Install the required Node version and dependencies:

   ```sh
   nvm install 20.19.0
   nvm use 20.19.0
   npm ci
   ```

2. Run the tests:

   ```sh
   npm test
   ```

3. Confirm Vitest reports all tests passing.

Existing tests cover state configuration, CSV loading and conversion, schema
validation, and the download link paths. The R `testthat` suite covers county
assignment, coverage flags and tiers, county-name formatting, and CSV column
order. Run it from the dashboard root and from the AA repo root:

```sh
Rscript scripts/build-data/tests/testthat.R
```

### Tests to add or repair

- **Update the data-loader test** in
  `src/hooks/useUnifiedMapData.test.js`: it currently mocks old dashboard-local
  data URLs, while the loader requests `data/counties.csv` and
  `data/schools.csv` from the external state repository. Add checks that the
  registry URL is used and that failed remote requests are surfaced.
- **Fix the CSV schema test/data fixture** in `src/data/csvSchema.test.js`:
  it expects local NC and CA CSV directories that are absent from this
  checkout. Either provide test fixtures or change the test to match the
  agreed decentralized-data design.
- **Add a real download test**: the existing
  `src/components/Header/DownloadButton.test.jsx` checks link paths, not that
  downloaded files exist or contain the correct rows. Add a Playwright test
  under `e2e/` that downloads one file at each zoom level and checks its CSV
  header and row scope.

## 2. Integration and system tests (with UI)

Run the app in Chrome. Keep the browser Developer Tools **Network** tab open.
Use the live app or a local production preview.

Run the existing browser tests from the dashboard root:

```sh
npm run build
npx playwright install chromium
npm run test:e2e
```

These tests cover map rendering and state/county interaction. Then do the
following manual checks:

1. **Check the decentralized data connection.** Open the national map and
   confirm `data/stateRegistry.json` loads. Select North Carolina and confirm
   the NC repository's `data/meta.json`, `data/counties.csv`, and
   `data/schools.csv` return HTTP 200.
   **Pass:** NC county and school data appear on the map.
2. **Check county joining.** Find Wake County and New Hanover County on the map.
   Open a school detail and compare its displayed values to the NC
   `data/schools.csv`.
   **Pass:** county names (including the multi-word name) and school coverage
   match the CSV.
3. **Check downloads.** At national zoom, download the national CSV; repeat at
   NC state zoom and Wake County zoom. Open each CSV.
   **Pass:** the files are non-empty, have the expected headers, and contain
   the right scope: all states, NC only, and Wake County only.
4. **Check a direct link.** Open `/measles-dashboard/state/nc` in a new tab,
   select a county, then use Back and Forward.
   **Pass:** the correct map view loads and the URL stays in sync.
5. **Check a remote-data failure safely.** Use Developer Tools request blocking
   to block the NC `data/schools.csv` request, then reload/select NC. Remove the
   block and reload.
   **Pass:** the failed load is apparent and the app recovers after the block
   is removed. Do not edit or break the public data repository for this test.

**Preflight already completed (October 27, 2026):** the three NC source URLs and
the dashboard's national, NC, and Wake download URLs returned HTTP 200. The
national file had 9,831 rows, NC had 1,822, and Wake had 165. NC rows matched
the NC section of the national file; Wake rows matched the Wake section of NC.
This only confirms the live sample files, not a local build or all counties.

## 3. Performance and reliability tests

1. Open a fresh browser session and load the NC map three times.
2. Record how long it takes for county and school data to appear, and note
   failed network requests.
3. Check one school above 95% coverage, one near 95%, one blank/no-data value
   if available, and one school in a multi-word county. Compare each to the CSV.

**Pass:** the NC map and data load within 15 seconds each time (the existing
browser tests use a 15-second map-render timeout), values match the CSV, and
blank data is not shown as zero. Record any transient failure and whether a
reload recovers. This is a small reliability check, not a high-traffic load
test.

## 4. Acceptance tests

The professor completes this checklist by December 31, 2026:

- [ ] Unit tests pass: `npm test`.
- [ ] Lint and build pass: `npm run lint` and `npm run build`.
- [ ] Existing browser tests pass: `npm run test:e2e`.
- [ ] R helper tests pass in the dashboard and AA repositories:
      `Rscript scripts/build-data/tests/testthat.R`.
- [ ] Decentralized NC metadata and CSVs load and match what the map displays.
- [ ] National, NC, and county downloads contain the correct rows and headers.
- [ ] Direct NC link, county selection, and browser Back/Forward work.
- [ ] Failure/recovery and the three repeated load checks pass.
- [ ] The source/build owner for downloadable CSVs is decided.
- [ ] Record test date, repository commit SHAs, environment versions, results,
      and any failed tests.

AA currently has shared producer code and tests, but no AA data feed to test
through the dashboard. Do not claim AA data integration passed until an AA feed
exists.

## GitHub Actions: how to check the results

No new branch or pull request is needed for this plan.

1. Open the dashboard repository on GitHub and select **Actions**.
2. Open the **CI** run for the commit being tested. Check the Lint, Unit Tests,
   Build, and E2E Tests jobs. On an E2E failure, download its test report and
   test-results artifacts.
3. Check **Producer Tests** only when a pull request changes
   `scripts/build-data/**`; that workflow does not run for changes made only in
   the separate AA repository.
4. A successful Pages deployment is not a substitute for CI tests. Record a
   workflow as passed only when the matching run exists and its jobs succeeded.
5. If there is no relevant Actions run, run the commands in the Unit Tests
   section locally and record that as a local result—not an Actions result.

At the last check, GitHub listed the workflows but returned no existing runs.
The local Vitest run could not start because dependencies were missing; `npm
ci` ran out of disk space. The R tests could not start because `testthat` is
not installed. These tests are **not yet verified as passing**.
