# Product Specification

## Product Vision

Create an autonomous editing workflow for raw talking-head recordings. The normal interaction MUST require only a recording and a request such as `edit this`. Codex MUST perform all intermediate operations and return a completed, reviewable video rather than asking the user to transcribe, mark cuts, find footage, build a timeline, clean audio, create captions, or render manually.

The system is an editor, not merely a macro runner. It must make bounded editorial decisions while preserving the speaker's intent and maintaining a traceable record of consequential changes.

## Primary User Story

As a creator, I open the local editing control panel, drop in a raw talking-head recording, and press **Edit Video**. The system identifies the recording, creates an editing job, determines a coherent cut, enhances it with appropriate visual and audio treatment, builds the timeline in DaVinci Resolve through MCP, validates it, renders it, and places the finished deliverables in `results/<job-id>/`. Saying `edit this` to Codex is an equivalent automation trigger, not a separate workflow.

Optional instructions MAY accompany the recording, but their absence MUST NOT prevent a normal edit. Safe defaults are part of the product.

## Goals

- Provide a zero-touch default path from raw recording to final render.
- Remove filler words, vocal hesitations, false starts, accidental repetitions, and excessive pauses without changing intended meaning.
- Select the strongest usable take when multiple attempts express the same idea.
- Produce deliberate pacing rather than mechanically removing every silence.
- Use punch-ins, cutaways, and licensed B-roll to improve clarity and conceal otherwise distracting edits.
- Improve speech intelligibility and loudness consistency while retaining natural voice quality.
- Generate accurate, readable, timed captions.
- Construct and render the final timeline in DaVinci Resolve through an MCP integration.
- Preserve provenance, edit decisions, logs, and enough state to audit or resume a job.

## Non-Goals For The Initial Implementation

- A general-purpose nonlinear editor UI.
- Unsupervised publication or upload to social platforms.
- Fabricating words, performances, events, or endorsements not present in the source.
- Cloning the speaker's voice or generating replacement speech by default.
- Circumventing source licenses, watermarks, authentication, paywalls, or platform restrictions.
- Fully automatic editing for complex narrative films, multicamera events, or music videos.

## Functional Requirements

### Intake

- The system MUST provide a single primary **Edit Video** action that starts the complete workflow for an uploaded or inbox recording.
- The control panel MUST show the current job stage and whether the job is processing, blocked, failed, or complete.
- The system MUST discover supported recordings in `work/inbox/` and unambiguously associate optional sidecar instructions.
- The system MUST create a unique, filesystem-safe job ID and preserve the original input unchanged.
- The system MUST inspect media properties and fail clearly when a file is unreadable or unsupported.
- With one obvious recording, a valid workspace rights attestation, and no brief, **Edit Video** or `edit this` MUST be sufficient to start the complete workflow.
- A missing or expired workspace rights attestation MUST block processing with one actionable setup instruction rather than silently treating the button press as legal authorization.
- If several unassociated recordings are present, the system MUST ask only the minimum question needed to identify the intended input.

### Understanding And Editorial Planning

- The system MUST extract an analysis audio stream while preserving a verifiable mapping to the original media timeline.
- The system MUST produce a timestamped transcript with word-level timing where available.
- The system MUST create an observation JSON that records timestamped events such as speech, silence, filler, hesitation, false start, repetition, breath, chew or mouth noise, cough, click, off-record speech, and uncertainty.
- Observation event boundaries MUST include integer `start_ms` and `end_ms` values. The implementation MUST also retain source frame and audio-sample coordinates whenever they can be established.
- The system MUST keep observations separate from AI editorial decisions. Detection of a filler MUST NOT itself authorize removing it.
- The AI MUST produce a separate decision list that chooses `keep`, `remove`, `shorten`, `replace_take`, or `review` for relevant source ranges.
- The system MUST compile validated decisions into a machine-readable, non-destructive, frame-aware edit plan before changing the Resolve timeline.
- Every content removal MUST remain traceable to source time ranges and an editorial reason.
- Low-confidence changes that could alter meaning MUST be retained or surfaced for review rather than guessed.

### Content Edit

- The system MUST apply the rules in [`editing-rules.md`](editing-rules.md).
- It MUST preserve factual claims, qualifications, chronology, speaker intent, and the best available natural performance.
- It MUST choose among alternate takes based on completeness, delivery, technical quality, and continuity.
- It SHOULD remove dead time aggressively enough to feel intentional, but MUST retain pauses that carry emphasis, comprehension, emotion, or edit continuity.

### Visual Edit

- The system SHOULD conceal disruptive jump cuts with source-appropriate punch-ins, reframing, or motivated cutaways.
- B-roll MUST be relevant to the adjacent narration and comply with [`media-licensing-policy.md`](media-licensing-policy.md).
- Visual effects MUST support comprehension or pacing and MUST NOT become repetitive decoration.
- The system MUST respect delivery-safe framing, resolution, and aspect ratio.

### Audio

- The system MUST prioritize intelligible, natural speech.
- It SHOULD reduce steady noise, obvious clicks, and distracting level variation without introducing audible artifacts.
- Loudness and peak targets MUST be selected from the delivery preset and recorded in the job manifest.
- Music MUST NOT be added unless the configured profile or user explicitly permits it and the asset satisfies the media policy.

### Captions

- The system MUST create captions from the final edited dialogue, not merely reuse unedited source timings.
- Captions MUST be spell-checked, synchronized, readable, and free of text removed from the final cut.
- At least one portable caption file MUST be delivered; burned-in captions depend on the output profile.

### DaVinci Resolve And Render

- Codex MUST use the approved DaVinci Resolve MCP integration to create or update the project, media pool, timeline, edits, effects, captions, and render job.
- Timeline changes MUST derive from the saved edit plan so that the external artifacts and Resolve state agree.
- The Resolve executor MUST receive a validated operation plan generated from the edit plan, rather than raw natural-language instructions.
- The workflow MUST save the editable Resolve project or an agreed portable project export when supported.
- The workflow MUST render using a named delivery preset, wait for completion, and verify that the output exists and is decodable.

### Delivery And Reporting

- The final render and captions MUST be placed under `results/<job-id>/` by default. The completed automation-owned Resolve project MUST remain available in Resolve; a portable project export MAY be placed in results when requested or required by the delivery profile. Transcripts, detailed provenance, operation logs, and internal review artifacts MUST remain private under `work/` unless explicitly requested.
- The report MUST summarize material removals, selected takes, external media, warnings, render settings, and validation outcomes.
- Intermediate files MUST remain in `work/`; only user-facing deliverables belong in `results/`.

## Autonomy Requirements

- The system MUST proceed without seeking approval for routine operations covered by these specifications.
- It MUST use documented defaults instead of asking preference questions during a normal run.
- It MAY ask a question only when required input is ambiguous, a legal or safety constraint blocks progress, credentials or infrastructure are unavailable, or a decision could materially misrepresent the speaker.
- A failed optional enhancement such as unavailable B-roll SHOULD degrade gracefully to a clean talking-head edit rather than fail the entire job.
- Jobs MUST be resumable and safe to retry without silently duplicating timeline elements or downloads.

## Quality Attributes

- **Traceable:** source ranges, edit decisions, downloaded assets, tool calls, and render settings are recorded.
- **Non-destructive:** source recordings are never overwritten.
- **Deterministic where practical:** the same inputs, profile, edit plan, and tool versions should reproduce equivalent outputs.
- **Recoverable:** completed stages are checkpointed and a failed run can continue from the last valid checkpoint.
- **Private by default:** source media and transcripts are sent only to approved services and retained according to policy.
- **Honest:** uncertain transcription or editorial meaning is not presented as certain.

## Definition Of Success

A normal single-speaker recording passes when one `edit this` request produces:

- a coherent final video with no obvious mistakes, abandoned takes, distracting fillers, or excessive dead air;
- natural pacing and intelligible, consistently leveled speech;
- accurate synchronized captions;
- relevant visual treatment with no unlicensed or untraceable media;
- a valid DaVinci Resolve timeline and successful final render;
- the final render and captions, with private audit artifacts retained in the job workspace as defined in [`project-artifact-structure.md`](project-artifact-structure.md);
- no mandatory user interaction after the initial request unless a documented blocker occurs.

The equivalent button acceptance test is: one recording is dropped into the control panel, **Edit Video** is pressed once, and the same outputs are produced without the user operating an intermediate tool.
