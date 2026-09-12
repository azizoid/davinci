import test from "node:test";
import assert from "node:assert/strict";

import { buildEditPlan, buildObservations, buildSrt } from "../src/lib/plan.mjs";
import { createFcpXml } from "../src/lib/fcpxml.mjs";
import { createEditorialPlan } from "../src/lib/editor.mjs";

const probe = {
  format: { duration_s: 8 },
  video: { fps: 30, fps_expression: "30/1" },
  audio: { sample_rate: 48000 },
};

const transcript = {
  schema_version: "1.0",
  words: [
    { id: "word-1", text: "Today", start_s: 0.1, end_s: 0.5, confidence: 0.99 },
    { id: "word-2", text: "um", start_s: 0.6, end_s: 0.8, confidence: 0.99 },
    { id: "word-3", text: "we", start_s: 0.9, end_s: 1.1, confidence: 0.99 },
    { id: "word-4", text: "start", start_s: 2.5, end_s: 2.9, confidence: 0.99 },
  ],
};

test("observations mark fillers and long silence", () => {
  const observations = buildObservations(transcript, probe);
  assert.ok(observations.observations.some((item) => item.types.includes("filler")));
  assert.ok(observations.observations.some((item) => item.types.includes("silence")));
});

test("edit plan removes clear pauses and keeps source-grounded segments", () => {
  const observations = buildObservations(transcript, probe);
  const plan = buildEditPlan(transcript, observations, probe, {
    jobId: "job-001",
    projectPath: "/workspace/projects/test",
    sourcePath: "/workspace/projects/test/raw/source.mov",
    projectName: "AI Edit - test - job-001",
  });
  assert.ok(plan.decisionList.decisions.some((item) => item.action === "remove"));
  assert.ok(plan.editPlan.segments.length > 0);
  assert.equal(plan.operationPlan.segments.length, plan.editPlan.segments.length);
  assert.match(buildSrt(transcript, plan.editPlan, probe), /Today/);
  assert.doesNotMatch(buildSrt(transcript, plan.editPlan, probe), /um/);
});

test("filler vocalizations do not create automatic jump cuts", () => {
  const vocalTranscript = {
    schema_version: "1.0",
    words: [
      { id: "word-1", text: "Agh", start_s: 0.1, end_s: 0.45, confidence: 0.99 },
      { id: "word-2", text: "this", start_s: 0.6, end_s: 0.9, confidence: 0.99 },
      { id: "word-3", text: "matters", start_s: 1, end_s: 1.4, confidence: 0.99 },
    ],
  };
  const observations = buildObservations(vocalTranscript, probe);
  const plan = buildEditPlan(vocalTranscript, observations, probe, {
    jobId: "job-vocalization",
    projectPath: "/workspace/projects/test",
    sourcePath: "/workspace/projects/test/raw/source.mov",
    projectName: "AI Edit - vocalization",
  });
  assert.ok(observations.observations.some((item) => item.text === "Agh" && item.types.includes("filler")));
  assert.doesNotMatch(JSON.stringify(plan.decisionList.decisions), /non_semantic_filler/u);
  assert.equal(plan.editPlan.segments.length, 1);
  assert.match(buildSrt(vocalTranscript, plan.editPlan, probe), /Agh this matters/u);
});

test("a removable uh also removes its preceding search pause", () => {
  const hesitationTranscript = {
    schema_version: "1.0",
    words: [
      { id: "word-1", text: "Before", start_s: 0.1, end_s: 0.4, confidence: 0.99 },
      { id: "word-2", text: "uh", start_s: 1, end_s: 1.2, confidence: 0.99 },
      { id: "word-3", text: "after", start_s: 1.3, end_s: 1.7, confidence: 0.99 },
    ],
  };
  const observations = buildObservations(hesitationTranscript, probe);
  const plan = buildEditPlan(hesitationTranscript, observations, probe, {
    jobId: "job-hesitation",
    projectPath: "/workspace/projects/test",
    sourcePath: "/workspace/projects/test/raw/source.mov",
    projectName: "AI Edit - hesitation",
  });
  const fillerDecision = plan.decisionList.decisions.find((item) => item.reason_code === "non_semantic_filler");
  assert.deepEqual(fillerDecision && { start_ms: fillerDecision.start_ms, end_ms: fillerDecision.end_ms }, { start_ms: 400, end_ms: 1200 });
});

test("FCPXML uses host media paths and frame-accurate clips", () => {
  const observations = buildObservations(transcript, probe);
  const plan = buildEditPlan(transcript, observations, probe, {
    jobId: "job-001",
    projectPath: "/workspace/projects/test",
    sourcePath: "/workspace/projects/test/raw/source.mov",
    fcpxmlPath: "/workspace/projects/test/.work/job-001/resolve/timeline.fcpxml",
    projectName: "AI Edit - test",
  });
  const xml = createFcpXml(plan.editPlan, probe, {
    hostSourcePath: "/Users/test/projects/test/raw/source.mov",
    projectName: "AI Edit - test",
  });
  assert.match(xml, /version="1\.10"/u);
  assert.match(xml, /file:\/\/\/Users\/test\/projects\/test\/raw\/source\.mov/u);
  assert.match(xml, /<asset-clip /u);
  assert.match(xml, /frameDuration="1\/30s"/u);
});

test("heuristic editorial provider preserves the source and delegates only safe cleanup", async () => {
  const observations = buildObservations(transcript, probe);
  const editorial = await createEditorialPlan(transcript, observations, probe, "heuristic");
  assert.equal(editorial.provider, "heuristic");
  assert.equal(editorial.keep_ranges[0].start_ms, 0);
  assert.equal(editorial.keep_ranges[0].end_ms, 8000);
  const plan = buildEditPlan(transcript, observations, probe, {
    jobId: "job-001",
    projectPath: "/workspace/projects/test",
    sourcePath: "/workspace/projects/test/raw/source.mov",
    fcpxmlPath: "/workspace/projects/test/resolve/timeline.fcpxml",
    projectName: "AI Edit - test",
  }, editorial);
  assert.ok(plan.decisionList.editorial);
  assert.ok(plan.editPlan.segments.length > 1);
});
