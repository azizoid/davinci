# Open Questions

These questions are intentionally unresolved. They should be answered before or during implementation and converted into implementation decisions. They do not change the product promise that normal use requires only a recording and `edit this`.

## Blocking Before Implementation

- Which DaVinci Resolve version and operating systems are supported?
- Which Resolve MCP server is approved, and what tools, schemas, idempotency guarantees, and timeout behavior does it expose?
- Does the selected Resolve MCP server support container-to-host communication, or must we build the narrow host adapter described in [`runtime-deployment.md`](runtime-deployment.md)?
- Does the MCP integration support captions, Fairlight operations, render monitoring, project export, and reliable timeline inspection, or will approved companion automation be required?
- Which transcription and analysis services may receive source media, and what privacy, retention, region, cost, and credential constraints apply?
- What media formats, codecs, frame rates, variable-frame-rate behavior, maximum durations, and file sizes are in the initial support matrix?
- What are the concrete values in the first default editing and delivery profile?
- What expiry, scope, and revocation behavior should apply to the workspace rights attestation?

## Editorial Defaults

- What relevance and density thresholds should enable approved B-roll in the polished educational default profile?
- Are music, title cards, lower thirds, chapter cards, color treatment, and branded graphics disabled unless configured?
- What maximum punch-in scale is acceptable for each source-to-output resolution combination?
- Should the default output preserve source aspect ratio, target 16:9, or infer a platform-oriented format?
- Which languages and mixed-language recordings must transcription and captions support initially?
- How should profanity, sensitive details, and verbal factual corrections be handled without an explicit brief?

## Delivery Defaults

- What are the master container, video codec, audio codec, chroma subsampling, bit depth, and bitrate or quality settings?
- What default resolution and frame-rate policy should apply when source properties differ from delivery requirements?
- What integrated loudness and true-peak targets apply to each delivery profile?
- Are portable captions required as SRT only, or should WebVTT and Resolve-native caption tracks also be delivered?
- Are burned-in captions enabled by default, and what typography and safe-area rules apply?
- Is a portable Resolve project export always required, and which format is reliable for the supported Resolve version?

## Autonomy And Review

- What confidence thresholds trigger retention, automatic correction, a warning, or a blocking question?
- Is an automatically rendered low-resolution review pass required before the master render?
- Which quality checks can be fully automated, and which require a vision or listening review by the orchestrating model?
- How many automatic revision attempts are allowed before a job becomes blocked?
- Which representable manual Resolve changes can be adopted automatically, and what exact conflicts must block according to the best-effort adoption decision?

## Media And Licensing

- Which providers are initially allowlisted in addition to user media and Pexels?
- Who supplies and rotates provider credentials, and where are they stored?
- Must license pages be snapshotted, or is a terms URL plus acquisition-time metadata sufficient for each provider?
- What commercial-use, identifiable-person, trademark, sensitive-topic, and attribution restrictions apply when a job opts into distribution beyond the personal/noncommercial default?
- Are generated images, video, voice, music, or sound effects permitted in any profile? If so, which providers and disclosure rules apply?
- How long may downloaded candidates and rejected assets be cached?

## Storage, Privacy, And Operations

- Which local processing capabilities are mandatory before cloud opt-in is offered, and how is cloud opt-in recorded?
- What are the retention and deletion periods for inbox files, job workspaces, caches, logs, Resolve projects, and final results?
- Is encryption at rest required for work and results directories?
- What redaction is required in logs and reports when recordings contain personal or confidential information?
- What disk-space reservation and cleanup behavior should apply before long renders?
- What notification or status interface is needed for long-running jobs beyond the control-panel progress view?
- What upload size, file-count, and progress behavior should the control panel support for drag-and-drop intake?
- Should the control panel start Docker services automatically, or is Docker Desktop startup an explicit prerequisite?
- How should the host-side Resolve MCP process be packaged so the user does not install a separate runtime?

## Evaluation

- What representative test set will cover accents, speech rates, room noise, retakes, long pauses, VFR phone footage, and low-resolution sources?
- Who judges semantic preservation, edit naturalness, B-roll relevance, caption accuracy, and audio quality?
- What objective thresholds define acceptable word error rate, caption timing, loudness, sync, render integrity, and job completion rate?
- What regression artifacts can be stored without retaining sensitive production recordings?
