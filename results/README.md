# Results

The future workflow will publish each completed edit to `results/<job-id>/` only after validating the Resolve timeline and rendered media.

A standard result includes the final render, portable captions, and checksums. The automation-owned Resolve project remains available in Resolve. Transcripts, edit reports, media provenance, QC data, and operation logs remain private under the job workspace unless explicitly requested. See [`../specs/project-artifact-structure.md`](../specs/project-artifact-structure.md).

Intermediate files and incomplete renders belong under `work/`, not here.
