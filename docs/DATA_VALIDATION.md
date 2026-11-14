# Monitoring registered state data

The dashboard reads each state's published API directly. Registration validates
Git blobs once; **Check State Data** also checks the live endpoints so a broken
publish, incompatible update, or changed dataset does not go unnoticed.

## What is checked

`npm run check-state-data` reads `public/data/stateRegistry.json` and checks every
registered state independently. It writes `state-data-report.json` and exits
nonzero if any state fails. An empty registry explicitly reports that no live
endpoints were checked.

- Public repository availability and immutable repository ID, when registered.
- HTTP availability of `state.csv`, `counties.csv`, `schools.csv`, and `meta.json`.
  Requests time out after 15 seconds and are attempted up to three times.
- CORS access for the dashboard's origin, so a response accessible to CI is also
  accessible to the browser. Same-origin endpoints do not require CORS headers.
- Exact CSV headers, quoting and row widths, types, coverage ranges, and tiers,
  using the existing dashboard schema and validator.
- State identity/FIPS, nonempty files and identities, duplicate county/school
  identities, and school-to-county links. Each CSV must have at least one usable
  overall coverage value; grade/interval values alone cannot shade the map.
- County names and any supplied county FIPS must match the dashboard's us-atlas
  geography. Blank county FIPS and blank optional measurements remain allowed.
- Metadata fields used by the dashboard, including matching state code and
  two-digit string FIPS. A shared geography CDN failure fails the run without
  creating alerts against individual state repositories.
- Published CSV SHA-256 values against the fingerprints stored at registration.

The browser and monitor use the same URL resolver (`src/data/registry.js`). A
legacy string URL uses `<base_url>/data/`; an object uses `dataset_path` (`data/`
or `.` for files at the base URL). `meta.json` must be alongside the CSVs.

## Hash policy and reverification

Registration records `data_sha256`, keyed by `state.csv`, `counties.csv`, and
`schools.csv`, from the validated UTF-8 contents at `source_commit_sha`. The
monitor hashes the published contents on every run and **always** validates the
schema, even when hashes match. It never updates the trusted baseline itself.

A changed hash means **needs reverification**, not necessarily bad estimates.
An intentional model update, row reordering, or line-ending change also changes
the hash. Deploy the intended bundle, rerun **Register State Repository** with
the same state and repository URL, and have an administrator review and merge
the PR that refreshes the hashes. The workflow permits reverifying the same
repository ID but refuses to substitute a different repository. It preserves
an existing deployment base URL.

Legacy entries without fingerprints still get availability and schema checks,
with an explicit warning that drift detection is unavailable. Re-register a
conventional GitHub Pages repository to migrate it. For a legacy custom domain,
an administrator must first add its `repository_url`; the monitor does not guess
which GitHub repository owns a custom domain.

These checks establish data integrity and compatibility, not scientific
correctness or a maximum data age. There is no required reporting-date field
or freshness SLA in the current schema, so old but unchanged conforming data is
not rejected based on age. Aggregate model estimates are not required to equal
arithmetic averages of their published children. This is not a screenshot test;
CSS and unrelated application regressions remain covered by UI testing.

## CI and notifications

`.github/workflows/check-state-data.yml` runs every six hours, on manual
dispatch, and for relevant PRs and pushes to `main`/`dev`. GitHub scheduled runs
use the repository's default branch; merge the workflow there to enable them.
Each run uploads the JSON report for 14 days and writes a job summary.

PR/push validation is read-only. Scheduled runs and manual runs **on the default
branch** create an issue in each failing state's repository. The reporter
rechecks the repository ID, searches all pages of open issues, and creates at
most one open alert per dashboard/state. Repeated failures do not add comments
or duplicate open issues. After fixing and reverifying the data, rerun the check
and close the issue when it passes. Closing an unresolved issue allows the next
failing check to open a new alert.

An alert includes validation errors, the Actions run/report link, and repair
and registration instructions. A missing credential, inaccessible repository,
disabled issues, or a denied write fails notification explicitly; the validation
report remains available in Actions. An ID mismatch never sends an issue to a
replacement repository. A successful notification does not make failing
validation pass.

### Central administrator setup

1. Add the repository secret **`STATE_DATA_ISSUES_TOKEN`** in the dashboard
   repository. Use a fine-grained token with access to the participating state
   repositories and **Issues: read and write** (metadata read access is included).
   Keep it current as states are added. A GitHub App installation token with the
   same access also works, but must be minted/refreshed by your own workflow.
   The built-in `GITHUB_TOKEN` cannot write issues in other repositories. See
   [GitHub's token permissions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication)
   and [issue API permissions](https://docs.github.com/en/rest/issues/issues#create-an-issue).
2. Enable issues in each state repository. No state-side workflow or secret is
   needed. Repository administrators must grant the central credential access.
3. If the dashboard uses a custom domain, set the repository variable
   **`DASHBOARD_ORIGIN`** to its origin, such as `https://dashboard.example.org`.
   Otherwise the check uses `https://<dashboard-owner>.github.io`.
4. Run **Check State Data** on the default branch and inspect its report.

The reporting credential is available only to the reporting step of trusted
runs. Fork PRs cannot access it or open issues. Public endpoint fetches never
receive GitHub credentials, and no state repository code is executed.

For a read-only local check:

```sh
npm run check-state-data
```

Optionally provide `GITHUB_TOKEN` to avoid low anonymous GitHub API rate limits,
and `DASHBOARD_ORIGIN` for a custom domain. The separate
`npm run check-state-data -- --report-issues` command consumes the saved report
and writes issues using `STATE_DATA_ISSUES_TOKEN`; normal local checks never
write issues. Unit tests mock both endpoints and GitHub, so tests send no alerts.
