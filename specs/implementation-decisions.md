# Implementation Decisions

This file records decisions that constrain future implementation. New decisions should include a date, rationale, and consequences.

## ID-001: Specification-First Scaffold

- **Status:** Accepted
- **Decision:** The initial repository contains documentation and runtime directory placeholders only. No editing pipeline is implemented yet.
- **Rationale:** Product, editorial, legal, and autonomy boundaries must be explicit before tool-specific code is selected.
- **Consequences:** Current acceptance is based on document completeness and consistency, not executable behavior.

## ID-002: Codex Is The Autonomous Orchestrator

- **Status:** Accepted
- **Decision:** Codex owns workflow progression, tool selection, checkpointing, validation, recovery, and final user communication.
- **Rationale:** The target interaction is one recording plus `edit this`; exposing a chain of manual tools would violate the product goal.
- **Consequences:** Tool adapters must return structured, verifiable results. Routine stage boundaries do not require user approval.

## ID-003: DaVinci Resolve Is The Finishing And Render Authority

- **Status:** Accepted
- **Decision:** The final editable timeline, finishing operations, and render are performed in DaVinci Resolve through an approved MCP server.
- **Rationale:** Resolve provides a professional timeline, audio, caption, color, and delivery environment while MCP enables controlled automation.
- **Consequences:** The workflow must verify MCP mutations, retain stable Resolve references, handle application availability, and avoid modifying unrelated projects or timelines.

## ID-004: Artifact-Driven, Resumable Jobs

- **Status:** Accepted
- **Decision:** Every run creates a per-job workspace with a manifest and durable artifacts for each stage.
- **Rationale:** Video workflows are long-running and involve unreliable external tools. Explicit artifacts enable audit, retry, review, and debugging.
- **Consequences:** Stages must have versioned inputs, outputs, state transitions, and completion checks. In-memory state alone is insufficient.

## ID-005: Declarative Edit Plan Before Timeline Mutation

- **Status:** Accepted
- **Decision:** Content and enhancement decisions are serialized before Resolve timeline construction.
- **Rationale:** Separating editorial reasoning from tool operations makes decisions inspectable and prevents the Resolve timeline from becoming the only record of intent.
- **Consequences:** Timeline builders consume a plan; validation compares observed Resolve state and final output back to that plan.

## ID-006: Non-Destructive Source-Time Editing

- **Status:** Accepted
- **Decision:** All edits refer to immutable source media and explicit source time ranges.
- **Rationale:** Source-grounded edits are reversible, reproducible, and less likely to alter meaning accidentally.
- **Consequences:** Timebase and frame-rate handling are first-class concerns. The source recording is never overwritten.

## ID-007: Policy-Gated External Media

- **Status:** Accepted
- **Decision:** External footage, audio, graphics, fonts, and generated assets may enter a timeline only through an allowlisted acquisition path with provenance.
- **Rationale:** Autonomous selection increases legal and reputational risk unless every asset is traceable.
- **Consequences:** Failure to verify an optional asset results in rejection and fallback, not policy bypass.

## ID-008: Safe Defaults With Minimal Escalation

- **Status:** Accepted
- **Decision:** A versioned editing profile supplies routine creative and technical choices. The system asks questions only for documented blockers or material ambiguity.
- **Rationale:** Preference interviews contradict the `edit this` product promise.
- **Consequences:** Defaults must be quality-tested and reported. Unresolved default values are implementation questions, not reasons to weaken autonomy.

## ID-009: Validation Uses Observed Outputs

- **Status:** Accepted
- **Decision:** Success is determined by inspecting timeline state and the rendered file, not by trusting planned operations or successful tool responses.
- **Rationale:** MCP, Resolve, codecs, and media can fail partially or silently.
- **Consequences:** Render probing and quality checks are mandatory before delivery; `render started` is never equivalent to `delivered`.

## ID-010: Graceful Degradation For Optional Enhancements

- **Status:** Accepted
- **Decision:** B-roll, music, and nonessential graphics may be omitted when unavailable or unsafe, while core content, audio, captions, timeline, and render remain required.
- **Rationale:** A polished clean talking-head edit is preferable to a blocked run or an unlicensed asset.
- **Consequences:** Reports must disclose omitted enhancements and fallback behavior.

## ID-011: One-Button Local Control Panel

- **Status:** Accepted
- **Decision:** The primary user interaction is a local control panel with one **Edit Video** action. The panel accepts a dropped recording or observes `work/inbox/` and reports job progress.
- **Rationale:** The product goal is a completed edit without the user operating intermediate tools. `edit this` remains an equivalent Codex trigger.
- **Consequences:** The control panel is an orchestration trigger and status view, not an editing UI. It must not expose routine transcription, cutting, or rendering steps as required manual actions.

## ID-012: Observation Before Editorial Decision

- **Status:** Accepted
- **Decision:** Analysis first produces timestamped observations; a separate AI decision pass determines what to keep, remove, shorten, replace, or review.
- **Rationale:** A detected filler, pause, chew, or false start is evidence, not an automatic instruction. Separating evidence from judgment makes the workflow auditable and safer.
- **Consequences:** No Resolve mutation may occur before `observations.json`, `edit-decision-list.json`, and a validated `edit-plan.json` exist.

## ID-013: Milliseconds For Interchange, Frames And Samples For Execution

- **Status:** Accepted
- **Decision:** Every analysis event records integer millisecond boundaries for human-readable interchange. Resolve execution uses exact source frame ranges and audio-sample coordinates derived from the probed timebases.
- **Rationale:** Milliseconds satisfy timestamp inspection and JSON interoperability, while frame/sample coordinates prevent drift and ambiguous cuts.
- **Consequences:** Source frame rate, VFR handling, timeline frame rate, audio sample rate, boundary rounding, and conversion metadata must be recorded in each job.

## ID-014: Hybrid Docker And Native Resolve Deployment

- **Status:** Accepted
- **Decision:** Analysis, AI planning, media preparation, artifact management, and output validation run in Docker. DaVinci Resolve and its native Resolve-facing MCP process run on macOS.
- **Rationale:** Resolve depends on native macOS libraries and host GPU/GUI capabilities that should not be forced into a Linux container.
- **Consequences:** The system needs a secure local communication boundary and explicit host/container path mapping. The user installs Resolve and Docker only; the project manages other runtime dependencies.

## ID-015: One-Button Default Profile

- **Status:** Accepted
- **Decision:** The initial no-brief profile is polished educational: natural but concise pacing, source-appropriate framing, relevant approved B-roll when useful, separate captions by default, and no music by default.
- **Rationale:** The button workflow needs a predictable product outcome without requiring a preference interview.
- **Consequences:** Exact codec, resolution, loudness, caption typography, crop limits, and B-roll thresholds remain profile configuration details and must be versioned.

## ID-016: Local-First Processing

- **Status:** Accepted
- **Decision:** `edit this` or **Edit Video** authorizes local processing. Cloud transcription, analysis, or media services require explicit project-level opt-in and must be allowlisted.
- **Rationale:** A local recording may contain confidential or personal material; editing authorization is not blanket cloud-upload consent.
- **Consequences:** The system needs local capability checks, a clear cloud opt-in setting, approved processor records, and a safe fallback or blocker when local processing is unavailable.

## ID-017: Workspace Rights Attestation

- **Status:** Accepted
- **Decision:** The project stores a workspace-level attestation that the user has permission to process supplied recordings and sidecar media. Each job records which attestation it used.
- **Rationale:** A one-button workflow still needs an explicit rights boundary without asking the same question for every edit.
- **Consequences:** Missing or expired attestation blocks processing; external media remains governed by its own license policy.

## ID-018: Ambiguous Meaning Blocks The Master

- **Status:** Accepted
- **Decision:** If alternate takes or transcription uncertainty could materially change meaning, the system may create a clearly labeled private review draft but MUST NOT deliver a publishable master.
- **Rationale:** A warning attached to a polished final is not sufficient protection against factual or semantic misrepresentation.
- **Consequences:** QC and editorial confidence are delivery gates, and the control panel must show a blocked state with an actionable explanation.

## ID-019: Cue Hierarchy For Conflicting Takes

- **Status:** Accepted
- **Decision:** Resolve conflicting wording using explicit correction cues first, supplied script or brief second, latest complete take third, and performance quality only after those signals.
- **Rationale:** The most polished performance is not necessarily the intended or factually current statement.
- **Consequences:** The decision list must record the cue used, competing takes, and confidence.

## ID-020: Dedicated Resolve Project Per Job

- **Status:** Accepted
- **Decision:** Automation creates and owns a dedicated Resolve project and generated timeline for each logical job. It never edits an unrelated user timeline.
- **Rationale:** Project isolation makes retries, ownership, manual-change detection, and recovery safer.
- **Consequences:** Project naming, collision handling, backups, cleanup, and host-side path access must be defined by the Resolve adapter.

## ID-021: Logical Job Resumption

- **Status:** Accepted
- **Decision:** Repeated **Edit Video** or `edit this` requests for the same source, brief, profile, and plan resume the same logical job with separate execution attempts. A deliberate re-edit creates a new plan revision.
- **Rationale:** Long renders and external tools must be retryable without producing unexplained duplicate projects or results.
- **Consequences:** Source/profile/plan fingerprints, leases, attempt IDs, and dependency invalidation are required.

## ID-022: Minimal Default Delivery

- **Status:** Accepted
- **Decision:** Default public results contain the final render and captions. Detailed transcript, provenance, operation logs, QC data, and project export remain private unless requested or required by a delivery profile.
- **Rationale:** Supporting artifacts can expose sensitive speech, local paths, licensing research, or implementation details.
- **Consequences:** The report must still exist privately, and the Resolve project must remain recoverable through the job reference.

## ID-023: Best-Effort Manual-Change Adoption

- **Status:** Accepted
- **Decision:** On resume, representable manual changes in the automation-owned Resolve project are adopted as a new baseline. Unrepresentable changes are preserved and the job blocks only when they conflict with a required planned operation.
- **Rationale:** Users should not lose useful manual work, while opaque conflicts must not be silently overwritten.
- **Consequences:** Timeline snapshots need ownership markers, fingerprints, and a plan-reconciliation result.

## ID-024: Verified Per-Job Source Custody

- **Status:** Accepted
- **Decision:** Ingest copies each source recording into immutable per-job storage, verifies its checksum, and uses that copy for all downstream processing and Resolve import.
- **Rationale:** A job must remain resumable if the inbox file is moved, renamed, or deleted.
- **Consequences:** Ingest needs sufficient disk space, atomic copy/commit behavior, checksum validation, and a retention policy for source custody.

## ID-025: Personal/Noncommercial Stock Default

- **Status:** Accepted
- **Decision:** The initial stock-media license check assumes personal/noncommercial distribution. Commercial or client distribution requires an explicit delivery context and a separate compatibility check.
- **Rationale:** License compatibility depends on intended distribution, and the initial profile should not silently claim commercial clearance.
- **Consequences:** Every job records its distribution context. External assets are rejected when their terms cannot be verified for that context.
