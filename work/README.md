# Work Area

This directory is reserved for operational inputs and intermediate artifacts. Nothing here is a published deliverable.

- `inbox/`: raw recordings and optional sidecar briefs supplied by the user.
- `jobs/`: isolated, resumable per-job state created by the future workflow.
- `cache/`: disposable, reusable generated or downloaded data.

Source recordings are immutable. The future pipeline must never overwrite files in `inbox/`.
