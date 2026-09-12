import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureDir, fileExists, isoTimestamp, listFiles, loadDotEnv, sha256, slugify, writeJson } from "./lib/runtime.mjs";
import { extractAnalysisAudio, probeMedia } from "./lib/probe.mjs";
import { buildEditPlan, buildObservations, buildSrt } from "./lib/plan.mjs";
import { executeResolve } from "./lib/resolve-client.mjs";
import { normalizeTranscript, transcribeAudio } from "./lib/transcribe.mjs";

const PROJECT_ROOT = process.env.PROJECT_ROOT || resolve(fileURLToPath(new URL("..", import.meta.url)));
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".mkv", ".avi"]);

async function main() {
  await loadDotEnv(join(PROJECT_ROOT, ".env"));
  const [command, ...args] = process.argv.slice(2);
  if (command === "edit") return runEdit(args);
  if (command === "help" || !command) return printHelp();
  throw new Error(`Unknown command '${command}'.`);
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--source") options.source = args[++index];
    else if (argument === "--project") options.project = args[++index];
    else if (argument === "--transcriber") options.transcriber = args[++index];
    else if (argument === "--mock-transcript") options.mockTranscript = args[++index];
    else if (argument === "--resolve") options.resolve = args[++index];
    else throw new Error(`Unknown option '${argument}'.`);
  }
  return options;
}

async function runEdit(args) {
  const options = parseArgs(args);
  if (process.env.WORKSPACE_RIGHTS_ATTESTED !== "true") {
    throw new Error("Set WORKSPACE_RIGHTS_ATTESTED=true in .env after confirming you have permission to process this recording.");
  }

  const inbox = join(PROJECT_ROOT, "work", "inbox");
  const source = options.source ? resolve(options.source) : await discoverSource(inbox);
  if (!(await fileExists(source))) throw new Error(`Source file does not exist: ${source}`);

  const sourceHash = await sha256(source);
  const projectSlug = slugify(options.project || basename(source, extname(source)));
  const projectPath = join(PROJECT_ROOT, "projects", projectSlug);
  const jobId = `${projectSlug}-${isoTimestamp()}`;
  const jobPath = join(projectPath, ".work", jobId);
  const analysisPath = join(jobPath, "analysis");
  const planPath = join(jobPath, "plan");
  const resolvePath = join(jobPath, "resolve");
  await Promise.all([
    ensureDir(join(projectPath, "raw")),
    ensureDir(join(projectPath, "assets")),
    ensureDir(join(projectPath, "thumbnails")),
    ensureDir(join(projectPath, "shorts")),
    ensureDir(join(projectPath, "social")),
    ensureDir(analysisPath),
    ensureDir(planPath),
    ensureDir(resolvePath),
  ]);

  const sourceName = await copySource(source, projectPath, sourceHash);
  const projectSource = join(projectPath, "raw", sourceName);
  const projectName = `AI Edit - ${projectSlug} - ${jobId.slice(-14)}`;
  const jobManifest = {
    schema_version: "1.0",
    job_id: jobId,
    project_id: projectSlug,
    state: "discovered",
    source: { original_path: source, sha256: sourceHash },
    profile: "no-broll-v1",
    states: [{ state: "discovered", at: new Date().toISOString() }],
  };
  const advance = async (state) => {
    jobManifest.state = state;
    jobManifest.states.push({ state, at: new Date().toISOString() });
    await writeJson(join(jobPath, "job.json"), jobManifest);
  };
  await advance("ingested");
  await writeJson(join(projectPath, "project.json"), {
    schema_version: "1.0",
    project_id: projectSlug,
    latest_job_id: jobId,
    source: { path: `raw/${sourceName}`, sha256: sourceHash },
    profile: "no-broll-v1",
    rights_attestation: "workspace-attested",
  });

  console.log(`[${jobId}] probing source`);
  const probe = await probeMedia(projectSource);
  await writeJson(join(analysisPath, "media-probe.json"), probe);

  const analysisAudio = join(analysisPath, "audio.wav");
  console.log(`[${jobId}] extracting analysis audio`);
  await extractAnalysisAudio(projectSource, analysisAudio);

  console.log(`[${jobId}] transcribing with ${options.transcriber || process.env.TRANSCRIBER || "elevenlabs"}`);
  const rawTranscript = await transcribeAudio(analysisAudio, {
    provider: options.transcriber,
    mockPath: options.mockTranscript,
  });
  await writeJson(join(analysisPath, "transcript.raw.json"), rawTranscript);
  const transcript = normalizeTranscript(rawTranscript);
  await writeJson(join(analysisPath, "transcript.normalized.json"), transcript);

  const observations = buildObservations(transcript, probe);
  await writeJson(join(analysisPath, "observations.json"), observations);
  await advance("analyzed");
  const identifiers = {
    jobId,
    projectPath: `/workspace/projects/${projectSlug}`,
    sourcePath: `/workspace/projects/${projectSlug}/raw/${sourceName}`,
    projectName,
  };
  const plan = buildEditPlan(transcript, observations, probe, identifiers);
  await writeJson(join(planPath, "edit-decision-list.json"), plan.decisionList);
  await writeJson(join(planPath, "edit-plan.json"), plan.editPlan);
  await writeJson(join(planPath, "resolve-operation-plan.json"), plan.operationPlan);
  await writeFile(join(projectPath, "captions.srt"), buildSrt(transcript, plan.editPlan, probe), "utf8");
  await advance("planned");

  console.log(`[${jobId}] planned ${plan.editPlan.segments.length} kept segments and ${plan.decisionList.decisions.length - 1} removals`);
  if (options.dryRun) {
    console.log(`[${jobId}] dry run complete: ${jobPath}`);
    return;
  }

  const bridgeUrl = options.resolve || process.env.RESOLVE_BRIDGE_URL;
  if (!bridgeUrl) throw new Error("RESOLVE_BRIDGE_URL is required unless --dry-run is used.");
  console.log(`[${jobId}] sending operation plan to Resolve bridge`);
  const result = await executeResolve(plan.operationPlan, bridgeUrl);
  await advance("timeline_built");
  await writeJson(join(resolvePath, "timeline-snapshot.json"), result.timeline_snapshot || result);
  await writeJson(join(resolvePath, "execution-result.json"), result);
  await advance("validated");
  await advance("rendered");
  await advance("delivered");
  console.log(`[${jobId}] delivered: ${result.render_path || "Resolve execution completed"}`);
}

async function discoverSource(inbox) {
  const files = await listFiles(inbox, VIDEO_EXTENSIONS);
  if (files.length === 0) throw new Error(`No supported video found in ${inbox}.`);
  if (files.length > 1) throw new Error(`More than one video is in ${inbox}; pass --source explicitly.`);
  return files[0];
}

async function copySource(source, projectPath, sourceHash) {
  const destinationDirectory = join(projectPath, "raw");
  const originalName = basename(source);
  const originalDestination = join(destinationDirectory, originalName);
  if (await fileExists(originalDestination)) {
    if ((await sha256(originalDestination)) === sourceHash) return originalName;
    const extension = extname(originalName);
    const stem = basename(originalName, extension);
    const alternateName = `${stem}-${sourceHash.slice(0, 8)}${extension}`;
    await copyFile(source, join(destinationDirectory, alternateName));
    return alternateName;
  }
  await copyFile(source, originalDestination);
  return originalName;
}

function printHelp() {
  console.log(`Usage:\n  node src/cli.mjs edit [--source /workspace/work/inbox/video.mov] [--dry-run]\n\nThe first profile removes safe fillers, immediate repetitions, and long dead-air sections. It does not add B-roll, music, or graphics.`);
}

main().catch((error) => {
  console.error(`\nERROR: ${error.message}`);
  process.exitCode = 1;
});
