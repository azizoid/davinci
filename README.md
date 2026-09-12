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
4. Compact transcript and observation view for the editorial planner.
5. Structured content selection for hook, context, main points, redundancy, tangents, and conclusion.
6. Safe filler, repetition, and pause cleanup within selected content.
7. A frame-aware Resolve operation plan and FCPXML timeline file.
8. Captions and private execution artifacts.

The editorial planner uses a hosted text model. Only transcript text, timestamps, and observations are sent to it; the raw video stays local.

## Run The Test

This is a manual test run of the current CLI slice. The control panel and one-button UI are not implemented yet.

### Prerequisites

- macOS with DaVinci Resolve installed
- Regular DaVinci Resolve with FCPXML timeline import
- Docker Desktop running
- An ElevenLabs API key with Speech to Text access
- An OpenAI API key with Responses API access for editorial planning
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
OPENAI_API_KEY=your_openai_key
WORKSPACE_RIGHTS_ATTESTED=true
```

These values already have defaults and normally do not need to be changed:

```env
TRANSCRIBER=elevenlabs
LANGUAGE_CODE=
EDITOR_PROVIDER=openai
EDITOR_MODEL=gpt-5.6
RESOLVE_BRIDGE_URL=http://host.docker.internal:8787
```

Set `LANGUAGE_CODE=eng` when the recording is English, or use the appropriate ISO language code for another known language.

`WORKSPACE_RIGHTS_ATTESTED=true` means you confirmed that you have permission to process the supplied media. Never commit `.env` or put the API key in source control.

Place exactly one source video in:

```text
work/inbox/<your-video>.mov
```

The source is copied unchanged into `projects/<video-slug>/raw/` before processing.

### Run The Free-Compatible Pipeline

The default `RESOLVE_MODE=fcpxml` does not require external scripting, Resolve Studio, or a host bridge. It creates a timeline file that regular Resolve can import.

From the repository root:

```sh
docker compose build
docker compose run --rm editor edit
```

The command prints the exact FCPXML path. Open Resolve and import that file with **File > Import Timeline > FCPXML**. Resolve will create the edited timeline from the generated source ranges. You can then inspect and render it in the normal Resolve UI.

For a specific source:

```sh
docker compose run --rm editor edit --source /workspace/work/inbox/your-video.mov
```

The result is written to `projects/<video-slug>/resolve/timeline.fcpxml`.

### Optional Studio Bridge

The native bridge remains available as an optional `RESOLVE_MODE=bridge` path for a Resolve installation with external scripting. It is not required for regular Resolve and is not used by the default test.

Open Resolve, enable **System > General > External scripting > Local**, and leave Resolve running. Start the bridge:

```sh
HOST_PROJECT_ROOT="$PWD" \
  "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Applications/ResolvePython" \
  host/resolve_bridge.py
```

Then run:

```sh
docker compose run --rm -e RESOLVE_MODE=bridge editor edit
```

The current profile performs no B-roll, music, graphics, or external media selection. It selects the strongest coherent dialogue content, applies safe cleanup, and exports a timeline for Resolve to import.

Common hesitation tokens such as `uh`, `um`, `erm`, and `hmm` are removed automatically, along with an immediately preceding search pause. Expressive vocalizations such as `ah` and `agh` are preserved so they do not become accidental jump cuts. The current Free Resolve profile also removes clear repetitions and long pauses.

### Outputs

For a source named `your-video.mov`, outputs are written under:

```text
projects/your-video/
|-- raw/your-video.mov
|-- final.mp4
|-- captions.srt
|-- project.json
|-- resolve/timeline.fcpxml
`-- .work/<job-id>/
    |-- analysis/editorial-view.md
    |-- plan/editorial-plan.json
    `-- resolve/
```

The `.work/` directory contains private transcript, observation, decision, operation-plan, QC, and Resolve execution artifacts.

### Dry Run

To test probing, audio extraction, artifact generation, and planning without ElevenLabs or Resolve, use the fixture transcript:

```sh
docker compose run --rm \
  -e WORKSPACE_RIGHTS_ATTESTED=true \
  -e TRANSCRIBER=mock \
  -e EDITOR_PROVIDER=heuristic \
  editor edit \
  --source /workspace/work/inbox/your-video.mov \
  --dry-run \
  --mock-transcript /workspace/tests/fixtures/mock-transcript.json
```

The dry run does not create a Resolve project or render a video.

### Troubleshooting

- `ELEVENLABS_API_KEY is required`: check `.env` and rerun Compose from the repository root.
- `OPENAI_API_KEY is required`: add the editorial-model key to `.env`; the normal run cannot apply content-selection rules without it.
- `No supported video found`: place one `.mp4`, `.mov`, `.m4v`, `.mkv`, or `.avi` file in `work/inbox/`.
- `More than one video`: use `--source` with the container path `/workspace/work/inbox/<file>`.
- `Could not connect to DaVinci Resolve`: this only applies to `RESOLVE_MODE=bridge`; use the default `fcpxml` mode with regular Resolve.
- `FCPXML import cannot find media`: confirm the project was run with the repository at `/Users/azizoid/apps/davinchi-edit`, or set `HOST_PROJECT_ROOT` to the repository's absolute macOS path before running Docker.
- The default path uses a Free-compatible FCPXML handoff. The direct native Resolve bridge is optional and remains a separate integration path.

## Directories

- `specs/`: product requirements, editorial policy, workflow, architecture decisions, and unresolved questions.
- `src/`: containerized intake, probing, transcription, observation, planning, and Resolve bridge client code.
- `host/`: native macOS Resolve scripting bridge.
- `projects/`: per-video source copies, deliverables, and private working artifacts.
- `work/inbox/`: drop location for source recordings and optional sidecar instructions.
- `tests/`: planner and artifact tests.

Start with [`specs/README.md`](specs/README.md).
