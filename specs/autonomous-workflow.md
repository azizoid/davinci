# Autonomous Workflow

## Trigger And Completion Contract

The standard trigger is a raw recording dropped into the local control panel or placed in `work/inbox/`, followed by one press of **Edit Video**. Codex is the orchestrator. The text instruction `edit this` is an equivalent trigger for automation clients. The workflow MUST continue through all possible stages without requesting routine confirmations and MUST return either a validated result or a concise blocker with preserved resumable state.

The workflow is complete only when the final media and required reports exist in `results/<job-id>/`. Creating a transcript or Resolve timeline alone is not completion.

## Job State Model

A job moves through these durable states:

`discovered -> ingested -> analyzed -> planned -> assets_ready -> timeline_built -> validated -> rendered -> delivered`

Any state MAY transition to `blocked` or `failed`. A retry resumes from the most recent valid checkpoint. Each transition MUST be written atomically to the job manifest with timestamps and tool/version metadata.

## End-To-End Sequence

### 1. Discover And Ingest

- Identify the intended recording and any matching sidecar brief.
- Probe format, streams, duration, frame rate, resolution, sample rate, and timecode.
- Generate the job ID and manifest.
- Preserve source media unchanged and copy it into verified immutable per-job storage before analysis.
- Select the editing and delivery profile from explicit instructions or documented defaults.

### 2. Analyze

- Extract analysis-quality audio and proxy video when useful without losing source timing.
- Transcribe speech with word timings and confidence.
- Detect timestamped observations including speech, silence, fillers, hesitations, false starts, repetitions, breaths, chew or mouth noise, coughs, clicks, off-record speech, scene boundaries, faces, framing, motion, and technical defects.
- Group alternate takes and identify fillers, false starts, repetitions, corrections, and incomplete thoughts.
- Save raw analysis and observations separately from editorial conclusions.

All observation events MUST contain integer millisecond boundaries and a source reference. Frame and audio-sample coordinates MUST be added before timeline compilation; milliseconds remain the human-readable interchange timestamp.

### 3. Plan The Content Edit

- Build a source-grounded assembly of the strongest complete takes.
- Apply dialogue cleanup and pacing rules.
- Record each keep/remove/shorten/replace/review decision, source range, output range estimate, reason, confidence, and supporting observation IDs.
- Validate transcript continuity and ensure cuts do not create unsupported statements.
- Produce a reviewable decision list and edit plan before calling timeline mutation tools.

The decision pass MUST happen after observation analysis and before any cut is requested. It MUST not directly mutate Resolve.

### 4. Compile Resolve Instructions

- Convert the decision list into frame-accurate source ranges and output positions using the probed source and timeline timebases.
- Add audio-sample boundaries, handles, fades, linked audio/video behavior, punch-in instructions, B-roll slots, caption ranges, and expected postconditions.
- Assign stable operation and decision IDs so retries can reconcile an already-applied Resolve mutation instead of duplicating it.
- Validate the operation plan without changing Resolve.

### 5. Plan Enhancements

- Identify cuts that need visual coverage and moments where visuals improve comprehension.
- Plan punch-ins and reframing within source-resolution limits.
- Generate narrow B-roll queries tied to specific narration ranges.
- Select assets only from approved sources and capture license provenance.
- Define audio repair, caption, and optional graphics treatments.

### 6. Prepare Assets

- Download approved media, verify checksums and decodability, and save provenance records.
- Create required proxies, optimized media, room tone, graphics, or caption intermediates.
- Reject assets that fail legal, relevance, quality, or technical checks.
- Continue without optional assets when a safe fallback exists.

### 7. Build The Resolve Timeline Through MCP

- Confirm Resolve and the approved MCP server are reachable and compatible.
- Create or open the job project, import media, and create a named timeline.
- Apply the content edit from source time ranges in the saved edit plan.
- Add transitions, room tone, punch-ins, B-roll, audio treatment, and captions.
- Save the project and export a portable project artifact when supported.
- Record stable Resolve identifiers needed to make retries idempotent.

The orchestrator MUST verify tool results after consequential mutations. It MUST NOT assume an MCP call succeeded solely because no error was returned.

### 8. Validate

- Compare timeline duration and segment order against the edit plan.
- Check for offline media, timeline gaps, flash frames, accidental overlaps, invalid crops, missing captions, and unused required attribution.
- Check audio synchronization, clipping, loudness, and obvious processing artifacts.
- Review the full sequence using available transcript-, frame-, waveform-, and rendered-preview evidence.
- Correct detected issues and rerun relevant checks.

### 9. Render And Verify

- Configure the named delivery preset and explicit output path.
- Queue and start the Resolve render through MCP.
- Monitor to a terminal render status.
- Probe the rendered file for decodability, expected streams, duration, resolution, frame rate, audio presence, and caption mode.
- Perform spot or automated content checks on the actual render, not only the timeline.

### 10. Deliver

- Copy or link only final user-facing artifacts into `results/<job-id>/`.
- Write the edit report, provenance report, final transcript, captions, and checksums.
- Mark the manifest `delivered` only after all required files pass validation.
- Respond with the result location, a short edit summary, and any non-blocking warnings.

## Default Decision Policy

In the absence of a brief, the system MUST use a versioned default profile rather than interview the user. That profile will define output aspect ratio and resolution, caption style, audio targets, maximum crop, B-roll allowance, graphics treatment, and render codec. Values still requiring selection are tracked in [`open-questions.md`](open-questions.md).

## Escalation Policy

Ask the user only when:

- more than one input is equally plausible and cannot be safely grouped;
- speech ambiguity could materially change meaning or factual accuracy;
- use of an asset requires permission that cannot be inferred or verified;
- required credentials, Resolve, MCP connectivity, disk space, or codec support are unavailable;
- all safe render or media fallbacks have failed.

Do not ask merely to approve transcript cleanup, routine cuts, a normal punch-in, a compliant stock choice, caption timing, or standard audio correction.

## Retry And Idempotency

- A stage MUST declare its inputs, outputs, and completion checks.
- Re-running a completed stage with unchanged inputs SHOULD reuse valid artifacts.
- Partial downloads and renders MUST not be mistaken for completed output.
- Timeline operations MUST use stored project, timeline, track, clip, and marker identifiers where available.
- A destructive timeline rebuild MUST target a generated job timeline, never overwrite unrelated user timelines.
- Manual changes detected in a generated project MUST be preserved or escalated, not silently replaced.

## Failure Semantics

- **Blocker:** no legal or technically safe path to a required deliverable. Preserve state and ask one actionable question.
- **Recoverable failure:** retry automatically with bounded attempts and record each attempt.
- **Optional enhancement failure:** omit the enhancement, record a warning, and continue.
- **Quality failure:** revise the plan or timeline and revalidate before rendering or delivery.

The system MUST never label a failed or unverified render as complete.
