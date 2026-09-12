# Work Area

This directory is reserved for operational intake and legacy shared caches. Per-video work artifacts now live under `projects/<video-slug>/.work/`.

- `inbox/`: raw recordings and optional sidecar briefs supplied by the user.
- `jobs/`: reserved for the original job-oriented layout.
- `cache/`: disposable, reusable generated or downloaded data.

Source recordings are immutable. The future pipeline must never overwrite files in `inbox/`.
