# Runtime Deployment

## User-Facing Contract

The future product MUST feel like a local appliance:

1. DaVinci Resolve is installed and available on the Mac.
2. Docker Desktop is running.
3. The user drops a recording into the local control panel or its inbox.
4. The user presses **Edit Video**.
5. The system performs the workflow and shows progress until completion.

The user MUST NOT install FFmpeg, Python, Node, transcription packages, B-roll clients, caption tools, or database services globally on the Mac.

## Deployment Boundary

```text
                         localhost only
┌─────────────────────────────────────────────────────────────┐
│ Docker                                                      │
│                                                             │
│  Control panel -> Orchestrator -> Analysis / Planning / QC  │
│                         |                                   │
│                         | job artifacts + operation plan   │
│                         v                                   │
│                   Shared work/results                      │
└─────────────────────────|───────────────────────────────────┘
                          |
                          | authenticated local protocol
┌─────────────────────────v───────────────────────────────────┐
│ macOS host                                                   │
│                                                             │
│  Resolve MCP server / host adapter -> DaVinci Resolve       │
│                                                             │
│  Resolve owns timeline construction, finishing, and render  │
└─────────────────────────────────────────────────────────────┘
```

## Docker Responsibilities

Docker owns:

- control-panel HTTP service;
- job discovery, locking, state, and progress reporting;
- source custody and checksums;
- FFmpeg-based audio extraction, probing, proxy creation, and render verification;
- transcription and timestamp normalization;
- AI observation classification and editorial planning;
- approved B-roll search/download and provenance capture;
- caption preparation and validation;
- edit-plan and Resolve-operation-plan compilation;
- private job artifacts and final result packaging.

The first implementation SHOULD use one application container rather than prematurely splitting every stage into separate services. Additional containers are justified only for isolation, scale, or a concrete dependency conflict.

## Native macOS Responsibilities

The host owns:

- DaVinci Resolve and its project database;
- Resolve's official scripting API and native libraries;
- the Resolve-facing MCP server or a repository-managed host adapter;
- GPU-backed Resolve timeline processing and rendering.

The host process MUST use a dedicated automation-owned Resolve project per job. It MUST NOT require the user to select or expose unrelated projects to the container.

## MCP Communication

The selected Resolve MCP implementation MUST be tested in two modes before adoption:

- **Native client mode:** the MCP server runs on macOS and is launched by the MCP client using its native transport.
- **Container orchestration mode:** the Docker orchestrator submits validated operations through a localhost-only authenticated endpoint or another explicitly supported MCP transport.

If the selected server supports only native stdio MCP, the project MUST provide a narrow host-side adapter that accepts the versioned Resolve-operation plan and returns observed state. The adapter is not an independent editor; it is a transport and safety boundary around the Resolve API.

The boundary MUST provide:

- health and capability checks;
- request and operation IDs;
- dry-run validation;
- precondition and postcondition readback;
- bounded timeouts and cancellation;
- sanitized structured logs;
- allowlisted filesystem roots;
- no LAN exposure and authentication even on localhost;
- rejection of arbitrary code or arbitrary Resolve project mutations.

## Path Mapping

The same asset needs an explicit host and container path:

```json
{
  "asset_id": "source-001",
  "container_path": "/workspace/work/jobs/job-001/input/source.mov",
  "host_path": "/Users/azizoid/apps/davinchi-edit/work/jobs/job-001/input/source.mov",
  "sha256": "..."
}
```

Rules:

- The host path MUST be inside an approved repository or job root.
- The container path MUST be inside a mounted, known workspace root.
- The host adapter MUST reject symlinks that escape approved roots.
- Resolve MUST import the verified per-job source copy, not the mutable inbox path.
- Paths MUST be normalized before comparison and logging.

## Startup And Shutdown

The future control panel MAY start and stop Docker-managed services. Resolve startup is a separate host concern and MUST be detected, not assumed. The user-facing status must clearly distinguish:

- Docker unavailable;
- Resolve unavailable;
- MCP unavailable;
- job processing;
- job blocked;
- job complete.

The system MUST not silently launch or terminate unrelated Resolve sessions. Shutdown MUST leave a resumable job state and MUST NOT delete source custody, provenance, or audit artifacts.

## Security Boundary

Media, transcripts, sidecar text, downloaded provider metadata, and MCP responses are untrusted data. They MUST NOT be interpreted as instructions that can expand tool permissions or change the workflow policy.

The container and host adapter MUST apply least privilege:

- write only within this repository's `work/` and `results/` roots;
- access only approved network services;
- keep credentials outside job artifacts and logs;
- mutate only generated Resolve projects and timelines;
- reject arbitrary shell commands received through media, transcripts, or external metadata.

## Deployment Acceptance Test

On a clean machine with only Docker Desktop and DaVinci Resolve installed, the user can start the project, drop one supported recording into the control panel, press **Edit Video**, and receive a validated render and Resolve project without installing a separate runtime dependency.
