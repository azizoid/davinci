# Analysis And Edit Plan

This document defines the boundary between media analysis, AI editorial judgment, and DaVinci Resolve execution.

## Pipeline Boundary

The workflow MUST use these separate artifacts and responsibilities:

```text
source recording
  -> analysis audio with source mapping
  -> transcript and objective observations
  -> compact editorial reading view
  -> AI editorial decisions
  -> frame/sample-aware edit plan
  -> deterministic Resolve operation plan
  -> MCP execution and readback
```

The AI MUST decide what to keep or remove only after analysis artifacts exist. An observation is evidence, not an instruction. For example, identifying `filler` or `chew` MUST NOT automatically remove that range.

## Analysis Audio

The system SHOULD extract a normalized analysis stream such as mono PCM at 16 kHz. The normalized stream is for analysis only and MUST NOT become the editing source.

`audio-analysis-manifest.json` MUST record:

- source asset ID and checksum;
- analysis audio checksum, format, channel count, and sample rate;
- source start time and analysis start time;
- any trim, resample, channel-selection, or offset operation;
- the conversion needed to map analysis positions back to source positions.

If analysis audio begins at source time zero and has no time transformation, a sample position can be mapped directly using the recorded sample rate. Otherwise the mapping MUST be explicit and reversible within the documented precision.

## Canonical Time Coordinates

Every event and decision MUST include integer `start_ms` and `end_ms` for human-readable interchange. Intervals use half-open semantics: `[start, end)`. Therefore `end_ms` is excluded from the interval and MUST be greater than `start_ms`.

Execution MUST additionally use exact coordinates:

- video: source asset ID plus half-open source frame range `[start_frame, end_frame)`;
- audio: source asset ID plus half-open sample range `[start_sample, end_sample)`;
- timeline: half-open output frame range `[timeline_start_frame, timeline_end_frame)`;
- captions: integer milliseconds or Resolve-native caption time converted from the final timeline frame rate.

The Resolve compiler MUST convert the internal half-open frame range to the API convention required by the selected integration. The current candidate Resolve API uses an inclusive `endFrame`, so the compiler must send `end_frame - 1` and record that conversion.

The job MUST record source frame rate, timeline frame rate, timecode start, audio sample rate, VFR policy, rounding policy, and every conversion used. Milliseconds MUST NOT be converted to frames using an unrecorded default frame rate.

## Observation JSON

`observations.json` records what analysis found. Multiple types MAY overlap the same time range. The minimum event shape is:

```json
{
  "schema_version": "1.0",
  "source_id": "source-001",
  "timebase": {
    "timestamp_unit": "milliseconds",
    "interval_semantics": "half_open",
    "source_video_fps": "30000/1001",
    "source_audio_sample_rate": 48000
  },
  "observations": [
    {
      "id": "observation-001",
      "start_ms": 1240,
      "end_ms": 3680,
      "start_frame": 37,
      "end_frame": 110,
      "start_sample": 59520,
      "end_sample": 176640,
      "types": ["speech"],
      "text": "Today we are going to discuss...",
      "confidence": 0.98,
      "evidence": ["transcript-token-001"]
    },
    {
      "id": "observation-002",
      "start_ms": 3680,
      "end_ms": 4210,
      "start_frame": 110,
      "end_frame": 126,
      "start_sample": 176640,
      "end_sample": 202080,
      "types": ["filler", "hesitation"],
      "text": "um",
      "confidence": 0.96,
      "evidence": ["transcript-token-002", "audio-event-001"]
    }
  ]
}
```

Recognized observation types SHOULD include:

`speech`, `silence`, `filler`, `hesitation`, `false_start`, `repetition`, `correction`, `breath`, `chew`, `mouth_noise`, `cough`, `click`, `off_record`, `take_boundary`, `scene_boundary`, `technical_defect`, and `uncertain`.

Analysis MUST retain the raw transcript and provider response separately. Normalization may correct obvious token formatting, but it MUST preserve links back to raw tokens and MUST NOT silently turn an uncertain token into a fact.

## Editorial Decision JSON

`edit-decision-list.json` records AI judgment about observations and source material. It MUST be a separate artifact from `observations.json`.

```json
{
  "schema_version": "1.0",
  "decision_pass_id": "decision-pass-001",
  "decisions": [
    {
      "id": "decision-001",
      "source_id": "source-001",
      "start_ms": 3680,
      "end_ms": 4210,
      "action": "remove",
      "reason_code": "non_semantic_filler",
      "reason": "Remove isolated hesitation without changing the sentence cadence.",
      "confidence": 0.96,
      "observation_ids": ["observation-002"]
    },
    {
      "id": "decision-002",
      "source_id": "source-001",
      "start_ms": 4210,
      "end_ms": 6940,
      "action": "review",
      "reason_code": "meaning_uncertain",
      "reason": "Two candidate takes may express different factual claims.",
      "confidence": 0.51,
      "observation_ids": ["observation-003", "observation-004"]
    }
  ]
}
```

Allowed actions are `keep`, `remove`, `shorten`, `replace_take`, and `review`. A `review` decision that could change meaning MUST prevent a publishable master and produce a clearly labeled review draft instead.

Take selection MUST record the selected candidate, rejected candidates, semantic comparison, and confidence. Performance quality alone MUST NOT override an explicit correction, supplied script, or stronger contextual evidence.

## Frame-Aware Edit Plan

`edit-plan.json` is the program the timeline compiler intends to build. It MUST contain ordered segments with exact source coordinates and stable decision references.

```json
{
  "schema_version": "1.0",
  "plan_id": "plan-001",
  "source_timebase": "30000/1001",
  "timeline_timebase": "30000/1001",
  "segments": [
    {
      "segment_id": "segment-001",
      "decision_id": "decision-003",
      "source_id": "source-001",
      "source_start_frame": 1200,
      "source_end_frame": 2450,
      "source_start_ms": 40040,
      "source_end_ms": 81750,
      "audio_start_sample": 1921920,
      "audio_end_sample": 3920000,
      "role": "dialogue",
      "transition_handles": {
        "head_frames": 3,
        "tail_frames": 3
      }
    }
  ]
}
```

The compiler MUST reject a plan when ranges are invalid, exceed source duration, overlap incorrectly, cut through a required word, lack a resolvable source ID, or cannot be converted to the target timeline timebase without a recorded policy decision.

## Resolve Operation Plan

`resolve-operation-plan.json` is the only artifact allowed to drive timeline mutations. It MUST contain:

- target generated project and timeline identity;
- operation IDs stable across retries;
- source asset and media-pool identity expectations;
- ordered operations;
- preconditions;
- expected postconditions;
- observed result references;
- reconciliation instructions for unknown outcomes.

The planner MUST NOT issue raw natural-language cut instructions to Resolve. The executor applies this plan, reads the resulting timeline back, and records the observed state before proceeding to audio treatment, visuals, captions, or rendering.

## Invariants

- The source recording is never altered.
- Every removal maps to one or more observations and an editorial reason.
- Every output segment maps to a source range and decision ID.
- The sum of output segment durations is calculated from frame coordinates, not rounded milliseconds.
- Captions are generated from the final kept dialogue sequence.
- A plan revision invalidates dependent Resolve operations, captions, validation, and renders.
