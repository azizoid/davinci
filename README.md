# Autonomous AI Video Editing

This repository contains the first executable slice of an autonomous talking-head video-editing system orchestrated by Node, Docker, and DaVinci Resolve.

The intended user experience is deliberately simple:

1. Open DaVinci Resolve and the local editing control panel.
2. Drop a raw recording into the panel, or place it in `work/inbox/`.
3. Press **Edit Video**.
4. Receive a completed Resolve project and render in `projects/<video-slug>/`.

Transcription, editorial cleanup, take selection, pacing, licensed B-roll research, visual reframing, audio cleanup, captions, timeline construction, quality checks, and rendering are all expected to happen without the user manually operating intermediate tools.

The current E2E slice is CLI-triggered while the control panel is still being built. It does not add B-roll, music, or graphics.

## First E2E Slice

The current implementation performs:

1. Source copy and media probing in Docker.
2. Analysis-audio extraction with FFmpeg in Docker.
3. ElevenLabs Scribe v2 transcription.
4. Safe filler, immediate repetition, and long dead-air planning.
5. A frame-aware Resolve operation plan.
6. Native Resolve project/timeline creation and rendering through the host bridge.
7. Captions and private execution artifacts.

The first run uses a deterministic planner. A separate editorial model will be added after the Resolve path is verified.

## Run The Test

This is a manual test run of the current CLI slice. The control panel and one-button UI are not implemented yet.

### Prerequisites

- macOS with DaVinci Resolve installed
- Resolve edition with external scripting available
- Docker Desktop running
- An ElevenLabs API key with Speech to Text access
- One raw video with an audio track
- Permission to process the recording

### Configure The Project

Run these commands from the repository root:

```sh
cp .env.example .env
```

Edit `.env`. You must set the API key and confirm the workspace rights attestation:

```env
ELEVENLABS_API_KEY=your_elevenlabs_key
WORKSPACE_RIGHTS_ATTESTED=true
```

These values already have defaults and normally do not need to be changed:

```env
TRANSCRIBER=elevenlabs
LANGUAGE_CODE=
RESOLVE_BRIDGE_URL=http://host.docker.internal:8787
```

Set `LANGUAGE_CODE=eng` when the recording is English, or use the appropriate ISO language code for another known language.

`WORKSPACE_RIGHTS_ATTESTED=true` means you confirmed that you have permission to process the supplied media. Never commit `.env` or put the API key in source control.

Place exactly one source video in:

```text
work/inbox/<your-video>.mov
```

The source is copied unchanged into `projects/<video-slug>/raw/` before processing.

### Configure Resolve

1. Open DaVinci Resolve and leave it running.
2. Open Resolve preferences.
3. Go to **System > General > External scripting**.
4. Set external scripting to **Local**.
5. Leave Resolve at the Project Manager or an otherwise idle project state.

Start the native bridge from a second terminal. Keep this terminal running:

```sh
HOST_PROJECT_ROOT="$PWD" \
  "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Applications/ResolvePython" \
  host/resolve_bridge.py
```

Check the bridge from a third terminal:

```sh
curl http://127.0.0.1:8787/health
```

It should return JSON with `"ok": true` and the Resolve version. If it returns `connected=false` or HTTP 503, Resolve is not running or external scripting is not enabled.

### Build And Run

From the repository root:

```sh
docker compose build
docker compose run --rm editor edit
```

To select a specific source when more than one video is present:

```sh
docker compose run --rm editor edit --source /workspace/work/inbox/your-video.mov
```

The current profile performs no B-roll, music, graphics, or external media selection. It transcribes the source, plans safe filler/repetition/dead-air removals, creates a dedicated Resolve project and timeline, renders, and exports the project.

### Outputs

For a source named `your-video.mov`, outputs are written under:

```text
projects/your-video/
|-- raw/your-video.mov
|-- final.mp4
|-- captions.srt
|-- project.json
`-- .work/<job-id>/
    |-- analysis/
    |-- plan/
    `-- resolve/
```

The `.work/` directory contains private transcript, observation, decision, operation-plan, QC, and Resolve execution artifacts.

### Dry Run

To test probing, audio extraction, artifact generation, and planning without ElevenLabs or Resolve, use the fixture transcript:

```sh
docker compose run --rm \
  -e WORKSPACE_RIGHTS_ATTESTED=true \
  -e TRANSCRIBER=mock \
  editor edit \
  --source /workspace/work/inbox/your-video.mov \
  --dry-run \
  --mock-transcript /workspace/tests/fixtures/mock-transcript.json
```

The dry run does not create a Resolve project or render a video.

### Troubleshooting

- `ELEVENLABS_API_KEY is required`: check `.env` and rebuild or rerun Compose from the repository root.
- `No supported video found`: place one `.mp4`, `.mov`, `.m4v`, `.mkv`, or `.avi` file in `work/inbox/`.
- `More than one video`: use `--source` with the container path `/workspace/work/inbox/<file>`.
- `Could not connect to DaVinci Resolve`: open Resolve, enable Local external scripting, and restart the bridge.
- `Resolve edition has no external scripting setting`: the installed edition cannot run this native bridge; use an edition that exposes Resolve external scripting.
- The first implementation uses a direct native Resolve scripting bridge. MCP transport will replace or wrap this adapter after the initial Resolve test is validated.

## Directories

- `specs/`: product requirements, editorial policy, workflow, architecture decisions, and unresolved questions.
- `src/`: containerized intake, probing, transcription, observation, planning, and Resolve bridge client code.
- `host/`: native macOS Resolve scripting bridge.
- `projects/`: per-video source copies, deliverables, and private working artifacts.
- `work/inbox/`: drop location for source recordings and optional sidecar instructions.
- `tests/`: planner and artifact tests.

Start with [`specs/README.md`](specs/README.md).
