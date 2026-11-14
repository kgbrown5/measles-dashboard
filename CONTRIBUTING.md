# Contributing

Thanks for contributing to the Measles Vaccination (MMR) Coverage Dashboard. This document covers the tooling that runs locally and in CI, and what you're expected to do when you add or change code.

## Prerequisites

- **Node 20** — what CI runs, pinned in [`.nvmrc`](./.nvmrc). Run `nvm use` before anything else to match it.
- **npm** — we commit `package-lock.json`; don't swap in yarn/pnpm.

First-time setup:

```sh
nvm use
npm install
```

`npm install` triggers Husky's `prepare` script, which installs the git pre-commit hook.

## Local development commands

| Command                  | What it does                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `npm run dev`            | Vite dev server at http://localhost:5173 with HMR.                                              |
| `npm run build`          | Production build into `dist/`. Required before running e2e tests outside of `npm run test:e2e`. |
| `npm run preview`        | Serves the built `dist/` on port 4173 — the URL Playwright's `webServer` expects.               |
| `npm run check-state-data` | Read-only live state API validation; writes a JSON report and fails on invalid data. |
| `npm run lint`           | ESLint over `src/`.                                                                             |
| `npm test`               | Vitest unit/component tests in jsdom, single run.                                               |
| `npm run test:watch`     | Vitest in watch mode.                                                                           |
| `npm run test:coverage`  | Vitest with coverage reporter.                                                                  |
| `npm run test:e2e`       | Playwright (chromium). Auto-spawns `npm run preview`, so build first.                           |
| `npm run test:e2e:update`| Regenerate visual-regression snapshots (macOS only — see below).                                |

Run a single Vitest file or filter by name:

```sh
npx vitest run src/components/Sidebar/Sidebar.test.jsx
npx vitest run -t "renders school list"
```

## Testing

### Vitest — unit and component tests

[Vitest](https://vitest.dev/) runs our unit and component tests in [jsdom](https://github.com/jsdom/jsdom), with [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/) and [@testing-library/user-event](https://testing-library.com/docs/user-event/intro) for interaction. Matchers come from [@testing-library/jest-dom](https://github.com/testing-library/jest-dom) (loaded in `src/test/setup.js`).

**How we use it:**

- Tests live next to the code they cover, as `*.test.{js,jsx}` (e.g. `src/components/Sidebar/Sidebar.test.jsx`). Config is in [`vitest.config.js`](./vitest.config.js).
- `globals: true` — `describe`, `it`, `expect`, `vi`, etc. are available without imports.
- Prefer Testing Library queries (`getByRole`, `getByText`) over DOM snapshots. Use `userEvent` (not `fireEvent`) for interactions.

**When making changes:**

- Adding a component? Add a `*.test.jsx` next to it.
- Changing logic in `src/config/index.js` (tier thresholds, color scales, grades)? Update `src/config/index.test.js`.
- Hooks that touch `localStorage`, geolocation, or `fetch` need those APIs mocked with `vi.stubGlobal` / `vi.fn()` — don't hit the network in unit tests.

### Playwright — end-to-end tests

[Playwright](https://playwright.dev/) drives a real Chromium browser against the built app. Config is in [`playwright.config.js`](./playwright.config.js); specs live in [`e2e/`](./e2e/).

**How we use it:**

- Chromium only. `baseURL` is `http://localhost:4173`, so Playwright runs against the **production build** served by `npm run preview` (the `webServer` block handles this automatically).
- Skip the onboarding tour in specs by setting `localStorage['nc_measles_tour_done'] = '1'` before `page.goto('/')` — see [`e2e/visual-regression.spec.js`](./e2e/visual-regression.spec.js) for the pattern.
- D3-rendered elements are queried by id/class (`#map-svg`, `.county-path`, `#sidebar`, etc.). Those ids are load-bearing — don't rename them without updating specs.

**When making changes:**

- Changing user-facing flows (selecting counties, toggling views, keyboard shortcuts)? Add or update a spec in `e2e/`.
- Run `npm run build && npm run test:e2e` locally before pushing e2e changes — CI uses the artifact from the build job, so a broken build breaks e2e too.

### Visual regression (macOS-only snapshots)

[`e2e/visual-regression.spec.js`](./e2e/visual-regression.spec.js) uses Playwright's [`toHaveScreenshot`](https://playwright.dev/docs/test-snapshots). Snapshots live in `e2e/visual-regression.spec.js-snapshots/` and are suffixed `-chromium-darwin.png` — they are **darwin-only**. CI runs Playwright with `--ignore-snapshots`, so visual regressions are only caught locally on macOS.

**When making changes that affect pixels** (CSS, map colors, layout):

1. Verify the change looks right in the browser.
2. Run `npm run test:e2e:update` on macOS to regenerate the snapshots.
3. Commit the updated PNGs alongside your change.
4. In your PR description, call out that the snapshots changed and why.

Do **not** regenerate snapshots on Linux — the filenames won't match what CI/darwin runs compare against.

## Linting

### ESLint

[ESLint 9](https://eslint.org/) with the flat-config format ([`eslint.config.js`](./eslint.config.js)). We use [`eslint-plugin-react`](https://github.com/jsx-eslint/eslint-plugin-react) and [`eslint-plugin-react-hooks`](https://github.com/facebook/react/tree/main/packages/eslint-plugin-react-hooks).

**Rules that matter:**

- `react-hooks/rules-of-hooks`: **error**.
- `react-hooks/exhaustive-deps`: warning. Don't silence it without a comment explaining why — the Map component has deliberate exhaustive-deps exceptions, and new ones should be justified.
- `no-unused-vars`: warning. Prefix intentionally unused args with `_`.
- `no-console`: warning. Remove `console.log` before committing; keep `console.warn`/`console.error` only with a comment.

The pre-commit hook runs ESLint with `--max-warnings=0`, so **warnings block commits just like errors**. Fix them, don't suppress them.

### Husky + lint-staged (pre-commit hook)

[Husky 9](https://typicode.github.io/husky/) installs a git hook at [`.husky/pre-commit`](./.husky/pre-commit) that runs [`lint-staged`](https://github.com/lint-staged/lint-staged) against files in your commit. The `lint-staged` config (in `package.json`) runs `eslint --fix --max-warnings=0` on staged `src/**/*.{js,jsx}`.

**When making changes:**

- Let the hook run. If it fails, fix the lint errors, `git add` the fixes, and re-commit — don't `git commit --no-verify` unless you have a specific, defensible reason.
- If the hook doesn't fire, run `npm install` to re-run the `prepare` script and reinstall it.

## Continuous integration

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on every pull request. Four jobs in parallel (E2E waits on Build):

| Job        | Command                                       | Notes                                                        |
| ---------- | --------------------------------------------- | ------------------------------------------------------------ |
| Lint       | `npm run lint`                                | Fails on any ESLint error (warnings allowed at the CI level; the pre-commit hook catches them earlier). |
| Unit Tests | `npm test`                                    | Vitest, single run.                                          |
| Build      | `npm run build`                               | Uploads `dist/` as an artifact for the E2E job.              |
| E2E Tests  | `npx playwright test --ignore-snapshots`      | Downloads the `dist/` artifact. Visual regressions are intentionally not checked here — verify them locally on macOS. |

The separate **Check State Data** workflow validates published state APIs on
relevant PRs/pushes and every six hours. See [Data validation](docs/DATA_VALIDATION.md)
for hash baselines, issue reporting, and central credential setup.

On failure, the E2E job uploads `playwright-report/` and `test-results/` as artifacts (7-day retention) — grab them from the Actions run if you need to debug.

## Before opening a PR

1. `npm run lint` — zero errors, zero warnings.
2. `npm test` — unit suite green.
3. `npm run build && npm run test:e2e` — e2e suite green locally (on macOS, snapshots included).
4. If you touched styling or layout, regenerate visual snapshots and commit them.
5. Describe the change and call out anything CI can't catch (visual diffs, changes that need manual QA in the browser).

## Contributing a state's data

The dashboard is built so other organizations can contribute their own state's
school-level MMR coverage data (#78). The work is decentralized (each org
prepares their state) but the **format is centralized**: every state's CSVs must
conform to one published schema, and a conformance check gates each contribution
in CI.

### The flow

1. **Open a ["Contribute a state's data" issue](.github/ISSUE_TEMPLATE/contribute-state-data.yml)** — the front door, so we can coordinate on source and license.
2. **Prepare conforming CSVs** for your state (see files below).
3. **Open a PR** with those CSVs. CI runs `npm test`, which validates every file against the schema.
4. **Conformance CI + a light review**, then merge. Once on `main`, the deploy publishes your state automatically.

### The schema is the contract

[`src/data/schema.js`](./src/data/schema.js) is the single source of truth for
the columns, types, and value constraints of every file. It generates the
machine-readable [`/data/schema.json`](https://accidda.github.io/measles-dashboard/data/schema.json)
and the [`docs/API.md`](./docs/API.md) tables. Validate your data against it
**before** opening the PR — this is the exact check CI runs:

```sh
npm run validate-data
```

It reports any header mismatch, out-of-range coverage (must be in `[0, 1]`),
unknown `tier` (must be `H`/`M`/`L`), malformed FIPS, `no_data` outside `{0, 1}`,
etc. **Blank cells are allowed** — they mean "not available" (e.g. NC has no
per-grade or credible-interval values), not zero.

### Files to commit

For a state with code `<code>` (lowercase USPS, e.g. `ny`):

| File | What |
| --- | --- |
| `public/data/states/<code>/schools.csv` | one row per school (the core data) |
| `public/data/states/<code>.csv` | one row per county (summary) |
| a new row in `public/data/states.csv` | the national-summary row for the state |
| an entry in `STATES` in [`src/config/states.js`](./src/config/states.js) | display name + data-source attribution link |

Then mark the state visible (this re-validates the data first, then flips
`public/data/states.json` to `ready`):

```sh
npm run register-state -- <code>
```

### Do NOT commit generated artifacts

These are rebuilt at build time (`npm run prebuild`) and are gitignored — leave
them out of your PR:

- `public/data/all-schools.csv` (national concatenation, #75)
- `public/data/states/*/counties/` (per-county splits, #65)
- `public/data/schema.json` (generated from `schema.js`, #77)

## Questions

Open an issue or drop a comment on your PR.
