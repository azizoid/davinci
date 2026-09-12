import test from "node:test";
import assert from "node:assert/strict";

import { buildEditPlan, buildObservations, buildSrt } from "../src/lib/plan.mjs";

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

test("edit plan removes safe events and keeps source-grounded segments", () => {
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
