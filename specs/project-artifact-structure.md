# Project Artifact Structure

## Principles

- Source media is immutable.
- Each job is isolated and identified by a stable `<job-id>`.
- Machine state is structured and versioned; human-readable reports summarize it.
- `work/` is operational and may be large. `results/` contains only durable user-facing outputs.
- Paths stored in manifests SHOULD be relative to the repository or job root when practical.
- Secrets MUST never be written into artifacts.

## Repository Layout

```text
.
|-- README.md
|-- specs/
|   |-- README.md
|   |-- product-specification.md
|   |-- editing-rules.md
|   |-- media-licensing-policy.md
|   |-- autonomous-workflow.md
|   |-- analysis-and-edit-plan.md
|   |-- runtime-deployment.md
|   |-- project-artifact-structure.md
|   |-- implementation-decisions.md
|   `-- open-questions.md
|-- work/
|   |-- README.md
|   |-- inbox/
|   |   `-- README.md
|   |-- jobs/
|   |   `-- README.md
|   `-- cache/
|       `-- README.md
`-- results/
    `-- README.md
```

Runtime creates the per-job directories below; they are specified now but are not part of this initial scaffold.

## Per-Job Working Layout

```text
work/jobs/<job-id>/
|-- job.json
|-- input/
|   |-- source-manifest.json
|   `-- brief.md
|-- analysis/
|   |-- media-probe.json
|   |-- audio-analysis-manifest.json
|   |-- transcript.raw.json
|   |-- transcript.normalized.json
|   |-- observations.json
|   |-- editorial-view.md
|   |-- visual-analysis.json
|   `-- quality-findings.json
|-- plan/
|   |-- edit-decision-list.json
|   |-- edit-plan.json
|   |-- resolve-operation-plan.json
|   |-- enhancement-plan.json
|   `-- caption-plan.json
|-- media/
|   |-- selected/
|   |-- rejected/
|   `-- provenance/
|-- generated/
|   |-- audio/
|   |-- captions/
|   |-- graphics/
|   `-- proxies/
|-- resolve/
|   |-- project-reference.json
|   |-- timeline-snapshot.json
|   |-- exports/
|   `-- render-jobs.json
|-- validation/
|   |-- timeline-report.json
|   |-- render-probe.json
|   `-- qc-report.json
|-- logs/
|   |-- events.jsonl
|   `-- tool-calls.jsonl
`-- temp/
```

## Required Artifact Responsibilities

- `job.json`: schema version, job ID, state, source identity, profile, stage checkpoints, timestamps, warnings, and tool versions.
- `source-manifest.json`: immutable source paths, sizes, checksums, and stream metadata.
- `brief.md`: normalized user request and inferred defaults; absence of user detail is explicitly recorded.
- `audio-analysis-manifest.json`: extracted audio properties and the verified mapping between analysis audio and source media time.
- `transcript.raw.json`: transcription provider output retained without editorial rewriting.
- `transcript.normalized.json`: corrected text, timing, confidence, speaker labels, and links to raw tokens.
- `observations.json`: timestamped machine observations. Each event MUST include an ID, `start_ms`, `end_ms`, event types, confidence, and source reference; frame/sample coordinates are added when available.
- `editorial-view.md`: compact phrase-oriented transcript for AI reasoning, with links back to source and observation IDs.
- `edit-decision-list.json`: auditable `keep`, `remove`, `shorten`, `replace_take`, and `review` decisions with reason codes, confidence, and supporting observation IDs.
- `edit-plan.json`: ordered source segments and transformations that define the intended program, using exact source frame and audio-sample ranges as execution coordinates.
- `resolve-operation-plan.json`: deterministic MCP operations, stable operation IDs, preconditions, expected postconditions, and reconciliation instructions.
- `enhancement-plan.json`: punch-ins, B-roll placements, graphics, and audio treatments tied to timeline ranges.
- `provenance/`: one record per acquired asset with source, creator, license evidence, checksum, and usage status.
- `project-reference.json`: Resolve project, timeline, track, and integration identifiers required for safe resume.
- `timeline-snapshot.json`: normalized observed timeline state used to verify MCP mutations.
- `events.jsonl`: chronological state and decision events, excluding secrets.
- `tool-calls.jsonl`: sanitized request/result metadata for external services and MCP operations.
- `qc-report.json`: machine-readable pass, warning, and failure results.

The artifact dependency order is:

```text
source-manifest
  -> audio-analysis-manifest + transcript.raw
  -> transcript.normalized + observations
  -> editorial-view
  -> edit-decision-list
  -> edit-plan
  -> resolve-operation-plan
  -> timeline-snapshot + validation + render
```

Schemas and exact field definitions will be versioned during implementation. Structured timestamps MUST identify their timebase; frame-based decisions MUST not rely on floating-point seconds alone.

## Results Layout

```text
results/<job-id>/
|-- final.mp4
|-- captions.srt
`-- checksums.txt
```

The Resolve project remains in the automation-owned Resolve project/library and is referenced by `work/jobs/<job-id>/resolve/project-reference.json`. A portable project export MAY be delivered when requested or required by the delivery profile. Detailed transcript, edit report, provenance, operation logs, and QC artifacts remain private under `work/` by default and MAY be exported explicitly.

The delivery profile MAY add variants such as vertical exports, caption-burned renders, WebVTT, thumbnails, or audio-only files. Such variants MUST be declared in the manifest and must not replace the required master without an explicit profile decision.

## Retention Classes

- **Immutable input:** original recording and its source manifest; never modified by the workflow.
- **Durable job state:** plans, provenance, reports, logs, and Resolve references needed to audit or resume.
- **Regenerable working media:** proxies, extracted audio, previews, and optimized media.
- **Disposable cache:** provider responses and deduplicated downloads that are reproducible and not the sole copy of license evidence.
- **Deliverables:** final results retained according to user policy.

The implementation MUST define cleanup behavior before deleting job data automatically.
