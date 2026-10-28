# Test Plan

We will be building off of the dashboard's existing testing framework and workflow, and implementing a compatible framework for the state repositories.

Part 1 describes the coverage we would build with unlimited time across the dashboard and state-data repositories. Part 2 is the realistic tests we will complete for this project and how to run them.

## Part 1: Full Plan 

The dashboard repository owns display behavior, shared data-loading contracts, and the tests that protect the user experience. Each state-specific repository (`measles-[statecode]`) owns its source data, data preparation, and data-quality validation. A state is registered in the dashboard only after its repository's checks pass and an administrator reviews the contributor's pull request and validation results.

### Unit Testing

Dashboard unit and component tests use the existing Vitest, jsdom, and React Testing Library framework. They test display logic in isolation: formatting coverage values, coverage tiers and missing-data states, map and list presentation, search and selection behavior, navigation controls, download-link construction, and hooks that transform validated state data into dashboard view models. Fixtures and mocked network responses keep these tests deterministic. They will not re-test each state's real dataset or depend on a live state repository.

The existing JavaScript tests cover configuration and state metadata, CSV parsing and schema contracts, aggregate-consistency helpers, data-loading hooks, geolocation, and components such as searches, school details, legends, downloads, and navigation controls. We will continue to add regression tests whenever dashboard display logic changes.

We would like to expand boundary cases for empty or missing values, coverage thresholds, long or unusual names, and presentation of data-loading or network errors. Dashboard tests may check that data conforms to the agreed interface, but state-specific correctness belongs to the corresponding state repository's validation suite.

The measles-AA template supplies the starting point for state-repository tests. Contributors should add or adapt automated tests for their state's data preparation and validation scripts alongside their data. Depending on the data pipeline, these can include R `testthat` tests for producer helpers and automated schema, row-value, geographic, and aggregate checks. We would keep tests and small fixtures with the state repository so its CI can run them on every update.

### Integration Testing

Integration testing verifies the boundary between a state repository and the dashboard. In a state repository, validation scripts check the prepared files that the dashboard will consume: required metadata, expected CSV files, schema and column order, types and allowed values, identifiers and geographic relationships, missing-data conventions, and consistency between state, county, and school aggregates. State CI runs these checks for each update; a failing check blocks the contributor from presenting the data as validated.

For onboarding, the contributor creates the state repository from the measles-AA template, adds the state's data, runs the validation scripts, and confirms the state-repository CI passes. The contributor then opens a pull request to `measles-dashboard` with the proposed registration link and reviewable evidence of the state repository's successful validation results. The dashboard repository's integration checks verify that the registration points to the expected repository and files and that the state can be discovered through the shared data contract. The administrator reviews the PR and results, then registers the state in the dashboard.

The dashboard may assume that registered state data has passed its repository's validation gate. It still needs contract-level tests for the registry and data URLs, and runtime handling for unavailable or malformed responses, since remote services can fail after validation. 

### System and UI testing

System and UI tests protect dashboard behavior in a real browser. The existing Playwright suite runs against the built app in Chromium and covers startup, national/state/county map views, zoom and Escape navigation, search, school details, view toggles, geolocation, keyboard navigation, data-manifest behavior, and visual snapshots. These remain dashboard-owned because display logic and user interactions remain in `measles-dashboard`.

End-to-end tests should verify that a registered state is discoverable, its validated data is rendered at the correct geographic levels, values and missing-data states are presented clearly, navigation and direct links work, and downloads expose the expected scope. We will include a stable representative state fixture or registered test feed.

We will keep state-specific producer validation in the state repository; dashboard browser tests verify integration and presentation rather than re-proving the full dataset. We want to add checks for accessible names, keyboard and focus behavior, responsive layouts, download contents, and deployed static-host routing. Manual exploratory browser checks can supplement automation for visual defects and network behavior.

### Tools Used

- **Dashboard display and component tests:** Vitest, jsdom, React Testing Library, and `npm test`; `npm run test:coverage` reports coverage.
- **Dashboard browser tests:** Playwright Test in Chromium with `npm run test:e2e`; the suite uses the built preview. Snapshot updates use `npm run test:e2e:update` and must be reviewed.
- **State repository data tests:** the tests and validation scripts included in the measles-AA-derived state repository. The specific languages and commands follow the template and state pipeline; contributors run them locally before opening the dashboard PR.
- **Continuous integration:** dashboard GitHub Actions runs lint, unit tests, build, and E2E jobs for pushes and pull requests. Each state repository's CI runs its data tests and validation checks whenever that repository is updated. CI configuration and check results are part of the evidence reviewed during onboarding.
- **Static checks and build:** ESLint (`npm run lint`) and the production build (`npm run build`) catch code and bundling problems but do not replace behavioral or data validation tests.
- **Manual review:** administrators inspect the registration change, the linked state-repository revision, and successful validation results. Manual browser checks confirm the newly registered state appears and behaves correctly.

### End users our testing covers

- **Public dashboard users:** need accurate and understandable state, county, and school views. There should be a clear missing-data presentation and usable search, navigation, and downloads. Dashboard unit, component, and Playwright tests cover the display and interaction logic. Acceptance checks exercise a representative journey with a newly registered state.
- **State-data contributors:** need a repeatable path to prepare and validate their data. They create a repository from measles-AA, add data and any state-specific tests, run validation locally, and use their repository's CI results as evidence before submitting a dashboard registration PR. The template and CI should make failures specific and actionable.
- **Dashboard administrators/reviewers:** need evidence that the state repository's validation passed and that its registration is correct. They review the exact state-repository revision and CI results in the dashboard PR, check dashboard integration, and register the state only after those checks are satisfactory.
- **Dashboard developers:** need regression coverage for shared display behavior and integration contracts. They run focused and full dashboard tests as they change code; dashboard CI repeats the checks on pull requests.

Also consider narrow-screen users and people who navigate by keyboard or assistive technology. Existing browser tests include mobile snapshots and keyboard checks; a systematic accessibility audit and broader browser/device matrix are useful additions.

### Test Environments and Schedule

- **Dashboard developers, during each code change and before each pull request:** run focused Vitest tests while developing and the full applicable dashboard suite before submitting. Unit/component tests run in jsdom; Playwright runs in Chromium against the built application.
- **State-data contributors, during every data or pipeline update:** work in the relevant `measles-[statecode]` repository created from measles-AA, run its validation scripts locally, and confirm its CI checks pass before submitting or updating the dashboard registration PR. Record the state-repository commit and CI run with the PR.
- **Dashboard CI, on each push to `dev` or `main` and each pull request:** use the Node version in `.nvmrc` on `ubuntu-latest` for lint, Vitest, build, and Chromium E2E checks. Record actual tool versions from the run because hosted runner images can change. The dashboard E2E job skips visual snapshot comparison.
- **State-repository CI, on every update to that repository:** run the template's data tests and validation scripts against the proposed data. A state update is considered validated only when the checks for that exact commit pass. CI results do not guarantee remote availability, so dashboard loading and error handling still need coverage.
- **Administrator/reviewer, for each new-state or data-update PR to `measles-dashboard`:** inspect the linked state repository, exact validated revision, CI results, metadata, and proposed registry change. Before accepting a new registration, run or review dashboard integration checks and verify the state appears in the dashboard. On the documented reference setup, browser acceptance uses macOS 14.6.1 (arm64), Chrome 156.0.8078.47, Node 20.19.0 or later, and R 4.3.2. The visual snapshots are macOS-specific; record other OS/browser runs as additional coverage.
- **Public-user participants, before a substantial UI release when available:** ask at least one person unfamiliar with implementation details to complete the public-user journey on the reference desktop setup and a narrow/mobile viewport. Record browser/device and observed issues; report this as user acceptance feedback, not a CI result.

For any test result cited in a PR or release, record the tester or workflow, date, dashboard and state-repository commits, OS, browser/version when applicable, runtime versions, command or scenario, result, and failures.

### Performance and Reliability Testing

Dashboard reliability testing focuses on the presentation and consumption boundary: a slow or unavailable state repository, failed requests, malformed responses, and recovery after a transient error. Passing state-repository CI gives confidence that the data at the tested commit met its validation rules; it cannot guarantee that the repository host or published files remain reachable. The dashboard should show an understandable loading or error state and avoid presenting missing values as zero or stale values as current. Existing E2E timeouts are functional bounds, not performance benchmarks.

State-repository validation should also check data-specific reliability risks such as duplicate or missing identifiers, unexpected geographic assignments, invalid coverage ranges, inconsistent aggregates, and schema drift. Run those checks on every repository update. Add repeatable dashboard performance measurements for startup, state-data readiness, map rendering, and interaction responsiveness on representative desktop and mobile conditions. Record dataset size, browser, network profile, and commit; establish budgets before treating timings as pass/fail.

### Acceptance Testing

For each state onboarding, the contributor creates a repository from measles-AA, adds the state's data, runs the repository validation scripts, and obtains passing CI checks for the exact revision. The contributor submits a PR to `measles-dashboard` with the proposed registration and reviewable links or evidence for the state-repository commit and CI results. The administrator reviews that evidence, checks the dashboard registration and integration, and registers the state only after the data checks pass. Subsequent state-repository updates must trigger the same CI validation checks so data remains stable over time.

Acceptance of the dashboard integration includes finding the registered state, viewing the state/county/school information, interpreting missing data, using search and navigation, and downloading the appropriate data. Acceptance evidence must identify the commits tested and the contributor's CI results. Dashboard code changes are accepted based on dashboard tests and CI; state-data changes are accepted based on state-repository validation plus review of the dashboard registration/update. A fresh state dataset remains the strongest onboarding acceptance case, rather than continuing to test on the `measles-NC` or `measles-CA` that the template was based on. However we do not have access to any state measles vaccination coverage, so we will not be able to include that in our final test plan.

## Part 2: What we will test

This is the realistic, current-scope plan. It covers the dashboard work and the existing North Carolina and California feed. 

We have built the `measles-AA` template based off of our preliminary `measles-NC` repository. We will implement `measles-CA` by following along with the established `measles-AA` template validation and registration process.

### Scope and expected results

For this plan, we verify that:

- Dashboard display logic continues to work with the shared state-data contract.
- The dashboard discovers the registered North Carolina and California repositories and displays the expected map, county, and school information.
- National, state, and county downloads have the expected columns and geographic scope.
- A failed remote data request is visible to the user and the dashboard recovers when the request becomes available again.
- The measles-AA template's producer tests and validation workflow provide the checks a contributor needs to prepare a state repository. For a new state, require the contributor to link the tested repository revision and successful CI run in the dashboard PR.
- Dashboard CI passes for the dashboard PR, and an administrator can review the state registration and the linked validation evidence before registering the state.

### Environments

For local dashboard checks, use Node 20.19.0 or later, macOS 14.6.1 (arm64), and Chrome 156.0.8078.47 as the reference environment. The unit suite runs in Vitest/jsdom; Playwright runs in Chromium. R producer tests use R 4.3.2. Dashboard GitHub Actions uses `ubuntu-latest` and the Node version pinned in `.nvmrc`; record actual runner versions from the run. The state repository's CI environment is defined by its own workflow; record the workflow URL, commit SHA, and reported tool versions with the validation evidence.

### 1. Dashboard automated checks

Run from the `measles-dashboard` repository root. Install the pinned dependencies and execute the automated suites:

```sh
nvm install 20.19.0
nvm use 20.19.0
npm ci
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

**Pass:** lint, all Vitest tests, production build, and Playwright tests complete successfully. The Playwright suite should verify dashboard behavior and the data contract, not independently revalidate the complete state dataset. If a test fails, include the test name and diagnostic output in the PR or test record. CI's E2E job uses `--ignore-snapshots`; compare visual snapshots locally on macOS when layout or styling changes.

Relevant existing unit/component tests include `src/config/`, `src/data/`, `src/hooks/`, and component tests throughout `src/`. Existing E2E specs under `e2e/` cover app loading, map zoom, state/county/school search and details, geolocation, keyboard navigation, view toggles, data manifests, and visual layouts.

### 2. State-repository validation and contributor handoff

For a state-data contribution:

1. Create `measles-[statecode]` from the `measles-AA` template, following the template repository's setup instructions.
2. Add the state-specific data and any required metadata. Keep state-specific tests, validation scripts, and CI configuration in that repository.
3. From the state repository root, run the template's documented producer/build and data-validation commands. Run its automated test suite as well. For the shared R helper suite present in the current template workflow, install R 4.3.2 plus `testthat` and `data.table`, then run `Rscript scripts/build-data/tests/testthat.R` from that repository root. The template README must name this and any additional producer/build or data-validation commands and their required tool versions so another contributor can reproduce them; copy the exact commands into the test record rather than substituting dashboard commands.
4. Push the candidate revision and confirm the state repository's CI validation checks pass for that exact commit. Record the commit SHA, CI run URL, commands, environment, and results.
5. Open a PR to `measles-dashboard` proposing the state registration. Link the state repository and exact tested revision, and include the successful CI run and any validation summary as review evidence.

**Pass:** the state repository's data tests and validation checks pass for the proposed revision; the dashboard PR identifies that same revision; and the administrator can inspect the evidence. A local dashboard validator that reads dashboard-owned `public/data/states/` is not a substitute for the state repository's own validation and should not be reported as having validated a remote state feed.

### 3. Dashboard integration and manual browser checks

Use the deployed app or a local production preview. When using a local preview, build first and start it in a separate terminal with `npm run preview`. Keep Chrome Developer Tools' Network tab open for the request checks.

1. Open the national map. Confirm the state registry request succeeds and North Carolina is available.
2. Select North Carolina. Confirm the registered state's metadata, county data, and school data requests succeed and the map displays counties and schools.
3. Find Wake County and New Hanover County. Open a school detail and compare its displayed coverage and grade values with the corresponding rows in the validated NC source data. Include one missing/no-data example if available; confirm it is not displayed as zero.
4. Download the national, NC state, and Wake County CSVs. Check that each file is non-empty, has the documented header, and contains the correct geographic scope. For repeatable automated coverage, add/maintain a Playwright download test that inspects these files rather than checking only link paths.
5. Open the direct NC route `/measles-dashboard/state/nc`, select a county, and use browser Back and Forward. **Pass:** the route and displayed map level remain in sync.
6. Block the NC school-data request using DevTools request blocking, then reload or reselect NC. **Pass:** the unavailable data is not presented as valid, the issue is apparent, and the view recovers after removing the block and retrying. Do not change or disrupt the public state repository for this check.

Record the data revision or source URL used for comparisons. A successful request only demonstrates availability at test time; it does not replace the state repository's validation CI result.

### 4. Performance and reliability spot checks

1. In a fresh browser session, load the NC state view three times.
2. Record time to county and school data readiness, browser, network conditions, and failed requests.
3. Check a school above 95% coverage, one near 95%, one missing/no-data case if available, and one school in a multi-word county. Compare values with the same validated source revision.

**Pass for this spot check:** the NC and CA map and data appear within 15 seconds on each run, the displayed values match the source, missing data is not shown as zero, and any transient failure and recovery are recorded. This is a focused smoke check, not a formal performance benchmark or proof of reliability across all states and network conditions.

### 5. Acceptance and review checklist

- [ ] Dashboard lint, unit tests, build, and E2E tests pass for the dashboard revision.
- [ ] The contributor's state repository was created from measles-AA and includes its data tests, validation scripts, and CI workflow.
- [ ] The documented state-repository tests and data-validation commands pass for the exact proposed state commit; the CI run and tool versions are linked in the dashboard PR.
- [ ] The dashboard PR points to the tested state commit and proposes the correct registration.
- [ ] An administrator reviews the source revision, CI evidence, and registration before accepting it.
- [ ] The registered state appears in the dashboard and its map, details, navigation, and downloads pass the integration checks above.
- [ ] Failure handling and the three-run NC smoke check pass, with results recorded.
- [ ] The test record includes date, dashboard and state-repository commit SHAs, tester/workflow, environment, commands/scenarios, results, and failures.

Do not mark new-state onboarding as accepted if the linked state CI result is missing or belongs to a different commit. Subsequent updates in a state repository must trigger the same validation workflow; a later failing check means that update is not validated for dashboard registration/use until corrected and rerun.

### GitHub Actions results

For the dashboard PR, open the matching **CI** workflow run and check Lint, Unit Tests, Build, and E2E Tests. On E2E failure, inspect the uploaded Playwright report and test-results artifacts. The dashboard's separate **Producer Tests** workflow applies only to changes under `scripts/build-data/**` in this repository; it is not the state-repository validation run and does not validate changes made only in a separate state repository.

For a state-data PR, open the Actions run in that state repository and verify that the successful validation run matches the exact commit referenced in the dashboard PR. A successful Pages deployment is not a substitute for either repository's test workflows. If no relevant run exists, run the documented commands locally and label the result as local; do not report it as CI.