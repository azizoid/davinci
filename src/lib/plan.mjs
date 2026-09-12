import { parseRational } from "./runtime.mjs";

const FILLERS = new Set(["um", "uh", "uhm", "hmm", "hm", "er", "erm", "ah", "agh"]);
const CUTTABLE_FILLERS = new Set(["um", "uh", "uhm", "hmm", "hm", "er", "erm"]);

function cleanWord(text) {
  return text.toLowerCase().replaceAll(/^[^\p{Letter}\p{Number}]+|[^\p{Letter}\p{Number}]+$/gu, "");
}

function coordinates(startMs, endMs, probe) {
  const fps = probe.video.fps;
  const sampleRate = probe.audio.sample_rate;
  return {
    start_ms: startMs,
    end_ms: endMs,
    start_frame: Math.max(0, Math.floor((startMs / 1000) * fps + 1e-7)),
    end_frame: Math.max(1, Math.ceil((endMs / 1000) * fps - 1e-7)),
    start_sample: Math.max(0, Math.floor((startMs / 1000) * sampleRate)),
    end_sample: Math.max(1, Math.ceil((endMs / 1000) * sampleRate)),
  };
}

function frameAlignIntervals(intervals, fps) {
  return intervals.map((interval) => ({
    start_ms: (Math.floor((interval.start_ms / 1000) * fps + 1e-7) * 1000) / fps,
    end_ms: (Math.ceil((interval.end_ms / 1000) * fps - 1e-7) * 1000) / fps,
  }));
}

export function buildObservations(transcript, probe) {
  const words = transcript.words;
  const observations = [];
  let observationIndex = 1;
  const nextId = () => `observation-${String(observationIndex++).padStart(6, "0")}`;

  for (const [index, word] of words.entries()) {
    const startMs = Math.round(word.start_s * 1000);
    const endMs = Math.max(startMs + 1, Math.round(word.end_s * 1000));
    const normalized = cleanWord(word.text);
    const types = ["speech"];
    if (FILLERS.has(normalized)) types.push("filler", "hesitation");

    observations.push({
      id: nextId(),
      ...coordinates(startMs, endMs, probe),
      types,
      text: word.text,
      confidence: word.confidence,
      evidence: [word.id],
    });

    const nextWord = words[index + 1];
    if (!nextWord) continue;
    const gapStart = endMs;
    const gapEnd = Math.round(nextWord.start_s * 1000);
    if (gapEnd - gapStart >= 500) {
      observations.push({
        id: nextId(),
        ...coordinates(gapStart, gapEnd, probe),
        types: ["silence"],
        text: null,
        confidence: 1,
        evidence: [word.id, nextWord.id],
      });
    }

    if (cleanWord(word.text) === cleanWord(nextWord.text) && normalized.length > 1) {
      const repeatStart = Math.round(nextWord.start_s * 1000);
      const repeatEnd = Math.max(repeatStart + 1, Math.round(nextWord.end_s * 1000));
      observations.push({
        id: nextId(),
        ...coordinates(repeatStart, repeatEnd, probe),
        types: ["repetition"],
        text: nextWord.text,
        confidence: 0.8,
        evidence: [word.id, nextWord.id],
      });
    }
  }

  return {
    schema_version: "1.0",
    source_id: "source-001",
    timebase: {
      timestamp_unit: "milliseconds",
      interval_semantics: "half_open",
      source_video_fps: probe.video.fps_expression,
      source_audio_sample_rate: probe.audio.sample_rate,
    },
    observations,
  };
}

function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a.start_ms - b.start_ms);
  const merged = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (previous && interval.start_ms <= previous.end_ms) {
      previous.end_ms = Math.max(previous.end_ms, interval.end_ms);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function subtractIntervals(baseIntervals, removalIntervals) {
  const removals = mergeIntervals(removalIntervals);
  const result = [];
  for (const base of baseIntervals) {
    let cursor = base.start_ms;
    for (const removal of removals) {
      if (removal.end_ms <= cursor || removal.start_ms >= base.end_ms) continue;
      const start = Math.max(cursor, base.start_ms);
      const end = Math.min(removal.start_ms, base.end_ms);
      if (end > start) result.push({ start_ms: start, end_ms: end });
      cursor = Math.max(cursor, removal.end_ms);
      if (cursor >= base.end_ms) break;
    }
    if (cursor < base.end_ms) result.push({ start_ms: cursor, end_ms: base.end_ms });
  }
  return result;
}

function complementIntervals(keptIntervals, durationMs) {
  const result = [];
  let cursor = 0;
  for (const kept of mergeIntervals(keptIntervals)) {
    if (kept.start_ms > cursor) result.push({ start_ms: cursor, end_ms: kept.start_ms });
    cursor = Math.max(cursor, kept.end_ms);
  }
  if (cursor < durationMs) result.push({ start_ms: cursor, end_ms: durationMs });
  return result;
}

function buildRemovalDecisions(observations, durationMs) {
  const decisions = [];
  const intervals = [];
  for (const [index, observation] of observations.entries()) {
    const [type] = observation.types.filter((value) => value !== "speech");
    if (type === "filler") {
      const normalized = cleanWord(observation.text || "");
      if (!CUTTABLE_FILLERS.has(normalized)) continue;
      const previousSpeech = observations
        .slice(0, index)
        .reverse()
        .find((candidate) => candidate.types.includes("speech"));
      const pauseStart = previousSpeech?.end_ms ?? observation.start_ms;
      const startsAfterPause = pauseStart < observation.start_ms;
      const startMs = startsAfterPause ? pauseStart : observation.start_ms;
      const pauseObservationIds = observations
        .slice(0, index)
        .filter((candidate) => candidate.types.includes("silence") && candidate.start_ms >= pauseStart && candidate.end_ms <= observation.start_ms)
        .map((candidate) => candidate.id);
      decisions.push({
        id: `decision-${String(decisions.length + 1).padStart(6, "0")}`,
        source_id: "source-001",
        start_ms: startMs,
        end_ms: observation.end_ms,
        action: "remove",
        reason_code: "non_semantic_filler",
        reason: startsAfterPause
          ? "Remove a requested hesitation token and its preceding search pause without changing the sentence meaning."
          : "Remove a requested non-semantic hesitation token without changing the sentence meaning.",
        confidence: observation.confidence ?? 0.8,
        observation_ids: startsAfterPause ? [...pauseObservationIds, observation.id] : [observation.id],
      });
      intervals.push({ start_ms: startMs, end_ms: observation.end_ms });
      continue;
    }

    if (type === "repetition") {
      decisions.push({
        id: `decision-${String(decisions.length + 1).padStart(6, "0")}`,
        source_id: "source-001",
        start_ms: observation.start_ms,
        end_ms: observation.end_ms,
        action: "remove",
        reason_code: "accidental_repetition",
        reason: "Remove an immediately repeated word when the repetition is not semantic.",
        confidence: observation.confidence ?? 0.8,
        observation_ids: [observation.id],
      });
      intervals.push({ start_ms: observation.start_ms, end_ms: observation.end_ms });
    }

    if (type === "silence" && observation.end_ms - observation.start_ms >= 1200) {
      const keepAroundCutMs = 350;
      const start = observation.start_ms + keepAroundCutMs;
      const end = observation.end_ms - keepAroundCutMs;
      if (end > start) {
        decisions.push({
          id: `decision-${String(decisions.length + 1).padStart(6, "0")}`,
          source_id: "source-001",
          start_ms: start,
          end_ms: end,
          action: "remove",
          reason_code: "excessive_dead_air",
          reason: "Shorten a long pause while retaining natural entry and exit cadence.",
          confidence: 0.85,
          observation_ids: [observation.id],
        });
        intervals.push({ start_ms: start, end_ms: end });
      }
    }
  }
  return { decisions, intervals: mergeIntervals(intervals), durationMs };
}

export function buildEditPlan(transcript, observations, probe, identifiers, editorialPlan = null) {
  const durationMs = Math.ceil(probe.format.duration_s * 1000);
  const heuristic = buildRemovalDecisions(observations.observations, durationMs);
  const frameSafeHeuristicIntervals = frameAlignIntervals(heuristic.intervals, probe.video.fps);
  let decisions = heuristic.decisions;
  let intervals = frameSafeHeuristicIntervals;
  let sourceRanges;
  let editorialMetadata = null;

  if (editorialPlan) {
    if (editorialPlan.review_ranges?.length) {
      throw new Error("Editorial planner returned review ranges that could change meaning; no publishable timeline was created.");
    }
    const keepRanges = mergeIntervals(editorialPlan.keep_ranges);
    const explicitRemovals = editorialPlan.remove_ranges || [];
    const frameSafeExplicitRemovals = frameAlignIntervals(explicitRemovals, probe.video.fps);
    const omittedRanges = complementIntervals(keepRanges, durationMs);
    const omittedDecisions = omittedRanges.map((range, index) => ({
      id: `decision-editorial-omission-${String(index + 1).padStart(6, "0")}`,
      source_id: "source-001",
      ...range,
      action: "remove",
      reason_code: "editorial_not_selected",
      reason: "Omit a source range that does not advance the strongest coherent narrative.",
      confidence: 0.8,
      observation_ids: [],
    }));
    const explicitDecisions = explicitRemovals.map((range, index) => ({
      id: `decision-editorial-remove-${String(index + 1).padStart(6, "0")}`,
      source_id: "source-001",
      ...range,
      action: "remove",
      reason_code: "editorial_content_cleanup",
      observation_ids: range.phrase_ids || [],
    }));
    const safeDecisions = heuristic.decisions.filter((decision) =>
      keepRanges.some((range) => decision.start_ms < range.end_ms && decision.end_ms > range.start_ms),
    );
    decisions = [...omittedDecisions, ...explicitDecisions, ...safeDecisions];
    intervals = mergeIntervals([
      ...omittedRanges,
      ...frameSafeExplicitRemovals,
      ...frameSafeHeuristicIntervals,
    ]);
    sourceRanges = subtractIntervals(keepRanges, [...frameSafeExplicitRemovals, ...frameSafeHeuristicIntervals]);
    editorialMetadata = {
      summary: editorialPlan.summary,
      warnings: editorialPlan.warnings,
      provider: editorialPlan.provider,
      model: editorialPlan.model,
    };
  } else {
    sourceRanges = complementIntervals(intervals, durationMs);
  }

  const segments = sourceRanges
    .map((range, index) => {
      const coords = coordinates(range.start_ms, range.end_ms, probe);
      return {
        segment_id: `segment-${String(index + 1).padStart(6, "0")}`,
        decision_id: "decision-keep-source-range",
        source_id: "source-001",
        source_start_frame: coords.start_frame,
        source_end_frame: coords.end_frame,
        source_start_ms: coords.start_ms,
        source_end_ms: coords.end_ms,
        audio_start_sample: coords.start_sample,
        audio_end_sample: coords.end_sample,
        timeline_start_frame: sourceRanges
          .slice(0, index)
          .reduce((sum, previous) => sum + coordinates(previous.start_ms, previous.end_ms, probe).end_frame - coordinates(previous.start_ms, previous.end_ms, probe).start_frame, 0),
        role: "dialogue",
      };
    })
    .filter((segment) => segment.source_end_frame > segment.source_start_frame);

  const decisionsWithKeep = [
    {
      id: "decision-keep-source-range",
      source_id: "source-001",
      action: "keep",
      reason_code: "source_grounded_assembly",
      reason: "Keep all source ranges not selected for safe cleanup.",
      confidence: 1,
      observation_ids: [],
    },
    ...decisions,
  ];

  const projectPath = identifiers.projectPath;
  const outputPath = `${projectPath}/final.mp4`;
  const projectExportPath = `${projectPath}/.work/resolve/${identifiers.projectName}.drp`;
  const sourcePath = identifiers.sourcePath;

  return {
    decisionList: {
      schema_version: "1.0",
      decision_pass_id: identifiers.jobId,
      profile: "no-broll-v1",
      decisions: decisionsWithKeep,
      editorial: editorialMetadata,
    },
    editPlan: {
      schema_version: "1.0",
      plan_id: identifiers.jobId,
      source_timebase: probe.video.fps_expression,
      timeline_timebase: probe.video.fps_expression,
      segments,
      omitted_enhancements: ["broll", "music", "graphics"],
    },
    operationPlan: {
      schema_version: "1.0",
      plan_id: identifiers.jobId,
      target: {
        project_name: identifiers.projectName,
        timeline_name: `${identifiers.projectName}-timeline`,
        source_path: sourcePath,
        output_path: outputPath,
        project_export_path: projectExportPath,
        fcpxml_path: identifiers.fcpxmlPath,
      },
      operations: [
        { id: "op-create-project", type: "create_project" },
        { id: "op-import-source", type: "import_source", source_path: sourcePath },
        { id: "op-create-timeline", type: "create_timeline", timeline_name: `${identifiers.projectName}-timeline` },
        ...segments.map((segment) => ({
          id: `op-append-${segment.segment_id}`,
          type: "append_source_range",
          segment_id: segment.segment_id,
          source_start_frame: segment.source_start_frame,
          source_end_frame: segment.source_end_frame,
          timeline_start_frame: segment.timeline_start_frame,
        })),
        { id: "op-render", type: "render", output_path: outputPath },
        { id: "op-export-project", type: "export_project", output_path: projectExportPath },
        { id: "op-export-fcpxml", type: "export_fcpxml", output_path: identifiers.fcpxmlPath },
      ],
      preconditions: ["Resolve is running", "external scripting is enabled", "source media is readable"],
      expected_postconditions: ["dedicated project exists", "timeline matches edit plan", "render is decodable"],
      segments,
    },
    keptWords: transcript.words,
    removedIntervals: intervals,
  };
}

function sourceToTimelineMs(ms, segments, probe, boundary = "start") {
  const fps = probe.video.fps;
  const sourceFrame = boundary === "end"
    ? Math.ceil((ms / 1000) * fps - 1e-7)
    : Math.floor((ms / 1000) * fps + 1e-7);
  const segment = segments.find(
    (candidate) => sourceFrame >= candidate.source_start_frame && sourceFrame < candidate.source_end_frame,
  );
  if (!segment && boundary === "end") {
    const previous = segments.find((candidate) => candidate.source_end_frame === sourceFrame);
    if (previous) return ((previous.timeline_start_frame + previous.source_end_frame - previous.source_start_frame) / fps) * 1000;
  }
  if (!segment) return null;
  const timelineFrame = segment.timeline_start_frame + (sourceFrame - segment.source_start_frame);
  return (timelineFrame / fps) * 1000;
}

export function buildSrt(transcript, editPlan, probe) {
  const cues = [];
  let current = [];
  let currentStart = null;
  let currentEnd = null;
  const flush = () => {
    if (!current.length || currentStart === null || currentEnd === null) return;
    cues.push({ start: currentStart, end: currentEnd, text: current.join(" ") });
    current = [];
    currentStart = null;
    currentEnd = null;
  };

  for (const word of transcript.words) {
    const start = sourceToTimelineMs(word.start_s * 1000, editPlan.segments, probe);
    const end = sourceToTimelineMs(word.end_s * 1000, editPlan.segments, probe, "end");
    if (start === null || end === null) {
      flush();
      continue;
    }
    if (current.length && (start - currentEnd > 700 || current.length >= 8)) flush();
    if (currentStart === null) currentStart = start;
    currentEnd = end;
    current.push(word.text.trim());
    if (/[.!?]$/u.test(word.text.trim())) flush();
  }
  flush();

  const formatTime = (milliseconds) => {
    const totalMs = Math.max(0, Math.round(milliseconds));
    const hours = Math.floor(totalMs / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1000);
    const ms = totalMs % 1000;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
  };

  return cues
    .map((cue, index) => `${index + 1}\n${formatTime(cue.start)} --> ${formatTime(cue.end)}\n${cue.text}\n`)
    .join("\n");
}
