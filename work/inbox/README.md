# Inbox

Place one raw source recording here, or drop it into the local control panel. The current executable test is started from the repository root with `docker compose run --rm editor edit`.

press **Edit Video**

The workflow copies the source unchanged into `projects/<video-slug>/raw/` and writes the generated project there. Optional instructions may be supplied as a clearly associated sidecar file, but are not required for a standard edit.

Do not place pipeline-generated intermediates or final renders here.
