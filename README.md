# Autonomous AI Video Editing

This repository is the specification and future workspace for an autonomous talking-head video-editing system orchestrated by Codex and DaVinci Resolve through MCP.

The intended user experience is deliberately simple:

1. Open DaVinci Resolve and the local editing control panel.
2. Drop a raw recording into the panel, or place it in `work/inbox/`.
3. Press **Edit Video**.
4. Receive a completed Resolve project and render in `results/<job-id>/`.

Transcription, editorial cleanup, take selection, pacing, licensed B-roll research, visual reframing, audio cleanup, captions, timeline construction, quality checks, and rendering are all expected to happen without the user manually operating intermediate tools.

The button is the future user-facing trigger for the same autonomous workflow that can also be invoked by Codex with `edit this`. The user MUST NOT need to run transcription, FFmpeg, caption, B-roll, timeline, or rendering commands manually.

This initial structure contains specifications only. It does not implement the editing pipeline or control panel.

## Directories

- `specs/`: product requirements, editorial policy, workflow, architecture decisions, and unresolved questions.
- `work/inbox/`: drop location for source recordings and optional sidecar instructions.
- `work/jobs/`: isolated intermediate artifacts for each editing run.
- `work/cache/`: disposable, reusable machine-generated assets.
- `results/`: final renders and reviewable delivery artifacts.

Start with [`specs/README.md`](specs/README.md).
