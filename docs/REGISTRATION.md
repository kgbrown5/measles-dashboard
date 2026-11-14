# Registering a state repository

ACCIDA state repositories are registered from the central dashboard repository.
State repositories must be public. State teams do not need to add a workflow,
secret, app credential, or private key to their repository.

## State-team submission

1. Open the central ACCIDA measles dashboard and select **Actions**.
2. Select **Register State Repository**, then **Run workflow**.
3. Enter the official two-letter USPS code (for example, `NC`) and the
   repository's HTTPS URL.
4. Wait for the workflow to validate the repository and open a pull request.

The repository must contain the prepared `measles-AA` bundle, either at the
repository root or under `data/`:

```text
state.csv
counties.csv
schools.csv
```

The three CSV headers must match the pinned dashboard schema exactly. The state
repository's `state.csv` must contain the requested state code, matching state
FIPS, state name, and at least one coverage measurement. County and school
identity values must link correctly, and all values must pass the same
constraints used by the dashboard CI. See [`measles-AA` validation
guidance](https://github.com/ACCIDDA/measles-AA/blob/main/docs/VALIDATION.md).

The workflow reads repository metadata and raw Git blobs at the default branch.
It rejects private repositories, records the immutable repository ID and source
commit SHA, and never copies the dataset into the dashboard repository.

Registration validation does not execute code from a source repository. It only
reads public repository metadata, the Git tree, and the three expected CSV
blobs. If the repository is private or inaccessible, make it public and rerun
the workflow.

## Administrator review

The workflow creates a branch and a pull request that changes
`public/data/stateRegistry.json` and marks the state ready in
`public/data/states.json`. Review the repository URL, repository ID, dataset
path, source commit SHA, SHA-256 fingerprints, row counts, and automated validation results.
Existing CI checks must pass. Merge the PR only after confirming that the
repository's public data endpoint (`base_url`) is correct. The workflow never
merges its own PR.

The registry remains the dashboard's single source of truth. Existing string
entries are still supported; new entries include the repository ID, dataset
path, source commit, version, reporting period when supplied, and dashboard
base URL.

## Future data updates

The **Check State Data** workflow checks published endpoints every six hours,
including schema, map compatibility, browser access, and SHA-256 fingerprints
against the registered CSV contents. A failure opens one issue in the affected
state repository when the central reporting credential is configured.

After an intentional data update, rerun **Register State Repository** with the
same state code and repository URL. It validates the latest default-branch
bundle and opens a PR with refreshed fingerprints. An administrator must review
and merge that PR. A different repository ID cannot replace an existing state
through this workflow. Legacy Pages entries can also be re-registered to add
fingerprints and repository identity.

The public API must serve the registered CSV contents and a valid `meta.json`
from the registered dataset path. See [Data validation](DATA_VALIDATION.md) for
the full checks, central credential setup, legacy migration, and issue recovery.
