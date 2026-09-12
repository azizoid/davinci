import { parseRational } from "./runtime.mjs";

const FILLERS = new Set(["um", "uh", "uhm", "hmm", "hm", "er", "erm", "ah"]);

function cleanWord(text) {
  return text.toLowerCase().replaceAll(/^[^\p{Letter}\p{Number}]+|[^\p{Letter}\p{Number}]+$/gu, "");
}

function coordinates(startMs, endMs, probe) {
  const fps = probe.video.fps;
  const sampleRate = probe.audio.sample_rate;
  return {
    start_ms: startMs,
    end_ms: endMs,
    start_frame: Math.max(0, Math.floor((startMs / 1000) * fps)),
    end_frame: Math.max(1, Math.ceil((endMs / 1000) * fps)),
    start_sample: Math.max(0, Math.floor((startMs / 1000) * sampleRate)),
    end_sample: Math.max(1, Math.ceil((endMs / 1000) * sampleRate)),
  };
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

function buildRemovalDecisions(observations, durationMs) {
  const decisions = [];
  const intervals = [];
  for (const observation of observations) {
    const [type] = observation.types.filter((value) => value !== "speech");
    if (type === "filler" || type === "repetition") {
      decisions.push({
        id: `decision-${String(decisions.length + 1).padStart(6, "0")}`,
        source_id: "source-001",
        start_ms: observation.start_ms,
        end_ms: observation.end_ms,
        action: "remove",
        reason_code: type === "filler" ? "non_semantic_filler" : "accidental_repetition",
        reason:
          type === "filler"
            ? "Remove an isolated hesitation without changing the sentence meaning."
            : "Remove an immediately repeated word when the repetition is not semantic.",
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

export function buildEditPlan(transcript, observations, probe, identifiers) {
  const durationMs = Math.ceil(probe.format.duration_s * 1000);
  const { decisions, intervals } = buildRemovalDecisions(observations.observations, durationMs);
  const sourceRanges = [];
  let cursor = 0;
  for (const interval of intervals) {
    if (interval.start_ms > cursor) sourceRanges.push({ start_ms: cursor, end_ms: interval.start_ms });
    cursor = Math.max(cursor, interval.end_ms);
  }
  if (cursor < durationMs) sourceRanges.push({ start_ms: cursor, end_ms: durationMs });

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
      ],
      preconditions: ["Resolve is running", "external scripting is enabled", "source media is readable"],
      expected_postconditions: ["dedicated project exists", "timeline matches edit plan", "render is decodable"],
      segments,
    },
    keptWords: transcript.words,
    removedIntervals: intervals,
  };
}

function sourceToTimelineMs(ms, segments, probe) {
  const fps = probe.video.fps;
  const sourceFrame = Math.floor((ms / 1000) * fps);
  const segment = segments.find(
    (candidate) => sourceFrame >= candidate.source_start_frame && sourceFrame < candidate.source_end_frame,
  );
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
    const end = sourceToTimelineMs(word.end_s * 1000, editPlan.segments, probe);
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
